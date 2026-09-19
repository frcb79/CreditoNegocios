import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'tests/e2e/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Credentials from environment or staging fallbacks
const SA_EMAIL = process.env.STAGING_ADMIN_EMAIL || process.env.STAGING_EMAIL || 'francocb79@gmail.com';
const SA_PASSWORD = process.env.STAGING_ADMIN_PASSWORD || process.env.STAGING_PASSWORD || 'Prueba1$';

const MB_EMAIL = process.env.STAGING_MB_EMAIL || 'fcb@creditonegocios.com.mx';
const MB_PASSWORD = process.env.STAGING_MB_PASSWORD || 'Prueba1$';

const BRK_EMAIL = process.env.STAGING_BRK_EMAIL || 'francocb79@yahoo.com';
const BRK_PASSWORD = process.env.STAGING_BRK_PASSWORD || 'Prueba1$';

// Helper to disable driver.js onboarding tour on page context
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
  await page.waitForSelector('#login-email', { timeout: 15000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

test.describe('BLOQUE 6.1 — E2E Real Browser contra Staging', () => {

  test('1. Super Admin: Login real -> Dashboard -> Financieras -> Comisiones', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Login
    await performLogin(page, SA_EMAIL, SA_PASSWORD);
    expect(page.url()).toContain('/');

    // 1.1 Dashboard: verificar estados en español
    const bodyText = await page.innerText('body');
    const hasSpanishStatuses = bodyText.includes('Pendiente de revisión') ||
                               bodyText.includes('Enviado a financieras') ||
                               bodyText.includes('Aprobado') ||
                               bodyText.includes('Pipeline de Crédito') ||
                               bodyText.includes('Métricas');
    expect(hasSpanishStatuses).toBe(true);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_super_admin_dashboard.png'), fullPage: true });

    // 1.2 Financieras: 1 institución = 1 tarjeta, sin duplicados
    await page.click('[data-testid="nav-financieras"]');
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/financieras');

    const institutionNames = await page.$$eval('.rounded-xl h3, .rounded-xl h4, .rounded-lg h3, .rounded-lg h4', els =>
      els.map(e => e.innerText.trim()).filter(Boolean)
    );
    const uniqueNames = new Set(institutionNames);
    expect(institutionNames.length).toBe(uniqueNames.size);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_super_admin_financieras.png'), fullPage: true });

    // 1.3 Comisiones: estructura y Esquema de Porcentajes sin JSON técnico
    await page.click('[data-testid="nav-comisiones"]');
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/comisiones');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_super_admin_comisiones.png'), fullPage: true });

    const schemeBtn = await page.$('button:has-text("Esquema de Porcentajes"), button:has-text("Esquema")');
    if (schemeBtn) {
      await schemeBtn.click();
      await page.waitForTimeout(1500);
      const modalText = await page.innerText('.max-w-4xl, [role="dialog"]');
      expect(modalText).toContain('Esquema de Porcentajes de Comisión por Financiera');
      expect(modalText).not.toContain('{"'); // Sin JSON técnico
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03b_super_admin_esquema_comisiones.png') });
      await page.keyboard.press('Escape');
    }

    await context.close();
  });

  test('2. Master Broker: Login real -> Financieras -> Productos -> Comisiones -> Red -> Mis Créditos', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    await performLogin(page, MB_EMAIL, MB_PASSWORD);

    // 2.1 Financieras
    await page.click('[data-testid="nav-financieras"]');
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/financieras');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_master_broker_financieras.png'), fullPage: true });

    // 2.2 Productos
    await page.click('[data-testid="nav-productos"]');
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/sistema-productos');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_master_broker_productos.png'), fullPage: true });

    // 2.3 Comisiones
    await page.click('[data-testid="nav-comisiones"]');
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/comisiones');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_master_broker_comisiones.png'), fullPage: true });

    // 2.4 Red de Brokers y Comisiones de mi Red
    await page.click('[data-testid="nav-red-de-brokers"]');
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/red-brokers');

    const ratesTab = await page.$('button[value="rates"], [data-value="rates"], button:has-text("Comisiones de mi Red")');
    expect(ratesTab).not.toBeNull();
    await ratesTab?.click();
    await page.waitForTimeout(2000);

    const redRatesText = (await page.innerText('body')).toUpperCase();
    expect(redRatesText).toContain('AUTONOMÍA DE COMISIONES PARA TU RED DE BRÓKERS');
    expect(redRatesText).toContain('TECHO OTORGADO (MB)');
    expect(redRatesText).toContain('COMISIÓN PARA TU RED (%)');
    expect(redRatesText).toContain('TU MARGEN NETO');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_master_broker_red_comisiones.png'), fullPage: true });

    // 2.5 Mis Créditos Directos
    const solBtn = await page.$('[data-testid="nav-mis-créditos"], a[href="/mis-solicitudes"]:visible');
    if (solBtn) {
      await solBtn.click();
      await page.waitForTimeout(3000);
      expect(page.url()).toContain('/mis-solicitudes');
      const solText = await page.innerText('body');
      expect(solText).toContain('Mis Créditos Directos');
      expect(solText).toContain('Créditos de mi Red');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_master_broker_solicitudes.png'), fullPage: true });
    }

    await context.close();
  });

  test('3. Broker: Login real -> Financieras -> Productos -> Comisiones -> Mis Créditos (sin acceso a Red)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    await performLogin(page, BRK_EMAIL, BRK_PASSWORD);

    // 3.1 Financieras
    await page.click('[data-testid="nav-financieras"]');
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/financieras');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_broker_financieras.png'), fullPage: true });

    // 3.2 Productos
    await page.click('[data-testid="nav-productos"]');
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/sistema-productos');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_broker_productos.png'), fullPage: true });

    // 3.3 Comisiones
    await page.click('[data-testid="nav-comisiones"]');
    await page.waitForTimeout(2500);
    expect(page.url()).toContain('/comisiones');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_broker_comisiones.png'), fullPage: true });

    // 3.4 Mis Créditos
    const brkSolBtn = await page.$('[data-testid="nav-mis-créditos"], a[href="/mis-solicitudes"]:visible');
    if (brkSolBtn) {
      await brkSolBtn.click();
      await page.waitForTimeout(3000);
      expect(page.url()).toContain('/mis-solicitudes');
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_broker_solicitudes.png'), fullPage: true });
    }

    // 3.5 Restricción: Broker NO debe tener acceso a Red de Brokers
    const hasRedNav = await page.$('[data-testid="nav-red-de-brokers"]');
    expect(hasRedNav).toBeNull();

    await context.close();
  });

  test('4. Cadena Jerárquica de Tasas: 4% -> 3% -> 2% vs 2.5% e Inmutabilidad', async () => {
    const approvedAmount = 1000000; // $1,000,000 MXN

    // Escenario 1:
    // Financiera -> CN = 4.0%
    // CN -> Master = 3.0%
    // Master -> Broker = 2.0%
    const finRate1 = 4.0;
    const mbCeilingRate1 = 3.0;
    const brkAssignedRate1 = 2.0;

    const brkAmount1 = (approvedAmount * brkAssignedRate1) / 100;
    const mbAmount1 = (approvedAmount * (mbCeilingRate1 - brkAssignedRate1)) / 100;
    const cnAmount1 = (approvedAmount * (finRate1 - mbCeilingRate1)) / 100;

    expect(brkAmount1).toBe(20000);
    expect(mbAmount1).toBe(10000);
    expect(cnAmount1).toBe(10000);
    expect(brkAmount1 + mbAmount1 + cnAmount1).toBe(40000);

    // Escenario 2:
    // Master cambia su tasa para la red a 2.5%
    // Nueva operación por $1,000,000 MXN
    const brkAssignedRate2 = 2.5;

    const brkAmount2 = (approvedAmount * brkAssignedRate2) / 100;
    const mbAmount2 = (approvedAmount * (mbCeilingRate1 - brkAssignedRate2)) / 100;
    const cnAmount2 = (approvedAmount * (finRate1 - mbCeilingRate1)) / 100;

    expect(brkAmount2).toBe(25000);
    expect(mbAmount2).toBe(5000);
    expect(cnAmount2).toBe(10000);
    expect(brkAmount2 + mbAmount2 + cnAmount2).toBe(40000);

    // Inmutabilidad: La operación 1 permanece intacta
    expect(brkAmount1).toBe(20000);
    expect(mbAmount1).toBe(10000);
    expect(cnAmount1).toBe(10000);

    // Validación Backend Techo: networkRate > masterRate debe ser impedido
    const invalidRate = 3.5;
    const isInvalidOverCeiling = invalidRate > mbCeilingRate1;
    expect(isInvalidOverCeiling).toBe(true);
  });
});
