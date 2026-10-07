import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/runtimeConfig";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Clock,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import type { FormalizationDocumentsResult, FormalizationDocumentItem } from "@shared/legalDocuments";

interface BrokerFormalizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: any;
  onCompleted?: () => void;
}

type FormalizationStep = "review" | "otp" | "success";

export default function BrokerFormalizationDialog({
  open,
  onOpenChange,
  user,
  onCompleted,
}: BrokerFormalizationDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<FormalizationStep>("review");

  // Document checkboxes - strictly unchecked by default
  const [checkedDocs, setCheckedDocs] = useState<Record<string, boolean>>({});

  // OTP state
  const [otpCode, setOtpCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<Date | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [expirationSeconds, setExpirationSeconds] = useState(0);

  // Request & Verify status
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [requiresRestart, setRequiresRestart] = useState(false);
  const [verifiedAcceptances, setVerifiedAcceptances] = useState<any[]>([]);

  // Query required formalization documents from server
  const {
    data: docsData,
    isLoading: isLoadingDocs,
    isError: isErrorDocs,
    error: docsError,
    refetch: refetchDocs,
  } = useQuery<FormalizationDocumentsResult>({
    queryKey: ["/api/legal/formalization/documents", user?.id],
    enabled: open && Boolean(user?.id),
    queryFn: async () => {
      const res = await fetch(buildApiUrl("/api/legal/formalization/documents"), {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.message || "No fue posible cargar los documentos requeridos para formalización."
        );
      }
      return res.json();
    },
    staleTime: 60000,
  });

  const documents = docsData?.documents || [];

  // Restart flow - cleans dates, counters, errors, and keeps checkboxes unchecked
  const handleRestart = () => {
    setStep("review");
    setCheckedDocs({});
    setOtpCode("");
    setMaskedEmail("");
    setExpiresAt(null);
    setResendAvailableAt(null);
    setCooldownSeconds(0);
    setExpirationSeconds(0);
    setRequestError(null);
    setVerifyError(null);
    setRemainingAttempts(null);
    setRequiresRestart(false);
    refetchDocs();
  };

  // Reset state when dialog is closed or reopened
  useEffect(() => {
    if (open) {
      handleRestart();
    }
  }, [open]);

  // Reset state when authenticated user identity changes
  const prevUserIdRef = React.useRef(user?.id);
  useEffect(() => {
    if (prevUserIdRef.current !== user?.id) {
      prevUserIdRef.current = user?.id;
      handleRestart();
    }
  }, [user?.id]);

  // Timers countdown for cooldown and expiration (runs continuously when active across review and otp steps)
  useEffect(() => {
    if (!resendAvailableAt && !expiresAt) return;

    const updateTimers = () => {
      const now = Date.now();
      if (resendAvailableAt) {
        const remResend = Math.max(0, Math.ceil((resendAvailableAt.getTime() - now) / 1000));
        setCooldownSeconds(remResend);
      }
      if (expiresAt) {
        const remExp = Math.max(0, Math.ceil((expiresAt.getTime() - now) / 1000));
        setExpirationSeconds(remExp);
      }
    };

    updateTimers();
    const interval = setInterval(updateTimers, 1000);
    return () => clearInterval(interval);
  }, [resendAvailableAt, expiresAt]);

  const allDocumentsChecked =
    documents.length > 0 && documents.every((doc) => checkedDocs[doc.document] === true);

  // Request OTP from server
  const handleRequestOtp = async () => {
    if (!allDocumentsChecked || isRequestingOtp || isVerifyingOtp) return;

    setIsRequestingOtp(true);
    setRequestError(null);
    setVerifyError(null);

    try {
      const payload = {
        confirmedDocuments: documents.map((doc) => ({
          document: doc.document,
          version: doc.version,
        })),
      };

      const res = await fetch(buildApiUrl("/api/legal/formalization/request-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (body?.resendAvailableAt) {
          const resendDate = new Date(body.resendAvailableAt);
          setResendAvailableAt(resendDate);
          setCooldownSeconds(Math.max(0, Math.ceil((resendDate.getTime() - Date.now()) / 1000)));
        }
        throw new Error(body?.message || "No fue posible solicitar el código de verificación.");
      }

      setMaskedEmail(body.emailMasked);
      // Immediately initialize expiration and cooldown from server response
      if (body.expiresAt) {
        const expDate = new Date(body.expiresAt);
        setExpiresAt(expDate);
        setExpirationSeconds(Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / 1000)));
      }
      if (body.resendAvailableAt) {
        const resendDate = new Date(body.resendAvailableAt);
        setResendAvailableAt(resendDate);
        setCooldownSeconds(Math.max(0, Math.ceil((resendDate.getTime() - Date.now()) / 1000)));
      }

      setStep("otp");
      setOtpCode("");
      setRemainingAttempts(null);
      setRequiresRestart(false);
    } catch (err: any) {
      setRequestError(err.message || "Error al solicitar código OTP.");
    } finally {
      setIsRequestingOtp(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (cooldownSeconds > 0 || isRequestingOtp || isVerifyingOtp || requiresRestart) return;
    await handleRequestOtp();
  };

  // Verify OTP and complete formalization
  const handleVerifyOtp = async () => {
    const trimmedCode = otpCode.trim();
    if (trimmedCode.length !== 6 || isRequestingOtp || isVerifyingOtp || requiresRestart) return;

    setIsVerifyingOtp(true);
    setVerifyError(null);

    try {
      const payload = {
        code: trimmedCode,
        confirmedDocuments: documents.map((doc) => ({
          document: doc.document,
          version: doc.version,
        })),
      };

      const res = await fetch(buildApiUrl("/api/legal/formalization/verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (typeof body?.remainingAttempts === "number") {
          setRemainingAttempts(body.remainingAttempts);
          if (body.remainingAttempts === 0) {
            setRequiresRestart(true);
          }
        }
        if (body?.requiresRestart === true) {
          setRequiresRestart(true);
        }
        throw new Error(body?.message || "Código de verificación incorrecto o expirado.");
      }

      setVerifiedAcceptances(body.acceptances || []);
      setStep("success");

      // Invalidate queries so UI refreshes immediately
      await queryClient.invalidateQueries({
        queryKey: ["/api/legal/formalization/status"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/legal/my-acceptances"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["/api/clients"],
      });

      onCompleted?.();
    } catch (err: any) {
      setVerifyError(err.message || "Error al verificar código OTP.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const roleTitle =
    user?.role === "master_broker"
      ? "Convenio, Reglas de la Red y Reglas Master Broker"
      : "Convenio de Colaboración y Reglas de la Red";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden"
        data-testid="modal-broker-formalization"
      >
        {/* Header */}
        <DialogHeader className="p-5 sm:p-6 pb-4 border-b bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg text-amber-700 dark:text-amber-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-foreground">
                Formalización de Convenio
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {roleTitle}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* STEP 1: REVIEW DOCUMENTS */}
        {step === "review" && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {isLoadingDocs && (
              <div
                className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3"
                role="status"
                data-testid="loading-formalization-documents"
              >
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Cargando documentos legales requeridos...</p>
              </div>
            )}

            {isErrorDocs && (
              <Alert variant="destructive" data-testid="error-formalization-documents">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-sm font-semibold">Error al cargar documentos</AlertTitle>
                <AlertDescription className="text-xs mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span>
                    {docsError instanceof Error
                      ? docsError.message
                      : "No fue posible consultar los documentos del servidor."}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchDocs()}
                    className="h-7 text-xs bg-background"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Reintentar
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {!isLoadingDocs && !isErrorDocs && (
              <>
                <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Para cumplir el requisito contractual necesario para registrar clientes y operar en la plataforma,
                  debes leer y aceptar individualmente los siguientes documentos normativos vigentes.
                  Las casillas se presentan sin marcar para tu confirmación explícita.
                  Los permisos operativos y facultades de tu cuenta continúan rigiéndose por las políticas asignadas.
                </div>

                {cooldownSeconds > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground p-2.5 bg-muted/40 rounded-md border" data-testid="alert-review-cooldown">
                    <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>Tienes un código emitido previamente. Podrás solicitar uno nuevo en <strong className="font-mono text-foreground">{cooldownSeconds}s</strong>.</span>
                  </div>
                )}

                {requestError && (
                  <Alert variant="destructive" data-testid="alert-request-otp-error">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-xs font-semibold">No fue posible solicitar el código</AlertTitle>
                    <AlertDescription className="text-xs mt-0.5">{requestError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-4">
                  {documents.map((doc: FormalizationDocumentItem) => {
                    const isChecked = Boolean(checkedDocs[doc.document]);

                    return (
                      <div
                        key={`${doc.document}:${doc.version}`}
                        className="rounded-lg border border-border/80 bg-card overflow-hidden shadow-2xs"
                        data-testid={`container-doc-${doc.document}`}
                      >
                        <div className="px-4 py-3 bg-muted/40 border-b flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary shrink-0" />
                            <span className="text-sm font-semibold text-foreground">
                              {doc.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              v{doc.version}
                            </Badge>
                            <span
                              className="text-[10px] font-mono text-muted-foreground hidden sm:inline"
                              title={`SHA-256: ${doc.contentSha256}`}
                            >
                              SHA-256: {doc.contentSha256.slice(0, 8)}...
                            </span>
                          </div>
                        </div>

                        {/* Full scrollable content container */}
                        <div
                          className="max-h-52 overflow-y-auto p-4 bg-muted/10 font-sans text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap border-b"
                          tabIndex={0}
                          aria-label={`Contenido completo de ${doc.title}`}
                          data-testid={`content-doc-${doc.document}`}
                        >
                          {doc.content}
                        </div>

                        {/* Checkbox (initially unchecked) */}
                        <div className="p-3 sm:px-4 bg-card flex items-start gap-3">
                          <Checkbox
                            id={`checkbox-${doc.document}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setCheckedDocs((prev) => ({
                                ...prev,
                                [doc.document]: checked === true,
                              }));
                            }}
                            data-testid={`checkbox-accept-${doc.document}`}
                            className="mt-0.5"
                          />
                          <label
                            htmlFor={`checkbox-${doc.document}`}
                            className="text-xs font-medium text-foreground leading-normal cursor-pointer select-none"
                          >
                            He leído, entiendo y acepto en su totalidad los términos de{" "}
                            <span className="font-semibold">{doc.title}</span> (versión {doc.version}).
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 2: OTP VERIFICATION */}
        {step === "otp" && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">
                  Código de verificación enviado
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enviamos un código numérico de 6 dígitos a tu correo electrónico registrado:{" "}
                  <strong className="text-foreground font-mono">{maskedEmail}</strong>.
                </p>
              </div>
            </div>

            {/* Timers & Cooldown Info */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-lg text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {expirationSeconds > 0 ? (
                    <>
                      Expira en:{" "}
                      <strong className="font-mono text-foreground">
                        {Math.floor(expirationSeconds / 60)}:
                        {String(expirationSeconds % 60).padStart(2, "0")}
                      </strong>
                    </>
                  ) : (
                    <span className="text-destructive font-medium">Código expirado</span>
                  )}
                </span>
              </div>

              <div>
                {cooldownSeconds > 0 ? (
                  <span className="text-muted-foreground font-mono text-[11px]">
                    Reenviar disponible en {cooldownSeconds}s
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResendOtp}
                    disabled={isRequestingOtp || isVerifyingOtp || requiresRestart || remainingAttempts === 0}
                    className="h-7 text-xs text-primary hover:text-primary-dark p-0 underline font-medium"
                    data-testid="button-resend-otp"
                  >
                    {isRequestingOtp ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Reenviar código
                  </Button>
                )}
              </div>
            </div>

            {/* Request/Resend error banner during OTP step */}
            {requestError && (
              <Alert variant="destructive" data-testid="alert-resend-otp-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-xs font-semibold">Error al solicitar o reenviar código</AlertTitle>
                <AlertDescription className="text-xs mt-0.5">{requestError}</AlertDescription>
              </Alert>
            )}

            {/* Verification error & Attempts banner */}
            {verifyError && (
              <Alert variant="destructive" data-testid="alert-verify-otp-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-xs font-semibold">Error de verificación</AlertTitle>
                <AlertDescription className="text-xs mt-0.5 space-y-1">
                  <p>{verifyError}</p>
                  {remainingAttempts !== null && !requiresRestart && (
                    <p className="font-semibold text-destructive-foreground">
                      Intentos restantes: {remainingAttempts}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Restart notification on attempts exhausted, expired, or identity change */}
            {(requiresRestart || remainingAttempts === 0) && (
              <Alert className="border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="alert-restart-required">
                <RotateCcw className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-xs font-semibold">Reinicio requerido</AlertTitle>
                <AlertDescription className="text-xs mt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span>
                    El proceso de formalización debe reiniciarse por límite de intentos agotados, vencimiento o modificación de identidad.
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRestart}
                    className="h-7 text-xs bg-background shrink-0"
                    data-testid="button-restart-formalization"
                  >
                    Reiniciar proceso
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* 6-Digit input */}
            {!requiresRestart && remainingAttempts !== 0 && (
              <div className="space-y-3 pt-2">
                <label
                  htmlFor="formalization-otp-input"
                  className="text-xs font-semibold text-foreground block text-center"
                >
                  Ingresa el código numérico de 6 dígitos
                </label>
                <div className="flex justify-center">
                  <Input
                    id="formalization-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setOtpCode(val);
                    }}
                    placeholder="000000"
                    disabled={isVerifyingOtp || isRequestingOtp || requiresRestart || remainingAttempts === 0 || expirationSeconds === 0}
                    className="w-48 text-center text-2xl font-mono tracking-widest h-12 font-bold"
                    data-testid="input-formalization-otp"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-center text-muted-foreground">
                  El código es personal e intransferible. Válido únicamente para tu correo registrado.
                </p>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: SUCCESS */}
        {step === "success" && (
          <div
            className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-center"
            data-testid="section-formalization-success"
          >
            <div className="mx-auto w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="text-lg font-bold text-foreground">
                ¡Convenio Formalizado Exitosamente!
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Has aceptado digitalmente los documentos contractuales mediante código de verificación,
                completando el requisito legal de formalización. Los permisos operativos y de originación
                asignados a tu cuenta continúan aplicando con normalidad.
              </p>
            </div>

            {verifiedAcceptances.length > 0 && (
              <div className="rounded-lg border border-border/80 bg-muted/20 p-4 text-left max-w-lg mx-auto space-y-2">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Evidencias de aceptación registradas:
                </span>
                <div className="space-y-1.5 font-mono text-[11px] text-muted-foreground">
                  {verifiedAcceptances.map((acc, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-background rounded border flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-foreground">{acc.document} v{acc.version}</span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                        {acc.contentSha256?.slice(0, 12)}...
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        <DialogFooter className="p-4 sm:p-6 border-t bg-muted/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {step === "review" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="order-2 sm:order-1 text-xs"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={!allDocumentsChecked || isRequestingOtp || isVerifyingOtp || cooldownSeconds > 0}
                onClick={handleRequestOtp}
                className="order-1 sm:order-2 text-xs gap-1.5"
                data-testid="button-request-otp"
              >
                {isRequestingOtp ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Solicitando código...
                  </>
                ) : cooldownSeconds > 0 ? (
                  <>
                    <Clock className="h-3.5 w-3.5" />
                    Disponible en {cooldownSeconds}s
                  </>
                ) : (
                  <>
                    Solicitar Código por Correo
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </>
          )}

          {step === "otp" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("review")}
                disabled={isVerifyingOtp || isRequestingOtp}
                className="order-2 sm:order-1 text-xs"
              >
                Volver a revisar documentos
              </Button>
              <Button
                size="sm"
                disabled={
                  otpCode.trim().length !== 6 ||
                  isVerifyingOtp ||
                  isRequestingOtp ||
                  requiresRestart ||
                  remainingAttempts === 0 ||
                  expirationSeconds === 0
                }
                onClick={handleVerifyOtp}
                className="order-1 sm:order-2 text-xs gap-1.5"
                data-testid="button-verify-otp"
              >
                {isVerifyingOtp ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verificar y Formalizar
                  </>
                )}
              </Button>
            </>
          )}

          {step === "success" && (
            <div className="w-full flex justify-end">
              <Button
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-xs"
                data-testid="button-finish-formalization"
              >
                Finalizar
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
