# PROMOTE TO MASTER — Promoción de aprendizajes al sistema maestro
> Este archivo existe para evitar que el conocimiento se quede aislado en un solo proyecto.
> Su función es capturar aprendizajes valiosos y promoverlos al sistema maestro cuando ya demostraron utilidad real.

---

## ¿QUÉ ES LA PROMOCIÓN AL MASTER?

Promover al master significa tomar un aprendizaje que funcionó en un proyecto y volverlo parte del sistema base del equipo, para que sirva en futuros proyectos.

Ejemplos de aprendizajes promovibles:
- un proceso que evitó errores repetidos
- una regla que mejoró mucho la comunicación con el CEO
- una decisión técnica que redujo complejidad
- una estructura de trabajo que aceleró entregas
- una plantilla que hizo más claras las respuestas

---

## ¿CUÁNDO SE PROMUEVE?

Promover cuando un aprendizaje cumpla al menos una de estas condiciones:
- se repitió en más de una sesión
- resolvió un problema real de forma consistente
- ahorró tiempo, errores o retrabajo
- mejoró comunicación, calidad o claridad
- sirve para más de un proyecto
- ya fue validado en práctica

---

## FLUJO DE PROMOCIÓN

### Paso 1: Capturar el aprendizaje en el proyecto
Primero se documenta en:
- `docs/team/TEAM_LEARNINGS.md`
- y, si aplica, también en `docs/project/DECISIONS.md` o `docs/project/ERROR_LOG.md`

### Paso 2: Evaluar si realmente merece promoción
Preguntas de validación:
- ¿Este aprendizaje es útil más allá de este proyecto?
- ¿Está suficientemente probado?
- ¿Ayuda a evitar errores futuros?
- ¿Simplifica el trabajo del equipo?
- ¿Representa una mejora real al sistema?

### Paso 3: Redactar la entrada para master
Si pasa la evaluación, se agrega a la sección de pendientes de sync.

### Paso 4: Hacer sync al master
Cuando haya suficientes aprendizajes o cuando el CEO lo autorice, consolidar y subir al sistema maestro.

### Paso 5: Limpiar pendientes
Después del sync:
- mover lo promovido a “syncs realizados”
- vaciar los pendientes ya absorbidos
- dejar solo lo nuevo por procesar

---

## ESTRUCTURA DE UN APRENDIZAJE PROMOVIDO

Cada entrada debe seguir este formato:

```markdown
- [FECHA] — [Título breve del aprendizaje]
  - Origen: [proyecto o sesión]
  - Problema: [qué problema resolvió]
  - Aprendizaje: [qué se aprendió]
  - Aplicación: [en qué otros proyectos o roles aplica]
  - Estado: listo para promover / promovido
```

---

## PENDIENTES DE SYNC

Aquí se registran los aprendizajes listos pero aún no sincronizados al master.

```markdown
- [FECHA] — [Título breve]
  - Origen: [proyecto]
  - Aprendizaje: [resumen]
  - Aplicación: [dónde aplica]
```

---

## SYNCs REALIZADOS

Registro histórico de lo que ya fue promovido al sistema maestro.

```markdown
- [FECHA] — Sync realizado
  - Elementos promovidos: [lista]
  - Motivo: [por qué se promovió]
  - Impacto: [qué mejora aporta al sistema maestro]
```

---

## REGLAS DE PROMOCIÓN

- No promover ideas no probadas
- No duplicar aprendizajes ya existentes
- No subir ruido al master
- No promover algo solo porque suena bien
- Sí promover lo que realmente mejora el sistema

---

## CRITERIO DE CALIDAD

Un aprendizaje merece estar en el master si:
- ayuda a repetir éxitos
- evita errores conocidos
- mejora velocidad de ejecución
- fortalece la memoria del equipo
- sirve en varios proyectos, no solo en uno

---

## FRECUENCIA RECOMENDADA

Revisar este archivo:
- al cerrar cada sesión importante
- cuando haya 3 a 5 aprendizajes útiles acumulados
- antes de iniciar un proyecto nuevo
- cuando el CEO pida consolidar buenas prácticas

---

## OBJETIVO FINAL

Que cada proyecto haga al sistema más inteligente, más rápido y más difícil de romper.