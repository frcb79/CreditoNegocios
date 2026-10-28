import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InstitutionProductWithTemplate } from "@shared/schema";

type Preview = { draftVersion: { id: string; versionHash: string; versionNumber: number; conditions?: any; requirements?: any; requiredDocuments?: string[] }; validation: { isValid: boolean; errors: string[]; warnings: string[] }; summary?: any };
type Row = { offer: InstitutionProductWithTemplate; preview?: Preview; error?: string };
export default function BatchOfferPublishModal({ offers, onClose }: {
  offers: InstitutionProductWithTemplate[]; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);
  const preview = useQuery<Row[]>({
    queryKey: ["offer-batch-preview", offers.map(o => o.id)], retry: false, refetchOnWindowFocus: false,
    queryFn: async () => {
      const rows: Row[] = [];
      for (const offer of offers) {
        try { rows.push({offer, preview: await (await apiRequest("GET", `/api/institution-products/${offer.id}/publish-preview`)).json()}); }
        catch (error: any) { rows.push({offer, error: error.message}); }
      }
      return rows;
    },
  });
  const selected = (preview.data || []).filter(r => r.preview?.validation.isValid && !excluded.includes(r.offer.id));
  async function publish() {
    if (running || finished || !confirmed || reason.trim().length < 3 || !selected.length) return;
    setRunning(true);
    for (const row of selected) {
      setResults(prev => ({...prev, [row.offer.id]: "Publicando…"}));
      try {
        await apiRequest("POST", `/api/institution-products/${row.offer.id}/publish`, {
          confirmPublish: true, changeReason: reason.trim(),
          expectedDraftId: row.preview!.draftVersion.id, expectedVersionHash: row.preview!.draftVersion.versionHash,
        });
        setResults(prev => ({...prev, [row.offer.id]: "Publicada"}));
      } catch (error: any) {
        setResults(prev => ({...prev, [row.offer.id]: "No confirmada: " + error.message + ". Actualiza el catálogo antes de intentarlo de nuevo."}));
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["/api/institution-products"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/institution-products/financial-summaries"] });
    setRunning(false); setFinished(true);
  }
  return <Dialog open onOpenChange={open => {if (!open && !running) onClose();}}>
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" onEscapeKeyDown={e => {if(running)e.preventDefault();}} onPointerDownOutside={e => {if(running)e.preventDefault();}}>
      <DialogTitle>Confirmar y publicar ofertas en conjunto</DialogTitle>
      <DialogDescription>Revisa los borradores de la lista actual. Cada oferta se valida y publica conservando su historial. Las que tengan errores permanecen en borrador.</DialogDescription>
      {preview.isLoading ? <p role="status">Revisando {offers.length} borradores…</p> : preview.isError ? <p role="alert">No se pudo cargar la revisión. Cierra e intenta de nuevo.</p> : <>
        <p className="text-sm">{selected.length} ofertas listas para publicar · {(preview.data || []).filter(r => !r.preview?.validation.isValid).length} bloqueadas</p>
        <div className="space-y-3">{preview.data?.map(row => <div className="rounded-lg border p-3 text-xs space-y-2" key={row.offer.id}>
          <label className="flex gap-2 font-semibold"><input type="checkbox" checked={Boolean(row.preview?.validation.isValid && !excluded.includes(row.offer.id))}
            disabled={!row.preview?.validation.isValid || running || finished} onChange={e => setExcluded(prev => e.target.checked ? prev.filter(id => id !== row.offer.id) : [...prev, row.offer.id])} />
            {row.offer.name || row.offer.customName} · v{row.preview?.draftVersion.versionNumber || "—"}</label>
          {row.preview && <p>Monto: {row.preview.summary?.amounts?.min ?? "Abierto"} – {row.preview.summary?.amounts?.max ?? "Abierto"} MXN. Plazo máximo: {row.preview.summary?.terms?.max ?? "Pendiente"} meses.</p>}
          {row.preview && <details><summary className="cursor-pointer font-medium">Ver condiciones, comisiones y documentos</summary>
            <div className="space-y-1 pt-2">
              <p>Tasa / factor: {row.preview.draftVersion.conditions?.rateSource || `${row.preview.summary?.rates?.min ?? "Pendiente"} – ${row.preview.summary?.rates?.max ?? "Pendiente"}%`}</p>
              <p>Perfiles: {(row.preview.summary?.targetProfiles || []).join(", ") || "Pendientes"}</p>
              {["financiera", "masterBroker", "broker"].map(role => <p key={role}>Comisión {({financiera:"Financiera",masterBroker:"Master Broker",broker:"Broker directo"} as Record<string,string>)[role]}: {Object.entries(row.preview!.draftVersion.conditions?.commissionRates?.[role] || {}).map(([key,value]) => `${key}: ${value ?? "Pendiente"}%`).join(" · ") || "Pendiente"}</p>)}
              <p>Documentos: {(row.preview.draftVersion.requiredDocuments || []).join(" · ") || "Checklist estándar"}</p>
            </div>
          </details>}
          {row.error && <p role="alert" className="text-red-700">{row.error}</p>}
          {row.preview?.validation.errors.map((text,i) => <p className="text-red-700" key={i}>{text}</p>)}
          {row.preview?.validation.warnings.map((text,i) => <p className="text-amber-800" key={i}>{text}</p>)}
          {results[row.offer.id] && <p role="status" className="font-semibold">{results[row.offer.id]}</p>}
        </div>)}</div>
        {!finished && <>
          <label className="text-sm">Motivo de publicación<Input value={reason} onChange={e => setReason(e.target.value)} disabled={running} data-testid="batch-publish-reason" /></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={running} data-testid="batch-publish-confirm" />Confirmo la revisión y autorizo publicar las {selected.length} ofertas seleccionadas.</label>
        </>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={running}>{finished ? "Cerrar" : "Cancelar"}</Button>
          {!finished && <Button onClick={publish} disabled={preview.isFetching || running || !confirmed || reason.trim().length < 3 || !selected.length} data-testid="batch-publish-submit">{running ? "Publicando…" : `Confirmar y publicar (${selected.length})`}</Button>}</div>
      </>}
    </DialogContent>
  </Dialog>;
}
