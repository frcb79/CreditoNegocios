# Preparación del lanzamiento: bloques legales

Todos los usuarios y operaciones existentes son datos de prueba. Esta aclaración simplifica la migración, pero no autoriza borrar datos ni desplegar cambios sin revisión.

## Bloque 1: documentos públicos

El catálogo `server/legalDocumentCatalog.json` conserva el texto de los cinco documentos aprobados V1.0. Sólo Términos y Aviso tienen fecha exacta de vigencia documentada y se publican en este bloque; los tres documentos de formalización quedan como plantillas para el siguiente bloque. El texto proviene de los Word aprobados, con normalización de saltos de línea y eliminación de espacios exteriores. El SHA-256 identifica ese texto, no los bytes del Word ni un PDF firmado.

- `/legal/terminos` y `/legal/aviso` son accesibles con o sin sesión.
- `/api/legal/terminos` y `/api/legal/aviso` entregan la versión vigente. `?version=1.0` fija una versión específica ya vigente.
- Los enlaces están en acceso/registro, perfil y footer del sitio comercial. El dominio comercial redirige las rutas legales al dominio de la aplicación.
- El catálogo y las rutas son de lectura; no registran aceptaciones, no ejecutan migraciones ni envían correos.

Para publicar una revisión, agregar otra entrada con identidad distinta y su fecha de vigencia. No modificar ni borrar entradas ya aceptadas. El siguiente bloque debe persistir cada versión y su texto/hash en la base de datos con protección contra modificaciones; Git y este catálogo por sí solos no constituyen evidencia de aceptación.

## Bloques siguientes, una rama y responsable por bloque

1. **Registro y evidencia (AG).** Persistir versiones; exigir Términos y reconocimiento del Aviso por separado; registrar usuario, correo, fecha del servidor, IP obtenida de proxies confiables, user-agent y versión/hash. Validar en servidor todas las vías de registro. No exigir Convenio al crear cuenta. Probar contra staging.
2. **Formalización (AG).** Convenio + Reglas de la Red; incluir Reglas Master cuando corresponda. OTP al correo registrado, expiración, intentos limitados y uso único ligado al usuario y al conjunto exacto de versiones. Bloquear todas las vías de alta de clientes/originación hasta formalizar; permitir navegar y completar perfil. Generar y conservar copia/PDF inmutable y mostrar documentos/historial en perfil.
3. **Ofertas, Match y condiciones comerciales (AG).** Variantes por Financiera + Producto, tipo de persona y garantía. Garantía disponible permite opciones con y sin garantía; ingresos por encima del mínimo conservan elegibilidad. Versiones comerciales, popup sólo para cambios materiales y referencia fija por oportunidad. El monto definitivo de comisión se calcula sobre la dispersión real. Precisar el momento en que se fija el porcentaje antes de implementar ese cálculo.
4. **Protección y caducidad (AG).** Conciliar reglas aprobadas de 90/120 días, extensiones por proceso y 12 meses post-dispersión con la lógica existente antes de activar formalización para usuarios reales. Cubrir liberación, reactivación, reasignación e historial, sin inventar umbrales.
5. **Consentimiento financiero/patrimonial y salida a producción.** Obtenerlo donde se capturan o comparten datos de clientes. Verificar de principio a fin registro → formalización → cliente → oferta → dispersión → comisión, incluyendo Master Broker, rechazos y caducidades. Preparar limpieza de pruebas, conservar sólo configuración validada y hacer ensayo de lanzamiento.

Aquí se revisan los contratos de datos, decisiones, pantallas pequeñas y resultados de cada bloque. AG se encarga de cambios transversales, migraciones y pruebas de staging. No trabajar en paralelo sobre los mismos archivos ni acumular varios bloques sin verificación.
