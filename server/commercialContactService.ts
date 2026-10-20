/**
 * MVP: internal commercial outreach to a possible lender.
 * This records only an internal workflow state; it DOES NOT send personal data,
 * generate an institutional PDF, release documents or call a lender API.
 * External package disclosure remains separately protected by LEG-10.
 */
import { pool } from "./db";

export class CommercialContactError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
export async function startInternalCommercialContact(input:{
  targetId:string;reviewedBy:string;
}):Promise<{alreadyStarted:boolean}>{
  if(!input.targetId?.trim()||!input.reviewedBy?.trim())
    throw new CommercialContactError(400,"CONTACT_INPUT_INVALID","Falta referencia o responsable.");
  const conn=await pool.connect();
  try{
    await conn.query("BEGIN");
    const result=await conn.query(
      "SELECT t.id,t.status,t.is_winner,t.credit_id,s.id AS request_id,s.status AS request_status "+
      "FROM public.credit_submission_targets t "+
      "JOIN public.credit_submission_requests s ON s.id=t.request_id "+
      "WHERE t.id=$1 FOR UPDATE OF t,s",
      [input.targetId],
    );
    const row=result.rows[0];
    if(!row) throw new CommercialContactError(404,"TARGET_NOT_FOUND","Solicitud no encontrada.");
    if(row.is_winner||row.credit_id||["selected_winner","dispersed"].includes(row.status))
      throw new CommercialContactError(409,"TARGET_ALREADY_SELECTED","Esta propuesta está cerrada.");
    if(["cancelled","completed"].includes(row.request_status))
      throw new CommercialContactError(409,"REQUEST_CLOSED","La solicitud no permite nuevas gestiones.");
    if(row.status==="contact_initiated"){
      await conn.query("COMMIT");
      return {alreadyStarted:true};
    }
    if(row.status!=="approved")
      throw new CommercialContactError(409,"CONTACT_REQUIRES_APPROVAL",
        "Se necesita el visto bueno interno antes de iniciar la gestión.");
    await conn.query(
      "UPDATE public.credit_submission_targets SET status='contact_initiated',"+
      "reviewed_by=$2,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1",
      [input.targetId,input.reviewedBy],
    );
    // Keep an advanced parent workflow unchanged; only move older review
    // statuses forward. This is NOT a record of external file delivery.
    await conn.query(
      "UPDATE public.credit_submission_requests SET status='in_progress',updated_at=NOW() "+
      "WHERE id=$1 AND status IN ('pending_admin','approved','sent_to_institutions')",
      [row.request_id],
    );
    await conn.query("COMMIT");
    return {alreadyStarted:false};
  }catch(e){
    await conn.query("ROLLBACK").catch(()=>{});
    throw e;
  }finally{conn.release();}
}
