import type { IStorage } from "../storage";
import { evaluateCatalogCompatibility, isVersionEligibleForMatching, type ApplicationInput, type CompatibilityResult } from "./compatibilityEvaluator";

export function publicMatch(item:CompatibilityResult) {
  return {offerId:item.offerId,offerName:item.offerName,institutionId:item.institutionId,institutionName:item.institutionName,
    versionNumber:item.versionNumber,status:item.status,criteria:item.criteria,reasons:item.reasons,summary:item.summary};
}
/** Shared catalogue path for preview and existing requests. No drafts, legacy parent rules or commissions. */
export async function matchPublishedCatalog(storage:IStorage, application:ApplicationInput, templateId?:string) {
  if(storage.getPublishedInstitutionProductsForMatching) {
    const offers=await storage.getPublishedInstitutionProductsForMatching(templateId);
    return presentResult(evaluateCatalogCompatibility(application,offers,{filterNonEligible:true}));
  }
  const institutions=await storage.getFinancialInstitutions();
  const active=new Map(institutions.filter(i=>i.isActive!==false).map(i=>[i.id,i]));
  const offers=[];
  for(const product of await storage.getInstitutionProducts()) {
    const institution=active.get(product.institutionId);
    if(!institution || product.isActive===false || product.status!=="published" || (templateId && product.templateId!==templateId))continue;
    for(const version of await storage.getInstitutionProductVersions(product.id)) {
      if((!product.currentVersionNumber || product.currentVersionNumber===version.versionNumber) && isVersionEligibleForMatching(product,version,institution).eligible)offers.push({product,version,institution});
    }
  }
  const result=evaluateCatalogCompatibility(application,offers,{filterNonEligible:true});
  return presentResult(result);
}
function presentResult(result: ReturnType<typeof evaluateCatalogCompatibility>) {
  return {summary:{totalEvaluated:result.all.length,compatibleCount:result.compatible.length,insufficientDataCount:result.insufficientData.length,notCompatibleCount:result.notCompatible.length},
    compatible:result.compatible.map(publicMatch),insufficientData:result.insufficientData.map(publicMatch),notCompatible:result.notCompatible.map(publicMatch)};
}
