# Plan Fase 1 - Flujo 1 a 1 (Sin Carga Masiva)

Objetivo: validar y estabilizar el flujo exacto de operacion manual antes de escalar a plantilla masiva.

## Alcance de Fase 1
1. Crear financiera manualmente (admin/super_admin).
2. Asignar un producto manualmente a esa financiera.
3. Verificar visibilidad del producto por financiera.
4. Verificar envio de solicitud de nueva financiera (broker).
5. Ejecutar regresion de botones criticos HIGH.

## Roles y responsables
- Backend Lead: integridad API y permisos.
- Frontend Lead: flujo UI y mensajes de error.
- QA Lead: ejecucion de pruebas y evidencias.
- DevOps: estado deploy/logs/rollback.

## Criterio de exito (Go)
- Flujo 1 a 1 pasa end-to-end sin 500.
- Producto asignado aparece en consulta por institutionId.
- Formulario de solicitud de nueva financiera crea registro.
- Casos HIGH del checklist de botones sin bloqueantes.

## Comandos operativos

### 1) Validar flujo tecnico 1 a 1 en staging
Requisitos de autenticacion (elige uno):
- STAGING_AUTH_COOKIE
- STAGING_EMAIL + STAGING_PASSWORD

Opcional:
- BACKEND_URL (default: https://creditonegocios-staging.up.railway.app)
- FLUJO_1A1_REPORT_PATH

Comando:
```powershell
npm run validate:flujo:1a1:staging
```

Salida esperada:
- Archivo `flujo-1a1-report.json` con `summary.success=true`.

### 2) Ejecutar checklist de botones
Archivo base:
- `qa-button-checklist.csv`

Accion QA:
- completar columna `result` con PASS/FAIL
- completar `notes` cuando falle

### 3) Verificacion deploy
```powershell
railway deployment list -s CreditoNegocios -e staging
```

## Secuencia de ejecucion recomendada (hoy)
1. Backend+QA: correr `validate:flujo:1a1:staging`.
2. QA: ejecutar bloque HIGH en `qa-button-checklist.csv`.
3. Frontend+Backend: corregir hallazgos criticos.
4. DevOps: redeploy y confirmar estado SUCCESS.
5. QA: re-test y cierre de fase.

## Bloqueadores conocidos
- Sin credenciales de staging no se puede correr validacion autenticada.

## Entregables del cierre de Fase 1
- `flujo-1a1-report.json` exitoso.
- `qa-button-checklist.csv` actualizado.
- Lista de incidentes resueltos y pendientes de severidad media/baja.
