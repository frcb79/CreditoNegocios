# Crédito Negocios — Registro Maestro de Decisiones, Reglas y Controles

> **Nota de integración — 13-oct-2026:** se conserva íntegramente este documento histórico. Su estado de fases y referencias a AG describen la fotografía de 9–10 octubre, no el estado actual ni una autorización de despliegue. Consultar [Estado Prelaunch actualizado](./ESTADO_CIERRE_PRELAUNCH.md).

**Versión:** 0.1 · **Corte:** 10 de octubre de 2026 · **Tipo:** inventario histórico de validación, NO orden de implementación ni certificado QA.

**Documento rector:** [Plan Maestro de Integración v1.1](./PLAN_MAESTRO_INTEGRACION.md). Este inventario es complementario: guarda reglas y pendientes para compararlos contra el código integrado. Si aparece una contradicción, identificarla y elevarla, no resolverla implícitamente. La integración y la producción requieren autorizaciones separadas.

**Fuentes iniciales:** conversaciones del proyecto sobre Seguridad/Dashboard, Contrato Brokers, Vigencia cliente, Relación Comercial, Diseño de Bitácora, Financieras/Productos/Matching y pruebas de integración; informes AG 1A.3A y 1A.3B del 10-oct; Plan Maestro v1.1. **Exclusión solicitada:** no usar conversación «Coordinación INTEGRACIONES» para reconstruir este inventario.

**Advertencia de cobertura:** la recuperación de chats fue parcial. «Acordado» describe la decisión comercial, no su implementación. «Verificar» indica ausencia de validación final sobre código integrado. Los IDs se preservan aunque se amplíe el registro.

## Semáforo para el cierre

- **P0**: seguridad, datos y dinero; obligatorio para el flujo que se habilitará en producción.
- **P1**: funcionalidad necesaria para el MVP aprobado, validez documental, experiencia y trazabilidad.
- **Diferible**: no bloquear lanzamiento salvo evidencia de dependencia crítica.

## SEG — Seguridad, multi-tenant y permisos

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| SEG-01 | tenantId es frontera de propiedad y aislamiento de datos. | Acordado |
| SEG-02 | brokerId atribuye originación comercial, no sustituye tenantId. | Acordado |
| SEG-03 | createdBy/uploadedBy/actor registran trazabilidad, no propiedad. | Acordado |
| SEG-04 | Super Admin global; Master según red; Broker según ámbito; Admin sólo permisos expresos. | Acordado |
| SEG-05 | Autorización real en API además de controles visuales. | Acordado |
| SEG-06 | Impedir acceso por IDs ajenos a créditos, clientes, documentos y expedientes. | Acordado |
| SEG-07 | canOriginate no reemplaza RBAC. | Acordado |
| SEG-08 | No elegir arbitrariamente primer tenant activo en multi-membresía. | Acordado |
| SEG-09 | Sin escalamiento de rol ni acceso interred por frontend o API. | Acordado |
| SEG-10 | Aplicar suspensiones/estado de tenant en rutas críticas. | Verificar |
| SEG-11 | Sin mutaciones destructivas automáticas de datos al arrancar o migrar. | Acordado |
| SEG-12 | Conservar P0 de main: autenticación, credenciales, bootstrap, permisos y arranque. | Verificar |
| SEG-13 | Evitar filtrar sobretasas/márgenes por APIs, exports, rutas y respuestas a roles ajenos. | Acordado |

## RED — Red comercial y roles

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| RED-01 | Broker puede promoverse a Master. | Acordado |
| RED-02 | Broker puede moverse Master A→B. | Acordado |
| RED-03 | Broker puede pasar de Master a directo de plataforma. | Acordado |
| RED-04 | Broker directo puede integrarse a un Master. | Acordado |
| RED-05 | Movimientos y promociones estructurales únicamente Super Admin. | Acordado |
| RED-06 | Master suspende/desactiva sólo miembros de su red; no reactiva unilateralmente. | Acordado |
| RED-07 | Reactivaciones y reasignaciones bajo Super Admin. | Acordado |
| RED-08 | Transiciones no reescriben créditos, oportunidades, atribución y comisiones históricas. | Acordado |
| RED-09 | Operaciones nuevas usan afiliación válida en evento de corte pertinente. | Acordado |
| RED-10 | Historial de transiciones con motivo, responsable, fecha y alcance. | Verificar |

## CLI — Clientes, expedientes y protección

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| CLI-01 | Sin apropiación total ni indefinida del cliente por un Broker. | Acordado |
| CLI-02 | Atribución de crédito originado permanece histórica. | Acordado |
| CLI-03 | Crédito vivo largo no bloquea automáticamente una necesidad nueva con otro Broker. | Acordado |
| CLI-04 | Protección sobre oportunidad concreta cliente+necesidad/producto. | Acordado |
| CLI-05 | Actividad/seguimiento documentado gobiernan vigencia de protección. | Acordado |
| CLI-06 | Cliente puede confirmar cambio de Broker respecto de una oportunidad. | Acordado |
| CLI-07 | Token/enlace verificable y excepciones con evidencia. | Acordado |
| CLI-08 | Oportunidades nuevas se atribuyen separadamente sin afectar operaciones históricas. | Acordado |
| CLI-09 | Disputas se resuelven con evidencia y bitácora. | Acordado |
| CLI-10 | Cliente liberado distinto de bloqueado por fraude/cumplimiento. | Acordado |
| CLI-11 | Reglas de protección configurables/versionadas, no retroactividad silenciosa. | Acordado |
| CLI-12 | Conciliar plazos de protección previos 90/120/12 meses con modelo dinámico y otras ventanas específicas. | Conciliar |
| CLI-13 | Cambios materiales de plazos activos generan notificación y aceptación expresa a Broker/Master afectados, con histórico. | Acordado |

## LEG — Registro, documentos, convenio y OTP

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| LEG-01 | En registro: aceptar Términos y reconocer Aviso; no convenio antes de entrar. | Acordado |
| LEG-02 | Convenio se formaliza ya dentro, antes de originación nueva. | Acordado |
| LEG-03 | Convenio, Reglas de Red y Reglas Master según rol. | Acordado |
| LEG-04 | OTP por correo para firma de formalización. | Acordado |
| LEG-05 | Guardar identidad, correo, versión, hash, hora y evidencia técnica/IP-UA disponibles. | Acordado |
| LEG-06 | Historial legal consultable desde perfil. | Acordado |
| LEG-07 | Aceptaciones anteriores y textos aceptados inmutables. | Acordado |
| LEG-08 | Gate completo para toda originación y canalización, incluidas rutas legacy/delegación; no bloquear gestión histórica. | 1A.3C — P0 |
| LEG-09 | Formalización por Broker originador efectivo y no sólo colaborador capturista. | 1A.3C — P0 |
| LEG-10 | Consentimiento financiero/patrimonial del cliente separado del Broker: alcance y enforcement pendientes. | Prelanzamiento — P0/P1 según operación |
| LEG-11 | Comprobante histórico exacto descargable desde snapshot personalizado, no plantilla genérica. | Prelanzamiento |
| LEG-12 | PDF o TXT no son por sí mismos certificación NOM-151. | Acordado |
| LEG-13 | Verificar que snapshot personalizado y evidencia sobreviven de forma durable vinculados a aceptación, no sólo OTP temporal. | Cierre legal |
| LEG-14 | **Confirmado en `c836fd6`:** `server/legalRoutes.ts` genera comprobante histórico en texto y al descargar responde `text/plain` con extensión `.txt`. Debe generarse PDF legible del **snapshot personalizado inmutable** y probar hashes/historial sin depender del perfil actual; PDF no constituye NOM-151. | **P1 pendiente de UX/expediente legal prelanzamiento** |
| LEG-15 | Convenio V1.0 hoy formalizable con 90 días reserva, 120 días trámite, 12 meses postdesembolso. | Acordado |
| LEG-16 | Banco y CLABE reales si existen, si no 'Pendiente de proporcionar'; no impiden firmar/originar. | Acordado |
| LEG-17 | Cambio material de plazos/comisiones: nueva versión, notificación y aceptación explícita; condiciones históricas permanecen. | Acordado |
| LEG-18 | Confirmar atomicidad OTP+aceptaciones+snapshot con PostgreSQL real, expiración y revocación segura. | QA prelanzamiento |

## FIN — Financieras y ofertas

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| FIN-01 | Financiera = prestamista; producto base = familia; oferta = configuración comercial concreta. | Acordado |
| FIN-02 | Múltiples ofertas de una misma familia dentro de una financiera. | Acordado |
| FIN-03 | Nombre comercial particular no duplica categoría maestra. | Acordado |
| FIN-04 | Condiciones, perfiles, rangos, plazos, requisitos, garantías, documentos, comisiones por oferta. | Acordado |
| FIN-05 | Flujo sencillo de administración: financiera→oferta/producto→configurar→revisar→publicar. | Acordado como objetivo UX |
| FIN-06 | Reutilizar product_templates/institution_products si es seguro, no duplicar modelo. | Acordado |
| FIN-07 | Published inmutable y editada crea nueva versión; draft/superseded no evaluable. | Acordado |
| FIN-08 | Preservar referencias y configuraciones legacy sin reinterpretación silenciosa. | Acordado |
| FIN-09 | Retirar variables legacy sin uso real sin destruir histórico. | Acordado |
| FIN-10 | Catálogo inicial revisado antes de importar valores financieros definitivos; no inventar tasas. | Acordado |
| FIN-11 | Importadores deben validar y aislar ofertas; no confundir vacío con cero. | Verificar |
| FIN-12 | No mostrar catálogo administrativo de financieras ni márgenes a Broker/Master. | Acordado |
| FIN-13 | **Confirmado en `c836fd6`:** `GET /api/financial-institutions/:id` (`server/routes.ts`) sólo tiene `isAuthenticated`, sin verificación de módulo, permiso o vinculación con oferta pública; usa `projectFinancialInstitutionByRole` como filtro, pero sanitización no es autorización. La lista sí tiene `requireAnyModule`. Probar Broker/Master, recursos ajenos y respuestas por ID; habilitar consulta limitada únicamente a oferta autorizada. | **P0 verificado en código — corregir RBAC antes de Staging público** |
| FIN-14 | Verificar filtrado profundo de márgenes/costos internos en `projectFinancialInstitutionByRole`, especialmente rol Admin que recibe copia con exclusión de sobretasas pero puede conservar otros campos. Admin ve margen sólo bajo permiso específico; Master/Broker nunca. | **Abierto — prueba de filtración por rol** |

## MAT — Matching

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| MAT-01 | Evaluar cliente+necesidad+oferta específica+perfil+versión vigente/requisitos. | Acordado |
| MAT-02 | Condiciones sólo con fuentes reales capturadas; no inventar datos ni requisitos. | Acordado |
| MAT-03 | Reducir variables hardcoded/duplicadas y preguntas innecesarias. | Acordado |
| MAT-04 | Evitar variables personales irrelevantes como estado civil. | Acordado |
| MAT-05 | Compatible / No compatible / Información insuficiente diferenciados. | Acordado |
| MAT-06 | Desconocido/no verificado no significa aprobado/compatible. | Acordado |
| MAT-07 | Sin garantía, con garantía y dato desconocido son distintos. | Acordado |
| MAT-08 | Tener garantía no excluye ofertas sin garantía. | Acordado |
| MAT-09 | Superar un mínimo no lo convierte en un máximo artificial. | Acordado |
| MAT-10 | Incumplir regla obligatoria no lo compensa score alto. | Acordado |
| MAT-11 | Sin ranking económico o sesgo por comisiones. | Acordado |
| MAT-12 | Evaluación autoritativa y explicable en backend. | Verificar |
| MAT-13 | Sin criterios evaluables no declarar automáticamente compatible. | Acordado |
| MAT-14 | Cubrir credits y credit_submission_requests, solicitudes sin crédito e info parcial. | Verificar |
| MAT-15 | **Integración pendiente comprobada (`c836fd6`):** Matching M1–M3 (`server/matching/compatibilityEvaluator.ts`, `fieldMapping.ts`, pruebas `m1/m2/m3`, `CreditMatchingSection.tsx`) existen en `feat/admin-financieras-ofertas-b1`, pero no están en `integration/phase-1a1-base-segura`. Integrar selectivamente, considerando diferencias de las ramas y endpoint de solicitudes sin `credit` creado. | **P0/P1 funcional — Matching no integrado** |
| MAT-16 | **Hallazgo confirmado en rama financiera M1/M3:** `evaluateOfferCompatibility` retorna `COMPATIBLE` cuando no hay criterios evaluados (`matched=failed=missing=0`), contradiciendo MAT-13. Cambiar a `INSUFFICIENT_DATA` o estado explícito no evaluable, con pruebas. | **P0 para evitar falsos compatibles antes de integrar** |
| MAT-17 | **Hallazgo confirmado en rama financiera:** `isCriterionOriginVerified` devuelve `true` cuando no existen flags negativos, sin prueba positiva de que requisito y campo de solicitud están verificados; contradice MAT-06 y criterio positivo del Plan Maestro. El mapeo inicial cubre 8 campos fijos; revisar extensión por variables reales configuradas por oferta sin introducir 50 preguntas. | **P0 calidad de Matching antes de integrar** |

## COM — Comisiones y economía

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| COM-01 | Financiera remunera a Crédito Negocios según términos de oferta. | Acordado |
| COM-02 | Porcentaje de comisión por oferta/version específica, no financiera global. | Acordado |
| COM-03 | **Modelo de pagos confirmado 12-oct-2026:** Crédito Negocios paga a Master Broker por las operaciones de su red. El Master paga directamente a sus Brokers según la distribución contractual congelada. Sin Master en la operación, Crédito Negocios paga directo al Broker. En originación directa del Master, Crédito Negocios paga al Master. | **Regla comercial ratificada — adaptar código antes de pagos** |
| COM-04 | Master acuerda retribución Broker de su red dentro de límites. | Acordado |
| COM-05 | Cargo de apertura al cliente no equivale a comisión pagada por la financiera. | Acordado |
| COM-06 | No distribuir más de la comisión recibida de la Financiera. Descontar margen de Crédito Negocios y evitar duplicar cuotas: en operación de red, **un pago único de Crédito Negocios al Master** por el monto asignado a esa red (cuota Master + cuota Broker), mientras el desglose por ambos se conserva como deuda interna Master→Broker. Sin Master, un único pago Crédito Negocios→Broker. | **Decisión operativa vigente 12-oct-2026** |
| COM-07 | **Regla acordada:** congelar oferta/versión, tasas, originador y beneficiarios al consolidar formalmente la propuesta comercial; la aprobación administrativa del pago es un evento posterior que no debe sustituir ese corte. En 2B.1 `frozenAmount` se asigna sólo en `/api/commissions/:id/approve`. | **P0 — completar snapshot comercial y diferenciar congelamiento de derechos vs importe de desembolso** |
| COM-08 | Cambio de Master no cambia derecho económico histórico. | Acordado |
| COM-09 | Comisión definitiva se calcula sobre monto efectivamente dispersado y confirmado. | Acordado |
| COM-10 | Cambios materiales comunicados y expresamente aceptados, sin retroactividad indebida. | Acordado |
| COM-11 | Derechos devengados subsisten según convenio, incluso al terminar relación. | Acordado |
| COM-12 | Fraude/cancelación/compensaciones sujetos a reglas documentadas. | Verificar texto exacto |
| COM-13 | Sobretasas sólo Super Admin; márgenes internos Super Admin o Admin explícitamente autorizado. | Acordado |
| COM-14 | No fallback silencioso a tasas genéricas ni convertir dato ausente en 0. | Acordado |
| COM-15 | Oferta múltiple y multidispersión: no mezclar ni duplicar liquidaciones. | Verificar |
| COM-16 | Exigir versión exacta; no sustituirla silenciosamente. Corregido para `versionNumber` explícito en `resolveOfferVersionCommissionRates` (`7eb9e43`), pero verificar que propuesta nueva no elija una versión por omisión y no permita tasas inyectadas. | Código corregido parcialmente — validar extremo a extremo |
| COM-17 | Comisión sólo sobre dispersión confirmada por sistema confiable. Servicio `7eb9e43` elimina fallback directo al monto del crédito, **pero rutas aún aceptan `req.body.confirmedDisbursedAmount`/`dispersedAmount` sin comprobar evidencia y el helper permite `approvedAmount`**. | **P0 abierto — COM-21** |
| COM-18 | Techo económico incluso cuando financiera remunera 0%; el servicio `7eb9e43` eliminó guardia `safeFinRate > 0`. | Corrección en servicio; requiere regresión real |
| COM-19 | Tarifas del Master históricas: no recalcular con `networkCommissionRates` actual. `7eb9e43` evita esa lectura cuando hay snapshot, pero otras rutas construyen tasas desde la financiera y el snapshot no está suficientemente protegido. | **P0 parcial — COM-22/23** |
| COM-20 | **Compatibilidad legacy acotada:** `resolveOfferVersionCommissionRates` incluye `institution_legacy` y defaults `?? 0` sin oferta. Restringir sólo a operaciones históricas verificadas; ofertas nuevas/versionadas no deben entrar al fallback ni convertir tasa ausente en 0. | **Abierto — definir/validar excepción histórica** |
| COM-21 | Confirmación manual del importe real del crédito por Super Admin (sin integración bancaria ni comprobante externo obligatorio) y cálculo canónico sobre ese monto. `ad7b23b` agregó dos endpoints y tests, pero deben cerrarse atomicidad, idempotencia del tramo y conciliación del historial antes de uso real (OPE-10/11). | **Implementado parcialmente — no habilitar pagos ni declarar cerrado hasta QA** |
| COM-22 | **P0 snapshot comercial:** `84c98e2` consolida en `select-winner` y rechaza sobrescrituras por `PUT /api/credits/:id` (409), pero verificar en PostgreSQL, fuente contractual de `institutionProposal.commissionRates`/versión y transición única del evento. La validación compara parcialmente datos opcionales; no asumir inmutabilidad integral hasta pruebas negativas de omisión/NULL y cambios de versión/tasas. | **Parcial — tests 14 reportados; falta validación fuente e integridad real** |
| COM-23 | **P0 cálculo canónico:** `84c98e2` eliminó bypass `strictRateCheck: false`, lectura viva de `networkCommissionRates` y cálculo automático alternativo de `PUT`/`mark-dispersed`. Falta validar contra datos reales que toda creación futura use snapshot confiable y una fuente de dispersión verificada (COM-21); sin confirmar pago no activar generación. | **Implementación principal corregida; validación E2E/PG pendiente** |
| COM-24 | **Evidencia pendiente:** tests nuevos 2B.1A (20 reportados) validan helpers/servicios y no demuestran todavía integridad de todos los endpoints, persistencia/inmutabilidad en PostgreSQL, conciliación con dispersiones reales ni control contra manipulación del frontend. No marcar COM-07/17/19/21–23 completos por passes de MemStorage. | Pendiente antes de Staging/activación de pagos |
| COM-25 | `64ad33b` añadió `syncFromStorage` y rehidratación desde `legal_document_versions` antes de consultar/aceptar/publicar; mejora recuperación tras reinicio. Aún usa Maps de proceso, acepta errores de lectura silenciosamente y contadores siguiente versión calculados en memoria, sin control transaccional/concurrencia multi-instancia. Metadatos en comentario agregado al contenido requieren verificar correspondencia con `contentSha256` de texto íntegro. | **Parcial; probar reinicio PostgreSQL, publicación concurrente y fail-closed** |
| COM-26 | `64ad33b` valida Broker afiliado y rechaza `masterBrokerId` ajeno y versión de red distinta de la vigente, pero retorna idempotencia sobre aceptación histórica antes de validar versión actual y en `global` permite versión pasada (`params.version` existe, no exige vigente). Probar caducidad de aceptación previa, transferencia de red, hash del documento exacto y controles bajo PostgreSQL real. | **Parcial; no declarar evidencia contractual validada completamente** |
| COM-27 | En `64ad33b` la nueva `syncFromStorage` mejora lectura, **pero** configuración/tasas se siguen modificando antes de publicar documento; servicio incrementa versión en memoria antes de persistir. No transacción conjunta cambio-version-vigencia; si falla creación de versión pueden quedar condiciones aplicadas sin aceptación requerida. | **P0 abierto — atomicidad publicación pendiente** |
| COM-28 | `64ad33b` preserva notificación específica por red Master, pero modificaciones a comisión por institución aún usan publicación global; no se verificó alcance por oferta/version financiera vigente, destinatarios afectados ni aceptación para oferta específica. | **Pendiente de cierre con catálogo financiero versionado** |

**Revisión técnica 11-oct-2026, Fase 2B.1 (`b97bf32`):** AG reportó 35/35 pruebas de comisiones, 107/107 de regresión, TS y build exitosos; el commit está en integración. **Las pruebas no acreditan todavía estos escenarios P0**: versión inexistente, dispersión no confirmada, 0% de financiera con distribución positiva y tarifa del Master modificada después de la propuesta. No autorizar pagos ni despliegue hasta cerrar COM-07 y COM-16–20, PAG-01/03 y MIG-01/05 con evidencia PostgreSQL/E2E cuando aplique.

**Revisión adicional 11-oct-2026, Fase 2B.1A (`7eb9e43`):** se verificaron mejoras de servicio (versión explícita, techo 0%, no usar automáticamente monto del crédito y snapshot básico), pero existen rutas todavía incompatibles con integridad económica. **COM-21–23 impiden autorizar cálculo y pago real**. Se puede seguir con desarrollo selectivo si no se activan pagos ni migraciones, pero se deben cerrar y probar antes de afirmar seguridad operativa. Verificar correspondencia real con IDs del Registro Maestro, no los números internos de comentarios de AG.

## PAG — Pago documental

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| PAG-01 | Exigir INE, CSF, estado de cuenta y banco/CLABE validados **del beneficiario a quien Crédito Negocios efectivamente pagará**: Master en operaciones de su red o directas, Broker en operaciones sin Master. El Master es responsable de gestionar el expediente y pago posterior a Brokers de su red; no bloquear pago Crédito Negocios→Master por documentación de sus Brokers. Documentación no bloquea originación, registro o aprobación. | **Regla ratificada — implementar y probar** |
| PAG-02 | Documentos bancarios/fiscales no bloquean registro, firma ni originación. | Acordado |
| PAG-03 | Gate de pago en servidor/STP y afines; no basta mostrar documento en UI. | Pendiente informado 1A.3B |
| PAG-04 | Cada liquidación de Crédito Negocios tendrá un único beneficiario legal por operación (Master si es red o Master directo; Broker si directo), CLABE validada, importe neto autorizado, referencia única y auditoría; distinguir contablemente la obligación separada del Master de pagar a su Broker. Impedir simulación de pago real y duplicados. | **P0 antes de pagos operativos** |
| PAG-05 | Super Admin confirma manualmente el monto del crédito dispersado y aprueba comisión base y desglose económico congelado: margen plataforma, cuota Master, cuota Broker. Para la operación de red **Crédito Negocios sólo paga al Master** la suma correspondiente a Master + Broker; el Master paga al Broker. Conservar originador, Master histórico, versiones/tasas, acto de revisión y no retroactividad; no exigir comprobante externo de desembolso del crédito. | **Modelo aprobado — recalibrar flujo y tests** |
| PAG-06 | Revisión expresa de Super Admin de monto base, tasas congeladas y desglose; mostrar claramente **beneficiario de pago de Crédito Negocios** (Master o Broker Directo) y **obligación interna del Master hacia su Broker**, sin indicar que Crédito Negocios pagó al Broker de red. No confundir cálculo/atribución con transferencia. | **Parcial — verificar UX y API antes de liquidación** |
| PAG-07 | **`964762c` parcialmente corregido:** `GET /api/commissions/:id/payout-validation` ahora comprueba relación broker/master, pero devuelve sin enmascarar CLABE del Master al Broker originador de su red (consulta autorizada por comisión no equivale a permiso sobre cuenta bancaria de tercero). `GET /api/commissions/:id/audit-logs` sólo exige permiso general de módulo y no valida pertenencia de la comisión, con riesgo de exponer referencias bancarias y datos financieros de otros tenants. Aplicar filtrado por recurso y campos por rol. | **P0 abierto — datos sensibles antes de Staging público** |
| PAG-08 | **`964762c` corrige el modelo central:** desde Crédito Negocios una sola liquidación al Master por operación de red (cuota Master+Broker), o al Broker directo si no hay Master. `/pay`, `/bulk-pay` sólo simulan, y `/mark-paid` registra liquidación al Master y deuda Master→Broker pendiente. **Excepción PAG-15:** presencia de Master con cuota Master 0 sigue eligiendo Broker directo; validar escenarios cero, no inferir pertenencia a red por comisión positiva del Master. | **Corregido principalmente; excepción de beneficiario P0** |
| PAG-09 | En `64ad33b`, `PUT /api/documents/:id` invalida `isValid`/dictamen cuando cambia archivo, tipo o cliente. Queda comprobar en API/PG vínculo de dictamen con contenido, categoría y titular del beneficiario real, impedir mutaciones alternativas y probar pérdida de aprobación y reemplazo concurrente. | **Mitigación principal implementada; QA PG pendiente** |
| PAG-10 | **Persistente en `964762c`:** `evaluateDocumentStatus` define `isExpired` sólo si `doc.expiresAt` existe; documento aprobado sin vencimiento se trata como no vencido. Verificar fechas/antigüedad de INE/estado de cuenta/CSF por política documentada y ligar aprobación Super Admin a archivo/titular, incluida ausencia de expiración. | **P1/P0 para pagos manuales — vigencia no garantizada** |
| PAG-11 | `64ad33b` sustituyó alias basados en redispatch artificial por llamadas directas a `processDocumentReview` en `/review`, `/approve`, `/reject`. Verificar endpoints negativos reales y almacenamiento PostgreSQL, especialmente rechazo obligatorio y rol Super Admin. | **Corregido en código — pruebas integrales PG pendientes** |
| PAG-12 | `964762c` inhabilita la marcación `paid` por simulación en `/pay` y `/bulk-pay`; requiere `simulate: true` para simular y mantiene `approved`. Pago real por STP diferido. `/mark-paid` permite registro manual sólo por Super Admin con referencia declarada y auditoría; **la referencia se valida como no vacía, no contra SPEI real**, de acuerdo con confirmación manual (sin integración bancaria requerida en MVP). Revisar estados y errores en PostgreSQL. | **Candado de simulación corregido en código; STP real diferido** |
| PAG-13 | `964762c` elimina split de transferencias Crédito Negocios→Master/Broker y conserva obligación interna del Master; riesgo de fallos parciales de dos envíos ya no aplica al modelo de una liquidación, pero permanecen idempotencia y persistencia/conciliación del pago manual, referencias y estados ante fallos de auditoría/DB. STP real diferido. | **Modelo corregido; QA idempotencia PG pendiente** |
| PAG-14 | `964762c` incorpora `networkObligation` (`pending_master_payout`) en cálculo/auditoría y `providerResponse` de `/mark-paid`; no marca como pago de Crédito Negocios la deuda Master→Broker. Comprobar que desglose/estatus de Master→Broker se preserven en interfaz e historia, y que no se puedan mutar por cambios de red posteriores. | **Implementación principal observada; revisar UI/persistencia** |
| PAG-15 | **Confirmado en `964762c`:** `server/routes.ts` usa `isMbCredit = historicalMasterBrokerId && masterBrokerShare > 0` al seleccionar `targetUserId`; `server/commissionDocumentValidationService.ts` elige Broker si `masterBrokerShare===0` incluso existiendo Master histórico. Operación de red con margen Master cero puede pagar al Broker. Elegir beneficiario por canal/afiliación histórica congelada, no por tasa positiva. | **P0 verificado — destinatario bancario incorrecto** |
| PAG-16 | **Confirmado en `964762c`:** `GET /api/commissions/:id/payout-validation` autoriza al Broker originador pero devuelve validación del Master receptor que incluye CLABE y documentos sin proyección por rol. `GET /api/commissions/:id/audit-logs` exige sólo permiso genérico `comisiones.view`, no acceso a la comisión, y puede exponer datos de otras redes/tenants. Agregar permisos por recurso y minimización de campos en ambos endpoints. | **P0 verificado — exposición transversal de información sensible** |
| PAG-17 | **Desajuste UI/API confirmado en `c836fd6`:** `client/src/pages/Commissions.tsx` sigue llamando `/api/commissions/:id/pay` y `/bulk-pay` sin `simulate:true`, con mensajes de dispersión exitosa; backend `964762c` rechaza ambas operaciones reales con 400. Ocultar/deshabilitar flujo STP real y priorizar UI `/mark-paid` manual, dejando simulación en entorno técnico claramente etiquetado. | **P1 bloqueante UX antes de operar comisiones en piloto** |

## OPE — Originación y cartera

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| OPE-01 | Expediente tenant-bound con atribución de originador comercial. | Acordado |
| OPE-02 | Solicitud conserva oferta/versión aplicable. | Verificar |
| OPE-03 | Canalización/propuesta/aprobación/aceptación/dispersión son eventos distintos. | Acordado |
| OPE-04 | Consentimientos clientes verificables por evento, no sustituidos por convenio Broker. | Acordado |
| OPE-05 | Monto aprobado separado de dispersión real. | Acordado |
| OPE-06 | Idempotencia en dispersión y comisiones. | Verificar |
| OPE-07 | No confundir 'enviar a dispersión' simulado con pago bancario real. | Verificar |
| OPE-08 | Hipotecario MVP separado de Garantía Inmobiliaria Empresarial. | Acordado |
| OPE-09 | `e7317e0`: se añadieron `isCreditDisbursementConfirmed`, separación de métricas del dashboard y etapa `dispersion_reportada` en pipeline. Sigue comprobación transversal pendiente: `mark-dispersed` conserva `credit.status='disbursed'`, `target.status='dispersed'` y otros consumidores históricos/notificaciones pueden leerlos sin filtro. Confirmación manual por Super Admin suficiente; no comprobante bancario obligatorio del crédito. | **Corrección parcial; QA de estados/cartera antes de Staging** |
| OPE-10 | `64ad33b` agrega candados de estado y oferta elegible, pero cambios de crédito, target, comisión y auditoría en ambos `confirm-disbursement` aún usan operaciones storage separadas con restauración manual, **sin transacción PostgreSQL**; si comisión o auditoría falla puede persistir un resultado parcial. | **P0 abierto — validación transaccional real PostgreSQL pendiente** |
| OPE-11 | `64ad33b` mantiene historial y chequeo de tramo, pero no añade bloqueo de fila/único PostgreSQL para confirmaciones concurrentes. No hay prueba DB de doble petición simultánea, reinicio o reconciliación de tramos. | **P0 abierto — concurrencia y persistencia PG** |
| OPE-12 | `64ad33b` añade rechazo de target no ganador, estado de target inelegible y crédito cancelado/rechazado. Mantener verificación de elegibilidad y atribución histórica en endpoint alternativo con PostgreSQL; creación por target y preservación snapshot requieren validar transacción completa. | **Corregido parcialmente; QA PG y atribución histórica pendiente** |

## ADM — Administración, dashboard y UX

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| ADM-01 | Super Admin centraliza administración global y redes. | Acordado |
| ADM-02 | Dashboard por rol y ámbito. | Acordado |
| ADM-03 | KPIs/pipeline/comisiones sólo por permisos. | Acordado |
| ADM-04 | Conservar mediciones de solicitudes, compatibilidad, ofertas, aprobaciones, aceptaciones, montos. | Acordado |
| ADM-05 | Funciones futuras como Próximamente; no fingir que están operativas. | Acordado |
| ADM-06 | Master no puede operar recursos ajenos por membresía genérica. | Acordado |
| ADM-07 | Separar referralCode/promoCode/accessStatus. | Acordado |
| ADM-08 | Registro gratuito ahora; checkout monetización diferible. | Acordado |
| ADM-09 | Inventariar datos de prueba antes de incorporar brokers reales. | Acordado |
| ADM-10 | Super Admin conserva pantallas Usuarios, Organización, Beneficios, Negocio, Perfilamiento, Documentos, Seguridad, Reglas. | Acordado |

## AUD — Actividad y auditoría

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| AUD-01 | Capturar acciones relevantes de seguridad, administración y operación. | Acordado |
| AUD-02 | Tiempo real de uso no equivale a pestaña abierta. | Acordado |
| AUD-03 | Eventos trazables por actor/tenant/recurso/fecha. | Acordado |
| AUD-04 | Aislamiento de tenant en consultas/exportaciones de auditoría. | Acordado |
| AUD-05 | No doble conteo de heartbeats concurrentes. | Pendiente de elegir implementación |
| AUD-06 | Una sesión histórica no debe cambiar tenant retroactivamente. | Pendiente |
| AUD-07 | Sólo una implementación bitácora; no fusionar dos esquemas divergentes. | Diferible según Plan v1.1 |
| AUD-08 | Auditoría Administrativa no sustituye bitácora integral. | Acordado |

## MIG — Migraciones y atribución histórica (P0)

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| MIG-01 | **Migración 0004 corregida EN RAMA CANDIDATA `fix/prelaunch-p0-gpt6-20261012`**: se eliminó backfill que usaba `users.master_broker_id` actual. Nuevo SQL exige tabla de conciliación `origin_attribution_reviews` por `credits` y `credit_submission_requests`: canal histórico, Master histórico explícito o directo, evidencia fechada y revisor; valida cobertura y aborta con transacción si falta alguna fila. Añadidos `preflight_0004_origin_attribution_reviews.sql` y suite PostgreSQL efímero de aborto/atribución/idempotencia/trigger. **Aún no aplicar en Staging/Producción:** los registros históricos reales deben conciliarse y testearse en clon protegido; prueba CI aún en curso. | **Código preparado; P0 de datos reales / CI pendiente** |
| MIG-02 | Corregir la reconstrucción histórica para usar evidencia verificable de la fecha/evento de originación (snapshots, auditoría, afiliaciones/transiciones fechadas). Si no existe evidencia suficiente, no inferir Master a partir de afiliación actual; marcar casos ambiguos para resolución controlada, **sin equiparar automáticamente desconocido a originación directa** ni reatribuir derechos. | Pendiente — condición de cierre MIG-01 |
| MIG-03 | Probar migración `0004` en PostgreSQL **aislado**, sobre copia desidentificada con datos representativos: Broker A→B, Master→plataforma, origen directo con NULL, sin historial suficiente, varias solicitudes, pagos/comisiones previas; comparar antes/después crédito por crédito y acreditar idempotencia (segunda ejecución sin cambios). | Pendiente — evidencia SQL y reporte por escenario |
| MIG-04 | Preservar estado de datos históricos de `commercial_opportunities`, `users`, `tenants` y reglas/triggers de inmutabilidad; no considerar aprobadas migraciones sólo por pruebas estáticas de texto o `IF NOT EXISTS`. Requerir backup/rollback y revisión de DBA/AG antes de autorizar ejecución. | Pendiente — QA de migraciones integral |
| MIG-05 | **P0 antes de ejecutar `0005_institution_offers_versioning.sql`:** crea versiones y modifica estado de ofertas legacy (publicado/archivado), genera hashes y usa marcador `app_migrations`. Validar en PostgreSQL aislado con copia histórica, estados anteriores, referencias de créditos, versiones, semántica de publicación, idempotencia y rollback. No ejecutar `0005` en Staging/producción sin evidencia y autorización. | **Abierto — QA migración financiera 0005** |

**Origen:** revisión directa del SQL de `0004` en `integration/phase-1a1-base-segura` commit `6c3cca5` (11-oct-2026). El reporte de 1A.4A sólo validó AST/DDL estáticos y MemStorage, **no PostgreSQL real**. Este riesgo continúa aunque se corrigieron `created_at`, mutaciones de tenants/usuarios y reactivación expresa. **No repetir toda la auditoría:** resolver este riesgo de forma focalizada antes de ejecutar la migración en cualquier ruta de promoción a producción.

## QA — Validación y lanzamiento

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| QA-01 | TS, build, unit, integraciones PostgreSQL, RBAC/E2E antes de release. | Acordado |
| QA-02 | Probar Staging y distinguir MemStorage de BD real. | Acordado |
| QA-03 | Sin migración destructiva/retroactiva; backup, idempotencia, rollback. | Acordado |
| QA-04 | Reconciliar cobertura 1A.3A 21 pruebas vs 1A.3B 10 específicas y regresión completa. | Pendiente |
| QA-05 | Conservar main y hotfixes; no merge/despliegue sin autorización separada. | Acordado |
| QA-06 | Al cierre documentar evidencia por ID (ruta/test/commit/resultado) o excepción aceptada. | Pendiente |
| QA-07 | Limpieza de ramas/clones/worktrees/temporales sólo después de estabilización; conservar tests útiles. | Postlanzamiento |

## Decisiones/alertas recientes que NO deben perderse

1. **Convenio V1.0** puede formalizarse con 90 días reserva, 120 días trámite y 12 meses postdesembolso. En el futuro, cambio material de plazos/comisiones requiere notificación y aceptación expresa del Broker/Master afectado, con versionamiento, evidencia y sin recalcular históricos.
2. **Banco/CLABE** al firmar: valores existentes o «Pendiente de proporcionar». No son requisito para formalizar/originar.
3. **Pago de comisiones**: INE vigente, CSF y estado de cuenta cargados y validados deben impedir liquidación si faltan (backend y endpoints reales); AG 1A.3B encontró gate AUSENTE. Resolver en fase financiera/pagos, sin mezclarlo con el gate de originación.
4. **Snapshot firmado**: documento íntegro, **personalizado**, idéntico al aceptado; hash personal y de plantilla, datos usados, método OTP, evidencia/fecha, consulta futura incluso si cambia perfil. Verificar persistencia duradera asociada a aceptación, independiente de expiración o limpieza del OTP.
5. **Comprobante**: AG 1A.3B reportó descarga TXT; versión PDF exacta y profesional pendiente. PDF no equivale a NOM-151.
6. **1A.3A/1A.3B pruebas**: 1A.3A informó 21 pruebas focalizadas; 1A.3B informó 10 de esa suite. Conciliar cobertura; no inferir regresión sin inspección.
7. **Bitácora integral** diferible según Plan Maestro v1.1; no incorporar implementaciones divergentes automáticamente.
8. **P0 de migración histórica (MIG-01–04):** `0004` lee la afiliación *actual* del Broker para retroasignar un Master a créditos y solicitudes *pasadas*. Resolver mediante evidencia histórica y PostgreSQL aislado antes de ejecutar `0004`; no inventar beneficiarios ni confundir NULL directo con dato desconocido.

**Actualización 11-oct-2026, Fase 2A (`01580c0`):** catálogo financiero/plantillas/ofertas versionadas integrado localmente; 190 pruebas reportadas en 14 suites seleccionadas (no equivalen a E2E/PG). Verificar FIN-13/14 y MIG-05 antes de declarar listo el flujo financiero para Staging. La migración `0004` sigue bloqueada por MIG-01.

**Revisión técnica 11-oct-2026, Fase 2B.1B (`84c98e2`):** GitHub confirmó commit/push; AG reportó 14/14 pruebas nuevas y regresión, TypeScript y build sin error. Se eliminó emisión automática de comisiones sin comprobación, pero el evento `mark-dispersed` conserva estado positivo sin fuente bancaria. Queda OPE-09 y cierre parcial de COM-21–23 antes de uso real. **Aclaración de IDs:** FIN-13 y FIN-14 del Registro Maestro son accesos a catálogo y filtración de márgenes, NO integraciones bancarias; la verificación de dispersión pertenece a COM-21/OPE-09. Continuar 2B.2 es posible sin habilitar pagos ni fingir desembolsos confirmados.

**Decisión de negocio 11-oct-2026 (Super Admin):** no se requiere por ahora evidencia bancaria externa ni integración de confirmación del crédito. El Super Admin asume la verificación de monto desembolsado y confirma manualmente en plataforma; después revisa y aprueba el cálculo, la tasa aplicable y los destinatarios de comisión (Broker y/o Master). La traza administrativa reemplaza **la exigencia técnica de comprobación bancaria del crédito**, pero **no** reemplaza INE, CSF ni estado de cuenta validados para desembolsar la **comisión** a los beneficiarios (PAG-01/03). No confundir ambas operaciones. Estas decisiones no levantan bloqueos MIG-01/MIG-05 ni RBAC FIN-13/14.

**Revisión 12-oct-2026 — entrega Fase 2B.2A (`ad7b23b`):** se verificó commit/push, código de confirmación manual exclusivo de Super Admin y nuevas pruebas reportadas (17/17). No declarar cierre total por los P0 nuevos OPE-10, OPE-11 y OPE-12; el marcador preliminar `reported` no impide que estados principales se presenten como dispersados. Mantener PAG-01/03 (documentos para pago de comisión), MIG-01/05 y FIN-13/14 (RBAC de financieras). La confirmación bancaria automática no es requisito del MVP.

**Revisión código 12-oct-2026, Fase 2B.2A.1 (`e7317e0`):** commit/push confirmado, AG reporta 23/23 nuevas pruebas, TS y build OK. Se reconoce mejora efectiva de interfaz manual, límites por tramo, control de estados en dashboard y auditoría. No dar por probada **atomicidad real**, **unicidad bajo concurrencia** o **elegibilidad de target** por esas pruebas MemStorage. OPE-10–12 continúan pendientes de cierre antes de activar cálculos/pagos en producción; pueden atenderse en QA financiero pre-Staging sin frenar el desarrollo separado de aceptaciones 2B.2B. No exigir integración bancaria ni comprobantes del crédito; sí INE/CSF/banco antes de pagar la comisión.

**Revisión técnica 12-oct-2026, Fase 2B.2B (`2019ab9`):** GitHub confirmó commit/push, AG reportó 9/9 pruebas nuevas, regresiones y TypeScript/build correctos. Existen brechas P0 en persistencia del estado vigente tras reinicio (COM-25), identidad de aceptación/version/afiliación (COM-26) y consistencia de publicación de cambios (COM-27), además de alcance de cambios por oferta (COM-28). No activar el bloqueo comercial real ni permitir aceptar condiciones como evidencia válida hasta cerrar estas brechas; se permite continuar trabajos independientes de pago documental 2B.2C. Ninguna de estas observaciones exige integración bancaria del crédito.

**Revisión técnica 12-oct-2026 — Fase 2B.2C (`ff24213`):** GitHub confirmó integración de servicio de validación documental y gates de `/pay`, `/bulk-pay` y `/mark-paid`; AG reportó 14/14 pruebas de nueva suite, regresiones, TS y build. **No se autoriza pago real**: cerrar PAG-07 (filtración CLABE/RBAC), PAG-08 (suma de participaciones de Broker/Master enviada a una sola cuenta), PAG-09 (dictamen reutilizable tras recategorizar documento); verificar PAG-10/11, PostgreSQL y E2E. Se permite continuar QA financiero consolidado sin repetir auditorías previas ni exigir comprobante bancario del crédito. Conservar aceptación comercial COM-25–28 como bloqueo independiente.

**Revisión independiente 12-oct-2026, QA financiero consolidado (`64ad33b`):** se verificó commit/push y cambios en cuatro archivos; AG reporta 10 pruebas nuevas, 9 comerciales, 3 beneficiarios y 14 documentales, TS/build exitosos. Mejora separación de CLABEs, versionamiento y candados de propuestas; **no hay evidencia de PostgreSQL aislado, transacciones reales, migraciones MIG-01/05 ni pruebas de concurrencia.** Los endpoints STP usan simulador que puede marcar `paid` sin transferencia, y la liquidación multi-beneficiario no concilia éxitos parciales; GET de validación de comisión sigue sin autorización granular. **No declarar fase 2B cerrada para Staging operativo ni pagos.** No se tocó código de integración desde esta revisión; documentos únicamente. Confirmación del crédito por Super Admin sigue sin exigir comprobante bancario externo.

**Aclaración vinculante de modelo de pagos — 12-oct-2026:** Crédito Negocios → Master de la red (monto atribuible a Master + Brokers de esa operación); Master → cada Broker de su red conforme a condiciones congeladas. Sin Master: Crédito Negocios → Broker directo. Master originador directo: Crédito Negocios → Master. El código `64ad33b` implementó erróneamente pago doble directo desde Crédito Negocios al Broker y al Master: requiere reversión selectiva. **No** borrar derechos históricos o la cuota interna del Broker. El gate documental para pago desde Crédito Negocios verifica al receptor real; el Master tiene responsabilidad propia por el pago a su red. Pago simulado nunca es pago confirmado. Mantener OPE-10/11, COM-25–28, PAG-07/09/10/11/12, FIN-13/14, MIG-01/05 y pruebas PostgreSQL pendientes.

**Revisión independiente 12-oct-2026, cierre correctivo 2B (`964762c`):** GitHub confirmó commit en `integration/phase-1a1-base-segura`; AG reportó 14 pruebas documentales, 12 de consolidación, 13 de seguridad, 3 de atribución, TS/build OK. Código sí corrige pago único a Master en redes con participación Master positiva, obligación Master→Broker pendiente, pago manual auditado y simulación STP sin estado `paid`. **Pendientes nuevos PAG-15/16**: canal con Master pero cuota Master cero puede pagar al Broker, y consulta de payout aún expone CLABE Master al Broker; `/audit-logs` sin verificación por comisión. AG reconoció ausencia de PostgreSQL aislado: MIG-01/05, OPE-10/11 y garantías transaccionales siguen NO validadas. No pedir nueva auditoría global AG: mantener como checklist de verificación independiente y QA pre-Staging.

**Auditoría independiente GPT-6, 12-oct-2026, checkpoint `c836fd6` — revisión de todos los pendientes:** `main` está 17 commits detrás de `integration/phase-1a1-base-segura` (sin divergencia a este corte); rama financiera `feat/admin-financieras-ofertas-b1` tiene M1–M3 de Matching no integrados; rama Super Admin divergente debe aprovecharse sólo con deltas selectivos. Confirmado código: FIN-13 (GET de financiera por ID sin autorización granular), PAG-15 (Master histórico con margen 0 tratado como Broker directo), PAG-16 (CLABE de Master visible a Broker en validación + audit logs sin acceso por recurso), PAG-10 (aprobación sin fecha de expiración), LEG-14 (voucher sólo TXT), PAG-17 (UI de pagos reales contra backend STP deshabilitado), MAT-16/17 (falsa compatibilidad sin criterios y verificación por defecto). MIG-01 persiste en SQL y MIG-05 permanece sin prueba PostgreSQL real. `tests/integration/postgres-versioning-migration.test.ts` existe en rama financiera, depende de `TEST_DATABASE_URL` y puede hacer `describe.skip`; presencia de test no implica ejecución. Vercel reporta checks de despliegue exitosos para el commit integrado, **no certifican API/PostgreSQL/E2E**. Riesgos existentes COM-25–28, OPE-09–12, LEG-10/13/18, FIN-14, MIG-02–05, QA-01–06 requieren validación. **Sólo análisis/documentación**: no se ejecutaron pruebas locales ni migraciones, ni se modificó aplicación, main, Staging o producción.

**Corrección asistida desde GPT-6, rama aislada `fix/prelaunch-p0-gpt6-20261012` (12-oct-2026):** cambios de código commiteados en GitHub sin afectar `main` ni `integration/phase-1a1-base-segura`: PAG-15 (destinatario Master histórico aunque `masterBrokerShare=0`, en rutas de pago, cálculo y gate documental), PAG-16 (autorización por comisión, proyección sin CLABE/detalles para no Super Admin, auditoría de comisiones), FIN-13 (GET administrativa de institución por ID restringida a Admin/Super Admin con módulo), PAG-17 (UX de pago manual y STP visible como deshabilitado). Se añadieron pruebas Jest para cuota Master cero, privacidad y acceso por ID. **Estado: IMPLEMENTADO EN RAMA AISLADA, SIN EJECUTAR TESTS/POSTGRESQL**; prohibido marcar aprobado o incorporar a integración hasta ejecutar TS, build, suites, pruebas negativas y revisión de regresión. FIN-14, Matching, COM-25–28, OPE-09–12, MIG-01/05 y demás pendientes no se resuelven con este lote.

**Ejecución GPT-6 orientada a release — 12-oct-2026:** se abrió PR de integración [#9](https://github.com/frcb79/CreditoNegocios/pull/9) en borrador desde `fix/prelaunch-p0-gpt6-20261012` hacia `integration/phase-1a1-base-segura` (no main). Se corrigieron errores de TypeScript detectados por GitHub Actions en `server/routes.ts`, se añadieron pruebas y un workflow temporal de TS/build/Jest + PostgreSQL efímero. **Validación verificable:** ejecución GitHub Actions `38310721752`, suite `tests/integration/postgres-versioning-migration.test.ts` con **8/8 en PostgreSQL 16 aislado**, que prueba `0005` sobre fixtures sintéticos; no equivale a copia histórica real ni autoriza migrar producción. Se recuperaron selectivamente Matching M1 (evaluador, mapa, tests), se corrigió el caso sin criterios evaluables/ausencia de evidencia positiva y se redujo exposición de comisión/margen en proyección Admin. **Infraestructura hallada:** Railway Production y Railway Staging ambas conectadas a `main` y desplegadas en SHA `0c6b7bd` (8-oct-2026); subir a `main` sin gates podría disparar despliegue de ambos. Salud observada: ambos servicios web online; no cambiar ramas Railway ni aplicar migraciones hasta QA y respaldo. Quedan bloqueados MIG-01 histórico, COM/OPE transaccional y QA End-to-end. Este registro describe trabajo real y no declara release aprobado.

**Avance independiente del 12-oct-2026 (PR #9, SHA `14a9dc09`):** integración candidata incorpora Matching M2 para `credits` y `credit_submission_requests` sin crédito, aislamiento por propietario/tenant, resultados filtrados de ofertas publicadas y sin mutaciones automáticas; tests de solicitudes independientes y acceso por ID añadidos. Se corrigió promoción de metadatos al publicar versión de oferta tanto en MemStorage como DbStorage tras detectarse falla M1 en GitHub Actions (66/67 tests aprobados en la versión ANTERIOR). Nueva ejecución GitHub Actions pendiente, no afirmar verde. SQL MIG-01 fail-closed con evidencia por operación preparado, datos Railway no modificados. Pendientes COM/OPE PostgreSQL, consentimiento Legal y Staging E2E antes de main.

**Cierre de PR #9, 12-oct-2026 — INTEGRADO SIN DESPLEGAR:** PR #9 fusionado mediante squash en `integration/phase-1a1-base-segura` al commit `6aa473ace5d12910b4975ae5505b9ebe6ad2d0f4`. CI exacto SHA `5ba4faae` [run 38314217052](https://github.com/frcb79/CreditoNegocios/actions/runs/38314217052) **SUCCESS**: TypeScript y build OK, **69/69 pruebas unitarias** (`b2-financial-qa-consolidation`, documentos, matching M1, seguridad y atribución), **11/11 PostgreSQL aislado** (8/8 `0005`, 3/3 `0004`). Cambios: modelo Master con cuota 0, RBAC CLABE/auditoría y catálogo, proyección Admin, pago manual UI, Matching M1/M2 y sección UI M3, publicación metadatos de oferta coherente, migración `0004` con revisión explícita por registro antes de inferir canal. **Importante: NO implica Staging ni producción aprobados.** `main` sigue detrás, Railway Production y Staging continúan ligados a `main`. P0 pendientes: conciliación histórica real de operaciones antes de ejecutar SQL, transacciones concurrentes comisión/desembolso/aceptaciones comerciales, consentimiento Legal, seguridad E2E, preparación de un Staging aislado (no desplegar rama candidata contra producción). No realizar merge a main hasta cierre de gates.

## Ciclo de control

Por cada ID: identificar archivo/endpoint, test (negativo y positivo), evidencia de ejecución (SHA y entorno), estado `sin verificar | aprobado | observado | diferido expresamente`, fecha y responsable. No marcar aprobado por mera declaración en conversación o existencia de código en otra rama.

**Regla operativa (11-oct-2026):** Legal + Red Comercial se han integrado localmente hasta `6c3cca5`; sigue Fase 2 por bloques selectivos. **MIG-01 impide ejecutar `0004`, pero no impide recuperar código financiero sin migrar datos.** Este archivo no autoriza que AG implemente todos los pendientes a la vez ni que modifique main. Actualizar el inventario por diferencias verificadas sin duplicar el Plan Maestro.

## Registro de implementación COM-28 — 14-oct-2026
Sin cambiar la decisión histórica COM-28/LEG-17: se añadió instrumento de comisiones *por oferta y versión*, separado de condiciones globales y comisiones de red, utilizando `legal_document_versions` y `legal_acceptances` ya existentes. PostgreSQL genera el documento económico atomizado con la publicación de la oferta; Broker directo y Master deben confirmar su propia cuota materialmente cambiada antes de nueva operación de la versión. Broker de red **no firma ni visualiza** la cuota mayorista Master; sus condiciones individuales permanecen sometidas a documento de red. Las operaciones congeladas conservan su economía.
**Estado:** código commiteado en rama única, no aprobado para GO hasta CI del SHA exacto, pruebas PostgreSQL aisladas, segregación/E2E y revisión legal de la presentación del consentimiento. No se ejecutó infraestructura ni migración.
