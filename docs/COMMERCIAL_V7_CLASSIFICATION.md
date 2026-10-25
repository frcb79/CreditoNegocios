# Recursos Comerciales — Contrato de clasificación V7

**Objetivo:** reconocer metadatos editoriales que ya vienen en `mapa_campos.json` sin modificar PNG ni textos aprobados. El importador mantiene el ZIP y contrato gráfico existentes.

Los paquetes V7 utilizan el bloque siguiente a nivel raíz (hermano de `campaignId`, `slug`, `canvas`, `approvedCopy`, `assets`, `fields`):

```json
"classification": {
  "name": "Convierte tus ventas en liquidez",
  "product": "Anticipo de ventas TPV",
  "productId": "tpv_anticipo",
  "slug": "tpv-anticipo-liquidez-01-v1",
  "format": "4:5",
  "style": "explicativo",
  "theme": "Liquidez basada en ventas con tarjeta"
}
```

`leasingSubtype` opcional exclusivamente cuando `productId` es `arrendamiento`: `vehicular` o `maquinaria_equipo`.

Identificadores válidos: `simple`, `revolvente`, `factoraje`, `arrendamiento`, `hipotecario`, `tpv_anticipo` e `institucional`. Estilos: `llamativo`, `explicativo`, `institucional`, `promocional`, `informativo`. Formatos: `4:5`, `1:1`, `9:16` según canvas de 1080 × 1350, 1080 × 1080 o 1080 × 1920 px.

## Compatibilidad y seguridad
- Si existe `classification`, se convierte a los metadatos internos `product`, `style`, `topic` y `leasing_subtype`, sin sobreescribir campos de personalización, tipografías, CTA, `campaignId`, `slug`, copys o imagen.
- Si no existe pero hay `catalog` V2, se mantiene el contrato V2.
- Si no existe ninguno, se preserva el fallback histórico de `campaignId` para los mapas antiguos.
- Si hay `classification` y `catalog` simultáneamente, los valores comunes deben ser idénticos.
- Los metadatos quedan disponibles para filtrar el catálogo tanto en Super Admin como en Broker/Master; los usuarios externos solo ven versiones publicadas.
- Los importados quedan siempre **en borrador**, pendientes de revisión y publicación explícita. Los seis diseños nuevos de Revolvente y TPV pueden importarse por separado.

**Limitación de prueba:** el repositorio incluye pruebas sintéticas del contrato y de regresión; la validación definitiva de los 47 JSON y de los tres ZIP requiere los paquetes reales.
