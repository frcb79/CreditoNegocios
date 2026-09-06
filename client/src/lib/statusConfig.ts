// Configuración compartida de estados para submissions y targets
// Centraliza labels y colores para mantener consistencia en toda la aplicación

export const submissionStatusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "Borrador", color: "bg-gray-100 text-gray-700 border-gray-200" },
  submitted: { label: "Enviado", color: "bg-blue-50 text-blue-700 border-blue-200 font-medium" },
  pending_admin: { label: "Pendiente Admin", color: "bg-amber-100 text-amber-800 border-amber-300 font-semibold" },
  under_review: { label: "En Revisión", color: "bg-amber-100 text-amber-800 border-amber-300 font-medium" },
  returned_to_broker: { label: "Devuelto", color: "bg-orange-100 text-orange-800 border-orange-300 font-medium" },
  sent_to_institutions: { label: "Enviado a Financieras", color: "bg-blue-100 text-blue-800 border-blue-300 font-semibold" },
  sent: { label: "Enviado a Financieras", color: "bg-blue-100 text-blue-800 border-blue-300 font-semibold" },
  proposals_received: { label: "Propuestas Recibidas", color: "bg-indigo-100 text-indigo-800 border-indigo-200 font-medium" },
  winner_selected: { label: "Ganador Seleccionado", color: "bg-purple-100 text-purple-800 border-purple-300 font-semibold" },
  selected_winner: { label: "Ganador Seleccionado", color: "bg-purple-100 text-purple-800 border-purple-300 font-semibold" },
  dispersed: { label: "Dispersado", color: "bg-emerald-600 text-white font-semibold" },
  disbursed: { label: "Dispersado", color: "bg-emerald-600 text-white font-semibold" },
  partially_dispersed: { label: "Dispersión Parcial", color: "bg-teal-600 text-white font-semibold" },
};

export const targetStatusConfig: Record<string, { label: string; color: string }> = {
  pending_admin: { label: "Pendiente Admin", color: "bg-amber-100 text-amber-800 border-amber-300 font-semibold" },
  approved: { label: "Visto Bueno", color: "bg-emerald-50 text-emerald-700 border-emerald-300 font-medium" },
  returned_to_broker: { label: "Devuelto", color: "bg-orange-100 text-orange-800 border-orange-300 font-medium" },
  sent: { label: "Enviado a Financiera", color: "bg-blue-100 text-blue-800 border-blue-300 font-semibold" },
  sent_to_institutions: { label: "Enviado a Financiera", color: "bg-blue-100 text-blue-800 border-blue-300 font-semibold" },
  institution_approved: { label: "Propuesta Recibida", color: "bg-emerald-100 text-emerald-800 border-emerald-300 font-medium" },
  proposal_received: { label: "Propuesta Recibida", color: "bg-emerald-100 text-emerald-800 border-emerald-300 font-medium" },
  institution_rejected: { label: "Rechazada por Financiera", color: "bg-red-100 text-red-800 border-red-300 font-medium" },
  rejected: { label: "Rechazada", color: "bg-red-100 text-red-800 border-red-300 font-medium" },
  selected_winner: { label: "Ganador", color: "bg-purple-100 text-purple-800 border-purple-300 font-semibold" },
  winner: { label: "Ganador", color: "bg-purple-100 text-purple-800 border-purple-300 font-semibold" },
  dispersed: { label: "Dispersado", color: "bg-emerald-600 text-white font-semibold" },
  disbursed: { label: "Dispersado", color: "bg-emerald-600 text-white font-semibold" },
};

export const creditStatusConfig: Record<string, { label: string; color: string }> = {
  pending_admin: { label: "Pendiente Admin", color: "bg-amber-100 text-amber-800 border-amber-300 font-semibold" },
  under_review: { label: "En Revisión", color: "bg-amber-100 text-amber-800 border-amber-300 font-medium" },
  approved: { label: "Aprobado", color: "bg-emerald-100 text-emerald-800 border-emerald-300 font-medium" },
  sent: { label: "Enviado a Financieras", color: "bg-blue-100 text-blue-800 border-blue-300 font-semibold" },
  sent_to_institutions: { label: "Enviado a Financieras", color: "bg-blue-100 text-blue-800 border-blue-300 font-semibold" },
  winner_selected: { label: "Ganador Seleccionado", color: "bg-purple-100 text-purple-800 border-purple-300 font-semibold" },
  selected_winner: { label: "Ganador Seleccionado", color: "bg-purple-100 text-purple-800 border-purple-300 font-semibold" },
  rejected: { label: "Rechazado", color: "bg-red-100 text-red-800 border-red-300 font-medium" },
  disbursed: { label: "Dispersado", color: "bg-emerald-600 text-white font-semibold" },
  dispersed: { label: "Dispersado", color: "bg-emerald-600 text-white font-semibold" },
  active: { label: "Activo", color: "bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold" },
  completed: { label: "Completado", color: "bg-gray-100 text-gray-700 border-gray-200" },
  defaulted: { label: "En Mora", color: "bg-red-100 text-red-800 border-red-300 font-semibold" },
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
