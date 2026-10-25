# Crédito Negocios — Contrato de clasificación V2 para ZIP comercial

## Archivo por diseño
El integrador recibe pares `fondo_maestro.png` (o `fondo_maestro_1080x1350.png`) y `mapa_campos.json` en carpetas reconocidas. No se modifica el PNG, su hash ni los campos de personalización.

El bloque `catalog` es **opcional por compatibilidad con los ZIP anteriores** y, cuando aparece, debe tener exactamente estas cuatro propiedades:

```json
"catalog": {
  "product": "tpv_anticipo",
  "format": "4:5",
  "style": "explicativo",
  "topic": "Liquidez basada en ventas con tarjeta"
}
```

Insertar el bloque en el mismo nivel del JSON que `slug`, `name`, `campaignId`, `canvas`, `assets`, `fields` y `approvedCopy`. No reemplazar esos campos. **El nombre es `name` y el slug es `slug`**, no duplicar dentro de catalog.

## Productos (`catalog.product`)
- `simple` — Crédito Simple
- `revolvente` — Crédito Revolvente
- `factoraje` — Factoraje
- `arrendamiento` — Arrendamiento (variantes vehicular/maquinaria se describen en `topic`)
- `hipotecario` — Hipotecario
- `tpv_anticipo` — Anticipo de ventas TPV
- `institucional` — Campañas generales

## Formatos (`catalog.format`)
- `4:5` — canvas 1080 × 1350
- `1:1` — canvas 1080 × 1080
- `9:16` — canvas 1080 × 1920

## Estilos (`catalog.style`)
`llamativo`, `explicativo`, `institucional`, `promocional`, `informativo`.

`catalog.topic` es una descripción breve (3 a 160 caracteres), sin etiquetas ni saltos de línea, que se usa en el buscador.

El importador compara `catalog.product` con `campaignId` cuando este último se reconoce; no acepta inconsistencias. Acepta algunos identificadores V4 heredados como `simple_tpv`, `simple_garantia`, `arrenda_maquinaria`, `institucional_broker` y `tpv_anticipo`. Si se omite el bloque, conserva la clasificación heredada, pero rechaza categorías desconocidas en lugar de colocarlas silenciosamente en Crédito Simple.

## Publicación y eliminación
Importar siempre crea **borradores**. Sólo Super Admin publica tras revisión. Cada nueva importación recibe un `batchId`; se puede seleccionar el lote y eliminar sus borradores no usados, o seleccionar varios borradores filtrados de lotes anteriores. Los publicados, retirados y vinculados a campañas/prospectos están protegidos.

No incluir `catalogo_plantillas.csv` dentro del ZIP operativo; usarlo sólo como control creativo externo.
