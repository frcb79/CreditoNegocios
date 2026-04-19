# CEO PROTOCOLO - Manual Maestro de Operacion
> Unico documento oficial para operar el sistema con criterio de negocio.
> Integra vision estrategica + ejecucion operativa.
> Version: 2.0 | Fecha: 2026-04-17

---

## PROPOSITO

Este documento existe para que el sistema no dependa de memoria improvisada.
Define como iniciar, ejecutar, entregar, cerrar, aprender y escalar proyectos.

Principio rector:
- No estamos usando una herramienta.
- Estamos construyendo una firma que aprende con cada proyecto.

---

## ARQUITECTURA DEL SISTEMA

### Nivel 1 - Master (ai-team-os)
- Conocimiento institucional permanente.
- Roles, protocolos, reglas del CEO, aprendizajes universales.

### Nivel 2 - Proyecto cliente
- Conocimiento especifico del encargo.
- Estado del proyecto, decisiones, errores, changelog, codigo.

### Nivel 3 - Ecosistema
- Flujo de aprendizaje entre proyectos a traves del Master.
- Cada proyecto nuevo arranca mejor que el anterior.

---

## DISTINCION CLAVE DE MEMORIA

Archivos de firma (Master):
- `docs/team/CEO_OS.md`
- `docs/team/TEAM_LEARNINGS.md`
- roles y protocolos

Archivos del proyecto (Cliente):
- `docs/project/PROJECT_BRAIN.md`
- `docs/project/ERROR_LOG.md`
- `docs/project/DECISIONS.md`
- `docs/project/CHANGELOG.md`
- `docs/project/PROMOTE_TO_MASTER.md`

Regla:
- `PROJECT_BRAIN.md` siempre es local al proyecto activo.
- `TEAM_LEARNINGS.md` en el Master guarda aprendizaje acumulado de todos.

---

## PROTOCOLO 1 - INICIO DE PROYECTO NUEVO

Antes de arrancar:
- Leer `docs/intake/DISCOVERY_PROTOCOL.md`.
- Activar Orquestrador con: Nuevo proyecto: [nombre].
- Definir stack con `docs/intake/TECH_STACK_ADVISOR.md`.
- Crear/llenar `docs/project/PROJECT_BRAIN.md` del proyecto cliente.
- Registrar decision inicial en `docs/project/DECISIONS.md`.

Semana 1 debe terminar con:
- Objetivo del proyecto claro.
- MVP delimitado.
- Stack definido.
- Fase y proximos 3 pasos concretos.

---

## PROTOCOLO 2 - ONBOARDING DE DEV (humano o IA)

Documentos obligatorios de entrada:
1. `docs/team/CEO_OS.md`
2. `docs/project/PROJECT_BRAIN.md`
3. `docs/autonomy/AI_PERMISSIONS.md`
4. `docs/team/TEAM_LEARNINGS.md`

Instruccion base:
- Lee todo y pregunta antes de tocar codigo o decisiones.

Calibracion primera semana:
- Asignar tarea pequena.
- Revisar primer output.
- Dar feedback explicito.
- Registrar ajustes en TEAM_LEARNINGS.

---

## PROTOCOLO 3 - ENTREGA AL CLIENTE

48 horas antes:
- Correr `docs/project/PROMOTE_TO_MASTER.md` y checklist de liberacion.
- Activar QA (rol 09) y Seguridad (rol 07).
- Verificar cero secrets expuestos.
- Confirmar demo funcional en produccion.

Post-entrega:
- Actualizar `CHANGELOG.md`.
- Guardar feedback en `PROJECT_BRAIN.md`.
- Registrar bugs en `ERROR_LOG.md`.
- Definir siguientes pasos en `DECISIONS.md`.

---

## PROTOCOLO 4 - CIERRE DE SESION

Trigger:
- Cuando el CEO dice: cerramos.

Actualizaciones minimas:
- `PROJECT_BRAIN.md`
- `ERROR_LOG.md` (si aplica)
- `DECISIONS.md` (si aplica)
- `CHANGELOG.md`
- `TEAM_LEARNINGS.md` (si hubo aprendizaje)

Plantilla de cierre:
- Sesion: [fecha]
- Completado: [lista]
- Pendiente: [lista]
- Proximo paso concreto: [accion]
- Riesgos: [si aplica]

---

## PROTOCOLO 5 - APRENDIZAJES Y SYNC AL MASTER

Cuando registrar aprendizaje:
- Algo fallo.
- Algo funciono muy bien.
- Descubriste patron replicable.

Regla de clasificacion:
- Si aplica solo al cliente: se queda en su proyecto.
- Si aplica a casi cualquier proyecto: va a `PROMOTE_TO_MASTER.md`.

Trigger recomendado de sync:
- 5+ aprendizajes pendientes, o
- cierre de proyecto, o
- instruccion del CEO.

---

## PROTOCOLO 6 - CRISIS EN PRODUCCION

1. Detener cambios nuevos.
2. Activar Seguridad + DevOps.
3. Revisar que cambio en ultimas 24 horas.
4. Revisar variables de entorno primero.
5. Si no se resuelve rapido, rollback.
6. Documentar causa y solucion en `ERROR_LOG.md`.
7. Ejecutar post-mortem con accion preventiva.

---

## BRUJULA DE PRIORIDAD RAPIDA

Si dudas que hacer primero:
1. Produccion rota -> resolver ahora.
2. Cliente esperando entrega -> entregar.
3. Bloqueador operativo -> activar COO.
4. Deuda critica -> corregir antes de escalar.
5. Si todo estable -> siguiente feature.

---

## METRICAS DE SALUD DEL SISTEMA

- Onboarding a nuevo proyecto menor a 10 minutos.
- Menos preguntas repetidas al CEO con el tiempo.
- Menos errores repetidos entre proyectos.
- Syncs ejecutados de forma constante.
- Recomendaciones proactivas del sistema al CEO.

---

## REGLAS DE ORO

- No repetir errores ya documentados.
- No operar sin actualizar memoria.
- No escalar complejidad sin validacion de negocio.
- Todo cambio importante debe dejar rastro documental.

---

Este archivo reemplaza y unifica cualquier version previa de protocolo CEO.