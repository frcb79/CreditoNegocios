# PROJECT BRAIN — Memoria del Proyecto
Base de este proyecto master.
Para nuevos proyectos de cliente usar `docs/project/PROJECT_BRAIN_TEMPLATE.md`.
Se actualiza AL FINAL de cada sesion.

## INFO DEL PROYECTO
Nombre: ai-team-os
Cliente: Operacion interna (Sistema del equipo)
Fecha inicio: 2026-04-17
Fase: Producción — Listo para deploy en proyectos reales
Estado: Activo — v3.0 Clase Mundial

## QUE ES ESTE PROYECTO
Sistema operativo de trabajo para equipos de IA orientados a construir y entregar proyectos profesionales.
Sirve para que cada nuevo proyecto arranque con roles, protocolos, decisiones y memoria acumulada.
Resuelve el problema de empezar de cero en cada cliente y reduce errores repetidos.

## STACK
Frontend: N/A (repositorio de conocimiento y operacion)
Backend: N/A (documentacion y sistema de trabajo)
Deploy: GitHub (versionado del sistema)

## ESTADO ACTUAL
Completado:
- Estructura base del sistema (roles, protocolos, docs de proyecto, autonomia).
- Expansion de roles operativos y estrategicos (14-21).
- Refuerzo de 10_DATA_ANALYTICS como rol estrategico de negocio.
- **Integración de Marketing Estratégico (Sabri Suby).**
- **Overhaul del Orquestrador con Protocolo Top Quality.**
- Formalizacion del principio de memoria institucional acumulable.
- **v3.0 UPGRADE CLASE MUNDIAL (2026-05-02):**
	- Nuevo rol 22_SRE_MONITOR — monitoreo continuo, logs, health checks, post-mortem.
	- Pipeline de Entrega Obligatorio con gates: QA ✅ → Security 🔒 → Deploy → Monitor.
	- QA (09) y Seguridad (07) ahora son AUTOMÁTICOS — se activan sin necesidad de llamarlos.
	- Sistema de Logs Estructurado en ERROR_LOG.md con trazabilidad profesional.
	- Handoffs explícitos en todos los roles técnicos (PM→Dev, UX→Dev, Arch→Dev, Dev→QA→Sec→DevOps→SRE).
	- Orquestrador con tabla de delegación explícita y verificación de gates.
	- Upgrade de COO (19) y Community Manager (20) a profundidad clase mundial.
	- Scrum Master (14) con Definition of Done que incluye gates obligatorios.
	- README actualizado a v3.0 con tabla completa de 22 roles.
- **Sprint 2026-09-04 (CreditoNegocios):**
	- Filtros avanzados en cartera de Clientes por Bróker originador y Master Bróker (`ClientList.tsx`).
	- Arquitectura Multi-Dispersión: soporte para que el cliente acepte propuestas de múltiples financieras para un mismo requerimiento crediticio, con dispersión independiente y comisiones individuales sin cancelar propuestas hermanas (`server/routes.ts`).
	- Módulo 3-en-1 de Red de Brokers para Super Admin (`BrokerNetwork.tsx`): vista de Master Brokers con acordeón de sus brokers, vista de Brokers Directos Independientes y vista de Mi Red Directa (Casa Matriz) con invitación.
	- Resolución de bug de build en Vercel (esbuild `Unexpected "const"` por falta de apertura IIFE en JSX en `CreditList.tsx`).
- **Sprint 2026-09-11 (CreditoNegocios - RBAC & Acceso en Staging):**
	- Resolución de bloqueo de build en Railway (Nixpacks con `NODE_ENV=production`) mediante `nixpacks.toml` y migración de bundlers a `dependencies`.
	- Diagnóstico forense de desincronización de esquema: adición de columna faltante `referral_code` a `autoMigrate.ts` en PostgreSQL que bloqueaba Drizzle ORM.
	- Creación de capa de resiliencia en `server/dbStorage.ts` con fallback a SQL nativo (`pool.query`) en `getUser` y `getUserByEmail`.
	- Restauración y aseguramiento permanente de la matriz de roles de prueba: `francocb79@gmail.com` (Super Admin), `fcb@creditonegocios.com.mx` (Master Broker con clave `MB-FRANCO`), y `francocb79@yahoo.com` (Broker vinculado a la red), todos validados con contraseña `Prueba1$`.
	- Verificación en vivo en Railway de los 3 accesos con respuesta HTTP 200 OK y emisión de cookies de sesión seguras.
- **Sprint 2026-09-17 (CreditoNegocios - Financieras Adicionales & Comisiones):**
	- Procesamiento del documento `Plantilla_Comisiones_Financieras Luis.xlsx` (pestaña `Financieras adicionales`, omitiendo columnas C y D).
	- Creación del generador `scripts/convert-adicionales-to-financieras.cjs` y plantilla estandarizada `scripts/financieras-adicionales-import.xlsx`.
	- Alta e importación exitosa (100% - 9 perfiles/productos, 0 errores) en Railway Staging para 5 nuevas financieras: Altum, Cualli, Jeeves (con plantilla de producto "Credito Revolvente"), Aspiria, Kapital, y actualización de Pretmex con nuevas reglas y esquemas de comisión.
	- Purga y depuración permanente de 5 entidades de pruebas pasadas (E2E Flujo Completo, Financiera Demo, Financiera Prueba Franco) para dejar el catálogo oficial limpio en exactamente 18 financieras sin duplicados ni faltantes.
	- Implementación del endpoint y método `DELETE /api/financial-institutions/:id` con soporte de eliminación en cascada referencial y confirmación en UI (`Financieras.tsx`).
- **Sprint 2026-10-08 (Bloque A1, Correcciones A1.1–A1.4 y Validación Final A1 — Ofertas Canónicas, Versionado Seguro y Validación Real en CI):**
	- Consolidación del catálogo canónico en `institution_products` con historial en `institution_product_versions`, eliminando catálogos duales y manteniendo retrocompatibilidad mediante vistas SQL y aliases TypeScript.
	- Soporte para múltiples ofertas del mismo `product_type` por financiera sin colisiones de clave única.
	- Ciclo de vida robusto: nuevas ofertas y versiones inician en `draft`; gate de calidad estricto antes de publicar (`validateMinimumPublishConditions`).
	- Transaccionalidad atómica y concurrencia blindada: `publishInstitutionProductVersion` con locks pesimistas (`SELECT ... FOR UPDATE`) y actualización atómica de versión anterior a `superseded`.
	- Restricción estricta de unicidad a nivel PostgreSQL: índice condicional `ipv_published_unique` (`WHERE status = 'published'`), garantizando un máximo de 1 versión activa.
	- Hashes criptográficos SHA-256 (`version_hash`) extendidos para incluir `requiredDocuments` (ordenados determinísticamente) para auditoría jurídica de condiciones.
	- Normalización de esquema: corrección de `createdAt` a snake_case `created_at` en DDL y verificación defensiva de columnas en `autoMigrate.ts`.
	- Blindaje contra bypass legacy: `updateInstitutionProduct` y `PUT /api/institution-products/:id` impiden publicar directamente o mutar condiciones de ofertas ya publicadas.
	- Desactivación lógica: `deleteFinancialInstitution` y `deleteInstitutionProduct` aplican soft-deactivation (`isActive: false`, `archived`) cuando existen créditos o versiones publicadas, protegiendo el historial legal.
	- Cierre de compatibilidad y elegibilidad (A1.3): migración idempotente de productos preexistentes a `status = 'published'` con versión inicial v1 publicada, protegiendo la operación legacy; exigencia de versiones efectivamente publicadas (no confiar solo en `status`) y blindaje backend (`POST /api/credit-submissions`, `POST /api/credits`) excluyendo ofertas en borrador.
	- Cierre definitivo de seguridad (A1.4): backfill ejecutado una sola vez respaldado por `app_migrations` filtrando por `status IS NULL` (nunca promueve borradores nuevos al reiniciar); forzado estricto de `status: 'draft'` desde servidor en creación de ofertas; rechazo de IDs de oferta inexistentes o no elegibles en créditos y solicitudes preservando flujos legacy sin ID.
	- **Validación Final A1 y Seguridad del Test PostgreSQL:** Configuración de entorno de prueba PostgreSQL 16 efímero en GitHub Actions (`.github/workflows/postgres-migration-test.yml`); suite de integración completa en `tests/integration/postgres-versioning-migration.test.ts` con exigencia estricta de `TEST_DATABASE_URL` aislada (`tests/testDbSafety.ts`), dependencias reales completas (`users`, `financial_institutions`, `institution_products`), inmutabilidad de borradores nuevos, segundo/tercer arranque idempotente, fallo de concurrencia `ipv_published_unique` 23505 y rollback seguro de transacciones abortadas (con restauración de marcador previo y descarte de producto corrupto en test 2g); función PL/pgSQL canónica `compute_legacy_version_hash` idéntica 100% a Node; propagación y rethrow de fallo en `autoMigrate.ts` con aborto de arranque vía `process.exit(1)` en `server/index.ts`.
	- Aislamiento estricto de seguridad: comisiones internas de Crédito Negocios desacopladas de las ofertas.
	- Suite automatizada: `tests/unit/institution-offers-versioning.test.ts` (**35/35 tests passing**) y suite de integración postgres preparada de forma segura para CI (8 skipped en entornos sin `TEST_DATABASE_URL`).

En progreso:
- Preparación para bloques subsiguientes: Diccionario Canónico de Variables, Matching por Oferta, Esquemas de Comisiones y Aceptación Comercial.

Pendiente:
- Bloques B y C: Matching contra versiones activas de ofertas y cálculo de comisiones desacopladas por rol.
- Revisión de items de `Pendientes.md` (logo/fondo transparente en sidebar, mensaje de devolución admin en modal de broker, tracking de pagos de sobretasa de financiera a super admin).
- Medir impacto del sistema en tiempo de arranque, calidad y velocidad de entrega.
- Establecer ritual de sync periódico de aprendizajes al repositorio maestro.

Bloqueadores:
- Ninguno. Tests unitarios en verde (35/35), tests de integración listos para PostgreSQL efímero en CI, TypeScript sin errores (0 errores), build de servidor verificado (939.2kb), base de datos con migración idempotente y transacciones ACID.

## HISTORIAL
2026-04-17 — Sesion inicial: creacion de estructura base del sistema.
2026-04-17 — Sesion de expansion: nuevos roles clave y fortalecimiento estrategico de analytics.
2026-04-17 — Definicion de direccion: el sistema se opera como activo estrategico acumulable.
2026-05-02 — Sesión de Integración de Marketing y Orquestación: principios Sabri Suby + Top Quality.
2026-05-02 — **UPGRADE CLASE MUNDIAL v3.0:** Nuevo rol SRE, pipeline obligatorio con gates, activación automática de QA y Seguridad, sistema de logs profesional, handoffs explícitos en todos los roles, 16 archivos creados/actualizados.
2026-09-04 — Implementación de Filtros de Clientes, Multi-Dispersión de Créditos con Comisiones Individuales, Red de Brokers 3-en-1 para Super Admin, y corrección de build Vercel (IIFE en JSX).
2026-09-11 — Corrección de build en Railway, reparación de esquema PostgreSQL (`referral_code`), implementación de fallback nativo SQL en autenticación, restauración y blindaje de matriz RBAC (3 cuentas con `Prueba1$`) y validación live en producción.
2026-09-17 — Procesamiento de `Plantilla_Comisiones_Financieras Luis.xlsx`, alta de 5 nuevas financieras (Altum, Cualli, Jeeves, Aspiria, Kapital) y actualización de Pretmex. Purga de 5 entidades de prueba e incorporación de eliminación permanente segura (`DELETE /api/financial-institutions/:id`). Catálogo consolidado en 18 financieras reales.
2026-10-08 — Implementación del Bloque A1, Correcciones A1.1–A1.4, Validación Final A1, Seguridad y Último Ajuste: Consolidación de catálogo canónico en `institution_products`, versionado aditivo inmutable, transacciones concurrentes ACID, normalización snake_case `created_at`, blindaje contra bypass legacy, desactivación lógica, DDL sin default previo para detección de `status IS NULL`, workflow CI con PostgreSQL 16 efímero, suite de integración postgres exigiendo `TEST_DATABASE_URL` aislada y fixture con `users`, rollback transaccional obligatorio con restauración de estado, detención inmediata de arranque con `process.exit(1)` en `server/index.ts` ante fallo crítico de auto-migración, reconciliación 100% matemática de hashes SHA-256 SQL/Node (`compute_legacy_version_hash`), y verificación estricta en `app_migrations` en rama `feat/institution-offers-versioning-a1`.