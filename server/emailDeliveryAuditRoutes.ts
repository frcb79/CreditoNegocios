import type { Express } from "express";
import { pool } from "./db";
import { storage } from "./storage";
import { isAuthenticated } from "./auth";

/** Read-only Super Admin projection; events may precede the send audit write. */
export const EMAIL_DELIVERY_AUDIT_SQL = `
WITH outbound AS (
  SELECT 'welcome:' || w.user_id AS id, w.user_id,
         u.email, u.first_name, u.last_name, u.role,
         'welcome'::text AS kind, NULL::integer AS reminder_day,
         w.status AS dispatch_status, w.provider_message_id,
         w.created_at, w.sent_at
  FROM public.broker_activation_welcome_events w
  JOIN public.users u ON u.id=w.user_id
  UNION ALL
  SELECT 'reminder:' || r.user_id || ':' || r.reminder_day AS id, r.user_id,
         u.email, u.first_name, u.last_name, u.role,
         'reminder'::text AS kind, r.reminder_day,
         r.status AS dispatch_status, r.provider_message_id,
         COALESCE(r.claimed_at,r.updated_at,r.sent_at) AS created_at, r.sent_at
  FROM public.broker_invitation_reminder_events r
  JOIN public.users u ON u.id=r.user_id
  UNION ALL
  SELECT 'invitation:' || n.id AS id, u.id AS user_id,
         u.email, u.first_name, u.last_name, u.role,
         'invitation'::text AS kind, NULL::integer AS reminder_day,
         'sent'::varchar AS dispatch_status,
         NULLIF(n.data->>'resendMessageId','') AS provider_message_id,
         n.created_at, n.created_at AS sent_at
  FROM public.notifications n
  JOIN public.users u ON u.id=n.data->>'brokerId'
  WHERE n.type='broker_invitation_sent'
)
SELECT o.id, o.user_id AS "userId", o.email, o.first_name AS "firstName",
       o.last_name AS "lastName", o.role, o.kind,
       o.reminder_day AS "reminderDay", o.dispatch_status AS "dispatchStatus",
       o.provider_message_id AS "providerMessageId",
       o.created_at AS "createdAt", o.sent_at AS "sentAt",
       event.event_type AS "eventType", event.occurred_at AS "eventAt"
FROM outbound o
LEFT JOIN LATERAL (
  SELECT e.event_type, e.occurred_at
  FROM public.resend_delivery_events e
  WHERE e.provider_message_id=o.provider_message_id
  ORDER BY CASE e.event_type
    WHEN 'email.complained' THEN 100
    WHEN 'email.bounced' THEN 95
    WHEN 'email.failed' THEN 90
    WHEN 'email.suppressed' THEN 85
    WHEN 'email.delivered' THEN 75
    WHEN 'email.delivery_delayed' THEN 50
    WHEN 'email.sent' THEN 20
    ELSE 0 END DESC, e.occurred_at DESC, e.received_at DESC
  LIMIT 1
) event ON TRUE
ORDER BY o.created_at DESC
LIMIT 200
`;

export function registerEmailDeliveryAuditRoutes(app: Express) {
  app.get("/api/admin/email-delivery-audit", isAuthenticated, async (req: any, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const callerId = req.user?.claims?.sub || req.user?.id || req.dbUser?.id;
    try {
      if (!callerId) return res.status(403).json({ message: "No autorizado" });
      const caller = await storage.getUser(callerId);
      if (!caller || caller.role !== "super_admin" || caller.isActive === false ||
          caller.status !== "active") return res.status(403).json({ message: "Solo Super Admin" });
      const result = await pool.query(EMAIL_DELIVERY_AUDIT_SQL);
      res.json({ records: result.rows, limit: 200,
        providerConnected: Boolean(process.env.RESEND_WEBHOOK_SECRET) });
    } catch {
      console.error("[RESEND-AUDIT] Error de consulta");
      res.status(503).json({ message: "No fue posible consultar los correos" });
    }
  });
}
