import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

type RulesVersion = {
  id: string; version: string; title: string; summary: string;
  contentMarkdown: string; effectiveDate: string; isCurrent: boolean;
  requiresAcknowledgment: boolean; createdAt: string;
};
type RulesCurrent = {
  version: RulesVersion; hasAcknowledged: boolean; acknowledgedAt: string | null;
};

export function OperationalRulesContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "super_admin";
  const [edit, setEdit] = useState(false);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0,10));
  const [isCurrent, setIsCurrent] = useState(true);
  const [requiresAcknowledgment, setRequiresAcknowledgment] = useState(true);

  const current = useQuery<RulesCurrent>({
    queryKey: ["/api/operational-rules/current"],
  });
  const history = useQuery<RulesVersion[]>({
    queryKey: ["/api/operational-rules/history"],
  });
  const invalidateRules = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/operational-rules/current"] });
    queryClient.invalidateQueries({ queryKey: ["/api/operational-rules/history"] });
  };
  const acknowledge = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", "/api/operational-rules/acknowledge", { ruleVersionId: id });
      if (!r.ok) throw new Error((await r.json()).message || "No fue posible registrar la aceptación.");
      return r.json();
    },
    onSuccess: () => {
      invalidateRules();
      toast({ title: "Lectura de reglas registrada", description: "La constancia quedó guardada." });
    },
    onError: (e: Error) => toast({ title: "No fue posible confirmar", description: e.message, variant: "destructive" }),
  });
  const publish = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/admin/operational-rules", {
        version, title, summary, contentMarkdown, effectiveDate,
        isCurrent, requiresAcknowledgment,
      });
      if (!r.ok) throw new Error((await r.json()).message || "No fue posible publicar las reglas.");
      return r.json();
    },
    onSuccess: () => {
      invalidateRules();
      setEdit(false);
      toast({ title: "Nueva versión publicada", description: "El historial anterior se conserva." });
    },
    onError: (e: Error) => toast({ title: "Error al publicar", description: e.message, variant: "destructive" }),
  });
  return <div className="space-y-4" data-testid="settings-operational-rules">
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Reglas de operación</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Versión vigente, historial de cambios y constancias de lectura de la red de Brokers.
            </CardDescription>
          </div>
          {isSuperAdmin && <Button variant="outline" size="sm" type="button"
            onClick={() => setEdit(x=>!x)} data-testid="button-create-rules-version">
            {edit ? "Cerrar editor" : "Publicar nueva versión"}
          </Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {current.isLoading && <p className="text-xs">Consultando reglas vigentes...</p>}
        {current.isError && <p className="text-xs text-destructive">No fue posible consultar la versión vigente.</p>}
        {current.data && <>
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="secondary">Versión {current.data.version.version}</Badge>
            {current.data.hasAcknowledged
              ? <Badge>Lectura aceptada</Badge>
              : current.data.version.requiresAcknowledgment
              ? <Badge variant="destructive">Confirmación pendiente</Badge>
              : <Badge variant="outline">No requiere confirmación</Badge>}
          </div>
          <h3 className="font-semibold text-sm">{current.data.version.title}</h3>
          <p className="text-xs text-muted-foreground">{current.data.version.summary}</p>
          <p className="text-xs text-muted-foreground">Vigente desde {current.data.version.effectiveDate}</p>
          <article className="whitespace-pre-wrap text-xs leading-relaxed border rounded-md bg-muted/10 p-3 max-h-[55vh] overflow-y-auto" data-testid="rules-current-content">
            {current.data.version.contentMarkdown}
          </article>
          {current.data.version.requiresAcknowledgment && !current.data.hasAcknowledged &&
            <Button type="button" size="sm" disabled={acknowledge.isPending}
              onClick={() => acknowledge.mutate(current.data!.version.id)}
              data-testid="button-acknowledge-rules">
              {acknowledge.isPending ? "Registrando..." : "Confirmar lectura y aceptación"}
            </Button>}
          {current.data.hasAcknowledged && current.data.acknowledgedAt &&
            <p className="text-xs text-muted-foreground">
              Aceptación registrada: {new Date(current.data.acknowledgedAt).toLocaleString("es-MX")}
            </p>}
        </>}
      </CardContent>
    </Card>
    {isSuperAdmin && edit && <Card data-testid="operational-rules-editor">
      <CardHeader><CardTitle className="text-sm">Nueva versión oficial</CardTitle>
        <CardDescription className="text-xs">Esta acción publica una versión real. No la utilices durante las pruebas de navegación.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-xs">Versión<Input value={version} onChange={e=>setVersion(e.target.value)} /></label>
        <label className="block text-xs">Título<Input value={title} onChange={e=>setTitle(e.target.value)} /></label>
        <label className="block text-xs">Resumen<Input value={summary} onChange={e=>setSummary(e.target.value)} /></label>
        <label className="block text-xs">Entrada en vigor<Input type="date" value={effectiveDate} onChange={e=>setEffectiveDate(e.target.value)} /></label>
        <label className="block text-xs">Texto oficial<Textarea rows={12} value={contentMarkdown} onChange={e=>setContentMarkdown(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs"><Checkbox checked={isCurrent} onCheckedChange={v=>setIsCurrent(v===true)}/> Establecer vigente</label>
        <label className="flex items-center gap-2 text-xs"><Checkbox checked={requiresAcknowledgment} onCheckedChange={v=>setRequiresAcknowledgment(v===true)}/> Solicitar constancia de lectura</label>
        <Button type="button" disabled={publish.isPending || !version.trim() || !title.trim() || !contentMarkdown.trim()}
          onClick={()=>publish.mutate()} data-testid="button-publish-operational-rules">
          {publish.isPending ? "Publicando..." : "Publicar versión"}
        </Button>
      </CardContent>
    </Card>}
    <Card><CardHeader>
      <CardTitle className="text-sm">Historial de reglas de operación</CardTitle>
    </CardHeader><CardContent className="space-y-2">
      {history.isLoading && <p className="text-xs">Cargando versiones...</p>}
      {history.isError && <p className="text-xs text-destructive">No se pudo consultar el historial.</p>}
      {(history.data || []).map(row=><div key={row.id} className="rounded-md border p-2 text-xs">
        <div className="flex gap-2 items-center"><strong>Versión {row.version}</strong>
          {row.isCurrent && <Badge variant="outline">Vigente</Badge>}
        </div>
        <p>{row.title}</p>
        <p className="text-muted-foreground">{row.summary}</p>
      </div>)}
    </CardContent></Card>
  </div>;
}
