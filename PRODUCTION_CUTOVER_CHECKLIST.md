# Crédito Negocios — Checklist de corte a Producción (MVP)


## Punto de control actualizado — 20 de octubre de 2026 (prelanzamiento)

**NO-GO comercial hasta pasar CI final y E2E autenticado de Staging.** Este apartado prevalece sobre estados históricos del 19-oct descritos más abajo. **Nada de lo siguiente autoriza cambios en Producción.**

- **Branch única / PR:** `integration/phase-1a1-base-segura`; PR #10 sigue **Draft**; `main` en `0c6b7bd18f6465c55d95f72a4f20ade339f1a553`. Candidato posterior a `a73ec6cf` incorpora reparación hipotecaria y pruebas de regresión a CI.
- **CI:** run [39459370880](https://github.com/frcb79/CreditoNegocios/actions/runs/39459370880) 7/8 y PostgreSQL CANCELLED. Se reintentó únicamente el job `118754966529`, pero un push posterior volvió a cancelar el workflow por `concurrency.cancel-in-progress: true`. **No fue evidencia de fallo SQL**. Exigir SUCCESS 8/8 del SHA **final** tras la última actualización documental.
- **Hipotecario Vivienda:** helper anterior elegía erróneamente una plantilla genérica `category=hipotecario` como vivienda y podía crear una séptima plantilla. Corregido: selector determina explícitamente familia activa configurada para vivienda o plantilla legado `Hipotecario Vivienda`; no autogenera variantes, y guarda `mortgageData.segmento_hipotecario='vivienda'`. Test unitario dedicado (4 casos) añadido al gate de CI. El motor de matching todavía debe respetar criterios concretos de versiones publicadas; nunca inferir vivienda=empresarial sólo por familia.
- **Migraciones productivas: RESUELTAS.** `0004_broker_network_transitions.sql` aplicada y verificada en Producción (dos atribuciones, FKs, índices, inmutabilidad). `0007_product_families_consolidation_mvp.sql` ya aplicada en Producción: 6 familias activas (Simple, Revolvente, Arrendamiento, Hipotecario, Factoraje, Anticipo TPV), 6 históricas inactivas y 10 variables definidas. **NO ejecutar de nuevo** 0004 ni 0007 en Producción.
- **DB Producción (reconsulta solo lectura 20-oct):** `credits=0, credit_submission_requests=0, clients=0, users=1, tenants=4, sessions=2, product_templates=6 activas + 6 archivadas`. Preservar usuario Super Admin, catálogos, ofertas legales versionadas, financieras y configuración.
- **Tres P1 de ASTRA:** importaciones económicas legacy bloqueadas, protección CSRF implementada; 0004 Prod ejecutada. Cambios de código de import/CSRF desplegados en Staging para `8977919c`; la consolidación de UI y fix hipotecario nuevo **NO están desplegados**.
- **Staging Railway:** service `CreditoNegocios` toma rama `integration/phase-1a1-base-segura` pero está **fijado** en `commitSha=8977919c...` (último deployment `3cdb793e-ed80-4da2-a663-4ffaa08a2786`, SUCCESS). Requiere GO de CI y autorización específica para desplegar el SHA final a Staging.
- **Producción Railway:** service `CreditoNegocios` apunta a repo sin `branch` explícita y sin `commitSha` fijado; última versión `8d6b6194-482f-447d-8427-deca2f1a60c0` SUCCESS. **Tratar merge a main como posible autodeploy** hasta confirmar configuración de integración GitHub/Railway; autorizar merge, limpieza y deploy por separado.
- **Pruebas todavía obligatorias (no sustituibles por CI):** E2E autenticado en navegador frontend autorizado para CSRF, rol/tenant, solicitud/matching/oferta/versiones/comisiones, cupones/OTP, import clientes y rechazo import económico; PDF sintético upload/download en bucket aislado Staging y negación cross-user; revisar logs 5xx y salud del SHA final.
- **Storage Prod:** 13 PDF identificados por Dirección como archivos **de prueba**, no son plantillas. Únicamente después de autorización para la limpieza: borrar objetos mediante API de Storage, nunca `DELETE FROM storage.objects`. Verificar referencias y reconciliar inventario; no eliminar financieras ni productos. Evaluar 3 tenants de prueba, invalidar 2 sesiones en corte; preservar Super Admin y configuración.
- **Rollback:** documentar deployment previo utilizable, versiones de BD compatibles, y congelación temporal. No revertir `0004`/`0007` ni eliminar registros históricos para regresar la aplicación a un commit anterior.
- **Salida comercial:** tras GO técnico y permisos de corte, validación productiva postdeploy y posterior autorización expresa, enviar invitaciones a **4 Master Brokers + 40 Brokers**. Sin invitaciones anticipadas.


**Corte verificado: 19 de octubre de 2026. Estado: NO-GO Producción hasta cerrar P1 y cutover.** Este documento es un plan de verificación; **NO autoriza** modificación de bases de datos, secretos, permisos, envíos, merge, despliegue ni limpieza. Los datos actuales son de prueba, pero deben respaldarse y revisarse antes de eliminarlos.

## 0. Evidencia comprobada y decisiones

- **Única rama:** `integration/phase-1a1-base-segura`. PR [#10](https://github.com/frcb79/CreditoNegocios/pull/10) sigue **Draft**, dirigido a `main`, que permanecía en `0c6b7bd18f6465c55d95f72a4f20ade339f1a553`.
- **Versión aún desplegada en Staging:** `b8864a5f2082c38dcc4b98fdffbacd8bc679f857`. GitHub Actions [39335292150](https://github.com/frcb79/CreditoNegocios/actions/runs/39335292150): **SUCCESS 8/8**. Railway deployment `cae9a1ca-d871-46a0-86eb-f1900009b7b5`: **SUCCESS**, healthcheck `/api/health` HTTP 200, online. **Nuevo candidato con dependencias corregidas pendiente de CI integral y despliegue de Staging**, requiere CI verde completo y aprobación específica de Staging.
- **Beneficios/cupones:** gestión manual Super Admin (asignar/extender/sustituir/revocar) + historial auditado y controles de destinatario corregidos. Dirección reportó pruebas funcionales satisfactorias; pruebas automatizadas PostgreSQL aprobadas. **Sin cobros** en el MVP.
- **Entornos:** el tráfico DNS de Railway en **Staging** resolvió `postgres.railway.internal` y en **Producción** resolvió `aws-1-us-east-2.pooler.supabase.com`: evidencia operativa de destinos DB diferentes. Las variables `DATABASE_URL` y credenciales siguen enmascaradas por la conexión OAuth; no se expusieron valores secretos.
- **Storage Supabase:** proyectos diferentes, Staging `hmzpaoapwjkxpfkndbik` (bucket privado `staging-documents`) y Producción `lyoatuvvasnvneikvgvt` (bucket privado `documents`). Staging contiene 1 objeto y Producción 13 objetos al inventario. El código impide I/O en Staging si no valida proyecto, bucket y secreto de servicio, pero falta comprobación autenticada con credenciales **efectivas**; no usar documentos reales hasta entonces.
- **Railway Producción:** último deployment observado `8d6b6194-482f-447d-8427-deca2f1a60c0`, **sin cambios** durante este cierre. Confirmar que auto-deploy no se disparará al fusionar el PR.
- **Modelo MVP:** Broker/Master captura prospecto, CN hace matching y contacto interno, la financiera solicita directamente sus documentos. **LEG-10 diferido:** no exigir firma/OTP del prospecto para perfil y matching; el envío externo de documentos sigue protegido y no debe habilitarse mediante `CLIENT_CONSENT_RELEASE_APPROVED`.
- **Seguridad de dependencias:** auditoría inicial `npm audit --omit=dev`: 0 critical / 23 high / 11 moderate. En rama de integración ya se fijaron **SheetJS oficial `xlsx@0.20.3`** (tarball CDN con integridad en lockfile) y **`multer@2.4.0`**, más un refresh de dependencias transitivas compatible con semver, **sin `--force` ni cambios de contratos del `package.json`**. La prueba aislada confirmó **0 critical / 7 high / 5 moderate**, TypeScript, build y roundtrip Excel correctos. **Checkpoint con pruebas SQL compatibilizadas `bd6a11afc9bf154898ec5b45d01cabdb7ce9f8fb`: no existe aún evidencia de CI integral 8/8 ni se ha desplegado en Staging.** Incluye **Drizzle ORM `0.45.4`**, versión corregida de GHSA-gpj5-g38j-94v9; su prueba aislada de TypeScript, build y suites focales fue exitosa. Nueva auditoría: **0 critical / 6 high / 5 moderate**. Los seis HIGH restantes (`braces`, `chokidar`, `fast-glob`, `micromatch`, `tailwindcss`, `vite`) son predominantemente de la cadena de build y requieren análisis de alcance y aceptación explícita antes de GO.
- **Supabase Producción:** 37 tablas `public` con RLS habilitado y sin políticas (por defecto niega acceso a clientes no privilegiados, no equivale a exposición). Tres avisos `function_search_path_mutable` corresponden a funciones `SECURITY INVOKER` sin permisos EXECUTE para `anon/authenticated`; ajustar search_path con control de cambios, sin declararlo incidente externo. **Pendiente P1:** `supabase_admin` tiene ACL por defecto amplias para tablas/secuencias/funciones futuras; restringirlas antes de crear nuevas tablas expuestas al Data API.
- **Railway Postgres Staging:** dos alertas históricas de plataforma todavía visibles; sin nuevos errores de arranque el 19-oct y sin fallas 5xx en la ventana comprobada.

## Auditoría ASTRA del 19-oct-2026 — cierre de tres P1

**Dictamen sobre SHA `38b69d6a`: NO-GO con exactamente tres P1 demostrados y ningún P0 adicional.** No confundir CI/health verdes con cierre de los P1. Cambios correctivos SOLO en `integration/phase-1a1-base-segura`, posteriores a ese SHA:

1. **P1 importaciones económicas — mitigación MVP en código, requiere CI + E2E.** Las rutas `POST /api/import/commissions`, `POST /api/import/financieras` y `POST /api/import/financieras-soc` se bloquean con HTTP 409/código `OFFER_VERSIONED_IMPORT_REQUIRED` ANTES de recibir/parsing de Excel. Igual bloqueo en `GET /api/import/template/:type` y `POST /api/import/preview/:type` para `financieras`, `commissions` y `comisiones`. No abrirlas temporalmente ni siquiera a Super Admin: usar editor de borrador→publicación de ofertas con versión y permisos canónicos. El import de **clientes** se conserva. Rehabilitación futura requiere validaciones, transacción, permisos, versionado, pruebas y nueva decisión aprobada.
2. **P1 CSRF — mitigación en código, requiere CI + E2E.** CORS ahora acepta sólo orígenes exactos configurados, sin coincidencias por substring, comodines `*.vercel.app` ni dominios similares. Middleware instalado ANTES de CORS/body parser/rutas rechaza mutaciones `POST/PUT/PATCH/DELETE` (HTML form, JSON y multipart) con `Origin` desconocido, y rechaza sesión `connect.sid` sin `Origin`. Preflight `OPTIONS` con origen ajeno también falla. Frontends oficiales y API de máquina **sin cookies** siguen funcionando. La cookie SameSite=None se conserva para frontends cross-site aprobados; comprobar en navegador real registro, login, OTP, convenios, upload y ofertas, además de rechazos 403 sin cambiar datos.
3. **P1 migración de Producción — PREPARADA, NO EJECUTADA, sigue bloqueando corte.** Verificado vía SQL de solo lectura (19-oct): `credits` = **0**, `credit_submission_requests` = **0**, NO existen `credits.origin_master_broker_id`, `credit_submission_requests.origin_master_broker_id` ni `origin_attribution_reviews`; sí existe `app_migrations` y la tabla `commercial_opportunities`. `0004_origin_attribution_reviewed_v1` no aparece en `app_migrations`. La migración existente `migrations/0004_broker_network_transitions.sql` incluye las dos columnas, FKs, índices, triggers de inmutabilidad y revisión histórica; su guardia de conciliación debe permanecer activa. **Secuencia obligatoria bajo autorización separada:** tomar respaldo `pg_dump` restaurable y objetos privados; restaurar en copia aislada; inspeccionar dependencias, verificar conteos actuales 0/0 y preflight; ejecutar transacción completa `0004` sobre Producción autorizada antes de desplegar; verificar columnas, índices, constraints, triggers y registro `0004_origin_attribution_reviewed_v1`, y health/schema del candidato sin errores 503. Si surge cualquier registro legado no revisado, ABORTAR: no inferir Master por afiliación actual.
   
**Seguridad residual:** ASTRA clasificó las seis alertas altas de `braces/chokidar/micromatch/fast-glob/tailwindcss/vite` como herramientas de build/development sin entrada Broker demostrada; documentar/aceptar alcance antes de GO, no forzar actualizaciones mayores. La prueba real de Storage con credenciales efectivas, backup/rollback y control de auto-deploy siguen como puertas de corte.

**Condición de lanzamiento:** obtener CI completo sobre el nuevo SHA + Staging autorizado y E2E focal; completar respaldos y migración/limpieza de Producción con permisos independientes; no ejecutar invitaciones ni merge por inferencia.

## Consolidación de catálogo aprobada — 20-oct-2026

- **Migración ejecutada en Supabase Producción**: `product_families_consolidation_mvp_20261020`, procedente de `migrations/0007_product_families_consolidation_mvp.sql` de esta rama. Supabase devolvió éxito y los checks posteriores confirmaron **6 plantillas activas**, **6 variantes inactivas conservadas**, **10 definiciones de variables** (3 anteriores + 7 nuevas), 0 ofertas y 0 créditos. Es independiente de la migración 0004, también ejecutada y verificada previamente.
- **Familias activas**: Crédito Simple, Crédito Revolvente, Arrendamiento, Hipotecario, Factoraje y Anticipo de Ventas (TPV). TPV como producto de anticipo se mantiene **distinto** de un crédito simple respaldado por flujos TPV.
- **Conservación**: IDs y nombres originales de seis variantes históricas permanecen en registros `is_active=false`, con referencia a su familia; no hay DELETE, cambios de relaciones ni documentos. La API de asignación de oferta debe rechazar plantillas inactivas; los selectores las filtran y el catálogo administrativo ofrece opción de visualizar histórico.
- **Diferenciadores opcionales**: requiere_garantia, tipo_garantia, destino_financiamiento, modalidad_arrendamiento, tipo_activo_arrendado, segmento_hipotecario y usa_flujos_tpv. Los perfiles PM/PFAE/física se representan en `target_profiles`; **ningún campo extra se exige antes de presentar oferta**.
- **Importante**: registrar una dimensión en `product_variables`/metadata de plantilla **NO significa que el motor de matching ya la evalúe**. Cada financiera y cada versión publicada de su oferta deben definir condiciones, y sólo cotejarse con datos realmente capturados del cliente; sin datos, mantener información insuficiente. El segmento hipotecario vivienda no se equipara al empresarial.
- **Storage**: Dirección confirmó que los 13 PDF legados son de prueba; sus nombres y tipos (aval, estados de cuenta, ingresos, otros) acreditan que **NO** son plantillas de productos. No se eliminaron al consolidar el catálogo. Separar la depuración de archivos de la administración de plantillas.

## 1. Puertas de seguridad antes de declarar GO

| Gate | Evidencia requerida | Estado |
| --- | --- | --- |
| SHA y CI completos | 8/8 sobre candidato exacto | **PASS — 38b69d6a (anteriores)**; nuevo SHA con mitigaciones ASTRA **CI pendiente** |
| Despliegue técnico Staging | Commit, health, logs, sin 5xx | **PASS — 38b69d6a**; SHA de mitigaciones ASTRA **aún no desplegado** |
| Prueba visual cupones | Super Admin, Broker y Master de prueba; fechas e historial | **Reportada OK por Dirección** |
| Dependencias expuestas | SheetJS/Multer/Drizzle corregidos; ASTRA clasificó seis HIGH residuales de build; registrar aceptación | **PARCIAL: 0 críticas, 6 HIGH sin explotabilidad Broker demostrada** |
| DB real Staging ≠ Producción | DNS del proceso Railway Staging `postgres.railway.internal` y Railway Producción `aws-1-us-east-2.pooler.supabase.com` | **PASS: destinos efectivos separados por servicio y entorno; valores secretos redacted** |
| Storage real Staging ≠ Producción | Prueba autenticada con archivo sintético, endpoint/bucket/clave segregados; denegación cruzada | **PENDIENTE** |
| E2E MVP comercial/roles | Super Admin/Admin/Master/Broker, clientes, matching, ofertas, contactos, comisiones, auditar permisos ajenos | **PARCIAL: regresiones verdes; falta evidencia completa** |
| Secretos y correo OTP | Destinatarios, remitente, URLs, origen de secretos, límites; nunca mostrarlos | **PENDIENTE** |
| Supabase permisos por defecto | Política explícita para ACL futuros; no abrir Data API inadvertidamente | **PENDIENTE** |
| Backups/limpieza/rollback | Respaldo restaurado en copia + inventario autorizado | **PENDIENTE** |
| Auditoría independiente ASTRA | P1 import, CSRF y migración 0004 corregidos/ejecutados y revalidados | **NO-GO inicial ASTRA recibido; mitigaciones código pendientes CI; migración Prod no ejecutada** |

**Regla:** un resultado PASS de CI demuestra código y pruebas aisladas, no reemplaza prueba runtime ni análisis de vulnerabilidades. Ningún gate pendiente queda implícitamente aprobado por este documento.

## 2. Inventario previo a limpieza: Producción (solo lectura, 19-oct)

| Recurso | Registros/objetos observados | Tratamiento propuesto (requiere validación) |
| --- | ---: | --- |
| users | 1 | Conservar/certificar Super Admin legítimo; no borrar sin verificar bootstrap |
| tenants | 4 | Clasificar y eliminar solo tenants de prueba por relaciones y autorizaciones |
| sessions | 2 | Invalidación controlada al corte, tras respaldo y aviso de cierre de sesiones |
| clients / credits / commissions / documents | 0 / 0 / 0 / 0 | No hay registros en estas tablas al corte; no inventar limpieza |
| promo_codes / promo_redemptions | 0 / 0 | Preparar catálogo real posterior a aprobación |
| product_templates / product_variables | 12 / 3 | Clasificar prueba vs catálogo final; conservar sólo lo aprobado |
| legal_document_versions / legal_acceptances | 5 / 0 | **Preservar** documentos versionados y evidencias; no truncar |
| commercial_configurations | 1 | Validar configuración vigente y mantener trazabilidad |
| Storage `documents` | 13 objetos | Inventariar rutas, validar referencias, respaldar contenido antes de retirar cualquiera |

Estos recuentos son una fotografía, no autorización para depurar. Otras tablas/auditorías/llaves foráneas y datos de bootstrap deben inspeccionarse antes de la secuencia definitiva.

## 3. Procedimiento de preparación, aún NO ejecutado

1. **Respaldar** base PostgreSQL de Producción (`pg_dump` en formato restaurable y metadatos del esquema), objetos del bucket privado, configuración y catálogos. No exportar contraseñas a archivos compartidos; comprobar permisos y ubicación cifrada del respaldo.
2. **Ensayar restauración en copia aislada** con conteos y checksums de muestra; registrar hora, operador, consistencia y rollback ensayado. No usar la BD Staging actualmente utilizada para sustituir una copia.
3. **Inventariar dependencias FK y triggers** para ordenar cualquier eliminación selectiva; proteger documentos legales, aceptaciones históricas y auditoría. Nunca ejecutar `TRUNCATE ... CASCADE` general o `db:push` indiscriminado sobre Producción.
4. **Aprobar un plan de limpieza por tabla y objeto**, incluyendo cuentas, 4 tenants, 2 sesiones y 13 objetos Storage solo tras confirmar su naturaleza sintética y el respaldo. Ejecutarlo únicamente después de una autorización independiente de limpieza.
5. **Controlar configuración efectiva** de ambas apps sin revelar `DATABASE_URL`, token de servicio, secretos OTP, sesiones ni llaves. Probar una carga/descarga/borrado reversible de **documento sintético** en Staging, jamás en bucket de Producción.
6. **Confirmar auto-deploy y rollback de Railway**, incluyendo el SHA actual, rollback a deployment previo, migraciones compatibles y plan de congelación de cambios.
7. **Resolver alta y aceptación comercial** usando identidad sintética por cada rol; comprobar matching compatible/no compatible/info insuficiente, selección de producto, versión, propuesta, comisión y bitácora, sin transmisión externa de información del prospecto.
8. **ASTRA independiente** sobre SHA final, corregir P0/P1 que impidan lanzamiento, obtener CI y health verdes en el nuevo SHA.

## 4. Tres autorizaciones separadas para el corte

**A. Merge PR #10 a `main`**: solo tras GO técnico, permiso expreso y confirmación de que no dispara auto-deploy no deseado.

**B. Limpieza de Producción**: permiso expreso para procedimiento y alcance preciso después del respaldo restaurable. No se infiere del permiso de merge.

**C. Deploy a Producción**: permiso expreso para el SHA, entorno y momento de corte, independientemente de merge y limpieza. Activar invitaciones reales **después** de validar producción limpia y el flujo de alta.

## 5. Reversión y validación poscorte

- Si falla arranque, permisos, matching, historial económico, OTP, Storage o auditoría: detener incorporación de usuarios, conservar evidencia, hacer rollback del **código** a deployment conocido y revisar compatibilidad de migraciones antes de volver atrás datos.
- No borrar tablas ni evidencias para intentar reparar una versión. Los archivos de Producción no se mezclan con Staging.
- Confirmar endpoints `/api/health`, acceso correcto por roles, ausencia de datos sintéticos en el dominio público, catálogos finales, bitácoras y políticas de documentos.
- Ejecutar envíos a los 44 invitados (4 Master/40 Broker) solo cuando cupones de bienvenida, URLs, vigencia y transporte de correo hayan sido validados y autorizados.

**Estado final al 19-oct-2026: NO-GO Producción.** Está autorizado únicamente el trabajo técnico en rama de integración y Staging previamente acordado. El checklist por sí mismo no confiere más permisos.
