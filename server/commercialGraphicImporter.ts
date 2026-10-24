import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

/**
 * Strict ZIP-to-drafts adapter for the 65-artwork Creative V4 package.
 * This is not a public ZIP extraction service. Every item must be an exact
 * PNG + JSON pair. Photo-reference folders never enter the import set.
 */
export type GraphicBox = { x:number; y:number; width:number; height:number };
export type GraphicText = GraphicBox & { size:number; minSize:number; weight:600|700; color:string };
export type GraphicDefinition = {
  mode:"png-overlay";
  canvas:{width:number;height:number};
  sha256:string;
  originalMapSchema:string;
  roles:["broker","master_broker"];
  typographyReviewRequired:boolean;
  fields:{ name:GraphicText; whatsapp:GraphicText; cta:GraphicText & {text:string}; logo:GraphicBox };
};
export type GraphicImport = {
  slug:string;name:string;product:string;channel:"instagram"|"facebook"|"whatsapp";
  copy:{headline:string;supportingLine:string;description:string;hook:string;cta:string;highlights:string[]};
  graphic:GraphicDefinition;png:Buffer;
};

const allowedGroups = [
  "ARTES_Y_MAPAS/01_Impactantes_Explicativas_NUEVAS/",
  "ARTES_Y_MAPAS/03_Impactantes_y_Sobrias_Anteriores/26_Variantes_Anteriores/",
  "ARTES_Y_MAPAS/04_Formato_Cuadrado_1x1/",
  "ARTES_Y_MAPAS/05_Formato_Vertical_9x16/"
];
function validPath(s:string) {
  return !s.startsWith("/") && !s.includes("\\") && !s.includes("..") &&
    /^[\w\d\-\u00C0-\u017F/ .]+$/.test(s);
}
function sha256(b:Buffer) { return createHash("sha256").update(b).digest("hex"); }
function fail(message:string):never { throw new Error(message); }
export function readV4Zip(buf:Buffer):Map<string,Buffer> {
  if (buf.length>50 * 1024 * 1024 || buf.length<22) fail("El ZIP supera 50 MB o está vacío.");
  const entries=new Map<string,Buffer>();
  let end=-1;
  for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--) {
    if(buf.readUInt32LE(i)===0x06054b50){end=i;break;}
  }
  if(end<0) fail("Directorio ZIP inválido.");
  const count=buf.readUInt16LE(end+10), size=buf.readUInt32LE(end+12), offset=buf.readUInt32LE(end+16);
  if(count>250 || offset+size>buf.length || count===0) fail("Cantidad o directorio ZIP inválidos.");
  let pos=offset, total=0;
  for(let i=0;i<count;i++){
    if(pos+46>buf.length||buf.readUInt32LE(pos)!==0x02014b50)fail("Entrada ZIP inválida.");
    const flags=buf.readUInt16LE(pos+8),method=buf.readUInt16LE(pos+10);
    const compressed=buf.readUInt32LE(pos+20),uncompressed=buf.readUInt32LE(pos+24);
    const namelen=buf.readUInt16LE(pos+28),extra=buf.readUInt16LE(pos+30),comment=buf.readUInt16LE(pos+32);
    const local=buf.readUInt32LE(pos+42);
    if(flags&1 || (method!==0&&method!==8) || compressed>5_000_000 || uncompressed>5_000_000)
      fail("El ZIP usa cifrado, compresión o tamaños no permitidos.");
    if(pos+46+namelen+extra+comment>buf.length)fail("Directorio ZIP truncado.");
    const path=buf.subarray(pos+46,pos+46+namelen).toString("utf8");
    pos+=46+namelen+extra+comment;
    if(!validPath(path))fail("Ruta de archivo no autorizada.");
    if(path.endsWith("/")) continue;
    // Reject unapproved references and other files, do not import them.
    if(!allowedGroups.some(prefix=>path.startsWith(prefix)))continue;
    if(!(/\/(mapa_campos\.json|fondo_maestro(?:_1080x1350)?\.png)$/.test(path)))continue;
    if(entries.has(path))fail("Archivo duplicado en ZIP.");
    if(local+30>buf.length||buf.readUInt32LE(local)!==0x04034b50)fail("Encabezado ZIP inválido.");
    const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28);
    if(start+compressed>buf.length)fail("Archivo ZIP truncado.");
    let data:Buffer;
    try { data=method===0?Buffer.from(buf.subarray(start,start+compressed)):
      inflateRawSync(buf.subarray(start,start+compressed),{maxOutputLength:5_000_001}); }
    catch {fail("No se pudo descomprimir un archivo del ZIP.");}
    if(data.length!==uncompressed)fail("Tamaño descomprimido inconsistente.");
    total+=data.length;
    if(total>200_000_000)fail("ZIP descomprimido excede el máximo seguro de 200 MB.");
    entries.set(path,data);
  }
  return entries;
}
const int=(v:any,min:number,max:number)=>typeof v==="number"&&Number.isInteger(v)&&v>=min&&v<=max;
const box=(source:any,canvas:{width:number;height:number}):GraphicBox=>{
 const b=source?.rectangle||source;
 if(!b || !int(b.x,0,canvas.width) || !int(b.y,0,canvas.height) ||
    !int(b.width,1,canvas.width) || !int(b.height,1,canvas.height) ||
    b.x+b.width>canvas.width || b.y+b.height>canvas.height) fail("Coordenadas fuera del lienzo.");
 return {x:b.x,y:b.y,width:b.width,height:b.height};
};
const caption=(v:any,max=200)=>typeof v==="string"?v.trim().slice(0,max):"";
function productId(campaign:string) {
 if(campaign==="revolvente")return "revolvente";
 if(campaign==="factoraje")return "factoraje";
 if(campaign==="hipotecario")return "hipotecario";
 if(campaign.startsWith("arrenda_"))return "arrendamiento";
 if(campaign.startsWith("institucional_"))return "institucional";
 if(campaign==="tpv_anticipo")return "tpv_anticipo";
 return "simple";
}
function parseText(src:any,canvas:{width:number;height:number},fallback:{size:number;min:number;weight:600|700;color:string}):GraphicText {
 const rect=box(src,canvas);
 const size=src?.fontSize??src?.sizePx??fallback.size;
 const minSize=src?.minFontSize??src?.minPx??fallback.min;
 const color=src?.fill??src?.color??fallback.color;
 const weight=src?.fontWeight??(/SemiBold/i.test(src?.font||"")?600:fallback.weight);
 if(!int(size,12,70)||!int(minSize,12,size)||![600,700].includes(weight)||
    !/^#[0-9a-fA-F]{6}$/.test(color)||src?.maxLines!==1)fail("Formato tipográfico del mapa inválido.");
 return {...rect,size,minSize,weight,color};
}
export function normalizeV4Map(raw:Buffer,png:Buffer,group:string):GraphicImport {
 if(raw.length>32_000)fail("JSON de diseño excede 32 KB.");
 let m:any;
 try {m=JSON.parse(raw.toString("utf8").replace(/^\uFEFF/,""));}catch {fail("JSON de mapa inválido.");}
 if(!allowedGroups.some(prefix=>group.startsWith(prefix)))fail("Grupo no permitido.");
 if(!["cn-commercial-graphic-v2","cn-graphic-overlay/v1"].includes(m.schemaVersion))fail("Contrato gráfico no reconocido.");
 if(m.status!=="FINAL_CREATIVE_READY_FOR_IMPORT")
   fail("Solo se permiten materiales marcados para revisión.");
 if(!Array.isArray(m.roles)||m.roles.length!==2||!m.roles.includes("broker")||!m.roles.includes("master_broker"))
   fail("Plantilla no habilitada para ambos roles.");
 const canvas={width:m.canvas?.width,height:m.canvas?.height};
 if(canvas.width!==1080||![1080,1350,1920].includes(canvas.height))fail("Dimensiones de lienzo no aceptadas.");
 if(png.length>3_000_000||png.length<40||png.subarray(0,8).toString("hex")!=="89504e470d0a1a0a"||
    png.toString("ascii",12,16)!=="IHDR"||
    png.readUInt32BE(16)!==canvas.width||png.readUInt32BE(20)!==canvas.height)fail("PNG maestro o tamaño inválido.");
 const hash=sha256(png);
 // The final photographic ZIP refreshes assets.backgroundSHA256. Old V1
 // maps retain backgroundSha256 from their earlier concept version.
 // Validate against the current asset manifest, never the stale alias.
 const wanted=m.assets?.backgroundSHA256??m.assets?.backgroundSha256??m.backgroundSha256;
 if(typeof wanted!=="string"||hash!==wanted.toLowerCase())fail("SHA-256 del PNG no coincide con el mapa.");
 const v1=m.schemaVersion==="cn-graphic-overlay/v1";
 const f=v1?m.dynamicFields:m.fields;
 const c=v1?m.fixed:m.approvedCopy;
 const track=f?.TRACKING_LINK;
 if(!track||track.placement!=="caption_only"||track.onImage!==false||track.qr===true||
    (m.rules?.qr!==undefined&&m.rules.qr!==false)||
    (m.rules?.noQR!==undefined&&m.rules.noQR!==true))fail("Se rechazó mapa con QR o link sobre la imagen.");
 if(!f?.BROKER_NAME?.required || !f?.BROKER_WHATSAPP?.required || f?.BROKER_LOGO?.required!==false)
   fail("Campos de identidad inseguros.");
 const category=caption(m.campaignId||m.campaignCategory||m.id,90).replace(/-(?:impactante|sobrio|cuadrada|historia)(?:-v\d+)?$/,"");
 if(!/^[a-z_]+$/.test(category))fail("Categoría comercial inválida.");
 const tail=group.includes("/04_Formato_Cuadrado_1x1/")?"-cuadrada":group.includes("/05_Formato_Vertical_9x16/")?"-historia":"";
 const candidate=caption(m.slug||m.id,90).replace(/-v\d+$/,"").replace(/_/g,"-")+tail;
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate)||candidate.length>80)fail("Slug inválido.");
 const base= {size:32,min:19,weight:700 as const,color:"#0F2D3E"};
 const name=parseText(f.BROKER_NAME,canvas,base);
 const phone=parseText(f.BROKER_WHATSAPP,canvas,{size:canvas.height===1920?22:22,min:16,weight:600,color:"#FFFFFF"});
 const cta=parseText(f.CTA,canvas,{size:26,min:17,weight:700,color:"#0C2537"});
 const logo=box(f.BROKER_LOGO,canvas);
 const ctaText=caption(f.CTA?.approvedText||f.CTA?.defaultApprovedText||c?.cta,100);
 if(ctaText.length<3||ctaText.length>95)fail("CTA autorizado faltante.");
 const headline=caption(c?.headline||c?.A,85),desc=caption(c?.description||c?.sub||c?.subheadline,180);
 const supporting=caption(c?.supportingQuestion||c?.B||c?.subheadline||desc,110);
 const highlights=Array.isArray(c?.tags)?c.tags.map((x:any)=>caption(x,85)).filter(Boolean).slice(0,3):[];
 if(headline.length<5||desc.length<8)fail("Contenido aprobado ausente.");
 // Final 65-map package includes complete typography for all formats.
 const typographyReviewRequired=[f.BROKER_NAME,f.BROKER_WHATSAPP,f.CTA].some((x:any)=>
   (!Number.isInteger(x.fontSize)&&!Number.isInteger(x.sizePx)) ||
   (!Number.isInteger(x.minFontSize)&&!Number.isInteger(x.minPx)));
 return {
  slug:candidate,
  name:caption(m.name||category,95)+(tail?" · "+(tail==="-historia"?"Historia":"Cuadrada"):""),
  product:productId(category),
  channel:canvas.height===1080?"facebook":canvas.height===1920?"whatsapp":"instagram",
  copy:{headline,supportingLine:supporting.length>=8?supporting:desc,description:desc,
    hook:caption(c?.B||c?.supportingQuestion||headline,140),cta:ctaText,highlights},
  graphic:{mode:"png-overlay",canvas,sha256:hash,originalMapSchema:m.schemaVersion,
    roles:["broker","master_broker"],typographyReviewRequired,
    fields:{name,whatsapp:phone,cta:{...cta,text:ctaText},logo}},
  png
 };
}
export function parseV4Archive(zip:Buffer):GraphicImport[] {
 const entries=readV4Zip(zip);
 const maps=Array.from(entries.keys()).filter(x=>x.endsWith("/mapa_campos.json")).sort();
 if(!maps.length||maps.length>65)fail("Se esperaban entre 1 y 65 mapas.");
 const result:GraphicImport[]=[];
 const seen=new Set<string>();
 for(const path of maps) {
  const prefix=path.slice(0,path.lastIndexOf("/")+1);
  const png=entries.get(prefix+"fondo_maestro_1080x1350.png")||entries.get(prefix+"fondo_maestro.png");
  if(!png)fail("Falta arte maestro para "+path);
  const item=normalizeV4Map(entries.get(path)!,png,prefix);
  if(seen.has(item.slug))fail("Campaña duplicada: "+item.slug);
  seen.add(item.slug);result.push(item);
 }
 if(result.length!==entries.size/2)fail("Faltan mapas o PNG correspondientes.");
 if(result.length===65 && result.some(r=>r.graphic.typographyReviewRequired))fail("El lote final aún contiene tipografías incompletas.");
 return result;
}
