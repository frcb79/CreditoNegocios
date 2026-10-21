/**
 * Single presentation dictionary for client types across enrollment, client list and profile editing.
 * Colors are identifiers, not status/eligibility signals.
 */
export const CLIENT_TYPE_PRESENTATION = {
  persona_moral: {
    label: "Persona Moral",
    short: "PM",
    description: "Empresa constituida",
    dotClass: "bg-blue-500",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200/80",
    tileClass: "border-blue-200 bg-blue-50/50",
    selectedClass: "border-blue-500 bg-blue-50 ring-1 ring-blue-400",
    iconClass: "bg-blue-100 text-blue-700",
    textClass: "text-blue-700",
  },
  fisica_empresarial: {
    label: "PFAE",
    short: "PFAE",
    description: "Persona Física con Actividad Empresarial",
    dotClass: "bg-violet-500",
    badgeClass: "bg-violet-50 text-violet-700 border-violet-200/80",
    tileClass: "border-violet-200 bg-violet-50/50",
    selectedClass: "border-violet-500 bg-violet-50 ring-1 ring-violet-400",
    iconClass: "bg-violet-100 text-violet-700",
    textClass: "text-violet-700",
  },
  fisica: {
    label: "Persona Física",
    short: "PF",
    description: "Persona física, asalariada o independiente",
    dotClass: "bg-emerald-500",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    tileClass: "border-emerald-200 bg-emerald-50/50",
    selectedClass: "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400",
    iconClass: "bg-emerald-100 text-emerald-700",
    textClass: "text-emerald-700",
  },
  sin_sat: {
    label: "Sin SAT",
    short: "Sin SAT",
    description: "Persona con actividad económica sin registro fiscal disponible",
    dotClass: "bg-slate-400",
    badgeClass: "bg-slate-50 text-slate-700 border-slate-200/80",
    tileClass: "border-slate-200 bg-slate-50/50",
    selectedClass: "border-slate-500 bg-slate-100 ring-1 ring-slate-400",
    iconClass: "bg-slate-100 text-slate-700",
    textClass: "text-slate-700",
  },
} as const;

export type ClientProfileType = keyof typeof CLIENT_TYPE_PRESENTATION;

export const CLIENT_TYPE_OPTIONS: ClientProfileType[] = [
  "persona_moral", "fisica_empresarial", "fisica", "sin_sat"
];

export function isClientProfileType(value: unknown): value is ClientProfileType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CLIENT_TYPE_PRESENTATION, value);
}
