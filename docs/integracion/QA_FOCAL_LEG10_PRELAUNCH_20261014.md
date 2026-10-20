# QA final focalizada — LEG-10, divulgación del cliente y cierre prelaunch

Fecha de preparación: 14-oct-2026. **NO GO general.** Sin datos ni consentimientos reales en los ambientes actuales.

## Alcance y referencia verificable
- Rama única `integration/phase-1a1-base-segura`, PR #10 Draft hacia `main`.
- Checkpoint anterior verde: `64db08cf6c047a590bd3ce405ba5a71daa0a8a31`, Actions `38637732581` (316/316 unit + 9 suites PG aisladas). **No atribuir ese CI a commits posteriores.**
- LEG-10 bloquea **divulgación**, no creación de borradores ni captura inicial del expediente.
- `server/clientConsentGate.ts` es **deny-by-default temporal** hasta evidencia de cliente verificable y textos autorizados. No existe aceptación real, UI del firmante ni posibilidad de autorizar divulgación. Cambios no certificados hasta CI del SHA nuevo.
- No se ejecutan pruebas contra Staging/Producción hasta confirmar SQL, Storage y credenciales segregadas; ningún E2E puede crear clientes sin autorización de ese entorno.

## Matriz de escenarios a ejecutar y conservar evidencia

| ID | Actor / contexto | Acción | Resultado obligatorio | Evidencia requerida |
|---|---|---|---|---|
| LEG10-01 | Super Admin, sin firma de cliente | PATCH `/api/credit-submission-targets/:id/mark-sent` | 409 `CLIENT_CONSENT_REQUIRED`; target y solicitud inmutados | request ID, estado antes/después, log |
| LEG10-02 | Admin con permisos, sin firma | POST `/api/credit-submission-targets/:id/generate-pdf` | 409, JSON; ningún byte PDF ni `Content-Disposition` | HTTP + headers |
| LEG10-03 | Broker originador | INTENTA transmitir datos, incluye `consentAccepted:true` | Sin bypass; nunca autoriza por captura propia | prueba negativa |
| LEG10-04 | Broker de otro tenant | Consulta/evidencia y exportación de expediente ajeno | 403/404, no fuga de campos | sesión + respuesta sin PII |
| LEG10-05 | Master | Broker de su red vs fuera de su red | Sólo alcance comercial autorizado; consentimiento ajeno no reutilizable | E2E rol/tenant |
| LEG10-06 | Representante PM NO acreditado | Intento de firmar en nombre de sociedad | Rechazo y sin evidencia válida | id firmante; sin datos sensibles en logs |
| LEG10-07 | Cliente PF/PFAE | Aceptación expresa con instrumento aprobado y versión exacta | Evidencia durable con hash del texto + snapshot + firmante | SQL aislado y comprobante |
| LEG10-08 | Cliente/representante PM | Firma validada según resolución jurídica | Autorización sólo a fines y destinatarios enumerados | acuse del cliente |
| LEG10-09 | Consentimiento para Financiera A | Envío a Financiera B | Rechazo; no sobreextender destinatario | target/scope original |
| LEG10-10 | Consentimiento para consulta Buró | Envío de expediente a financiera | Rechazo, finalidades independientes | evidencia por finalidad |
| LEG10-11 | Revocación válida | Envío posterior / simultáneo | Rechazo, carrera resuelta por transacción; histórico intacto | timestamps servidor, concurrencia |
| LEG10-12 | Documento modificado/expirado/hash falso | Envío a financiera | Rechazo antes de transferencia | SHA y versión |
| LEG10-13 | Respuesta 409 / error de red | Reintento del Broker | Sin creación de estado `sent`, sin envío externo duplicado | target y audit |
| LEG10-14 | Broker / Master | Aceptación comisiones COM-28 | No satisface consentimiento del cliente LEG-10 | distinta entidad jurídica |
| FIN-01 | SA, Master, Broker | Matching con dato ausente | `INSUFFICIENT_DATA`, nunca compatible inventado | expediente y versión |
| FIN-02 | SA | v1 publicada/v2 borrador y edición concurrente | v1 inmutable, no mezcla de tarifas/documentos | hashes y PG |
| OPE-01 | SA y Broker | Dos targets ganadores distintos de misma solicitud | Puede haber 2 créditos por 2 targets; no 2 por uno | claves e idempotencia |
| OPE-02 | SA | Confirmación parcial concurrente | No exceder monto ni comisión duplicada | DB snapshots |
| COM-01 | Super Admin | Aprobación de comisión con cargo vigente | Verifica monto congelado y receptor Master o Broker directo | auditoría, sin pago simulado |
| PAG-01 | Super Admin | Pago manual documental | CSF, INE y estado de cuenta del receptor real; referencia no reutilizable | documentos y auditoría |
| SEC-01 | Broker | Intento de leer CLABE o auditoría de otro usuario | 403/404, sin fuga por lista ni download | HTTP cuerpo filtrado |
| SEC-02 | Broker B formalizado | POST crédito/solicitud/hipoteca con `clientId` de Broker A | 403 `CLIENT_ORIGINATION_NOT_AUTHORIZED` sin crear crédito ni solicitud | HTTP + storage antes/después |
| SEC-03 | Broker B | POST documento con `clientId` ajeno | 403 `DOCUMENT_CLIENT_NOT_AUTHORIZED`; no persistir fichero, registro ni fuga | HTTP + storage + limpieza temporal |
| SEC-04 | Broker A con documento propio | PUT documento intentando reasignarlo a cliente de Broker B | 403, documento y titular original intactos | HTTP + estado antes/después |
| SEC-05 | Master / tenant distinto | Referenciar crédito y cliente de diferentes titulares en un solo documento | Rechazo `DOCUMENT_CLIENT_CREDIT_MISMATCH`, sin escribir archivo | E2E/HTTP aislado |
| SEC-06 | Master con supervisión | PUT/DELETE documento no vinculado de su Broker subordinado | 403; lectura de red no concede escritura ni borrado | HTTP + estado antes/después |
| SEC-07 | Super Admin / Broker con edición | PUT cliente con `brokerId` / `tenantId` distinto | 409 `CLIENT_OWNERSHIP_IMMUTABLE`; identidad histórica intacta | HTTP + persistencia |
| SEC-08 | Super Admin / Broker con edición | PUT crédito con `clientId`, `brokerId` o `linkedSubmissionId` diferente | 409 `CREDIT_OWNERSHIP_IMMUTABLE`; linaje original intacto | HTTP + persistencia |
| LEG-01 | Master/Broker | OTP, formalización, versiones | Documento personalizado exacto, OTP y evidencia histórica | hash, timestamps, comprobante PDF |
| OPS-01 | Equipo autorizado | Ensayo de despliegue en Staging aislado | Sin conexión a BD, Storage, sesiones, emails o secretos de Producción | checksums de configuración |
| OPS-02 | Equipo autorizado | Restore/rollback de copia sintética | Migraciones 0004–0009 + nuevas pendientes sin pérdida de historial | backup + restore drill |

**Estado:** LEG10-01–03 y SEC-02–08 cuentan con cobertura HTTP unitaria escrita, sujeta a CI del SHA nuevo. El resto exige ejecución/evidencias adicionales; LEG10-06–12 requieren redacción legal, verificación del firmante, persistencia, revocación y UI **aún no implementadas**.

## Diseño legal a aprobar (el equipo técnico NO selecciona excepciones por cuenta propia)
1. Texto versionado y exacto del instrumento de consentimiento para PF/PFAE/PM; aviso de privacidad correcto y fecha efectiva.
2. Alcance distinto para (a) armado/uso interno de expediente, (b) consultas específicas de Buró/SAT, (c) transferencia a cada financiera (o categoría válida según dictamen), con reglas de excepción **por caso** y fundamento jurídico.
3. Forma de verificar identidad y facultades del representante de persona moral, firma/OTP confiable, acuse, revocación y retención.
4. Aprobación jurídica de procedimiento de transferencia a financiera y definición de responsable/encargado.
5. Implementar PostgreSQL de documento + evidencias + revocaciones, firma externa de cliente, consulta de estado por cliente/tenant y control atómico antes del envío. No usar `legal_acceptances` de usuarios de plataforma como firma de cliente.
6. Validar específicamente Ley Federal de Protección de Datos Personales en Posesión de los Particulares de 20-mar-2025 (arts. 7, 15, 35–36) y Ley para Regular las Sociedades de Información Crediticia para autorización de consultas; criterio legal puede depender del perfil/supuesto.

Fuentes públicas para revisión jurídica: 
- https://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo125102.html
- https://www.dof.gob.mx/nota_detalle.php?codigo=5752569&fecha=20/03/2025
- https://www.condusef.gob.mx/documentos/marco_legal/LRSIC-240124.pdf (confirmar reformas posteriores con asesoría)

## Paquete de evidencia para ASTRA (cuando proceda)
- SHA candidato único, PR #10, job IDs de TypeScript/build/316 tests/PG y manifest de archivos que cambió desde el último verde.
- Reporte HTTP por actor+tenant; SQL de ensayo únicamente en base efímera, datos sintéticos, sin secretos.
- Capturas de flujos cliente, Broker, Master, Admin, Super Admin; intentos de suplantación y revocación; bitácora sin PII.
- Checklist y prueba de aislamiento Staging↔Producción, backup, preflight, control del auto-deploy.
- Dictamen ASTRA por ID: `PASS / FAIL / BLOCKED`, evidencia/commit/impacto, riesgo residual y GO/NO-GO. No aceptar afirmaciones sin ejecución reproducible.

## Secuencia operativa de salida
(1) CI exacto de código -> (2) texto/alcances aprobados por legal -> (3) backend de evidencia + firma y revocación en PG aislado -> (4) E2E multirol en Staging demostrado aislado -> (5) ASTRA QA independiente -> (6) aprobación explícita para merge -> (7) corte/limpieza controlados de datos sintéticos y deploy separado. No activar pagos reales ni consultar terceros hasta completar sus propios gates.
