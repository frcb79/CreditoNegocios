import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildApiUrl } from "@/lib/runtimeConfig";
import { getDocumentTitle, shouldShowFormalizationNotice, type FormalizationStatusResult } from "@shared/legalDocuments";

interface FormalizationPendingBannerProps {
  role?: string | null;
  userId?: string | null;
  onAction: () => void;
  testId?: string;
  buttonTestId?: string;
}

/** Shared postlaunch UI. The API remains the authority for role, versions and prior evidence. */
export default function FormalizationPendingBanner({
  role,
  userId,
  onAction,
  testId = "alert-formalization-notice",
  buttonTestId = "button-open-formalization",
}: FormalizationPendingBannerProps) {
  const eligible = shouldShowFormalizationNotice(role);
  const { data, isLoading, isError } = useQuery<FormalizationStatusResult>({
    queryKey: ["/api/legal/formalization/status", userId],
    enabled: eligible && Boolean(userId),
    queryFn: async () => {
      const response = await fetch(buildApiUrl("/api/legal/formalization/status"), { credentials: "include" });
      if (!response.ok) throw new Error("No fue posible comprobar las aceptaciones vigentes.");
      return response.json();
    },
    staleTime: 30000,
  });

  if (!eligible || !userId || isLoading || (!data && !isError) || data?.isFormalized) return null;

  const accepted = new Set(data?.acceptedDocuments || []);
  const required = data?.requiredDocuments || [];

  return (
    <Alert
      className="border-amber-300 bg-amber-50/90 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 shadow-2xs"
      data-testid={testId}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0 w-full">
        <div className="flex min-w-0 items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0 space-y-2">
            <h2 className="font-semibold text-sm">Completa tu registro</h2>
            <p className="text-xs sm:text-sm leading-relaxed">
              {isError
                ? "No fue posible verificar el estado de tus documentos. Consulta Documentos y convenios antes de operar."
                : "Revisa y acepta los documentos vigentes aplicables a tu rol para completar la formalización."}
            </p>
            {!isError && (
              <div className="flex flex-wrap gap-1.5" aria-label="Estado de documentos legales requeridos">
                {required.map((doc) => (
                  <span key={doc} className="inline-flex max-w-full items-center gap-1 rounded-md border border-amber-200 bg-white/80 dark:bg-amber-950/40 px-2 py-1 text-xs">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span>{getDocumentTitle(doc)}</span>
                    <Badge
                      variant="outline"
                      className={accepted.has(doc)
                        ? "shrink-0 border-emerald-300 text-emerald-800 dark:text-emerald-300"
                        : "shrink-0 border-amber-400 text-amber-900 dark:text-amber-200"}
                    >
                      {accepted.has(doc) ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
                      {accepted.has(doc) ? "Aceptado" : "Pendiente"}
                    </Badge>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <Button
          onClick={onAction}
          size="sm"
          className="shrink-0 self-start sm:self-center h-auto min-h-9 whitespace-normal text-left bg-amber-700 hover:bg-amber-800 text-white"
          data-testid={buttonTestId}
        >
          Revisar y aceptar documentos pendientes
        </Button>
      </div>
    </Alert>
  );
}
