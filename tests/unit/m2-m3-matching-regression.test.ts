/**
 * Recovered prelaunch M2/M3 cases, adapted from the prior financial branch.
 * Exercises original contracts without importing obsolete API fixtures or enabling unapproved functionality.
 */
import {
  evaluateOfferCompatibility, isVersionEligibleForMatching,
  type OfferVersionInput,
} from "../../server/matching/compatibilityEvaluator";
import {
  extractCompanyAgeMonths, extractEmploymentAgeMonths,
} from "../../server/matching/fieldMapping";

const offer = (conditions: Record<string, unknown>, extras: Record<string, unknown> = {}): OfferVersionInput => ({
  product: { id: "m2m3-protected", name: "Oferta verificable" },
  version: { id: "m2m3-v1", versionNumber: 1, status: "published", conditions, ...extras },
});

describe("M2/M3 - regresiones anteriores no incluidas en M1", () => {
  it("no confunde antigüedad empresarial con antigüedad laboral", () => {
    expect(extractCompanyAgeMonths({type:"persona_moral",antiguedadLaboral:"6 años",antiguedadEmpleo:"4 años"})).toBeNull();
    expect(extractEmploymentAgeMonths({antiguedadLaboral:"6 años"})).toBe(72);
    expect(extractCompanyAgeMonths({tiempoActividad:"mas_de_2_anios"})).toBeNull();
    expect(extractCompanyAgeMonths({tiempoActividad:"aproximadamente 3 años"})).toBeNull();
    expect(extractCompanyAgeMonths({tiempoActividad:"18 meses"})).toBe(18);
  });

  it("garantía hipotecaria frente a inmueble, líquida o tipo no especificado", () => {
    const o=offer({minAmount:1000000,maxAmount:5000000,guaranteeType:"hipotecaria"});
    const assess=(client:any)=>evaluateOfferCompatibility({credit:{amount:2000000},client},o);
    expect(assess({garantia:"si",garantiaDetalles:{tipo:"inmueble comercial"}}).criteria.matched.some(x=>x.code==="guaranteeType")).toBe(true);
    expect(assess({garantia:"si",garantiaDetalles:{tipo:"liquida"}}).criteria.failed.some(x=>x.code==="guaranteeType")).toBe(true);
    expect(assess({garantia:"si"}).criteria.missing.some(x=>x.code==="guaranteeType")).toBe(true);
  });

  it("oferta con origen sin verificar no simula compatibilidad ni rechazos", () => {
    const app={credit:{amount:10000000},client:{type:"fisica",ingresoMensualPromedio:"10000"}};
    const result=evaluateOfferCompatibility(app,offer({minAmount:100000,maxAmount:1000000,minMonthlyRevenue:500000},{originVerified:false,requirements:{targetProfiles:["persona_moral"]}}));
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.criteria.failed).toEqual([]);
    expect(result.criteria.missing.length).toBeGreaterThan(0);
  });

  it("criterio no verificado no rechaza definitivamente pese a incumplimiento numérico", () => {
    const app={credit:{amount:500000,term:12},client:{type:"persona_moral",yearsInBusiness:0.5}};
    const result=evaluateOfferCompatibility(app,offer({minCompanyAgeMonths:24,unverifiedCriteria:["companyAge"]}));
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.criteria.failed).toEqual([]);
    expect(result.criteria.missing.some(x=>x.code==="companyAge")).toBe(true);
  });

  it("campo del expediente marcado no verificado no se usa para rechazar", () => {
    const app={credit:{amount:300000},client:{type:"persona_moral",ingresoMensualPromedio:"50000",unverifiedFields:["monthlyRevenue"]}};
    const result=evaluateOfferCompatibility(app,offer({minMonthlyRevenue:200000}));
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.criteria.failed).toEqual([]);
    expect(result.criteria.missing.some(x=>x.code==="monthlyRevenue")).toBe(true);
  });

  it("criterio que sí tiene fuente verificada y falla permanece NO COMPATIBLE", () => {
    const app={credit:{amount:500000},client:{type:"persona_moral",yearsInBusiness:1}};
    const result=evaluateOfferCompatibility(app,offer({minCompanyAgeMonths:36}));
    expect(result.status).toBe("NOT_COMPATIBLE");
    expect(result.criteria.failed.some(x=>x.code==="companyAge")).toBe(true);
  });

  it("descarta versiones sin publicación formal, caducadas o inactivas", () => {
    const product={status:"published",isActive:true};
    const inst={isActive:true};
    for(const status of ["draft","active","superseded","archived","unknown"]){
      expect(isVersionEligibleForMatching(product,{status},inst).eligible).toBe(false);
    }
    expect(isVersionEligibleForMatching(product,{status:"published"},{isActive:false}).eligible).toBe(false);
    expect(isVersionEligibleForMatching(product,{status:"published",effectiveTo:new Date(Date.now()-86400000)},inst).eligible).toBe(false);
    expect(isVersionEligibleForMatching(product,{status:"published",effectiveFrom:new Date(Date.now()+86400000)},inst).eligible).toBe(false);
    expect(isVersionEligibleForMatching(product,{status:"published",effectiveTo:null},inst).eligible).toBe(true);
  });

  it("rechaza fechas corruptas, booleanas, objetos y rangos invertidos", () => {
    const p={status:"published",isActive:true};
    for(const extra of [
      {effectiveFrom:"fecha-invalida"}, {effectiveTo:"fecha-invalida"},
      {effectiveFrom:true}, {effectiveTo:false},
      {effectiveFrom:{}}, {effectiveTo:{date:"2027-12-01"}},
      {effectiveFrom:"2030-01-01",effectiveTo:"2027-01-01"},
    ]) expect(isVersionEligibleForMatching(p,{status:"published",...extra}).eligible).toBe(false);
  });

  it("los cuatro perfiles se evalúan sólo por atributos efectivamente capturados", () => {
    const samples=[
      {type:"persona_moral",yearsInBusiness:4},
      {type:"fisica_empresarial",yearsInBusiness:2},
      {type:"fisica",antiguedadLaboral:"5 años"},
      {type:"sin_sat",tiempoActividad:"24 meses"},
    ];
    for(const c of samples){
      const app={credit:{amount:300000},client:c};
      const pass=evaluateOfferCompatibility(app,{
        product:{id:"four-profiles",name:"Oferta cuatro perfiles"},
        version:{id:"v",versionNumber:1,status:"published",
          conditions:{minAmount:100000,maxAmount:500000},
          requirements:{targetProfiles:[c.type]},
        },
      });
      expect(pass.status).toBe("COMPATIBLE");
      expect(pass.criteria.failed).toEqual([]);
    }
    expect(extractCompanyAgeMonths(samples[2])).toBeNull();
  });
});
