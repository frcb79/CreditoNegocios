/**
 * Reproducible test script for direct staging endpoint verification (Bloque 2)
 *
 * Verifies:
 * 1. Rejection (400) without acceptTerms
 * 2. Rejection (400) without acknowledgePrivacy
 * 3. Rejection (400) with outdated/invalid termsVersion
 * 4. Rejection (400) with outdated/invalid privacyVersion
 * 5. Successful registration (201) when both valid confirmations and versions are sent
 * 6. DB checks in staging: no users or acceptances created for rejected attempts, exactly 2 acceptances created for valid user
 * 7. Query legal acceptance history via authenticated session (/api/legal/my-acceptances)
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'https://creditonegocios-staging.up.railway.app';
const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:neMoZUFoyWnqqzIrxdLIiUGOKamDllJa@trolley.proxy.rlwy.net:43850/railway';

async function run() {
  console.log(`--- Iniciando Pruebas de Endpoints en Staging (${BACKEND_URL}) ---`);

  const timestamp = Date.now();
  const testCases = [
    {
      name: '4a_Sin_Terminos',
      payload: {
        email: `test-no-terms-${timestamp}@creditonegocios-test.internal`,
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'No Terms',
        acceptTerms: false,
        acknowledgePrivacy: true,
        termsVersion: '1.0',
        privacyVersion: '1.0'
      },
      expectedStatus: 400
    },
    {
      name: '4b_Sin_Aviso',
      payload: {
        email: `test-no-privacy-${timestamp}@creditonegocios-test.internal`,
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'No Privacy',
        acceptTerms: true,
        acknowledgePrivacy: false,
        termsVersion: '1.0',
        privacyVersion: '1.0'
      },
      expectedStatus: 400
    },
    {
      name: '4c_Terminos_Desactualizados',
      payload: {
        email: `test-outdated-terms-${timestamp}@creditonegocios-test.internal`,
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'Outdated Terms',
        acceptTerms: true,
        acknowledgePrivacy: true,
        termsVersion: '0.9',
        privacyVersion: '1.0'
      },
      expectedStatus: 400
    },
    {
      name: '4d_Aviso_Desactualizado',
      payload: {
        email: `test-outdated-privacy-${timestamp}@creditonegocios-test.internal`,
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'Outdated Privacy',
        acceptTerms: true,
        acknowledgePrivacy: true,
        termsVersion: '1.0',
        privacyVersion: '0.9'
      },
      expectedStatus: 400
    },
    {
      name: '4e_Registro_Valido',
      payload: {
        email: `test-valid-reg-${timestamp}@creditonegocios-test.internal`,
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'Valido Bloque 2',
        acceptTerms: true,
        acknowledgePrivacy: true,
        termsVersion: '1.0',
        privacyVersion: '1.0'
      },
      expectedStatus: 201
    }
  ];

  const httpResults = [];

  for (const tc of testCases) {
    console.log(`\nEjecutando caso: ${tc.name}`);
    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'IntegrationTest/Bloque2'
      },
      body: JSON.stringify(tc.payload)
    });

    const status = res.status;
    let body;
    const rawText = await res.text();
    try {
      body = JSON.parse(rawText);
    } catch {
      body = rawText;
    }

    console.log(`HTTP ${status} (Esperado ${tc.expectedStatus})`);
    if (status !== tc.expectedStatus) {
      console.error('Respuesta inesperada:', body);
      throw new Error(`Caso ${tc.name} falló: esperado HTTP ${tc.expectedStatus}, recibido ${status}`);
    }

    // Guardar cookies si es registro válido para consultar sesión posterior
    const setCookie = res.headers.get('set-cookie');

    httpResults.push({
      case: tc.name,
      email: tc.payload.email,
      expectedStatus: tc.expectedStatus,
      receivedStatus: status,
      response: body,
      setCookie: setCookie ? 'present' : 'none'
    });
  }

  // Comprobar DB
  console.log('\n--- Verificando Persistencia en PostgreSQL Staging ---');
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const rejectedEmails = testCases.slice(0, 4).map(c => c.payload.email);
  const validEmail = testCases[4].payload.email;

  const dbResults = {
    rejectedUsersCount: 0,
    rejectedAcceptancesCount: 0,
    validUserFound: false,
    validAcceptancesCount: 0,
    validAcceptancesDetails: []
  };

  try {
    // 1. Verificar que ninguno de los emails rechazados fue creado
    const checkRejectedUsers = await client.query(`
      SELECT id, email FROM users WHERE email = ANY($1)
    `, [rejectedEmails]);
    dbResults.rejectedUsersCount = checkRejectedUsers.rows.length;
    console.log('Usuarios creados para intentos rechazados:', dbResults.rejectedUsersCount, '(esperado 0)');
    if (dbResults.rejectedUsersCount !== 0) {
      throw new Error(`Se encontraron usuarios creados indebidamente: ${JSON.stringify(checkRejectedUsers.rows)}`);
    }

    // 2. Verificar que no hay evidencias para los emails rechazados
    const checkRejectedAcc = await client.query(`
      SELECT id, user_email, document FROM legal_acceptances WHERE user_email = ANY($1)
    `, [rejectedEmails]);
    dbResults.rejectedAcceptancesCount = checkRejectedAcc.rows.length;
    console.log('Evidencias creadas para intentos rechazados:', dbResults.rejectedAcceptancesCount, '(esperado 0)');
    if (dbResults.rejectedAcceptancesCount !== 0) {
      throw new Error(`Se encontraron evidencias creadas indebidamente: ${JSON.stringify(checkRejectedAcc.rows)}`);
    }

    // 3. Verificar que el usuario válido existe y tiene exactamente 2 evidencias
    const checkValidUser = await client.query(`
      SELECT id, email, role, status FROM users WHERE email = $1
    `, [validEmail]);
    dbResults.validUserFound = checkValidUser.rows.length === 1;
    const validUserId = checkValidUser.rows[0]?.id;
    console.log('Usuario válido registrado con id:', validUserId);

    const checkValidAcc = await client.query(`
      SELECT id, user_id, user_email, document, document_id, version, content_sha256, acceptance_type, ip_address, user_agent, accepted_at
      FROM legal_acceptances 
      WHERE user_id = $1
      ORDER BY document;
    `, [validUserId]);
    dbResults.validAcceptancesCount = checkValidAcc.rows.length;
    dbResults.validAcceptancesDetails = checkValidAcc.rows;
    console.log('Evidencias registradas para el usuario válido:', dbResults.validAcceptancesCount, '(esperado 2)');

    if (dbResults.validAcceptancesCount !== 2) {
      throw new Error(`Esperadas 2 evidencias, encontradas ${dbResults.validAcceptancesCount}`);
    }

    const terminosAcc = checkValidAcc.rows.find(a => a.document === 'terminos');
    const avisoAcc = checkValidAcc.rows.find(a => a.document === 'aviso');

    if (!terminosAcc || !avisoAcc) {
      throw new Error('Falta aceptación de términos o aviso');
    }

    console.log('Evidencia Términos:', {
      id: terminosAcc.id,
      version: terminosAcc.version,
      sha256: terminosAcc.content_sha256,
      acceptedAt: terminosAcc.accepted_at
    });
    console.log('Evidencia Aviso:', {
      id: avisoAcc.id,
      version: avisoAcc.version,
      sha256: avisoAcc.content_sha256,
      acceptedAt: avisoAcc.accepted_at
    });

  } finally {
    await client.end();
  }

  // 4. Probar consulta de historial vía endpoint autenticado (/api/legal/my-acceptances)
  console.log('\n--- Probando Consulta de Historial /api/legal/my-acceptances tras Login ---');
  // Login con el usuario creado
  const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: validEmail,
      password: 'Password123!'
    })
  });

  const loginStatus = loginRes.status;
  const cookieHeader = loginRes.headers.get('set-cookie');
  console.log('Login status:', loginStatus, 'Cookie:', cookieHeader ? 'Recibida' : 'Ninguna');

  if (loginStatus !== 200 || !cookieHeader) {
    throw new Error(`Login falló con status ${loginStatus}`);
  }

  const rawCookie = cookieHeader.split(';')[0];
  const historyRes = await fetch(`${BACKEND_URL}/api/legal/my-acceptances`, {
    headers: {
      'Cookie': rawCookie
    }
  });

  const historyStatus = historyRes.status;
  const historyJson = await historyRes.json();
  const acceptances = historyJson.acceptances || historyJson;
  console.log('Historial HTTP status:', historyStatus, 'Registros devueltos:', acceptances.length);
  console.log('Historial:', JSON.stringify(acceptances, null, 2));

  if (historyStatus !== 200 || !Array.isArray(acceptances) || acceptances.length !== 2) {
    throw new Error('Fallo al consultar historial de evidencias con sesión autenticada');
  }

  const finalSummary = {
    backendUrl: BACKEND_URL,
    httpResults,
    dbResults,
    historyVerification: {
      status: historyStatus,
      count: acceptances.length,
      records: acceptances
    }
  };

  fs.writeFileSync(path.resolve(__dirname, '../reports-staging-endpoint-check.json'), JSON.stringify(finalSummary, null, 2));
  console.log('\n✅ PRUEBAS DE ENDPOINTS Y HISTORIAL FINALIZADAS CON ÉXITO');
  return finalSummary;
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('ERROR EN PRUEBAS DE ENDPOINT:', err);
      process.exit(1);
    });
}

module.exports = { run };
