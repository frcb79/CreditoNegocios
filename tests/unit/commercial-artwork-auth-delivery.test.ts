import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { commercialArtworkEndpoint, fetchPrivateCommercialPng } from "../../client/src/lib/commercialArtworkClient";

const source=(file:string)=>readFileSync(resolve(process.cwd(),file),"utf8");
const uuid="bd260772-3da3-4df9-8aac-e39ad31f3ec0";
const png=Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),Buffer.alloc(96)]);

describe("COM-RES private image transport: avoid proxy image GET cookie loss",()=>{
  const originalFetch=global.fetch;
  afterEach(()=>{global.fetch=originalFetch;});

  it("uses authenticated same-origin JSON POST instead of binary/image GET",async()=>{
    const fetchMock=jest.fn().mockResolvedValue({
      ok:true,status:200,json:async()=>({
        mimeType:"image/png",pngBase64:png.toString("base64")
      })
    });
    global.fetch=fetchMock as typeof fetch;
    const input=commercialArtworkEndpoint(uuid);
    const blob=await fetchPrivateCommercialPng(input);
    expect(blob.type).toBe("image/png");
    expect(Buffer.from(await blob.arrayBuffer())).toEqual(png);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/commercial-resources/private-artwork-data",
      expect.objectContaining({
        method:"POST",credentials:"include",cache:"no-store",
        headers:{"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({templateId:uuid})
      })
    );
  });

  it("requires explicit owner authorization to load a commercial logo",async()=>{
    const fetchMock=jest.fn().mockResolvedValue({
      ok:true,status:200,json:async()=>({
        mimeType:"image/png",pngBase64:png.toString("base64")
      })
    });
    global.fetch=fetchMock as typeof fetch;
    await fetchPrivateCommercialPng("/api/commercial-resources/my-approved-logo");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/commercial-resources/private-artwork-data",
      expect.objectContaining({body:JSON.stringify({myLogo:true})})
    );
  });

  it("rejects arbitrary paths, unauthenticated sessions and invalid files",async()=>{
    await expect(fetchPrivateCommercialPng("https://other.example.com/image.png"))
      .rejects.toThrow("Ruta de imagen comercial no autorizada");
    const fetchMock=jest.fn().mockResolvedValue({ok:false,status:401});
    global.fetch=fetchMock as typeof fetch;
    await expect(fetchPrivateCommercialPng(commercialArtworkEndpoint(uuid)))
      .rejects.toThrow("sesión");
    fetchMock.mockResolvedValue({ok:true,status:200,
      json:async()=>({mimeType:"image/png",pngBase64:Buffer.alloc(100).toString("base64")})});
    await expect(fetchPrivateCommercialPng(commercialArtworkEndpoint(uuid)))
      .rejects.toThrow("no es PNG");
  });

  it("preserves strict RBAC, no-store, and image-only blob handling in both UIs",()=>{
    const api=source("server/commercialResourcesRoutes.ts");
    const card=source("client/src/components/Commercial/CommercialTemplateCard.tsx");
    const renderer=source("client/src/lib/commercialGraphicRenderer.ts");
    const admin=source("client/src/components/Commercial/CommercialResourcesAdmin.tsx");
    expect(api).toContain('app.post("/api/commercial-resources/private-artwork-data",isAuthenticated');
    expect(api).toContain("t.status='published' OR $2='super_admin'");
    expect(api).toContain('user.role!=="broker"&&user.role!=="master_broker"');
    expect(api).toContain('Cache-Control","private, no-store, max-age=0"');
    expect(api).toContain('return res.status(200).end(JSON.stringify(');
    expect(api).not.toContain("UPDATE public.commercial_resource_templates SET definition");
    expect(card).toContain("fetchPrivateCommercialPng(commercialArtworkEndpoint(template.id)");
    expect(card).toContain("URL.revokeObjectURL(objectUrl)");
    expect(renderer).toContain("loadAuthenticatedImage(commercialArtworkEndpoint(template.id))");
    expect(admin).toContain("setPreviewTemplateId(firstImportedId)");
  });
});
