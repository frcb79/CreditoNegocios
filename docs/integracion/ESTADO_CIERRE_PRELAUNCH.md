# Crédito Negocios — Estado operativo de cierre prelaunch

**Corte actualizado:** 13 de octubre de 2026. **Rama única:** `integration/phase-1a1-base-segura`. **PR:** [#10 Draft](https://github.com/frcb79/CreditoNegocios/pull/10). **Checkpoint certificado de CI:** `a4e42970b57cb162484fab2712b57a11ecf4661e`, [run 38508592693](https://github.com/frcb79/CreditoNegocios/actions/runs/38508592693): jobs `typescript-build-unit` y `postgres-migrations` SUCCESS. **Trabajo correctivo posterior:** hasta `27b9b5835f7e2df2a731d61e9c201ffb816fe6fc`, aún SIN CI certificado a la hora de esta actualización. **NO GO**, sin E2E Staging ni autorización para merge/despliegue.

## Actualización puntual — 13-oct-2026, verificación GPT-6

- GitHub PR #10 permanece abierto y Draft, base `main` en `0c6b7bd18f6465c55d95f72a4f20ade339f1a553`; HEAD comprobado antes de corrección `a4e42970`. Comparación entre `a4edbc1` y `a4e42970`: 22 commits adelante, ninguno detrás (no confundir con los nueve commits solicitados como revisión reciente).
- CI `38508592693` ambos jobs SUCCESS: TypeScript, build, suites unitarias seleccionadas; PostgreSQL 16 aislado para 0004/0005/0009, pago manual atómico, dispersión parcial, target ganador, publicación concurrente de ofertas, transacción de configuración comercial y tasas de red. **No cubre E2E real, datos históricos existentes ni infraestructura activa.**
- Hallazgo P0 de RBAC: PATCH y PUT `/api/notifications/:id/read` no restringían la mutación al usuario destinatario. Se corrigió en rutas, contrato, MemStorage y UPDATE atómico PostgreSQL por `id+userId`; regresión HTTP añadida a la suite existente. Se retiró la selección de destinatario financiero por correo hardcodeado y Admin genérico; sólo `super_admin` recibe notificación de comisión de plataforma. **Cambios pusheados, pendientes de CI del nuevo SHA y posterior E2E.**
- Segundo hallazgo RBAC P0 en rutas heredadas: Admin podía solicitar un cambio de rol `admin → super_admin` mediante PUT/PATCH de usuario, editar una cuenta Super Admin y actuar como Super Admin para estado operativo. Corregido en `server/routes.ts` (commit `ce4c58f`) y cubierto con casos HTTP negativos (commit `27b9b58`). **Verificar CI para el SHA final y regresión funcional con cuatro roles.**
- Diferencia histórica concreta: `CommissionAcceptanceDialog.tsx` legado exige aceptación por *financiera*; no existe en rama consolidada. Modelo actual tiene estado/historial/aceptación comercial global y de red por versión. **No restaurar el diálogo antiguo**: exige verificación aparte de cambios materiales por **oferta/version** y su exigibilidad antes de operar.
- **LEG-10 no certificado:** en `ClientForm.tsx`, `CreditRequestModal.tsx` y `MortgageLeadModal.tsx` no se encontró captura de consentimiento específico del **cliente** para tratamiento/compartición de información financiera y patrimonial. Las aceptaciones legales de los usuarios Broker/Master no lo reemplazan. Falta determinar texto aprobado, titular/representación, evento de aceptación y persistencia antes de operar con clientes reales.
- Dos implementaciones históricas de heartbeat/tiempo de uso siguen diferidas expresamente; **no** integrarlas. Sí siguen obligatorias las bitácoras transaccionales de operaciones y seguridad.
- Los contrastes con ramas divergentes muestran cambios antiguos de financiera, red, Super Admin y Legal que exigen evaluación por comportamiento y no merge masivo. No se declara aún prueba de equivalencia exhaustiva por rol y escenario.
- Bloqueos de GO vigentes: aislamiento Storage Staging/Prod, migraciones y bootstrap en BD nueva limpia (sujeto a autorización), configuración correo/OTP, E2E por cuatro roles, consentimiento LEG-10, aceptación material oferta/version y documentación de rollback. Ninguna BD o servicio fue alterado por estas revisiones.

## Acta anterior conservada íntegra (checkpoint histórico)

**Corte:** 13 de octubre de 2026. **Rama única:** `integration/phase-1a1-base-segura`. **PR:** [#10 Draft](https://github.com/frcb79/CreditoNegocios/pull/10). **Base de trabajo:** `fb56db2` (último CI en proceso al redactar esta acta). Este archivo no certifica GO ni autoriza merge/despliegue.

## Fuente de verdad
1. [Plan Maestro de Integración v1.1](./PLAN_MAESTRO_INTEGRACION.md) — decisiones y requisitos históricos, vigentes salvo cambio posterior explícito.
2. [Registro Maestro de Decisiones](./REGISTRO_MAESTRO_DECISIONES.md) — IDs SEG, RED, CLI, LEG, FIN, MAT, COM, PAG, OPE, ADM, AUD, MIG y QA para comprobación.
3. Este estado actual separa **existencia de código**, **CI** y **E2E**. No reemplaza decisiones aprobadas.

## Decisiones de despliegue e información (acordadas)
- **Todos los clientes, créditos, brokers, pagos, catálogos y documentos actuales son de prueba.** No migrar a Producción esos registros, ni borrar la información de prueba de los ambientes actuales.
- **Producción debe comenzar limpia**, en un proyecto Supabase Free nuevo e independiente (PostgreSQL + Storage privado), sujeto a disponibilidad de segundo proyecto gratuito; crear solo con permiso y verificación de coste $0. El Supabase actual y Railway PostgreSQL actual quedan para conservar ensayos de Staging.
- Luis prepara archivos de catálogo definitivos para nueva importación; Super Admin inicial se configura con correo y contraseña explícitos; primeros Brokers/Masters se invitarán una vez aprobada la puesta en marcha.
- Staging usa PostgreSQL Railway, Producción hoy usa PostgreSQL Supabase; **Supabase Storage sigue compartido hasta la separación futura**. Evitar cargas/ediciones/borrados de archivos sensibles en Staging hasta aislar Storage. No crear bases adicionales en Railway.
- Auto Deploy de Railway Producción deshabilitado; Staging sigue conectado a main. Ningún merge/deploy/migración/cambio de variables/limpieza sin autorización expresa.

## Código recuperado y comprobaciones
- Legal público, registro con dos evidencias atómicas, PDF de comprobante, formalización por OTP, controles de originación, reglas de red, convenios.
- Registro Broker con tenant propio/owner en la misma transacción; Master válido y afiliación histórica; invitaciones de Broker y Master con correo propio de bienvenida, usuario y token 24 h (sin contraseña enviada). Activación obliga contraseña de 12+ y dos confirmaciones legales registradas atómicamente.
- Red comercial, transiciones estructurales Super Admin, estados operativos y atribución histórica.
- INE, CSF y estado de cuenta en expediente Broker/Master; carga, sustitución, consulta y descarga con guardas de propiedad, invalidación de aprobación y gate documental para pago.
- Financiera/producto/oferta/versiones/M1–M3; Matching no debe usar criterios sin datos o sin verificación; producto/versión efectiva publicada.
- Confirmaciones manuales de dispersión, cálculos/snapshots de comisiones, pagos al beneficiario histórico, CLABE y validación documental, bitácoras comerciales y administrativas.
- **Último CI aprobado antes del corte:** `35f6385` [run 38493410317](https://github.com/frcb79/CreditoNegocios/actions/runs/38493410317), ambos jobs SUCCESS. **Nuevo CI de pruebas HTTP de registro:** `fb56db2` [run 38505395878](https://github.com/frcb79/CreditoNegocios/actions/runs/38505395878), validar resultado antes de marcar verde.

## Excepciones históricas identificadas: NO copiar ciegamente
- Dos versiones divergentes de bitácora **avanzada de uso/heartbeat** (branches `chatgpt/bloque-3-1-user-activity` y `feat/bloque-3-1-user-activity`): **diferidas** expresamente por Plan §4.8. Sí es obligatorio certificar auditoría de eventos de seguridad/operación/dinero.
- Antiguo `CommissionAcceptanceDialog` y endpoints `/api/broker/commission-acceptances` por institución: el modelo actual utiliza aceptación legal versionada **global/de red**. **No son equivalentes**; comprobar cobertura de cambios por oferta/version, destinatarios, efectos del gate y preservación económica antes del GO. Reintroducir el diálogo antiguo sin el modelo actual podría exponer tasas de institución o duplicar aceptaciones.
- Pruebas antiguas que simulaban ejecución de STP como pago real **no se restauran**: la regla vigente impide marcar `paid` por simulación; liquidación real manual auditada por Super Admin.
- Pruebas M2/M3 recuperadas selectivamente en `tests/unit/m2-m3-matching-regression.test.ts`; registro HTTP recuperado en `prelaunch-registration-http.test.ts`. Las rutas legadas no equivalentes se revisarán contra reglas actuales.

## Bloqueantes antes de GO
1. CI completo **verde para SHA final**, más pruebas P0/P1 no cubiertas inicialmente. Confirmar todos los cambios de interfaces y APIs con E2E Staging.
2. QA de permisos: Super Admin/Admin/Master/Broker, aislamiento `tenantId`, acceso por URL/API a financieras, crédito, datos de terceros, exportaciones, comisiones y documentos sensibles.
3. E2E de invitación de prueba → correo recibido → contraseña segura → Términos/Aviso/versiones/hashes → convenio/OTP/Reglas según rol → originación → carga de expediente → aprobación documental.
4. Comisiones/ofertas: cambio material por oferta/version y aceptación correcta; snapshots inmutables, origen histórico y pago al Master o Broker Directo; no simular STP como liquidación.
5. Verificar consentimiento específico del **cliente** para consulta/compartición de información financiera y patrimonial (LEG-10); no confundir con aceptación de Broker. Legal debe confirmar redacción y momento de captura antes de usar datos reales.
6. Verificar respaldo, migraciones sobre PostgreSQL **vacío** y **con datos históricos**, ausencia de seeds ficticios y bootstrap explícito de Super Admin sin usuarios por defecto.
7. Aislar Storage, preparar nuevo Supabase Producción y prueba de corte con rollback. Confirmar correo y `FORMALIZATION_OTP_SECRET` en Producción sólo durante configuración autorizada.
8. Revisión independiente focal, checklist final de GO/NO-GO, autorización para merge `main`, y por separado autorización de despliegue.

## Política de ejecución
No agregar funciones fuera del alcance histórico aprobado. No crear más ramas; mantener todo recuperado en la rama única. No asumir que archivo presente o CI unitario significa que el flujo está validado en Staging. Mantener visible el presupuesto antes de crear infraestructura. No compartir secretos.

## Verificación focal de bitácora inicial — 14-oct-2026
- **Incorporada como fuentes operativas separadas, NO como bitácora universal**: `commercial_audit_logs` (incluye cambios directos de estado de usuario, transición de red y trazas comerciales); `commercial_config_audit_logs` (reglas), `commission_audit_logs` (operaciones económicas), solicitudes de estado y evidencias legales versionadas. La pantalla `SuperAdminAudit.tsx` expone sólo gobernanza comercial, configuración y solicitudes; no unifica comisiones, expedientes, créditos ni eventos de autenticación.
- Evidencia de código: `DbStorage.updateUserOperationalStatus` cambia usuario e inserta auditoría en la **misma transacción** (actor, antes/después, motivo); `server/routes.ts` ofrece `/api/commercial/audit-logs`, `/api/admin/commercial-config/audit` y `/api/commissions/:id/audit-logs` con controles por rol/recurso. Revisión de existencia de código, **no E2E ni dictamen de cobertura integral de eventos**.
- Regresión HTTP añadida en `tests/unit/prelaunch-registration-http.test.ts`: suspensión auditada y comprobación de usuario, estado previo/nuevo/motivo; Broker y Master reciben 403 al consultar auditorías globales. En entorno `MemStorage` el servicio de oportunidades usa un mock separado: la prueba comprueba el evento en el almacenamiento canónico y prueba acceso a los endpoints; la igualdad lectura/escritura de la consulta en PostgreSQL sigue pendiente de Staging.
- **No recuperar** ninguna de las dos implementaciones divergentes de sesiones/heartbeat/tiempo de uso. Pendiente: matriz de cobertura de eventos sensibles de seguridad, documento, crédito y dinero; completar sólo brechas verificadas en bitácoras existentes.
- Nuevo cierre P0 en esta continuación: `POST /api/users` rechaza permisos de usuario declarados por Admin/Master, impidiendo asignación arbitraria de módulos/acciones al crear identidades. Regresión HTTP agregada. **Último código `5913e083`: CI pendiente de consulta y E2E no ejecutado.** No se cambió `main` ni infraestructura.

## Control focal COM-28 — tipo de aceptación oferta/version (14-oct-2026)
- Contraste código: `commercialTermsService.ts` administra únicamente versiones `global` y `network`; no acredita una aceptación específica por `institutionProductId + versionNumber` cuando una oferta publicada cambia comisiones. El antiguo `CommissionAcceptanceDialog` por financiera tampoco satisface este requisito. **COM-28 sigue abierto para GO**, sujeto a diseño compatible y aceptación material aprobada; no recuperar diálogo legado por copia.
- Se corrigió un defecto de integridad inmediato: `POST /api/commercial-terms/accept` antes resolvía cualquier `type` distinto de network como `global`, incluso `type: offer`. Ahora devuelve `400 UNSUPPORTED_COMMERCIAL_ACCEPTANCE_TYPE` ante instrumentos desconocidos o contradictorios y no registra una evidencia falsa de aceptación. Regresión negativa HTTP en `prelaunch-registration-http.test.ts`.
- La restricción anterior **no implementa** la aceptación por oferta/version ni certifica cambios materiales. Es un guardrail para no generar pruebas jurídicas equivocadas. Último código de este bloque `1a7821e`; CI del SHA resultante por verificar.
