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

En progreso:
- Estabilización y validación visual de los flujos de dispersión y red en entorno de producción Vercel.

Pendiente:
- Revisión de items de `Pendientes.md` (logo/fondo transparente en sidebar, mensaje de devolución admin en modal de broker, tracking de pagos de sobretasa de financiera a super admin).
- Medir impacto del sistema en tiempo de arranque, calidad y velocidad de entrega.
- Establecer ritual de sync periódico de aprendizajes al repositorio maestro.

Bloqueadores:
- Ninguno. Todos los builds e integraciones están en verde.

## HISTORIAL
2026-04-17 — Sesion inicial: creacion de estructura base del sistema.
2026-04-17 — Sesion de expansion: nuevos roles clave y fortalecimiento estrategico de analytics.
2026-04-17 — Definicion de direccion: el sistema se opera como activo estrategico acumulable.
2026-05-02 — Sesión de Integración de Marketing y Orquestación: principios Sabri Suby + Top Quality.
2026-05-02 — **UPGRADE CLASE MUNDIAL v3.0:** Nuevo rol SRE, pipeline obligatorio con gates, activación automática de QA y Seguridad, sistema de logs profesional, handoffs explícitos en todos los roles, 16 archivos creados/actualizados.
2026-09-04 — Implementación de Filtros de Clientes, Multi-Dispersión de Créditos con Comisiones Individuales, Red de Brokers 3-en-1 para Super Admin, y corrección de build Vercel (IIFE en JSX).