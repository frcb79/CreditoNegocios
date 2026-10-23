import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Check, Copy, Download, Megaphone, Video, ShieldAlert } from "lucide-react";
import {
  CHANNELS, COMMERCIAL_CAMPAIGNS, campaignMessage, campaignSvg, imageSize,
  normalizedWhatsApp, safeBrandLabel
} from "@/lib/commercialResources";
import type { SocialChannel } from "@/lib/commercialResources";

export default function CommercialResources() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [campaignId, setCampaignId] = useState("simple");
  const [channel, setChannel] = useState<SocialChannel>("instagram");
  const [displayName, setDisplayName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    if (!user?.id || hasProfile) return;
    const profile = (user.profileData || {}) as Record<string, any>;
    const legalName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    const companyName = profile.business?.businessName;
    const nickname = user.role === "master_broker" ? user.brandName : null;
    setDisplayName(safeBrandLabel(nickname || companyName || legalName));
    setWhatsapp(String(profile.business?.businessPhone || profile.phone || (user as any).phone || ""));
    setHasProfile(true);
  }, [user, hasProfile]);

  const campaign = COMMERCIAL_CAMPAIGNS.find(item => item.id === campaignId) || COMMERCIAL_CAMPAIGNS[0];
  const branding = useMemo(() => ({ displayName, whatsapp, showPhone }), [displayName, whatsapp, showPhone]);
  const renderedSvg = useMemo(() => campaignSvg(campaign, channel, branding), [campaign, channel, branding]);
  const caption = useMemo(() => campaignMessage(campaign, channel, branding), [campaign, channel, branding]);
  const preview = useMemo(() => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(renderedSvg), [renderedSvg]);
  const dimensions = imageSize(channel);
  const contactValid = !!normalizedWhatsApp(whatsapp);

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast({ title: "Texto copiado", description: "Pégalo en la red social que elijas." });
    } catch {
      toast({ title: "No se pudo copiar", description: "Selecciona el texto del recuadro y cópialo manualmente.", variant: "destructive" });
    }
  };

  const downloadPng = () => {
    const file = new Blob([renderedSvg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No se pudo preparar la imagen");
        ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height);
        canvas.toBlob((png) => {
          if (!png) {
            toast({ title: "Error al exportar la imagen", variant: "destructive" });
            return;
          }
          const link = document.createElement("a");
          const pngUrl = URL.createObjectURL(png);
          link.href = pngUrl;
          link.download = "credito-negocios-" + campaign.id + "-" + channel + ".png";
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(pngUrl), 5000);
          toast({ title: "Imagen generada", description: "Borrador para validación, aún no aprobado para publicación." });
        }, "image/png");
      } catch {
        toast({ title: "No se pudo generar la imagen", variant: "destructive" });
      } finally {
        URL.revokeObjectURL(svgUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      toast({ title: "Error al preparar la imagen", variant: "destructive" });
    };
    image.src = svgUrl;
  };

  const canAccess = user?.role === "broker" || user?.role === "master_broker" || user?.role === "admin" || user?.role === "super_admin";
  if (!canAccess) return null;

  return (
    <MainLayout>
      <Header title="Recursos Comerciales" subtitle="Material para ayudar a presentar soluciones de financiamiento" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6 pb-10">
          <div role="note" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950" data-testid="commercial-drafts-warning">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              <strong>Materiales en revisión.</strong> Esta biblioteca es una vista de diseño y personalización.
              No publiques los borradores ni compartas sus textos con clientes hasta la aprobación comercial.
              Las tasas, plazos y autorizaciones dependen de cada financiera.
            </p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-6 items-start">
            <section className="space-y-5">
              <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-primary" />
                  <h2 className="font-bold text-foreground">Elige el producto</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Campañas por producto">
                  {COMMERCIAL_CAMPAIGNS.map(item => (
                    <button key={item.id} type="button" onClick={() => setCampaignId(item.id)}
                      aria-pressed={campaignId === item.id}
                      data-testid={"campaign-" + item.id}
                      className={"min-h-12 rounded-lg border px-3 py-3 text-left text-sm font-medium transition-colors " +
                        (campaignId === item.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted text-foreground")}>
                      {campaignId === item.id && <Check className="mr-1.5 inline h-4 w-4" />}
                      {item.product}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
                <h2 className="font-bold text-foreground">¿Dónde quieres compartir?</h2>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Canal social">
                  {CHANNELS.map(item => (
                    <button type="button" key={item.id} aria-pressed={channel === item.id}
                      onClick={() => setChannel(item.id)}
                      data-testid={"channel-" + item.id}
                      className={"rounded-full border px-3 py-2 text-xs font-semibold transition-colors " +
                        (channel === item.id ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted")}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{CHANNELS.find(item => item.id === channel)?.format} · {CHANNELS.find(item => item.id === channel)?.size}</p>
                {channel === "tiktok" && (
                  <p className="flex gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                    <Video className="h-4 w-4 shrink-0" />
                    Por ahora se genera la portada y un guion de 15 segundos. El video final se producirá después de aprobar la línea gráfica.
                  </p>
                )}
              </div>
              <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
                <h2 className="font-bold text-foreground">Personaliza con tus datos</h2>
                <p className="text-xs text-muted-foreground">Tomamos la información de Configuración. Puedes modificarla solo para este archivo; no cambia tu perfil.</p>
                <div className="space-y-2">
                  <label htmlFor="resource-brand" className="block text-sm font-medium">Nombre que aparecerá</label>
                  <Input id="resource-brand" data-testid="resource-brand" maxLength={42} value={displayName}
                    onChange={event => setDisplayName(event.target.value)}
                    placeholder="Tu nombre o nombre comercial" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="resource-whatsapp" className="block text-sm font-medium">WhatsApp de contacto</label>
                  <Input id="resource-whatsapp" data-testid="resource-whatsapp" value={whatsapp}
                    onChange={event => setWhatsapp(event.target.value)} inputMode="tel"
                    maxLength={25} placeholder="55 1234 5678" />
                  {showPhone && whatsapp.trim() && !contactValid &&
                    <p className="text-xs text-amber-700">Verifica el número. No se imprimirá si no es válido.</p>}
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={showPhone} onCheckedChange={value => setShowPhone(value === true)} data-testid="resource-show-phone" />
                  Mostrar WhatsApp en la imagen
                </label>
                <p className="text-xs text-muted-foreground">
                  No utilizamos cuentas de otros brokers, datos de clientes, CLABEs ni códigos promocionales para personalizar.
                  El logotipo editable y los enlaces de captación medibles quedan para el siguiente bloque.
                </p>
              </div>
            </section>
            <section className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-foreground">Vista previa personalizada</h2>
                  <p className="text-xs text-muted-foreground mt-1">Imagen vectorial liviana, exportable a PNG de alta resolución</p>
                </div>
                <span className="text-xs rounded-full bg-amber-100 text-amber-900 px-3 py-1">Borrador</span>
              </div>
              <div className="flex justify-center rounded-xl bg-muted/50 p-3" data-testid="marketing-preview">
                <img src={preview} alt={"Borrador de " + campaign.product + " para " + channel}
                  className="h-auto w-full max-w-[390px] rounded-lg shadow-lg"
                  style={{ maxHeight: 520, objectFit: "contain" }} />
              </div>
              <Button className="w-full gap-2" onClick={downloadPng} data-testid="resource-download-png" variant="outline">
                <Download className="h-4 w-4" /> Descargar vista previa PNG
              </Button>
              <div className="border-t pt-4 space-y-3">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <h3 className="font-semibold text-sm">{channel === "tiktok" ? "Guion de video breve" : "Texto sugerido para acompañar la publicación"}</h3>
                  <Button type="button" size="sm" variant="secondary" onClick={copyCaption}
                    className="gap-2" data-testid="resource-copy-caption">
                    <Copy className="h-3.5 w-3.5" /> Copiar texto
                  </Button>
                </div>
                <pre className="text-xs sm:text-sm whitespace-pre-wrap break-words font-sans leading-relaxed rounded-lg border bg-muted/30 p-4" data-testid="resource-caption">{caption}</pre>
              </div>
            </section>
          </div>
        </div>
      </main>
    </MainLayout>
  );
}
