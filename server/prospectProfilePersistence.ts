import { normalizeProspectPhone, normalizedProspectPhoneSql } from "../shared/prospectContact";
import { getTableColumns } from "drizzle-orm";
import type { PoolClient } from "pg";
import { clients } from "../shared/schema";
import { publicClientProfileSchema, type PublicClientProfile } from "../shared/clientProfileValidation";
import { storage } from "./storage";
import { validateCommercialOriginationAndFormalization } from "./tenantPermissions";

export const profileIsBlank = (v: unknown) => v == null || (typeof v === "string" && ["", "no-disponible"].includes(v.trim())) ||
  (Array.isArray(v) && v.length === 0) || (typeof v === "object" && v !== null && Object.keys(v).length === 0);

/** The prospect may complete blanks; already recorded values require advisor review. */
export function profileBlankUpdates(existing: Record<string, unknown>, profile: PublicClientProfile) {
  return Object.fromEntries(Object.entries(profile).filter(([key, value]) =>
    key !== "type" && profileIsBlank(existing[key]) && !profileIsBlank(value)));
}
const columns = getTableColumns(clients);
const sqlEntries = (profile: Record<string, unknown>) => Object.entries(profile)
  .filter(([k, v]) => k in columns && v !== undefined && !profileIsBlank(v))
  .map(([k, v]) => ({ key: k, name: (columns as any)[k].name as string,
    value: typeof v === "object" ? JSON.stringify(v) : v }));

/** Caller supplies one transaction for profile, lead, one-use link and notification. */
export async function persistProspectProfile(tx: PoolClient, link: any, raw: PublicClientProfile): Promise<string | null> {
  const profile = publicClientProfileSchema.parse(raw);
  const normalized = { ...profile, rfc: profile.rfc?.trim().toUpperCase() || null,
    phone: normalizeProspectPhone(profile.phone!), email: profile.email?.trim().toLowerCase() || null };
  // Lock all identities in deterministic order across links and concurrent visitors.
  const identities = [normalized.rfc && `rfc:${normalized.rfc}`, `phone:${normalized.phone}`,
    normalized.email && `email:${normalized.email}`].filter(Boolean).sort();
  for (const identity of identities) await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["prospect-profile:" + identity]);
  let target: any;
  if (link.client_id) {
    const result = await tx.query("SELECT * FROM public.clients WHERE id=$1 AND broker_id=$2 AND tenant_id IS NOT DISTINCT FROM $3 FOR UPDATE", [link.client_id, link.owner_user_id, link.tenant_id]);
    target = result.rows[0];
    if (!target) throw new Error("PROSPECT_OWNER_CHANGED");
  }
  const matches = await tx.query(`SELECT * FROM public.clients WHERE
    ($1::text IS NOT NULL AND upper(rfc)=$1) OR (${normalizedProspectPhoneSql})=$2
    OR ($3::text IS NOT NULL AND lower(email)=$3) FOR UPDATE`, [normalized.rfc, normalized.phone, normalized.email]);
  // Never attach a public submission to another broker's record, or guess
  // between conflicting identities. The complete submission stays in the inbox.
  if (matches.rows.some(r => (target && r.id !== target.id) || r.broker_id !== link.owner_user_id || r.tenant_id !== link.tenant_id) || (!target && matches.rows.length > 1)) return null;
  if (!target) target = matches.rows[0];
  if (target) {
    if (target.type !== normalized.type) return target.id;
    const existing = Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, target[column.name]]));
    const entries = sqlEntries(profileBlankUpdates(existing, normalized));
    if (entries.length) await tx.query(`UPDATE public.clients SET ${entries.map((e, i) => `"${e.name}"=$${i + 2}`).join(",")},updated_at=NOW() WHERE id=$1`, [target.id, ...entries.map(e => e.value)]);
    return target.id;
  }
  const owner = await storage.getUser(link.owner_user_id);
  const memberships = await storage.getTenantMembersByUser(link.owner_user_id);
  const membership = memberships.find(m => m.isActive && m.tenantId === link.tenant_id);
  const gate = await validateCommercialOriginationAndFormalization({ callerUser: owner,
    callerMembership: membership, tenantId: link.tenant_id, requestedBrokerId: link.owner_user_id });
  if (!gate.allowed) return null;
  const entries = sqlEntries(normalized);
  const result = await tx.query(`INSERT INTO public.clients (broker_id,tenant_id,created_by,origin_opportunity,${entries.map(e => `"${e.name}"`).join(",")})
    VALUES ($1,$2,$1,'credito_empresarial',${entries.map((_, i) => `$${i + 3}`).join(",")}) RETURNING id`, [link.owner_user_id, link.tenant_id, ...entries.map(e => e.value)]);
  return result.rows[0].id;
}
