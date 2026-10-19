import { pool } from './db';
import type { Pool, PoolClient } from 'pg';

/**
 * Manual commercial benefits reuse promo_codes, promo_redemptions, users and
 * commercial_audit_logs. No billing, operational suspension or new tables.
 * Every transition is serialized on the beneficiary's users row.
 */
export class BenefitError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'BenefitError';
  }
}
export type BenefitAction = 'assign' | 'replace' | 'extend' | 'revoke' | 'redeem';
export type BenefitChange = {
  actorId: string;
  userId: string;
  action: BenefitAction;
  code?: string;
  months?: number;
  reason?: string;
};
export function calendarMonths(date: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    throw new BenefitError(400, 'La duración debe ser de 1 a 60 meses.');
  }
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
export function effectiveRedemptionStatus(row: { status: string; expires_at: Date | null }, now = new Date()) {
  return row.status === 'active' && row.expires_at && new Date(row.expires_at) <= now ? 'expired' : row.status;
}
const validCode = (code: string) => /^[A-Z0-9_-]{3,80}$/.test(code);
const limited = (n: any) => n === null || n === undefined ? null : Number(n);

export async function changeUserBenefit(
  input: BenefitChange, database: Pool = pool,
): Promise<{ action: BenefitAction; redemption: any | null; accessStatus: string; expiresAt: Date | null }> {
  const reason = input.reason?.trim() || (input.action === 'redeem' ? 'Canje solicitado por usuario' : '');
  if (!input.actorId || !input.userId) throw new BenefitError(401, 'Falta identidad autenticada.');
  if (input.action !== 'redeem' && (reason.length < 5 || reason.length > 500)) {
    throw new BenefitError(400, 'Proporciona un motivo entre 5 y 500 caracteres.');
  }
  if (input.months !== undefined && (!Number.isInteger(input.months) || input.months < 1 || input.months > 60)) {
    throw new BenefitError(400, 'Duración no válida (1–60 meses).');
  }
  if ((input.action === 'assign' || input.action === 'replace' || input.action === 'redeem') &&
      (!input.code || !validCode(input.code.trim().toUpperCase()))) {
    throw new BenefitError(400, 'Selecciona un código promocional válido.');
  }
  if (input.action === 'redeem' && input.months !== undefined) {
    throw new BenefitError(403, 'El usuario no puede modificar la duración del cupón.');
  }
  const client: PoolClient = await database.connect();
  let began = false;
  try {
    await client.query('BEGIN');
    began = true;
    const actor = (await client.query('SELECT id, role FROM users WHERE id = $1', [input.actorId])).rows[0];
    if (!actor) throw new BenefitError(401, 'Usuario de sesión no encontrado.');
    if (input.action === 'redeem' ? actor.id !== input.userId : actor.role !== 'super_admin') {
      throw new BenefitError(403, 'Operación reservada a Super Admin.');
    }
    const user = (await client.query(
      'SELECT id, role, is_active, status, access_status, access_status_expires_at, active_promo_id FROM users WHERE id = $1 FOR UPDATE',
      [input.userId],
    )).rows[0];
    if (!user) throw new BenefitError(404, 'Broker o Master Broker no encontrado.');
    if (!['broker', 'master_broker'].includes(user.role) || user.is_active === false || user.status !== 'active') {
      throw new BenefitError(409, 'Solo se administran beneficios de Brokers o Masters activos.');
    }
    const now = new Date();
    // Legacy records can have active status after expiry; expiration is always evaluated.
    const existingRows = (await client.query(
      "SELECT * FROM promo_redemptions WHERE user_id = $1 AND status = 'active' ORDER BY applied_at DESC FOR UPDATE",
      [input.userId],
    )).rows;
    const live = existingRows.filter(r => effectiveRedemptionStatus(r, now) === 'active');
    if (live.length > 1) throw new BenefitError(409, 'Hay beneficios activos duplicados anteriores. Requieren conciliación administrativa.');
    const previous = live[0] || null;
    let redemption: any = null;
    let accessStatus = 'free';
    let expiresAt: Date | null = null;
    if (input.action === 'extend') {
      if (!previous || !previous.expires_at) throw new BenefitError(409, 'No existe una cortesía temporal vigente para extender.');
      const previousPromo = (await client.query('SELECT benefit_type FROM promo_codes WHERE id = $1', [previous.promo_code_id])).rows[0];
      if (previousPromo?.benefit_type !== 'free_months') throw new BenefitError(409, 'Solo se extienden cortesías por meses.');
      if (!input.months) throw new BenefitError(400, 'Indica los meses adicionales.');
      expiresAt = calendarMonths(new Date(previous.expires_at), input.months);
      const metadata = { ...(previous.metadata || {}), lastExtensionBy: input.actorId, lastExtensionAt: now.toISOString() };
      redemption = (await client.query(
        'UPDATE promo_redemptions SET expires_at=$2, metadata=$3 WHERE id=$1 RETURNING *',
        [previous.id, expiresAt, JSON.stringify(metadata)],
      )).rows[0];
      accessStatus = 'promotional';
    } else if (input.action === 'revoke') {
      if (!previous) throw new BenefitError(409, 'El usuario no tiene beneficio vigente para revocar.');
      await client.query("UPDATE promo_redemptions SET status='revoked' WHERE id=$1", [previous.id]);
      redemption = { ...previous, status: 'revoked' };
    } else {
      if (input.action === 'assign' || input.action === 'redeem') {
        if (previous) throw new BenefitError(409, 'Ya existe un beneficio vigente; solicita sustitución o extensión.');
      } else if (input.action === 'replace' && !previous) {
        throw new BenefitError(409, 'No existe un beneficio vigente para sustituir; usa asignar.');
      }
      const code = input.code!.trim().toUpperCase();
      const promo = (await client.query('SELECT * FROM promo_codes WHERE code=$1 FOR UPDATE', [code])).rows[0];
      if (!promo || !promo.is_active || new Date(promo.starts_at) > now ||
          (promo.expires_at && new Date(promo.expires_at) <= now)) {
        throw new BenefitError(409, 'El código no está activo o no está vigente.');
      }
      if (!['global','alliance','campaign',user.role].includes(promo.target_scope) ||
          (promo.target_entity_id && !['broker','master_broker'].includes(promo.target_scope) && promo.target_entity_id !== user.id)) {
        throw new BenefitError(403, 'El cupón no corresponde al usuario.');
      }
      if (promo.max_uses != null && Number(promo.current_uses) >= Number(promo.max_uses)) {
        throw new BenefitError(409, 'Cupo del código agotado.');
      }
      const type = promo.benefit_type;
      if (!['free_months','percentage_discount','fixed_discount','permanent_free','free'].includes(type)) {
        throw new BenefitError(400, 'Tipo de beneficio no reconocido.');
      }
      const value = Number(promo.benefit_value || 0);
      if ((type === 'percentage_discount' && !(value > 0 && value <= 100)) ||
          (type === 'fixed_discount' && !(value > 0))) {
        throw new BenefitError(400, 'Importe de descuento inválido.');
      }
      const months = input.months ?? limited(promo.duration_months);
      if (['free_months','percentage_discount','fixed_discount'].includes(type) && !months) {
        throw new BenefitError(400, 'El beneficio temporal requiere duración en meses.');
      }
      if (months) expiresAt = calendarMonths(now, months);
      accessStatus = type === 'permanent_free' ? 'complimentary' : type === 'free' ? 'free' : 'promotional';
      if (input.action === 'redeem') {
        const used = await client.query('SELECT id FROM promo_redemptions WHERE user_id=$1 AND promo_code_id=$2 LIMIT 1',
          [input.userId, promo.id]);
        if (used.rows.length) throw new BenefitError(409, 'Este usuario ya canjeó el mismo código.');
      }
      if (input.action === 'replace' && previous) {
        await client.query("UPDATE promo_redemptions SET status='revoked' WHERE id=$1", [previous.id]);
      }
      const metadata = { source: input.action === 'redeem' ? 'user_settings' : 'admin_manual',
        code: promo.code, name: promo.name, benefitType: type, benefitValue: promo.benefit_value,
        durationMonths: months, assignedBy: input.actorId, reason, billingConfigured: false };
      redemption = (await client.query(
        "INSERT INTO promo_redemptions (promo_code_id,user_id,starts_at,expires_at,status,metadata) VALUES ($1,$2,$3,$4,'active',$5) RETURNING *",
        [promo.id, input.userId, now, expiresAt, JSON.stringify(metadata)],
      )).rows[0];
      await client.query('UPDATE promo_codes SET current_uses = current_uses + 1, updated_at = NOW() WHERE id=$1', [promo.id]);
    }
    // Expired legacy redemptions remain historical; do not bill or suspend.
    await client.query(
      'UPDATE users SET access_status=$2, access_status_expires_at=$3, access_status_notes=$4, active_promo_id=$5, updated_at=NOW() WHERE id=$1',
      [input.userId, accessStatus, expiresAt, reason, accessStatus === 'free' ? null : redemption?.promo_code_id],
    );
    await client.query(
      'INSERT INTO commercial_audit_logs (entity_type,entity_id,broker_id,performed_by,action,previous_state,new_state,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      ['user_benefit',input.userId,input.userId,input.actorId,'benefit_'+input.action,
        previous ? JSON.stringify({redemptionId:previous.id,expiresAt:previous.expires_at}) : null,
        JSON.stringify({redemptionId: redemption?.id || null,expiresAt,status:accessStatus}),
        JSON.stringify({reason,actorRole:actor.role,code:input.code || null,months:input.months || null,
          previousRedemptionId:previous?.id || null,redemptionId:redemption?.id || null})],
    );
    await client.query('COMMIT');
    began = false;
    return { action: input.action, redemption, accessStatus, expiresAt };
  } catch (error) {
    if (began) await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function userBenefitHistory(userId: string, database: Pool = pool) {
  const [redemptions, audit] = await Promise.all([
    database.query(
      'SELECT r.*, p.code, p.name, p.benefit_type, p.benefit_value, p.duration_months FROM promo_redemptions r JOIN promo_codes p ON p.id=r.promo_code_id WHERE r.user_id=$1 ORDER BY r.applied_at DESC',
      [userId]),
    database.query(
      "SELECT id, action, previous_state, new_state, metadata, performed_by, created_at FROM commercial_audit_logs WHERE entity_type='user_benefit' AND entity_id=$1 ORDER BY created_at DESC",
      [userId]),
  ]);
  return {
    redemptions: redemptions.rows.map(r => ({ ...r, effectiveStatus: effectiveRedemptionStatus(r) })),
    changes: audit.rows,
  };
}
