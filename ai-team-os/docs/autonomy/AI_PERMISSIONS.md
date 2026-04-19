# PERMISOS DE AUTONOMIA DEL EQUIPO DE IA

## NIVEL 1 — AUTONOMIA TOTAL (sin preguntar)
- Escribir y modificar codigo
- Refactoring sin cambiar funcionalidad
- Crear carpetas y archivos nuevos
- Actualizar PROJECT_BRAIN, ERROR_LOG, DECISIONS, CHANGELOG

## NIVEL 2 — INFORMAR ANTES DE EJECUTAR
- Cambiar el stack tecnologico principal
- Eliminar archivos o modulos existentes
- Cambios en base de datos en desarrollo

## NIVEL 3 — APROBACION EXPLICITA REQUERIDA
- Deploy a produccion
- Cambios de seguridad en produccion
- Datos reales de usuarios finales
- Implicaciones legales

## REGLAS DE ORO
- NUNCA exponer API keys en el codigo
- NUNCA deployar a produccion sin aprobacion
- NUNCA eliminar datos reales de usuarios