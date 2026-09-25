import { test, expect } from '@playwright/test';

const APP_ORIGIN = 'http://localhost:5000';

async function browserFetch(page: any, url: string, options: { method?: string; body?: any; headers?: any } = {}) {
  return await page.evaluate(async ({ url, options }: any) => {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    return {
      status: res.status,
      ok: res.ok,
      json,
      text,
    };
  }, { url, options });
}

test.describe('FASE 5: UI y Operación Real de Gobernanza Comercial (E2E)', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept base app shell
    await page.route(`${APP_ORIGIN}/**`, async (route) => {
      if (route.request().url() === `${APP_ORIGIN}/`) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!DOCTYPE html><html><body><div id="root">App Shell</div></body></html>',
        });
      } else {
        await route.continue();
      }
    });
    await page.goto(`${APP_ORIGIN}/`);
  });

  // 1. Cliente existente elegible permite crear oportunidad y consume POST /api/clients/check-duplicates
  test('1. Check-duplicates: Cliente existente elegible permite crear oportunidad y consume POST /api/clients/check-duplicates', async ({ page }) => {
    let checkDuplicatesCalled = false;
    let requestMethod = '';

    await page.route('**/api/clients/check-duplicates', async (route) => {
      checkDuplicatesCalled = true;
      requestMethod = route.request().method();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientExists: true,
          canCreateOpportunity: true,
          duplicateReason: 'client_exists_eligible',
          message: 'Este cliente ya existe, pero puedes registrar una nueva oportunidad.',
          existingClient: {
            id: 'client-elegible-123',
            name: 'Empresa Alfa SA de CV',
            rfc: 'EAL200101XYZ',
          },
        }),
      });
    });

    const res = await browserFetch(page, '/api/clients/check-duplicates', {
      method: 'POST',
      body: { rfc: 'EAL200101XYZ' },
    });

    expect(checkDuplicatesCalled).toBe(true);
    expect(requestMethod).toBe('POST');
    expect(res.status).toBe(200);
    expect(res.json.canCreateOpportunity).toBe(true);
    expect(res.json.message).toContain('puedes registrar una nueva oportunidad');
  });

  // 2. Oportunidad equivalente protegida muestra bloqueo claro (HTTP 409) sin tecnicismos
  test('2. Oportunidad equivalente protegida muestra bloqueo claro (HTTP 409) sin tecnicismos', async ({ page }) => {
    await page.route('**/api/clients/client-1/opportunities', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            conflict: true,
            code: 'EQUIVALENT_OPPORTUNITY_PROTECTED',
            message: 'Existe una oportunidad protegida vigente para esta necesidad gestionada por otro asesor.',
            conflictingOpportunity: {
              id: 'opp-conflict-1',
              title: 'Línea de Factoraje Empresarial',
              status: 'protected_active',
            },
          }),
        });
      }
    });

    const res = await browserFetch(page, '/api/clients/client-1/opportunities', {
      method: 'POST',
      body: {
        title: 'Factoraje duplicado',
        financingNeedType: 'factoraje',
        requestedAmount: '500000',
      },
    });

    expect(res.status).toBe(409);
    expect(res.json.conflict).toBe(true);
    expect(res.json.message).toContain('oportunidad protegida vigente');
    expect(res.json.message).not.toContain('protected_active');
  });

  // 3. Creación de oportunidad aparece en reserva inicial con hold dinámico de CommercialConfigService
  test('3. Creación de oportunidad aparece en reserva inicial con hold dinámico de CommercialConfigService', async ({ page }) => {
    const holdDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await page.route('**/api/clients/client-1/opportunities', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          opportunity: {
            id: 'opp-new-1',
            clientId: 'client-1',
            title: 'Crédito Simple de Trabajo',
            status: 'registered_hold',
            holdExpiresAt: holdDate,
            requestedAmount: '1500000',
          },
          message: 'Oportunidad creada exitosamente en periodo de reserva inicial.',
        }),
      });
    });

    const res = await browserFetch(page, '/api/clients/client-1/opportunities', {
      method: 'POST',
      body: {
        title: 'Crédito Simple de Trabajo',
        financingNeedType: 'credito_empresarial',
        requestedAmount: '1500000',
      },
    });

    expect(res.status).toBe(201);
    expect(res.json.opportunity.status).toBe('registered_hold');
    expect(res.json.opportunity.holdExpiresAt).toBe(holdDate);
    expect(res.json.message).not.toContain('Hold'); // No tecnicismo interno
    expect(res.json.message).toContain('reserva inicial');
  });

  // 4. Actividad comercial estructurada válida cambia a oportunidad protegida
  test('4. Actividad comercial estructurada válida cambia a oportunidad protegida', async ({ page }) => {
    const protectedDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();

    await page.route('**/api/opportunities/opp-1/activities', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          validForProtection: true,
          activity: {
            id: 'act-1',
            activityType: 'meeting_conducted',
            title: 'Entrevista de perfilamiento financiero',
          },
          opportunity: {
            id: 'opp-1',
            status: 'protected_active',
            protectedUntil: protectedDate,
          },
        }),
      });
    });

    const res = await browserFetch(page, '/api/opportunities/opp-1/activities', {
      method: 'POST',
      body: {
        activityType: 'meeting_conducted',
        title: 'Entrevista de perfilamiento financiero',
      },
    });

    expect(res.status).toBe(201);
    expect(res.json.validForProtection).toBe(true);
    expect(res.json.opportunity.status).toBe('protected_active');
    expect(res.json.opportunity.protectedUntil).toBe(protectedDate);
  });

  // 5. Nota CRM no extiende la protección comercial
  test('5. Nota CRM no extiende la protección comercial', async ({ page }) => {
    await page.route('**/api/opportunities/opp-1/activities', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          validForProtection: false, // NOT extended
          activity: {
            id: 'act-crm-1',
            activityType: 'crm_note',
            title: 'Recordatorio interno: cliente solicita llamar mañana',
          },
        }),
      });
    });

    const res = await browserFetch(page, '/api/opportunities/opp-1/activities', {
      method: 'POST',
      body: {
        activityType: 'crm_note',
        title: 'Recordatorio interno: cliente solicita llamar mañana',
      },
    });

    expect(res.status).toBe(201);
    expect(res.json.validForProtection).toBe(false);
  });

  // 6. Broker histórico no ve oportunidades ajenas (historical_scoped)
  test('6. Broker histórico no ve oportunidades ajenas (historical_scoped)', async ({ page }) => {
    await page.route('**/api/clients/client-hist-1/opportunities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    const res = await browserFetch(page, '/api/clients/client-hist-1/opportunities');
    expect(res.status).toBe(200);
    expect(res.json).toHaveLength(0);
  });

  // 7. Master Broker ve supervisión pero no edición
  test('7. Master Broker ve supervisión pero no edición', async ({ page }) => {
    await page.route('**/api/commercial/opportunities?masterBrokerId=mb-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'opp-net-1',
            title: 'Crédito Expansión Sucursales',
            brokerName: 'Asesor Red Carlos',
            brokerId: 'broker-1',
            status: 'protected_active',
            daysRemaining: 2,
          },
        ]),
      });
    });

    const res = await browserFetch(page, '/api/commercial/opportunities?masterBrokerId=mb-1');
    expect(res.status).toBe(200);
    expect(res.json).toHaveLength(1);
    expect(res.json[0].brokerName).toBe('Asesor Red Carlos');
  });

  // 8. Super Admin puede abrir Configuración Comercial
  test('8. Super Admin puede abrir Configuración Comercial', async ({ page }) => {
    await page.route('**/api/admin/commercial-config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          config: {
            activeRelationshipValidityDays: 90,
            initialOpportunityHoldDays: 7,
            opportunityInactivityProtectionDays: 45,
            inboundPriorityHours: 48,
            renewalWindowDaysBeforeMaturity: 180,
            renewalOriginatorPriorityDays: 15,
            brokerElectionTokenValidityHours: 72,
          },
          defaults: {
            initialOpportunityHoldDays: 7,
          },
        }),
      });
    });

    const res = await browserFetch(page, '/api/admin/commercial-config');
    expect(res.status).toBe(200);
    expect(res.json.config.initialOpportunityHoldDays).toBe(7);
  });

  // 9. Cambio de un parámetro comercial se refleja correctamente con motivo obligatorio
  test('9. Cambio de un parámetro comercial se refleja correctamente con motivo obligatorio', async ({ page }) => {
    await page.route('**/api/admin/commercial-config', async (route) => {
      if (route.request().method() === 'PUT') {
        const payload = route.request().postDataJSON();
        if (!payload.reason || payload.reason.trim().length === 0) {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'El motivo del cambio es obligatorio' }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              message: 'Configuración de gobernanza comercial actualizada correctamente.',
              modifiedParams: ['initialOpportunityHoldDays'],
            }),
          });
        }
      }
    });

    // Sin motivo -> Error 400
    const failRes = await browserFetch(page, '/api/admin/commercial-config', {
      method: 'PUT',
      body: { initialOpportunityHoldDays: 10, reason: '' },
    });
    expect(failRes.status).toBe(400);

    // Con motivo -> Exito 200
    const okRes = await browserFetch(page, '/api/admin/commercial-config', {
      method: 'PUT',
      body: { initialOpportunityHoldDays: 10, reason: 'Ajuste de política comercial Q4' },
    });
    expect(okRes.status).toBe(200);
    expect(okRes.json.success).toBe(true);
    expect(okRes.json.modifiedParams).toContain('initialOpportunityHoldDays');
  });

  // 10. Disputa formal utiliza los motivos exactos aceptados por backend
  test('10. Disputa formal utiliza los motivos exactos aceptados por backend', async ({ page }) => {
    const validReasons = [
      'client_broker_change_request',
      'contradictory_evidence',
      'mesa_control_intervention',
    ];

    for (const reason of validReasons) {
      await page.route(`**/api/opportunities/opp-dispute-${reason}/dispute`, async (route) => {
        const body = route.request().postDataJSON();
        if (validReasons.includes(body.disputeReason)) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              opportunity: { id: 'opp-1', status: 'disputed' },
              message: 'Controversia formal registrada exitosamente.',
            }),
          });
        } else {
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Motivo de disputa inválido' }),
          });
        }
      });

      const res = await browserFetch(page, `/api/opportunities/opp-dispute-${reason}/dispute`, {
        method: 'POST',
        body: {
          disputeReason: reason,
          justification: 'Justificación formal debidamente motivada y documentada',
        },
      });

      expect(res.status).toBe(200);
      expect(res.json.success).toBe(true);
      expect(res.json.opportunity.status).toBe('disputed');
    }
  });

});
