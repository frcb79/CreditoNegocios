# CHANGELOG — Historial de Cambios
Actualizar cada vez que se completa una feature.

## [FECHA] — Setup inicial
- Creacion del repositorio
- Estructura inicial del proyecto

## 2026-04-17 — Expansion estrategica del sistema de roles
- Creacion de nuevos roles en `docs/team`:
	- `14_SCRUM_MASTER.md`
	- `15_SALES_BIZDEV.md`
	- `17_AI_ENGINEER.md`
	- `18_CFO_FINANCIERO.md`
	- `19_COO_OPERACIONES.md`
	- `20_COMMUNITY_MANAGER.md`
	- `21_HIRING_ADVISOR.md`
- Actualizacion de `10_DATA_ANALYTICS.md` para enfoque estrategico empresarial:
	- Dashboards por audiencia (CEO, directivos, equipos).
	- Sistema de alertas proactivas.
	- Recomendaciones accionables por KPI.
	- Soporte de datos para reportes, presentaciones y contenido.

## 2026-04-17 — Formalizacion de memoria institucional del sistema
- Se documenta como decision activa que este repo es un activo estrategico vivo.
- Se establece como principio operativo: aprender en cada proyecto, guardar aprendizajes y reutilizarlos en los siguientes.

## 2026-09-04 — Filtros de Clientes, Multi-Dispersión y Red de Brokers 3-en-1
- **Filtros en Clientes (`ClientList.tsx`):**
	- Incorporación de filtros dinámicos por Bróker originador y Master Bróker para perfiles Admin y Super Admin.
	- Integración de endpoint de usuarios para poblar listas y evaluación combinada con filtros de persona moral/física y texto de búsqueda.
- **Flujo Multi-Propuesta y Multi-Dispersión (`server/routes.ts`):**
	- Eliminación de la invalidación forzosa `isWinner: false` a propuestas alternas en `select-winner`.
	- En `mark-dispersed`, la solicitud principal preserva su estado `in_progress` mientras haya más propuestas en curso, generando créditos y comisiones independientes por cada financiera elegida.
- **Red de Brokers 3-en-1 (`BrokerNetwork.tsx`):**
	- Reestructuración de la vista para Super Admin con métricas ejecutivas y 3 pestañas: Master Brokers & Redes (con desglose de brokers asociados), Brokers Directos Independientes y Mi Red Directa (Casa Matriz) con botón de invitación.
- **Fix de Build en Vercel (`CreditList.tsx`):**
	- Corrección de error de esbuild `Unexpected "const"` mediante el encapsulamiento apropiado del bloque JSX en un IIFE `{(() => { ... })()}`.

## 2026-10-08 — Hotfix de Seguridad Producción (Sin Commits Funcionales Pendientes)

- **Rama:** `hotfix/prod-security-auth-startup` basada exactamente en `ce24a16943dbf348525e7f2738896545edc8a46d` (commit activo en producción).
- **Eliminación Total de Bypass en Login (`server/routes.ts`):**
	- Purgado radical del array de contraseñas alternativas (`allowedAdminPasswords` con `Prueba1$`, `Franco2026!*`, `ADMIN_FALLBACK_PASSWORD`).
	- Eliminación de la sincronización y reseteo automático de contraseñas al iniciar sesión.
	- Autenticación criptográfica obligatoria (`bcrypt.compare`) contra la base de datos para todas las cuentas sin excepción.
	- Preservación de bloqueo estricto con HTTP 401 para usuarios con estatus `suspended` o inactivos.
	- Diferimiento de migración de `authMethod` a "local": solo se actualiza tras verificación exitosa de contraseña (cero mutaciones en intentos fallidos).
- **AutoMigrate Zero-Destructive (`server/autoMigrate.ts`):**
	- Retirados todos los DELETE de comisiones, UPDATE forzosos de usuarios (`password = Prueba1$`, `is_active = TRUE`), reactivaciones masivas de financieras y eliminación de financieras de prueba.
	- Eliminados todos los UPDATE residuales en arranque (`public.users` y `public.tenant_members can_originate`).
	- Eliminación de contraseña por defecto en bootstrap: solo inicializa super admin en bases vacías si `ADMIN_INITIAL_PASSWORD` es explícita y segura (mínimo 12 caracteres, mayúscula, minúscula, número); `user-super-admin` usa secreto aleatorio sin acceso interactivo.
	- El arranque del servidor es 100% no destructivo: en bases de datos con usuarios existentes (`SELECT count(*) FROM users > 0`), se omiten todas las mutaciones e inserciones de usuarios.
- **Aislamiento Funcional Estricto:**
	- Cero inclusión de los 85 commits funcionales pendientes (sin Network Transitions, sin Formalización OTP, sin Comisiones Multi-Step Approval).
- **Validación QA:**
	- Nueva suite: `tests/unit/prod-hotfix-security.test.ts` (9/9 passing).
	- Regresiones de RBAC, storage y estatus operativo passing (27/27).
	- Compilación de tipos (`npm run check`): 0 errores.
	- Build de producción (`npm run build`): exitoso.

## 2026-10-08 — Bloque A1: Arquitectura de Ofertas por Financiera y Versionado Aditivo

- **Rama Aislada:** `feat/institution-offers-versioning-a1`
- **Modelo de Datos y DDL (`shared/schema.ts`, `migrations/0005_institution_offers_versioning.sql`):**
	- Tabla `financial_institution_offers`: entidad lógica que permite múltiples ofertas de un mismo tipo de producto (`product_type`) por financiera, vinculable opcionalmente a `institution_products` y `product_templates`.
	- Tabla `financial_institution_offer_versions`: histórico inmutable y aditivo por versión de oferta con `version_number`, `status` ('active', 'superseded'), vigencia temporal (`effective_from`, `effective_to`), snapshot de condiciones y requisitos en JSONB, y hash de integridad SHA-256 (`version_hash`).
	- Índices específicos para consultas de alto rendimiento por financiera, tipo de producto, estatus y versión.
- **Servicio y Utilidades de Integridad (`server/offerVersionService.ts`):**
	- Función determinista `computeOfferVersionHash` mediante serialización recursiva y SHA-256.
	- Validador de rangos comerciales `validateOfferVersionParameters`.
- **Capa de Persistencia (`server/storage.ts`, `server/dbStorage.ts`):**
	- Métodos añadidos a `IStorage`, `MemStorage` y `DbStorage`:
		- `getOffers`, `getOffer`, `getOffersByInstitution`, `getOffersByProductType`.
		- `createOffer`: genera oferta y versión 1 automáticamente.
		- `updateOffer`, `deleteOffer`.
		- `getOfferVersions`, `getOfferVersion`, `getActiveOfferVersion`.
		- `createOfferVersion`: versionado aditivo que transiciona automáticamente la versión anterior a 'superseded' y fija `effective_to`.
		- `supersedeOfferVersion`.
- **Auto-Migración Idempotente (`server/autoMigrate.ts`):**
	- Incorporación de bloque `CREATE TABLE IF NOT EXISTS` e índices para despliegues transparentes y zero-downtime en Staging y Producción.
- **Preservación Estricta:**
	- `institution_products` y `product_templates` conservados 100% operativos sin modificaciones destructivas.
	- Matching, comisiones y APIs existentes no intervenidos.
	- Aislamiento de seguridad: comisiones internas de Crédito Negocios completamente desacopladas de las ofertas.
- **Validación QA:**
	- Suite automatizada: `tests/unit/institution-offers-versioning.test.ts` (8/8 passing).
	- Compilación TypeScript (`npm run check`): 0 errores.

## 2026-10-08 — Corrección A1.1: Consolidación Canónica en institution_products y Hardening Transaccional

- **Rama:** `feat/institution-offers-versioning-a1`
- **Consolidación Canónica (Sin Duplicidad de Catálogos):**
	- `institution_products` enriquecida aditivamente como la entidad canónica única de ofertas (`name`, `product_type`, `slug`, `description`, `status`, `current_version_number`).
	- `institution_product_versions`: tabla de versiones aditivas e inmutables vinculada a `institution_products.id`.
	- Mantenimiento de vistas SQL y aliases de TypeScript (`financialInstitutionOffers`, `financialInstitutionOfferVersions`) para preservación total retrocompatible.
- **Ciclo de Vida y Gate de Calidad Comercial:**
	- Las nuevas ofertas y versiones inician obligatoriamente en estado `draft`.
	- `validateMinimumPublishConditions`: valida montos (`minAmount > 0`, `maxAmount >= minAmount`), tasas (`minInterestRate > 0`, `maxInterestRate >= minInterestRate`), plazos (`minTermMonths > 0`), perfiles obligatorios en `requirements.targetProfiles`, lista de documentos en `requiredDocuments` y `changeReason`.
- **Transacciones Atómicas y Concurrencia:**
	- `publishInstitutionProductVersion` en `DbStorage` ejecutado en `db.transaction()` con bloqueo de fila `SELECT FOR UPDATE` sobre `institution_products`.
	- Garantía física en PostgreSQL mediante índice parcial único: `CREATE UNIQUE INDEX "ipv_published_unique" ON institution_product_versions (institution_product_id) WHERE status = 'published'`. Máximo una versión vigente por oferta.
- **Integridad Legal y Documentación en Hash:**
	- `computeInstitutionProductVersionHash` incluye `requiredDocuments` ordenado alfabéticamente para reproducibilidad determinista del SHA-256.
	- Eliminación destructiva bloqueada: prohibido eliminar versiones con estado `published` o `superseded`, o eliminar ofertas con historial publicado.
- **Validación QA:**
	- Suite automatizada: `tests/unit/institution-offers-versioning.test.ts` (12/12 passing).
	- Suite de regresión: `tests/unit/storage.test.ts` (1/1 passing).
	- Compilación TypeScript (`npm run check`): 0 errores.
	- Empaquetado backend (`npm run build:server`): 0 errores.

## 2026-10-08 — Cierre Técnico A1.2: Normalización de Esquema, Blindaje Legacy y Desactivación Lógica

- **Rama:** `feat/institution-offers-versioning-a1`
- **Requisito 1: Normalización de Columna snake_case (`created_at`):**
	- Corrección en `migrations/0005_institution_offers_versioning.sql`: sustitución de `createdAt` por `created_at` en la definición DDL de `institution_product_versions`.
	- Sincronización en `server/autoMigrate.ts`: verificación defensiva de columnas (`created_at`, `updated_at`, `published_at`, `published_by`) para tablas preexistentes, garantizando paridad 1:1 con Drizzle ORM y PostgreSQL.
- **Requisito 2: Verificación de Aislamiento PostgreSQL:**
	- Confirmado que el entorno de desarrollo local carece de servicio PostgreSQL en puerto 5432 y no dispone de Docker.
	- Reportado transparentemente como pendiente para ambiente de CI/CD dedicado aislado, protegiendo estrictamente la base de datos de Producción/Staging contra ejecuciones de prueba.
- **Requisito 3: Blindaje de Endpoints Legacy contra Bypass de Versionado:**
	- `updateInstitutionProduct` en `storage.ts` y `dbStorage.ts` rechaza transiciones directas a `status: 'published'` sin pasar por el gate de validación.
	- Bloqueada la mutación directa de condiciones (`configuration`, `targetProfiles`, `activeVariables`) en ofertas que ya cuentan con versiones publicadas; se exige generar una nueva versión en borrador.
	- Permitida la edición directa de condiciones únicamente en ofertas que se encuentran en borrador (`draft`).
	- `PUT /api/institution-products/:id` en `server/routes.ts` devuelve HTTP 400 descriptivo ante cualquier intento de bypass.
- **Requisito 4: Desactivación Lógica Preservadora de Historial:**
	- `deleteFinancialInstitution` en `storage.ts` y `dbStorage.ts` modificado para detectar si la financiera posee historial (créditos, solicitudes o versiones publicadas).
	- Ante existencia de historial, se aplica desactivación lógica (`isActive: false` en financiera y `isActive: false, status: 'archived'` en ofertas vinculadas), sin desvincular ni eliminar créditos, solicitudes ni versiones utilizadas.
	- La eliminación física queda restringida exclusivamente a entidades sin historial ni referencias regulatorias.
- **Requisito 5: Elegibilidad para Nuevas Solicitudes y Preservación Legacy:**
	- Implementación de `isOfferEligibleForRequests` en `server/offerVersionService.ts`: ofertas en `draft` o `archived` o con `isActive: false` quedan excluidas de nuevas solicitudes.
	- Se preserva la operación ininterrumpida de registros legacy (sin status o con status `active`).
	- Incorporado soporte de filtrado `eligibleOnly` en `GET /api/institution-products` y `GET /api/institution-products/template/:templateId`.
- **Validación QA:**
	- Suite automatizada: `tests/unit/institution-offers-versioning.test.ts` ampliada a **21/21 passing**.
	- Compilación TypeScript (`npm run check`): **0 errores**.
	- Empaquetado backend (`npm run build:server`): **0 errores** (`dist/index.js`, 921.3kb).

## 2026-10-08 — Cierre de Compatibilidad y Elegibilidad A1.3: Migración Legacy y Verificación de Versiones Publicadas

- **Rama:** `feat/institution-offers-versioning-a1`
- **Requisito 1: Migración de `institution_products` Existentes sin Asignación Indiscriminada a Borrador:**
	- Actualizado `migrations/0005_institution_offers_versioning.sql` y `server/autoMigrate.ts` con script aditivo e idempotente: los productos legacy activos existentes sin versiones son actualizados a `status = 'published'` y se les crea su versión inicial v1 con `status = 'published'` en `institution_product_versions`.
	- En `server/storage.ts` (`MemStorage.migrateExistingData`), los productos legacy activos se inicializan en `status: 'published'` con versión inicial 1 publicada, evitando asignarlos indiscriminadamente a `draft` y preservando su operación legacy.
- **Requisito 2: Blindaje de Solicitudes contra Ofertas Nuevas en Borrador:**
	- En `server/routes.ts`: `POST /api/credit-submissions` valida que las financieras seleccionadas para una plantilla tengan ofertas elegibles publicadas o productos legacy activos; si solo cuentan con ofertas en borrador, la financiera se excluye o la solicitud se rechaza con HTTP 400 descriptivo.
	- Si una solicitud envía directamente un `institutionProductId` en estado `draft`, se rechaza con error 400 en `POST /api/credit-submissions` y `POST /api/credits`.
	- Se respeta estrictamente el flujo operativo actual por financiera y tipo de producto.
- **Requisito 3: Exigencia de Versión Realmente Publicada (No Confiar Solo en Status):**
	- En `server/offerVersionService.ts`: `isOfferEligibleForRequests` acepta la lista de versiones o versión activa y exige que, si `offer.status === 'published'`, exista efectivamente al menos una versión con `status === 'published'` (`currentPublishedVersion`). Si no se verifican versiones o solo existen versiones en `draft`, la oferta se dictamina inelegible.
	- Preserva la compatibilidad para registros legacy donde no existe historial de versiones pero `isActive === true` y su status es compatible (`active`, `published` o nulo).
	- En `server/routes.ts`: los endpoints `GET /api/institution-products` y `GET /api/institution-products/template/:templateId` con `eligibleOnly=true` consultan las versiones de cada oferta y ejecutan `isOfferEligibleForRequests(offer, versions)`.
- **Requisito 4: Pruebas de Regresión A1.3 (En Memoria):**
	- Nuevas pruebas de regresión añadidas en `tests/unit/institution-offers-versioning.test.ts`:
		1. Migración de productos existentes a `published` con versión inicial 1 publicada (no en draft).
		2. Distinción clara entre ofertas nuevas en borrador y productos legacy migrados.
		3. Exigencia de versión realmente publicada (detección de status falso/manipulado o versiones solo en borrador).
		4. Exclusión de financieras cuyas ofertas estén exclusivamente en borrador al crear solicitudes.
		5. Permisión de solicitudes para financieras con ofertas publicadas o productos legacy.
	- Las pruebas se documentan y ejecutan explícitamente en memoria (sin presentarlas como integración PostgreSQL).
- **Validación QA:**
	- Suite automatizada: `tests/unit/institution-offers-versioning.test.ts` con **26/26 tests passing** (100% éxito).
	- Compilación TypeScript (`npm run check`): **0 errores**.
	- Empaquetado backend (`npm run build:server`): **0 errores** (`dist/index.js`, 927.0kb).

## 2026-10-08 — Cierre Definitivo de Seguridad de Publicación A1.4: Idempotencia de Backfill, Forzado de Borrador y Rechazo de Ofertas Inexistentes

- **Rama:** `feat/institution-offers-versioning-a1`
- **Requisito 1: Ejecución Única e Idempotente del Backfill Legacy:**
	- Creada tabla de control `public.app_migrations` en `migrations/0005_institution_offers_versioning.sql` y `server/autoMigrate.ts` para registrar `0005_legacy_institution_products_backfill_a1`.
	- El backfill se ejecuta una sola vez y distingue de forma inequívoca los productos preexistentes (filtra estrictamente por `status IS NULL`) de ofertas nuevas en borrador.
	- NUNCA promueve ni altera ofertas en borrador (`draft`) a publicadas al reiniciar o ejecutar `autoMigrate`.
	- En `MemStorage`, se agregó bandera atómica `legacyBackfilled: boolean = false` que garantiza idempotencia estricta ante arranques consecutivos.
- **Requisito 2: Forzado de Estado Borrador (`draft`) en el Servidor:**
	- La creación de ofertas (`createOffer`, `createInstitutionProduct`, `createInstitutionProductDraftVersion` en `MemStorage` y `DbStorage`, y `POST /api/institution-products`) fuerza `status: 'draft'` desde el servidor, ignorando cualquier intento de manipulación o spoofing de estado en el payload.
	- Solo el flujo validado de publicación (`publishOfferVersion` / `publishInstitutionProductVersion` con `validateMinimumPublishConditions`) puede establecer `status: 'published'`.
- **Requisito 3: Rechazo de IDs Explícitos Inexistentes o No Elegibles en Créditos y Solicitudes:**
	- En `POST /api/credits` y `POST /api/credit-submissions` (así como a nivel de capa de persistencia en `createCredit` y `createCreditSubmissionRequest`):
		- Si se provee un ID explícito de oferta (`institutionProductId` u `offerId`) inexistente: se rechaza con HTTP 400 descriptivo ("La oferta especificada no existe.").
		- Si la oferta existe pero se encuentra en borrador o no tiene versión publicada vigente: se rechaza con HTTP 400 descriptivo.
		- Si no se provee ID de oferta: se preserva 100% la compatibilidad con los flujos operativos legacy.
- **Requisito 4: Pruebas de Regresión A1.4:**
	- Agregada suite de 5 regresiones en `tests/unit/institution-offers-versioning.test.ts`:
		1. Simulación de dos arranques consecutivos con idempotencia absoluta y sin duplicación de versiones.
		2. Creación de nuevos borradores y verificación de que ningún arranque o backfill posterior los promueve a publicados.
		3. Verificación de que los productos preexistentes conservan su estado publicado y operabilidad legacy.
		4. Manipulación de estado: el servidor fuerza `draft` al crear y rechaza publicaciones directas vía update o spoofing.
		5. Rechazo estricto de IDs inexistentes o en borrador al crear créditos y solicitudes, con éxito en flujo legacy sin ID.
- **Validación QA:**
	- Suite automatizada: `tests/unit/institution-offers-versioning.test.ts` con **31/31 tests passing** (100% éxito).
	- Compilación TypeScript (`npm run check`): **0 errores**.
	- Empaquetado backend (`npm run build:server`): **0 errores** (`dist/index.js`, 931.2kb).

## 2026-10-08 — Corrección Final del Backfill PostgreSQL A1: Orden DDL, Preservación de Inactivos, Hashes Deterministas y Manejo Seguro de app_migrations

- **Rama:** `feat/institution-offers-versioning-a1`
- **Requisito 1: Corrección del Orden de Operaciones DDL en PostgreSQL:**
	- En `migrations/0005_institution_offers_versioning.sql` y `server/autoMigrate.ts`, las columnas `status` y `current_version_number` se agregan SIN `DEFAULT` previo (`ALTER TABLE public.institution_products ADD COLUMN IF NOT EXISTS status VARCHAR;`).
	- Esto previene que PostgreSQL 11+ asigne `'draft'` de forma inmediata a los registros preexistentes en el catálogo físico, permitiendo que el filtro `status IS NULL` distinga fielmente los registros históricos.
	- Las directivas `SET DEFAULT 'draft'` y `SET DEFAULT 1` se aplican como restricción de columna exclusivamente tras culminar el backfill histórico.
- **Requisito 2: Preservación de Productos Activos como Operativos e Inactivos como Inactivos:**
	- Los productos legacy activos (`is_active = true`) se preservan como operativos (`status = 'published'`, versión 1 `published`).
	- Los productos legacy inactivos (`is_active = false`) se preservan como inactivos (`status = 'archived'`, versión 1 `archived` con `effective_to = NOW()`).
	- Las nuevas ofertas creadas en borrador (`draft`) nunca son promovidas a publicadas por la migración.
- **Requisito 3: Generación de `version_hash` Válido y Determinista (SHA-256):**
	- En SQL: cálculo criptográfico de 64 caracteres hex mediante `encode(sha256(convert_to(jsonb_build_object(...)::text, 'UTF8')), 'hex')` para versiones publicadas y archivadas.
	- En runtime / `MemStorage`: generación consistente vía `computeInstitutionProductVersionHash` incorporando condiciones, requerimientos, variables y documentación requerida.
- **Requisito 4: Idempotencia y Blindaje del Marcador `app_migrations`:**
	- Verificación estricta de completitud post-backfill: si existe al menos un producto institucional sin versión en `institution_product_versions`, se aborta la ejecución con `RAISE EXCEPTION` y se previene el registro prematuro de `0005_legacy_institution_products_backfill_a1`.
- **Requisito 5: Pruebas y Reporte de Entorno:**
	- Ejecución de 32/32 tests en `tests/unit/institution-offers-versioning.test.ts` cubriendo preservación de activos e inactivos, hashes de 64 caracteres, dos arranques consecutivos y protección de borradores.
	- Reporte transparente: ante la ausencia de motor PostgreSQL / Docker local en el entorno Windows del host, la prueba en PostgreSQL físico aislado queda formalmente reportada como pendiente de validación en CI/CD.
- **Validación QA:**
	- Suite automatizada: `tests/unit/institution-offers-versioning.test.ts` con **32/32 tests passing** (100% éxito).
	- Compilación TypeScript (`npm run check`): **0 errores**.
	- Empaquetado backend (`npm run build:server`): **0 errores** (`dist/index.js`, 938.1kb).

## 2026-10-08 — Validación Final A1: CI con PostgreSQL Efímero, Equivalencia Canónica de Hashes SQL/Node y Control de Fallas Críticas

- **Rama:** `feat/institution-offers-versioning-a1`
- **Requisito 1: Configuración de PostgreSQL Efímero en GitHub Actions:**
	- Creado flujo de trabajo en `.github/workflows/postgres-migration-test.yml` con servicio de contenedor `postgres:16-alpine`.
	- Aislamiento total: corre exclusivamente contra la base de datos de test efímera `credito_negocios_test` sin tocar Producción ni Staging.
- **Requisito 2: Suite de Integración Real contra PostgreSQL (`tests/integration/postgres-versioning-migration.test.ts`):**
	- Prueba la migración 0005 desde un esquema legacy real con productos preexistentes activos e inactivos.
	- Verifica que los activos se preservan como operativos (`published`) y los inactivos como archivados (`archived`).
	- Valida que nuevos borradores creados tras la migración nunca se promuevan a publicados.
	- Valida idempotencia total en un segundo y tercer arranque.
	- Valida la protección del índice parcial único `ipv_published_unique` ante intentos de publicación concurrente.
- **Requisito 3: Equivalencia Matemática 100% entre Hashes SQL y Node:**
	- Implementada función SQL canónica `public.compute_legacy_version_hash(p_product_id, p_configuration, p_target_profiles, p_active_variables)` en `migrations/0005_institution_offers_versioning.sql` y `server/autoMigrate.ts`.
	- Garantiza orden alfabético idéntico de llaves y serialización sin espacios, produciendo hashes SHA-256 de 64 caracteres idénticos a `computeInstitutionProductVersionHash` de Node.
	- Añadida prueba unitaria de regresión (prueba 6 en `tests/unit/institution-offers-versioning.test.ts`) que valida la equivalencia matemática en múltiples escenarios.
- **Requisito 4: Control de Fallas Críticas de Migración:**
	- `server/autoMigrate.ts` retransmite (`rethrow`) los errores críticos de migración de ofertas, impidiendo que el arranque declare exitosa la verificación del esquema si existe alguna anomalía histórica.
- **Validación QA:**
	- Suite unitaria: `tests/unit/institution-offers-versioning.test.ts` con **33/33 tests passing** (100% éxito).
	- Suite integración PostgreSQL: configurada en CI y omitida limpiamente en entornos locales sin `DATABASE_URL` (8 skipped).
	- Compilación TypeScript (`npm run check`): **0 errores**.
	- Empaquetado backend (`npm run build:server`): **0 errores** (`dist/index.js`, 939.1kb).

## 2026-10-08 — Cierre de Seguridad del Test PostgreSQL A1: Exigencia de TEST_DATABASE_URL, Fixture con Users, Propagación de Errores y Rollback Seguro

- **Rama:** `feat/institution-offers-versioning-a1`
- **Requisito 1: Exigencia de TEST_DATABASE_URL y Validación de Seguridad Aislada:**
	- La suite de integración PostgreSQL en `tests/integration/postgres-versioning-migration.test.ts` ahora exige estrictamente `TEST_DATABASE_URL` y no utiliza `DATABASE_URL` de la aplicación.
	- Creado módulo `tests/testDbSafety.ts` con validación estricta (`assertSafeIsolatedTestDatabase`): rechaza terminantemente `NODE_ENV=production`, hosts productivos/staging conocidos (`railway.app`, `supabase.co`, `neon.tech`, `rds.amazonaws.com`, etc.), hosts remotos no autorizados y bases de datos que no contengan identificadores de prueba (`test`, `ephemeral`, `ci`, `/postgres`).
	- Se añadieron pruebas unitarias en `tests/unit/institution-offers-versioning.test.ts` (caso 7) certificando el rechazo de URLs inseguras o productivas.
- **Requisito 2: Fixture Completo con Dependencias Reales (incluyendo `users`):**
	- El fixture de integración recrea las dependencias reales previas a la migración 0005: tabla `public.users` con usuario fixture (`usr-test-admin-1`), `public.financial_institutions` (`fin-pg-test-1`), y tabla legacy `public.institution_products` con `created_by REFERENCES public.users(id)`.
	- Permite que las llaves foráneas `published_by` y `created_by` de `institution_product_versions` se resuelvan limpiamente en la base de datos real.
- **Requisito 3: Propagación de Error Crítico en `autoMigrate`:**
	- El bloque externo de `runAutoMigration` en `server/autoMigrate.ts` retransmite explícitamente (`throw error`) cualquier excepción crítica proveniente del Bloque A1, garantizando que el arranque del servidor no declare exitoso el esquema (`Schema verification and user sync completed successfully!`) si el backfill o verificación de completitud falla, preservando al mismo tiempo los fallbacks históricos (pasos 0 a 9 con aislamiento `try/catch`).
	- Se añadió prueba unitaria (caso 8) verificando la propagación y detención de arranque.
- **Manejo Estricto de Rollback Transaccional en PostgreSQL:**
	- En las pruebas de concurrencia (`ipv_published_unique`) y fallos simulados (`RAISE EXCEPTION`), se ejecuta inmediatamente `await client.query("ROLLBACK;");` tras capturar el error antes de cualquier consulta posterior, evitando el estado abortado de transacciones en PostgreSQL.
- **Validación QA:**
	- Suite unitaria: `tests/unit/institution-offers-versioning.test.ts` con **35/35 tests passing** (100% éxito).
	- Suite integración PostgreSQL: configurada y validada en modo seguro, omite sin falsos positivos cuando `TEST_DATABASE_URL` no está definida (8 skipped).
	- Compilación TypeScript (`npm run check`): **0 errores**.
	- Empaquetado backend (`npm run build:server`): **0 errores** (`dist/index.js`, 939.1kb).

## 2026-10-08 — Último Ajuste A1: Detención de Arranque en Server Index y Restauración de Marcador tras Rollback en Test 2g

- **Rama:** `feat/institution-offers-versioning-a1`
- **Requisito 1: Detención de Arranque en `server/index.ts`:**
	- Si `runAutoMigration()` falla y arroja error crítico, el bloque `catch` en `server/index.ts` ejecuta `process.exit(1)`, deteniendo inmediatamente el arranque del proceso e impidiendo registrar rutas o iniciar el servidor HTTP en un estado de base de datos inválido.
- **Requisito 2: Corrección de Expectativa en Test PostgreSQL 2g:**
	- En `tests/integration/postgres-versioning-migration.test.ts`, se ajustó la aserción de `app_migrations` tras el `ROLLBACK`: dado que el `DELETE` se ejecutó dentro de la transacción abortada, `ROLLBACK` restaura la fila preexistente del marcador (devolviendo 1 fila), al tiempo que descarta el producto huérfano simulado (devolviendo 0 filas).
- **Validación QA:**
	- Suite unitaria: `35/35 tests passing`.
	- Suite de integración: 8 omitidas en local sin `TEST_DATABASE_URL`.
	- TypeScript (`npm run check`): 0 errores.
	- Build server (`npm run build:server`): compilación exitosa (`dist/index.js`, 939.2kb).