import {
  buildPublicProspectSummary,getPublicDocumentGroups,PUBLIC_PROCESS_TIMES,
} from "../../shared/publicProspectPresentation";
import { aggregateProspectAssessment } from "../../server/prospectAutoMatching";

describe("Approved public prospect journey — result & documentation",()=>{
  const financing={product:"factoraje",amount:500000,termMonths:6,purpose:"Capital de trabajo"};
  it("shows every captured primary field and exact values, without institutional identities",()=>{
    const profile={
      type:"persona_moral",firstName:"Carlos",lastName:"Mendoza",businessName:"Empresa MX SA",
      phone:"5512345678",email:"contacto@example.test",ingresoMensualPromedio:"1200000",
      yearsInBusiness:5,buroEmpresa:"alto-310-400",buroAccionistaPrincipal:"bueno-592-693",
      atrasosDeudas:"no",garantia:"hipotecaria",garantiaDetalles:{tipo:"inmueble"},
      avalObligadoSolidario:"si",creditosVigentes:"si",participacionVentasGobierno:"0",
      ventasTerminalBancaria:"50000-150000",satCiec:"si",estadosFinancieros:"si",
    };
    const items=buildPublicProspectSummary(profile,financing);
    const asObject=Object.fromEntries(items.map(x=>[x.label,x.value]));
    expect(asObject).toMatchObject({
      "Tipo de financiamiento":"Factoraje","Monto solicitado":"$500,000.00",
      "Plazo deseado":"6 meses","Destino del financiamiento":"Capital de trabajo",
      "Razón social":"Empresa MX SA","Nombre del prospecto":"Carlos Mendoza",
      "WhatsApp / teléfono":"5512345678","Garantía":"Sí · garantía inmobiliaria",
      "Tipo de bien en garantía":"Inmueble","Créditos vigentes":"Sí",
      "Estados financieros disponibles":"Sí",
    });
    expect(items.every(x=>x.value.trim().length>0)).toBe(true);
    expect(new Set(items.map(x=>x.label)).size).toBe(items.length);
    expect(JSON.stringify(items)).not.toMatch(/sobretasa|institucionId|comision/i);
  });
  it("uses exact representative and company document requirements for PM",()=>{
    const groups=getPublicDocumentGroups("persona_moral");
    expect(groups.map(x=>x.heading)).toEqual(["Representante legal","Empresa"]);
    expect(groups[0].items).toHaveLength(3);
    expect(groups[1].items).toHaveLength(6);
    const detail=JSON.stringify(groups);
    for(const marker of ["INE vigente","2 meses","mes actual","6 meses","3 bancos","RPC",
      "3 referencias de clientes y 3 de proveedores","persona de contacto y teléfono",
      "3 referencias personales","parentesco"]) expect(detail).toContain(marker);
  });
  it("does not ask a person to prepare corporate incorporation documents",()=>{
    const groups=getPublicDocumentGroups("fisica");
    expect(groups).toHaveLength(1);
    expect(JSON.stringify(groups)).not.toMatch(/Acta constitutiva|asambleas|registro en RPC/);
  });
  it("leaves operational service times unpromised until supplied by the business",()=>{
    expect(PUBLIC_PROCESS_TIMES).toHaveLength(3);
    expect(PUBLIC_PROCESS_TIMES.map(x=>x.value)).toEqual([
      "Por confirmar","Por confirmar","Depende de cada institución",
    ]);
  });
  it("does not repeat failed and passed categories when offers disagree",()=>{
    const assessment=aggregateProspectAssessment({
      compatible:[], insufficientData:[{institutionId:"a",criteria:{
        matched:[{code:"creditTerm",status:"PASSED"},{code:"companyAge",status:"PASSED"}],
        missing:[{code:"creditAmount",status:"MISSING_DATA"}]}}],
      notCompatible:[{institutionId:"b",criteria:{
        matched:[{code:"creditAmount",status:"PASSED"}],
        failed:[{code:"creditTerm",status:"FAILED"},{code:"creditAmount",status:"FAILED"}]}}],
      summary:{totalEvaluated:2},
    });
    const groups=assessment.criteria!;
    const all=[...groups.matched,...groups.toReview,...groups.notMatched];
    expect(new Set(all).size).toBe(all.length);
    expect(groups.notMatched).toEqual(["Plazo deseado","Monto solicitado"]);
    expect(groups.matched).toContain("Antigüedad del negocio");
    expect(groups.matched).not.toContain("Plazo deseado");
  });
});
