import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Identity = {
  displayName: string;
  whatsapp: string;
  approvedLogoUrl: string | null;
};

/** Independent commercial brand asset, never the avatar/profile photo. */
export default function CommercialProfileLogo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const { data, isLoading, isError } = useQuery<Identity>({
    queryKey: ["/api/commercial-resources/my-approved-identity"],
    queryFn: async () => {
      const response = await fetch("/api/commercial-resources/my-approved-identity", {
        credentials: "include", cache: "no-store"
      });
      if (!response.ok) throw new Error("No se pudo consultar tu logo comercial.");
      return response.json();
    },
    staleTime: 0
  });

  useEffect(() => {
    if (!pendingFile) { setLocalPreview(null); return; }
    const url = URL.createObjectURL(pendingFile);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const chooseFile = async (file?: File) => {
    setPendingFile(null);
    if (!file) return;
    if (file.type !== "image/png" || !file.name.toLowerCase().endsWith(".png") ||
        file.size < 60 || file.size > 1_000_000) {
      toast({ title: "Archivo inválido", description: "Selecciona un PNG de máximo 1 MB.", variant: "destructive" });
      return;
    }
    try {
      const img = new Image();
      const src = URL.createObjectURL(file);
      try {
        img.src = src;
        await img.decode();
        if (img.naturalWidth < 32 || img.naturalHeight < 32 ||
            img.naturalWidth > 2048 || img.naturalHeight > 2048)
          throw new Error("Dimensiones permitidas: 32 a 2048 píxeles por lado.");
      } finally { URL.revokeObjectURL(src); }
      setPendingFile(file);
    } catch (err: any) {
      toast({ title: "PNG no compatible", description: err.message, variant: "destructive" });
    }
  };

  const store = async () => {
    if (!pendingFile || working) return;
    setWorking(true);
    try {
      const form = new FormData();
      form.append("logo", pendingFile);
      const response = await fetch("/api/commercial-resources/my-logo", {
        method: "POST", credentials: "include", body: form
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "No se pudo guardar el logo.");
      setPendingFile(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/commercial-resources/my-approved-identity"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/commercial-resources/templates"] });
      toast({ title: "Logo comercial guardado", description: "Se aplicará a las plantillas que generes desde ahora." });
    } catch (err: any) {
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    } finally { setWorking(false); }
  };

  const remove = async () => {
    if (working || !window.confirm("¿Quitar tu logo de los materiales comerciales? Las plantillas futuras saldrán sin logo propio.")) return;
    setWorking(true);
    try {
      const response = await fetch("/api/commercial-resources/my-logo", {
        method: "DELETE", credentials: "include"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "No se pudo quitar.");
      setPendingFile(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/commercial-resources/my-approved-identity"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/commercial-resources/templates"] });
      toast({ title: "Logo comercial retirado" });
    } catch (err: any) {
      toast({ title: "No se pudo retirar", description: err.message, variant: "destructive" });
    } finally { setWorking(false); }
  };

  return (
    <Card className="border border-border/80 shadow-xs" data-testid="commercial-profile-logo">
      <CardHeader className="py-3 px-4 sm:px-6 border-b border-border/60">
        <CardTitle className="text-base font-semibold">Mi logo para materiales comerciales</CardTitle>
        <CardDescription className="text-xs">
          Es opcional y distinto a tu foto de perfil. Se utilizará automáticamente en las plantillas
          personalizadas de Crédito Negocios. Si no subes logo, las plantillas saldrán sin logo propio;
          el logo institucional de Crédito Negocios se conserva.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-3">
        <p className="text-xs text-muted-foreground">
          PNG preferentemente con fondo transparente, máximo 1 MB.
          Tamaño permitido: 32 a 2048 píxeles por lado. Recomendado: 600 × 300 px.
          El logo se ajusta sin deformarse al espacio reservado.
        </p>
        {(localPreview || data?.approvedLogoUrl) && (
          <div className="border rounded-md p-3 bg-muted/20 w-fit">
            <img src={localPreview || data?.approvedLogoUrl || ""}
              alt={localPreview ? "Vista previa del logo seleccionado" : "Mi logo comercial"}
              className="max-w-[220px] max-h-[120px] object-contain"
              data-testid="commercial-profile-logo-preview" />
          </div>
        )}
        {!localPreview && !data?.approvedLogoUrl && (
          <p className="text-xs text-muted-foreground">Sin logo comercial: tus plantillas no mostrarán un espacio vacío.</p>
        )}
        {isError && <p role="alert" className="text-xs text-destructive">No se pudo consultar el logo. Actualiza la página.</p>}
        <label className="block text-xs font-medium" htmlFor="commercial-logo-input">Seleccionar PNG de mi logo</label>
        <input id="commercial-logo-input" type="file" accept="image/png,.png"
          data-testid="commercial-profile-logo-input"
          disabled={working || isLoading}
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void chooseFile(file); }} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={store}
            disabled={!pendingFile || working || isError}
            data-testid="commercial-profile-logo-save">
            <ImageUp className="h-4 w-4 mr-1" />{working ? "Guardando…" : "Guardar logo"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={remove}
            disabled={working || isLoading || isError || !data?.approvedLogoUrl}
            data-testid="commercial-profile-logo-remove">
            <Trash2 className="h-4 w-4 mr-1" />Quitar mi logo
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Al subir este archivo confirmas que tienes derecho a utilizar este logotipo en tus publicaciones comerciales.
        </p>
      </CardContent>
    </Card>
  );
}
