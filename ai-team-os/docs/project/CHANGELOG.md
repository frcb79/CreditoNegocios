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