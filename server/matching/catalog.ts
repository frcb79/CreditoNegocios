import type { IStorage } from "../storage";
import { matchesFinancingFamily } from "../../shared/prospectFinancing";
import { evaluateCatalogCompatibility, evaluateOfferCompatibility, isVersionEligibleForMatching, type OfferVersionInput, type ApplicationInput, type CompatibilityResult } from "./compatibilityEvaluator";

import { capturedRecord, offerConditions, textKey } from "./importedRequirements";
import { extractRequestedAmount, extractHasGuarantee } from "./fieldMapping";

type Coverage = { requestedAmount: number; evaluatedAmount: number; remainingAmount: number };
type CatalogMatch = CompatibilityResult & { partialCoverage?: Coverage };

/** Only Crédito Simple; never assume a variable maximum or relaxed guarantee.
 * Re-evaluate every rule at the lower amount. Partial coverage is always preliminary.
 */
export function evaluatePartialSimple(application:ApplicationInput, offer:OfferVersionInput, full:CompatibilityResult):CatalogMatch {
  if (!matchesFinancingFamily(offer.product,"simple") || full.status !== "NOT_COMPATIBLE") return full;
  const requested = extractRequestedAmount(application.credit,application.client);
  if (requested === null) return full;
  const client = capturedRecord(application.client), credit = capturedRecord(application.credit);
  const req = offer.version?.requirements || {};
  const raw = offer.version?.conditions || {};
  const conditions = offerConditions(raw,req,client,credit);
  const caps:number[] = [];
  if (typeof conditions.maxAmount === "number" && Number.isFinite(conditions.maxAmount) && conditions.maxAmount > 0) caps.push(conditions.maxAmount);
  const guarantee = textKey(req.guarantee);
  // An explicitly configured guarantee policy takes precedence over imported source text.
  if (!raw.guaranteeType && extractHasGuarantee(client,credit).hasGuarantee === false) {
    const threshold = guarantee.match(/^sin garantia hasta (\d+(?:\.\d+)?) mdp; con garantia hasta (\d+(?:\.\d+)?) mdp$/) ||
      guarantee.match(/^garantia real si >(\d+(?:\.\d+)?) mdp$/);
    if (threshold) caps.push(Number(threshold[1])*1000000);
  }
  if (!caps.length) return full;
  const evaluatedAmount = Math.min(...caps);
  if (!Number.isFinite(evaluatedAmount) || evaluatedAmount <= 0 || evaluatedAmount >= requested) return full;
  const partial = evaluateOfferCompatibility({client,credit:{...credit,amount:evaluatedAmount}},offer);
  if (partial.status === "NOT_COMPATIBLE" || !partial.criteria.matched.some(c=>c.code==="creditAmount")) return full;
  const remainingAmount = Math.round((requested-evaluatedAmount)*100)/100;
  const note = "Alternativa parcial preliminar: hasta $" + evaluatedAmount.toLocaleString("es-MX") + " MXN de $" + requested.toLocaleString("es-MX") + " MXN solicitados. Sujeta a aprobación y capacidad de pago conjunta.";
  return {...partial,status:"INSUFFICIENT_DATA",summary:note+" "+(partial.status==="COMPATIBLE" ? "Los criterios evaluados cumplen para ese importe; no implica aprobación." : partial.summary),
    reasons:[note,...partial.reasons],partialCoverage:{requestedAmount:requested,evaluatedAmount,remainingAmount}};
}

type Combination = { allocations: {institutionId:string; institutionName?:string; offerId:string; versionNumber:number; amount:number}[]; totalAmount:number; requestedAmount:number };

/** Indicative two-lender scenarios. No duplicate institutions, no unknown bounds,
 * and every allocation is evaluated again. Never establishes joint affordability. */
export function buildSimpleCombinations(application:ApplicationInput, offers:(OfferVersionInput & {institution?:any})[], rows:CatalogMatch[]):Combination[] {
  const requested=extractRequestedAmount(application.credit,application.client);
  if (requested===null || !Number.isSafeInteger(Math.round(requested*100))) return [];
  const client=capturedRecord(application.client),credit=capturedRecord(application.credit);
  const candidates=rows.filter(r=>r.status!=="NOT_COMPATIBLE" && r.institutionId!=="unknown").flatMap(row=>{
    const source=offers.find(o=>o.product?.id===row.offerId && o.version?.versionNumber===row.versionNumber &&
      matchesFinancingFamily(o.product,"simple") && isVersionEligibleForMatching(o.product,o.version,o.institution).eligible);
    if(!source)return [];
    const cond=offerConditions(source.version?.conditions||{},source.version?.requirements||{},client,credit);
    if(typeof cond.minAmount!=="number" || !Number.isFinite(cond.minAmount) || cond.minAmount<=0 ||
       typeof cond.maxAmount!=="number" || !Number.isFinite(cond.maxAmount) || cond.maxAmount<=0)return [];
    const min=Math.ceil(cond.minAmount*100),max=Math.floor(Math.min(cond.maxAmount,row.partialCoverage?.evaluatedAmount??requested)*100);
    if(min>max || !Number.isSafeInteger(min) || !Number.isSafeInteger(max))return [];
    return [{row,source,min,max}];
  });
  const target=Math.round(requested*100),result:Combination[]=[];
  for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
    const a=candidates[i],b=candidates[j];
    if(a.row.institutionId===b.row.institutionId || (!a.row.partialCoverage && !b.row.partialCoverage))continue;
    const lower=Math.max(a.min,target-b.max),upper=Math.min(a.max,target-b.min);
    if(lower>upper)continue;
    const aAmount=upper/100,bAmount=(target-upper)/100;
    const check=(x:typeof a,amount:number)=>{
      const evaluation=evaluateOfferCompatibility({client,credit:{...credit,amount}},x.source);
      return evaluation.status!=="NOT_COMPATIBLE" && evaluation.criteria.matched.some(c=>c.code==="creditAmount");
    };
    if(!check(a,aAmount)||!check(b,bAmount))continue;
    const allocation=(x:typeof a,amount:number)=>({institutionId:x.row.institutionId,institutionName:x.row.institutionName,offerId:x.row.offerId,versionNumber:x.row.versionNumber,amount});
    result.push({allocations:[allocation(a,aAmount),allocation(b,bAmount)],totalAmount:target/100,requestedAmount:requested});
    if(result.length>=5)return result;
  }
  return result;
}

function evaluateCatalog(application:ApplicationInput, offers:(OfferVersionInput & {institution?:any})[]) {
  const base=evaluateCatalogCompatibility(application,offers,{filterNonEligible:true});
  const all:CatalogMatch[]=base.all.map(full=>{
    const offer=offers.find(o=>o.product?.id===full.offerId && o.version?.versionNumber===full.versionNumber &&
      isVersionEligibleForMatching(o.product,o.version,o.institution).eligible);
    return offer ? evaluatePartialSimple(application,offer,full) : full;
  });
  return {...base,all,combinations:buildSimpleCombinations(application,offers,all),compatible:all.filter(r=>r.status==="COMPATIBLE"),
    insufficientData:all.filter(r=>r.status==="INSUFFICIENT_DATA"),notCompatible:all.filter(r=>r.status==="NOT_COMPATIBLE")};
}

export function publicMatch(item:CatalogMatch) {
  return {offerId:item.offerId,offerName:item.offerName,institutionId:item.institutionId,institutionName:item.institutionName,
    versionNumber:item.versionNumber,status:item.status,criteria:item.criteria,reasons:item.reasons,summary:item.summary,...(item.partialCoverage ? {partialCoverage:item.partialCoverage}: {})};
}
/** Shared catalogue path for preview and existing requests. No drafts, legacy parent rules or commissions. */
export async function matchPublishedCatalog(storage:IStorage, application:ApplicationInput, templateId?:string, financingFamily?:string) {
  if(storage.getPublishedInstitutionProductsForMatching) {
    const offers=await storage.getPublishedInstitutionProductsForMatching(templateId);
    const familyOffers = financingFamily ? offers.filter(o => matchesFinancingFamily(o.product, financingFamily)) : offers;
    return presentResult(evaluateCatalog(application,familyOffers));
  }
  const institutions=await storage.getFinancialInstitutions();
  const active=new Map(institutions.filter(i=>i.isActive!==false).map(i=>[i.id,i]));
  const offers=[];
  for(const product of await storage.getInstitutionProducts()) {
    const institution=active.get(product.institutionId);
    if(!institution || product.isActive===false || product.status!=="published" || (templateId && product.templateId!==templateId) || (financingFamily && !matchesFinancingFamily(product,financingFamily)))continue;
    for(const version of await storage.getInstitutionProductVersions(product.id)) {
      if((!product.currentVersionNumber || product.currentVersionNumber===version.versionNumber) && isVersionEligibleForMatching(product,version,institution).eligible)offers.push({product,version,institution});
    }
  }
  const result=evaluateCatalog(application,offers);
  return presentResult(result);
}
function presentResult(result: ReturnType<typeof evaluateCatalog>) {
  return {summary:{totalEvaluated:result.all.length,compatibleCount:result.compatible.length,insufficientDataCount:result.insufficientData.length,notCompatibleCount:result.notCompatible.length},
    compatible:result.compatible.map(publicMatch),insufficientData:result.insufficientData.map(publicMatch),notCompatible:result.notCompatible.map(publicMatch),combinations:result.combinations};
}
