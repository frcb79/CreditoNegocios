# Crédito Negocios — QA del MVP Cliente → Matching → Gestión comercial

**Solo Staging sintético en SHA candidato verificado.** El estado de contacto no significa entrega externa de expediente.

## Flujo aprobado
El Broker o Master llena el perfil con información disponible, Crédito Negocios analiza internamente y encuentra financieras compatibles, Administración aprueba e inicia contacto comercial, y cada financiera solicita al prospecto sus documentos y autorizaciones. Subir archivos a CN es opcional; nunca supone transferencia automática a entidades externas. LEG-10 no es obligatorio para precalificar.

## Matriz de pruebas focales
| ID | Prueba sintética | Resultado esperado |
|---|---|---|
| MVP-01 | Broker registra prospecto y solicitud | Sin OTP de cliente ni archivo obligatorio, sin fuga entre tenants |
| MVP-02 | Master origina o consulta su red | Atribución histórica correcta, sin permiso Admin |
| MVP-03 | Matching con variables completas | Compatible/no compatible según oferta publicada, sin usar atributos sensibles |
| MVP-04 | Matching con datos faltantes | Información insuficiente; no forzar match ni pedir información excesiva |
| MVP-05 | Admin aprueba target y selecciona financiera interna | No implica entrega del expediente |
| MVP-06 | Admin inicia contacto comercial | approved → contact_initiated y solicitud in_progress, sin envío de información ni OTP |
| MVP-07 | Doble clic de contacto o dos Admin simultáneos | Un único cambio, idempotencia y sin duplicidad |
| MVP-08 | Broker/Master trata de cambiar contacto por API | 403 y sin mutación |
| MVP-09 | Intento de marcar enviado o generar PDF institucional sin LEG-10 | 409; cero datos/documentos entregados |
| MVP-10 | Se devuelve una target con otra financiera activa | La solicitud global conserva progreso |
| MVP-11 | Admin registra propuesta financiera | Oferta/version exacta, sin acceso al margen reservado |
| MVP-12 | Ganador, confirmación manual de desembolso y comisiones | Atribución, montos y trazas coherentes; no pagos simulados |
| MVP-13 | Archivos Supabase en Staging mientras compartan privilegios | Bloqueados por default; nada de documentos reales |
| MVP-14 | Convenio, invitación y OTP de Broker/Master | Funcionan como antes, independientes de consentimiento prospecto |
| MVP-15 | Acceso a datos de otra red o tenant | Bloqueado |

## Ejecución y evidencia
- Obtener autorización de despliegue de SHA exacto a Staging separado; NO asumir que Staging conectado a main contiene el cambio nuevo.
- Usar únicamente credenciales sintéticas por variables STAGING_ADMIN_*, STAGING_MB_* y STAGING_BRK_*; no usar defaults ni cuentas personales.
- Confirmar correos de pruebas y rutas de Storage, no enviar documentos reales.
- Verificar flujo real en navegador y endpoints autenticados; los tests unitarios/PostgreSQL de Actions son condición necesaria pero no sustituyen E2E.
- Registrar PASS/FAIL, timestamps, role, SHA, IDs sintéticos y capturas. Entregar a ASTRA una auditoría independiente SOLO después del recorrido.
- NO GO por fallo de aislamiento, autorización, importes, condiciones de oferta, contacto comercial o exportaciones.
