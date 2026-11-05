import { annualIncomeBandFromMonthly, buildQuickProspectProfile } from "../../shared/prospectQuickProfile";
import { aggregateProspectAssessment } from "../../server/prospectAutoMatching";

const basic={
  type:"fisica_empresarial" as const, firstName:"María",lastName:"López",
  businessName:"",phone:"5512345678",email:"",rfc:"",monthlyIncome:"120000",yearsInBusiness:"3",
};
describe("Issue #65: short public form and honest zero-match diagnostics",()=>{
  it("derives annual band from declared monthly income, without claiming documented revenue",()=>{
    const profile=buildQuickProspectProfile(basic);
    expect(profile.ingresoMensualPromedio).toBe("120000");
    expect(profile.ingresoAnual).toBe(annualIncomeBandFromMonthly(basic.type,120000));
    expect(profile.yearsInBusiness).toBe(3);
    expect(profile).not.toHaveProperty("ingresoMensualPromedioNoComprobables");
    for(const field of ["curp","estadoCivil","street","notes","puesto","sectoreEconomico",
      "gastosFijosMensualesPromedio","industry"])expect(profile).not.toHaveProperty(field);
  });
  it("keeps years missing when not provided, instead of asserting a 0-month-old business",()=>{
    const profile=buildQuickProspectProfile({...basic,yearsInBusiness:"",email:"maria@example.com"});
    expect(profile).not.toHaveProperty("yearsInBusiness");
    expect(profile.email).toBe("maria@example.com");
    expect(()=>buildQuickProspectProfile({...basic,monthlyIncome:"",yearsInBusiness:""})).toThrow(/ingresos mensuales/);
    expect(()=>buildQuickProspectProfile({...basic,monthlyIncome:"12abc"})).toThrow(/ingresos mensuales/);
    expect(()=>buildQuickProspectProfile({...basic,yearsInBusiness:"-1"})).toThrow(/años/);
  });
  it("validates legal entity and phone without requiring CURP, address or notes",()=>{
    expect(()=>buildQuickProspectProfile({...basic,type:"persona_moral",businessName:""})).toThrow();
    expect(buildQuickProspectProfile({...basic,type:"persona_moral",businessName:"Comercio MX SA"}).businessName)
      .toBe("Comercio MX SA");
    expect(()=>buildQuickProspectProfile({...basic,phone:"123"})).toThrow();
  });
  it("preserves bureau, arrears, guarantees, guarantors and credit data for a physical person",()=>{
    const profile=buildQuickProspectProfile({...basic,type:"fisica",financial:{
      creditBureau:"bueno-592-693",hasArrears:"no",guarantee:"hipotecaria",
      guaranteeValue:"2500000",propertyType:"casa",guarantor:"si",existingCredits:"no",
    }});
    expect(profile).toMatchObject({
      buroPersonaFisica:"bueno-592-693",atrasosDeudasBuro:"no",
      cuentaConGarantiaFisica:"hipotecaria",tieneAvalObligadoSolidarioFisica:"si",creditosVigentes:"no",
      garantiaFisicaDetalles:{valor:"2500000",tipoInmueble:"casa"},
    });
    expect(profile).not.toHaveProperty("gastosFijosMensualesPromedio");
    expect(profile).not.toHaveProperty("ingresoMensualPromedioNoComprobables");
  });
  it("preserves company matching fields and conditional credit evidence without requiring dossier items",()=>{
    const profile=buildQuickProspectProfile({...basic,type:"persona_moral",businessName:"Empresa MX",financial:{
      creditBureauCompany:"alto-310-400", creditBureauShareholder:"medio-524-591",
      governmentSales:"0",terminalSales:"hasta-50000",satConnection:"no",financialStatements:"si",
      complianceOpinion:"positiva",hasArrears:"no",guarantee:"sin-garantia",existingCredits:"si",
      credits:[{tipo:"simple",institucion:"Ejemplo",saldoOriginal:"50000",saldo:"25000",
        fechaInicio:"2025-01-01",fechaTermino:"2027-01-01"}],
    }});
    expect(profile).toMatchObject({buroEmpresa:"alto-310-400",
      buroAccionistaPrincipal:"medio-524-591",participacionVentasGobierno:"0",
      ventasTerminalBancaria:"hasta-50000",satCiec:"no",estadosFinancieros:"si",
      creditosVigentes:"si"});
    expect(profile.creditosVigentesDetalles).toHaveLength(1);
    expect(profile).not.toHaveProperty("notes");
    expect(()=>buildQuickProspectProfile({...basic,type:"persona_moral",businessName:"Empresa MX",
      financial:{existingCredits:"si",credits:[]}})).toThrow(/crédito vigente/i);
  });
  it("uses Sin SAT's typed bureau and income fields without inventing documented revenue",()=>{
    const profile=buildQuickProspectProfile({...basic,type:"sin_sat",financial:{
      hasBureauHistory:"si",creditBureauShareholder:"medio-524-591",
      guarantor:"no",existingCredits:"no",hasArrears:"no",guarantee:"sin-garantia",
    }});
    expect(profile).toMatchObject({buroPersonaFisicaSinSat:"si",
      buroAccionistaPrincipal:"medio-524-591",tieneAvalObligadoSolidarioSinSat:"no",
      ingresoMensualPromedioComprobablesSinSat:"120000"});
  });
  it("shows real evaluated offers and reasons even with zero compatible institutions",()=>{
    const review=aggregateProspectAssessment({
      compatible:[],insufficientData:[],
      notCompatible:[{
        institutionId:"secret-institution",
        criteria:{matched:[{code:"creditAmount",status:"PASSED"}],
          failed:[{code:"targetProfiles",status:"FAILED"}],missing:[]},
      }],
      summary:{totalEvaluated:1},
    });
    expect(review).toMatchObject({
      status:"under_review",reviewedOffers:1,
      criteria:{matched:["Monto solicitado"],notMatched:["Tipo de cliente"],toReview:[]},
    });
    expect(review.institutionCount).toBeUndefined();
    expect(JSON.stringify(review)).not.toContain("secret-institution");
  });
  it("distinguishes zero comparable catalog offers from an actual evaluation",()=>{
    const noOffers=aggregateProspectAssessment({
      compatible:[],insufficientData:[],notCompatible:[],
      summary:{totalEvaluated:0},
    });
    expect(noOffers).toMatchObject({status:"under_review",reviewedOffers:0});
    expect(noOffers.message).toMatch(/no hay ofertas publicadas comparables/i);
    expect(noOffers.institutionCount).toBeUndefined();
  });
});
