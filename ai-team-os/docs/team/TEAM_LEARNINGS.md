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
- **Hashes Criptográficos con JSON Anidado:** En JavaScript, pasar un arreglo de claves como segundo argumento a `JSON.stringify(obj, replacerArray)` filtra TODOS los objetos anidados con ese mismo arreglo; si los objetos hijos tienen claves diferentes, se descartan silenciosamente. Para hashing determinista de configuraciones complejas (como condiciones comerciales de ofertas), se debe ordenar recursivamente las claves del objeto antes de invocar `JSON.stringify`.
- **Versionado Aditivo vs Mutación en Catálogos Fintech (Bloque A1):** Nunca mutar ofertas comerciales in-place. La arquitectura de dos niveles (`financial_institution_offers` y `financial_institution_offer_versions`) permite conservar snapshots históricos inmutables de tasas, plazos y condiciones (`superseded`), de forma que las solicitudes de crédito pasadas preserven su trazabilidad jurídica exacta.
- **Aislamiento de Comisiones Internas de Plataforma:** Las comisiones internas (spread, app share) jamás deben incluirse en los modelos ni en las respuestas de ofertas comerciales para evitar fugas de información hacia brokers o master brokers.
- **Unificación Canónica vs Catálogos Duplicados (Bloque A1.1):** Preferir siempre unificar sobre la entidad canónica existente (`institution_products`) enriqueciéndola aditivamente y dotándola de su tabla de versiones (`institution_product_versions`) en vez de crear catálogos paralelos redundantes.
- **Bloqueos de Concurrencia e Índices Parciales Únicos:** La publicación de versiones debe estar blindada con transacciones atómicas que ejecuten un bloqueo exclusivo `SELECT ... FOR UPDATE` sobre el registro padre y estén respaldadas físicamente por un índice condicional único en PostgreSQL (`CREATE UNIQUE INDEX ON institution_product_versions (institution_product_id) WHERE status = 'published'`), garantizando que jamás existan dos versiones publicadas simultáneamente.
- **Documentación en Hashes de Integridad Legal:** Los documentos requeridos (`requiredDocuments`) deben formar parte integral del hash criptográfico SHA-256 para sellar legalmente los requisitos exigidos al cliente en esa versión de oferta.
- **Convención snake_case estricta en Migraciones SQL (Cierre Técnico A1.2):** Todo campo en PostgreSQL sin comillas dobles se convierte automáticamente a minúsculas. Por lo tanto, escribir `createdAt` en SQL genera la columna física `createdat`, provocando desincronización fatal con Drizzle ORM que busca `created_at`. Toda columna de timestamp o auditoría debe escribirse explícitamente como `created_at` tanto en archivos `.sql` como en `autoMigrate.ts`.
- **Blindaje de Métodos Legacy contra Bypass de Versionado:** Al introducir un modelo de ciclo de vida con gates de calidad (draft -> published), los endpoints y métodos legacy de mutación (`updateInstitutionProduct`) deben interceptar intentos de publicar directamente o de mutar condiciones financieras en ofertas ya publicadas, obligando al uso de nuevas versiones.
- **Desactivación Lógica Obligatoria ante Entidades Financieras con Historial:** En fintechs, nunca se debe ejecutar borrado físico en cascada ni desvincular llaves foráneas (`financial_institution_id = null`) en créditos o solicitudes vivas. Al invocar eliminación sobre entidades con historial, se debe ejecutar siempre una desactivación lógica (`isActive: false`, `status: 'archived'`), preservando el libro regulatorio y auditoría intactos.
- **Migración de Compatibilidad Legacy y Elegibilidad Real (A1.3):** Al introducir versionado a productos existentes, los registros legacy activos no deben asignarse indiscriminadamente a `draft`, sino migrarse a `published` con una versión inicial v1 publicada, asegurando continuidad comercial inmediata. Para ofertas nuevas, no se debe confiar ciegamente en el campo `status` de la oferta: el backend debe corroborar la existencia física de versiones con estado `published` antes de considerarlas elegibles para solicitudes, impidiendo el uso de ofertas en borrador.

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