import { randomUUID } from "node:crypto";
import { storage } from "./storage";
import type { Commission, InsertCommission, Credit } from "@shared/schema";

/**
 * Error lanzado cuando una oferta versionada no define la tasa de comisión
 * requerida para una operación comercial. Previene fallbacks silenciosos a tasas genéricas (COM-14).
 */
export class MissingCommissionRateError extends Error {
  public readonly code = "MISSING_COMMISSION_RATE";
  public readonly offerId?: string;
  public readonly versionNumber?: number;
  public readonly commissionType: string;
  public readonly participantRole: string;

  constructor(
    message: string,
    details: {
      offerId?: string;
      versionNumber?: number;
      commissionType: string;
      participantRole: string;
    }
  ) {
    super(message);
    this.name = "MissingCommissionRateError";
    this.offerId = details.offerId;
    this.versionNumber = details.versionNumber;
    this.commissionType = details.commissionType;
    this.participantRole = details.participantRole;
  }
}

/**
 * Error lanzado cuando se detecta discrepancia en importes congelados o liquidación.
 */
export class CommissionFrozenDiscrepancyError extends Error {
  public readonly code = "FROZEN_AMOUNT_DISCREPANCY";
  public readonly frozenAmount: number;
  public readonly expectedAmount: number;
  public readonly commissionId?: string;

  constructor(
    message: string,
    details?: { frozenAmount?: number; expectedAmount?: number; commissionId?: string }
  ) {
    super(message);
    this.name = "CommissionFrozenDiscrepancyError";
    this.frozenAmount = details?.frozenAmount ?? 0;
    this.expectedAmount = details?.expectedAmount ?? 0;
    this.commissionId = details?.commissionId;
  }
}

export interface CommissionPayoutAuditResult {
  payoutAmount: number;
  expectedAmount: number;
  frozenAmount: number | null;
  hasDiscrepancy: boolean;
  discrepancyReason: string | null;
  isMasterDirect: boolean;
}

export interface ResolvedRateItem {
  provided: boolean;
  isZero: boolean;
  rate: number;
}

export interface ResolvedCommissionRates {
  source: "offer_version" | "proposal_snapshot" | "institution_legacy";
  offerId?: string;
  versionNumber?: number;
  financiera: ResolvedRateItem;
  masterBroker: ResolvedRateItem;
  broker: ResolvedRateItem;
  overrateCommissionRate?: number;
  platformGrossMarginDirect?: number;
  platformGrossMarginMaster?: number;
  hasMissingRequiredRate: boolean;
  missingRateReasons: string[];
  notes?: string | null;
}

function parseRateValue(val: unknown): ResolvedRateItem {
  if (val === undefined || val === null || val === "") {
    return { provided: false, isZero: false, rate: 0 };
  }
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/%/g, "").trim());
  if (isNaN(num)) {
    return { provided: false, isZero: false, rate: 0 };
  }
  return {
    provided: true,
    isZero: num === 0,
    rate: num,
  };
}

/**
 * Resuelve las tasas de comisión a partir de una oferta y versión específica,
 * distinguiendo estrictamente tasa cero autorizada de tasa ausente (COM-02, COM-14).
 */
export async function resolveOfferVersionCommissionRates(params: {
  offerId?: string | null;
  versionNumber?: number | null;
  commissionType?: string;
  proposalCommissionRates?: any;
  institution?: any;
  isMasterDirect?: boolean;
  hasMasterBroker?: boolean;
}): Promise<ResolvedCommissionRates> {
  const commType = params.commissionType || "apertura";
  const missingReasons: string[] = [];

  // 1. Si existe un snapshot explícito congelado en la propuesta comercial
  if (params.proposalCommissionRates && typeof params.proposalCommissionRates === "object") {
    const pr = params.proposalCommissionRates;
    const fin = parseRateValue(pr.financiera?.[commType] ?? pr.financiera?.apertura ?? pr.financiera?.total);
    const mb = parseRateValue(pr.masterBroker?.[commType] ?? pr.masterBroker?.apertura ?? pr.masterBroker?.total);
    const brk = parseRateValue(pr.broker?.[commType] ?? pr.broker?.apertura ?? pr.broker?.total);

    if (!fin.provided) missingReasons.push(`Financiera (${commType})`);
    if (params.hasMasterBroker && !mb.provided) missingReasons.push(`Master Broker (${commType})`);
    if (!brk.provided) missingReasons.push(`Broker Directo (${commType})`);

    return {
      source: "proposal_snapshot",
      offerId: params.offerId || undefined,
      versionNumber: params.versionNumber || undefined,
      financiera: fin,
      masterBroker: mb,
      broker: brk,
      hasMissingRequiredRate: missingReasons.length > 0,
      missingRateReasons: missingReasons,
      notes: pr.notes || null,
    };
  }

  // 2. Si se especifica una oferta versionada (institutionProductId / offerId)
  if (params.offerId) {
    const offer = await storage.getInstitutionProduct(params.offerId);
    const allVersions = await storage.getInstitutionProductVersions(params.offerId);
    let version = null;
    if (params.versionNumber != null) {
      version = allVersions.find((v) => v.versionNumber === params.versionNumber) || null;
    }
    if (!version) {
      version = allVersions.find((v) => v.status === "published" || v.status === "active") || allVersions[0] || null;
    }

    const conditions = (version?.conditions as any) || (offer?.configuration as any) || {};
    const commRates = conditions.commissionRates || {};

    const fin = parseRateValue(commRates.financiera?.[commType] ?? commRates.financiera?.apertura ?? commRates.financiera?.total);
    const mb = parseRateValue(commRates.masterBroker?.[commType] ?? commRates.masterBroker?.apertura ?? commRates.masterBroker?.total);
    const brk = parseRateValue(commRates.broker?.[commType] ?? commRates.broker?.apertura ?? commRates.broker?.total);

    if (!fin.provided) {
      missingReasons.push(`Tasa de Financiera ausente para tipo '${commType}' en oferta '${offer?.name || params.offerId}'`);
    }
    if (params.hasMasterBroker && !mb.provided) {
      missingReasons.push(`Tasa de Master Broker ausente para tipo '${commType}' en oferta '${offer?.name || params.offerId}'`);
    }
    if (!brk.provided) {
      missingReasons.push(`Tasa de Broker ausente para tipo '${commType}' en oferta '${offer?.name || params.offerId}'`);
    }

    return {
      source: "offer_version",
      offerId: params.offerId,
      versionNumber: version?.versionNumber ?? offer?.currentVersionNumber ?? 1,
      financiera: fin,
      masterBroker: mb,
      broker: brk,
      overrateCommissionRate: commRates.overrateCommissionRate ? Number(commRates.overrateCommissionRate) : undefined,
      platformGrossMarginDirect: commRates.platformGrossMarginDirect !== undefined ? Number(commRates.platformGrossMarginDirect) : undefined,
      platformGrossMarginMaster: commRates.platformGrossMarginMaster !== undefined ? Number(commRates.platformGrossMarginMaster) : undefined,
      hasMissingRequiredRate: missingReasons.length > 0,
      missingRateReasons: missingReasons,
      notes: commRates.notes || null,
    };
  }

  // 3. Fallback retrocompatible para operaciones legadas sin oferta comercial
  const inst = params.institution || {};
  const instRates = inst.commissionRates || {};
  const fin = parseRateValue(
    instRates.financiera?.[commType] ??
    instRates.financiera?.apertura ??
    inst.openingCommissionRate ??
    inst.commissionRate ??
    0
  );
  const mb = parseRateValue(
    instRates.masterBroker?.[commType] ??
    instRates.masterBroker?.apertura ??
    inst.masterBrokerCommissionRate ??
    0
  );
  const brk = parseRateValue(
    instRates.broker?.[commType] ??
    instRates.broker?.apertura ??
    inst.brokerCommissionRate ??
    inst.commissionRate ??
    0
  );

  return {
    source: "institution_legacy",
    financiera: fin,
    masterBroker: mb,
    broker: brk,
    hasMissingRequiredRate: false,
    missingRateReasons: [],
    notes: null,
  };
}

/**
 * Realiza la auditoría canónica de liquidación de comisiones.
 * Garantiza pago único para Master Directo y detecta inconsistencias en importes congelados.
 */
export function auditCommissionPayout(comm: {
  id?: string;
  amount?: string | number | null;
  brokerShare?: string | number | null;
  masterBrokerShare?: string | number | null;
  frozenAmount?: string | number | null;
  brokerId?: string | null;
  masterBrokerId?: string | null;
  originMasterBrokerId?: string | null;
  status?: string | null;
}): CommissionPayoutAuditResult {
  const brokerShare = parseFloat(String(comm.brokerShare || "0")) || 0;
  const masterBrokerShare = parseFloat(String(comm.masterBrokerShare || "0")) || 0;
  const grossAmount = parseFloat(String(comm.amount || "0")) || 0;

  const historicalMasterId = comm.masterBrokerId || comm.originMasterBrokerId || null;
  const isMasterDirect = Boolean(
    historicalMasterId && comm.brokerId && String(comm.brokerId) === String(historicalMasterId)
  );

  const singleShare = masterBrokerShare > 0 ? masterBrokerShare : brokerShare > 0 ? brokerShare : grossAmount;
  const isMb = Boolean(historicalMasterId && masterBrokerShare > 0);

  // Importe legítimo esperado
  const expectedAmount = isMasterDirect
    ? singleShare
    : isMb
    ? brokerShare + masterBrokerShare
    : brokerShare > 0
    ? brokerShare
    : grossAmount;

  const isFrozenExplicit =
    comm.frozenAmount !== undefined && comm.frozenAmount !== null && String(comm.frozenAmount).trim() !== "";

  if (isFrozenExplicit) {
    const frozen = parseFloat(String(comm.frozenAmount));

    // Regla 1: Un importe congelado explícito de $0.00 nunca debe convertirse en un pago positivo
    if (isNaN(frozen) || frozen <= 0) {
      return {
        payoutAmount: 0,
        expectedAmount,
        frozenAmount: isNaN(frozen) ? 0 : frozen,
        hasDiscrepancy: expectedAmount > 0,
        discrepancyReason: `Importe congelado explícito de $0.00 detectado (importe esperado: $${expectedAmount.toFixed(2)}). Requiere revisión administrativa auditada.`,
        isMasterDirect,
      };
    }

    // Regla 2: Para Master Directo, si el importe congelado duplica la cuota única
    if (isMasterDirect && frozen > singleShare + 0.01) {
      return {
        payoutAmount: singleShare,
        expectedAmount: singleShare,
        frozenAmount: frozen,
        hasDiscrepancy: true,
        discrepancyReason: `Discrepancia en importe congelado: El importe congelado ($${frozen.toFixed(2)}) excede la participación legítima ($${singleShare.toFixed(2)}) para Master Directo. Posible doble conteo histórico detectado. Requiere revisión administrativa auditada antes de su liquidación.`,
        isMasterDirect,
      };
    }

    // Regla 3: Si difiere significativamente del cálculo reglamentario
    if (!isMasterDirect && Math.abs(frozen - expectedAmount) > 0.01) {
      return {
        payoutAmount: frozen,
        expectedAmount,
        frozenAmount: frozen,
        hasDiscrepancy: true,
        discrepancyReason: `Discrepancia en importe congelado: El importe congelado ($${frozen.toFixed(2)}) difiere del cálculo reglamentario ($${expectedAmount.toFixed(2)}). Requiere revisión administrativa auditada antes de su liquidación.`,
        isMasterDirect,
      };
    }

    return {
      payoutAmount: isMasterDirect ? singleShare : frozen,
      expectedAmount,
      frozenAmount: frozen,
      hasDiscrepancy: false,
      discrepancyReason: null,
      isMasterDirect,
    };
  }

  return {
    payoutAmount: expectedAmount,
    expectedAmount,
    frozenAmount: null,
    hasDiscrepancy: false,
    discrepancyReason: null,
    isMasterDirect,
  };
}

/**
 * Obtiene el monto líquido definitivo de una comisión asegurando liquidación única y sin duplicidad.
 */
export function getCommissionPayoutAmount(
  comm: {
    id?: string;
    amount?: string | number | null;
    brokerShare?: string | number | null;
    masterBrokerShare?: string | number | null;
    frozenAmount?: string | number | null;
    brokerId?: string | null;
    masterBrokerId?: string | null;
    originMasterBrokerId?: string | null;
    status?: string | null;
  },
  options?: { throwOnDiscrepancy?: boolean }
): number {
  const audit = auditCommissionPayout(comm);
  if (options?.throwOnDiscrepancy && audit.hasDiscrepancy) {
    throw new CommissionFrozenDiscrepancyError(
      audit.discrepancyReason || "Discrepancia en importe congelado",
      {
        frozenAmount: audit.frozenAmount ?? 0,
        expectedAmount: audit.expectedAmount,
        commissionId: comm.id,
      }
    );
  }
  return audit.payoutAmount;
}

export interface CascadingCommissionInput {
  credit?: any;
  creditId?: string;
  brokerId?: string;
  masterBrokerId?: string | null;
  commissionType: string;
  dispersedAmount?: number; // Monto efectivamente dispersado y confirmado (Regla 4)
  confirmedDisbursedAmount?: number;
  financialInstitutionId?: string | null;
  institutionProductId?: string | null;
  versionNumber?: number | null;
  financieraRate?: number;
  masterBrokerRate?: number;
  brokerRate?: number;
  isMasterDirect?: boolean;
  performedBy?: string | null;
  idempotencyKey?: string | null;
  dispersalIndex?: number;
  strictRateCheck?: boolean;
}

/**
 * Calcula y persiste las comisiones en cascada de acuerdo a la oferta versionada y
 * el monto efectivamente dispersado, con atribución histórica e idempotencia.
 */
export async function calculateAndPersistCascadingCommission(params: CascadingCommissionInput): Promise<Commission> {
  const linkedCredit = params.credit || (params.creditId ? await storage.getCredit(params.creditId) : null);
  const creditId = params.creditId || linkedCredit?.id;
  const brokerId = params.brokerId || linkedCredit?.brokerId;
  const masterBrokerId = params.masterBrokerId !== undefined ? params.masterBrokerId : (linkedCredit?.originMasterBrokerId ?? null);
  const dispersedAmount = params.confirmedDisbursedAmount ?? params.dispersedAmount ?? (linkedCredit ? parseFloat(linkedCredit.amount || '0') : 0);
  const financialInstitutionId = params.financialInstitutionId ?? linkedCredit?.financialInstitutionId;
  const institutionProductId = params.institutionProductId;
  const versionNumber = params.versionNumber;
  const commissionType = params.commissionType;
  const isMasterDirect = params.isMasterDirect;
  const performedBy = params.performedBy;
  const idempotencyKey = params.idempotencyKey;
  const dispersalIndex = params.dispersalIndex;
  const strictRateCheck = params.strictRateCheck ?? true;

  if (!creditId || !brokerId) {
    throw new Error("creditId y brokerId son obligatorios para calcular la comisión.");
  }

  // 1. Verificación de Idempotencia previa
  if (idempotencyKey) {
    const existingKeyComms = await storage.getCommissions({ idempotencyKey });
    if (existingKeyComms.length > 0) {
      console.log(`[Commission Idempotency] Retornando comisión existente para idempotencyKey=${idempotencyKey}`);
      return existingKeyComms[0];
    }
  }

  // 2. Resolver crédito y afiliación histórica
  const historicalMasterBrokerId = masterBrokerId;

  const resolvedIsMasterDirect = isMasterDirect !== undefined
    ? isMasterDirect
    : Boolean(historicalMasterBrokerId && brokerId && String(historicalMasterBrokerId) === String(brokerId));

  // 3. Resolución de tasas de la oferta comercial versionada
  let resolvedFinRate = params.financieraRate;
  let resolvedMbRate = params.masterBrokerRate;
  let resolvedBrkRate = params.brokerRate;
  const finalProposal = (linkedCredit?.finalProposal as any) || {};
  let isOfferBound = Boolean(institutionProductId || finalProposal.institutionProductId);

  if (
    resolvedFinRate === undefined ||
    resolvedMbRate === undefined ||
    resolvedBrkRate === undefined
  ) {
    const ratesResolution = await resolveOfferVersionCommissionRates({
      offerId: institutionProductId || finalProposal.institutionProductId || finalProposal.offerId,
      versionNumber: versionNumber || finalProposal.versionNumber,
      commissionType,
      proposalCommissionRates: finalProposal.commissionRates,
      institution: financialInstitutionId ? await storage.getFinancialInstitution(financialInstitutionId) : null,
      isMasterDirect: resolvedIsMasterDirect,
      hasMasterBroker: Boolean(historicalMasterBrokerId),
    });

    if (ratesResolution.source === "offer_version") {
      isOfferBound = true;
    }

    // Regla 4 y COM-14: Si la oferta versionada tiene una tasa requerida ausente
    if (ratesResolution.hasMissingRequiredRate) {
      const errorMsg = `[COM-14] Tasa ausente en oferta versionada: ${ratesResolution.missingRateReasons.join("; ")}`;
      if (strictRateCheck) {
        throw new MissingCommissionRateError(errorMsg, {
          offerId: ratesResolution.offerId,
          versionNumber: ratesResolution.versionNumber,
          commissionType,
          participantRole: ratesResolution.missingRateReasons[0] || "unknown",
        });
      }
    }

    resolvedFinRate = resolvedFinRate ?? ratesResolution.financiera.rate;
    resolvedMbRate = resolvedMbRate ?? ratesResolution.masterBroker.rate;
    resolvedBrkRate = resolvedBrkRate ?? ratesResolution.broker.rate;
  }

  // Respetar tasa cero explícitamente autorizada
  let safeBrokerRate = Number.isFinite(resolvedBrkRate) && resolvedBrkRate >= 0 ? resolvedBrkRate : 0;
  const safeMasterRate = Number.isFinite(resolvedMbRate) && resolvedMbRate >= 0 ? resolvedMbRate : 0;
  const safeFinRate = Number.isFinite(resolvedFinRate) && resolvedFinRate >= 0 ? resolvedFinRate : 0;

  let brokerAmount = 0;
  let masterBrokerAmount = 0;
  let ceilingRate = 0;

  if (resolvedIsMasterDirect) {
    // 1. Master Broker originador directo: cuota única
    masterBrokerAmount = (dispersedAmount * safeMasterRate) / 100;
    brokerAmount = masterBrokerAmount;
    ceilingRate = safeMasterRate;
  } else if (historicalMasterBrokerId) {
    // 2. Broker en red: verificar tasa de red personalizada por el Master
    try {
      const mbUser = await storage.getUser(historicalMasterBrokerId);
      const networkRates = (mbUser?.networkCommissionRates as any) || {};
      const finId = financialInstitutionId || linkedCredit?.financialInstitutionId;

      if (finId && networkRates[finId]) {
        const customRate = networkRates[finId][commissionType] ?? networkRates[finId].apertura;
        if (customRate !== undefined && !isNaN(parseFloat(customRate))) {
          safeBrokerRate = Math.min(safeMasterRate, Math.max(0, parseFloat(customRate)));
        }
      }
    } catch (mbErr) {
      console.warn("[Commission] Could not read MB network rates:", mbErr);
    }

    brokerAmount = (dispersedAmount * safeBrokerRate) / 100;
    masterBrokerAmount = (dispersedAmount * safeMasterRate) / 100;
    ceilingRate = safeBrokerRate + safeMasterRate;

    // Control: sin distribuciones superiores a lo autorizado por la financiera (Regla 2)
    if (safeFinRate > 0 && ceilingRate > safeFinRate + 0.0001) {
      throw new Error(
        `Distribución económica no autorizada: La suma de tasas Broker (${safeBrokerRate}%) + Master (${safeMasterRate}%) = ${ceilingRate}% excede la tasa máxima autorizada por la financiera (${safeFinRate}%).`
      );
    }
  } else {
    // 3. Broker Directo independiente
    brokerAmount = (dispersedAmount * safeBrokerRate) / 100;
    masterBrokerAmount = 0;
    ceilingRate = safeBrokerRate;

    if (safeFinRate > 0 && ceilingRate > safeFinRate + 0.0001) {
      throw new Error(
        `Distribución económica no autorizada: La tasa del Broker (${safeBrokerRate}%) excede la tasa máxima autorizada por la financiera (${safeFinRate}%).`
      );
    }
  }

  // Margen de plataforma
  const platformNetRate = Math.max(0, safeFinRate - ceilingRate);
  const appAmount = (dispersedAmount * platformNetRate) / 100;

  // Importe total bruto otorgado por la financiera (COM-06)
  const totalGrossAmount = resolvedIsMasterDirect
    ? masterBrokerAmount + appAmount
    : brokerAmount + masterBrokerAmount + appAmount;

  // Tipo de comisión considerando multidispersión para evitar colisión en índice único
  const resolvedCommissionType = dispersalIndex != null
    ? `${commissionType}_parcial_${dispersalIndex}`
    : commissionType;

  // Buscar registro duplicado para este crédito y tipo
  const existing = await storage.getCommissions({ creditId });
  const duplicate = existing.find(
    (c) =>
      (idempotencyKey && c.idempotencyKey === idempotencyKey) ||
      c.commissionType === resolvedCommissionType
  );

  let commission: Commission;

  if (duplicate) {
    // Inmutabilidad estricta contra recálculo en estados congelados
    if (["approved", "dispersing", "paid"].includes(duplicate.status)) {
      console.warn(`[Commission Inmutabilidad] Comisión ${duplicate.id} en '${duplicate.status}' queda congelada.`);
      if (Math.abs(parseFloat(duplicate.amount || "0") - totalGrossAmount) > 0.01) {
        try {
          await storage.createCommissionAuditLog({
            commissionId: duplicate.id,
            action: "credit_modified_incident",
            performedBy: performedBy || null,
            previousStatus: duplicate.status,
            newStatus: duplicate.status,
            details: {
              reason: "Intento de recálculo sobre comisión congelada por evento de dispersión",
              frozenAmount: duplicate.frozenAmount || duplicate.amount,
              attemptedGrossAmount: totalGrossAmount.toFixed(2),
            },
          });
        } catch (e) {}
      }
      return duplicate;
    }

    // Actualización de comisión en estado 'generated' o 'pending'
    const updated = await storage.updateCommission(duplicate.id, {
      amount: totalGrossAmount.toFixed(2),
      brokerShare: brokerAmount.toFixed(2),
      masterBrokerShare: masterBrokerAmount.toFixed(2),
      appShare: appAmount.toFixed(2),
      idempotencyKey: idempotencyKey || duplicate.idempotencyKey,
    });
    commission = updated || duplicate;

    try {
      await storage.createCommissionAuditLog({
        commissionId: duplicate.id,
        action: "recalculated",
        performedBy: performedBy || null,
        previousStatus: duplicate.status,
        newStatus: duplicate.status,
        details: {
          dispersedAmount,
          amount: totalGrossAmount.toFixed(2),
          brokerShare: brokerAmount.toFixed(2),
          masterBrokerShare: masterBrokerAmount.toFixed(2),
          appShare: appAmount.toFixed(2),
          isOfferBound,
        },
      });
    } catch (e) {}
  } else {
    let resolvedTenantId = linkedCredit?.tenantId || null;
    if (!resolvedTenantId && brokerId) {
      try {
        const memberships = await storage.getTenantMembersByUser(brokerId);
        const activeMem = memberships.find((m: any) => m.isActive);
        if (activeMem) resolvedTenantId = activeMem.tenantId;
      } catch (e) {}
    }

    commission = await storage.createCommission({
      creditId,
      tenantId: resolvedTenantId,
      brokerId,
      masterBrokerId: historicalMasterBrokerId || null,
      amount: totalGrossAmount.toFixed(2),
      brokerShare: brokerAmount.toFixed(2),
      masterBrokerShare: masterBrokerAmount.toFixed(2),
      appShare: appAmount.toFixed(2),
      status: "generated",
      commissionType: resolvedCommissionType,
      idempotencyKey: idempotencyKey || null,
      notes: isOfferBound
        ? `Calculado sobre oferta versionada (monto dispersado $${dispersedAmount.toFixed(2)})`
        : null,
    });

    try {
      await storage.createCommissionAuditLog({
        commissionId: commission.id,
        action: "created",
        performedBy: performedBy || null,
        previousStatus: null,
        newStatus: "generated",
        details: {
          creditId,
          tenantId: resolvedTenantId,
          commissionType: resolvedCommissionType,
          dispersedAmount,
          amount: totalGrossAmount.toFixed(2),
          brokerShare: brokerAmount.toFixed(2),
          masterBrokerShare: masterBrokerAmount.toFixed(2),
          appShare: appAmount.toFixed(2),
          resolvedIsMasterDirect,
          isOfferBound,
          idempotencyKey: idempotencyKey || null,
        },
      });
    } catch (e) {}
  }

  return commission;
}
