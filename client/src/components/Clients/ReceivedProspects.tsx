import ProfileSubmissionHistory from "./ProfileSubmissionHistory";
import ProfileSubmissionSummary from "./ProfileSubmissionSummary";
import ProspectCompletionLinkButton from "./ProspectCompletionLinkButton";
import { useState } from "react";
import ClientForm from "./ClientForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Mail, Phone, UserRoundCheck, ArrowRight } from "lucide-react";

export type ReceivedMarketingLead = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  product: string | null;
  amount_range: string | null;
  message: string | null;
  campaign_name: string | null;
  channel: string | null;
  created_at: string;
  linked_client_id: string | null;
  profile_data: Record<string, unknown> | null;
  profile_received_at: string | null;
  source_channel: string | null;
};
const PRODUCT_NAMES: Record<string, string> = {
  simple: "Crédito Simple",
  revolvente: "Crédito Revolvente",
  factoraje: "Factoraje",
  arrendamiento: "Arrendamiento",
  hipotecario: "Hipotecario Vivienda"
};

export default function ReceivedProspects({
  onReview, onOpenClient
}: {
  onReview: (lead: ReceivedMarketingLead) => void;
  onOpenClient: (clientId: string) => void;
}) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [selected, setSelected] = useState<ReceivedMarketingLead | null>(null);
  const canAccess = user?.role === "broker" || user?.role === "master_broker";
  const { data: leads = [], isLoading, error } = useQuery<ReceivedMarketingLead[]>({
    queryKey: ["/api/commercial-resources/received"],
    queryFn: async () => {
      const res = await fetch("/api/commercial-resources/received", { credentials: "include" });
      if (!res.ok) throw new Error("No fue posible cargar prospectos");
      return res.json();
    },
    enabled: canAccess, refetchInterval: 10000, refetchOnWindowFocus: true
  });
  if (!canAccess) return <p className="text-sm text-muted-foreground">Esta bandeja corresponde a Brokers y Masters que comparten campañas.</p>;

  return (
    <section className="space-y-4" data-testid="received-prospects-tab">
      <div>
        <h2 className="text-xl font-bold">Prospectos recibidos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Contactos recibidos desde tus enlaces de publicidad o contacto directo. Revisa la información enviada y los pendientes.
          El registro no crea por sí mismo una oportunidad protegida.
        </p>
      </div>
      {isLoading ? <p className="text-sm">Cargando...</p> : error ?
        <p className="text-sm text-destructive">No pudimos consultar tus prospectos recibidos.</p> :
        leads.length === 0 ?
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            Aún no has recibido formularios. Puedes compartir tu enlace personal desde Recursos Comerciales.
          </div> : (
        <div className="space-y-3">
          {leads.map(lead => (
            <article key={lead.id} className="rounded-xl border bg-card p-4 sm:p-5 space-y-3" data-testid={"received-lead-" + lead.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h3 className="font-bold">{lead.full_name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(lead.created_at).toLocaleDateString("es-MX")} · {lead.source_channel === "contacto_directo" ? "Contacto directo" : lead.campaign_name || "Enlace personal"}{lead.channel ? " · " + lead.channel : ""}
                  </p>
                </div>
                <span className="text-xs rounded-full bg-muted px-2 py-1 h-fit">
                  {lead.profile_received_at ? "Información de perfil recibida" : lead.linked_client_id ? "Vinculado a Clientes" : "Datos básicos recibidos"}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-1"><Phone className="h-4 w-4 text-muted-foreground" /> {lead.phone}</span>
                {lead.email && <span className="inline-flex items-center gap-1 break-all"><Mail className="h-4 w-4 text-muted-foreground" /> {lead.email}</span>}
              </div>
              <p className="text-sm">
                <strong>Interés:</strong> {lead.product ? PRODUCT_NAMES[lead.product] || lead.product : "Por definir"}
                {lead.amount_range && " · " + lead.amount_range}
              </p>
              {lead.message && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{lead.message}</p>}
              <div className="flex gap-2 flex-wrap border-t pt-3">
                <Button asChild size="sm" variant="outline">
                  <a href={"tel:+" + (lead.phone.length === 10 ? "52" : "") + lead.phone}><Phone className="w-4 h-4 mr-1" /> Contactar</a>
                </Button>
                <ProspectCompletionLinkButton leadId={lead.id} />
                {lead.profile_data && <Button size="sm" variant="outline" onClick={() => setSelected(lead)}>{lead.linked_client_id ? "Revisar información enviada" : "Revisar perfil y registrar"}</Button>}
                {lead.linked_client_id ?
                  <Button size="sm" onClick={() => onOpenClient(lead.linked_client_id!)}>
                    <UserRoundCheck className="w-4 h-4 mr-1" /> Ver Cliente
                  </Button> :
                  <Button size="sm" onClick={() => onReview(lead)}>
                    Revisar y registrar en Clientes <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>}
              </div>
            </article>
          ))}
        </div>
      )}
      <Dialog open={Boolean(selected)} onOpenChange={open => {if (!open) setSelected(null);}}><DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>Información enviada por el prospecto</DialogTitle><DialogDescription>Revisa los datos capturados directamente. Los valores ya registrados se conservan; puedes comparar y editar desde su ficha.</DialogDescription></DialogHeader>
        {selected?.profile_data && (selected.linked_client_id ? <><ProfileSubmissionSummary profile={selected.profile_data} /><Button onClick={() => onOpenClient(selected.linked_client_id!)}>Abrir ficha del cliente</Button></> : <ClientForm key={selected.id} client={selected.profile_data} submitLabel="Revisar y registrar en Clientes" onSuccess={() => setSelected(null)} onPublicSubmit={async profile => {
          const duplicate = await (await apiRequest("POST","/api/clients/check-duplicates",{rfc:profile.rfc,phone:profile.phone,email:profile.email})).json();
          if (duplicate.hasDuplicate || duplicate.clientExists) throw new Error("Ya existe un registro con estos datos. Revisa la coincidencia antes de registrarlo de nuevo.");
          const saved = await (await apiRequest("POST","/api/clients",profile)).json();
          await apiRequest("POST",`/api/commercial-resources/received/${selected.id}/link-client`,{clientId:saved.id});
          await cache.invalidateQueries({queryKey:["/api/commercial-resources/received"]});
          await cache.invalidateQueries({queryKey:["/api/clients"]});
          setSelected(null);onOpenClient(saved.id);
        }} />)}
        {selected?.profile_data && <ProfileSubmissionHistory key={selected.id} leadId={selected.id} />}
      </DialogContent></Dialog>
    </section>
  );
}
