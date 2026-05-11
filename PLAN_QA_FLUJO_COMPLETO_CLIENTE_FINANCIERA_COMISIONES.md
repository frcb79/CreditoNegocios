# Plan QA - Flujo Completo Cliente -> Financiera -> Aprobacion -> Comisiones

Objetivo: validar de punta a punta que el sistema asigna correctamente financieras y productos, permite aprobacion, y genera comisiones coherentes.

## Ambiente

- Frontend staging: https://credito-negocios-staging.vercel.app
- Backend staging: https://creditonegocios-staging.up.railway.app
- Usuario recomendado: admin o super_admin

## Flujo esperado (negocio)

1. Crear cliente con perfil valido (PM, PFAE, PF o Sin SAT).
2. Crear/usar financiera activa.
3. Asignar plantilla de producto a la financiera desde Financiera > Productos.
4. Crear solicitud (submission) para ese cliente y financiera.
5. Aprobar target en admin.
6. Registrar respuesta de institucion (monto/plazo/tasa).
7. Seleccionar ganador.
8. Marcar dispersado.
9. Confirmar credito en estatus disbursed.
10. Confirmar comisiones creadas (minimo apertura broker).

## Casos de prueba funcionales

### Caso A - Happy path completo

- Crear financiera con perfiles aceptados y comisiones cargadas.
- Asignar plantilla desde la pestaña Productos de la financiera.
- Crear cliente compatible con el perfil objetivo.
- Crear submission.
- Aprobar, registrar propuesta, seleccionar ganador y dispersar.
- Verificar comisiones en modulo Comisiones.

Criterios de aceptacion:
- El target pasa por estatus esperados sin errores.
- Se crea credito ligado al submission.
- Se crean comisiones sin montos negativos.

### Caso B - Duplicado de plantilla en financiera

- En la misma financiera, intentar asignar dos veces la misma plantilla.

Criterio de aceptacion:
- El sistema bloquea duplicado y muestra mensaje claro.

### Caso C - Coherencia financiera inactiva

- Poner financiera en inactiva.
- Intentar activar producto de esa financiera.

Criterio de aceptacion:
- El sistema impide activar producto y muestra mensaje coherente.

### Caso D - Validacion de comisiones

- Dispersar un target ganador.
- Revisar comisiones del credito generado.

Criterios de aceptacion:
- Existe al menos comision de apertura para broker si la tasa esta configurada.
- Si hay master broker y tasa configurada, existe comision master broker.

## Checklist UX/UI (operativo)

- La ruta de asignacion en Financiera > Productos es visible sin salir a otra pantalla.
- El selector de plantilla es entendible y el boton de accion es claro.
- En estado vacio, la pantalla indica claramente que hacer.
- Los mensajes de exito/error son directos y no tecnicos.
- Despues de asignar, el producto aparece de inmediato en la lista.
- Botones criticos tienen estados de carga (ej. Asignando...).

## Ejecucion automatizada recomendada

Comando:

- npm run validate:flujo:completo:staging

Variables necesarias (en .env.staging.local o .env.local):

- STAGING_EMAIL y STAGING_PASSWORD
- o STAGING_AUTH_COOKIE
- BACKEND_URL (opcional; default apunta a staging Railway)

Salida esperada:

- Archivo flujo-completo-report.json con steps, ids y resultado final.

## Resultado minimo para aprobar release

- Caso A y D en verde.
- Sin errores criticos de UX en ruta Financiera > Productos.
- Sin inconsistencias de estatus (target/credito/comision).
