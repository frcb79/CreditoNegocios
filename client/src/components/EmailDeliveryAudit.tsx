import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { MailCheck, RefreshCw, Search } from "lucide-react";

type DeliveryRow = {
  id: string; userId: string; email: string | null;
  firstName: string | null; lastName: string | null;
  role: string; kind: "welcome" | "reminder" | "invitation";
  reminderDay: number | null; dispatchStatus: string;
  providerMessageId: string | null; eventType: string | null;
  createdAt: string; sentAt: string | null; eventAt: string | null;
};
type DeliveryResponse = { records: DeliveryRow[]; limit: number; providerConnected: boolean };

function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("es-MX", {
    dateStyle: "medium", timeStyle: "short",
  });
}
function kind(row: DeliveryRow) {
  if (row.kind === "welcome") return "Bienvenida";
  if (row.kind === "invitation") return "Invitación";
  return "Recordatorio · día " + (row.reminderDay || "?");
}
export function deliveryLabel(row: DeliveryRow) {
  const labels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    "email.sent": { label: "Aceptado por Resend", variant: "outline" },
    "email.delivered": { label: "Entregado al servidor", variant: "default" },
    "email.bounced": { label: "Rebotado", variant: "destructive" },
    "email.failed": { label: "Fallido", variant: "destructive" },
    "email.suppressed": { label: "Suprimido", variant: "destructive" },
    "email.complained": { label: "Marcado como spam", variant: "destructive" },
    "email.delivery_delayed": { label: "Entrega demorada", variant: "secondary" },
  };
  if (row.eventType && labels[row.eventType]) return labels[row.eventType];
  if (row.dispatchStatus === "sent") return {
    label: row.providerMessageId ? "Aceptado; entrega sin confirmar" : "Histórico sin seguimiento",
    variant: "outline" as const,
  };
  if (row.dispatchStatus === "failed") return { label: "Error de envío", variant: "destructive" as const };
  if (row.dispatchStatus === "skipped") return { label: "Omitido", variant: "secondary" as const };
  if (row.dispatchStatus === "claimed") return { label: "En proceso / por verificar", variant: "outline" as const };
  return { label: "Pendiente", variant: "outline" as const };
}

export default function EmailDeliveryAudit() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const data = useQuery<DeliveryResponse>({
    queryKey: ["/api/admin/email-delivery-audit"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/email-delivery-audit");
      if (!response.ok) throw new Error("No fue posible consultar el seguimiento de correos.");
      return response.json();
    },
    staleTime: 30000, refetchOnWindowFocus: false,
  });
  const rows = useMemo(() => (data.data?.records || []).filter(row => {
    const haystack = [row.firstName, row.lastName, row.email, kind(row), deliveryLabel(row).label]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return (!search || haystack.includes(search.toLocaleLowerCase())) &&
      (filter === "all" || row.kind === filter);
  }), [data.data, search, filter]);

  return <div className="mt-3 space-y-3" data-testid="audit-email-content">
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MailCheck className="h-4 w-4" /> Correos automáticos · Resend
        </CardTitle>
        <CardDescription className="text-xs">
          Distingue cuándo Resend acepta el envío y cuándo el servidor de destino confirma la entrega.
          La entrega no significa que el destinatario leyó el mensaje.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.data && !data.data.providerConnected && <p className="text-sm text-amber-700" role="status">
          El webhook de Resend aún no tiene una clave de firma configurada en este entorno.
          Los envíos pueden aparecer sin confirmación de entrega.
        </p>}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="h-4 w-4 text-muted-foreground absolute top-2.5 left-2.5" />
            <Input aria-label="Buscar correo" placeholder="Broker, Master, correo o estado"
              value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-xs" />
          </div>
          <select aria-label="Filtrar tipo de correo" value={filter} onChange={e => setFilter(e.target.value)}
            className="h-9 border border-input rounded-md px-2 text-xs bg-background">
            <option value="all">Todos los correos</option>
            <option value="welcome">Bienvenidas</option>
            <option value="invitation">Invitaciones</option>
            <option value="reminder">Recordatorios</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => void data.refetch()} disabled={data.isFetching}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Actualizar
          </Button>
        </div>
        {data.isLoading ? <p className="text-sm">Consultando Resend y registros internos...</p> :
          data.isError ? <p role="alert" className="text-sm text-destructive">
            No se pudo cargar el seguimiento de correos.
          </p> : !rows.length ? <p className="text-sm text-muted-foreground">
            Sin registros en esta selección. Los eventos nuevos aparecerán cuando se envíen correos.
          </p> : <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{rows.length} de hasta {data.data?.limit} registros más recientes</p>
            {rows.map(row => {
              const state = deliveryLabel(row);
              const person = [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || "Sin nombre";
              return <div key={row.id} className="border rounded-md p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-semibold">{person} · {kind(row)}</span>
                  <Badge variant={state.variant}>{state.label}</Badge>
                </div>
                <p className="text-muted-foreground">{row.email || "Destinatario no disponible"} · {row.role === "master_broker" ? "Master Broker" : "Broker"}</p>
                <p>Registro: {date(row.createdAt)}{row.eventAt ? " · Último resultado: " + date(row.eventAt) : ""}</p>
                {row.dispatchStatus === "failed" && !row.eventType && <p className="text-destructive">
                  El intento de envío no quedó confirmado; revisar el detalle técnico antes de reenviar.
                </p>}
              </div>;
            })}
          </div>}
      </CardContent>
    </Card>
  </div>;
}
