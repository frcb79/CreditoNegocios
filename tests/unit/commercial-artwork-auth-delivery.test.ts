import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { commercialArtworkEndpoint, fetchPrivateCommercialPng } from "../../client/src/lib/commercialArtworkClient";

const source=(file:string)=>readFileSync(resolve(process.cwd(),file),"utf8");

describe("COM-RES private image delivery regression: proxy-stripped cookies",()=>{
  const originalFetch=global.fetch;
  afterEach(()=>{global.fetch=originalFetch;});

  it("uses a same-origin private route and explicit credentials for protected PNG",async()=>{
    const png=new Blob([Buffer.alloc(100)],{type:"image/png"});
    const fetchMock=jest.fn().mockResolvedValue({
      ok:true,status:200,headers:{get:(name:string)=>name==="content-type"?"image/png":null},
      blob:async()=>png
    });
    global.fetch=fetchMock as typeof fetch;
    const path=commercialArtworkEndpoint("example-private-draft");
    expect(path).toBe("/api/commercial-resources/templates/example-private-draft/art");
    const result=await fetchPrivateCommercialPng(path);
    expect(result).toBe(png);
    expect(fetchMock).toHaveBeenCalledWith(path,expect.objectContaining({
      credentials:"include",cache:"no-store",headers:{Accept:"image/png"}
    }));
  });

  it("does not expose HTML login responses or permit arbitrary origins",async()=>{
    expect(()=>fetchPrivateCommercialPng("https://other.example.com/image.png"))
      .rejects.toThrow("Ruta de imagen comercial no autorizada");
    const fetchMock=jest.fn().mockResolvedValue({
      ok:false,status:401,headers:{get:()=> "text/html"}
    });
    global.fetch=fetchMock as typeof fetch;
    await expect(fetchPrivateCommercialPng(commercialArtworkEndpoint("private")))
      .rejects.toThrow("sesión");
  });

  it("applies the authenticated blob loader to both thumbnails and full-size previews",()=>{
    const card=source("client/src/components/Commercial/CommercialTemplateCard.tsx");
    const renderer=source("client/src/lib/commercialGraphicRenderer.ts");
    const admin=source("client/src/components/Commercial/CommercialResourcesAdmin.tsx");
    const api=source("server/commercialResourcesRoutes.ts");
    expect(card).toContain("fetchPrivateCommercialPng(commercialArtworkEndpoint(template.id)");
    expect(card).toContain("URL.createObjectURL(blob)");
    expect(card).toContain("URL.revokeObjectURL(objectUrl)");
    expect(card).toContain("IntersectionObserver");
    expect(renderer).toContain("loadAuthenticatedImage(commercialArtworkEndpoint(template.id))");
    expect(admin).toContain("setPreviewTemplateId(firstImportedId)");
    expect(api).toContain("t.status='published' OR $2='super_admin'");
    expect(api).toContain('Cache-Control","private, no-store"');
  });
});
