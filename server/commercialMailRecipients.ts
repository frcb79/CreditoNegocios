// Read-only audience selection. Never return passwords, tokens, client details or provider payloads.
export const COMMERCIAL_MAIL_RECIPIENTS_SQL = `
WITH invitation_users AS (
  SELECT DISTINCT data->>'brokerId' AS user_id FROM public.notifications
  WHERE type='broker_invitation_sent'
), known_messages AS (
  SELECT user_id,provider_message_id FROM public.broker_activation_welcome_events
  UNION ALL SELECT user_id,provider_message_id FROM public.broker_invitation_reminder_events
  UNION ALL SELECT data->>'brokerId',data->>'resendMessageId' FROM public.notifications WHERE type='broker_invitation_sent'
  UNION ALL SELECT user_id,provider_message_id FROM public.commercial_mail_dispatches
  UNION ALL SELECT id,profile_data->'invitationRecovery20261105'->>'providerMessageId' FROM public.users
), blocked AS (
  SELECT DISTINCT m.user_id FROM known_messages m JOIN public.resend_delivery_events e
    ON e.provider_message_id=m.provider_message_id
  WHERE e.event_type IN ('email.bounced','email.complained','email.suppressed')
), candidates AS (
  SELECT u.id,u.email,u.first_name AS "firstName",u.last_name AS "lastName",u.role,
    (u.password IS NOT NULL) AS registered,
    (EXISTS(SELECT 1 FROM public.credit_submission_requests s WHERE s.broker_id=u.id OR s.origin_master_broker_id=u.id)
      OR EXISTS(SELECT 1 FROM public.credits c WHERE c.broker_id=u.id OR c.origin_master_broker_id=u.id)
      OR EXISTS(SELECT 1 FROM public.commercial_marketing_leads l WHERE l.owner_user_id=u.id)) AS "hasActivity",
    EXISTS(SELECT 1 FROM invitation_users i WHERE i.user_id=u.id) AS invited
  FROM public.users u
  WHERE u.role IN ('broker','master_broker') AND u.status='active' AND u.is_active IS TRUE
    AND u.access_status NOT IN ('expired','suspended')
    AND u.email IS NOT NULL AND btrim(u.email) <> ''
    AND COALESCE(u.profile_data->>'invitationFollowupPaused','false') <> 'true'
    AND COALESCE(u.profile_data->>'commercialMailOptOut','false') <> 'true'
    AND NOT EXISTS(SELECT 1 FROM blocked b WHERE b.user_id=u.id)
    AND EXISTS(SELECT 1 FROM public.tenant_members m JOIN public.tenants t ON t.id=m.tenant_id
      WHERE m.user_id=u.id AND m.is_active IS TRUE AND t.is_active IS TRUE)
)
SELECT id,email,"firstName","lastName",role,registered,"hasActivity"
FROM candidates
WHERE CASE $1::text
  WHEN 'pending_registration' THEN NOT registered AND invited
  WHEN 'registered_no_requests' THEN registered AND NOT "hasActivity"
  WHEN 'individual' THEN registered
  WHEN 'newsletter' THEN registered
  ELSE FALSE END
ORDER BY lower(email),id LIMIT 501
`;
