/**
 * Semáforo informativo del score: independiente de los requisitos excluyentes.
 * Los datos insuficientes nunca se interpretan como resultado desfavorable numérico.
 */
export function getMatchingScoreTone(score: number, matchStatus?: string): "green" | "yellow" | "red" | "neutral" {
  if (matchStatus === "insufficient_data" || !Number.isFinite(score)) return "neutral";
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}
