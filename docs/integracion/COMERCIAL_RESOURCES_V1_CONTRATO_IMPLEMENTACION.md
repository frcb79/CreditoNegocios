# COM-RES-001 — Biblioteca Comercial: contrato de desarrollo y pendientes de diseño

**Estado:** primer bloque implementado en PR #18 Draft. No apto para publicar contenido real hasta revisión visual/legal.

## Decisiones aprobadas (23-oct-2026)

1. **Super Admin** es el único que importa, versiona, aprueba/publica o retira plantillas y contenido. No puede publicar un Broker ni un Master Broker.
2. **Broker / Master** ve exclusivamente campañas publicadas; el contenido no es editable. Debe mostrar nombre personal/comercial y teléfono/WhatsApp validado, además de logo institucional; no se exporta contenido incompleto.
3. **Sugerencias**: formulario breve. Se registran en la bandeja de Super Admin sin estado, asignación, seguimiento ni respuesta obligatoria. No existe transición o herramienta de gestión adicional.
4. **Videos**: no se generan todavía; TikTok tiene portada y guion que deberán sustituirse por material MP4/CDN aprobado. Se reutilizarán los formatos 9:16 para reels/shorts.
5. **Ayuda**: contiene artículos de productos en español para capacitación comercial básica.
6. **Datos financieros**: ni porcentajes, ni aprobación garantizada, ni políticas se aceptan como entrada libre de brokers.

## Implementación lista para revisión

**Contrato archivo JSON por plantilla:**
- \`slug\`: identificador estable de campaña, p.ej. \`factoraje-proveedores\`.
- \`name\`, \`product\`, \`channel\`: metadatos obligatorios.
- \`definition.layout\`: editorial / minimal / split.
- \`definition.hero\`: geometric / rings / none (marcadores iniciales de composición).
- \`definition.colors\`: fondo, acento y frente (hex estricto).
- \`definition.headline\`, \`supportingLine\`, \`description\`, \`hook\`, \`cta\`, \`highlights\`: copy **bloqueado** aprobado por Super Admin.
- \`definition.allowedIdentityFields\`: opciones autorizadas para nombre, WhatsApp válido y logo institucional (obligatorios para los diseños actuales).
- El aviso legal obligatorio lo añade el renderizador; no es un campo libre.
- Archivos JSON máximo 32 KB y campos limitados por longitud; no se admite JavaScript ni HTML ni subida de media binaria.

**Permisos y API:**
- \`GET /api/commercial-resources/templates\` — sesión autenticada, solo plantillas publicadas.
- \`GET /api/admin/commercial-resources/templates\` — Super Admin, todas las versiones.
- \`POST /api/admin/commercial-resources/templates\` — Super Admin, guarda siguiente versión como borrador.
- \`POST /api/admin/commercial-resources/templates/:id/publish\` — Super Admin, publicación atómica y retiro de versión previa del mismo slug.
- \`POST /api/admin/commercial-resources/templates/:id/retire\` — Super Admin, retiro.
- \`POST /api/commercial-resources/suggestions\` — Broker y Master, con límites de envío.
- \`GET /api/admin/commercial-resources/suggestions\` — Super Admin, bandeja de solo lectura.

**Base de datos:** dos tablas aditivas, \`commercial_resource_templates\` y \`commercial_resource_suggestions\`; no cambia modelos de créditos, clientes, oportunidades, comisiones, cupones o afiliación. Sin migración destructiva ni seeds que publiquen material no aprobado.

## Lo que falta precisar con la conversación de diseño

1. **Formatos gráficos finales**. Canva/Figma no se convierten automáticamente a JSON estructurado. Debemos definir exportación de capas/campos, imágenes y carga de assets autorizados. La V0 utiliza héroes geométricos, no fotografías cargadas.
2. **Branding de Master**: ya existe identidad y logo en perfiles, pero falta un flujo de revisión y aprobación de esos logos para publicidad antes de habilitar su impresión.
3. **Revisión comercial/legal del lote inicial**: aprobar títulos, imágenes, uso de marca de Crédito Negocios, textos por producto y canal; definir leyendas de publicidad aplicables. No publicar diseños de prueba en cuentas de brokers reales.
4. **Captación medible**: enlaces de referencia por broker/campaña y atribución de leads con una landing segura. Esta función es independiente de cupones, protección de oportunidades y comisiones; requiere especificación separada.
5. **Distribución de videos**: origen de MP4, hosting/CDN, límites de peso y adaptaciones TikTok/Reels/Shorts. No subir videos pesados a Railway.

## Checklist antes de ir a main

- TypeScript/build y test suites completos.
- Pruebas en Staging por Super Admin y Broker/Master con diferentes permisos.
- Verificar que broker no ve borradores ni puede llamar endpoints Admin (403).
- Probar upload, versionado, reemplazo, retiro y catálogo vacío.
- Probar sugerencias (no publican contenido, no muestran estatus, sin acceso cruzado).
- Aprobar formatos visuales y contenido inicial; comprobar permisos y advertencias financieras.
- Definir migración/rollback y confirmar que Producción tenga esquema aditivo.
- **No mergear PR #18 antes de completar estos puntos.**


## Actualización 23-oct-2026 — identidad obligatoria y CTA medible

- La publicidad personalizada exige llenar los espacios diseñados: nombre, contacto y logotipo. En V0 el logotipo es Crédito Negocios; logos propios necesitan aprobación. No se permite exportar/copiar materiales con nombre o teléfono inválido o vacío.
- Se ajustó el contrato de plantillas JSON para exigir los tres campos de identidad.
- **CTA público, links individuales, medición y lead intake aún no implementados.** La arquitectura y fases están en el archivo docs/integracion/COMERCIAL_CTA_CAPTACION_ATRIBUCION_V1.md.
- Destinos futuros: landing propia para clientes finales (preferido), WhatsApp del asesor, sitio propio verificado. No aceptar URLs externas sin comprobación.
- Futuro: formulario con consentimiento, bandeja de captación, duplicados, validación comercial y asignación correcta a broker/master. Un clic por sí solo no crea exclusividad.
