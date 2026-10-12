/**
 * Servicio de Validación Documental de Comisiones (FASE 2B.2C / PAG-01 a PAG-06)
 *
 * Reglas de Negocio:
 * 1. Documentación obligatoria: Antes de liquidar (STP, manual, masivo), cada beneficiario
 *    con derecho económico debe tener INE vigente, CSF y estado de cuenta bancario
 *    cargados y aprobados por Super Admin. Además, banco, titular y CLABE de 18 dígitos.
 * 2. Validación administrativa: Super Admin revisa, aprueba o rechaza documentos.
 *    No se permite que Broker o Master auto-aprueben sus propios documentos.
 * 3. Bloqueo real: Aplica a todas las rutas de liquidación (/pay, /bulk-pay, /mark-paid).
 *    Si falta algún requisito, se bloquea antes de transicionar estados o transferir fondos.
 * 4. Beneficiarios correctos: Verifica independientemente al Broker y/o Master según atribución histórica.
 * 5. Sin fricción comercial: NO bloquea registro, firma, originación ni aprobación de la comisión.
 */

import type { Document, Commission, Credit, User } from "@shared/schema";
import type { IStorage } from "./storage";

export type BeneficiaryDocRequirementType = "ine" | "csf" | "estado_cuenta";

export interface BeneficiaryDocumentStatus {
  type: BeneficiaryDocRequirementType;
  label: string;
  hasDocument: boolean;
  status: "approved" | "rejected" | "pending" | "missing" | "expired";
  documentId?: string;
  fileName?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
  rejectionReason?: string | null;
}

export interface BeneficiaryBankingStatus {
  bankName: string | null;
  accountHolder: string | null;
  clabe: string | null;
  isBankNameValid: boolean;
  isAccountHolderValid: boolean;
  isClabeValid: boolean;
}

export interface BeneficiaryPayoutValidationResult {
  beneficiaryId: string;
  beneficiaryName: string;
  role: string;
  canPayout: boolean;
  missingRequirements: string[];
  documents: {
    ine: BeneficiaryDocumentStatus;
    csf: BeneficiaryDocumentStatus;
    estado_cuenta: BeneficiaryDocumentStatus;
  };
  banking: BeneficiaryBankingStatus;
}

export interface CommissionPayoutValidationResult {
  commissionId: string;
  canPayout: boolean;
  missingRequirements: string[];
  beneficiaries: {
    beneficiaryId: string;
    role: string;
    beneficiaryName: string;
    economicShare: number;
    validation: BeneficiaryPayoutValidationResult;
  }[];
}

// Catálogo de tipos de documento normalizados
const INE_TYPES = new Set([
  "ine",
  "ine_anverso",
  "ine_reverso",
  "identificacion",
  "identificacion_oficial",
  "id_oficial",
]);

const CSF_TYPES = new Set([
  "csf",
  "constancia_situacion_fiscal",
  "situacion_fiscal",
  "constancia_fiscal",
  "rfc",
]);

const ESTADO_CUENTA_TYPES = new Set([
  "estado_cuenta",
  "estado_cuenta_bancario",
  "comprobante_bancario",
  "comprobante_banco",
  "bank_statement",
  "income_statement",
  "caratula_bancaria",
  "bancario",
]);

/**
 * Normaliza el tipo de documento del sistema existente a los 3 requerimientos obligatorios
 */
export function matchDocumentRequirement(docType: string): BeneficiaryDocRequirementType | null {
  if (!docType) return null;
  const normalized = docType.trim().toLowerCase();
  if (INE_TYPES.has(normalized) || normalized.includes("ine") || normalized.includes("identificacion")) {
    return "ine";
  }
  if (CSF_TYPES.has(normalized) || normalized.includes("csf") || normalized.includes("situacion_fiscal")) {
    return "csf";
  }
  if (
    ESTADO_CUENTA_TYPES.has(normalized) ||
    normalized.includes("estado_cuenta") ||
    normalized.includes("comprobante_bancario") ||
    normalized.includes("bank_statement")
  ) {
    return "estado_cuenta";
  }
  return null;
}

/**
 * Evalúa el estado de aprobación de un documento individual según las reglas administrativas:
 * - Debe estar aprobado por Super Admin
 * - No auto-aprobado por el broker o uploader
 * - No vencido
 * - No rechazado
 */
export function evaluateDocumentStatus(doc: Document): {
  status: "approved" | "rejected" | "pending" | "expired";
  notes?: string | null;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  expiresAt?: string | null;
} {
  const extracted = (doc.extractedData as any) || {};
  const now = Date.now();

  const isExpired = Boolean(doc.expiresAt && new Date(doc.expiresAt).getTime() <= now);
  if (isExpired) {
    return {
      status: "expired",
      notes: extracted.reviewNotes || "Documento vencido según fecha de expiración.",
      expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
      reviewedBy: extracted.reviewedBy || null,
      reviewedAt: extracted.reviewedAt || null,
    };
  }

  // Si está explícitamente rechazado
  if (extracted.status === "rejected" || doc.isValid === false) {
    return {
      status: "rejected",
      notes: extracted.reviewNotes || null,
      rejectionReason: extracted.rejectionReason || extracted.reviewNotes || "Documento rechazado por administración.",
      reviewedBy: extracted.reviewedBy || null,
      reviewedAt: extracted.reviewedAt || null,
      expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
    };
  }

  // Prevención de auto-aprobación: un broker o uploader no puede ser el validador
  const reviewerId = extracted.reviewedBy;
  const isSelfApproved = Boolean(
    reviewerId && (reviewerId === doc.brokerId || reviewerId === doc.uploadedBy)
  );

  if (isSelfApproved) {
    return {
      status: "pending",
      notes: "Auto-aprobación no válida. Requiere revisión independiente por Super Admin.",
      reviewedBy: null,
      reviewedAt: null,
      expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
    };
  }

  // Aprobado por Super Admin
  const isApproved =
    extracted.status === "approved" ||
    (doc.isValid === true && Boolean(reviewerId) && extracted.reviewRole === "super_admin");

  if (isApproved) {
    return {
      status: "approved",
      notes: extracted.reviewNotes || null,
      reviewedBy: reviewerId || null,
      reviewedAt: extracted.reviewedAt || null,
      expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
    };
  }

  return {
    status: "pending",
    notes: "Pendiente de revisión por Super Admin.",
    reviewedBy: null,
    reviewedAt: null,
    expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
  };
}

/**
 * Valida los requisitos documentales y bancarios de un beneficiario individual
 */
export async function validateBeneficiaryPayoutDocuments(
  beneficiaryId: string,
  storage: IStorage
): Promise<BeneficiaryPayoutValidationResult> {
  const user = await storage.getUser(beneficiaryId);
  const fullName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || `Beneficiario ${beneficiaryId}`
    : `Beneficiario ${beneficiaryId}`;
  const role = user?.role || "broker";

  // Consultar todos los documentos asociados al beneficiario
  const rawDocs = await storage.getDocuments({ brokerId: beneficiaryId });

  // Agrupar los mejores documentos por categoría
  const categorized: Record<BeneficiaryDocRequirementType, Document[]> = {
    ine: [],
    csf: [],
    estado_cuenta: [],
  };

  for (const doc of rawDocs) {
    const matchedType = matchDocumentRequirement(doc.type);
    if (matchedType) {
      categorized[matchedType].push(doc);
    }
  }

  function resolveBestDocStatus(
    reqType: BeneficiaryDocRequirementType,
    label: string
  ): BeneficiaryDocumentStatus {
    const candidateDocs = categorized[reqType];
    if (candidateDocs.length === 0) {
      return {
        type: reqType,
        label,
        hasDocument: false,
        status: "missing",
      };
    }

    // Evaluar cada documento candidato
    const evaluatedList = candidateDocs.map((doc) => ({
      doc,
      evaluation: evaluateDocumentStatus(doc),
    }));

    // Priorizar: 1) aprobado, 2) pendiente, 3) rechazado, 4) vencido
    const approved = evaluatedList.find((e) => e.evaluation.status === "approved");
    if (approved) {
      return {
        type: reqType,
        label,
        hasDocument: true,
        status: "approved",
        documentId: approved.doc.id,
        fileName: approved.doc.fileName,
        reviewedBy: approved.evaluation.reviewedBy,
        reviewedAt: approved.evaluation.reviewedAt,
        expiresAt: approved.evaluation.expiresAt,
        notes: approved.evaluation.notes,
      };
    }

    const pending = evaluatedList.find((e) => e.evaluation.status === "pending");
    if (pending) {
      return {
        type: reqType,
        label,
        hasDocument: true,
        status: "pending",
        documentId: pending.doc.id,
        fileName: pending.doc.fileName,
        notes: pending.evaluation.notes,
        expiresAt: pending.evaluation.expiresAt,
      };
    }

    const expired = evaluatedList.find((e) => e.evaluation.status === "expired");
    if (expired) {
      return {
        type: reqType,
        label,
        hasDocument: true,
        status: "expired",
        documentId: expired.doc.id,
        fileName: expired.doc.fileName,
        notes: expired.evaluation.notes,
        expiresAt: expired.evaluation.expiresAt,
      };
    }

    const rejected = evaluatedList[0];
    return {
      type: reqType,
      label,
      hasDocument: true,
      status: "rejected",
      documentId: rejected.doc.id,
      fileName: rejected.doc.fileName,
      notes: rejected.evaluation.notes,
      rejectionReason: rejected.evaluation.rejectionReason,
    };
  }

  const ineStatus = resolveBestDocStatus("ine", "INE vigente");
  const csfStatus = resolveBestDocStatus("csf", "Constancia de Situación Fiscal (CSF)");
  const estadoCuentaStatus = resolveBestDocStatus("estado_cuenta", "Estado de cuenta bancario");

  // Validación bancaria de 18 dígitos y datos completos
  const bankName = user?.bankName ? String(user.bankName).trim() : null;
  const accountHolder = user?.accountHolder ? String(user.accountHolder).trim() : null;
  const clabe = user?.clabe ? String(user.clabe).trim() : null;

  const isBankNameValid = Boolean(bankName && bankName.length > 0);
  const isAccountHolderValid = Boolean(accountHolder && accountHolder.length > 0);
  const isClabeValid = Boolean(clabe && /^\d{18}$/.test(clabe));

  const missingRequirements: string[] = [];

  // Verificación documental
  if (ineStatus.status !== "approved") {
    if (ineStatus.status === "missing") {
      missingRequirements.push("INE vigente no cargada en expediente");
    } else if (ineStatus.status === "expired") {
      missingRequirements.push("INE vencida (requiere documento vigente)");
    } else if (ineStatus.status === "rejected") {
      missingRequirements.push(`INE rechazada por Super Admin (${ineStatus.rejectionReason || "no válida"})`);
    } else {
      missingRequirements.push("INE pendiente de aprobación por Super Admin");
    }
  }

  if (csfStatus.status !== "approved") {
    if (csfStatus.status === "missing") {
      missingRequirements.push("Constancia de Situación Fiscal (CSF) no cargada en expediente");
    } else if (csfStatus.status === "expired") {
      missingRequirements.push("CSF vencida (requiere constancia actualizada)");
    } else if (csfStatus.status === "rejected") {
      missingRequirements.push(`CSF rechazada por Super Admin (${csfStatus.rejectionReason || "no válida"})`);
    } else {
      missingRequirements.push("CSF pendiente de aprobación por Super Admin");
    }
  }

  if (estadoCuentaStatus.status !== "approved") {
    if (estadoCuentaStatus.status === "missing") {
      missingRequirements.push("Estado de cuenta bancario no cargado en expediente");
    } else if (estadoCuentaStatus.status === "expired") {
      missingRequirements.push("Estado de cuenta bancario vencido (no mayor a 3 meses)");
    } else if (estadoCuentaStatus.status === "rejected") {
      missingRequirements.push(`Estado de cuenta bancario rechazado por Super Admin (${estadoCuentaStatus.rejectionReason || "no válido"})`);
    } else {
      missingRequirements.push("Estado de cuenta bancario pendiente de aprobación por Super Admin");
    }
  }

  // Verificación bancaria
  if (!isBankNameValid) {
    missingRequirements.push("Nombre del banco no registrado en perfil");
  }
  if (!isAccountHolderValid) {
    missingRequirements.push("Titular de cuenta bancaria no registrado en perfil");
  }
  if (!isClabeValid) {
    missingRequirements.push("CLABE interbancaria de 18 dígitos inválida o no registrada");
  }

  const canPayout = missingRequirements.length === 0;

  return {
    beneficiaryId,
    beneficiaryName: fullName,
    role,
    canPayout,
    missingRequirements,
    documents: {
      ine: ineStatus,
      csf: csfStatus,
      estado_cuenta: estadoCuentaStatus,
    },
    banking: {
      bankName,
      accountHolder,
      clabe,
      isBankNameValid,
      isAccountHolderValid,
      isClabeValid,
    },
  };
}

/**
 * Valida los prerequisitos documentales para una comisión completa según su atribución económica
 */
export async function validateCommissionPayoutPrerequisites(
  commission: Commission,
  storage: IStorage
): Promise<CommissionPayoutValidationResult> {
  const linkedCredit: Credit | undefined = commission.creditId
    ? await storage.getCredit(commission.creditId)
    : undefined;

  const historicalMasterBrokerId =
    commission.masterBrokerId || (linkedCredit?.originMasterBrokerId ?? null);

  const brokerShare = parseFloat(commission.brokerShare || "0") || 0;
  const masterBrokerShare = parseFloat(commission.masterBrokerShare || "0") || 0;

  const isMasterDirect = Boolean(
    historicalMasterBrokerId &&
      commission.brokerId &&
      String(commission.brokerId) === String(historicalMasterBrokerId)
  );

  const beneficiariesToCheck: { id: string; role: string; share: number }[] = [];

  if (isMasterDirect) {
    // Caso 1: Master Directo (operación directa del Master)
    const masterId = historicalMasterBrokerId || commission.brokerId;
    beneficiariesToCheck.push({
      id: masterId,
      role: "master_broker",
      share: masterBrokerShare > 0 ? masterBrokerShare : brokerShare,
    });
  } else if (!historicalMasterBrokerId || masterBrokerShare === 0) {
    // Caso 2: Broker Directo (sin Master o cuota de Master = 0)
    beneficiariesToCheck.push({
      id: commission.brokerId,
      role: "broker",
      share: brokerShare > 0 ? brokerShare : parseFloat(commission.amount || "0"),
    });
  } else {
    // Caso 3: Broker de Red (Broker y Master Broker con participación económica)
    if (masterBrokerShare > 0 && historicalMasterBrokerId) {
      beneficiariesToCheck.push({
        id: historicalMasterBrokerId,
        role: "master_broker",
        share: masterBrokerShare,
      });
    }
    if (brokerShare > 0 && commission.brokerId) {
      beneficiariesToCheck.push({
        id: commission.brokerId,
        role: "broker",
        share: brokerShare,
      });
    }
  }

  const allMissingRequirements: string[] = [];
  const evaluatedBeneficiaries: CommissionPayoutValidationResult["beneficiaries"] = [];

  for (const b of beneficiariesToCheck) {
    const valResult = await validateBeneficiaryPayoutDocuments(b.id, storage);
    evaluatedBeneficiaries.push({
      beneficiaryId: b.id,
      role: b.role,
      beneficiaryName: valResult.beneficiaryName,
      economicShare: b.share,
      validation: valResult,
    });

    if (!valResult.canPayout) {
      const rolePrefix = b.role === "master_broker" ? "Master Bróker" : "Bróker";
      for (const req of valResult.missingRequirements) {
        allMissingRequirements.push(`[${rolePrefix}: ${valResult.beneficiaryName}] ${req}`);
      }
    }
  }

  const canPayout = allMissingRequirements.length === 0;

  return {
    commissionId: commission.id,
    canPayout,
    missingRequirements: allMissingRequirements,
    beneficiaries: evaluatedBeneficiaries,
  };
}
