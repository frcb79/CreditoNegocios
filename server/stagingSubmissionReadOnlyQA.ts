/**
 * Staging-only, read-only validation on existing staging test submissions.
 * No customer fields, amounts, IDs or client information are logged.
 */
import type { Pool } from "pg";
import { storage } from "./storage";
import { matchPublishedCatalog } from "./matching/catalog";
import { canViewSubmissionByOrigin } from "./dashboardVisibility";

export async function validateStageSubmissionsReadOnly(pool:Pool):Promise<void> {
  if(process.env.STAGING_AUDIT_SUBMISSIONS!=="true")return;
  if(process.env.RAILWAY_ENVIRONMENT_NAME!=="staging"||
     process.env.RAILWAY_ENVIRONMENT_ID!=="e3134695-aaec-41e2-8622-41e3701ed985"||
     new URL(process.env.DATABASE_URL||"postgresql://invalid").hostname!=="postgres.railway.internal")
    throw Error("STAGING_SUBMISSIONS_QA_ENVIRONMENT_GUARD");
  const submissions=(await pool.query(
    "SELECT id,client_id,broker_id,origin_master_broker_id,tenant_id,product_template_id, "+
    "requested_amount,mortgage_data FROM public.credit_submission_requests ORDER BY id LIMIT 101"
  )).rows;
  const clients=(await pool.query("SELECT * FROM public.clients")).rows;
  const cMap=new Map(clients.map(c=>[c.id,c]));
  if(submissions.length>100)throw Error("STAGING_SUBMISSIONS_QA_TOO_MANY_REQUESTS");
  let matches=0,missingClients=0,withoutOffers=0,passes=0,incomplete=0,rejects=0;
  let ownerAllowed=0,differentBrokerDenied=0,historicalMasterAllowed=0,unrelatedMasterDenied=0;
  const errors:string[]=[];
  for(const sub of submissions) {
    try {
      const c=cMap.get(sub.client_id);
      if(!c){missingClients++;continue}
      const owner={id:sub.broker_id,role:"broker"};
      if(canViewSubmissionByOrigin(owner,{brokerId:sub.broker_id,originMasterBrokerId:sub.origin_master_broker_id}))ownerAllowed++;
      if(!canViewSubmissionByOrigin({id:"staging-qa-unrelated-broker",role:"broker"},
        {brokerId:sub.broker_id,originMasterBrokerId:sub.origin_master_broker_id}))differentBrokerDenied++;
      if(sub.origin_master_broker_id &&
         canViewSubmissionByOrigin({id:sub.origin_master_broker_id,role:"master_broker"},
         {brokerId:sub.broker_id,originMasterBrokerId:sub.origin_master_broker_id}))historicalMasterAllowed++;
      if(!canViewSubmissionByOrigin({id:"staging-qa-unrelated-master",role:"master_broker"},
        {brokerId:sub.broker_id,originMasterBrokerId:sub.origin_master_broker_id}))unrelatedMasterDenied++;
      const client={
        ...c,profilingData:c.profiling_data,yearsInBusiness:c.years_in_business,
        ingresoMensualPromedio:c.ingreso_mensual_promedio,ingresoAnual:c.ingreso_anual,
        buroEmpresa:c.buro_empresa,buroAccionistaPrincipal:c.buro_accionista_principal,
        garantias:c.garantias,garantors:c.guarantors
      };
      const credit={amount:Number(sub.requested_amount),
        requestedAmount:Number(sub.requested_amount),mortgageData:sub.mortgage_data};
      const scope=sub.product_template_id||undefined;
      const expected=(await storage.getPublishedInstitutionProductsForMatching!(scope)).length;
      const found=await matchPublishedCatalog(storage,{credit,client},scope);
      if(found.summary.totalEvaluated!==expected)throw Error("MATCH_SELECTOR_DISAGREEMENT");
      const count=found.summary.compatibleCount+found.summary.insufficientDataCount+found.summary.notCompatibleCount;
      if(count!==expected)throw Error("MATCH_THREE_STATUS_INCONSISTENCY");
      if(expected===0)withoutOffers++;
      matches++;passes+=found.summary.compatibleCount;
      incomplete+=found.summary.insufficientDataCount;
      rejects+=found.summary.notCompatibleCount;
    }catch(err){
      errors.push(err instanceof Error?err.message:"unknown");
    }
  }
  // Aggregate template linkage only. Do not print applicant information, IDs,
  // amounts or any credit/application contents.
  const templateGroups=(await pool.query(
    "SELECT coalesce(t.name,'<Sin plantilla>') template, "+
    "count(*)::int requests, coalesce(t.is_active,false) active, "+
    "(SELECT count(*)::int FROM public.institution_products op "+
    "JOIN public.institution_product_versions ov ON ov.institution_product_id=op.id "+
    " AND ov.version_number=op.current_version_number "+
    "WHERE op.template_id=r.product_template_id AND op.status='published' "+
    " AND ov.status='published' AND op.is_active IS DISTINCT FROM false) published_offers "+
    "FROM public.credit_submission_requests r "+
    "LEFT JOIN public.product_templates t ON t.id=r.product_template_id "+
    "GROUP BY r.product_template_id,t.name,t.is_active ORDER BY count(*) DESC"
  )).rows;
  console.info("[STAGING-SUBMISSION-TEMPLATE-GROUPS] "+JSON.stringify(templateGroups));
  const report={totalSubmissions:submissions.length,checked:matches,missingClients,
    withoutPublishedTemplateOffers:withoutOffers,matchClassifications:{
      compatible:passes,insufficient:incomplete,incompatible:rejects},
    originAssertions:{ownerAllowed,differentBrokerDenied,historicalMasterAllowed,unrelatedMasterDenied},
    failures:errors.length,issueTypes:[...new Set(errors)]};
  console.info("[STAGING-SUBMISSION-QA] "+JSON.stringify(report));
  if(errors.length||missingClients||ownerAllowed!==submissions.length||
     differentBrokerDenied!==submissions.length||unrelatedMasterDenied!==submissions.length)
    console.warn("[STAGING-SUBMISSION-QA-REVIEW] Non-destructive validation requires attention.");
}
