import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ShieldCheck } from "lucide-react";

type CampaignInfo = {
  advisorName: string;
  campaignName: string;
  product: string | null;
  privacyVersion: string;
};

const PRODUCT_OPTIONS = [
  { id: "simple", name: "Crédito Simple" },
  { id: "revolvente", name: "Crédito Revolvente" },
  { id: "factoraje", name: "Factoraje" },
  { id: "arrendamiento", name: "Arrendamiento" },
  { id: "hipotecario", name: "Hipotecario Vivienda" }
];

export default function PublicCampaignLanding() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [product, setProduct] = useState("");
  const [amountRange, setAmountRange] = useState("");
  const [message, setMessage] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [complete, setComplete] = useState(false);

  const { data, isLoading, error } = useQuery<CampaignInfo>({
    queryKey: ["public-campaign", token],
    queryFn: async () => {
      const res = await fetch("/api/public/campaign/" + encodeURIComponent(token), { cache: "no-store" });
      if (!res.ok) throw new Error("El enlace ya no está disponible");
      return res.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity
  });

  const actualProduct = data?.product || product;
  const validPhone = phone.replace(/\D/g, "").length >= 10 && phone.replace(/\D/g, "").length <= 15;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !privacyAccepted || !validPhone) return;
    setSubmitting(true);
    setErrorText("");
    try {
      const res = await fetch("/api/public/campaign/" + encodeURIComponent(token) + "/submit", {
        method: "POST", credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name.trim(), phone: phone.trim(), email: email.trim(),
          product: actualProduct, amountRange, message: message.trim(),
          acknowledgePrivacy: true, privacyVersion: data.privacyVersion,
          companyWebsite
        })
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.message || "No se pudo enviar tu solicitud");
      setComplete(true);
    } catch (error: any) {
      setErrorText(error.message || "No fue posible enviar tu solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" data-testid="public-campaign-landing">
      <header className="border-b bg-white px-5 py-4">
        <div className="mx-auto max-w-2xl flex items-center justify-between gap-4">
          <span className="font-bold text-lg text-slate-800">Crédito Negocios</span>
          <span className="text-xs text-slate-600">Solicitud de financiamiento</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando tu formulario...</p>
        ) : error || !data ? (
          <div className="rounded-xl border bg-white p-6">
            <h1 className="font-bold text-xl">Enlace no disponible</h1>
            <p className="text-sm text-muted-foreground mt-2">Solicita a tu asesor un enlace actualizado.</p>
          </div>
        ) : complete ? (
          <div className="rounded-xl border bg-white p-6 text-center space-y-3" data-testid="public-campaign-success">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="text-xl font-bold">Solicitud recibida</h1>
            <p>Compartimos tu solicitud con el asesor que te invitó. Podrá contactarte para revisar alternativas.</p>
            <p className="text-sm text-muted-foreground">El envío no significa aprobación de crédito.</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-white p-5 sm:p-8 shadow-sm space-y-5">
            <div>
              <h1 className="text-2xl font-bold">Encuentra alternativas de financiamiento</h1>
              <p className="text-sm text-slate-600 mt-2">Tu solicitud será atendida por <strong>{data.advisorName}</strong> a través de Crédito Negocios.</p>
              {data.campaignName !== "Financiamiento" && <p className="text-xs text-muted-foreground mt-1">Campaña: {data.campaignName}</p>}
            </div>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="lead-full-name">Tu nombre completo *</Label>
                <Input id="lead-full-name" required minLength={3} maxLength={120}
                  value={name} onChange={e => setName(e.target.value)}
                  autoComplete="name" data-testid="landing-full-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-phone">WhatsApp o teléfono *</Label>
                <Input id="lead-phone" required maxLength={25} inputMode="tel" autoComplete="tel"
                  value={phone} onChange={e => setPhone(e.target.value)}
                  data-testid="landing-phone" />
                {phone && !validPhone && <p className="text-xs text-destructive">Ingresa un teléfono de 10 a 15 dígitos.</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-email">Correo electrónico (opcional)</Label>
                <Input id="lead-email" type="email" autoComplete="email" maxLength={160}
                  value={email} onChange={e => setEmail(e.target.value)} data-testid="landing-email" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de financiamiento *</Label>
                {data.product ? (
                  <div className="rounded-md border px-3 py-2 text-sm bg-slate-50">
                    {PRODUCT_OPTIONS.find(p => p.id === data.product)?.name || data.product}
                  </div>
                ) : (
                  <Select value={product} onValueChange={setProduct} required>
                    <SelectTrigger data-testid="landing-product"><SelectValue placeholder="Selecciona una alternativa" /></SelectTrigger>
                    <SelectContent>
                      {PRODUCT_OPTIONS.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-amount">Monto aproximado (opcional)</Label>
                <Input id="lead-amount" maxLength={80} value={amountRange}
                  onChange={e => setAmountRange(e.target.value)}
                  placeholder="Ej. $500,000 MXN" data-testid="landing-amount" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-message">¿Para qué necesitas financiamiento? (opcional)</Label>
                <Textarea id="lead-message" rows={3} maxLength={600}
                  value={message} onChange={e => setMessage(e.target.value)}
                  data-testid="landing-message" />
              </div>
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <input tabIndex={-1} name="companyWebsite" value={companyWebsite} autoComplete="off"
                  onChange={e => setCompanyWebsite(e.target.value)} />
              </div>
              <label className="flex gap-3 text-sm items-start cursor-pointer">
                <Checkbox checked={privacyAccepted} onCheckedChange={x => setPrivacyAccepted(x === true)}
                  className="mt-0.5" data-testid="landing-privacy" />
                <span>He leído el <Link href="/legal/aviso" target="_blank" className="underline text-blue-700">Aviso de Privacidad</Link> y autorizo compartir mis datos con Crédito Negocios y el asesor indicado para que contacten conmigo sobre esta solicitud.</span>
              </label>
              {errorText && <p role="alert" className="text-sm text-destructive">{errorText}</p>}
              <Button type="submit" disabled={submitting || !validPhone || !privacyAccepted || !actualProduct || name.trim().length < 3}
                className="w-full" data-testid="landing-submit">
                {submitting ? "Enviando solicitud..." : "Enviar solicitud"}
              </Button>
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                No solicitamos contraseñas ni depósitos. Toda alternativa está sujeta a evaluación por la institución financiera.
              </p>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
