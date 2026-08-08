const { runBankAnalysisEngine } = require('../server/services/bankAnalysisEngine');

console.log('=== TEST BANK ENGINE WITH EXCEL CASES ===\n');

// Caso 1: VIESCA Y DE LA PEÑA (del Excel BANCOS)
const riescaData = [
  { mes: 'Ene', saldoInicial: 231265.08, saldoFinal: 477643.39, totalDepositos: 3774744.11, totalRetiros: 3528365.80, saldoPromedio: 254516.74, noDepositos: 125, noRetiros: 347, noSobregiros: 0 },
  { mes: 'Feb', saldoInicial: 477643.39, saldoFinal: 616917.60, totalDepositos: 4299747.28, totalRetiros: 4160473.07, saldoPromedio: 441303.61, noDepositos: 177, noRetiros: 392, noSobregiros: 0 },
  { mes: 'Mar', saldoInicial: 616917.60, saldoFinal: 1230820.51, totalDepositos: 5232121.63, totalRetiros: 4618218.72, saldoPromedio: 507399.75, noDepositos: 167, noRetiros: 351, noSobregiros: 0 },
  { mes: 'Abr', saldoInicial: 1230820.51, saldoFinal: 571175.46, totalDepositos: 5896371.21, totalRetiros: 6532816.26, saldoPromedio: 947399.31, noDepositos: 169, noRetiros: 389, noSobregiros: 0 },
  { mes: 'May', saldoInicial: 571175.46, saldoFinal: 201204.28, totalDepositos: 5249732.91, totalRetiros: 5642904.09, saldoPromedio: 100311.28, noDepositos: 187, noRetiros: 330, noSobregiros: 0 },
  { mes: 'Jun', saldoInicial: 201204.28, saldoFinal: 243626.76, totalDepositos: 6307754.14, totalRetiros: 6265331.66, saldoPromedio: 797036.81, noDepositos: 208, noRetiros: 461, noSobregiros: 0 },
];

const resViesca = runBankAnalysisEngine({
  monthsData: riescaData,
  rentaMensualPropuesta: 14666.02,
  plazoMeses: 48,
  tasaAnualProyectada: 0.2382,
});

console.log('1. VIESCA Y DE LA PEÑA:');
console.log('   - Depósitos Promedio:', resViesca.summary.depositosPromedioMensual.toLocaleString('es-MX'));
console.log('   - Saldo Promedio General:', resViesca.summary.saldoPromedioMensualGeneral.toLocaleString('es-MX'));
console.log('   - Burn Rate Status:', resViesca.summary.burnRateStatus);
console.log('   - Score Final (0-1000):', resViesca.scores.scoreFinal1000.toFixed(2));
console.log('   - Clasificación:', resViesca.scores.clasificacionRiesgo);
console.log('   - Línea Crédito Máxima:', resViesca.creditCapacity.montoMaximoCredito.toLocaleString('es-MX'));


// Caso 2: QORVA-MICROPLATE MEXICANA (del Excel BANCOS)
const qorvaData = [
  { mes: 'Ene', saldoInicial: 1462543.99, saldoFinal: 166945.89, totalDepositos: 579596.02, totalRetiros: 1875194.12, saldoPromedio: 859479.23, noDepositos: 22, noRetiros: 55, noSobregiros: 0 },
  { mes: 'Feb', saldoInicial: 166945.89, saldoFinal: 202793.05, totalDepositos: 1512509.00, totalRetiros: 1476661.84, saldoPromedio: 361328.50, noDepositos: 19, noRetiros: 42, noSobregiros: 0 },
  { mes: 'Mar', saldoInicial: 202793.05, saldoFinal: 295709.65, totalDepositos: 1975469.56, totalRetiros: 1882552.96, saldoPromedio: 211801.49, noDepositos: 36, noRetiros: 64, noSobregiros: 0 },
  { mes: 'Abr', saldoInicial: 295709.65, saldoFinal: 1320631.87, totalDepositos: 3192218.58, totalRetiros: 2167296.36, saldoPromedio: 967239.28, noDepositos: 46, noRetiros: 73, noSobregiros: 0 },
  { mes: 'May', saldoInicial: 1320631.87, saldoFinal: 1653077.48, totalDepositos: 2115083.37, totalRetiros: 1782637.76, saldoPromedio: 1446095.94, noDepositos: 25, noRetiros: 47, noSobregiros: 0 },
  { mes: 'Jun', saldoInicial: 1653077.48, saldoFinal: 1608251.70, totalDepositos: 1950984.04, totalRetiros: 1995809.82, saldoPromedio: 1477913.38, noDepositos: 24, noRetiros: 52, noSobregiros: 0 },
];

const resQorva = runBankAnalysisEngine({
  monthsData: qorvaData,
  rentaMensualPropuesta: 13676.64,
  plazoMeses: 48,
  tasaAnualProyectada: 0.2382,
});

console.log('\n2. QORVA-MICROPLATE MEXICANA:');
console.log('   - Depósitos Promedio:', resQorva.summary.depositosPromedioMensual.toLocaleString('es-MX'));
console.log('   - Saldo Promedio General:', resQorva.summary.saldoPromedioMensualGeneral.toLocaleString('es-MX'));
console.log('   - Burn Rate Status:', resQorva.summary.burnRateStatus);
console.log('   - Score Final (0-1000):', resQorva.scores.scoreFinal1000.toFixed(2));
console.log('   - Clasificación:', resQorva.scores.clasificacionRiesgo);
console.log('   - Línea Crédito Máxima:', resQorva.creditCapacity.montoMaximoCredito.toLocaleString('es-MX'));

console.log('\n✅ TEST COMPLETADO EXITOSAMENTE.');
