// @ts-ignore
import request from "supertest";
import express from "express";
import { storage } from "../../server/storage";
import {
  calculateAndPersistCascadingCommission,
  resolveOfferVersionCommissionRates,
  MissingCommissionRateError,
  MissingOfferVersionError,
  UnconfirmedDispersalAmountError,
  UnauthorizedDistributionError,
  ImmutableCommercialSnapshotError,
  consolidateCommercialProposalSnapshot,
} from "../../server/commissionService";
import { registerRoutes, createCascadingCommissionRecord } from "../../server/routes";
import { randomUUID } from "crypto";

describe("Fase 2B.1B — Cierre de Integridad Financiera y Eliminación de Rutas No Canónicas", () => {
  let app: express.Express;
  let currentAuthUser: any = null;

  beforeAll(async () => {
    app = express();
    app.use(express.json());

    // Mock session auth middleware
    app.use((req: any, _res, next) => {
      if (currentAuthUser) {
        req.isAuthenticated = () => true;
        req.user = { claims: { sub: currentAuthUser.id } };
        req.tenantContext = {
          tenantId: currentAuthUser.tenantId || "default-tenant",
          membership: {
            role: currentAuthUser.role === "super_admin" || currentAuthUser.role === "admin" ? "owner" : "member",
            canOriginate: true,
          },
        };
      } else {
        req.isAuthenticated = () => false;
      }
      next();
    });

    await registerRoutes(app);
  });

  beforeEach(() => {
    currentAuthUser = null;
  });

  describe("COM-28: generic product edits must not rewrite published offer economics", () => {
    it("forbids commission and matching modifications outside the draft/publish flow", async () => {
      const admin = await storage.createUser({
        email: `offer-bypass-${randomUUID()}@example.test`,
        firstName: "Admin", lastName: "Version",
        role: "super_admin", isActive: true, status: "active",
      } as any);
      currentAuthUser = admin;
      const res = await request(app)
        .put("/api/institution-products/some-offer")
        .send({ configuration: { commissionRates: { financiera: { apertura: 10 } } } });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("OFFER_VERSIONED_EDIT_REQUIRED");

      const forcedStatus = await request(app)
        .put("/api/institution-products/some-offer")
        .send({ status: "published" });
      expect(forcedStatus.status).toBe(409);
      expect(forcedStatus.body.code).toBe("OFFER_VERSIONED_EDIT_REQUIRED");
    });
  });

  describe("COM-28: institution defaults cannot bypass offer-level versions", () => {
    it("rejects financial commission edits when there is a published offer", async () => {
      const admin = await storage.createUser({
        email: `offer-rates-${randomUUID()}@example.test`,
        firstName: "Admin", lastName: "Offers",
        role: "super_admin", isActive: true, status: "active",
      } as any);
      const inst = await storage.createFinancialInstitution({
        name: `Offer Commission Guard ${randomUUID()}`,
        commissionRate: "4.0", isActive: true,
      } as any);
      currentAuthUser = admin;
      const offersSpy = jest.spyOn(storage,"getInstitutionProducts")
        .mockResolvedValue([{ id: "offer-versioned" }] as any);
      const versionsSpy = jest.spyOn(storage,"getInstitutionProductVersions")
        .mockResolvedValue([{ status: "published", versionNumber: 1 }] as any);
      const creditsSpy = jest.spyOn(storage,"getCredits").mockResolvedValue([]);
      try {
        const res = await request(app)
          .patch(`/api/financial-institutions/${inst.id}`)
          .send({ commissionRate: "5.0" });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe("OFFER_SCOPED_COMMISSION_VERSION_REQUIRED");
        const unchanged = await storage.getFinancialInstitution(inst.id);
        expect(unchanged?.commissionRate).toBe("4.0");
      } finally {
        offersSpy.mockRestore();
        versionsSpy.mockRestore();
        creditsSpy.mockRestore();
      }
    });

    it("allows legacy pre-publication drafts without globally revoking commercial acceptance", async () => {
      const admin = await storage.createUser({
        email: `offer-draft-${randomUUID()}@example.test`,
        firstName: "Admin", lastName: "Draft",
        role: "super_admin", isActive: true, status: "active",
      } as any);
      const inst = await storage.createFinancialInstitution({
        name: `Draft Rate ${randomUUID()}`,
        commissionRate: "4.0", isActive: true,
      } as any);
      currentAuthUser = admin;
      const offersSpy = jest.spyOn(storage,"getInstitutionProducts").mockResolvedValue([]);
      const creditsSpy = jest.spyOn(storage,"getCredits").mockResolvedValue([]);
      try {
        const res = await request(app)
          .patch(`/api/financial-institutions/${inst.id}`)
          .send({ commissionRate: "5.0" });
        expect(res.status).toBe(200);
        const updated = await storage.getFinancialInstitution(inst.id);
        expect(updated?.commissionRate).toBe("5.0");
      } finally {
        offersSpy.mockRestore();
        creditsSpy.mockRestore();
      }
    });
  });

  // =========================================================================
  // 1. REGLA 1 (COM-21): DESEMBOLSOS VERIFICABLES
  // =========================================================================
  describe("1. Desembolsos verificables (COM-21)", () => {
    it("Negativa: createCascadingCommissionRecord rechaza fallbacks a approvedAmount", async () => {
      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: `broker-${randomUUID().slice(0, 8)}`,
        amount: "1000000.00",
        status: "approved",
      } as any);

      await expect(
        createCascadingCommissionRecord({
          creditId: credit.id,
          brokerId: credit.brokerId,
          approvedAmount: 1000000, // Solo approvedAmount, sin confirmedDisbursedAmount
          commissionType: "apertura",
        })
      ).rejects.toThrow(UnconfirmedDispersalAmountError);
    });

    it("Negativa: createCascadingCommissionRecord rechaza montos <= 0 o no confirmados", async () => {
      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: `broker-${randomUUID().slice(0, 8)}`,
        amount: "1000000.00",
        status: "approved",
      } as any);

      await expect(
        createCascadingCommissionRecord({
          creditId: credit.id,
          brokerId: credit.brokerId,
          confirmedDisbursedAmount: 0,
          commissionType: "apertura",
        })
      ).rejects.toThrow(UnconfirmedDispersalAmountError);

      await expect(
        createCascadingCommissionRecord({
          creditId: credit.id,
          brokerId: credit.brokerId,
          confirmedDisbursedAmount: -500,
          commissionType: "apertura",
        })
      ).rejects.toThrow(UnconfirmedDispersalAmountError);
    });

    it("Seguridad: PUT /api/credits/:id con dispersión bloquea cálculo automático sobre montos declarados por frontend", async () => {
      const admin = await storage.createUser({
        email: `admin-put-${randomUUID()}@example.com`,
        firstName: "Admin",
        lastName: "Put",
        role: "admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = admin;

      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: admin.id,
        amount: "800000.00",
        status: "approved",
      } as any);

      // Frontend intenta disparar comisiones declarando confirmedDisbursedAmount
      const res = await request(app)
        .put(`/api/credits/${credit.id}`)
        .send({
          status: "disbursed",
          confirmedDisbursedAmount: 800000,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("DISBURSEMENT_CONFIRMATION_REQUIRED");
      const unchanged = await storage.getCredit(credit.id);
      expect(unchanged?.status).toBe("approved");

      // Verificar que NO se crearon comisiones espurias sin evidencia real de core bancario
      const comms = await storage.getCommissions({ creditId: credit.id });
      expect(comms.length).toBe(0);
    });

    it("Seguridad: PUT no permite inyectar evidencia de dispersión confirmada en finalProposal", async () => {
      const admin = await storage.createUser({
        email: `admin-forged-${randomUUID()}@example.com`,
        firstName: "Admin", lastName: "Forged", role: "admin", isActive: true, status: "active",
      } as any);
      currentAuthUser = admin;
      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: admin.id,
        amount: "100000.00",
        status: "approved",
      } as any);
      const forged = await request(app)
        .put(`/api/credits/${credit.id}`)
        .send({ finalProposal: {
          disbursementStatus: "confirmed",
          disbursementConfirmation: { confirmedAmount: 100000, status: "confirmed" },
        }});
      expect(forged.status).toBe(409);
      expect(forged.body.code).toBe("DISBURSEMENT_EVIDENCE_WRITE_FORBIDDEN");
      const unchanged = await storage.getCredit(credit.id);
      expect((unchanged?.finalProposal as any)?.disbursementStatus).not.toBe("confirmed");
    });

    it("Seguridad: mark-dispersed actualiza estado a dispersed pero bloquea comisiones sobre approvedAmount reportando dependencia FIN-13/14", async () => {
      const admin = await storage.createUser({
        email: `admin-disp-${randomUUID()}@example.com`,
        firstName: "Admin",
        lastName: "Disp",
        role: "admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = admin;

      const broker = await storage.createUser({
        email: `broker-disp-${randomUUID()}@example.com`,
        firstName: "Broker",
        lastName: "Disp",
        role: "broker",
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        brokerId: broker.id,
        type: "persona_moral",
        businessName: "Empresa Dispersión Test SA",
      } as any);

      const institution = await storage.createFinancialInstitution({
        name: `Financiera Dispersión-${randomUUID().slice(0, 6)}`,
        commissionRate: "4.0",
        commissionRates: {
          broker: { apertura: "2.0" },
          masterBroker: { apertura: "1.0" },
          financiera: { apertura: "4.0" },
        },
        isActive: true,
      } as any);

      const subRequest = await storage.createCreditSubmissionRequest({
        clientId: client.id,
        brokerId: broker.id,
        requestedAmount: "1200000.00",
        purpose: "Capital de trabajo",
        status: "in_progress",
      } as any);

      const target = await storage.createCreditSubmissionTarget({
        requestId: subRequest.id,
        financialInstitutionId: institution.id,
        status: "selected_winner",
        isWinner: true,
        institutionProposal: {
          approvedAmount: 1200000,
          interestRate: 15.5,
          term: 24,
          openingCommission: 2.5,
        },
      } as any);

      const res = await request(app)
        .patch(`/api/credit-submission-targets/${target.id}/mark-dispersed`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("dispersed");
      expect(res.body.dispersedAt).toBeDefined();

      // Verificar que NO se crearon comisiones simuladas con approvedAmount
      const comms = await storage.getCommissions({ creditId: res.body.creditId });
      expect(comms.length).toBe(0);
    });
  });

  // =========================================================================
  // 2. REGLA 2 (COM-22): SNAPSHOT COMERCIAL INMUTABLE
  // =========================================================================
  describe("2. Snapshot comercial inmutable (COM-22)", () => {
    it("Positiva: select-winner consolida snapshot comercial formal con datos validados desde servidor", async () => {
      const admin = await storage.createUser({
        email: `admin-sel-${randomUUID()}@example.com`,
        firstName: "Admin",
        lastName: "Sel",
        role: "admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = admin;

      const master = await storage.createUser({
        email: `master-sel-${randomUUID()}@example.com`,
        firstName: "Master",
        lastName: "Sel",
        role: "master_broker",
        isActive: true,
        status: "active",
      } as any);

      const broker = await storage.createUser({
        email: `broker-sel-${randomUUID()}@example.com`,
        firstName: "Broker",
        lastName: "Sel",
        role: "broker",
        masterBrokerId: master.id,
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        brokerId: broker.id,
        type: "persona_moral",
        businessName: "Cliente Formal Snapshot SA",
      } as any);

      const institution = await storage.createFinancialInstitution({
        name: `Financiera Snapshot-${randomUUID().slice(0, 6)}`,
        commissionRate: "4.5",
        isActive: true,
      } as any);

      const subRequest = await storage.createCreditSubmissionRequest({
        clientId: client.id,
        brokerId: broker.id,
        originMasterBrokerId: master.id,
        requestedAmount: "1500000.00",
        purpose: "Expansion",
        status: "in_progress",
      } as any);

      const target = await storage.createCreditSubmissionTarget({
        requestId: subRequest.id,
        financialInstitutionId: institution.id,
        status: "approved",
        isWinner: false,
        institutionProposal: {
          approvedAmount: 1400000,
          interestRate: 14.0,
          term: 36,
          openingCommission: 2.0,
          commissionRates: {
            broker: { apertura: "1.75" },
            masterBroker: { apertura: "0.75" },
            financiera: { apertura: "3.5" },
          },
        },
      } as any);

      const res = await request(app)
        .patch(`/api/credit-submission-targets/${target.id}/select-winner`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.credit).toBeDefined();

      const createdCredit = res.body.credit;
      expect(createdCredit.finalProposal).toBeDefined();
      expect(createdCredit.finalProposal.isCommercialSnapshot).toBe(true);
      expect(createdCredit.finalProposal.originBrokerId).toBe(broker.id);
      expect(createdCredit.finalProposal.originMasterBrokerId).toBe(master.id);
      expect(createdCredit.finalProposal.commissionRates.broker.apertura).toBe("1.75");
      expect(createdCredit.finalProposal.commissionRates.masterBroker.apertura).toBe("0.75");
    });

    it("Negativa: consolidateCommercialProposalSnapshot bloquea modificación de snapshot comercial congelado", () => {
      const credit = {
        id: "credit-immutable-1",
        finalProposal: {
          institutionProductId: "offer-orig-1",
          versionNumber: 1,
          originBrokerId: "broker-orig-1",
          originMasterBrokerId: "master-orig-1",
          commissionRates: {
            broker: { apertura: "2.0" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "4.0" },
          },
          isCommercialSnapshot: true,
          snapshotCreatedAt: "2026-10-01T12:00:00.000Z",
        },
      };

      // Intento 1: Cambiar tasas pactadas
      expect(() => {
        consolidateCommercialProposalSnapshot({
          credit,
          proposalData: {
            institutionProductId: "offer-orig-1",
            versionNumber: 1,
            originBrokerId: "broker-orig-1",
            originMasterBrokerId: "master-orig-1",
            commissionRates: {
              broker: { apertura: "2.5" }, // Intento de alteración
              masterBroker: { apertura: "1.0" },
            },
          },
        });
      }).toThrow(ImmutableCommercialSnapshotError);

      // Intento 2: Cambiar Master beneficiario
      expect(() => {
        consolidateCommercialProposalSnapshot({
          credit,
          proposalData: {
            institutionProductId: "offer-orig-1",
            versionNumber: 1,
            originBrokerId: "broker-orig-1",
            originMasterBrokerId: "master-malicioso", // Intento de cambio de Master
          },
        });
      }).toThrow(ImmutableCommercialSnapshotError);

      // Intento 3: Cambiar versión de oferta
      expect(() => {
        consolidateCommercialProposalSnapshot({
          credit,
          proposalData: {
            institutionProductId: "offer-orig-1",
            versionNumber: 2, // Intento de cambio de versión
          },
        });
      }).toThrow(ImmutableCommercialSnapshotError);
    });

    it("Negativa: PUT /api/credits/:id responde 409 COMMERCIAL_SNAPSHOT_IMMUTABLE al intentar sobreescribir snapshot consolidado", async () => {
      const admin = await storage.createUser({
        email: `admin-put-imm-${randomUUID()}@example.com`,
        firstName: "Admin",
        lastName: "Imm",
        role: "admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = admin;

      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: admin.id,
        amount: "1000000.00",
        status: "approved",
        finalProposal: {
          institutionProductId: "offer-locked",
          versionNumber: 1,
          originBrokerId: "broker-locked",
          originMasterBrokerId: "master-locked",
          commissionRates: {
            broker: { apertura: "2.0" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "3.5" },
          },
          isCommercialSnapshot: true,
          snapshotCreatedAt: new Date().toISOString(),
        },
      } as any);

      const res = await request(app)
        .put(`/api/credits/${credit.id}`)
        .send({
          finalProposal: {
            institutionProductId: "offer-locked",
            versionNumber: 1,
            originBrokerId: "broker-locked",
            originMasterBrokerId: "otro-master-infiltrado", // Modificación no permitida
            commissionRates: {
              broker: { apertura: "3.0" },
            },
          },
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("COMMERCIAL_SNAPSHOT_IMMUTABLE");
    });

    it("Positiva: PUT /api/credits/:id preserva snapshot comercial intacto cuando se actualizan otros campos", async () => {
      const admin = await storage.createUser({
        email: `admin-put-safe-${randomUUID()}@example.com`,
        firstName: "Admin",
        lastName: "Safe",
        role: "admin",
        isActive: true,
        status: "active",
      } as any);
      currentAuthUser = admin;

      const timestamp = new Date("2026-10-01T10:00:00Z").toISOString();
      const credit = await storage.createCredit({
        clientId: `client-${randomUUID().slice(0, 8)}`,
        brokerId: admin.id,
        amount: "1000000.00",
        status: "approved",
        finalProposal: {
          institutionProductId: "offer-safe-preserve",
          versionNumber: 2,
          originBrokerId: "broker-safe",
          originMasterBrokerId: "master-safe",
          commissionRates: {
            broker: { apertura: "1.8" },
            masterBroker: { apertura: "0.8" },
            financiera: { apertura: "3.0" },
          },
          isCommercialSnapshot: true,
          snapshotCreatedAt: timestamp,
        },
      } as any);

      // Actualizar solo notas y propósito
      const res = await request(app)
        .put(`/api/credits/${credit.id}`)
        .send({
          purpose: "Capital de trabajo ampliado",
        });

      expect(res.status).toBe(200);
      expect(res.body.purpose).toBe("Capital de trabajo ampliado");
      expect(res.body.finalProposal).toBeDefined();
      expect(res.body.finalProposal.isCommercialSnapshot).toBe(true);
      expect(res.body.finalProposal.snapshotCreatedAt).toBe(timestamp);
      expect(res.body.finalProposal.originMasterBrokerId).toBe("master-safe");
      expect(res.body.finalProposal.commissionRates.broker.apertura).toBe("1.8");
    });
  });

  // =========================================================================
  // 3. REGLA 3 (COM-23): CÁLCULO CANÓNICO OBLIGATORIO
  // =========================================================================
  describe("3. Cálculo canónico obligatorio (COM-23)", () => {
    it("Seguridad: strictRateCheck: false no puede ser usado para evitar controles de tasa ausente", async () => {
      const institution = await storage.createFinancialInstitution({
        name: `Financiera Strict-${randomUUID().slice(0, 6)}`,
        isActive: true,
      } as any);

      const offer = await storage.createInstitutionProduct({
        financialInstitutionId: institution.id,
        name: "Oferta con Tasa Faltante",
        code: `OFR-INC-${randomUUID().slice(0, 6)}`,
        productType: "simple_credit",
        isActive: true,
      } as any);

      await storage.createInstitutionProductDraftVersion(offer.id, {
        versionNumber: 1,
        status: "published",
        conditions: {
          commissionRates: {
            financiera: { apertura: "3.0" },
            // broker y masterBroker ausentes
          },
        },
      } as any);

      const credit = await storage.createCredit({
        clientId: "client-strict-test",
        brokerId: "broker-strict-test",
        amount: "500000.00",
        status: "approved",
      } as any);

      // Intento de saltar controles pasando strictRateCheck: false
      await expect(
        calculateAndPersistCascadingCommission({
          credit,
          institutionProductId: offer.id,
          versionNumber: 1,
          confirmedDisbursedAmount: 500000,
          commissionType: "apertura",
          strictRateCheck: false as any, // Se prohíbe el bypass
        })
      ).rejects.toThrow(MissingCommissionRateError);
    });

    it("Positiva: Tasa autorizada de 0% es respetada y calcula comisión de $0.00 legítimamente", async () => {
      const institution = await storage.createFinancialInstitution({
        name: `Financiera ZeroRate-${randomUUID().slice(0, 6)}`,
        isActive: true,
      } as any);

      const offer = await storage.createInstitutionProduct({
        financialInstitutionId: institution.id,
        name: "Oferta Tasa Cero Autorizada",
        code: `ZERO-${randomUUID().slice(0, 6)}`,
        productType: "simple_credit",
        isActive: true,
      } as any);

      await storage.createInstitutionProductDraftVersion(offer.id, {
        versionNumber: 1,
        status: "published",
        conditions: {
          commissionRates: {
            broker: { apertura: "0" }, // 0% autorizada
            masterBroker: { apertura: "0" }, // 0% autorizada
            financiera: { apertura: "0" }, // 0% autorizada
          },
        },
      } as any);

      const credit = await storage.createCredit({
        clientId: "client-zero-test",
        brokerId: "broker-zero-test",
        originMasterBrokerId: "master-zero-test",
        amount: "1000000.00",
        status: "approved",
      } as any);

      const comm = await calculateAndPersistCascadingCommission({
        credit,
        institutionProductId: offer.id,
        versionNumber: 1,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
      });

      expect(parseFloat(comm.brokerShare || "0")).toBe(0);
      expect(parseFloat(comm.masterBrokerShare || "0")).toBe(0);
      expect(parseFloat(comm.amount || "0")).toBe(0);
    });

    it("Negativa: Financiera con tasa 0% mientras Broker/Master tienen >0% es bloqueada por exceso de distribución", async () => {
      const credit = await storage.createCredit({
        clientId: "client-dist-zero",
        brokerId: "broker-dist-zero",
        originMasterBrokerId: "master-dist-zero",
        amount: "1000000.00",
        status: "approved",
        finalProposal: {
          commissionRates: {
            financiera: { apertura: "0" }, // Financiera autorizó 0%
            broker: { apertura: "1.0" }, // Broker reclama 1%
            masterBroker: { apertura: "0.5" },
          },
          isCommercialSnapshot: true,
        },
      } as any);

      await expect(
        calculateAndPersistCascadingCommission({
          credit,
          confirmedDisbursedAmount: 1000000,
          commissionType: "apertura",
        })
      ).rejects.toThrow(UnauthorizedDistributionError);
    });

    it("Positiva: Modificaciones en tarifas vivas de Master Broker no alteran cálculos canónicos de propuestas consolidadas", async () => {
      const master = await storage.createUser({
        email: `master-rates-${randomUUID()}@example.com`,
        role: "master_broker",
        networkCommissionRates: {
          "fin-canon": { apertura: "1.0" },
        },
        isActive: true,
        status: "active",
      } as any);

      const broker = await storage.createUser({
        email: `broker-rates-${randomUUID()}@example.com`,
        role: "broker",
        masterBrokerId: master.id,
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        clientId: "client-canon-test",
        brokerId: broker.id,
        originMasterBrokerId: master.id,
        financialInstitutionId: "fin-canon",
        amount: "1000000.00",
        status: "approved",
        finalProposal: {
          commissionRates: {
            broker: { apertura: "2.5" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "4.0" },
          },
          isCommercialSnapshot: true,
        },
      } as any);

      // Master cambia posteriormente sus tarifas a 0.25%
      await storage.updateUser(master.id, {
        networkCommissionRates: {
          "fin-canon": { apertura: "0.25" },
        },
      } as any);

      // El cálculo debe respetar el 2.5% congelado, nunca el 0.25% vivo del Master
      const comm = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
      });

      expect(parseFloat(comm.brokerShare || "0")).toBe(25000); // 2.5% de 1M
      expect(parseFloat(comm.masterBrokerShare || "0")).toBe(10000); // 1.0% de 1M
    });
  });

  // =========================================================================
  // 4. REGLA 4 (COM-24): PRESERVACIÓN E IDEMPOTENCIA
  // =========================================================================
  describe("4. Preservación, derechos históricos e idempotencia (COM-24)", () => {
    it("Positiva: Idempotencia estricta por idempotencyKey en multidispersión por tramos", async () => {
      const credit = await storage.createCredit({
        clientId: "client-tranche-idemp",
        brokerId: "broker-tranche-1",
        originMasterBrokerId: "master-tranche-1",
        amount: "2000000.00",
        status: "approved",
        finalProposal: {
          commissionRates: {
            broker: { apertura: "2.0" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "3.5" },
          },
          isCommercialSnapshot: true,
        },
      } as any);

      const trancheKey1 = `tranche-1-${randomUUID()}`;

      // Primer tramo de dispersión confirmada: $1,000,000
      const comm1 = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
        dispersalIndex: 1,
        idempotencyKey: trancheKey1,
      });

      expect(parseFloat(comm1.brokerShare || "0")).toBe(20000);

      // Reintento idéntico del tramo 1
      const comm1Retry = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
        dispersalIndex: 1,
        idempotencyKey: trancheKey1,
      });

      expect(comm1Retry.id).toBe(comm1.id);
      expect(parseFloat(comm1Retry.brokerShare || "0")).toBe(20000);

      // Segundo tramo de dispersión confirmada: $1,000,000 independiente
      const trancheKey2 = `tranche-2-${randomUUID()}`;
      const comm2 = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
        dispersalIndex: 2,
        idempotencyKey: trancheKey2,
      });

      expect(comm2.id).not.toBe(comm1.id);
      expect(parseFloat(comm2.brokerShare || "0")).toBe(20000);
    });

    it("Positiva: Cambio posterior de red del broker preserva al Master beneficiario histórico", async () => {
      const masterOriginal = await storage.createUser({
        email: `master-orig-${randomUUID()}@example.com`,
        role: "master_broker",
        isActive: true,
        status: "active",
      } as any);

      const masterNuevo = await storage.createUser({
        email: `master-new-${randomUUID()}@example.com`,
        role: "master_broker",
        isActive: true,
        status: "active",
      } as any);

      const broker = await storage.createUser({
        email: `broker-mig-${randomUUID()}@example.com`,
        role: "broker",
        masterBrokerId: masterOriginal.id,
        isActive: true,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        clientId: "client-hist-master",
        brokerId: broker.id,
        originMasterBrokerId: masterOriginal.id,
        amount: "1000000.00",
        status: "approved",
        finalProposal: {
          originBrokerId: broker.id,
          originMasterBrokerId: masterOriginal.id,
          commissionRates: {
            broker: { apertura: "1.5" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "3.0" },
          },
          isCommercialSnapshot: true,
        },
      } as any);

      // Broker cambia de red posteriormente a masterNuevo
      await storage.updateUser(broker.id, {
        masterBrokerId: masterNuevo.id,
      } as any);

      // Al liquidar la operación consolidada, el beneficiario es el masterOriginal
      const comm = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 1000000,
        commissionType: "apertura",
      });

      expect(comm.masterBrokerId).toBe(masterOriginal.id);
      expect(parseFloat(comm.masterBrokerShare || "0")).toBe(10000);
    });
  });
});
