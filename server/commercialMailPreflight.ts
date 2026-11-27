import type {CommercialMailDraft} from "../shared/commercialMailDrafts";
export type PlannedMailJob={userId:string;scheduledFor:string|Date};
export function summarizeCommercialMailPlan(audience:CommercialMailDraft["audience"],state:string,jobs:PlannedMailJob[],eligible:Set<string>,now=new Date(),dispatchEnabled=false){
  const users=new Set(jobs.map(j=>j.userId)),excluded=Array.from(users).filter(id=>!eligible.has(id)).length;
  const eligibleJobs=jobs.filter(j=>eligible.has(j.userId));
  const overdueJobs=eligibleJobs.filter(j=>new Date(j.scheduledFor).getTime()<=now.getTime()).length;
  const blockers=["La preparación no autoriza envíos; requiere aprobación y habilitación independiente."];
  if(state!=="planned")blockers.push("La campaña está cancelada.");
  if(audience==="pending_registration")blockers.push("La recuperación de invitaciones usa la versión aprobada; omite registros completados y etapas previamente enviadas.");
  if(excluded)blockers.push("Hay destinatarios que ya no cumplen el segmento; deben omitirse.");
  if(overdueJobs)blockers.push("Hay fechas vencidas; no deben enviarse correos acumulados automáticamente.");
  return {recipientCount:users.size,eligibleRecipients:users.size-excluded,excludedRecipients:excluded,eligibleFutureJobs:eligibleJobs.length-overdueJobs,overdueJobs,blockers,dispatchEnabled};
}
