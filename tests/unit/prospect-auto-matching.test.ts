import { prospectFinancingSchema, matchesFinancingFamily, normalizeFinancingFamily } from "../../shared/prospectFinancing";
import { aggregateProspectAssessment, buildProspectCredit } from "../../server/prospectAutoMatching";
import { matchPublishedCatalog } from "../../server/matching/catalog";

const financing={product:"simple" as const,amount:1000000,termMonths:36,purpose:"Capital de trabajo"};
const createOffer=(id:string,institution:string,family:string,versionStatus="published",extra:any={})=>({
  product: {
    id,name:"Oferta de prueba",institutionId:institution,productType:family,
    status:"published",isActive:true,currentVersionNumber:1,...extra.product,
  },
  version: {
    versionNumber:1,status:versionStatus,conditions:{minAmount:100000,maxAmount:5000000,minTermMonths:12,maxTermMonths:60},
    requirements:{},...extra.version,
  },
  institution:{id:institution,name:"Institución de prueba",isActive:true,...extra.institution},
});
describe("Issue #65 — prospect matching safety",()=>{
  it("validates exact amount, purpose, term and leasing asset",()=>{
    expect(prospectFinancingSchema.safeParse(financing).success).toBe(true);
    expect(prospectFinancingSchema.safeParse({...financing,amount:0}).success).toBe(false);
    expect(prospectFinancingSchema.safeParse({...financing,amount:NaN}).success).toBe(false);
    expect(prospectFinancingSchema.safeParse({...financing,termMonths:0}).success).toBe(false);
    expect(prospectFinancingSchema.safeParse({...financing,purpose:"x"}).success).toBe(false);
    expect(prospectFinancingSchema.safeParse({...financing,product:"arrendamiento"}).success).toBe(false);
    expect(prospectFinancingSchema.safeParse({...financing,product:"arrendamiento",leasingAssetType:"maquinaria"}).success).toBe(true);
    expect(prospectFinancingSchema.safeParse({...financing,product:"simple",leasingAssetType:"maquinaria"}).success).toBe(false);
  });
  it("maps only explicit commercial product families, never marketing names",()=>{
    expect(normalizeFinancingFamily("credito_simple")).toBe("simple");
    expect(normalizeFinancingFamily("capital de trabajo")).toBe("simple");
    expect(matchesFinancingFamily({productType:"revolvente"},"simple")).toBe(false);
    expect(matchesFinancingFamily({productType:"credito_simple"},"simple")).toBe(true);
    expect(matchesFinancingFamily({productType:"arrendamiento"},"arrendamiento")).toBe(true);
    expect(matchesFinancingFamily({productType:"other"},"simple")).toBe(false);
    expect(matchesFinancingFamily({productType:"simple",template:{category:"arrendamiento"}},"simple")).toBe(false);
  });
  it("counts unique verified institutions, not offer rows, without private fields",()=>{
    const items=[
      {institutionId:"fin-1"},{institutionId:"fin-1"},{institutionId:"fin-2"},
    ];
    const publicResult=aggregateProspectAssessment({
      compatible:items,insufficientData:[{institutionId:"fin-3"}],notCompatible:[],
    });
    expect(publicResult).toMatchObject({status:"possible_options",institutionCount:2});
    expect(JSON.stringify(publicResult)).not.toMatch(/institutionId|institutionName|offerId|fin-1|sobretasa|comision|approvalProbability/gi);
    expect(aggregateProspectAssessment({compatible:[],insufficientData:items,notCompatible:[]}))
      .toMatchObject({status:"missing_information"});
    expect(aggregateProspectAssessment({compatible:[],insufficientData:[],notCompatible:items}))
      .toMatchObject({status:"under_review"});
  });
  it("summarizes only verified criteria without leaking thresholds, institution names or internal economics",()=>{
    const publicResult=aggregateProspectAssessment({
      compatible:[{institutionId:"bank-secret", criteria:{matched:[
        {code:"targetProfiles",status:"PASSED"},{code:"creditAmount",status:"PASSED"},
        {code:"creditTerm",status:"PASSED"},{code:"monthlyRevenue",status:"PASSED"},
        {code:"secretSpecialRate",status:"PASSED"},
      ],missing:[]}}],
      insufficientData:[{institutionId:"second-bank",criteria:{matched:[],missing:[
        {code:"companyAge",status:"MISSING_DATA"},{code:"bureauRequirement",status:"MISSING_DATA"},
        {code:"secretUnderwritingRule",status:"MISSING_DATA"},
      ]}}],
      notCompatible:[],
    });
    expect(publicResult).toMatchObject({
      status:"possible_options",institutionCount:1,
      criteria:{matched:["Tipo de cliente","Monto solicitado","Plazo deseado","Ingresos del negocio"],
        toReview:["Antigüedad del negocio","Historial crediticio"]},
    });
    const serialized=JSON.stringify(publicResult);
    for(const sensitive of ["bank-secret","second-bank","secretSpecialRate",
      "secretUnderwritingRule","comision","sobretasa","tasa","minAmount","creditAmount"]) {
      expect(serialized).not.toContain(sensitive);
    }
    const unknown=aggregateProspectAssessment({
      compatible:[],insufficientData:[{institutionId:"bank",criteria:{matched:[],missing:[
        {code:"guaranteeType",status:"MISSING_DATA"}]}}],notCompatible:[],
    });
    expect(unknown.institutionCount).toBeUndefined();
    expect(unknown.criteria?.matched).toEqual([]);
    expect(unknown.criteria?.toReview).toEqual(["Garantías"]);
  });
  it("reuses published catalog engine and excludes wrong family, draft, expired and inactive offers",async()=>{
    const offers=[
      createOffer("o-1","fin-1","simple"),
      createOffer("o-2","fin-1","simple"),
      createOffer("o-3","fin-2","revolvente"),
      createOffer("o-4","fin-3","simple","draft"),
      createOffer("o-5","fin-4","simple","published",{version:{effectiveTo:"2020-01-01T00:00:00Z"}}),
      createOffer("o-6","fin-5","simple","published",{institution:{isActive:false}}),
    ];
    const stub:any={getPublishedInstitutionProductsForMatching:async()=>offers};
    const result=await matchPublishedCatalog(stub,{credit:buildProspectCredit(financing),client:{type:"fisica"}},undefined,financing.product);
    const ids=[...result.compatible,...result.insufficientData,...result.notCompatible].map(x=>x.offerId);
    expect(ids.sort()).toEqual(["o-1","o-2"]);
    expect(result.summary.totalEvaluated).toBe(2);
    // Missing source evidence can prevent COMPATIBLE; never upgrade unknowns.
    expect(result.compatible.every(x=>x.criteria.failed.length===0&&x.criteria.missing.length===0)).toBe(true);
  });
  it("creates the expected verified credit structure for leasing",()=>{
    expect(buildProspectCredit({
      product:"arrendamiento",amount:3000000,termMonths:48,purpose:"Maquinaria de producción",leasingAssetType:"maquinaria",
    })).toMatchObject({
      mortgageData:{operationType:"arrendamiento",
        lease:{tipo_activo_arrendado:"maquinaria",plazo_deseado_meses:48}},
      amount:3000000,term:48,
    });
  });
});