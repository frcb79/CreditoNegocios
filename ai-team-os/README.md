# AI TEAM OS
Sistema operativo de desarrollo con IA para construir proyectos profesionales sin empezar de cero.

Version: 3.0 — Upgrade Clase Mundial
Mercado: Mexico
Idioma operativo: Espanol

## Que es este repositorio
Este repo es el Master del sistema.
Aqui vive la metodologia reusable: roles, protocolos, reglas de autonomia y aprendizaje acumulado.

Objetivo de negocio:
- Arrancar proyectos mas rapido.
- Reducir errores repetidos.
- Acumular experiencia institucional entre proyectos.
- **Garantizar calidad clase mundial con pipeline de entrega obligatorio.**

## Pipeline de Entrega — Gate System v3.0

Toda tarea técnica sigue este pipeline obligatorio:

```
PM define → Arquitecto diseña → UX diseña → Dev implementa
    → QA valida ✅ → Seguridad revisa 🔒 → DevOps despliega → SRE monitorea
```

Los gates son OBLIGATORIOS. Sin QA ✅ y Security 🔒, nada llega a producción.

## Equipo — 22 Roles + Orquestrador

| # | Rol | Tipo |
|---|-----|------|
| 00 | Orquestrador | 🧠 Siempre activo |
| 01 | Estratega de Negocio | 📊 Estratégico |
| 02 | Product Manager | 📊 Estratégico |
| 03 | UX Diseñador | 🎨 Diseño |
| 04 | Arquitecto de Software | ⚙️ Técnico |
| 05 | Fullstack Dev | ⚙️ Técnico |
| 06 | DevOps | ⚙️ Técnico |
| 07 | Seguridad | 🔒 Gate Obligatorio |
| 08 | Legal & Compliance | 🛡️ Protección |
| 09 | QA & Testing | ✅ Gate Obligatorio |
| 10 | Data Analytics | 📊 Estratégico |
| 11 | Growth & Marketing | 📈 Crecimiento |
| 12 | Soporte al Cliente | 🤝 Operaciones |
| 13 | Consultor Estratégico | 🎯 Estratégico |
| 14 | Scrum Master | 📋 Gestión |
| 15 | Sales & BizDev | 💰 Revenue |
| 16 | Fundraising | 💰 Revenue |
| 17 | AI Engineer | 🤖 Técnico |
| 18 | CFO Financiero | 💰 Revenue |
| 19 | COO Operaciones | 📋 Gestión |
| 20 | Community Manager | 📈 Crecimiento |
| 21 | Hiring Advisor | 📋 Gestión |
| 22 | SRE & Monitor | 🔍 Gate Obligatorio |

## Como usarlo en un proyecto nuevo
1. Copia este sistema al nuevo repo del cliente.
2. Abre la carpeta en **VS Code (Copilot)** o súbela a **Antigravity**.
3. Lee `docs/intake/ANTIGRAVITY_READY.md` si usarás Antigravity para arquitectura.
4. Inicializa memoria del proyecto usando `docs/project/PROJECT_BRAIN_TEMPLATE.md`.
5. Crea el `docs/project/PROJECT_BRAIN.md` del cliente con ese template.
6. **Ejecuta `docs/intake/PROJECT_STRATEGY_INTAKE.md` para definir la oferta y marketing.**
7. Ejecuta `docs/intake/DISCOVERY_PROTOCOL.md` en la primera sesion.
8. Activa roles segun necesidad durante ejecucion.
9. **Verifica que el pipeline de entrega (QA → Seguridad → Deploy → Monitor) opera en cada tarea.**
10. Cierra cada sesion con `docs/team/SESSION_CLOSE_PROTOCOL.md`.

## Estandar Top 1% para proyectos reales

Todo proyecto cliente debe arrancar con estos entregables y controles desde la semana 1:

- **Matriz de ambientes obligatoria**: local, staging y produccion con URL, owner, deploy target, variables criticas y criterio de uso.
- **Separacion app vs backend**: frontend publico y backend/API documentados como superficies distintas para evitar validar la URL incorrecta.
- **Inventario de credenciales y servicios**: Vercel, Railway, Supabase, dominio, email, analytics, repositorio, integraciones y billing owner.
- **Plan de transferencia al cliente**: que cuentas se migran, cuando se migran, que accesos se revocan, que llaves se rotan y quien firma el cierre.
- **Paquete minimo de documentacion**: PROJECT_BRAIN, decisiones, error log, runbook de deploy, checklist de handoff, accesos operativos, smoke tests y rollback.
- **Validacion por ambiente**: health checks, smoke tests, auth, carga de datos, CORS, archivos, monitoreo, backup y restore.
- **Cierre financiero y operativo**: todo trabajo extra de migracion de cuentas, cambio de propietarios y corte de credenciales se estima y se cobra por separado si no estaba contratado.

Archivos base para esto:
- `docs/project/PROJECT_BRAIN_TEMPLATE.md`
- `docs/deployment/MASTER_CREDENTIALS_TEMPLATE.md`
- `docs/deployment/ACCOUNT_TRANSFER_CHECKLIST.md`

## Lectura obligatoria al iniciar sesion
1. `docs/project/PROJECT_BRAIN.md`
2. `docs/project/ERROR_LOG.md` — **ahora con sistema de trazabilidad completo**
3. `docs/project/DECISIONS.md`
4. `docs/team/CEO_OS.md`
5. `docs/team/TEAM_LEARNINGS.md`

## Estructura clave
- `docs/Marketing/` marketing estratégico y principios de Sabri Suby.
- `docs/team/` roles del equipo (22 roles + orquestrador) y protocolos operativos.
- `docs/intake/` discovery y decisiones de stack.
- `docs/project/` memoria del proyecto, decisiones, errores y changelog.
- `docs/ceo/` marco ejecutivo para operar el sistema.
- `docs/autonomy/` permisos de autonomia de la IA.

## Archivos criticos
- `docs/team/CEO_OS.md` - como comunicar y decidir con el CEO.
- `docs/team/00_ORQUESTRADOR.md` - director con pipeline de delegación y verificación.
- `docs/ceo/CEO_PROTOCOLO.md` - protocolos ejecutivos del sistema.
- `docs/autonomy/AI_PERMISSIONS.md` - limites de autonomia.
- `docs/Marketing/MARKETING_FINDINGS_MASTER.md` - principios de marketing Sabri Suby.
- `docs/project/PROJECT_BRAIN_TEMPLATE.md` - plantilla limpia para nuevos proyectos.
- `docs/project/ERROR_LOG.md` - sistema de logs con trazabilidad profesional.
- `docs/project/PROMOTE_TO_MASTER.md` - aprendizajes listos para subir al Master.

## Flujo de aprendizaje institucional
- Aprendizaje especifico de cliente: se queda en su proyecto.
- Aprendizaje reusable: se anota en `PROMOTE_TO_MASTER.md`.
- Sync al Master: incorpora aprendizajes en `TEAM_LEARNINGS.md` y roles/protocolos.

## Estado recomendado para considerar "listo"
- 22 roles activos y actualizados.
- Pipeline de entrega con gates operando (QA ✅ → Security 🔒 → Deploy → Monitor).
- Protocolos de inicio, cierre y crisis definidos.
- Sistema de logs y ERROR_LOG estructurado.
- Memoria de proyecto y changelog en uso.
- Proceso de sync de aprendizajes operando.
- Matriz de ambientes documentada y validada.
- Inventario de cuentas, credenciales y owners actualizado.
- Handoff checklist listo antes del primer deploy a produccion.
- Smoke tests por ambiente ejecutados y guardados.
- URL de frontend y URL de backend documentadas por separado.

AI TEAM OS es un activo vivo: se mejora en cada proyecto y luego se reutiliza en el siguiente.
