import { pool } from "./db";

export type AccountAccess = {
  hasAccessed: boolean;
  firstAccessAt: string | null;
  lastAccessAt: string | null;
  accessEvidenceSource: string | null;
};
const memory = new Map<string, AccountAccess>();
const useMemory = () => process.env.NODE_ENV === "test" || process.env.USE_MEMORY_STORAGE === "true";

/** Called only AFTER Passport has successfully saved an authenticated session. */
export async function confirmAccountAccess(userId: string) {
  if (useMemory()) {
    const now = new Date().toISOString();
    const previous = memory.get(userId);
    memory.set(userId, { hasAccessed: true, firstAccessAt: previous?.firstAccessAt || now,
      lastAccessAt: now, accessEvidenceSource: "authenticated_session" });
    return;
  }
  await pool.query(`INSERT INTO public.user_access_history (user_id,first_access_at,last_access_at,evidence_source)
    VALUES ($1,NOW(),NOW(),'authenticated_session') ON CONFLICT (user_id) DO UPDATE
    SET last_access_at=NOW()`, [userId]);
}

export async function withAccountAccess<T extends { id: string; role?: string; password?: string | null }>(accounts: T[]) {
  let evidence = memory;
  if (!useMemory() && accounts.length) {
    const result = await pool.query(`SELECT user_id,first_access_at,last_access_at,evidence_source
      FROM public.user_access_history WHERE user_id=ANY($1::varchar[])`, [accounts.map(u => u.id)]);
    evidence = new Map(result.rows.map(r => [r.user_id, {
      hasAccessed: true, firstAccessAt: r.first_access_at?.toISOString() || null,
      lastAccessAt: r.last_access_at?.toISOString() || null, accessEvidenceSource: r.evidence_source,
    }]));
  }
  return accounts.map(user => {
    const access = evidence.get(user.id) || { hasAccessed: false, firstAccessAt: null,
      lastAccessAt: null, accessEvidenceSource: null };
    return { ...user, ...access, registrationStatus: ["broker", "master_broker"].includes(user.role || "")
      ? !user.password?.trim() ? "pending" : access.hasAccessed ? "registered" : "awaiting_first_access"
      : null };
  });
}
