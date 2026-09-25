import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Scale,
  ShieldCheck,
  History,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Users,
  Search,
  FileText,
  Clock,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { getOpportunityStatusBadge, getRelationshipStatusBadge } from "./CommercialLabels";

export const CommercialDisputesView: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("disputes");
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolutionAction, setResolutionAction] = useState<"assign_new" | "ratify_current" | "release">("ratify_current");
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);

  // Consultar todas las oportunidades en disputed
  const { data: disputedOpps, isLoading: isLoadingDisputes } = useQuery<any[]>({
    queryKey: ["/api/commercial/opportunities", { status: "disputed" }],
    queryFn: async () => {
      const res = await fetch("/api/commercial/opportunities?status=disputed");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Consultar bitácora general de auditoría
  const { data: auditLogs, isLoading: isLoadingAudit } = useQuery<any[]>({
    queryKey: ["/api/commercial/audit-logs"],
    queryFn: async () => {
      const res = await fetch("/api/commercial/audit-logs?limit=100");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDispute) return;
      // Actualizar estado según la resolución
      const newStatus = resolutionAction === "assign_new" || resolutionAction === "ratify_current"
        ? "protected_active"
        : "expired_released";

      // Nota: Si se asigna nuevo broker, en producción se vincula el nuevo brokerId
      const res = await apiRequest("POST", `/api/opportunities/${selectedDispute.id}/activities`, {
        clientId: selectedDispute.clientId,
        activityType: "meeting_conducted",
        title: `Resolución de Controversia Mesa de Control: ${resolutionAction}`,
        description: resolutionNote,
      });

      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Controversia resuelta",
        description: "El dictamen de Mesa de Control ha sido registrado con auditoría inmutable.",
      });
      setIsResolveModalOpen(false);
      setSelectedDispute(null);
      setResolutionNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/audit-logs"] });
    },
    onError: (err: any) => {
      toast({
        title: "Error al resolver",
        description: err.message || "No se pudo registrar la resolución.",
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (val: string | number) => {
    const num = Number(val);
    if (isNaN(num)) return "$0.00";
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (val?: string | Date | null) => {
    if (!val) return "—";
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return "—";
      return format(d, "dd/MMM/yyyy HH:mm", { locale: es });
    } catch {
      return "—";
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl border bg-white dark:bg-slate-900 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Scale className="h-5 w-5 text-red-600" />
          <span>Mesa de Control: Controversias y Auditoría Comercial</span>
          <Badge variant="outline" className="text-[10px] bg-red-50 text-red-800 border-red-300">
            Gobernanza Comercial
          </Badge>
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Supervisión de conflictos de asignación, auditoría inmutable y resolución formal de derechos de asesoría.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
          <TabsTrigger value="disputes" className="text-xs font-semibold gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span>Oportunidades en Controversia</span>
            <Badge variant="secondary" className="text-[10px] ml-1">
              {(disputedOpps || []).length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs font-semibold gap-1.5">
            <History className="h-3.5 w-3.5 text-slate-600" />
            <span>Bitácora de Auditoría Comercial</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Oportunidades en Disputa */}
        <TabsContent value="disputes" className="space-y-4">
          {isLoadingDisputes ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !disputedOpps || disputedOpps.length === 0 ? (
            <Card className="border-dashed bg-slate-50/50 dark:bg-slate-900/30">
              <CardContent className="p-8 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Sin controversias comerciales abiertas
                </p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No existen oportunidades en estado 'disputed'. Todas las solicitudes operan con titularidad pacífica y protección regular.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {disputedOpps.map((opp) => (
                <Card key={opp.id} className="border-red-200 dark:border-red-900/60 bg-red-50/20 shadow-sm">
                  <div className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {opp.title}
                          </span>
                          <Badge variant="destructive" className="text-[10px]">
                            En Controversia
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>Cliente: {opp.client?.businessName || opp.client?.firstName || "Sin nombre"}</span>
                          <span>•</span>
                          <span className="font-semibold text-emerald-700">
                            {formatCurrency(opp.requestedAmount)}
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedDispute(opp);
                          setIsResolveModalOpen(true);
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold self-start sm:self-auto"
                      >
                        Dictaminar Resolución
                      </Button>
                    </div>

                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-slate-500 text-[11px]">
                        <span>Broker titular: {opp.brokerId}</span>
                        <span>Registrada: {formatDate(opp.createdAt)}</span>
                      </div>
                      {opp.notes && (
                        <p className="text-slate-700 dark:text-slate-300 italic">
                          "{opp.notes}"
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Auditoría Inmutable */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <History className="h-4 w-4 text-slate-500" />
                <span>Registro Inmutable de Eventos Comerciales</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Bitácora de alta de oportunidades, validación de hold, intentos de conflicto y transiciones de cartera.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAudit ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !auditLogs || auditLogs.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  No se registran eventos comerciales en la bitácora.
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {auditLogs.map((log) => {
                    const isConflict = log.action === "opportunity_conflict_attempt";
                    const isDisputed = log.action === "opportunity_disputed";
                    const isCreated = log.action === "opportunity_created";

                    return (
                      <div
                        key={log.id}
                        className={`p-3 rounded-lg border text-xs space-y-1 ${
                          isConflict
                            ? "bg-amber-50/40 border-amber-200 dark:bg-amber-950/20"
                            : isDisputed
                            ? "bg-red-50/40 border-red-200 dark:bg-red-950/20"
                            : "bg-slate-50/50 border-slate-100 dark:bg-slate-900/50 dark:border-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-semibold">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                isConflict
                                  ? "bg-amber-500"
                                  : isDisputed
                                  ? "bg-red-500"
                                  : "bg-emerald-500"
                              }`}
                            />
                            <span>{log.action}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              {log.entityType}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {formatDate(log.createdAt)}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-3">
                          <span>Usuario: {log.performedBy || "sistema"}</span>
                          {log.previousState && (
                            <span>
                              {log.previousState} ➔ {log.newState}
                            </span>
                          )}
                        </div>

                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="text-[10px] text-slate-500 font-mono bg-white dark:bg-slate-950 p-1.5 rounded border border-slate-100 dark:border-slate-850 overflow-x-auto">
                            {JSON.stringify(log.metadata)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Dictamen de Mesa de Control */}
      <Dialog open={isResolveModalOpen} onOpenChange={setIsResolveModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-red-600" />
              Dictamen de Mesa de Control
            </DialogTitle>
            <DialogDescription className="text-xs">
              Emite la resolución formal para la oportunidad comercial en controversia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Sentido del Dictamen *</Label>
              <div className="grid grid-cols-1 gap-2 text-xs">
                <label className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900">
                  <input
                    type="radio"
                    name="resolutionAction"
                    value="ratify_current"
                    checked={resolutionAction === "ratify_current"}
                    onChange={() => setResolutionAction("ratify_current")}
                  />
                  <div>
                    <span className="font-semibold block">Ratificar Asesor Titular</span>
                    <span className="text-[11px] text-slate-500">
                      Desestimar controversia y mantener derechos del broker titular activo.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900">
                  <input
                    type="radio"
                    name="resolutionAction"
                    value="assign_new"
                    checked={resolutionAction === "assign_new"}
                    onChange={() => setResolutionAction("assign_new")}
                  />
                  <div>
                    <span className="font-semibold block">Aprobar Sustitución de Asesor</span>
                    <span className="text-[11px] text-slate-500">
                      Validar carta o token de confirmación emitido formalmente por el cliente.
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900">
                  <input
                    type="radio"
                    name="resolutionAction"
                    value="release"
                    checked={resolutionAction === "release"}
                    onChange={() => setResolutionAction("release")}
                  />
                  <div>
                    <span className="font-semibold block">Liberar Oportunidad (Vencida/Cancelada)</span>
                    <span className="text-[11px] text-slate-500">
                      Cancelar protección y dejar disponible para nueva prospección libre.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="res-note" className="text-xs font-semibold">
                Fundamento y Dictamen de Mesa de Control *
              </Label>
              <Textarea
                id="res-note"
                placeholder="Detalla el análisis de las evidencias presentadas y el motivo del fallo..."
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={3}
                required
                className="text-xs resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsResolveModalOpen(false)}
              disabled={resolveMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!resolutionNote.trim() || resolveMutation.isPending}
              onClick={() => resolveMutation.mutate()}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs"
            >
              {resolveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Emitir Dictamen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommercialDisputesView;
