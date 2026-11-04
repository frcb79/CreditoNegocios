import type { Pool } from "pg";
import { storage } from "./storage";
import { matchPublishedCatalog } from "./matching/catalog";
import { requireModuleAndAction } from "./middleware/rbacMiddleware";
import { canViewCreditByOrigin, canEditCreditByOrigin } from "./dashboardVisibility";
import { isVersionEligibleForMatching } from "./matching/compatibilityEvaluator";

// Staging-only QA is read-only. Fake applications remain in process memory.
async function checkRole(role:string, moduleId:string, action:string, expected:number) {
  const middleware=requireModuleAndAction(moduleId,action);
  let status=0, allowed=0;
  const request:any=role==="unauthenticated"?{}:{dbUser:{id:"qa-in-memory",role}};
  const response:any={status(n:number){status=n;return this},json(_value:any){return this}};
  await middleware(request,response,()=>{allowed++});
  return expected===200 ? allowed===1 && status===0 : allowed===0 && status===expected;
}
export async function runStagingReadOnlyQA(pool:Pool):Promise<void>{
  if(process.env.RAILWAY_ENVIRONMENT_NAME!=="staging" ||
     process.env.RAILWAY_ENVIRONMENT_ID!=="e3134695-aaec-41e2-8622-41e3701ed985")return;
  if(process.env.STAGING_AUDIT_CATALOG!=="true")return;
  const templates=(await pool.query(
    "SELECT t.id,t.name,t.category,t.is_active,t.target_profiles, "+
    "md5(coalesce(t.available_variables,'null'::jsonb)::text) variables_hash, "+
    "md5(coalesce(t.base_configuration,'null'::jsonb)::text) configuration_hash, "+
    "(SELECT count(*)::int FROM public.institution_products p WHERE p.template_id=t.id) linked_offers "+
    "FROM public.product_templates t ORDER BY lower(t.name),t.id"
  )).rows;
  const variables=(await pool.query(
    "SELECT id,name,display_name,category,data_type,is_active, "+
    "md5(coalesce(options,'null'::jsonb)::text) options_hash "+
    "FROM public.product_variables ORDER BY lower(name),id"
  )).rows;
  const canonical=(await pool.query(
    "SELECT p.id,p.name,p.product_type,p.template_id,p.current_version_number, "+
    "t.name template_name,t.category template_category,t.is_active template_active, "+
    "i.name institution_name,v.status current_version_status "+
    "FROM public.institution_products p "+
    "JOIN public.financial_institutions i ON p.institution_id=i.id "+
    "LEFT JOIN public.product_templates t ON p.template_id=t.id "+
    "LEFT JOIN public.institution_product_versions v ON v.institution_product_id=p.id "+
    "AND v.version_number=p.current_version_number "+
    "WHERE p.status='published' "+
    "ORDER BY lower(i.name),lower(coalesce(p.name,p.custom_name,'')),p.id"
  )).rows;
  for(const t of templates)console.info("[STAGING-TEMPLATE] "+JSON.stringify(t));
  for(const v of variables)console.info("[STAGING-VARIABLE] "+JSON.stringify(v));
  for(const p of canonical)console.info("[STAGING-TEMPLATE-LINK] "+JSON.stringify({
    id:p.id,institution:p.institution_name,offer:p.name,type:p.product_type,
    template:p.template_name,templateId:p.template_id,templateCategory:p.template_category,
    templateActive:p.template_active,versionStatus:p.current_version_status,
    versionNumber:p.current_version_number
  }));
  const linkedOffers=await storage.getPublishedInstitutionProductsForMatching!();
  const eligible=linkedOffers.filter(x=>isVersionEligibleForMatching(x.product,x.version,x.institution).eligible);
  const empty=await matchPublishedCatalog(storage,{client:{},credit:{}});
  const synthetic=await matchPublishedCatalog(storage,{
    client:{type:"persona_moral",yearsInBusiness:5,ingresoMensualPromedio:1000000},
    credit:{amount:1000000,term:36}
  });
  const roleCases:Array<[string,string,string,number]>=[
    ["unauthenticated","creditos","view",401],
    ["super_admin","configuracion","manage_users",200],
    ["admin","creditos","view",200],
    ["admin","creditos","approve_disperse",200],
    ["master_broker","creditos","view",200],
    ["master_broker","comisiones","manage_commissions",200],
    ["master_broker","creditos","approve_disperse",403],
    ["broker","creditos","view",200],
    ["broker","comisiones","manage_commissions",403],
    ["broker","usuarios","manage_users",403],
    ["broker","importacion","view",403]
  ];
  const failedRoles:string[]=[];
  for(const [role,module,action,expected] of roleCases) {
    if(!await checkRole(role,module,action,expected))failedRoles.push(role+"/"+module+"/"+action);
  }
  const record={brokerId:"qa-owner",originMasterBrokerId:"qa-original-master"};
  const originChecks={
    brokerOwnerAllowed:canViewCreditByOrigin({id:"qa-owner",role:"broker"},record),
    differentBrokerDenied:!canViewCreditByOrigin({id:"qa-other",role:"broker"},record),
    historicalMasterAllowed:canViewCreditByOrigin({id:"qa-original-master",role:"master_broker"},record),
    unrelatedMasterDenied:!canViewCreditByOrigin({id:"qa-new-master",role:"master_broker"},record),
    masterCannotEditBroker:!canEditCreditByOrigin({id:"qa-original-master",role:"master_broker"},record),
    adminCanView:canViewCreditByOrigin({id:"qa-admin",role:"admin"},record)
  };
  const errors={
    missingTemplates:canonical.filter(x=>!x.template_id||!x.template_name).length,
    inactiveTemplates:canonical.filter(x=>x.template_active===false).length,
    missingPublishedVersions:canonical.filter(x=>x.current_version_status!=="published").length,
    duplicateTemplateNames:templates.length-new Set(templates.map(x=>String(x.name).toLowerCase().trim())).size,
    duplicateVariableNames:variables.length-new Set(variables.map(x=>String(x.name).toLowerCase().trim())).size
  };
  const report={
    count:{templates:templates.length,variables:variables.length,publishedOffers:canonical.length,
      matchingSelector:linkedOffers.length,currentEligible:eligible.length},
    errors,emptyInput:empty.summary,syntheticInput:synthetic.summary,
    roleChecks:{total:roleCases.length,failed:failedRoles},
    originChecks:{total:Object.keys(originChecks).length,failed:Object.keys(originChecks).filter(
      k=>!originChecks[k as keyof typeof originChecks])}
  };
  console.info("[STAGING-FUNCTIONAL-QA] "+JSON.stringify(report));
  if(Object.values(errors).some(n=>n>0)||failedRoles.length||report.originChecks.failed.length||
     linkedOffers.length!==canonical.length||empty.summary.totalEvaluated!==eligible.length) {
    console.warn("[STAGING-FUNCTIONAL-QA-REVIEW] Read-only assertions need review.");
  }
}
