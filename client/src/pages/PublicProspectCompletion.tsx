import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import ClientForm from "@/components/Clients/ClientForm";
import ProspectPageLayout from "@/components/Clients/ProspectPageLayout";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

function useCompletionInfo(token: string) {
  return useQuery<{ advisorName: string; privacyVersion: string }>({
    queryKey: ["public-prospect-completion", token], retry: false, staleTime: Infinity, refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await fetch("/api/public/prospect-completion/" + encodeURIComponent(token), { credentials: "omit", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Enlace no disponible");
      return body;
    },
  });
}

export function ProspectCompletionForm({ token, initialProfile, onBack }: { token: string; initialProfile?: Record<string, unknown>; onBack?: () => void }) {
  const [accepted, setAccepted] = useState(false);
  const [complete, setComplete] = useState(false);
  const info = useCompletionInfo(token);
  if (info.isLoading) return <p role="status">Preparando tu formulario…</p>;
  if (info.error || !info.data) return <div role="alert" className="rounded-xl border bg-white p-6 space-y-3"><h1 className="text-xl font-bold">Enlace no disponible</h1><p>{info.error instanceof Error ? info.error.message : "Solicita un nuevo enlace a tu asesor."}</p></div>;
  if (complete) return <div className="rounded-xl border bg-white p-8 text-center space-y-3" data-testid="prospect-profile-success"><CheckCircle2 className="mx-auto text-emerald-600 h-12 w-12" /><h1 className="text-2xl font-bold">Información recibida</h1><p>Tu información fue enviada a {info.data.advisorName}. Tu asesor podrá revisarla contigo.</p><p className="text-sm text-muted-foreground">El envío no significa aprobación de financiamiento.</p></div>;
  return <div className="space-y-5" data-testid="prospect-completion-form">
    <div className="bg-white border rounded-xl p-5 space-y-3"><h1 className="text-2xl font-bold">Completa tu perfil de financiamiento</h1><p>Tu información será recibida por <strong>{info.data.advisorName}</strong>. Puedes dejar pendientes los datos que aún no tengas disponibles.</p>
      <label className="flex gap-3 items-start text-sm"><Checkbox checked={accepted} onCheckedChange={v => setAccepted(v === true)} aria-label="Acepto el Aviso de Privacidad" /><span>He leído el <Link href="/legal/aviso" target="_blank" className="underline">Aviso de Privacidad</Link> y autorizo compartir esta información con Crédito Negocios y el asesor indicado para atender mi solicitud.</span></label>
      {!accepted && <p className="text-sm text-muted-foreground">Confirma el Aviso de Privacidad para continuar.</p>}
    </div>
    {accepted && <ClientForm client={initialProfile} onSuccess={onBack || (() => setAccepted(false))} onPublicSubmit={async profile => {
      const response = await fetch("/api/public/prospect-completion/" + encodeURIComponent(token), {
        method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, privacyVersion: info.data.privacyVersion, acknowledgePrivacy: true, companyWebsite: "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No se pudo enviar la información");
      setComplete(true);
    }} />}
    {!accepted && onBack && <Button variant="outline" onClick={onBack}>Volver</Button>}
  </div>;
}
export default function PublicProspectCompletion() {
  const { token } = useParams<{ token: string }>();
  const info = useCompletionInfo(token);
  return <ProspectPageLayout advisorName={info.data?.advisorName} wide><ProspectCompletionForm key={token} token={token} /></ProspectPageLayout>;
}
