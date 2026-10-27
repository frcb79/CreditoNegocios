import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { FileSpreadsheet, Loader2, ShieldAlert, Eye } from "lucide-react";

type Issue = { row: number; field: string; level: "warning" | "error"; message: string };
type Match = { row: number; action: string; institutionId: string | null; existingOfferIds: string[] };
type Preview = {
  sheet: string;
  totalRows: number;
  institutionCount: number;
  errors: Issue[];
  warnings: Issue[];
  matches: Match[];
  writable: boolean;
  prerequisite?: string;
  rows: { row: number; financiera: string; nombreOferta: string; comisiones: Record<string, number> }[];
};

export default function CommissionMasterV5Preview() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const formatPct = (value?: number): string =>
    typeof value === "number" && Number.isFinite(value)
      ? value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%"
      : "—";

  async function previsualizar() {
    if (!file) return;
    setLoading(true);
    setPreview(null);
    setResult(null);
    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/import/v5/preview/comisiones", {
        method: "POST",
        credentials: "include",
        body: data,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "No se pudo analizar el archivo");
      setPreview(body);
    } catch (err: any) {
      toast({ title: "Error al previsualizar comisiones", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function aplicar() {
    if (!file || !preview?.writable || preview.errors.length || applying) return;
    if (!window.confirm("¿Aplicar las comisiones V5 a versiones en BORRADOR en Staging? La sobretasa será exclusiva de Crédito Negocios.")) return;
    setApplying(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/import/v5/apply/comisiones", {
        method: "POST", credentials: "include", body: data,
      });
      const body = await res.json();
      if (!res.ok) throw Error(body.message || "No se pudieron aplicar las comisiones");
      setResult("Borradores actualizados: " + body.result.draftVersionsUpdated +
        "; sin cambios: " + body.result.unchanged + "; publicados: 0");
      setPreview({ ...preview, writable: false });
      toast({ title: "Comisiones aplicadas a borradores en Staging",
        description: "No se alteraron tasas globales ni versiones publicadas." });
    } catch (e: any) {
      toast({ title: "Importación de comisiones rechazada", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  return (
    <Card className="border border-border/80">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" /> Comisiones por oferta — Maestro V5
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Carga independiente de comisiones. La sobretasa corresponde íntegramente a Crédito Negocios;
          apertura y renovación conservan su propia distribución.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block rounded-lg border border-dashed border-border p-4 cursor-pointer">
          <span className="block text-xs font-semibold mb-2">Selecciona el maestro V5 (XLSX)</span>
          <input type="file" accept=".xlsx,.xls" className="block text-xs max-w-full"
            onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setResult(null); }} />
        </label>
        <Button type="button" size="sm" disabled={!file || loading} onClick={previsualizar}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
          Previsualizar comisiones
        </Button>
        {result && <Alert><AlertDescription>{result}</AlertDescription></Alert>}
        {preview && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
              <div className="rounded border p-2"><strong>{preview.institutionCount}</strong><div className="text-xs">Financieras</div></div>
              <div className="rounded border p-2"><strong>{preview.totalRows}</strong><div className="text-xs">Ofertas</div></div>
              <div className="rounded border p-2"><strong>{preview.errors.length}</strong><div className="text-xs">Errores</div></div>
              <div className="rounded border p-2"><strong>{preview.warnings.length}</strong><div className="text-xs">Advertencias</div></div>
            </div>
            <p className="text-xs text-muted-foreground">
              {preview.matches?.filter(m => m.action === "existing_offer").length || 0} de {preview.totalRows} ofertas coinciden con el catálogo.
              No se modifica ninguna comisión al previsualizar.
            </p>
            {preview.prerequisite && (
              <Alert><AlertDescription>{preview.prerequisite}</AlertDescription></Alert>
            )}
            <div className="border rounded-md max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b text-left">
                  <th className="p-2">Fila</th><th className="p-2">Financiera</th><th className="p-2">Oferta</th>
                  <th className="p-2">Recibe CN apertura (%)</th>
                  <th className="p-2">Master apertura (%)</th><th className="p-2">Broker apertura (%)</th>
                </tr></thead>
                <tbody>{preview.rows.slice(0, 52).map(r => (
                  <tr key={r.row} className="border-b">
                    <td className="p-2">{r.row}</td><td className="p-2">{r.financiera}</td>
                    <td className="p-2">{r.nombreOferta}</td>
                    <td className="p-2">{formatPct(r.comisiones["Financiera apertura %"])}</td>
                    <td className="p-2">{formatPct(r.comisiones["Master apertura %"])}</td>
                    <td className="p-2">{formatPct(r.comisiones["Broker apertura %"])}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {[...(preview.errors || []), ...(preview.warnings || [])].slice(0, 30).map((i, n) => (
              <p className={i.level === "error" ? "text-destructive text-xs" : "text-muted-foreground text-xs"} key={n}>
                Fila {i.row} · {i.field}: {i.message}
              </p>
            ))}
            <Alert><ShieldAlert className="h-4 w-4" /><AlertDescription>
              La aplicación de estas condiciones solo puede realizarse en Staging,
              a ofertas en borrador. Nunca modifica versiones publicadas.
            </AlertDescription></Alert>
            {preview.writable && preview.errors.length === 0 && (
              <Button type="button" size="sm" disabled={applying} onClick={aplicar}>
                {applying ? "Aplicando..." : "Confirmar comisiones en Staging"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
