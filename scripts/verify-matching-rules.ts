import {
  evaluateProfileType,
  evaluateMonto,
  evaluateBuroScore,
  evaluateBuroSinSat,
  evaluateIncomeExpense,
  evaluateTenure,
  evaluateAge,
  evaluateGovSales,
  formatGovThresholdRequirement,
  evaluateOpinionCumplimiento,
  evaluateGarantia,
  evaluateIngresoAnual,
  evaluateTerminalVentas,
  evaluateAtrasos,
  evaluateAval,
  evaluateSatCiec,
  evaluateEstadosFinancieros,
  evaluateCreditosVigentes,
  evaluateAllFieldsForClient
} from '../client/src/components/MatchingAnalysis/matchingRules';

console.log('====================================================');
console.log('  TEST SUITE COMPLETO: EVALUACIÓN DE TODOS LOS CAMPOS');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, details?: any) {
  if (condition) {
    console.log(`✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${description}`, details);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. TIPO DE PERFIL (Accepted Profiles)
// ─────────────────────────────────────────────────────────────
console.log('\n--- 1. TIPO DE PERFIL ---');
const p1 = evaluateProfileType('persona_moral', ['persona_moral', 'fisica_empresarial']);
assert('Persona Moral en lista admitida -> PASS', p1.status === 'pass');

const p2 = evaluateProfileType('sin_sat', ['persona_moral', 'fisica_empresarial']);
assert('Sin SAT en lista que solo admite Moral/PFAE -> FAIL', p2.status === 'fail');

const p3 = evaluateProfileType('fisica', []);
assert('Sin restricción de perfiles -> PASS', p3.status === 'pass');

// ─────────────────────────────────────────────────────────────
// 2. MONTO SOLICITADO
// ─────────────────────────────────────────────────────────────
console.log('\n--- 2. MONTO SOLICITADO ---');
const m1 = evaluateMonto(500000, { min: 100000, max: 1000000 });
assert('Monto 500k dentro de rango 100k-1M -> PASS', m1.status === 'pass');

const m2 = evaluateMonto('$1,500,000.00', { min: 100000, max: 1000000 });
assert('Monto string "$1,500,000.00" por encima de 1M -> FAIL', m2.status === 'fail');

const m3 = evaluateMonto('50000', { min: 100000, max: 1000000 });
assert('Monto 50k por debajo de 100k -> FAIL', m3.status === 'fail');

const m4 = evaluateMonto(null, { min: 100000 });
assert('Monto no proporcionado -> WARNING', m4.status === 'warning');

// ─────────────────────────────────────────────────────────────
// 3. BURÓ DE CRÉDITO (PF, Accionista, Empresa, Sin SAT)
// ─────────────────────────────────────────────────────────────
console.log('\n--- 3. BURÓ DE CRÉDITO ---');
const b1 = evaluateBuroScore('buroPersonaFisica', 'alto-694-760', 650);
assert('Buró PF "alto-694-760" con mínimo 650 -> PASS', b1.status === 'pass');

const b2 = evaluateBuroScore('buroPersonaFisica', 'malo-456-489', 650);
assert('Buró PF "malo-456-489" con mínimo 650 -> FAIL', b2.status === 'fail');

const b3 = evaluateBuroScore('buroPersonaFisica', '680', 650);
assert('Buró PF numérico "680" con mínimo 650 -> PASS', b3.status === 'pass');

const b4 = evaluateBuroScore('buroEmpresa', 'alto-310-400', 300);
assert('Buró Empresa "alto-310-400" con mínimo 300 -> PASS', b4.status === 'pass');

const b5 = evaluateBuroScore('buroEmpresa', 'malo-100-219', 250);
assert('Buró Empresa "malo-100-219" con mínimo 250 -> FAIL', b5.status === 'fail');

const bSinSat1 = evaluateBuroSinSat('si', { required: 'si' });
assert('Buró Sin SAT cliente con buró cuando es requerido -> PASS', bSinSat1.status === 'pass');

const bSinSat2 = evaluateBuroSinSat('no', { required: 'si' });
assert('Buró Sin SAT cliente sin buró cuando es requerido -> FAIL', bSinSat2.status === 'fail');

// ─────────────────────────────────────────────────────────────
// 4. INGRESOS Y EGRESOS (8 Campos Financieros)
// ─────────────────────────────────────────────────────────────
console.log('\n--- 4. INGRESOS Y EGRESOS (8 CAMPOS) ---');
const financialFields = [
  'ingresoMensualPromedio',
  'ingresoMensualPromedioComprobables',
  'ingresoMensualPromedioNoComprobables',
  'ingresoMensualPromedioComprobablesSinSat',
  'ingresoMensualPromedioNoComprobablesSinSat',
  'gastosFijosMensualesPromedio',
  'gastosFijosMensualesPromedioSinSat',
  'egresoMensualPromedio'
];

financialFields.forEach(f => {
  const resPass = evaluateIncomeExpense(f, 85000, { min: 50000 });
  assert(`${f}: 85,000 con min 50,000 -> PASS`, resPass.status === 'pass');

  const resFail = evaluateIncomeExpense(f, '$30,000', { min: 50000 });
  assert(`${f}: "$30,000" con min 50,000 -> FAIL`, resFail.status === 'fail');

  const resMaxPass = evaluateIncomeExpense(f, 40000, { max: 60000 });
  assert(`${f}: 40,000 con max 60,000 -> PASS`, resMaxPass.status === 'pass');

  const resMaxFail = evaluateIncomeExpense(f, 75000, { max: 60000 });
  assert(`${f}: 75,000 con max 60,000 -> FAIL`, resMaxFail.status === 'fail');
});

// ─────────────────────────────────────────────────────────────
// 5. ANTIGÜEDAD LABORAL / TIEMPO DE ACTIVIDAD
// ─────────────────────────────────────────────────────────────
console.log('\n--- 5. ANTIGÜEDAD Y TIEMPO DE ACTIVIDAD ---');
const t1 = evaluateTenure('antiguedadLaboral', '2-5', { min: 12 });
assert('Antigüedad "2-5" (24-60 meses) con mínimo 12 meses -> PASS', t1.status === 'pass');

const t2 = evaluateTenure('antiguedadLaboral', 'menos-1', { min: 24 });
assert('Antigüedad "menos-1" (<12 meses) con mínimo 24 meses -> FAIL', t2.status === 'fail');

const t3 = evaluateTenure('tiempoActividad', '3 años', { min: 24 });
assert('Tiempo Actividad "3 años" (36 meses) con mínimo 24 meses -> PASS', t3.status === 'pass');

const t4 = evaluateTenure('antiguedadLaboral', 36, { min: 12 });
assert('Antigüedad número directo 36 meses con mínimo 12 -> PASS', t4.status === 'pass');

// ─────────────────────────────────────────────────────────────
// 6. EDAD DEL CLIENTE
// ─────────────────────────────────────────────────────────────
console.log('\n--- 6. EDAD DEL CLIENTE ---');
const a1 = evaluateAge(35, { min: 21, max: 65 });
assert('Edad 35 en rango 21-65 -> PASS', a1.status === 'pass');

const a2 = evaluateAge('19', { min: 21, max: 65 });
assert('Edad "19" menor que mínimo 21 -> FAIL', a2.status === 'fail');

const a3 = evaluateAge(70, { min: 21, max: 65 });
assert('Edad 70 mayor que máximo 65 -> FAIL', a3.status === 'fail');

// ─────────────────────────────────────────────────────────────
// 7. PARTICIPACIÓN EN VENTAS CON GOBIERNO
// ─────────────────────────────────────────────────────────────
console.log('\n--- 7. VENTAS CON GOBIERNO ---');
const g1 = evaluateGovSales('0', 'menor-20');
assert('Gobierno "0" con umbral "menor-20" -> PASS', g1.status === 'pass');

const g2 = evaluateGovSales('0%', 'menor-20');
assert('Gobierno "0%" con umbral "menor-20" -> PASS', g2.status === 'pass');

const g3 = evaluateGovSales('11-20', 'menor-20');
assert('Gobierno "11-20" con umbral "menor-20" -> PASS', g3.status === 'pass');

const g4 = evaluateGovSales('21-40', 'menor-20');
assert('Gobierno "21-40" con umbral "menor-20" -> FAIL', g4.status === 'fail');

const g5 = evaluateGovSales('15%', 'menor-20');
assert('Gobierno porcentaje numérico "15%" con umbral "menor-20" -> PASS', g5.status === 'pass');

const gLabel = formatGovThresholdRequirement('menor-20');
assert('Etiqueta formatGovThresholdRequirement("menor-20") no repite "Máximo"', gLabel === 'Menor a 20%');

// ─────────────────────────────────────────────────────────────
// 8. OPINIÓN DE CUMPLIMIENTO SAT
// ─────────────────────────────────────────────────────────────
console.log('\n--- 8. OPINIÓN DE CUMPLIMIENTO ---');
const op1 = evaluateOpinionCumplimiento('positiva', { acceptanceMode: 'solo-positiva' });
assert('Opinión "positiva" con modo "solo-positiva" -> PASS', op1.status === 'pass');

const op2 = evaluateOpinionCumplimiento('negativa', { acceptanceMode: 'solo-positiva' });
assert('Opinión "negativa" con modo "solo-positiva" -> FAIL', op2.status === 'fail');

const op3 = evaluateOpinionCumplimiento('negativa', { acceptanceMode: 'positiva-y-negativa' });
assert('Opinión "negativa" con modo "positiva-y-negativa" -> PASS', op3.status === 'pass');

// ─────────────────────────────────────────────────────────────
// 9. GARANTÍAS Y MULTIPLICADORES
// ─────────────────────────────────────────────────────────────
console.log('\n--- 9. GARANTÍAS Y MULTIPLICADORES ---');
const garMultipliers = { 'prendaria': '1.5x', 'hipotecaria': '2.0x' };

const gar1 = evaluateGarantia('garantia', 'hipotecaria', { guaranteeMultipliers: garMultipliers });
assert('Garantía "hipotecaria" aceptada con factor 2.0x -> PASS', gar1.status === 'pass');

const gar2 = evaluateGarantia('garantia', 'sin-garantia', { guaranteeMultipliers: garMultipliers });
assert('Garantía "sin-garantia" cuando se requiere respaldo -> FAIL', gar2.status === 'fail');

const gar3 = evaluateGarantia('garantia', 'sin-garantia', { guaranteeMultipliers: {} });
assert('Garantía "sin-garantia" cuando institución no exige garantía -> PASS', gar3.status === 'pass');

const gar4 = evaluateGarantia('garantia', { tipo: 'hipotecaria' }, { guaranteeMultipliers: garMultipliers });
assert('Garantía pasada como objeto { tipo: "hipotecaria" } -> PASS', gar4.status === 'pass');

// ─────────────────────────────────────────────────────────────
// 10. INGRESO ANUAL
// ─────────────────────────────────────────────────────────────
console.log('\n--- 10. INGRESO ANUAL ---');
const ia1 = evaluateIngresoAnual('1000000-2500000', { min: '500000-1000000' });
assert('Ingreso anual "1000000-2500000" supera min "500000-1000000" -> PASS', ia1.status === 'pass');

const ia2 = evaluateIngresoAnual('100000-250000', { min: '500000-1000000' });
assert('Ingreso anual "100000-250000" debajo de min "500000-1000000" -> FAIL', ia2.status === 'fail');

const ia3 = evaluateIngresoAnual(1500000, { min: '500000-1000000' });
assert('Ingreso anual monto numérico 1,500,000 con min "500000-1000000" -> PASS', ia3.status === 'pass');

// ─────────────────────────────────────────────────────────────
// 11. VENTAS CON TERMINAL BANCARIA
// ─────────────────────────────────────────────────────────────
console.log('\n--- 11. VENTAS CON TERMINAL BANCARIA ---');
const tb1 = evaluateTerminalVentas('50000-100000', { min: '30000-50000' });
assert('Terminal "50000-100000" supera min "30000-50000" -> PASS', tb1.status === 'pass');

const tb2 = evaluateTerminalVentas('no', { min: '30000-50000' });
assert('Terminal "no" no cumple min "30000-50000" -> FAIL', tb2.status === 'fail');

const tb3 = evaluateTerminalVentas(75000, { min: '30000-50000' });
assert('Terminal numérico 75,000 cumple min "30000-50000" -> PASS', tb3.status === 'pass');

// ─────────────────────────────────────────────────────────────
// 12. ATRASOS Y DEUDAS EN BURÓ
// ─────────────────────────────────────────────────────────────
console.log('\n--- 12. ATRASOS Y DEUDAS EN BURÓ ---');
const at1 = evaluateAtrasos('atrasosDeudas', 'no', { required: 'no' });
assert('Cliente sin atrasos ("no") -> PASS', at1.status === 'pass');

const at2 = evaluateAtrasos('atrasosDeudas', 'si', { required: 'no' });
assert('Cliente con atrasos ("si") sin límite cuando se prohíben -> FAIL', at2.status === 'fail');

const at3 = evaluateAtrasos('atrasosDeudas', 15000, { max: 20000 });
assert('Atrasos $15,000 dentro de tolerancia max $20,000 -> PASS', at3.status === 'pass');

const at4 = evaluateAtrasos('atrasosDeudas', 35000, { max: 20000 });
assert('Atrasos $35,000 superan tolerancia max $20,000 -> FAIL', at4.status === 'fail');

// ─────────────────────────────────────────────────────────────
// 13. AVAL U OBLIGADO SOLIDARIO
// ─────────────────────────────────────────────────────────────
console.log('\n--- 13. AVAL U OBLIGADO SOLIDARIO ---');
const av1 = evaluateAval('avalObligadoSolidario', 'si', { required: 'si' });
assert('Aval disponible ("si") cuando es requerido -> PASS', av1.status === 'pass');

const av2 = evaluateAval('avalObligadoSolidario', 'no', { required: 'si' });
assert('Aval no disponible ("no") cuando es requerido -> FAIL', av2.status === 'fail');

const av3 = evaluateAval('avalObligadoSolidario', 'no', { required: 'no' });
assert('Aval no disponible ("no") cuando no es requerido -> PASS', av3.status === 'pass');

// ─────────────────────────────────────────────────────────────
// 14. CONEXIÓN SAT (CIEC)
// ─────────────────────────────────────────────────────────────
console.log('\n--- 14. CONEXIÓN SAT (CIEC) ---');
const sat1 = evaluateSatCiec('si', { required: 'si' });
assert('SAT CIEC acepta conexión -> PASS', sat1.status === 'pass');

const sat2 = evaluateSatCiec('no', { required: 'si' });
assert('SAT CIEC no acepta conexión cuando es requerida -> FAIL', sat2.status === 'fail');

// ─────────────────────────────────────────────────────────────
// 15. ESTADOS FINANCIEROS
// ─────────────────────────────────────────────────────────────
console.log('\n--- 15. ESTADOS FINANCIEROS ---');
const ef1 = evaluateEstadosFinancieros('si', { required: 'si' });
assert('Estados financieros entregados cuando son requeridos -> PASS', ef1.status === 'pass');

const ef2 = evaluateEstadosFinancieros('no', { required: 'si' });
assert('Estados financieros no entregados cuando son requeridos -> FAIL', ef2.status === 'fail');

// ─────────────────────────────────────────────────────────────
// 16. CRÉDITOS VIGENTES
// ─────────────────────────────────────────────────────────────
console.log('\n--- 16. CRÉDITOS VIGENTES ---');
const cv1 = evaluateCreditosVigentes('si', { required: 'si' });
assert('Créditos vigentes tiene activos cuando son requeridos -> PASS', cv1.status === 'pass');

const cv2 = evaluateCreditosVigentes('no', { required: 'si' });
assert('Créditos vigentes no tiene activos cuando son requeridos -> FAIL', cv2.status === 'fail');

// ─────────────────────────────────────────────────────────────
// 17 & 18. INTEGRACIÓN: evaluateAllFieldsForClient (4 PERFILES)
// ─────────────────────────────────────────────────────────────
console.log('\n--- 17. INTEGRACIÓN: EVALUACIÓN MAESTRA EN LOS 4 PERFILES ---');

// 1. Perfil Persona Moral
const clientPM = {
  id: 'c1',
  type: 'persona_moral',
  montoSolicitado: 800000,
  buroAccionistaPrincipal: 'alto-694-760',
  buroEmpresa: 'alto-310-400',
  ingresoMensualPromedio: 250000,
  egresoMensualPromedio: 120000,
  ingresoAnual: '1000000-2500000',
  tiempoActividad: '3 años',
  participacionVentasGobierno: '0',
  opinionCumplimiento: 'positiva',
  garantia: 'hipotecaria',
  ventasTerminalBancaria: '50000-100000',
  atrasosDeudas: 'no',
  avalObligadoSolidario: 'si',
  satCiec: 'si',
  estadosFinancieros: 'si',
  creditosVigentes: 'si'
};

const instPM = {
  id: 'inst-pm',
  name: 'Financiera PM Pro',
  acceptedProfiles: ['persona_moral'],
  requirements: {
    persona_moral: {
      ranges: {
        monto: { min: 100000, max: 2000000 },
        buroAccionistaPrincipal: { min: 650 },
        buroEmpresa: { min: 300 },
        ingresoMensualPromedio: { min: 100000 },
        egresoMensualPromedio: { max: 150000 },
        ingresoAnual: { min: '500000-1000000' },
        tiempoActividad: { min: 24 },
        participacionVentasGobierno: { maxThreshold: 'menor-20' },
        opinionCumplimiento: { acceptanceMode: 'solo-positiva' },
        garantia: { guaranteeMultipliers: { 'hipotecaria': '2.0x' } },
        ventasTerminalBancaria: { min: '30000-50000' },
        atrasosDeudas: { required: 'no' },
        avalObligadoSolidario: { required: 'si' },
        satCiec: { required: 'si' },
        estadosFinancieros: { required: 'si' },
        creditosVigentes: { required: 'si' }
      }
    }
  }
};

const evalPM = evaluateAllFieldsForClient(clientPM, instPM);
assert('Persona Moral: 100% de cumplimiento en todos los campos', evalPM.failedChecks === 0 && evalPM.score === 100, evalPM);
assert('Persona Moral: categoría es "recommended"', evalPM.category === 'recommended');

// 2. Perfil Física con Actividad Empresarial (PFAE)
const clientPFAE = {
  id: 'c2',
  type: 'fisica_empresarial',
  montoSolicitado: 300000,
  buroPersonaFisica: 'bueno-592-693',
  ingresoMensualPromedioComprobables: 60000,
  gastosFijosMensualesPromedio: 25000,
  ingresoAnual: '500000-1000000',
  antiguedadLaboral: '2-5',
  edadCliente: 42,
  participacionVentasGobierno: 'menor-10',
  opinionCumplimiento: 'positiva',
  garantia: 'sin-garantia',
  ventasTerminalBancaria: '15000-30000',
  atrasosDeudasBuro: 'no',
  avalObligadoSolidario: 'si',
  satCiec: 'si',
  estadosFinancieros: 'si',
  creditosVigentes: 'si'
};

const instPFAE = {
  id: 'inst-pfae',
  name: 'Financiera PFAE Ágil',
  acceptedProfiles: ['fisica_empresarial'],
  requirements: {
    fisica_empresarial: {
      ranges: {
        monto: { min: 50000, max: 500000 },
        buroPersonaFisica: { min: 580 },
        ingresoMensualPromedioComprobables: { min: 30000 },
        gastosFijosMensualesPromedio: { max: 40000 },
        antiguedadLaboral: { min: 12 },
        edadCliente: { min: 21, max: 65 },
        participacionVentasGobierno: { maxThreshold: 'menor-20' },
        opinionCumplimiento: { acceptanceMode: 'solo-positiva' },
        garantia: { guaranteeMultipliers: {} },
        ventasTerminalBancaria: { min: 'hasta-15000' },
        atrasosDeudasBuro: { required: 'no' },
        avalObligadoSolidario: { required: 'no' },
        satCiec: { required: 'si' },
        estadosFinancieros: { required: 'si' },
        creditosVigentes: { required: 'si' }
      }
    }
  }
};

const evalPFAE = evaluateAllFieldsForClient(clientPFAE, instPFAE);
assert('PFAE: 100% de cumplimiento en todos los campos', evalPFAE.failedChecks === 0 && evalPFAE.score === 100, evalPFAE);

// 3. Perfil Persona Física
const clientPF = {
  id: 'c3',
  type: 'fisica',
  montoSolicitado: 150000,
  buroPersonaFisica: 'alto-694-760',
  ingresoMensualPromedioComprobables: 45000,
  gastosFijosMensualesPromedio: 15000,
  antiguedadLaboral: 'mas-10',
  edadCliente: 38,
  cuentaConGarantiaFisica: 'sin-garantia',
  atrasosDeudasBuro: 'no',
  tieneAvalObligadoSolidarioFisica: 'no',
  creditosVigentes: 'si'
};

const instPF = {
  id: 'inst-pf',
  name: 'Banco Personal Plus',
  acceptedProfiles: ['fisica'],
  requirements: {
    fisica: {
      ranges: {
        monto: { min: 20000, max: 300000 },
        buroPersonaFisica: { min: 650 },
        ingresoMensualPromedioComprobables: { min: 25000 },
        gastosFijosMensualesPromedio: { max: 25000 },
        antiguedadLaboral: { min: 24 },
        edadCliente: { min: 25, max: 65 },
        cuentaConGarantiaFisica: { guaranteeMultipliers: {} },
        atrasosDeudasBuro: { required: 'no' },
        tieneAvalObligadoSolidarioFisica: { required: 'no' },
        creditosVigentes: { required: 'si' }
      }
    }
  }
};

const evalPF = evaluateAllFieldsForClient(clientPF, instPF);
assert('Persona Física: 100% de cumplimiento en todos los campos', evalPF.failedChecks === 0 && evalPF.score === 100, evalPF);

// 4. Perfil Sin SAT
const clientSinSat = {
  id: 'c4',
  type: 'sin_sat',
  montoSolicitado: 80000,
  buroPersonaFisicaSinSat: 'si',
  ingresoMensualPromedioComprobablesSinSat: 30000,
  gastosFijosMensualesPromedioSinSat: 10000,
  edadCliente: 30,
  cuentaConGarantiaSinSat: 'prendaria',
  atrasosDeudasBuroSinSat: 'no',
  tieneAvalObligadoSolidarioSinSat: 'si',
  creditosVigentes: 'no'
};

const instSinSat = {
  id: 'inst-sinsat',
  name: 'Microcrédito Sin SAT',
  acceptedProfiles: ['sin_sat'],
  requirements: {
    sin_sat: {
      ranges: {
        monto: { min: 10000, max: 150000 },
        buroPersonaFisicaSinSat: { required: 'si' },
        ingresoMensualPromedioComprobablesSinSat: { min: 15000 },
        gastosFijosMensualesPromedioSinSat: { max: 20000 },
        edadCliente: { min: 21, max: 60 },
        cuentaConGarantiaSinSat: { guaranteeMultipliers: { 'prendaria': '1.5x' } },
        atrasosDeudasBuroSinSat: { required: 'no' },
        tieneAvalObligadoSolidarioSinSat: { required: 'si' },
        creditosVigentes: { required: 'no' }
      }
    }
  }
};

const evalSinSat = evaluateAllFieldsForClient(clientSinSat, instSinSat);
assert('Sin SAT: 100% de cumplimiento en todos los campos', evalSinSat.failedChecks === 0 && evalSinSat.score === 100, evalSinSat);

console.log('\n====================================================');
console.log(`  RESUMEN FINAL: ${passed} PASADOS, ${failed} FALLADOS`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 TODOS LOS CAMPOS Y CÁLCULOS FUNCIONAN CON 100% DE PRECISIÓN 🎉');
}
