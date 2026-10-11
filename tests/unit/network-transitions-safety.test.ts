import fs from "fs";
import path from "path";
import { transitionSchema } from "../../server/brokerNetworkTransitionRoutes";
import { formalizationOtpRequests, legalAcceptances } from "../../shared/schema";

describe("Phase 1A.4A: Security and Migration Safety Verifications", () => {
  describe("Hallazgo 1: Migración 0007 y Correspondencia con schema.ts", () => {
    const migration0007Path = path.resolve(__dirname, "../../migrations/0007_legal_snapshots_and_formalization_otp.sql");
    const migration0007Sql = fs.readFileSync(migration0007Path, "utf-8");

    it("la migración 0007 usa created_at (snake_case) y no createdAt en la definición de tabla", () => {
      expect(migration0007Sql).toContain("created_at TIMESTAMP NOT NULL DEFAULT NOW()");
      expect(migration0007Sql).not.toMatch(/\bcreatedAt\b/);
    });

    it("el índice sobre fecha de creación usa la columna created_at", () => {
      expect(migration0007Sql).toContain("idx_formalization_otp_created_at ON public.formalization_otp_requests(created_at)");
    });

    it("formalizationOtpRequests en shared/schema.ts mapea createdAt a la columna created_at", () => {
      expect(formalizationOtpRequests.createdAt.name).toBe("created_at");
      expect(formalizationOtpRequests.userEmail.name).toBe("user_email");
      expect(formalizationOtpRequests.codeHash.name).toBe("code_hash");
      expect(formalizationOtpRequests.documentsSnapshot.name).toBe("documents_snapshot");
    });

    it("legalAcceptances en shared/schema.ts incluye columnas de snapshot dual-hash y sus índices", () => {
      expect(legalAcceptances.templateSha256.name).toBe("template_sha256");
      expect(legalAcceptances.personalizedSha256.name).toBe("personalized_sha256");
      expect(legalAcceptances.personalizedSnapshot.name).toBe("personalized_snapshot");
      expect(migration0007Sql).toContain("ADD COLUMN IF NOT EXISTS template_sha256 VARCHAR(64)");
      expect(migration0007Sql).toContain("ADD COLUMN IF NOT EXISTS personalized_sha256 VARCHAR(64)");
      expect(migration0007Sql).toContain("ADD COLUMN IF NOT EXISTS personalized_snapshot JSONB");
    });
  });

  describe("Hallazgo 2: Migración 0004 y Preservación de Afiliaciones Consolidadas", () => {
    const migration0004Path = path.resolve(__dirname, "../../migrations/0004_broker_network_transitions.sql");
    const migration0004Sql = fs.readFileSync(migration0004Path, "utf-8");

    it("no altera usuarios ni relaciones activas en public.users", () => {
      expect(migration0004Sql).not.toContain("UPDATE public.users");
    });

    it("no altera organizaciones ni jerarquías activas en public.tenants", () => {
      expect(migration0004Sql).not.toContain("UPDATE public.tenants");
    });

    it("no altera retroactivamente commercial_opportunities consolidadas ni sobreescribe NULL", () => {
      expect(migration0004Sql).not.toContain("UPDATE public.commercial_opportunities");
      expect(migration0004Sql).toContain("CREATE INDEX IF NOT EXISTS opp_master_broker_idx");
    });

    it("respeta NULL en créditos y solicitudes para originaciones directas de plataforma", () => {
      expect(migration0004Sql).toContain("WHEN u.role = 'broker' AND mb.role = 'master_broker' THEN mb.id");
      expect(migration0004Sql).toContain("ELSE NULL");
      expect(migration0004Sql).toContain("WHEN broker.role = 'broker' AND parent_master.role = 'master_broker' THEN parent_master.id");
    });

    it("garantiza idempotencia condicionando la ejecución de backfill al alta inicial de columnas", () => {
      expect(migration0004Sql).toContain("IF NOT origin_column_already_existed THEN");
      expect(migration0004Sql).toContain("IF NOT sub_origin_column_already_existed THEN");
    });

    it("declara triggers de inmutabilidad estricta contra UPDATE de origin_master_broker_id", () => {
      expect(migration0004Sql).toContain("trg_credits_origin_master_immutable");
      expect(migration0004Sql).toContain("trg_opportunity_origin_master_immutable");
      expect(migration0004Sql).toContain("trg_submission_origin_master_immutable");
    });
  });

  describe("Hallazgo 3: Reactivación de Brokers Exclusivamente Expresa", () => {
    it("el esquema de transición asigna reactivate = false por defecto si se omite", () => {
      const parsed = transitionSchema.parse({
        brokerId: "broker-123",
        action: "assign_platform",
        reason: "Reasignación a Crédito Negocios",
      });
      expect(parsed.reactivate).toBe(false);
    });

    it("permite reactivate = true únicamente cuando Super Admin lo envía expresamente", () => {
      const parsed = transitionSchema.parse({
        brokerId: "broker-123",
        action: "assign_platform",
        reason: "Reasignación y reactivación expresa",
        reactivate: true,
      });
      expect(parsed.reactivate).toBe(true);
    });

    it("permite reactivate = false explícito", () => {
      const parsed = transitionSchema.parse({
        brokerId: "broker-123",
        action: "promote_master",
        reason: "Promoción conservando estado inactivo previo",
        reactivate: false,
      });
      expect(parsed.reactivate).toBe(false);
    });

    it("en promote_master sin reactivate explícito, se conserva reactivate = false", () => {
      const parsed = transitionSchema.parse({
        brokerId: "broker-123",
        action: "promote_master",
        reason: "Promoción a Master Broker",
      });
      expect(parsed.reactivate).toBe(false);
    });
  });
});
