import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, ShieldCheck, Lock } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  clientExists: boolean;
  isSameTenant: boolean;
  canCreateOpportunity: boolean;
  duplicateReason:
    | "no_duplicate"
    | "same_tenant_client_eligible"
    | "client_has_protected_opportunity"
    | "client_has_active_relationship_same_broker"
    | "client_has_active_relationship_other_broker"
    | "client_dormant_eligible"
    | "client_historical_eligible"
    | "cross_tenant_collision";
  message: string;
  existingClient?: {
    id?: string;
    businessName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    rfc?: string | null;
    type?: string | null;
  };
  activeOpportunity?: {
    id: string;
    financingNeedType: string;
    status: string;
    brokerId: string;
    holdExpiresAt?: string | Date | null;
    protectedUntil?: string | Date | null;
  };
  commercialRelationship?: {
    status: string;
    brokerId: string;
    activeUntil?: string | Date | null;
  };
}

interface CommercialDuplicateAlertProps {
  result: DuplicateCheckResult | null;
  onSelectExistingClient?: (client: NonNullable<DuplicateCheckResult["existingClient"]>) => void;
  className?: string;
}

export const CommercialDuplicateAlert: React.FC<CommercialDuplicateAlertProps> = ({
  result,
  onSelectExistingClient,
  className = "",
}) => {
  if (!result) return null;

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

  // 1. Colisión Inter-Tenant (Bloqueo absoluto de privacidad)
  if (result.duplicateReason === "cross_tenant_collision") {
    return (
      <Alert variant="destructive" className={`border-red-300 bg-red-50 dark:bg-red-950/30 ${className}`}>
        <Lock className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
        <AlertTitle className="text-red-900 dark:text-red-200 font-semibold text-sm">
          Coincidencia registrada en otra organización
        </AlertTitle>
        <AlertDescription className="text-red-800 dark:text-red-300 text-xs mt-1">
          Este cliente o razón social ya se encuentra dado de alta en una organización externa. Por políticas de confidencialidad y gobernanza comercial, no está disponible para asignación directa. Consulta con Mesa de Control de Plataforma si consideras que se trata de una cuenta compartida.
        </AlertDescription>
      </Alert>
    );
  }

  // 2. Oportunidad equivalente protegida de otro asesor (409 / Conflicto)
  if (result.duplicateReason === "client_has_protected_opportunity") {
    const opp = result.activeOpportunity;
    return (
      <Alert className={`border-amber-300 bg-amber-50 dark:bg-amber-950/30 ${className}`}>
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
        <AlertTitle className="text-amber-900 dark:text-amber-200 font-semibold text-sm">
          Existe una oportunidad protegida vigente para esta necesidad
        </AlertTitle>
        <AlertDescription className="text-amber-800 dark:text-amber-300 text-xs mt-1 space-y-1">
          <p>
            El cliente ya cuenta con un asesor comercial con derechos de protección vigentes para esta necesidad de financiamiento{" "}
            {opp?.protectedUntil && (
              <span className="font-semibold">
                (vigente hasta el {formatDate(opp.protectedUntil)})
              </span>
            )}
            .
          </p>
          <p className="text-amber-700 dark:text-amber-400">
            Un intento de registro no cancela ni congela los derechos comerciales existentes. Para representar a este cliente, se requiere una solicitud verificable de confirmación de elección de broker emitida formalmente por el cliente.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  // 3. Ya tiene oportunidad activa el mismo broker
  if (result.duplicateReason === "client_has_active_relationship_same_broker") {
    return (
      <Alert className={`border-blue-300 bg-blue-50 dark:bg-blue-950/30 ${className}`}>
        <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
        <AlertTitle className="text-blue-900 dark:text-blue-200 font-semibold text-sm">
          Ya cuentas con una oportunidad protegida para este cliente
        </AlertTitle>
        <AlertDescription className="text-blue-800 dark:text-blue-300 text-xs mt-1">
          Eres el asesor titular con protección comercial activa para esta línea. Puedes consultar su expediente y registrar actividades comerciales calificadas para continuar su gestión.
        </AlertDescription>
      </Alert>
    );
  }

  // 4. Cliente tiene relación activa con otro broker para otra línea pero es ELEGIBLE
  if (result.duplicateReason === "client_has_active_relationship_other_broker") {
    return (
      <Alert className={`border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 ${className}`}>
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5" />
        <AlertTitle className="text-emerald-900 dark:text-emerald-200 font-semibold text-sm">
          Cliente existente elegible para nueva oportunidad
        </AlertTitle>
        <AlertDescription className="text-emerald-800 dark:text-emerald-300 text-xs mt-1">
          El cliente cuenta con un asesor asignado para otra línea de producto, pero <span className="font-semibold">no tiene oportunidad protegida</span> para esta necesidad específica. Puedes registrar la oportunidad comercial con total validez.
        </AlertDescription>
      </Alert>
    );
  }

  // 5. Cliente existente en estado Dormant o Histórico pero ELEGIBLE
  if (
    result.duplicateReason === "client_dormant_eligible" ||
    result.duplicateReason === "client_historical_eligible" ||
    result.duplicateReason === "same_tenant_client_eligible"
  ) {
    const clientName =
      result.existingClient?.businessName ||
      `${result.existingClient?.firstName || ""} ${result.existingClient?.lastName || ""}`.trim() ||
      "Cliente registrado";

    return (
      <Alert className={`border-blue-200 bg-blue-50/70 dark:bg-blue-950/20 ${className}`}>
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div className="flex-1">
          <AlertTitle className="text-blue-900 dark:text-blue-200 font-semibold text-sm flex items-center gap-2">
            <span>Cliente registrado: {clientName}</span>
            <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-800 border-blue-300">
              Elegible para nueva oportunidad
            </Badge>
          </AlertTitle>
          <AlertDescription className="text-blue-800 dark:text-blue-300 text-xs mt-1">
            Este cliente ya existe en el sistema sin oportunidades vigentes activas. Puedes registrar una nueva oportunidad comercial para iniciar la reserva y la gestión comercial activa.
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  // 6. Cliente nuevo sin duplicados
  if (result.duplicateReason === "no_duplicate" && result.canCreateOpportunity) {
    return (
      <Alert className={`border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 ${className}`}>
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5" />
        <AlertTitle className="text-emerald-900 dark:text-emerald-200 font-semibold text-sm">
          Cliente nuevo verificado
        </AlertTitle>
        <AlertDescription className="text-emerald-800 dark:text-emerald-300 text-xs mt-0.5">
          No existen coincidencias previas para los datos ingresados. Elegible para creación de ficha y registro de oportunidad con protección comercial.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
};
