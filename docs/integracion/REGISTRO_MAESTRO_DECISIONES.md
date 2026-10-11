# Crédito Negocios — Registro Maestro de Decisiones, Reglas y Controles

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
| LEG-14 | Descarga actualmente TXT; generar PDF profesional desde snapshot íntegro e inmutable, sin regenerar con perfil vigente. | Prelanzamiento |
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

## COM — Comisiones y economía

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| COM-01 | Financiera remunera a Crédito Negocios según términos de oferta. | Acordado |
| COM-02 | Porcentaje de comisión por oferta/version específica, no financiera global. | Acordado |
| COM-03 | Crédito Negocios fija retribución Master y Broker Directo dentro de condiciones autorizadas. | Acordado |
| COM-04 | Master acuerda retribución Broker de su red dentro de límites. | Acordado |
| COM-05 | Cargo de apertura al cliente no equivale a comisión pagada por la financiera. | Acordado |
| COM-06 | Distribución total no rebasa comisión recibida; canal Broker Directo y Master independientes. | Acordado |
| COM-07 | Congelar versión, tasa, originador y beneficiarios en evento comercial definido; resolver evento exacto. | Conciliar Fase 2 |
| COM-08 | Cambio de Master no cambia derecho económico histórico. | Acordado |
| COM-09 | Comisión definitiva se calcula sobre monto efectivamente dispersado y confirmado. | Acordado |
| COM-10 | Cambios materiales comunicados y expresamente aceptados, sin retroactividad indebida. | Acordado |
| COM-11 | Derechos devengados subsisten según convenio, incluso al terminar relación. | Acordado |
| COM-12 | Fraude/cancelación/compensaciones sujetos a reglas documentadas. | Verificar texto exacto |
| COM-13 | Sobretasas sólo Super Admin; márgenes internos Super Admin o Admin explícitamente autorizado. | Acordado |
| COM-14 | No fallback silencioso a tasas genéricas ni convertir dato ausente en 0. | Acordado |
| COM-15 | Oferta múltiple y multidispersión: no mezclar ni duplicar liquidaciones. | Verificar |

## PAG — Pago documental

| ID | Regla/criterio | Estado o hito |
|---|---|---|
| PAG-01 | Antes de pagar comisiones exigir identificación INE vigente, CSF y estado de cuenta bancario cargados y validados. | P0 antes de pagos reales |
| PAG-02 | Documentos bancarios/fiscales no bloquean registro, firma ni originación. | Acordado |
| PAG-03 | Gate de pago en servidor/STP y afines; no basta mostrar documento en UI. | Pendiente informado 1A.3B |
| PAG-04 | Validar beneficiario, cuenta y prueba; impedir pago duplicado o no confiable. | Prelanzamiento de pagos |

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

## Ciclo de control

Por cada ID: identificar archivo/endpoint, test (negativo y positivo), evidencia de ejecución (SHA y entorno), estado `sin verificar | aprobado | observado | diferido expresamente`, fecha y responsable. No marcar aprobado por mera declaración en conversación o existencia de código en otra rama.

**Regla operativa:** AG sigue con 1A.3C de manera acotada. Este archivo no autoriza que AG implemente todos los pendientes a la vez ni que modifique main. Actualizar el inventario por diferencias verificadas sin duplicar el Plan Maestro.
