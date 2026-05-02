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
| Total Errores Resueltos | 0 |
| Último Incidente | N/A |

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

_[Se agregan conforme se detectan — los más recientes primero]_

---

## ERRORES RESUELTOS

_[Se mueven aquí cuando se verifican — los más recientes primero]_

---

## ANÁLISIS DE PATRONES

### Errores Recurrentes
_[Identificar errores que se repiten para atacar causa raíz sistémica]_

| Patrón | Frecuencia | Área | Acción preventiva |
|--------|-----------|------|-------------------|
| _[Se llena con el tiempo]_ | | | |

### Métricas de Calidad del Proyecto
| Métrica | Valor actual | Tendencia |
|---------|-------------|-----------|
| Total errores detectados | 0 | — |
| Tiempo promedio de resolución | — | — |
| Bug escape rate (llegaron a prod) | — | — |
| Errores por área (top 3) | — | — |