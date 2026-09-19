/**
 * Script de Auditoría de Base de Datos / API de Staging — BLOQUE 9 (Sección 14)
 * Audita inconsistencias en:
 * - Créditos sin tenantId o con brokerId faltante
 * - Comisiones sin tenantId o comisiones huérfanas
 * - Solicitudes (creditSubmissionTargets) sin solicitud padre
 * - Productos sin institución
 * - Instituciones duplicadas o con propiedad anómala
 */

import * as fs from 'fs';
import * as path from 'path';

function loadLocalEnvFiles() {
  const files = [
    path.resolve(process.cwd(), '.env.staging.local'),
    path.resolve(process.cwd(), '.env.local'),
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadLocalEnvFiles();

const BASE_URL = (process.env.BACKEND_URL || 'https://creditonegocios-staging.up.railway.app').replace(/\/$/, '');
const SA_EMAIL = process.env.STAGING_ADMIN_EMAIL || process.env.STAGING_EMAIL || 'francocb79@gmail.com';
const SA_PASSWORD = process.env.STAGING_ADMIN_PASSWORD || process.env.STAGING_PASSWORD || 'Prueba1$';

function extractSessionCookie(headers: Headers): string {
  if (typeof (headers as any).getSetCookie === 'function') {
    const cookies = (headers as any).getSetCookie();
    if (Array.isArray(cookies) && cookies.length > 0) {
      return cookies.map((c: string) => c.split(';')[0]).join('; ');
    }
  }
  const raw = headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(',').map(s => s.split(';')[0].trim()).join('; ');
}

async function login(email: string, pass: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login failed (${res.status}): ${txt}`);
  }
  const cookie = extractSessionCookie(res.headers);
  if (!cookie) throw new Error('No session cookie returned');
  return cookie;
}

async function apiGet<T = any>(route: string, cookie: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${route}`, {
    method: 'GET',
    headers: { accept: 'application/json', cookie }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GET ${route} failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  return await res.json() as T;
}

interface AuditFinding {
  severity: 'ALTO' | 'MEDIO' | 'BAJO' | 'INFO';
  category: string;
  description: string;
  affectedId: string;
  details: any;
}

async function runAudit() {
  console.log('================================================================================');
  console.log('🔍 INICIANDO AUDITORÍA DE DATOS EN STAGING — BLOQUE 9 (SECCIÓN 14)');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Admin user: ${SA_EMAIL}`);
  console.log('================================================================================\n');

  const findings: AuditFinding[] = [];

  console.log('[1/6] Autenticando como Super Admin...');
  const cookie = await login(SA_EMAIL, SA_PASSWORD);
  console.log('  ✓ Sesión iniciada con éxito.\n');

  // 1. Fetch collections
  console.log('[2/6] Extrayendo colecciones de Staging...');
  const [credits, commissions, institutions, targets, products] = await Promise.all([
    apiGet<any[]>('/api/credits', cookie),
    apiGet<any[]>('/api/commissions', cookie),
    apiGet<any[]>('/api/financial-institutions', cookie),
    apiGet<any[]>('/api/credit-submission-targets', cookie),
    apiGet<any[]>('/api/institution-products', cookie).catch(() => [] as any[]),
  ]);

  console.log(`  ✓ Créditos obtenidos: ${credits.length}`);
  console.log(`  ✓ Comisiones obtenidas: ${commissions.length}`);
  console.log(`  ✓ Instituciones obtenidas: ${institutions.length}`);
  console.log(`  ✓ Targets de sumisión obtenidos: ${targets.length}`);
  console.log(`  ✓ Productos obtenidos: ${products.length}\n`);

  const creditIdMap = new Map<string, any>(credits.map(c => [c.id, c]));
  const institutionIdMap = new Map<string, any>(institutions.map(i => [i.id, i]));

  // 2. Audit Credits
  console.log('[3/6] Auditando Créditos (tenantId, brokerId, relaciones)...');
  let creditsWithoutTenant = 0;
  let creditsWithoutBroker = 0;
  for (const cred of credits) {
    if (!cred.brokerId) {
      creditsWithoutBroker++;
      findings.push({
        severity: 'ALTO',
        category: 'Créditos',
        description: 'Crédito sin brokerId asociado',
        affectedId: cred.id,
        details: { amount: cred.amount, status: cred.status, client: cred.client?.businessName }
      });
    }
    if (!cred.tenantId) {
      creditsWithoutTenant++;
      findings.push({
        severity: 'MEDIO',
        category: 'Créditos',
        description: 'Crédito sin tenantId (posible registro previo a multitenant)',
        affectedId: cred.id,
        details: { amount: cred.amount, brokerId: cred.brokerId, status: cred.status }
      });
    }
  }
  console.log(`  - Créditos sin brokerId: ${creditsWithoutBroker}`);
  console.log(`  - Créditos sin tenantId: ${creditsWithoutTenant}`);

  // 3. Audit Commissions
  console.log('\n[4/6] Auditando Comisiones (tenantId, brokerId, huérfanas, consistencia)...');
  let commWithoutCredit = 0;
  let commWithoutBroker = 0;
  let commWithoutTenant = 0;
  for (const comm of commissions) {
    if (!comm.brokerId) {
      commWithoutBroker++;
      findings.push({
        severity: 'ALTO',
        category: 'Comisiones',
        description: 'Comisión sin brokerId',
        affectedId: comm.id,
        details: { amount: comm.amount, status: comm.status }
      });
    }
    if (!comm.tenantId) {
      commWithoutTenant++;
      findings.push({
        severity: 'MEDIO',
        category: 'Comisiones',
        description: 'Comisión sin tenantId',
        affectedId: comm.id,
        details: { amount: comm.amount, creditId: comm.creditId }
      });
    }
    if (comm.creditId && !creditIdMap.has(comm.creditId)) {
      commWithoutCredit++;
      findings.push({
        severity: 'ALTO',
        category: 'Comisiones',
        description: 'Comisión huérfana: creditId no existe en base de datos',
        affectedId: comm.id,
        details: { missingCreditId: comm.creditId, amount: comm.amount }
      });
    }
  }
  console.log(`  - Comisiones huérfanas (crédito no existente): ${commWithoutCredit}`);
  console.log(`  - Comisiones sin brokerId: ${commWithoutBroker}`);
  console.log(`  - Comisiones sin tenantId: ${commWithoutTenant}`);

  // 4. Audit Submission Targets
  console.log('\n[5/6] Auditando Credit Submission Targets (solicitud padre, integridad)...');
  let targetsWithoutRequest = 0;
  let targetsWithoutInstitution = 0;
  for (const target of targets) {
    if (!target.requestId || !target.request) {
      targetsWithoutRequest++;
      findings.push({
        severity: 'ALTO',
        category: 'Submission Targets',
        description: 'Target sin solicitud padre (requestId huérfano o nulo)',
        affectedId: target.id,
        details: { requestId: target.requestId, status: target.status }
      });
    }
    if (!target.financialInstitutionId || !institutionIdMap.has(target.financialInstitutionId)) {
      targetsWithoutInstitution++;
      findings.push({
        severity: 'MEDIO',
        category: 'Submission Targets',
        description: 'Target con institución inexistente o no listada',
        affectedId: target.id,
        details: { financialInstitutionId: target.financialInstitutionId, status: target.status }
      });
    }
  }
  console.log(`  - Targets sin solicitud padre: ${targetsWithoutRequest}`);
  console.log(`  - Targets con institución ausente: ${targetsWithoutInstitution}`);

  // 5. Audit Financial Institutions & Products
  console.log('\n[6/6] Auditando Instituciones y Productos (duplicados, consistencia)...');
  const seenNames = new Map<string, string[]>();
  for (const inst of institutions) {
    const norm = (inst.name || '').trim().toLowerCase();
    if (!seenNames.has(norm)) {
      seenNames.set(norm, []);
    }
    seenNames.get(norm)!.push(inst.id);
  }

  let duplicateInstitutions = 0;
  for (const [name, ids] of seenNames.entries()) {
    if (ids.length > 1) {
      duplicateInstitutions++;
      findings.push({
        severity: 'MEDIO',
        category: 'Financieras',
        description: `Nombre de financiera duplicado: "${name}"`,
        affectedId: ids.join(', '),
        details: { count: ids.length, ids }
      });
    }
  }
  console.log(`  - Instituciones con nombres repetidos: ${duplicateInstitutions}`);

  let productsWithoutInst = 0;
  for (const prod of products) {
    const instId = prod.institutionId || prod.financialInstitutionId;
    if (!instId || !institutionIdMap.has(instId)) {
      productsWithoutInst++;
      findings.push({
        severity: 'ALTO',
        category: 'Productos',
        description: 'Producto sin financiera asociada válida',
        affectedId: prod.id,
        details: { institutionId: instId, name: prod.customName || prod.name }
      });
    }
  }
  console.log(`  - Productos sin financiera válida: ${productsWithoutInst}`);

  // Report Summary
  console.log('\n================================================================================');
  console.log('📋 RESUMEN DE AUDITORÍA DE DATOS DE STAGING:');
  console.log(`Total de hallazgos: ${findings.length}`);
  console.log(`- ALTO: ${findings.filter(f => f.severity === 'ALTO').length}`);
  console.log(`- MEDIO: ${findings.filter(f => f.severity === 'MEDIO').length}`);
  console.log(`- BAJO / INFO: ${findings.filter(f => f.severity === 'BAJO' || f.severity === 'INFO').length}`);
  console.log('================================================================================\n');

  if (findings.length > 0) {
    console.log('Detalle de anomalías encontradas:');
    for (const f of findings.slice(0, 20)) {
      console.log(`[${f.severity}] [${f.category}] ID: ${f.affectedId} -> ${f.description}`);
      if (Object.keys(f.details).length > 0) {
        console.log(`    Detalles: ${JSON.stringify(f.details)}`);
      }
    }
    if (findings.length > 20) {
      console.log(`... y ${findings.length - 20} hallazgos adicionales.`);
    }
  } else {
    console.log('🎉 EXCELENTE: No se encontraron anomalías en la base de Staging.');
  }

  // Save audit report
  const reportPath = path.resolve(process.cwd(), 'audit-staging-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    counts: {
      credits: credits.length,
      commissions: commissions.length,
      institutions: institutions.length,
      targets: targets.length,
      products: products.length
    },
    findings
  }, null, 2), 'utf8');
  console.log(`\nReporte guardado en: ${reportPath}`);
}

runAudit().catch(err => {
  console.error('❌ Error durante la auditoría:', err);
  process.exit(1);
});
