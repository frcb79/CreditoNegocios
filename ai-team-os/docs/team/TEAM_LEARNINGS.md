# TEAM LEARNINGS — Aprendizajes del Equipo
Se actualiza via sync desde cada proyecto al master.

## APRENDIZAJES DE COMUNICACION CON EL CEO
- El CEO decide mejor cuando la explicacion inicia en negocio y no en tecnologia.
- Traducir siempre decisiones a tiempo, dinero, riesgo y oportunidad reduce friccion.
- Reportes cortos, directos y con recomendacion final clara aceleran ejecucion.
- **Marketing Estratégico:** El cliente no compra "código", compra "certeza de negocio" y "ROI". Enfocar el copy en el activo, no en la herramienta.

## APRENDIZAJES DE PROCESO
- No empezar una sesion sin leer PROJECT_BRAIN, ERROR_LOG, DECISIONS y CEO_OS.
- Cada sesion debe cerrar con actualizacion de memoria para evitar perdida de contexto.
- Estandarizar roles reduce dependencia de improvisacion entre proyectos.
- Este sistema debe operar como activo vivo: cada proyecto aporta mejoras reutilizables.
- **Protocolo de Intake:** Realizar un "Strategy Intake" antes del discovery técnico asegura que el desarrollo esté alineado con la oferta de mercado (Godfather Offer).

## APRENDIZAJES TECNICOS
- Mantener convenciones consistentes de documentos facilita adopcion en nuevos repos.
- Definir claramente activacion y reglas de cada rol mejora coordinacion entre areas.
- En proyectos con IA, medir calidad y costo desde el inicio evita escalamiento ineficiente.
- **En desarrollo de Landings:** Considerar SIEMPRE desde el día 1 la mejor tecnología para maximizar rendimiento de ADS, SEO y SEM. (Ej: SSR/SSG en vez de SPAs pesadas).
- **Lógica condicional imperativa en JSX:** Todo bloque JSX que utilice `const`, `let`, `if/return` para renderizado dinámico debe estar obligatoriamente envuelto en un IIFE `{(() => { ... })()}`. esbuild y los minificadores de Vercel/Vite no admiten declaraciones sueltas dentro de árboles JSX y rompen el build con error de sintaxis críptico (`Unexpected "const"`).
- **Multi-Dispersión en Fintech:** Los flujos de crédito deben soportar que el requerimiento de un cliente se satisfaga en partes por múltiples instituciones (préstamos sindicados o paralelos). La entidad padre no debe cerrarse prematuramente mientras existan propuestas hermanas en evaluación o aceptación.
- **Sincronización Estricta Drizzle ORM vs PostgreSQL:** Todo campo nuevo declarado en un `pgTable` de `schema.ts` (ej. `referral_code`) DEBE tener de inmediato su sentencia `ADD COLUMN IF NOT EXISTS` en `autoMigrate.ts`. Drizzle siempre genera `SELECT` con todas las columnas del modelo; si una sola columna falta en la tabla física de Postgres, PostgreSQL cancela la consulta con `error: column does not exist`, retornando `undefined` silencioso en repositorios y bloqueando por completo el Login y Forgot-Password.
- **Capa de Resiliencia en Autenticación con SQL Nativo:** Las funciones críticas de lectura de usuario (`getUser`, `getUserByEmail`) deben tener siempre un bloque de respaldo en SQL directo (`pool.query('SELECT * FROM users WHERE LOWER(email) = ...')`). De esta forma, cualquier discrepancia futura de esquema en el ORM no dejará al CEO ni a los clientes fuera del sistema.
- **Builds en Railway / Nixpacks con `NODE_ENV=production`:** Cuando Railway inyecta `NODE_ENV=production`, `npm ci` omite las `devDependencies`. Toda herramienta requerida para el build (`vite`, `@vitejs/plugin-react`, `esbuild`, `typescript`, `tailwindcss`) debe estar en `dependencies` de `package.json` o forzarse vía `nixpacks.toml` con `NPM_CONFIG_PRODUCTION="false"` y `npm ci --include=dev`.
- **Inmutabilidad en PostgreSQL con Triggers BEFORE UPDATE:** Para entidades donde la atribución económica histórica jamás debe modificarse ante cambios organizativos futuros (ej. `origin_master_broker_id`), la forma más robusta es un trigger `BEFORE UPDATE OF <columna>` que verifique `IF NEW.col IS DISTINCT FROM OLD.col THEN RAISE EXCEPTION`. Esto blinda la base de datos contra cualquier intento de bypass por código de backend, scripts ad-hoc o interfaces administrativas.
- **Desempate Determinista en Colecciones Ordenadas por Timestamp:** En entornos de prueba o ejecución intensiva donde múltiples mutaciones ocurren en el mismo milisegundo (`Date.now()`), `sort((a,b) => b.createdAt - a.createdAt)` no es determinista si `diff === 0`. Utilizar un tie-breaker secundario basado en el orden natural de inserción o ID garantiza estabilidad al 100%.
- **Preservación de Tenants en Transiciones Organizacionales:** Al promover a un Broker a Master Broker o moverlo entre redes, NO se debe recrear el tenant ni cambiar su ID. Se debe preservar el mismo `tenantId` (y rol `owner`), modificando únicamente `parent_tenant_id` y `type`. Esto preserva intacta la identidad, historial de documentos, clientes y créditos asociados.

## ERRORES FRECUENTES — NO REPETIR
- Empezar proyectos desde cero sin reutilizar aprendizajes previos.
- Crear roles sin criterios de activacion y sin reglas operativas.
- Presentar metricas sin contexto de negocio ni accion recomendada.
- **Dejar QA y Seguridad como roles pasivos** — deben activarse automáticamente, no esperar a ser llamados.
- **No definir handoffs entre roles** — cada rol debe saber a quién entrega y de quién recibe.
- **No tener sistema de logs estructurado** — sin trazabilidad, los errores se pierden y se repiten.
- **No tener rol de monitoreo continuo** — los bugs en producción se descubren cuando el cliente se queja.
- **Declaraciones `const` sin encapsular en JSX:** Olvidar la apertura `{(() => {` al hacer refactor de badges o condicionales dentro de un componente React.
- **Asumir que un crédito siempre tiene un solo desembolso:** Limitar la lógica a un único ganador rompe la experiencia comercial cuando el cliente requiere montos mayores y los fondea con varias financieras.
- **Agregar columnas a `schema.ts` sin sincronizar `autoMigrate.ts`:** Provoca que Drizzle falle en todas las queries que lean esa tabla al no encontrar la columna en la BD viva de PostgreSQL.
- **Sobrescribir roles RBAC masivamente en scripts de migración:** Modificar roles a ciegas en un bucle (`SET role = 'super_admin'`) destruye la matriz de pruebas de la plataforma. Cada cuenta debe mantener su rol explícito (`super_admin`, `master_broker`, `broker`).
- **Depender al 100% de la entrega de correo sin fallback en UI:** Si el proveedor de correo (Resend) sufre latencia o restricciones de DNS, el usuario queda incomunicado. Exponer el enlace de reseteo directo en el log y en la interfaz para cuentas de prueba garantiza continuidad operativa.
- **Delimitadores `DO $` de un solo dólar en scripts PL/pgSQL:** En PostgreSQL, un bloque anónimo requiere delimitadores válidos (`$$` o `$body$`). Un delimitador con un solo `$` aborta la migración con error de sintaxis.
- **Ordenar por `getTime() - getTime()` sin desempate en memoria:** En pruebas automatizadas concurrentes, dos inserciones en el mismo milisegundo provocan orden no determinista si no se incluye `(logs.indexOf(b) - logs.indexOf(a))`.

## PATRONES QUE FUNCIONAN MUY BIEN
- Framework comun de roles + protocolos + memoria de proyecto.
- Actualizar DECISIONS y CHANGELOG cuando cambia la forma de trabajo.
- Cerrar cada sesion con pendientes claros para la siguiente ejecucion.
- **Pipeline de entrega con gates obligatorios** — Dev → QA ✅ → Security 🔒 → Deploy → Monitor.
- **Activación automática de roles de protección** — QA y Seguridad no esperan, actúan por defecto.
- **Handoffs explícitos con formato** — reduce ambigüedad y pérdida de contexto entre roles.
- **ERROR_LOG estructurado** — con IDs, severidad, área, estado y causa raíz para trazabilidad.
- **Vistas segmentadas 3-en-1 para administración:** Dividir redes complejas en tabs claras (Master Brokers con acordeón, Independientes, Red Directa) para evitar tablas sobrecargadas y mantener control granular.
- **Fallback SQL nativo en autenticación:** Asegurar que `getUser` y `getUserByEmail` consulten la base de datos con SQL crudo si el ORM falla, blindando el acceso al sistema.
- **Aislamiento de pasos en auto-migración:** Envolver cada sentencia `ALTER TABLE` o actualización de usuario en bloques independientes `try/catch` para que una advertencia secundaria nunca aborte el proceso general.
- **Congelamiento de filiación en 4 etapas (Lineage):** Oportunidad (`master_broker_id`) -> Solicitud (`origin_master_broker_id`) -> Crédito (`origin_master_broker_id`) -> Comisión. Las 4 retienen la filiación de origen sin mutar si el broker cambia de Master posteriormente.
- **Gobernanza desacoplada de reactivación:** El Master Broker puede suspender de inmediato por seguridad operativa, pero la reactivación está estrictamente reservada a Super Admin vía solicitud formal auditada (`user_status_requests`).
- **Middleware Canónico vs Verificación Ad-hoc de Sesión:** En endpoints de contratos privados o evidencias, jamás usar comprobaciones manuales de `req.user` o IDs sueltos. Debe invocarse el middleware canónico `isAuthenticated` que audita el estado del usuario en la base de datos y rechaza con 401 cuentas inactivas (`isActive === false`) o suspendidas (`status === 'suspended'`). Los documentos no existentes deben responder 404 antes de evaluar credenciales.
- **Aislamiento Multiusuario y Control de Caché en UI (React Query):** Todas las queries de documentos privados o evidencias contractuales (`LegalDocumentPage`, `AcceptedDocumentDetailDialog`, `BrokerFormalizationDialog`) deben incluir el `user?.id` en la `queryKey` y condicionar `enabled` a una sesión activa. Al cambiar la identidad del usuario (`currentUser.id`), los modales deben cerrarse y la selección de aceptaciones debe limpiarse para evitar fugas visuales entre sesiones.
- **Aislamiento Estricto de Evidencias Propias en Perfil:** En `AcceptedDocumentDetailDialog`, no consultar ni renderizar evidencia sin sesión o si `acceptance.userId` no coincide con el usuario autenticado. La vista de Perfil muestra exclusivamente documentos propios y debe cerrarse de inmediato ante desajustes de identidad.
- **Sincronización Inmediata y Mutual Exclusivity en Flujos OTP:** Los valores de cooldown y expiración deben computarse sincrónicamente al recibir la respuesta del servidor (evitando el retraso del timer de 1s). Las acciones de solicitar, reenviar y verificar deben ser mutuamente excluyentes (evitar llamadas concurrentes). Ante agotamiento de intentos (`remainingAttempts === 0`), la UI debe exigir reinicio completo y limpiar timers y contadores, manteniendo las casillas desmarcadas.
- **Banners Reactivos en UI y Exactitud Legal en Copy:** Banners exteriores (como en `Settings.tsx`) deben vincularse a la query del estado del usuario y desaparecer tan pronto la formalización concluya. El copy no debe prometer "concesión automática de facultades", sino clarificar que se completa el requisito contractual, mientras que los permisos operativos de la cuenta siguen aplicando normalmente.
- **Enforcement Gate en Servidor (Rutas y Código Canónico):** El rechazo operativo por falta de formalización debe responder con código `FORMALIZATION_REQUIRED` (403 Forbidden) en las rutas de registro de clientes (`POST /api/clients`) y prospectos (`POST /api/mortgage-leads`).
- **Disponibilidad Documental y Casillas Desmarcadas:** Los textos completos de convenios y reglas deben estar inmediatamente disponibles para consulta y las casillas deben iniciar desmarcadas por defecto para asegurar el consentimiento explícito sin asumir ni afirmar verificaciones automáticas de lectura previa.
- **Validación del Broker Originador Efectivo (vs. Payload Directo):** En arquitecturas multitenant o con delegación, nunca se debe confiar en el `brokerId` enviado por el cliente web sin resolver la identidad efectiva con los permisos de la sesión (`validateCommercialOrigination`). Si un admin o colaborador actúa en nombre de un broker, el gate de formalización (`validateEffectiveBrokerFormalization`) debe evaluar al broker beneficiario de la operación.
- **Diferenciación entre Permisos Organizacionales y Requisitos Contractuales:** `validateCommercialOrigination` gestiona la capacidad y pertenencia a la red/tenant, mientras que `validateEffectiveBrokerFormalization` audita el cumplimiento de documentos legales vigentes (Convenio, Reglas de Red, Reglas Master). Ambos controles deben coexistir en un pipeline unificado (`validateCommercialOriginationAndFormalization`) para evitar lagunas de cumplimiento.
- **Ascenso a Master Broker y Reglas Dinámicas:** Si un broker asciende a `master_broker`, la plataforma debe requerir inmediatamente los documentos adicionales aplicables (`reglas-master`) antes de permitirle originar nuevas operaciones, sin anular los convenios y reglas de red previamente firmados.
- **Rate Limit de OTP en Pruebas Automatizadas:** Los mecanismos de seguridad de OTP (cooldown de 60s entre envíos para el mismo usuario) deben respetarse en las suites de prueba; para probar transiciones de rol consecutivas se deben usar identidades limpias o emular el paso temporal.
- **Resolución Bancaria desde el Linaje Histórico de la Operación (No desde el Estado Actual del Broker):** Al dispersar o consultar comisiones para STP, el beneficiario bancario (`effectiveBankAccount` y `effectiveBeneficiary`) debe resolverse obligatoriamente del `masterBrokerId` o `originMasterBrokerId` grabado inmutablemente en el crédito u operación, jamás de `brokerUser.masterBrokerId`. Si el broker se transfiere a otro Master, los desembolsos de créditos originados bajo el Master anterior pertenecen y se pagan al Master histórico.
- **Inmutabilidad y Blindaje de la CLABE de Dispersión (Anti-Spoofing):** La interfaz de usuario nunca debe permitir la edición manual de la CLABE al confirmar una dispersión; debe mostrar la CLABE oficial en modo de solo lectura. En el backend, el servicio debe usar la CLABE del expediente formalizado del beneficiario y rechazar con error 400 cualquier discrepancia con parámetros enviados en el payload del cliente, impidiendo desvíos fraudulentos de fondos.

