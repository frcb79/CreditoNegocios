/**
 * LEG-10 — client-only authorization, separate from the Broker's commercial
 * convenio.  PostgreSQL evidence is append-only and bound to one exact target.
 * This service does NOT publish legal text or automatically deliver a file.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { pool } from "./db";
import type { PoolClient } from "pg";
import { assertTargetReviewMutable } from "./targetReviewTransitions";
import { readFrozenOfferLineage } from "./offerLineageService";
import { generateOtpCode, getFormalizationOtpSecret } from "./legalDocuments";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const otpHash = (challenge: string, code: string) =>
  createHmac("sha256", getFormalizationOtpSecret()).update("client-consent:" + challenge + ":" + code).digest("hex");

export class ClientConsentError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
function deny(status: number, code: string, message: string): never {
  throw new ClientConsentError(status, code, message);
}
const validToken = (token: string): boolean => /^[a-f0-9]{64}$/.test(token || "");
function ensureEmail(value: string) {
  if (!value || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    deny(409, "CLIENT_SIGNER_EMAIL_REQUIRED", "El cliente o representante debe tener un correo verificable registrado.");
  }
}
export type ClientConsentRequest = {
  tenantId: string; clientId: string; targetId: string; institutionId: string;
  institutionName: string; clientName: string; signerName: string;
  signerEmail: string; signerCapacity: "client" | "legal_representative";
  requestedBy: string;
};
export async function startClientConsent(input: ClientConsentRequest) {
  ensureEmail(input.signerEmail);
  if (!input.tenantId || !input.clientId || !input.targetId || !input.institutionId ||
      !input.institutionName || !input.clientName || !input.signerName) {
    deny(409, "CLIENT_CONSENT_SCOPE_INCOMPLETE", "Falta información del cliente, firmante o financiera.");
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))",["leg10-"+input.targetId]);
    const recent=await db.query(
      "SELECT COUNT(*)::integer AS total FROM public.client_consent_challenges "+
      "WHERE target_id=$1 AND created_at >= NOW()-INTERVAL '1 hour'",[input.targetId],
    );
    if(Number(recent.rows[0]?.total||0)>=5)
      deny(429,"CLIENT_CONSENT_REQUEST_LIMIT","Se alcanzó el límite de solicitudes para esta financiera.");
    const legal = await db.query(
      "SELECT id, content, content_sha256 FROM public.client_consent_document_versions " +
      "WHERE status='published' AND effective_at <= NOW() ORDER BY effective_at DESC LIMIT 1",
    );
    const doc = legal.rows[0];
    if (!doc?.content || !doc.content_sha256 || sha(doc.content) !== doc.content_sha256) {
      deny(409, "CLIENT_CONSENT_LEGAL_PENDING",
        "Todavía no hay una autorización del cliente jurídicamente aprobada y publicada.");
    }
    const clean=(v:string)=>v.replace(/[\r\n\t]+/g," ").trim().slice(0,250);
    const snapshot = doc.content.trim() + "\n\nDATOS ESPECÍFICOS DE ESTA AUTORIZACIÓN\n" +
      "Titular del expediente: " + clean(input.clientName) + "\n" +
      "Firmante: " + clean(input.signerName) + "\n" +
      "Carácter: " + (input.signerCapacity === "client" ? "Cliente titular" : "Representante legal de persona moral") + "\n" +
      "Financiera destinataria: " + clean(input.institutionName) + "\n" +
      "Finalidad: compartir este expediente únicamente con la financiera indicada para evaluar el financiamiento.\n" +
      "Referencia de solicitud: " + input.targetId + "\n" +
      "Esta autorización no habilita consultas de Buró de Crédito o SAT desde Crédito Negocios.";
    const rawToken = randomBytes(32).toString("hex");
    await db.query(
      "UPDATE public.client_consent_challenges SET status='invalidated',updated_at=NOW() " +
      "WHERE target_id=$1 AND status='pending'", [input.targetId],
    );
    const created = await db.query(
      "INSERT INTO public.client_consent_challenges " +
      "(tenant_id,client_id,target_id,institution_id,document_version_id," +
      "exact_document_content,exact_document_sha256,purpose,signer_name,signer_email," +
      "signer_capacity,representation_review_status,requested_by,token_hash,token_expires_at)" +
      " VALUES($1,$2,$3,$4,$5,$6,$7,'financial_institution_submission',$8,$9,$10,$11,$12,$13," +
      "NOW()+INTERVAL '48 hours') RETURNING id,token_expires_at",
      [input.tenantId,input.clientId,input.targetId,input.institutionId,doc.id,
       snapshot,sha(snapshot),clean(input.signerName),input.signerEmail.toLowerCase(),
       input.signerCapacity,input.signerCapacity === "legal_representative" ? "pending" : "not_applicable",
       input.requestedBy,sha(rawToken)],
    );
    await db.query("COMMIT");
    return { id: created.rows[0].id as string, token: rawToken,
      signerEmail: input.signerEmail, expiresAt: created.rows[0].token_expires_at as Date };
  } catch(e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { db.release(); }
}
export async function invalidateConsentRequest(id: string) {
  await pool.query("UPDATE public.client_consent_challenges SET status='invalidated',updated_at=NOW() " +
    "WHERE id=$1 AND status='pending'", [id]);
}
export async function invalidateConsentOtp(id:string) {
  await pool.query("UPDATE public.client_consent_challenges SET otp_hash=NULL,otp_expires_at=NULL " +
    "WHERE id=$1", [id]);
}
export async function inspectConsentLink(token: string) {
  if (!validToken(token)) deny(404,"CLIENT_CONSENT_LINK_INVALID","Enlace inválido o expirado.");
  const rows = await pool.query(
    "SELECT id,signer_name,signer_capacity,exact_document_content,exact_document_sha256," +
    "token_expires_at,status FROM public.client_consent_challenges WHERE token_hash=$1",
    [sha(token)],
  );
  const r = rows.rows[0];
  if (!r || sha(r.exact_document_content) !== r.exact_document_sha256) {
    deny(404,"CLIENT_CONSENT_LINK_INVALID","Enlace inválido o expirado.");
  }
  if (r.status === "verified") {
    const v=await pool.query(
      "SELECT v.id AS revoked FROM public.client_consent_evidences e " +
      "LEFT JOIN public.client_consent_revocations v ON v.evidence_id=e.id " +
      "WHERE e.challenge_id=$1",[r.id],
    );
    // An expired signer link may still start a FRESH email OTP for revocation;
    // do not reveal the old signed document or identity after its read TTL.
    const expired = new Date(r.token_expires_at).getTime() <= Date.now();
    return {signerName:expired?"":r.signer_name as string,
      signerCapacity:expired?"":r.signer_capacity as string,
      expiresAt:r.token_expires_at as Date,signed:true,
      revoked:Boolean(v.rows[0]?.revoked),linkExpired:expired};
  }
  if(r.status !== "pending" || new Date(r.token_expires_at).getTime() <= Date.now())
    deny(404,"CLIENT_CONSENT_LINK_INVALID","Enlace no vigente.");
  return { signerName:r.signer_name as string, signerCapacity:r.signer_capacity as string,
    document:r.exact_document_content as string, expiresAt:r.token_expires_at as Date,
    signed:false,revoked:false };
}
export async function prepareConsentOtp(token: string) {
  if (!validToken(token)) deny(404,"CLIENT_CONSENT_LINK_INVALID","Enlace inválido.");
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const rows = await db.query("SELECT * FROM public.client_consent_challenges WHERE token_hash=$1 FOR UPDATE",[sha(token)]);
    const c = rows.rows[0];
    if (!c || c.status !== "pending" || new Date(c.token_expires_at).getTime() <= Date.now()) {
      deny(404,"CLIENT_CONSENT_LINK_INVALID","Enlace inválido o expirado.");
    }
    if (c.otp_request_count >= 5) deny(429,"CLIENT_CONSENT_OTP_LIMIT","Se alcanzó el máximo de códigos de verificación.");
    if (c.otp_resend_after && new Date(c.otp_resend_after).getTime() > Date.now()) {
      deny(429,"CLIENT_CONSENT_OTP_COOLDOWN","Debes esperar antes de solicitar otro código.");
    }
    const code = generateOtpCode();
    const result = await db.query(
      "UPDATE public.client_consent_challenges " +
      "SET otp_hash=$2,otp_expires_at=NOW()+INTERVAL '10 minutes',otp_attempts=0," +
      "otp_request_count=otp_request_count+1,otp_requested_at=NOW()," +
      "otp_resend_after=NOW()+INTERVAL '60 seconds',updated_at=NOW() " +
      "WHERE id=$1 RETURNING otp_expires_at",
      [c.id,otpHash(c.id,code)],
    );
    await db.query("COMMIT");
    return {id:c.id as string,to:c.signer_email as string,name:c.signer_name as string,
      code,expiresAt:result.rows[0].otp_expires_at as Date};
  } catch(e) {
    await db.query("ROLLBACK").catch(()=>{});
    throw e;
  } finally { db.release(); }
}
export async function verifyConsentOtp(input: {
  token:string;code:string;confirmed:boolean;ip:string|null;userAgent:string;
}) {
  if (!input.confirmed) deny(400,"CLIENT_CONSENT_NOT_CONFIRMED","Debes aceptar expresamente el documento.");
  if (!validToken(input.token) || !/^\d{6}$/.test(input.code)) {
    deny(400,"CLIENT_CONSENT_OTP_INVALID","Código de verificación inválido.");
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const rr = await db.query("SELECT * FROM public.client_consent_challenges WHERE token_hash=$1 FOR UPDATE",
      [sha(input.token)]);
    const c = rr.rows[0];
    if (!c || c.status !== "pending" || new Date(c.token_expires_at).getTime() <= Date.now())
      deny(404,"CLIENT_CONSENT_LINK_INVALID","El enlace no está vigente.");
    if (!c.otp_hash || !c.otp_expires_at || new Date(c.otp_expires_at).getTime() <= Date.now())
      deny(409,"CLIENT_CONSENT_OTP_EXPIRED","Solicita un nuevo código de verificación.");
    if (c.otp_attempts >= c.otp_max_attempts)
      deny(429,"CLIENT_CONSENT_OTP_LOCKED","Se excedió el límite de intentos.");
    const supplied = Buffer.from(otpHash(c.id,input.code),"hex");
    const expected = Buffer.from(c.otp_hash,"hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) {
      await db.query("UPDATE public.client_consent_challenges " +
        "SET otp_attempts=otp_attempts+1,updated_at=NOW() WHERE id=$1",[c.id]);
      await db.query("COMMIT");
      return {success:false as const,code:"CLIENT_CONSENT_OTP_INCORRECT"};
    }
    const doc = await db.query("SELECT * FROM public.client_consent_document_versions " +
      "WHERE id=$1 AND status='published' AND effective_at <= NOW() " +
      "AND id=(SELECT id FROM public.client_consent_document_versions WHERE status='published' " +
      "AND effective_at <= NOW() ORDER BY effective_at DESC LIMIT 1)",[c.document_version_id]);
    if (!doc.rows[0] || sha(doc.rows[0].content) !== doc.rows[0].content_sha256 ||
        sha(c.exact_document_content) !== c.exact_document_sha256) {
      deny(409,"CLIENT_CONSENT_DOCUMENT_INVALID","La versión del documento no pudo verificarse.");
    }
    const evidence = await db.query(
      "INSERT INTO public.client_consent_evidences " +
      "(challenge_id,tenant_id,client_id,target_id,institution_id,document_version_id," +
      "purpose,signer_name,signer_email,signer_capacity,representation_review_status," +
      "exact_document_content,exact_document_sha256,accepted_at,accepted_ip,accepted_user_agent) " +
      "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),$14,$15) RETURNING id,accepted_at",
      [c.id,c.tenant_id,c.client_id,c.target_id,c.institution_id,c.document_version_id,
       c.purpose,c.signer_name,c.signer_email,c.signer_capacity,c.representation_review_status,
       c.exact_document_content,c.exact_document_sha256,input.ip,input.userAgent],
    );
    await db.query("UPDATE public.client_consent_challenges SET status='verified',updated_at=NOW() WHERE id=$1",[c.id]);
    await db.query("COMMIT");
    return {success:true as const,evidenceId:evidence.rows[0].id as string,
      acceptedAt:evidence.rows[0].accepted_at as Date,
      representationPending:c.signer_capacity === "legal_representative"};
  } catch(e) {
    await db.query("ROLLBACK").catch(()=>{});
    throw e;
  } finally {db.release();}
}
export async function hasValidClientConsent(scope: {
  tenantId:string;clientId:string;targetId:string;institutionId:string;
}, conn?:PoolClient):Promise<boolean> {
  if (!scope.tenantId || !scope.clientId || !scope.targetId || !scope.institutionId) return false;
  try {
    const rows = await (conn || pool).query(
      "SELECT e.exact_document_content,e.exact_document_sha256,d.content,d.content_sha256," +
      "e.signer_capacity,rep.result AS representation_review_status,r.id AS revocation_id " +
      "FROM public.client_consent_evidences e " +
      "LEFT JOIN public.client_consent_representation_reviews rep ON rep.evidence_id=e.id " +
      "JOIN public.client_consent_document_versions d ON d.id=e.document_version_id " +
      "LEFT JOIN public.client_consent_revocations r ON r.evidence_id=e.id " +
      "WHERE e.tenant_id=$1 AND e.client_id=$2 AND e.target_id=$3 AND e.institution_id=$4 " +
      "AND e.purpose='financial_institution_submission' AND d.status='published' " +
      "AND d.effective_at <= NOW() " +
      "AND d.id=(SELECT id FROM public.client_consent_document_versions " +
      "WHERE status='published' AND effective_at <= NOW() ORDER BY effective_at DESC LIMIT 1) " +
      "ORDER BY e.accepted_at DESC, e.id DESC LIMIT 1",
      [scope.tenantId,scope.clientId,scope.targetId,scope.institutionId],
    );
    const e=rows.rows[0];
    return Boolean(e && !e.revocation_id && sha(e.content)===e.content_sha256 &&
      sha(e.exact_document_content)===e.exact_document_sha256 &&
      (e.signer_capacity==="client" ||
       (e.signer_capacity==="legal_representative" && e.representation_review_status==="verified")));
  } catch { return false; }
}



/** A sent transition is a single serialization point against OTP revocation.
 * The previous route precheck is only informational; this transaction performs
 * a new check under the target row lock before changing either status. */
export async function markTargetSentWithClientConsent(input:{
  targetId:string;requestId:string;clientId:string;tenantId:string;
  institutionId:string;reviewedBy:string;
}):Promise<void>{
  if(process.env.CLIENT_CONSENT_RELEASE_APPROVED!=="true")
    deny(409,"CLIENT_CONSENT_REQUIRED","La autorización del cliente aún no está habilitada.");
  if(Object.values(input).some(v=>typeof v!=="string"||!v.trim()))
    deny(409,"CLIENT_CONSENT_SCOPE_INCOMPLETE","El alcance del envío está incompleto.");
  const conn=await pool.connect();
  try{
    await conn.query("BEGIN");
    const locked=await conn.query(
      "SELECT t.id,t.request_id,t.financial_institution_id,t.status,t.is_winner,t.credit_id,"+
      "t.institution_proposal,t.institution_product_id,t.version_number,"+
      "s.client_id,s.tenant_id,s.status AS request_status,c.tenant_id AS client_tenant_id "+
      "FROM public.credit_submission_targets t "+
      "JOIN public.credit_submission_requests s ON s.id=t.request_id "+
      "JOIN public.clients c ON c.id=s.client_id "+
      "WHERE t.id=$1 FOR UPDATE OF t,s",[input.targetId],
    );
    const row=locked.rows[0];
    if(!row) deny(404,"TARGET_NOT_FOUND","Propuesta no encontrada.");
    assertTargetReviewMutable({status:row.status,isWinner:row.is_winner,creditId:row.credit_id});
    if(row.request_id!==input.requestId||row.client_id!==input.clientId||
       row.financial_institution_id!==input.institutionId||
       row.tenant_id!==input.tenantId||row.client_tenant_id!==input.tenantId)
      deny(409,"CLIENT_CONSENT_SCOPE_MISMATCH","El cliente o destinatario ya no corresponde.");
    // Preserve DbStorage's version/lineage guard that the old status writer
    // performed; never send a target whose snapshot contradicts saved IDs.
    const frozen=readFrozenOfferLineage(row.institution_proposal);
    const persisted=row.institution_product_id||row.version_number!=null
      ?readFrozenOfferLineage({institutionProductId:row.institution_product_id,
        versionNumber:row.version_number}):null;
    if(persisted&&(!frozen||persisted.institutionProductId!==frozen.institutionProductId||
      persisted.versionNumber!==frozen.versionNumber))
      deny(409,"OFFER_VERSION_IDENTITY_MISMATCH","La versión financiera del expediente no coincide.");
    if(row.status==="sent"||["completed","cancelled"].includes(row.request_status))
      deny(409,"TARGET_STATUS_INELIGIBLE","La solicitud ya no permite un nuevo envío.");
    if(!await hasValidClientConsent({
      tenantId:input.tenantId,clientId:input.clientId,targetId:input.targetId,
      institutionId:input.institutionId,
    },conn)) deny(409,"CLIENT_CONSENT_REQUIRED","Se requiere autorización vigente.");
    await conn.query(
      "UPDATE public.credit_submission_targets SET status='sent',reviewed_by=$2,"+
      "reviewed_at=NOW(),updated_at=NOW(),institution_product_id=$3,version_number=$4 WHERE id=$1",
      [input.targetId,input.reviewedBy,frozen?.institutionProductId??null,frozen?.versionNumber??null],
    );
    await conn.query(
      "UPDATE public.credit_submission_requests SET status='sent_to_institutions',"+
      "updated_at=NOW() WHERE id=$1",[input.requestId],
    );
    await conn.query("COMMIT");
  }catch(e){
    await conn.query("ROLLBACK").catch(()=>{});
    throw e;
  }finally{conn.release();}
}

/** Read-only, minimal review metadata for authorized Super Admin only.
 * Do not return link tokens, OTP data, IP, browser fingerprints or raw document content. */
export async function listClientConsentEvidenceForTarget(scope:{
  tenantId:string;clientId:string;targetId:string;institutionId:string;
}){
  if(!scope.tenantId||!scope.clientId||!scope.targetId||!scope.institutionId)
    deny(409,"CLIENT_CONSENT_SCOPE_INCOMPLETE","No es posible comprobar el alcance de esta solicitud.");
  const result=await pool.query(
    "SELECT e.id, e.signer_name AS \"signerName\",e.signer_capacity AS \"signerCapacity\", "+
    "e.accepted_at AS \"acceptedAt\",d.version AS \"legalVersion\", "+
    "rep.result AS \"representationReview\", "+
    "CASE WHEN rev.id IS NULL THEN false ELSE true END AS \"revoked\" "+
    "FROM public.client_consent_evidences e "+
    "JOIN public.client_consent_document_versions d ON d.id=e.document_version_id "+
    "LEFT JOIN public.client_consent_representation_reviews rep ON rep.evidence_id=e.id "+
    "LEFT JOIN public.client_consent_revocations rev ON rev.evidence_id=e.id "+
    "WHERE e.tenant_id=$1 AND e.client_id=$2 AND e.target_id=$3 AND e.institution_id=$4 "+
    "ORDER BY e.accepted_at DESC",
    [scope.tenantId,scope.clientId,scope.targetId,scope.institutionId],
  );
  return result.rows;
}

/** Only a reviewer with supporting evidence can make a PM OTP usable for disclosure.
 * Caller authorization is enforced by the authenticated Super Admin endpoint. */
export async function verifyCompanySignerAuthority(input:{
  targetId:string;clientId:string;evidenceId:string;documentId:string;
  reviewedBy:string;notes:string;
}) {
  if(!input.notes?.trim() || input.notes.trim().length < 15 ||
     !input.documentId || !input.evidenceId) {
    deny(400,"CLIENT_REP_REVIEW_INCOMPLETE",
      "Identifica el documento que acredita facultades y detalla la revisión realizada.");
  }
  const db=await pool.connect();
  try {
    await db.query("BEGIN");
    const found=await db.query(
      "SELECT * FROM public.client_consent_evidences WHERE id=$1 AND target_id=$2 AND client_id=$3 FOR UPDATE",
      [input.evidenceId,input.targetId,input.clientId],
    );
    const e=found.rows[0];
    if(!e || e.signer_capacity!=="legal_representative")
      deny(404,"CLIENT_REP_EVIDENCE_INVALID","No existe una firma empresarial válida para esa solicitud.");
    const proof=await db.query(
      "SELECT id FROM public.documents WHERE id=$1 AND client_id=$2 " +
      "AND (tenant_id=$3 OR tenant_id IS NULL) AND is_valid IS NOT FALSE",
      [input.documentId,input.clientId,e.tenant_id],
    );
    if(!proof.rows[0])
      deny(409,"CLIENT_REP_DOCUMENT_INVALID","El comprobante de representación no pertenece a este cliente.");
    const rev=await db.query(
      "SELECT id FROM public.client_consent_revocations WHERE evidence_id=$1",
      [input.evidenceId],
    );
    if(rev.rows.length) deny(409,"CLIENT_CONSENT_REVOKED","La autorización del cliente fue revocada.");
    await db.query(
      "INSERT INTO public.client_consent_representation_reviews "+
      "(evidence_id,supporting_document_id,reviewed_by,signer_name,capacity_notes,result) "+
      "VALUES($1,$2,$3,$4,$5,'verified')",
      [input.evidenceId,input.documentId,input.reviewedBy,e.signer_name,input.notes.trim()],
    );
    await db.query("COMMIT");
    return {success:true};
  } catch(e) {
    await db.query("ROLLBACK").catch(()=>{});
    throw e;
  } finally{db.release();}
}


/** Historical customer receipt, viewable by the original bearer only while its
 * link is valid. Data is read from signed append-only evidence, never rebuilt. */
export async function getClientConsentReceipt(token:string){
  if(!validToken(token)) deny(404,"CLIENT_CONSENT_LINK_INVALID","Enlace inválido.");
  const result=await pool.query(
    "SELECT e.id,e.exact_document_content,e.exact_document_sha256,e.accepted_at,e.signer_name,"+
    "e.signer_email,e.otp_method,e.signer_capacity, "+
    "d.version,d.content_sha256 AS template_hash,r.id AS revocation_id "+
    "FROM public.client_consent_challenges c "+
    "JOIN public.client_consent_evidences e ON e.challenge_id=c.id "+
    "JOIN public.client_consent_document_versions d ON d.id=e.document_version_id "+
    "LEFT JOIN public.client_consent_revocations r ON r.evidence_id=e.id "+
    "WHERE c.token_hash=$1 AND c.status='verified' AND c.token_expires_at > NOW() LIMIT 1",
    [sha(token)],
  );
  const e=result.rows[0];
  if(!e || sha(e.exact_document_content)!==e.exact_document_sha256)
    deny(404,"CLIENT_CONSENT_RECEIPT_MISSING","Comprobante no disponible.");
  const text="COMPROBANTE HISTÓRICO DE AUTORIZACIÓN DEL CLIENTE\n"+
    "Crédito Negocios | LEG-10\n"+
    "Folio: "+e.id+"\n"+
    "Firmante: "+e.signer_name+"\n"+
    "Correo: "+e.signer_email+"\n"+
    "Fecha UTC: "+new Date(e.accepted_at).toISOString()+"\n"+
    "Versión legal: "+e.version+"\n"+
    "Huella plantilla SHA-256: "+e.template_hash+"\n"+
    "Huella documento exacto SHA-256: "+e.exact_document_sha256+"\n"+
    "Método: "+e.otp_method+"\n"+
    "Estado: "+(e.revocation_id?"REVOCADA (se conserva la evidencia histórica)":"Firma registrada")+"\n\n"+
    e.exact_document_content+"\n";
  return {text,evidenceId:e.id as string,revoked:Boolean(e.revocation_id)};
}


/** The signer can revoke a prior OTP authorization with a FRESH email OTP.
 * Historical acceptance remains untouched; a separate immutable row negates
 * any subsequent transfer. The old link cannot sign or view the expired
 * document, but it can trigger a new OTP to the ORIGINAL registered signer
 * even beyond 48 hours. Possession of the link ALONE cannot revoke.
 */
export async function prepareConsentRevocationOtp(token:string){
  if(!validToken(token)) deny(404,"CLIENT_CONSENT_LINK_INVALID","Enlace inválido.");
  const db=await pool.connect();
  try {
    await db.query("BEGIN");
    const r=await db.query(
      "SELECT c.*,e.id AS evidence_id,r.id AS revocation_id "+
      "FROM public.client_consent_challenges c "+
      "JOIN public.client_consent_evidences e ON e.challenge_id=c.id "+
      "LEFT JOIN public.client_consent_revocations r ON r.evidence_id=e.id "+
      "WHERE c.token_hash=$1 FOR UPDATE OF c",[sha(token)],
    );
    const c=r.rows[0];
    if(!c || c.status!=="verified")
      deny(404,"CLIENT_CONSENT_LINK_INVALID","Autorización no disponible para revocación.");
    if(c.revocation_id) deny(409,"CLIENT_CONSENT_ALREADY_REVOKED","La autorización ya fue revocada.");
    // Lifetime counters would make revocation impossible after a few days:
    // apply a rolling hourly ceiling so a new verified OTP can be requested later.
    const withinHour = c.otp_requested_at &&
      (Date.now()-new Date(c.otp_requested_at).getTime()) < 60*60*1000;
    if(withinHour && c.otp_request_count>=5)
      deny(429,"CLIENT_CONSENT_OTP_LIMIT","Se alcanzó el máximo de códigos por hora.");
    if(c.otp_resend_after && new Date(c.otp_resend_after).getTime()>Date.now())
      deny(429,"CLIENT_CONSENT_OTP_COOLDOWN","Espera antes de solicitar un código.");
    const code=generateOtpCode();
    await db.query(
      "UPDATE public.client_consent_challenges SET otp_hash=$2,"+
      "otp_expires_at=NOW()+INTERVAL '10 minutes',otp_attempts=0,"+
      "otp_request_count=CASE WHEN otp_requested_at IS NULL OR "+
      "otp_requested_at < NOW()-INTERVAL '1 hour' THEN 1 ELSE otp_request_count+1 END,"+
      "otp_requested_at=NOW(),otp_resend_after=NOW()+INTERVAL '60 seconds',"+
      "updated_at=NOW() WHERE id=$1",
      [c.id,otpHash(c.id,code)],
    );
    await db.query("COMMIT");
    return {id:c.id as string,to:c.signer_email as string,
      name:c.signer_name as string,code};
  }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}
  finally{db.release();}
}
export async function revokeConsentWithOtp(input:{
  token:string;code:string;ip:string|null;userAgent:string;
}){
  if(!validToken(input.token)||!/^\d{6}$/.test(input.code))
    deny(400,"CLIENT_CONSENT_OTP_INVALID","Enlace o código inválido.");
  const db=await pool.connect();
  try{
    await db.query("BEGIN");
    const q=await db.query(
      "SELECT c.*,e.id AS evidence_id,e.accepted_at,r.id AS revocation_id "+
      "FROM public.client_consent_challenges c "+
      "JOIN public.client_consent_evidences e ON e.challenge_id=c.id "+
      "LEFT JOIN public.client_consent_revocations r ON r.evidence_id=e.id "+
      "WHERE c.token_hash=$1 FOR UPDATE OF c",[sha(input.token)],
    );
    const c=q.rows[0];
    if(!c||c.status!=="verified")
      deny(404,"CLIENT_CONSENT_LINK_INVALID","La autorización no está disponible.");
    if(c.revocation_id) deny(409,"CLIENT_CONSENT_ALREADY_REVOKED","Autorización ya revocada.");
    if(!c.otp_hash || !c.otp_expires_at || !c.otp_requested_at ||
       new Date(c.otp_expires_at).getTime()<=Date.now() ||
       new Date(c.otp_requested_at).getTime()<=new Date(c.accepted_at).getTime())
      deny(409,"CLIENT_CONSENT_REVOCATION_OTP_EXPIRED","Solicita un nuevo código para revocar.");
    if(c.otp_attempts>=c.otp_max_attempts)
      deny(429,"CLIENT_CONSENT_OTP_LOCKED","Se excedió el límite de intentos.");
    const expected=Buffer.from(c.otp_hash,"hex");
    const supplied=Buffer.from(otpHash(c.id,input.code),"hex");
    if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied)){
      await db.query("UPDATE public.client_consent_challenges SET otp_attempts=otp_attempts+1 WHERE id=$1",[c.id]);
      await db.query("COMMIT");
      return {success:false as const,code:"CLIENT_CONSENT_OTP_INCORRECT"};
    }
    // Serialize with the final sent transition: revocation wins if it obtains
    // the target lock first; a later sender must see the committed revocation.
    await db.query("SELECT id FROM public.credit_submission_targets WHERE id=$1 FOR UPDATE",[c.target_id]);
    await db.query(
      "INSERT INTO public.client_consent_revocations "+
      "(evidence_id,reason,revoked_ip,revoked_user_agent,revoked_by_email) "+
      "VALUES($1,'Revocación verificada con OTP por el firmante',$2,$3,$4)",
      [c.evidence_id,input.ip,input.userAgent,c.signer_email],
    );
    await db.query("UPDATE public.client_consent_challenges SET otp_hash=NULL,otp_expires_at=NULL WHERE id=$1",[c.id]);
    await db.query("COMMIT");
    return {success:true as const,message:"Autorización revocada. Su evidencia histórica permanece conservada."};
  }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}
  finally{db.release();}
}
