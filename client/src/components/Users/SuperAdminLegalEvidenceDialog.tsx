import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/runtimeConfig";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDocumentTitle } from "@shared/legalDocuments";
import { Download, FileCheck2, ShieldCheck } from "lucide-react";

type Subject = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
};
type Acceptance = {
  id: string;
  document: string;
  version: string;
  acceptanceType: string;
  acceptedAt: string | Date;
  contentSha256: string;
};
type Overview = {
  userId: string;
  status: "formalized" | "pending" | "requires_new_acceptance";
  requiredDocuments: string[];
  acceptedDocuments: string[];
  latestAcceptedAt?: string | null;
};
type Evidence = {
  acceptance: Acceptance & {
    userEmail?: string; ipAddress?: string | null; userAgent?: string | null;
  };
  document?: { title: string; content: string; contentSha256: string } | null;
  snapshot?: {
    title?: string;
    personalizedContent?: string;
    templateSha256?: string;
    personalizedSha256?: string;
    evidence?: { otpMethod?: string; acceptedAt?: string };
  } | null;
  isPersonalized: boolean;
};
export function formalizationStatusLabel(status: Overview["status"] | string) {
  if (status === "formalized") return "Convenio formalizado";
  if (status === "requires_new_acceptance") return "Requiere nueva aceptación";
  return "Pendiente de formalización";
}
function dateLabel(value?: string | Date | null) {
  if (!value) return "Sin registro";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin registro" :
    date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}
async function getJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  if (!response.ok) throw new Error("No fue posible recuperar el historial legal.");
  return response.json();
}

export default function SuperAdminLegalEvidenceDialog({
  user, onClose,
}: { user: Subject | null; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const history = useQuery<{ user: Subject; formalization: Overview; acceptances: Acceptance[] }>({
    queryKey: ["/api/admin/legal/users", user?.id, "acceptances"],
    enabled: Boolean(user?.id),
    queryFn: () => getJson(`/api/admin/legal/users/${encodeURIComponent(user!.id)}/acceptances`),
  });
  const evidence = useQuery<Evidence>({
    queryKey: ["/api/admin/legal/users", user?.id, "acceptances", selected],
    enabled: Boolean(user?.id && selected),
    queryFn: () => getJson(`/api/admin/legal/users/${encodeURIComponent(user!.id)}/acceptances/${encodeURIComponent(selected!)}`),
  });
  const active = history.data?.acceptances.find(x => x.id === selected);
  const detail = evidence.data;
  const snapshotText = detail?.snapshot?.personalizedContent;
  const content = detail?.isPersonalized && snapshotText ? snapshotText : detail?.document?.content;
  const title = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : "";

  return (
    <Dialog open={Boolean(user)} onOpenChange={open => { if (!open) { setSelected(null); onClose(); } }}>
      <DialogContent className="max-w-4xl w-[96vw] max-h-[92vh] overflow-y-auto" data-testid="dialog-admin-legal-evidence">
        <DialogHeader>
          <DialogTitle>Convenios y evidencias · {title}</DialogTitle>
          <DialogDescription>
            Consulta exclusiva de Super Admin. Documentos históricos inmutables; nunca se firman ni modifican en nombre del usuario.
          </DialogDescription>
        </DialogHeader>
        {history.isLoading ? <p className="text-sm">Consultando evidencias...</p> :
          history.isError ? <p className="text-sm text-destructive">No se pudo consultar el expediente legal.</p> :
          history.data && <>
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={history.data.formalization.status === "formalized" ? "default" : "outline"}
                  data-testid="admin-legal-status">
                  {formalizationStatusLabel(history.data.formalization.status)}
                </Badge>
                <span className="text-muted-foreground text-xs">{history.data.user.role === "master_broker" ? "Master Broker" : "Broker"}</span>
              </div>
              <p className="text-xs text-muted-foreground">{history.data.user.email}</p>
              <p className="text-xs">Documentos vigentes aceptados: {history.data.formalization.acceptedDocuments.length} de {history.data.formalization.requiredDocuments.length}</p>
              <p className="text-xs">Última aceptación registrada: {dateLabel(history.data.formalization.latestAcceptedAt)}</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Historial completo de aceptaciones</h3>
              {history.data.acceptances.length === 0 ? <p className="text-sm text-muted-foreground">Este usuario aún no tiene aceptaciones registradas.</p> :
                history.data.acceptances.map(a => (
                  <div key={a.id} className="rounded-md border p-3 flex flex-wrap gap-2 items-center justify-between"
                    data-testid={`admin-legal-acceptance-${a.document}-${a.version}`}>
                    <div className="space-y-1 text-xs">
                      <p className="font-medium flex items-center gap-1"><FileCheck2 className="w-3.5 h-3.5" /> {getDocumentTitle(a.document)} · v{a.version}</p>
                      <p className="text-muted-foreground">{dateLabel(a.acceptedAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" type="button" onClick={() => setSelected(a.id)}
                        data-testid="button-view-admin-legal-detail">Ver evidencia</Button>
                      <Button variant="outline" size="sm" type="button"
                        onClick={() => window.open(buildApiUrl(`/api/admin/legal/users/${encodeURIComponent(user!.id)}/acceptances/${encodeURIComponent(a.id)}/comprobante`), "_blank", "noopener,noreferrer")}
                        data-testid="button-download-admin-legal-pdf">
                        <Download className="w-3.5 h-3.5 mr-1" /> Comprobante PDF
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
            {selected && <section className="border rounded-md p-3 space-y-3" data-testid="admin-legal-detail">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-sm">Evidencia histórica: {active && getDocumentTitle(active.document)}</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>Cerrar detalle</Button>
              </div>
              {evidence.isLoading ? <p className="text-sm">Abriendo documento original...</p> :
                evidence.isError ? <p className="text-sm text-destructive">No fue posible recuperar la evidencia.</p> :
                detail && <>
                  <div className="text-xs space-y-1">
                    <p><ShieldCheck className="inline w-3.5 h-3.5 mr-1" /> Firma registrada: {dateLabel(detail.acceptance.acceptedAt)}</p>
                    <p>Medio: {detail.snapshot?.evidence?.otpMethod || "Aceptación electrónica registrada"}</p>
                    <p>IP: {detail.acceptance.ipAddress || "No registrada"}</p>
                    <p>Navegador: {detail.acceptance.userAgent || "No registrado"}</p>
                    <p className="break-all">Huella SHA-256 del documento exacto: {detail.snapshot?.personalizedSha256 || detail.acceptance.contentSha256}</p>
                    <p className="break-all">Huella SHA-256 de plantilla: {detail.snapshot?.templateSha256 || detail.document?.contentSha256 || "No registrada"}</p>
                  </div>
                  {content ? <div className="rounded border bg-muted/20 p-3 max-h-80 overflow-y-auto whitespace-pre-wrap text-xs"
                    data-testid="admin-legal-exact-document">{content}</div> :
                    <p className="text-xs text-muted-foreground">El contenido histórico no está disponible. Conserva el registro de aceptación para revisión.</p>}
                </>}
            </section>}
          </>}
      </DialogContent>
    </Dialog>
  );
}
