# Crédito Negocios — Corte a Producción (MVP, octubre de 2026)

**Estado: NO GO.** Este documento no autoriza despliegues, migraciones, cambios de variables ni borrado. Sustituye las instrucciones antiguas de migrar documentos históricos: los registros existentes son sintéticos y NO se copian a Producción.

## Modelo e infraestructura
- Rama única candidata: integration/phase-1a1-base-segura, PR #10 Draft; main congelada hasta GO.
- Staging: Railway PostgreSQL; Producción: Supabase PostgreSQL existente. El operador identificó conexiones separadas; aún verificar instancia utilizada por cada proceso de aplicación.
- Supabase Storage: proyecto/bucket/SERVICE_ROLE_KEY compartidos actualmente. No usar Staging para documentos reales. El guard del código bloquea operaciones de Supabase en Staging salvo configuración aislada; otro bucket con la misma SERVICE_ROLE_KEY NO garantiza segregación efectiva.
- Producción debe arrancar sin Brokers, Masters, clientes, créditos, solicitudes, contratos, comisiones ni documentos de prueba. Conservar esquema, configuraciones seguras, catálogos/ofertas definitivos y bootstrap de Super Admin.
- MVP: Broker/Master captura perfil; CN hace matching y gestiona contactos internamente; financiera solicita documentos al prospecto. LEG-10 diferido; no activar CLIENT_CONSENT_RELEASE_APPROVED. PDF institucional y envío de expediente siguen restringidos.

## Gate 1 — Antes de cualquier despliegue
1. Confirmar GitHub Actions verde sobre SHA EXACTO de PR #10, TypeScript, build, unitarias y PostgreSQL aislado.
2. Certificar origen y SHA desplegado: Staging web seguía conectado a main en el último inventario. La versión actual de Staging NO valida el PR #10.
3. Confirmar auto-deploy de Producción deshabilitado antes de integrar main; verificarlo efectivamente con el operador Railway.
4. Certificar que las aplicaciones usan DB diferentes mediante lectura del destino activo en cada entorno, sin exponer URLs con credenciales.
5. Acordar modo de prueba de archivos: Staging sin credencial privilegiada compartida, o almacenamiento con credenciales restringidas por entorno. No cambiar el flag STAGING_DOCUMENT_STORAGE_ISOLATED a true mientras la llave de servicio sea compartida.
6. Preparar backup restaurable, inventario de datos sintéticos y lista de restricciones FK/triggers de evidencias legales. No ejecutar TRUNCATE general ni eliminar evidencias de retención.

## Gate 2 — QA Staging sobre el SHA candidato (requiere permiso separado)
- Desplegar SOLO a Staging tras aislamiento y autorización de despliegue.
- Usar cuatro identidades sintéticas (Super Admin, Admin, Master, Broker), credenciales por variables seguras y correos de prueba.
- Recorrer alta de cliente, perfil, matching compatible/no compatible/información insuficiente, creación de solicitud, aprobación interna, contacto comercial y captura de propuesta.
- Verificar que contacto interno no entrega PDF/documentos, no activa LEG-10 ni marca envío externo. Comprobar acceso ajeno, doble clic, oportunidad cerrada, competidor financiero simultáneo y lineage de ofertas.
- Comprobar confirmación manual de desembolso y comisiones sin simular transferencias. Probar sesion, legal Broker/Master y OTP comercial existente.
- Guardar PASS/FAIL por rol, endpoint, ID sintético, SHA desplegado y evidencia; auditoría independiente ASTRA al final.

## Gate 3 — Preparación Producción (autorización específica)
1. Respaldar y ensayar en COPIA el procedimiento selectivo de limpieza de todos los datos sintéticos presentes en Producción. Revisar evidencias legales y auditorías antes de decidir qué conservar. Ningún borrado es implícito.
2. Ensayar migraciones idempotentes sobre esquema vacío y con datos de prueba; no ejecutar db:push o seeds ficticios directamente en Producción.
3. Configurar superadmin seguro sin credenciales predeterminadas, correo, sesiones, dominios, OTP comercial, controles de acceso y catálogos financieros aprobados.
4. Separar tres autorizaciones: merge a main, deploy a Producción y limpieza controlada. Una aprobación no presupone las otras.
5. No importar usuarios/clientes/documentos/operaciones de Staging. Conservar catálogos maestros definitivos cuando estén validados.

## Día de corte, observación y rollback
- Verificar health, acceso por cuatro roles, matching, gestión comercial interna, auditorías, ausencia de fixtures y políticas de documentos.
- Ante fallos, rollback de código/despliegue, sin DROP ciego de tablas ni eliminación de evidencias. Mantener observación operativa antes de GO final.
- Si cualquier Gate falla o no hay respaldo/restauración confirmado, NO GO.

Este documento reemplaza cualquier instrucción anterior de migrar documentos históricos a Producción o borrar datos como parte automática del deploy.
