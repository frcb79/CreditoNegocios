# Recursos Comerciales — política de identidad en piezas gráficas

Fecha: 2026-10-26

## Decisión aprobada

Las piezas gráficas para Broker y Master Broker muestran únicamente:

- nombre o nombre comercial autorizado;
- WhatsApp válido;
- logotipo institucional oficial de Crédito Negocios como parte fija del diseño.

No se muestra foto, avatar, iniciales ni logotipo propio del Broker/Master en la pieza final.

## Razón de producto

La personalización debe ser discreta, consistente y no competir con el mensaje principal. El pie de página concentra la identidad variable; la marca Crédito Negocios permanece fija en el diseño aprobado.

## Alcance técnico

- El renderizador gráfico compone solo nombre + WhatsApp.
- Los campos BROKER_LOGO existentes en mapas V8 se conservan por compatibilidad de importación, pero no se renderizan.
- No se alteran copy, fotografías, CTA ni composición principal desde el renderer.
- El cambio de ubicación del logo institucional al footer se realizará en los maestros gráficos V8, no mediante un segundo logo dinámico.

## Fuera de alcance

No cambia RBAC, clientes, oportunidades, matching, comisiones, tracking ni permisos.
