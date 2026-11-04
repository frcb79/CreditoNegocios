/** Idempotent evolution of the reminder-day CHECK; existing events are preserved.
 * PostgreSQL uses this constraint name for the original CREATE TABLE.
 * Call only from the normal startup migration, never from a reminder send.
 */
export const BROKER_INVITATION_DAY_15_MIGRATION_SQL = `
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'broker_invitation_reminder_events'
       AND c.conname = 'broker_invitation_reminder_events_reminder_day_check'
       AND pg_get_constraintdef(c.oid) NOT LIKE '%15%'
  ) THEN
    ALTER TABLE public.broker_invitation_reminder_events
      DROP CONSTRAINT broker_invitation_reminder_events_reminder_day_check;
    ALTER TABLE public.broker_invitation_reminder_events
      ADD CONSTRAINT broker_invitation_reminder_events_reminder_day_check
      CHECK (reminder_day IN (3, 7, 12, 15));
  END IF;
END
$migration$;
`;
