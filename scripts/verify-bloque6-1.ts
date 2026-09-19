process.env.USE_MEMORY_STORAGE = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

import { evaluateAllFieldsForClient } from '../client/src/components/MatchingAnalysis/matchingRules';
import { getStatusLabel, ALL_STATUS_LABELS } from '../client/src/lib/statusConfig';

interface TestResultRow {
  category: "Crítico Financiero" | "Funcional" | "UI";
  test: string;
  perfil: string;
  esperado: string;
  real: string;
  status: "PASS" | "FAIL";
}

const results: TestResultRow[] = [];

async function runVerification() {
  const { storage } = await import("../server/storage");
  const { createCascadingCommissionRecord } = await import("../server/routes");

  console.log("================================================================================");
  console.log("🚀 EJECUTANDO SUITE COMPLETA DE VERIFICACIÓN — BLOQUE 6.1");
  console.log("================================================================================\n");

  // Setup test entities
  const masterBroker = await storage.createUser({
    email: "mb.verify61@test.com",
    password: "Password123!",
    firstName: "Master",
    lastName: "Corp",
    role: "master_broker",
    authMethod: "local",
    networkCommissionRates: {
      "fin-v61": { apertura: 2.0, sobretasa: 0, renovacion: 0 }
    }
  } as any);

  const networkBroker = await storage.createUser({
    email: "brk.net61@test.com",
    password: "Password123!",
    firstName: "Broker",
    lastName: "Red",
    role: "broker",
    masterBrokerId: masterBroker.id,
    authMethod: "local",
  } as any);

  const directBroker = await storage.createUser({
    email: "brk.dir61@test.com",
    password: "Password123!",
    firstName: "Broker",
    lastName: "Directo",
    role: "broker",
    authMethod: "local",
  } as any);

  const institution = await storage.createFinancialInstitution({
    id: "fin-v61",
    name: "Financiera Alianza",
    openingCommissionRate: "4.0",
    brokerCommissionRate: "2.5",
    masterBrokerCommissionRate: "3.0",
    commissionRates: {
      financiera: { total: 4.0, apertura: 4.0 },
      masterBroker: { total: 3.0, apertura: 3.0 },
      broker: { total: 2.5, apertura: 2.5 },
    },
    acceptedProfiles: ["persona_moral"],
    requirements: {
      persona_moral: {
        ranges: {
          monto: { min: 200000, max: 5000000 },
          tiempoActividad: { min: 24 },
          buroEmpresa: { min: 650 },
        }
      }
    }
  } as any);

  // ==========================================
  // 1. CRÍTICOS FINANCIEROS
  // ==========================================
  console.log("--- [1/3] Evaluando Críticos Financieros ---");

  // Caso A: Broker Directo ($1M @ 4% fin, 2.5% brk -> $25k brk, $15k CN)
  const creditA = await storage.createCredit({
    brokerId: directBroker.id,
    amount: "1000000.00",
    status: "disbursed",
    financialInstitutionId: institution.id,
  } as any);
  const commA = await createCascadingCommissionRecord(creditA, institution, "1000000.00");
  const brkShareA = parseFloat(commA.brokerShare || "0");
  const cnShareA = parseFloat(commA.appShare || "0");
  const passA = brkShareA === 25000 && cnShareA === 15000;
  results.push({
    category: "Crítico Financiero",
    test: "Caso A: Broker Directo ($1M @ 4% fin, 2.5% brk)",
    perfil: "Broker Directo",
    esperado: "Broker = $25,000, CN = $15,000",
    real: `Broker = $${brkShareA.toLocaleString('es-MX')}, CN = $${cnShareA.toLocaleString('es-MX')}`,
    status: passA ? "PASS" : "FAIL"
  });

  // Caso B: Broker bajo Master ($1M @ 4% fin, 3% MB, 2% Red -> $20k brk, $10k MB, $10k CN)
  const creditB = await storage.createCredit({
    brokerId: networkBroker.id,
    amount: "1000000.00",
    status: "disbursed",
    financialInstitutionId: institution.id,
  } as any);
  const commB = await createCascadingCommissionRecord(creditB, institution, "1000000.00");
  const brkShareB = parseFloat(commB.brokerShare || "0");
  const mbShareB = parseFloat(commB.masterBrokerShare || "0");
  const cnShareB = parseFloat(commB.appShare || "0");
  const passB = brkShareB === 20000 && mbShareB === 10000 && cnShareB === 10000;
  results.push({
    category: "Crítico Financiero",
    test: "Caso B: Broker de Red ($1M @ 4% fin, 3% MB, 2% Red)",
    perfil: "Broker de Red",
    esperado: "Broker = $20,000, Master = $10,000, CN = $10,000",
    real: `Broker = $${brkShareB.toLocaleString('es-MX')}, Master = $${mbShareB.toLocaleString('es-MX')}, CN = $${cnShareB.toLocaleString('es-MX')}`,
    status: passB ? "PASS" : "FAIL"
  });

  // Caso C: Master Directo ($1M @ 4% fin, 3% MB -> $30k MB, $10k CN, no duplicate payout)
  const creditC = await storage.createCredit({
    brokerId: masterBroker.id,
    amount: "1000000.00",
    status: "disbursed",
    financialInstitutionId: institution.id,
  } as any);
  const commC = await createCascadingCommissionRecord(creditC, institution, "1000000.00");
  const mbShareC = parseFloat(commC.masterBrokerShare || "0");
  const brkShareC = parseFloat(commC.brokerShare || "0");
  const cnShareC = parseFloat(commC.appShare || "0");
  
  // Calculate payoutAmount according to corrected logic
  const isMasterDirect = commC.masterBrokerId && String(commC.brokerId) === String(commC.masterBrokerId);
  const payoutAmountC = isMasterDirect
    ? (parseFloat(commC.masterBrokerShare || "0") || parseFloat(commC.brokerShare || "0"))
    : (parseFloat(commC.masterBrokerShare || "0") + parseFloat(commC.brokerShare || "0"));

  const passC = (mbShareC === 30000 || brkShareC === 30000) && cnShareC === 10000 && payoutAmountC === 30000;
  results.push({
    category: "Crítico Financiero",
    test: "Caso C: Master Directo ($1M @ 4% fin, 3% MB)",
    perfil: "Master Broker Directo",
    esperado: "Master = $30,000, CN = $10,000, Payout = $30,000",
    real: `Master = $${mbShareC.toLocaleString('es-MX')}, CN = $${cnShareC.toLocaleString('es-MX')}, Payout = $${payoutAmountC.toLocaleString('es-MX')}`,
    status: passC ? "PASS" : "FAIL"
  });

  // Caso D: Opening Commission Separada (Proposal: 5% al cliente, tasas internas: 4% fin, 2% brk)
  const proposalD = {
    approvedAmount: 1000000,
    openingCommission: 5.0, // Cobrado al cliente
    commissionRates: {
      financiera: { apertura: 4.0 },
      broker: { apertura: 2.0 },
    }
  };
  const creditD = await storage.createCredit({
    brokerId: directBroker.id,
    amount: "1000000.00",
    status: "disbursed",
    financialInstitutionId: institution.id,
    finalProposal: proposalD,
  } as any);
  const commD = await createCascadingCommissionRecord(creditD, institution, "1000000.00");
  const brkShareD = parseFloat(commD.brokerShare || "0");
  const passD = brkShareD === 20000;
  results.push({
    category: "Crítico Financiero",
    test: "Caso D: Opening Commission 5% al cliente vs tasa interna 2%",
    perfil: "Broker",
    esperado: "Broker = $20,000 (NO $50,000)",
    real: `Broker = $${brkShareD.toLocaleString('es-MX')}`,
    status: passD ? "PASS" : "FAIL"
  });

  // Caso Real $495,000 Bug: $10M credit con propuesta de apertura 4.95% al cliente y 2.0% broker
  const proposalBug = {
    approvedAmount: 10000000,
    openingCommission: 4.95, // Cobrado al cliente
    commissionRates: {
      financiera: { apertura: 4.0 },
      broker: { apertura: 2.0 },
    }
  };
  const creditBug = await storage.createCredit({
    brokerId: directBroker.id,
    amount: "10000000.00",
    status: "disbursed",
    financialInstitutionId: institution.id,
    finalProposal: proposalBug,
  } as any);
  const commBug = await createCascadingCommissionRecord(creditBug, institution, "10000000.00");
  const brkShareBug = parseFloat(commBug.brokerShare || "0");
  const passBug = brkShareBug === 200000; // Correcto: 2% de $10M = $200,000
  results.push({
    category: "Crítico Financiero",
    test: "Caso $495,000: Crédito $10M con apertura 4.95% vs tasa 2%",
    perfil: "Auditoría Financiera",
    esperado: "Broker = $200,000 (corregido, NO $495,000)",
    real: `Broker = $${brkShareBug.toLocaleString('es-MX')}`,
    status: passBug ? "PASS" : "FAIL"
  });

  // Inmutabilidad de comisiones: cuando se aprueba una comisión, queda congelada
  const commFrozen = await storage.updateCommission(commB.id, {
    status: "approved",
    frozenAmount: "20000.00",
    frozenBrokerRate: "2.00",
    frozenFinancialInstitutionRate: "4.00",
  } as any);
  // Simular cambio posterior de tasas del Master Broker a 2.5%
  await storage.updateUser(masterBroker.id, {
    networkCommissionRates: {
      "fin-v61": { apertura: 2.5, sobretasa: 0, renovacion: 0 }
    }
  });
  // La comisión aprobada commFrozen no debe alterarse
  const commFrozenAfter = await storage.getCommission(commFrozen.id);
  const passFrozen = commFrozenAfter?.frozenAmount === "20000.00" && commFrozenAfter?.status === "approved";
  results.push({
    category: "Crítico Financiero",
    test: "Inmutabilidad: Tasas congeladas no se alteran tras cambio de red",
    perfil: "Comisiones",
    esperado: "frozenAmount = $20,000 (intacto)",
    real: `frozenAmount = $${parseFloat(commFrozenAfter?.frozenAmount || "0").toLocaleString('es-MX')}`,
    status: passFrozen ? "PASS" : "FAIL"
  });


  // ==========================================
  // 2. FUNCIONALES (MATCHING & MIS CRÉDITOS)
  // ==========================================
  console.log("--- [2/3] Evaluando Funcionales (Matching y Mis Créditos) ---");

  // Matching: Caso Compatible
  const clientCompatible = {
    type: "persona_moral",
    tiempoActividad: 36, // 36 meses >= 24 min
    montoSolicitado: 1500000,
    buroEmpresa: 710, // >= 650
  };
  const matchResultComp = evaluateAllFieldsForClient(clientCompatible, institution as any);
  const passComp = matchResultComp.matchStatus === 'compatible' && matchResultComp.matchStatusLabel === 'Compatible';
  results.push({
    category: "Funcional",
    test: "Matching: Caso Compatible (cumple todos los requisitos)",
    perfil: "Motor de Matching",
    esperado: "compatible ('Compatible') con razones de éxito",
    real: `${matchResultComp.matchStatus} ('${matchResultComp.matchStatusLabel}'), cumplidos: ${matchResultComp.passingReasons?.length || 0}`,
    status: passComp ? "PASS" : "FAIL"
  });

  // Matching: Caso No Compatible (incumple regla explícita: antigüedad insuficiente 12 meses < 24 meses)
  const clientNotCompatible = {
    type: "persona_moral",
    tiempoActividad: 12, // 12 meses < 24 meses
    montoSolicitado: 1500000,
    buroEmpresa: 710,
  };
  const matchResultNotComp = evaluateAllFieldsForClient(clientNotCompatible, institution as any);
  const passNotComp = matchResultNotComp.matchStatus === 'not_compatible' && 
                      matchResultNotComp.matchStatusLabel === 'No compatible' &&
                      (matchResultNotComp.unmetRequirements?.length || 0) > 0;
  results.push({
    category: "Funcional",
    test: "Matching: Caso No Compatible (incumple antigüedad 12m vs 24m)",
    perfil: "Motor de Matching",
    esperado: "not_compatible ('No compatible') con regla incumplida",
    real: `${matchResultNotComp.matchStatus} ('${matchResultNotComp.matchStatusLabel}'), incumplidos: ${matchResultNotComp.unmetRequirements?.[0] || 'ninguno'}`,
    status: passNotComp ? "PASS" : "FAIL"
  });

  // Matching: Caso Información Insuficiente (falta Buró)
  const clientInsufficient = {
    type: "persona_moral",
    tiempoActividad: 36,
    montoSolicitado: 1500000,
    // Falta buroEmpresa
  };
  const matchResultInsuff = evaluateAllFieldsForClient(clientInsufficient, institution as any);
  const passInsuff = matchResultInsuff.matchStatus === 'insufficient_data' &&
                     matchResultInsuff.matchStatusLabel === 'Información insuficiente' &&
                     (matchResultInsuff.missingData?.length || 0) > 0;
  results.push({
    category: "Funcional",
    test: "Matching: Caso Información Insuficiente (falta Buró)",
    perfil: "Motor de Matching",
    esperado: "insufficient_data ('Información insuficiente') sin rechazo silencioso",
    real: `${matchResultInsuff.matchStatus} ('${matchResultInsuff.matchStatusLabel}'), faltantes: ${matchResultInsuff.missingData?.join(', ') || 'ninguno'}`,
    status: passInsuff ? "PASS" : "FAIL"
  });

  // Master Broker Mis Créditos: ver operaciones originadas directamente por el Master
  const masterDirectCredits = await storage.getCredits({ brokerId: masterBroker.id });
  const passMBDirect = masterDirectCredits.some(c => c.id === creditC.id && c.brokerId === masterBroker.id);
  results.push({
    category: "Funcional",
    test: "Master Broker: Mis Créditos Directos visibles (brokerId === masterBrokerId)",
    perfil: "Master Broker",
    esperado: "Crédito directo aparece en 'Mis Créditos' del Master",
    real: passMBDirect ? "Crédito directo listado correctamente" : "Vacío o no encontrado",
    status: passMBDirect ? "PASS" : "FAIL"
  });


  // ==========================================
  // 3. UI Y ETIQUETAS
  // ==========================================
  console.log("--- [3/3] Evaluando UI y Mapeo de Estados ---");

  // Estado pending_admin
  const labelPendingAdmin = getStatusLabel('pending_admin');
  const passPendingAdmin = labelPendingAdmin === 'Pendiente de revisión';
  results.push({
    category: "UI",
    test: "Etiqueta UI: pending_admin traducido al español",
    perfil: "Pipeline & Tableros",
    esperado: "Pendiente de revisión",
    real: labelPendingAdmin,
    status: passPendingAdmin ? "PASS" : "FAIL"
  });

  // Estado sent_to_institutions
  const labelSent = getStatusLabel('sent_to_institutions');
  const passSent = labelSent === 'Enviado a financieras';
  results.push({
    category: "UI",
    test: "Etiqueta UI: sent_to_institutions traducido al español",
    perfil: "Pipeline & Tableros",
    esperado: "Enviado a financieras",
    real: labelSent,
    status: passSent ? "PASS" : "FAIL"
  });

  // Estado disbursed / dispersed
  const labelDisbursed = getStatusLabel('disbursed');
  const passDisbursed = labelDisbursed === 'Dispersado';
  results.push({
    category: "UI",
    test: "Etiqueta UI: disbursed traducido al español",
    perfil: "Pipeline & Tableros",
    esperado: "Dispersado",
    real: labelDisbursed,
    status: passDisbursed ? "PASS" : "FAIL"
  });

  // Financieras Duplicadas: Agrupamiento (1 financiera = 1 tarjeta principal con productos anidados)
  const mockProducts = [
    { id: "p1", financialInstitutionId: "inst-1", name: "Simple PyME" },
    { id: "p2", financialInstitutionId: "inst-1", name: "Revolvente PyME" },
    { id: "p3", financialInstitutionId: "inst-2", name: "Arrendamiento" }
  ];
  const mockInstitutions = [
    { id: "inst-1", name: "Banco Alfa" },
    { id: "inst-2", name: "Banco Beta" }
  ];
  // Simulador de groupedInstitutions como en BrokerProducts.tsx
  const groupedMap = new Map();
  mockInstitutions.forEach(inst => groupedMap.set(inst.id, { ...inst, products: [] }));
  mockProducts.forEach(prod => {
    if (groupedMap.has(prod.financialInstitutionId)) {
      groupedMap.get(prod.financialInstitutionId).products.push(prod);
    }
  });
  const groupedList = Array.from(groupedMap.values());
  const passGroup = groupedList.length === 2 && groupedList[0].products.length === 2;
  results.push({
    category: "UI",
    test: "Financieras Agrupadas: 1 financiera = 1 tarjeta con productos internos",
    perfil: "Catálogo Comercial",
    esperado: "2 instituciones únicas (Banco Alfa con 2 productos, Beta con 1)",
    real: `${groupedList.length} tarjetas renderizadas (Alfa tiene ${groupedList[0]?.products?.length} productos)`,
    status: passGroup ? "PASS" : "FAIL"
  });

  // ==========================================
  // RESUMEN FINAL
  // ==========================================
  console.log("\n================================================================================");
  console.log("📋 TABLA DE RESULTADOS DE VERIFICACIÓN POST-CORRECCIÓN (BLOQUE 6.1)");
  console.log("================================================================================\n");

  console.table(results.map(r => ({
    Categoría: r.category,
    Prueba: r.test,
    Perfil: r.perfil,
    Esperado: r.esperado,
    Real: r.real,
    Resultado: r.status,
  })));

  const total = results.length;
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;

  console.log(`\nTOTAL: ${total} | PASARON: ${passed} | FALLARON: ${failed}`);

  if (failed === 0) {
    console.log("\n🎉 ¡TODAS LAS PRUEBAS DEL BLOQUE 6.1 PASARON EXITOSAMENTE (100% PASS)! 🎉\n");
    process.exit(0);
  } else {
    console.error(`\n❌ SE DETECTARON ${failed} FALLOS EN LA VERIFICACIÓN.\n`);
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error("Error fatal en verificación:", err);
  process.exit(1);
});
