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