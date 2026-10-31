import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type RateRow = {
  offerId: string; offerName: string; institutionName: string;
  versionNumber: number; assigned: boolean;
  apertura: number | null; renovacion: number | null;
};
type OfferRate = {
  institutionId: string; institutionName: string; offerId: string; offerName: string;
  versionNumber: number;
  masterCeiling: { apertura: number; renovacion: number };
  suggestedBroker: { apertura: number; renovacion: number };
  assignedRate: { apertura: number; renovacion: number } | null;
};
type NetworkData = { rates: Record<string, any>; offerItems: OfferRate[] };
type EditableRate = { apertura: string; renovacion: string };

export default function MyCommissionRatesModal({ open, onOpenChange }: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const isMaster = user?.role === "master_broker";
  const { toast } = useToast();
  const client = useQueryClient();
  const [form, setForm] = useState<Record<string, EditableRate>>({});
  const [dirty, setDirty] = useState(false);
  const { data = [], isLoading, isError } = useQuery<RateRow[]>({
    queryKey: ["/api/commissions/my-offer-rates"],
    enabled: open,
    queryFn: async () => {
      const r = await fetch("/api/commissions/my-offer-rates", { credentials: "include" });
      if (!r.ok) throw new Error("No se pudieron consultar tus porcentajes");
      return r.json();
    }
  });
  const { data: network, isLoading: networkLoading, isError: networkError } = useQuery<NetworkData>({
    queryKey: ["/api/master-broker/network-rates"],
    enabled: open && isMaster,
  });

  useEffect(() => {
    if (!open || !network || !isMaster) return;
    const initial: Record<string, EditableRate> = {};
    for (const item of network.offerItems || []) {
      initial[item.offerId] = {
        apertura: item.assignedRate?.apertura == null ? "" : String(item.assignedRate.apertura),
        renovacion: item.assignedRate?.renovacion == null ? "" : String(item.assignedRate.renovacion),
      };
    }
    setForm(initial);
    setDirty(false);
  }, [open, isMaster, network]);

  const setRate = (id: string, field: keyof EditableRate, value: string) => {
    setForm(previous => ({ ...previous, [id]: { ...previous[id], [field]: value } }));
    setDirty(true);
  };
  const suggested = (item: OfferRate) => ({
    apertura: String(Math.min(item.suggestedBroker.apertura, item.masterCeiling.apertura)),
    renovacion: String(Math.min(item.suggestedBroker.renovacion, item.masterCeiling.renovacion)),
  });
  const applySuggested = (item: OfferRate) => {
    setForm(previous => ({ ...previous, [item.offerId]: suggested(item) }));
    setDirty(true);
  };
  const applyAll = () => {
    if (!network) return;
    setForm(previous => ({
      ...previous,
      ...Object.fromEntries(network.offerItems.map(item => [item.offerId, suggested(item)])),
    }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: async (rates: Record<string, EditableRate>) => {
      const r = await apiRequest("PUT", "/api/master-broker/network-rates", { rates });
      return r.json();
    },
    onSuccess: () => {
      setDirty(false);
      void client.invalidateQueries({ queryKey: ["/api/master-broker/network-rates"] });
      void client.invalidateQueries({ queryKey: ["/api/commissions/my-offer-rates"] });
      void client.invalidateQueries({ queryKey: ["/api/financial-institutions"] });
      toast({ title: "Asignaciones guardadas", description: "Tus porcentajes por oferta se actualizaron. La red deberá aceptar las condiciones vigentes cuando corresponda." });
    },
    onError: (error: any) => toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }),
  });

  const saveAll = () => {
    if (!network) return;
    const payload: Record<string, EditableRate> = {};
    for (const item of network.offerItems) {
      const entry = form[item.offerId];
      if (!entry || (entry.apertura.trim() === "" && entry.renovacion.trim() === "")) continue;
      const a = Number(entry.apertura);
      const r = Number(entry.renovacion);
      if (!entry.apertura.trim() || !entry.renovacion.trim() ||
          !Number.isFinite(a) || !Number.isFinite(r) || a < 0 || r < 0 ||
          a > item.masterCeiling.apertura || r > item.masterCeiling.renovacion) {
        toast({ title: "Porcentaje no permitido", description: `Revisa los porcentajes de ${item.institutionName} — ${item.offerName}. No puedes superar tu techo de apertura o renovación.`, variant: "destructive" });
        return;
      }
      payload[item.offerId] = { apertura: entry.apertura, renovacion: entry.renovacion };
    }
    if (!Object.keys(payload).length) {
      toast({ title: "Sin asignaciones", description: "Selecciona al menos una oferta antes de guardar." });
      return;
    }
    save.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] flex flex-col overflow-hidden" data-testid="my-commission-rates-modal">
        <DialogHeader>
          <DialogTitle>{isMaster ? "Mis porcentajes y asignación a mi red" : "Mis porcentajes por oferta"}</DialogTitle>
          <DialogDescription>
            Apertura y renovación vigentes por oferta. Las operaciones confirmadas mantienen las tasas congeladas de su propuesta y versión.
            {isMaster && " La sugerencia corresponde a la comisión que Crédito Negocios ofrece al broker directo, limitada por tu techo."}
          </DialogDescription>
        </DialogHeader>
        {isMaster ? (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-slate-500">La sobretasa es exclusiva de Crédito Negocios; nunca se asigna a la red.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={applyAll} disabled={!network?.offerItems?.length || save.isPending}
                  data-testid="apply-all-suggested">Aceptar sugeridos para todas</Button>
                <Button size="sm" onClick={saveAll} disabled={!dirty || save.isPending}
                  data-testid="save-master-offer-rates">{save.isPending ? "Guardando..." : "Guardar asignaciones"}</Button>
              </div>
            </div>
            {networkLoading ? <p className="text-sm">Consultando ofertas...</p> :
             networkError ? <p role="alert" className="text-sm text-red-700">No se pudieron cargar los límites de comisiones de red.</p> :
             !network?.offerItems?.length ? <p className="text-sm">No hay ofertas publicadas para asignar.</p> :
              <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
                <table className="w-full min-w-[780px] text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr><th className="p-3">Financiera / Oferta</th><th className="p-3">Mi techo</th>
                      <th className="p-3">Sugerido al broker</th><th className="p-3">Asignar apertura</th>
                      <th className="p-3">Asignar renovación</th><th className="p-3">Acción</th></tr>
                  </thead>
                  <tbody>
                    {network.offerItems.map(item => (
                      <tr key={item.offerId} className="border-t">
                        <td className="p-3"><p className="font-semibold">{item.institutionName}</p>
                          <p className="text-slate-600">{item.offerName} · v{item.versionNumber}</p></td>
                        <td className="p-3">{item.masterCeiling.apertura.toFixed(2)}% apertura
                          <p>{item.masterCeiling.renovacion.toFixed(2)}% renovación</p></td>
                        <td className="p-3">{suggested(item).apertura}% apertura
                          <p>{suggested(item).renovacion}% renovación</p></td>
                        <td className="p-3"><Input type="number" step="0.01" min="0"
                          max={item.masterCeiling.apertura}
                          value={form[item.offerId]?.apertura ?? ""}
                          onChange={e => setRate(item.offerId, "apertura", e.target.value)}
                          aria-label={`Apertura para ${item.institutionName} ${item.offerName}`} className="w-24 h-8" /></td>
                        <td className="p-3"><Input type="number" step="0.01" min="0"
                          max={item.masterCeiling.renovacion}
                          value={form[item.offerId]?.renovacion ?? ""}
                          onChange={e => setRate(item.offerId, "renovacion", e.target.value)}
                          aria-label={`Renovación para ${item.institutionName} ${item.offerName}`} className="w-24 h-8" /></td>
                        <td className="p-3"><Button variant="outline" size="sm"
                          onClick={() => applySuggested(item)} disabled={save.isPending}>Aceptar sugerido</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
          </>
        ) : (
          isLoading ? <p className="text-sm">Consultando tus porcentajes…</p> :
          isError ? <p role="alert" className="text-sm text-red-700">No se pudieron cargar tus porcentajes.</p> :
          !data.length ? <p className="text-sm">No hay ofertas publicadas disponibles.</p> :
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr><th className="p-3">Financiera / Oferta</th><th className="p-3">Apertura</th><th className="p-3">Renovación</th></tr>
              </thead>
              <tbody>{data.map(row => (
                <tr key={row.offerId} className="border-t">
                  <td className="p-3"><p className="font-semibold">{row.institutionName}</p>
                    <p className="text-slate-600">{row.offerName}</p></td>
                  <td className="p-3 font-semibold">{row.apertura !== null ? `${row.apertura.toFixed(2)}%` : "Por asignar"}</td>
                  <td className="p-3 font-semibold">{row.renovacion !== null ? `${row.renovacion.toFixed(2)}%` : "Por asignar"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
