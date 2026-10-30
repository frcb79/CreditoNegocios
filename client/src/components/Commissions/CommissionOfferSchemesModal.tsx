import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Percent, RefreshCw, Search, FileEdit } from "lucide-react";
import { Link } from "wouter";

type RateSet = {
  total?: number | string | null;
  apertura?: number | string | null;
  sobretasa?: number | string | null;
  renovacion?: number | string | null;
};
type RateScheme = {
  financiera?: RateSet | null;
  masterBroker?: RateSet | null;
  broker?: RateSet | null;
};
type OfferScheme = {
  offerId: string;
  institutionId: string;
  institutionName: string;
  offerName: string | null;
  productType: string | null;
  versionNumber: number;
  versionStatus: string;
  overrateOwner: string | null;
  commissionRates: RateScheme | null;
};

function numericRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
function percent(value: unknown): string {
  const num = numericRate(value);
  return num === null ? "Pendiente" :
    num.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}
function platformMargin(received: unknown, paid: unknown): string {
  const income = numericRate(received);
  const expense = numericRate(paid);
  if (income === null || expense === null) return "Pendiente";
  return percent(income - expense);
}

export default function CommissionOfferSchemesModal({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [search, setSearch] = useState("");
  const { data = [], isLoading, isError, refetch, isFetching } = useQuery<OfferScheme[]>({
    queryKey: ["/api/institution-products/commission-schemes"],
    enabled: open,
  });

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es-MX");
    return data.filter(item =>
      (item.institutionName + " " + (item.offerName || "") + " " + (item.productType || ""))
        .toLocaleLowerCase("es-MX").includes(normalizedSearch));
  }, [data, search]);
  const configured = data.filter(item => numericRate(item.commissionRates?.financiera?.apertura) !== null).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Percent className="w-5 h-5 text-primary" />
            Esquemas de comisiones por oferta
          </DialogTitle>
          <p className="text-xs text-slate-500">
            Condiciones tomadas de la versión de cada oferta. No se utilizan porcentajes generales históricos de la financiera.
            Consulta reservada exclusivamente a Super Admin.
          </p>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <Input className="pl-9" placeholder="Buscar financiera u oferta..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2 items-center text-xs text-slate-600">
            <span>{configured} con apertura de financiera / {data.length} ofertas versionadas</span>
            <Button type="button" variant="outline" size="sm" disabled={isFetching}
              onClick={() => void refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Actualizar
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          {isLoading && <p className="text-sm text-slate-500 p-4">Consultando comisiones por oferta...</p>}
          {isError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              No se pudieron consultar los esquemas de comisiones. Verifica la sesión de Super Admin.
              <Button type="button" variant="outline" size="sm" className="ml-3" onClick={() => void refetch()}>
                Reintentar
              </Button>
            </div>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-slate-500">
              No hay ofertas que coincidan con la búsqueda.
            </p>
          )}
          {!isError && filtered.map(offer => {
            const rates = offer.commissionRates;
            const financial = rates?.financiera;
            const master = rates?.masterBroker;
            const broker = rates?.broker;
            const available = numericRate(financial?.apertura) !== null;
            return (
              <div key={offer.offerId} className="border border-slate-200 rounded-xl p-3 bg-white space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{offer.institutionName}</span>
                    </div>
                    <p className="font-semibold text-sm mt-0.5 text-slate-900">
                      {offer.offerName || "Oferta sin nombre"}
                    </p>
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <Badge variant="outline">v{offer.versionNumber} · {
                      offer.versionStatus === "draft" ? "Borrador" : "Publicada"
                    }</Badge>
                    <Badge variant="outline" className={available
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-amber-50 text-amber-800 border-amber-200"}>
                      {available ? "Comisión registrada" : "Apertura pendiente"}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {([
                    ["Financiera paga CN", percent(financial?.apertura)],
                    ["Techo Master", percent(master?.apertura)],
                    ["Broker directo", percent(broker?.apertura)],
                    ["Margen CN · Master", platformMargin(financial?.apertura, master?.apertura)],
                    ["Margen CN · Directo", platformMargin(financial?.apertura, broker?.apertura)],
                  ] as Array<[string, string]>).map(([label, value]) => (
                    <div key={label} className="bg-slate-50 border border-slate-100 rounded-md p-2 min-w-0">
                      <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
                      <p className="text-sm font-semibold mt-1 tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-2">
                  <Link href={`/financieras/${offer.institutionId}?tab=ofertas`}>
                    <Button type="button" variant="outline" size="sm" className="gap-1 text-xs"
                      onClick={() => onOpenChange(false)} data-testid={`edit-commission-offer-${offer.offerId}`}>
                      <FileEdit className="w-3.5 h-3.5" />
                      Editar comisiones en nueva versión
                    </Button>
                  </Link>
                </div>
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-blue-800">
                    Ver detalle de total, apertura, sobretasa y renovación
                  </summary>
                  <div className="overflow-x-auto mt-2 rounded-md border border-slate-200">
                    <table className="w-full min-w-[460px] text-xs text-left">
                      <thead className="bg-slate-50">
                        <tr><th className="p-2">Concepto</th><th className="p-2">Financiera → CN</th>
                          <th className="p-2">Master</th><th className="p-2">Broker directo</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {([
                          ["Total", "total"], ["Apertura", "apertura"],
                          ["Sobretasa", "sobretasa"], ["Renovación", "renovacion"],
                        ] as Array<[string, keyof RateSet]>).map(([name, key]) => (
                          <tr key={key}>
                            <td className="p-2 font-medium">{name}</td>
                            <td className="p-2 tabular-nums">{percent(financial?.[key])}</td>
                            <td className="p-2 tabular-nums">{percent(master?.[key])}</td>
                            <td className="p-2 tabular-nums">{percent(broker?.[key])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Los canales Master y Broker Directo son alternativas, no se suman entre sí.
                    La sobretasa es exclusiva de Crédito Negocios y no se distribuye al canal.
                  </p>
                </details>
              </div>
            );
          })}
        </div>
        <DialogFooter className="border-t border-slate-200 pt-3">
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
