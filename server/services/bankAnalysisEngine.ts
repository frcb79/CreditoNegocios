/**
 * Motor de Análisis Bancario Determinista (Bank Analysis Engine)
 * Replica exactamente el modelo de riesgo y scoring de la pestaña BANCOS en 'Modelos Franco 07 2026.xlsx'
 */

export interface MonthlyBankData {
  mes: string;
  saldoInicial: number;
  saldoFinal: number;
  totalDepositos: number;
  totalRetiros: number;
  saldoPromedio: number;
  noDepositos: number;
  noRetiros: number;
  noSobregiros: number;
  chequesDevueltos?: number;
  comisiones?: number;
}

export interface BankEngineInput {
  monthsData: MonthlyBankData[]; // Array de 6 meses
  rentaMensualPropuesta?: number; // Para cálculo de DSCR y cobertura (ej. cuota proyectada)
  plazoMeses?: number; // 24, 36, 48, 60 meses (default: 48)
  tasaAnualProyectada?: number; // Tasa anual en decimal (ej. 0.24 = 24%)
}

export interface MonthlyAnalysisResult extends MonthlyBankData {
  montoPromedioDepositos: number;
  montoPromedioRetiro: number;
  flujoMensual: number;
  burnRateOperativo: number;
  margenOperativo: number;
}

export interface KnockOutRuleTrigger {
  rule: string;
  condition: string;
  action: 'Rechazo' | 'Revisión/Aval' | 'Comité' | 'Alerta';
  triggered: boolean;
  details: string;
}

export interface BankEngineOutput {
  monthlyResults: MonthlyAnalysisResult[];
  summary: {
    totalDepositosSuma: number;
    totalRetirosSuma: number;
    depositosPromedioMensual: number;
    retirosPromedioMensual: number;
    saldoPromedioMensualGeneral: number;
    saldoFinalPromedioReciente: number;
    saldoFinalPromedioHistorico: number;
    cashflowOperativoPonderado: number;
    burnRateOperativoPonderado: number;
    burnRateStatus: 'Muy Sano' | 'Sano' | 'Presionado' | 'Riesgoso';
    relacionSaldoFinalDepositos: number;
    indiceConsistenciaIngresos: number;
    trimmedMeanSaldo: number;
    estabilidadIngresosCV: number;
    pesoRelativoSaldosRecientes: number;
    tendenciaSaldoStatus: 'liquidez mejora fuerte' | 'liquidez estable' | 'liquidez deteriora leve' | 'liquidez deteriora fuerte';
    cvFlujoNeto: number;
    flujoNetoEstimadoOperativo: number;
    flujoOperativoAjustado: number;
    dscrOperativo: number;
    dscrRequerido: number;
    tasaAnualAplicada: number;
    ratioLiquidezOperativaIngresoEgreso: number;
    margenOperativoPonderado: number;
  };
  scores: {
    capacidadPagoScore: number; // 40%
    liquidezRealScore: number; // 30%
    estabilidadOperativaScore: number; // 20%
    tendenciaDeterioroScore: number; // 10%
    scoreTotalBase: number; // 0 - 100
    scoreFinal1000: number; // 0 - 1000
    clasificacionRiesgo: 'Excelente Candidato' | 'Aprobación' | 'Aprobar con Aval' | 'Revisar con Obligado' | 'Solicitar Aval * Depósitos' | 'Sugerencia Rechazo';
  };
  koRules: KnockOutRuleTrigger[];
  creditCapacity: {
    pagoMaxSoportado: number;
    montoMaximoCredito: number;
    plazoMeses: number;
  };
}

/**
 * Función auxiliar para calcular desviación estándar poblacional
 */
function calculateStdevP(arr: number[]): number {
  if (arr.length === 0) return 0;
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Función auxiliar para calcular desviación estándar muestral
 */
function calculateStdevS(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
  const sumSquareDiff = squareDiffs.reduce((a, b) => a + b, 0);
  return Math.sqrt(sumSquareDiff / (arr.length - 1));
}

/**
 * Cálculo del Valor Presente Financiero PV(rate, nper, pmt)
 */
function calculatePV(ratePerPeriod: number, numberOfPeriods: number, payment: number): number {
  if (ratePerPeriod === 0) return Math.abs(payment * numberOfPeriods);
  const pv = (payment * (1 - Math.pow(1 + ratePerPeriod, -numberOfPeriods))) / ratePerPeriod;
  return Math.abs(pv);
}

/**
 * Obten la tasa anual por defecto de acuerdo al plazo (fórmulas del Excel)
 */
export function getDefaultInterestRate(termMonths: number): number {
  if (termMonths < 24) return 0.302; // 30.2%
  if (termMonths < 36) return 0.260; // 26.0%
  if (termMonths < 48) return 0.2455; // 24.55%
  if (termMonths < 60) return 0.2382; // 23.82%
  return 0.2382;
}

/**
 * Obtén el DSCR Requerido según el plazo
 */
export function getRequiredDSCR(termMonths: number): number {
  if (termMonths <= 24) return 3.0;
  if (termMonths <= 36) return 2.75;
  if (termMonths <= 48) return 2.5;
  if (termMonths <= 60) return 2.25;
  return 2.25;
}

/**
 * EJECUTA EL MOTOR MATEMÁTICO DE BANCOS
 */
export function runBankAnalysisEngine(input: BankEngineInput): BankEngineOutput {
  const { monthsData } = input;
  
  if (!monthsData || monthsData.length === 0) {
    throw new Error("Se requieren al menos datos mensuales para ejecutar el análisis bancario.");
  }
  
  const numMonths = monthsData.length;
  const plazoMeses = input.plazoMeses || 48;
  const tasaAnual = input.tasaAnualProyectada || getDefaultInterestRate(plazoMeses);
  const dscrRequerido = getRequiredDSCR(plazoMeses);
  
  // 1. Cálculos mensuales por mes
  const monthlyResults: MonthlyAnalysisResult[] = monthsData.map(m => {
    const montoPromedioDepositos = m.noDepositos > 0 ? m.totalDepositos / m.noDepositos : 0;
    const montoPromedioRetiro = m.noRetiros > 0 ? m.totalRetiros / m.noRetiros : 0;
    const flujoMensual = m.totalDepositos - m.totalRetiros;
    const burnRateOperativo = m.totalDepositos > 0 ? m.totalRetiros / m.totalDepositos : 1;
    const margenOperativo = m.totalDepositos > 0 ? (m.totalDepositos - m.totalRetiros) / m.totalDepositos : 0;
    
    return {
      ...m,
      montoPromedioDepositos,
      montoPromedioRetiro,
      flujoMensual,
      burnRateOperativo,
      margenOperativo,
    };
  });
  
  // Extraer arreglos para cálculos estadísticos
  const depositosArr = monthlyResults.map(m => m.totalDepositos);
  const retirosArr = monthlyResults.map(m => m.totalRetiros);
  const saldosFinalesArr = monthlyResults.map(m => m.saldoFinal);
  const saldosPromediosArr = monthlyResults.map(m => m.saldoPromedio);
  const flujosArr = monthlyResults.map(m => m.flujoMensual);
  const burnRatesArr = monthlyResults.map(m => m.burnRateOperativo);
  const sobregirosArr = monthlyResults.map(m => m.noSobregiros);
  
  // Sumas y Promedios globales
  const totalDepositosSuma = depositosArr.reduce((a, b) => a + b, 0);
  const totalRetirosSuma = retirosArr.reduce((a, b) => a + b, 0);
  const depositosPromedioMensual = totalDepositosSuma / numMonths;
  const retirosPromedioMensual = totalRetirosSuma / numMonths;
  const saldoPromedioMensualGeneral = saldosPromediosArr.reduce((a, b) => a + b, 0) / numMonths;
  
  // Ponderaciones históricas (si hay 6 meses)
  // Pesos: m1: 5%, m2: 10%, m3: 10%, m4: 15%, m5: 25%, m6: 35%
  const weights = numMonths === 6 
    ? [0.05, 0.10, 0.10, 0.15, 0.25, 0.35]
    : Array(numMonths).fill(1 / numMonths);

  const depositosPonderados = depositosArr.reduce((acc, val, idx) => acc + val * weights[idx], 0);
  const retirosPonderados = retirosArr.reduce((acc, val, idx) => acc + val * weights[idx], 0);
  const cashflowOperativoPonderado = flujosArr.reduce((acc, val, idx) => acc + val * weights[idx], 0);
  const burnRateOperativoPonderado = burnRatesArr.reduce((acc, val, idx) => acc + val * weights[idx], 0);
  const margenOperativoPonderado = depositosPonderados > 0 
    ? (depositosPonderados - retirosPonderados) / depositosPonderados 
    : 0;

  // Promedios Recientes vs Históricos (primeros 3 meses vs últimos 3 meses si numMonths >= 6)
  const mHalf = Math.floor(numMonths / 2);
  const historicoSaldos = saldosPromediosArr.slice(0, mHalf);
  const recienteSaldos = saldosPromediosArr.slice(mHalf);
  const historicoFlujos = flujosArr.slice(0, mHalf);
  const recienteFlujos = flujosArr.slice(mHalf);

  const avgHistoricoSaldos = historicoSaldos.length > 0 ? historicoSaldos.reduce((a, b) => a + b, 0) / historicoSaldos.length : 0;
  const avgRecienteSaldos = recienteSaldos.length > 0 ? recienteSaldos.reduce((a, b) => a + b, 0) / recienteSaldos.length : 0;
  const avgHistoricoFlujos = historicoFlujos.length > 0 ? historicoFlujos.reduce((a, b) => a + b, 0) / historicoFlujos.length : 0;
  const avgRecienteFlujos = recienteFlujos.length > 0 ? recienteFlujos.reduce((a, b) => a + b, 0) / recienteFlujos.length : 0;

  // Saldo Final Promedio Reciente (ponderado m6*0.5 + m5*0.3 + m4*0.2)
  const saldoFinalPromedioReciente = numMonths >= 6
    ? saldosFinalesArr[5] * 0.5 + saldosFinalesArr[4] * 0.3 + saldosFinalesArr[3] * 0.2
    : saldosFinalesArr[numMonths - 1];

  const saldoFinalPromedioHistorico = avgHistoricoSaldos;

  // Variación Saldo Operativo Reciente vs Histórico
  const saldoOperativoPromRecienteVsHistorico = (avgRecienteSaldos - avgHistoricoSaldos) / Math.max(Math.abs(avgHistoricoSaldos), 1000);
  const flujoOperativoMensualRecienteVsHistorico = (avgRecienteFlujos - avgHistoricoFlujos) / Math.max(Math.abs(avgHistoricoFlujos), 1000);

  // Score H20 (Saldo Operativo Reciente vs Historico)
  let scoreH20 = -20;
  if (saldoOperativoPromRecienteVsHistorico >= 1.2) scoreH20 = 100;
  else if (saldoOperativoPromRecienteVsHistorico >= 1.0) scoreH20 = 80;
  else if (saldoOperativoPromRecienteVsHistorico >= 0.8) scoreH20 = 50;
  else if (saldoOperativoPromRecienteVsHistorico >= 0.5) scoreH20 = 30;
  else if (saldoOperativoPromRecienteVsHistorico >= 0.2) scoreH20 = 0;

  // Status de Burn Rate
  let burnRateStatus: 'Muy Sano' | 'Sano' | 'Presionado' | 'Riesgoso' = 'Riesgoso';
  if (burnRateOperativoPonderado < 0.75) burnRateStatus = 'Muy Sano';
  else if (burnRateOperativoPonderado < 0.85) burnRateStatus = 'Sano';
  else if (burnRateOperativoPonderado < 0.95) burnRateStatus = 'Presionado';

  // Score Burn Rate (H24)
  let scoreBurnRate = -20;
  if (burnRateOperativoPonderado < 0.75) scoreBurnRate = 100;
  else if (burnRateOperativoPonderado < 0.80) scoreBurnRate = 80;
  else if (burnRateOperativoPonderado < 0.85) scoreBurnRate = 50;
  else if (burnRateOperativoPonderado < 0.90) scoreBurnRate = 30;
  else if (burnRateOperativoPonderado < 0.95) scoreBurnRate = 15;
  else if (burnRateOperativoPonderado < 1.00) scoreBurnRate = 0;

  // Relación Saldo Final / Depósitos (H26)
  const avgSaldoFinal = saldosFinalesArr.reduce((a, b) => a + b, 0) / numMonths;
  const relacionSaldoFinalDepositos = depositosPromedioMensual > 0 ? avgSaldoFinal / depositosPromedioMensual : 0;

  let scoreRelacionSaldoDepositos = -10;
  if (relacionSaldoFinalDepositos > 0.15) scoreRelacionSaldoDepositos = 100;
  else if (relacionSaldoFinalDepositos > 0.10) scoreRelacionSaldoDepositos = 80;
  else if (relacionSaldoFinalDepositos > 0.05) scoreRelacionSaldoDepositos = 60;
  else if (relacionSaldoFinalDepositos > 0.03) scoreRelacionSaldoDepositos = 50;
  else if (relacionSaldoFinalDepositos > 0.015) scoreRelacionSaldoDepositos = 20;
  else if (relacionSaldoFinalDepositos > 0) scoreRelacionSaldoDepositos = 10;
  else if (relacionSaldoFinalDepositos === 0) scoreRelacionSaldoDepositos = 0;

  // Índice de Consistencia de Ingresos (H27)
  const stdevDepositos = calculateStdevS(depositosArr);
  const indiceConsistenciaIngresos = depositosPromedioMensual > 0 ? 1 - (stdevDepositos / depositosPromedioMensual) : 0;
  const scoreConsistenciaIngresos = Math.max(0, Math.min(100, indiceConsistenciaIngresos * 100));

  // Trimmed Mean de Saldo (quitando min y max)
  let trimmedMeanSaldo = avgSaldoFinal;
  if (numMonths > 2) {
    const minS = Math.min(...saldosFinalesArr);
    const maxS = Math.max(...saldosFinalesArr);
    const sumS = saldosFinalesArr.reduce((a, b) => a + b, 0);
    trimmedMeanSaldo = (sumS - minS - maxS) / (numMonths - 2);
  }

  // Renta mensual propuesta (si no viene dada, usar un estimado tentativo para ratios)
  const rentaMensualPropuesta = input.rentaMensualPropuesta || (trimmedMeanSaldo / 3);

  // Trimmed Mean Saldo / Renta Ratio (H32)
  const trimmedMeanSaldoRentaRatio = rentaMensualPropuesta > 0 ? trimmedMeanSaldo / rentaMensualPropuesta : 0;

  let scoreTrimmedMean = 100;
  if (trimmedMeanSaldoRentaRatio < 0.5) scoreTrimmedMean = 0;
  else if (trimmedMeanSaldoRentaRatio < 1.0) scoreTrimmedMean = 20;
  else if (trimmedMeanSaldoRentaRatio < 2.0) scoreTrimmedMean = 50;
  else if (trimmedMeanSaldoRentaRatio < 3.0) scoreTrimmedMean = 70;
  else if (trimmedMeanSaldoRentaRatio < 5.0) scoreTrimmedMean = 90;

  // Estabilidad de Ingresos (CV) (H33)
  const estabilidadIngresosCV = depositosPromedioMensual > 0 ? stdevDepositos / depositosPromedioMensual : 0;
  const scoreEstabilidadIngresos = Math.max(0, 100 - (estabilidadIngresosCV * 40));

  // Peso relativo de saldos recientes (H34)
  const pesoRelativoSaldosRecientes = avgHistoricoSaldos > 0 ? avgRecienteSaldos / avgHistoricoSaldos : 1;
  let tendenciaSaldoStatus: 'liquidez mejora fuerte' | 'liquidez estable' | 'liquidez deteriora leve' | 'liquidez deteriora fuerte' = 'liquidez estable';
  if (pesoRelativoSaldosRecientes >= 1.2) tendenciaSaldoStatus = 'liquidez mejora fuerte';
  else if (pesoRelativoSaldosRecientes >= 1.0) tendenciaSaldoStatus = 'liquidez estable';
  else if (pesoRelativoSaldosRecientes >= 0.8) tendenciaSaldoStatus = 'liquidez deteriora leve';
  else tendenciaSaldoStatus = 'liquidez deteriora fuerte';

  // CV Flujo Neto (H36)
  const stdevFlujos = calculateStdevS(flujosArr);
  const avgFlujosAbs = Math.max(Math.abs(flujosArr.reduce((a, b) => a + b, 0) / numMonths), 1000);
  const cvFlujoNeto = Math.min(3, stdevFlujos / avgFlujosAbs);
  const scoreCVFlujoNeto = Math.max(0, 100 - (cvFlujoNeto * 30));

  // Flujo Neto Estimado y Flujo Operativo Ajustado (H38 / H39)
  const flujoNetoEstimadoOperativo = (totalDepositosSuma * margenOperativoPonderado) / numMonths;
  const flujoOperativoAjustado = flujoNetoEstimadoOperativo - (stdevFlujos * 0.25);
  
  // DSCR Operativo (H39)
  const dscrOperativo = rentaMensualPropuesta > 0 ? flujoOperativoAjustado / rentaMensualPropuesta : 0;

  // Score DSCR Operativo (H40)
  const dscrRatio = dscrOperativo / dscrRequerido;
  let scoreDSCR = 0;
  if (dscrRatio >= 1.5) scoreDSCR = 100;
  else if (dscrRatio >= 1.2) scoreDSCR = 80;
  else if (dscrRatio >= 1.0) scoreDSCR = 60;
  else if (dscrRatio >= 0.8) scoreDSCR = 40;

  // Ratio Liquidez Operativa Ingreso / Egreso (H41)
  const ratioLiquidezOperativaIngresoEgreso = totalRetirosSuma > 0 ? totalDepositosSuma / totalRetirosSuma : 1;
  let scoreLiquidezOperativa = 10;
  if (ratioLiquidezOperativaIngresoEgreso >= 1.10) scoreLiquidezOperativa = 100;
  else if (ratioLiquidezOperativaIngresoEgreso >= 1.05) scoreLiquidezOperativa = 80;
  else if (ratioLiquidezOperativaIngresoEgreso >= 1.00) scoreLiquidezOperativa = 70;
  else if (ratioLiquidezOperativaIngresoEgreso >= 0.95) scoreLiquidezOperativa = 50;
  else if (ratioLiquidezOperativaIngresoEgreso >= 0.85) scoreLiquidezOperativa = 35;

  // Score Margen Operativo (H42)
  let scoreMargenOperativo = 0;
  if (margenOperativoPonderado >= 0.20) scoreMargenOperativo = 100;
  else if (margenOperativoPonderado >= 0.10) scoreMargenOperativo = 80;
  else if (margenOperativoPonderado >= 0.05) scoreMargenOperativo = 60;
  else if (margenOperativoPonderado >= 0.00) scoreMargenOperativo = 40;
  else if (margenOperativoPonderado >= -0.05) scoreMargenOperativo = 20;

  // -------------------------------------------------------------
  // PILARES DEL SCORECARD (Puntuación Fila 44 - 63 del Excel)
  // -------------------------------------------------------------
  
  // Pilar 1: Capacidad de Pago (40%)
  const capacidadPagoScore = (scoreDSCR * 0.60) + (scoreBurnRate * 0.25) + (scoreMargenOperativo * 0.15);

  // Pilar 2: Liquidez Real (30%)
  const liquidezRealScore = (scoreTrimmedMean * 0.50) + (scoreLiquidezOperativa * 0.30) + (scoreRelacionSaldoDepositos * 0.20);

  // Pilar 3: Estabilidad Operativa (20%)
  const estabilidadOperativaScore = (scoreCVFlujoNeto * 0.60) + (scoreConsistenciaIngresos * 0.40);

  // Pilar 4: Tendencia / Deterioro (10%)
  const tendenciaDeterioroScore = scoreH20 * 1.00;

  // SCORE BASE (0 - 100 pts)
  const scoreTotalBase = (capacidadPagoScore * 0.40) + 
                         (liquidezRealScore * 0.30) + 
                         (estabilidadOperativaScore * 0.20) + 
                         (tendenciaDeterioroScore * 0.10);

  // SCORE FINAL CREDITO NEGOCIOS (0 - 1000 pts)
  const scoreFinal1000 = Math.min(1000, Math.max(0, scoreTotalBase * 10));

  // Clasificación de Riesgo
  let clasificacionRiesgo: 'Excelente Candidato' | 'Aprobación' | 'Aprobar con Aval' | 'Revisar con Obligado' | 'Solicitar Aval * Depósitos' | 'Sugerencia Rechazo' = 'Sugerencia Rechazo';
  if (scoreFinal1000 >= 850) clasificacionRiesgo = 'Excelente Candidato';
  else if (scoreFinal1000 >= 700) clasificacionRiesgo = 'Aprobación';
  else if (scoreFinal1000 >= 600) clasificacionRiesgo = 'Aprobar con Aval';
  else if (scoreFinal1000 >= 500) clasificacionRiesgo = 'Revisar con Obligado';
  else if (scoreFinal1000 >= 400) clasificacionRiesgo = 'Solicitar Aval * Depósitos';

  // -------------------------------------------------------------
  // REGLAS KO (KNOCK-OUT RULES)
  // -------------------------------------------------------------
  const totalSobregiros = sobregirosArr.reduce((a, b) => a + b, 0);
  
  // Detección de 3 meses consecutivos de flujo negativo
  let consecutivosNegativos = 0;
  let maxConsecutivosNegativos = 0;
  flujosArr.forEach(f => {
    if (f < 0) {
      consecutivosNegativos++;
      if (consecutivosNegativos > maxConsecutivosNegativos) maxConsecutivosNegativos = consecutivosNegativos;
    } else {
      consecutivosNegativos = 0;
    }
  });

  const koRules: KnockOutRuleTrigger[] = [
    {
      rule: 'DSCR < 1.0',
      condition: 'Capacidad de pago insuficiente para cubrir servicio de deuda',
      action: 'Rechazo',
      triggered: dscrOperativo < 1.0,
      details: `DSCR actual: ${dscrOperativo.toFixed(2)}x vs Mínimo exigido: 1.0x`,
    },
    {
      rule: 'Burn Rate > 1.15',
      condition: 'La empresa retira un 15% o más por encima de lo que ingresa',
      action: 'Revisión/Aval',
      triggered: burnRateOperativoPonderado > 1.15,
      details: `Burn Rate Ponderado: ${(burnRateOperativoPonderado * 100).toFixed(1)}%`,
    },
    {
      rule: 'Flujo Negativo Consecutivo (>=3 Meses)',
      condition: 'Tres o más meses seguidos de pérdida de caja operativa',
      action: 'Comité',
      triggered: maxConsecutivosNegativos >= 3,
      details: `Meses consecutivos con flujo negativo: ${maxConsecutivosNegativos}`,
    },
    {
      rule: 'Margen Operativo < -10%',
      condition: 'Pérdida operativa promedio severa',
      action: 'Revisión',
      triggered: margenOperativoPonderado < -0.10,
      details: `Margen Operativo: ${(margenOperativoPonderado * 100).toFixed(1)}%`,
    },
    {
      rule: 'Trimmed Saldo / Renta < 0.5',
      condition: 'Liquidez residual recortada insuficiente para cubrir medio mes de cuota',
      action: 'Rechazo',
      triggered: trimmedMeanSaldoRentaRatio < 0.5,
      details: `Ratio Saldo/Renta: ${trimmedMeanSaldoRentaRatio.toFixed(2)}x`,
    },
    {
      rule: 'Sobregiros > 2',
      condition: 'Estrés de caja recurrente o falta de disciplina financiera',
      action: 'Revisión/Aval',
      triggered: totalSobregiros > 2,
      details: `Sobregiros totales registrados: ${totalSobregiros}`,
    },
  ];

  // -------------------------------------------------------------
  // CAPACIDAD MÁXIMA DE CRÉDITO
  // -------------------------------------------------------------
  const pagoMaxSoportado = dscrRequerido > 0 ? saldoPromedioMensualGeneral / dscrRequerido : 0;
  const montoMaximoCredito = calculatePV(tasaAnual / 12, plazoMeses, -pagoMaxSoportado);

  return {
    monthlyResults,
    summary: {
      totalDepositosSuma,
      totalRetirosSuma,
      depositosPromedioMensual,
      retirosPromedioMensual,
      saldoPromedioMensualGeneral,
      saldoFinalPromedioReciente,
      saldoFinalPromedioHistorico,
      cashflowOperativoPonderado,
      burnRateOperativoPonderado,
      burnRateStatus,
      relacionSaldoFinalDepositos,
      indiceConsistenciaIngresos,
      trimmedMeanSaldo,
      estabilidadIngresosCV,
      pesoRelativoSaldosRecientes,
      tendenciaSaldoStatus,
      cvFlujoNeto,
      flujoNetoEstimadoOperativo,
      flujoOperativoAjustado,
      dscrOperativo,
      dscrRequerido,
      tasaAnualAplicada: tasaAnual,
      ratioLiquidezOperativaIngresoEgreso,
      margenOperativoPonderado,
    },
    scores: {
      capacidadPagoScore,
      liquidezRealScore,
      estabilidadOperativaScore,
      tendenciaDeterioroScore,
      scoreTotalBase,
      scoreFinal1000,
      clasificacionRiesgo,
    },
    koRules,
    creditCapacity: {
      pagoMaxSoportado,
      montoMaximoCredito,
      plazoMeses,
    },
  };
}
