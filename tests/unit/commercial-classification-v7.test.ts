import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeV4Map } from "../../server/commercialGraphicImporter";
import { filterCommercialTemplates } from "../../client/src/lib/commercialLibrary";
import type { PublishedCommercialTemplate } from "../../client/src/lib/commercialResources";

function png(height=1350){
 const b=Buffer.alloc(48);
 Buffer.from("89504e470d0a1a0a","hex").copy(b);
 b.writeUInt32BE(13,8);b.write("IHDR",12);
 b.writeUInt32BE(1080,16);b.writeUInt32BE(height,20);return b;
}
function artifact(b:Buffer,campaignId="simple_tpv",classification?:Record<string,unknown>,catalog?:Record<string,unknown>){
 const json:any={
   schemaVersion:"cn-commercial-graphic-v2",status:"FINAL_CREATIVE_READY_FOR_IMPORT",
   slug:"tpv-liquidez-01-v1",name:"Convierte tus ventas en liquidez",
   roles:["broker","master_broker"],campaignId,
   canvas:{width:1080,height:b.readUInt32BE(20),unit:"px"},
   assets:{backgroundSHA256:createHash("sha256").update(b).digest("hex")},
   approvedCopy:{
    headline:"Convierte las ventas en liquidez",supportingQuestion:"Conoce tus opciones para crecer.",
    description:"Liquidez basada en tus ventas con tarjeta.",cta:"Consulta alternativas.",
    tags:["Ventas con tarjeta"]
   },
   fields:{
     BROKER_NAME:{x:108,y:80,width:530,height:72,fontSize:32,minFontSize:23,fontWeight:700,fill:"#0F2D3E",maxLines:1,required:true},
     BROKER_WHATSAPP:{x:84,y:b.readUInt32BE(20)-69,width:570,height:31,fontSize:19,minFontSize:16,fontWeight:600,fill:"#FFFFFF",maxLines:1,required:true},
     BROKER_LOGO:{x:762,y:73,width:245,height:95,fit:"contain",required:false},
     CTA:{x:101,y:b.readUInt32BE(20)-136,width:505,height:40,fontSize:25,minFontSize:17,fontWeight:700,fill:"#0C2537",maxLines:1,approvedText:"Consulta alternativas."},
     TRACKING_LINK:{placement:"caption_only",onImage:false,qr:false}
   },rules:{noQR:true}
 };
 if(classification!==undefined)json.classification=classification;
 if(catalog!==undefined)json.catalog=catalog;
 return json;
}
const meta={name:"Convierte tus ventas en liquidez",product:"Anticipo de ventas TPV",
 productId:"tpv_anticipo",slug:"tpv-liquidez-01-v1",format:"4:5",
 style:"explicativo",theme:"Liquidez basada en ventas con tarjeta"};
const group="ARTES_Y_MAPAS/01_Impactantes_Explicativas_NUEVAS/";
const parse=(obj:any,b:Buffer)=>normalizeV4Map(Buffer.from(JSON.stringify(obj)),b,group);
const src=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("COM-RES-V7 classification: existing map untouched, editorial metadata imported",()=>{
 it("reads V7 classification and preserves original campaignId, approved copy and PNG hash",()=>{
   const b=png();
   const m=artifact(b,"simple_tpv",meta);
   const result=parse(m,b);
   expect(result.product).toBe("tpv_anticipo");
   expect(result.catalog).toEqual({product:"tpv_anticipo",format:"4:5",
      style:"explicativo",topic:"Liquidez basada en ventas con tarjeta"});
   expect(result.graphic.sha256).toBe(m.assets.backgroundSHA256);
   expect(result.png).toEqual(b);
   expect(result.copy.description).toBe(m.approvedCopy.description);
   expect(m.campaignId).toBe("simple_tpv");
 });
 it("supports optional leasing subtype, while preserving legacy V6 and V2 catalog",()=>{
   const b=png();
   const leasing={...meta,product:"Arrendamiento",productId:"arrendamiento",
      leasingSubtype:"maquinaria_equipo",theme:"Maquinaria para operación"};
   expect(parse(artifact(b,"arrenda_maquinaria",leasing),b).catalog)
     .toEqual({product:"arrendamiento",format:"4:5",style:"explicativo",
       topic:"Maquinaria para operación",leasingSubtype:"maquinaria_equipo"});
   expect(parse(artifact(b,"simple_tpv"),b).product).toBe("simple");
   const legacy={product:"simple",format:"4:5",style:"llamativo",topic:"Capital de trabajo"};
   expect(parse(artifact(b,"simple_tpv",undefined,legacy),b).catalog).toEqual(legacy);
 });
 it("rejects broken format, product, style, missing fields and incompatible subtypes",()=>{
   const b=png();
   const samples=[
     {...meta,format:"9:16"},{...meta,productId:"producto_inventado"},
     {...meta,style:"otro"},{...meta,theme:""},{...meta,slug:""},
     {...meta,leasingSubtype:"vehicular"},{...meta,secret:"invalid"},
     {...meta,theme:"<script>"}
   ];
   for(const invalid of samples)expect(()=>parse(artifact(b,"simple_tpv",invalid),b)).toThrow();
   const validCatalog={product:"simple",format:"4:5",style:"llamativo",topic:"Capital de trabajo"};
   expect(()=>parse(artifact(b,"simple_tpv",meta,validCatalog),b))
     .toThrow(/contradictorias/);
 });
 it("allows 1:1 and 9:16 if canvas dimensions agree",()=>{
   for(const [height,format] of [[1080,"1:1"],[1920,"9:16"]] as const){
     const b=png(height);
     expect(parse(artifact(b,"tpv_anticipo",{...meta,format}),b).catalog?.format).toBe(format);
   }
 });
 it("filters subtype while maintaining product, style, topic filters for every role",()=>{
   const graphic:any={canvas:{width:1080,height:1350},sha256:"a".repeat(64)};
   const sample:any={id:"one",name:"Maquinaria",slug:"arrenda-uno",product:"arrendamiento",
     channel:"instagram",style:"explicativo",topic:"Financia maquinaria",
     leasing_subtype:"maquinaria_equipo",definition:{graphic,headline:"Maquinaria"}};
   const filters:any={search:"",product:"arrendamiento",format:"all",style:"all",status:"all",leasingSubtype:"maquinaria_equipo"};
   expect(filterCommercialTemplates([sample as PublishedCommercialTemplate],filters)).toHaveLength(1);
   expect(filterCommercialTemplates([sample],{...filters,leasingSubtype:"vehicular"})).toHaveLength(0);
   expect(src("client/src/components/Commercial/CommercialLibraryToolbar.tsx"))
     .toContain("commercial-library-leasing-subtype");
   expect(src("server/commercialResourcesRoutes.ts"))
     .toContain("c.leasing_subtype");
 });
 it("keeps V7 metadata separate from approved artwork and persists on import",()=>{
   const routes=src("server/commercialResourcesRoutes.ts");
   expect(routes).toContain("item.catalog.leasingSubtype||null");
   expect(routes).toContain("UPDATE public.commercial_resource_templates SET product=$2 WHERE id=$1 AND status='draft'");
   expect(routes).toContain('if(draft.rows[0]?.status==="draft")');
   expect(routes).toContain("leasing_subtype=EXCLUDED.leasing_subtype");
   expect(routes).not.toContain("UPDATE public.commercial_resource_templates SET definition");
   expect(src("migrations/0017_commercial_resources_v7_leasing_subtype.sql"))
     .toContain("ADD COLUMN IF NOT EXISTS leasing_subtype");
 });
});
