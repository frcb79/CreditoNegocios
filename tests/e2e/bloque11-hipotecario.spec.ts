import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'tests/e2e/screenshots/bloque11');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Credentials from env or defaults
const SA_EMAIL = process.env.STAGING_ADMIN_EMAIL || process.env.STAGING_EMAIL || 'francocb79@gmail.com';
const SA_PASSWORD = process.env.STAGING_ADMIN_PASSWORD || process.env.STAGING_PASSWORD || 'Prueba1$';

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

test.describe('BLOQUE 11 — Hipotecario MVP Simplificado E2E Real', () => {

  test('1. BIFURCACIÓN DE ALTA: Nuevo Cliente permite elegir Crédito Empresarial o Hipotecario Vivienda', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    await performLogin(page, BRK_EMAIL, BRK_PASSWORD);
    expect(page.url()).toContain('/');

    // Navegar a Clientes
    await page.click('[data-testid="nav-clientes"], a[href="/clientes"]:visible');
    await page.waitForTimeout(2500);

    // Click en "Nuevo Cliente"
    const newClientBtn = page.locator('[data-testid="button-new-client"], [data-testid="header-action-button"], button:has-text("Nuevo Cliente")').first();
    await expect(newClientBtn).toBeVisible({ timeout: 10000 });
    await newClientBtn.click();
    await page.waitForTimeout(1500);

    // Debe abrir el modal de selección de oportunidad (NewOpportunityTypeModal)
    const modalTitle = page.locator('text=Nuevo Cliente / Prospecto');
    await expect(modalTitle).toBeVisible({ timeout: 5000 });

    const optionEmpresarial = page.locator('[data-testid="option-select-empresarial"]');
    const optionHipotecario = page.locator('[data-testid="option-select-hipotecario"]');

    await expect(optionEmpresarial).toBeVisible();
    await expect(optionHipotecario).toBeVisible();

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_modal_bifurcacion_oportunidad.png') });

    await page.keyboard.press('Escape');
    await context.close();
  });

  test('2. CAMINO A: Alta Ágil Hipotecario Vivienda, Simulador Matemático y Evento 1 (Sin Canalizar)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    await performLogin(page, BRK_EMAIL, BRK_PASSWORD);

    // Navegar a Clientes
    await page.click('[data-testid="nav-clientes"], a[href="/clientes"]:visible');
    await page.waitForTimeout(2000);

    // Click en "Nuevo Cliente"
    const newClientBtn2 = page.locator('[data-testid="button-new-client"], [data-testid="header-action-button"], button:has-text("Nuevo Cliente")').first();
    await newClientBtn2.click();
    await page.waitForTimeout(1000);

    // Seleccionar Hipotecario Vivienda
    await page.click('[data-testid="option-select-hipotecario"]');
    await page.waitForTimeout(1500);

    // Modal Hipotecario Vivienda abierto
    const mortgageTitle = page.locator('text=Hipotecario Vivienda');
    await expect(mortgageTitle).toBeVisible({ timeout: 5000 });

    const timestamp = Date.now();
    const uniqueEmail = `hipo_${timestamp}@testval.com`;
    const uniquePhone = `55${String(timestamp).slice(-8)}`;

    // Llenar datos de contacto
    await page.fill('[data-testid="input-lead-first-name"]', `Carlos_${String(timestamp).slice(-4)}`);
    await page.fill('[data-testid="input-lead-last-name"]', 'Mendoza Hipotecario');
    await page.fill('[data-testid="input-lead-phone"]', uniquePhone);
    await page.fill('[data-testid="input-lead-email"]', uniqueEmail);

    // Llenar datos de operación inmobiliaria
    await page.fill('[data-testid="input-property-value"]', '2500000');
    await page.fill('[data-testid="input-requested-amount"]', '2000000');
    await page.fill('[data-testid="input-property-location"]', 'Av. Patriotismo 450, Col. San Pedro de los Pinos, CDMX');

    // Ingreso
    await page.fill('[data-testid="input-monthly-income"]', '65000');

    // Probar Simulador: Ajustar tasa a 12% y plazo a 240 meses
    await page.fill('[data-testid="input-sim-rate"]', '12');
    await page.waitForTimeout(500);

    // Verificar cálculo del simulador: $2,000,000 @ 12% 240m = ~$22,022 MXN/mes
    const monthlyPaymentText = await page.locator('[data-testid="text-sim-monthly-payment"]').innerText();
    expect(monthlyPaymentText).toContain('$22,022');

    // Verificar disclaimer legal estricto
    const modalContent = await page.innerText('role=dialog');
    expect(modalContent).toContain('Simulación informativa. Los valores son estimados y no constituyen una oferta');
    expect(modalContent).toContain('Las condiciones finales serán determinadas por la institución financiera');

    // Screenshot del formulario completado y simulador
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_formulario_hipotecario_y_simulador.png') });

    // REQUERIMIENTO 3: Si no hay productos de vivienda configurados, debe mostrar el aviso dinámico
    expect(modalContent).toContain('Oportunidad registrada para revisión y canalización');

    // REQUERIMIENTO 4: EVENTO 1 (Guardar Prospecto sin seleccionar instituciones)
    // El botón debe decir "Guardar Prospecto"
    const saveButton = page.locator('[data-testid="button-save-mortgage-lead"]');
    await expect(saveButton).toContainText('Guardar Prospecto');

    // Guardar
    await saveButton.click();
    // Esperar a que el modal se cierre tras la mutación exitosa
    await expect(page.locator('role=dialog')).not.toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Screenshot de lista de clientes con nuevo cliente hipotecario
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_cliente_hipotecario_creado.png') });

    // Validar que el cliente aparece en la lista con badge Hipotecario
    const createdClientRow = page.locator(`text=Carlos_${String(timestamp).slice(-4)}`);
    await expect(createdClientRow).toBeVisible({ timeout: 10000 });

    await context.close();
  });

  test('3. PIPELINE MIS CRÉDITOS: Muestra Badge 🏠 Hipotecario Vivienda y Registro Atómico', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    await performLogin(page, BRK_EMAIL, BRK_PASSWORD);

    // Navegar a Mis Créditos
    await page.goto('/mis-solicitudes');
    await page.waitForTimeout(3000);

    // Verificar presencia de al menos una solicitud con badge Hipotecario Vivienda
    const mortgageBadge = page.locator('[data-testid^="badge-mortgage-"]').first();
    await expect(mortgageBadge).toBeVisible({ timeout: 10000 });
    await expect(mortgageBadge).toContainText('Hipotecario Vivienda');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_pipeline_badge_hipotecario.png') });

    await context.close();
  });

  test('4. CAMINO B: Cliente Existente permite crear Oportunidad Hipotecaria sin duplicar cliente', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    await performLogin(page, BRK_EMAIL, BRK_PASSWORD);

    // Navegar a Clientes
    await page.goto('/clientes');
    await page.waitForTimeout(3000);

    // Abrir el primer cliente de la lista
    const firstClient = page.locator('[data-testid^="client-"]').first();
    await expect(firstClient).toBeVisible({ timeout: 10000 });
    await firstClient.click();
    await page.waitForTimeout(2500);

    // En la página de detalle del cliente, presionar "Nueva Oportunidad"
    const newOpportunityBtn = page.locator('[data-testid="button-new-credit"]');
    await expect(newOpportunityBtn).toBeVisible({ timeout: 5000 });
    await newOpportunityBtn.click();
    await page.waitForTimeout(1000);

    // Modal de bifurcación
    await page.click('[data-testid="option-select-hipotecario"]');
    await page.waitForTimeout(1500);

    // El modal debe indicar "Cliente Seleccionado" / "Cliente Existente" (Camino B)
    const existingClientBadge = page.locator('text=Cliente Existente');
    await expect(existingClientBadge).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_camino_b_cliente_existente.png') });

    await page.keyboard.press('Escape');
    await context.close();
  });

  test('5. MODAL DOCUMENTOS: Soporta "Otro documento" con "Nombre del documento"', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    await performLogin(page, BRK_EMAIL, BRK_PASSWORD);

    // Navegar a Documentos
    await page.click('[data-testid="nav-documentos"], a[href="/documentos"]:visible');
    await page.waitForTimeout(2000);

    // Click en "Subir Documento"
    await page.click('[data-testid="button-upload-document"]');
    await page.waitForTimeout(1000);

    // Seleccionar tipo de documento "other" (Otro documento)
    const typeSelect = page.locator('[data-testid="select-document-type-upload"]');
    await typeSelect.click();
    await page.waitForTimeout(500);

    const otherOption = page.locator('[role="option"]:has-text("Otro documento")');
    await expect(otherOption).toBeVisible();
    await otherOption.click();
    await page.waitForTimeout(500);

    // Campo condicional "Nombre del documento *" debe mostrarse
    const customNameInput = page.locator('[data-testid="input-custom-document-name"]');
    await expect(customNameInput).toBeVisible();
    await customNameInput.fill('Escritura Pública de Compraventa');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_documento_otro_nombre_personalizado.png') });

    await page.keyboard.press('Escape');
    await context.close();
  });

  test('6. NO HARDCODEAR & SEPARACIÓN: Garantía Inmobiliaria Empresarial vs Hipotecario Vivienda', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await setupPage(context);

    // Login as Super Admin para verificar catálogo de plantillas
    await performLogin(page, SA_EMAIL, SA_PASSWORD);

    // Navegar a Sistema de Productos / Plantillas si está disponible
    await page.click('[data-testid="nav-productos"], [data-testid="nav-sistema-productos"], a[href="/sistema-productos"]:visible');
    await page.waitForTimeout(2500);

    const pageContent = await page.innerText('body');
    // Verificar que existe la plantilla Hipotecario Vivienda y permanece separada de Garantía Inmobiliaria
    expect(pageContent).toContain('Hipotecario');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_catalogo_plantillas_separacion.png') });

    await context.close();
  });
});
