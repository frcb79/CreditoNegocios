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
| Total Errores Resueltos | 1 |
| Último Incidente | 2026-09-04 (ERR-2026-09-04-001) |

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

## ANÁLISIS DE PATRONES

### Errores Recurrentes

| Patrón | Frecuencia | Área | Acción preventiva |
|--------|-----------|------|-------------------|
| Declaración imperativa (`const`/`if`) suelta en JSX | 1 | Frontend (Build esbuild/Vercel) | Envolver siempre en IIFE `{(() => { ... })()}` o refactorizar a subcomponente/función renderizadora antes del JSX. |

### Métricas de Calidad del Proyecto
| Métrica | Valor actual | Tendencia |
|---------|-------------|-----------|
| Total errores detectados | 1 | Estable |
| Tiempo promedio de resolución | < 10 min | Rápido |
| Bug escape rate (llegaron a prod) | 0 (detenido en CI/Build) | Bajo control |
| Errores por área (top 3) | Frontend (1) | — |