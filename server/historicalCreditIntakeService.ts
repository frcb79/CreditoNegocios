import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { historicalCreditIntakeSchema, type HistoricalCreditIntake } from "../shared/historicalCreditIntake";

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
  const {rows}=await pool.query(`SELECT a.entity_id AS id,a.new_state AS status,a.created_at AS "createdAt",
    a.metadata->>'externalReference' AS reference,a.metadata->>'actualDate' AS "actualDate",
    a.metadata->>'amount' AS amount,a.metadata->>'commissionStatus' AS "commissionStatus",
    COALESCE(c.business_name,concat_ws(' ',c.first_name,c.last_name)) AS "clientName",f.name AS "institutionName"
    FROM public.commercial_audit_logs a JOIN public.clients c ON c.id=a.client_id
    JOIN public.financial_institutions f ON f.id=a.metadata->>'financialInstitutionId'
    WHERE a.entity_type=$1 AND a.action='reported' ORDER BY a.created_at DESC LIMIT 100`,[ENTITY]);
  return rows;
}
