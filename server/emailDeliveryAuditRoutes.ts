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
         CASE WHEN r.status='failed' AND (
           COALESCE(r.last_error,'') LIKE '%inconsistent types deduced for parameter $3%'
           OR COALESCE(r.last_error,'') LIKE 'Estado de envío no confirmado:%'
         ) THEN 'uncertain' ELSE r.status END AS dispatch_status,
         r.provider_message_id,
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
  UNION ALL
  -- Historical one-time reinvitations save their provider ID on the user,
  -- not in the original invitation notifications.
  SELECT 'reinvitation:' || u.id AS id, u.id AS user_id,
         u.email, u.first_name, u.last_name, u.role,
         'reinvitation'::text AS kind, NULL::integer AS reminder_day,
         COALESCE(u.profile_data->'invitationRecovery20261105'->>'status','claimed') AS dispatch_status,
         NULLIF(u.profile_data->'invitationRecovery20261105'->>'providerMessageId','') AS provider_message_id,
         COALESCE(NULLIF(u.profile_data->'invitationRecovery20261105'->>'at','')::timestamp,u.updated_at) AS created_at,
         CASE WHEN u.profile_data->'invitationRecovery20261105'->>'status'='sent'
              THEN COALESCE(NULLIF(u.profile_data->'invitationRecovery20261105'->>'at','')::timestamp,u.updated_at)
              ELSE NULL::timestamp END AS sent_at
  FROM public.users u
  WHERE u.profile_data ? 'invitationRecovery20261105'
), all_messages AS (
  SELECT * FROM outbound
  UNION ALL
  -- Preserve orphaned signed webhook events without fabricating recipient,
  -- sender, subject, or any other private information not stored locally.
  SELECT 'resend:' || e.provider_message_id AS id,
         NULL::varchar AS user_id, NULL::varchar AS email,
         NULL::varchar AS first_name, NULL::varchar AS last_name, NULL::varchar AS role,
         'provider_only'::text AS kind, NULL::integer AS reminder_day,
         'received'::varchar AS dispatch_status, e.provider_message_id,
         MIN(e.occurred_at) AS created_at, NULL::timestamp AS sent_at
  FROM public.resend_delivery_events e
  WHERE NOT EXISTS (SELECT 1 FROM outbound o WHERE o.provider_message_id=e.provider_message_id)
  GROUP BY e.provider_message_id
)
SELECT o.id, o.user_id AS "userId", o.email, o.first_name AS "firstName",
       o.last_name AS "lastName", o.role, o.kind,
       o.reminder_day AS "reminderDay", o.dispatch_status AS "dispatchStatus",
       o.provider_message_id AS "providerMessageId",
       o.created_at AS "createdAt", o.sent_at AS "sentAt",
       event.event_type AS "eventType", event.occurred_at AS "eventAt"
FROM all_messages o
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
