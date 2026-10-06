/**
 * Reproducible test script for direct staging endpoint verification (Bloque 2)
 *
 * Requirements:
 * 1. Requires STAGING_DATABASE_URL without defaults or hardcoded credentials.
 * 2. Rejection tests (400) without acceptTerms, without acknowledgePrivacy, and with outdated versions.
 * 3. Successful registration (201) when both valid confirmations and versions are sent.
 * 4. DB check: no users or acceptances created for rejected attempts, exactly 2 acceptances created for valid user.
 * 5. Query legal acceptance history via authenticated session (/api/legal/my-acceptances).
 * 6. Reads accepted_at in UTC and verifies that SQL and history API represent the exact same instant.
 * 7. Does not alter or rewrite existing acceptances.
 */

const { Client, types } = require('pg');
const fs = require('fs');
const path = require('path');

// Configurar parser de timestamp without time zone (OID 1114) para lectura alineada en UTC
types.setTypeParser(1114, (str) => {
  return str.replace(' ', 'T') + 'Z';
});

function getStagingDatabaseUrl() {
  let url = process.env.STAGING_DATABASE_URL;
  if (!url) {
    const envLocalPath = path.resolve(__dirname, '../.env.staging.local');
    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, 'utf8');
      const match = content.match(/^\s*STAGING_DATABASE_URL\s*=\s*(.+)$/m);
      if (match) {
        url = match[1].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }

  if (!url) {
    throw new Error('La variable de entorno STAGING_DATABASE_URL es requerida. No se permiten valores predeterminados ni credenciales incrustadas.');
  }

  return url;
}

const BACKEND_URL = process.env.BACKEND_URL || 'https://creditonegocios-staging.up.railway.app';

async function run() {
  console.log(`--- Iniciando Pruebas de Endpoints en Staging (${BACKEND_URL}) ---`);

  const databaseUrl = getStagingDatabaseUrl();
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
  console.log('\n--- Verificando Persistencia en PostgreSQL Staging (sin secretos en log) ---');
  const client = new Client({
    connectionString: databaseUrl,
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

  let validSqlAcceptances = [];

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
    validSqlAcceptances = checkValidAcc.rows;
    console.log('Evidencias registradas para el usuario válido:', dbResults.validAcceptancesCount, '(esperado 2)');

    if (dbResults.validAcceptancesCount !== 2) {
      throw new Error(`Esperadas 2 evidencias, encontradas ${dbResults.validAcceptancesCount}`);
    }

    const terminosAcc = checkValidAcc.rows.find(a => a.document === 'terminos');
    const avisoAcc = checkValidAcc.rows.find(a => a.document === 'aviso');

    if (!terminosAcc || !avisoAcc) {
      throw new Error('Falta aceptación de términos o aviso');
    }

    console.log('Evidencia Términos (SQL UTC):', {
      id: terminosAcc.id,
      version: terminosAcc.version,
      sha256: terminosAcc.content_sha256,
      acceptedAtUtc: terminosAcc.accepted_at
    });
    console.log('Evidencia Aviso (SQL UTC):', {
      id: avisoAcc.id,
      version: avisoAcc.version,
      sha256: avisoAcc.content_sha256,
      acceptedAtUtc: avisoAcc.accepted_at
    });

  } finally {
    await client.end();
  }

  // 4. Probar consulta de historial vía endpoint autenticado (/api/legal/my-acceptances)
  console.log('\n--- Probando Consulta de Historial /api/legal/my-acceptances tras Login ---');
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

  if (historyStatus !== 200 || !Array.isArray(acceptances) || acceptances.length !== 2) {
    throw new Error('Fallo al consultar historial de evidencias con sesión autenticada');
  }

  // 5. Comprobación de alineación temporal exacta (SQL UTC vs Historial API)
  console.log('\n--- Verificando Alineación Temporal Exacta (SQL vs API) en UTC ---');
  for (const sqlRow of validSqlAcceptances) {
    const apiMatch = acceptances.find(a => a.document === sqlRow.document);
    if (!apiMatch) {
      throw new Error(`No se encontró registro en API para el documento ${sqlRow.document}`);
    }

    const sqlIso = new Date(sqlRow.accepted_at).toISOString();
    const apiIso = new Date(apiMatch.acceptedAt).toISOString();
    const sqlMs = new Date(sqlRow.accepted_at).getTime();
    const apiMs = new Date(apiMatch.acceptedAt).getTime();

    console.log(`Documento [${sqlRow.document}]:`);
    console.log(`  SQL accepted_at (UTC):     ${sqlIso} (${sqlMs} ms)`);
    console.log(`  Historial API acceptedAt:  ${apiIso} (${apiMs} ms)`);

    if (sqlMs !== apiMs) {
      throw new Error(`Discrepancia temporal en ${sqlRow.document}: SQL=${sqlIso} vs API=${apiIso}`);
    }
    console.log(`  -> Exactamente el mismo instante verificado.`);
  }

  const finalSummary = {
    backendUrl: BACKEND_URL,
    httpResults,
    dbResults,
    historyVerification: {
      status: historyStatus,
      count: acceptances.length,
      records: acceptances
    },
    timestampAlignment: {
      verifiedUtcExactMatch: true
    }
  };

  fs.writeFileSync(path.resolve(__dirname, '../reports-staging-endpoint-check.json'), JSON.stringify(finalSummary, null, 2));
  console.log('\n✅ PRUEBAS DE ENDPOINTS, HISTORIAL Y ALINEACIÓN TEMPORAL UTC FINALIZADAS CON ÉXITO');
  return finalSummary;
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('ERROR EN PRUEBAS DE ENDPOINT:', err.message);
      process.exit(1);
    });
}

module.exports = { run };
