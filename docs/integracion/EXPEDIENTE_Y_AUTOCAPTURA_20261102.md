# Expediente de asesores y autocaptura de prospectos

Fecha: 2 de noviembre de 2026. Base inicial revisada: `6817ccccd59bef1bae132497973f4c2a561654b5`. Rama actualizada sin conflictos sobre `05a4492` (hotfix #52).

## Plan ejecutado y comportamiento

1. **Expediente del Broker/Master para Super Admin.** Gestión de Usuarios → Directorio Global → Ver expediente. Reúne datos personales/comerciales, cuenta bancaria, referencias, organizaciones/red, registro y accesos, archivos personales, historial de aceptaciones y actividad. Convenios y firmas integra la consulta histórica existente, el contenido exacto aceptado y sus comprobantes PDF. No firma ni cambia evidencias en nombre de nadie.
2. **Activo con acceso confirmado.** Una contraseña configurada representa registro, pero no demuestra ingreso. Se conserva el estado operativo existente y se agrega “Pendiente de primer acceso” hasta que Passport haya guardado una sesión autenticada. Los indicadores de brokers activos también requieren esa evidencia.
3. **Enlace de redes.** Se conserva el enlace estable por asesor y los UTM genéricos existentes. Al enviar datos básicos, la solicitud se guarda inmediatamente en Prospectos recibidos y se ofrece continuar el perfil en la misma página.
4. **Enlace para contacto previo.** Clientes, la ficha propia de un cliente y la bandeja de prospectos permiten generar un enlace de captura directa. Puede ser para un nuevo contacto, una ficha existente o un prospecto ya recibido. No envía mensajes automáticamente. El asesor copia y comparte el enlace.
5. **Perfilamiento y recepción.** Se reutiliza el formulario de perfil y se comparte su validación condicional entre frontend y servidor. Los tipos son PM, PFAE, PF y Sin SAT. Se pueden dejar datos pendientes. Al completar un perfil válido se crea o completa el cliente propio si no existe conflicto y el asesor cumple la formalización y facultades vigentes. No se crea automáticamente una oportunidad comercial, solicitud de crédito o autorización para entregar documentos a financieras.

## Reglas de conservación y acceso

- Toda captación queda atribuida al owner/tenant almacenados en el servidor; los cuerpos públicos no pueden asignar broker, tenant, rol o estado.
- Un enlace privado no revela los datos personales o financieros previamente guardados. Vence a los siete días y se consume una vez. Sólo se almacena su hash.
- Los campos vacíos o explícitamente “no disponibles” pueden completarse; los valores ya registrados requieren revisión del asesor. El envío íntegro se conserva en un historial por prospecto. Las capturas posteriores no eliminan datos financieros previos al dejar campos vacíos.
- Coincidencias de identidad con otro asesor, tipos incompatibles o registros ambiguos no se reasignan ni duplican automáticamente. La información permanece en la bandeja para revisión.
- Si falta formalización del asesor, la captura se conserva pero no se elude el bloqueo de alta de Clientes.
- Perfil, lead, consumo del enlace y notificación se guardan en una transacción. Un fallo revierte el conjunto y permite reintentar.
- La notificación se publica por WebSocket después del COMMIT; Clientes, la bandeja y notificaciones se actualizan. Hay consulta periódica como respaldo.
- El expediente y las descargas personales requieren el rol real Super Admin. Se excluyen archivos de clientes/créditos y credenciales del usuario. Las APIs no devuelven rutas físicas ni secretos de sesión.
- Las nuevas tablas y los perfiles de marketing tienen RLS y carecen de acceso para PUBLIC/anon/authenticated. Las consultas pasan por el backend autorizado. Los tokens y respuestas privadas se excluyen del log HTTP.

## Migración y despliegue

`migrations/0018_broker_access_and_prospect_intake.sql` es aditiva y corresponde a `PROSPECT_INTAKE_SCHEMA_SQL`, ejecutada por la verificación de esquema existente al iniciar el backend. Agrega acceso confirmado, enlaces privados, datos de perfil e historial de envíos. No altera aceptaciones legales históricas.

El backfill usa únicamente eventos exitosos de acceso/registro con sesión, o identidades Passport ya persistidas. Una sesión antigua acredita ingreso, pero no permite inventar su fecha original: en ese caso las fechas permanecen NULL y el expediente explica esa ausencia.

El healthcheck exige también el esquema de estas funciones; no presenta el servicio como listo si faltan sus tablas/columnas. CI ejecuta expresamente las pruebas PostgreSQL/DOM del nuevo flujo.

Backend y frontend requieren desplegar esta versión. No se aplicó esta migración ni se probó con datos reales de producción durante el desarrollo. Los envíos y archivos de QA son ficticios y aislados.

## Verificación

- `npm run check`: sin errores TypeScript.
- Revisión final sobre main #52: **59/59** pruebas seleccionadas aprobadas (incluye privacidad de comisiones, salud del esquema y los flujos de este cambio).
- `npm run build`: compilación de cliente/servidor correcta; conserva avisos previos sobre tamaño del bundle y método duplicado en MemStorage.
- `npm run test:prospect-intake`: **14/14** escenarios HTTP/SQL sobre PostgreSQL aislado (PGlite), con persistencia real, transacciones, rollback/reintento, duplicados, formatos telefónicos mexicanos, consumo único, caducidad, suspensión, formalización, historia incremental y privilegios de Data API.
- `node scripts/test-broker-dossier-intake-ui.cjs`: comportamiento de pestañas, acceso confirmado, archivos, convenios/PDF, actividad, consentimiento, envío del formulario completo e invitación ligada a una ficha; correcto.
- `node scripts/test-broker-network-ui.cjs` y `node scripts/test-financieras-activity-ui.cjs`: regresiones funcionales existentes correctas.
- La verificación de UI utiliza DOM simulado. No se completó una inspección visual con Chromium: el descargable de este entorno fue inválido.
- Batería general tras integrar el cambio: **993 aprobadas, 5 fallidas y 90 omitidas** (1,088 pruebas). Los cinco fallos se reprodujeron también en un checkout intacto de la base: cuatro casos de preview multipart en `broker-invitation-http.test.ts` y un caso de fixtures/grupos en `commercial-graphic-importer-v4.test.ts`. Se registran como fallos previos; no se sustituyen por pruebas omitidas.

La prueba Jest de integración ejecuta el verificador PostgreSQL en un subproceso Node para que PGlite funcione sin exigir flags experimentales de módulos a toda la batería existente. Su dependencia está fijada y sólo es de desarrollo.
