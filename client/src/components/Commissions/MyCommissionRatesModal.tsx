import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type RateRow = {
  offerId: string; offerName: string; institutionName: string;
  versionNumber: number; assigned: boolean;
  apertura: number | null; renovacion: number | null;
  source: "master" | "plataforma";
};

export default function MyCommissionRatesModal({ open, onOpenChange }: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { data = [], isLoading, isError } = useQuery<RateRow[]>({
    queryKey: ["/api/commissions/my-offer-rates"],
    enabled: open,
    queryFn: async () => {
      const r = await fetch("/api/commissions/my-offer-rates", { credentials: "include" });
      if (!r.ok) throw new Error("No se pudieron consultar tus porcentajes");
      return r.json();
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="my-commission-rates-modal">
        <DialogHeader>
          <DialogTitle>Mis porcentajes por oferta</DialogTitle>
          <DialogDescription>
            Apertura y renovación vigentes según tu canal comercial. Los importes reales de una operación se rigen por su propuesta y versión aprobada.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? <p className="text-sm">Consultando tus porcentajes…</p> :
         isError ? <p role="alert" className="text-sm text-red-700">No se pudieron cargar tus porcentajes.</p> :
         !data.length ? <p className="text-sm">No hay ofertas publicadas disponibles.</p> :
         <div className="overflow-x-auto rounded-lg border">
           <table className="w-full text-left text-xs">
             <thead className="bg-slate-50 text-slate-600">
               <tr><th className="p-3">Financiera / Oferta</th><th className="p-3">Apertura</th>
                 <th className="p-3">Renovación</th><th className="p-3">Asignación</th></tr>
             </thead>
             <tbody>
               {data.map(row => (
                 <tr key={row.offerId} className="border-t">
                   <td className="p-3"><p className="font-semibold">{row.institutionName}</p>
                     <p className="text-slate-600">{row.offerName}</p></td>
                   <td className="p-3 font-semibold">{row.assigned ? `${row.apertura?.toFixed(2)}%` : "Por asignar"}</td>
                   <td className="p-3 font-semibold">{row.assigned ? `${row.renovacion?.toFixed(2)}%` : "Por asignar"}</td>
                   <td className="p-3"><Badge variant="outline">{row.source === "master" ? "Mi Master Broker" : "Crédito Negocios"}</Badge></td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>}
      </DialogContent>
    </Dialog>
  );
}
