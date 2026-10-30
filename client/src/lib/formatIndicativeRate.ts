/**
 * Las fuentes V5 admiten fracciones decimales (0.18 = 18%) y descriptores
 * comerciales (TIIE + 8.15, 29.5% insoluta). Solo se convierten números
 * desnudos; el valor almacenado permanece intacto.
 */
export function formatIndicativeRate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) {
    const n = Number(text.replace(",", "."));
    if (!Number.isFinite(n)) return text;
    const pct = n > 0 && n < 1 ? n * 100 : n;
    return `${Number(pct.toFixed(4)).toLocaleString("es-MX", { maximumFractionDigits: 4 })}%`;
  }
  const fractionRange = text.match(/^(0[.,]\d+)\s*(?:-|–|a)\s*(0[.,]\d+)$/i);
  if (fractionRange) {
    return `${formatIndicativeRate(fractionRange[1])} – ${formatIndicativeRate(fractionRange[2])}`;
  }
  return text;
}
