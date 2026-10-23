import { createHash } from "node:crypto";
import { normalizeV4Map, readV4Zip } from "../../server/commercialGraphicImporter";
import { commercialResourceUploadSchema } from "../../shared/commercialResourceDefinition";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const load=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
const checksum=(data:Buffer)=>createHash("sha256").update(data).digest("hex");
function fakePng(w=1080,h=1350) {
 const png=Buffer.alloc(48);
 Buffer.from("89504e470d0a1a0a","hex").copy(png,0);
 png.writeUInt32BE(13,8);png.write("IHDR",12);
 png.writeUInt32BE(w,16);png.writeUInt32BE(h,20);
 return png;
}
function map(png:Buffer) {
 return {
  schemaVersion:"cn-commercial-graphic-v2",status:"FINAL_CREATIVE_READY_FOR_IMPORT",
  slug:"simple-impactante-explicativa-v1",name:"Crédito Simple | Impactante explicativa",
  roles:["broker","master_broker"],campaignId:"simple",
  canvas:{width:1080,height:1350,unit:"px"},
  assets:{backgroundSHA256:checksum(png)},
  approvedCopy:{headline:"Una forma de crecer con opciones de financiamiento.",
   supportingQuestion:"Conoce cómo se puede financiar tu proyecto.",
   description:"Consulta alternativas según tu perfil y la financiera.",
   tags:["Capital de trabajo"],cta:"Explora tus opciones."},
  fields:{
   BROKER_NAME:{x:108,y:80,width:535,height:72,fontSize:32,minFontSize:23,fontWeight:700,fill:"#0F2D3E",maxLines:1,required:true},
   BROKER_WHATSAPP:{x:84,y:1281,width:570,height:31,fontSize:19,minFontSize:16,fontWeight:600,fill:"#FFFFFF",maxLines:1,required:true},
   BROKER_LOGO:{x:762,y:73,width:245,height:95,fit:"contain",required:false},
   CTA:{x:101,y:1214,width:505,height:40,fontSize:25,minFontSize:17,fontWeight:700,fill:"#0C2537",maxLines:1,approvedText:"Explora tus opciones."},
   TRACKING_LINK:{placement:"caption_only",onImage:false,qr:false}
  },
  rules:{noQR:true}
 };
}
describe("COM-RES-GRAPHICS-V4: generic artwork import",()=>{
 it("normalizes a creative map without changing the source image or copy",()=>{
  const png=fakePng();
  const result=normalizeV4Map(Buffer.from(JSON.stringify(map(png))),png,
    "ARTES_Y_MAPAS/01_Impactantes_Explicativas_NUEVAS/");
  expect(result.slug).toBe("simple-impactante-explicativa");
  expect(result.png).toEqual(png);
  expect(result.graphic.sha256).toBe(checksum(png));
  expect(result.graphic.fields.cta.text).toBe("Explora tus opciones.");
  expect(result.graphic.roles).toEqual(["broker","master_broker"]);
  expect(result.graphic.typographyReviewRequired).toBe(false);
  const upload={slug:result.slug,name:result.name,product:result.product,channel:result.channel,
   definition:{layout:"minimal",hero:"none",colors:{background:"#0B2F4B",accent:"#A8E4E8",foreground:"#FFFFFF"},
   headline:result.copy.headline,supportingLine:result.copy.supportingLine,description:result.copy.description,
   hook:result.copy.hook,cta:result.copy.cta,highlights:result.copy.highlights,
   allowedIdentityFields:{displayName:true,whatsapp:true,institutionalLogo:true},graphic:result.graphic}};
  expect(commercialResourceUploadSchema.safeParse(upload).success).toBe(true);
 });
 it("refuses checksum mismatch, QR, missing WhatsApp and geometry outside the canvas",()=>{
  const png=fakePng();const good=map(png);
  expect(()=>normalizeV4Map(Buffer.from(JSON.stringify(good)),fakePng(1080,1920),
   "01_Impactantes_Explicativas_NUEVAS/")).toThrow();
  const qr=structuredClone(good);qr.fields.TRACKING_LINK.qr=true;
  expect(()=>normalizeV4Map(Buffer.from(JSON.stringify(qr)),png,
   "01_Impactantes_Explicativas_NUEVAS/")).toThrow(/QR/);
  const invalid=structuredClone(good);invalid.fields.BROKER_WHATSAPP.required=false;
  expect(()=>normalizeV4Map(Buffer.from(JSON.stringify(invalid)),png,
   "01_Impactantes_Explicativas_NUEVAS/")).toThrow();
  const overflow=structuredClone(good);overflow.fields.BROKER_NAME.x=1000;
  expect(()=>normalizeV4Map(Buffer.from(JSON.stringify(overflow)),png,
   "01_Impactantes_Explicativas_NUEVAS/")).toThrow();
 });
 it("rejects invalid or empty ZIP archives",()=>{
  expect(()=>readV4Zip(Buffer.from("not zip"))).toThrow();
 });
 it("imports only through authenticated Super Admin and keeps draft artwork private",()=>{
  const api=load("server/commercialResourcesRoutes.ts");
  const migration=load("migrations/0012_commercial_graphic_artworks.sql");
  expect(api).toContain('"/api/admin/commercial-resources/graphic-import"');
  expect(api).toContain('user?.role!=="super_admin"');
  expect(api).toContain('t.status=\'published\' OR $2=\'super_admin\'');
  expect(api).toContain('status,created_by)');
  expect(api).toContain("VALUES ($1,$2,$3,$4,$5,$6::jsonb,'draft',$7)");
  expect(api).toContain("editorialLegalApproved");
  expect(migration).toContain("public.commercial_resource_artworks");
  expect(api).toContain("typographyReviewRequired");
  expect(api).toContain("commercial_approved_logos");
  expect(api).toContain("user?.role!==\"super_admin\"");
  expect(api).not.toContain("PUBLICAR REFERENCIAS FOTOGRAFICAS");
 });
 it("renders only original graphic and approved owner identity; no QR or generic advisor overlay",()=>{
  const renderer=load("client/src/lib/commercialGraphicRenderer.ts");
  const page=load("client/src/pages/CommercialResources.tsx");
  const admin=load("client/src/components/Commercial/CommercialResourcesAdmin.tsx");
  expect(renderer).toContain('ctx.drawImage(background,0,0)');
  expect(renderer).toContain('if(identity.approvedLogoUrl)');
  expect(renderer).toContain('if(!phone)throw new Error');
  expect(renderer).not.toContain("Asesor Financiero");
  expect(page).toContain("/api/commercial-resources/my-approved-identity");
  expect(page).toContain('renderCommercialGraphic(selection');
  expect(admin).toContain('data-testid="resource-graphic-zip"');
  expect(admin).toContain('data-testid="resource-graphic-import-report"');
 });
});
