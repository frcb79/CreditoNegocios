import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PublishedCommercialTemplate } from "../../client/src/lib/commercialResources";
import {
  COMMERCIAL_STYLES, commercialFormat, commercialProductName,
  filterCommercialTemplates, commercialThumbSrc
} from "../../client/src/lib/commercialLibrary";
import { COM_RES_EXAMPLE } from "../../shared/commercialResourceDefinition";

const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
const base={
  ...COM_RES_EXAMPLE,
  version:1,
  status:"published" as const
};
const templates:PublishedCommercialTemplate[]=[
  {...base,id:"simple-vertical",slug:"simple-vertical",name:"Soluciones para negocios",
    style:"llamativo",product:"simple",channel:"instagram"},
  {...base,id:"factoraje-story",slug:"factoraje-story",name:"Liquidez con facturas",
    style:"explicativo",product:"factoraje",channel:"whatsapp"},
  {...base,id:"arrendamiento-square",slug:"arrendamiento-square",name:"Maquinaria nueva",
    style:null,product:"arrendamiento",channel:"facebook"},
];
const all={search:"",product:"all",format:"all",style:"all",status:"all"};

describe("COM-RES-LIBRARY-FILTERS: product, style, format and thumbnail discovery",()=>{
  it("derives formats from approved dimensions and includes products without hardcoded duplicates",()=>{
    expect(templates.map(commercialFormat)).toEqual(["4:5","9:16","1:1"]);
    expect(commercialProductName("revolvente")).toBe("Crédito Revolvente");
    expect(COMMERCIAL_STYLES.map(s=>s.value)).toEqual([
      "llamativo","explicativo","institucional","promocional","informativo"
    ]);
  });
  it("combines product, format, style, status and accent-insensitive search",()=>{
    expect(filterCommercialTemplates(templates,{...all,product:"factoraje",format:"9:16",style:"explicativo"})
      .map(t=>t.id)).toEqual(["factoraje-story"]);
    expect(filterCommercialTemplates(templates,{...all,search:"LIQUIDEZ"})).toHaveLength(1);
    expect(filterCommercialTemplates(templates,{...all,search:"ARRÉNDAMIENTO"})).toHaveLength(0);
    expect(filterCommercialTemplates(templates,{...all,format:"1:1",style:"unclassified"})
      .map(t=>t.id)).toEqual(["arrendamiento-square"]);
    expect(filterCommercialTemplates(templates,{...all,style:"promocional"})).toHaveLength(0);
  });
  it("uses authenticated art route only for binary thumbnails",()=>{
    const t={...templates[0],definition:{...templates[0].definition,
      graphic:{
        mode:"png-overlay" as const,
        canvas:{width:1080 as const,height:1350 as const},
        sha256:"a".repeat(64),originalMapSchema:"cn-graphic-overlay/v1" as const,
        roles:["broker","master_broker"] as ["broker","master_broker"],
        typographyReviewRequired:false,
        fields:{} as any
      }
    }};
    expect(commercialThumbSrc(t)).toBe("/api/commercial-resources/templates/simple-vertical/art");
    expect(commercialThumbSrc(templates[0])).toBe("");
  });
  it("keeps publishing permission and copy immutable, while editing metadata separately",()=>{
    const api=read("server/commercialResourcesRoutes.ts");
    expect(api).toContain('app.post("/api/admin/commercial-resources/templates/:id/style",isAuthenticated');
    expect(api).toContain('if(user?.role!=="super_admin")return forbid(res)');
    expect(api).toContain('INSERT INTO public.commercial_resource_styles');
    expect(api).toContain('LEFT JOIN public.commercial_resource_styles');
    expect(api).not.toContain("UPDATE public.commercial_resource_templates SET definition");
    const sql=read("migrations/0015_commercial_resource_styles.sql");
    expect(sql).toContain("ON DELETE RESTRICT");
  });
  it("renders independent searchable galleries for broker and admin with status filtering",()=>{
    const page=read("client/src/pages/CommercialResources.tsx");
    const admin=read("client/src/components/Commercial/CommercialResourcesAdmin.tsx");
    const toolbar=read("client/src/components/Commercial/CommercialLibraryToolbar.tsx");
    const thumb=read("client/src/components/Commercial/CommercialTemplateCard.tsx");
    expect(page).toContain('data-testid="resources-published-list"');
    expect(page).toContain("<CommercialLibraryToolbar");
    expect(page).toContain("<CommercialTemplateCard");
    expect(admin).toContain("includeStatus");
    expect(admin).toContain('data-testid="resource-admin-style-picker"');
    expect(admin).toContain('data-testid="resource-admin-preview-panel"');
    expect(toolbar).toContain("Filtrar por producto");
    expect(toolbar).toContain('data-testid="commercial-library-result-count"');
    expect(thumb).toContain('loading="lazy"');
  });
});
