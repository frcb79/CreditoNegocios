import { FormEvent, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { getAppBaseUrl } from "@/lib/runtimeConfig";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  LayoutDashboard,
  LogIn,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

const whatsappUrl = "https://wa.me/525623300270";

const logos = [
  "Bancos Comerciales",
  "Sofomes",
  "Arrendadoras",
  "Financieras PyME",
  "Hipotecario",
  "Capital de Trabajo",
];

const benefits = [
  {
    icon: LayoutDashboard,
    title: "Todo concentrado",
    description:
      "Organiza solicitudes, expedientes y seguimiento sin perder trazabilidad.",
  },
  {
    icon: BriefcaseBusiness,
    title: "Más tiempo para vender",
    description:
      "Menos trabajo administrativo repetitivo y más foco en prospectar y cerrar.",
  },
  {
    icon: Landmark,
    title: "Más opciones de aprobación",
    description:
      "Abanico amplio para PyMES, PFAEs, hipotecario y capital de trabajo.",
  },
  {
    icon: ShieldCheck,
    title: "Imagen más profesional",
    description:
      "Da un seguimiento claro que genera confianza con tu cliente.",
  },
];

const testimonials = [
  {
    name: "María Fernanda R.",
    role: "Broker PyME",
    quote:
      "Antes perdía tiempo armando expedientes y buscando con quién colocar cada caso. Ahora tengo mejor control y velocidad.",
    result: "Duplicó su volumen de casos en 4 meses.",
  },
  {
    name: "Jorge A. Téllez",
    role: "Broker Hipotecario",
    quote:
      "Lo que más valor tiene es la visibilidad. Ves tus solicitudes y opciones de salida muy claras. Cambia la conversación con el cliente.",
    result: "Redujo tiempos de seguimiento de días a horas.",
  },
  {
    name: "Ana Lucía G.",
    role: "Despacho aliado",
    quote:
      "Dejamos de operar de manera reactiva. Presentamos casos mejor documentados y se nota en la aprobación.",
    result: "Mejoró su conversión de colocación.",
  },
];

const faqs = [
  {
    question: "¿Tiene costo usar la plataforma?",
    answer:
      "No. El acceso es 100% sin costo para brokers, despachos y referidores aliados.",
  },
  {
    question: "¿Qué tipos de broker pueden aprovecharla?",
    answer:
      "Brokers formales, despachos contables, consultores y también referidores ocasionales que solo quieren pasar un contacto.",
  },
  {
    question: "¿Tengo que cambiar mi forma de trabajar?",
    answer:
      "No. La plataforma se adapta a ti para darte más orden, visibilidad y seguimiento, no para darte más trabajo.",
  },
  {
    question: "¿Cómo garantizan el pago de mi comisión?",
    answer:
      "Trabajamos con total transparencia comercial desde el día uno y damos seguimiento claro al estatus de la operación aprobada y fondeada.",
  },
];

export default function BrokersLanding() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [brokerType, setBrokerType] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: "",
  });

  const loginHref = `${getAppBaseUrl()}/`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!brokerType) {
      toast({
        title: "Selecciona tu perfil",
        description: "Indícanos qué tipo de broker eres para contactarte mejor.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await apiRequest("POST", "/api/public/broker-leads", {
        ...form,
        brokerType,
      });

      toast({
        title: "Solicitud enviada",
        description: "Recibimos tus datos y te contactaremos pronto.",
      });

      setForm({
        name: "",
        email: "",
        phone: "",
        company: "",
        message: "",
      });
      setBrokerType("");
    } catch (error: any) {
      toast({
        title: "No se pudo enviar",
        description: error.message || "Intenta de nuevo en unos minutos.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6fbff_0%,#eef5fb_38%,#ffffff_100%)] text-slate-900">
      <section className="border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <img
              src="/Credito%20Negocios-07.jpg"
              alt="Credito Negocios"
              className="h-12 w-auto rounded-lg shadow-sm"
            />
            <Badge className="hidden rounded-full bg-secondary/10 px-3 py-1 text-secondary sm:inline-flex">
              Programa para Brokers
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild>
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <MessageSquare />
                WhatsApp
              </a>
            </Button>
            <Button asChild className="bg-primary hover:bg-primary/90">
              <a href={loginHref}>
                <LogIn />
                Login
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#0A3042_0%,#12385C_100%)] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,204,162,0.18),transparent_25%),radial-gradient(circle_at_left_center,rgba(245,158,11,0.14),transparent_24%)]" />
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-20">
          <div className="relative z-10">
            <Badge className="mb-5 rounded-full bg-white/10 px-4 py-1.5 text-cyan-100">
              PARA BROKERS, DESPACHOS Y REFERIDORES
            </Badge>
            <h1 className="max-w-4xl text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
              Tú traes el cliente, nosotros el capital. Gana comisiones sin límites.
            </h1>
            <h2 className="mt-5 max-w-3xl text-lg font-medium leading-8 text-blue-50 sm:text-xl">
              Sin costo. Más orden. Más opciones. Más cierres. La plataforma tecnológica que te ayuda a centralizar casos, o simplemente referir contactos, con acceso a la red financiera más grande de México.
            </h2>
            <p className="mt-6 max-w-3xl text-base leading-7 text-blue-100">
              Refiere un contacto o administra expedientes completos desde un solo lugar. Nosotros te ayudamos a perfilar, presentar y dar seguimiento para que cierres más y cobres mejor.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-sm text-blue-50">
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2">Sin costo</div>
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2">Más orden</div>
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2">Más opciones</div>
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2">Más cierres</div>
            </div>
          </div>

          <div className="relative z-10">
            <Card id="form-brokers" className="overflow-hidden border-slate-200 shadow-[0_28px_80px_-32px_rgba(5,71,138,0.42)]">
              <div className="bg-white px-6 py-6 text-slate-900 sm:px-8">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Acceso inmediato</p>
                <h2 className="mt-2 text-2xl font-bold">Solicita acceso gratuito</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Déjanos tus datos y te contactamos para explicarte el flujo y ayudarte a comenzar.
                </p>
              </div>
              <CardContent className="bg-white p-6 sm:p-8">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="broker-name">Nombre</Label>
                    <Input

                      id="broker-name"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Tu nombre completo"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="broker-phone">WhatsApp</Label>
                    <Input
                      id="broker-phone"
                      value={form.phone}
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="55 0000 0000"
                      required
                    />
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="broker-email">Correo</Label>
                      <Input
                        id="broker-email"
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                        placeholder="nombre@empresa.com"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Perfil</Label>
                      <Select value={brokerType} onValueChange={setBrokerType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona tu perfil" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="broker">Soy Broker</SelectItem>
                          <SelectItem value="referidor">Solo quiero referir</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="submit" size="lg" className="w-full bg-secondary text-base hover:bg-secondary/90" disabled={isSubmitting}>
                    {isSubmitting ? "Enviando..." : "Crear mi cuenta"}
                    <ArrowRight />
                  </Button>
                  <p className="text-xs leading-5 text-slate-500">
                    También puedes escribirnos por WhatsApp para atención más rápida.
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-3xl font-black text-primary">$0 Costo</p>
            <p className="mt-2 text-sm text-slate-600">Acceso gratuito a la plataforma.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-3xl font-black text-primary">1 Solo Lugar</p>
            <p className="mt-2 text-sm text-slate-600">Prospectos, expedientes y seguimiento comercial.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-3xl font-black text-primary">+ Opciones</p>
            <p className="mt-2 text-sm text-slate-600">Financieras y bancos según el perfil del caso.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-3xl font-black text-primary">+ Comisión</p>
            <p className="mt-2 text-sm text-slate-600">Las mejores tasas de pago por operación aprobada.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Dos formas de ganar</p>
          <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">
            Elige la forma que mejor se adapta a tu operación.
          </h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-7 lg:p-8">
              <div className="mb-4 inline-flex rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
                Referidor ocasional
              </div>
              <h3 className="text-2xl font-bold text-slate-950">Para aliados y referidores ocasionales</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                ¿Eres contador, consultor, o tienes un conocido que necesita crédito? Solo déjanos su nombre y teléfono.
              </p>
              <ul className="mt-5 space-y-3 text-sm text-slate-700">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><span>Nuestro equipo comercial hace el perfilamiento, la venta y el cierre.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><span>Tú recibes tu comisión directamente al fondearse.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><span>Cero fricción y sin necesidad de armar expedientes.</span></li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-7 lg:p-8">
              <div className="mb-4 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Broker profesional
              </div>
              <h3 className="text-2xl font-bold text-slate-950">Para brokers profesionales</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                ¿Te dedicas a esto y quieres multiplicar tu colocación? Accede a nuestro CRM y controla toda tu operación.
              </p>
              <ul className="mt-5 space-y-3 text-sm text-slate-700">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><span>Centraliza información, sube expedientes y compara alternativas.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><span>Controla el pipeline y mantén trazabilidad sin depender de Excel.</span></li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><span>Opera PyME, PFAE e hipotecario con más orden y visibilidad.</span></li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Problema vs solución</p>
          <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">
            Diseñada para aliados que necesitan velocidad, orden y capacidad de colocación.
          </h2>
        </div>
        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <CardContent className="grid gap-6 p-0 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="bg-rose-50 p-8">
              <h3 className="text-2xl font-bold text-slate-950">Lo que un broker suele tener hoy</h3>
              <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-700">
                <li className="flex gap-3"><span className="text-rose-500">✕</span><span>Información dispersa entre eternas cadenas de WhatsApp, correos y Excel.</span></li>
                <li className="flex gap-3"><span className="text-rose-500">✕</span><span>Poco control de estatus y seguimiento manual.</span></li>
                <li className="flex gap-3"><span className="text-rose-500">✕</span><span>Menos visibilidad para decidir a qué institución presentar cada caso.</span></li>
              </ul>
            </div>
            <div className="p-8">
              <h3 className="text-2xl font-bold text-slate-950">Lo que ganas con CreditoNegocios</h3>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {benefits.map(({ icon: Icon, title, description }) => (
                  <div key={title} className="rounded-2xl bg-slate-50 p-4">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="font-semibold text-slate-900">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 rounded-[2rem] bg-[linear-gradient(135deg,#0b3f74_0%,#0f2741_100%)] p-8 text-white lg:grid-cols-[1fr_1.1fr] lg:p-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100">Red financiera</p>
            <h2 className="mt-3 text-3xl font-black">Más puertas para aprobar mejor.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-blue-100">
              En vez de operar con una sola salida, orientas cada caso hacia instituciones que sí hacen sentido con el perfil de tu cliente. Expedientes mejor presentados = mayor tasa de aprobación.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="font-semibold">PyMES y capital de trabajo</p>
                <p className="mt-1 text-sm text-blue-100">Expedientes mejor presentados para necesidades de liquidez y crecimiento.</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="font-semibold">PFAEs e hipotecario</p>
                <p className="mt-1 text-sm text-blue-100">Seguimiento más claro y comparativo comercial más sólido.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {logos.map((logo) => (
              <div key={logo} className="flex min-h-24 items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 text-center text-sm font-semibold text-white/90">
                {logo}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Cómo funciona</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950">Una operación más ordenada desde el día uno.</h2>
            <div className="mt-8 space-y-5">
              {[
                ["1", "Recibes y organizas", "Centralizas información del cliente, documentos y necesidades. O simplemente nos pasas el contacto."],
                ["2", "Perfilas y comparas", "Detectamos las mejores rutas con financieras y bancos según la operación."],
                ["3", "Das seguimiento sin fricción", "Controlas pendientes y estatus con total trazabilidad."],
                ["4", "Colocas con visibilidad", "Si la operación se aprueba, tú mantienes el control y aseguras tu comisión."],
              ].map(([step, title, description]) => (
                <div key={step} className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-white">
                    {step}
                  </div>
                  <div>
                    <p className="text-base font-semibold text-slate-900">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
              <CardContent className="grid gap-6 p-0 sm:grid-cols-[0.9fr_1.1fr]">
                <div className="bg-[linear-gradient(145deg,rgba(5,71,138,0.92),rgba(5,185,129,0.88))] p-8 text-white">
                  <Sparkles className="h-8 w-8 text-cyan-100" />
                  <h3 className="mt-5 text-2xl font-bold">Lo que un broker suele tener hoy</h3>
                  <ul className="mt-5 space-y-3 text-sm text-blue-50">
                    <li className="flex gap-2"><span>•</span><span>Información dispersa entre WhatsApp, correo y hojas de cálculo.</span></li>
                    <li className="flex gap-2"><span>•</span><span>Poco control de estatus y seguimiento manual.</span></li>
                    <li className="flex gap-2"><span>•</span><span>Menos visibilidad para decidir a quién presentar cada caso.</span></li>
                  </ul>
                </div>
                <div className="p-8">
                  <h3 className="text-2xl font-bold text-slate-950">Lo que ganas con CreditoNegocios</h3>
                  <div className="mt-5 space-y-4 text-sm leading-6 text-slate-600">
                    <div className="flex gap-3 rounded-2xl bg-slate-50 p-4">
                      <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <p className="font-semibold text-slate-900">Más confianza con tu cliente</p>
                        <p>Presentas una operación más clara, más ordenada y con mejor seguimiento.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 rounded-2xl bg-slate-50 p-4">
                      <BriefcaseBusiness className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <p className="font-semibold text-slate-900">Más tiempo para vender</p>
                        <p>Menos trabajo administrativo repetitivo y más foco en prospectar y cerrar.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 rounded-2xl bg-slate-50 p-4">
                      <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div>
                        <p className="font-semibold text-slate-900">Más posibilidades de aprobación</p>
                        <p>Mejor perfilamiento del caso y más alternativas para buscar salida adecuada.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Testimoniales</p>
          <h2 className="mt-3 text-3xl font-black text-slate-950">Lo que dicen quienes ya operan con más estructura.</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name} className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-7">
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
                    {testimonial.name
                      .split(" ")
                      .slice(0, 2)
                      .map((value) => value[0])
                      .join("")}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{testimonial.name}</p>
                    <p className="text-sm text-slate-500">{testimonial.role}</p>
                  </div>
                </div>
                <p className="text-sm leading-7 text-slate-600">“{testimonial.quote}”</p>
                <div className="mt-6 rounded-2xl bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Resultado</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">{testimonial.result}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm lg:p-10">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Preguntas frecuentes</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950">Resolvemos lo esencial para que decidas rápido.</h2>
          </div>
          <div className="mt-8 space-y-4">
            {faqs.map((item) => (
              <details key={item.question} className="group rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5">
                <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">
                  {item.question}
                </summary>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-[2rem] bg-[linear-gradient(135deg,hsl(210,93%,28%)_0%,#123255_100%)] p-8 text-white lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100">Siguiente paso</p>
            <h2 className="mt-3 text-3xl font-black">Entra, conoce el flujo y decide si hace sentido para tu operación diaria.</h2>
            <p className="mt-3 text-base leading-7 text-blue-100">
              Empieza a referir hoy mismo o solicita una demo para ver cómo centralizar tus casos y ganar más comisión.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild className="bg-secondary px-7 text-white hover:bg-secondary/90">
              <a href="#form-brokers">
                <ArrowRight />
                Solicitar Acceso y Demo
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/30 bg-white/10 px-7 text-white hover:bg-white/20 hover:text-white">
              <a href={loginHref}>
                <LogIn />
                Ya tengo cuenta
              </a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white/90">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <img src="/Credito%20Negocios-07.jpg" alt="Credito Negocios" className="h-11 w-auto rounded-lg shadow-sm" />
            <span>© 2026 Crédito Negocios</span>
          </div>
          <div className="flex flex-wrap gap-4">
            <a href="mailto:info@creditonegocios.com.mx" className="hover:text-slate-800">info@creditonegocios.com.mx</a>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="hover:text-slate-800">WhatsApp</a>
            <a href={loginHref} className="hover:text-slate-800">Login</a>
          </div>
        </div>
      </footer>
    </div>
  );
}