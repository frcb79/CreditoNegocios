import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { buildApiUrl } from "@/lib/runtimeConfig";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  FileText,
  ShieldCheck,
  Calendar,
  ExternalLink,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Download,
  Building,
} from "lucide-react";
import {
  type LegalAcceptanceRecord,
  type PersonalizedDocumentSnapshot,
  getDocumentTitle,
  getAcceptanceTypeLabel,
  formatAcceptedDate,
  getExactDocumentUrl,
} from "@shared/legalDocuments";
import { useAuth } from "@/hooks/useAuth";

interface AcceptedDocumentDetailDialogProps {
  acceptance: LegalAcceptanceRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AcceptedDocumentDetailDialog({
  acceptance,
  open,
  onOpenChange,
}: AcceptedDocumentDetailDialogProps) {
  const [copiedHash, setCopiedHash] = React.useState(false);
  const [copiedPersonalizedHash, setCopiedPersonalizedHash] = React.useState(false);
  const { user, isAuthenticated } = useAuth();

  const isAuthorizedOwner = Boolean(
    isAuthenticated &&
    user?.id &&
    acceptance?.userId &&
    acceptance.userId === user.id
  );

  // Auto-cerrar diálogo si no hay sesión o el documento no pertenece al usuario
  React.useEffect(() => {
    if (open && (!isAuthenticated || !isAuthorizedOwner)) {
      onOpenChange(false);
    }
  }, [open, isAuthenticated, isAuthorizedOwner, onOpenChange]);

  // Query acceptance details, exact document content and personalized snapshot
  const { data, isLoading, isError, error } = useQuery<{
    acceptance: any;
    document: {
      id: string;
      document: string;
      title: string;
      version: string;
      content: string;
      contentSha256: string;
      effectiveAt?: string;
    } | null;
    snapshot?: PersonalizedDocumentSnapshot | null;
    isPersonalized?: boolean;
  }>({
    queryKey: ["/api/legal/my-acceptances", user?.id, acceptance?.id],
    enabled: open && Boolean(acceptance?.id) && isAuthorizedOwner,
    queryFn: async () => {
      const res = await fetch(buildApiUrl(`/api/legal/my-acceptances/${acceptance!.id}`), {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.message || "No fue posible consultar la evidencia de este documento."
        );
      }
      return res.json();
    },
    staleTime: 60000,
  });

  if (!acceptance || !isAuthenticated || !isAuthorizedOwner) return null;

  const dateInfo = formatAcceptedDate(acceptance.acceptedAt);
  const docTitle = getDocumentTitle(acceptance.document);
  const exactPageUrl = getExactDocumentUrl(acceptance.document, acceptance.version);
  const snapshot = data?.snapshot;
  const isPersonalized = Boolean(data?.isPersonalized && snapshot);
  const docContent = isPersonalized ? snapshot?.personalizedContent : data?.document?.content;

  const handleCopyHash = (text: string, isPersonalizedType = false) => {
    navigator.clipboard.writeText(text);
    if (isPersonalizedType) {
      setCopiedPersonalizedHash(true);
      setTimeout(() => setCopiedPersonalizedHash(false), 2000);
    } else {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const handleDownloadVoucher = () => {
    const downloadUrl = buildApiUrl(`/api/legal/my-acceptances/${acceptance.id}/comprobante?download=true`);
    window.open(downloadUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden"
        data-testid={`modal-acceptance-detail-${acceptance.document}-${acceptance.version}`}
      >
        {/* Header */}
        <DialogHeader className="p-5 sm:p-6 pb-4 border-b bg-muted/20">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                  {docTitle}
                  <Badge variant="outline" className="font-mono text-xs">
                    v{acceptance.version}
                  </Badge>
                  {isPersonalized && (
                    <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      Personalizado Inmutable
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Registro de aceptación y evidencia legal inmutable
                </DialogDescription>
              </div>
            </div>

            <Badge variant="secondary" className="text-xs">
              <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-600 inline" />
              {getAcceptanceTypeLabel(acceptance.acceptanceType)}
            </Badge>
          </div>
        </DialogHeader>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Metadata Card */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-muted-foreground block text-[11px]">Fecha y hora de aceptación:</span>
                <span className="font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  {dateInfo.formatted}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono block mt-0.5">
                  UTC: {dateInfo.iso}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground block text-[11px]">Identidad registrada:</span>
                <span className="font-mono text-foreground font-medium block mt-0.5 truncate">
                  {data?.acceptance?.userEmail || acceptance.userEmail}
                </span>
                {acceptance.userName && (
                  <span className="text-[10px] text-muted-foreground block mt-0.5">
                    {acceptance.userName}
                  </span>
                )}
              </div>
            </div>

            {/* Datos Bancarios incorporados si es Convenio personalizado */}
            {isPersonalized && snapshot?.incorporatedData && (
              <div className="pt-2 border-t border-border/60 bg-background/50 p-2.5 rounded-md space-y-1">
                <span className="text-foreground font-semibold flex items-center gap-1.5 text-[11px]">
                  <Building className="h-3.5 w-3.5 text-primary" />
                  Datos bancarios registrados en la formalización:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-muted-foreground pt-1">
                  <div>
                    <span className="font-medium text-foreground">Banco: </span>
                    {snapshot.incorporatedData.bankName || "Pendiente de proporcionar"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Cuenta: </span>
                    {(snapshot.incorporatedData as any).bankAccount || (snapshot.incorporatedData as any).account || "Pendiente de proporcionar"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">CLABE: </span>
                    {snapshot.incorporatedData.clabe || (snapshot.incorporatedData as any).bankClabe || "Pendiente de proporcionar"}
                  </div>
                </div>
              </div>
            )}

            {/* Cryptographic SHA-256 fingerprints */}
            <div className="pt-2 border-t border-border/60 space-y-2">
              {isPersonalized && snapshot?.personalizedSha256 && (
                <div>
                  <span className="text-muted-foreground block text-[11px]">
                    Huella digital del documento personalizado exacto (SHA-256):
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="p-1.5 bg-background rounded border text-[11px] font-mono break-all flex-1 select-all text-emerald-700 dark:text-emerald-400">
                      {snapshot.personalizedSha256}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyHash(snapshot.personalizedSha256, true)}
                      className="h-8 px-2 text-xs shrink-0"
                      title="Copiar hash personalizado"
                    >
                      {copiedPersonalizedHash ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <span className="text-muted-foreground block text-[11px]">
                  Huella digital plantilla base (SHA-256):
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="p-1.5 bg-background rounded border text-[11px] font-mono break-all flex-1 select-all">
                    {snapshot?.templateSha256 || acceptance.contentSha256}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyHash(snapshot?.templateSha256 || acceptance.contentSha256, false)}
                    className="h-8 px-2 text-xs shrink-0"
                    title="Copiar hash plantilla"
                  >
                    {copiedHash ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Network evidence (IP / User-Agent / OTP Method) */}
            <div className="pt-2 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-muted-foreground font-mono">
              {acceptance.ipAddress && (
                <div>
                  <span className="text-foreground/70">Dirección IP:</span> {acceptance.ipAddress}
                </div>
              )}
              {acceptance.userAgent && (
                <div className="truncate" title={acceptance.userAgent}>
                  <span className="text-foreground/70">Agente:</span> {acceptance.userAgent}
                </div>
              )}
            </div>
          </div>

          {/* Document Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                {isPersonalized
                  ? "Texto íntegro del documento personalizado formalizado:"
                  : "Texto exacto de la versión aceptada:"}
              </span>
              <Link
                href={exactPageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
              >
                Abrir en página completa <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {isLoading && (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs">Cargando texto de la versión...</span>
              </div>
            )}

            {isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-xs font-semibold">Error al cargar texto</AlertTitle>
                <AlertDescription className="text-xs mt-0.5">
                  {error instanceof Error ? error.message : "No fue posible obtener el texto."}
                </AlertDescription>
              </Alert>
            )}

            {!isLoading && !isError && docContent && (
              <div
                className="max-h-72 overflow-y-auto p-4 rounded-lg border bg-muted/10 font-sans text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap select-text"
                data-testid="text-accepted-document-content"
              >
                {docContent}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 sm:p-6 border-t bg-muted/10 flex flex-row items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadVoucher}
            className="text-xs gap-1.5"
            data-testid="button-download-comprobante"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar Comprobante
          </Button>

          <Button size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
