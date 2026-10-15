import { assertDocumentStorageEnvironmentIsolated } from "../../server/documentStorage";
describe("Staging Supabase document safety guard",()=>{
  const oldName=process.env.RAILWAY_ENVIRONMENT_NAME;
  const oldFlag=process.env.STAGING_DOCUMENT_STORAGE_ISOLATED;
  afterEach(()=>{
    if(oldName===undefined)delete process.env.RAILWAY_ENVIRONMENT_NAME;
    else process.env.RAILWAY_ENVIRONMENT_NAME=oldName;
    if(oldFlag===undefined)delete process.env.STAGING_DOCUMENT_STORAGE_ISOLATED;
    else process.env.STAGING_DOCUMENT_STORAGE_ISOLATED=oldFlag;
  });
  it("blocks Staging shared storage unless explicitly approved",()=>{
    process.env.RAILWAY_ENVIRONMENT_NAME="staging";
    delete process.env.STAGING_DOCUMENT_STORAGE_ISOLATED;
    expect(()=>assertDocumentStorageEnvironmentIsolated("documents","documents"))
      .toThrow("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
  });
  it("does not allow another bucket even after Staging approval",()=>{
    process.env.RAILWAY_ENVIRONMENT_NAME="staging";
    process.env.STAGING_DOCUMENT_STORAGE_ISOLATED="true";
    expect(()=>assertDocumentStorageEnvironmentIsolated("documents","documents"))
      .toThrow("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
    expect(()=>assertDocumentStorageEnvironmentIsolated("staging-credito","documents"))
      .toThrow("STAGING_DOCUMENT_STORAGE_NOT_ISOLATED");
    expect(()=>assertDocumentStorageEnvironmentIsolated("staging-credito","staging-credito"))
      .not.toThrow();
  });
  it("does not change Production's own storage configuration",()=>{
    process.env.RAILWAY_ENVIRONMENT_NAME="production";
    delete process.env.STAGING_DOCUMENT_STORAGE_ISOLATED;
    expect(()=>assertDocumentStorageEnvironmentIsolated("documents","documents"))
      .not.toThrow();
  });
});