import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  Settings2,
  Clock,
  History,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  Lock,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

import type { CommercialRulesConfig } from "@shared/schema";

type CommercialConfigData = CommercialRulesConfig;

export const CommercialRulesSettings: React.FC = () => {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{
    config: CommercialConfigData;
    defaults: CommercialConfigData;
  }>({
    queryKey: ["/api/admin/commercial-config"],
  });

  const { data: auditData, isLoading: isLoadingAudit } = useQuery<{
    logs: any[];
  }>({
    queryKey: ["/api/admin/commercial-config/audit"],
  });

  const [formValues, setFormValues] = useState<Partial<CommercialConfigData>>({});
  const [changeReason, setChangeReason] = useState("");
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Inicializar valores locales cuando lleguen los datos
  React.useEffect(() => {
    if (data?.config) {
      setFormValues(data.config);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/commercial-config", {
        ...formValues,
        reason: changeReason.trim(),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al actualizar configuración");
      }
      return res.json();
    },
    onSuccess: (resData) => {
      toast({
        title: "Reglas comerciales actualizadas",
        description: resData.message || "Los parámetros han sido actualizados con registro inmutable.",
      });
      setIsConfirmModalOpen(false);
      setChangeReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commercial-config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/commercial-config/audit"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error de actualización",
        description: error.message || "No se pudo actualizar la configuración.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof CommercialConfigData, val: string) => {
    const num = parseInt(val, 10);
    setFormValues((prev) => ({
      ...prev,
      [field]: isNaN(num) ? 0 : num,
    }));
  };

  const handleRestoreDefaults = () => {
    if (data?.defaults) {
      setFormValues(data.defaults);
      toast({
        title: "Valores predeterminados cargados",
        description: "Haz clic en 'Guardar Cambios' para aplicar los valores por defecto.",
      });
    }
  };

  const hasChanges = React.useMemo(() => {
    if (!data?.config || !formValues) return false;
    return Object.keys(data.config).some(
      (k) => (data.config as any)[k] !== (formValues as any)[k]
    );
  }, [data, formValues]);

  const PARAM_METADATA = [
    {
      key: "activeRelationshipValidityDays" as const,
      title: "Vigencia de Relación Activa",
      description: "Días que un broker mantiene cartera comercial activa tras originar o validar una actividad.",
      unit: "días naturales",
      min: 1,
      max: 730,
      icon: ShieldCheck,
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
    },
    {
      key: "initialOpportunityHoldDays" as const,
      title: "Reserva Inicial de Oportunidad",
      description: "Días de gracia otorgados al registrar una oportunidad antes de exigir actividad comercial calificada.",
      unit: "días naturales",
      min: 1,
      max: 60,
      icon: Clock,
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
    },
    {
      key: "opportunityInactivityProtectionDays" as const,
      title: "Protección por Inactividad",
      description: "Días máximos permitidos entre actividades comerciales válidas antes de liberar la oportunidad.",
      unit: "días naturales",
      min: 1,
      max: 180,
      icon: Lock,
      color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
    },
    {
      key: "inboundPriorityHours" as const,
      title: "Prioridad Inbound Directo",
      description: "Horas de exclusividad para que el broker titular atienda un lead que contactó directamente a la plataforma.",
      unit: "horas naturales",
      min: 1,
      max: 168,
      icon: Clock,
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40",
    },
    {
      key: "renewalWindowDaysBeforeMaturity" as const,
      title: "Ventana de Renovación",
      description: "Días previos al vencimiento del crédito para abrir la ventana de renovación y seguimiento.",
      unit: "días naturales",
      min: 1,
      max: 180,
      icon: Calendar,
      color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40",
    },
    {
      key: "renewalOriginatorPriorityDays" as const,
      title: "Prioridad Broker Originador",
      description: "Días de prioridad exclusiva para el asesor que colocó el crédito original durante la renovación.",
      unit: "días naturales",
      min: 1,
      max: 90,
      icon: ShieldCheck,
      color: "text-teal-600 bg-teal-50 dark:bg-teal-950/40",
    },
    {
      key: "brokerElectionTokenValidityHours" as const,
      title: "Vigencia Token Elección Broker",
      description: "Horas de validez del enlace seguro/token emitido al cliente para confirmar elección de asesor.",
      unit: "horas naturales",
      min: 1,
      max: 168,
      icon: Lock,
      color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40",
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-44 w-full rounded-lg" />
          <Skeleton className="h-44 w-full rounded-lg" />
          <Skeleton className="h-44 w-full rounded-lg" />
          <Skeleton className="h-44 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado y Acciones */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-xl border bg-white dark:bg-slate-900 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-emerald-600" />
            <span>Configuración Central de Reglas Comerciales</span>
            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300">
              Super Admin
            </Badge>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Administra los plazos, periodos de protección y reglas de operación sin necesidad de cambios en código ni redespliegues.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestoreDefaults}
            className="text-xs border-slate-300"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1 text-slate-500" />
            Cargar Predeterminados
          </Button>

          <Button
            size="sm"
            disabled={!hasChanges || updateMutation.isPending}
            onClick={() => setIsConfirmModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Guardar Cambios
          </Button>
        </div>
      </div>

      {/* Grid de Parámetros */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PARAM_METADATA.map((param) => {
          const Icon = param.icon;
          const currentVal = (formValues as any)[param.key] ?? 0;
          const defaultVal = (data?.defaults as any)?.[param.key] ?? 0;
          const isModified = currentVal !== (data?.config as any)?.[param.key];

          return (
            <Card
              key={param.key}
              className={`border transition-all ${
                isModified
                  ? "border-amber-400 bg-amber-50/20 dark:bg-amber-950/10 shadow-sm"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg ${param.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  {isModified && (
                    <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                      Modificado
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 pt-2">
                  {param.title}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 min-h-[36px]">
                  {param.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={param.min}
                    max={param.max}
                    value={currentVal}
                    onChange={(e) => handleInputChange(param.key, e.target.value)}
                    className="font-bold text-base w-28 text-center"
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {param.unit}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 border-t pt-2">
                  <span>Predeterminado: {defaultVal} {param.unit}</span>
                  <span>Rango: {param.min} a {param.max}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Historial de Auditoría de Configuración */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500" />
            <span>Bitácora Histórica de Modificaciones a las Reglas Comerciales</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Registro inmutable de quién, cuándo y por qué se modificaron los parámetros de operación comercial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingAudit ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !auditData?.logs || auditData.logs.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-3 text-center">
              No se han registrado modificaciones a la configuración comercial inicial (v1.0.0).
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {auditData.logs.map((log: any) => (
                <div
                  key={log.id}
                  className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {log.action === "commercial_rules_config_updated"
                        ? "Actualización de Reglas Comerciales"
                        : log.action}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {format(new Date(log.createdAt), "dd/MMM/yyyy HH:mm", { locale: es })}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    <span className="font-semibold">Motivo registrado:</span> "{log.metadata?.reason || "Sin motivo especificado"}"
                  </p>

                  <div className="text-[10px] text-slate-500 flex items-center gap-3 pt-1">
                    <span>Usuario: {log.performedBy || "super_admin"}</span>
                    {log.metadata?.version && <span>Versión: {log.metadata.version}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Confirmación y Motivo Obligatorio */}
      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Confirmar Modificación de Reglas Comerciales
            </DialogTitle>
            <DialogDescription className="text-xs">
              Los cambios afectarán los nuevos periodos de cálculo de retención, hold y vigencias comerciales. Se requiere especificar el motivo obligatorio de negocio para la bitácora inmutable.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="change-reason" className="text-xs font-semibold">
                Motivo Obligatorio del Cambio *
              </Label>
              <Textarea
                id="change-reason"
                placeholder="Ej. Ajuste de hold a 10 días por acuerdo de comité comercial del Q4..."
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
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
              onClick={() => setIsConfirmModalOpen(false)}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!changeReason.trim() || updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar y Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
