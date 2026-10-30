import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateCommercialLogoPng } from "../../server/commercialProfileLogoValidation";

function crc32(bytes:Buffer):number {
  let crc=0xffffffff;
  for(const b of bytes) {
    crc ^= b;
    for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function chunk(type:string,data:Buffer):Buffer{
  const size=Buffer.alloc(4),check=Buffer.alloc(4);
  size.writeUInt32BE(data.length,0);
  const payload=Buffer.concat([Buffer.from(type,"ascii"),data]);
  check.writeUInt32BE(crc32(payload),0);
  return Buffer.concat([size,payload,check]);
}
function png(width=64,height=64):Buffer {
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
  ihdr[8]=8;ihdr[9]=6;
  const image=Buffer.alloc((width*4+1)*height);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a","hex"),
    chunk("IHDR",ihdr),
    chunk("tEXt",Buffer.from("Comment\\0sensitive metadata","utf8")),
    chunk("IDAT",deflateSync(image)),
    chunk("IEND",Buffer.alloc(0))
  ]);
}
const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("COM-RES-LOGO-SELF — opt-in profile logo",()=>{
  it("validates PNG bytes, dimensions and strips embedded metadata",()=>{
    const valid=validateCommercialLogoPng(png());
    expect(valid.width).toBe(64);
    expect(valid.height).toBe(64);
    expect(valid.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(valid.png.toString("utf8")).not.toContain("sensitive metadata");
    expect(validateCommercialLogoPng(valid.png).sha256).toBe(valid.sha256);
  });
  it("rejects forged PNG signatures, CRC corruption, truncation, trailing data and excessive dimensions",()=>{
    const img=png();
    expect(()=>validateCommercialLogoPng(Buffer.from("fake image"))).toThrow();
    const corrupted=Buffer.from(img);corrupted[19]^=1;
    expect(()=>validateCommercialLogoPng(corrupted)).toThrow(/CRC/);
    expect(()=>validateCommercialLogoPng(img.subarray(0,img.length-9))).toThrow();
    expect(()=>validateCommercialLogoPng(Buffer.concat([img,Buffer.from("junk")]))).toThrow();
    expect(()=>validateCommercialLogoPng(png(2100,64))).toThrow();
    expect(()=>validateCommercialLogoPng(Buffer.alloc(1_000_001))).toThrow();
  });
  it("disables broker/master logo upload and never composites a user logo",()=>{
    const routes=source("server/commercialResourcesRoutes.ts");
    const settings=source("client/src/pages/Settings.tsx");
    const page=source("client/src/pages/CommercialResources.tsx");
    const renderer=source("client/src/lib/commercialGraphicRenderer.ts");
    expect(routes).toContain('app.post("/api/commercial-resources/my-logo",isAuthenticated');
    expect(routes).toContain('return res.status(410).json({message:"Los logos de brokers y masters ya no se admiten en Recursos Comerciales."})');
    expect(routes).toContain('app.delete("/api/commercial-resources/my-logo",isAuthenticated');
    expect(routes).toContain('return res.json({ displayName, whatsapp });');
    expect(routes).not.toContain('INSERT INTO public.commercial_profile_logos');
    expect(settings).not.toContain("CommercialProfileLogo");
    expect(page).not.toContain("approvedLogoUrl");
    expect(renderer).not.toContain("drawLogo");
    expect(renderer).not.toContain("approvedLogoUrl");
  });
});
