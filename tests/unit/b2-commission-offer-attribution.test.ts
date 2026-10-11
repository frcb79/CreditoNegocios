// @ts-ignore
import request from "supertest";
import express from "express";
import { storage } from "../../server/storage";
import {
  calculateAndPersistCascadingCommission,
  resolveOfferVersionCommissionRates,
  auditCommissionPayout,
  MissingCommissionRateError,
} from "../../server/commissionService";
import { registerRoutes } from "../../server/routes";
import { randomUUID } from "crypto";

describe("Fase 2B.1 — Comisiones por Oferta, Atribución Histórica y Seguridad", () => {
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

  // =========================================================================
  // 1. DOS OFERTAS CON TASAS DIFERENTES DE LA MISMA FINANCIERA
  // =========================================================================
  describe("1. Dos ofertas con tasas diferentes de la misma institución", () => {
    it("Calcula comisiones independientes basadas en la versión específica de cada oferta sin fallbacks globales", async () => {
      const institution = await storage.createFinancialInstitution({
        name: `Financiera Dual-${randomUUID().slice(0, 8)}`,
        commissionRate: "5.0", // Tasa general de la financiera (NO debe usarse)
        isActive: true,
      } as any);

      // Oferta 1: Broker 2.5%, Master 1.0%
      const offer1 = await storage.createInstitutionProduct({
        financialInstitutionId: institution.id,
        name: "Crédito Pyme Premium",
        code: `PYME-PREM-${randomUUID().slice(0, 6)}`,
        productType: "simple_credit",
        isActive: true,
      } as any);

      const ver1 = await storage.createInstitutionProductDraftVersion(offer1.id, {
        conditions: {
          commissionRates: {
            broker: { apertura: "2.5" },
            masterBroker: { apertura: "1.0" },
            financiera: { apertura: "3.5" },
          },
        },
      } as any);

      // Oferta 2: Broker 1.8%, Master 0.5%
      const offer2 = await storage.createInstitutionProduct({
        financialInstitutionId: institution.id,
        name: "Crédito Ágil",
        code: `AGIL-${randomUUID().slice(0, 6)}`,
        productType: "revolving_credit",
        isActive: true,
      } as any);

      const ver2 = await storage.createInstitutionProductDraftVersion(offer2.id, {
        conditions: {
          commissionRates: {
            broker: { apertura: "1.8" },
            masterBroker: { apertura: "0.5" },
            financiera: { apertura: "2.3" },
          },
        },
      } as any);

      // Resolución de tasas para Oferta 1
      const rates1 = await resolveOfferVersionCommissionRates({
        offerId: offer1.id,
        versionNumber: ver1.versionNumber,
        commissionType: "apertura",
        institution,
        hasMasterBroker: true,
      });

      expect(rates1.source).toBe("offer_version");
      expect(rates1.broker.rate).toBe(2.5);
      expect(rates1.masterBroker.rate).toBe(1.0);
      expect(rates1.financiera.rate).toBe(3.5);

      // Resolución de tasas para Oferta 2
      const rates2 = await resolveOfferVersionCommissionRates({
        offerId: offer2.id,
        versionNumber: ver2.versionNumber,
        commissionType: "apertura",
        institution,
        hasMasterBroker: true,
      });

      expect(rates2.source).toBe("offer_version");
      expect(rates2.broker.rate).toBe(1.8);
      expect(rates2.masterBroker.rate).toBe(0.5);
      expect(rates2.financiera.rate).toBe(2.3);

      // Ambas ofertas usan la misma financiera pero dan comisiones distintas
      expect(rates1.broker.rate).not.toBe(rates2.broker.rate);
      expect(rates1.financiera.rate).not.toBe(parseFloat(institution.commissionRate || "0"));
    });
  });

  // =========================================================================
  // 2. ATRIBUCIÓN HISTÓRICA: BROKER TRASLADADO ENTRE MASTER BROKERS
  // =========================================================================
  describe("2. Broker trasladado de Master A a Master B", () => {
    it("Conserva Master A en operación previa y atribuye Master B en operación posterior", async () => {
      const masterA = await storage.createUser({
        email: `master-a-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Alpha",
        role: "master_broker",
        bankName: "BBVA",
        clabe: "012180001111111111",
        accountHolder: "Master Alpha SAPI",
        isActive: true,
        status: "active",
      } as any);

      const masterB = await storage.createUser({
        email: `master-b-${randomUUID()}@network.test`,
        firstName: "Master",
        lastName: "Beta",
        role: "master_broker",
        bankName: "Banorte",
        clabe: "072180002222222222",
        accountHolder: "Master Beta SAPI",
        isActive: true,
        status: "active",
      } as any);

      const broker = await storage.createUser({
        email: `broker-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "Móvil",
        role: "broker",
        masterBrokerId: masterA.id,
        bankName: "Santander",
        clabe: "014180003333333333",
        accountHolder: "Broker Movil",
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        firstName: "Empresa",
        lastName: "Cliente",
        email: `cliente-${randomUUID()}@corp.test`,
        brokerId: broker.id,
        status: "active",
      } as any);

      // OPERACIÓN 1: Originada bajo Master A
      const credit1 = await storage.createCredit({
        clientId: client.id,
        brokerId: broker.id,
        originMasterBrokerId: masterA.id,
        amount: "1000000.00",
        status: "approved",
      } as any);

      const comm1 = await calculateAndPersistCascadingCommission({
        credit: credit1,
        brokerRate: 2.0,
        masterBrokerRate: 1.0,
        financieraRate: 3.0,
        commissionType: "apertura",
      });

      expect(comm1.masterBrokerId).toBe(masterA.id);
      expect(comm1.brokerId).toBe(broker.id);
      expect(parseFloat(comm1.masterBrokerShare || "0")).toBe(10000); // 1% de 1M
      expect(parseFloat(comm1.brokerShare || "0")).toBe(20000); // 2% de 1M

      // EL BROKER SE TRASLADA A MASTER B
      await storage.updateUser(broker.id, { masterBrokerId: masterB.id } as any);
      const updatedBroker = await storage.getUser(broker.id);
      expect(updatedBroker?.masterBrokerId).toBe(masterB.id);

      // OPERACIÓN 2: Originada bajo Master B
      const credit2 = await storage.createCredit({
        clientId: client.id,
        brokerId: broker.id,
        originMasterBrokerId: masterB.id,
        amount: "2000000.00",
        status: "approved",
      } as any);

      const comm2 = await calculateAndPersistCascadingCommission({
        credit: credit2,
        brokerRate: 2.0,
        masterBrokerRate: 1.0,
        financieraRate: 3.0,
        commissionType: "apertura",
      });

      expect(comm2.masterBrokerId).toBe(masterB.id);
      expect(parseFloat(comm2.masterBrokerShare || "0")).toBe(20000); // 1% de 2M

      // VALIDACIÓN ECONÓMICA Y DE CUENTA:
      // Operación 1 debe liquidarse a Master A
      const audit1 = auditCommissionPayout(comm1);
      expect(audit1.payoutAmount).toBe(30000); // 20k + 10k Option B
      expect(comm1.masterBrokerId).toBe(masterA.id);

      // Operación 2 debe liquidarse a Master B
      const audit2 = auditCommissionPayout(comm2);
      expect(audit2.payoutAmount).toBe(60000); // 40k + 20k Option B
      expect(comm2.masterBrokerId).toBe(masterB.id);
    });
  });

  // =========================================================================
  // 3. COMISIÓN CERO EXPRESAMENTE AUTORIZADA
  // =========================================================================
  describe("3. Tasa cero expresamente autorizada (0.00%)", () => {
    it("Permite comisiones de 0% sin arrojar error ni aplicar fallbacks silenciosos", async () => {
      const institution = await storage.createFinancialInstitution({
        name: `Financiera Zero-${randomUUID().slice(0, 8)}`,
        commissionRate: "4.0",
        isActive: true,
      } as any);

      const offer = await storage.createInstitutionProduct({
        financialInstitutionId: institution.id,
        name: "Crédito Sin Comisión Apertura",
        code: `ZERO-${randomUUID().slice(0, 6)}`,
        productType: "simple_credit",
        isActive: true,
      } as any);

      const ver = await storage.createInstitutionProductDraftVersion(offer.id, {
        conditions: {
          commissionRates: {
            broker: { apertura: "0" }, // Cero expreso
            masterBroker: { apertura: 0 }, // Cero expreso numérico
            financiera: { apertura: "0.0" },
          },
        },
      } as any);

      const resolved = await resolveOfferVersionCommissionRates({
        offerId: offer.id,
        versionNumber: ver.versionNumber,
        commissionType: "apertura",
        institution,
        hasMasterBroker: true,
      });

      expect(resolved.hasMissingRequiredRate).toBe(false);
      expect(resolved.broker.rate).toBe(0);
      expect(resolved.broker.isZero).toBe(true);
      expect(resolved.masterBroker.rate).toBe(0);
      expect(resolved.masterBroker.isZero).toBe(true);
      expect(resolved.financiera.rate).toBe(0);

      // Persistencia exitosa con 0
      const credit = await storage.createCredit({
        clientId: "client-zero",
        brokerId: "broker-zero",
        amount: "500000.00",
        status: "approved",
      } as any);

      const comm = await calculateAndPersistCascadingCommission({
        credit,
        brokerRate: resolved.broker.rate,
        masterBrokerRate: resolved.masterBroker.rate,
        financieraRate: resolved.financiera.rate,
        commissionType: "apertura",
      });

      expect(parseFloat(comm.brokerShare || "0")).toBe(0);
      expect(parseFloat(comm.masterBrokerShare || "0")).toBe(0);
      expect(parseFloat(comm.amount || "0")).toBe(0);
    });
  });

  // =========================================================================
  // 4. TASA AUSENTE (COM-14): DETECCIÓN ESTRICTA SIN FALLBACK SILENCIOSO
  // =========================================================================
  describe("4. Tasa ausente en oferta (COM-14)", () => {
    it("Detecta falta de tasa obligatoria y arroja MissingCommissionRateError sin fallback a la financiera", async () => {
      const institution = await storage.createFinancialInstitution({
        name: `Financiera Incompleta-${randomUUID().slice(0, 8)}`,
        commissionRate: "4.5", // Si hubiera fallback silencioso, usaría 4.5%
        isActive: true,
      } as any);

      const offer = await storage.createInstitutionProduct({
        financialInstitutionId: institution.id,
        name: "Oferta Incompleta",
        code: `INC-${randomUUID().slice(0, 6)}`,
        productType: "simple_credit",
        isActive: true,
      } as any);

      // Versión sin comisión definida para broker
      const ver = await storage.createInstitutionProductDraftVersion(offer.id, {
        conditions: {
          commissionRates: {
            // broker omitido
            masterBroker: { apertura: "1.0" },
          },
        },
      } as any);

      const resolved = await resolveOfferVersionCommissionRates({
        offerId: offer.id,
        versionNumber: ver.versionNumber,
        commissionType: "apertura",
        institution,
        hasMasterBroker: true,
      });

      // No debe inventar la tasa del broker
      expect(resolved.hasMissingRequiredRate).toBe(true);
      expect(resolved.missingRateReasons.length).toBeGreaterThan(0);
      expect(resolved.missingRateReasons.some(r => /Tasa de Broker ausente/i.test(r))).toBe(true);
      expect(resolved.broker.provided).toBe(false);

      // Intento de cálculo debe arrojar MissingCommissionRateError
      const credit = await storage.createCredit({
        clientId: "client-missing",
        brokerId: "broker-missing",
        amount: "500000.00",
        status: "approved",
      } as any);

      await expect(
        calculateAndPersistCascadingCommission({
          credit,
          institutionProductId: offer.id,
          versionNumber: ver.versionNumber,
          commissionType: "apertura",
        })
      ).rejects.toThrow(MissingCommissionRateError);
    });
  });

  // =========================================================================
  // 5. MULTIDISPERSIÓN Y MONTO EFECTIVAMENTE DISPERSADO
  // =========================================================================
  describe("5. Multidispersión y comisiones parciales confirmadas", () => {
    it("Calcula comisiones independientes por cada tramo de dispersión confirmado con idempotencia", async () => {
      const broker = await storage.createUser({
        email: `broker-multi-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "Multi",
        role: "broker",
        bankName: "BBVA",
        clabe: "012180004444444444",
        accountHolder: "Broker Multi",
        isActive: true,
        status: "active",
      } as any);

      const client = await storage.createClient({
        firstName: "Cliente",
        lastName: "MultiTranche",
        email: `multi-${randomUUID()}@test.com`,
        brokerId: broker.id,
        status: "active",
      } as any);

      const credit = await storage.createCredit({
        clientId: client.id,
        brokerId: broker.id,
        amount: "1000000.00", // Crédito total 1M
        status: "approved",
      } as any);

      // Tramo 1: Dispersión confirmada de $400,000 (40%)
      const commTranche1 = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 400000,
        brokerRate: 2.0,
        masterBrokerRate: 0,
        financieraRate: 2.0,
        commissionType: "apertura",
        dispersalIndex: 1,
        idempotencyKey: `disp-${credit.id}-1`,
      });

      expect(parseFloat(commTranche1.amount || "0")).toBe(8000); // 2% de 400,000
      expect(parseFloat(commTranche1.brokerShare || "0")).toBe(8000);
      expect(commTranche1.commissionType).toBe("apertura_parcial_1");

      // Idempotencia: re-ejecutar tramo 1 retorna la misma comisión existente sin duplicar
      const commTranche1Dup = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 400000,
        brokerRate: 2.0,
        masterBrokerRate: 0,
        financieraRate: 2.0,
        commissionType: "apertura",
        dispersalIndex: 1,
        idempotencyKey: `disp-${credit.id}-1`,
      });

      expect(commTranche1Dup.id).toBe(commTranche1.id);

      // Tramo 2: Dispersión confirmada de $600,000 (60%)
      const commTranche2 = await calculateAndPersistCascadingCommission({
        credit,
        confirmedDisbursedAmount: 600000,
        brokerRate: 2.0,
        masterBrokerRate: 0,
        financieraRate: 2.0,
        commissionType: "apertura",
        dispersalIndex: 2,
        idempotencyKey: `disp-${credit.id}-2`,
      });

      expect(parseFloat(commTranche2.amount || "0")).toBe(12000); // 2% de 600,000
      expect(parseFloat(commTranche2.brokerShare || "0")).toBe(12000);
      expect(commTranche2.commissionType).toBe("apertura_parcial_2");

      // Total comisionado es exactamente sobre el total efectivamente dispersado (8k + 12k = 20k)
      expect(
        parseFloat(commTranche1.brokerShare || "0") + parseFloat(commTranche2.brokerShare || "0")
      ).toBe(20000); // 2% de 1,000,000
    });
  });

  // =========================================================================
  // 6. SEGURIDAD RBAC EN RESPUESTAS API
  // =========================================================================
  describe("6. Seguridad por rol: Sobretasas y márgenes de plataforma", () => {
    it("Oculta appShare y overRate para Brókers y los expone exclusivamente para Super Admin", async () => {
      const superAdmin = await storage.createUser({
        email: `super-${randomUUID()}@network.test`,
        firstName: "Super",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        status: "active",
      } as any);

      const brokerUser = await storage.createUser({
        email: `broker-rbac-${randomUUID()}@network.test`,
        firstName: "Broker",
        lastName: "RBAC",
        role: "broker",
        bankName: "BBVA",
        clabe: "012180005555555555",
        accountHolder: "Broker RBAC",
        isActive: true,
        status: "active",
      } as any);

      const institution = await storage.createFinancialInstitution({
        name: `Financiera RBAC-${randomUUID().slice(0, 8)}`,
        commissionRate: "3.0",
        overRate: "1.5", // Sobretasa confidencial
        isActive: true,
      } as any);

      const credit = await storage.createCredit({
        clientId: "client-rbac",
        brokerId: brokerUser.id,
        financialInstitutionId: institution.id,
        amount: "500000.00",
        status: "approved",
      } as any);

      const commission = await storage.createCommission({
        creditId: credit.id,
        brokerId: brokerUser.id,
        financialInstitutionId: institution.id,
        amount: "25000.00",
        brokerShare: "15000.00",
        masterBrokerShare: "0.00",
        appShare: "10000.00", // Margen interno de plataforma
        notes: "Margen confidencial acordado",
        status: "approved",
        approvedBy: superAdmin.id,
        approvedAt: new Date(),
        frozenAmount: "15000.00",
        commissionType: "apertura",
      } as any);

      // CASO A: Consulta como Bróker (No autorizado)
      currentAuthUser = brokerUser;
      const brokerRes = await request(app).get("/api/commissions");
      expect(brokerRes.status).toBe(200);

      const brokerFound = brokerRes.body.find((c: any) => c.id === commission.id);
      expect(brokerFound).toBeDefined();
      expect(brokerFound.appShare).toBeUndefined(); // Protegido
      expect(brokerFound.notes).toBeUndefined(); // Protegido
      if (brokerFound.financialInstitution) {
        expect(brokerFound.financialInstitution.overRate).toBeUndefined(); // Protegido
      }

      // Consulta en /my-commissions como Bróker
      const myRes = await request(app).get("/api/commissions/my-commissions");
      expect(myRes.status).toBe(200);
      const myFound = myRes.body.find((c: any) => c.id === commission.id);
      expect(myFound).toBeDefined();
      expect(myFound.appShare).toBeUndefined(); // Protegido
      expect(myFound.notes).toBeUndefined(); // Protegido

      // CASO B: Consulta como Super Admin (Autorizado)
      currentAuthUser = superAdmin;
      const adminRes = await request(app).get("/api/commissions");
      expect(adminRes.status).toBe(200);

      const adminFound = adminRes.body.find((c: any) => c.id === commission.id);
      expect(adminFound).toBeDefined();
      expect(adminFound.appShare).toBe("10000.00"); // Visible
      expect(adminFound.notes).toBe("Margen confidencial acordado"); // Visible
      expect(adminFound.financialInstitution?.overRate).toBe("1.5"); // Visible
    });
  });
});
