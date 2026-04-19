# PROTOCOLO DE CIERRE DE SESIÓN
> Se ejecuta cuando el CEO dice "cerramos" o cuando termina un bloque de trabajo importante.
> Su objetivo es que nada se pierda entre sesiones y que el siguiente arranque tenga contexto claro.

---

## ¿CUÁNDO SE USA?

Usar este protocolo al final de cualquier sesión donde ocurra al menos una de estas cosas:
- se implementó o modificó código
- se tomó una decisión importante
- se descubrió un problema o riesgo
- se generó aprendizaje útil
- se avanz�� en un proyecto con impacto real

---

## OBJETIVO DEL CIERRE

Al cerrar sesión debemos dejar todo esto listo:
1. Qué se hizo
2. Qué quedó pendiente
3. Qué decisiones se tomaron
4. Qué problemas aparecieron
5. Qué aprendimos
6. Qué sigue en la próxima sesión

---

## PASO A PASO DE CIERRE

### 1. Confirmar el estado real del trabajo
Antes de cerrar, verificar:
- qué archivos cambiaron
- qué decisiones nuevas surgieron
- si hubo errores o bloqueos
- si quedó algo a medias

### 2. Actualizar la memoria del proyecto
Actualizar los archivos que apliquen:
- `docs/project/PROJECT_BRAIN.md`
- `docs/project/ERROR_LOG.md`
- `docs/project/DECISIONS.md`
- `docs/project/CHANGELOG.md`
- `docs/team/TEAM_LEARNINGS.md`

### 3. Revisar si hubo aprendizajes promovibles
Si hubo aprendizajes importantes, preparar su promoción a `PROMOTE_TO_MASTER.md`.

### 4. Dejar una salida clara para la siguiente sesión
Debe quedar explícito:
- qué sigue
- por qué sigue eso
- qué riesgo existe
- qué archivo leer primero al volver

### 5. Dar el reporte de cierre al CEO
El reporte debe ser corto, claro y accionable.

---

## FORMATO DE REPORTE DE CIERRE

Usar este formato al final:

```text
✅ Completado: [qué se terminó]
🔄 En progreso: [qué quedó abierto]
⚠️ Atención requerida: [bloqueos, riesgos o decisiones]
📝 Documentación actualizada: [archivos editados]
🎯 Próximo paso: [acción exacta para continuar]
```

---

## REGLAS DE CIERRE

- No cerrar una sesión sin registrar contexto útil
- No asumir que el CEO recordará lo ocurrido
- No dejar decisiones importantes sin documentar
- No dejar errores sin registrar
- No dejar aprendizajes valiosos fuera de la memoria del sistema

---

## CHECKLIST FINAL ANTES DE CERRAR

- [ ] Revisé qué se hizo realmente
- [ ] Actualicé PROJECT_BRAIN.md
- [ ] Actualicé ERROR_LOG.md si hubo errores
- [ ] Actualicé DECISIONS.md si hubo decisiones
- [ ] Actualicé CHANGELOG.md si hubo feature o avance importante
- [ ] Actualicé TEAM_LEARNINGS.md si hubo aprendizaje útil
- [ ] Detecté qué sigue
- [ ] Preparé un reporte claro para el CEO

---

## CIERRE IDEAL

Un cierre ideal deja al sistema así:
- cero dudas sobre lo que pasó
- cero pérdida de contexto
- un próximo paso claro
- memoria útil para otras sesiones
- aprendizaje aprovechable para futuros proyectos