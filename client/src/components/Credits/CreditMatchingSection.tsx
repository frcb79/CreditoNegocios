import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Building2, 
  FileText, 
  HelpCircle, 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp, 
  Info,
  Layers
} from "lucide-react";

interface CriterionEvaluation {
  code: string;
  name: string;
  status: "PASSED" | "FAILED" | "MISSING_DATA";
  requiredValue: any;
  actualValue: any;
  reason: string;
}

interface CompatibilityOfferResult {
  offerId: string;
  offerName: string;
  institutionId: string;
  institutionName?: string;
  versionNumber: number;
  status: "COMPATIBLE" | "NOT_COMPATIBLE" | "INSUFFICIENT_DATA";
  criteria: {
    matched: CriterionEvaluation[];
    failed: CriterionEvaluation[];
    missing: CriterionEvaluation[];
  };
  reasons: string[];
  summary: string;
}

interface MatchingResponse {
  creditId: string;
  clientId: string;
  summary: {
    totalEvaluated: number;
    compatibleCount: number;
    insufficientDataCount: number;
    notCompatibleCount: number;
  };
  compatible: CompatibilityOfferResult[];
  insufficientData: CompatibilityOfferResult[];
  notCompatible: CompatibilityOfferResult[];
  excludedOffers?: { offerId: string; reason: string }[];
}

interface CreditMatchingSectionProps {
  creditId: string;
  clientName?: string;
}

export default function CreditMatchingSection({ creditId, clientName }: CreditMatchingSectionProps) {
  const [activeTab, setActiveTab] = useState<"all" | "COMPATIBLE" | "INSUFFICIENT_DATA" | "NOT_COMPATIBLE">("all");
  const [expandedOffers, setExpandedOffers] = useState<Set<string>>(new Set());

  const { data, isLoading, error, refetch } = useQuery<MatchingResponse>({
    queryKey: ["/api/credits", creditId, "matching"],
    queryFn: async () => {
      const res = await fetch(`/api/credits/${creditId}/matching`, {
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Error ${res.status}: No se pudo evaluar la compatibilidad`);
      }
      return res.json();
    },
    enabled: !!creditId,
    staleTime: 30000,
  });

  const toggleExpand = (offerKey: string) => {
    setExpandedOffers((prev) => {
      const next = new Set(prev);
      if (next.has(offerKey)) {
        next.delete(offerKey);
      } else {
        next.add(offerKey);
      }
      return next;
    });
  };

  const allOffers = useMemo(() => {
    if (!data) return [];
    return [
      ...(data.compatible || []),
      ...(data.insufficientData || []),
      ...(data.notCompatible || []),
    ];
  }, [data]);

  const filteredOffers = useMemo(() => {
    if (activeTab === "all") return allOffers;
    return allOffers.filter((o) => o.status === activeTab);
  }, [allOffers, activeTab]);

  const formatCriterionVal = (val: any) => {
    if (val === null || val === undefined) return "No registrado";
    if (typeof val === "boolean") return val ? "Sí" : "No";
    if (typeof val === "number") return val.toLocaleString("es-MX");
    if (typeof val === "object") {
      if (Array.isArray(val)) return val.join(", ");
      return JSON.stringify(val);
    }
    return String(val);
  };

  if (isLoading) {
    return (
      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-6 w-24" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border border-rose-200 bg-rose-50/30">
        <CardContent className="pt-6 pb-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <div>
            <p className="font-semibold text-rose-900 text-sm">
              No fue posible cargar el análisis de compatibilidad
            </p>
            <p className="text-xs text-rose-700 mt-1">
              {(error as Error)?.message || "Ocurrió un error al consultar el motor de matching"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs">
            Reintentar consulta
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { summary } = data;

  return (
    <Card className="border border-border/80 shadow-sm" data-testid="section-credit-matching">
      <CardHeader className="pb-4 border-b bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                Compatibilidad de Ofertas (Matching)
                <Badge variant="outline" className="text-[10px] font-normal uppercase tracking-wide bg-primary/10 text-primary border-primary/20">
                  Motor M3
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Evaluación neutral y explicable contra ofertas comerciales vigentes y publicadas.
              </p>
            </div>
          </div>
        </div>

        {/* Disclaimer / Aviso operativo */}
        <div className="mt-3 bg-blue-50/70 border border-blue-200/80 rounded-md p-2.5 flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-800 leading-relaxed">
            <strong>Herramienta operativa de consulta técnica:</strong> La compatibilidad se evalúa con base estricta en los datos reales del expediente y las condiciones publicadas. Ningún criterio no verificado provoca rechazos definitivos. No constituye aprobación crediticia automática ni impone rankings comerciales.
          </p>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {/* Métricas Operativas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div 
            onClick={() => setActiveTab("all")}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              activeTab === "all" ? "ring-2 ring-primary border-primary bg-primary/5" : "bg-card hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Evaluadas</span>
              <Layers className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1" data-testid="metric-total-evaluated">
              {summary.totalEvaluated}
            </p>
            <span className="text-[10px] text-muted-foreground">Catálogo vigente</span>
          </div>

          <div 
            onClick={() => setActiveTab("COMPATIBLE")}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              activeTab === "COMPATIBLE" ? "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/40" : "bg-card hover:bg-emerald-50/20"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-800 font-medium">Compatibles</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-700 mt-1" data-testid="metric-compatible-count">
              {summary.compatibleCount}
            </p>
            <span className="text-[10px] text-emerald-600">Requisitos cumplidos</span>
          </div>

          <div 
            onClick={() => setActiveTab("INSUFFICIENT_DATA")}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              activeTab === "INSUFFICIENT_DATA" ? "ring-2 ring-amber-500 border-amber-500 bg-amber-50/40" : "bg-card hover:bg-amber-50/20"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-800 font-medium">Datos pendientes</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-amber-700 mt-1" data-testid="metric-insufficient-count">
              {summary.insufficientDataCount}
            </p>
            <span className="text-[10px] text-amber-600">Requiere verificación</span>
          </div>

          <div 
            onClick={() => setActiveTab("NOT_COMPATIBLE")}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              activeTab === "NOT_COMPATIBLE" ? "ring-2 ring-rose-500 border-rose-500 bg-rose-50/40" : "bg-card hover:bg-rose-50/20"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-rose-800 font-medium">No compatibles</span>
              <XCircle className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-2xl font-bold text-rose-700 mt-1" data-testid="metric-not-compatible-count">
              {summary.notCompatibleCount}
            </p>
            <span className="text-[10px] text-rose-600">Condición no cubierta</span>
          </div>
        </div>

        {/* Pestañas de Filtro */}
        <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
          <Button
            size="sm"
            variant={activeTab === "all" ? "default" : "ghost"}
            onClick={() => setActiveTab("all")}
            className="text-xs h-8 px-3"
          >
            Todas ({summary.totalEvaluated})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "COMPATIBLE" ? "default" : "ghost"}
            onClick={() => setActiveTab("COMPATIBLE")}
            className={`text-xs h-8 px-3 ${
              activeTab === "COMPATIBLE" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "text-emerald-700"
            }`}
          >
            Compatibles ({summary.compatibleCount})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "INSUFFICIENT_DATA" ? "default" : "ghost"}
            onClick={() => setActiveTab("INSUFFICIENT_DATA")}
            className={`text-xs h-8 px-3 ${
              activeTab === "INSUFFICIENT_DATA" ? "bg-amber-600 hover:bg-amber-700 text-white" : "text-amber-700"
            }`}
          >
            Información insuficiente ({summary.insufficientDataCount})
          </Button>
          <Button
            size="sm"
            variant={activeTab === "NOT_COMPATIBLE" ? "default" : "ghost"}
            onClick={() => setActiveTab("NOT_COMPATIBLE")}
            className={`text-xs h-8 px-3 ${
              activeTab === "NOT_COMPATIBLE" ? "bg-rose-600 hover:bg-rose-700 text-white" : "text-rose-700"
            }`}
          >
            No compatibles ({summary.notCompatibleCount})
          </Button>
        </div>

        {/* Listado de Ofertas Evaluadas */}
        {filteredOffers.length === 0 ? (
          <div className="text-center py-8 border border-dashed rounded-lg bg-muted/10 space-y-2">
            <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-muted-foreground">
              No hay ofertas en la categoría seleccionada
            </p>
            <p className="text-xs text-muted-foreground">
              Modifica el filtro superior para consultar los demás dictámenes de compatibilidad.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredOffers.map((offer) => {
              const offerKey = `${offer.offerId}-${offer.versionNumber}`;
              const isExpanded = expandedOffers.has(offerKey);

              const badgeConfig = {
                COMPATIBLE: {
                  label: "Compatible",
                  color: "bg-emerald-50 text-emerald-800 border-emerald-300",
                  icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
                },
                INSUFFICIENT_DATA: {
                  label: "Información insuficiente",
                  color: "bg-amber-50 text-amber-800 border-amber-300",
                  icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
                },
                NOT_COMPATIBLE: {
                  label: "No compatible",
                  color: "bg-rose-50 text-rose-800 border-rose-300",
                  icon: <XCircle className="w-3.5 h-3.5 text-rose-600" />,
                },
              }[offer.status];

              return (
                <div 
                  key={offerKey}
                  className={`border rounded-lg transition-all ${
                    offer.status === "COMPATIBLE"
                      ? "border-emerald-200 bg-emerald-50/10 hover:border-emerald-300"
                      : offer.status === "INSUFFICIENT_DATA"
                      ? "border-amber-200 bg-amber-50/10 hover:border-amber-300"
                      : "border-rose-200 bg-rose-50/10 hover:border-rose-300"
                  }`}
                  data-testid={`card-matching-offer-${offer.offerId}`}
                >
                  <div className="p-3.5 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-foreground">
                            {offer.offerName}
                          </h4>
                          <Badge variant="outline" className="text-[10px] bg-background text-muted-foreground">
                            v{offer.versionNumber} • Publicada
                          </Badge>
                          <Badge variant="outline" className={`text-xs gap-1 py-0.5 px-2 ${badgeConfig.color}`}>
                            {badgeConfig.icon}
                            {badgeConfig.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium text-foreground/80">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            {offer.institutionName || "Institución Financiera"}
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(offerKey)}
                        className="text-xs h-8 gap-1.5 self-start sm:self-auto text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <>
                            <span>Ocultar desglose</span>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            <span>Ver desglose técnico</span>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </>
                        )}
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      {offer.summary}
                    </p>

                    {/* Resumen rápido si tiene datos pendientes */}
                    {offer.status === "INSUFFICIENT_DATA" && offer.criteria.missing.length > 0 && (
                      <div className="mt-3 p-2.5 rounded-md bg-amber-50/80 border border-amber-200/90 text-xs text-amber-900 space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-950">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Datos o comprobantes requeridos en el expediente:</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px] text-amber-800">
                          {offer.criteria.missing.map((m) => (
                            <li key={m.code}>
                              <strong>{m.name}:</strong> {m.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Resumen rápido si tiene rechazos objetivos */}
                    {offer.status === "NOT_COMPATIBLE" && offer.criteria.failed.length > 0 && (
                      <div className="mt-3 p-2.5 rounded-md bg-rose-50/80 border border-rose-200/90 text-xs text-rose-900 space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold text-rose-950">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          <span>Condiciones que no se cumplen en el expediente:</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px] text-rose-800">
                          {offer.criteria.failed.map((f) => (
                            <li key={f.code}>
                              <strong>{f.name}:</strong> {f.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Desglose Completo Expandido */}
                    {isExpanded && (
                      <div className="mt-4 pt-3.5 border-t space-y-3.5">
                        <h5 className="text-xs font-bold text-foreground uppercase tracking-wide">
                          Detalle Criterio por Criterio
                        </h5>

                        <div className="space-y-2">
                          {[
                            ...offer.criteria.failed,
                            ...offer.criteria.missing,
                            ...offer.criteria.matched,
                          ].map((crit, idx) => {
                            const critStatusBadge = {
                              PASSED: {
                                label: "Cumplido",
                                color: "bg-emerald-100/70 text-emerald-800 border-emerald-300",
                                icon: <CheckCircle2 className="w-3 h-3 text-emerald-600" />,
                              },
                              MISSING_DATA: {
                                label: "Pendiente / Sin dato",
                                color: "bg-amber-100/70 text-amber-800 border-amber-300",
                                icon: <AlertTriangle className="w-3 h-3 text-amber-600" />,
                              },
                              FAILED: {
                                label: "No cumplido",
                                color: "bg-rose-100/70 text-rose-800 border-rose-300",
                                icon: <XCircle className="w-3 h-3 text-rose-600" />,
                              },
                            }[crit.status];

                            return (
                              <div 
                                key={`${crit.code}-${idx}`}
                                className="p-2.5 rounded border bg-background/80 flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs"
                              >
                                <div className="space-y-1 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground">{crit.name}</span>
                                    <Badge variant="outline" className={`text-[10px] py-0 px-1.5 gap-1 ${critStatusBadge.color}`}>
                                      {critStatusBadge.icon}
                                      {critStatusBadge.label}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    {crit.reason}
                                  </p>
                                </div>
                                <div className="text-[11px] text-muted-foreground sm:text-right shrink-0">
                                  <div>
                                    <span className="text-foreground/70">Requerido: </span>
                                    <span className="font-medium text-foreground">{formatCriterionVal(crit.requiredValue)}</span>
                                  </div>
                                  <div>
                                    <span className="text-foreground/70">Expediente: </span>
                                    <span className="font-medium text-foreground">{formatCriterionVal(crit.actualValue)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
