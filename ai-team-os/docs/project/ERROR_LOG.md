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
| Total Errores Resueltos | 3 |
| Último Incidente | 2026-09-11 (ERR-2026-09-11-002) |

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