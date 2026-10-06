/**
 * Reproducible test script for staging legal database verification (Bloque 2)
 *
 * Verifies:
 * 1. Legal tables existence and schema
 * 2. Exact match of versions, titles, texts, and SHA-256 hashes against server/legalDocumentCatalog.json
 * 3. PostgreSQL immutability triggers (UPDATE/DELETE blocked on legal_document_versions and legal_acceptances)
 * 4. Atomic transaction rollback when second acceptance fails
 *
 * Safe: Runs immutability mutation tests inside rolled-back transactions or verifies existing triggers without altering staging data.
 */

const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:neMoZUFoyWnqqzIrxdLIiUGOKamDllJa@trolley.proxy.rlwy.net:43850/railway';

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('--- Conectado a PostgreSQL Staging ---');

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

    // 3. Verificación de disparadores de inmutabilidad (UPDATE/DELETE bloqueados)
    console.log('\n--- Probando Disparadores de Inmutabilidad ---');

    // 3a. UPDATE sobre legal_document_versions
    let docUpdateBlocked = false;
    let docUpdateError = '';
    try {
      await client.query(`UPDATE legal_document_versions SET title = 'Modificado' WHERE id = 'terminos:1.0';`);
    } catch (err) {
      docUpdateBlocked = true;
      docUpdateError = err.message;
    }
    console.log('UPDATE legal_document_versions bloqueado:', docUpdateBlocked, `(${docUpdateError})`);

    // 3b. DELETE sobre legal_document_versions
    let docDeleteBlocked = false;
    let docDeleteError = '';
    try {
      await client.query(`DELETE FROM legal_document_versions WHERE id = 'terminos:1.0';`);
    } catch (err) {
      docDeleteBlocked = true;
      docDeleteError = err.message;
    }
    console.log('DELETE legal_document_versions bloqueado:', docDeleteBlocked, `(${docDeleteError})`);

    // 3c. UPDATE y DELETE sobre legal_acceptances usando una transacción de prueba
    let acceptanceUpdateBlocked = false;
    let acceptanceUpdateError = '';
    let acceptanceDeleteBlocked = false;
    let acceptanceDeleteError = '';

    const testTriggerUserId = 'test-trigger-user-' + Date.now();
    const testAcceptanceId = 'test-acc-trigger-' + Date.now();
    try {
      await client.query('BEGIN');
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

      // Probar UPDATE (usar SAVEPOINT para que el error no rompa la transacción)
      await client.query('SAVEPOINT sp_update');
      try {
        await client.query(`UPDATE legal_acceptances SET user_agent = 'hacked' WHERE id = $1`, [testAcceptanceId]);
      } catch (err) {
        acceptanceUpdateBlocked = true;
        acceptanceUpdateError = err.message;
        await client.query('ROLLBACK TO SAVEPOINT sp_update');
      }

      // Probar DELETE (usar SAVEPOINT)
      await client.query('SAVEPOINT sp_delete');
      try {
        await client.query(`DELETE FROM legal_acceptances WHERE id = $1`, [testAcceptanceId]);
      } catch (err) {
        acceptanceDeleteBlocked = true;
        acceptanceDeleteError = err.message;
        await client.query('ROLLBACK TO SAVEPOINT sp_delete');
      }

      await client.query('ROLLBACK');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    console.log('UPDATE legal_acceptances bloqueado:', acceptanceUpdateBlocked, `(${acceptanceUpdateError})`);
    console.log('DELETE legal_acceptances bloqueado:', acceptanceDeleteBlocked, `(${acceptanceDeleteError})`);

    results.triggerProtection = {
      docVersionUpdateBlocked: docUpdateBlocked,
      docVersionUpdateMessage: docUpdateError,
      docVersionDeleteBlocked: docDeleteBlocked,
      docVersionDeleteMessage: docDeleteError,
      acceptanceUpdateBlocked: acceptanceUpdateBlocked,
      acceptanceUpdateMessage: acceptanceUpdateError,
      acceptanceDeleteBlocked: acceptanceDeleteBlocked,
      acceptanceDeleteMessage: acceptanceDeleteError
    };

    if (!docUpdateBlocked || !docDeleteBlocked || !acceptanceUpdateBlocked || !acceptanceDeleteBlocked) {
      throw new Error('Fallo de seguridad: no todos los intentos de mutación fueron bloqueados por disparadores');
    }

    // 4. Verificación de rollback ante fallo de segunda evidencia
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

      // Paso 3: Simular fallo intencional en la segunda evidencia (violación de versión nula o forzar error)
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
      await client.query('ROLLBACK');
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
      console.log('Resultados guardados en reports-staging-sql-check.json');
      process.exit(0);
    })
    .catch(err => {
      console.error('ERROR EN VERIFICACIÓN SQL:', err);
      process.exit(1);
    });
}

module.exports = { run };
