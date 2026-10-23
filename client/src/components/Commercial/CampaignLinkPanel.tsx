import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Copy, MousePointerClick, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Overview = { clicks: number; links: number; received: number; linked: number };

export default function CampaignLinkPanel({
  selectedTemplateId,
  onCampaignLink
}: {
  selectedTemplateId?: string;
  onCampaignLink?: (url: string) => void;
}) {
  const { toast } = useToast();
  const [genericUrl, setGenericUrl] = useState("");
  const [campaignUrl, setCampaignUrl] = useState("");
  const [selectedForUrl, setSelectedForUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: overview } = useQuery<Overview>({
    queryKey: ["/api/commercial-resources/overview"],
    queryFn: async () => {
      const res = await fetch("/api/commercial-resources/overview", { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo consultar actividad");
      return res.json();
    },
    retry: false
  });

  const currentCampaignUrl = selectedForUrl === selectedTemplateId ? campaignUrl : "";
  async function makeLink(templateId?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/commercial-resources/links", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateId ? { templateId } : {})
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "No se pudo crear el enlace");
      const url = new URL(payload.path, window.location.origin).toString();
      if (templateId) {
        setCampaignUrl(url);
        setSelectedForUrl(templateId);
        onCampaignLink?.(url);
      } else setGenericUrl(url);
      toast({ title: "Enlace listo", description: "Pégalo en la publicación o compártelo directamente." });
    } catch (err: any) {
      toast({ title: "Error al obtener el enlace", description: err.message, variant: "destructive" });
    } finally { setBusy(false); }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Enlace copiado" });
    } catch {
      toast({ title: "Selecciona y copia el enlace manualmente", variant: "destructive" });
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-4" data-testid="campaign-link-panel">
      <h2 className="font-bold flex gap-2 items-center"><Link2 className="w-5 h-5 text-primary" /> Tus enlaces de captación</h2>
      <p className="text-sm text-muted-foreground">Estos enlaces llevan a un formulario de Crédito Negocios. Los prospectos que se registren aparecerán en Clientes → Prospectos recibidos, asociados a tu cuenta.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3 space-y-1">
          <MousePointerClick className="h-4 w-4 text-primary" />
          <p className="text-2xl font-bold" data-testid="campaign-clicks">{overview?.clicks ?? "—"}</p>
          <p className="text-xs text-muted-foreground">Aperturas del formulario</p>
        </div>
        <div className="rounded-lg border p-3 space-y-1">
          <Users className="h-4 w-4 text-primary" />
          <p className="text-2xl font-bold" data-testid="campaign-submissions">{overview?.received ?? "—"}</p>
          <p className="text-xs text-muted-foreground">Formularios recibidos</p>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Mi enlace personal (reutilizable)</p>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => makeLink()}
          data-testid="generate-personal-link">Obtener mi enlace</Button>
        {genericUrl && <div className="flex gap-2">
          <Input readOnly aria-label="Tu enlace personal" value={genericUrl} />
          <Button size="sm" variant="secondary" onClick={() => copy(genericUrl)} data-testid="copy-personal-link"><Copy className="h-4 w-4" /> Copiar</Button>
        </div>}
        <p className="text-xs text-muted-foreground">Compártelo en WhatsApp, correo, redes sociales o con cualquier posible prospecto. El enlace seguirá siendo tuyo.</p>
      </div>
      {selectedTemplateId && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-sm font-semibold">Enlace de la plantilla seleccionada</p>
          <Button type="button" size="sm" disabled={busy} variant="outline" onClick={() => makeLink(selectedTemplateId)}
            data-testid="generate-campaign-link">Generar enlace de esta campaña</Button>
          {currentCampaignUrl && <div className="flex gap-2">
            <Input readOnly aria-label="Enlace individual de campaña" value={currentCampaignUrl} />
            <Button size="sm" variant="secondary" onClick={() => copy(currentCampaignUrl)} data-testid="copy-campaign-link"><Copy className="h-4 w-4" /> Copiar</Button>
          </div>}
          <p className="text-xs text-muted-foreground">Para redes sociales, pega este enlace en el texto o campo de enlace disponible. Una imagen PNG no es clicable por sí sola.</p>
        </div>
      )}
    </section>
  );
}
