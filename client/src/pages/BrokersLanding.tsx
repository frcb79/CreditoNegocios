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

const statHighlights = [
  {
    value: "+ Comisiones",
    label: "Mayores ganancias y recurrencia",
    description: "Tasas competitivas y pagos al instante.",
  },
  {
    value: "Un solo lugar",
    label: "Visibilidad y seguimiento comercial",
    description: "Expedientes, avances, ofertas, comisiones y más.",
  },
  {
    value: "Cero costo",
    label: "Acceso y uso gratuito a la plataforma",
    description: "Alta inmediata para aliados y brokers. Sin cuotas.",
  },
  {
    value: "+ Opciones",
    label: "Múltiples productos y alternativas para tus clientes",
    description: "Acceso a red de financieras y bancos para todos los perfiles.",
  },
];

const valueCards = [
  {
    icon: LayoutDashboard,
    title: "Control total del pipeline",
    description:
      "Centraliza prospectos, expedientes y seguimiento en una experiencia ordenada y profesional.",
  },
  {
    icon: Landmark,
    title: "Mejor salida financiera",
    description:
      "Evalúa mejor cada caso y accede a más caminos de colocación según el perfil del cliente.",
  },
  {
    icon: CircleDollarSign,
    title: "Comisión con visibilidad",
    description:
      "Opera con mayor claridad comercial para proteger tu relación y tu ingreso por cierre.",
  },
];

const operatingModes = [
  {
    key: "pro",
    badge: "Broker profesional",
    title: "Para despachos y colocadores que quieren escalar",
    description:
      "Ideal si manejas cartera, expedientes y seguimiento comercial de forma constante.",
    points: [
      "Mayor visibilidad de tus casos en tiempo real.",
      "Una plataforma estructurada para vender más.",
      "Menos carga operativa y más tiempo para vender.",
    ],
  },
  {
    key: "referidor",
    badge: "Aliado y Referido",
    title: "Para quienes quieren canalizar oportunidades y ganar al hacerlo",
    description:
      "Ideal para quienes desean detectar prospectos, referirlos y participar comercialmente sin complicarse.",
    points: [
      "Proceso simple y rápido para enviar contactos.",
      "Acompañamiento del equipo comercial en el cierre.",
      "Modelo claro para colaborar sin complicaciones.",
    ],
  },
] as const;

const networkSegments = [
  {
    title: "PyME y capital de trabajo",
    description:
      "Casos que requieren velocidad, estructura comercial y mejor presentación ante instituciones.",
  },
  {
    title: "PFAE y perfil patrimonial",
    description:
      "Alineación más precisa según historial, flujo y capacidad del cliente.",
  },
  {
    title: "Hipotecario y soluciones mixtas",
    description:
      "Comparativos más claros y acompañamiento para mover operaciones complejas.",
  },
];

const workflow = [
  {
    step: "1",
    title: "Captura el caso en minutos",
    description:
      "Sube el prospecto o envía la oportunidad sin depender de mensajes dispersos o hojas de cálculo.",
  },
  {
    step: "2",
    title: "Perfila mejor la salida",
    description:
      "La operación se acomoda con mayor criterio según producto, perfil y capacidad real de aprobación.",
  },
  {
    step: "3",
    title: "Da seguimiento con autoridad",
    description:
      "Tu cliente recibe una experiencia más clara, más ordenada y con mejor percepción profesional.",
  },
  {
    step: "4",
    title: "Cierra y cobra con visibilidad",
    description:
      "Mantén control del avance comercial y acompaña la operación hasta su mejor desenlace.",
  },
];

const testimonials = [
  {
    name: "María Fernanda R.",
    role: "Broker PyME",
    company: "Despacho financiero aliado",
    quote:
      "La conversación con el cliente cambió por completo. Ahora todo se siente más serio, más claro y más fácil de mover.",
    result: "Duplicó su capacidad de seguimiento en un trimestre.",
  },
  {
    name: "Jorge A. Téllez",
    role: "Broker hipotecario",
    company: "Consultoría patrimonial",
    quote:
      "Lo que más ayuda es la visibilidad. Ya no se trabaja a ciegas y eso mejora mucho la confianza del cliente final.",
    result: "Redujo tiempos de respuesta comercial de días a horas.",
  },
  {
    name: "Ana Lucía G.",
    role: "Aliada comercial",
    company: "Red de referidos empresariales",
    quote:
      "Incluso cuando solo referimos contactos, el proceso se ve mucho más profesional y ordenado.",
    result: "Mejoró la calidad de sus prospectos enviados.",
  },
];

const faqs = [
  {
    question: "¿Tiene costo usar la plataforma?",
    answer:
      "No. El acceso para brokers y aliados es sin costo; el objetivo es ayudarte a operar con más orden y más capacidad de colocación.",
  },
  {
    question: "¿Sirve si solo quiero referir clientes?",
    answer:
      "Sí. Puedes participar como aliado referidor y enviar oportunidades sin llevar todo el expediente por tu cuenta.",
  },
  {
    question: "¿Qué tipo de operaciones pueden entrar?",
    answer:
      "PyME, PFAE, hipotecario y esquemas mixtos, dependiendo del perfil del cliente y de la necesidad de fondeo.",
  },
  {
    question: "¿Cómo se da seguimiento a mi comisión?",
    answer:
      "La operación se trabaja con trazabilidad comercial clara para que sepas en qué etapa está y puedas dar seguimiento con mayor certeza.",
  },
  {
    question: "¿Cuánto tardan en contactarme?",
    answer:
      "Normalmente el equipo responde dentro de las siguientes 24 horas hábiles para activar el acceso o agendar una demo.",
  },
];

export default function BrokersLanding() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preferredTrack, setPreferredTrack] = useState<"pro" | "referidor">("pro");
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
        title: "Selecciona tu especialidad",
        description: "Elige el tipo de operación que más se parece a tu mercado.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await apiRequest("POST", "/api/public/broker-leads", {
        ...form,
        brokerProfile: preferredTrack,
        brokerType,
      });

      toast({
        title: "Solicitud enviada",
        description: "El equipo comercial te contactará muy pronto.",
      });

      setForm({
        name: "",
        email: "",
        phone: "",
        company: "",
        message: "",
      });
      setBrokerType("");
      setPreferredTrack("pro");
    } catch (error: any) {
      toast({
        title: "No se pudo enviar",
        description: error.message || "Intenta nuevamente en unos minutos.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5fbff_0%,#edf5fb_40%,#ffffff_100%)] text-slate-900">
      <nav className="sticky top-0 z-50 border-b border-[#173653] bg-[#1F476B] backdrop-blur-xl">
        <div className="mx-auto grid max-w-[90rem] grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center">
            <img
              src="/Credito_Negocios-07.png"
              alt="Credito Negocios"
              className="h-12 w-auto sm:h-14 lg:h-16"
            />
          </div>

          <div className="px-2 text-center">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-white sm:text-base lg:text-xl">
              Programa para Brokers y Referidos
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <Button asChild size="sm" className="bg-emerald-500 text-white shadow-md hover:bg-emerald-600">
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <MessageSquare className="mr-2 h-4 w-4" />
                WhatsApp
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild className="border-emerald-300/80 bg-transparent text-emerald-100 hover:bg-emerald-500/20 hover:text-emerald-50">
              <a href={loginHref}>
                <LogIn className="mr-2 h-4 w-4 text-emerald-100" />
                Login
              </a>
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#f7f9fb_0%,#eef2f6_100%)] text-slate-900">
        <div className="absolute inset-0">
          <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-slate-300/30 blur-3xl" />
          <div className="absolute -left-12 bottom-0 h-80 w-80 rounded-full bg-slate-200/45 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-[90rem] gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:pb-20 lg:pt-16">
          <div className="flex flex-col justify-start">
            <h1 className="max-w-3xl text-3xl font-extrabold leading-[1.12] text-slate-900 sm:text-4xl lg:text-5xl">
              ¡La plataforma que te permite ganar comisiones sin límites!
            </h1>

            <h2 className="mt-6 max-w-3xl text-2xl font-semibold text-slate-700 sm:text-3xl">
              Tú traes el cliente, nosotros el capital.
            </h2>

            <p className="mt-6 text-xs font-black uppercase tracking-[0.24em] text-emerald-700 sm:text-sm">
              Para brokers, despachos y referidos
            </p>

            <p className="mt-8 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
              Refiere un contacto o administra expedientes completos desde un solo lugar. Nosotros te ayudamos a perfilar, presentar y dar seguimiento para que cierres más&nbsp;y cobres mejor.
            </p>

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
              {["Sin costo", "Más visibilidad", "Más opciones", "Más cierres"].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
                >
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-secondary text-base font-semibold shadow-lg shadow-secondary/20 hover:bg-secondary/90">
                <a href="#form-brokers">
                  Solicitar demo
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                className="bg-emerald-500 text-base font-semibold text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-600"
              >
                <a href={whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  Hablar con un asesor
                </a>
              </Button>
            </div>
          </div>

          <div className="relative">
            <Card id="form-brokers" className="overflow-hidden border-none bg-white/95 shadow-[0_30px_90px_-35px_rgba(5,71,138,0.45)]">
              <div className="border-b border-slate-100 bg-white px-6 py-5 sm:px-8">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Acceso inmediato</p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Solicita acceso gratuito</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Déjanos tus datos y te ayudamos a activar el mejor camino para tu operación.
                </p>
              </div>

              <CardContent className="p-6 sm:p-8">
                <div className="mb-5 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={preferredTrack === "pro"}
                    onClick={() => setPreferredTrack("pro")}
                    className={`rounded-2xl border-2 p-4 text-left transition-all duration-200 ${
                      preferredTrack === "pro"
                        ? "border-primary bg-gradient-to-br from-primary/10 to-cyan-50 shadow-lg ring-4 ring-primary/10"
                        : "border-primary/40 bg-slate-50 hover:border-primary/60 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Broker profesional</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">Administro cartera, clientes y seguimiento.</p>
                      </div>
                      {preferredTrack === "pro" && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                    </div>
                    <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                      preferredTrack === "pro" ? "bg-primary text-white" : "bg-slate-200 text-slate-600"
                    }`}>
                      {preferredTrack === "pro" ? "Seleccionado" : "Disponible"}
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={preferredTrack === "referidor"}
                    onClick={() => setPreferredTrack("referidor")}
                    className={`rounded-2xl border-2 p-4 text-left transition-all duration-200 ${
                      preferredTrack === "referidor"
                        ? "border-secondary bg-gradient-to-br from-secondary/10 to-emerald-50 shadow-lg ring-4 ring-secondary/10"
                        : "border-secondary/40 bg-slate-50 hover:border-secondary/60 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Aliado referidor</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">Solo quiero detectar y canalizar oportunidades.</p>
                      </div>
                      {preferredTrack === "referidor" && <CheckCircle2 className="h-5 w-5 shrink-0 text-secondary" />}
                    </div>
                    <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                      preferredTrack === "referidor" ? "bg-secondary text-white" : "bg-slate-200 text-slate-600"
                    }`}>
                      {preferredTrack === "referidor" ? "Seleccionado" : "Disponible"}
                    </span>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="broker-name" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Nombre
                    </Label>
                    <Input
                      id="broker-name"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Nombre completo"
                      className="border-slate-200 bg-slate-50 focus:bg-white"
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="broker-phone" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        WhatsApp
                      </Label>
                      <Input
                        id="broker-phone"
                        value={form.phone}
                        onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                        placeholder="55 0000 0000"
                        className="border-slate-200 bg-slate-50 focus:bg-white"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="broker-email" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Correo
                      </Label>
                      <Input
                        id="broker-email"
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                        placeholder="nombre@empresa.com"
                        className="border-slate-200 bg-slate-50 focus:bg-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="broker-company" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Empresa o despacho
                      </Label>
                      <Input
                        id="broker-company"
                        value={form.company}
                        onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                        placeholder="Nombre comercial"
                        className="border-slate-200 bg-slate-50 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Especialidad principal
                      </Label>
                      <Select value={brokerType} onValueChange={setBrokerType}>
                        <SelectTrigger className="border-slate-200 bg-slate-50 focus:bg-white">
                          <SelectValue placeholder="Selecciona una opción" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pyme">Crédito PyME</SelectItem>
                          <SelectItem value="pfae">PFAE</SelectItem>
                          <SelectItem value="hipotecario">Hipotecario</SelectItem>
                          <SelectItem value="mixto">Mixto o varios productos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="broker-message" className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Mensaje
                    </Label>
                    <Textarea
                      id="broker-message"
                      value={form.message}
                      onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                      placeholder={
                        preferredTrack === "pro"
                          ? "Cuéntanos qué tipo de clientes atiendes o qué te gustaría mejorar en tu operación."
                          : "Cuéntanos cómo generas oportunidades o a qué tipo de clientes sueles referir."
                      }
                      className="min-h-[96px] border-slate-200 bg-slate-50 focus:bg-white"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-secondary text-base font-bold shadow-lg shadow-secondary/20 hover:bg-secondary/90"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Enviando..." : "Solicitar acceso y demo"}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>

                  <p className="text-center text-xs leading-5 text-slate-500">
                    Respuesta comercial normalmente dentro de las siguientes 24 horas hábiles.
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 pt-10 sm:px-6 lg:px-8 lg:pt-12">
        <div className="grid items-stretch gap-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl sm:grid-cols-2 lg:grid-cols-4 lg:p-6">
          {statHighlights.map((item) => (
            <div
              key={item.label}
              className="flex h-full flex-col rounded-[1.5rem] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-6 text-left shadow-sm lg:min-h-[240px]"
            >
              <div>
                <p className="min-h-[56px] text-3xl font-extrabold leading-tight text-primary">{item.value}</p>
                <p className="mt-3 min-h-[52px] text-base font-bold leading-6 text-slate-900">{item.label}</p>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <div className="mb-10">
          <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Elige la forma que mejor se adapta a tu operación.
          </h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {operatingModes.map((mode) => (
            <Card
              key={mode.key}
              className={`overflow-hidden rounded-[2rem] border-2 bg-white shadow-sm transition-all ${
                preferredTrack === mode.key
                  ? mode.key === "referidor"
                    ? "border-secondary ring-2 ring-secondary/15 shadow-xl"
                    : "border-primary ring-2 ring-primary/20 shadow-xl"
                  : mode.key === "referidor"
                    ? "border-secondary/40 hover:shadow-lg"
                    : "border-primary/40 hover:shadow-lg"
              }`}
            >
              <CardContent className="p-8 lg:p-10">
                <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                  mode.key === "pro" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                }`}>
                  {mode.badge}
                </div>
                <h3 className="text-3xl font-bold leading-tight text-slate-950">{mode.title}</h3>
                <p className="mt-4 text-base leading-8 text-slate-600">{mode.description}</p>
                <ul className="mt-6 space-y-4 text-base text-slate-700">
                  {mode.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-[88rem]">
          <h2 className="max-w-none text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-[3rem] lg:leading-[1.12]">
            Diseñada para aquellos que buscan velocidad, orden <br className="hidden lg:block" /> y más opciones para su colocación.
          </h2>
          <p className="mt-4 text-base leading-8 text-slate-600 sm:text-lg">
            El valor real está en tener más probabilidades de colocación, ofrecer más productos, tener una mejor estructura y control de expedientes y llevar todo el proceso en un mismo lugar.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden border-none bg-white shadow-xl">
            <CardContent className="h-full p-0">
              <div className="h-full bg-rose-50 p-8 lg:p-10">
                <Sparkles className="h-8 w-8 text-rose-600" />
                <h3 className="mt-5 text-2xl font-bold text-rose-950">Lo que usualmente frena al broker</h3>
                <div className="mt-6 space-y-5">
                  <div className="flex gap-4">
                    <Users className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
                    <div>
                      <p className="text-base font-bold text-rose-950">Seguimiento disperso</p>
                      <p className="mt-1 text-sm leading-6 text-rose-900/80">WhatsApp, correos, notas y hojas de cálculo hacen más lenta la operación.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <BriefcaseBusiness className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
                    <div>
                      <p className="text-base font-bold text-rose-950">Menos control del expediente</p>
                      <p className="mt-1 text-sm leading-6 text-rose-900/80">Cuesta saber qué falta, qué avance lleva cada caso y qué sigue en el proceso.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <Banknote className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
                    <div>
                      <p className="text-base font-bold text-rose-950">Pocas alternativas de salida</p>
                      <p className="mt-1 text-sm leading-6 text-rose-900/80">Se limita la colocación cuando no hay visibilidad de más productos e instituciones.</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-none bg-white shadow-xl">
            <CardContent className="h-full p-0">
              <div className="h-full bg-emerald-50 p-8 lg:p-10">
                <ShieldCheck className="h-8 w-8 text-emerald-600" />
                <h3 className="mt-5 text-2xl font-bold text-emerald-950">Lo que ganas con Crédito Negocios</h3>
                <div className="mt-6 space-y-5">
                  <div className="flex gap-4">
                    <Users className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-base font-bold text-emerald-950">Más probabilidades de colocación</p>
                      <p className="mt-1 text-sm leading-6 text-emerald-900/80">Acceso a más rutas y productos para presentar mejor cada oportunidad.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <BriefcaseBusiness className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-base font-bold text-emerald-950">Mayor estructura y control</p>
                      <p className="mt-1 text-sm leading-6 text-emerald-900/80">Todo el expediente, seguimiento y avance comercial en un mismo lugar.</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <Banknote className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-base font-bold text-emerald-950">Más productos para ofrecer</p>
                      <p className="mt-1 text-sm leading-6 text-emerald-900/80">Mayor capacidad para vender con mejor orden, visibilidad y confianza frente al cliente.</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[1.75rem] bg-[#0A3042] p-6 text-white shadow-xl">
            <Building2 className="h-6 w-6 text-cyan-300" />
            <p className="mt-3 text-lg font-bold">Instituciones más alineadas</p>
            <p className="mt-2 text-sm leading-6 text-blue-100">Cada oportunidad puede perfilarse con una lógica mucho más comercial y menos improvisada.</p>
          </div>

          <div className="rounded-[1.75rem] bg-[#0A3042] p-6 text-white shadow-xl">
            <Wallet className="h-6 w-6 text-cyan-300" />
            <p className="mt-3 text-lg font-bold">Mayor percepción de valor</p>
            <p className="mt-2 text-sm leading-6 text-blue-100">Tu despacho se ve más sólido cuando el proceso es claro y estructurado.</p>
          </div>

          <div className="rounded-[1.75rem] bg-[#0A3042] p-6 text-white shadow-xl">
            <ShieldCheck className="h-6 w-6 text-cyan-300" />
            <p className="mt-3 text-lg font-bold">Seguimiento con mejor trazabilidad</p>
            <p className="mt-2 text-sm leading-6 text-blue-100">Menos incertidumbre, más orden y una experiencia mucho más digna de mostrar frente a tu nicho de mercado.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Cómo funciona</p>
          <h2 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">Paso a paso para operar mejor.</h2>
        </div>

        <div className="grid items-stretch gap-5 lg:grid-cols-4">
          {workflow.map((item) => (
            <Card key={item.step} className="h-full rounded-[1.75rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="flex h-full flex-col items-start p-6 text-left lg:p-7">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-white">
                  {item.step}
                </div>
                <h3 className="min-h-[56px] text-xl font-bold leading-tight text-slate-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[90rem] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-slate-900">Lo que valoran quienes ya operan con más estructura.</h2>
        </div>

        <div className="grid items-stretch gap-6 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <Card key={testimonial.name} className="flex h-full border-slate-200 bg-white shadow-sm transition-all hover:shadow-lg">
              <CardContent className="flex h-full flex-col p-7">
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
                    <p className="text-xs text-slate-400">{testimonial.company}</p>
                  </div>
                </div>
                <p className="text-sm leading-7 text-slate-600">“{testimonial.quote}”</p>
                <div className="mt-auto pt-6">
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Resultado</p>
                    <p className="mt-2 text-sm font-medium text-slate-800">{testimonial.result}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[82rem] px-4 py-20 sm:px-6 lg:px-8">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm lg:p-10">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Preguntas frecuentes</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-slate-900">Respuestas claras para decidir rápido.</h2>
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
        <div className="mx-auto flex max-w-[90rem] flex-col gap-6 rounded-[2rem] bg-[linear-gradient(135deg,#2B5B85_0%,#1F476B_58%,#173653_100%)] p-8 text-white lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">Siguiente paso</p>
            <h2 className="mt-3 text-3xl font-black">Si tu mercado exige confianza, tu experiencia también debe verla.</h2>
            <p className="mt-3 text-base leading-7 text-blue-100">
              Solicita acceso, conoce el flujo y decide si esta es la forma correcta de elevar tu operación comercial.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild className="bg-secondary px-7 text-white hover:bg-secondary/90">
              <a href="#form-brokers">
                Solicitar acceso
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="border-white/30 bg-white/10 px-7 text-white hover:bg-white/20 hover:text-white"
            >
              <a href={loginHref}>
                <LogIn className="mr-2 h-4 w-4" />
                Ya tengo cuenta
              </a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#173653] bg-[#1F476B] text-white">
        <div className="mx-auto grid max-w-[90rem] grid-cols-1 items-center gap-4 px-4 py-8 text-sm sm:px-6 lg:grid-cols-[auto_1fr_auto] lg:gap-6 lg:px-8">
          <div className="flex items-center justify-center lg:justify-start">
            <img src="/Credito_Negocios-07.png" alt="Credito Negocios" className="h-16 w-auto sm:h-20" />
          </div>

          <div className="text-center text-base text-blue-100">@ Credito Negocios 2026</div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-blue-100 lg:justify-end">
            <a href="mailto:info@creditonegocios.com.mx" className="inline-flex items-center gap-2 hover:text-white">
              <Mail className="h-4 w-4" />
              info@creditonegocios.com.mx
            </a>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-white">
              <Phone className="h-4 w-4" />
              WhatsApp
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}