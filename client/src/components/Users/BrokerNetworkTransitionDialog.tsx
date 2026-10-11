import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ArrowRightLeft, Crown, Loader2, ShieldCheck } from "lucide-react";

type TransitionAction = "assign_master" | "assign_platform" | "promote_master";

type MasterOption = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  brandName?: string | null;
  referralCode?: string | null;
  tenant?: { id: string; name: string } | null;
};

type TransitionContext = {
  broker: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    role: string;
    masterBrokerId?: string | null;
    status: string;
    isActive?: boolean | null;
  };
  brokerTenant?: {
    id: string;
    name: string;
    type: string;
    parentTenantId?: string | null;
  } | null;
  currentMaster?: MasterOption | null;
  masters: MasterOption[];
  history: Array<{
    id: string;
    action: string;
    previousState?: string | null;
    newState?: string | null;
    metadata?: any;
    createdAt?: string | Date | null;
  }>;
};

interface Props {
  broker: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function masterLabel(master?: MasterOption | null) {
  if (!master) return "Crédito Negocios · Broker directo";
  return (
    master.brandName ||
    `${master.firstName || ""} ${master.lastName || ""}`.trim() ||
    master.email ||
    "Master Broker"
  );
}

function actionLabel(action: string) {
  if (action === "broker_promoted_to_master") return "Convertido a Master Broker";
  if (action === "broker_assigned_to_platform") return "Movido a Crédito Negocios";
  if (action === "broker_assigned_to_master") return "Asignado a Master Broker";
  return action;
}

export default function BrokerNetworkTransitionDialog({
  broker,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const { toast } = useToast();
  const [action, setAction] = useState<TransitionAction>("assign_master");
  const [targetMasterBrokerId, setTargetMasterBrokerId] = useState("");
  const [reason, setReason] = useState("");
  const [reactivate, setReactivate] = useState(true);

  const contextQuery = useQuery<TransitionContext>({
    queryKey: ["/api/admin/broker-network/transition-context", broker?.id],
    enabled: open && Boolean(broker?.id),
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/admin/broker-network/transition-context/${broker!.id}`,
      );
      return response.json();
    },
  });

  useEffect(() => {
    if (!open) return;
    setAction("assign_master");
    setTargetMasterBrokerId("");
    setReason("");
    setReactivate(true);
  }, [open, broker?.id]);

  const context = contextQuery.data;
  const needsReactivation =
    context?.broker?.status !== "active" || context?.broker?.isActive === false;

  const selectedMaster = useMemo(
    () => context?.masters?.find((master) => master.id === targetMasterBrokerId) || null,
    [context?.masters, targetMasterBrokerId],
  );

  const transitionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/broker-network/transition", {
        brokerId: broker!.id,
        action,
        targetMasterBrokerId: action === "assign_master" ? targetMasterBrokerId : undefined,
        reason: reason.trim(),
        reactivate: action === "promote_master" ? true : reactivate,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/broker-network"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/status-requests"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/broker-network/transition-context", broker?.id],
      });
      toast({
        title: "Movimiento aplicado",
        description: data.message || "La afiliación del broker fue actualizada correctamente.",
      });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "No se pudo aplicar el movimiento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const canSubmit =
    Boolean(broker?.id) &&
    reason.trim().length >= 3 &&
    (action !== "assign_master" || Boolean(targetMasterBrokerId)) &&
    !transitionMutation.isPending;

  const destination =
    action === "promote_master"
      ? "Nueva organización Master Broker"
      : action === "assign_platform"
        ? "Crédito Negocios · Red directa"
        : selectedMaster
          ? masterLabel(selectedMaster)
          : "Selecciona un Master Broker";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Movimientos de Red
          </DialogTitle>
          <DialogDescription>
            Acción exclusiva de Super Admin. Conserva la identidad del usuario y toda la atribución histórica.
          </DialogDescription>
        </DialogHeader>

        {contextQuery.isLoading ? (
          <div className="py-10 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Cargando estructura actual…
          </div>
        ) : contextQuery.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No se pudo cargar la estructura</AlertTitle>
            <AlertDescription>
              {(contextQuery.error as Error)?.message || "Verifica la configuración organizacional del broker."}
            </AlertDescription>
          </Alert>
        ) : context ? (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/20 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Broker</div>
                <div className="font-semibold">
                  {context.broker.firstName} {context.broker.lastName}
                </div>
                <div className="text-xs text-muted-foreground">{context.broker.email}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Afiliación actual</div>
                <div className="font-semibold">{masterLabel(context.currentMaster)}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline">{context.broker.status}</Badge>
                  {context.brokerTenant?.name && (
                    <span className="text-xs text-muted-foreground">{context.brokerTenant.name}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Movimiento</Label>
              <Select value={action} onValueChange={(value) => setAction(value as TransitionAction)}>
                <SelectTrigger data-testid="select-network-transition-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assign_master">Asignar o mover a Master Broker</SelectItem>
                  <SelectItem value="assign_platform">Mover a Crédito Negocios (directo)</SelectItem>
                  <SelectItem value="promote_master">Convertir en Master Broker</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {action === "assign_master" && (
              <div className="space-y-2">
                <Label>Master Broker destino</Label>
                <Select value={targetMasterBrokerId} onValueChange={setTargetMasterBrokerId}>
                  <SelectTrigger data-testid="select-target-master-broker">
                    <SelectValue placeholder="Seleccionar Master Broker…" />
                  </SelectTrigger>
                  <SelectContent>
                    {context.masters.map((master) => (
                      <SelectItem key={master.id} value={master.id}>
                        {masterLabel(master)}
                        {master.id === context.currentMaster?.id ? " · Red actual" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">Destino: </span>
              <span className="font-semibold">{destination}</span>
            </div>

            {needsReactivation && action !== "promote_master" && (
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                <Checkbox
                  checked={reactivate}
                  onCheckedChange={(checked) => setReactivate(checked === true)}
                  className="mt-0.5"
                  data-testid="checkbox-reactivate-broker"
                />
                <div>
                  <div className="text-sm font-semibold">Reactivar al aplicar el movimiento</div>
                  <div className="text-xs text-muted-foreground">
                    Super Admin puede reactivar al broker dentro de la red destino en la misma operación.
                  </div>
                </div>
              </label>
            )}

            {action === "promote_master" && (
              <Alert>
                <Crown className="h-4 w-4" />
                <AlertTitle>Escalamiento a Master Broker</AlertTitle>
                <AlertDescription>
                  La organización actual del broker se convertirá en organización Master, se activarán los permisos
                  estándar de Master Broker y se generará una clave de red si aún no existe.
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>El historial no se mueve</AlertTitle>
              <AlertDescription>
                El cambio aplica al negocio nuevo. Créditos, oportunidades y comisiones históricas conservan la
                afiliación con la que se originaron. Las solicitudes de estado pendientes de la red anterior se
                invalidan automáticamente.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="network-transition-reason">Motivo del cambio</Label>
              <Textarea
                id="network-transition-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej. El broker operará de forma independiente como Master Broker…"
                className="min-h-[90px]"
                maxLength={1000}
                data-testid="textarea-network-transition-reason"
              />
              <div className="text-[11px] text-muted-foreground">
                El motivo queda registrado en la bitácora de gobernanza.
              </div>
            </div>

            {context.history.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Últimos movimientos
                </div>
                <div className="rounded-lg border divide-y">
                  {context.history.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="p-3 text-xs flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold">{actionLabel(entry.action)}</div>
                        <div className="text-muted-foreground">
                          {entry.previousState || "—"} → {entry.newState || "—"}
                        </div>
                      </div>
                      <div className="text-muted-foreground whitespace-nowrap">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString("es-MX") : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={transitionMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => transitionMutation.mutate()}
            disabled={!canSubmit || contextQuery.isLoading || contextQuery.isError}
            data-testid="button-confirm-network-transition"
          >
            {transitionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {action === "promote_master" ? "Convertir en Master" : "Aplicar movimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
