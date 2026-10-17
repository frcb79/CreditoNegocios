import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, History, Network } from "lucide-react";

type NetworkChange = {
  id: string;
  action: string;
  previousState?: string | null;
  newState?: string | null;
  performedBy?: string | null;
  createdAt?: string | Date | null;
  metadata?: {
    reason?: string;
    historicalAttributionPreserved?: boolean;
  } | null;
};

type Props = {
  user: User;
  allUsers: User[];
};

function personLabel(person?: User) {
  if (!person) return "Master Broker no disponible";
  return person.brandName || [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email || "Master Broker";
}

function stateLabel(state: string | null | undefined, allUsers: User[]) {
  if (!state) return "No registrado";
  if (state === "platform") return "Crédito Negocios (directo)";
  if (state === "master_broker") return "Master Broker";
  if (state.startsWith("master:")) {
    const master = allUsers.find((candidate) => candidate.id === state.slice("master:".length));
    return master ? personLabel(master) : "Master Broker anterior";
  }
  return state;
}

function actionLabel(action: string) {
  switch (action) {
    case "broker_assigned_to_master":
      return "Asignación a Master Broker";
    case "broker_assigned_to_platform":
      return "Asignación directa a Crédito Negocios";
    case "broker_promoted_to_master":
      return "Promoción a Master Broker";
    default:
      return "Movimiento de red";
  }
}

function dateLabel(value?: string | Date | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin fecha"
    : date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export default function SuperAdminBrokerOverview({ user, allUsers }: Props) {
  const { data, isLoading, isError } = useQuery<{ history: NetworkChange[] }>({
    queryKey: ["/api/admin/broker-network/transitions", user.id],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/admin/broker-network/transitions/${encodeURIComponent(user.id)}`,
      );
      if (!response.ok) throw new Error("No fue posible consultar los movimientos de red.");
      return response.json();
    },
    retry: false,
  });

  const affiliatedMaster = user.masterBrokerId
    ? allUsers.find((candidate) => candidate.id === user.masterBrokerId)
    : undefined;
  const affiliation = user.role === "master_broker"
    ? "Master Broker · Red propia"
    : user.masterBrokerId
      ? personLabel(affiliatedMaster)
      : "Crédito Negocios · Broker directo";
  const status = user.status === "suspended"
    ? "Suspendido"
    : user.status === "inactive" || user.isActive === false
      ? "Inactivo"
      : "Activo";
  const history = data?.history || [];

  return (
    <section className="space-y-3 p-4 sm:p-6 border-b" aria-label="Resumen de cuenta comercial" data-testid="super-admin-broker-overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Cuenta comercial"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Resumen administrativo de solo lectura. Las modificaciones se realizan con las acciones del directorio.
          </p>
        </div>
        <Link href="/red-brokers">
          <Button type="button" variant="outline" size="sm" className="text-xs" data-testid="button-return-broker-network">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Volver a Red de Brokers
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{user.role === "master_broker" ? "Master Broker" : "Broker"}</Badge>
        <Badge variant="secondary">{status}</Badge>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Network className="h-3.5 w-3.5" />
          Afiliación actual: <strong className="text-foreground">{affiliation}</strong>
        </span>
      </div>

      <div className="border rounded-lg">
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <History className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-xs font-semibold">Historial de movimientos de red</h4>
          {!isLoading && !isError && <Badge variant="secondary">{history.length}</Badge>}
        </div>
        {isLoading ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Consultando movimientos…</p>
        ) : isError ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            No fue posible consultar el historial de red. Los datos de la cuenta permanecen disponibles.
          </p>
        ) : history.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            No hay movimientos de red registrados en la bitácora.
          </p>
        ) : (
          <div className="divide-y">
            {history.map((entry) => {
              const actor = allUsers.find((candidate) => candidate.id === entry.performedBy);
              return (
                <div key={entry.id} className="px-3 py-3 space-y-1 text-xs" data-testid={`network-history-entry-${entry.id}`}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold">{actionLabel(entry.action)}</span>
                    <span className="text-muted-foreground">{dateLabel(entry.createdAt)}</span>
                  </div>
                  <p className="text-muted-foreground">
                    {stateLabel(entry.previousState, allUsers)} → {stateLabel(entry.newState, allUsers)}
                  </p>
                  {entry.metadata?.reason && (
                    <p><span className="text-muted-foreground">Motivo:</span> {entry.metadata.reason}</p>
                  )}
                  <p className="text-muted-foreground">
                    Responsable: {actor ? personLabel(actor) : "Usuario administrador no disponible"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Esta consulta muestra los últimos 50 cambios de afiliación registrados; no es la bitácora integral de
        clientes, créditos, comisiones ni estados operativos. Los movimientos anteriores conservan su
        atribución histórica.
      </p>
    </section>
  );
}
