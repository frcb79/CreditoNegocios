/**
 * Estado de una oportunidad con financieras (targets).
 * El estado de la solicitud padre puede quedar "in_progress" mientras un target
 * todavía sólo tiene visto bueno interno. Nunca implica contacto externo.
 * Prioridad compartida con Gestión de Créditos y el dashboard.
 */
export const submissionTargetStatusPriority: Record<string, number> = {
  dispersed: 1,
  selected_winner: 2,
  winner: 3,
  institution_approved: 4,
  proposal_received: 5,
  contact_initiated: 6,
  sent: 6,
  approved: 7,
  pending_admin: 8,
  returned_to_broker: 9,
  institution_rejected: 10,
  rejected: 11,
};
export function resolveSubmissionDisplayStatus(
  parentStatus: string,
  targets: ReadonlyArray<{ status: string }> | null | undefined
): string {
  if (!targets?.length) return parentStatus;
  const statuses = [...new Set(targets.map(t => t.status).filter(Boolean))];
  if (!statuses.length) return parentStatus;
  return statuses.sort((a, b) =>
    (submissionTargetStatusPriority[a] ?? 99) - (submissionTargetStatusPriority[b] ?? 99)
  )[0];
}
