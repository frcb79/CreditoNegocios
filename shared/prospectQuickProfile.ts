import { ANNUAL_INCOME_OPTIONS } from "./annualIncome";
import { publicClientProfileSchema } from "./clientProfileValidation";

/** Only information useful for a first screening; full dossier is collected by the advisor later. */
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
};

export function annualIncomeBandFromMonthly(inputType:QuickProspectInput["type"], monthly:number):string|null {
  if(!Number.isFinite(monthly) || monthly<0) return null;
  const annual=monthly*12;
  if(!Number.isFinite(annual))return null;
  const interval=ANNUAL_INCOME_OPTIONS[inputType].find(x=>
    x.value !== "no-disponible" && annual>=x.min &&
    (annual<x.max || x.max>=Number.MAX_SAFE_INTEGER));
  return interval?.value || null;
}

export function buildQuickProspectProfile(input:QuickProspectInput) {
  const rawIncome = input.monthlyIncome.trim().replace(/[$,\s]/g,"");
  const monthly = /^\d+(?:\.\d{1,2})?$/.test(rawIncome) ? Number(rawIncome) : NaN;
  if(!Number.isFinite(monthly) || monthly<=0 || monthly>1000000000000)
    throw new Error("Indica tus ingresos mensuales aproximados en MXN.");
  const yearsText=input.yearsInBusiness.trim();
  if(yearsText && (!/^\d{1,3}$/.test(yearsText) || Number(yearsText)>150))
    throw new Error("Indica los años de actividad, o deja ese dato pendiente.");
  const annualBand=annualIncomeBandFromMonthly(input.type,monthly);
  const source={
    type:input.type,
    firstName:input.firstName.trim(),
    lastName:input.lastName.trim(),
    businessName:input.type==="persona_moral" ? input.businessName.trim() : undefined,
    phone:input.phone.trim(),
    email:input.email.trim() || undefined,
    rfc:input.rfc?.trim().toUpperCase() || undefined,
    ingresoMensualPromedio:String(monthly),
    ...(annualBand?{ingresoAnual:annualBand}:{}),
    ...(yearsText?{yearsInBusiness:Number(yearsText)}:{}),
  };
  const parsed=publicClientProfileSchema.safeParse(source);
  if(!parsed.success)throw new Error(parsed.error.issues[0]?.message || "Revisa tus datos personales y financieros.");
  return parsed.data;
}
