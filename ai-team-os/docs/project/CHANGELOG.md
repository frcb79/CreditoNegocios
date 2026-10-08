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