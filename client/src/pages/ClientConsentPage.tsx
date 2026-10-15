import { useEffect, useState } from "react";
import { buildApiUrl } from "@/lib/runtimeConfig";

/** Public, one-time signing page for the CLIENT, not a Broker login. */
export default function ClientConsentPage() {
  const token = decodeURIComponent(window.location.pathname.split("/").pop() || "");
  const [record,setRecord]=useState<{
    signerName:string;signerCapacity:string;document:string;expiresAt:string;
  }|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [code,setCode]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [requested,setRequested]=useState(false);
  const [success,setSuccess]=useState("");
  useEffect(()=>{
    let cancelled=false;
    fetch(buildApiUrl("/api/client-consent/"+encodeURIComponent(token)),{cache:"no-store"})
      .then(async(r)=>{
        const j=await r.json();
        if(!r.ok) throw new Error(j.message||"Enlace de autorización no disponible.");
        return j;
      }).then(j=>{if(!cancelled)setRecord(j);})
      .catch(e=>{if(!cancelled)setError(e.message);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[token]);
  async function submit(path:string,body?:object) {
    setBusy(true);setError("");
    try{
      const r=await fetch(buildApiUrl("/api/client-consent/"+encodeURIComponent(token)+path),{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body||{}),credentials:"omit",cache:"no-store",
      });
      const j=await r.json();
      if(!r.ok) throw new Error(j.message||"No fue posible procesar tu solicitud.");
      return j;
    } catch(e:any){setError(e.message||"Error al comunicarse con Crédito Negocios");return null;}
    finally{setBusy(false);}
  }
  async function sendOtp(){
    const response=await submit("/request-otp");
    if(response)setRequested(true);
  }
  async function verify(){
    if(!confirmed||code.length!==6){setError("Debes aceptar expresamente y escribir los seis dígitos.");return;}
    const response=await submit("/verify-otp",{code,confirmed});
    if(response?.success) {
      setSuccess(response.message||"Autorización registrada.");
      setRecord(null);
    }
  }
  return <main className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8">
    <div className="mx-auto max-w-3xl rounded-xl border bg-white shadow-sm p-5 sm:p-8 space-y-5">
      <header className="border-b pb-4">
        <p className="font-semibold text-blue-900 text-sm uppercase tracking-wide">Crédito Negocios</p>
        <h1 className="text-2xl font-bold mt-1">Autorización del titular del expediente</h1>
        <p className="text-sm text-slate-600 mt-2">
          Esta autorización es independiente del Convenio de Colaboración de cualquier Broker.
          No se realizan consultas a Buró de Crédito ni al SAT mediante este proceso.
        </p>
      </header>
      {loading && <p role="status">Consultando documento y vigencia del enlace...</p>}
      {error && <p role="alert" className="text-red-800 bg-red-50 border border-red-200 rounded-md p-3">{error}</p>}
      {success && <div role="status" className="border rounded-md p-4 bg-green-50 text-green-900">
        <h2 className="font-semibold">Autorización registrada</h2><p className="text-sm mt-1">{success}</p>
        <p className="text-xs mt-2">El registro histórico identifica el documento y la financiera específica. Conserva este mensaje para referencia.</p>
      </div>}
      {record && !success && <>
        <section className="space-y-2 text-sm">
          <p><strong>Firmante:</strong> {record.signerName}</p>
          <p><strong>Carácter:</strong> {record.signerCapacity==="legal_representative"?"Representante de persona moral":"Cliente titular"}</p>
          <p><strong>Enlace válido hasta:</strong> {new Date(record.expiresAt).toLocaleString("es-MX")}</p>
        </section>
        <section aria-label="Documento íntegro de autorización" className="border rounded-lg bg-slate-50 p-4 max-h-96 overflow-y-auto">
          <pre className="text-xs sm:text-sm whitespace-pre-wrap font-sans leading-relaxed">{record.document}</pre>
        </section>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}
            className="mt-1" data-testid="checkbox-client-consent"/>
          <span>He leído el documento íntegro y <strong>autorizo expresamente</strong> la transferencia de este expediente exclusivamente a la financiera indicada y para la finalidad especificada.</span>
        </label>
        {!requested ? <button type="button" disabled={busy||!confirmed} onClick={sendOtp}
          data-testid="button-request-client-otp"
          className="px-4 py-2 rounded bg-blue-800 text-white disabled:opacity-50">
          {busy?"Solicitando código...":"Enviar código de verificación a mi correo"}
        </button>:<div className="space-y-3">
          <p className="text-sm">Se envió un código de seis dígitos al correo registrado para esta solicitud. Caduca en 10 minutos.</p>
          <label className="block text-sm font-semibold" htmlFor="client-consent-code">Código OTP</label>
          <input id="client-consent-code" value={code} inputMode="numeric" maxLength={6}
            onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
            data-testid="input-client-consent-otp"
            className="border rounded px-3 py-2 w-48 block"/>
          <button type="button" disabled={busy||!confirmed||code.length!==6} onClick={verify}
            data-testid="button-verify-client-consent"
            className="px-4 py-2 rounded bg-blue-800 text-white disabled:opacity-50">
            {busy?"Validando...":"Confirmar autorización mediante OTP"}
          </button>
          <p className="text-xs text-slate-500">Si el código expiró, solicita que te envíen nuevamente el enlace o vuelve a intentar después del periodo de seguridad.</p>
        </div>}
      </>}
      {!loading&&!record&&!success&&!error&&<p>Enlace no disponible.</p>}
    </div>
  </main>;
}
