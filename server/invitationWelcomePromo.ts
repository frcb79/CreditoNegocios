import { storage } from "./storage";
import type { PromoCode } from "../shared/schema";

/** Optional annual courtesy for commercial invitations. The basic access tier remains free. */
export type AnnualInvitationPromo = {
  code: string;
  name: string;
  durationMonths: 12;
  id: string;
};

export class InvitationPromoError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "InvitationPromoError";
  }
}

/** Deterministic calendar-month expiry, rather than 12 x 30 days. */
export function annualCourtesyExpiry(start: Date): Date {
  const copy = new Date(start.getTime());
  const day = copy.getUTCDate();
  copy.setUTCDate(1);
  copy.setUTCMonth(copy.getUTCMonth() + 12);
  const lastDay = new Date(Date.UTC(copy.getUTCFullYear(), copy.getUTCMonth() + 1, 0)).getUTCDate();
  copy.setUTCDate(Math.min(day, lastDay));
  return copy;
}

/** An explicitly requested annual courtesy must be valid before account creation. */
export async function resolveAnnualInvitationPromo(
  requestedCode: string | null | undefined,
  role: "broker" | "master_broker",
): Promise<AnnualInvitationPromo> {
  const code = (requestedCode || process.env.INVITATION_WELCOME_PROMO_CODE || "").trim().toUpperCase();
  if (!code) throw new InvitationPromoError(422,
    "Configura un cupón de cortesía de 12 meses (Beneficios y promociones) o selecciona el código para esta invitación.");
  if (!/^[A-Z0-9_-]{3,80}$/.test(code)) {
    throw new InvitationPromoError(422, "El código de cortesía tiene un formato no válido.");
  }
  const promo: PromoCode | undefined = await storage.getPromoCodeByCode(code);
  if (!promo || !promo.isActive || promo.benefitType !== "free_months" || promo.durationMonths !== 12) {
    throw new InvitationPromoError(422, "La invitación requiere un cupón activo de exactamente 12 meses sin costo.");
  }
  const now = new Date();
  if (new Date(promo.startsAt) > now || (promo.expiresAt && new Date(promo.expiresAt) <= now)) {
    throw new InvitationPromoError(422, "El cupón de cortesía no está vigente.");
  }
  if (promo.maxUses != null && (promo.currentUses || 0) >= promo.maxUses) {
    throw new InvitationPromoError(409, "El cupón alcanzó su límite de usos. Incrementa el cupo antes de invitar.");
  }
  if (!["global", "alliance", "campaign", role].includes(promo.targetScope)) {
    throw new InvitationPromoError(422, "El cupón no es compatible con el rol invitado.");
  }
  return { id: promo.id, code: promo.code, name: promo.name, durationMonths: 12 };
}

/** A coupon is never silently assigned from the environment; invitation mode is explicit. */
export async function resolveOptionalInvitationPromo(
  requestedCode: string | null | undefined,
  role: "broker" | "master_broker",
  promoMode?: "none" | "annual_courtesy",
): Promise<AnnualInvitationPromo | null> {
  const code = (requestedCode || "").trim();
  if (promoMode === "none") {
    if (code) throw new InvitationPromoError(422, "Seleccionaste Sin cupón, pero incluiste un código.");
    return null;
  }
  if (promoMode === "annual_courtesy") {
    return resolveAnnualInvitationPromo(code, role);
  }
  // Older callers may still submit a code without a mode.
  return code ? resolveAnnualInvitationPromo(code, role) : null;
}
