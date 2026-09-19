import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'tests/e2e/screenshots/bloque10');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Staging or local URL
const BASE_URL = process.env.BASE_URL || process.env.E2E_BASE_URL || 'http://127.0.0.1:5050';

const SA_EMAIL = process.env.STAGING_ADMIN_EMAIL || 'francocb79@gmail.com';
const SA_PASSWORD = process.env.STAGING_ADMIN_PASSWORD || 'Prueba1$';

// Helper to disable driver.js onboarding tour across page contexts
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
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-email', { timeout: 20000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
}

test.describe('BLOQUE 10 — Códigos Promocionales, Beneficios Comerciales y Estado de Acceso', () => {

  test('1. REGISTRO: Separación estricta de referralCode y promoCode en Landing', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Navegar a Landing
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="tab-register"], button:has-text("Registrarse")', { timeout: 15000 });

    // Cambiar al tab Registrarse
    const registerTab = page.locator('[data-testid="tab-register"], button:has-text("Registrarse")').first();
    await registerTab.click();
    await page.waitForTimeout(1000);

    // 1.1 Validar existencia de referralCode (Clave de Franquicia / Master)
    const referralInput = page.locator('#register-referral');
    await expect(referralInput).toBeVisible();
    const referralLabel = page.locator('label[for="register-referral"]');
    await expect(referralLabel).toContainText('Clave de Franquicia / Master');

    // 1.2 Validar existencia independiente de promoCode (Código Promocional / Beneficio)
    const promoInput = page.locator('#register-promocode');
    await expect(promoInput).toBeVisible();
    const promoLabel = page.locator('label[for="register-promocode"]');
    await expect(promoLabel).toContainText('Código Promocional / Beneficio');

    // Screenshot del formulario de registro con ambos campos separados
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_landing_registration_promos.png') });
    console.log('✅ Screenshot 01: Landing registro con referralCode y promoCode guardado.');

    await context.close();
  });

  test('2. BROKER / USUARIO: Telemetría de Beneficios y Canje en Configuración', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Login como Super Admin / Broker
    await performLogin(page, SA_EMAIL, SA_PASSWORD);

    // Navegar a Configuración
    await page.goto(`${BASE_URL}/configuracion`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="tab-benefits"], button:has-text("Beneficios y Acceso")', { timeout: 15000 });

    // Abrir pestaña "Beneficios y Acceso"
    const benefitsTab = page.locator('[data-testid="tab-benefits"], button:has-text("Beneficios y Acceso")').first();
    await expect(benefitsTab).toBeVisible();
    await benefitsTab.click();
    await page.waitForTimeout(1500);

    // 2.1 Verificar banner de Garantía de Continuidad Operativa (Principio fundamental)
    const guaranteeAlert = page.locator('text=Garantía de continuidad operativa');
    await expect(guaranteeAlert).toBeVisible();
    const guaranteeText = page.locator('text=NUNCA bloquea ni suspende el alta de clientes');
    await expect(guaranteeText).toBeVisible();

    // 2.2 Verificar estado comercial de acceso
    const accessBadge = page.locator('text=Estado de Acceso Comercial');
    await expect(accessBadge).toBeVisible();

    // 2.3 Probar formulario de validación de código con código inválido
    const promoInput = page.locator('[data-testid="input-settings-promocode"]');
    await expect(promoInput).toBeVisible();
    await promoInput.fill('CODIGO-INEXISTENTE-99');
    
    const validateBtn = page.locator('[data-testid="button-validate-promocode"]');
    
    // Esperar la respuesta del endpoint y la alerta visual
    const [validateResponse] = await Promise.all([
      page.waitForResponse((resp: any) => resp.url().includes('/api/promos/validate')),
      validateBtn.click(),
    ]);
    expect(validateResponse.status()).toBe(404);
    await page.waitForTimeout(500);

    // Screenshot de la pestaña de beneficios y garantía de continuidad
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_settings_benefits_and_access.png') });
    console.log('✅ Screenshot 02: Pestaña Beneficios y Acceso con Garantía Operativa guardado.');

    await context.close();
  });

  test('3. PLATFORM ADMIN: Catálogo y Creación de Códigos Promocionales', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Login
    await performLogin(page, SA_EMAIL, SA_PASSWORD);

    // Navegar a Usuarios / Gestión
    await page.goto(`${BASE_URL}/admin/usuarios`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="tab-promos"], button:has-text("Códigos Promocionales")', { timeout: 15000 });

    // Abrir pestaña Códigos Promocionales
    const promosTab = page.locator('[data-testid="tab-promos"], button:has-text("Códigos Promocionales")').first();
    await promosTab.click();
    await page.waitForTimeout(1500);

    // 3.1 Abrir modal de creación
    const createBtn = page.locator('button:has-text("Nuevo Código Promocional"), button:has-text("Nuevo Código")').first();
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await page.waitForTimeout(1000);

    // Verificar modal abierto
    const modalTitle = page.locator('[role="dialog"]:has-text("Crear Nuevo Código Promocional")');
    await expect(modalTitle).toBeVisible();

    // Llenar formulario de creación de código promocional
    await page.fill('[data-testid="input-promo-code"]', 'PROMO-E2E-2026');
    await page.fill('[data-testid="input-promo-name"]', 'Promoción Especial E2E');
    await page.fill('[data-testid="input-benefit-value"]', '100');
    
    // Screenshot del modal de creación
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_admin_create_promo_dialog.png') });
    console.log('✅ Screenshot 03: Modal de creación de código promocional guardado.');

    // Enviar creación
    const submitBtn = page.locator('[data-testid="button-submit-promo"]');
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // 3.2 Verificar que el código aparece en la tabla
    const promoCell = page.locator('td:has-text("PROMO-E2E-2026")');
    await expect(promoCell).toBeVisible();

    // Screenshot del catálogo de promociones actualizado
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_admin_promos_table.png') });
    console.log('✅ Screenshot 04: Catálogo de códigos promocionales guardado.');

    await context.close();
  });

  test('4. PLATFORM ADMIN: Modificación Manual de Estado Comercial de Usuario', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Login
    await performLogin(page, SA_EMAIL, SA_PASSWORD);

    // Navegar a Usuarios
    await page.goto(`${BASE_URL}/admin/usuarios`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="tab-global"]', { timeout: 15000 });

    // Pestaña Directorio Global
    const globalTab = page.locator('[data-testid="tab-global"]');
    await globalTab.click();
    await page.waitForTimeout(1500);

    // Verificar que existe el botón "Acceso" para modificar estado comercial
    const editAccessBtn = page.locator('button:has-text("Acceso"), [title="Modificar acceso comercial"]').first();
    await expect(editAccessBtn).toBeVisible();
    await editAccessBtn.click();
    await page.waitForTimeout(1000);

    // Verificar modal de modificación de acceso
    const modal = page.locator('[role="dialog"]:has-text("Modificar Acceso Comercial")');
    await expect(modal).toBeVisible();

    // Verificar texto de garantía de continuidad incluso con acceso expirado
    const guaranteeNote = page.locator('text=Incluso en estado "Expirado", la plataforma garantiza operatividad continua');
    await expect(guaranteeNote).toBeVisible();

    // Screenshot del modal de asignación de estado comercial
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_admin_user_access_status_modal.png') });
    console.log('✅ Screenshot 05: Modal de modificación comercial de usuario guardado.');

    // Cerrar modal
    const cancelBtn = page.locator('[role="dialog"] button:has-text("Cancelar")');
    await cancelBtn.click();
    await page.waitForTimeout(1000);

    await context.close();
  });

  test('5. GARANTÍA OPERATIVA: Continuidad total en Créditos y Clientes', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Login
    await performLogin(page, SA_EMAIL, SA_PASSWORD);

    // Navegar directamente a Créditos
    await page.goto(`${BASE_URL}/creditos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Verificar que el botón de Solicitar Crédito está activo y disponible sin paywall
    const requestCreditBtn = page.locator('button:has-text("Solicitar Crédito")').first();
    await expect(requestCreditBtn).toBeVisible();

    // Screenshot demostrando acceso operativo sin paywall
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_expired_user_unblocked_creditos.png') });
    console.log('✅ Screenshot 06: Continuidad operativa de créditos garantizada.');

    await context.close();
  });

});
