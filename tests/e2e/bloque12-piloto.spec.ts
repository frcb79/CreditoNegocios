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

test.describe('BLOQUE 12.1 — Validación Pantalla Piloto (Gestión de Créditos)', () => {

  test('1. Super Admin: Validación visual de tabla, modal y acciones', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await setupPage(context);

    console.log('Login Super Admin...');
    await performLogin(page, SA_EMAIL, SA_PASSWORD);

    await page.goto('/creditos', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Screenshot after Super Admin
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_creditos_super_admin.png'), fullPage: true });

    // Validar encabezados de la tabla piloto
    const tableHeader = page.locator('table thead');
    await expect(tableHeader).toBeVisible();
    await expect(tableHeader).toContainText('Cliente / Expediente');
    await expect(tableHeader).toContainText('Producto / Vertical');
    await expect(tableHeader).toContainText('Monto');
    await expect(tableHeader).toContainText('Financiera');
    await expect(tableHeader).toContainText('Estado');
    await expect(tableHeader).toContainText('Originador');
    await expect(tableHeader).toContainText('Actualizado');
    await expect(tableHeader).toContainText('Acciones');

    // Validar CTA "+ Nueva Solicitud"
    const newCreditBtn = page.locator('[data-testid="button-request-credit"]').first();
    await expect(newCreditBtn).toBeVisible();
    await expect(newCreditBtn).toContainText('Nueva Solicitud');

    // Probar apertura y cierre de modal Nueva Solicitud
    await newCreditBtn.click();
    await page.waitForTimeout(1000);
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    // Cerrar modal
    const closeBtn = page.locator('[role="dialog"] button:has-text("Cancelar"), [role="dialog"] button[aria-label="Close"]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // Validar que las filas tengan el botón Gestionar
    const gestionarBtn = page.locator('table tbody button:has-text("Gestionar")').first();
    if (await gestionarBtn.isVisible()) {
      await gestionarBtn.click();
      await page.waitForTimeout(1500);
      const detailDialog = page.locator('[role="dialog"]').first();
      await expect(detailDialog).toBeVisible();
      // Cerrar modal
      const closeDetailBtn = detailDialog.getByRole('button', { name: /close|cerrar|cancelar/i }).first();
      if (await closeDetailBtn.isVisible()) {
        await closeDetailBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(500);
    }

    await context.close();
  });

  test('2. Master Broker: Validación visual y tabs Directos vs Red', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await setupPage(context);

    console.log('Login Master Broker...');
    await performLogin(page, MB_EMAIL, MB_PASSWORD);

    await page.goto('/creditos', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Screenshot after Master Broker
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_creditos_master_broker.png'), fullPage: true });

    // Validar presencia de tabs
    const directTab = page.locator('button:has-text("Mis Créditos Directos")').first();
    const networkTab = page.locator('button:has-text("Créditos de mi Red")').first();
    await expect(directTab).toBeVisible();
    await expect(networkTab).toBeVisible();

    // Alternar tabs
    await networkTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_creditos_master_broker_red.png'), fullPage: true });

    await directTab.click();
    await page.waitForTimeout(500);

    await context.close();
  });

  test('3. Broker: Validación visual', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await setupPage(context);

    console.log('Login Broker...');
    await performLogin(page, BRK_EMAIL, BRK_PASSWORD);

    await page.goto('/creditos', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Screenshot after Broker
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'after_creditos_broker.png'), fullPage: true });

    // Validar badge hipotecario si está presente
    const mortgageBadge = page.locator('[data-testid^="badge-mortgage-"]').first();
    if (await mortgageBadge.isVisible()) {
      await expect(mortgageBadge).toContainText('Hipotecario Vivienda');
    }

    await context.close();
  });
});
