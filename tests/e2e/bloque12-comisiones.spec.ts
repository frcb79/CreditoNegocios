import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'tests/e2e/screenshots/bloque12');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Credentials
const SA_EMAIL = process.env.STAGING_ADMIN_EMAIL || process.env.STAGING_EMAIL || 'francocb79@gmail.com';
const SA_PASSWORD = process.env.STAGING_ADMIN_PASSWORD || process.env.STAGING_PASSWORD || 'Prueba1$';

const MB_EMAIL = process.env.STAGING_MB_EMAIL || 'fcb@creditonegocios.com.mx';
const MB_PASSWORD = process.env.STAGING_MB_PASSWORD || 'Prueba1$';

const BRK_EMAIL = process.env.STAGING_BRK_EMAIL || 'francocb79@yahoo.com';
const BRK_PASSWORD = process.env.STAGING_BRK_PASSWORD || 'Prueba1$';

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
  const page = await context.newPage();
  return page;
}

async function performLogin(page: any, email: string, pass: string) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 20000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

test.describe('BLOQUE 12.4 — Validación Pantalla Comisiones (Fintech Institucional)', () => {

  test('1. Super Admin: Validación visual de Comisiones, KPIs, tabs y tabla institucional', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await setupPage(context);

    console.log('Login Super Admin...');
    await performLogin(page, SA_EMAIL, SA_PASSWORD);

    await page.goto('/comisiones', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Screenshot after Super Admin Comisiones
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_comisiones_super_admin.png'), fullPage: true });

    // Validar encabezado y KPIs institucionales
    await expect(page.locator('h1:has-text("Comisiones")')).toBeVisible();
    await expect(page.locator('text=Por Aprobar')).toBeVisible();
    await expect(page.locator('text=Listo para Dispersión')).toBeVisible();

    // Validar subtabs de Super Admin
    await expect(page.locator('button[role="tab"]:has-text("Por Aprobar")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Centro de Dispersión")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Historial / Conciliación")')).toBeVisible();

    // Cambiar a Historial para verificar la tabla principal
    await page.click('button[role="tab"]:has-text("Historial / Conciliación")');
    await page.waitForTimeout(1500);

    // Verificar tabla o estado de lista institucional
    const tableHeader = page.locator('th:has-text("Operación / Crédito")');
    if (await tableHeader.isVisible()) {
      await expect(page.locator('th:has-text("Beneficiario Efectivo")')).toBeVisible();
      await expect(page.locator('th:has-text("Comisión")')).toBeVisible();
      await expect(page.locator('th:has-text("Estado")')).toBeVisible();
    }

    await context.close();
  });

  test('2. Master Broker: Validación visual de Comisiones y red legítima', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await setupPage(context);

    console.log('Login Master Broker...');
    await performLogin(page, MB_EMAIL, MB_PASSWORD);

    await page.goto('/comisiones', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Screenshot after Master Broker Comisiones
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_comisiones_master_broker.png'), fullPage: true });

    await expect(page.locator('h1:has-text("Mis Comisiones")')).toBeVisible();
    await expect(page.locator('text=Total Comisiones')).toBeVisible();

    await context.close();
  });

  test('3. Broker: Validación visual de Comisiones individuales', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await setupPage(context);

    console.log('Login Broker...');
    await performLogin(page, BRK_EMAIL, BRK_PASSWORD);

    await page.goto('/comisiones', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Screenshot after Broker Comisiones
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_comisiones_broker.png'), fullPage: true });

    await expect(page.locator('h1:has-text("Mis Comisiones")')).toBeVisible();

    await context.close();
  });

});
