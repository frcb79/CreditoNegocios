process.env.USE_MEMORY_STORAGE = "true";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

import { evaluateAllFieldsForClient } from '../client/src/components/MatchingAnalysis/matchingRules';
import { submissionStatusConfig, targetStatusConfig, creditStatusConfig } from '../client/src/lib/statusConfig';

interface BaselineRow {
  category: "Crítico Financiero" | "Funcional" | "UI";
  test: string;
  perfil: string;
  esperado: string;
  real: string;
  status: "PASS" | "FAIL";
}

const baselineResults: BaselineRow[] = [];

async function runBaseline() {
  const { storage } = await import("../server/storage");
  const { createCascadingCommissionRecord } = await import("../server/routes");

  console.log("================================================================================");
  console.log("📊 EJECUTANDO EVALUACIÓN DE LÍNEA BASE (BASELINE) — BLOQUE 6.1");
  console.log("================================================================================\n");

  // Setup entities
  const masterBroker = await storage.createUser({
    email: "mb.baseline@test.com",
    password: "Password123!",
    firstName: "Master",
    lastName: "Corp",
    role: "master_broker",
    authMethod: "local",
    networkCommissionRates: {
      "fin-baseline": { apertura: 2.0, sobretasa: 0, renovacion: 0 }
    }
  } as any);

  const networkBroker = await storage.createUser({
    email: "brk.network@test.com",
    password: "Password123!",
    firstName: "Broker",
    lastName: "Red",
    role: "broker",
    masterBrokerId: masterBroker.id,
    authMethod: "local",
  } as any);

  const directBroker = await storage.createUser({
    email: "brk.direct@test.com",
    password: "Password123!",
    firstName: "Broker",
    lastName: "Directo",
    role: "broker",
    authMethod: "local",
  } as any);

  const institution = await storage.createFinancialInstitution({
    id: "fin-baseline",
    name: "Financiera Baseline",
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

  // --- 1. CRÍTICOS FINANCIEROS ---
  console.log("Evaluando 1. Críticos Financieros...");

  // Caso A: Broker Directo ($1M, 4% fin, 2.5% brk -> $25k brk, $15k CN)
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
  baselineResults.push({
    category: "Crítico Financiero",
    test: "Caso A: Broker Directo ($1M @ 4% fin, 2.5% brk)",
    perfil: "Broker Directo",
    esperado: "Broker = $25,000, CN = $15,000",
    real: `Broker = $${brkShareA}, CN = $${cnShareA}`,
    status: passA ? "PASS" : "FAIL"
  });

  // Caso B: Broker bajo Master ($1M, 4% fin, 3% MB, 2% brk red -> $20k brk, $10k MB, $10k CN)
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
  baselineResults.push({
    category: "Crítico Financiero",
    test: "Caso B: Broker bajo Master ($1M @ 4% fin, 3% MB, 2% red)",
    perfil: "Broker Red",
    esperado: "Broker = $20,000, Master = $10,000, CN = $10,000",
    real: `Broker = $${brkShareB}, Master = $${mbShareB}, CN = $${cnShareB}`,
    status: passB ? "PASS" : "FAIL"
  });

  // Caso C: Master Directo ($1M, 4% fin, 3% MB -> $30k MB, $10k CN, sin duplicación)
  const creditC = await storage.createCredit({
    brokerId: masterBroker.id,
    amount: "1000000.00",
    status: "disbursed",
    financialInstitutionId: institution.id,
  } as any);
  const commC = await createCascadingCommissionRecord(creditC, institution, "1000000.00");
  const mbShareC = parseFloat(commC.masterBrokerShare || "0");
  const cnShareC = parseFloat(commC.appShare || "0");
  // Check if payout calculation would duplicate brokerShare + masterBrokerShare
  const isMbC = commC.masterBrokerId && parseFloat(commC.masterBrokerShare || '0') > 0;
  const legacyPayoutC = (parseFloat(commC.brokerShare || '0') + parseFloat(commC.masterBrokerShare || '0'));
  const passC = mbShareC === 30000 && cnShareC === 10000 && legacyPayoutC <= 30000;
  baselineResults.push({
    category: "Crítico Financiero",
    test: "Caso C: Master Directo ($1M @ 4% fin, 3% MB sin duplicación)",
    perfil: "Master Broker",
    esperado: "Master = $30,000, CN = $10,000 (Payout total: $30,000)",
    real: `Master = $${mbShareC}, CN = $${cnShareC} (Payout Option B: $${legacyPayoutC})`,
    status: passC ? "PASS" : "FAIL"
  });

  // Caso D: Opening Commission diferente (Oferta 5% apertura cliente, fin->CN 4%, CN->Broker 2%)
  // Simulating the actual mark-dispersed logic at line 6904
  const proposalD = { openingCommission: 5.0, approvedAmount: 1000000 };
  const candidateBrokerRateD = parseFloat(
    (proposalD as any)?.openingCommission ||
    (institution as any)?.commissionRates?.broker?.apertura ||
    '0'
  );
  const passD = candidateBrokerRateD === 2.0; // Expected to be 2.0% (not 5.0%)
  baselineResults.push({
    category: "Crítico Financiero",
    test: "Caso D: Opening Commission cliente (5%) vs Tasa Broker (2%)",
    perfil: "Todos los perfiles",
    esperado: "Tasa interna broker = 2.0% (Comisión = $20,000)",
    real: `Tasa calculada = ${candidateBrokerRateD}% (Comisión = $${1000000 * candidateBrokerRateD / 100})`,
    status: passD ? "PASS" : "FAIL"
  });

  // Caso F: Origen del bug $495,000
  // When credit is $10M and proposal opening commission is 4.95%
  const creditAmountBug = 10000000;
  const openingCommBug = 4.95;
  const bugCalculated = (creditAmountBug * openingCommBug) / 100;
  const bugExpected = (creditAmountBug * 2.0) / 100; // 2% internal rate = $200k
  baselineResults.push({
    category: "Crítico Financiero",
    test: "Caso F: Bug $495,000 por uso de openingCommission cliente (4.95% en $10M)",
    perfil: "Master Broker",
    esperado: "Comisión neta pactada: $200,000 (tasa interna)",
    real: `Monto anómalo generado: $${bugCalculated.toLocaleString('es-MX')}`,
    status: "FAIL"
  });

  // --- 2. FUNCIONALES ---
  console.log("Evaluando 2. Funcionales...");

  // Matching: Caso Compatible
  const clientComp = {
    type: "persona_moral",
    montoSolicitado: 1000000,
    antiguedadLaboral: "3 años",
    yearsInBusiness: 3,
    buroEmpresa: 700,
  };
  const matchComp = evaluateAllFieldsForClient(clientComp, institution, 1000000);
  const passMatchComp = matchComp.category === "recommended" || matchComp.category === "compatible";
  baselineResults.push({
    category: "Funcional",
    test: "Matching: Cliente que cumple todos los requisitos conocidos",
    perfil: "Persona Moral",
    esperado: "Categoría 'compatible' o 'recommended' con motivos positivos",
    real: `Categoría actual: '${matchComp.category}' (Score: ${matchComp.score}%)`,
    status: passMatchComp ? "PASS" : "FAIL"
  });

  // Matching: Caso No Compatible (incumple regla explícita: 12 meses cuando se requieren 24)
  const clientIncomp = {
    type: "persona_moral",
    montoSolicitado: 1000000,
    antiguedadLaboral: "1 año",
    yearsInBusiness: 1,
    buroEmpresa: 700,
  };
  const matchIncomp = evaluateAllFieldsForClient(clientIncomp, institution, 1000000);
  const passMatchIncomp = matchIncomp.category === "other" && matchIncomp.warnings.some(w => w.toLowerCase().includes("antigüedad") || w.toLowerCase().includes("actividad"));
  baselineResults.push({
    category: "Funcional",
    test: "Matching: Cliente que incumple regla explícita (antigüedad de 12 meses vs 24)",
    perfil: "Persona Moral",
    esperado: "Categoría 'other' / no compatible explicando regla incumplida",
    real: `Categoría actual: '${matchIncomp.category}' con warnings: ${matchIncomp.warnings.join('; ') || 'ninguno'}`,
    status: passMatchIncomp ? "PASS" : "FAIL"
  });

  // Matching: Caso Información Insuficiente (faltan buró o estados financieros)
  const clientInsuf = {
    type: "persona_moral",
    montoSolicitado: 1000000,
    // No tenure, no buro provided
  };
  const matchInsuf = evaluateAllFieldsForClient(clientInsuf, institution, 1000000);
  // Currently, missing data gives 'warning' and tanks score to 30%, classifying as 'other' silently
  const passMatchInsuf = (matchInsuf as any).insufficientData === true || matchInsuf.warnings.some(w => w.includes("Información insuficiente"));
  baselineResults.push({
    category: "Funcional",
    test: "Matching: Cliente con Información Insuficiente (no debe rechazar silenciosamente)",
    perfil: "Persona Moral",
    esperado: "Estado explícito 'Información insuficiente' indicando qué campos faltan",
    real: `Categoría actual: '${matchInsuf.category}' (Score castigado a ${matchInsuf.score}%)`,
    status: passMatchInsuf ? "PASS" : "FAIL"
  });

  // Master Broker: "Mis Créditos" - Visibilidad de créditos no dispersados
  // In MySubmissions.tsx line 94: `const isDispersed = credit.status === 'dispersed' || credit.status === 'disbursed';`
  const creditInProgress = await storage.createCredit({
    brokerId: masterBroker.id,
    amount: "500000.00",
    status: "in_progress", // Not yet dispersed
  } as any);
  // Check if current filter logic allows it
  const filterAllowsInProgress = (creditInProgress.status === 'dispersed' || creditInProgress.status === 'disbursed');
  baselineResults.push({
    category: "Funcional",
    test: "Master Broker: Visibilidad de créditos directos propios en trámite ('Mis Créditos')",
    perfil: "Master Broker",
    esperado: "Crédito propio en estatus 'in_progress' visible en Mis Créditos",
    real: filterAllowsInProgress ? "Visible" : "Oculto/Filtrado (solo se muestran 'dispersed')",
    status: filterAllowsInProgress ? "PASS" : "FAIL"
  });

  // --- 3. UI ---
  console.log("Evaluando 3. UI...");

  // Estados técnicos en inglés: pending_admin
  const labelPendingAdmin = (submissionStatusConfig as any)["pending_admin"]?.label;
  const passPendingAdmin = labelPendingAdmin === "Pendiente de revisión";
  baselineResults.push({
    category: "UI",
    test: "Traducción de estados: 'pending_admin'",
    perfil: "Super Admin / Broker",
    esperado: "Etiqueta UI: 'Pendiente de revisión'",
    real: `Etiqueta actual: '${labelPendingAdmin}'`,
    status: passPendingAdmin ? "PASS" : "FAIL"
  });

  // Estados técnicos en inglés: sent_to_institutions
  const labelSentToInst = (submissionStatusConfig as any)["sent_to_institutions"]?.label;
  const passSentToInst = labelSentToInst === "Enviado a financieras";
  baselineResults.push({
    category: "UI",
    test: "Traducción de estados: 'sent_to_institutions'",
    perfil: "Super Admin / Broker",
    esperado: "Etiqueta UI: 'Enviado a financieras'",
    real: `Etiqueta actual: '${labelSentToInst}'`,
    status: passSentToInst ? "PASS" : "FAIL"
  });

  // Financieras duplicadas en UI
  // BrokerProducts.tsx renders 1 card per product (Kapital x2, Aspiria x2, Cualli x2)
  baselineResults.push({
    category: "UI",
    test: "Catálogo de Financieras: 1 financiera = 1 tarjeta principal",
    perfil: "Broker / Master",
    esperado: "1 tarjeta principal por financiera con sus productos agrupados dentro",
    real: "Tarjetas duplicadas en UI por cada institución_product (e.g. Kapital x2, Aspiria x2)",
    status: "FAIL"
  });

  // Historial de movimientos: presentación humana vs volcado JSON
  baselineResults.push({
    category: "UI",
    test: "Auditoría de Comisiones: 'Historial de movimientos' entendible sin JSON",
    perfil: "Super Admin",
    esperado: "Timeline visual claro con actor, transición y detalles sin volcado JSON",
    real: "Modal técnico 'Bitácora de Auditoría' con JSON.stringify crudo",
    status: "FAIL"
  });

  console.log("\n================================================================================");
  console.log("📋 REPORTE BASELINE OFICIAL — BLOQUE 6.1");
  console.log("================================================================================\n");

  console.log("| Categoría | Test | Perfil | Esperado | Real | PASS/FAIL |");
  console.log("|---|---|---|---|---|:---:|");
  baselineResults.forEach(r => {
    console.log(`| ${r.category} | ${r.test} | ${r.perfil} | ${r.esperado} | ${r.real} | **${r.status}** |`);
  });

  const total = baselineResults.length;
  const fails = baselineResults.filter(r => r.status === "FAIL").length;
  const passes = total - fails;
  console.log(`\nResumen Baseline: ${passes}/${total} pruebas pasaron (${fails} fallas detectadas en baseline).\n`);
}

runBaseline().catch(console.error);
