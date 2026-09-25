export interface StatusBadgeConfig {
  label: string;
  description: string;
  badgeClass: string;
  dotClass: string;
}

export const OPPORTUNITY_STATUS_MAP: Record<string, StatusBadgeConfig> = {
  registered_hold: {
    label: "Reserva inicial",
    description: "Periodo inicial de reserva para perfilamiento y recolección de documentos.",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700",
    dotClass: "bg-amber-500",
  },
  protected_active: {
    label: "Oportunidad protegida",
    description: "Protección comercial activa respaldada por actividades comerciales estructuradas.",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700",
    dotClass: "bg-emerald-500",
  },
  expired_released: {
    label: "Vencida / Liberada",
    description: "El periodo de protección expiró por inactividad. La necesidad puede ser registrada nuevamente.",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    dotClass: "bg-slate-400",
  },
  converted_credit: {
    label: "Convertida a crédito",
    description: "La oportunidad culminó con éxito en un crédito formal colocado y dispersado.",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700",
    dotClass: "bg-blue-500",
  },
  disputed: {
    label: "En controversia formal",
    description: "Bajo revisión de Mesa de Control por solicitud formal verificable del cliente o evidencia contradictoria.",
    badgeClass: "bg-red-50 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-700",
    dotClass: "bg-red-500",
  },
  rejected: {
    label: "Rechazada / No aprobada",
    description: "La oportunidad fue rechazada formalmente o no cumple con las políticas de financiamiento.",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700",
    dotClass: "bg-rose-500",
  },
};

export const RELATIONSHIP_STATUS_MAP: Record<string, StatusBadgeConfig> = {
  active: {
    label: "Relación comercial activa",
    description: "Asesor titular con relación comercial vigente y facultades plenas.",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700",
    dotClass: "bg-emerald-500",
  },
  dormant: {
    label: "Relación sin actividad reciente",
    description: "Sin actividad comercial reciente. Permite reactivación al registrar una nueva oportunidad.",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700",
    dotClass: "bg-amber-500",
  },
  legacy_unverified: {
    label: "Relación por validar",
    description: "Cliente migrado o histórico sin actividad validada dentro del plazo estándar.",
    badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-700",
    dotClass: "bg-indigo-500",
  },
  inactive: {
    label: "Relación inactiva",
    description: "Sin vinculación comercial vigente en la cartera.",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    dotClass: "bg-slate-400",
  },
};

export const COMMERCIAL_ACTIVITY_OPTIONS = [
  {
    value: "meeting_conducted",
    label: "Reunión comercial documentada",
    isQualifying: true,
    description: "Entrevista o reunión de perfilamiento con minuta de acuerdos.",
  },
  {
    value: "financial_doc_uploaded",
    label: "Carga de documentación financiera / SAT",
    isQualifying: true,
    description: "Balanza, CIEC, estados de cuenta bancarios o declaraciones anuales.",
  },
  {
    value: "proposal_sent",
    label: "Envío de cotización o propuesta formal",
    isQualifying: true,
    description: "Propuesta formal de crédito, corrida financiera o cotización enviada.",
  },
  {
    value: "customer_reply",
    label: "Respuesta verificable del cliente",
    isQualifying: true,
    description: "Confirmación escrita, retroalimentación directa o interacción verificable.",
  },
  {
    value: "submission_created",
    label: "Ingreso de solicitud a mesa / financiera",
    isQualifying: true,
    description: "Expediente formalmente presentado a mesa de admisión o institución.",
  },
  {
    value: "approval_received",
    label: "Resolución o pre-aprobación recibida",
    isQualifying: true,
    description: "Dictamen favorable, carta de intención o pre-aprobación de fondeador.",
  },
  {
    value: "crm_note",
    label: "Nota interna de seguimiento (CRM)",
    isQualifying: false,
    description: "Nota libre o recordatorio interno. No extiende la protección comercial.",
  },
  {
    value: "call_unverified",
    label: "Llamada informativa no calificada",
    isQualifying: false,
    description: "Llamada sin minuta ni documento probatorio. No extiende protección.",
  },
];

export const FORMAL_DISPUTE_REASON_OPTIONS = [
  {
    value: "client_broker_change_request",
    label: "Solicitud formal de cambio de broker por el cliente",
    description: "Carta membretada firmada por representante legal o confirmación verificable del cliente.",
  },
  {
    value: "contradictory_evidence",
    label: "Evidencia documental contradictoria",
    description: "Documento probatorio fehaciente que desvirtúa la exclusividad o actividad declarada.",
  },
  {
    value: "mesa_control_intervention",
    label: "Intervención expresa de Mesa de Control / Super Admin",
    description: "Arbitraje normativo o instrucción regulatoria central.",
  },
] as const;

export const FINANCING_NEEDS_OPTIONS = [
  { value: "credito_empresarial", label: "Crédito Empresarial / Simple" },
  { value: "arrendamiento", label: "Arrendamiento Puro / Financiero" },
  { value: "factoraje", label: "Línea de Factoraje" },
  { value: "credito_revolvente", label: "Crédito Revolvente / Línea de Crédito" },
  { value: "hipotecario_empresarial", label: "Crédito Hipotecario Empresarial" },
  { value: "hipotecario_vivienda", label: "Crédito Hipotecario Vivienda" },
  { value: "automotriz_flotillas", label: "Automotriz / Flotillas" },
  { value: "capital_trabajo", label: "Capital de Trabajo Especializado" },
];

export function getOpportunityStatusBadge(status?: string): StatusBadgeConfig {
  if (!status) return OPPORTUNITY_STATUS_MAP.registered_hold;
  return OPPORTUNITY_STATUS_MAP[status] || {
    label: status,
    description: "",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    dotClass: "bg-slate-400",
  };
}

export const getOpportunityStatusConfig = getOpportunityStatusBadge;

export function getRelationshipStatusBadge(status?: string): StatusBadgeConfig {
  if (!status) return RELATIONSHIP_STATUS_MAP.legacy_unverified;
  return RELATIONSHIP_STATUS_MAP[status] || {
    label: status,
    description: "",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    dotClass: "bg-slate-400",
  };
}

export const getRelationshipStatusConfig = getRelationshipStatusBadge;

export function getNeedTypeLabel(needType?: string): string {
  if (!needType) return "Necesidad no especificada";
  const found = FINANCING_NEEDS_OPTIONS.find(o => o.value === needType);
  if (found) return found.label;
  if (needType === 'renovacion') return 'Renovación de Crédito';
  return needType.replace(/_/g, ' ');
}

export function formatOpportunityDate(date: any): string {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export function getDaysRemaining(expiresAt: any): number | null {
  if (!expiresAt) return null;
  try {
    const exp = new Date(expiresAt).getTime();
    if (isNaN(exp)) return null;
    const now = Date.now();
    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch {
    return null;
  }
}

