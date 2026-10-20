import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { buildApiUrl } from "@/lib/runtimeConfig";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  CreditCard,
  Building2,
  XCircle,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type LegalAcceptanceRecord,
  type FormalizationStatusResult,
  type PendingCommercialTermsStatus,
  type PendingCommercialTerm,
  FORMALIZATION_NOTICE_TEXT,
  shouldShowFormalizationNotice,
  getExactDocumentUrl,
  getDocumentTitle,
  getAcceptanceTypeLabel,
  formatAcceptedDate,
} from "@shared/legalDocuments";
import BrokerFormalizationDialog from "./BrokerFormalizationDialog";
import FormalizationPendingBanner from "./FormalizationPendingBanner";
import AcceptedDocumentDetailDialog from "./AcceptedDocumentDetailDialog";
import BrokerExpedienteDocuments from "./BrokerExpedienteDocuments";

export {
  FORMALIZATION_NOTICE_TEXT,
  shouldShowFormalizationNotice,
  getExactDocumentUrl,
  getDocumentTitle,
  getAcceptanceTypeLabel,
  formatAcceptedDate,
};

interface LegalProfileDocumentsProps {
  user?: any;
  showFormalizationNotice?: boolean;
}

export default function LegalProfileDocuments({
  user: propUser,
  showFormalizationNotice = true,
}: LegalProfileDocumentsProps) {
  const { user: authUser } = useAuth();
  const currentUser = propUser || authUser;

  const [isFormalizationOpen, setIsFormalizationOpen] = useState(false);
  const [selectedAcceptance, setSelectedAcceptance] = useState<LegalAcceptanceRecord | null>(null);

  // Limpiar selección de evidencia y cerrar modales al cambiar de usuario autenticado
  const prevUserIdRef = useRef(currentUser?.id);
  useEffect(() => {
    if (prevUserIdRef.current !== currentUser?.id) {
      prevUserIdRef.current = currentUser?.id;
      setSelectedAcceptance(null);
      setIsFormalizationOpen(false);
    }
  }, [currentUser?.id]);

  const isBrokerOrMaster = shouldShowFormalizationNotice(currentUser?.role);
  const shouldRenderNotice = showFormalizationNotice && isBrokerOrMaster;

  const userRole = currentUser?.role;
  const isMasterOrAdmin =
    userRole === "master_broker" || userRole === "admin" || userRole === "super_admin";
  const isBrokerOrAbove =
    isBrokerOrMaster || userRole === "admin" || userRole === "super_admin";

  // Consulta de estado de formalización para el usuario actual
  const {
    refetch: refetchStatus,
  } = useQuery<FormalizationStatusResult>({
    queryKey: ["/api/legal/formalization/status", currentUser?.id],
    enabled: Boolean(currentUser?.id && isBrokerOrMaster),
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/legal/formalization/status"), {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("No fue posible consultar el estado de formalización.");
      }
      return res.json();
    },
    staleTime: 30000,
  });

  // Consulta del historial de aceptaciones propias
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<{ acceptances: LegalAcceptanceRecord[] }>({
    queryKey: ["/api/legal/my-acceptances", currentUser?.id],
    enabled: Boolean(currentUser?.id),
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/legal/my-acceptances"), {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.message || "No fue posible consultar el historial de aceptaciones legales."
        );
      }
      return res.json();
    },
    staleTime: 30000,
  });

  const { toast } = useToast();
  const [acceptingDoc, setAcceptingDoc] = useState<string | null>(null);

  // Consulta de estado de condiciones comerciales pendientes para Broker / Master
  const {
    data: commercialTermsStatus,
    isLoading: isLoadingCommercialTerms,
    refetch: refetchCommercialTerms,
  } = useQuery<PendingCommercialTermsStatus>({
    queryKey: ["/api/commercial-terms/status", currentUser?.id],
    enabled: Boolean(currentUser?.id && isBrokerOrMaster),
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/commercial-terms/status"), {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("No fue posible consultar las condiciones comerciales pendientes.");
      }
      return res.json();
    },
    staleTime: 15000,
  });

  // Consulta de estatus de validación para cobro de comisiones (FASE 2B.2C / PAG-01 a PAG-06)
  const {
    data: payoutValidation,
    isLoading: isLoadingPayoutValidation,
    refetch: refetchPayoutValidation,
  } = useQuery({
    queryKey: [`/api/beneficiaries/${currentUser?.id}/payout-validation`],
    enabled: Boolean(currentUser?.id && isBrokerOrMaster),
    queryFn: async () => {
      const res = await fetch(buildApiUrl(`/api/beneficiaries/${currentUser?.id}/payout-validation`), {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("No fue posible consultar el estado de validación para cobro.");
      }
      return res.json();
    },
    staleTime: 30000,
  });

  const handleAcceptCommercialTerms = async (term: PendingCommercialTerm) => {
    try {
      setAcceptingDoc(term.document);
      const res = await fetch(buildApiUrl("/api/commercial-terms/accept"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          document: term.document,
          version: term.version,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Error al aceptar las condiciones comerciales");
      }
      toast({
        title: "Condiciones Aceptadas",
        description: `Has aceptado expresamente la versión ${term.version} de ${term.title}.`,
      });
      await Promise.all([refetchCommercialTerms(), refetch()]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo registrar la aceptación.",
        variant: "destructive",
      });
    } finally {
      setAcceptingDoc(null);
    }
  };

  const acceptances = data?.acceptances || [];

  return (
    <div className="space-y-4" data-testid="legal-profile-documents-section">
      {/* 0. Alerta de condiciones comerciales pendientes de aceptación expresa */}
      {isBrokerOrMaster && commercialTermsStatus?.hasPending && commercialTermsStatus.pendingTerms.length > 0 && (
        <Alert
          className="border-indigo-300 bg-indigo-50/90 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200 shadow-2xs"
          data-testid="alert-pending-commercial-terms"
        >
          <AlertCircle className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <AlertTitle className="font-semibold text-indigo-950 dark:text-indigo-100 text-sm">
              Actualización de Condiciones Comerciales Pendientes de Aceptación
            </AlertTitle>
            <AlertDescription className="text-xs sm:text-sm text-indigo-900 dark:text-indigo-300 leading-relaxed">
              Se han actualizado plazos o esquemas de comisiones comerciales aplicables a tu cuenta. De conformidad con las reglas de la plataforma, debes aceptar expresamente las nuevas condiciones vigentes para poder originar nuevas operaciones o expedientes de crédito. Tus operaciones y derechos económicos previos se mantienen inalterados.
            </AlertDescription>
            <div className="mt-3 space-y-2">
              {commercialTermsStatus.pendingTerms.map((term) => (
                <div
                  key={`${term.document}-${term.version}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-md bg-white/80 dark:bg-background/80 border border-indigo-200 dark:border-indigo-900/50 gap-2"
                  data-testid={`pending-term-item-${term.document}`}
                >
                  <div>
                    <div className="font-medium text-xs sm:text-sm text-foreground flex items-center gap-2">
                      <span>{term.title}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        v{term.version}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {term.description}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 text-xs h-8"
                    onClick={() => handleAcceptCommercialTerms(term)}
                    disabled={acceptingDoc === term.document}
                    data-testid={`button-accept-commercial-term-${term.document}`}
                  >
                    {acceptingDoc === term.document ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Registrando...
                      </>
                    ) : (
                      "Aceptar Condiciones Expresamente"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Alert>
      )}

      {/* 1. Mostrar solo formalización pendiente; el historial inmutable permanece abajo. */}
      {shouldRenderNotice && (
        <FormalizationPendingBanner
          role={currentUser?.role}
          userId={currentUser?.id}
          onAction={() => setIsFormalizationOpen(true)}
        />
      )}

      {/* 2. Historial de Aceptaciones Legales */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="py-4 px-4 sm:px-6 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Documentos Legales y Aceptaciones
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              Historial de evidencia y consulta de versiones de documentos de tu cuenta.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <Badge variant="outline" className="text-[11px] gap-1 font-normal text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Actualizando
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-4">
          {/* Estado de carga */}
          {isLoading && (
            <div
              className="py-10 flex flex-col items-center justify-center text-muted-foreground gap-2"
              role="status"
              data-testid="loading-legal-acceptances"
            >
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs sm:text-sm font-medium">Consultando aceptaciones registradas...</p>
            </div>
          )}

          {/* Estado de error */}
          {isError && (
            <Alert variant="destructive" className="border-destructive/40" data-testid="error-legal-acceptances">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm font-semibold">Error al consultar aceptaciones</AlertTitle>
              <AlertDescription className="mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                <span>
                  {error instanceof Error
                    ? error.message
                    : "No fue posible cargar el historial de documentos aceptados."}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  className="h-7 text-xs bg-background/80 hover:bg-background"
                  data-testid="button-retry-legal-acceptances"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Estado de ausencia de aceptaciones */}
          {!isLoading && !isError && acceptances.length === 0 && (
            <div
              className="rounded-lg border border-dashed border-border/80 p-8 text-center bg-muted/20"
              data-testid="empty-legal-acceptances"
            >
              <FileText className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
              <h4 className="text-sm font-semibold text-foreground">Sin aceptaciones registradas</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                No se registran aceptaciones previas de documentos legales para esta cuenta.
              </p>
            </div>
          )}

          {/* Tabla de aceptaciones existentes */}
          {!isLoading && !isError && acceptances.length > 0 && (
            <div className="rounded-lg border border-border/70 overflow-x-auto shadow-2xs">
              <Table className="min-w-[560px] md:min-w-full" data-testid="table-legal-acceptances">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Documento</TableHead>
                    <TableHead className="text-xs font-semibold">Versión</TableHead>
                    <TableHead className="text-xs font-semibold hidden md:table-cell">Tipo</TableHead>
                    <TableHead className="text-xs font-semibold">Fecha de Aceptación</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Versión Exacta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acceptances.map((acc) => {
                    const dateInfo = formatAcceptedDate(acc.acceptedAt);
                    const exactUrl = getExactDocumentUrl(acc.document, acc.version);

                    return (
                      <TableRow key={acc.id} data-testid={`row-acceptance-${acc.document}-${acc.version}`}>
                        <TableCell className="px-2 sm:px-3 py-2.5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs sm:text-sm text-foreground">
                              {getDocumentTitle(acc.document)}
                            </span>
                            <span
                              className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px] sm:max-w-[280px]"
                              title={`SHA-256: ${acc.contentSha256}`}
                            >
                              SHA-256: {acc.contentSha256.slice(0, 10)}...{acc.contentSha256.slice(-8)}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="px-2 sm:px-3 py-2.5">
                          <Badge variant="outline" className="font-mono text-xs px-2 py-0.5">
                            v{acc.version}
                          </Badge>
                        </TableCell>

                        <TableCell className="py-3 hidden md:table-cell">
                          <Badge
                            variant="secondary"
                            className="inline-flex items-center whitespace-nowrap px-2 py-0.5 text-[11px] font-medium"
                            title={getAcceptanceTypeLabel(acc.acceptanceType)}
                            aria-label={getAcceptanceTypeLabel(acc.acceptanceType)}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600 shrink-0" />
                            Aceptado
                          </Badge>
                        </TableCell>

                        <TableCell className="px-2 sm:px-3 py-2.5">
                          <div className="flex flex-col">
                            <span className="text-xs text-foreground font-medium" title={dateInfo.iso}>
                              {dateInfo.formatted}
                            </span>
                            <span className="hidden sm:block text-[10px] text-muted-foreground font-mono" title={dateInfo.iso}>
                              UTC: {dateInfo.iso.replace("T", " ").replace("Z", " UTC").slice(0, 20)}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedAcceptance(acc)}
                              className="h-7 px-1.5 sm:px-2 text-xs font-medium text-primary hover:text-primary-dark underline underline-offset-2"
                              data-testid={`button-view-detail-${acc.document}-${acc.version}`}
                            >
                              <span>Consultar versión</span>
                            </Button>
                            <Link
                              href={exactUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-primary inline-flex items-center p-1"
                              title="Abrir en pestaña nueva"
                              data-testid={`link-document-${acc.document}-${acc.version}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Enlaces de consulta a versiones vigentes autorizadas por rol */}
          <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Documentos vigentes de la plataforma:
            </span>
            <div className="flex flex-wrap gap-3 sm:gap-4">
              <Link
                href="/legal/terminos"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                data-testid="link-current-terms"
              >
                Términos y Condiciones
                <ExternalLink className="h-3 w-3" />
              </Link>
              <Link
                href="/legal/aviso"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                data-testid="link-current-privacy"
              >
                Aviso de Privacidad
                <ExternalLink className="h-3 w-3" />
              </Link>
              {isBrokerOrAbove && (
                <>
                  <Link
                    href="/legal/convenio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                    data-testid="link-current-convenio"
                  >
                    Convenio de Colaboración
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                  <Link
                    href="/legal/reglas-red"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                    data-testid="link-current-reglas-red"
                  >
                    Reglas de la Red
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </>
              )}
              {isMasterOrAdmin && (
                <Link
                  href="/legal/reglas-master"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                  data-testid="link-current-reglas-master"
                >
                  Reglas Master Broker
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isBrokerOrMaster && <BrokerExpedienteDocuments user={currentUser} />}

      {/* 3. Requisitos Documentales y Bancarios para Cobro de Comisiones (FASE 2B.2C) */}
      {isBrokerOrMaster && (
        <Card className="border border-border/80 shadow-xs" data-testid="card-payout-validation">
          <CardHeader className="py-4 px-4 sm:px-6 border-b border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Expediente para Cobro y Dispersión de Comisiones
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-0.5">
                Requisitos documentales y cuenta CLABE obligatorios para autorizar pagos y dispersiones STP.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchPayoutValidation()}
                className="h-7 text-xs bg-background/80 hover:bg-background"
                disabled={isLoadingPayoutValidation}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingPayoutValidation ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-6 space-y-4">
            {isLoadingPayoutValidation ? (
              <div className="py-6 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-xs font-medium">Verificando estatus documental para pagos...</p>
              </div>
            ) : payoutValidation ? (
              <>
                {payoutValidation.canPayout ? (
                  <Alert className="border-emerald-300 bg-emerald-50/90 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <AlertTitle className="font-semibold text-emerald-900 dark:text-emerald-100 text-sm">
                        Expediente de Cobro Autorizado
                      </AlertTitle>
                      <AlertDescription className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5 leading-relaxed">
                        Cuentas con toda la documentación oficial (INE vigente, CSF y Estado de cuenta) aprobada por Super Admin y tus datos bancarios verificados para recibir transferencias de comisiones.
                      </AlertDescription>
                    </div>
                  </Alert>
                ) : (
                  <Alert className="border-amber-300 bg-amber-50/90 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <AlertTitle className="font-semibold text-amber-900 dark:text-amber-100 text-sm">
                        Documentación Pendiente para Cobro de Comisiones
                      </AlertTitle>
                      <AlertDescription className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                        Para recibir transferencias de comisiones es requisito contar con tus documentos oficiales aprobados por Super Admin.
                        <strong className="block mt-1 text-amber-950 dark:text-amber-100 font-medium">
                          Nota importante: Estos requisitos aplican exclusivamente a la dispersión de pagos; no bloquean tu registro, firma de contratos, captura de prospectos ni confirmación de créditos.
                        </strong>
                      </AlertDescription>
                    </div>
                  </Alert>
                )}

                {/* Grid de 4 requisitos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  {/* 1. INE */}
                  <div className="rounded-lg border border-border/70 p-3 bg-muted/20 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          INE Vigente
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0.5 ${
                            payoutValidation.documents?.ine?.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : payoutValidation.documents?.ine?.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : payoutValidation.documents?.ine?.status === 'expired'
                              ? 'bg-orange-50 text-orange-700 border-orange-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {payoutValidation.documents?.ine?.status === 'approved'
                            ? 'Aprobada'
                            : payoutValidation.documents?.ine?.status === 'rejected'
                            ? 'Rechazada'
                            : payoutValidation.documents?.ine?.status === 'expired'
                            ? 'Vencida'
                            : payoutValidation.documents?.ine?.hasDocument
                            ? 'En revisión'
                            : 'No cargada'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Identificación oficial para acreditación de titularidad.
                      </p>
                      {payoutValidation.documents?.ine?.notes && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 italic">
                          Nota: {payoutValidation.documents?.ine?.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 2. CSF */}
                  <div className="rounded-lg border border-border/70 p-3 bg-muted/20 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          Constancia Fiscal (CSF)
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0.5 ${
                            payoutValidation.documents?.csf?.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : payoutValidation.documents?.csf?.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : payoutValidation.documents?.csf?.status === 'expired'
                              ? 'bg-orange-50 text-orange-700 border-orange-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {payoutValidation.documents?.csf?.status === 'approved'
                            ? 'Aprobada'
                            : payoutValidation.documents?.csf?.status === 'rejected'
                            ? 'Rechazada'
                            : payoutValidation.documents?.csf?.status === 'expired'
                            ? 'Vencida'
                            : payoutValidation.documents?.csf?.hasDocument
                            ? 'En revisión'
                            : 'No cargada'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Constancia de Situación Fiscal SAT para emisión de comprobantes.
                      </p>
                      {payoutValidation.documents?.csf?.notes && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 italic">
                          Nota: {payoutValidation.documents?.csf?.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 3. Estado de Cuenta */}
                  <div className="rounded-lg border border-border/70 p-3 bg-muted/20 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          Estado de Cuenta
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0.5 ${
                            payoutValidation.documents?.estado_cuenta?.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : payoutValidation.documents?.estado_cuenta?.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : payoutValidation.documents?.estado_cuenta?.status === 'expired'
                              ? 'bg-orange-50 text-orange-700 border-orange-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {payoutValidation.documents?.estado_cuenta?.status === 'approved'
                            ? 'Aprobado'
                            : payoutValidation.documents?.estado_cuenta?.status === 'rejected'
                            ? 'Rechazado'
                            : payoutValidation.documents?.estado_cuenta?.status === 'expired'
                            ? 'Vencido'
                            : payoutValidation.documents?.estado_cuenta?.hasDocument
                            ? 'En revisión'
                            : 'No cargado'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Comprobante bancario que respalda la CLABE registrada.
                      </p>
                      {payoutValidation.documents?.estado_cuenta?.notes && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 italic">
                          Nota: {payoutValidation.documents?.estado_cuenta?.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 4. Cuenta Bancaria */}
                  <div className="rounded-lg border border-border/70 p-3 bg-muted/20 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          Cuenta Bancaria
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0.5 ${
                            payoutValidation.banking?.isClabeValid &&
                            payoutValidation.banking?.isBankNameValid &&
                            payoutValidation.banking?.isAccountHolderValid
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {payoutValidation.banking?.isClabeValid &&
                          payoutValidation.banking?.isBankNameValid &&
                          payoutValidation.banking?.isAccountHolderValid
                            ? 'Completa'
                            : 'Incompleta'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {payoutValidation.banking?.clabe
                          ? `CLABE: ${payoutValidation.banking.clabe.slice(0, 4)}••••${payoutValidation.banking.clabe.slice(-4)}`
                          : 'Sin CLABE de 18 dígitos'}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {payoutValidation.banking?.bankName ? `${payoutValidation.banking.bankName}` : 'Sin banco'}
                        {payoutValidation.banking?.accountHolder ? ` - ${payoutValidation.banking.accountHolder}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Lista de pendientes específicos si los hay */}
                {payoutValidation.missingRequirements?.length > 0 && (
                  <div className="pt-2 text-xs">
                    <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                      Requisitos pendientes para autorizar liquidaciones:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                      {payoutValidation.missingRequirements.map((req: string, index: number) => (
                        <li key={index} className="text-amber-800 dark:text-amber-300">{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Modal para formalización con código OTP */}
      <BrokerFormalizationDialog
        open={isFormalizationOpen}
        onOpenChange={setIsFormalizationOpen}
        user={currentUser}
        onCompleted={() => {
          refetchStatus();
          refetch();
        }}
      />

      {/* Modal para detalle de documento aceptado, evidencia y comprobante */}
      <AcceptedDocumentDetailDialog
        acceptance={selectedAcceptance}
        open={Boolean(selectedAcceptance)}
        onOpenChange={(open) => {
          if (!open) setSelectedAcceptance(null);
        }}
      />
    </div>
  );
}
