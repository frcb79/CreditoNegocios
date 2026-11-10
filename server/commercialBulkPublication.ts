import { z } from "zod";

/** One explicit, bounded administrative action; all-or-nothing. */
export const commercialBulkPublishSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f0-9-]{36}$/i))
    .min(1).max(200).refine(ids=>new Set(ids).size===ids.length,
      "No se admiten plantillas duplicadas."),
  editorialLegalApproved: z.literal(true),
}).strict();

export type CommercialPublicationCandidate = {
  id: string;
  slug: string;
  name: string;
  status: string;
  definition: unknown;
  artwork_id: string | null;
};

/** Preflight under row locks and per-slug advisory locks, before any UPDATE. */
export function bulkPublicationBlockers(
  ids: readonly string[], rows: readonly CommercialPublicationCandidate[],
): string[] {
  if (rows.length!==ids.length || new Set(rows.map(row=>row.id)).size!==ids.length)
    return ["Una o más plantillas ya no están disponibles. Actualiza el catálogo."];

  const slugs=new Set<string>();
  const errors:string[]=[];
  for(const row of rows){
    if(row.status!=="draft")
      errors.push("\""+row.name+"\" ya no es un borrador.");
    if(slugs.has(row.slug))
      errors.push("Seleccionaste dos versiones del mismo identificador ("+row.slug+"). Elige solo una.");
    slugs.add(row.slug);

    const definition=row.definition;
    const graphic=definition && typeof definition==="object" && "graphic" in definition
      ? (definition as {graphic?:unknown}).graphic : undefined;
    if(graphic){
      if(!row.artwork_id)
        errors.push("\""+row.name+"\" no tiene el PNG original guardado.");
      if(typeof graphic!=="object" || graphic===null ||
          (graphic as {typographyReviewRequired?:boolean}).typographyReviewRequired)
        errors.push("\""+row.name+"\" necesita confirmar tipografía y mapa antes de publicarse.");
    }
  }
  return errors;
}
