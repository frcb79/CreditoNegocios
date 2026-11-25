import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { historicalCreditIntakeSchema, type HistoricalCreditIntake, historicalCreditReviewSchema, type HistoricalCreditReview } from "../shared/historicalCreditIntake";

const ENTITY="historical_credit_intake";
export class HistoricalIntakeError extends Error {
  constructor(public code:string,public status:number,message:string){super(message);}
}
const reject=(code:string,status:number,message:string):never=>{throw new HistoricalIntakeError(code,status,message);};

/** Immutable, admin-only evidence of a reported historical operation.
 * Deliberately NOT a Credit, verified disbursement, offer acceptance, commission or payout.
 * The separate reconciliation step must validate the historical commercial version and beneficiary.
 */
export async function recordHistoricalCreditIntake(pool:Pool,actorId:string,input:HistoricalCreditIntake) {
  const data=historicalCreditIntakeSchema.parse(input);
  const tx=await pool.connect();
  try {
    await tx.query("BEGIN");
    const actor=(await tx.query("SELECT role,is_active,status FROM public.users WHERE id=$1 FOR SHARE",[actorId])).rows[0];
    if(!actor || !["admin","super_admin"].includes(actor.role)||actor.is_active===false||actor.status==="suspended"||actor.status==="inactive")reject("HISTORICAL_ADMIN_REQUIRED",403,"Sólo Backoffice puede registrar la operación histórica.");
    // Serialize capture for the same lender, including duplicate checks across clients.
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["historical-intake:"+data.financialInstitutionId]);
    const client=(await tx.query("SELECT id,tenant_id,broker_id FROM public.clients WHERE id=$1 FOR SHARE",[data.clientId])).rows[0];
    if(!client||client.broker_id!==data.brokerId)reject("HISTORICAL_ORIGINATOR_MISMATCH",409,"El expediente y el originador no coinciden. Primero verifica la atribución comercial.");
    const advisor=(await tx.query("SELECT role FROM public.users WHERE id=$1 FOR SHARE",[data.brokerId])).rows[0];
    if(!advisor||!["broker","master_broker","admin","super_admin"].includes(advisor.role))reject("HISTORICAL_ORIGINATOR_INVALID",409,"Originador no verificable.");
    if(advisor.role==="master_broker" && data.historicalNetwork==="direct")reject("HISTORICAL_MASTER_DIRECT_MISMATCH",409,"Un Master originador debe identificarse como tal, no como broker directo.");
    const lender=(await tx.query("SELECT id FROM public.financial_institutions WHERE id=$1 FOR SHARE",[data.financialInstitutionId])).rows[0];
    const product=(await tx.query("SELECT id FROM public.product_templates WHERE id=$1 FOR SHARE",[data.productTemplateId])).rows[0];
    if(!lender||!product)reject("HISTORICAL_CATALOG_UNKNOWN",400,"Selecciona la financiera y familia de producto registradas.");
    const evidenceIds=Array.from(new Set([data.evidenceDocumentId,data.commissionEvidenceDocumentId].filter((v):v is string=>Boolean(v))));
    const docs=(await tx.query("SELECT id,client_id,credit_id,is_valid FROM public.documents WHERE id=ANY($1::varchar[]) FOR SHARE",[evidenceIds])).rows;
    if(docs.length!==evidenceIds.length||docs.some(d=>d.client_id!==data.clientId||d.is_valid===false||d.credit_id))reject("HISTORICAL_EVIDENCE_INVALID",409,"Selecciona documentos válidos del expediente, no vinculados a otro crédito.");
    const duplicate=(await tx.query("SELECT id FROM public.commercial_audit_logs WHERE entity_type=$1 AND action='reported' AND metadata->>'financialInstitutionId'=$2 AND metadata->>'externalReference'=$3 LIMIT 1",[ENTITY,data.financialInstitutionId,data.externalReference])).rows[0];
    if(duplicate)reject("HISTORICAL_REFERENCE_EXISTS",409,"La referencia de esa financiera ya está registrada para revisión.");
    // Do not create a second credit where an existing operation might already represent it.
    const possible=(await tx.query("SELECT id FROM public.credits WHERE client_id=$1 AND financial_institution_id=$2 AND amount=$3::numeric AND (start_date=$4::date OR start_date IS NULL) LIMIT 1",[data.clientId,data.financialInstitutionId,data.amount,data.actualDate])).rows[0];
    if(possible)reject("HISTORICAL_POSSIBLE_DUPLICATE",409,"Existe un crédito con datos coincidentes. Revisa su expediente antes de duplicarlo.");
    const entityId=randomUUID();
    await tx.query("INSERT INTO public.commercial_audit_logs (entity_type,entity_id,client_id,broker_id,performed_by,action,previous_state,new_state,metadata) VALUES ($1,$2,$3,$4,$5,'reported',NULL,'pending_reconciliation',$6::jsonb)",[ENTITY,entityId,data.clientId,data.brokerId,actorId,JSON.stringify({...data,tenantId:client.tenant_id,verification:"reported_not_verified",commissionEffect:"none",capturedAt:new Date().toISOString()})]);
    await tx.query("COMMIT");
    return {id:entityId,status:"pending_reconciliation",message:"Registro histórico recibido para conciliación. No se confirmó dispersión ni se generaron comisiones."};
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}

export async function listHistoricalCreditIntakes(pool:Pool,actorId:string) {
  const actor=(await pool.query("SELECT role,is_active,status FROM public.users WHERE id=$1",[actorId])).rows[0];
  if(!actor||!["admin","super_admin"].includes(actor.role)||actor.is_active===false||actor.status==="inactive"||actor.status==="suspended")reject("HISTORICAL_ADMIN_REQUIRED",403,"Sólo Backoffice.");
  const {rows}=await pool.query(`SELECT a.entity_id AS id,COALESCE(r.new_state,a.new_state) AS status,a.created_at AS "createdAt",
    r.metadata->>'creditId' AS "creditId",a.metadata->>'historicalNetwork' AS "historicalNetwork",a.metadata->>'historicalMasterName' AS "historicalMasterName",
    d.file_name AS "evidenceName",p.file_name AS "paymentEvidenceName",r.metadata->>'economicReconciliation' AS "economicReconciliation",
    a.metadata->>'externalReference' AS reference,a.metadata->>'actualDate' AS "actualDate",
    a.metadata->>'amount' AS amount,a.metadata->>'commissionStatus' AS "commissionStatus",
    COALESCE(c.business_name,concat_ws(' ',c.first_name,c.last_name)) AS "clientName",f.name AS "institutionName"
    FROM public.commercial_audit_logs a JOIN public.clients c ON c.id=a.client_id
    JOIN public.financial_institutions f ON f.id=a.metadata->>'financialInstitutionId'
    LEFT JOIN public.commercial_audit_logs r ON r.entity_type=a.entity_type AND r.entity_id=a.entity_id AND r.action='tracking_recorded'
    LEFT JOIN public.documents d ON d.id=a.metadata->>'evidenceDocumentId'
    LEFT JOIN public.documents p ON p.id=a.metadata->>'commissionEvidenceDocumentId'
    WHERE a.entity_type=$1 AND a.action='reported' ORDER BY a.created_at DESC LIMIT 100`,[ENTITY]);
  return rows;
}

export async function historicalMasterOptions(pool:Pool,actorId:string) {
  const actor=(await pool.query("SELECT role,is_active,status FROM public.users WHERE id=$1",[actorId])).rows[0];
  if(!actor||actor.role!=="super_admin"||actor.is_active===false||["inactive","suspended"].includes(actor.status))reject("HISTORICAL_REVIEW_REQUIRED",403,"Sólo Super Admin puede conciliar.");
  return (await pool.query("SELECT id,concat_ws(' ',first_name,last_name) AS name FROM public.users WHERE role='master_broker' ORDER BY first_name,last_name")).rows;
}

/** Verified tracking-only record, never a commission-bearing disbursement. */
export async function reconcileHistoricalCreditIntake(pool:Pool,actorId:string,intakeId:string,input:HistoricalCreditReview){
  const review=historicalCreditReviewSchema.parse(input);
  const tx=await pool.connect();
  try{
    await tx.query("BEGIN");
    const actor=(await tx.query("SELECT role,is_active,status FROM public.users WHERE id=$1 FOR SHARE",[actorId])).rows[0];
    if(!actor||actor.role!=="super_admin"||actor.is_active===false||["inactive","suspended"].includes(actor.status))reject("HISTORICAL_REVIEW_REQUIRED",403,"Sólo Super Admin puede conciliar.");
    const report=(await tx.query("SELECT * FROM public.commercial_audit_logs WHERE entity_type=$1 AND entity_id=$2 AND action='reported' FOR UPDATE",[ENTITY,intakeId])).rows[0];
    if(!report)reject("HISTORICAL_NOT_FOUND",404,"Registro histórico no encontrado.");
    const previous=(await tx.query("SELECT metadata FROM public.commercial_audit_logs WHERE entity_type=$1 AND entity_id=$2 AND action='tracking_recorded' LIMIT 1",[ENTITY,intakeId])).rows[0];
    if(previous){
      if(previous.metadata.originMasterBrokerId!==review.originMasterBrokerId)reject("HISTORICAL_ALREADY_RECORDED",409,"La atribución histórica ya quedó registrada y es inmutable.");
      await tx.query("COMMIT");return {id:intakeId,creditId:previous.metadata.creditId,alreadyRecorded:true,status:"historical_recorded"};
    }
    const {tenantId:_tenant,verification:_verification,commissionEffect:_effect,capturedAt:_captured,...reported}=report.metadata;
    const data=historicalCreditIntakeSchema.parse(reported);
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["historical-intake:"+data.financialInstitutionId]);
    const client=(await tx.query("SELECT id,tenant_id,broker_id FROM public.clients WHERE id=$1 FOR SHARE",[data.clientId])).rows[0];
    if(!client||client.broker_id!==report.broker_id||client.broker_id!==data.brokerId||client.tenant_id!==report.metadata.tenantId)reject("HISTORICAL_ORIGINATOR_MISMATCH",409,"Cambió la atribución del expediente. Revisa antes de conciliar.");
    const advisor=(await tx.query("SELECT id,role FROM public.users WHERE id=$1 FOR SHARE",[data.brokerId])).rows[0];
    if(!advisor||!["broker","master_broker","admin","super_admin"].includes(advisor.role))reject("HISTORICAL_ORIGINATOR_INVALID",409,"Originador no verificable.");
    if(review.historicalNetwork==="direct"&&advisor.role==="master_broker")reject("HISTORICAL_NETWORK_MISMATCH",409,"Un Master directo se atribuye a sí mismo.");
    if(review.historicalNetwork==="master"){
      const master=(await tx.query("SELECT id,role FROM public.users WHERE id=$1 FOR SHARE",[review.originMasterBrokerId])).rows[0];
      if(!master||master.role!=="master_broker"||(advisor.role==="master_broker"&&master.id!==advisor.id))reject("HISTORICAL_MASTER_INVALID",409,"Selecciona el Master histórico acreditado.");
    }
    const ids=Array.from(new Set([data.evidenceDocumentId,data.commissionEvidenceDocumentId].filter((v):v is string=>Boolean(v))));
    const docs=(await tx.query("SELECT id,client_id,credit_id,is_valid FROM public.documents WHERE id=ANY($1::varchar[]) FOR SHARE",[ids])).rows;
    if(docs.length!==ids.length||docs.some(d=>d.client_id!==data.clientId||d.is_valid===false||d.credit_id))reject("HISTORICAL_EVIDENCE_INVALID",409,"La evidencia ya no es válida o pertenece a otra operación.");
    const lender=(await tx.query("SELECT id FROM public.financial_institutions WHERE id=$1 FOR SHARE",[data.financialInstitutionId])).rows[0];
    const product=(await tx.query("SELECT id FROM public.product_templates WHERE id=$1 FOR SHARE",[data.productTemplateId])).rows[0];
    if(!lender||!product)reject("HISTORICAL_CATALOG_UNKNOWN",409,"No se localizó la financiera o producto original.");
    const possible=(await tx.query("SELECT id FROM public.credits WHERE client_id=$1 AND financial_institution_id=$2 AND amount=$3::numeric AND (start_date=$4::date OR start_date IS NULL) LIMIT 1",[data.clientId,data.financialInstitutionId,data.amount,data.actualDate])).rows[0];
    if(possible)reject("HISTORICAL_POSSIBLE_DUPLICATE",409,"Existe un crédito coincidente. Revisa antes de duplicar.");
    const creditId=randomUUID();
    await tx.query(`INSERT INTO public.credits(id,tenant_id,client_id,broker_id,created_by,financial_institution_id,product_template_id,amount,term,status,start_date,origin_master_broker_id,final_proposal)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9,'historical_recorded',$10::date,$11,$12::jsonb)`,
      [creditId,client.tenant_id,data.clientId,data.brokerId,report.performed_by,data.financialInstitutionId,data.productTemplateId,data.amount,data.termMonths,data.actualDate,review.originMasterBrokerId,JSON.stringify({historicalRecord:{intakeId,actualDate:data.actualDate,trackingOnly:true}})]);
    await tx.query("INSERT INTO public.commercial_audit_logs(entity_type,entity_id,client_id,broker_id,performed_by,action,previous_state,new_state,metadata) VALUES($1,$2,$3,$4,$5,'tracking_recorded','pending_reconciliation','historical_recorded',$6::jsonb)",
      [ENTITY,intakeId,data.clientId,data.brokerId,actorId,JSON.stringify({creditId,historicalNetwork:review.historicalNetwork,originMasterBrokerId:review.originMasterBrokerId,evidenceReviewed:true,reviewReason:review.reviewReason,commissionDisposition:data.commissionStatus,commissionEffect:"none",economicReconciliation:["pending","unknown"].includes(data.commissionStatus)?"pending":"reviewed_without_payment",reviewedAt:new Date().toISOString()})]);
    await tx.query("COMMIT");return {id:intakeId,creditId,alreadyRecorded:false,status:"historical_recorded"};
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
