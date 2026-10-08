# ERROR LOG — Sistema de Registro y Trazabilidad de Errores
> Documentar TODOS los errores, cómo se resolvieron y qué aprendimos.
> Consultar SIEMPRE al inicio de sesión.
> Mantenido por: SRE & Monitor (22) + todos los roles que detecten errores.
> Última actualización: 2026-05-02

---

## DASHBOARD DE SALUD — RESUMEN RÁPIDO

| Métrica | Valor |
|---------|-------|
| 🔴 Errores Críticos Abiertos | 0 |
| 🟠 Errores Altos Abiertos | 0 |
| 🟡 Errores Medios Abiertos | 0 |
| Total Errores Resueltos | 5 |
| Último Incidente | 2026-10-07 (ERR-2026-10-07-002) |

---

## CÓMO REGISTRAR UN ERROR

Usar el siguiente formato para CADA error. El ID se genera con: `ERR-[FECHA]-[NÚMERO]`

```
### ERR-YYYY-MM-DD-### — [Título descriptivo]

| Campo | Valor |
|-------|-------|
| ID | ERR-YYYY-MM-DD-### |
| Fecha detección | YYYY-MM-DD HH:MM CST |
| Severidad | 🔴 Crítico / 🟠 Alto / 🟡 Medio / 🟢 Bajo |
| Área | Frontend / Backend / Infra / Seguridad / UX / IA |
| Estado | 🔴 Abierto / 🟡 Investigando / 🟢 Resuelto / ✅ Verificado |
| Reportado por | [Rol o persona] |
| Asignado a | [Rol responsable] |

**Descripción:**
[Qué está pasando exactamente]

**Pasos para reproducir:**
1. [Paso 1]
2. [Paso 2]

**Impacto en negocio:**
[A quién afecta — en dinero, usuarios o reputación]

**Solución aplicada:**
[Qué se hizo para resolverlo]

**Causa raíz:**
[Por qué pasó — no el síntoma, la causa real]

**Aprendizaje:**
[Qué cambiamos para que no vuelva a pasar]

**Fecha resolución:** YYYY-MM-DD
**Verificado por:** [Rol que confirmó]
```

---

## CATEGORIZACIÓN

### Por Severidad
| Nivel | Criterio | Respuesta máxima |
|-------|----------|-----------------|
| 🔴 Crítico | Sistema caído, datos perdidos, seguridad comprometida | < 15 min |
| 🟠 Alto | Feature principal rota, sin workaround obvio | < 2 horas |
| 🟡 Medio | Feature secundaria rota, workaround disponible | < 24 horas |
| 🟢 Bajo | Cosmético, typo, mejora menor | Próximo sprint |

### Por Área
- **Frontend:** UI, componentes, responsive, JavaScript errors
- **Backend:** API, base de datos, auth, server actions
- **Infra:** Deploy, dominio, SSL, variables de entorno
- **Seguridad:** Vulnerabilidades, permisos, datos expuestos
- **UX:** Flujos confusos, estados faltantes, accesibilidad
- **IA:** Calidad de respuestas, costos, alucinaciones

### Por Estado
- 🔴 **Abierto** — Detectado, sin acción todavía
- 🟡 **Investigando** — Se está trabajando en ello
- 🟢 **Resuelto** — Fix aplicado
- ✅ **Verificado** — QA o SRE confirmó que funciona

---

## ERRORES ACTIVOS

_Ninguno activo en este momento._

---

## ERRORES RESUELTOS

### ERR-2026-10-08-001 — Fallback indebido a plataforma ante Master Broker inválido en registro
| Campo | Valor |
|-------|-------|
| ID | ERR-2026-10-08-001 |
| Fecha detección | 2026-10-08 00:10 CST |
| Severidad | 🔴 Crítico (integridad de jerarquía multitenant y filiación de red) |
| Área | Backend / Multi-tenant / Auth / Network Transitions |
| Estado | ✅ Verificado |
| Reportado por | Revisión Externa QA P0 |
| Asignado a | Backend Dev / Security Lead |

**Descripción:**
En `registerUserWithLegalEvidence`, si `masterBrokerId` estaba definido pero no se encontraba su tenant Master válido, la lógica realizaba fallback silencioso a la organización plataforma (`Casa Matriz`).

**Pasos para reproducir:**
1. Enviar registro indicando un `masterBrokerId` no existente o sin tenant activo.
2. El broker quedaba creado afiliado a plataforma en vez de abortar.

**Impacto en negocio:**
Brokers asignados a organizaciones erróneas contra la voluntad del usuario y del modelo de franquicia.

**Solución aplicada:**
Se reutilizó la resolución canónica de Network Transitions (`getPlatformTenant` y `getOwnedTenant`). Si `masterBrokerId` está presente y no se encuentra un Master Broker válido con tenant activo de tipo `master_broker`, la transacción se rechaza y se revierte al 100%. Para registros directos, se exige obligatoriamente la existencia de la organización plataforma.

**Fecha resolución:** 2026-10-08
**Verificado por:** Suite `tests/unit/p0-endpoint-integration.test.ts` (16/16 passed).

---

### ERR-2026-10-08-002 — Discrepancia histórica de importes congelados y riesgo de conversión de frozen=0
| Campo | Valor |
|-------|-------|
| ID | ERR-2026-10-08-002 |
| Fecha detección | 2026-10-08 00:15 CST |
| Severidad | 🔴 Crítico (riesgo financiero de dispersión y alteración silenciosa de auditoría) |
| Área | Backend / Comisiones / STP / UI |
| Estado | ✅ Verificado |
| Reportado por | Revisión Externa QA P0 |
| Asignado a | Backend Dev / QA |

**Descripción:**
1. Un `frozenAmount = 0` explícito en comisiones saltaba la condición `if (frozen > 0)` y se convertía automáticamente en un pago positivo.
2. Si un registro tenía `frozenAmount` superior a `singleShare` por histórico duplicado ($60,000 vs $30,000), el helper reducía silenciosamente el importe sin alertar al administrador.

**Pasos para reproducir:**
1. Intentar liquidar una comisión con `frozenAmount = "0.00"` o `frozenAmount = "60000.00"` para Master Directo.
2. La comisión se dispersaba sin auditar la discrepancia.

**Impacto en negocio:**
Riesgo de pagos duplicados o dispersión de comisiones retenidas/en cero, y falta de pista de auditoría en registros modificados silenciosamente.

**Solución aplicada:**
Se implementó `auditCommissionPayout` y `CommissionFrozenDiscrepancyError`. Un `frozenAmount = 0` explícito devuelve 0 y nunca un pago positivo. Cualquier discrepancia histórica bloquea la liquidación en `/pay`, `bulk-pay` y `/mark-paid` devolviendo HTTP 400 con código `FROZEN_AMOUNT_DISCREPANCY` y `requiresAdminReview: true`, sin modificar los registros existentes en base de datos. En UI se agregó badge "Revisión Requerida" y bloqueo de botón.

**Fecha resolución:** 2026-10-08
**Verificado por:** Suites `tests/unit/commission-payout-integrity.test.ts` (13/13 passed) y `tests/unit/p0-endpoint-integration.test.ts` (16/16 passed).

---

### ERR-2026-10-07-001 — Delimitadores PL/pgSQL inválidos en migración 0004 (DO $ en vez de DO $$)

| Campo | Valor |
|-------|-------|
| ID | ERR-2026-10-07-001 |
| Fecha detección | 2026-10-07 17:07 CST |
| Severidad | 🟠 Alto (bloquea ejecución de migración DDL en PostgreSQL) |
| Área | Backend / Migraciones / DB |
| Estado | ✅ Verificado |
| Reportado por | QA / Antigravity Code Review |
| Asignado a | Backend Dev / DBA |

**Descripción:**
En el bloque condicional de Foreign Keys de `migrations/0004_broker_network_transitions.sql`, se utilizaron delimitadores de un solo signo de dólar (`DO $` / `END $;`), lo cual viola la sintaxis de dollar-quoting de PostgreSQL e impide la ejecución de la migración.

**Pasos para reproducir:**
1. Ejecutar el script SQL con `DO $ ... END $;` en PostgreSQL.
2. PostgreSQL aborta la transacción con error de sintaxis en el token `$`.

**Impacto en negocio:**
Impediría el despliegue del Bloque de Transiciones de Red en Staging y Producción.

**Solución aplicada:**
Se corrigieron los delimitadores a `DO $$` y `END $$;` estándar, validando idempotencia con doble ejecución exitosa contra Staging DB.

**Causa raíz:**
Typo en la definición del segundo bloque DO anónimo al escribir un solo signo de dólar.

**Aprendizaje:**
Revisar siempre la validez de delimitadores PL/pgSQL (`$$` o `$body$`) en todos los bloques antes de intentar aplicar migraciones DDL.

**Fecha resolución:** 2026-10-07
**Verificado por:** QA / Staging Migration Execution (COMMIT exitoso)

---

### ERR-2026-10-07-002 — Inestabilidad en orden de auditoría en memoria por colisión de timestamps idénticos

| Campo | Valor |
|-------|-------|
| ID | ERR-2026-10-07-002 |
| Fecha detección | 2026-10-07 16:55 CST |
| Severidad | 🟡 Medio (afecta determinismo en tests unitarios bajo alta concurrencia) |
| Área | Backend / Storage / Testing |
| Estado | ✅ Verificado |
| Reportado por | Jest Test Suite (`user-operational-status.test.ts`) |
| Asignado a | Backend Dev / QA |

**Descripción:**
En `MemStorage.getCommercialAuditLogs()`, el ordenamiento descendente dependía exclusivamente de `new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()`. En ejecuciones sincrónicas consecutivas en el mismo milisegundo, la resta arrojaba `0`, provocando un orden no determinista donde el log más antiguo podía devolverse antes que el más reciente.

**Pasos para reproducir:**
1. Ejecutar de forma síncrona dos llamadas a `updateUserOperationalStatus` sobre el mismo usuario.
2. Consultar `getCommercialAuditLogs` y verificar `logs[0]`.

**Impacto en negocio:**
Flaky tests en la suite unitaria automatizada y posible orden inconsistente de eventos de auditoría en memoria.

**Solución aplicada:**
Se añadió un desempate secundario por orden de inserción en el Map: `diff !== 0 ? diff : (logs.indexOf(b) - logs.indexOf(a))`, garantizando que el evento registrado posteriormente siempre quede primero si comparten milisegundo.

**Causa raíz:**
Resolución insuficiente de `Date.now()` (milisegundos) ante operaciones en el mismo tick de CPU.

**Aprendizaje:**
Toda ordenación por fecha en memoria debe contemplar un criterio de desempate determinista basado en secuencia o posición de inserción.

**Fecha resolución:** 2026-10-07
**Verificado por:** QA (16/16 passed en `user-operational-status.test.ts`, 161/161 unit suite general)

---

### ERR-2026-10-07-003 — Riesgo de discrepancia en beneficiario bancario de comisión y vulnerabilidad de alteración de CLABE desde frontend

| Campo | Valor |
|-------|-------|
| ID | ERR-2026-10-07-003 |
| Fecha detección | 2026-10-07 22:00 CST |
| Severidad | 🔴 Crítico (riesgo financiero de dispersión de fondos a Master erróneo o cuenta alterada) |
| Área | Backend / Comisiones / STP / Seguridad |
| Estado | ✅ Verificado |
| Reportado por | Antigravity Security Audit / Prompt Integración Controlada 01 |
| Asignado a | Backend Dev / Security Lead |

**Descripción:**
En `GET /api/commissions`, la resolución de `masterBroker` y `effectiveBankAccount` consultaba `brokerUser.masterBrokerId` en lugar del Master Broker histórico de la operación (`commission.masterBrokerId` / `credit.originMasterBrokerId`). Si un broker se transfería de Master A a Master B, la plataforma mostraba erróneamente los datos bancarios de Master B. Además, en `POST /api/commissions/:id/pay`, la variable `effectiveClabe` aceptaba `accountNumber` del body de la petición, permitiendo que una llamada desde el frontend alterara la cuenta destino registrada en el perfil.

**Pasos para reproducir:**
1. Crear un crédito y comisión bajo Master A.
2. Transferir el broker a Master B (`broker.masterBrokerId = masterB.id`).
3. Consultar `/api/commissions` o invocar `/api/commissions/:id/pay` con un payload que incluya `{ accountNumber: "999999999999999999" }`.

**Impacto en negocio:**
Riesgo de fraude financiero, elusión o pérdida de trazabilidad económica entre Master Brokers al transferir brokers de una red a otra.

**Solución aplicada:**
1. En `GET /api/commissions`, se ancló la resolución bancaria al Master histórico (`commission.masterBrokerId || credit.originMasterBrokerId`).
2. En `POST /api/commissions/:id/pay` y `bulk-pay`, se forzó la resolución del beneficiario histórico y su CLABE registrada oficial de 18 dígitos, rechazando con 400 cualquier discrepancia con `accountNumber` enviado en el body.
3. En la UI (`Commissions.tsx`), el campo de CLABE se convirtió en solo lectura verificada, deshabilitando la dispersión si el beneficiario no tiene CLABE oficial registrada.
4. Se creó la suite automatizada `tests/unit/commission-historical-beneficiary.test.ts` pasando 3/3.

**Causa raíz:**
Lectura del estado vivo relacional del broker (`brokerUser.masterBrokerId`) en vez del snapshot histórico inmutable de la operación, junto con la permisividad de sobrescritura manual de CLABE en el endpoint de pago.

**Aprendizaje:**
Todas las operaciones de dispersión financiera deben consultar snapshots inmutables de la operación y bloquear cualquier modificación de datos bancarios enviada dinámicamente desde el cliente web.

**Fecha resolución:** 2026-10-07
**Verificado por:** QA / Test Suite `commission-historical-beneficiary.test.ts` (3/3 passed)

---

### ERR-2026-09-04-001 — esbuild Unexpected "const" en build de Vercel (CreditList.tsx)

| Campo | Valor |
|-------|-------|
| ID | ERR-2026-09-04-001 |
| Fecha detección | 2026-09-04 23:14 CST |
| Severidad | 🟠 Alto (bloqueó deploy de Vercel en producción) |
| Área | Frontend / Build / Infra |
| Estado | ✅ Verificado |
| Reportado por | CEO / Vercel Deploy Log |
| Asignado a | Fullstack Dev / SRE |

**Descripción:**
El build de producción en Vercel (`npm run build:client`) falló con:
`Unexpected "const" ... const isWinnerPending = item.status === 'selected_winner' ... at failureErrorWithLog ... esbuild/lib/main.js`

**Pasos para reproducir:**
1. Ejecutar `npm run build:client` o deployar en Vercel.
2. esbuild parsea `client/src/components/Credits/CreditList.tsx`.
3. Falla en línea ~374 al encontrar sentencias `const` y `if` dentro del árbol JSX sin envolver.

**Impacto en negocio:**
Deploy bloqueado en Vercel. Las nuevas funcionalidades aprobadas (filtros de clientes por broker, soporte multi-dispersión y red de brokers para super admin) no podían reflejarse para los usuarios finales en la plataforma.

**Solución aplicada:**
Se agregó la apertura del IIFE `{(() => {` que faltaba antes de la declaración `const isWinnerPending` en `CreditList.tsx`. El bloque ya contaba con su cierre `})()}` pero le faltaba la apertura tras una edición previa en el template JSX. Commit `c79ef4a`.

**Causa raíz:**
En JSX solo se permiten expresiones válidas entre `{}`. Sentencias de control imperativas (`const`, `let`, `if`, `return`) insertadas en medio de un contenedor JSX sin una función inmediatamente invocada (IIFE) provocan que el parser de TypeScript/esbuild arroje `SyntaxError: Unexpected "const"`.

**Aprendizaje:**
Toda lógica condicional compleja con múltiples `const`/`if` embebida directamente en JSX debe estar rigurosamente encapsulada en un IIFE `{(() => { ... })()}` o extraída a un componente auxiliar/función helper antes del `return` principal del componente.

**Fecha resolución:** 2026-09-04 23:15 CST
**Verificado por:** Commit `c79ef4a` pusheado exitosamente a `origin/main`.

---

### ERR-2026-09-11-001 — Fallo de Build en Railway por vite en devDependencies con NODE_ENV=production

| Campo | Valor |
|-------|-------|
| ID | ERR-2026-09-11-001 |
| Fecha detección | 2026-09-11 12:45 CST |
| Severidad | 🟠 Alto (bloqueó deploy de backend/fullstack en Railway) |
| Área | Infra / Build / Dependencias |
| Estado | ✅ Verificado |
| Reportado por | CEO / Railway Build Log |
| Asignado a | Fullstack Dev / DevOps |

**Descripción:**
El deployment en Railway falló durante `npm run build` con error: `vite: not found`.
Railway tenía configurado `NODE_ENV=production`, lo que provocó que `npm ci` omitiera la instalación de las dependencias catalogadas bajo `devDependencies`.

**Pasos para reproducir:**
1. Configurar un servicio en Railway con variable `NODE_ENV=production`.
2. Ejecutar `npm ci` estándar seguido de `npm run build`.
3. El proceso falla porque `vite` y sus plugins se encontraban en `devDependencies`.

**Impacto en negocio:**
Deployments automáticos en Railway detenidos. Cambios de backend no se propagaban al staging.

**Solución aplicada:**
1. Se creó `nixpacks.toml` definiendo explícitamente `[variables] NPM_CONFIG_PRODUCTION = "false"` y `[phases.install] cmds = ["npm ci --include=dev"]`.
2. Se movieron `vite`, `@vitejs/plugin-react`, `esbuild`, `typescript`, `tailwindcss`, `postcss` y `autoprefixer` a `dependencies` en `package.json` para máxima portabilidad en cualquier entorno de CI/CD. Commit `512680d`.

**Causa raíz:**
En entornos PaaS basados en Nixpacks/Docker (como Railway), declarar `NODE_ENV=production` a nivel de servicio hace que `npm ci` active el modo `--production` por defecto, excluyendo binarios indispensables para la fase de empaquetado (`npm run build`).

**Aprendizaje:**
Toda herramienta necesaria para compilar el proyecto en producción (bundlers, transpiladores, utilidades CSS) debe estar configurada para instalarse en el build o ubicarse en `dependencies` directas si el entorno de CI/CD no distingue entre build time y run time.

**Fecha resolución:** 2026-09-11 12:55 CST
**Verificado por:** Deploy en verde en Railway (Commit `512680d`).

---

### ERR-2026-09-11-002 — Bloqueo de login y recuperación de contraseñas por desincronización de esquema Drizzle/Postgres (`referral_code`)

| Campo | Valor |
|-------|-------|
| ID | ERR-2026-09-11-002 |
| Fecha detección | 2026-09-11 13:20 CST |
| Severidad | 🔴 Crítico (bloqueó acceso de todos los usuarios al sistema) |
| Área | Backend / Base de Datos / Autenticación |
| Estado | ✅ Verificado |
| Reportado por | CEO |
| Asignado a | Arquitecto / Backend Dev / SRE |

**Descripción:**
Los usuarios (`francocb79@gmail.com`, `fcb@creditonegocios.com.mx`, `francocb79@yahoo.com`) no podían ingresar a la plataforma con `Prueba1$`, y las solicitudes de recuperación de contraseña no enviaban ningún correo.

**Pasos para reproducir:**
1. Intentar `POST /api/auth/login` con credenciales válidas.
2. Respuesta: `401 Email o contraseña incorrectos`.
3. Intentar `POST /api/auth/forgot-password` con email existente.
4. Respuesta: Mensaje genérico de éxito, pero ningún correo llega a destino.

**Impacto en negocio:**
Bloqueo total de acceso a la plataforma para el CEO y brókers. Imposibilidad de probar módulos y validar la jerarquía de roles RBAC.

**Solución aplicada:**
1. Se añadió `ADD COLUMN IF NOT EXISTS referral_code VARCHAR` y su índice único en `server/autoMigrate.ts`.
2. Se aislaron los bloques de migración de usuarios en bloques independientes `try/catch` para que ninguna advertencia menor frene la sincronización de credenciales.
3. Se implementó una capa de resiliencia con fallback a SQL nativo (`pool.query`) en `getUser` y `getUserByEmail` en `server/dbStorage.ts` si Drizzle falla por diferencias de columnas.
4. Se agregó botón de restablecimiento directo en `Landing.tsx` si el servicio de correo presenta demoras de DNS o entrega. Commit `f80fba4`.

**Causa raíz:**
En `shared/schema.ts`, la tabla `users` definía la columna `referralCode: varchar("referral_code").unique()`. Sin embargo, `autoMigrate.ts` nunca ejecutó `ADD COLUMN IF NOT EXISTS referral_code`. Al ejecutar `db.select().from(users)`, Drizzle generó un `SELECT` incluyendo `referral_code`. PostgreSQL rechazó la consulta con: `column "referral_code" does not exist`. La función `storage.getUserByEmail` capturó el error y devolvió `undefined`, provocando que el login rechazara con 401 y que `forgot-password` no enviara el correo al asumir que el usuario no existía.

**Aprendizaje:**
1. **Sincronización Estricta ORM-DB**: Todo campo nuevo agregado al esquema TypeScript (`schema.ts`) DEBE contar inmediatamente con su contraparte `ADD COLUMN IF NOT EXISTS` en `autoMigrate.ts`.
2. **Resiliencia en Autenticación**: Las consultas de autenticación nunca deben depender exclusivamente de un ORM susceptible a fallar si falta una columna opcional. Siempre debe existir un fallback a SQL directo (`SELECT * FROM users WHERE email = ...`).
3. **Health Check Proactivo**: `/api/health` debe comprobar la lectura real de la tabla `users`, no solo `SELECT 1`.

**Fecha resolución:** 2026-09-11 13:33 CST
**Verificado por:** Pruebas directas con `curl` a `https://creditonegocios-staging.up.railway.app`: Super Admin (`200 OK`), Master Broker (`200 OK`), Broker (`200 OK`) con contraseña `Prueba1$`.

---

### ERR-2026-10-07-003 — Aprovisionamiento parcial no atómico en registro de brokers (POST /api/auth/register)

| Campo | Valor |
|-------|-------|
| ID | ERR-2026-10-07-003 |
| Fecha detección | 2026-10-07 22:42 CST |
| Severidad | 🔴 Crítica (P0) — integridad transaccional de red |
| Área | Backend / Auth / Multitenancy |
| Estado | ✅ Verificado |
| Reportado por | Auditoría P0 / AI-Team-OS |
| Asignado a | Backend Dev / QA / Security |

**Descripción:**
En `POST /api/auth/register`, la creación del usuario y sus aceptaciones legales ocurría en una transacción, pero el tenant propio y la membresía owner (`canOriginate=true`) se creaban posteriormente fuera de la transacción con un `catch` que permitía continuar ante cualquier falla. Si el aprovisionamiento fallaba, el broker quedaba creado como una entidad huérfana sin organización ni permisos de originación.

**Impacto en negocio:**
Brokers registrados sin tenant o sin membresía activa con `canOriginate=true` quedaban bloqueados de originar créditos y de participar en transiciones de red.

**Solución aplicada:**
Se unificaron en una sola transacción PostgreSQL (`tx`) dentro de `DbStorage.registerUserWithLegalEvidence` (y atómicamente en `MemStorage`): identidad del broker, aceptación de Términos y Aviso, tenant propio del broker, membresía owner con `canOriginate=true` y afiliación al Master correspondiente o Casa Matriz. Si cualquier paso falla, se revierte la totalidad del registro.

**Causa raíz:**
Diseño en dos fases desconectadas durante la refactorización de formalización documental.

**Aprendizaje:**
Toda entidad multitenant con requisitos de membresía estricta debe nacer en una transacción atómica indivisible.

**Fecha resolución:** 2026-10-07
**Verificado por:** QA Suite (`tests/unit/broker-registration-atomicity.test.ts` — 4/4 passing)

---

### ERR-2026-10-07-004 — Doble conteo de importe en comisiones de Master Broker originador directo

| Campo | Valor |
|-------|-------|
| ID | ERR-2026-10-07-004 |
| Fecha detección | 2026-10-07 22:42 CST |
| Severidad | 🔴 Crítica (P0) — riesgo financiero / pagos duplicados |
| Área | Backend / Comisiones / Payouts / Frontend |
| Estado | ✅ Verificado |
| Reportado por | Auditoría P0 / AI-Team-OS |
| Asignado a | Backend Dev / QA / Security |

**Descripción:**
En `createCascadingCommissionRecord`, cuando un Master Broker originaba directamente (`isMasterDirect=true`), se registraba el importe económico ganado tanto en `brokerShare` como en `masterBrokerShare`. Sin embargo, las rutas de pago (`/pay`, `/bulk-pay`, `/mark-paid`), aprobación y la UI de `Commissions.tsx` asumían que toda comisión de Master debía sumar `brokerShare + masterBrokerShare`, duplicando el importe a dispersar.

**Impacto en negocio:**
Riesgo de dispersar o registrar el doble del importe real ganado a los Master Brokers directos en transferencias STP o liquidaciones manuales.

**Solución aplicada:**
1. Se implementó la función canónica `getCommissionPayoutAmount` que identifica `isMasterDirect` y devuelve estrictamente la cuota única legítima sin duplicarla.
2. Se protegió `frozenAmount` contra valores legacy corruptos (se capean al valor de cuota única).
3. Se alinearon `/approve`, `/bulk-approve`, `GET /api/commissions`, `/pay`, `/bulk-pay` y `/mark-paid`.
4. Se corrigió `Commissions.tsx` (desglose modal, `payoutToNetwork`, y cálculo de `mbOwedToBrokers`).

**Causa raíz:**
Reutilización de la fórmula de red (Opción B: broker + diferencial) sin condicionar la no duplicación cuando el Master es el originador directo.

**Aprendizaje:**
Las entidades de red deben distinguir explícitamente entre operaciones de red (reparto) y operaciones directas (cuota única).

### SEC-2026-10-08-001 — Reseteo no gobernado en arranque y bypass de contraseñas hardcodeadas en rutas de autenticación

| Campo | Valor |
|-------|-------|
| ID | SEC-2026-10-08-001 |
| Fecha detección | 2026-10-08 08:40 CST |
| Severidad | 🔴 Crítica (P0) — Riesgo de acceso privilegiado y mutación destructiva en boot |
| Área | Backend / Seguridad / Autenticación / Migraciones / Comisiones |
| Estado | 🟢 Resuelto en Rama Aislada (fix/p0-security-hardening-commissions-gate) / 🔴 Crítico Activo en origin/main (Producción) |
| Reportado por | Auditoría P0 Pre-Staging / AI-Team-OS |
| Asignado a | Arquitecto / Seguridad / QA / Backend Dev |

**Descripción:**
1. En `server/autoMigrate.ts` heredado de `main`, cada arranque del servidor (`runAutoMigration()`) ejecutaba mutaciones DML destructivas de manera indiscriminada:
   - Reseteo de contraseñas a valor fijo (`Prueba1$`) para cuentas de Super Admin, Master Broker y Broker.
   - Forzado de roles (`role = 'admin'`, `'master_broker'`, `'broker'`).
   - Reactivación indiscriminada de usuarios (`is_active = TRUE`).
   - Reasignación de red forzosa de un broker (`francocb79@yahoo.com`) hacia un Master Broker sin validación comercial.
   - Reactivación masiva de todas las financieras desactivadas (`UPDATE financial_institutions SET is_active = TRUE`).
   - Eliminación de financieras marcadas como prueba y desvinculación de créditos.
   - Sobrescritura de permisos RBAC en `tenant_members`.
2. En `server/routes.ts` (líneas 1397-1425), se identificó un bypass activo de login en `POST /api/auth/login`:
   - Permite que correos específicos (`francocb79@gmail.com`, `fcb@creditonegocios.com.mx`, etc.) inicien sesión con contraseñas fijas (`Prueba1$`, `Franco2026!*`) e invoque un reset forzoso de contraseña en caliente al autenticar.
3. En comisiones, existía riesgo de dispersión masiva o manual de montos no aprobados formalmente.

**Impacto en negocio y seguridad:**
- **Hallazgo Crítico en Producción (`origin/main`):** Se confirmó mediante inspección estricta de despliegue (`git grep` sobre `origin/main`) que el código vulnerable (`allowedAdminPasswords` y DML destructivo en `autoMigrate.ts`) está presente en `main`. Si producción en Railway despliega desde `main`, **producción está actualmente expuesta** a login por bypass con contraseñas fijas conocidas y a mutación destructiva ante cualquier cold start.
- En comisiones, existía riesgo de dispersión masiva o manual de montos no aprobados formalmente.

**Solución aplicada (Rama Aislada `fix/p0-security-hardening-commissions-gate`):**
1. **Login Hardening Radical:** Se eliminó por completo el bypass de contraseñas hardcodeadas (`allowedAdminPasswords`), eliminando la sincronización automática de contraseñas. Todo login pasa obligatoriamente por comparación criptográfica contra el hash de la base de datos (`bcrypt.compare`). Se valida y bloquea con 401 a usuarios inactivos o suspendidos.
2. **AutoMigrate Zero-Destructive:** Retirados todos los DELETE, UPDATE y mutaciones de datos comerciales (usuarios, financieras, comisiones, afiliaciones). `autoMigrate.ts` se convirtió estrictamente en DDL idempotente.
3. **Migraciones Explícitas y Scripts Administrativos Blindados:**
   - Creado `scripts/explicit-historical-backfills.ts` con preflight analítico, validación estricta de no-producción, y requerimiento de `--confirm-backup` y `--authorize-historical-backfill`.
   - `scripts/admin-bootstrap-environment.ts` blindado contra ejecución accidental en producción (`isProd || isProdDb`) y flags obligatorios.
4. **Gate Temporal de Comisiones (Super Admin Exclusivo):**
   - Dispersión individual (`/pay`), masiva (`/bulk-pay`) y liquidación manual (`/mark-paid`) bloquean cualquier comisión que no tenga: `status === 'approved'`, `approvedBy`, `approvedAt`, y `frozenAmount` numérico válido registrado por Super Admin (respondiendo con 400 `APPROVAL_PREREQUISITES_MISSING` y auditoría inmutable en `commission_audit_logs`).
   - Aprobación masiva (`/bulk-approve`) temporalmente deshabilitada (400 `BULK_APPROVAL_TEMPORARILY_DISABLED`) para forzar la revisión individual obligatoria.
5. **Certificación QA:**
   - `tests/unit/startup-migration-security.test.ts`: 5/5 passing (simulación PostgreSQL stateful en memoria).
   - `tests/unit/commission-gate-security.test.ts`: 13/13 passing (pruebas negativas de login y comisiones).
   - `tests/unit/p0-endpoint-integration.test.ts`: 16/16 passing.
   - `tests/unit/commission-historical-beneficiary.test.ts`: 3/3 passing.
   - `tests/unit/commission-payout-integrity.test.ts`: 13/13 passing.
   - Typecheck (`npm run check`) y Build (`npm run build`) 100% limpios.

**Plan de Remediación Urgente Propuesto para Producción (Requiere Autorización):**
1. Rotación inmediata de contraseñas para los correos que tenían bypass hardcodeado (`francocb79@gmail.com`, `fcb@creditonegocios.com.mx`, etc.) mediante hash aleatorio fuerte o reseteo forzado por correo.
2. Invalidación total de sesiones activas en producción (`TRUNCATE TABLE sessions`).
3. Auditoría de accesos recientes en logs de Railway y tablas de auditoría para descartar intrusiones.
4. Despliegue de este fix a producción solo tras autorización explícita.

**Fecha resolución en rama:** 2026-10-08
**Verificado por:** QA Suites (Total 50 tests passing en suites de seguridad y comisiones)

---

## ANÁLISIS DE PATRONES

### Errores Recurrentes

| Patrón | Frecuencia | Área | Acción preventiva |
|--------|-----------|------|-------------------|
| Declaración imperativa (`const`/`if`) suelta en JSX | 1 | Frontend (Build esbuild/Vercel) | Envolver siempre en IIFE `{(() => { ... })()}` o refactorizar a subcomponente/función renderizadora antes del JSX. |
| Dependencia de build omitida por `NODE_ENV=production` | 1 | Infra / Build (Railway Nixpacks) | Configurar `NPM_CONFIG_PRODUCTION=false` en `nixpacks.toml` y mover bundlers a `dependencies`. |
| Columna en schema TypeScript faltante en PostgreSQL físico | 1 | Backend / DB (Drizzle) | Siempre sincronizar `schema.ts` con `autoMigrate.ts` y proveer fallback a SQL nativo en queries de auth. |

### Métricas de Calidad del Proyecto
| Métrica | Valor actual | Tendencia |
|---------|-------------|-----------|
| Total errores detectados | 3 | Resueltos |
| Tiempo promedio de resolución | < 15 min | Rápido |
| Bug escape rate (llegaron a prod) | 1 (bloqueo auth corregido de inmediato) | Mitigado con fallback SQL |
| Errores por área (top 3) | Backend/DB (1), Infra/Build (1), Frontend (1) | — |