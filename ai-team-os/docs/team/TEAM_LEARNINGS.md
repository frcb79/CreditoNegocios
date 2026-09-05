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

## PATRONES QUE FUNCIONAN MUY BIEN
- Framework comun de roles + protocolos + memoria de proyecto.
- Actualizar DECISIONS y CHANGELOG cuando cambia la forma de trabajo.
- Cerrar cada sesion con pendientes claros para la siguiente ejecucion.
- **Pipeline de entrega con gates obligatorios** — Dev → QA ✅ → Security 🔒 → Deploy → Monitor.
- **Activación automática de roles de protección** — QA y Seguridad no esperan, actúan por defecto.
- **Handoffs explícitos con formato** — reduce ambigüedad y pérdida de contexto entre roles.
- **ERROR_LOG estructurado** — con IDs, severidad, área, estado y causa raíz para trazabilidad.
- **Vistas segmentadas 3-en-1 para administración:** Dividir redes complejas en tabs claras (Master Brokers con acordeón, Independientes, Red Directa) para evitar tablas sobrecargadas y mantener control granular.