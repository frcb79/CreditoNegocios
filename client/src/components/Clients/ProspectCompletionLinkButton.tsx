import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { getAppBaseUrl } from "@/lib/runtimeConfig";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function ProspectCompletionLinkButton({ clientId, leadId }: { clientId?: string; leadId?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  if (!user || !["broker", "master_broker"].includes(user.role)) return null;
  async function generate() {
    setBusy(true);
    try {
      const response = await apiRequest("POST", "/api/commercial-resources/completion-links", { ...(clientId ? { clientId } : {}), ...(leadId ? { leadId } : {}) });
      const data = await response.json();
      setUrl(new URL(data.path, getAppBaseUrl()).toString()); setExpiresAt(data.expiresAt);
    } catch (error: unknown) { toast({ title: "No se pudo generar el enlace", description: error instanceof Error ? error.message : "Intenta nuevamente", variant: "destructive" }); }
    finally { setBusy(false); }
  }
  return <>
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={generate} data-testid="prospect-completion-link">{busy ? "Preparando…" : "Crear Enlace a Prospecto"}</Button>
    <Dialog open={Boolean(url)} onOpenChange={open => { if (!open) setUrl(""); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Enlace para tu prospecto</DialogTitle><DialogDescription>Envíalo al prospecto con quien ya hablaste para que capture sus datos directamente. Su información quedará asociada a tu cuenta{clientId ? " y a esta ficha" : ""}.</DialogDescription></DialogHeader>
      <Input aria-label="Enlace para completar información" readOnly value={url} />
      <p className="text-sm text-muted-foreground">Válido hasta {expiresAt ? new Date(expiresAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" }) : "—"}. Se utiliza una vez. Si vence puedes generar otro.</p>
      <Button onClick={async () => { try { await navigator.clipboard.writeText(url); toast({ title: "Enlace copiado" }); } catch { toast({ title: "Selecciona y copia el enlace manualmente" }); } }}>Copiar enlace</Button>
    </DialogContent></Dialog>
  </>;
}
