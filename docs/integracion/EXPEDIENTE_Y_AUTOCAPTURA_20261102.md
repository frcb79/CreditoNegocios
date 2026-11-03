# Expediente de asesores y autocaptura de prospectos

Fecha: 2 de noviembre de 2026. Base inicial revisada: `6817ccccd59bef1bae132497973f4c2a561654b5`. Rama actualizada sin conflictos sobre `05a4492` (hotfix #52).

## Plan ejecutado y comportamiento

1. **Expediente del Broker/Master para Super Admin.** Gestión de Usuarios → Directorio Global → Ver expediente. Reúne datos personales/comerciales, cuenta bancaria, referencias, organizaciones/red, registro y accesos, archivos personales, historial de aceptaciones y actividad. Convenios y firmas integra la consulta histórica existente, el contenido exacto aceptado y sus comprobantes PDF. No firma ni cambia evidencias en nombre de nadie.
2. **Activo con acceso confirmado.** Una contraseña configurada representa registro, pero no demuestra ingreso. Se conserva el estado operativo existente y se agrega “Pendiente de primer acceso” hasta que Passport haya guardado una sesión autenticada. Los indicadores de brokers activos también requieren esa evidencia.
3. **Enlace de redes.** Se conserva el enlace estable por asesor y los UTM genéricos existentes. Al enviar datos básicos, la solicitud se guarda inmediatamente en Prospectos recibidos y se ofrece continuar el perfil en la misma página.
4. **Enlace para contacto previo.** Clientes, la ficha propia de un cliente y la bandeja de prospectos permiten generar un enlace de captura directa. Puede ser para un nuevo contacto, una ficha existente o un prospecto ya recibido. No envía mensajes automáticamente. El asesor copia y comparte el enlace.
5. **Perfilamiento y recepción.** Se reutiliza el formulario de perfil y se comparte su validación condicional entre frontend y servidor. Los tipos son PM, PFAE, PF y Sin SAT. Se pueden dejar datos pendientes. Al completar un perfil válido se crea o completa el cliente propio si no existe conflicto y el asesor cumple la formalización y facultades vigentes. No se crea automáticamente una oportunidad comercial, solicitud de crédito o autorización para entregar documentos a financieras.

6. **Materiales comerciales, consolidación de #44.** Se integra la eliminación de logos y avatares personales: sólo nombre y WhatsApp del Broker/Master, conservando el logotipo institucional y el fondo aprobado. Se mantiene `multer`, necesario para recibir ZIP o PNG + mapa. Los mapas anteriores con geometría de logo siguen siendo compatibles, pero el renderizador no dibuja esa imagen. Los logos históricos no se eliminan; sus endpoints de lectura/carga quedan deshabilitados.

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
- Chromium real: expediente, pestañas de documentos/convenios, texto histórico aceptado, consentimiento, envío del perfil completo y generación de enlace privado, en escritorio (1440 px) y móvil (390 px). Inspección de capturas y comprobación de ausencia de desbordamiento horizontal en el formulario. APIs ficticias; sin escrituras en producción.
- Chromium real: carga de PNG por POST autenticado, renderizado y exportación de 1080 × 1350 con nombre/WhatsApp; el área del logotipo institucional se conserva píxel a píxel y no se solicita ningún logo personal. Se usó un fondo sintético de QA, no se modificaron artes definitivos.
- `tests/unit/commercial-graphic-import-http.test.ts`: **4/4** pruebas de ZIP multipart, borrador, conservación de bytes, rechazo de checksum antes de transacción, rollback y permisos. Usa transporte HTTP real y base simulada; la persistencia del flujo de prospectos se verifica separadamente con PostgreSQL.
- Batería general final: **1,002 aprobadas, 0 fallidas y 90 omitidas** (1,092 pruebas). Se corrigieron los cinco fallos previos: el preview de invitaciones ahora respeta la selección de almacenamiento en memoria de NODE_ENV=test y el fixture de artes usa el grupo completo permitido. También se actualizó la expectativa de permisos de logos personales conforme a su desactivación.

La prueba visual es reproducible con `node scripts/test-broker-commercial-browser.cjs` después del build y de instalar Chromium de Playwright. Puede usarse `CHROMIUM_EXECUTABLE_PATH` para una instalación externa; `BROWSER_QA_OUTPUT` permite elegir el directorio de capturas.

La prueba Jest de integración ejecuta el verificador PostgreSQL en un subproceso Node para que PGlite funcione sin exigir flags experimentales de módulos a toda la batería existente. Su dependencia está fijada y sólo es de desarrollo.


## Secuencia para producción y plantillas

1. Revisar y fusionar únicamente el PR #53, que reúne expediente/autocaptura y el alcance útil de #44 con su corrección. No fusionar #44 por separado sobre esta versión.
2. Confirmar que Railway y Vercel despliegan el mismo commit de main; comprobar salud/esquema y los recorridos con los roles reales.
3. Cargar el ZIP definitivo de artes como borrador desde Recursos Comerciales. Revisar nombres, WhatsApp y composición con un Broker y un Master.
4. Publicar cada plantilla revisada; la publicación actual sigue siendo individual. Confirmar catálogo y descarga desde ambos roles.

Este desarrollo no ha fusionado main, desplegado producción ni cargado/publicado plantillas definitivas. Los conteos de plantillas de otra conversación no se consideran una nueva consulta de producción.

## Seguimiento: presentación del asesor y revisión de roles

Los PR #53 y #54 están fusionados. Se confirmó #54 (`aa72e11`) en Railway SUCCESS y aplicación/landing Vercel READY. La presentación propuesta en esta rama aplica a `/c/:token` y `/completar-perfil/:token`: nombre del asesor/despacho arriba, “Asesoría en financiamiento”, y al pie “Powered by” con el logotipo institucional existente y enlaces legales. El encabezado obtiene la identidad de la respuesta del servidor; una URL vencida no muestra un asesor anterior. La consulta del enlace directo se comparte mediante React Query, sin una petición adicional para el encabezado.

Verificación de este cambio:

- TypeScript y build de cliente/servidor correctos.
- 24 pruebas existentes de permisos/expediente, captación, perfil público e invitaciones aprobadas.
- 14 escenarios HTTP/PostgreSQL aislados de captación y persistencia aprobados.
- 3 pruebas HTTP existentes del ciclo de sesión Passport/WebSocket aprobadas.
- Prueba DOM existente del expediente/autocaptura aprobada.
- Chromium real en 1440 y 390 px con nombres de Broker y despacho Master ficticios: cabecera, logo cargado, pie legal, nombre largo sin desbordamiento, contacto → perfil completo → confirmación, captura directa y enlace vencido correctos. Las APIs de esta inspección visual son ficticias; no equivale a una sesión de producción.
- Producción: salud HTTP 200; expediente anónimo rechazado con 401 y enlace privado inexistente rechazado con 404.

Pendiente para cerrar la revisión con roles reales: sesión autenticada de Super Admin y revisión de Clientes/Recursos Comerciales como Broker/Master. El intento de acceso seguro quedó interrumpido y no se dispone de una sesión en el navegador de revisión. No se tomaron sesiones de la base, no se cambiaron credenciales ni se enviaron prospectos de prueba a producción. Las plantillas definitivas permanecen fuera de este cambio.

## Ajuste de confianza y enlaces (3 de noviembre)

El PR #56 ya está fusionado y desplegado. El cliente real de arrendamiento reportado existe; se reparó únicamente su relación comercial con el Broker originador, sin recaptura ni duplicación. La consulta de matching vuelve a enviar la sesión. La revisión visual autenticada con roles reales sigue pendiente.

En ambos formularios públicos se añade un aviso visible con identidad del asesor, propósito de la captura, ausencia de envío automático a financieras y la advertencia de no entregar contraseñas ni depósitos. En el enlace individual se explica además que vence, se consume una vez y no revela datos previos del expediente. El pie institucional existente conserva “Powered by”, el logo de Crédito Negocios y los enlaces legales.

El enlace de redes es estable por Broker/Master y captura primero contacto básico; al continuar en la misma sesión precarga nombre, teléfono y correo. El enlace individual puede crearse sin ficha previa o ligado a un cliente/prospecto existente. Por privacidad, su GET devuelve únicamente asesor y versión del aviso: no precarga datos personales ya guardados. Esta decisión mantiene simple la primera versión y evita divulgar el expediente si se reenvía el enlace.
