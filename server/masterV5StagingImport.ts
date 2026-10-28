import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { financialInstitutions, institutionProducts, institutionProductVersions, productTemplates } from "../shared/schema";
import { computeInstitutionProductVersionHash, validateOfferVersionParameters } from "./offerVersionService";
import type { MasterV5Preview, MasterV5Row } from "./masterV5Preview";
import { resolveMasterV5Template, planMasterV5Catalog } from "./masterV5TemplateResolver";

/** Transactional, idempotent, staging-only service. Never modifies published versions. */
const key = (v: unknown) => String(v ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
const hash = (id: string, n: number, c: any, r: any, docs: string[], vars: any) =>
  computeInstitutionProductVersionHash({
    institutionProductId: id, versionNumber: n, conditions: c,
    requirements: r, requiredDocuments: docs, variablesConfiguration: vars,
  });
function conditions(row: MasterV5Row): Record<string, unknown> {
  const c: Record<string, unknown> = { ...row.condiciones };
  if (row.montoMinimo !== null) c.minAmount = row.montoMinimo;
  if (row.montoMaximo !== null) c.maxAmount = row.montoMaximo;
  // No convertir el máximo TPV en una regla numérica; queda como descripción para el broker.
  if (row.plazoMaximoMeses !== null) c.maxTermMonths = row.plazoMaximoMeses;
  return c;
}
function requirements(row: MasterV5Row): Record<string, unknown> {
  const ranges: Record<string, unknown> = {};
  if (row.montoMinimo !== null || row.montoMaximo !== null)
    ranges.monto = { ...(row.montoMinimo !== null ? { min: row.montoMinimo } : {}),
      ...(row.montoMaximo !== null ? { max: row.montoMaximo } : {}) };
  if (typeof row.matching.minMonthsInBusiness === "number")
    ranges.tiempoActividad = { min: row.matching.minMonthsInBusiness };
  if (typeof row.matching.minMonthlyIncome === "number")
    ranges.ingresoMensualPromedio = { min: row.matching.minMonthlyIncome };
  if (typeof row.matching.minAnnualIncome === "number")
    ranges.ingresoAnual = { min: row.matching.minAnnualIncome };
  if (typeof row.matching.minShareholderBureau === "number")
    ranges.buroAccionistaPrincipal = { min: row.matching.minShareholderBureau };
  if (typeof row.matching.minBusinessBureau === "number")
    ranges.buroEmpresa = { min: row.matching.minBusinessBureau };
  if (typeof row.matching.minPersonalBureau === "number")
    ranges.buroPersonaFisica = { min: row.matching.minPersonalBureau };
  return { targetProfiles: row.perfiles, ...row.matching, ranges,
    profileRules: Object.fromEntries(row.perfiles.map(p => [p, { ranges: Object.fromEntries(Object.entries(ranges).filter(([key]) =>
      p === "persona_moral" ? key !== "buroPersonaFisica" : !["buroEmpresa", "buroAccionistaPrincipal"].includes(key)
    )) }])) };
}
function check(preview: MasterV5Preview, kind: string) {
  if (preview.kind !== kind || preview.errors.length) throw Error("Hay errores que impiden importar " + kind);
  if (preview.rows.length < 1 || preview.rows.length > 200) throw Error("Se requieren entre 1 y 200 ofertas");
}

export async function importMasterV5FinancialDrafts(preview: MasterV5Preview, userId: string) {
  check(preview, "financieras");
  return db.transaction(async tx => {
    await tx.execute(sql.raw("SELECT pg_advisory_xact_lock(hashtext('cn-master-v5-import'))"));
    const insts = await tx.select().from(financialInstitutions);
    const offers = await tx.select().from(institutionProducts);
    const templates = await tx.select().from(productTemplates);
    // Todas las plantillas faltantes corresponden a familias APROBADAS.
    // Planificar primero y crear únicamente dentro de la misma transacción
    // (rollback si falla una oferta). No crear plantillas por cada financiera.
    const catalogPlan = planMasterV5Catalog(templates, preview.rows.map(row => row.familia));
    if (catalogPlan.errors.length) throw Error(catalogPlan.errors.join("; "));
    for (const blueprint of catalogPlan.create) {
      const [created] = await tx.insert(productTemplates).values({
        id: randomUUID(), name: blueprint.name, category: blueprint.category,
        description: blueprint.description, targetProfiles: blueprint.profiles,
        availableVariables: blueprint.variables,
        baseConfiguration: { catalog_family: blueprint.family, variants: blueprint.variants,
          policy: "Matching basado en oferta publicada y datos efectivamente capturados." },
        isActive: true, createdBy: userId,
      }).returning();
      templates.push(created);
    }
    const assignments = new Map<number, ReturnType<typeof resolveMasterV5Template>>();
    for (const row of preview.rows) {
      const resolved = resolveMasterV5Template(templates, row.familia);
      if (!resolved.template) throw Error(
        (resolved.error || "Plantilla no disponible") +
        " (fila " + row.row + ": " + row.nombreOferta + ")");
      assignments.set(row.row, resolved);
    }
    let institutionsCreated = 0, offersCreated = 0, alreadyPresent = 0, enrichedDrafts = 0;
    const results: { row: number; status: string }[] = [];
    for (const row of preview.rows) {
      let inst = insts.find(i => key(i.name) === key(row.financiera));
      if (!inst) {
        const [created] = await tx.insert(financialInstitutions).values({
          id: randomUUID(), name: row.financiera, createdBy: userId, createdByAdmin: true,
          acceptedProfiles: row.perfiles, isActive: true,
          notes: "Importación V5: condiciones y comisiones por oferta versionada",
        }).returning();
        inst = created; insts.push(inst); institutionsCreated++;
      }
      const found = offers.filter(o => o.institutionId === inst!.id &&
        key(o.name || o.customName) === key(row.nombreOferta));
      if (found.length > 1) throw Error("Ofertas existentes duplicadas: " + row.financiera + " / " + row.nombreOferta);
      if (found.length === 1) {
        // Controlled V5 reconciliation: fill ONLY the three source descriptors that
        // were accidentally omitted from the first import. No commission/condition
        // change, no new versions, never mutate published versions or replace nonblank data.
        const existingOffer = found[0];
        const existingDrafts = await tx.select().from(institutionProductVersions).where(and(
          eq(institutionProductVersions.institutionProductId, existingOffer.id),
          eq(institutionProductVersions.status, "draft"),
        ));
        if (existingDrafts.length > 1) throw Error("Borradores duplicados: " + row.nombreOferta);
        if (existingDrafts.length === 1) {
          const draft = existingDrafts[0];
          const req = { ...((draft.requirements || {}) as Record<string, unknown>) };
          const cond = { ...((draft.conditions || {}) as Record<string, unknown>) };
          let enriched = false;
          // Keep original technical columns in an audit-only field. Do not touch
          // commissionRates or any existing published/manual conditions.
          if (!cond.sourceTechnicalFields && row.condiciones.sourceTechnicalFields) {
            cond.sourceTechnicalFields = row.condiciones.sourceTechnicalFields;
            enriched = true;
          }
          for (const k of ["businessAgeSource", "bureauPolicySource", "guarantorSource"]) {
            const source = row.matching[k];
            if (typeof source === "string" && source.trim() &&
                (req[k] === undefined || req[k] === null || req[k] === "")) {
              req[k] = source.trim();
              enriched = true;
            }
          }
          if (enriched) {
            await tx.update(institutionProductVersions).set({
              requirements: req,
              conditions: cond,
              versionHash: hash(draft.institutionProductId, draft.versionNumber,
                cond, req, draft.requiredDocuments || [], draft.variablesConfiguration || {}),
              updatedAt: new Date(),
              changeReason: "V5: completar descriptores y ficha técnica fuente, sin modificar comisiones",
            }).where(and(eq(institutionProductVersions.id, draft.id),
              eq(institutionProductVersions.status, "draft")));
            enrichedDrafts++;
            results.push({ row: row.row, status: "existing_draft_source_enriched" });
            continue;
          }
        }
        alreadyPresent++;
        results.push({ row: row.row, status: "existing_untouched" });
        continue;
      }
      const matched = assignments.get(row.row);
      if (!matched?.template || !matched.productType) throw Error(
        "Plantilla no encontrada para " + row.nombreOferta);
      const id = randomUUID(), c = conditions(row), r = requirements(row);
      // Hipotecario empresarial utiliza la familia Hipotecario con segmento propio;
      // nunca se confunde con ofertas de vivienda.
      if (matched.segment) {
        c.segmento_hipotecario = matched.segment;
        r.segmento_hipotecario = matched.segment;
      }
      const sourceDocs = row.condiciones.requiredDocumentationSource;
      const docs = typeof sourceDocs === "string" && sourceDocs.trim() ? [sourceDocs.trim()] : [];
      const vars = {};
      const [created] = await tx.insert(institutionProducts).values({
        id, institutionId: inst.id, templateId: matched.template.id,
        name: row.nombreOferta, customName: row.nombreOferta,
        productType: matched.productType, description: String(row.condiciones.sourceNotes || "") || null,
        targetProfiles: row.perfiles, configuration: {}, activeVariables: {},
        status: "draft", currentVersionNumber: 1, isActive: inst.isActive !== false, createdBy: userId,
      }).returning();
      offers.push(created);
      await tx.insert(institutionProductVersions).values({
        id: randomUUID(), institutionProductId: id, versionNumber: 1, status: "draft",
        conditions: c, requirements: r, requiredDocuments: docs, variablesConfiguration: vars,
        versionHash: hash(id, 1, c, r, docs, vars), createdBy: userId,
        changeReason: "Maestro V5: borrador sin publicación automática",
      });
      offersCreated++; results.push({ row: row.row, status: "created_draft" });
    }
    return { institutionsCreated, offersCreated, alreadyPresent, enrichedDrafts, canonicalTemplatesCreated: catalogPlan.create.map(x => x.name), published: 0, results };
  });
}

export async function importMasterV5CommissionDrafts(preview: MasterV5Preview) {
  check(preview, "comisiones");
  return db.transaction(async tx => {
    await tx.execute(sql.raw("SELECT pg_advisory_xact_lock(hashtext('cn-master-v5-import'))"));
    const insts = await tx.select().from(financialInstitutions);
    const offers = await tx.select().from(institutionProducts);
    const versions = await tx.select().from(institutionProductVersions);
    const plan: { row: MasterV5Row; draft: typeof versions[number] }[] = [];
    // Validate all targets BEFORE any writes so one invalid offer rolls back the whole upload.
    for (const row of preview.rows) {
      const inst = insts.find(i => key(i.name) === key(row.financiera));
      if (!inst) throw Error("No existe financiera: " + row.financiera);
      const candidates = offers.filter(o => o.institutionId === inst.id &&
        key(o.name || o.customName) === key(row.nombreOferta));
      if (candidates.length !== 1) throw Error("Oferta no encontrada o duplicada: " + row.nombreOferta);
      const drafts = versions.filter(v => v.institutionProductId === candidates[0].id && v.status === "draft");
      if (drafts.length !== 1) throw Error("Se necesita un único borrador de oferta: " + row.nombreOferta);
      plan.push({ row, draft: drafts[0] });
    }
    let changed = 0, unchanged = 0;
    for (const { row, draft } of plan) {
      const v = row.comisiones;
      const rates = {
        financiera: { total: v["Financiera total %"], apertura: v["Financiera apertura %"],
          sobretasa: v["Financiera sobretasa %"], renovacion: v["Financiera renovación %"] },
        superAdmin: { total: v["Financiera total %"], apertura: v["Financiera apertura %"],
          sobretasa: v["Financiera sobretasa %"], renovacion: v["Financiera renovación %"] },
        masterBroker: { total: v["Master total %"], apertura: v["Master apertura %"],
          sobretasa: 0, renovacion: v["Master renovación %"] },
        broker: { total: v["Broker directo total %"], apertura: v["Broker apertura %"],
          sobretasa: 0, renovacion: v["Broker renovación %"] },
      };
      const c = { ...((draft.conditions || {}) as Record<string, unknown>),
        commissionRates: rates, overrateOwner: "credito_negocios" };
      const validation = validateOfferVersionParameters({ conditions: c });
      if (!validation.isValid) throw Error(row.nombreOferta + ": " + validation.errors.join("; "));
      if (JSON.stringify(draft.conditions) === JSON.stringify(c)) { unchanged++; continue; }
      const r = draft.requirements || {}, docs = draft.requiredDocuments || [];
      const vars = draft.variablesConfiguration || {};
      const [updated] = await tx.update(institutionProductVersions).set({
        conditions: c, versionHash: hash(draft.institutionProductId, draft.versionNumber, c, r, docs, vars),
        changeReason: "Comisiones V5: sobretasa exclusiva Crédito Negocios", updatedAt: new Date(),
      }).where(and(eq(institutionProductVersions.id, draft.id), eq(institutionProductVersions.status, "draft"))).returning();
      if (!updated) throw Error("Borrador no disponible: " + row.nombreOferta);
      changed++;
    }
    return { draftVersionsUpdated: changed, unchanged, published: 0, globalInstitutionRatesChanged: false };
  });
}
