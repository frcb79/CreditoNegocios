import { ANNUAL_INCOME_OPTIONS } from "./annualIncome";
import { publicClientProfileSchema } from "./clientProfileValidation";

/** Public screening fields mirror financial profiling, not the full client dossier. */
export type ExistingCreditInput = {
  tipo: string; institucion: string; saldoOriginal: string; saldo: string;
  fechaInicio: string; fechaTermino: string;
};
export type QuickFinancialInput = {
  creditBureau?: string;
  creditBureauCompany?: string;
  creditBureauShareholder?: string;
  hasBureauHistory?: string;
  hasArrears?: string;
  arrearsDetails?: string;
  guarantee?: string;
  guaranteeAsset?: string;
  guaranteeValue?: string;
  guaranteeYear?: string;
  propertyType?: string;
  guaranteeLocation?: string;
  guaranteeLegalStatus?: string;
  guarantor?: string;
  existingCredits?: string;
  credits?: ExistingCreditInput[];
  governmentSales?: string;
  terminalSales?: string;
  satConnection?: string;
  financialStatements?: string;
  complianceOpinion?: string;
  opinionDetails?: string;
  monthlyOutgoings?: string;
};
export type QuickProspectInput = {
  type: "persona_moral" | "fisica_empresarial" | "fisica" | "sin_sat";
  firstName: string;
  lastName: string;
  businessName: string;
  phone: string;
  email: string;
  rfc?: string;
  monthlyIncome: string;
  yearsInBusiness: string;
  financial?: QuickFinancialInput;
};

export function annualIncomeBandFromMonthly(inputType: QuickProspectInput["type"], monthly: number): string | null {
  if (!Number.isFinite(monthly) || monthly < 0) return null;
  const annual = monthly * 12;
  if (!Number.isFinite(annual)) return null;
  const interval = ANNUAL_INCOME_OPTIONS[inputType].find(x =>
    x.value !== "no-disponible" && annual >= x.min &&
    (annual < x.max || x.max >= Number.MAX_SAFE_INTEGER));
  return interval?.value || null;
}
function optional(value?: string): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function numeric(value?: string): string | undefined {
  const raw = optional(value)?.replace(/[$,\s]/g, "");
  if (!raw) return undefined;
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || Number(raw) > 1000000000000) {
    throw new Error("Revisa el monto capturado en tu perfil financiero.");
  }
  return String(Number(raw));
}
function appendIfValue(record: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined && value !== "") record[key] = value;
}

export function buildQuickProspectProfile(input: QuickProspectInput) {
  const rawIncome = input.monthlyIncome.trim().replace(/[$,\s]/g, "");
  const monthly = /^\d+(?:\.\d{1,2})?$/.test(rawIncome) ? Number(rawIncome) : NaN;
  if (!Number.isFinite(monthly) || monthly <= 0 || monthly > 1000000000000)
    throw new Error("Indica tus ingresos mensuales aproximados en MXN.");
  const yearsText = input.yearsInBusiness.trim();
  if (yearsText && (!/^\d{1,3}$/.test(yearsText) || Number(yearsText) > 150))
    throw new Error("Indica los años de actividad, o deja ese dato pendiente.");
  const annualBand = annualIncomeBandFromMonthly(input.type, monthly);
  const data: Record<string, unknown> = {
    type: input.type,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    ...(input.type === "persona_moral" ? { businessName: input.businessName.trim() } : {}),
    phone: input.phone.trim(),
    ...(optional(input.email) ? { email: input.email.trim() } : {}),
    ...(optional(input.rfc) ? { rfc: input.rfc!.trim().toUpperCase() } : {}),
    ...(annualBand ? { ingresoAnual: annualBand } : {}),
    ...(yearsText && input.type !== "fisica" ? { yearsInBusiness: Number(yearsText) } : {}),
  };
  const f = input.financial || {};
  const pf = input.type === "fisica";
  const noSat = input.type === "sin_sat";
  const pfae = input.type === "fisica_empresarial";
  const company = input.type === "persona_moral";
  // Keep the common monthly figure consumed by legacy matching, and the typed
  // profiling field used by each borrower group. Never report a verified income.
  appendIfValue(data, "ingresoMensualPromedio", String(monthly));
  if (!company) appendIfValue(data, noSat ? "ingresoMensualPromedioComprobablesSinSat" :
    "ingresoMensualPromedioComprobables", String(monthly));
  if (company) appendIfValue(data, "egresoMensualPromedio", numeric(f.monthlyOutgoings));

  if (pf || pfae) appendIfValue(data, "buroPersonaFisica", optional(f.creditBureau));
  if (noSat) {
    appendIfValue(data, "buroPersonaFisicaSinSat", optional(f.hasBureauHistory));
    appendIfValue(data, "buroAccionistaPrincipal", optional(f.creditBureauShareholder));
  }
  if (company) {
    appendIfValue(data, "buroAccionistaPrincipal", optional(f.creditBureauShareholder));
    appendIfValue(data, "buroEmpresa", optional(f.creditBureauCompany));
  }

  const arrearsKey = company ? "atrasosDeudas" : noSat ? "atrasosDeudasBuroSinSat" : "atrasosDeudasBuro";
  const arrearsDetailKey = company ? "atrasosDetalles" : noSat ? "atrasosDeudasBuroDetallesSinSat" : "atrasosDeudasBuroDetalles";
  appendIfValue(data, arrearsKey, optional(f.hasArrears));
  if (f.hasArrears === "si") appendIfValue(data, arrearsDetailKey, optional(f.arrearsDetails));

  const guaranteeKey = pf ? "cuentaConGarantiaFisica" : noSat ? "cuentaConGarantiaSinSat" : "garantia";
  const guaranteeDetailsKey = pf ? "garantiaFisicaDetalles" : noSat ? "garantiaSinSatDetalles" : "garantiaDetalles";
  appendIfValue(data, guaranteeKey, optional(f.guarantee));
  if (f.guarantee && f.guarantee !== "sin-garantia") {
    const details: Record<string, unknown> = {};
    appendIfValue(details, "tipo", optional(f.guaranteeAsset));
    appendIfValue(details, pf || noSat ? "valor" : "monto", numeric(f.guaranteeValue));
    appendIfValue(details, "ano", optional(f.guaranteeYear));
    appendIfValue(details, "tipoInmueble", optional(f.propertyType));
    appendIfValue(details, "ubicacion", optional(f.guaranteeLocation));
    appendIfValue(details, "situacionLegal", optional(f.guaranteeLegalStatus));
    if (!Object.keys(details).length && pf)
      throw new Error("Describe al menos un dato de la garantía.");
    if (Object.keys(details).length) data[guaranteeDetailsKey] = details;
  }
  appendIfValue(data, pf ? "tieneAvalObligadoSolidarioFisica" :
    noSat ? "tieneAvalObligadoSolidarioSinSat" : "avalObligadoSolidario", optional(f.guarantor));

  appendIfValue(data, "creditosVigentes", optional(f.existingCredits));
  // A yes/no answer is sufficient for an initial match. The full balances
  // and documents belong to a later stage, never a required public subform.
  if (f.existingCredits === "si" && f.credits?.length) {
    if (f.credits.length > 5 ||
      f.credits.some(c => !c.tipo?.trim() || !c.institucion?.trim() ||
        !numeric(c.saldoOriginal) || !numeric(c.saldo) || !c.fechaInicio || !c.fechaTermino))
      throw new Error("Revisa los datos opcionales de los créditos vigentes.");
    data.creditosVigentesDetalles = f.credits.map(c => ({
      tipo: c.tipo.trim(), institucion: c.institucion.trim(),
      saldoOriginal: numeric(c.saldoOriginal), saldo: numeric(c.saldo),
      fechaInicio: c.fechaInicio, fechaTermino: c.fechaTermino,
    }));
  }

  if (company || pfae) {
    appendIfValue(data, "participacionVentasGobierno", optional(f.governmentSales));
    appendIfValue(data, "ventasTerminalBancaria", optional(f.terminalSales));
    appendIfValue(data, "satCiec", optional(f.satConnection));
    appendIfValue(data, "estadosFinancieros", optional(f.financialStatements));
    appendIfValue(data, "opinionCumplimiento", optional(f.complianceOpinion));
    if (f.complianceOpinion === "negativa") appendIfValue(data, "opinionDetalles", optional(f.opinionDetails));
  }

  const parsed = publicClientProfileSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Revisa tus datos personales y financieros.");
  return parsed.data;
}
