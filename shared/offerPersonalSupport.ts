/** Commercial classification is distinct from borrower evidence and contractual lineage. */
export const PERSONAL_SUPPORT_OPTIONS = [
  {value:"por_confirmar",label:"Por confirmar con la financiera"},
  {value:"no_requerido",label:"Sin aval ni obligado solidario"},
  {value:"representante_firmante",label:"Representante legal únicamente firmante"},
  {value:"representante_solidario",label:"Representante legal como obligado solidario"},
  {value:"aval_adicional",label:"Aval adicional obligatorio"},
  {value:"obligado_solidario",label:"Obligado solidario obligatorio"},
  {value:"aval_o_solidario",label:"Aval u obligado solidario"}
] as const;
export type PersonalSupport = typeof PERSONAL_SUPPORT_OPTIONS[number]["value"];
export const SUPPORT_PROFILES=["persona_moral","fisica_empresarial","fisica","sin_sat"] as const;
export function isPersonalSupport(value:unknown):value is PersonalSupport {
  return PERSONAL_SUPPORT_OPTIONS.some(o=>o.value===value);
}
export function supportBasis(conditions:any={},requirements:any={}) {
  return JSON.stringify({source:requirements.guarantorSource??null,legacy:conditions.avalesType??null,
    profiles:Array.isArray(requirements.targetProfiles)?[...requirements.targetProfiles].sort():[]});
}
export function reviewedSupport(conditions:any={},requirements:any={},profile:string|null):PersonalSupport|undefined {
  const r=requirements.personalSupportResolution;
  if(!r)return undefined;
  if(!profile || r.basis!==supportBasis(conditions,requirements) || typeof r.reviewedBy!=="string" ||
    !r.reviewedBy || typeof r.reason!=="string" || r.reason.trim().length<3 ||
    !Number.isFinite(Date.parse(r.reviewedAt)) || !isPersonalSupport(r.byProfile?.[profile]))return "por_confirmar";
  return r.byProfile[profile];
}
