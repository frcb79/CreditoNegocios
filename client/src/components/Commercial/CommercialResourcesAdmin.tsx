import { useEffect, useState } from "react";
import { renderCommercialGraphic } from "@/lib/commercialGraphicRenderer";
import CommercialPilotPreview from "./CommercialPilotPreview";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Upload, ShieldCheck, Library, Inbox, Eye } from "lucide-react";
import {
  commercialResourceUploadSchema, COM_RES_EXAMPLE
} from "@shared/commercialResourceDefinition";
import { templateSvg, type PublishedCommercialTemplate } from "@/lib/commercialResources";

type Suggestion = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  first_name: string;
  last_name: string;
  suggestion: string;
  product: string | null;
  channel: string | null;
  created_at: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("No se pudieron cargar los registros");
  return response.json();
}

async function postJson(url: string, body: unknown = {}): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "No fue posible guardar los cambios");
  return data;
}

function GraphicDraftPreview({template}:{template:PublishedCommercialTemplate}) {
  const [role,setRole]=useState<"broker"|"master_broker">("broker");
  const [image,setImage]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    setImage("");setError("");
    renderCommercialGraphic(template,role==="broker"?
      {displayName:"María Fernanda López",whatsapp:"5512345678"}:
      {displayName:"Grupo Horizonte Capital",whatsapp:"5598764321"}
    ).then(canvas=>{if(active)setImage(canvas.toDataURL("image/png"));})
    .catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[template.id,role]);
  return <div className="space-y-2" data-testid="resource-admin-graphic-preview">
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant={role==="broker"?"default":"outline"} onClick={()=>setRole("broker")}>Simular Broker</Button>
      <Button type="button" size="sm" variant={role==="master_broker"?"default":"outline"} onClick={()=>setRole("master_broker")}>Simular Master</Button>
    </div>
    {image?<img className="max-w-xs w-full rounded-md" alt={"Vista previa técnica "+role} src={image} />:
      <p className="text-xs">{error||"Generando vista previa..."}</p>}
    <p className="text-xs text-muted-foreground">
      Solo vista previa para Super Admin con identidades ficticias. No publica ni atribuye leads.
    </p>
  </div>;
}

export default function CommercialResourcesAdmin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [json, setJson] = useState(JSON.stringify(COM_RES_EXAMPLE, null, 2));
  const [working, setWorking] = useState(false);
  const [archive, setArchive] = useState<File | null>(null);
  const [graphicMap, setGraphicMap] = useState<File | null>(null);
  const [graphicBackground, setGraphicBackground] = useState<File | null>(null);
  const [importReport, setImportReport] = useState<{ scanned:number;created:number;existing:number;requiresTypographyReview:number } | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<PublishedCommercialTemplate | null>(null);

  const { data: campaignOverview } = useQuery<{ clicks: number; links: number; received: number; linked: number }>({
    queryKey: ["/api/commercial-resources/overview"],
    queryFn: () => getJson("/api/commercial-resources/overview")
  });

  const { data: templates = [], isLoading: loadingTemplates, error: templateError } = useQuery<PublishedCommercialTemplate[]>({
    queryKey: ["/api/admin/commercial-resources/templates"],
    queryFn: () => getJson("/api/admin/commercial-resources/templates")
  });
  const { data: suggestions = [], isLoading: loadingSuggestions } = useQuery<Suggestion[]>({
    queryKey: ["/api/admin/commercial-resources/suggestions"],
    queryFn: () => getJson("/api/admin/commercial-resources/suggestions")
  });

  const validateDraft = () => {
    let parsed: unknown;
    if (json.length > 32_000) throw new Error("El archivo JSON supera 32 KB");
    try { parsed = JSON.parse(json); }
    catch { throw new Error("El archivo no es JSON válido"); }
    const result = commercialResourceUploadSchema.safeParse(parsed);
    if (!result.success) throw new Error(result.error.issues[0]?.message || "El contenido no cumple el formato");
    return result.data;
  };
  const submitDraft = async () => {
    setWorking(true);
    try {
      const data = validateDraft();
      await postJson("/api/admin/commercial-resources/templates", data);
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/commercial-resources/templates"] });
      toast({ title: "Borrador guardado", description: "No está visible para brokers. Publícalo cuando lo apruebes." });
    } catch (error: any) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); }
    finally { setWorking(false); }
  };
  const importGraphics = async () => {
    const bulk=Boolean(archive);
    if(!bulk && (!graphicMap||!graphicBackground))return;
    setWorking(true);setImportReport(null);
    try {
      const payload=new FormData();
      if(archive)payload.append("archive",archive);
      else{
        payload.append("map",graphicMap!);
        payload.append("background",graphicBackground!);
      }
      const response=await fetch("/api/admin/commercial-resources/graphic-import",{
        method:"POST",credentials:"include",body:payload
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.detail||result.message||"Error en importación");
      setImportReport(result);
      setArchive(null);setGraphicMap(null);setGraphicBackground(null);
      await queryClient.invalidateQueries({queryKey:["/api/admin/commercial-resources/templates"]});
      toast({title:"Borradores importados",description:`${result.created} nuevos, ${result.existing} existentes. Nada publicado.`});
    }catch(err:any){toast({title:"No fue posible importar",description:err.message,variant:"destructive"});}
    finally{setWorking(false);}
  };

  const changePublication = async (template: PublishedCommercialTemplate, action: "publish" | "retire") => {
    if (!window.confirm(action === "publish"
      ? "¿Publicar esta versión para Brokers y Masters? La versión anterior del mismo identificador se retirará."
      : "¿Retirar este material de la biblioteca de los brokers?")) return;
    setWorking(true);
    try {
      if(action==="publish" && template.definition.graphic){
        if(template.definition.graphic.typographyReviewRequired){
          throw new Error("Esta versión necesita confirmar tamaños y tipografías del mapa antes de publicarse.");
        }
        if(!window.confirm("Confirmación FINAL: ¿están aprobados comercial y legalmente fotografía, claims, tipografía y arte original?")){
          return;
        }
      }
      await postJson("/api/admin/commercial-resources/templates/" + encodeURIComponent(template.id) + "/" + action,
        action==="publish" && template.definition.graphic ? {editorialLegalApproved:true} : {});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/admin/commercial-resources/templates"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/commercial-resources/templates"] })
      ]);
      toast({ title: action === "publish" ? "Plantilla publicada" : "Plantilla retirada" });
    } catch (error: any) { toast({ title: "No fue posible completar la acción", description: error.message, variant: "destructive" }); }
    finally { setWorking(false); }
  };

  return (
    <section className="space-y-5" data-testid="commercial-resources-admin">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Super Admin · Administración de plantillas</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="admin-campaign-overview">
        {[
          ["Enlaces emitidos", campaignOverview?.links],
          ["Aperturas de formulario", campaignOverview?.clicks],
          ["Formularios recibidos", campaignOverview?.received],
          ["Vinculados a Clientes", campaignOverview?.linked]
        ].map(([label, count]) => (
          <div className="rounded-lg border p-3" key={String(label)}>
            <p className="text-2xl font-bold">{count ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-4" data-testid="resource-admin-graphic-import">
        <h3 className="font-semibold flex gap-2 items-center"><Upload className="w-4 h-4" />
          Importar artes PNG + mapas JSON · solo borradores
        </h3>
        <p className="text-xs text-muted-foreground">
          Carga el ZIP V4 completo (65 diseños) o una pareja de PNG maestro + mapa JSON.
          Las ocho referencias fotográficas no se importan. Ninguna pieza queda publicada automáticamente.
          Los diseños cuadrados e historias que no especifican tipografía quedan pendientes de revisión.
        </p>
        <label className="block text-xs font-medium">
          ZIP de lote
          <input className="block mt-1 w-full text-sm" type="file" accept=".zip,application/zip"
            data-testid="resource-graphic-zip" onChange={e=>{setArchive(e.target.files?.[0]||null);setGraphicMap(null);setGraphicBackground(null);}} />
        </label>
        <p className="text-xs font-medium">O importar una plantilla individual:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            Mapa JSON
            <input className="block mt-1 w-full text-sm" type="file" accept=".json,application/json"
              disabled={Boolean(archive)} data-testid="resource-graphic-map"
              onChange={e=>setGraphicMap(e.target.files?.[0]||null)} />
          </label>
          <label className="text-xs">
            PNG maestro
            <input className="block mt-1 w-full text-sm" type="file" accept="image/png"
              disabled={Boolean(archive)} data-testid="resource-graphic-background"
              onChange={e=>setGraphicBackground(e.target.files?.[0]||null)} />
          </label>
        </div>
        <Button type="button" disabled={working||(!archive&&!(graphicMap&&graphicBackground))}
          data-testid="resource-graphic-import-submit" onClick={importGraphics}>
          {working?"Importando…":"Validar e importar como borradores"}
        </Button>
        {importReport&&<p className="text-sm" data-testid="resource-graphic-import-report">
          Revisados: {importReport.scanned} · Borradores nuevos: {importReport.created} ·
          Ya existentes: {importReport.existing} · Tipografía pendiente: {importReport.requiresTypographyReview}.
          Ninguna plantilla se publicó.
        </p>}
      </div>
      <CommercialPilotPreview />
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Upload className="w-4 h-4" /> Subir plantilla estructurada (.json)</h3>
        <p className="text-xs text-muted-foreground">
          Este formato define composición, campos bloqueados y mensajes aprobados. Solo Super Admin puede subir
          y publicar versiones. Las imágenes y videos finales se incorporarán cuando estén aprobados sus archivos creativos.
        </p>
        <input
          type="file"
          accept=".json,application/json"
          data-testid="resource-admin-file"
          aria-label="Seleccionar archivo de plantilla JSON"
          onChange={async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 32_000) return toast({ title: "Archivo demasiado grande (máximo 32 KB)", variant: "destructive" });
            setJson(await file.text());
            event.target.value = "";
          }}
        />
        <label htmlFor="resource-template-json" className="block text-sm font-medium">Definición de plantilla (puedes revisar el JSON antes de guardarlo)</label>
        <Textarea
          id="resource-template-json"
          value={json}
          onChange={e => setJson(e.target.value)}
          rows={12}
          className="font-mono text-xs"
          maxLength={32000}
          data-testid="resource-admin-json"
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={working} onClick={submitDraft} data-testid="resource-admin-save-draft">
            Guardar nueva versión como borrador
          </Button>
          <Button variant="outline" onClick={() => setJson(JSON.stringify(COM_RES_EXAMPLE, null, 2))}>
            Cargar ejemplo
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Las versiones publicadas no pueden editarse. Para renovar una campaña, sube otra versión con el mismo identificador.</p>
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Library className="w-4 h-4" /> Catálogo y publicaciones</h3>
        {templateError && <p className="text-sm text-destructive">No se pudo consultar el catálogo administrativo.</p>}
        {loadingTemplates ? <p className="text-sm">Cargando plantillas...</p> : templates.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no se han subido plantillas.</p> : (
          <div className="space-y-2">
            {templates.map(item => (
              <div key={item.id} className="rounded-lg border p-3 flex flex-wrap gap-3 items-center justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{item.name} · v{item.version}</p>
                  <p className="text-xs text-muted-foreground">{item.slug} · {item.product} · {item.channel} · {item.status === "published" ? "Publicada" : item.status === "retired" ? "Retirada" : "Borrador"}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => setPreviewTemplate(item)}><Eye className="w-3.5 h-3.5 mr-1" /> Vista previa</Button>
                  {item.status === "draft" && <Button size="sm" disabled={working} onClick={() => changePublication(item, "publish")} data-testid={"publish-resource-" + item.id}>Publicar</Button>}
                  {item.status === "published" && <Button size="sm" variant="outline" disabled={working} onClick={() => changePublication(item, "retire")}>Retirar</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
        {previewTemplate && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <p className="text-sm font-semibold">Vista previa de {previewTemplate.name} — solo Super Admin</p>
            {previewTemplate.definition.graphic ? (
              <GraphicDraftPreview template={previewTemplate} />
            ) : <img className="max-w-xs w-full rounded-md" alt="Vista previa privada de plantilla"
              src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(templateSvg(previewTemplate, { displayName: "Broker Ejemplo", whatsapp: "", showPhone: false }))} />}
            <Button size="sm" variant="ghost" onClick={() => setPreviewTemplate(null)}>Cerrar vista previa</Button>
          </div>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-3" data-testid="resource-admin-suggestions">
        <h3 className="font-semibold flex items-center gap-2"><Inbox className="w-4 h-4" /> Sugerencias recibidas</h3>
        <p className="text-xs text-muted-foreground">Solo lectura. Sin estados, asignaciones ni obligación de respuesta.</p>
        {loadingSuggestions ? <p className="text-sm">Cargando sugerencias...</p> : suggestions.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no se recibieron sugerencias.</p> : (
          <div className="space-y-2">
            {suggestions.map(suggestion => (
              <article key={suggestion.id} className="border rounded-lg p-3">
                <p className="text-sm font-medium">
                  {[suggestion.first_name, suggestion.last_name].filter(Boolean).join(" ") || "Usuario"}
                  <span className="text-xs text-muted-foreground font-normal"> · {new Date(suggestion.created_at).toLocaleDateString("es-MX")} · {suggestion.product || "General"} · {suggestion.channel || "Cualquier canal"}</span>
                </p>
                <p className="text-sm mt-1 whitespace-pre-wrap break-words">{suggestion.suggestion}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
