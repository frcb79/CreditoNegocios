/** One source of truth for review, publication and matching; never rewrites the source. */
export const PROFILE_LABELS: Record<string, string> = {
  persona_moral: "Persona Moral (PM)", fisica_empresarial: "PFAE", fisica: "Persona Física", sin_sat: "Sin SAT",
};
const key = (v: unknown) => String(v ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const months = (n: string, unit: string) => Number(n) * (unit.startsWith("ano") ? 12 : 1);
const valid = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function getOfferAgePolicy(conditions: any = {}, requirements: any = {}) {
  const profiles: string[] = Array.isArray(requirements.targetProfiles) ? requirements.targetProfiles : [];
  const source = String(requirements.businessAgeSource || requirements.minMonthsInBusinessSource || "");
  const normalized = key(source);
  const parsed: Record<string, number> = {};
  const exact = normalized.match(/^(\d+(?:\.\d+)?)\s*(anos?|mes(?:es)?)(?: facturando)?$/);
  if (exact) for (const profile of profiles) parsed[profile] = months(exact[1], exact[2]);
  else {
    // Accept only the complete PM/PFAE grammar; unexplained clauses remain pending.
    const pair = normalized.match(/^pm\s+(\d+(?:\.\d+)?)\s*(anos?|mes(?:es)?)?\s*\/\s*pfae\s+(\d+(?:\.\d+)?)\s*(anos?|mes(?:es)?)$/);
    if (pair) {
      parsed.persona_moral = months(pair[1], pair[2] || pair[4]);
      parsed.fisica_empresarial = months(pair[3], pair[4]);
    }
  }
  const configured = Object.fromEntries(profiles.map(p => [p,
    Object.prototype.hasOwnProperty.call(conditions, "minCompanyAgeMonths") ? conditions.minCompanyAgeMonths :
      requirements.profileRules?.[p]?.ranges?.tiempoActividad?.min ?? requirements.ranges?.tiempoActividad?.min ?? requirements.minMonthsInBusiness ?? null,
  ]));
  const basis = JSON.stringify({ source, numericSource: requirements.minMonthsInBusinessSource ?? null,
    profiles: [...profiles].sort().map(p => [p, configured[p]]) });
  const resolution = requirements.businessAgeResolution;
  const resolved = resolution?.basis === basis && typeof resolution?.reason === "string" && resolution.reason.trim().length >= 3 &&
    typeof resolution?.reviewedBy === "string" && resolution.reviewedBy.length > 0 &&
    typeof resolution?.reviewedAt === "string" && Number.isFinite(Date.parse(resolution.reviewedAt)) &&
    profiles.length > 0 && profiles.every(p => valid(resolution?.monthsByProfile?.[p]));
  const rows = profiles.map(profile => {
    const hasSource = normalized !== "" && !["no aplica", "n/a"].includes(normalized);
    const conflict = hasSource && (!valid(parsed[profile]) || !valid(configured[profile]) || parsed[profile] !== configured[profile]);
    return { profile, label: PROFILE_LABELS[profile] || profile, sourceMonths: parsed[profile] ?? null,
      configuredMonths: configured[profile], conflict,
      pending: conflict && !resolved,
      effectiveMonths: resolved ? resolution.monthsByProfile[profile] : conflict ? null : configured[profile] };
  });
  return { source, basis, rows, resolved: Boolean(resolved), needsReview: rows.some(r => r.pending),
    hasConflict: rows.some(r => r.conflict), resolution: resolved ? resolution : null };
}
