import { useEffect, useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkPilotBackground, loadPilotImage, parsePilotGraphicMap, renderPilotGraphic,
  type PilotGraphicMap, type PilotIdentity
} from "@/lib/commercialPilotV1";

const DEMO_BROKER: PilotIdentity = {
  role: "broker", displayName: "María Fernanda López", whatsapp: "55 1234 5678"
};
const DEMO_MASTER: PilotIdentity = {
  role: "master_broker", displayName: "Grupo Financiero Horizonte Capital", whatsapp: "55 9876 4321"
};

/**
 * This module never calls the admin templates API. The uploaded image/map and
 * generated PNG live only in the Super Admin browser's memory.
 * Test-only logo approval simulation is NOT an approval workflow or publication.
 */
export default function CommercialPilotPreview() {
  const [map, setMap] = useState<PilotGraphicMap | null>(null);
  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [testLogo, setTestLogo] = useState<HTMLImageElement | null>(null);
  const [simulateLogoApproval, setSimulateLogoApproval] = useState(false);
  const [role, setRole] = useState<PilotIdentity["role"]>("broker");
  const [preview, setPreview] = useState<string>("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let active = true;
    async function makePreview() {
      if (!map || !background) { setPreview(""); return; }
      setWorking(true); setError("");
      try {
        const base = role === "broker" ? DEMO_BROKER : DEMO_MASTER;
        const identity: PilotIdentity = {
          ...base,
          ...(role === "master_broker" && testLogo ? { logo: { image: testLogo, approved: simulateLogoApproval } } : {})
        };
        const canvas = await renderPilotGraphic(map, background, identity);
        if (active) setPreview(canvas.toDataURL("image/png"));
      } catch (err: any) {
        if (active) { setPreview(""); setError(err.message || "No se pudo generar la vista previa"); }
      } finally {
        if (active) setWorking(false);
      }
    }
    void makePreview();
    return () => { active = false; };
  }, [map, background, role, testLogo, simulateLogoApproval]);

  const loadMap = async (file: File) => {
    setError(""); setMap(null); setPreview("");
    try {
      if (file.size > 32_000) throw new Error("El JSON supera 32 KB.");
      setMap(parsePilotGraphicMap(await file.text())); // strips UTF-8 BOM
    } catch (err: any) { setError(err.message || "No se pudo leer el mapa"); }
  };
  const loadBackground = async (file: File) => {
    setError(""); setBackground(null); setPreview("");
    try {
      await checkPilotBackground(file); // pins exact PNG, including CN logo
      setBackground(await loadPilotImage(file));
    } catch (err: any) { setError(err.message || "No se pudo leer el fondo"); }
  };
  const loadLogo = async (file: File) => {
    setError(""); setTestLogo(null); setSimulateLogoApproval(false);
    try {
      if (file.type !== "image/png" || file.size > 2_000_000) throw new Error("Utiliza solo un PNG de prueba menor a 2 MB.");
      setTestLogo(await loadPilotImage(file));
    } catch (err: any) { setError(err.message || "No se pudo leer el logotipo"); }
  };

  return (
    <section className="rounded-xl border border-amber-500/50 bg-card p-4 space-y-3" data-testid="commercial-pilot-01-admin">
      <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" />
        Piloto técnico 01 · PREVIEW PRIVADO · NO PUBLICAR
      </h3>
      <p className="text-xs text-muted-foreground">
        Valida los archivos del equipo creativo sin subirlos a servidor, sin crear plantillas en catálogo
        y sin mostrarlos a Broker/Master. El logotipo CN original permanece dentro del fondo.
      </p>
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <label className="space-y-1">
          <span>Mapa de campos (JSON original)</span>
          <input type="file" accept=".json,application/json" data-testid="pilot-map-upload"
            onChange={e => { const f = e.target.files?.[0]; if (f) void loadMap(f); }} />
        </label>
        <label className="space-y-1">
          <span>Fondo maestro PNG exacto</span>
          <input type="file" accept="image/png" data-testid="pilot-background-upload"
            onChange={e => { const f = e.target.files?.[0]; if (f) void loadBackground(f); }} />
        </label>
      </div>
      <div className="flex gap-2 flex-wrap" role="group" aria-label="Perfil de prueba">
        <Button size="sm" variant={role === "broker" ? "default" : "outline"} onClick={() => setRole("broker")}
          data-testid="pilot-test-broker">Broker de prueba</Button>
        <Button size="sm" variant={role === "master_broker" ? "default" : "outline"} onClick={() => setRole("master_broker")}
          data-testid="pilot-test-master">Master de prueba</Button>
      </div>
      {role === "master_broker" && (
        <div className="space-y-2 text-xs border rounded-md p-3">
          <label className="block">Logo simulado para probar posición (no equivale a aprobación real)
            <input className="block mt-1" type="file" accept="image/png" data-testid="pilot-master-logo-upload"
              onChange={e => { const f = e.target.files?.[0]; if (f) void loadLogo(f); }} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={simulateLogoApproval} disabled={!testLogo}
              onChange={e => setSimulateLogoApproval(e.target.checked)}
              data-testid="pilot-logo-approval-simulation" />
            Simular que el logo de prueba fue aprobado (solo en esta vista, sin guardar)
          </label>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {working && <p className="text-xs">Renderizando piloto…</p>}
      {preview ? (
        <div className="grid md:grid-cols-[minmax(0,360px)_1fr] gap-4 items-start" data-testid="pilot-preview">
          <img alt={"Prueba técnica 1080 × 1350 de " + role} src={preview} className="w-full rounded-md border" />
          <div className="text-sm space-y-3">
            <p>1080 × 1350 · PNG con fondo original bloqueado · sin QR · sin enlace impreso.</p>
            <p>Ejemplo con identidad ficticia para QA. Los datos reales del perfil se conectarán solo después de aprobar el lote.</p>
            <a href={preview} download={"PILOTO_01_" + role + "_NO_PUBLICAR.png"}>
              <Button type="button" size="sm" variant="outline" data-testid="pilot-download">
                <Download className="w-4 h-4 mr-1" /> Descargar PNG de prueba
              </Button>
            </a>
          </div>
        </div>
      ) : <p className="text-xs text-muted-foreground">Carga el JSON y fondo originales para habilitar la prueba privada.</p>}
    </section>
  );
}
