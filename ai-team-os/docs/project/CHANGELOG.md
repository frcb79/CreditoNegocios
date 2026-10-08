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

## 2026-10-07 — Broker Network Transitions & Escalamiento Broker–Master
- **Servicio y Rutas de Transición (`brokerNetworkTransitionService.ts`, `brokerNetworkTransitionRoutes.ts`):**
	- Implementación de `executeBrokerNetworkTransition` bajo transacción atómica y locks consultivos PostgreSQL:
		- Asignación/reasignación entre Master Brokers (`assign_master`).
		- Desconexión hacia Crédito Negocios directo (`assign_platform` con `masterBrokerId = null`).
		- Promoción Broker -> Master Broker (`promote_master`), preservando identidad, usuario y tenant.
	- Invalidación automática de solicitudes pendientes de estatus ante movimientos de red.
	- Auditoría inmutable en `commercial_audit_logs` con motivo obligatorio y desglose anterior/nuevo.
- **Migración 0004 (`migrations/0004_broker_network_transitions.sql`):**
	- Columnas indexadas `origin_master_broker_id` en `credits` y `credit_submission_requests`.
	- Marcadores de migración `system_migration_markers` para garantizar backfills únicos.
	- Normalización de Casa Matriz legacy (enlaces broker -> admin normalizados a directo plataforma).
	- Triggers PL/pgSQL de base de datos para impedir mutaciones en snapshots históricos de oportunidades, solicitudes y créditos.
- **UI de Gestión de Red (`BrokerNetworkTransitionDialog.tsx`, `UserManagement.tsx`):**
	- Modal institucional para Super Admin con selección de acción, destino, motivo obligatorio y opción de reactivación.
- **Estabilización de QA y Tests:**
	- Desempate determinista por orden de inserción en `MemStorage.getCommercialAuditLogs`.
	- Corrección de delimitadores PL/pgSQL `$$` en migración 0004.
	- Cobertura 100% pasando: 161 unit tests y 51 E2E tests en Staging.

## 2026-10-07 — Cierre P0: Formalización Obligatoria y Cierre de Bypasses en Originación
- **Cierre Integral de Bypasses de Originación (`server/tenantPermissions.ts` & `server/routes.ts`):**
	- Implementación de `validateEffectiveBrokerFormalization` y pipeline `validateCommercialOriginationAndFormalization`.
	- Protección estricta en todas las rutas de originación: `POST /api/clients`, `POST /api/credits`, `POST /api/credit-submissions`, `POST /api/credit-submissions/:id/targets`, `POST /api/mortgage-leads`, y `POST /api/clients/:id/opportunities`.
	- Resolución del broker efectivo: bloqueo con `403 FORMALIZATION_REQUIRED` si el broker titular o delegado no cuenta con sus convenios vigentes, incluso cuando la acción es ejecutada por administradores o colaboradores en su nombre.
	- Exención y preservación intacta de facultades para administradores que originan operaciones propias.
	- Validación dinámica por rol: exigencia de Convenio y Reglas de Red para Brokers, y adicionalmente Reglas Master para Master Brokers (incluyendo casos de promoción).
	- Preservación de la experiencia acordada: libre registro, login, consulta de perfil y navegación previa a formalizar.
- **Suite de Pruebas Automatizadas (`tests/unit/broker-formalization-origination-gate.test.ts`):**
	- 14 pruebas de integración unitarias cubriendo los 8 escenarios obligatorios al 100% (14/14 pasando).
	- Regresión limpia: suite de formalización UI `broker-formalization-ui-block3b2a.test.ts` pasando al 100% (17/17).

## 2026-10-07 — Integración Controlada 01: Linaje Histórico de Red, Formalización y Protección Bancaria
- **Integración de Ramas:**
	- Fusión controlada de `feat/broker-network-transitions` y `feat/broker-formalization-origination-gate` sobre la rama `integration/network-formalization` basada en `main`.
	- Resolución armónica de conflictos en `server/autoMigrate.ts` (preservando Sección 11a de triggers/snapshots y Sección 7 de Bloque 2 legal), `server/routes.ts` (registro atómico con evidencia legal + aprovisionamiento canónico de tenant), y documentación AI-Team-OS.
- **Atribución Bancaria Histórica de Comisiones (`server/routes.ts` & `Commissions.tsx`):**
	- Corrección crítica en `GET /api/commissions`: la cuenta destino (`effectiveBankAccount`) y el beneficiario (`effectiveBeneficiary`) se obtienen obligatoriamente del Master histórico de la operación (`commission.masterBrokerId` con fallback a `credit.originMasterBrokerId`), nunca del Master actual del broker.
	- Blindaje en dispersión individual y masiva (`POST /api/commissions/:id/pay` y `POST /api/commissions/bulk-pay`):
		- Resolución estricta del beneficiario histórico.
		- Validación de 18 dígitos en la CLABE oficial del expediente formalizado.
		- Rechazo con 400 si el cliente intenta enviar una CLABE alternativa o inconsistente en el payload, impidiendo alteraciones silenciosas.
	- UI de Dispersión (`client/src/pages/Commissions.tsx`):
		- Campo de CLABE en modo solo lectura (`readOnly`, fondo bloqueado, copy explicativo de seguridad).
		- Alerta bloqueante y botón deshabilitado si el beneficiario no cuenta con CLABE oficial registrada.
- **Validación Automatizada y QA:**
	- Nueva suite: `tests/unit/commission-historical-beneficiary.test.ts` (3/3 pasando al 100%).
	- Regresiones de formalización y gobernanza pasando al 100% (`credit-origin-affiliation.test.ts`, `broker-formalization-origination-gate.test.ts`, `broker-formalization-ui-block3b2a.test.ts`, `user-status-requests.test.ts`, `user-operational-status.test.ts`).
	- Compilación de tipos (`npm run check`) y build de producción (`npm run build`) exitosos.

## 2026-10-07 — P0: Integridad de Registro de Brokers y Liquidación de Comisiones

- **Unificación Atómica del Registro de Brokers (`POST /api/auth/register`, `server/dbStorage.ts`, `server/storage.ts`, `server/routes.ts`):**
	- Se integraron en una única transacción PostgreSQL (`tx`) indivisible:
		- Identidad del broker (`users`).
		- Aceptación de Términos y Reconocimiento de Aviso (`legal_acceptances`).
		- Tenant propio tipo `broker` (`tenants`).
		- Membresía `owner` con `canOriginate=true` (`tenant_members`).
		- Afiliación al Master correspondiente o Casa Matriz (`parentTenantId`).
	- Eliminación definitiva del bloque desacoplado `try/catch` que permitía el aprovisionamiento parcial.
	- Si cualquier paso falla (duplicidad, error de tenant, hashes inválidos), PostgreSQL ejecuta rollback total del registro.
	- Nueva suite: `tests/unit/broker-registration-atomicity.test.ts` (4/4 pasando al 100%).

- **Blindaje contra Doble Conteo en Comisiones Master Directo (`server/routes.ts`, `client/src/pages/Commissions.tsx`):**
	- Creación del helper canónico `getCommissionPayoutAmount` en backend y sincronizado en frontend.
	- Identificación precisa de `isMasterDirect` (`historicalMasterId === brokerId`), calculando el importe liquidable como cuota única legítima (sin duplicar `brokerShare + masterBrokerShare`).
	- Saneamiento y protección de `frozenAmount` ante registros legacy con importes doblados (capeado seguro al monto único).
	- Corrección en todas las rutas de ciclo de vida financiero:
		- `GET /api/commissions`: `payoutAmount` único, `isNetworkPayout: false` para Master Direct.
		- `POST /api/commissions/:id/approve` y `POST /api/commissions/bulk-approve`: congelan cuota única.
		- `POST /api/commissions/:id/pay`, `POST /api/commissions/bulk-pay` y `POST /api/commissions/:id/mark-paid`: liquidan cuota única, rechazan CLABE alterada o ausente y preservan inmutabilidad histórica.
	- UI `Commissions.tsx`:
		- Tabla principal: `payoutToNetwork` y monto protagonista reflejan cuota única; badge `Master Directo` sin subtítulo de reparto subordinado.
		- Modal de desglose en cascada: Super Admin visualiza la dispersión a la red neta (sin doblar); Master Broker visualiza originación directa 100% neta sin reparto phantom a broker inexistente.
		- Métrica agregada: `mbOwedToBrokers` excluye comisiones directas del Master.
	- Nueva suite: `tests/unit/commission-payout-integrity.test.ts` (11/11 pasando al 100%).

- **Validación y Cierre:**
	- Typecheck (`tsc`) limpio.
	- Build de producción (`npm run build`) exitoso.
	- 100% de tests unitarios y de regresión pasando limpiamente.

## 2026-10-08 — Cierre de QA P0: Integridad de Afiliación, Auditoría de Importes Congelados y Pruebas HTTP de Endpoints

- **Integridad Estricta de Afiliación (`server/dbStorage.ts`, `server/storage.ts`, `server/brokerNetworkTransitionService.ts`):**
	- Resolución canónica reutilizando `getPlatformTenant` y `getOwnedTenant`.
	- En `registerUserWithLegalEvidence`, si `masterBrokerId` está definido y no se encuentra un tenant Master válido, se rechaza y revierte la transacción PostgreSQL completa (cero fallback silencioso a plataforma).
	- Para brokers directos (`masterBrokerId == null`), se valida la existencia del tenant de plataforma, fallando de forma segura con rollback ante su ausencia.
- **Auditoría de Importes Congelados y Blindaje de Liquidación (`server/routes.ts`, `client/src/pages/Commissions.tsx`):**
	- Función de auditoría `auditCommissionPayout` implementada para evaluar discrepancias entre `frozenAmount` y el cálculo canónico de liquidación (`getCommissionPayoutAmount`).
	- Reglas estrictas:
		- `frozenAmount = 0` explícito nunca se convierte automáticamente en pago positivo.
		- No se reduce silenciosamente ningún importe congelado que exceda la cuota canónica.
		- Discrepancias históricas bloquean la dispersión (`POST /api/commissions/:id/pay`, `POST /api/commissions/bulk-pay`, `POST /api/commissions/:id/mark-paid`) retornando HTTP 400 con código `FROZEN_AMOUNT_DISCREPANCY` y `requiresAdminReview: true`.
		- Las comisiones aprobadas y pagadas en base de datos permanecen 100% inmutables (cero mutación automática en DB).
		- En `client/src/pages/Commissions.tsx`, se expone la alerta "Revisión Requerida" e impide el envío a dispersión STP cuando existe discrepancia.
		- Preservación íntegra de la corrección contra doble conteo de Master Directo.
	- **Evidencia Persistente de Auditoría:** Registro obligatorio en `commission_audit_logs` con `action: 'dispersion_blocked'` ante cualquier intento de dispersión con CLABE inválida/faltante (`CLABE_INVALID_OR_MISSING`), intento de alteración (`CLABE_TAMPERING_ATTEMPT`) o discrepancia en importe congelado (`FROZEN_AMOUNT_DISCREPANCY`).
- **Suite de Pruebas HTTP/Integración con Mock STP (`tests/unit/p0-endpoint-integration.test.ts`):**
	- 16 pruebas exhaustivas con Supertest cubriendo el ciclo completo de endpoints:
		- `POST /api/commissions/:id/pay`
		- `POST /api/commissions/bulk-pay`
		- `POST /api/commissions/:id/mark-paid`
		- Registro directo y bajo Master Broker con validación de rollback y fallo atómico de aprovisionamiento.
		- Beneficiario histórico en transferencias de red, rechazo de CLABE alterada/faltante y bloqueo por importe congelado con discrepancia.
		- Verificación de creación de evidencias persistentes en `commission_audit_logs`.
- **Validación y QA Integral:**
	- Typecheck (`npm run check`): 0 errores.
	- Build de producción (`npm run build`): exitoso.
	- 100% de suites de pruebas pasando limpiamente (69 unit tests de suites P0 y formales).
- **Preparación de QA Integral en Staging:**
	- Creación de la rama de integración `qa/staging-consolidation-p0`.
	- Auditoría de migraciones e idempotencia en `server/autoMigrate.ts` y SQL DDL.
	- Documentación de protocolos de despliegue, rollback y checklist de validación sin afectar producción.

## 2026-10-08 — P0: Seguridad del Arranque antes de Staging (Zero-Destructive Startup)

- **Auditoría y Blindaje de `server/autoMigrate.ts`:**
	- Se clasificaron y depuraron todas las operaciones de escritura en el arranque del servidor.
	- **Cero Mutaciones Destructivas en Boot:** Se eliminó el reseteo forzoso de contraseñas (`Prueba1$`), alteración de roles de usuario, reactivación masiva de cuentas (`is_active = TRUE`), reasignaciones forzosas de broker a Master, reactivación indiscriminada de financieras y eliminación de financieras de prueba.
	- **Idempotencia de Esquema y Marcadores de Migración:** Se creó la tabla `system_migration_markers` en el paso de arranque. Todos los backfills históricos DML/DDL se blindaron con marcadores unívocos (`credits_origin_master_snapshot_v1`, `tenant_members_owner_originate_v1`, `commissions_bloque6_cleanup_v1`, etc.) y con filtros estrictos `WHERE origin_master_broker_id IS NULL`, garantizando que transiciones de red actuales jamás contaminen el linaje de créditos históricos.
	- **Arranque Seguro en Base Existente:** La inicialización de usuarios se condicionó a `SELECT count(*) FROM users`; si la base de datos ya contiene registros, no se ejecuta ninguna inserción o actualización de usuarios.
- **Herramienta Administrativa Gobernada (`scripts/admin-bootstrap-environment.ts`):**
	- Se desacoplaron las operaciones administrativas excepcionales en una herramienta CLI independiente (`npm run admin:bootstrap`) protegida con flags explícitos:
		- `--seed-test-accounts`: Creación/actualización deliberada de cuentas de desarrollo.
		- `--force-reset-passwords`: Restablecimiento intencional de credenciales de desarrollo.
		- `--cleanup-test-institutions`: Desvinculación y saneamiento de financieras de prueba.
		- `--sanitize-rbac`: Reasignación de permisos RBAC para pruebas.
- **Aislamiento Staging / Producción y Auditoría de Seguridad:**
	- Confirmado aislamiento físico estricto: `.env.staging.local` apunta a proxy aislado de Staging en Railway (`trolley.proxy.rlwy.net:43850`). Producción no se accede desde este entorno.
	- Reportado Incidente `SEC-2026-10-08-001` en modo de solo lectura (detección de bypass de login en `server/routes.ts` líneas 1403-1415 con contraseñas fijas para correos específicos) con propuesta formal de remediación.
- **Suite de Pruebas Automatizadas y Verificación:**
	- Nueva suite: `tests/unit/startup-migration-security.test.ts` (7/7 pruebas pasando), comprobando no alteración de contraseñas, roles, estados, redes, financieras y comprobando idempotencia en reinicios múltiples.
	- Regresión de endpoints: `tests/unit/p0-endpoint-integration.test.ts` (16/16 pasando).
	- Compilación de tipos (`npm run check`): 0 errores.
	- Build de producción (`npm run build`): exitoso sin advertencias de dependencias duplicadas.



