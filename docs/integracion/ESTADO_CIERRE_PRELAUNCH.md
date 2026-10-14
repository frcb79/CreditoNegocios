# Crédito Negocios — Estado operativo de cierre prelaunch

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
