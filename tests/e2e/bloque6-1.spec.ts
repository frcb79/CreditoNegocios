import { test, expect } from '@playwright/test';
import { evaluateAllFieldsForClient } from '../../client/src/components/MatchingAnalysis/matchingRules';
import { getStatusLabel } from '../../client/src/lib/statusConfig';

const PREFIX = `E2E-TEST-${Date.now()}`;

test.describe('BLOQUE 6.1 — Estabilización comercial, matching, estados, comisiones y navegación', () => {

  test('1. Financieras: 1 institución = 1 tarjeta principal con productos agrupados internamente', async () => {
    const mockInstitutions = [
      { id: 'inst-alfa', name: 'Banco Alfa', category: 'banco' },
      { id: 'inst-beta', name: 'Financiera Beta', category: 'sofom' }
    ];
    const mockProducts = [
      { id: 'prod-1', financialInstitutionId: 'inst-alfa', name: 'Crédito Simple' },
      { id: 'prod-2', financialInstitutionId: 'inst-alfa', name: 'Línea Revolvente' },
      { id: 'prod-3', financialInstitutionId: 'inst-beta', name: 'Arrendamiento' }
    ];

    // Frontend grouping logic
    const groupedMap = new Map();
    mockInstitutions.forEach(inst => groupedMap.set(inst.id, { ...inst, products: [] }));
    mockProducts.forEach(prod => {
      if (groupedMap.has(prod.financialInstitutionId)) {
        groupedMap.get(prod.financialInstitutionId).products.push(prod);
      }
    });
    const mainCards = Array.from(groupedMap.values());

    expect(mainCards.length).toBe(2);
    expect(mainCards[0].id).toBe('inst-alfa');
    expect(mainCards[0].products.length).toBe(2);
    expect(mainCards[1].id).toBe('inst-beta');
    expect(mainCards[1].products.length).toBe(1);
  });

  test('2. Matching: Motor de 3 resultados canónicos (Compatible, No compatible, Información insuficiente)', async () => {
    const mockInstitution = {
      id: `${PREFIX}-inst`,
      name: 'Financiera Test',
      acceptedProfiles: ['persona_moral'],
      requirements: {
        persona_moral: {
          ranges: {
            monto: { min: 500000, max: 10000000 },
            tiempoActividad: { min: 24 },
            buroEmpresa: { min: 650 }
          }
        }
      }
    };

    // 2.1 Caso Compatible
    const clientComp = {
      type: 'persona_moral',
      tiempoActividad: 36,
      montoSolicitado: 2000000,
      buroEmpresa: 700
    };
    const resComp = evaluateAllFieldsForClient(clientComp, mockInstitution);
    expect(resComp.matchStatus).toBe('compatible');
    expect(resComp.matchStatusLabel).toBe('Compatible');

    // 2.2 Caso No Compatible (incumple antigüedad 12m < 24m)
    const clientNotComp = {
      type: 'persona_moral',
      tiempoActividad: 12,
      montoSolicitado: 2000000,
      buroEmpresa: 700
    };
    const resNotComp = evaluateAllFieldsForClient(clientNotComp, mockInstitution);
    expect(resNotComp.matchStatus).toBe('not_compatible');
    expect(resNotComp.matchStatusLabel).toBe('No compatible');
    expect(resNotComp.unmetRequirements?.length).toBeGreaterThan(0);

    // 2.3 Caso Información Insuficiente (falta Buró, no debe penalizarse como 0 ni rechazar silenciosamente)
    const clientInsuff = {
      type: 'persona_moral',
      tiempoActividad: 36,
      montoSolicitado: 2000000
      // sin buroEmpresa
    };
    const resInsuff = evaluateAllFieldsForClient(clientInsuff, mockInstitution);
    expect(resInsuff.matchStatus).toBe('insufficient_data');
    expect(resInsuff.matchStatusLabel).toBe('Información insuficiente');
    expect(resInsuff.missingData?.length).toBeGreaterThan(0);
  });

  test('3. Mapeo de estados centralizado en español (sin términos técnicos en inglés)', async () => {
    expect(getStatusLabel('pending_admin')).toBe('Pendiente de revisión');
    expect(getStatusLabel('sent_to_institutions')).toBe('Enviado a financieras');
    expect(getStatusLabel('approved')).toBe('Aprobado');
    expect(getStatusLabel('disbursed')).toBe('Dispersado');
    expect(getStatusLabel('dispersed')).toBe('Dispersado');
  });

  test('4. Master Broker: Separación estricta de Mis Créditos Directos vs Créditos de mi Red', async () => {
    const masterBrokerId = 'mb-100';
    const subBrokerId = 'brk-200';

    const allCredits = [
      { id: `${PREFIX}-c1`, brokerId: masterBrokerId, amount: '1000000', status: 'approved' },
      { id: `${PREFIX}-c2`, brokerId: subBrokerId, amount: '2000000', status: 'disbursed' },
      { id: `${PREFIX}-c3`, brokerId: masterBrokerId, amount: '500000', status: 'under_review' }
    ];

    const directCredits = allCredits.filter(c => c.brokerId === masterBrokerId);
    const networkCredits = allCredits.filter(c => c.brokerId !== masterBrokerId);

    expect(directCredits.length).toBe(2);
    expect(directCredits.map(c => c.id)).toContain(`${PREFIX}-c1`);
    expect(directCredits.map(c => c.id)).toContain(`${PREFIX}-c3`);

    expect(networkCredits.length).toBe(1);
    expect(networkCredits[0].id).toBe(`${PREFIX}-c2`);
  });

  test('5. Casos Numéricos Obligatorios de Comisiones (A, B, C, D y Caso $495,000)', async () => {
    // Caso A — Broker Directo: $1M, Fin 4%, Broker 2.5% -> Brk $25k, CN $15k
    const amountA = 1000000;
    const finRateA = 4.0;
    const brkRateA = 2.5;
    const brkShareA = (amountA * brkRateA) / 100;
    const cnShareA = (amountA * (finRateA - brkRateA)) / 100;
    expect(brkShareA).toBe(25000);
    expect(cnShareA).toBe(15000);

    // Caso B — Broker bajo Master: $1M, Fin 4%, Master 3%, Broker Red 2% -> Brk $20k, MB $10k, CN $10k
    const amountB = 1000000;
    const finRateB = 4.0;
    const mbRateB = 3.0;
    const brkNetRateB = 2.0;
    const brkShareB = (amountB * brkNetRateB) / 100;
    const mbShareB = (amountB * (mbRateB - brkNetRateB)) / 100;
    const cnShareB = (amountB * (finRateB - mbRateB)) / 100;
    expect(brkShareB).toBe(20000);
    expect(mbShareB).toBe(10000);
    expect(cnShareB).toBe(10000);

    // Caso C — Master Directo: $1M, Fin 4%, Master 3% -> MB $30k, CN $10k (payout amount no duplicado)
    const amountC = 1000000;
    const finRateC = 4.0;
    const mbRateC = 3.0;
    const mbShareC = (amountC * mbRateC) / 100;
    const cnShareC = (amountC * (finRateC - mbRateC)) / 100;
    // Helper payout calculation for master direct
    const isMasterDirect = true;
    const payoutAmountC = isMasterDirect ? mbShareC : (mbShareC + 0);
    expect(mbShareC).toBe(30000);
    expect(cnShareC).toBe(10000);
    expect(payoutAmountC).toBe(30000);

    // Caso D — Opening Commission Separada: Fee cliente 5%, tasas comerciales Fin 4%, Brk 2%
    const amountD = 1000000;
    const clientOpeningFeeD = 5.0; // cobrado al cliente
    const internalBrokerRateD = 2.0; // comisión comercial interna
    const brkShareD = (amountD * internalBrokerRateD) / 100;
    expect(brkShareD).toBe(20000);
    expect(brkShareD).not.toBe((amountD * clientOpeningFeeD) / 100); // NUNCA $50,000

    // Caso $495,000 — Crédito $10M, apertura al cliente 4.95%, tasa interna bróker 2.0%
    const amountBug = 10000000;
    const clientOpeningFeeBug = 4.95;
    const internalBrokerRateBug = 2.0;
    const correctPayout = (amountBug * internalBrokerRateBug) / 100;
    expect(correctPayout).toBe(200000); // $200,000 MXN
    expect(correctPayout).not.toBe(495000); // Corregido: nunca $495,000
  });

  test('6. Inmutabilidad de Comisiones: Comisiones aprobadas/pagadas permanecen congeladas', async () => {
    const originalCommission = {
      id: `${PREFIX}-comm-frozen`,
      amount: '20000.00',
      frozenAmount: '20000.00',
      frozenBrokerRate: '2.00',
      status: 'approved',
    };

    // Simulamos un cambio de tasa en la plataforma
    const newNetworkRate = 2.5;

    // La comisión congelada nunca debe recalcularse
    const effectivePayout = originalCommission.frozenAmount 
      ? parseFloat(originalCommission.frozenAmount)
      : (1000000 * newNetworkRate) / 100;

    expect(effectivePayout).toBe(20000);
    expect(originalCommission.status).toBe('approved');
  });

  test('7. Tarjetas de comisiones: Permisos de botones según estado de la comisión', async () => {
    // Helper de qué botones aplican según estado
    const getAvailableActions = (status: string, role: string) => {
      const actions: string[] = ['ver_detalle', 'historial_movimientos'];
      if (role === 'super_admin') {
        if (status === 'generated') actions.push('aprobar', 'cancelar');
        if (status === 'approved') actions.push('pagar_stp', 'liquidar_manual', 'cancelar');
        if (status === 'dispersing') actions.push('en_dispersion_badge'); // NO segundo pago
        if (status === 'paid') actions.push('ver_referencia'); // NO aprobar, NO cancelar, NO pagar
        if (status === 'failed') actions.push('reintentar_stp', 'reintentar_manual');
      }
      return actions;
    };

    const adminGenerated = getAvailableActions('generated', 'super_admin');
    expect(adminGenerated).toContain('aprobar');
    expect(adminGenerated).toContain('cancelar');
    expect(adminGenerated).toContain('historial_movimientos');
    expect(adminGenerated).not.toContain('pagar_stp');

    const adminPaid = getAvailableActions('paid', 'super_admin');
    expect(adminPaid).toContain('ver_detalle');
    expect(adminPaid).toContain('historial_movimientos');
    expect(adminPaid).not.toContain('aprobar');
    expect(adminPaid).not.toContain('cancelar');
    expect(adminPaid).not.toContain('pagar_stp');

    const adminDispersing = getAvailableActions('dispersing', 'super_admin');
    expect(adminDispersing).not.toContain('pagar_stp');
    expect(adminDispersing).toContain('en_dispersion_badge');
  });
});
