import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Pending = {
  offerId: string;
  versionNumber: number;
  applicableRole: "broker_directo" | "master_broker";
  contentSha256: string | null;
  reason?: string;
  previousRates: Record<string, unknown> | null;
  newRates: Record<string, unknown> | null;
};

function rateLines(rates: Record<string, unknown> | null) {
  if (!rates) return "Por validar";
  const actor = (rates.broker || rates.masterBroker || {}) as Record<string, unknown>;
  const entries = Object.entries(actor).filter(([, value]) =>
    typeof value === "string" || typeof value === "number");
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join(" · ")
    : "Sin cuotas para mostrar";
}

/** Only versioned beneficiary shares are shown. No Master wholesale terms
 * are ever rendered to their network Brokers. */
export default function PendingOfferCommissionAcceptances() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const list = useQuery<{ pending: Pending[] }>({
    queryKey: ["/api/commercial/offer-acceptances/pending"],
  });

  const mutation = useMutation({
    mutationFn: async (entry: Pending) => {
      const response = await apiRequest(
        "POST",
        `/api/institution-products/${encodeURIComponent(entry.offerId)}/commission-acceptance`,
        { versionNumber: entry.versionNumber, contentSha256: entry.contentSha256 },
      );
      return response.json();
    },
    onSuccess: (_response, entry) => {
      setChecked(previous => ({ ...previous, [`${entry.offerId}:${entry.versionNumber}`]: false }));
      queryClient.invalidateQueries({ queryKey: ["/api/commercial/offer-acceptances/pending"] });
      toast({ title: "Condiciones registradas", description: "La aceptación quedó vinculada a la versión de esta oferta." });
    },
    onError: (error: Error) => {
      toast({ title: "No se pudo registrar la aceptación", description: error.message, variant: "destructive" });
    },
  });

  if (list.isLoading) return null;
  if (list.isError) return (
    <Card><CardContent className="p-4 text-sm text-destructive">
      No se pudo verificar si tienes nuevas condiciones económicas por aceptar. Intenta actualizar la página.
    </CardContent></Card>
  );
  const pending = list.data?.pending || [];
  if (!pending.length) return null;

  return (
    <section aria-label="Actualizaciones económicas pendientes" className="space-y-3" data-testid="offer-acceptances-pending">
      <h2 className="font-semibold text-base">Actualizaciones económicas pendientes de aceptación</h2>
      <p className="text-sm text-muted-foreground">
        Sólo se muestran las condiciones pagaderas correspondientes a tu canal. Los créditos y operaciones ya congelados conservan su histórico.
      </p>
      {pending.map(entry => {
        const key = `${entry.offerId}:${entry.versionNumber}`;
        const cannotAccept = !entry.contentSha256 || Boolean(entry.reason);
        return (
          <Card key={key}>
            <CardContent className="space-y-3 p-4 text-sm">
              <div className="font-medium">
                Oferta {entry.offerId.slice(0, 8)} · versión {entry.versionNumber}
                {entry.applicableRole === "master_broker" ? " · Master Broker" : " · Broker directo"}
              </div>
              {cannotAccept ? (
                <p className="text-destructive">Esta versión requiere validación administrativa antes de aceptar. No se pueden confirmar nuevas operaciones afectadas.</p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div><strong>Condiciones anteriores:</strong><p>{rateLines(entry.previousRates)}</p></div>
                    <div><strong>Nuevas condiciones:</strong><p>{rateLines(entry.newRates)}</p></div>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={checked[key] === true}
                      onCheckedChange={value => setChecked(prev => ({ ...prev, [key]: value === true }))}
                      aria-label="Confirmar aceptación expresa de cambios económicos"
                    />
                    <span>He revisado y acepto expresamente las nuevas condiciones de comisión de esta oferta y versión.</span>
                  </label>
                  <Button
                    disabled={!checked[key] || mutation.isPending}
                    onClick={() => mutation.mutate(entry)}
                    data-testid="offer-commission-accept"
                  >
                    Registrar mi aceptación
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
