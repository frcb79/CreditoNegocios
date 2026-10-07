import React from "react";
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
} from "lucide-react";
import {
  type LegalAcceptanceRecord,
  FORMALIZATION_NOTICE_TEXT,
  shouldShowFormalizationNotice,
  getExactDocumentUrl,
  getDocumentTitle,
  getAcceptanceTypeLabel,
  formatAcceptedDate,
} from "@shared/legalDocuments";

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

  const isBrokerOrMaster = shouldShowFormalizationNotice(currentUser?.role);
  const shouldRenderNotice = showFormalizationNotice && isBrokerOrMaster;

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

  const acceptances = data?.acceptances || [];

  return (
    <div className="space-y-4" data-testid="legal-profile-documents-section">
      {/* 1. Aviso de Formalización para Broker / Master Broker */}
      {shouldRenderNotice && (
        <Alert
          className="border-amber-300 bg-amber-50/90 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 shadow-2xs"
          data-testid="alert-formalization-notice"
        >
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
          <AlertTitle className="font-semibold text-amber-900 dark:text-amber-100 text-sm">
            Aviso de Formalización
          </AlertTitle>
          <AlertDescription className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
            {FORMALIZATION_NOTICE_TEXT}
          </AlertDescription>
        </Alert>
      )}

      {/* 2. Historial de Aceptaciones Legales */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="py-4 px-4 sm:px-6 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Documentos Legales y Aceptaciones
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Registro inmutable de aceptaciones de Términos y Aviso de Privacidad vinculadas a tu cuenta.
              </CardDescription>
            </div>
            {isFetching && !isLoading && (
              <Badge variant="outline" className="text-[11px] gap-1 self-start sm:self-auto">
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

          {/* Estado de ausencia de aceptaciones (sin inventar evidencia) */}
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
            <div className="rounded-lg border border-border/70 overflow-hidden shadow-2xs">
              <Table data-testid="table-legal-acceptances">
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
                        <TableCell className="py-3">
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

                        <TableCell className="py-3">
                          <Badge variant="outline" className="font-mono text-xs px-2 py-0.5">
                            v{acc.version}
                          </Badge>
                        </TableCell>

                        <TableCell className="py-3 hidden md:table-cell">
                          <Badge variant="secondary" className="text-[11px] font-normal">
                            <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600 inline" />
                            {getAcceptanceTypeLabel(acc.acceptanceType)}
                          </Badge>
                        </TableCell>

                        <TableCell className="py-3">
                          <div className="flex flex-col">
                            <span className="text-xs text-foreground font-medium" title={dateInfo.iso}>
                              {dateInfo.formatted}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono" title={dateInfo.iso}>
                              UTC: {dateInfo.iso.replace("T", " ").replace("Z", " UTC").slice(0, 20)}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="py-3 text-right">
                          <Link
                            href={exactUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark underline underline-offset-2"
                            data-testid={`link-document-${acc.document}-${acc.version}`}
                          >
                            <span>Consultar versión</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Enlaces de consulta a versiones vigentes */}
          <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Documentos legales vigentes de la plataforma:
            </span>
            <div className="flex flex-wrap gap-4">
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
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
