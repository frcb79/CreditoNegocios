import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeV4Map } from "../../server/commercialGraphicImporter";
import { COMMERCIAL_PRODUCTS } from "../../client/src/lib/commercialLibrary";

function fakePng(height=1350){
  const b=Buffer.alloc(48);
  Buffer.from("89504e470d0a1a0a","hex").copy(b,0);
  b.writeUInt32BE(13,8);b.write("IHDR",12);
  b.writeUInt32BE(1080,16);b.writeUInt32BE(height,20);
  return b;
}
function sampleMap(png:Buffer,campaignId="tpv_anticipo",catalog?:any){
  return {
    schemaVersion:"cn-commercial-graphic-v2",status:"FINAL_CREATIVE_READY_FOR_IMPORT",
    slug:"tpv-anticipo-liquidez-01-v1",name:"Convierte tus ventas en liquidez",
    roles:["broker","master_broker"],campaignId,
    canvas:{width:1080,height:1350,unit:"px"},
    assets:{backgroundSHA256:createHash("sha256").update(png).digest("hex")},
    ...(catalog===undefined?{}:{catalog}),
    approvedCopy:{
      headline:"Tu negocio puede acceder a más liquidez",
      supportingQuestion:"Conoce opciones para tus ventas.",
      description:"Liquidez basada en ventas con tarjeta.",
      tags:["Opciones de financiamiento"],cta:"Consulta alternativas."
    },
    fields:{
      BROKER_NAME:{x:108,y:80,width:535,height:72,fontSize:32,minFontSize:23,fontWeight:700,fill:"#0F2D3E",maxLines:1,required:true},
      BROKER_WHATSAPP:{x:84,y:1281,width:570,height:31,fontSize:19,minFontSize:16,fontWeight:600,fill:"#FFFFFF",maxLines:1,required:true},
      BROKER_LOGO:{x:762,y:73,width:245,height:95,fit:"contain",required:false},
      CTA:{x:101,y:1214,width:505,height:40,fontSize:25,minFontSize:17,fontWeight:700,fill:"#0C2537",maxLines:1,approvedText:"Consulta alternativas."},
      TRACKING_LINK:{placement:"caption_only",onImage:false,qr:false}
    },rules:{noQR:true}
  };
}
const group="ARTES_Y_MAPAS/01_Impactantes_Explicativas_NUEVAS/";
const parse=(obj:any,png:Buffer)=>normalizeV4Map(Buffer.from(JSON.stringify(obj)),png,group);
const text=(file:string)=>readFileSync(resolve(process.cwd(),file),"utf8");

describe("Comercial catalog V2 metadata and safe draft deletion",()=>{
  it("shows all seven products even without uploaded designs",()=>{
    expect(Object.keys(COMMERCIAL_PRODUCTS)).toEqual([
      "simple","revolvente","factoraje","arrendamiento","hipotecario","tpv_anticipo","institucional"
    ]);
    const ui=text("client/src/components/Commercial/CommercialLibraryToolbar.tsx");
    expect(ui).toContain("Object.keys(COMMERCIAL_PRODUCTS)");
    expect(ui).toContain("productCounts");
  });
  it("accepts exact catalog metadata without changing PNG or approved copy",()=>{
    const png=fakePng();
    const catalog={product:"tpv_anticipo",format:"4:5",style:"explicativo",
      topic:"Liquidez basada en ventas con tarjeta"};
    const output=parse(sampleMap(png,"tpv_anticipo",catalog),png);
    expect(output.catalog).toEqual(catalog);
    expect(output.product).toBe("tpv_anticipo");
    expect(output.png).toEqual(png);
    expect(output.copy.description).toBe("Liquidez basada en ventas con tarjeta.");
  });
  it("preserves legacy import codes and rejects unknown or contradictory products",()=>{
    const png=fakePng();
    for(const [id,product] of [
      ["simple_tpv","simple"],["simple_garantia","simple"],
      ["revolvente","revolvente"],["arrenda_maquinaria","arrendamiento"],
      ["institucional_broker","institucional"],["tpv_anticipo","tpv_anticipo"]
    ]){
      expect(parse(sampleMap(png,id),png).product).toBe(product);
    }
    expect(()=>parse(sampleMap(png,"inventado"),png)).toThrow(/Producto no reconocido/);
    const wrong={product:"simple",format:"4:5",style:"explicativo",topic:"Liquidez para negocios"};
    expect(()=>parse(sampleMap(png,"tpv_anticipo",wrong),png)).toThrow(/contradice/);
  });
  it("rejects mismatched format, invalid style, product and unexpected catalog keys",()=>{
    const png=fakePng();
    const valid={product:"tpv_anticipo",format:"4:5",style:"explicativo",topic:"Ventas con tarjeta"};
    for(const altered of [
      {...valid,format:"9:16"},{...valid,style:"raro"},
      {...valid,product:"banco"},{...valid,topic:"<script>"},
      {...valid,unverified:"campo"}
    ]) expect(()=>parse(sampleMap(png,"tpv_anticipo",altered),png)).toThrow();
  });
  it("deletion is Super Admin-only, transactional, draft-only and protected from campaign references",()=>{
    const api=text("server/commercialResourcesRoutes.ts");
    expect(api).toContain('"/api/admin/commercial-resources/drafts/delete"');
    expect(api).toContain('user?.role!=="super_admin"');
    expect(api).toContain('row.status!=="draft"');
    expect(api).toContain("public.commercial_campaign_links WHERE template_id");
    expect(api).toContain("public.commercial_marketing_leads WHERE template_id");
    expect(api).toContain("DELETE FROM public.commercial_resource_artworks");
    expect(api).toContain("ROLLBACK");
    expect(api).toContain("deleted.rowCount!==ids.length");
    const ui=text("client/src/components/Commercial/CommercialResourcesAdmin.tsx");
    expect(ui).toContain('data-testid="select-filtered-drafts"');
    expect(ui).toContain('data-testid="delete-selected-drafts"');
    expect(ui).toContain("Seleccionar lote de esta plantilla");
    expect(ui).toContain('window.prompt("Para confirmar');
  });
  it("migrations are additive and imported metadata stays outside the approved artwork",()=>{
    const sql=text("migrations/0016_commercial_resource_catalog_metadata.sql");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS import_batch_id");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.commercial_resource_topics");
    const api=text("server/commercialResourcesRoutes.ts");
    expect(api).toContain("item.catalog.topic");
    expect(api).toContain("item.catalog.style");
    expect(api).toContain("batchId=randomUUID()");
    expect(api).not.toContain("UPDATE public.commercial_resource_templates SET definition");
  });
});

describe("Broker catalog after offer publication",()=>{
  it("reads authorized financial institutions through a projected commercial route",()=>{
    const route=text("server/routes.ts").split("app.get('/api/financial-institutions/:id'")[1].split("app.post('/api/financial-institutions'")[0];
    expect(route).toContain("storage.getFinancialInstitutions(userId)");
    expect(route).toContain("projectFinancialInstitutionByRole(institution, user.role)");
    expect(route).not.toContain("user.role !== 'super_admin' && user.role !== 'admin'");
  });
  it("uses published offer terms, canonical types and URL navigation for brokers",()=>{
    const server=text("server/routes.ts");
    expect(server).toContain("commercialTerms:");
    expect(server).toContain("rateSource: c.rateSource");
    const client=text("client/src/components/ProductSystem/BrokerProducts.tsx");
    expect(client).toContain("readDisplayTerms(selectedProduct)");
    expect(client).toContain('case "hipotecario":');
    expect(client).toContain("map.capital_trabajo.push(p)");
    expect(client).toContain("useSearch()");
  });
});
