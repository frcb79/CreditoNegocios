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
    title: "Todo concentrado en un solo lugar",
    description:
      "Organiza prospectos, expedientes y solicitudes sin depender de hojas de cálculo dispersas o cadenas eternas de WhatsApp.",
  },
  {
    icon: Landmark,
    title: "Más opciones de financieras y bancos",
    description:
      "Presenta mejor cada caso y aumenta probabilidad de aprobación con un abanico más amplio de alternativas para PyMES, PFAEs e hipotecario.",
  },
  {
    icon: CircleDollarSign,
    title: "Sin costo y con oportunidad de comisión",
    description:
      "Usar la app no tiene costo y, si los créditos o solicitudes de tus clientes son aprobados, puedes ganar comisión por operación.",
  },
  {
    icon: ShieldCheck,
    title: "Imagen más profesional ante tu cliente",
    description:
      "Da seguimiento con orden, velocidad y trazabilidad. Eso genera confianza y te ayuda a cerrar relaciones de largo plazo.",
  },
];

const testimonials = [
  {
    name: "María Fernanda Ruiz",
    role: "Broker PyME",
    quote:
      "Antes perdía tiempo armando expedientes y buscando con quién colocar cada caso. Ahora tengo mejor control, más orden y más velocidad para mover operaciones.",
    result: "Duplicó su volumen de casos activos en 4 meses.",
  },
  {
    name: "Jorge A. Téllez",
    role: "Broker PFAE e Hipotecario",
    quote:
      "Lo que más valor tiene es la visibilidad. Ves tus solicitudes, pendientes y opciones de salida de forma muy clara. Eso cambia la conversación con el cliente.",
    result: "Redujo tiempos de seguimiento comercial de días a horas.",
  },
  {
    name: "Ana Lucía Gómez",
    role: "Despacho aliado",
    quote:
      "La plataforma nos permitió dejar de operar de manera reactiva. Ahora presentamos casos mejor documentados y eso se nota en la tasa de aprobación.",
    result: "Mejoró su conversión de colocación en casos perfilados.",
  },
];

const faqs = [
  {
    question: "¿Tiene costo usar CreditoNegocios para brokers?",
    answer:
      "No. En esta etapa la plataforma está planteada como una herramienta sin costo de acceso para brokers aliados.",
  },
  {
    question: "¿Qué tipos de broker pueden aprovecharla?",
    answer:
      "Está pensada para brokers enfocados en PyMES, PFAEs e hipotecario, especialmente quienes buscan operar con más orden y más opciones de salida.",
  },
  {
    question: "¿Tengo que cambiar mi forma de trabajar por completo?",
    answer:
      "No. La idea es simplificar y centralizar tu operación actual, no complicarla. Empiezas con un flujo simple y luego puedes profundizar en el uso.",
  },
  {
    question: "¿Cómo entro al sistema si ya tengo acceso?",
    answer:
      "Desde esta misma página podrás ir al login actual del app y entrar con tu cuenta sin cambiar la estructura existente.",
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

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(47,167,232,0.14),transparent_28%),radial-gradient(circle_at_left_center,rgba(5,185,129,0.12),transparent_26%)]" />
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-20">
          <div className="relative z-10">
            <Badge className="mb-5 rounded-full bg-primary/10 px-4 py-1.5 text-primary">
              Sin costo. Más orden. Más opciones. Más cierre.
            </Badge>
            <h1 className="max-w-4xl text-4xl font-black leading-tight text-slate-950 sm:text-5xl lg:text-6xl">
              La plataforma para brokers que quieren colocar mejor y operar con más control.
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">
              CreditoNegocios te ayuda a centralizar casos, documentos y seguimiento comercial en un solo lugar,
              con acceso a un abanico de financieras y bancos para buscar la mejor salida para tus clientes.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Card className="border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-5">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <LayoutDashboard className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900">Mejor organización</p>
                  <p className="mt-1 text-sm text-slate-600">Controla pipeline, avances y expedientes sin perder trazabilidad.</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-5">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900">Más instituciones</p>
                  <p className="mt-1 text-sm text-slate-600">Amplía alternativas para PyMES, PFAEs e hipotecario.</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white/90 shadow-sm">
                <CardContent className="p-5">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900">Comisión por colocación</p>
                  <p className="mt-1 text-sm text-slate-600">Si una operación se aprueba, existe oportunidad de comisión.</p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild className="bg-primary px-7 text-base hover:bg-primary/90">
                <a href="#form-brokers">
                  Quiero conocer la plataforma
                  <ArrowRight />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild className="px-7 text-base">
                <a href={loginHref}>
                  Ya tengo cuenta
                  <LogIn />
                </a>
              </Button>
            </div>

            <div className="mt-10 grid gap-6 rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-sm sm:grid-cols-2 lg:max-w-3xl">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Ideal para</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-sm">Brokers PyME</Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-sm">PFAEs</Badge>
                  <Badge variant="outline" className="rounded-full px-3 py-1 text-sm">Hipotecario</Badge>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Propuesta de valor</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Sin costo de uso.</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Un solo lugar para operar.</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Más vías de aprobación.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="relative z-10">
            <Card id="form-brokers" className="overflow-hidden border-slate-200 shadow-[0_28px_80px_-32px_rgba(5,71,138,0.42)]">
              <div className="bg-[linear-gradient(135deg,hsl(210,93%,28%)_0%,#1E3A5F_100%)] px-6 py-6 text-white sm:px-8">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100">Habla con nosotros</p>
                <h2 className="mt-2 text-2xl font-bold">Solicita acceso y una demo comercial</h2>
                <p className="mt-2 text-sm text-blue-100">
                  Déjanos tus datos y te contactamos para explicarte beneficios, flujo de uso y cómo empezar.
                </p>
              </div>
              <CardContent className="bg-white p-6 sm:p-8">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="broker-name">Nombre completo</Label>
                      <Input
                        id="broker-name"
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Tu nombre"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="broker-phone">Teléfono</Label>
                      <Input
                        id="broker-phone"
                        value={form.phone}
                        onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                        placeholder="55 0000 0000"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="broker-email">Email</Label>
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
                      <Label>Tipo de broker</Label>
                      <Select value={brokerType} onValueChange={setBrokerType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona tu perfil" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pyme">PyME</SelectItem>
                          <SelectItem value="pfae">PFAE</SelectItem>
                          <SelectItem value="hipotecario">Hipotecario</SelectItem>
                          <SelectItem value="mixto">Mixto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="broker-company">Despacho o empresa</Label>
                    <Input
                      id="broker-company"
                      value={form.company}
                      onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="broker-message">Mensaje</Label>
                    <Textarea
                      id="broker-message"
                      value={form.message}
                      onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                      placeholder="Cuéntanos brevemente qué tipo de casos operas o qué te interesa conocer."
                      className="min-h-[120px]"
                    />
                  </div>

                  <Button type="submit" size="lg" className="w-full bg-primary text-base hover:bg-primary/90" disabled={isSubmitting}>
                    {isSubmitting ? "Enviando..." : "Quiero que me contacten"}
                    <ArrowRight />
                  </Button>

                  <p className="text-xs leading-5 text-slate-500">
                    Tu solicitud llegará a nuestro equipo comercial. También puedes escribirnos por WhatsApp para atención más rápida.
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-3xl font-black text-primary">0 costo</p>
            <p className="mt-2 text-sm text-slate-600">Acceso a la plataforma en esta etapa.</p>
          </div>
          <div>
            <p className="text-3xl font-black text-primary">1 solo lugar</p>
            <p className="mt-2 text-sm text-slate-600">Prospectos, expedientes y seguimiento comercial.</p>
          </div>
          <div>
            <p className="text-3xl font-black text-primary">+ opciones</p>
            <p className="mt-2 text-sm text-slate-600">Financieras y bancos según perfil de caso.</p>
          </div>
          <div>
            <p className="text-3xl font-black text-primary">+ comisión</p>
            <p className="mt-2 text-sm text-slate-600">Cuando una operación es aprobada y colocada.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Beneficios reales</p>
          <h2 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">
            Diseñada para brokers que necesitan velocidad, orden y capacidad de colocación.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {benefits.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-6">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 rounded-[2rem] bg-[linear-gradient(135deg,#0b3f74_0%,#0f2741_100%)] p-8 text-white lg:grid-cols-[1fr_1.1fr] lg:p-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100">Red financiera</p>
            <h2 className="mt-3 text-3xl font-black">Más puertas para aprobar mejor.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-blue-100">
              En vez de operar con una sola salida, organizas mejor cada caso y lo orientas hacia instituciones que sí hagan sentido con el perfil de tu cliente.
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
                ["1", "Recibes y organizas el caso", "Centralizas información del cliente, documentos y necesidades de financiamiento."],
                ["2", "Perfilas y comparas alternativas", "Detectas mejores rutas con financieras y bancos según el tipo de operación."],
                ["3", "Das seguimiento sin fricción", "Controlas pendientes, estatus y comunicación con más trazabilidad."],
                ["4", "Colocas con mejor visibilidad", "Si una operación se aprueba, tú mantienes control comercial y oportunidad de comisión."],
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
          <h2 className="mt-3 text-3xl font-black text-slate-950">Percepción de valor para brokers que ya operan con más estructura.</h2>
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
            <h2 className="mt-3 text-3xl font-black text-slate-950">Lo esencial para decidir rápido.</h2>
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
            <h2 className="mt-3 text-3xl font-black">Entra, conoce el flujo y decide si hace sentido para tu operación.</h2>
            <p className="mt-3 text-base leading-7 text-blue-100">
              Puedes pedir que te contactemos o entrar directamente al login actual del app si ya cuentas con acceso.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild className="bg-white px-7 text-primary hover:bg-slate-100">
              <a href={loginHref}>
                <LogIn />
                Ir al login
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/30 bg-white/10 px-7 text-white hover:bg-white/20 hover:text-white">
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <Phone />
                WhatsApp
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