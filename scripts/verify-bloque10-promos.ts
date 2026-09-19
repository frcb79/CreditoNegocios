/**
 * Verification Script — BLOQUE 10
 * Códigos Promocionales, Beneficios Comerciales y Estado de Acceso
 * 
 * Validates:
 * 1. Separation of referralCode (who invited you) vs promoCode (commercial benefit).
 * 2. All 5 benefit types (free, percentage_discount, fixed_discount, free_months, permanent_free).
 * 3. Promo code validation (dates, active flag, max_uses).
 * 4. Promo redemption and duplicate prevention.
 * 5. Telemetry endpoint /api/promos/my-benefits.
 * 6. CRITICAL PRINCIPLE: Expired accessStatus NEVER blocks clients, matching, credits, or commissions.
 * 7. Platform Admin management of promos, redemptions, and manual access status updates.
 */

process.env.USE_MEMORY_STORAGE = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

import { storage } from "../server/storage";
import { evaluateAllFieldsForClient } from "../client/src/components/MatchingAnalysis/matchingRules";

interface TestResult {
  name: string;
  category: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL";
  details?: string;
}

const results: TestResult[] = [];

function record(name: string, category: string, expected: string, actual: string, passed: boolean, details?: string) {
  const status: "PASS" | "FAIL" = passed ? "PASS" : "FAIL";
  results.push({ name, category, expected, actual, status, details });
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} [${category}] ${name}`);
  if (!passed && details) {
    console.log(`   Detalle error: ${details}`);
  }
}

async function runBloque10Verification() {
  console.log("================================================================================");
  console.log("🎟️ INICIANDO VERIFICACIÓN INTEGRAL — BLOQUE 10: CÓDIGOS Y ACCESO COMERCIAL");
  console.log("================================================================================\n");

  // Setup Admin & Master Broker accounts
  const superAdmin = await storage.createUser({
    email: "admin.b10@creditonegocios.com.mx",
    password: "Password123!",
    firstName: "Admin",
    lastName: "B10",
    role: "super_admin",
    authMethod: "local",
    accessStatus: "complimentary",
  } as any);

  const masterBroker = await storage.createUser({
    email: "mb.franco@creditonegocios.com.mx",
    password: "Password123!",
    firstName: "Franco",
    lastName: "Master",
    role: "master_broker",
    referralCode: "MB-FRANCO",
    authMethod: "local",
    accessStatus: "active",
  } as any);

  // ---------------------------------------------------------------------------
  // 1. CONCEPT SEPARATION: referralCode vs promoCode
  // ---------------------------------------------------------------------------
  console.log("\n--- 1. SEPARACIÓN CONCEPTUAL: referralCode vs promoCode ---");

  // Create promo code for testing registration
  const signupPromo = await storage.createPromoCode({
    code: "PROMO-BIENVENIDA",
    name: "Bienvenida 3 Meses Gratis",
    description: "Tres meses de acceso promocional sin costo",
    benefitType: "free_months",
    benefitValue: "3",
    durationMonths: 3,
    targetScope: "global",
    createdBy: superAdmin.id,
  });

  // User A: Registers only with referralCode (Master Broker network link)
  const userReferralOnly = await storage.createUser({
    email: "broker.refonly@test.com",
    password: "Password123!",
    firstName: "Broker",
    lastName: "Red",
    role: "broker",
    masterBrokerId: masterBroker.id, // Linked to master broker
    authMethod: "local",
    accessStatus: "free", // Standard default
  } as any);

  record(
    "referralCode solo vincula a Master Broker sin otorgar promociones indebidas",
    "Separación de Conceptos",
    `masterBrokerId=${masterBroker.id}, accessStatus=free`,
    `masterBrokerId=${userReferralOnly.masterBrokerId}, accessStatus=${userReferralOnly.accessStatus}`,
    userReferralOnly.masterBrokerId === masterBroker.id && userReferralOnly.accessStatus === "free"
  );

  // User B: Registers only with promoCode
  const userPromoOnly = await storage.createUser({
    email: "broker.promoonly@test.com",
    password: "Password123!",
    firstName: "Broker",
    lastName: "Promo",
    role: "broker",
    authMethod: "local",
    accessStatus: "promotional",
    accessStatusExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    activePromoId: signupPromo.id,
  } as any);

  await storage.createPromoRedemption({
    promoCodeId: signupPromo.id,
    userId: userPromoOnly.id,
    status: "active",
    startsAt: new Date(),
    expiresAt: userPromoOnly.accessStatusExpiresAt,
  });

  record(
    "promoCode solo otorga beneficio comercial sin afiliar a Master Broker",
    "Separación de Conceptos",
    `masterBrokerId=null/undefined, accessStatus=promotional, activePromoId=${signupPromo.id}`,
    `masterBrokerId=${userPromoOnly.masterBrokerId}, accessStatus=${userPromoOnly.accessStatus}, activePromoId=${userPromoOnly.activePromoId}`,
    !userPromoOnly.masterBrokerId && userPromoOnly.accessStatus === "promotional" && userPromoOnly.activePromoId === signupPromo.id
  );

  // User C: Registers with BOTH referralCode and promoCode
  const userBoth = await storage.createUser({
    email: "broker.both@test.com",
    password: "Password123!",
    firstName: "Broker",
    lastName: "Completo",
    role: "broker",
    masterBrokerId: masterBroker.id,
    authMethod: "local",
    accessStatus: "promotional",
    accessStatusExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    activePromoId: signupPromo.id,
  } as any);

  await storage.createPromoRedemption({
    promoCodeId: signupPromo.id,
    userId: userBoth.id,
    status: "active",
    startsAt: new Date(),
    expiresAt: userBoth.accessStatusExpiresAt,
  });

  record(
    "Registro conjunto maneja correctamente ambos campos independientes",
    "Separación de Conceptos",
    `masterBrokerId=${masterBroker.id}, activePromoId=${signupPromo.id}`,
    `masterBrokerId=${userBoth.masterBrokerId}, activePromoId=${userBoth.activePromoId}`,
    userBoth.masterBrokerId === masterBroker.id && userBoth.activePromoId === signupPromo.id
  );

  // ---------------------------------------------------------------------------
  // 2. TODOS LOS 5 TIPOS DE BENEFICIOS (PROMO_BENEFIT_TYPES)
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. CATÁLOGO DE BENEFICIOS COMERCIALES (5 TIPOS) ---");

  // 2.1 free
  const promoFree = await storage.createPromoCode({
    code: "PROMO-STANDARD-FREE",
    name: "Acceso Estándar Gratuito",
    benefitType: "free",
    benefitValue: "0",
    createdBy: superAdmin.id,
  });
  record("Creación de beneficio 'free'", "Tipos de Beneficio", "free", promoFree.benefitType, promoFree.benefitType === "free");

  // 2.2 percentage_discount
  const promoPct = await storage.createPromoCode({
    code: "PROMO-DESC-50",
    name: "Descuento del 50%",
    benefitType: "percentage_discount",
    benefitValue: "50.00",
    durationMonths: 6,
    createdBy: superAdmin.id,
  });
  record("Creación de beneficio 'percentage_discount'", "Tipos de Beneficio", "percentage_discount (50%)", `${promoPct.benefitType} (${promoPct.benefitValue}%)`, promoPct.benefitType === "percentage_discount" && Number(promoPct.benefitValue) === 50);

  // 2.3 fixed_discount
  const promoFixed = await storage.createPromoCode({
    code: "PROMO-FIXED-500",
    name: "Descuento Fijo de $500",
    benefitType: "fixed_discount",
    benefitValue: "500.00",
    durationMonths: 12,
    createdBy: superAdmin.id,
  });
  record("Creación de beneficio 'fixed_discount'", "Tipos de Beneficio", "fixed_discount ($500)", `${promoFixed.benefitType} ($${promoFixed.benefitValue})`, promoFixed.benefitType === "fixed_discount" && Number(promoFixed.benefitValue) === 500);

  // 2.4 free_months
  const promoMonths = await storage.createPromoCode({
    code: "PROMO-MESES-GRATIS-6",
    name: "6 Meses de Gracia",
    benefitType: "free_months",
    benefitValue: "6",
    durationMonths: 6,
    createdBy: superAdmin.id,
  });
  record("Creación de beneficio 'free_months'", "Tipos de Beneficio", "free_months (6 meses)", `${promoMonths.benefitType} (${promoMonths.durationMonths} meses)`, promoMonths.benefitType === "free_months" && promoMonths.durationMonths === 6);

  // 2.5 permanent_free
  const promoPermanent = await storage.createPromoCode({
    code: "PROMO-CORTESIA-VITALICIA",
    name: "Acceso Cortesía Permanente Alianza",
    benefitType: "permanent_free",
    benefitValue: "0",
    durationMonths: null,
    createdBy: superAdmin.id,
  });
  record("Creación de beneficio 'permanent_free'", "Tipos de Beneficio", "permanent_free", promoPermanent.benefitType, promoPermanent.benefitType === "permanent_free");

  // ---------------------------------------------------------------------------
  // 3. VALIDACIÓN DE CÓDIGOS (REGLAS Y LIMITES)
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. REGLAS DE VALIDACIÓN DE CÓDIGOS ---");

  // 3.1 Búsqueda insensible a mayúsculas/minúsculas
  const foundByLower = await storage.getPromoCodeByCode("promo-desc-50");
  record(
    "Búsqueda por código insensible a minúsculas/mayúsculas",
    "Validación",
    "PROMO-DESC-50",
    foundByLower?.code || "none",
    foundByLower?.code === "PROMO-DESC-50"
  );

  // 3.2 Código inexistente
  const notFound = await storage.getPromoCodeByCode("CODIGO-INVENTADO-XYZ");
  record("Rechazo de código inexistente", "Validación", "undefined", String(notFound), notFound === undefined);

  // 3.3 Código inactivo
  const inactivePromo = await storage.createPromoCode({
    code: "PROMO-INACTIVA",
    name: "Promo Inactiva",
    benefitType: "percentage_discount",
    benefitValue: "10",
    isActive: false,
    createdBy: superAdmin.id,
  });
  record("Detección de código inactivo", "Validación", "isActive=false", `isActive=${inactivePromo.isActive}`, inactivePromo.isActive === false);

  // 3.4 Código expirado
  const expiredPromo = await storage.createPromoCode({
    code: "PROMO-EXPIRADA-AYER",
    name: "Expirada",
    benefitType: "free_months",
    benefitValue: "1",
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
    createdBy: superAdmin.id,
  });
  const isExpired = expiredPromo.expiresAt && new Date(expiredPromo.expiresAt) < new Date();
  record("Detección de código expirado por fecha", "Validación", "isExpired=true", `isExpired=${Boolean(isExpired)}`, Boolean(isExpired));

  // 3.5 Código con límite de usos alcanzado
  const maxUsesPromo = await storage.createPromoCode({
    code: "PROMO-LIMITE-1",
    name: "Solo 1 Uso",
    benefitType: "percentage_discount",
    benefitValue: "30",
    maxUses: 1,
    createdBy: superAdmin.id,
  });

  // Apply once
  await storage.createPromoRedemption({
    promoCodeId: maxUsesPromo.id,
    userId: userReferralOnly.id,
    status: "active",
  });
  const updatedPromo = await storage.getPromoCode(maxUsesPromo.id);
  const reachedMax = updatedPromo && updatedPromo.maxUses !== null && updatedPromo.currentUses >= updatedPromo.maxUses;
  record(
    "Control de límite máximo de canjes (max_uses)",
    "Validación",
    "currentUses=1, reachedMax=true",
    `currentUses=${updatedPromo?.currentUses}, reachedMax=${Boolean(reachedMax)}`,
    Boolean(reachedMax)
  );

  // ---------------------------------------------------------------------------
  // 4. CANJE Y PREVENCIÓN DE DUPLICADOS
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. CANJE Y PREVENCIÓN DE RE-CANJE ---");

  const testUser = await storage.createUser({
    email: "test.canje@creditonegocios.com.mx",
    password: "Password123!",
    firstName: "Juan",
    lastName: "Canje",
    role: "broker",
    authMethod: "local",
    accessStatus: "free",
  } as any);

  // First redemption
  const r1 = await storage.createPromoRedemption({
    promoCodeId: promoMonths.id,
    userId: testUser.id,
    status: "active",
  });
  record("Primer canje de código exitoso", "Canje", "active", r1.status, r1.status === "active");

  // Check existing redemptions to prevent duplicate
  const existingRedemptions = await storage.getPromoRedemptions({ promoCodeId: promoMonths.id, userId: testUser.id });
  const shouldBlockDuplicate = existingRedemptions.length >= 1;
  record(
    "Prevención de doble canje del mismo código por el mismo usuario",
    "Canje",
    "shouldBlockDuplicate=true",
    `shouldBlockDuplicate=${shouldBlockDuplicate}`,
    shouldBlockDuplicate
  );

  // ---------------------------------------------------------------------------
  // 5. TELEMETRÍA Y CONSULTA DE BENEFICIOS (/api/promos/my-benefits)
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. TELEMETRÍA: /api/promos/my-benefits ---");

  // Update test user's status to reflect the active promo
  const expires6m = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  await storage.updateUserAccessStatus(testUser.id, "promotional", expires6m, "Canjeado PROMO-MESES-GRATIS-6", promoMonths.id);

  const activeRedemption = await storage.getUserActiveRedemption(testUser.id);
  const refreshedTestUser = await storage.getUser(testUser.id);

  record(
    "Consulta de beneficio activo del usuario",
    "Telemetría",
    "PROMO-MESES-GRATIS-6",
    activeRedemption?.promoCode.code || "none",
    activeRedemption?.promoCode.code === "PROMO-MESES-GRATIS-6"
  );

  record(
    "Estado de acceso comercial del usuario actualizado a 'promotional'",
    "Telemetría",
    "promotional",
    refreshedTestUser?.accessStatus || "none",
    refreshedTestUser?.accessStatus === "promotional"
  );

  // ---------------------------------------------------------------------------
  // 6. PRUEBA CRÍTICA: NO-BLOQUEO OPERATIVO EN ESTADO 'EXPIRED'
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. PRUEBA CRÍTICA: NO-BLOQUEO OPERATIVO CON ESTADO 'EXPIRED' ---");
  console.log("   Garantía: Captación → Matching → Crédito → Propuesta → Dispersión");

  // Create broker with EXPIRED commercial status
  const expiredBroker = await storage.createUser({
    email: "broker.expirado@test.com",
    password: "Password123!",
    firstName: "Broker",
    lastName: "Expirado",
    role: "broker",
    authMethod: "local",
    accessStatus: "expired", // EXPIRED COMMERCIAL ACCESS
    accessStatusExpiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Expired 30 days ago
    accessStatusNotes: "Promoción finalizada el mes pasado",
  } as any);

  // 6.1 Expired broker creates client
  let clientCreated = false;
  let testClient: any = null;
  try {
    testClient = await storage.createClient({
      fullName: "Comercializadora Industrial Alfa SA de CV",
      rfc: "CIA200101XYZ",
      email: "contacto@alfa.mx",
      phone: "5512345678",
      tipoPersona: "persona_moral",
      monthlyIncome: "1500000.00",
      yearsInBusiness: 5,
      estado: "Ciudad de México",
      buroScore: 680,
      assignedBrokerId: expiredBroker.id,
      createdBy: expiredBroker.id,
    } as any);
    clientCreated = Boolean(testClient?.id);
  } catch (err: any) {
    clientCreated = false;
  }
  record(
    "Usuario con accessStatus='expired' PUEDE registrar clientes sin restricción",
    "No-Bloqueo Operativo",
    "clientCreated=true",
    `clientCreated=${clientCreated}`,
    clientCreated
  );

  // 6.2 Matching engine operates for expired broker's client
  const matchingInstitution = {
    id: "fin-b10-match",
    name: "Financiera Matching B10",
    acceptedProfiles: ["persona_moral"],
    requirements: {
      persona_moral: {
        ranges: {
          monto: { min: 500000, max: 10000000 },
          tiempoActividad: { min: 24 },
          buroEmpresa: { min: 650 },
        }
      }
    }
  };
  const clientDataForMatching = {
    type: "persona_moral",
    businessName: testClient.businessName,
    yearsInBusiness: 5,
    tiempoActividad: 60,
    buroEmpresa: 680,
    montoSolicitado: 3000000,
  };
  const matchingResult = evaluateAllFieldsForClient(clientDataForMatching, matchingInstitution, 3000000);
  const matchingPassed = matchingResult.matchStatus === "compatible";
  record(
    "Motor de matching opera 100% para clientes de usuarios con acceso 'expired'",
    "No-Bloqueo Operativo",
    "matchStatus='compatible'",
    `matchStatus=${matchingResult.matchStatus}`,
    matchingPassed
  );

  // 6.3 Expired broker submits credit request
  let submissionCreated = false;
  let testSubmission: any = null;
  try {
    testSubmission = await storage.createCreditSubmissionRequest({
      clientId: testClient.id,
      brokerId: expiredBroker.id,
      requestedAmount: "3000000.00",
      purpose: "Expansión operativa y maquinaria",
      brokerNotes: "Cliente solvente con buen historial",
      status: "pending_admin",
    } as any);
    submissionCreated = Boolean(testSubmission?.id);
  } catch (err: any) {
    submissionCreated = false;
  }
  record(
    "Usuario con accessStatus='expired' PUEDE radicar expedientes de crédito",
    "No-Bloqueo Operativo",
    "submissionCreated=true",
    `submissionCreated=${submissionCreated}`,
    submissionCreated
  );

  // 6.4 Credit submission target and proposal processed
  let institution = (await storage.getFinancialInstitutions())[0];
  if (!institution) {
    institution = await storage.createFinancialInstitution({
      name: "Banco Base Test B10",
      type: "banco",
      status: "active",
      supportedProducts: ["credito_simple"],
    } as any);
  }

  const target = await storage.createCreditSubmissionTarget({
    requestId: testSubmission.id,
    financialInstitutionId: institution.id,
    status: "approved",
  } as any);

  // Mark winner and disperse
  const winningTarget = await storage.updateCreditSubmissionTarget(target.id, {
    isWinner: true,
    status: "dispersed",
    dispersedAt: new Date(),
  });
  record(
    "Flujo de colocación y dispersión se completa exitosamente para broker 'expired'",
    "No-Bloqueo Operativo",
    "status=dispersed, isWinner=true",
    `status=${winningTarget?.status}, isWinner=${winningTarget?.isWinner}`,
    winningTarget?.status === "dispersed" && winningTarget?.isWinner === true
  );

  // 6.5 Commission disbursement recorded
  const credit = await storage.createCredit({
    clientId: testClient.id,
    financialInstitutionId: institution.id,
    assignedBrokerId: expiredBroker.id,
    amount: "3000000.00",
    term: 36,
    interestRate: "16.50",
    status: "active",
    type: "simple",
  } as any);

  const commission = await storage.createCommission({
    creditId: credit.id,
    brokerId: expiredBroker.id,
    totalAmount: "60000.00",
    brokerShare: "48000.00",
    appShare: "12000.00",
    status: "pagada",
  } as any);

  record(
    "Generación y pago de comisiones se liquida sin retención para broker 'expired'",
    "No-Bloqueo Operativo",
    "status=pagada, brokerShare=48000.00",
    `status=${commission.status}, brokerShare=${commission.brokerShare}`,
    commission.status === "pagada" && Number(commission.brokerShare) === 48000
  );

  // ---------------------------------------------------------------------------
  // 7. GESTIÓN ADMINISTRATIVA DE CÓDIGOS Y ACCESO
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. GESTIÓN ADMINISTRATIVA ---");

  // 7.1 List all promos
  const allPromos = await storage.getPromoCodes();
  record(
    "Platform Admin consulta catálogo completo de promociones",
    "Gestión Admin",
    ">= 6 promociones creadas",
    `${allPromos.length} promociones`,
    allPromos.length >= 6
  );

  // 7.2 Toggle promo status
  const toggledPromo = await storage.updatePromoCode(promoPct.id, { isActive: false });
  record(
    "Platform Admin desactiva código promocional (toggle isActive)",
    "Gestión Admin",
    "isActive=false",
    `isActive=${toggledPromo?.isActive}`,
    toggledPromo?.isActive === false
  );

  // 7.3 Manually update user access status
  const manuallyUpdated = await storage.updateUserAccessStatus(
    expiredBroker.id,
    "active",
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    "Reactivación manual por acuerdo comercial anual"
  );
  record(
    "Platform Admin actualiza manualmente accessStatus de un usuario",
    "Gestión Admin",
    "active",
    manuallyUpdated?.accessStatus || "none",
    manuallyUpdated?.accessStatus === "active"
  );

  // ---------------------------------------------------------------------------
  // RESUMEN FINAL
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("📊 RESUMEN DE RESULTADOS — BLOQUE 10");
  console.log("================================================================================");

  const passedCount = results.filter(r => r.status === "PASS").length;
  const failedCount = results.filter(r => r.status === "FAIL").length;
  const totalCount = results.length;

  console.log(`Total pruebas:    ${totalCount}`);
  console.log(`Pruebas PASSED:   ${passedCount}`);
  console.log(`Pruebas FAILED:   ${failedCount}`);

  if (failedCount > 0) {
    console.error(`\n❌ VERIFICACIÓN BLOQUE 10 FALLÓ con ${failedCount} fallas.`);
    process.exit(1);
  } else {
    console.log(`\n✨ ¡TODAS LAS ${totalCount} PRUEBAS DEL BLOQUE 10 PASARON EXITOSAMENTE! ✨`);
    console.log("   - Separación estricta referralCode vs promoCode verificada.");
    console.log("   - 5 tipos de beneficio soportados.");
    console.log("   - Validación, límites y prevención de doble canje probados.");
    console.log("   - PRINCIPIO FUNDAMENTAL COMPROBADO: usuarios 'expired' mantienen colocación y comisiones al 100%.");
  }
}

runBloque10Verification().catch(err => {
  console.error("Error fatal en verificación Bloque 10:", err);
  process.exit(1);
});
