import type { Client } from "@shared/schema";

/**
 * Informational checklist; these are NOT contractual/financial lender requirements
 * and never imply loan eligibility. Formal matching remains server-driven per offer.
 */
export function getProfileEnrichmentSuggestions(client: Pick<Client,
  "type" | "phone" | "email" | "rfc" | "industry" | "yearsInBusiness" |
  "ingresoMensualPromedio" | "ingresoMensualPromedioComprobables" | "ingresoMensualPromedioComprobablesSinSat" |
  "buroEmpresa" | "buroPersonaFisica" | "buroPersonaFisicaSinSat" | "creditosVigentes"
>) {
  const missing: string[] = [];
  const has = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";
  if (!has(client.phone)) missing.push("Teléfono de contacto");
  if (!has(client.email)) missing.push("Correo electrónico");
  if (client.type !== "sin_sat" && !has(client.rfc)) missing.push("RFC, cuando esté disponible");
  if (client.type === "persona_moral" || client.type === "fisica_empresarial") {
    if (!has(client.industry)) missing.push("Giro o actividad");
    if (client.yearsInBusiness === null || client.yearsInBusiness === undefined)
      missing.push("Antigüedad del negocio");
  }
  const income = client.type === "persona_moral" || client.type === "fisica_empresarial"
    ? client.ingresoMensualPromedio
    : client.type === "sin_sat" ? client.ingresoMensualPromedioComprobablesSinSat
    : client.ingresoMensualPromedioComprobables;
  if (!has(income)) missing.push("Ingreso o facturación aproximada");
  const bureau = client.type === "persona_moral"
    ? client.buroEmpresa
    : client.type === "sin_sat" ? client.buroPersonaFisicaSinSat : client.buroPersonaFisica;
  if (!has(bureau)) missing.push("Información crediticia, si se conoce");
  if (!has(client.creditosVigentes)) missing.push("Situación de créditos vigentes");
  return missing;
}
