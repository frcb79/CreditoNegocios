/** Only opaque public campaign/completion paths qualify as isolated guest journeys. */
export function isPublicProspectJourneyPath(pathname:string):boolean {
  return /^\/(?:c|completar-perfil)\/[A-Za-z0-9_-]{32}$/.test(pathname);
}
