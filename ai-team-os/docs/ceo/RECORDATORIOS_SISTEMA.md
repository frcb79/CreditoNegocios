# ⏰ SISTEMA DE RECORDATORIOS — Sync con el Master
> El Orquestrador usa estas reglas para recordarle al CEO cuándo sincronizar.
> El CEO no tiene que recordar nada — el sistema lo avisa.

---

## CUÁNDO EL ORQUESTRADOR RECUERDA HACER SYNC

### Recordatorio automático por TIEMPO:
```
Cada 2 semanas en proyectos activos → el Orquestrador dice al inicio de sesión:
"⏰ RECORDATORIO: Han pasado 14 días desde el último sync con el master.
 ¿Hacemos el sync ahora (5 min) o al terminar esta sesión?"
```

### Recordatorio automático por CANTIDAD:
```
Cuando PROMOTE_TO_MASTER.md tiene 5+ entradas pendientes:
"⏰ RECORDATORIO: Hay [N] aprendizajes listos para subir al master.
 ¿Los revisamos ahora?"
```

### Recordatorio automático al CERRAR PROYECTO:
```
Siempre que el CEO diga "cerramos el proyecto":
El sync es parte obligatoria del cierre — no es opcional.
```

### Recordatorio al INICIAR PROYECTO NUEVO:
```
Antes de copiar el master al nuevo proyecto, el Orquestrador verifica:
"¿Hay syncs pendientes de otros proyectos antes de iniciar este?
 Si los aprobamos ahora, el nuevo proyecto hereda esos aprendizajes."
```

---

## FRASES QUE ACTIVAN EL SYNC MANUALMENTE

El CEO puede decir cualquiera de estas en cualquier momento:

| Frase | Acción |
|-------|--------|
| `"sync"` | Sync inmediato del proyecto actual |
| `"sync semanal"` | Sync de todos los proyectos activos |
| `"¿cuándo fue el último sync?"` | Reporte de estado de todos los proyectos |
| `"¿qué hay pendiente para el master?"` | Lista de aprendizajes sin sincronizar |
| `"actualiza el master"` | Inicia el proceso completo de sync |

---

## ESTADO DE SYNC — LO QUE VE EL CEO

Cuando el CEO pide `"estado de sync"`, recibe:

```
📊 ESTADO DE SYNC — [FECHA HOY]

MASTER: ai-team-os v[X.X] | Última actualización: [FECHA]

PROYECTOS ACTIVOS:
┌─────────────────────────────────────────────────────┐
│ Proyecto A  │ Último sync: [FECHA] │ Pendientes: [N] │
│ Proyecto B  │ Último sync: [FECHA] │ Pendientes: [N] │
│ Proyecto C  │ Último sync: [FECHA] │ Pendientes: [N] │
└─────────────────────────────────────────────────────┘

⚠️ ATENCIÓN:
[Proyecto X] lleva [N] días sin sync → recomendado hacerlo pronto
[Proyecto Y] tiene [N] aprendizajes pendientes → listo para sync
```
