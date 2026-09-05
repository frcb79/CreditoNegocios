// Configuración compartida de estados para submissions y targets
// Centraliza labels y colores para mantener consistencia en toda la aplicación

export const submissionStatusConfig = {
  draft: { label: "Borrador", color: "bg-muted text-muted-foreground border-border" },
  submitted: { label: "Enviado", color: "bg-primary/10 text-primary border-primary/20" },
  pending_admin: { label: "Pendiente Admin", color: "bg-warning/10 text-warning border-warning/20" },
  returned_to_broker: { label: "Devuelto", color: "bg-danger/10 text-danger border-danger/20" },
  sent_to_institutions: { label: "Enviado a Financieras", color: "bg-secondary/10 text-secondary border-secondary/20" },
  proposals_received: { label: "Propuestas Recibidas", color: "bg-accent/10 text-accent border-accent/20" },
  winner_selected: { label: "Ganador Seleccionado", color: "bg-success/15 text-success border-success/30 font-semibold" },
  dispersed: { label: "Dispersado", color: "bg-success text-primary-foreground" },
};

export const targetStatusConfig = {
  pending_admin: { label: "Pendiente Admin", color: "bg-warning/10 text-warning border-warning/20" },
  approved: { label: "Visto Bueno", color: "bg-primary/10 text-primary border-primary/20" },
  returned_to_broker: { label: "Devuelto", color: "bg-danger/10 text-danger border-danger/20" },
  sent: { label: "Enviado", color: "bg-secondary/10 text-secondary border-secondary/20" },
  institution_approved: { label: "Propuesta Recibida", color: "bg-success/10 text-success border-success/20" },
  proposal_received: { label: "Propuesta Recibida", color: "bg-success/10 text-success border-success/20" },
  institution_rejected: { label: "Rechazada por Financiera", color: "bg-danger/10 text-danger border-danger/20" },
  rejected: { label: "Rechazada", color: "bg-danger/10 text-danger border-danger/20" },
  selected_winner: { label: "Ganador", color: "bg-accent/10 text-accent border-accent/20 font-semibold" },
  winner: { label: "Ganador", color: "bg-accent/10 text-accent border-accent/20 font-semibold" },
  dispersed: { label: "Dispersado", color: "bg-success text-primary-foreground border-success/30" },
};

export const creditStatusConfig = {
  under_review: { label: "En Revisión", color: "bg-warning/10 text-warning border-warning/20" },
  approved: { label: "Aprobado", color: "bg-success/10 text-success border-success/20" },
  rejected: { label: "Rechazado", color: "bg-danger/10 text-danger border-danger/20" },
  disbursed: { label: "Dispersado", color: "bg-success text-primary-foreground" },
  dispersed: { label: "Dispersado", color: "bg-success text-primary-foreground" },
  active: { label: "Activo", color: "bg-success/15 text-success border-success/30" },
  completed: { label: "Completado", color: "bg-muted text-muted-foreground border-border" },
  defaulted: { label: "En Mora", color: "bg-danger/15 text-danger border-danger/30" },
};

// Helper para obtener resumen de estados cuando hay múltiples targets
export interface StatusSummary {
  hasMultipleStatuses: boolean;
  primaryStatus: string;
  statusCounts: Record<string, number>;
  summaryText: string;
  badges: Array<{ status: string; label: string; color: string; count: number }>;
}

export function getSubmissionStatusSummary(targets: Array<{ status: string }>): StatusSummary {
  if (!targets || targets.length === 0) {
    return {
      hasMultipleStatuses: false,
      primaryStatus: 'pending_admin',
      statusCounts: {},
      summaryText: 'Sin targets',
      badges: [],
    };
  }

  // Contar estados
  const statusCounts: Record<string, number> = {};
  targets.forEach(target => {
    statusCounts[target.status] = (statusCounts[target.status] || 0) + 1;
  });

  const uniqueStatuses = Object.keys(statusCounts);
  const hasMultipleStatuses = uniqueStatuses.length > 1;

  // Determinar estado primario (prioridad: devuelto > pendiente > aprobado > enviado > propuesta > ganador > dispersado)
  // Determinar estado primario (prioridad: dispersado > ganador > propuesta > aprobado > pendiente > devuelto)
  const statusPriority: Record<string, number> = {
    'dispersed': 1,
    'selected_winner': 2,
    'winner': 3,
    'institution_approved': 4,
    'proposal_received': 5,
    'sent': 6,
    'approved': 7,
    'pending_admin': 8,
    'returned_to_broker': 9,
    'institution_rejected': 10,
    'rejected': 11,
  };

  const primaryStatus = uniqueStatuses.sort((a, b) => 
    (statusPriority[a] || 99) - (statusPriority[b] || 99)
  )[0];

  // Generar texto de resumen
  let summaryText = '';
  if (hasMultipleStatuses) {
    const parts = uniqueStatuses.map(status => {
      const count = statusCounts[status];
      const config = targetStatusConfig[status as keyof typeof targetStatusConfig];
      return `${count} ${config?.label || status}`;
    });
    summaryText = `Mixto: ${parts.join(', ')}`;
  } else {
    const config = targetStatusConfig[primaryStatus as keyof typeof targetStatusConfig];
    summaryText = config?.label || primaryStatus;
  }

  // Generar badges
  const badges = uniqueStatuses.map(status => {
    const config = targetStatusConfig[status as keyof typeof targetStatusConfig];
    return {
      status,
      label: config?.label || status,
      color: config?.color || 'bg-gray-100 text-gray-800',
      count: statusCounts[status],
    };
  });

  return {
    hasMultipleStatuses,
    primaryStatus,
    statusCounts,
    summaryText,
    badges,
  };
}
