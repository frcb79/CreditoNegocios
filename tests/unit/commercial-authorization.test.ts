import {
  CommercialAuthorizationService,
  MockCommercialAuthStorage,
  getScopeCapabilities,
  type ClientAccessScope,
} from "../../server/commercialAuthorizationService";
import type {
  Client,
  User,
  Credit,
  ClientCommercialRelationship,
  CommercialOpportunity,
} from "../../shared/schema";

describe("Fase 3: Capa de Autorización Desacoplada (ClientAccessScope)", () => {
  let mockStorage: MockCommercialAuthStorage;
  let authService: CommercialAuthorizationService;
  const now = new Date("2026-09-24T12:00:00Z");

  const sampleClient: Client = {
    id: "client-corp-1",
    brokerId: "broker-originador-historico",
    businessName: "Manufacturas del Centro SA de CV",
    tenantId: "tenant-1",
    createdAt: new Date("2023-05-10T00:00:00Z"),
  } as any;

  beforeEach(() => {
    mockStorage = new MockCommercialAuthStorage();
    authService = new CommercialAuthorizationService(mockStorage);
    mockStorage.clients = [sampleClient];
  });

  describe("1. Super Admin y Mesa de Control: Acceso Administrativo Completo (`full`)", () => {
    it("otorga scope 'full' a super_admin con todas las capacidades habilitadas", async () => {
      const result = await authService.authorizeClientAccess({
        userId: "admin-1",
        userRole: "super_admin",
        clientId: sampleClient.id,
        now,
      });

      expect(result.authorized).toBe(true);
      expect(result.scope).toBe("full");
      expect(result.capabilities.canViewBasicProfile).toBe(true);
      expect(result.capabilities.canEditClient).toBe(true);
      expect(result.capabilities.canViewCredits).toBe(true);
      expect(result.capabilities.canViewOpportunities).toBe(true);
      expect(result.capabilities.canCreateOpportunity).toBe(true);
      expect(result.capabilities.canViewDocuments).toBe(true);
      expect(result.capabilities.creditsFilter).toBe("all");
    });

    it("otorga scope 'full' global a administradores de plataforma (isPlatformAdmin: true) independientemente del tenant", async () => {
      const result = await authService.authorizeClientAccess({
        userId: "platform-admin-1",
        userRole: "admin",
        clientId: sampleClient.id,
        tenantContext: {
          isPlatformAdmin: true,
          tenant: { id: "tenant-alien" },
        },
        now,
      });

      expect(result.authorized).toBe(true);
      expect(result.scope).toBe("full");
      expect(result.reason).toContain("Acceso administrativo global de plataforma");
    });

    it("otorga scope 'full' a Admin / Mesa de Control para clientes de su propio tenant", async () => {
      const result = await authService.authorizeClientAccess({
        userId: "tenant-admin-1",
        userRole: "admin",
        clientId: sampleClient.id,
        tenantContext: {
          isPlatformAdmin: false,
          tenant: { id: "tenant-1" },
          membership: { role: "admin", isActive: true },
        },
        now,
      });

      expect(result.authorized).toBe(true);
      expect(result.scope).toBe("full");
      expect(result.capabilities.canEditClient).toBe(true);
      expect(result.reason).toContain("a nivel de tenant");
    });

    it("BLOQUEA (scope 'none') a Admin / Mesa de Control de un tenant ajeno", async () => {
      const result = await authService.authorizeClientAccess({
        userId: "tenant-admin-alien",
        userRole: "admin",
        clientId: sampleClient.id,
        tenantContext: {
          isPlatformAdmin: false,
          tenant: { id: "tenant-alien" },
          membership: { role: "admin", isActive: true },
        },
        now,
      });

      expect(result.authorized).toBe(false);
      expect(result.scope).toBe("none");
      expect(result.capabilities.canViewBasicProfile).toBe(false);
      expect(result.reason).toContain("pertenece a otra organización / tenant");
    });

    it("permite a un Master Broker con tenant padre supervisar clientes de su tenant subordinado", async () => {
      mockStorage.tenants = [
        { id: "tenant-subordinate", parentTenantId: "tenant-parent-master" },
      ];
      const subClient: Client = {
        id: "client-sub-1",
        brokerId: "broker-sub-1",
        businessName: "Filial Bajio SA",
        tenantId: "tenant-subordinate",
      } as any;
      mockStorage.clients.push(subClient);

      const result = await authService.authorizeClientAccess({
        userId: "master-broker-user",
        userRole: "master_broker",
        clientId: subClient.id,
        tenantContext: {
          isPlatformAdmin: false,
          tenant: { id: "tenant-parent-master", type: "master_broker" },
        },
        now,
      });

      expect(result.authorized).toBe(true);
      expect(result.scope).toBe("master_broker_oversight");
      expect(result.capabilities.canEditClient).toBe(false);
      expect(result.capabilities.canViewCredits).toBe(true);
    });
  });

  describe("2. Broker Activo: Puede Gestionar su Relación Comercial (`full`)", () => {
    it("otorga scope 'full' a un broker con relación comercial 'active' no vencida", async () => {
      const activeRel: ClientCommercialRelationship = {
        id: "rel-active-1",
        clientId: sampleClient.id,
        brokerId: "broker-titular-activo",
        status: "active",
        activeUntil: new Date("2026-12-01T00:00:00Z"), // Futuro
        lastValidActivityAt: now,
      } as any;
      mockStorage.relationships = [activeRel];

      const result = await authService.authorizeClientAccess({
        userId: "broker-titular-activo",
        userRole: "broker",
        clientId: sampleClient.id,
        now,
      });

      expect(result.authorized).toBe(true);
      expect(result.scope).toBe("full");
      expect(result.capabilities.canEditClient).toBe(true);
      expect(result.capabilities.canCreateOpportunity).toBe(true);
      expect(result.capabilities.canViewCredits).toBe(true);
      expect(result.relationship?.id).toBe("rel-active-1");
    });

    it("otorga scope 'full' a un broker con oportunidad protegida vigente", async () => {
      const activeOpp: CommercialOpportunity = {
        id: "opp-protected-1",
        clientId: sampleClient.id,
        brokerId: "broker-con-oportunidad",
        status: "protected_active",
        protectedUntil: new Date("2026-10-15T00:00:00Z"), // Futuro
      } as any;

      mockStorage.opportunities = [activeOpp];

      const result = await authService.authorizeClientAccess({
        userId: "broker-con-oportunidad",
        userRole: "broker",
        clientId: sampleClient.id,
        now,
      });

      expect(result.authorized).toBe(true);
      expect(result.scope).toBe("full");
      expect(result.capabilities.canEditClient).toBe(true);
      expect(result.activeOpportunity?.id).toBe("opp-protected-1");
    });
  });

  describe("3. Broker Dormant: Acceso Limitado de Reactivación (`commercial_dormant`)", () => {
    it("otorga scope 'commercial_dormant' a un broker con relación dormant o legacy_unverified", async () => {
      const dormantRel: ClientCommercialRelationship = {
        id: "rel-dormant-1",
        clientId: sampleClient.id,
        brokerId: "broker-dormant",
        status: "dormant",
        activeUntil: new Date("2026-05-01T00:00:00Z"), // Vencida
      } as any;
      mockStorage.relationships = [dormantRel];

      const result = await authService.authorizeClientAccess({
        userId: "broker-dormant",
        userRole: "broker",
        clientId: sampleClient.id,
        now,
      });

      expect(result.authorized).toBe(true);
      expect(result.scope).toBe("commercial_dormant");
      // Regla: Ve perfil y puede intentar reactivación con nueva oportunidad, pero NO puede editar datos
      expect(result.capabilities.canViewBasicProfile).toBe(true);
      expect(result.capabilities.canEditClient).toBe(false);
      expect(result.capabilities.canCreateOpportunity).toBe(true);
      expect(result.capabilities.opportunitiesFilter).toBe("own_only");
    });

    it("broker dormant NO puede ver oportunidades creadas por otros brokers", () => {
      const dormantResult = {
        authorized: true,
        scope: "commercial_dormant" as ClientAccessScope,
        relationship: { brokerId: "broker-dormant" },
      } as any;

      const otherBrokerOpp: CommercialOpportunity = {
        id: "opp-other-1",
        clientId: sampleClient.id,
        brokerId: "broker-nuevo-tercero",
        status: "registered_hold",
      } as any;

      const ownOpp: CommercialOpportunity = {
        id: "opp-own-1",
        clientId: sampleClient.id,
        brokerId: "broker-dormant",
        status: "registered_hold",
      } as any;

      // Puede ver su propia oportunidad pero NO la de terceros
      expect(authService.canAccessOpportunity(dormantResult, ownOpp)).toBe(true);
      expect(authService.canAccessOpportunity(dormantResult, otherBrokerOpp)).toBe(false);
    });

    it("broker dormant NO puede ver documentos de créditos posteriores de otros brokers", () => {
      const dormantResult = {
        authorized: true,
        scope: "commercial_dormant" as ClientAccessScope,
      } as any;

      const foreignCreditDoc = {
        id: "doc-foreign",
        brokerId: "broker-tercero",
        creditId: "credit-posterior-ajeno",
        clientId: sampleClient.id,
      };

      const ownDoc = {
        id: "doc-own",
        brokerId: "broker-dormant",
        creditId: null,
        clientId: sampleClient.id,
      };

      expect(authService.canAccessDocument(dormantResult, foreignCreditDoc, "broker-dormant", [])).toBe(false);
      expect(authService.canAccessDocument(dormantResult, ownDoc, "broker-dormant", [])).toBe(true);
    });
  });

  describe("4. Broker Histórico: Sin Relación Vigente (`historical_scoped`)", () => {
    beforeEach(() => {
      // Crédito histórico originado hace 2 años por el broker originador
      mockStorage.credits = [
        {
          id: "credit-historico-1",
          clientId: sampleClient.id,
          brokerId: "broker-originador-historico",
          amount: "5000000",
          status: "active",
        } as any,
        {
          id: "credit-nuevo-otro-broker",
          clientId: sampleClient.id,
          brokerId: "broker-nuevo-2",
          amount: "3000000",
          status: "active",
        } as any,
      ];
    });

    it("otorga scope 'historical_scoped' al originador previo sin relación activa", async () => {
      const result = await authService.authorizeClientAccess({
        userId: "broker-originador-historico",
        userRole: "broker",
        clientId: sampleClient.id,
        now,
      });

      expect(result.authorized).toBe(true);
      expect(result.scope).toBe("historical_scoped");
      expect(result.capabilities.canViewBasicProfile).toBe(true);
      // REGLA CLAVE: NO puede editar datos comerciales del cliente
      expect(result.capabilities.canEditClient).toBe(false);
      // REGLA CLAVE: NO puede ver nuevas oportunidades de otros brokers
      expect(result.capabilities.canViewOpportunities).toBe(false);
      expect(result.capabilities.opportunitiesFilter).toBe("none");
      expect(result.capabilities.creditsFilter).toBe("own_originated");
    });

    it("clients.brokerId NO otorga por sí solo acceso 'full' (concede estrictamente 'historical_scoped')", async () => {
      // Cliente donde brokerId coincide pero no hay relación comercial activa
      const result = await authService.authorizeClientAccess({
        userId: sampleClient.brokerId,
        userRole: "broker",
        clientId: sampleClient.id,
        now,
      });

      expect(result.scope).toBe("historical_scoped");
      expect(result.capabilities.canEditClient).toBe(false);
    });

    it("REGLA CRÍTICA 1: broker histórico NO puede ver oportunidades nuevas de otro broker", () => {
      const historicalResult = {
        authorized: true,
        scope: "historical_scoped" as ClientAccessScope,
      } as any;

      const newThirdPartyOpportunity: CommercialOpportunity = {
        id: "opp-nueva-2026",
        clientId: sampleClient.id,
        brokerId: "broker-nuevo-2",
        financingNeedType: "credito_simple",
        status: "registered_hold",
      } as any;

      expect(
        authService.canAccessOpportunity(historicalResult, newThirdPartyOpportunity)
      ).toBe(false);
    });

    it("REGLA CRÍTICA 7: broker histórico solo ve SUS créditos y SUS documentos", () => {
      const visibleCredits = authService.filterCredits(
        mockStorage.credits,
        "broker-originador-historico",
        "historical_scoped"
      );

      // Solo ve su crédito histórico (1), no el crédito del nuevo broker (credit-nuevo-otro-broker)
      expect(visibleCredits).toHaveLength(1);
      expect(visibleCredits[0].id).toBe("credit-historico-1");

      // Documentos: solo puede ver documentos de SU crédito o subidos por él
      const historicalResult = {
        authorized: true,
        scope: "historical_scoped" as ClientAccessScope,
      } as any;

      const ownDoc = {
        brokerId: "broker-originador-historico",
        creditId: "credit-historico-1",
        clientId: sampleClient.id,
      };
      const foreignDoc = {
        brokerId: "broker-nuevo-2",
        creditId: "credit-nuevo-otro-broker",
        clientId: sampleClient.id,
      };

      expect(
        authService.canAccessDocument(
          historicalResult,
          ownDoc,
          "broker-originador-historico",
          ["credit-historico-1"]
        )
      ).toBe(true);

      expect(
        authService.canAccessDocument(
          historicalResult,
          foreignDoc,
          "broker-originador-historico",
          ["credit-historico-1"]
        )
      ).toBe(false);
    });
  });

  describe("5. Master Broker: Supervisión de su Red sin Acceso Irrestricto (`master_broker_oversight`)", () => {
    beforeEach(() => {
      // Red de Master Broker: broker-downline-1 pertenece a master-1
      mockStorage.users = [
        {
          id: "broker-downline-1",
          masterBrokerId: "master-1",
          role: "broker",
        } as any,
        {
          id: "broker-externo",
          masterBrokerId: "otro-master",
          role: "broker",
        } as any,
      ];
      // El cliente tiene crédito colocado por el broker de la red
      mockStorage.credits = [
        {
          id: "credit-red-1",
          clientId: sampleClient.id,
          brokerId: "broker-downline-1",
          amount: "1000000",
        } as any,
        {
          id: "credit-externo-1",
          clientId: sampleClient.id,
          brokerId: "broker-externo",
          amount: "2000000",
        } as any,
      ];
    });

    it("otorga scope 'master_broker_oversight' al Master Broker de la red del asesor", async () => {
      const result = await authService.authorizeClientAccess({
        userId: "master-1",
        userRole: "master_broker",
        clientId: sampleClient.id,
        now,
      });

      expect(result.authorized).toBe(true);
      expect(result.scope).toBe("master_broker_oversight");
      expect(result.capabilities.canViewBasicProfile).toBe(true);
      // REGLA CLAVE: Master Broker NO tiene acceso full para editar operativamente
      expect(result.capabilities.canEditClient).toBe(false);
      expect(result.capabilities.canCreateOpportunity).toBe(false);
      expect(result.capabilities.creditsFilter).toBe("network_downline");
      expect(result.capabilities.opportunitiesFilter).toBe("network_downline");
    });

    it("Master Broker solo ve oportunidades de brokers de su red, NO de brokers externos", () => {
      const mbResult = {
        authorized: true,
        scope: "master_broker_oversight" as ClientAccessScope,
      } as any;

      const networkOpp: CommercialOpportunity = {
        id: "opp-red",
        clientId: sampleClient.id,
        brokerId: "broker-downline-1",
        status: "registered_hold",
      } as any;

      const externalOpp: CommercialOpportunity = {
        id: "opp-ext",
        clientId: sampleClient.id,
        brokerId: "broker-externo",
        status: "registered_hold",
      } as any;

      const networkBrokerIds = ["broker-downline-1"];

      expect(authService.canAccessOpportunity(mbResult, networkOpp, networkBrokerIds)).toBe(true);
      expect(authService.canAccessOpportunity(mbResult, externalOpp, networkBrokerIds)).toBe(false);
    });

    it("Master Broker solo ve créditos de brokers de su red", () => {
      const networkBrokerIds = ["broker-downline-1"];
      const visible = authService.filterCredits(
        mockStorage.credits,
        "master-1",
        "master_broker_oversight",
        networkBrokerIds
      );

      expect(visible).toHaveLength(1);
      expect(visible[0].id).toBe("credit-red-1");
    });
  });

  describe("6. Broker Ajeno: Bloqueo Estricto (`none`)", () => {
    it("deniega acceso a un broker sin relación, sin créditos ni oportunidades", async () => {
      const result = await authService.authorizeClientAccess({
        userId: "broker-totalmente-ajeno",
        userRole: "broker",
        clientId: sampleClient.id,
        now,
      });

      expect(result.authorized).toBe(false);
      expect(result.scope).toBe("none");
      expect(result.capabilities.canViewBasicProfile).toBe(false);
      expect(result.capabilities.canEditClient).toBe(false);
      expect(result.capabilities.canViewCredits).toBe(false);
      expect(result.reason).toContain("Acceso denegado");
    });
  });

  describe("7. Coherencia de getScopeCapabilities", () => {
    it("asigna exactamente los permisos correspondientes a cada scope", () => {
      const full = getScopeCapabilities("full");
      expect(full.canEditClient).toBe(true);
      expect(full.canCreateOpportunity).toBe(true);

      const dormant = getScopeCapabilities("commercial_dormant");
      expect(dormant.canEditClient).toBe(false);
      expect(dormant.canCreateOpportunity).toBe(true);
      expect(dormant.opportunitiesFilter).toBe("own_only");

      const mb = getScopeCapabilities("master_broker_oversight");
      expect(mb.canEditClient).toBe(false);
      expect(mb.canCreateOpportunity).toBe(false);
      expect(mb.opportunitiesFilter).toBe("network_downline");

      const hist = getScopeCapabilities("historical_scoped");
      expect(hist.canEditClient).toBe(false);
      expect(hist.canViewOpportunities).toBe(false);
      expect(hist.opportunitiesFilter).toBe("none");

      const none = getScopeCapabilities("none");
      expect(none.canViewBasicProfile).toBe(false);
    });
  });
});
