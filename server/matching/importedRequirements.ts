import { getAnnualIncomeRange } from "../../shared/annualIncome";
import { getOfferAgePolicy } from "../../shared/offerAgePolicy";
import type { CriterionEvaluation } from "./compatibilityEvaluator";
import { extractBureauStatus, extractClientProfileType, extractRequestedAmount } from "./fieldMapping";

export const textKey = (v: unknown) => String(v ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
export const present = (v: unknown) => v !== undefined && v !== null && v !== "";
export function capturedRecord(input: any): any {
  const result = {...(input?.profilingData || {})};
  for (const [key,value] of Object.entries(input || {})) if (present(value)) result[key] = value;
  return result;
}
export function exactNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/[$,\s]/g, "");
  return /^\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(Number(raw)) ? Number(raw) : null;
}
export function yesNo(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  const key = textKey(value);
  if (["si","true","1"].includes(key)) return true;
  if (["no","false","0","no aplica","no requerido"].includes(key)) return false;
  return null;
}
export function requirementRanges(req: any, client: any) {
  const profile = extractClientProfileType(capturedRecord(client));
  return {...(req.ranges || {}), ...(profile ? req.profileRules?.[profile]?.ranges || {} : {})};
}
/** Read versioned imported aliases directly. Never write/normalise production records. */
export function offerConditions(conditions: any, req: any, client: any, credit: any): any {
  const c = {...conditions}, ranges = requirementRanges(req, client);
  for (const [key,alias,range,bound] of [
    ["minAmount","minAmount","monto","min"], ["maxAmount","maxAmount","monto","max"],
    ["minCompanyAgeMonths","minMonthsInBusiness","tiempoActividad","min"],
    ["minMonthlyRevenue","minMonthlyIncome","ingresoMensualPromedio","min"],
  ]) {
    if (!Object.prototype.hasOwnProperty.call(c,key)) c[key] = ranges[range]?.[bound] ?? req[alias];
  }
  const agePolicy = getOfferAgePolicy(conditions, req);
  const age = agePolicy.rows.find(r => r.profile === extractClientProfileType(capturedRecord(client)));
  if (age?.pending || (!age && agePolicy.needsReview)) c.minCompanyAgeMonths = null;
  else if (agePolicy.resolved && age) c.minCompanyAgeMonths = age.effectiveMonths;
  // Do not interpret free text as a relaxed rule. Only exact categories have automatic meaning.
  const guarantee = textKey(req.guarantee);
  if (!present(c.guaranteeType)) {
    if (["no aplica","sin garantia","aval, no garantia real","aval, sin garantia real"].includes(guarantee)) c.guaranteeType="sin_garantia";
    if (["hipotecaria","prendaria","inmobiliaria"].includes(guarantee)) c.guaranteeType=guarantee === "inmobiliaria" ? "hipotecaria" : guarantee;
    if (guarantee === "con garantia") c.guaranteeType="con_garantia";
    const conditional = guarantee.match(/^sin garantia hasta (\d+(?:\.\d+)?) mdp; con garantia hasta (\d+(?:\.\d+)?) mdp$/);
    const above = guarantee.match(/^garantia real si >(\d+(?:\.\d+)?) mdp$/);
    const amount = extractRequestedAmount(credit,client);
    if (amount !== null && (conditional || above)) {
      const threshold = Number((conditional || above)![1])*1000000;
      c.guaranteeType = amount <= threshold ? "sin_garantia" : "con_garantia";
    }
  }
  if (!present(c.avalesType)) {
    const aval = textKey(req.guarantorSource);
    if (["no","no aplica","no requerido"].includes(aval)) c.avalesType="no_requerido";
    if (["si","aval","aval personal","obligado solidario","aval / obligado solidario","aval/obligado"].includes(aval)) c.avalesType="un_aval";
  }
  return c;
}

type Interval = {min:number;max:number};
const PF:Record<string,Interval>={alto:{min:694,max:760},bueno:{min:592,max:693},medio:{min:524,max:591},bajo:{min:490,max:523},malo:{min:456,max:489}};
const PM:Record<string,Interval>={alto:{min:310,max:400},bueno:{min:250,max:309},medio:{min:230,max:249},bajo:{min:220,max:229},malo:{min:100,max:219}};
export function bureauInterval(value: unknown, business=false): Interval | null {
  const exact=exactNumber(value); if(exact!==null) return {min:exact,max:exact};
  const key=textKey(value),map=business?PM:PF;
  if(map[key])return map[key];
  const match=key.match(/^(alto|bueno|medio|bajo|malo)-(\d+)-(\d+)$/);
  if(match && map[match[1]]?.min===Number(match[2]) && map[match[1]]?.max===Number(match[3]))return map[match[1]];
  return null;
}
export function compareMinimum(range:Interval|null, minimum:number):CriterionEvaluation["status"] {
  return !range ? "MISSING_DATA" : range.max < minimum ? "FAILED" : range.min >= minimum ? "PASSED" : "MISSING_DATA";
}
function percentageInterval(value: unknown): Interval|null {
  const exact=exactNumber(typeof value === "string" ? value.replace(/%$/,'') : value);
  if(exact!==null && exact<=100) return {min:exact,max:exact};
  const key=textKey(value), match=key.match(/^(\d+)-(\d+)$/);
  if(match && Number(match[1])<=Number(match[2]) && Number(match[2])<=100)return {min:Number(match[1]),max:Number(match[2])};
  if(key==="arriba-40")return {min:40,max:100};
  return null;
}
/** Every material imported criterion either evaluates a captured field or remains explicitly pending. */
export function importedCriteria(req:any, cond:any, inputClient:any, credit:any):CriterionEvaluation[] {
  const client=capturedRecord(inputClient),ranges=requirementRanges(req,client),rows:CriterionEvaluation[]=[];
  const add=(code:string,name:string,requiredValue:any,actualValue:any,status:CriterionEvaluation["status"],reason:string)=>rows.push({code,name,requiredValue,actualValue,status,reason});
  const pending=(code:string,name:string,source:any)=>add(code,name,source,null,"MISSING_DATA","La condición fuente requiere validación específica: "+String(source));
  for(const [key,label] of [["minAmount","Monto mínimo"],["maxAmount","Monto máximo"],["minTermMonths","Plazo mínimo"],["maxTermMonths","Plazo máximo"],["minCompanyAgeMonths","Antigüedad mínima"],["minMonthlyRevenue","Ingreso mensual mínimo"]]) {
    if(present(cond[key]) && (typeof cond[key]!=="number" || !Number.isFinite(cond[key]) || cond[key]<0))pending("invalid_"+key,label,cond[key]);
  }
  for(const [code,alias,rangeKey,clientKeys,business] of [
    ["shareholderBureau","minShareholderBureau","buroAccionistaPrincipal",["buroAccionistaPrincipal"],false],
    ["businessBureau","minBusinessBureau","buroEmpresa",["buroEmpresa"],true],
    ["personalBureau","minPersonalBureau","buroPersonaFisica",["buroPersonaFisica","buroPersonaFisicaSinSat"],false],
  ] as const){
    const profile=extractClientProfileType(client);
    const applicable = code === "personalBureau" ? profile !== "persona_moral" : profile === "persona_moral";
    if(profile && !applicable)continue;
    const raw=ranges[rangeKey]?.min ?? req[alias];if(!present(raw))continue;
    const min=exactNumber(raw);if(min===0)continue;
    const actual=clientKeys.map(k=>client[k] ?? credit?.[k]).find(present);
    const interval=bureauInterval(actual,business);
    const status=min===null || !profile ? "MISSING_DATA" : compareMinimum(interval,min);
    add(code,({shareholderBureau:"Buró del accionista",businessBureau:"Buró de la empresa",personalBureau:"Buró de persona física"} as any)[code],raw,actual ?? null,status,
      status==="MISSING_DATA"?"Falta un puntaje preciso o el rango declarado cruza el mínimo exigido.":status==="FAILED"?"El puntaje de Buró no alcanza el mínimo de la oferta.":"El puntaje de Buró cumple el mínimo de la oferta.");
  }
  const annual=ranges.ingresoAnual?.min ?? req.minAnnualIncome;
  if(present(annual) && annual!==0){
    const min=exactNumber(annual),raw=client.ingresoAnual ?? credit?.ingresoAnual;
    const interval=exactNumber(raw)===0?{min:0,max:0}:getAnnualIncomeRange(raw),status=min===null?"MISSING_DATA":compareMinimum(interval,min);
    add("annualIncome","Ingreso anual mínimo",annual,raw??null,status,status==="MISSING_DATA"?"Ingreso anual ausente o rango insuficiente para confirmar el umbral.":status==="FAILED"?"El ingreso anual no alcanza el mínimo.":"El ingreso anual alcanza el mínimo.");
  }else if(!present(annual) && present(req.minAnnualIncomeSource) && !["no aplica","n/a"].includes(textKey(req.minAnnualIncomeSource)))pending("annualIncome","Ingreso anual variable",req.minAnnualIncomeSource);
  if(!present(cond.minMonthlyRevenue) && present(req.minMonthlyIncomeSource) && !["no aplica","n/a"].includes(textKey(req.minMonthlyIncomeSource)))pending("monthlyRevenue","Ingreso mensual variable",req.minMonthlyIncomeSource);
  if(!present(cond.minCompanyAgeMonths) && present(req.businessAgeSource || req.minMonthsInBusinessSource) && !["no aplica","n/a"].includes(textKey(req.businessAgeSource || req.minMonthsInBusinessSource)))pending("companyAge","Antigüedad pendiente de aclaración",req.businessAgeSource || req.minMonthsInBusinessSource);
  for(const [code,key,label,header] of [["requiresCiec","satCiec","Conexión SAT (CIEC)","Requiere CIEC"],["requiresFinancialStatements","estadosFinancieros","Estados financieros","Estados financieros"]]){
    if(req[code]===true){const actual=client[key] ?? credit?.[key],value=yesNo(actual);add(code,label,true,actual??null,value===null?"MISSING_DATA":value?"PASSED":"FAILED",value===null?"Falta confirmar este requisito en el expediente.":value?"El expediente declara contar con el requisito.":"El expediente declara no contar con el requisito exigido.");}
    else if(Object.prototype.hasOwnProperty.call(req,code) && req[code]!==false) {
      const source=cond.sourceTechnicalFields?.[header];
      if(!["no aplica","n/a"].includes(textKey(source)))pending(code,label,source || req[code] || "Sin definición en la fuente");
    }
  }
  if(present(req.satOpinion) && !["no aplica","n/a"].includes(textKey(req.satOpinion))){
    const expected=textKey(req.satOpinion),actual=client.opinionCumplimiento ?? credit?.opinionCumplimiento,key=textKey(actual);
    const status=["positivo","positiva"].includes(expected) ? ["positivo","positiva"].includes(key)?"PASSED":["negativo","negativa"].includes(key)?"FAILED":"MISSING_DATA" : "MISSING_DATA";
    add("satOpinion","Opinión SAT",req.satOpinion,actual??null,status,status==="PASSED"?"Opinión SAT positiva declarada.":status==="FAILED"?"La opinión SAT declarada es negativa y se requiere positiva.":"Falta confirmar la opinión SAT exigida.");
  }
  if(typeof req.allowsArrears==="boolean"){
    const bureau=extractBureauStatus(client,credit),policy=textKey(req.arrearsPolicy);
    let status:CriterionEvaluation["status"]="MISSING_DATA";
    if(bureau.hasDelinquencies===false)status="PASSED";
    else if(bureau.hasDelinquencies===true && !req.allowsArrears)status="FAILED";
    // Existing forms capture free-text details, not verified days/amounts. Never invent these values.
    else if(bureau.hasDelinquencies===true && req.allowsArrears && ["no aplica","sin limite","sin restriccion"].includes(policy))status="PASSED";
    add("arrearsPolicy","Tolerancia de atrasos",{allowsArrears:req.allowsArrears,policy:req.arrearsPolicy},bureau.rawStatus,status,status==="FAILED"?"La oferta no admite atrasos y el cliente declara incidencias.":status==="PASSED"?"El historial declarado cumple la política estructurada de atrasos.":"Se requiere verificar atrasos y los días o importes permitidos; el texto libre no acredita el umbral.");
  }
  if(Object.prototype.hasOwnProperty.call(req,"allowsArrears") && req.allowsArrears==null)pending("arrearsPolicy","Política de atrasos sin definición",cond.sourceTechnicalFields?.["Permite atrasos"] || "Sin definición en la fuente");
  if(present(req.governmentSalesLimit)){
    const policy=textKey(req.governmentSalesLimit),actual=client.participacionVentasGobierno ?? credit?.participacionVentasGobierno,interval=percentageInterval(actual);
    const less=policy.match(/^(?:menor a|menos de|<)\s*(\d+(?:\.\d+)?)%$/),zero=policy==="0" || policy==="0%";
    let status:CriterionEvaluation["status"]="MISSING_DATA";
    if(interval && (less||zero)){const max=zero?0:Number(less![1]);status=(zero?interval.max<=max:interval.max<max)?"PASSED":(zero?interval.min>max:interval.min>=max)?"FAILED":"MISSING_DATA";}
    add("governmentSalesLimit","Ventas a gobierno",req.governmentSalesLimit,actual??null,status,status==="MISSING_DATA"?"El rango o la política de ventas a gobierno requiere aclaración; no se asume un porcentaje exacto.":status==="FAILED"?"La participación de ventas a gobierno excede el límite.":"La participación declarada está dentro del límite.");
  }
  if(present(cond.informationalMaximumLoan))pending("variableMaximumLoan","Monto máximo ligado a ventas",cond.informationalMaximumLoan);
  if(present(req.guarantee) && !present(cond.guaranteeType))pending("guaranteePolicy","Condiciones particulares de garantía",req.guarantee);
  if(present(req.guarantorSource) && !present(cond.avalesType))pending("guarantorPolicy","Condiciones particulares de aval",req.guarantorSource);
  if(present(req.bureauPolicySource) && !(["bueno","excelente","buen score","flexible"].includes(textKey(req.bureauPolicySource)) && [req.minBusinessBureau,req.minShareholderBureau,req.minPersonalBureau].some(v=>typeof v === "number" && v>0) && typeof req.allowsArrears === "boolean"))pending("bureauPolicyReview","Condiciones adicionales de Buró",req.bureauPolicySource);
  if(present(req.excludedSectors) && !["no aplica","ninguno","sin restricciones"].includes(textKey(req.excludedSectors)))pending("excludedSectors","Restricciones de giro y actividad",req.excludedSectors);
  if(present(req.presence) && !["nacional","nivel nacional"].includes(textKey(req.presence)))pending("presence","Restricciones geográficas",req.presence);
  return rows;
}
