import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./db";
import { storage } from "./storage";
import { matchPublishedCatalog } from "./matching/catalog";
import type { ProspectFinancing } from "../shared/prospectFinancing";

export const prospectHash = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
export type PublicProspectAssessment = {
  status: "possible_options" | "missing_information" | "under_review" | "pending";
  institutionCount?: number;
  message: string;
  /** Public labels are a strict whitelist, never lender criteria or thresholds. */
  criteria?: { matched: string[]; toReview: string[] };
};
const pending: PublicProspectAssessment = {
  status: "pending",
  message: "Recibimos tus datos. Tu asesor revisará las alternativas y la información pendiente.",
};

/** Only these generic categories can be disclosed to public visitors. */
const PUBLIC_CRITERION_LABELS: Record<string,string> = {
  targetProfiles: "Tipo de cliente",
  creditAmount: "Monto solicitado",
  creditTerm: "Plazo deseado",
  companyAge: "Antigüedad del negocio",
  monthlyRevenue: "Ingresos del negocio",
  bureauRequirement: "Historial crediticio",
  guaranteeType: "Garantías",
  avalesType: "Avales",
  tipo_activo_arrendado: "Tipo de activo",
  leaseFinancialPolicies: "Información de arrendamiento",
  leaseProductFamily: "Tipo de financiamiento",
  eligibilityVerification: "Validación de requisitos",
};
type PublicCriterionInput = {
  institutionId: string;
  criteria?: {
    matched?: { code:string;status?:string }[];
    missing?: { code:string;status?:string }[];
  };
};
export function summarizePublicCriteria(result: {
  compatible: PublicCriterionInput[];
  insufficientData: PublicCriterionInput[];
}): {matched:string[];toReview:string[]} {
  // Only fully compatible offers contribute fulfilled criteria; incomplete
  // offers can suggest general topics to validate, not confirmed rejections.
  const safeLabels=(rows:PublicCriterionInput[], bucket:"matched"|"missing")=>
    [...new Set(rows.flatMap(row => row.criteria?.[bucket] || [])
      .filter(item => bucket==="matched" ? item.status==="PASSED" : item.status==="MISSING_DATA")
      .map(item => PUBLIC_CRITERION_LABELS[item.code])
      .filter((label):label is string => Boolean(label)))];
  const matched=safeLabels(result.compatible,"matched").slice(0,5);
  const toReview=safeLabels(result.insufficientData,"missing")
    .filter(label=>!matched.includes(label)).slice(0,4);
  return {matched,toReview};
}

export function aggregateProspectAssessment(result: {
  compatible: PublicCriterionInput[];
  insufficientData: PublicCriterionInput[];
  notCompatible: unknown[];
}): PublicProspectAssessment {
  const institutions = new Set(result.compatible.map(row => row.institutionId).filter(x => x && x !== "unknown"));
  const criteria = summarizePublicCriteria(result);
  if (institutions.size) return {
    status: "possible_options", institutionCount: institutions.size, criteria,
    message: "Con la información que compartiste, identificamos " + institutions.size +
      " instituciones financieras con productos que podrían adaptarse a lo que buscas. Tu asesor revisará contigo los siguientes pasos. Esta evaluación es preliminar y no constituye una aprobación ni una oferta de crédito.",
  };
  if (result.insufficientData.length) return {
    status: "missing_information", criteria,
    message: "Para identificar opciones con mayor precisión necesitamos verificar algunos datos. Tu asesor te ayudará.",
  };
  return {
    status: "under_review", criteria,
    message: "Recibimos tu información. Tu asesor continuará revisando alternativas. Este resultado no representa un rechazo definitivo.",
  };
}
export function buildProspectCredit(financing: ProspectFinancing) {
  return {
    type: financing.product,
    amount: financing.amount,
    requestedAmount: financing.amount,
    term: financing.termMonths,
    purpose: financing.purpose,
    ...(financing.product === "arrendamiento" ? {
      mortgageData: {
        operationType: "arrendamiento",
        lease: {
          tipo_activo_arrendado: financing.leasingAssetType,
          plazo_deseado_meses: financing.termMonths,
        },
      },
    } : {}),
  };
}

/** Same transaction as profile+one-use completion link. Never submits to any lender. */
export async function insertProspectPreapplication(tx: PoolClient, values: {
  leadId:string; ownerUserId:string; tenantId:string|null; clientId:string|null;
  completionLinkId:string; profile:Record<string,unknown>;
  financing?:ProspectFinancing; privacyVersion:string;
}) {
  const status = !values.financing ? "awaiting_details" : !values.clientId ? "identity_review" : "pending";
  const financing = values.financing || {};
  const hash = prospectHash({profile: values.profile, financing});
  const saved = await tx.query(`
    INSERT INTO public.prospect_preapplications
      (lead_id,owner_user_id,tenant_id,client_id,completion_link_id,
       profile_snapshot,financing_data,privacy_version,status,input_hash)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
    ON CONFLICT(lead_id) DO UPDATE SET
      client_id=EXCLUDED.client_id,
      completion_link_id=EXCLUDED.completion_link_id,
      profile_snapshot=EXCLUDED.profile_snapshot,
      financing_data=EXCLUDED.financing_data,
      privacy_version=EXCLUDED.privacy_version,
      consent_at=NOW(),
      status=EXCLUDED.status, input_hash=EXCLUDED.input_hash,
      summary=NULL, details=NULL, catalog_hash=NULL, evaluated_at=NULL, updated_at=NOW()
    WHERE public.prospect_preapplications.owner_user_id=EXCLUDED.owner_user_id
      AND public.prospect_preapplications.tenant_id IS NOT DISTINCT FROM EXCLUDED.tenant_id
      AND (public.prospect_preapplications.input_hash<>EXCLUDED.input_hash
           OR public.prospect_preapplications.client_id IS DISTINCT FROM EXCLUDED.client_id)
    RETURNING id
  `,[values.leadId,values.ownerUserId,values.tenantId,values.clientId,
    values.completionLinkId,JSON.stringify(values.profile),JSON.stringify(financing),
    values.privacyVersion,status,hash]);
  if(!saved.rowCount) {
    // An identical retry is fine; a cross-owner/tenant conflict is not.
    const existing=await tx.query(
      "SELECT owner_user_id,tenant_id FROM public.prospect_preapplications WHERE lead_id=$1",
      [values.leadId]);
    if(!existing.rows[0] || existing.rows[0].owner_user_id!==values.ownerUserId ||
       existing.rows[0].tenant_id!==values.tenantId) throw new Error("PROSPECT_PREAPPLICATION_OWNER_CONFLICT");
  }
  return status;
}
type Preapplication = {
  id:string; lead_id:string; owner_user_id:string; client_id:string|null;
  profile_snapshot:Record<string,unknown>; financing_data:Record<string,unknown>;
  input_hash:string; status:string;
};

/** Runs AFTER profile transaction commits. Errors never erase the captured lead. */
export async function evaluateProspectPreapplication(
  leadId:string, ownerUserId:string,
):Promise<PublicProspectAssessment> {
  let claimed:Preapplication|undefined;
  try {
    const current=await pool.query<Preapplication>(
      "SELECT * FROM public.prospect_preapplications WHERE lead_id=$1 AND owner_user_id=$2",
      [leadId,ownerUserId]);
    const row=current.rows[0];
    if (!row) return pending;
    if (row.status === "evaluated" && row.client_id) {
      const result=await pool.query<{summary:PublicProspectAssessment}>(
        "SELECT summary FROM public.prospect_preapplications WHERE id=$1", [row.id]);
      return result.rows[0]?.summary || pending;
    }
    if (!row.client_id || row.status === "identity_review" || row.status === "awaiting_details")
      return pending;
    const claim=await pool.query<Preapplication>(`
      UPDATE public.prospect_preapplications SET status='evaluating',updated_at=NOW()
      WHERE id=$1 AND owner_user_id=$2
        AND (status IN ('pending','failed')
           OR (status='evaluating' AND updated_at < NOW()-INTERVAL '5 minutes'))
      RETURNING *
    `,[row.id,ownerUserId]);
    claimed=claim.rows[0];
    if (!claimed) return pending;
    const finance=claimed.financing_data as ProspectFinancing;
    const result=await matchPublishedCatalog(storage,{
      client:claimed.profile_snapshot,credit:buildProspectCredit(finance),
    },undefined,finance.product);
    const assessment=aggregateProspectAssessment(result);
    const details={
      compatible:result.compatible,
      insufficientData:result.insufficientData,
      notCompatible:result.notCompatible,
      summary:result.summary,
      requested:finance,
    };
    const catalogHash=prospectHash(
      [...result.compatible,...result.insufficientData,...result.notCompatible]
        .map(r=>[r.offerId,r.institutionId,r.versionNumber,r.status])
        .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
    const tx=await pool.connect();
    try {
      await tx.query("BEGIN");
      await tx.query(`
        INSERT INTO public.prospect_matching_evaluations
          (preapplication_id,input_hash,catalog_hash,summary,details)
        VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)
        ON CONFLICT (preapplication_id,input_hash,catalog_hash) DO NOTHING
      `,[claimed.id,claimed.input_hash,catalogHash,JSON.stringify(assessment),JSON.stringify(details)]);
      const done=await tx.query(`
        UPDATE public.prospect_preapplications
        SET status='evaluated',summary=$2::jsonb,details=$3::jsonb,
          catalog_hash=$4,evaluated_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND status='evaluating' RETURNING id
      `,[claimed.id,JSON.stringify(assessment),JSON.stringify(details),catalogHash]);
      if (done.rowCount) {
        await tx.query(`
          INSERT INTO public.notifications (user_id,type,title,message,data)
          VALUES($1,'prospect_auto_matching','Pre-solicitud evaluada',
            'Tu prospecto completó sus datos. Ya puedes revisar la pre-solicitud y las alternativas preliminares.',$2::jsonb)
        `,[ownerUserId,JSON.stringify({leadId,preapplicationId:claimed.id,
          compatibleOffers:result.compatible.length,
          compatibleInstitutions:new Set(result.compatible.map(x=>x.institutionId)).size,
          insufficientOffers:result.insufficientData.length,
          actionUrl:"/clientes?tab=recibidos"})]);
      }
      await tx.query("COMMIT");
    } catch (error) {
      await tx.query("ROLLBACK").catch(()=>{});
      throw error;
    } finally {tx.release();}
    return assessment;
  } catch (error) {
    console.error("[PROSPECT-MATCH] Evaluation unavailable", {code:(error as any)?.code||"MATCH_ERROR"});
    if (claimed) await pool.query(
      "UPDATE public.prospect_preapplications SET status='failed',updated_at=NOW() WHERE id=$1 AND status='evaluating'",
      [claimed.id]).catch(()=>{});
    return pending;
  }
}
