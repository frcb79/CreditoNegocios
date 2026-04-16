# Landing source of truth

## Archivo oficial

El único archivo editable de la landing es:

- `landing/index.html`

## Archivos generados automáticamente

No editar manualmente estos archivos porque se regeneran en cada build:

- `public/index.html`
- `public/landing.html`
- `dist/public/index.html`
- `dist/public/landing.html`

## Builds correctos

Desde la raíz del proyecto:

```powershell
npm run build:client
```

Desde la carpeta landing:

```powershell
npm run build
```

## Nota

Las copias históricas solo deben conservarse como referencia o redirección. La versión válida para producción sale siempre de `landing/index.html`.
