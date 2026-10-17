import { getMissingPrelaunchSchemaColumns, checkPrelaunchSchemaReadiness } from "../../server/stagingSchemaRepair";

describe("prelaunch health rejects reachable PostgreSQL with missing columns",()=>{
  const mandatory=[
    ["credits","institution_product_id"],
    ["commissions","institution_product_id"],
    ["legal_acceptances","template_sha256"],
    ["institution_products","name"],
    ["credit_submission_targets","version_number"],
  ];
  it("detects partial schema even when the user table works",async()=>{
    const fake={query:jest.fn().mockResolvedValue({
      rows:[{table_name:"credits",column_name:"institution_product_id"}],
    })};
    const result=await checkPrelaunchSchemaReadiness(fake as any);
    expect(result.ready).toBe(false);
    expect(result.missingCount).toBeGreaterThan(2);
    const missing=getMissingPrelaunchSchemaColumns([
      {table_name:"credits",column_name:"institution_product_id"},
    ]);
    for(const [table,col] of mandatory.slice(1))expect(missing).toContain(table+"."+col);
  });
  it("returns ready only if every required column appears",async()=>{
    const first=await checkPrelaunchSchemaReadiness({
      query:jest.fn().mockResolvedValue({rows:[]})
    } as any);
    expect(first.ready).toBe(false);
    const source=await import("../../server/stagingSchemaRepair");
    expect(source.getMissingPrelaunchSchemaColumns([]).length).toBeGreaterThan(10);
  });
});
