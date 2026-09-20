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

test.describe('BLOQUE 12.3 — Validación Pantalla Financieras (Fintech Institucional)', () => {

  test('1. Super Admin: Validación visual de tarjetas Financieras y menú de acciones', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await setupPage(context);

    console.log('Login Super Admin...');
    await performLogin(page, SA_EMAIL, SA_PASSWORD);

    await page.goto('/financieras', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Screenshot after Super Admin Financieras
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_financieras_super_admin.png'), fullPage: true });

    // Validar tarjetas
    const cards = page.locator('[data-testid^="financiera-"]');
    await expect(cards.first()).toBeVisible();

    // Validar botón primario en tarjeta
    const viewProductBtn = page.locator('text=Ver productos y detalle').first();
    await expect(viewProductBtn).toBeVisible();

    // Validar dropdown de acciones en admin
    const menuBtn = page.locator('[data-testid^="menu-financiera-"]').first();
    await expect(menuBtn).toBeVisible();

    await context.close();
  });

  test('2. Master Broker: Validación visual de Financieras', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await setupPage(context);

    console.log('Login Master Broker...');
    await performLogin(page, MB_EMAIL, MB_PASSWORD);

    await page.goto('/financieras', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Screenshot after Master Broker Financieras
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_financieras_master_broker.png'), fullPage: true });

    const cards = page.locator('[data-testid^="financiera-"]');
    await expect(cards.first()).toBeVisible();

    await context.close();
  });

  test('3. Broker: Validación visual de Financieras', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await setupPage(context);

    console.log('Login Broker...');
    await performLogin(page, BRK_EMAIL, BRK_PASSWORD);

    await page.goto('/financieras', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Screenshot after Broker Financieras
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_financieras_broker.png'), fullPage: true });

    const cards = page.locator('[data-testid^="financiera-"]');
    await expect(cards.first()).toBeVisible();

    await context.close();
  });

});
