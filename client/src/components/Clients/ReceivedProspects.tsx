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
  const canAccess = user?.role === "broker" || user?.role === "master_broker";
  const { data: leads = [], isLoading, error } = useQuery<ReceivedMarketingLead[]>({
    queryKey: ["/api/commercial-resources/received"],
    queryFn: async () => {
      const res = await fetch("/api/commercial-resources/received", { credentials: "include" });
      if (!res.ok) throw new Error("No fue posible cargar prospectos");
      return res.json();
    },
    enabled: canAccess
  });
  if (!canAccess) return <p className="text-sm text-muted-foreground">Esta bandeja corresponde a Brokers y Masters que comparten campañas.</p>;

  return (
    <section className="space-y-4" data-testid="received-prospects-tab">
      <div>
        <h2 className="text-xl font-bold">Prospectos recibidos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Contactos que completaron tu formulario de publicidad. Todavía no son Clientes ni oportunidades protegidas.
          Revísalos, contáctalos y verifica duplicados antes de registrarlos en la cartera.
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
                    {new Date(lead.created_at).toLocaleDateString("es-MX")} · {lead.campaign_name || "Enlace personal"}{lead.channel ? " · " + lead.channel : ""}
                  </p>
                </div>
                <span className="text-xs rounded-full bg-muted px-2 py-1 h-fit">
                  {lead.linked_client_id ? "Vinculado a Clientes" : "Contacto recibido"}
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
                  <a href={"tel:+" + lead.phone}><Phone className="w-4 h-4 mr-1" /> Contactar</a>
                </Button>
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
    </section>
  );
}
