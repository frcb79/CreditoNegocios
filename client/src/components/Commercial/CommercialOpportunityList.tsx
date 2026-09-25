import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ShieldCheck,
  Clock,
  Plus,
  FileText,
  Calendar,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ExternalLink,
  Scale,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { getOpportunityStatusBadge, COMMERCIAL_ACTIVITY_OPTIONS } from "./CommercialLabels";
import { CreateOpportunityModal } from "./CreateOpportunityModal";
import { RecordActivityModal } from "./RecordActivityModal";
import { DisputeOpportunityModal } from "./DisputeOpportunityModal";
import { ContextualHelpLink } from "@/components/Help/ContextualHelpLink";
import { useAuth } from "@/hooks/useAuth";

interface CommercialOpportunityListProps {
  clientId: string;
  clientName?: string;
  capabilities?: {
    canViewClient?: boolean;
    canViewCredits?: boolean;
    canViewCommissions?: boolean;
    canCreateOpportunity?: boolean;
    canManageOpportunities?: boolean;
  };
  accessScope?: string;
}

export const CommercialOpportunityList: React.FC<CommercialOpportunityListProps> = ({
  clientId,
  clientName,
  capabilities,
  accessScope,
}) => {
  const { user } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedOppForActivity, setSelectedOppForActivity] = useState<any | null>(null);
  const [selectedOppForDispute, setSelectedOppForDispute] = useState<any | null>(null);
  const [expandedOppId, setExpandedOppId] = useState<string | null>(null);

  const { data: opportunities, isLoading } = useQuery<any[]>({
    queryKey: ["/api/clients", clientId, "opportunities"],
  });

  const { data: activitiesMap } = useQuery<Record<string, any[]>>({
    queryKey: ["/api/clients", clientId, "opportunities-activities", expandedOppId],
    queryFn: async () => {
      if (!expandedOppId) return {};
      const res = await fetch(`/api/opportunities/${expandedOppId}/activities`);
      if (!res.ok) return { [expandedOppId]: [] };
      const data = await res.json();
      return { [expandedOppId]: data };
    },
    enabled: Boolean(expandedOppId),
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
      return format(d, "dd/MMM/yyyy", { locale: es });
    } catch {
      return "—";
    }
  };

  const formatRelative = (val?: string | Date | null) => {
    if (!val) return "—";
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return "—";
      return formatDistanceToNow(d, { addSuffix: true, locale: es });
    } catch {
      return "—";
    }
  };

  const canCreate = capabilities?.canCreateOpportunity !== false;
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span>Oportunidades Comerciales Protegidas</span>
            <Badge variant="outline" className="text-xs font-semibold ml-1">
              {(opportunities || []).length}
            </Badge>
          </h3>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Protección de trabajo comercial efectivamente realizado por necesidad de financiamiento.
            </p>
            <ContextualHelpLink
              slug="oportunidad-protegida"
              label="¿Qué significa oportunidad protegida?"
              variant="inline"
            />
          </div>
        </div>

        {canCreate && (
          <Button
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm self-start sm:self-auto"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva Oportunidad
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : !opportunities || opportunities.length === 0 ? (
        <Card className="border-dashed bg-slate-50/50 dark:bg-slate-900/30">
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No hay oportunidades comerciales activas
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {canCreate
                  ? "Registra una necesidad de financiamiento para iniciar la reserva comercial y activar la protección."
                  : "Tu nivel de acceso actual no cuenta con facultades para registrar nuevas oportunidades en esta ficha."}
              </p>
            </div>
            {canCreate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateModalOpen(true)}
                className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Registrar primera oportunidad
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {opportunities.map((opp) => {
            const statusConfig = getOpportunityStatusBadge(opp.status);
            const isExpanded = expandedOppId === opp.id;
            const oppActivities = activitiesMap?.[opp.id] || [];

            const isOwner = opp.brokerId === user?.id || isSuperAdmin;
            const isProtected = opp.status === "protected_active";
            const isHold = opp.status === "registered_hold";
            const isDisputed = opp.status === "disputed";

            return (
              <Card
                key={opp.id}
                className={`overflow-hidden border transition-all ${
                  isProtected
                    ? "border-emerald-200 dark:border-emerald-800/60 shadow-sm"
                    : isHold
                    ? "border-amber-200 dark:border-amber-800/60"
                    : isDisputed
                    ? "border-red-200 dark:border-red-800/60 bg-red-50/20"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                          {opp.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-semibold px-2 py-0.5 border ${statusConfig.badgeClass}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${statusConfig.dotClass}`} />
                          {statusConfig.label}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span className="capitalize font-medium text-slate-700 dark:text-slate-300">
                          {opp.financingNeedType?.replace(/_/g, " ")}
                        </span>
                        <span>•</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(opp.requestedAmount)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                      {isOwner && opp.status !== "converted_credit" && opp.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedOppForActivity(opp)}
                          className="h-8 text-xs font-medium border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1 text-blue-600" />
                          Registrar Actividad
                        </Button>
                      )}

                      {opp.status !== "converted_credit" && opp.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedOppForDispute(opp)}
                          className="h-8 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          title="Abrir controversia formal verificable"
                        >
                          <Scale className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedOppId(isExpanded ? null : opp.id)}
                        className="h-8 w-8 p-0"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Indicadores de vigencia y protección comercial */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t text-xs">
                    <div className="flex items-center gap-2 p-2 rounded bg-slate-50 dark:bg-slate-900/60">
                      <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Reserva inicial
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {opp.holdExpiresAt ? formatDate(opp.holdExpiresAt) : "Sin reserva"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2 rounded bg-slate-50 dark:bg-slate-900/60">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Protección Comercial Vigente
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {opp.protectedUntil ? (
                            <span>
                              {formatDate(opp.protectedUntil)}{" "}
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                                ({formatRelative(opp.protectedUntil)})
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Requiere actividad calificada</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-2 rounded bg-slate-50 dark:bg-slate-900/60">
                      <Calendar className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                          Última Actividad Válida
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {opp.lastValidActivityAt ? formatRelative(opp.lastValidActivityAt) : "Sin registro"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {opp.notes && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 italic bg-slate-50/50 dark:bg-slate-900/40 p-2 rounded">
                      "{opp.notes}"
                    </p>
                  )}

                  {/* Sección expandible de actividades registradas */}
                  {isExpanded && (
                    <div className="pt-3 border-t space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <span>Bitácora de Actividades Comerciales</span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          {oppActivities.length} actividad(es)
                        </span>
                      </div>

                      {oppActivities.length === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">
                          No se han registrado actividades sobre esta oportunidad. Registra una reunión, cotización o carga de SAT para activar la protección plena.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {oppActivities.map((act) => {
                            const optMeta = COMMERCIAL_ACTIVITY_OPTIONS.find((o) => o.value === act.activityType);
                            const isQual = optMeta?.isQualifying ?? false;

                            return (
                              <div
                                key={act.id}
                                className="p-2.5 rounded-md border text-xs bg-white dark:bg-slate-900 space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                                    <span
                                      className={`h-2 w-2 rounded-full ${
                                        isQual ? "bg-emerald-500" : "bg-slate-400"
                                      }`}
                                    />
                                    <span>{act.title}</span>
                                    <Badge
                                      variant="outline"
                                      className={`text-[9px] px-1 py-0 ${
                                        isQual
                                          ? "text-emerald-700 border-emerald-300 bg-emerald-50"
                                          : "text-slate-600 border-slate-300 bg-slate-100"
                                      }`}
                                    >
                                      {isQual ? "Extiende Protección" : "Nota CRM"}
                                    </Badge>
                                  </div>
                                  <span className="text-[10px] text-slate-400">
                                    {formatRelative(act.performedAt)}
                                  </span>
                                </div>

                                {act.description && (
                                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                    {act.description}
                                  </p>
                                )}

                                {act.evidenceUrl && (
                                  <a
                                    href={act.evidenceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-medium pt-0.5"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Ver documento / minuta probatoria
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modales comerciales */}
      <CreateOpportunityModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        clientId={clientId}
        clientName={clientName}
      />

      {selectedOppForActivity && (
        <RecordActivityModal
          isOpen={Boolean(selectedOppForActivity)}
          onClose={() => setSelectedOppForActivity(null)}
          opportunityId={selectedOppForActivity.id}
          clientId={clientId}
          opportunityTitle={selectedOppForActivity.title}
        />
      )}

      {selectedOppForDispute && (
        <DisputeOpportunityModal
          isOpen={Boolean(selectedOppForDispute)}
          onClose={() => setSelectedOppForDispute(null)}
          opportunityId={selectedOppForDispute.id}
          clientId={clientId}
          opportunityTitle={selectedOppForDispute.title}
        />
      )}
    </div>
  );
};
