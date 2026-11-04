# Resend → Crédito Negocios: auditoría de entregas (Issue #67)

## Ambientes y secuencia
- **Staging oficial:** Railway, `https://creditonegocios-staging.up.railway.app`.
- **Producción:** no modificar hasta GO tras pruebas completas en staging.
- Endpoint de recepción: `POST /api/webhooks/resend`.
- Consulta Super Admin: `/admin/auditoria`, pestaña **Correos enviados**. La API `GET /api/admin/email-delivery-audit` exige sesión y rol real `super_admin`.
- Firma Svix obligatoria y verificada sobre los bytes JSON originales. Si falta la variable `RESEND_WEBHOOK_SECRET`, la ruta responde 503; no acepta mensajes sin firma.

## Configuración de un ambiente (una sola vez)
1. En **Resend → Webhooks → Add webhook**, introducir el endpoint HTTPS del ambiente.
2. Suscribir exclusivamente: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed`, `email.complained`, `email.suppressed`.
3. Copiar el **signing secret** generado por Resend (comienza con `whsec_`) directamente en las variables privadas del servicio Railway CreditoNegocios, clave **`RESEND_WEBHOOK_SECRET`**; **no** pegarlo en código, PR, logs, chat ni tickets.
4. Para staging, usar `https://creditonegocios-staging.up.railway.app/api/webhooks/resend` y su propio secreto. Para producción, usar su endpoint oficial solo **después de aprobación**, con un secreto distinto.
5. Si se produce una rotación de secreto, actualizar la variable Railway y probar una entrega firmada; no permitir firmas antiguas.

## QA de staging
- Confirmar deploy correcto, arranque `[AutoMigrate] Resend signed delivery audit verified` y salud `GET /api/health` 200.
- Enviar `POST` sin encabezados de firma: **401** con secret configurado; si aún falta el secret: **503**.
- Validar una muestra firmada sintética por Resend o prueba interna controlada, y comprobar **un solo registro** ante evento duplicado.
- Confirmar 403 para usuarios Broker/Master/Admin y lectura exitosa únicamente para Super Admin.
- Probar duplicados/desorden de eventos, así como estados de entrega vs. aceptación; **no enviar correos reales a usuarios desde staging**.
- Antes de producción, verificar `EMAIL_FROM` / dominio remitente ya validado para Resend.
- Verificar que no existan errores silenciosos o fugas de PII en logs.

## Alcance e interpretación
- Los correos de primera bienvenida (#63), recordatorios de invitación D3/7/12/15 e invitaciones iniciales **nuevas** capturan el ID de Resend; la API correlaciona con eventos firmados.
- Los **históricos sin ID del proveedor** se etiquetan *Histórico sin seguimiento*. No se inventan entregas antiguas.
- `email.delivered` confirma aceptación por el servidor de destino, **no** apertura de la bandeja, lectura humana ni respuesta del prospecto.
- Los webhooks pueden llegar antes de que la bitácora local guarde el ID: quedan en una tabla append-only y se enlazan al consultar el panel.
- Este desarrollo **no incluye** envío masivo, newsletters, cambios de comisiones ni reintentos automáticos de correos fallidos.
- El secreto se guarda en Railway y no debe reutilizarse entre ambientes.
