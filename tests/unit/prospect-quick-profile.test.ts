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
