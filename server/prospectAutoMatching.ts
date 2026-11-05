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
  /** Unique lenders with at least a preliminary match (including pending checks). */
  identifiedInstitutionCount?: number;
  reviewedOffers?: number;
  message: string;
  /** Only broad public categories, never lender eligibility rules or thresholds. */
  criteria?: { matched: string[]; toReview: string[]; notMatched: string[] };
};
const pending: PublicProspectAssessment = {
  status: "pending",
  message: "Recibimos tus datos. Tu asesor revisará las alternativas y la información pendiente.",
};

const PUBLIC_CRITERION_LABELS: Record<string,string> = {
  targetProfiles: "Tipo de cliente",
  annualIncome: "Ingresos anuales estimados",
  businessBureau: "Buró de la empresa",
  shareholderBureau: "Buró del accionista",
  personalBureau: "Historial crediticio personal",
  requiresCiec: "Información fiscal SAT",
  requiresFinancialStatements: "Estados financieros",
  satOpinion: "Cumplimiento fiscal",
  governmentSalesLimit: "Ventas con gobierno",
  arrearsPolicy: "Política de atrasos por validar con la financiera",
  creditAmount: "Monto solicitado",
  creditTerm: "Plazo deseado",
  companyAge: "Antigüedad del negocio",
  monthlyRevenue: "Ingresos del negocio",
  bureauRequirement: "Comportamiento de pagos declarado",
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
    matched?: { code:string;status?:string; actualValue?:unknown }[];
    missing?: { code:string;status?:string; actualValue?:unknown }[];
    failed?: { code:string;status?:string; actualValue?:unknown }[];
  };
};
export function summarizePublicCriteria(result: {
  compatible: PublicCriterionInput[];
  insufficientData: PublicCriterionInput[];
  notCompatible?: unknown[];
}): {matched:string[];toReview:string[];notMatched:string[]} {
  const rejected = (result.notCompatible || []).filter(
    (item):item is PublicCriterionInput =>
      Boolean(item) && typeof item === "object" && "institutionId" in (item as object),
  );
  const labels=(rows:PublicCriterionInput[],bucket:"matched"|"missing"|"failed",status:string)=>
    Array.from(new Set(rows.flatMap(row=>row.criteria?.[bucket]||[])
      .filter(item=>item.status===status)
      .map(item=>{
        const base=PUBLIC_CRITERION_LABELS[item.code];
        if(!base)return "";
        const scoreCriteria=["personalBureau","businessBureau","shareholderBureau"];
        if(bucket==="missing" && scoreCriteria.includes(item.code) &&
          typeof item.actualValue==="string" &&
          /^(alto|bueno|medio|bajo|malo)-\\d+-\\d+$/.test(item.actualValue))
          return base+" (dentro de rango)";
        if(bucket==="failed") {
          const help:Record<string,string>={
            creditAmount:" — algunas ofertas manejan montos diferentes al solicitado",
            creditTerm:" — los plazos disponibles varían entre productos",
            guaranteeType:" — algunas ofertas requieren otro tipo de respaldo",
          };
          return base+(help[item.code]||" — condiciones específicas del producto");
        }
        return base;
      })
      .filter((label):label is string=>Boolean(label))));
  // First show evidence from viable offers, not failure reasons drawn
  // from unrelated products discarded by this same matching engine.
  // This prevents "Monto solicitado" from being marked as both good and bad
  // merely because two lenders have different limits.
  const hasViable=result.compatible.length>0 || result.insufficientData.length>0;
  const primary=result.compatible.length?result.compatible:
    result.insufficientData.length?result.insufficientData:rejected;
  const allPassed=labels(primary,"matched","PASSED");
  const allMissing=labels(
    hasViable ? [...result.compatible,...result.insufficientData] : rejected,
    "missing","MISSING_DATA");
  const allFailed=hasViable?[]:labels(rejected,"failed","FAILED");
  const matched=allPassed.filter(label=>!allFailed.includes(label));
  const toReview=allMissing.filter(label=>!matched.includes(label));
  const notMatched=allFailed.filter(label=>!matched.includes(label) && !toReview.includes(label));
  return {matched,toReview,notMatched};
}

export function aggregateProspectAssessment(result: {
  compatible: PublicCriterionInput[];
  insufficientData: PublicCriterionInput[];
  notCompatible: unknown[];
  summary?: { totalEvaluated?: number };
}): PublicProspectAssessment {
  const institutions = new Set(result.compatible.map(row => row.institutionId).filter(x => x && x !== "unknown"));
  // Match preliminar: compatible o con información pendiente. Rejected lenders
  // never count as identified options; don't invent a minimum of two.
  const identified = new Set([...result.compatible,...result.insufficientData]
    .map(row=>row.institutionId).filter(x=>x && x!=="unknown"));
  const reviewedOffers=Math.max(0,result.summary?.totalEvaluated ??
    (result.compatible.length+result.insufficientData.length+result.notCompatible.length));
  const criteria=summarizePublicCriteria(result);
  if (institutions.size) return {
    status: "possible_options", institutionCount: institutions.size,
    identifiedInstitutionCount:identified.size, reviewedOffers, criteria,
    message: "Con los datos proporcionados identificamos " + institutions.size +
      " instituciones financieras con alternativas preliminares. Tu asesor confirmará los requisitos antes de avanzar. No es una aprobación ni una oferta de crédito.",
  };
  if (result.insufficientData.length) return {
    status: "missing_information", reviewedOffers, criteria,
    identifiedInstitutionCount:identified.size,
    message: "Revisamos " + reviewedOffers +
      " productos del catálogo. Identificamos coincidencias preliminares que necesitan confirmar requisitos. Tu asesor continuará contigo.",
  };
  if (!reviewedOffers) return {
    status: "under_review", reviewedOffers:0, criteria,
    message: "Todavía no hay ofertas publicadas comparables para el tipo de financiamiento seleccionado. Registramos tu solicitud y tu asesor revisará otras alternativas.",
  };
  return {
    status: "under_review", reviewedOffers, criteria,
    message: "Revisamos " + reviewedOffers +
      " productos del catálogo. Algunas condiciones requieren análisis adicional. Tu solicitud quedó registrada y tu asesor continuará buscando alternativas.",
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
    if (row.status === "evaluated") {
      const result=await pool.query<{summary:PublicProspectAssessment}>(
        "SELECT summary FROM public.prospect_preapplications WHERE id=$1", [row.id]);
      return result.rows[0]?.summary || pending;
    }
    // A public preliminary comparison uses the captured profile snapshot,
    // not the creation of an internal client record. Identity review remains
    // mandatory before any regulated origination or lender submission.
    if (row.status === "awaiting_details" || !row.financing_data ||
        !Object.keys(row.financing_data).length) return pending;
    const claim=await pool.query<Preapplication>(`
      UPDATE public.prospect_preapplications SET status='evaluating',updated_at=NOW()
      WHERE id=$1 AND owner_user_id=$2
        AND (status IN ('pending','failed','identity_review')
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
