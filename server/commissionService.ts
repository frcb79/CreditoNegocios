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
 * Error lanzado cuando una versión específica requerida de una oferta no existe (COM-17).
 * Prohibido sustituirla silenciosamente por otra versión.
 */
export class MissingOfferVersionError extends Error {
  public readonly code = "MISSING_OFFER_VERSION";
  public readonly offerId: string;
  public readonly versionNumber: number;

  constructor(offerId: string, versionNumber: number, offerName?: string | null) {
    super(
      `[COM-17] Versión requerida no encontrada: La versión ${versionNumber} de la oferta '${offerName || offerId}' no existe. Prohibido sustituir silenciosamente por otra versión.`
    );
    this.name = "MissingOfferVersionError";
    this.offerId = offerId;
    this.versionNumber = versionNumber;
  }
}

/**
 * Error lanzado cuando se intenta calcular comisiones sin un desembolso efectivamente confirmado (COM-18).
 * Prohibido utilizar automáticamente el monto solicitado o aprobado del crédito.
 */
export class UnconfirmedDispersalAmountError extends Error {
  public readonly code = "UNCONFIRMED_DISPERSAL_AMOUNT";

  constructor(message?: string) {
    super(
      message ||
        "[COM-18] Dispersión no confirmada: El cálculo de comisiones requiere un monto de dispersión efectivamente confirmado y verificable en servidor. Prohibido utilizar automáticamente el monto solicitado o aprobado."
    );
    this.name = "UnconfirmedDispersalAmountError";
  }
}

/**
 * Error lanzado cuando la distribución económica Broker + Master + plataforma excede lo autorizado por la financiera (COM-19).
 */
export class UnauthorizedDistributionError extends Error {
  public readonly code = "UNAUTHORIZED_ECONOMIC_DISTRIBUTION";
  public readonly totalDistributedRate: number;
  public readonly authorizedRate: number;

  constructor(message: string, totalDistributedRate?: number, authorizedRate?: number) {
    super(message);
    this.name = "UnauthorizedDistributionError";
    this.totalDistributedRate = totalDistributedRate ?? 0;
    this.authorizedRate = authorizedRate ?? 0;
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

/**
 * Error lanzado cuando se intenta modificar un snapshot comercial previamente congelado (COM-22).
 */
export class ImmutableCommercialSnapshotError extends Error {
  public readonly code = "COMMERCIAL_SNAPSHOT_IMMUTABLE";
  public readonly details?: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = "ImmutableCommercialSnapshotError";
    this.details = details;
  }
}

export interface CommissionPayoutAuditResult {
  payoutAmount: number;
  expectedAmount: number;
  frozenAmount: number | null;
  hasDiscrepancy: boolean;
  discrepancyReason: string | null;
  isMasterDirect: boolean;
  beneficiaryShares: {
    broker: { userId: string | null; amount: number };
    masterBroker: { userId: string | null; amount: number } | null;
  };
  networkObligation?: {
    brokerId: string | null;
    brokerShare: number;
    masterBrokerId: string | null;
    status: 'pending_master_payout';
    notes: string;
  } | null;
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
  isFrozenSnapshot?: boolean;
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

  // 1. Si existe un snapshot explícito congelado en la propuesta comercial (COM-07, COM-16, COM-20)
  if (params.proposalCommissionRates && typeof params.proposalCommissionRates === "object") {
    const pr = params.proposalCommissionRates;
    const fin = parseRateValue(
      pr.financiera?.[commType] ??
      pr.financiera?.apertura ??
      pr.financiera?.total ??
      pr.financiera?.rate ??
      (typeof pr.financiera === 'number' || typeof pr.financiera === 'string' ? pr.financiera : undefined) ??
      pr.superAdmin?.[commType] ??
      pr.superAdmin?.apertura
    );
    const mb = parseRateValue(
      pr.masterBroker?.[commType] ??
      pr.masterBroker?.apertura ??
      pr.masterBroker?.total ??
      pr.masterBroker?.rate ??
      (typeof pr.masterBroker === 'number' || typeof pr.masterBroker === 'string' ? pr.masterBroker : undefined)
    );
    const brk = parseRateValue(
      pr.broker?.[commType] ??
      pr.broker?.apertura ??
      pr.broker?.total ??
      pr.broker?.rate ??
      (typeof pr.broker === 'number' || typeof pr.broker === 'string' ? pr.broker : undefined)
    );
    const resolvedBrk = (params.isMasterDirect && !brk.provided && mb.provided) ? mb : brk;

    if (!fin.provided) missingReasons.push(`Financiera (${commType})`);
    if (params.hasMasterBroker && !mb.provided) missingReasons.push(`Master Broker (${commType})`);
    if (!params.isMasterDirect && !brk.provided) missingReasons.push(`Broker Directo (${commType})`);
    if (params.isMasterDirect && !resolvedBrk.provided && !mb.provided) missingReasons.push(`Master Broker Directo (${commType})`);

    return {
      source: "proposal_snapshot",
      offerId: params.offerId || undefined,
      versionNumber: params.versionNumber || undefined,
      financiera: fin,
      masterBroker: mb,
      broker: resolvedBrk,
      hasMissingRequiredRate: missingReasons.length > 0,
      missingRateReasons: missingReasons,
      notes: pr.notes || null,
      isFrozenSnapshot: true,
    };
  }

  // 2. Si se especifica una oferta versionada (institutionProductId / offerId) (COM-17)
  if (params.offerId) {
    const offer = await storage.getInstitutionProduct(params.offerId);
    if (!offer) {
      throw new Error(`[COM-17] Oferta con ID '${params.offerId}' no encontrada.`);
    }
    const allVersions = await storage.getInstitutionProductVersions(params.offerId);
    let version = null;
    if (params.versionNumber != null) {
      version = allVersions.find((v) => v.versionNumber === params.versionNumber) || null;
      if (!version) {
        // REGLA 2 (COM-17): Si una versión requerida no existe, bloquear el cálculo. Prohibido sustituirla silenciosamente.
        throw new MissingOfferVersionError(params.offerId, params.versionNumber, offer.name);
      }
    } else {
      // Si no se especifica versión explícita, buscar la versión publicada/activa
      version = allVersions.find((v) => v.status === "published" || v.status === "active") || null;
      if (!version && allVersions.length > 0) {
        version = allVersions[0];
      }
      if (!version) {
        throw new MissingOfferVersionError(params.offerId, 1, offer.name);
      }
    }

    const conditions = (version?.conditions as any) || (offer?.configuration as any) || {};
    const commRates = conditions.commissionRates || {};

    const fin = parseRateValue(commRates.financiera?.[commType] ?? commRates.financiera?.apertura ?? commRates.financiera?.total);
    const mb = parseRateValue(commRates.masterBroker?.[commType] ?? commRates.masterBroker?.apertura ?? commRates.masterBroker?.total);
    const brk = parseRateValue(commRates.broker?.[commType] ?? commRates.broker?.apertura ?? commRates.broker?.total);
    const resolvedBrk = (params.isMasterDirect && !brk.provided && mb.provided) ? mb : brk;

    // REGLA 4 y 6: Diferenciar tasa cero configurada de tasa ausente. No recurrir a fallbacks institucionales para ofertas versionadas.
    if (!fin.provided) {
      missingReasons.push(`Tasa de Financiera ausente para tipo '${commType}' en versión ${version.versionNumber} de oferta '${offer.name}'`);
    }
    if (params.hasMasterBroker && !mb.provided) {
      missingReasons.push(`Tasa de Master Broker ausente para tipo '${commType}' en versión ${version.versionNumber} de oferta '${offer.name}'`);
    }
    if (!params.isMasterDirect && !brk.provided) {
      missingReasons.push(`Tasa de Broker ausente para tipo '${commType}' en versión ${version.versionNumber} de oferta '${offer.name}'`);
    }

    return {
      source: "offer_version",
      offerId: params.offerId,
      versionNumber: version.versionNumber ?? offer.currentVersionNumber ?? 1,
      financiera: fin,
      masterBroker: mb,
      broker: resolvedBrk,
      overrateCommissionRate: commRates.overrateCommissionRate ? Number(commRates.overrateCommissionRate) : undefined,
      platformGrossMarginDirect: commRates.platformGrossMarginDirect !== undefined ? Number(commRates.platformGrossMarginDirect) : undefined,
      platformGrossMarginMaster: commRates.platformGrossMarginMaster !== undefined ? Number(commRates.platformGrossMarginMaster) : undefined,
      hasMissingRequiredRate: missingReasons.length > 0,
      missingRateReasons: missingReasons,
      notes: commRates.notes || null,
      isFrozenSnapshot: false,
    };
  }

  // 3. Fallback retrocompatible para operaciones legadas sin oferta comercial (Regla 6)
  const inst = params.institution || {};
  const instRates = inst.commissionRates || {};
  const finRaw = instRates.financiera?.[commType] ?? instRates.financiera?.apertura ?? inst.openingCommissionRate ?? inst.commissionRate;
  const mbRaw = instRates.masterBroker?.[commType] ?? instRates.masterBroker?.apertura ?? inst.masterBrokerCommissionRate;
  const brkRaw = instRates.broker?.[commType] ?? instRates.broker?.apertura ?? inst.brokerCommissionRate ?? inst.commissionRate;

  const fin = parseRateValue(finRaw);
  const mb = parseRateValue(mbRaw);
  const brk = parseRateValue(brkRaw);

  // REGLA 6: Operaciones legacy solo con información económica verificable. No rellenar con ceros silenciosos.
  if (!fin.provided && !mb.provided && !brk.provided) {
    missingReasons.push(`Operación legacy sin información económica verificable en institución '${inst.name || 'desconocida'}'`);
  }

  return {
    source: "institution_legacy",
    financiera: fin,
    masterBroker: mb,
    broker: brk,
    hasMissingRequiredRate: missingReasons.length > 0,
    missingRateReasons: missingReasons,
    notes: null,
    isFrozenSnapshot: false,
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
  // El canal de pago lo determina la atribución histórica, no si la cuota propia del Master es positiva.
  const isMb = Boolean(historicalMasterId && !isMasterDirect);

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

  const beneficiaryShares = {
    broker: {
      userId: comm.brokerId || null,
      amount: isMasterDirect ? singleShare : brokerShare,
    },
    masterBroker: (isMb && !isMasterDirect)
      ? {
          userId: historicalMasterId,
          amount: masterBrokerShare,
        }
      : null,
  };

  const networkObligation = (isMb && !isMasterDirect)
    ? {
        brokerId: comm.brokerId || null,
        brokerShare,
        masterBrokerId: historicalMasterId,
        status: 'pending_master_payout' as const,
        notes: 'Crédito Negocios liquida al Master Bróker. La dispersión al Bróker de red es obligación posterior del Master.',
      }
    : null;

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
        beneficiaryShares,
        networkObligation,
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
        beneficiaryShares,
        networkObligation,
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
        beneficiaryShares,
        networkObligation,
      };
    }

    return {
      payoutAmount: isMasterDirect ? singleShare : frozen,
      expectedAmount,
      frozenAmount: frozen,
      hasDiscrepancy: false,
      discrepancyReason: null,
      isMasterDirect,
      beneficiaryShares,
      networkObligation,
    };
  }

  return {
    payoutAmount: expectedAmount,
    expectedAmount,
    frozenAmount: null,
    hasDiscrepancy: false,
    discrepancyReason: null,
    isMasterDirect,
    beneficiaryShares,
    networkObligation,
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
  /** Compute a canonical immutable draft without writing; PostgreSQL confirms it atomically. */
  previewOnly?: boolean;
}

/**
 * Calcula y persiste las comisiones en cascada de acuerdo a la oferta versionada y
 * el monto efectivamente dispersado, con atribución histórica e idempotencia.
 */
export function calculateAndPersistCascadingCommission(params: CascadingCommissionInput & { previewOnly: true }): Promise<InsertCommission>;
export function calculateAndPersistCascadingCommission(params: CascadingCommissionInput): Promise<Commission>;
export async function calculateAndPersistCascadingCommission(params: CascadingCommissionInput): Promise<Commission | InsertCommission> {
  const linkedCredit = params.credit || (params.creditId ? await storage.getCredit(params.creditId) : null);
  const creditId = params.creditId || linkedCredit?.id;
  const brokerId = params.brokerId || linkedCredit?.brokerId;
  const masterBrokerId = params.masterBrokerId !== undefined
    ? params.masterBrokerId
    : (linkedCredit?.originMasterBrokerId ?? (linkedCredit?.finalProposal as any)?.originMasterBrokerId ?? null);

  // REGLA 3 (COM-18): Calcular comisiones únicamente sobre desembolsos efectivamente confirmados y verificables en servidor.
  // Prohibido utilizar automáticamente el monto solicitado o aprobado del crédito.
  const rawConfirmedAmount = params.confirmedDisbursedAmount ?? params.dispersedAmount;
  if (
    rawConfirmedAmount === undefined ||
    rawConfirmedAmount === null ||
    isNaN(Number(rawConfirmedAmount)) ||
    Number(rawConfirmedAmount) <= 0
  ) {
    throw new UnconfirmedDispersalAmountError(
      "[COM-18] Cálculo de comisiones bloqueado: Se requiere un monto de dispersión efectivamente confirmado y verificable en servidor. Prohibido utilizar automáticamente el monto solicitado o aprobado."
    );
  }
  const dispersedAmount = Number(rawConfirmedAmount);

  const financialInstitutionId = params.financialInstitutionId ?? linkedCredit?.financialInstitutionId;
  const institutionProductId = params.institutionProductId;
  const versionNumber = params.versionNumber;
  const commissionType = params.commissionType;
  const isMasterDirect = params.isMasterDirect;
  const performedBy = params.performedBy;
  const idempotencyKey = params.idempotencyKey;
  const dispersalIndex = params.dispersalIndex;
  // REGLA 3 (COM-23): Cálculo canónico obligatorio. strictRateCheck es siempre obligatorio.
  // Se prohíbe el uso de strictRateCheck: false para omitir validaciones.
  const strictRateCheck = true;

  if (!creditId || !brokerId) {
    throw new Error("creditId y brokerId son obligatorios para calcular la comisión.");
  }

  // 1. Verificación de Idempotencia previa (Regla 3)
  if (idempotencyKey && !params.previewOnly) {
    const existingKeyComms = await storage.getCommissions({ idempotencyKey });
    if (existingKeyComms.length > 0) {
      console.log(`[Commission Idempotency] Retornando comisión existente para idempotencyKey=${idempotencyKey}`);
      return existingKeyComms[0];
    }
  }

  // 2. Resolver crédito y afiliación histórica (Regla 1 y 5)
  const historicalMasterBrokerId = masterBrokerId;

  const resolvedIsMasterDirect = isMasterDirect !== undefined
    ? isMasterDirect
    : Boolean(historicalMasterBrokerId && brokerId && String(historicalMasterBrokerId) === String(brokerId));

  // 3. Resolución de tasas de la propuesta comercial o de la oferta versionada
  let resolvedFinRate = params.financieraRate;
  let resolvedMbRate = params.masterBrokerRate ?? (historicalMasterBrokerId ? undefined : 0);
  let resolvedBrkRate = params.brokerRate;
  const finalProposal = (linkedCredit?.finalProposal as any) || {};
  let isOfferBound = Boolean(institutionProductId || finalProposal.institutionProductId);
  let isFrozenProposal = Boolean(finalProposal.commissionRates && typeof finalProposal.commissionRates === "object");

  if (
    resolvedFinRate === undefined ||
    resolvedMbRate === undefined ||
    resolvedBrkRate === undefined
  ) {
    const ratesResolution = await resolveOfferVersionCommissionRates({
      offerId: institutionProductId || finalProposal.institutionProductId || finalProposal.offerId,
      versionNumber: versionNumber ?? finalProposal.versionNumber,
      commissionType,
      proposalCommissionRates: finalProposal.commissionRates,
      institution: financialInstitutionId ? await storage.getFinancialInstitution(financialInstitutionId) : null,
      isMasterDirect: resolvedIsMasterDirect,
      hasMasterBroker: Boolean(historicalMasterBrokerId),
    });

    if (ratesResolution.source === "offer_version") {
      isOfferBound = true;
    }
    if (ratesResolution.source === "proposal_snapshot" || ratesResolution.isFrozenSnapshot) {
      isFrozenProposal = true;
    }

    // Regla 4, 6 y COM-14: Si la tasa requerida está ausente
    if (ratesResolution.hasMissingRequiredRate) {
      const errorMsg = `[COM-14] Tasa ausente en oferta o propuesta: ${ratesResolution.missingRateReasons.join("; ")}`;
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

  // Respetar tasa cero explícitamente autorizada (Regla 4)
  const safeBrokerRate = Number.isFinite(resolvedBrkRate) && resolvedBrkRate >= 0 ? resolvedBrkRate : 0;
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
    // 2. Broker en red:
    // REGLA 3 (COM-23) y REGLA 5 (COM-20): Cálculo canónico obligatorio.
    // NUNCA consultar ni recalcular operaciones utilizando tarifas actuales del Master Broker (networkCommissionRates).
    // Las tasas provienen canónicamente de la oferta versionada, el snapshot congelado o parámetros históricos fijados.
    brokerAmount = (dispersedAmount * safeBrokerRate) / 100;
    masterBrokerAmount = (dispersedAmount * safeMasterRate) / 100;
    ceilingRate = safeBrokerRate + safeMasterRate;

    // REGLA 4 (COM-19): Control estricto de distribución económica, incluyendo cuando la financiera autorizó 0%
    if (ceilingRate > safeFinRate + 0.0001) {
      throw new UnauthorizedDistributionError(
        `[COM-19] Distribución económica no autorizada: La suma de tasas Broker (${safeBrokerRate}%) + Master (${safeMasterRate}%) = ${ceilingRate}% excede la tasa máxima autorizada por la financiera (${safeFinRate}%).`,
        ceilingRate,
        safeFinRate
      );
    }
  } else {
    // 3. Broker Directo independiente
    brokerAmount = (dispersedAmount * safeBrokerRate) / 100;
    masterBrokerAmount = 0;
    ceilingRate = safeBrokerRate;

    // REGLA 4 (COM-19): Control estricto de distribución económica
    if (ceilingRate > safeFinRate + 0.0001) {
      throw new UnauthorizedDistributionError(
        `[COM-19] Distribución económica no autorizada: La tasa del Broker (${safeBrokerRate}%) excede la tasa máxima autorizada por la financiera (${safeFinRate}%).`,
        ceilingRate,
        safeFinRate
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

  // Tipo de comisión considerando multidispersión para evitar colisión en índice único (Regla 3)
  const resolvedCommissionType = dispersalIndex != null
    ? `${commissionType}_parcial_${dispersalIndex}`
    : commissionType;

  if (params.previewOnly) {
    // Safe preview: read business metadata but never write a commission or audit.
    // The database transaction will enforce row uniqueness and frozen affiliation.
    const previewTenantId = linkedCredit?.tenantId || null;
    return {
      creditId,
      tenantId: previewTenantId,
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
        ? `Calculado sobre oferta versionada (monto dispersado ${dispersedAmount.toFixed(2)})`
        : null,
    };
  }

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

/**
 * REGLA 1 (COM-07, COM-16): Congelamiento comercial al consolidar formalmente la propuesta.
 * Preserva oferta, versión, tasas pactadas, Broker originador y Master beneficiario.
 * Diferencia este snapshot del cálculo definitivo sobre la dispersión.
 */
export function consolidateCommercialProposalSnapshot(params: {
  credit?: any;
  proposalData: any;
  institution?: any;
}): any {
  const credit = params.credit || {};
  const data = params.proposalData || {};

  // REGLA 2 (COM-22): Snapshot comercial inmutable.
  // Si ya existe un snapshot comercial formalmente congelado, se prohíbe modificar oferta, versión,
  // tasas pactadas, Broker originador o Master beneficiario.
  const existingSnapshot = credit.finalProposal;
  if (existingSnapshot && (existingSnapshot as any).isCommercialSnapshot) {
    const oldOfferId = existingSnapshot.institutionProductId || existingSnapshot.offerId || null;
    const newOfferId = data.institutionProductId || data.offerId || null;
    const offerMismatch = newOfferId !== null && oldOfferId !== null && String(newOfferId) !== String(oldOfferId);

    const oldVer = existingSnapshot.versionNumber ?? null;
    const newVer = data.versionNumber ?? null;
    const verMismatch = newVer !== null && oldVer !== null && Number(newVer) !== Number(oldVer);

    const oldBroker = existingSnapshot.originBrokerId || existingSnapshot.brokerId || null;
    const newBroker = data.originBrokerId || data.brokerId || null;
    const brokerMismatch = newBroker !== null && oldBroker !== null && String(newBroker) !== String(oldBroker);

    const oldMaster = existingSnapshot.originMasterBrokerId !== undefined ? existingSnapshot.originMasterBrokerId : (existingSnapshot.masterBrokerId ?? null);
    const newMaster = data.originMasterBrokerId !== undefined ? data.originMasterBrokerId : (data.masterBrokerId ?? null);
    const masterMismatch = newMaster !== null && oldMaster !== null && String(newMaster) !== String(oldMaster);

    let ratesMismatch = false;
    if (data.commissionRates && typeof data.commissionRates === "object" && existingSnapshot.commissionRates) {
      const oldRates = existingSnapshot.commissionRates;
      const newRates = data.commissionRates;
      for (const role of ["broker", "masterBroker", "financiera", "superAdmin"]) {
        if (newRates[role] && oldRates[role]) {
          for (const type of ["apertura", "sobretasa", "renovacion", "total"]) {
            if (newRates[role][type] !== undefined && oldRates[role][type] !== undefined) {
              if (String(newRates[role][type]) !== String(oldRates[role][type])) {
                ratesMismatch = true;
              }
            }
          }
        } else if (newRates[role] && !oldRates[role]) {
          ratesMismatch = true;
        }
      }
    }

    if (offerMismatch || verMismatch || brokerMismatch || masterMismatch || ratesMismatch) {
      throw new ImmutableCommercialSnapshotError(
        `[COM-22] Snapshot comercial consolidado inmutable: Prohibido modificar oferta, versión, tasas pactadas o beneficiarios previamente consolidados.`,
        {
          existing: {
            offerId: oldOfferId,
            versionNumber: oldVer,
            originBrokerId: oldBroker,
            originMasterBrokerId: oldMaster,
            commissionRates: existingSnapshot.commissionRates,
          },
          attempted: {
            offerId: newOfferId,
            versionNumber: newVer,
            originBrokerId: newBroker,
            originMasterBrokerId: newMaster,
            commissionRates: data.commissionRates,
          },
        }
      );
    }

    // Conservar el snapshot original intacto sin modificar fechas ni condiciones consolidadas
    return existingSnapshot;
  }

  // Consolidar por primera vez
  const finalProposal = { ...data };

  // 1. Preservar oferta y versión requeridas
  finalProposal.institutionProductId =
    data.institutionProductId ||
    data.offerId ||
    credit.institutionProductId ||
    (credit.finalProposal as any)?.institutionProductId ||
    (credit.finalProposal as any)?.offerId ||
    null;

  finalProposal.versionNumber =
    data.versionNumber ??
    credit.versionNumber ??
    (credit.finalProposal as any)?.versionNumber ??
    null;

  // 2. Preservar beneficiarios originales (Broker originador y Master beneficiario)
  finalProposal.originBrokerId =
    data.originBrokerId ||
    data.brokerId ||
    credit.brokerId ||
    (credit.finalProposal as any)?.originBrokerId ||
    null;

  finalProposal.originMasterBrokerId =
    data.originMasterBrokerId !== undefined
      ? data.originMasterBrokerId
      : (data.masterBrokerId !== undefined
          ? data.masterBrokerId
          : (credit.originMasterBrokerId !== undefined
              ? credit.originMasterBrokerId
              : ((credit.finalProposal as any)?.originMasterBrokerId ?? null)));

  // 3. Preservar tasas pactadas
  if (data.commissionRates && typeof data.commissionRates === "object") {
    finalProposal.commissionRates = { ...data.commissionRates };
  }

  // 4. Marca de snapshot comercial congelado
  finalProposal.isCommercialSnapshot = true;
  finalProposal.snapshotCreatedAt =
    data.snapshotCreatedAt ||
    (credit.finalProposal as any)?.snapshotCreatedAt ||
    new Date().toISOString();

  return finalProposal;
}
