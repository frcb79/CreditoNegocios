// Configuración compartida de estados para submissions y targets
// Centraliza labels y colores para mantener consistencia en toda la aplicación

export const submissionStatusConfig = {
  draft: { label: "Borrador", color: "bg-gray-100 text-gray-800" },
  submitted: { label: "Enviado", color: "bg-blue-100 text-primary" },
  pending_admin: { label: "Pendiente Admin", color: "bg-yellow-100 text-yellow-800" },
  returned_to_broker: { label: "Devuelto", color: "bg-orange-100 text-orange-800" },
  sent_to_institutions: { label: "Enviado a Financieras", color: "bg-blue-100 text-blue-800" },
  proposals_received: { label: "Propuestas Recibidas", color: "bg-purple-100 text-purple-800" },
  winner_selected: { label: "Ganador Seleccionado", color: "bg-green-100 text-green-800" },
  dispersed: { label: "Dispersado", color: "bg-success text-white" },
};

export const targetStatusConfig = {
  pending_admin: { label: "Pendiente Admin", color: "bg-yellow-100 text-yellow-800" },
  approved: { label: "Visto Bueno", color: "bg-green-100 text-green-800" },
  returned_to_broker: { label: "Devuelto", color: "bg-orange-100 text-orange-800" },
  sent: { label: "Enviado", color: "bg-blue-100 text-blue-800" },
  proposal_received: { label: "Propuesta Recibida", color: "bg-purple-100 text-purple-800" },
  winner: { label: "Ganador", color: "bg-green-600 text-white" },
  dispersed: { label: "Dispersado", color: "bg-success text-white" },
};

export const creditStatusConfig = {
  under_review: { label: "En Revisión", color: "bg-yellow-100 text-warning" },
  approved: { label: "Aprobado", color: "bg-green-100 text-success" },
  rejected: { label: "Rechazado", color: "bg-red-100 text-danger" },
  disbursed: { label: "Dispersado", color: "bg-success text-white" },
  dispersed: { label: "Dispersado", color: "bg-success text-white" },
  active: { label: "Activo", color: "bg-green-200 text-green-800" },
  completed: { label: "Completado", color: "bg-gray-200 text-gray-700" },
  defaulted: { label: "En Mora", color: "bg-red-200 text-red-800" },
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
  const statusPriority: Record<string, number> = {
    'returned_to_broker': 1,
    'pending_admin': 2,
    'approved': 3,
    'sent': 4,
    'proposal_received': 5,
    'winner': 6,
    'dispersed': 7,
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
