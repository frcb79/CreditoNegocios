/**
 * Frontend hosts that already expose /api via Vercel external rewrites.
 * Prefer same-origin HTTP there: browser session cookies must never depend
 * on the visitor allowing third-party cookies for Railway.
 *
 * The landing site is intentionally excluded: it is a separate project.
 * For direct Railway/dev/custom hosts, keep the existing override behavior.
 */
export function usesFirstPartyApiProxy(hostname: string): boolean {
  const host=hostname.toLowerCase().replace(/\.$/, "");
  if(host==="app.creditonegocios.com.mx" ||
     host==="credito-negocios.vercel.app" ||
     host==="credito-negocios-staging.vercel.app")return true;
  if(/^credito-negocios-landing(?:-|\.)/.test(host))return false;
  // Vercel immutable deployment/preview URLs for these two app projects.
  return /^credito-negocios(?:-staging)?-[a-z0-9-]+\.vercel\.app$/.test(host);
}
