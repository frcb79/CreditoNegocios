/**
 * Reproducible test script for staging legal database verification (Bloque 2)
 *
 * Requirements:
 * 1. Requires STAGING_DATABASE_URL without defaults or hardcoded fallback credentials.
 * 2. Wraps all mutation tests in transactions with guaranteed ROLLBACK.
 * 3. Asserts the specific immutability trigger error message.
 * 4. Verifies catalog integrity and SHA-256 match.
 * 5. Safe: guarantees no alteration of existing staging records.
 */

const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

const EXPECTED_DOC_TRIGGER_ERROR = 'Legal document versions are immutable and cannot be updated or deleted.';
const EXPECTED_ACCEPTANCE_TRIGGER_ERROR = 'Legal acceptances are immutable audit records and cannot be updated or deleted.';

async function run() {
  const databaseUrl = getStagingDatabaseUrl();

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('--- Conectado a PostgreSQL Staging (sin secretos en log) ---');

  const results = {
    tables: {},
    catalogCheck: [],
    triggerProtection: {},
    rollbackVerification: {}
  };

  try {
    // 1. Verificación de tablas
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('legal_document_versions', 'legal_acceptances')
      ORDER BY table_name;
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log('Tablas legales presentes:', tables);
    if (!tables.includes('legal_document_versions') || !tables.includes('legal_acceptances')) {
      throw new Error('Faltan tablas legales en la base de datos');
    }
    results.tables = tables;

    // 2. Coincidencia de versiones, títulos, contenidos y hashes con el catálogo
    const catalogPath = path.resolve(__dirname, '../server/legalDocumentCatalog.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    const dbVersionsRes = await client.query(`
      SELECT id, document, version, title, source_file, content, content_sha256, effective_at, created_at
      FROM legal_document_versions
      ORDER BY id;
    `);
    const dbVersions = dbVersionsRes.rows;
    console.log(`Versiones registradas en DB: ${dbVersions.length}`);

    if (dbVersions.length < catalog.length) {
      throw new Error(`Cantidad insuficiente de versiones en DB: ${dbVersions.length} vs catálogo ${catalog.length}`);
    }

    for (const item of catalog) {
      const row = dbVersions.find(r => r.id === item.id);
      if (!row) {
        throw new Error(`Documento de catálogo no encontrado en DB: ${item.id}`);
      }

      const calculatedSha = crypto.createHash('sha256').update(row.content).digest('hex');
      const hashMatchDb = calculatedSha === row.content_sha256;
      const hashMatchCatalog = row.content_sha256 === item.contentSha256;
      const titleMatch = row.title === item.title;
      const docTypeMatch = row.document === item.document;
      const versionMatch = row.version === item.version;
      const contentMatch = row.content === item.content;

      if (!hashMatchDb || !hashMatchCatalog || !titleMatch || !docTypeMatch || !versionMatch || !contentMatch) {
        throw new Error(`Discrepancia en versión ${item.id}: ` + JSON.stringify({
          hashMatchDb,
          hashMatchCatalog,
          titleMatch,
          docTypeMatch,
          versionMatch,
          contentMatch
        }));
      }

      results.catalogCheck.push({
        id: item.id,
        document: item.document,
        version: item.version,
        title: item.title,
        contentSha256: item.contentSha256,
        hashMatchDb,
        hashMatchCatalog,
        contentLength: row.content.length,
        status: 'VERIFIED_MATCH'
      });
      console.log(`[OK] ${item.id} - ${item.title} -> SHA256 verificado: ${item.contentSha256}`);
    }

    // 3. Verificación de disparadores de inmutabilidad (con transacción y ROLLBACK garantizado)
    console.log('\n--- Probando Disparadores de Inmutabilidad con Transacciones y ROLLBACK Garantizado ---');

    // 3a. UPDATE sobre legal_document_versions
    let docUpdateBlockedByTrigger = false;
    let docUpdateError = '';
    await client.query('BEGIN');
    try {
      await client.query(`UPDATE legal_document_versions SET title = 'Modificado' WHERE id = 'terminos:1.0';`);
    } catch (err) {
      if (err.message && err.message.includes(EXPECTED_DOC_TRIGGER_ERROR)) {
        docUpdateBlockedByTrigger = true;
        docUpdateError = err.message;
      } else {
        throw new Error(`UPDATE legal_document_versions falló por un error inesperado (no es el trigger específico): ${err.message}`);
      }
    } finally {
      await client.query('ROLLBACK');
    }

    if (!docUpdateBlockedByTrigger) {
      throw new Error('Fallo de seguridad: UPDATE sobre legal_document_versions no fue bloqueado por el trigger específico.');
    }
    console.log('UPDATE legal_document_versions bloqueado por trigger específico:', docUpdateBlockedByTrigger);

    // 3b. DELETE sobre legal_document_versions
    let docDeleteBlockedByTrigger = false;
    let docDeleteError = '';
    await client.query('BEGIN');
    try {
      await client.query(`DELETE FROM legal_document_versions WHERE id = 'terminos:1.0';`);
    } catch (err) {
      if (err.message && err.message.includes(EXPECTED_DOC_TRIGGER_ERROR)) {
        docDeleteBlockedByTrigger = true;
        docDeleteError = err.message;
      } else {
        throw new Error(`DELETE legal_document_versions falló por un error inesperado (no es el trigger específico): ${err.message}`);
      }
    } finally {
      await client.query('ROLLBACK');
    }

    if (!docDeleteBlockedByTrigger) {
      throw new Error('Fallo de seguridad: DELETE sobre legal_document_versions no fue bloqueado por el trigger específico.');
    }
    console.log('DELETE legal_document_versions bloqueado por trigger específico:', docDeleteBlockedByTrigger);

    // 3c. UPDATE y DELETE sobre legal_acceptances con transacción y ROLLBACK garantizado
    let acceptanceUpdateBlockedByTrigger = false;
    let acceptanceUpdateError = '';
    let acceptanceDeleteBlockedByTrigger = false;
    let acceptanceDeleteError = '';

    const testTriggerUserId = 'test-trigger-user-' + Date.now();
    const testAcceptanceId = 'test-acc-trigger-' + Date.now();

    await client.query('BEGIN');
    try {
      await client.query(`
        INSERT INTO users (id, email, password, role, status, is_active)
        VALUES ($1, 'trigger-test@creditonegocios-test.internal', 'hashed', 'broker', 'active', true)
      `, [testTriggerUserId]);

      await client.query(`
        INSERT INTO legal_acceptances (
          id, user_id, user_email, document, document_id,
          version, content_sha256, acceptance_type,
          ip_address, user_agent
        ) VALUES (
          $1, $2, 'trigger-test@creditonegocios-test.internal', 'terminos', 'terminos:1.0',
          '1.0', 'e2ec998a066e702a43ee0f69dbadce692a5dac6171774254664d372423f1f2eb',
          'checkbox', '127.0.0.1', 'Node/Test'
        )
      `, [testAcceptanceId, testTriggerUserId]);

      // Probar UPDATE
      await client.query('SAVEPOINT sp_update');
      try {
        await client.query(`UPDATE legal_acceptances SET user_agent = 'hacked' WHERE id = $1`, [testAcceptanceId]);
      } catch (err) {
        if (err.message && err.message.includes(EXPECTED_ACCEPTANCE_TRIGGER_ERROR)) {
          acceptanceUpdateBlockedByTrigger = true;
          acceptanceUpdateError = err.message;
        } else {
          throw new Error(`UPDATE legal_acceptances falló por error inesperado (no es el trigger): ${err.message}`);
        }
        await client.query('ROLLBACK TO SAVEPOINT sp_update');
      }

      // Probar DELETE
      await client.query('SAVEPOINT sp_delete');
      try {
        await client.query(`DELETE FROM legal_acceptances WHERE id = $1`, [testAcceptanceId]);
      } catch (err) {
        if (err.message && err.message.includes(EXPECTED_ACCEPTANCE_TRIGGER_ERROR)) {
          acceptanceDeleteBlockedByTrigger = true;
          acceptanceDeleteError = err.message;
        } else {
          throw new Error(`DELETE legal_acceptances falló por error inesperado (no es el trigger): ${err.message}`);
        }
        await client.query('ROLLBACK TO SAVEPOINT sp_delete');
      }
    } finally {
      await client.query('ROLLBACK');
    }

    if (!acceptanceUpdateBlockedByTrigger || !acceptanceDeleteBlockedByTrigger) {
      throw new Error('Fallo de seguridad: UPDATE o DELETE sobre legal_acceptances no fueron bloqueados por el trigger esperado.');
    }
    console.log('UPDATE legal_acceptances bloqueado por trigger específico:', acceptanceUpdateBlockedByTrigger);
    console.log('DELETE legal_acceptances bloqueado por trigger específico:', acceptanceDeleteBlockedByTrigger);

    results.triggerProtection = {
      docVersionUpdateBlocked: docUpdateBlockedByTrigger,
      docVersionUpdateMessage: docUpdateError,
      docVersionDeleteBlocked: docDeleteBlockedByTrigger,
      docVersionDeleteMessage: docDeleteError,
      acceptanceUpdateBlocked: acceptanceUpdateBlockedByTrigger,
      acceptanceUpdateMessage: acceptanceUpdateError,
      acceptanceDeleteBlocked: acceptanceDeleteBlockedByTrigger,
      acceptanceDeleteMessage: acceptanceDeleteError
    };

    // 4. Verificación de rollback atómico ante fallo de segunda evidencia
    console.log('\n--- Probando Rollback Atómico ante Fallo de Segunda Evidencia ---');
    const testUserId = 'test-rollback-user-' + Date.now();
    const testEmail = `rollback-${Date.now()}@creditonegocios-test.internal`;
    const acc1Id = 'acc1-' + Date.now();
    const acc2Id = 'acc2-' + Date.now();

    let rollbackTriggered = false;
    try {
      await client.query('BEGIN');

      // Paso 1: Crear usuario
      await client.query(`
        INSERT INTO users (id, email, password, role, status, is_active)
        VALUES ($1, $2, 'dummy-hashed', 'broker', 'active', true)
      `, [testUserId, testEmail]);

      // Paso 2: Registrar primera evidencia (Términos)
      await client.query(`
        INSERT INTO legal_acceptances (
          id, user_id, user_email, document, document_id,
          version, content_sha256, acceptance_type,
          ip_address, user_agent
        ) VALUES (
          $1, $2, $3, 'terminos', 'terminos:1.0',
          '1.0', 'e2ec998a066e702a43ee0f69dbadce692a5dac6171774254664d372423f1f2eb',
          'checkbox', '127.0.0.1', 'Node/Test'
        )
      `, [acc1Id, testUserId, testEmail]);

      // Paso 3: Simular fallo intencional en la segunda evidencia (violación de versión nula)
      await client.query(`
        INSERT INTO legal_acceptances (
          id, user_id, user_email, document, document_id,
          version, content_sha256, acceptance_type,
          ip_address, user_agent
        ) VALUES (
          $1, $2, $3, 'aviso', 'aviso:1.0',
          NULL, 'invalido_null_version',
          'checkbox', '127.0.0.1', 'Node/Test'
        )
      `, [acc2Id, testUserId, testEmail]);

      await client.query('COMMIT');
    } catch (err) {
      rollbackTriggered = true;
      console.log('Error provocado exitosamente en paso 3:', err.message);
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }

    // Verificar fuera de transacción que no existen ni el usuario ni la primera aceptación
    const checkUser = await client.query('SELECT id FROM users WHERE id = $1', [testUserId]);
    const checkAcc1 = await client.query('SELECT id FROM legal_acceptances WHERE id = $1', [acc1Id]);

    const userCount = checkUser.rows.length;
    const acc1Count = checkAcc1.rows.length;

    console.log('Comprobación post-rollback:');
    console.log(' - Usuario en DB:', userCount, '(esperado 0)');
    console.log(' - Primera aceptación en DB:', acc1Count, '(esperado 0)');

    results.rollbackVerification = {
      rollbackTriggered,
      userPersisted: userCount > 0,
      firstAcceptancePersisted: acc1Count > 0,
      cleanStateVerified: userCount === 0 && acc1Count === 0
    };

    if (userCount !== 0 || acc1Count !== 0) {
      throw new Error('Fallo de atomicidad: los registros no se revirtieron correctamente');
    }

    console.log('\n✅ TODAS LAS COMPROBACIONES SQL Y DE DISPARADORES PASARON CON ÉXITO');
    return results;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  run()
    .then(res => {
      fs.writeFileSync(path.resolve(__dirname, '../reports-staging-sql-check.json'), JSON.stringify(res, null, 2));
      console.log('Resultados guardados en reports-staging-sql-check.json (sin credenciales)');
      process.exit(0);
    })
    .catch(err => {
      console.error('ERROR EN VERIFICACIÓN SQL:', err.message);
      process.exit(1);
    });
}

module.exports = { run };
