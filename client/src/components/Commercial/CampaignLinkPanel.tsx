import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Copy, MousePointerClick, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Overview = { clicks: number; links: number; received: number; linked: number };

export default function CampaignLinkPanel({
  onCampaignLink
}: {
  onCampaignLink?: (url: string) => void;
  selectedTemplateId?: string; // API compatibility: no template-specific link is issued.
}) {
  const { toast } = useToast();
  const [genericUrl, setGenericUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // One stable referral link per Broker/Master. Marketing labels are supplied
  // by the platform, not by the user; the opaque token owns attribution.
  function readyLink(path: string) {
    const url = new URL(path, window.location.origin);
    url.searchParams.set("utm_source", "redes_sociales");
    url.searchParams.set("utm_medium", "social");
    url.searchParams.set("utm_campaign", "productos_financieros");
    url.searchParams.set("utm_content", "inicio");
    return url.toString();
  }

  const { data: overview } = useQuery<Overview>({
    queryKey: ["/api/commercial-resources/overview"],
    queryFn: async () => {
      const res = await fetch("/api/commercial-resources/overview", { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo consultar actividad");
      return res.json();
    },
    retry: false
  });

  // The idempotent API returns the SAME generic link for this owner on
  // subsequent visits. We do not issue template/product-specific links.
  useEffect(() => {
    let cancelled = false;
    async function provision() {
      try {
        const res = await fetch("/api/commercial-resources/links", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        if (!res.ok) return;
        const payload = await res.json();
        const url = readyLink(payload.path);
        if (cancelled) return;
        setGenericUrl(url);
        onCampaignLink?.(url);
      } catch {
        // The manual button below offers a retry.
      }
    }
    void provision();
    return () => { cancelled = true; };
  }, []);

  async function makeLink() {
    setBusy(true);
    try {
      const res = await fetch("/api/commercial-resources/links", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "No se pudo crear el enlace");
      const url = readyLink(payload.path);
      setGenericUrl(url);
      onCampaignLink?.(url);
      toast({ title: "Enlace listo", description: "Este mismo enlace sirve para todos tus materiales comerciales." });
    } catch (err: any) {
      toast({ title: "Error al obtener el enlace", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
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
      <h2 className="font-bold flex gap-2 items-center"><Link2 className="w-5 h-5 text-primary" /> Tu enlace de captación</h2>
      <p className="text-sm text-muted-foreground">Tu enlace personal lleva a un formulario de Crédito Negocios. Los prospectos que se registren aparecerán en Clientes → Prospectos recibidos, asociados a tu cuenta.</p>
      <a className="text-sm font-semibold underline text-primary" href="/clientes?tab=recibidos">Ver mis prospectos recibidos →</a>
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
        <p className="text-sm font-semibold">Mi enlace único con seguimiento</p>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => makeLink()}
          data-testid="generate-personal-link">Obtener mi enlace</Button>
        {genericUrl && <div className="flex gap-2">
          <Input readOnly aria-label="Tu enlace personal" value={genericUrl} />
          <Button size="sm" variant="secondary" onClick={() => copy(genericUrl)} data-testid="copy-personal-link"><Copy className="h-4 w-4" /> Copiar</Button>
        </div>}
        <p className="text-xs text-muted-foreground">Úsalo en todas tus publicaciones, WhatsApp o correo. Incluye UTM generales preconfigurados y seguirá asociado a tu cuenta; estos UTM no identifican la red social específica.</p>
      </div>

    </section>
  );
}
