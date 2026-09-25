import {
  getOpportunityStatusBadge,
  getRelationshipStatusBadge,
  getNeedTypeLabel,
  formatOpportunityDate,
  getDaysRemaining,
  OPPORTUNITY_STATUS_MAP,
  RELATIONSHIP_STATUS_MAP,
  COMMERCIAL_ACTIVITY_OPTIONS,
  FORMAL_DISPUTE_REASON_OPTIONS,
} from "../../client/src/components/Commercial/CommercialLabels";
import {
  CommercialOpportunityService,
  MockCommercialOpportunityStorage,
} from "../../server/commercialOpportunityService";
import {
  CommercialConfigService,
  MockCommercialConfigStorage,
} from "../../server/commercialConfigService";
import {
  CommercialAuthorizationService,
  MockCommercialAuthStorage,
} from "../../server/commercialAuthorizationService";
import {
  type Client,
  type CommercialOpportunity,
  type User,
  COMMERCIAL_ACTIVITY_TYPES,
  FORMAL_DISPUTE_REASONS,
} from "../../shared/schema";

describe("Fase 5: UI y Operación Real de Gobernanza Comercial", () => {
  let oppStorage: MockCommercialOpportunityStorage;
  let authStorage: MockCommercialAuthStorage;
  let configStorage: MockCommercialConfigStorage;
  let configService: CommercialConfigService;
  let authService: CommercialAuthorizationService;
  let oppService: CommercialOpportunityService;

  const now = new Date("2026-09-25T12:00:00Z");
  const tenantA = "tenant-fase5-alpha";
  const tenantB = "tenant-fase5-beta";

  const brokerActivo: User = {
    id: "broker-activo-1",
    role: "broker",
    tenantId: tenantA,
    firstName: "Carlos",
    lastName: "Broker Activo",
    email: "carlos@broker.com",
    isActive: true,
  } as any;

  const brokerDormant: User = {
    id: "broker-dormant-2",
    role: "broker",
    tenantId: tenantA,
    firstName: "David",
    lastName: "Broker Dormant",
    email: "david@broker.com",
    isActive: true,
  } as any;

  const brokerHistorico: User = {
    id: "broker-historico-3",
    role: "broker",
    tenantId: tenantA,
    firstName: "Elena",
    lastName: "Broker Historico",
    email: "elena@broker.com",
    isActive: true,
  } as any;

  const masterBroker: User = {
    id: "mb-supervisor-1",
    role: "master_broker",
    tenantId: tenantA,
    firstName: "Marcos",
    lastName: "Master Broker",
    email: "marcos@masterbroker.com",
    isActive: true,
  } as any;

  const adminTenantA: User = {
    id: "admin-tenant-a",
    role: "admin",
    tenantId: tenantA,
    firstName: "Ana",
    lastName: "Admin A",
    email: "admin@tenant-a.com",
    isActive: true,
  } as any;

  const adminTenantB: User = {
    id: "admin-tenant-b",
    role: "admin",
    tenantId: tenantB,
    firstName: "Beto",
    lastName: "Admin B",
    email: "admin@tenant-b.com",
    isActive: true,
  } as any;

  const superAdmin: User = {
    id: "super-admin-root",
    role: "super_admin",
    tenantId: null,
    firstName: "Sofia",
    lastName: "Super Admin",
    email: "sofia@superadmin.com",
    isActive: true,
  } as any;

  const clientAlpha: Client = {
    id: "client-alpha-1",
    brokerId: brokerHistorico.id,
    businessName: "Comercializadora Alfa SA de CV",
    rfc: "CAL200101XYZ",
    phone: "5511223344",
    email: "contacto@alfa.com",
    tenantId: tenantA,
    type: "persona_moral",
    commercialRelationshipStatus: "active",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  } as any;

  const clientBeta: Client = {
    id: "client-beta-2",
    brokerId: "broker-tenant-b",
    businessName: "Distribuidora Beta SA de CV",
    rfc: "DBE200101XYZ",
    phone: "5599887766",
    email: "contacto@beta.com",
    tenantId: tenantB,
    type: "persona_moral",
    commercialRelationshipStatus: "active",
    createdAt: new Date("2024-01-01T00:00:00Z"),
  } as any;

  beforeEach(() => {
    oppStorage = new MockCommercialOpportunityStorage();
    authStorage = new MockCommercialAuthStorage();
    configStorage = new MockCommercialConfigStorage();

    configService = new CommercialConfigService(configStorage);
    authService = new CommercialAuthorizationService(authStorage);
    oppService = new CommercialOpportunityService(oppStorage, configService, authService);

    oppStorage.clients = [clientAlpha, clientBeta];
    authStorage.clients = [clientAlpha, clientBeta];

    (brokerActivo as any).masterBrokerId = masterBroker.id;
    (brokerDormant as any).masterBrokerId = masterBroker.id;

    authStorage.users = [
      brokerActivo,
      brokerDormant,
      brokerHistorico,
      masterBroker,
      adminTenantA,
      adminTenantB,
      superAdmin,
    ];

    const activeRel = {
      id: "rel-activo-1",
      tenantId: tenantA,
      clientId: clientAlpha.id,
      brokerId: brokerActivo.id,
      status: "active",
      activeUntil: new Date("2026-12-31T00:00:00Z"),
      lastValidActivityAt: now,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    };
    authStorage.relationships = [activeRel as any];
    oppStorage.relationships = [activeRel as any];
  });

  // 1. Broker activo ve y gestiona su oportunidad
  test("1. Broker activo ve y gestiona su oportunidad", async () => {
    const createResult = await oppService.createOpportunity({
      clientId: clientAlpha.id,
      brokerId: brokerActivo.id,
      title: "Crédito simple",
      financingNeedType: "credito_empresarial",
      requestedAmount: "500000",
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
      now,
    });

    expect(createResult.success).toBe(true);
    const opp = createResult.opportunity!;
    expect(opp.status).toBe("registered_hold");

    // Registro de actividad válida para pasar a protected_active
    const actResult = await oppService.recordActivity({
      clientId: clientAlpha.id,
      opportunityId: opp.id,
      brokerId: brokerActivo.id,
      activityType: "meeting_conducted",
      title: "Reunión de perfilamiento completada",
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
      now,
    });

    expect(actResult.success).toBe(true);
    expect(actResult.opportunity?.status).toBe("protected_active");

    // Listar oportunidades como brokerActivo
    const listResult = await oppService.listOpportunities({
      userId: brokerActivo.id,
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
    });
    expect(listResult.opportunities.length).toBe(1);
    expect(listResult.opportunities[0].id).toBe(opp.id);
  });

  // 2. Broker dormant puede iniciar reactivación cuando corresponda
  test("2. Broker dormant puede iniciar reactivación al crear una nueva oportunidad válida", async () => {
    // Relación comercial dormant
    authStorage.relationships.push({
      id: "rel-dormant-1",
      tenantId: tenantA,
      clientId: clientAlpha.id,
      brokerId: brokerDormant.id,
      status: "dormant",
      activeUntil: new Date("2026-01-01T00:00:00Z"),
      lastValidActivityAt: new Date("2025-10-01T00:00:00Z"),
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-10-01T00:00:00Z"),
    } as any);

    const dupCheck = await oppService.checkDuplicatesEnriched({
      rfc: clientAlpha.rfc,
      phone: clientAlpha.phone,
      email: clientAlpha.email,
      financingNeedType: "arrendamiento",
      currentUserId: brokerDormant.id,
      currentUserRole: "broker",
      userTenantId: tenantA,
      tenantContext: { tenant: { id: tenantA } },
    });

    expect(dupCheck.canCreateOpportunity).toBe(true);

    const reactivatedResult = await oppService.createOpportunity({
      clientId: clientAlpha.id,
      brokerId: brokerDormant.id,
      title: "Arrendamiento de equipo",
      financingNeedType: "arrendamiento",
      requestedAmount: "1000000",
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
      now,
    });

    expect(reactivatedResult.success).toBe(true);
    expect(reactivatedResult.opportunity?.status).toBe("registered_hold");
    expect(reactivatedResult.opportunity?.brokerId).toBe(brokerDormant.id);
  });

  // 3. Broker histórico no ve oportunidades ajenas
  test("3. Broker histórico no ve oportunidades comerciales protegidas ajenas", async () => {
    await oppService.createOpportunity({
      clientId: clientAlpha.id,
      brokerId: brokerActivo.id,
      title: "Factoraje",
      financingNeedType: "factoraje",
      requestedAmount: "2000000",
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
      now,
    });

    const listResult = await oppService.listOpportunities({
      userId: brokerHistorico.id,
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
    });
    expect(listResult.opportunities.length).toBe(0);
  });

  // 4. Master Broker tiene supervisión limitada a los brokers de su estructura
  test("4. Master Broker tiene supervisión limitada a los brokers de su estructura", async () => {
    // brokerActivo (en la red de masterBroker) crea oportunidad
    await oppService.createOpportunity({
      clientId: clientAlpha.id,
      brokerId: brokerActivo.id,
      title: "Crédito Pyme",
      financingNeedType: "credito_empresarial",
      requestedAmount: "800000",
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
      now,
    });

    // brokerHistorico (NO en la red de masterBroker) crea oportunidad
    await oppService.createOpportunity({
      clientId: clientAlpha.id,
      brokerId: brokerHistorico.id,
      title: "Arrendamiento vehículo",
      financingNeedType: "arrendamiento",
      requestedAmount: "400000",
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
      now,
    });

    const mbList = await oppService.listOpportunities({
      userId: masterBroker.id,
      userRole: "master_broker",
      tenantContext: { tenant: { id: tenantA } },
    });
    // Debe ver las de su estructura
    expect(mbList.opportunities.length).toBeGreaterThanOrEqual(1);
    expect(mbList.opportunities.every(o => o.brokerId === brokerActivo.id || o.masterBrokerId === masterBroker.id)).toBe(true);
  });

  // 5. Admin tenant no cruza tenants
  test("5. Admin tenant no cruza tenants", async () => {
    await oppService.createOpportunity({
      clientId: clientAlpha.id,
      brokerId: brokerActivo.id,
      title: "Crédito simple A",
      financingNeedType: "credito_empresarial",
      requestedAmount: "300000",
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
      now,
    });

    await oppService.createOpportunity({
      clientId: clientBeta.id,
      brokerId: "broker-tenant-b",
      title: "Crédito simple B",
      financingNeedType: "credito_empresarial",
      requestedAmount: "900000",
      userRole: "broker",
      tenantContext: { tenant: { id: tenantB } },
      now,
    });

    const listAdminA = await oppService.listOpportunities({
      userId: adminTenantA.id,
      userRole: "admin",
      tenantContext: { tenant: { id: tenantA } },
    });
    const listAdminB = await oppService.listOpportunities({
      userId: adminTenantB.id,
      userRole: "admin",
      tenantContext: { tenant: { id: tenantB } },
    });

    expect(listAdminA.opportunities.every((o: any) => o.tenantId === tenantA)).toBe(true);
    expect(listAdminB.opportunities.every((o: any) => o.tenantId === tenantB)).toBe(true);
    expect(listAdminA.opportunities.some((o: any) => o.clientId === clientBeta.id)).toBe(false);
  });

  // 6. Super Admin puede configurar parámetros
  test("6. Super Admin puede configurar y consultar parámetros centrales", async () => {
    const updated = await configService.updateConfig(
      {
        initialOpportunityHoldDays: 14,
        opportunityInactivityProtectionDays: 45,
      },
      superAdmin.id,
      "Ajuste de política comercial para el Q4"
    );

    expect(updated.updatedConfig.initialOpportunityHoldDays).toBe(14);
    expect(updated.updatedConfig.opportunityInactivityProtectionDays).toBe(45);

    const activeRules = await configService.getConfig();
    expect(activeRules.initialOpportunityHoldDays).toBe(14);

    const history = await configService.getAuditHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].changeReason).toBe("Ajuste de política comercial para el Q4");
  });

  // 7. Mensajes de conflicto se muestran correctamente
  test("7. Mensajes de conflicto y etiquetas se formatean sin jerga interna", () => {
    expect(OPPORTUNITY_STATUS_MAP.registered_hold.label).toBe("Reserva inicial");
    expect(OPPORTUNITY_STATUS_MAP.protected_active.label).toBe("Oportunidad protegida");
    expect(OPPORTUNITY_STATUS_MAP.disputed.label).toBe("En controversia formal");
    expect(RELATIONSHIP_STATUS_MAP.legacy_unverified.label).toBe("Relación por validar");
    expect(RELATIONSHIP_STATUS_MAP.dormant.label).toBe("Relación sin actividad reciente");

    const badgeHold = getOpportunityStatusBadge("registered_hold");
    expect(badgeHold.label).toContain("Reserva");

    const badgeActiveRel = getRelationshipStatusBadge("active");
    expect(badgeActiveRel.label).toContain("activa");
  });

  // 8. Cliente existente elegible permite crear oportunidad
  test("8. Cliente existente elegible permite crear oportunidad", async () => {
    const dupCheck = await oppService.checkDuplicatesEnriched({
      rfc: clientAlpha.rfc,
      financingNeedType: "hipotecario_empresarial",
      currentUserId: brokerActivo.id,
      currentUserRole: "broker",
      userTenantId: tenantA,
      tenantContext: { tenant: { id: tenantA } },
    });

    expect(dupCheck.canCreateOpportunity).toBe(true);
    expect(dupCheck.clientExists).toBe(true);
    expect(dupCheck.existingClient?.id).toBe(clientAlpha.id);
  });

  // 9. Oportunidad protegida bloquea nueva equivalente
  test("9. Oportunidad protegida bloquea nueva creación equivalente para otro broker", async () => {
    await oppService.createOpportunity({
      clientId: clientAlpha.id,
      brokerId: brokerActivo.id,
      title: "Crédito Pyme",
      financingNeedType: "credito_empresarial",
      requestedAmount: "1000000",
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
      now,
    });

    // Intentar crear la misma necesidad por brokerDormant
    const result2 = await oppService.createOpportunity({
      clientId: clientAlpha.id,
      brokerId: brokerDormant.id,
      title: "Crédito Pyme Duplicado",
      financingNeedType: "credito_empresarial",
      requestedAmount: "1200000",
      userRole: "broker",
      tenantContext: { tenant: { id: tenantA } },
      now,
    });

    expect(result2.success).toBe(false);

    // Check duplicates debe advertir protección vigente
    const dupCheck = await oppService.checkDuplicatesEnriched({
      rfc: clientAlpha.rfc,
      financingNeedType: "credito_empresarial",
      currentUserId: brokerDormant.id,
      currentUserRole: "broker",
      userTenantId: tenantA,
      tenantContext: { tenant: { id: tenantA } },
    });

    expect(dupCheck.canCreateOpportunity).toBe(false);
    expect(dupCheck.duplicateReason).toBe("client_has_protected_opportunity");
  });

  // 10. UI refleja correctamente expiración y cálculo de días restantes
  test("10. Funciones de expiración y formato de fecha operan con precisión", () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const remainingDays = getDaysRemaining(futureDate);
    expect(remainingDays).toBeGreaterThanOrEqual(4);
    expect(remainingDays).toBeLessThanOrEqual(6);

    const formatted = formatOpportunityDate(new Date("2026-10-15T00:00:00Z"));
    expect(formatted).toBeDefined();
    expect(formatted).not.toBe("—");

    const label = getNeedTypeLabel("credito_empresarial");
    expect(label).toContain("Crédito Empresarial");
  });

  // 11. Motivos de controversia exactos y alineados entre UI y Backend
  test("11. Motivos de disputa formal coinciden exactamente con FORMAL_DISPUTE_REASONS de backend", () => {
    const uiDisputeValues = FORMAL_DISPUTE_REASON_OPTIONS.map(opt => opt.value);
    expect(uiDisputeValues).toHaveLength(FORMAL_DISPUTE_REASONS.length);
    for (const reason of FORMAL_DISPUTE_REASONS) {
      expect(uiDisputeValues).toContain(reason);
    }

    // No debe haber strings inventados como client_request o conflicting_evidence
    expect(uiDisputeValues).not.toContain("client_request");
    expect(uiDisputeValues).not.toContain("conflicting_evidence");
  });

  // 12. Actividades comerciales calificadas corresponden con COMMERCIAL_ACTIVITY_TYPES
  test("12. Actividades calificadas en UI corresponden con COMMERCIAL_ACTIVITY_TYPES y notas CRM no extienden", () => {
    const qualifyingOptions = COMMERCIAL_ACTIVITY_OPTIONS.filter(o => o.isQualifying).map(o => o.value);
    
    // Todas las calificadas deben ser tipos válidos reconocidos por backend
    for (const q of qualifyingOptions) {
      expect(COMMERCIAL_ACTIVITY_TYPES).toContain(q as any);
    }

    // Las notas CRM y llamadas no calificadas NO deben ser qualifying
    const crmOpt = COMMERCIAL_ACTIVITY_OPTIONS.find(o => o.value === "crm_note");
    expect(crmOpt).toBeDefined();
    expect(crmOpt?.isQualifying).toBe(false);

    const callOpt = COMMERCIAL_ACTIVITY_OPTIONS.find(o => o.value === "call_unverified");
    expect(callOpt).toBeDefined();
    expect(callOpt?.isQualifying).toBe(false);
  });

  // 13. Etiquetas visibles sin términos técnicos (sin Hold, sin Dormant, sin legacy_unverified)
  test("13. Etiquetas visibles no muestran tecnicismos internos como Hold o Dormant", () => {
    const holdBadge = getOpportunityStatusBadge("registered_hold");
    expect(holdBadge.label).toBe("Reserva inicial");
    expect(holdBadge.label).not.toContain("Hold");

    const dormantBadge = getRelationshipStatusBadge("dormant");
    expect(dormantBadge.label).toBe("Relación sin actividad reciente");
    expect(dormantBadge.label).not.toContain("Dormant");

    const legacyBadge = getRelationshipStatusBadge("legacy_unverified");
    expect(legacyBadge.label).toBe("Relación por validar");
    expect(legacyBadge.label).not.toContain("legacy_unverified");

    const protectedBadge = getOpportunityStatusBadge("protected_active");
    expect(protectedBadge.label).toBe("Oportunidad protegida");
    expect(protectedBadge.label).not.toContain("protected_active");
  });
});
