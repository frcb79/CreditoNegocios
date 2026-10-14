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

## 2026-10-12 — Cierre Correctivo Fase 2B: Modelo de Pagos, Candado STP y Liquidación Manual

- **Rama:** `integration/phase-1a1-base-segura` — Commit: `964762c`.
- **Modelo de Pagos Obligatorio (COM-03/06, PAG-08/13/14):**
	- Liquidación exclusiva al Master Broker por operaciones de su red (`masterBrokerShare + brokerShare`, sin margen CN).
	- Eliminación definitiva de transferencias directas duales que dispersaban al Broker subordinado desde CN.
	- Registro de obligación diferida Master → Broker como `networkObligation` con estado `'pending_master_payout'` y monto `brokerShare`, sin marcarla como pagada por CN.
	- Preservación de 3 canales canónicos: (1) Broker Directo: CN paga a Broker; (2) Master Directo: CN paga a Master; (3) Broker de Red: CN paga monto consolidado al Master.
- **Validación Documental Focalizada (PAG-01/07/09/10/11, FIN-13/14):**
	- Expediente completo (INE, CSF, estado de cuenta) y CLABE interbancaria exigidos estrictamente al beneficiario que recibe de CN.
	- Eliminado el bloqueo erróneo que requería documentos del Broker subordinado para liquidar al Master Broker.
- **Candado de Simulador STP y Liquidación Manual (PAG-12/13):**
	- `processStpPayment` confinado como simulador técnico; transferencias reales deshabilitadas.
	- Bloqueo en `/pay` y `/bulk-pay` ante llamadas sin `simulate: true` con HTTP 400 (`SIMULATED_STP_CANNOT_DISBURSE`).
	- Pruebas simuladas devuelven `{ simulated: true, paid: false }` y mantienen la comisión en `approved`.
	- Liquidación real autorizada exclusivamente manual por Super Admin en `/mark-paid` con clave de rastreo SPEI verificable obligatoria y justificación en bitácora.
- **Validación QA y Builds:**
	- `b2-commission-document-validation.test.ts`: 14/14 tests pasando.
	- `b2-financial-qa-consolidation.test.ts`: 12/12 tests pasando.
	- `commission-gate-security.test.ts`: 13/13 tests pasando.
	- `commission-historical-beneficiary.test.ts`: 3/3 tests pasando.
	- `npm run check`: 0 errores TypeScript.
	- `npm run build`: bundle cliente y servidor exitosos (0 errores).
## 2026-10-13 — Consolidación prelaunch, recuperación funcional y control de costos
- Rama única de integración y PR #10 Draft; sin cambios autorizados en main ni despliegues de Producción.
- Recuperación selectiva de expediente Broker/Master, Matching M2/M3, registro atómico, invitaciones Broker/Master con token, activación con Términos/Aviso verificables y seguridad de credenciales.
- Restaurados Plan Maestro v1.1, Registro Maestro y planificación legal histórica con estado actual en `docs/integracion/ESTADO_CIERRE_PRELAUNCH.md`.
- Nueva Producción será Supabase Free limpio; preservar datos de prueba en infra existente. **No crear ni pagar recursos adicionales sin autorización.**
- Bitácora avanzada diferida; auditorías operativas obligatorias. CI y E2E se reportan por SHA, sin confundir build con GO.
