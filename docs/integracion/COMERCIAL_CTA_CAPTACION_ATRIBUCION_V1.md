# COM-CTA-001 — Captación y atribución comercial

**Decisión de producto 23-oct-2026. Contrato de arquitectura, NO desplegado.**
Dependencia: PR #18, biblioteca administrada por Super Admin.

## Identidad obligatoria

Todo material publicable debe incluir nombre personal/comercial, contacto válido y logotipo. No se permite exportar material con espacios vacíos. En la primera versión, el contacto es WhatsApp válido y el logotipo es el institucional de Crédito Negocios; se habilitará identidad propia después de su validación. Solo Super Admin puede definir titulares, HERO, copy, productos, CTA y leyendas legales. Broker/Master selecciona una plantilla publicada y aporta exclusivamente sus datos autorizados.

## CTA atribuible

**Enlace central propuesto:** https://DOMINIO_AUTORIZADO/c/TOKEN_OPACO

La URL es emitida y administrada por el backend, no construida con userId, tenantId, referralCode de invitaciones ni cupones. La referencia almacena ownerUserId, tenantId cuando corresponda, templateId, version, channel, destino aprobado y fechas. El token es aleatorio no secuencial; nunca aceptar que un parámetro URL entrante modifique el destino ni el propietario.

### Destinos

1. **Landing Crédito Negocios (preferido):** nuevo formulario público de CLIENTE FINAL de financiamiento, no /brokers (captación de brokers) ni login. Registra formulario y conserva identidad de quien lo refiere.
2. **WhatsApp del broker o master:** enlace generado por backend con número validado y mensaje preaprobado. Medir clics; no afirmar que un clic equivale a conversación o lead convertido.
3. **Página externa propia:** HTTPS previamente verificado/autorizado por Super Admin. No habilitar URL libre sin validación de dominio y defensa frente a phishing/redirección abierta. Medir clics; conversiones externas requieren integración adicional.

Super Admin habilita destinos por plantilla. Broker/Master solo elige destinos autorizados. En artes estáticos usar URL corta y, cuando el diseño lo permita, QR; en TikTok/Reels utilizar las opciones de enlace disponibles por canal.

### Métricas honestas y útiles

click (enlace), landing_view, form_submitted, lead_validated, client_linked, opportunity_created, credit_disbursed. Primero contar clics y formularios, después vincular ventas reales. Sin analítica de impresiones sociales no inventar CTR; sin integración WhatsApp no afirmar mensajes reales. Reducir datos recogidos durante visitas a lo estrictamente necesario; prevenir clics automatizados en los reportes.

## Lead intake futuro: principio de no apropiación automática

- El lead trae un token de atribución validado en servidor, ligado al broker o master real y su campaña. El lead se conserva en una bandeja de captación separada de Clientes/Oportunidades.
- Broker: bandeja comercial propia. Master: bandeja del Master sin asignación automática a cualquiera de sus brokers; revisar permisos canOriginate y red correspondiente.
- Primero consentimiento verificable, aviso vigente, antispam, validación de email/teléfono y duplicados por RFC/teléfono/correo. No exponer información del cliente de otro tenant ni adjudicar por una coincidencia.
- Si existe cliente, oportunidad protegida o conflicto comercial, mantener el lead separado. No saltar las reglas de protección, relaciones cliente-broker, reserva de oportunidades, atributos históricos ni comisiones.
- Posteriormente, vincular la solicitud al expediente correcto mediante servicio de autorización; automatizar ingreso solo cuando todas esas validaciones sean positivas.
- Un clic NO equivale a propiedad del cliente, oportunidad creada, aprobación de financiera o comisión generada.

## Fases de entrega

**B1, ahora:** identidad obligatoria con contacto y marca; CTA es texto aprobado bloqueado en plantillas. Validar GitHub Actions/Staging.

**B2:** emitir enlaces de campaña, registrar clics, generar enlaces y QR, manejar WhatsApp y landing propia. Dominio externo solo después de aprobación/verificación.

**B3:** landing de clientes finales con consentimiento explícito e intake seguro separado por propietario/tenant, deduplicación y medición de envíos.

**B4, posterior:** alta semiautomática o automática a Clientes/Oportunidades solo después de superar reglas comerciales, privacidad, KYC cuando corresponda y permisos.

### Entregable de la conversación de diseño

Reservar áreas para logo obligatorio, nombre, WhatsApp, CTA, URL/QR y disclaimer en cada plantilla y formato. Estos espacios no deben quedar visualmente vacíos. Los videos MP4 y su hosting/CDN se definirán después.

**Nota:** Nada de B2-B4 se considera implementado por la sola existencia de este contrato. No fusionar PR #18 antes de validación integral.
