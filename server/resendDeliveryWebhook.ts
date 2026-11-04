import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express, type Request } from "express";
import { pool } from "./db";

/**
 * Svix/Resend webhook validation. This verifies the ORIGINAL bytes of the
 * application/json payload, not a reserialized req.body. No SDK upgrade needed.
 */
const ACCEPTED_TYPES = new Set([
  "email.sent", "email.delivered", "email.delivery_delayed",
  "email.bounced", "email.failed", "email.complained", "email.suppressed",
]);
const MAX_CLOCK_SKEW_SECONDS = 300;

export function verifyResendSignature(
  body: Buffer, headers: { id?: string; timestamp?: string; signature?: string },
  secret: string, nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret.startsWith("whsec_") || !id || id.length > 150 ||
      !timestamp || !/^\d{10,13}$/.test(timestamp) || !signature) return false;
  const unixTime = Number(timestamp);
  if (!Number.isSafeInteger(unixTime) || Math.abs(nowSeconds - unixTime) > MAX_CLOCK_SKEW_SECONDS) return false;
  let key: Buffer;
  try { key = Buffer.from(secret.slice(6), "base64"); } catch { return false; }
  if (key.length < 16) return false;
  const signedPayload = Buffer.concat([Buffer.from(id + "." + timestamp + ".", "utf8"), body]);
  const expected = createHmac("sha256", key).update(signedPayload).digest();
  return signature.split(/\s+/).some(part => {
    if (!part.startsWith("v1,")) return false;
    try {
      const supplied = Buffer.from(part.slice(3), "base64");
      return supplied.length === expected.length && timingSafeEqual(supplied, expected);
    } catch { return false; }
  });
}

export type ResendDeliveryEvent = {
  eventId: string; providerMessageId: string; eventType: string; occurredAt: Date;
};
export function parseResendDeliveryEvent(eventId: string, raw: Buffer): ResendDeliveryEvent | null {
  if (!/^[a-zA-Z0-9._-]{1,150}$/.test(eventId)) return null;
  let parsed: any;
  try { parsed = JSON.parse(raw.toString("utf8")); } catch { return null; }
  const type = parsed?.type;
  const emailId = parsed?.data?.email_id;
  if (typeof type !== "string" || !ACCEPTED_TYPES.has(type) ||
      typeof emailId !== "string" || emailId.length < 4 || emailId.length > 255) return null;
  const occurredAt = new Date(parsed?.created_at);
  if (!Number.isFinite(occurredAt.getTime())) return null;
  return { eventId, eventType: type, providerMessageId: emailId, occurredAt };
}

/** Installed before global express.json() so signatures always use raw bytes. */
export function registerResendWebhook(app: Express) {
  app.post("/api/webhooks/resend", express.raw({ type: "application/json", limit: "64kb" }), async (req: Request, res) => {
    res.setHeader("Cache-Control", "no-store");
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ message: "Webhook no configurado" });
    if (!Buffer.isBuffer(req.body)) return res.status(415).json({ message: "Content-Type inválido" });
    const id = req.get("svix-id") || "";
    if (!verifyResendSignature(req.body, {
      id, timestamp: req.get("svix-timestamp") || "",
      signature: req.get("svix-signature") || "",
    }, secret)) return res.status(401).json({ message: "Firma inválida" });
    const event = parseResendDeliveryEvent(id, req.body);
    if (!event) {
      // Signed events for domains, contacts, opened and clicked are not relevant.
      // Invalid/truncated email data must never enter the audit.
      return res.status(200).json({ received: true });
    }
    try {
      await pool.query(
        "INSERT INTO public.resend_delivery_events " +
        "(event_id,provider_message_id,event_type,occurred_at) VALUES($1,$2,$3,$4) " +
        "ON CONFLICT (event_id) DO NOTHING",
        [event.eventId, event.providerMessageId, event.eventType, event.occurredAt],
      );
      return res.status(200).json({ received: true });
    } catch {
      // A non-2xx response lets Resend retry; the PK handles duplicate delivery.
      console.error("[RESEND-WEBHOOK] No fue posible guardar evento firmado");
      return res.status(503).json({ message: "No fue posible registrar el evento" });
    }
  });
}
