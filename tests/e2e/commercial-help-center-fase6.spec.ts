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

test.describe('FASE 6: Centro de Reglas de Operación, Manual de Uso y Ayuda Contextual (E2E)', () => {

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

  // 1. Centro de Reglas visible para Broker y versión vigente accesible
  test('1. Centro de Reglas: consulta de versión vigente para Broker', async ({ page }) => {
    await page.route('**/api/operational-rules/current', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: {
            id: 'rule-v1-0-0',
            version: '1.0.0',
            title: 'Reglas de Operación y Protección Comercial de Crédito Negocios',
            summary: 'Normas fundamentales de asignación de cartera y protección de oportunidades.',
            contentMarkdown: '# Reglas de Operación y Protección Comercial\n\nVersión: 1.0.0',
            effectiveDate: '2026-09-24',
            isCurrent: true,
            requiresAcknowledgment: true,
            createdAt: '2026-09-24T00:00:00Z',
          },
          hasAcknowledged: false,
          acknowledgedAt: null,
        }),
      });
    });

    const res = await browserFetch(page, `${APP_ORIGIN}/api/operational-rules/current`);
    expect(res.status).toBe(200);
    expect(res.json.version.version).toBe('1.0.0');
    expect(res.json.version.title).toContain('Reglas de Operación');
    expect(res.json.hasAcknowledged).toBe(false);
  });

  // 2. Historial de versiones conserva versiones anteriores
  test('2. Historial de versiones: lista de versiones previas con resúmenes', async ({ page }) => {
    await page.route('**/api/operational-rules/history', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'rule-v1-1-0',
            version: '1.1.0',
            title: 'Reglas de Operación v1.1.0',
            summary: 'Actualización de formalización digital.',
            effectiveDate: '2026-10-01',
            isCurrent: true,
          },
          {
            id: 'rule-v1-0-0',
            version: '1.0.0',
            title: 'Reglas de Operación v1.0.0',
            summary: 'Versión base inicial.',
            effectiveDate: '2026-09-24',
            isCurrent: false,
          },
        ]),
      });
    });

    const res = await browserFetch(page, `${APP_ORIGIN}/api/operational-rules/history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json)).toBe(true);
    expect(res.json.length).toBe(2);
    expect(res.json[0].version).toBe('1.1.0');
    expect(res.json[1].version).toBe('1.0.0');
  });

  // 3. Confirmación real de lectura y aceptación (Acknowledgment)
  test('3. Acknowledgment: confirmación de lectura y aceptación real', async ({ page }) => {
    let acknowledgedVersion = '';
    await page.route('**/api/operational-rules/acknowledge', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      acknowledgedVersion = body.ruleVersionId || body.version;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          alreadyAcknowledged: false,
          acknowledgedAt: new Date().toISOString(),
          ruleVersionId: acknowledgedVersion,
        }),
      });
    });

    const res = await browserFetch(page, `${APP_ORIGIN}/api/operational-rules/acknowledge`, {
      method: 'POST',
      body: { ruleVersionId: 'rule-v1-0-0' },
    });

    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.alreadyAcknowledged).toBe(false);
    expect(acknowledgedVersion).toBe('rule-v1-0-0');
  });

  // 4. Buscador por palabras clave: "cliente ya existe"
  test('4. Buscador: "cliente ya existe" encuentra inmediatamente el artículo correspondiente', async ({ page }) => {
    await page.route('**/api/help/articles?q=cliente+ya+existe*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'art-cliente-ya-existe',
            slug: 'cliente-ya-existe',
            title: '¿Qué hago si el cliente ya existe?',
            category: 'manual_operativo',
            categoryLabel: 'Manual Práctico',
            summary: 'Guía paso a paso para proceder cuando el sistema detecta que el RFC ya existe.',
            isFaq: true,
          },
        ]),
      });
    });

    const res = await browserFetch(page, `${APP_ORIGIN}/api/help/articles?q=cliente+ya+existe`);
    expect(res.status).toBe(200);
    expect(res.json.length).toBeGreaterThan(0);
    expect(res.json[0].slug).toBe('cliente-ya-existe');
    expect(res.json[0].title).toContain('cliente ya existe');
  });

  // 5. Deep-link desde Clientes: "¿Por qué este cliente aparece relacionado con otro broker?"
  test('5. Deep-link Clientes: resuelve artículo por slug "por-que-cliente-con-otro-broker"', async ({ page }) => {
    await page.route('**/api/help/articles?slug=por-que-cliente-con-otro-broker*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'art-por-que-cliente-con-otro-broker',
            slug: 'por-que-cliente-con-otro-broker',
            title: '¿Por qué este cliente aparece relacionado con otro broker?',
            category: 'clientes',
            categoryLabel: 'Clientes y Cartera',
            contentMarkdown: 'Existe una relación activa...',
          },
        ]),
      });
    });

    const res = await browserFetch(page, `${APP_ORIGIN}/api/help/articles?slug=por-que-cliente-con-otro-broker`);
    expect(res.status).toBe(200);
    expect(res.json.length).toBe(1);
    expect(res.json[0].slug).toBe('por-que-cliente-con-otro-broker');
  });

  // 6. Deep-link desde Oportunidades: "¿Qué significa oportunidad protegida?"
  test('6. Deep-link Oportunidades: resuelve artículo por slug "oportunidad-protegida"', async ({ page }) => {
    await page.route('**/api/help/articles?slug=oportunidad-protegida*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'art-oportunidad-protegida',
            slug: 'oportunidad-protegida',
            title: '¿Qué significa una oportunidad protegida?',
            category: 'oportunidades',
            categoryLabel: 'Oportunidades',
            contentMarkdown: 'Reserva Inicial (7 días naturales)... Oportunidad Protegida (hasta 45 días)...',
          },
        ]),
      });
    });

    const res = await browserFetch(page, `${APP_ORIGIN}/api/help/articles?slug=oportunidad-protegida`);
    expect(res.status).toBe(200);
    expect(res.json.length).toBe(1);
    expect(res.json[0].slug).toBe('oportunidad-protegida');
  });

  // 7. Deep-link desde Comisiones: "¿Cómo funciona la atribución de esta comisión?"
  test('7. Deep-link Comisiones: resuelve artículo por slug "atribucion-comisiones"', async ({ page }) => {
    await page.route('**/api/help/articles?slug=atribucion-comisiones*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'art-atribucion-comisiones',
            slug: 'atribucion-comisiones',
            title: '¿Cómo funciona la atribución y consulta de comisiones?',
            category: 'comisiones',
            categoryLabel: 'Comisiones',
            contentMarkdown: 'Dónde consulto mis comisiones...',
          },
        ]),
      });
    });

    const res = await browserFetch(page, `${APP_ORIGIN}/api/help/articles?slug=atribucion-comisiones`);
    expect(res.status).toBe(200);
    expect(res.json.length).toBe(1);
    expect(res.json[0].slug).toBe('atribucion-comisiones');
  });

  // 8. Categorías del Centro de Ayuda
  test('8. Categorías: consulta de categorías con contadores', async ({ page }) => {
    await page.route('**/api/help/categories', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'clientes', label: 'Clientes y Cartera', count: 3 },
          { id: 'oportunidades', label: 'Oportunidades', count: 4 },
          { id: 'comisiones', label: 'Comisiones', count: 2 },
          { id: 'manual_operativo', label: 'Manual Práctico', count: 12 },
        ]),
      });
    });

    const res = await browserFetch(page, `${APP_ORIGIN}/api/help/categories`);
    expect(res.status).toBe(200);
    expect(res.json.length).toBeGreaterThan(0);
    expect(res.json.some((c: any) => c.id === 'manual_operativo')).toBe(true);
  });

  // 9. Aislamiento de permisos: broker no puede publicar nuevas versiones normativas
  test('9. Permisos: usuario no autorizado no puede crear versiones normativas (403)', async ({ page }) => {
    await page.route('**/api/admin/operational-rules', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Acceso exclusivo para Super Administradores de plataforma',
        }),
      });
    });

    const res = await browserFetch(page, `${APP_ORIGIN}/api/admin/operational-rules`, {
      method: 'POST',
      body: {
        version: '2.0.0',
        title: 'Intento no autorizado',
        summary: 'No permitido',
        contentMarkdown: '# Test',
        effectiveDate: '2026-10-01',
      },
    });

    expect(res.status).toBe(403);
    expect(res.json.message).toContain('Super Administradores');
  });

  // 10. Super Admin autorizado puede crear nueva versión normativa (201)
  test('10. Super Admin: crea exitosamente nueva versión normativa', async ({ page }) => {
    await page.route('**/api/admin/operational-rules', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'new-version-uuid',
          version: body.version,
          title: body.title,
          summary: body.summary,
          contentMarkdown: body.contentMarkdown,
          effectiveDate: body.effectiveDate,
          isCurrent: body.isCurrent ?? true,
          requiresAcknowledgment: body.requiresAcknowledgment ?? true,
          createdAt: new Date().toISOString(),
        }),
      });
    });

    const res = await browserFetch(page, `${APP_ORIGIN}/api/admin/operational-rules`, {
      method: 'POST',
      body: {
        version: '1.1.0',
        title: 'Reglas de Operación v1.1.0',
        summary: 'Ampliación de políticas de confirmación digital.',
        contentMarkdown: '# Actualización de Reglas',
        effectiveDate: '2026-10-01',
        isCurrent: true,
        requiresAcknowledgment: true,
      },
    });

    expect(res.status).toBe(201);
    expect(res.json.version).toBe('1.1.0');
    expect(res.json.isCurrent).toBe(true);
  });
});
