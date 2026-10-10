# Crédito Negocios — Plan Maestro de Integración v1.1

**Fecha de corte:** 9 de octubre de 2026  
**Repositorio:** frcb79/CreditoNegocios  
**Estado:** Auditorías 0A–0C concluidas y aceptadas; Fase 1A.1 cerrada con commit y push en rama aislada; Fase 1A.2A autorizada para ejecución controlada (pendiente reporte de AG).  
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
- Fase 0A y 0B: inventario de ramas y dry-run de conflictos técnicos reportados por AG; soluciones propuestas, **todavía no ejecutadas ni probadas**.
- Revisión cruzada de 0B: cinco precisiones del frente financiero registradas para 0C (aceptación versionada, congelamiento, Matching/verificación, visibilidad y pruebas migratorias con datos históricos).
- Fase 0C revisada por ambos frentes: se rechaza el límite de un ganador por solicitud, se distinguen tasas congeladas de importes por dispersión, y se documentan nueve salvaguardas P0/P1 y decisiones abiertas. No se autorizó código.

**Decisiones abiertas para resolver con AG y ambos chats:**
- Evento técnico exacto de consolidación de propuesta y congelamiento económico por modalidad (incluida multidispersión).
- Modelo concreto de aceptación comercial versionada y transición de aceptación legacy por financiera.
- Matriz final detallada de visibilidad por rol en endpoints específicos y su UI.
- Qué variables del motor M1–M3 pueden verificarse efectivamente y qué hacer con condiciones no mapeadas.
- Orden concreto de migraciones y procedimiento de recuperación con base histórica.
- Selección futura de una sola bitácora de actividad.
- Estado real de cambios locales AG y ramas al iniciar la Fase 0.

## 10. Resultados de Fases 0A y 0B y siguiente acción

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

### Fase 0B — análisis técnico AG (9-oct-2026)

**Resultado: auditoría semántica y dry-run de resolución de conflictos completados en modo de inspección. NO equivale a merge probado ni a aprobación de QA.** AG preservó la rama local `feat/admin-financieras-ofertas-b1` (`cc6b151`) y los archivos untracked/respaldo identificados en 0A.

**Matriz de resolución identificada (pendiente de implementar y probar):**

| Componente | Resultado de inspección de AG | Integración requerida |
|---|---|---|
| `server/autoMigrate.ts` | Conflicto textual y semántico P0 | Conservar arranque seguro/no destructivo de main + marcadores y triggers Red/P0 + catálogo legal + backfill de versionado B1; validar orden e idempotencia real |
| `server/routes.ts` | Conflicto textual en imports y cambios semánticos P0 | Combinar rate limiting + authMethod sólo después de contraseña válida + estado suspendido + gate de aprobaciones de comisiones + endpoints de ofertas/matching |
| `server/dbStorage.ts` | Conflictos en imports y en `createCredit` / `createCreditSubmissionRequest` | Preservar **ambas** validaciones: oferta publicada/vigente y linaje inmutable de originación, incluyendo originación delegada |
| `shared/schema.ts` | Dry-run sin conflicto textual significativo; discrepancia semántica comercial | Unificar esquema, conservando modelo financiero por versión y aceptación legacy por financiera **sin decidir aún que ésta acredita aceptación específica de oferta** |
| `server/storage.ts` | Conflictos de imports y propiedades de MemStorage | Conciliar métodos y colecciones; revisar contrato/asíncronía del constructor al implementar |
| `client/src/pages/FinancieraDetail.tsx` | Conflicto en imports de editor de ofertas y diálogo de aceptación | Retener las dos funcionalidades, pero **corregir interfaz de sobretasas y permisos de Broker/Master** antes de validación |
| Migraciones `0004` y `0005` | Conjuntos principales de tablas separados; numeración compatible en principio | Verificar sistema real de journal/marcadores, disparadores, dependencias, datos históricos e idempotencia mediante ejecución PostgreSQL posterior. `IF NOT EXISTS` no prueba equivalencia estructural |

**Protecciones identificadas:**
- De main: seguridad de bootstrap, ausencia de credenciales alternativas, actualización de authMethod después de validación de password y prohibición de cambios destructivos al iniciar.
- De P0 de Red: rate limiting, gate Super Admin de aprobación/dispersión de comisiones, suspensiones, OTP/legal y origen histórico inmutable.
- De B1: elegibilidad de versiones publicadas/vigentes y tasas Broker Directo/Master independientes.

**Precauciones:** la frase de AG "seguridad garantizada" sólo significa **riesgos identificados y resolución propuesta**, no pruebas superadas. Tampoco puede asumirse que únicamente existen tres intersecciones lógicas, ni que los modelos de aceptación por financiera y por oferta ya están conciliados. La compatibilidad de tablas y API sigue pendiente de pruebas reales.

### Revisión cruzada de Fase 0B — Frente Financiero (9-oct-2026)

**Dictamen:** 0B aceptada como diagnóstico técnico por ambas conversaciones; sus propuestas requieren validación funcional y pruebas antes de implementarse. La revisión financiera añadió cinco verificaciones obligatorias de 0C:

1. **P0 · Aceptación comercial:** `brokerCommissionAcceptances` por financiera no se considera automáticamente aceptación de condiciones económicas por **oferta y versión**. Auditar evidencia vigente, alcance de la aceptación y opción convenio marco + condiciones versionadas + consentimiento ante cambios materiales, sin OTP por producto/solicitud.
2. **P0 · Comisión congelada:** trazar código que aún pueda utilizar porcentajes generales de financiera o afiliación **actual** del broker. Identificar evento exacto de consolidación de propuesta, snapshot de tasas/beneficiario/versionado y su uso en dispersión; no aceptar fallbacks silenciosos.
3. **P1 · Matching:** investigar tres excepciones señaladas por revisión financiera: versiones con estado `active` utilizadas como elegibles (no asumir que equivalen a `published`), oferta sin criterios marcada compatible y origen tratado como verificado sin evidencia positiva. Distinguir hallazgo reportado de prueba ejecutada y definir regla para ofertas legacy.
4. **P0 · Visibilidad:** no restaurar tarjeta administrativa para brokers en `FinancieraDetail.tsx` sólo por conservar componentes. El flujo autorizado de aceptación debe separarse del catálogo administrativo; sobretasas exclusivas Super Admin; márgenes internos sólo Admin específicamente autorizado o Super Admin. Revisar API además del frontend.
5. **P0 · Migraciones:** disyunción de tablas no acredita idempotencia, backfill ni ausencia de pérdida de información. AG debe proponer pruebas futuras con `0004`, `0005`, `autoMigrate.ts`, `shared/schema.ts` y **copia protegida de PostgreSQL con datos históricos**.

**Verificación adicional requerida:** `credit_submission_requests` con expediente/cliente del tenant y broker realmente autorizados, incluso en originación delegada; sin cambiar atribución comercial histórica.

**Alcance de 0C:** sólo rastreo de código y propuesta de decisión/pruebas; no repetir mapa de los diez archivos ni declarar seguridad o matching validados sin ejecución.

### Fase 0C — auditoría comercial AG y revisión cruzada (9-oct-2026)

**Estado:** Auditoría estática 0C aceptada como diagnóstico por ambos frentes; soluciones de AG **no** aprobadas automáticamente. No existe rama consolidada ni QA de integración ejecutado.

**Hechos detectados en código B1 (revisados además en GitHub):**
- `createCascadingCommissionRecord` y `mark-dispersed` mantienen fallbacks de tasas de financiera y/o cero y usan `broker.masterBrokerId` vigente, en vez de snapshot de la versión comercial y beneficiario histórico.
- `GET /api/credit-submissions` usa la red de brokers actual; su enriquecimiento también consulta el Master actual. Deben separarse derechos históricos de comisión y permisos de consulta de expedientes.
- `select-winner` actualiza un target y crea un crédito sin una salvaguarda transaccional/idempotente demostrada ni una validación explícita del estado permitido. **Se permiten múltiples financiamientos legítimos por solicitud**: NO imponer la regla de un solo ganador por solicitud.
- Matching clasifica compatibles ofertas sin criterios evaluados, admite versiones `active` además de `published` y usa verificación por ausencia de marca negativa; esto requiere corrección/contrato de verificación.
- La revisión financiera reporta ausencia de vínculo explícito `credit_submission_target` → versión de oferta, y manejo de excepción de comisión con simple log tras `mark-dispersed`: verificar el esquema y la persistencia para diseñar la conciliación.

**Reglas a preservar para implementar tras aprobación:**
1. **Multiplicidad real:** una solicitud puede terminar en varios créditos de distintas financieras, por propuestas y montos efectivamente aceptados. La unicidad e idempotencia son **por propuesta/financiamiento**, no por solicitud. Vincular inequívocamente `request → target/propuesta → versión de oferta → crédito → dispersión → comisión`; usar transacciones/constraints ante concurrencia y evitar repetición por reintentos.
2. **Dos congelamientos:** fijar linaje originador/Master histórico cuando se origina la oportunidad o solicitud conforme a la regla comercial; congelar **tasas y condiciones económicas** cuando una propuesta económica formal esté confirmada y aceptada, **no** necesariamente al pulsar `select-winner` ni al dispersar. Para cambios materiales posteriores, nueva confirmación/versionado, sin reescribir acuerdos previos.
3. **Importe variable por dispersión:** las tasas acordadas/versionadas se mantienen inmutables; cada desembolso real genera su base e importe pagadero según condiciones congeladas, con controles contra sobregiro, repetición y pagos duplicados. No confundir `frozenAmount` final con tasa acordada.
4. **Condiciones para aceptar propuesta:** verificar estado autorizado del target, confirmación/aprobación económica requerida y usuario/tenant autorizado antes de crear crédito. No forzar el cierre de otros targets financiables. El evento técnico exacto y los estados de flujo se definirán tras inspección adicional y aprobación funcional.
5. **Fallo en cálculo de comisiones:** registrar la dispersión real cuando exista, pero dejar su comisión como **conciliación pendiente**, con motivo, alerta/auditoría y pago bloqueado hasta resolver. No sustituir por tasa de financiera o `0` ni fingir éxito.
6. **Visibilidad histórica limitada:** Master anterior conserva derechos y comprobantes históricos autorizados, **no** acceso indefinido a todo el expediente ni a información posterior del cliente. Aplicar RBAC, tenant y minimización de datos, tanto API como frontend.
7. **Matching preliminar vs. definitivo:** permitir usar datos capturados para orientación preliminar, etiquetando las variables no verificadas. Si una condición exige evidencia y ésta falta, no mostrar compatibilidad definitiva: `INSUFFICIENT_DATA`/pendiente. Regla de evidencia positiva por **criterio y tipo de fuente**, no sólo Buró/Facturación, sin imponer documentos innecesarios a cada campo.
8. **Versiones heredadas:** no convertir automáticamente `active` a `published`; primero auditar origen, aprobación y requisitos de publicación. Sólo versiones formalmente elegibles participan en el matching definitivo.
9. **Matching en solicitudes:** demostrar procesamiento real de `credit_submission_requests` con su cliente/tenant autorizado; no asumir que reutilizar controlador de `credits` resuelve ese caso.
10. **Aceptación comercial:** una aceptación por financiera es comprobante general y no acredita automáticamente oferta/versionado; definir convenio marco + condiciones versionadas + aceptación de cambios materiales, sin OTP por producto por defecto.

**Acceso a márgenes — decisión aún por ratificar:** la revisión financiera propone que, **por ahora**, tanto márgenes internos como sobretasas sean visibles **sólo a Super Admin**. Esto es más restrictivo que la regla previa (márgenes accesibles a Admin con autorización expresa). Hasta que el usuario apruebe una política específica y exista control granular probado, **no habilitar acceso de Admin a márgenes por defecto**. Las sobretasas siguen siempre exclusivas de Super Admin.

**Pruebas bloqueantes a diseñar para Fase 1/QA:** varias propuestas aprobadas con créditos distintos; retry/doble selección concurrente de una misma propuesta sin duplicados; vínculo target-version-crédito-dispersión-comisión; cambio Master con derechos históricos pero sin fuga de PII; propuesta sin estado autorizado rechazada; cambios de tasas antes/después de confirmación; multidispersión y fallo de cálculo → conciliación pendiente; Matching en solicitud real, evidencia insuficiente y versiones `active` no publicadas; accesos Admin y Master por API y URL.

**Pendiente técnico antes de autorizar implementación:** revisar evento formal exacto de confirmación y estados de propuesta, esquema de enlace target/versión y forma de almacenar snapshots económicos e idempotencia, sin inventar nuevas operaciones financieras no contempladas.

### Próximos pasos tras la revisión 0C

1. Presentar al usuario las decisiones que requieren aprobación expresa: regla temporal de visibilidad de márgenes; evento exacto de confirmación económica y transición de estados; alcance de lectura histórica. La multiplicidad de créditos por solicitud se considera requisito ya acordado.
2. Preparar el alcance del **primer bloque de integración Fase 1** en rama aislada desde main seguro: seguridad + Legal + Red. Los cambios financieros P0 se planifican en Fase 2, pero ninguna funcionalidad incompatible de comisión, propuestas o Matching se habilitará en producción antes de cerrar sus P0.
3. Sólo tras autorización del usuario entregar a AG un prompt corto con checkpoint, archivos, tests y reporte/commit. Mantener copias y workflow local sin seguimiento.

**No se autoriza aún** modificar ramas de código, ejecutar migraciones reales ni desplegar a Staging o producción.

## 11. Seguimiento de ejecución de Fase 1A (10-oct-2026)

> **Registro operativo del Plan Maestro v1.1, sin alterar decisiones comerciales ni autorizar merges o despliegues.** Los diagnósticos de §10 siguen siendo evidencia histórica de Fase 0.

### 1A.1 — Base segura y pruebas P0: cerrada

- **Base de partida:** `main` en `0c6b7bd18f6465c55d95f72a4f20ade339f1a553`. Se trabajó en el worktree independiente `wt-base-segura` y rama `integration/phase-1a1-base-segura`.
- **Commit aprobado y publicado exclusivamente en esa rama:** [`f83e25dfd2ea14856a5a5306bd1cbb2c61a865fd`](https://github.com/frcb79/CreditoNegocios/commit/f83e25dfd2ea14856a5a5306bd1cbb2c61a865fd). Comparación GitHub: 1 commit adelante y 0 atrás respecto de ese `main`; `main` no fue modificado.
- **Cambios de código:** ninguno. Sólo se modificaron `tests/unit/prod-hotfix-security.test.ts` (casos de autenticación, bootstrap y arranque seguro) y `tests/unit/commercial-ui.test.ts` (reloj simulado consistente; prueba de oportunidad vigente y vencida).
- **Validación reportada por AG:** 14/14 suites y 173/173 pruebas unitarias aprobadas; pruebas P0 específicas 11/11; TypeScript sin errores; build cliente/servidor correcto; `git diff --check` limpio. La coordinación verificó en GitHub la rama, el commit y sus dos archivos, **no reejecutó las pruebas localmente**.
- **Aislamiento:** AG reportó pruebas con mocks/MemStorage, sin conexiones a BD reales, migraciones ni despliegues. Se preservaron la rama financiera `feat/admin-financieras-ofertas-b1` (`cc6b151`), su archivo local sin seguimiento y respaldos `bloque_3b1.*` / `bloque_3b2a.*`. `coverage/` y `dist/` fueron generados localmente e ignorados por Git.
- **Hallazgo resuelto:** la prueba comercial anterior mezclaba creación a 25-sep-2026 y evaluación de duplicados con reloj real, cuando la reserva predeterminada era de 7 días. Se corrigió exclusivamente el test, sin cambiar reglas comerciales. Esto **no** valida todavía los plazos definitivos de protección.

**Límites de este cierre:** no se integraron aún Legal, Red ni los cambios P0 de comisiones; no hay QA conjunta con PostgreSQL real, ni Staging, ni merge a `main`, ni despliegue. No se debe presentar 1A.1 como plataforma lista para producción.

### 1A.2A — Documentos legales públicos: cerrada

- **Checkpoint:** continuar exclusivamente en `integration/phase-1a1-base-segura` desde `f83e25d`, sin tocar el workspace B1 ni `main`.
- **Alcance autorizado:** recuperar selectivamente de `integration/network-formalization` el catálogo legal ya aprobado, versiones y huellas SHA-256, lectura pública de **Términos y Condiciones** y **Aviso de Privacidad** V1.0, páginas/rutas públicas `/legal/terminos` y `/legal/aviso`, enlaces de acceso/registro y pruebas relacionadas. Revisar únicamente dependencias necesarias en las rutas y en `client/src/App.tsx`.
- **Restricciones:** conservar textos/hashes históricos; los convenios y reglas de Master/Red no se hacen públicos en este bloque. **No incorporar todavía** aceptación/persistencia de registro, formalización, OTP, gate de originación ni migraciones. Reutilizar código puntual, no fusionar ramas enteras.
- **Validación solicitada:** pruebas legales públicas, suite unitaria completa, `npm run check`, `npm run build`, diff y aislamiento sin BD real.
- **Resultado confirmado en GitHub (10-oct-2026):** commit [`ae02a2680d0b5182fc92cade4f51aebb398bc32d`](https://github.com/frcb79/CreditoNegocios/commit/ae02a2680d0b5182fc92cade4f51aebb398bc32d) publicado únicamente en `integration/phase-1a1-base-segura`, derivado de `f83e25d`. Verificación de coordinación: exactamente 18 archivos en ese commit; rama 2 commits adelante, 0 atrás respecto de `main`; `main` continuaba en `0c6b7bd`.
- **Resultado de QA según reporte AG:** 15/15 suites, **180/180 pruebas unitarias**, 7/7 pruebas legales nuevas, TypeScript 0 errores, build correcto, `git diff --check` limpio. Coordinación verificó el commit y el inventario remoto; no reejecutó localmente el QA.
- **Alcance realmente incorporado:** catálogo legal V1.0 con SHA-256 y lector público limitado a `terminos`/`aviso`; `GET /api/legal/:document` con versión, páginas y enlaces públicos en App/Landing/Settings y sitios estáticos, configuración Vercel y pruebas. El código no agrega registro de aceptaciones, formalización u OTP.
- **Preservaciones y exclusiones reportadas:** se conservó la regla de Vercel `/api/public/website-leads`; `docs/legal-launch-blocks.md` de la rama original **no fue integrado** para evitar planes paralelos; excluidos `dist/`, `coverage/` y archivos temporales. B1, archivos locales y respaldos preservados según AG.
- **Límite:** commit/push de rama aislada **no** significan merge a `main`, despliegue, prueba en navegador/Staging ni prueba en PostgreSQL real.

### 1A.2B — Registro y evidencia de aceptación: siguiente bloque pendiente de autorización

- **Checkpoint propuesto:** continuar en el mismo worktree/rama desde `ae02a26`; integrar puntualmente la aceptación de Términos y reconocimiento de Aviso al registrarse, con identificación de versión exacta, hash, fecha/hora, usuario, IP/User-Agent cuando estén disponibles y comprobante histórico consultable.
- **Separación estricta:** NO adelantar convenios operativos, aceptación formalizada por OTP ni bloqueo de ingreso general; esos controles corresponden a 1A.3.
- **Previo a prompt ejecutable:** delimitar en el código actual el endpoint de registro, el origen de documentos versionados y el contrato de persistencia de evidencias, y definir pruebas sin BD real. No autorizar migración/despliegue automático.

### Bloqueantes y seguimientos preservados

1. **Comisiones P0:** recuperar el gate de aprobación/dispersión exclusivamente Super Admin y conciliarlo con el modelo de ofertas/versiones en la fase correspondiente. **No habilitar pagos ni despliegue** con este P0 pendiente.
2. **1A.2B / 1A.3:** aceptación y evidencia de Términos/Aviso al registro; después convenios versionados, OTP por correo y validación del broker originador efectivo en originación propia/delegada. No impedir acceso general por falta de convenios operativos.
3. **1A.4 — Red:** reconciliar plazos 90/120 días y 12 meses con contratos y configuración efectiva de Super Admin, sin modificar retroactivamente derechos. Proteger oportunidades específicas, no clientes completos; conservar beneficiarios y comprobantes históricos, sin abrir expedientes ni PII posteriores al Master anterior.
4. **Fase 2:** congelamiento económico, aceptación comercial por oferta/versión, Matching verificable y múltiples créditos por solicitud siguen sujetos a sus decisiones y pruebas propias.
5. **Fase 4:** siguen pendientes pruebas migratorias reales y repetibles con PostgreSQL nuevo e histórico protegido, E2E/Staging y autorizaciones separadas para integración a `main` y producción.
