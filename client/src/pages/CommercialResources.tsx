import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import CommercialResourcesAdmin from "@/components/Commercial/CommercialResourcesAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Copy, Download, Megaphone, Send, ShieldCheck } from "lucide-react";
import {
  imageSize, templateSvg, templateCaption, safeBrandLabel, normalizedWhatsApp,
  type PublishedCommercialTemplate
} from "@/lib/commercialResources";
import { COMMERCIAL_DISCLAIMER } from "@shared/commercialResourceDefinition";

async function getPublished(): Promise<PublishedCommercialTemplate[]> {
  const res = await fetch("/api/commercial-resources/templates", { credentials: "include" });
  if (!res.ok) throw new Error("No fue posible consultar las plantillas aprobadas");
  return res.json();
}

export default function CommercialResources() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: templates = [], isLoading, error } = useQuery<PublishedCommercialTemplate[]>({
    queryKey: ["/api/commercial-resources/templates"],
    queryFn: getPublished,
    enabled: Boolean(user)
  });
  const [selectedId, setSelectedId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [showInstitutionalLogo, setShowInstitutionalLogo] = useState(true);
  const [loadedUser, setLoadedUser] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (!user?.id || loadedUser === user.id) return;
    const profile = (user.profileData || {}) as Record<string, any>;
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    const businessName = profile.business?.businessName;
    setDisplayName(safeBrandLabel((user.role === "master_broker" && user.brandName) || businessName || fullName));
    setWhatsapp(String(profile.business?.businessPhone || profile.phone || (user as any).phone || ""));
    setLoadedUser(user.id);
  }, [user, loadedUser]);

  const selection = templates.find(t => t.id === selectedId) || templates[0];
  const branding = useMemo(() => ({
    displayName: safeBrandLabel(displayName),
    whatsapp,
    showPhone: showPhone && Boolean(selection?.definition.allowedIdentityFields.whatsapp)
  }), [displayName, whatsapp, showPhone, selection]);
  const svg = useMemo(() => selection ? templateSvg(selection, branding) : "", [selection, branding]);
  const preview = useMemo(() => svg ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) : "", [svg]);
  const caption = useMemo(() => selection ? templateCaption(selection, branding) : "", [selection, branding]);
  const dimensions = selection ? imageSize(selection.channel) : { width: 1080, height: 1350 };
  const isSuperAdmin = user?.role === "super_admin";
  const canSuggest = user?.role === "broker" || user?.role === "master_broker";

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast({ title: "Texto copiado" });
    } catch {
      toast({ title: "No se pudo copiar", description: "Selecciona el texto y cópialo manualmente.", variant: "destructive" });
    }
  };

  const downloadPng = () => {
    if (!selection || !svg) return;
    const size = imageSize(selection.channel);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const source = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size.width; canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(source);
        toast({ title: "No se pudo preparar la imagen", variant: "destructive" });
        return;
      }
      ctx.drawImage(image, 0, 0, size.width, size.height);
      const finish = () => canvas.toBlob(png => {
        if (!png) return toast({ title: "Error al exportar PNG", variant: "destructive" });
        const file = URL.createObjectURL(png);
        const link = document.createElement("a");
        link.href = file;
        link.download = "credito-negocios-" + selection.slug + "-v" + selection.version + ".png";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(file), 5000);
        toast({ title: "Material descargado" });
      }, "image/png");
      if (showInstitutionalLogo && selection.definition.allowedIdentityFields.institutionalLogo) {
        const logo = new Image();
        logo.onload = () => {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(70, 20, 505, 132);
          const ratio = Math.min(473 / logo.naturalWidth, 104 / logo.naturalHeight);
          const w = logo.naturalWidth * ratio, h = logo.naturalHeight * ratio;
          ctx.drawImage(logo, 86, 34 + (104 - h) / 2, w, h);
          finish();
        };
        logo.onerror = finish;
        logo.src = "/credito-negocios-full-logo.jpg";
      } else finish();
      URL.revokeObjectURL(source);
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      toast({ title: "No se pudo generar la imagen", variant: "destructive" });
    };
    image.src = source;
  };

  const sendSuggestion = async () => {
    if (suggestion.trim().length < 10 || suggestion.trim().length > 1000) return;
    setSuggesting(true);
    try {
      const response = await fetch("/api/commercial-resources/suggestions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestion: suggestion.trim(),
          ...(selection ? { product: selection.product, channel: selection.channel } : {})
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "No se pudo recibir la sugerencia");
      setSuggestion("");
      toast({ title: "Sugerencia enviada", description: "Gracias por compartir tu idea." });
    } catch (err: any) {
      toast({ title: "No se pudo enviar la sugerencia", description: err.message, variant: "destructive" });
    } finally { setSuggesting(false); }
  };

  if (!user) return null;

  return (
    <MainLayout>
      <Header title="Recursos Comerciales" subtitle="Plantillas aprobadas para comunicar alternativas de financiamiento" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6 pb-12">
          <div className="rounded-lg border bg-card p-4 flex gap-2 items-start">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            <p className="text-sm text-muted-foreground">
              Solo podrás utilizar materiales autorizados por Crédito Negocios. Los textos, beneficios y condiciones financieras no son editables.
              Personaliza únicamente tu nombre y datos de contacto permitidos. {COMMERCIAL_DISCLAIMER}
            </p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
              <h2 className="font-bold flex items-center gap-2"><Megaphone className="w-5 h-5 text-primary" /> Campañas disponibles</h2>
              {isLoading ? <p className="text-sm text-muted-foreground">Cargando plantillas aprobadas...</p> :
                error ? <p className="text-sm text-destructive">No se pudo cargar el catálogo.</p> :
                templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="resources-empty">
                    Aún no hay materiales publicados. Super Admin está preparando las primeras plantillas.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="resources-published-list">
                    {templates.map(item => (
                      <button type="button" key={item.id} onClick={() => setSelectedId(item.id)}
                        aria-pressed={selection?.id === item.id}
                        className={"rounded-lg border p-3 text-left text-sm " + (selection?.id === item.id ? "border-primary bg-primary/10" : "hover:bg-muted")}
                        data-testid={"approved-resource-" + item.id}
                      >
                        <span className="block font-semibold">{item.name}</span>
                        <span className="text-xs text-muted-foreground block mt-1">{item.channel} · v{item.version}</span>
                      </button>
                    ))}
                  </div>
                )}
              {selection && (
                <div className="space-y-3 border-t pt-4">
                  <h3 className="font-semibold text-sm">Tu información en la publicación</h3>
                  <label className="block text-sm font-medium" htmlFor="resource-display-name">Nombre del broker o negocio</label>
                  <Input id="resource-display-name" maxLength={42} value={displayName} onChange={e => setDisplayName(e.target.value)}
                    placeholder="Nombre o nombre comercial" data-testid="resource-brand" />
                  {selection.definition.allowedIdentityFields.whatsapp && (
                    <>
                      <label className="block text-sm font-medium" htmlFor="resource-whatsapp">Teléfono o WhatsApp</label>
                      <Input id="resource-whatsapp" inputMode="tel" maxLength={25} value={whatsapp}
                        onChange={e => setWhatsapp(e.target.value)} data-testid="resource-whatsapp" />
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={showPhone} onCheckedChange={v => setShowPhone(v === true)} data-testid="resource-show-phone" />
                        Mostrar mi WhatsApp en el material
                      </label>
                      {showPhone && whatsapp.trim() && !normalizedWhatsApp(whatsapp) && <p className="text-xs text-destructive">El número no es válido; no se imprimirá.</p>}
                    </>
                  )}
                  {selection.definition.allowedIdentityFields.institutionalLogo && (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={showInstitutionalLogo} onCheckedChange={v => setShowInstitutionalLogo(v === true)} data-testid="resource-institutional-logo" />
                      Utilizar el logotipo de Crédito Negocios
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground">Estos datos solo personalizan la pieza y no cambian tu perfil.</p>
                </div>
              )}
            </section>
            <section className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
              <h2 className="font-bold">Vista previa de la plantilla aprobada</h2>
              {selection ? (
                <>
                  <div className="bg-muted/30 rounded-lg p-3 flex justify-center" data-testid="marketing-preview">
                    <div className="relative w-full max-w-[360px]">
                      <img src={preview} alt={"Plantilla aprobada " + selection.name}
                        className="max-h-[520px] w-full object-contain rounded-md" />
                      {showInstitutionalLogo && selection.definition.allowedIdentityFields.institutionalLogo && (
                        <div className="absolute top-[2%] left-[7%] w-[46%] bg-white p-1 rounded-md" data-testid="resource-logo-preview">
                          <img src="/credito-negocios-full-logo.jpg" alt="Crédito Negocios" className="max-h-12 w-full object-contain" />
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{dimensions.width} × {dimensions.height} px · Contenido autorizado, v{selection.version}</p>
                  <Button className="w-full gap-2" onClick={downloadPng} data-testid="resource-download-png">
                    <Download className="w-4 h-4" /> Descargar PNG personalizado
                  </Button>
                  <div className="border-t pt-3 space-y-3">
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-sm font-semibold">{selection.channel === "tiktok" ? "Guion vertical aprobado" : "Texto aprobado para publicar"}</p>
                      <Button size="sm" variant="outline" onClick={copyCaption} className="gap-1" data-testid="resource-copy-caption">
                        <Copy className="w-4 h-4" /> Copiar
                      </Button>
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-sm font-sans bg-muted/30 p-3 rounded-md" data-testid="resource-caption">{caption}</pre>
                    {selection.channel === "tiktok" && <p className="text-xs text-muted-foreground">La plantilla contiene portada y guion. El MP4 de video llegará en una fase posterior.</p>}
                  </div>
                </>
              ) : <p className="text-sm text-muted-foreground">Selecciona una plantilla cuando Super Admin publique las primeras campañas.</p>}
            </section>
          </div>
          {canSuggest && (
            <section className="border rounded-xl bg-card p-4 sm:p-5 space-y-3 max-w-3xl" data-testid="commercial-suggestion-form">
              <h2 className="font-semibold">¿Qué material te gustaría encontrar aquí?</h2>
              <p className="text-sm text-muted-foreground">
                Puedes sugerir una campaña, formato o tema. La propuesta se envía a Super Admin para que la considere; no se publica directamente.
              </p>
              <label className="block text-sm" htmlFor="commercial-suggestion">Tu sugerencia</label>
              <Textarea id="commercial-suggestion" rows={3} maxLength={1000} value={suggestion}
                onChange={e => setSuggestion(e.target.value)} placeholder="Por ejemplo: una campaña de factoraje para proveedores de empresas grandes"
                data-testid="commercial-suggestion-input" />
              <Button disabled={suggesting || suggestion.trim().length < 10} onClick={sendSuggestion}
                className="gap-2" data-testid="commercial-suggestion-send">
                <Send className="w-4 h-4" /> Enviar sugerencia
              </Button>
            </section>
          )}
          {isSuperAdmin && <CommercialResourcesAdmin />}
        </div>
      </main>
    </MainLayout>
  );
}
