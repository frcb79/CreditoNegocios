import { z } from "zod";

export const HISTORICAL_COMMISSION_STATES = ["pending","paid_external","not_applicable","unknown"] as const;
export const HISTORICAL_NETWORK_STATES = ["direct","master","unknown"] as const;
export function mexicoToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value || "";
  return [part("year"),part("month"),part("day")].join("-");
}
export function validHistoricalDate(value:string,today=mexicoToday()):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<"1900-01-01"||value>today)return false;
  const parsed=new Date(value+"T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===value;
}
const id=z.string().trim().min(1).max(128);
export const historicalCreditIntakeSchema=z.object({
  clientId:id,
  brokerId:id,
  financialInstitutionId:id,
  productTemplateId:id,
  externalReference:z.string().trim().min(3).max(120).transform(s=>s.toUpperCase().replace(/\s+/g," ")),
  actualDate:z.string().refine(v=>validHistoricalDate(v), "Indica una fecha real válida, no futura."),
  amount:z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/,"Monto válido en MXN, hasta dos decimales.").refine(v=>Number(v)>0,"El monto debe ser positivo.").transform(v=>Number(v).toFixed(2)),
  termMonths:z.number().int().min(1).max(600),
  evidenceDocumentId:id,
  historicalNetwork:z.enum(HISTORICAL_NETWORK_STATES),
  historicalMasterName:z.string().trim().max(200).optional(),
  commissionStatus:z.enum(HISTORICAL_COMMISSION_STATES),
  commissionEvidenceDocumentId:id.optional(),
  notes:z.string().trim().max(1000).optional(),
  originatorConfirmed:z.literal(true),
}).strict().superRefine((v,ctx)=>{
  if(v.historicalNetwork==="master" && !v.historicalMasterName?.trim())ctx.addIssue({code:"custom",path:["historicalMasterName"],message:"Identifica el Master histórico según la evidencia."});
  if(v.historicalNetwork!=="master" && v.historicalMasterName)ctx.addIssue({code:"custom",path:["historicalMasterName"],message:"El Master sólo aplica a la red histórica."});
  if(v.commissionStatus==="paid_external" && !v.commissionEvidenceDocumentId)ctx.addIssue({code:"custom",path:["commissionEvidenceDocumentId"],message:"Selecciona la evidencia del pago anterior."});
  if(v.commissionStatus!=="paid_external" && v.commissionEvidenceDocumentId)ctx.addIssue({code:"custom",path:["commissionEvidenceDocumentId"],message:"La evidencia de pago corresponde a una comisión previamente pagada."});
});
export type HistoricalCreditIntake=z.infer<typeof historicalCreditIntakeSchema>;

export const historicalCreditReviewSchema=z.object({
  historicalNetwork:z.enum(["direct","master"]),
  originMasterBrokerId:id.nullable(),
  evidenceReviewed:z.literal(true),
  reviewReason:z.string().trim().min(10).max(1000),
}).strict().superRefine((v,ctx)=>{
  if((v.historicalNetwork==="master")!==Boolean(v.originMasterBrokerId))ctx.addIssue({code:"custom",path:["originMasterBrokerId"],message:"Identifica al Master histórico sólo si corresponde."});
});
export type HistoricalCreditReview=z.infer<typeof historicalCreditReviewSchema>;
