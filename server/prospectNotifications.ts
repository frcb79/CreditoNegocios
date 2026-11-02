export type ProspectNotificationPublisher = (userId: string, event: unknown) => void;
/** Publish only after COMMIT. A disconnected socket cannot invalidate the save. */
export function publishProspectNotification(publish: ProspectNotificationPublisher | undefined, row: any) {
  if (!publish || !row) return;
  try {
    publish(row.user_id, { type: "notification", notification: {
      id: row.id, userId: row.user_id, type: row.type, title: row.title, message: row.message,
      data: row.data, isRead: row.is_read ?? false, createdAt: row.created_at,
    } });
  } catch { /* The persisted notification remains available through polling. */ }
}
