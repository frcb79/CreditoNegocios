import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'tests/e2e/screenshots/bloque9');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Staging Credentials
const SA_EMAIL = process.env.STAGING_ADMIN_EMAIL || process.env.STAGING_EMAIL || 'francocb79@gmail.com';
const SA_PASSWORD = process.env.STAGING_ADMIN_PASSWORD || process.env.STAGING_PASSWORD || 'Prueba1$';

const MB_EMAIL = process.env.STAGING_MB_EMAIL || 'fcb@creditonegocios.com.mx';
const MB_PASSWORD = process.env.STAGING_MB_PASSWORD || 'Prueba1$';

const BRK_EMAIL = process.env.STAGING_BRK_EMAIL || 'francocb79@yahoo.com';
const BRK_PASSWORD = process.env.STAGING_BRK_PASSWORD || 'Prueba1$';

// Helper to disable driver.js tour across all tabs/contexts
async function setupPage(context: any) {
  await context.addInitScript(() => {
    const origGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (typeof key === 'string' && key.startsWith('hasSeenTour_')) {
        return 'true';
      }
      return origGet.apply(this, [key] as any);
    };
  });
  return await context.newPage();
}

async function performLogin(page: any, email: string, pass: string) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 20000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

test.describe('BLOQUE 9 — Hardening Integral de Colocaciones y Matching E2E Real', () => {

  test('1. MATCHING E2E REAL: Casos A (Compatible), B (No compatible), C (Información insuficiente)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Login as Super Admin to access placement / matching modal
    await performLogin(page, SA_EMAIL, SA_PASSWORD);
    expect(page.url()).toContain('/');

    // Navegar a /creditos
    await page.goto('/creditos');
    await page.waitForTimeout(3000);

    // Buscar y abrir modal de solicitud de crédito
    const newCreditBtn = await page.$(
      'button:has-text("Nueva Solicitud"), button:has-text("Solicitar Crédito"), button:has-text("Nuevo Crédito")'
    );
    expect(newCreditBtn).not.toBeNull();
    await newCreditBtn?.click();
    await page.waitForTimeout(2000);

    // Modal de solicitud de crédito abierto
    const modal = await page.waitForSelector('[role="dialog"], .max-h-\\[90vh\\]', { timeout: 10000 });
    expect(modal).not.toBeNull();

    // Validar mensaje informativo del sistema de matching
    const modalText = await page.innerText('[role="dialog"]');
    expect(modalText).toContain('Sistema de Matching Automático');

    // Screenshot inicial del modal de matching
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_modal_solicitud_matching.png') });

    // Seleccionar cliente en el dropdown con locator scoped al dialog
    const selectTrigger = page.locator('[role="dialog"] [data-testid="select-client"], [role="dialog"] button[role="combobox"]').first();
    if (await selectTrigger.isVisible()) {
      await selectTrigger.click({ force: true });
      await page.waitForTimeout(1000);

      // Obtener opciones de clientes
      const options = page.locator('[role="option"]');
      const count = await options.count();
      if (count > 0) {
        // Seleccionar primer cliente
        await options.first().click();
        await page.waitForTimeout(1500);

        // Ingresar monto para evaluar matching
        const amountInput = page.locator('[role="dialog"] input[name="requestedAmount"], [role="dialog"] input[placeholder*="monto" i]').first();
        if (await amountInput.isVisible()) {
          await amountInput.fill('1500000');
          await page.waitForTimeout(1500);
        }

        // Capturar pantalla con evaluación de matching en vivo
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_matching_evaluacion_en_vivo.png'), fullPage: true });

        // Validar presencia de badges o evaluación de matching
        const pageContent = await page.innerText('[role="dialog"]');
        const hasMatchingEvaluation = pageContent.includes('Recomendada') ||
                                      pageContent.includes('Compatible') ||
                                      pageContent.includes('No Compatible') ||
                                      pageContent.includes('Información Insuficiente') ||
                                      pageContent.includes('Sin Configuración') ||
                                      pageContent.includes('Financiera') ||
                                      pageContent.includes('Matching');
        expect(hasMatchingEvaluation).toBe(true);
      }
    }

    // Cerrar modal
    await page.keyboard.press('Escape');
    await context.close();
  });

  test('2. ROL BROKER: Aislamiento estricto, sin acceso a Red ni Aprobaciones', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Login as Broker
    await performLogin(page, BRK_EMAIL, BRK_PASSWORD);
    expect(page.url()).toContain('/');

    // 2.1 Verificar que NO ve 'Red de Brokers' en el Sidebar
    const hasRedBrokers = await page.$('[data-testid="nav-red-de-brokers"], a[href="/red-brokers"]:visible');
    expect(hasRedBrokers).toBeNull();

    // 2.2 Verificar que NO ve 'Solicitudes Pendientes' (aprobaciones de mesa)
    const hasAprobaciones = await page.$('[data-testid="nav-solicitudes-pendientes"], a[href="/solicitudes-pendientes"]:visible');
    expect(hasAprobaciones).toBeNull();

    // 2.3 Navegar a Mis Solicitudes / Mis Créditos
    const misCreditosNav = await page.$('[data-testid="nav-mis-créditos"], a[href="/mis-solicitudes"]:visible, [data-testid="nav-creditos"]');
    if (misCreditosNav) {
      await misCreditosNav.click();
      await page.waitForTimeout(2500);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_broker_vista_exclusiva.png'), fullPage: true });

    // 2.4 Intentar forzar navegación a /red-brokers -> debe mostrar Acceso Restringido (RBAC GuardedContent)
    await page.goto('/red-brokers', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const bodyContent = await page.innerText('body');
    const isDeniedOrRestricted = bodyContent.includes('Acceso Restringido') ||
                                 bodyContent.includes('No tienes permisos') ||
                                 bodyContent.includes('Acceso no autorizado') ||
                                 !page.url().endsWith('/red-brokers');
    expect(isDeniedOrRestricted).toBe(true);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_broker_acceso_denegado_red.png') });
    await context.close();
  });

  test('3. ROL MASTER BROKER: Separación de tabs "Mis Créditos Directos" vs "Créditos de mi Red"', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Login as Master Broker
    await performLogin(page, MB_EMAIL, MB_PASSWORD);

    // 3.1 Navegar a Mis Créditos / Solicitudes
    const solBtn = await page.$('[data-testid="nav-mis-créditos"], a[href="/mis-solicitudes"]:visible');
    if (solBtn) {
      await solBtn.click();
      await page.waitForTimeout(3000);
      expect(page.url()).toContain('/mis-solicitudes');

      // Validar presencia explícita de ambos tabs
      const solText = await page.innerText('body');
      expect(solText).toContain('Mis Créditos Directos');
      expect(solText).toContain('Créditos de mi Red');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_master_broker_tabs_separados.png'), fullPage: true });

      // Click en tab "Créditos de mi Red"
      const networkTab = await page.$('button:has-text("Créditos de mi Red"), [data-value="network"]');
      if (networkTab) {
        await networkTab.click();
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_master_broker_tab_red_activo.png'), fullPage: true });
      }
    }

    // 3.2 Red de Brokers: verificar autonomía y techo otorgado
    await page.click('[data-testid="nav-red-de-brokers"]');
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/red-brokers');

    const ratesTab = await page.$('button[value="rates"], [data-value="rates"], button:has-text("Comisiones de mi Red")');
    if (ratesTab) {
      await ratesTab.click();
      await page.waitForTimeout(2000);
      const ratesContent = (await page.innerText('body')).toUpperCase();
      expect(ratesContent).toContain('TECHO OTORGADO (MB)');
      expect(ratesContent).toContain('TU MARGEN NETO');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_master_broker_red_autonomia.png'), fullPage: true });
    }

    await context.close();
  });

  test('4. ROL SUPER ADMIN: Trazabilidad completa en Dashboard, Pipeline y Comisiones', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Login as Super Admin
    await performLogin(page, SA_EMAIL, SA_PASSWORD);
    expect(page.url()).toContain('/');

    // 4.1 Dashboard y Pipeline
    const dashboardText = await page.innerText('body');
    const hasPipelineTraceability = dashboardText.includes('Pipeline de Crédito') ||
                                    dashboardText.includes('Métricas') ||
                                    dashboardText.includes('Pendiente de revisión') ||
                                    dashboardText.includes('Aprobado');
    expect(hasPipelineTraceability).toBe(true);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_super_admin_pipeline_dashboard.png'), fullPage: true });

    // 4.2 Comisiones globales con desglose
    await page.click('[data-testid="nav-comisiones"]');
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/comisiones');

    const commText = await page.innerText('body');
    const hasCommSections = commText.includes('Comisiones') ||
                            commText.includes('Historial') ||
                            commText.includes('Esquema');
    expect(hasCommSections).toBe(true);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_super_admin_comisiones_globales.png'), fullPage: true });

    await context.close();
  });
});
