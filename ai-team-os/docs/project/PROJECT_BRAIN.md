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
- **Sprint 2026-10-12 (Cierre Correctivo Fase 2B — Modelo de Pagos e Integridad):**
	- Checkpoint alcanzado en `integration/phase-1a1-base-segura`: `964762c`.
	- Regla obligatoria de cadena de pagos (COM-03/06, PAG-08/13/14): Crédito Negocios liquida exclusivamente al Master Broker por operaciones de su red (`masterBrokerShare + brokerShare`); se eliminaron las transferencias directas duales que dispersaban indebidamente al Broker subordinado desde CN.
	- Registro de obligación diferida Master → Broker como `networkObligation` con estado `'pending_master_payout'` y monto `brokerShare`, sin marcarla como pagada por CN.
	- Candado de simulador STP (PAG-12/13): `processStpPayment` es exclusivamente un simulador técnico; transferencias reales deshabilitadas; llamadas a `/pay` y `/bulk-pay` sin `simulate: true` son bloqueadas con HTTP 400 (`SIMULATED_STP_CANNOT_DISBURSE`); pruebas simuladas nunca marcan como `paid` y preservan estado `approved`.
	- Liquidación real autorizada exclusivamente manual por Super Admin vía `/mark-paid`: requiere referencia bancaria verificable obligatoria (SPEI, folio, clave de rastreo) y notas explicativas justificadas con auditoría e idempotencia.
	- Validación documental y bancaria enfocada (PAG-01/07/09/10/11, FIN-13/14): INE, CSF y estado de cuenta validados exigidos estrictamente al beneficiario que recibe de CN (Master en red, Broker en directo). Se eliminó el bloqueo indebido por documentos del Broker subordinado para dispersar al Master.
	- Aprobación 100% de suites automatizadas: `b2-commission-document-validation` (14/14), `b2-financial-qa-consolidation` (12/12), `commission-gate-security` (13/13), `commission-historical-beneficiary` (3/3), `npm run check` (0 errores) y `npm run build` exitoso.

En progreso:
- Preparación para la siguiente etapa del Plan Maestro v1.1: Financieras, Productos y Matching.

Pendiente:
- Pendientes del Registro Maestro v1.1 (`2199dd8`): PAG-15 (regla de canal con Master pero cuota Master cero) y PAG-16 (enmascaramiento RBAC de CLABE de Master ante Broker en consultas de payout; verificación granular en `/audit-logs`).
- Validación en PostgreSQL aislado (MIG-01 a MIG-05 y concurrencia de locks) pre-Staging.

Bloqueadores:
- Ninguno en código de aplicación o suites Jest locales.

## HISTORIAL
2026-04-17 — Sesion inicial: creacion de estructura base del sistema.
2026-04-17 — Sesion de expansion: nuevos roles clave y fortalecimiento estrategico de analytics.
2026-04-17 — Definicion de direccion: el sistema se opera como activo estrategico acumulable.
2026-05-02 — Sesión de Integración de Marketing y Orquestación: principios Sabri Suby + Top Quality.
2026-05-02 — **UPGRADE CLASE MUNDIAL v3.0:** Nuevo rol SRE, pipeline obligatorio con gates, activación automática de QA y Seguridad, sistema de logs profesional, handoffs explícitos en todos los roles, 16 archivos creados/actualizados.
2026-09-04 — Implementación de Filtros de Clientes, Multi-Dispersión de Créditos con Comisiones Individuales, Red de Brokers 3-en-1 para Super Admin, y corrección de build Vercel (IIFE en JSX).
2026-09-11 — Corrección de build en Railway, reparación de esquema PostgreSQL (`referral_code`), implementación de fallback nativo SQL en autenticación, restauración y blindaje de matriz RBAC (3 cuentas con `Prueba1$`) y validación live en producción.
2026-09-17 — Procesamiento de `Plantilla_Comisiones_Financieras Luis.xlsx`, alta de 5 nuevas financieras (Altum, Cualli, Jeeves, Aspiria, Kapital) y actualización de Pretmex. Purga de 5 entidades de prueba e incorporación de eliminación permanente segura (`DELETE /api/financial-institutions/:id`). Catálogo consolidado en 18 financieras reales.
2026-10-12 — Cierre Correctivo Fase 2B (`964762c`): Reestructuración de cadena de pagos (pago consolidado exclusivo al Master en redes, registro de obligación pendiente Master→Broker), candado estricto contra desembolsos reales simulados STP (PAG-12/13), liquidación manual auditada por Super Admin con referencia bancaria obligatoria y validación documental focalizada al receptor legítimo. Compilación y 42 pruebas Jest aprobadas.