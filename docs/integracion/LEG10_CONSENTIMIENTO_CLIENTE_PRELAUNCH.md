# LEG-10 — Consentimiento del cliente para datos financieros y patrimoniales

**Estado:** especificación técnica prelaunch, **P0 abierto**, a validar por responsable legal/comercial. 14 de octubre de 2026.
**Ámbito:** clientes PF/PFAE/PM y sus representantes, Broker/Master, expediente, SAT/Buró y transferencia de información a financieras. **No equivale** a aceptación del Convenio del Broker ni a Términos/Aviso de la plataforma.

## Decisión de arquitectura vinculante (sin texto jurídico supuesto)
1. La evidencia identifica siempre al **cliente titular** (clientId, tenantId) y a **quién consintió**: persona física o representante acreditado de persona moral, su calidad y mecanismo de verificación. `brokerId` o `createdBy` son operadores/capturistas, **nunca** prueba de aceptación del cliente.
2. Versionado documental inmutable con `documentId`, `version`, contenido exacto, `SHA-256` y vigencia. La evidencia incluye sujeto/representante, `clientId`, finalidades/alcances aceptados, fecha UTC, IP/User-Agent cuando verificables, mecanismo de firma/OTP/acuse, referencia segura y hash del comprobante. Se preserva el snapshot personalizado exacto.
3. **Separar finalidades**, sujeto a validación jurídica: tratamiento interno para integrar expediente; consultas a terceros específicos, incluyendo historial crediticio cuando requiera autorización particular; transferencia o puesta a disposición de expediente a financieras/aliados identificados. No asumir que un único checkbox genérico cubre todo.
4. **Momento de exigibilidad:** capturar datos mínimos para identificar/prospectar no equivale a autorización para consultar Buró/SAT ni compartir expediente. Antes de cada acción sensible el backend debe comprobar finalidad, financiera/destinatario cuando corresponda, versión aprobada, titular válido y ausencia de revocación. El gate debe ejecutarse también en rutas legacy o automatizadas, **nunca sólo en UI**. Fallar cerrado ante evidencia incompleta, caducada o contradictoria; el resultado de matching es “información insuficiente”, no “compatible”.
5. **Versiones y revocaciones:** conservar evidencia histórica sin atribuir consentimiento retroactivo. Los cambios de propósito/destinatarios o de redacción material requieren nuevas aceptaciones según criterio legal. Las revocaciones bloquean únicamente tratamientos futuros para los que proceda, sin borrar evidencia necesaria de actos pasados.
6. **Privacidad y RBAC:** Broker autorizado puede consultar estado (no evidencia sensible de terceros). Super Admin con rol/permisos puede auditar. El representante del cliente debe tener proceso verificable de consentimiento, no un botón que pulse unilateralmente el Broker. Aislamiento estricto de tenant y recurso. Nunca poner identidades completas, firmas, IP, tokens o hashes privados en notificaciones.

## Contrato técnico a implementar tras aprobación legal
- Registro separado, por ejemplo `client_consent_document_versions` y `client_consent_evidences` (aditivo, históricamente inmutable), con FK a cliente/tenant y documento aprobado, evidencia/firmante y finalidad.
- Endpoints con autorización por cliente/tenant para `consent-status`, envío seguro al firmante, captura verificable de aceptación, comprobante y revocación. Idempotencia y concurrencia con restricciones de unicidad de (cliente, documento/version, firmante/finalidad) según definición legal, sin sobrescribir evidencia previa.
- Gate reutilizable: `authorizeClientSensitiveAction({ clientId, tenantId, purpose, recipientInstitutionId? })`; denegar con `CLIENT_CONSENT_REQUIRED` antes de consulta externa, generación de credenciales de tercero o transmisión de información. Revisar `/api/credit-submission-targets/:id/mark-sent`, las rutas de carga/consulta sensible y todos los canales de integración.
- Pruebas negativas: Broker no consiente en lugar del cliente; representante incorrecto; consentimiento de otro tenant; finalidad equivocada; falta de versión/hash; versión sustituida; revocado; cambio de financiera no autorizada; carrera con revocación; evidencia incompleta; E2E de consentimiento real sin fuga de datos.

## Validaciones pendientes de negocio y legal (NO improvisar)
1. Finalidades concretas y destinatarios; cuáles requieren autorización separada y cuál es el texto exacto aprobado/versionado, incluidas particularidades de Buró/SAT.
2. Quién acredita y verifica representación de PM, cómo y cuándo se firma, qué acuse se entrega al cliente y qué mecanismos de revocación aplican.
3. Requisitos de retención, consulta, notificación y almacenamiento segregado de comprobantes.
4. Distinguir datos de prueba de datos reales: todo el entorno actual contiene datos ficticios; no migrar consentimientos simulados a Producción.

**Criterio de salida:** backend fail-closed, UI verificable, evidencia persistida en PostgreSQL aislado, pruebas por rol/tenant/cliente, E2E Staging, revisión legal de contenido/representación. Hasta entonces **LEG-10 permanece NO GO**. No ejecutar migraciones ni publicar documentos legales por el solo hecho de existir esta especificación.
