# Crédito Negocios — Plan Maestro de Integración v1.1

**Fecha de corte:** 9 de octubre de 2026  
**Repositorio:** frcb79/CreditoNegocios  
**Estado:** Revisión cruzada de ambas conversaciones concluida; lista la Fase 0 de auditoría técnica de AG (sólo lectura).  
**Rama documental:** docs/plan-maestro-integracion-v1-1 (derivada de main, sin cambios de aplicación).  
**Responsable de ejecución técnica futura:** Antigravity (AG).  
**Autorizaciones:** NO autoriza merges, rebase, cherry-pick, migraciones, cambios de código ni despliegue.

> **Fuente única de referencia para la integración.** Las conversaciones financieras y de Super Admin/Legal revisan el mismo documento. AG verifica el código y ejecuta únicamente pasos aprobados. Esta versión integra las seis precisiones financieras y cuatro escenarios de prueba aportados tras la revisión de v1.0.

## 1. Objetivo y alcance

Consolidar la base segura actual con los desarrollos pendientes de Legal, formalización y OTP por correo, redes de brokers y movimientos de afiliación, comisiones, Financieras, Productos, Ofertas versionadas, Matching y Super Admin, sin perder reglas de negocio, seguridad ni datos históricos.

**Fuera del alcance inmediato:** monetización/cobro por registro, reinvención del onboarding, rankings comerciales de financieras y una bitácora integral duplicada. La actividad de usuarios se trata como un bloque independiente salvo dependencia realmente bloqueante confirmada por AG.

**Principio de lanzamiento:** distinguir entre (a) bloqueante de seguridad/integridad, (b) condición funcional indispensable para el flujo a lanzar y (c) mejora que puede esperar. No convertir automáticamente todos los desarrollos existentes en dependencias obligatorias del primer despliegue.

## 2. Estado de ramas y dependencias (fotografía; verificar de nuevo antes de ejecutar)

| Rama / grupo | Propósito | Observación al 9-oct-2026 |
|---|---|---|
| main | Base protegida de producción | Railway producción observado en 0c6b7bd; cotejar SHA de GitHub y despliegue al iniciar Fase 0 |
| integration/network-formalization | Legal + convenios + red | 80 ahead / 3 behind frente a main |
| fix/p0-security-hardening-commissions-gate | Fortalecimiento P0 sobre integración de red | 5 commits encima de integration/network-formalization; 85 ahead / 3 behind main |
| feat/super-admin-settings-focus-chatgpt | Mejoras de Super Admin; PR #7 en borrador | 15 commits propios encima de fix/p0-security-hardening-commissions-gate; no integrar los 100 commits como un bloque adicional |
| feat/admin-financieras-ofertas-b1 | A1, B1–B3, M1–M3 | 20 ahead / 0 behind frente a main; trabajo financiero paralelo |
| feat/institution-offers-versioning-a1 | Base versionado ofertas | Contenido en la cadena financiera B1: 11 commits adicionales en B1 |
| chatgpt/bloque-3-1-user-activity | Alternativa A: auditoría de actividad | Implementación no integrada, divergente |
| feat/bloque-3-1-user-activity | Alternativa B: auditoría de actividad | Implementación no integrada, divergente; no aplicar las dos migraciones |

**Advertencia:** ahead/behind no equivale a cantidad de cambios inéditos. Las ramas tienen historia acumulada. La simulación de integración debe revisar el contenido real, no elegir automáticamente “ours/theirs”.

**Archivos compartidos de alta sensibilidad:** shared/schema.ts, server/autoMigrate.ts, server/dbStorage.ts, server/storage.ts, server/routes.ts, client/src/pages/FinancieraDetail.tsx, documentación AI-Team-OS. Ramas de actividad agregan además colisiones con server/auth.ts, client/src/App.tsx y UserManagement.tsx.

## 3. Principios no negociables

1. Conservar los hotfixes de seguridad y arranque de main; no restaurar rutas alternativas de autenticación, contraseñas por defecto ni mutaciones destructivas automáticas.
2. tenantId delimita propiedad/aislamiento; brokerId identifica originación; createdBy/uploadedBy y actor de cambio son trazabilidad; canOriginate es capacidad operativa, NO sustituto de RBAC.
3. Cambios de red/rol/estado nunca reasignan retroactivamente créditos, oportunidades, expedientes o derechos económicos ya definidos.
4. Reutilizar lo construido sin duplicar pantallas, endpoints, esquemas, migraciones, bitácoras ni consentimientos.
5. En frontend y backend debe aplicarse la misma matriz de autorización. Ocultar opciones visuales no sustituye controles de API.
6. Las ofertas publicadas son versionadas e inmutables; sus condiciones pasadas se conservan aun si el catálogo actual cambia.
7. Matching objetivo y explicable, sin favorecer financieras por comisiones, márgenes o rankings internos.
8. Aceptaciones y comprobantes legales consultables por el usuario en su perfil, conservados por el sistema.
9. Sólo AG modifica código de integración, bajo prompts pequeños, alcances revisados y autorización previa.
10. Separar aprobación de rama integrada, incorporación a main, migraciones de producción y despliegue a producción.

## 4. Reglas comerciales y funcionales definitivas o por confirmar

### 4.1 Legal, acceso y formalización

- Registro inicial: aceptar Términos y reconocer Aviso de Privacidad. No exigir aceptación de convenios operativos antes de entrar.
- Una vez dentro, mostrar avisos de formalización y permitir consultar/aceptar documentos; OTP de aceptación **por correo electrónico**, con versión, fecha/hora, identidad, evidencia técnica (incluida IP cuando esté disponible), hash y conservación del documento aceptado.
- No bloquear el uso general por falta de convenios; sí bloquear operaciones que requieren estar formalizado, especialmente originación propia o delegada.
- Cuando un colaborador origina por cuenta de un broker, validar al **broker originador efectivo**, no sólo a quien captura.
- Determinar qué consentimientos específicos de información financiera/patrimonial son imprescindibles antes de recolectarla. No asumir que un proveedor de NOM-151 está integrado.

### 4.2 Redes de brokers y atribución

- **Sólo Super Admin:** mover Broker entre Masters, mover a plataforma/directo, promover Broker a Master y reactivar cuando proceda.
- **Master Broker:** puede suspender o desactivar integrantes de su propia red conforme a reglas; no reactivar por su cuenta.
- Cambiar la afiliación aplica al negocio futuro bajo reglas de corte definidas; oportunidades/creditos y comisiones previas retienen identidad y beneficiarios históricos.
- Proteger oportunidades específicas (cliente + necesidad/producto), no apropiación absoluta de un cliente; preservar la regla comercial de reserva aplicable y trazabilidad de disputas.
- Revisar las reglas de visibilidad antes/después de un movimiento, sin abrir información de tenants ajenos.

### 4.3 Catálogo canónico y ofertas versionadas

- **Categoría/producto canónico** (ej. Crédito Simple) distinto del **nombre comercial propio** de la oferta de cada financiera (ej. Simple Negocios).
- Una financiera puede tener varias ofertas/productos con montos, plazos, requisitos, vigencias y comisiones diferentes.
- Nuevas versiones empiezan en draft y requieren un control de calidad antes de published; editar una publicada exige **nueva versión**, nunca mutar la versión usada por operaciones pasadas.
- No evaluar en Matching ofertas en draft, archived, superseded, inactivas o fuera de vigencia. Mantener compatibilidad de catálogo y referencias de ofertas legacy sin borrar datos.

### 4.4 Comisiones: reglas P0 de integridad económica

**Fuente de verdad:** condiciones económicas de la **oferta y versión específica** aplicables a la operación, no porcentajes globales de la financiera.

1. **Momento exacto de congelamiento:** la simulación/oferta orientativa inicial NO congela tasas definitivas. Se deben inmovilizar oferta, versión, tasas, broker originador, Master beneficiario (si aplica), afiliación histórica y fecha al **consolidar/confirmar formalmente la propuesta comercial aplicable**, según el paso autorizado en el flujo. Confirmar con AG el evento técnico único; a partir de ese evento, aprobación, dispersión y liquidación deben leer el registro congelado.
2. **Canales independientes:** la comisión del Broker Directo y la del Master Broker son tasas separadas; cada una debe respetar el techo que paga la financiera, pero **no** imponer por defecto una regla artificial Broker Directo ≤ Master Broker. La distribución del Master con brokers de su red constituye un acuerdo/configuración interna distinta.
3. **Sin fallback silencioso:** no usar comisiones generales de financiera o comisiones actuales de la red para reemplazar un dato específico faltante; tampoco suponer 0 como si fuera tasa aprobada. Estado correcto: **pendiente de revisión** y bloquear únicamente cálculo/pago no confiable según el flujo definido, con trazabilidad de la razón.
4. **Beneficiario histórico:** no usar el Master actual de un broker para pagar créditos atribuibles al Master anterior.
5. **Varias ofertas y dispersiones:** registrar aceptación, condiciones, versiones y liquidaciones independientes por propuesta/dispersión; impedir duplicados y no recalcular una oferta con tasas de otra.
6. **Sobretasas:** exclusivas de Super Admin, sin excepciones automáticas ni posibilidad de habilitarlas a Admin por permisos genéricos; restringidas tanto en frontend como en todas las respuestas de API. **Márgenes internos:** visibles para Super Admin y, cuando corresponda, para Admin sólo mediante autorización expresa y específica. Broker y Master Broker nunca reciben sobretasas ni márgenes internos.

**Decisión comercial pendiente antes de cerrar Fase 2:** mecanismo de aceptación. Propuesta: convenio marco + condiciones comerciales versionadas + aceptación explícita al existir un cambio material que afecte derechos económicos. NO exigir OTP por cada producto ni por cada solicitud por defecto. Debe poder demostrarse qué versión conoció/aceptó cada participante.

**Inspección obligatoria de legado:** conciliación entre brokerCommissionAcceptances por financiera y aceptación/comisión específica de oferta; revisar CommissionAcceptanceDialog y createCascadingCommissionRecord, incluida su selección de tasas y distribución de red.

### 4.5 Matching

- Sólo comparar condiciones de la versión vigente/publicada contra datos del cliente y solicitud realmente capturados.
- **Verificación positiva:** ausencia de marca negativa NO equivale a origen probado. Falta de evidencia/dato deja criterio en pendiente/no evaluable.
- Una oferta sin criterios evaluables NO se clasifica compatible por omisión. Diferenciar compatible, no compatible e información insuficiente, sin aprobación crediticia automática.
- Las condiciones administrables por oferta deben mapearse a fuentes verificables sin hardcodear nuevas reglas por cada financiera.
- El motor actual de ocho criterios es un MVP: AG debe identificar cuáles son evaluables de forma genuina y las limitaciones antes de considerarlo completo.
- Probar flujos sobre credits **y** credit_submission_requests, incluidos accesos multi-tenant, solicitud sin crédito registrado, datos parciales y neutralidad (sin rankings económicos).

### 4.6 Matriz de roles (verificar y cerrar antes de integrar)

| Rol | Alcance esperado |
|---|---|
| Super Admin | Catálogo financiero administrativo completo, condiciones comerciales, márgenes, sobretasas, redes, formalización, auditorías y operaciones globales |
| Admin | Módulos y acciones expresamente autorizadas; márgenes internos sólo con autorización específica; **nunca sobretasas** |
| Master Broker | Su red, operaciones, comisiones y condiciones que le corresponden; productos generales/ofertas autorizadas, sin catálogo administrativo de financieras ni márgenes |
| Broker | Sus operaciones y productos/ofertas autorizadas, sin catálogo administrativo de financieras ni márgenes internos |

**Comprobación crítica:** ProtectedRoute.tsx, Sidebar.tsx, backend financieras/productos, matching, respuestas de API, consultas por URL, descargas y componentes de aceptación comercial. Distinguir mostrar una institución en el contexto de una oferta autorizada de permitir consultar el catálogo administrativo completo.

### 4.7 Super Admin y auditoría

- Integrar sólo los **15 commits propios** del PR #7 que falten una vez consolidada la base Red+P0; no volver a fusionar las cadenas históricas completas.
- Preservar las pantallas existentes (Usuarios, Organización, Beneficios, Negocio, Perfilamiento, Documentos, Seguridad, Reglas Comerciales).
- Recuperar navegación, enlaces de códigos/solicitudes, ficha de broker/Master, historial de cambios de afiliación y Auditoría Administrativa sólo lectura.
- Reconocer que la Auditoría Administrativa consulta fuentes ya disponibles; **no** equivale a una bitácora completa de actividad ni contiene todos los eventos financieros.
- Mantener hoy registro gratuito; códigos promocionales y anti-reuso/concurrencia se auditan al preparar monetización, no como parte de este lanzamiento.

### 4.8 Bitácora integral de actividad

- Elegir **una** implementación entre chatgpt/bloque-3-1-user-activity y feat/bloque-3-1-user-activity.
- Ambas definen user_activity_sessions / user_activity_events, con estructuras y rutas diferentes: prohibido aplicar ambas migraciones por acumulación.
- Al seleccionarla, validar alcance tenant/red, protección de eventos sensibles, retención, carga operativa y pruebas.
- **Posponer integración al lanzamiento**, salvo hallazgo técnico que la haga imprescindible.

## 5. Orden de integración propuesto (sin autorización de ejecución)

### Fase 0 — Auditoría técnica exclusivamente de lectura

AG carga AI-Team-OS e inspecciona main/hotfixes, situación de workspace (sin descartes), ramas, commits ancestrales, migraciones, rutas y pruebas.

**Resultado:** informe corto de conflictos textuales **y semánticos**, dependencias, migraciones, pruebas disponibles/no ejecutadas, decisiones pendientes y orden final propuesto. No cambiar rama ni archivos, no commits, no staging/prod.

**Criterio de salida:** ambas conversaciones revisan el diagnóstico; se cierran las decisiones P0 de negocio antes de instruir código.

### Fase 1 — Base segura, Legal, formalización y Red Comercial

Crear posteriormente rama temporal **desde main seguro vigente**, con autorización explícita, conservando 100% de hotfixes reales de producción. Recuperar en orden las implementaciones no integradas de Legal/publicación, aceptaciones, convenios OTP, gate de originación, transición de red y pruebas P0, evitando repetir commits compartidos.

**Criterio de salida:** flujo de registro/login libre de convenio; formalización y originación propia/delegada seguras; cambios de red por Super Admin; datos/beneficiarios históricos no modificados; seguridad de arranque intacta; migraciones de red revisadas.

### Fase 2 — Financieras, Productos, Ofertas, Comisiones y Matching

Incorporar los desarrollos A1/B1–B3/M1–M3, conciliando shared/schema.ts, autoMigrate, storage, dbStorage, routes, FinancieraDetail y test suites.

**Orden interno:** (a) esquema y migraciones seguros; (b) ofertas/versiones y permisos; (c) modelo económico congelado y aceptación comercial; (d) Matching verificable; (e) experiencia de usuario coherente. NO declarar completa la fase sin cerrar modelo de comisiones.

**Criterio de salida:** diferentes comisiones por oferta, publicación/versiones inmutables, trazabilidad económica, sin fallback; matching explicado con datos verificables; API sin datos sensibles para roles no autorizados.

### Fase 3 — Super Admin

Aplicar sólo deltas de la rama feat/super-admin-settings-focus-chatgpt sobre la base consolidada; validar vistas, navegación, fichas e historial sin perder pantallas o permisos.

**Criterio de salida:** cuatro roles; cuentas con/sin historia; restricciones backend/frontend; operaciones existentes intactas.

### Fase 4 — QA integral y Staging

Pruebas TS/build/unitarias/integración/E2E, autenticación y permisos, PostgreSQL vacío y copia con datos históricos, versiones/rollback, expedientes, propuestas, pagos, comisiones, red y legal. Probar despliegue en **Staging** antes de solicitar autorización para main.

**Criterio de salida:** informe y evidencias de pruebas, matriz de bloqueantes cerrados, plan de backup/rollback, validación manual de flujos y autorización de integración separada del despliegue.

### Fase 5 — Trabajo independiente diferible

Bitácora integral de actividad, importación masiva avanzada, analítica avanzada y otros complementos. Sin duplicar esquema ni bloquear lanzamiento del MVP por capacidades no esenciales.

## 6. Pruebas obligatorias de aceptación

**Seguridad/RBAC:** Super Admin, Admin, Master y Broker; credenciales/sesiones seguras; acceso por menú/URL/API; consulta entre tenants; exportaciones y datos sensibles; garantizar que el hotfix P0 no se revierte.

**Legal:** registro y login sin convenio operativo previo, formalización dentro de la plataforma, OTP por email, versión/hash/evidencia y expediente del usuario; gate de originación propia y delegada, sin bypass por rutas legacy.

**Red Comercial:** Broker Master A→B, plataforma→Master, Master→plataforma, Broker→Master Broker; controles sólo Super Admin; Master sólo suspende su red; propuestas, créditos, comisiones y protección comercial históricas inalteradas.

**Productos/Ofertas:** categoría canónica vs nombre comercial; dos ofertas de una misma financiera con condiciones diferentes; draft/superseded/archived/inactivos/vigencia inválida excluidos del matching; publicación y edición crean versiones inmutables.

**Comisiones — cuatro escenarios P0/P1 especialmente relevantes:**
1. **Una financiera, dos productos:** comisiones distintas; cada operación toma la tasa/version exacta.
2. **Broker trasladado:** comisión histórica conserva Master y tasa originales; operación nueva usa afiliación correcta a la fecha de corte.
3. **Solicitud con varias ofertas:** versiones, propuestas, condiciones y dispersiones independientes, sin duplicar pagos o mezclar tasas.
4. **Datos faltantes/no verificados:** Matching no inventa datos, no genera falsos compatibles y no confunde compatibilidad preliminar con aprobación crediticia.

**Otros:** confirmar evento real de congelamiento económico; aceptación por cambio material; falta de tasas deja pago pendiente; sobretasas invisibles para todos salvo Super Admin (incluido Admin con permiso de márgenes); solicitud real credit_submission_requests (no sólo credits), sin aprobación automática ni sesgo por comisiones.

**Persistencia:** pruebas migratorias repetibles sobre BD nueva y copia protegida de datos existentes; invariantes, índices únicos y versiones, sin borrado histórico; respaldo verificable y recuperación probada antes de producción.

## 7. Alcance diferible y datos que sí deben preservarse

| Función | Decisión |
|---|---|
| Bitácora integral de uso | Diferir y elegir una sola implementación cuando se retome |
| Importación masiva avanzada | Diferir si el catálogo inicial puede cargarse/administrarse correctamente |
| Variables de Matching no capturadas o sin verificación | Diferir; jamás declararlas evaluadas |
| Rankings basados en interés económico | NO implementar |
| Analítica avanzada financiera/producto | Diferir visualizaciones, **pero conservar desde ahora** IDs/eventos para medir solicitudes, compatibilidades, ofertas, aprobaciones, aceptaciones y montos |
| Monetización/cobros/checkout | Diferir; acceso gratuito actual permitido; después auditar códigos de un solo uso y concurrencia |

## 8. Protocolo compartido de control y actualizaciones

**Este archivo es la única fuente de verdad del Plan Maestro.** No se mantienen dos documentos paralelos.

**Roles:**
- Conversación Super Admin/Legal: custodiar formalización, red, permisos, auditoría y preservación de funcionalidades; revisar cualquier cambio de reglas de negocio.
- Conversación Financiera/Matching: custodiar oferta/versiones, comisiones, aceptación, Matching, datos e informes; revisar cualquier cambio de esos módulos.
- Usuario: aprobar decisiones comerciales, prioridades y ejecución por bloques.
- AG: auditar/implementar técnicamente y reportar código/commits/tests, sin reinterpretar decisiones comerciales.

**Flujo de actualización:**
1. Identificar el punto exacto propuesto y su evidencia (rama/archivo/commit/resultado AG).
2. Compartir en ambos chats cuando afecte a los dos frentes; evitar editar en paralelo la misma sección.
3. Redactar cambio puntual, con fecha y razón, preservando el historial relevante.
4. Obtener validación funcional y, si implica código, autorización del usuario.
5. Actualizar **el mismo archivo** en esta rama documental o en la futura rama de integración coordinada. Registrar cambio en §9 y comunicar el commit/SHA.
6. Al retomar AG, indicar URL, rama y SHA correctos; primero revisar diferencias locales y hacer fetch/pull sólo con su consentimiento para no sobrescribir worktrees.

**Reglas:** documentos propuestos no autorizan acciones; no modificar main directamente; no incluir credenciales, datos personales sensibles ni resultados de pruebas no ejecutadas en este repositorio (que es público).

## 9. Registro de versiones, decisiones y pendientes

### v1.0 — 9-oct-2026
- Consolidación original de auditorías Legal/Red/Super Admin y Financieras/Matching.
- Etapas 0–5 y prohibición de integrar sin QA.

### v1.1 — 9-oct-2026
- Se incorporan seis precisiones financieras: momento de congelamiento económico, canales independientes, eliminar fallback silencioso, verificación positiva Matching, catálogo canónico/nombre de oferta e inmutabilidad de versión.
- Se agregan cuatro pruebas prioritarias: dos productos de una financiera, transferencia de Master, múltiples ofertas y datos incompletos.
- Se explicita la comprobación con credit_submission_requests, aceptación comercial versionada sin OTP por cada producto/solicitud y retención de datos para analítica futura.
- Se crea documento común versionado; no se ha ejecutado ninguna integración de código.
- Precisión final de revisión cruzada (9-oct-2026): **sobretasas sólo Super Admin, sin excepciones automáticas**; **márgenes internos sólo Super Admin y Admin autorizado expresamente**. Fase 0 queda lista para auditoría técnica de lectura.

**Decisiones abiertas para resolver con AG y ambos chats:**
- Evento técnico exacto de consolidación de propuesta y congelamiento económico por modalidad (incluida multidispersión).
- Modelo concreto de aceptación comercial versionada y transición de aceptación legacy por financiera.
- Matriz final detallada de visibilidad por rol en endpoints específicos y su UI.
- Qué variables del motor M1–M3 pueden verificarse efectivamente y qué hacer con condiciones no mapeadas.
- Orden concreto de migraciones y procedimiento de recuperación con base histórica.
- Selección futura de una sola bitácora de actividad.
- Estado real de cambios locales AG y ramas al iniciar la Fase 0.

## 10. Resultado de Fase 0A y próxima acción

### Fase 0A — inventario AG (9-oct-2026)

**Resultado: inventario realizado, NO validación de integración.** AG inspeccionó ramas en su workspace sin cambiar rama, editar código ni aplicar migraciones.

- Checkpoint reportado por AG: `feat/admin-financieras-ofertas-b1`, HEAD `cc6b15115d9a1f2170205fb8a40b683d9e6681c8`, archivos rastreados sin cambios pendientes.
- Preservar archivo local sin seguimiento `.github/workflows/postgres-migration-test.yml` y respaldos locales de bloques de convenios 3B1/3B2A; nunca hacer clean/reset o reemplazarlos automáticamente.
- Cadena técnica confirmada: `integration/network-formalization` → `fix/p0-security-hardening-commissions-gate` (+5 commits) → `feat/super-admin-settings-focus-chatgpt` (+15 commits propios); `feat/institution-offers-versioning-a1` incluida en `feat/admin-financieras-ofertas-b1`.
- AG identificó diez archivos tocados por los frentes financiero y red/P0: seis de código (`shared/schema.ts`, `server/autoMigrate.ts`, `server/routes.ts`, `server/dbStorage.ts`, `server/storage.ts`, `client/src/pages/FinancieraDetail.tsx`) y cuatro de AI-Team-OS. **Archivos comunes NO equivalen por sí solos a conflictos textuales confirmados.**
- Hotfix de producción: el test `tests/unit/prod-hotfix-security.test.ts` existe en `main` y B1, pero no en la rama de red/P0 consultada en GitHub. Preservar tanto estos hotfixes recientes de main como el endurecimiento distinto que aporta la rama P0.
- Migraciones `0004_broker_network_transitions.sql` (red) y `0005_institution_offers_versioning.sql` (financieras): AG informó que afectan conjuntos principales de tablas distintos. **No constituye prueba de ejecución, compatibilidad de `autoMigrate.ts`, idempotencia ni seguridad en datos reales.**
- Las dos implementaciones de bitácora `bloque-3-1-user-activity` no se integran por ahora.
- **No ejecutado:** simulación de conflictos y pruebas TS/build, PostgreSQL conjunto, E2E, validación en Staging.

### Próximos pasos

1. **Fase 0B (sólo lectura):** AG analiza los seis archivos de código compartidos y el orden de migraciones; identifica colisiones textuales/semánticas y protecciones P0 que deben prevalecer, sin modificar workspace.
2. Compartir el resultado 0B con ambas conversaciones, registrar hallazgos verificables y, si hace falta, realizar 0C de comisiones, permisos y Matching antes de implementar.
3. Sólo después de cerrar bloqueantes y obtener autorización explícita, crear rama aislada desde main seguro para iniciar Fase 1; no hay autorización de merge o despliegue.

**Todavía no** fusionar a main, migrar bases de datos, cambiar permisos en producción, ni desplegar.
