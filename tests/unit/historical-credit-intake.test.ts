import { historicalCreditIntakeSchema,validHistoricalDate } from "../../shared/historicalCreditIntake";
const base={clientId:"client",brokerId:"broker",financialInstitutionId:"lender",productTemplateId:"simple",externalReference:" cn  123 ",actualDate:"2025-01-31",amount:"2200000.01",termMonths:36,evidenceDocumentId:"evidence",historicalNetwork:"unknown",commissionStatus:"pending",originatorConfirmed:true};
describe("Historical credit intake safety",()=>{
  it("normalizes the reference and money without asserting a verified dispersal",()=>{
    const r=historicalCreditIntakeSchema.parse(base);
    expect(r.externalReference).toBe("CN 123");expect(r.amount).toBe("2200000.01");
    expect(r).not.toHaveProperty("commissionRates");expect(r).not.toHaveProperty("status");
  });
  it("rejects false calendar dates, future dates, nonpositive or fractional-cent amounts",()=>{
    expect(validHistoricalDate("2025-02-29","2026-11-25")).toBe(false);
    expect(validHistoricalDate("2024-02-29","2026-11-25")).toBe(true);
    expect(validHistoricalDate("2026-11-26","2026-11-25")).toBe(false);
    for(const amount of ["0","-5","1.001","NaN","1e7"])expect(historicalCreditIntakeSchema.safeParse({...base,amount}).success).toBe(false);
  });
  it("requires evidence for prior payment and master identity if declared",()=>{
    expect(historicalCreditIntakeSchema.safeParse({...base,commissionStatus:"paid_external"}).success).toBe(false);
    expect(historicalCreditIntakeSchema.safeParse({...base,commissionStatus:"paid_external",commissionEvidenceDocumentId:"payment"}).success).toBe(true);
    expect(historicalCreditIntakeSchema.safeParse({...base,historicalNetwork:"master"}).success).toBe(false);
    expect(historicalCreditIntakeSchema.safeParse({...base,historicalNetwork:"master",historicalMasterName:"Master QA"}).success).toBe(true);
  });
  it("rejects any forged financial status, rate or actor fields",()=>{
    for(const extra of [{status:"disbursed"},{commissionRates:{broker:5}},{createdBy:"other"},{originMasterBrokerId:"other"},{originatorConfirmed:false}])expect(historicalCreditIntakeSchema.safeParse({...base,...extra}).success).toBe(false);
  });
});
