import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/queryClient";
import { PlatformGallery } from "@/components/Public/PlatformGallery";

export default function BrokersLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [profile, setProfile] = useState<"pro" | "referidor">("pro");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [status, setStatus] = useState<{
    error: boolean;
    message: string;
  } | null>(null);
  useEffect(() => {
    const old = document.title;
    document.title = "Brokers y referidores | Crédito Negocios";
    return () => {
      document.title = old;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (sending.current || !form.reportValidity()) return;
    sending.current = true;
    setBusy(true);
    setStatus(null);
    const data = Object.fromEntries(new FormData(form));
    try {
      await apiRequest("POST", "/api/public/broker-leads", {
        ...data,
        brokerProfile: profile,
        brokerType: profile === "referidor" ? "mixto" : data.brokerType,
        company: profile === "referidor" ? "" : data.company,
      });
      form.reset();
      setStatus({
        error: false,
        message:
          "Recibimos tu solicitud. Te contactaremos para explicarte los siguientes pasos. Tu cuenta todavía no está activada.",
      });
    } catch {
      setStatus({
        error: true,
        message:
          "No pudimos enviar tu solicitud. Conservamos tus datos para que puedas intentar de nuevo.",
      });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      className="cn-public"
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }}
    >
      <a className="cn-skip" href="#contenido">
        {"Ir al contenido"}
      </a>
      <header className="cn-header">
        <nav aria-label="Navegación principal" className="cn-container cn-nav">
          <a
            aria-label="Crédito Negocios — inicio"
            className="cn-logo"
            href="https://www.creditonegocios.com.mx/"
          >
            <img
              alt="Crédito Negocios"
              height="52"
              src="/credito-negocios-07.jpg"
              width="205"
            />
          </a>
          <button
            aria-controls="broker-menu"
            className="cn-menu-button"
            type="button"
            ref={menuButton}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {"Menú"}
          </button>
          <div
            className="cn-links"
            id="broker-menu"
            data-open={String(menuOpen)}
            onClick={(event) => {
              if ((event.target as Element).closest("a")) setMenuOpen(false);
            }}
          >
            <a href="#plataforma">{"La plataforma"}</a>
            <a href="#colaboracion">{"Cómo colaborar"}</a>
            <a href="#preguntas">{"Preguntas"}</a>
            <a href="https://app.creditonegocios.com.mx/">{"Iniciar sesión"}</a>
            <a className="cn-button cn-button--outline" href="#form-brokers">
              {"Solicitar incorporación"}
            </a>
          </div>
        </nav>
      </header>
      <main id="contenido">
        <section className="cn-hero" id="plataforma">
          <div className="cn-container cn-hero-grid cn-broker-hero-grid">
            <div>
              <span className="cn-eyebrow">
                {"Brokers, despachos y referidores"}
              </span>
              <h1>
                {"Convierte tus contactos en comisiones."}
                <br />
                <em>{"Tú traes el cliente, nosotros el capital."}</em>
              </h1>
              <p className="cn-lead">
                {"Explora opciones de financiamiento entre "}
                <strong>{"múltiples instituciones financieras"}</strong>
                {
                  " y centraliza clientes, expedientes, seguimiento y comisiones en una misma plataforma."
                }
              </p>
              <div className="cn-actions">
                <a className="cn-button" href="#form-brokers">
                  {"Solicitar incorporación "}
                  <svg
                    aria-hidden="true"
                    className="lucide lucide-arrow-right"
                    fill="none"
                    height="18"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="18"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M5 12h14"></path>
                    <path d="m12 5 7 7-7 7"></path>
                  </svg>
                </a>
                <a
                  className="cn-button cn-button--outline"
                  href="https://wa.me/525623300270"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {"Hablar con un asesor"}
                </a>
              </div>
              <p className="cn-note cn-hero-note">
                {
                  "Tú aportas la oportunidad. Te ayudamos a perfilarla y presentarla. Las instituciones financieras evalúan y otorgan el financiamiento."
                }
              </p>
            </div>
            <PlatformGallery />
          </div>
        </section>
        <section
          aria-label="Herramientas para generar oportunidades"
          className="cn-value-strip"
        >
          <div className="cn-container cn-value-grid">
            <article className="cn-value-tile">
              <div className="cn-value-top">
                <strong className="cn-value-number">{"5"}</strong>
                <span className="cn-value-icon">
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="24"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                    viewBox="0 0 24 24"
                    width="24"
                  >
                    <rect height="7" rx="1.5" width="7" x="3" y="3"></rect>
                    <rect height="7" rx="1.5" width="7" x="14" y="3"></rect>
                    <rect height="7" rx="1.5" width="7" x="3" y="14"></rect>
                    <rect height="7" rx="1.5" width="7" x="14" y="14"></rect>
                  </svg>
                </span>
              </div>
              <h2>{"productos para abrir puertas"}</h2>
              <p>{"Más formas de atender las necesidades de tus clientes."}</p>
            </article>
            <article className="cn-value-tile">
              <div className="cn-value-top">
                <strong className="cn-value-number">{"1"}</strong>
                <span className="cn-value-icon">
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="24"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                    viewBox="0 0 24 24"
                    width="24"
                  >
                    <rect height="13" rx="2" width="18" x="3" y="3"></rect>
                    <path d="M8 21h8M12 16v5"></path>
                  </svg>
                </span>
              </div>
              <h2>{"plataforma para tu operación"}</h2>
              <p>
                {"Clientes, documentos, solicitudes y comisiones conectados."}
              </p>
            </article>
            <article className="cn-value-tile">
              <div className="cn-value-top">
                <strong className="cn-value-number">{"2"}</strong>
                <span className="cn-value-icon">
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="24"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                    viewBox="0 0 24 24"
                    width="24"
                  >
                    <circle cx="9" cy="8" r="3"></circle>
                    <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"></path>
                  </svg>
                </span>
              </div>
              <h2>{"formas de generar oportunidades"}</h2>
              <p>{"Participa como broker profesional o aliado referidor."}</p>
            </article>
          </div>
        </section>
        <section className="cn-section">
          <div className="cn-container">
            <div className="cn-section-heading">
              <div>
                <span className="cn-eyebrow">
                  {"Herramientas para tu operación"}
                </span>
                <h2>
                  {"Menos información dispersa."}
                  <br />
                  {"Más claridad para avanzar."}
                </h2>
              </div>
            </div>
            <div className="cn-grid cn-grid--three">
              <article className="cn-card">
                <span className="cn-icon">
                  <svg
                    aria-hidden="true"
                    className="lucide lucide-landmark"
                    fill="none"
                    height="22"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="22"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <line x1="3" x2="21" y1="22" y2="22"></line>
                    <line x1="6" x2="6" y1="18" y2="11"></line>
                    <line x1="10" x2="10" y1="18" y2="11"></line>
                    <line x1="14" x2="14" y1="18" y2="11"></line>
                    <line x1="18" x2="18" y1="18" y2="11"></line>
                    <polygon points="12 2 20 7 4 7"></polygon>
                  </svg>
                </span>
                <h3>{"Alternativas según el perfil"}</h3>
                <p>
                  {
                    "Consulta productos e instituciones y revisa la compatibilidad de cada oportunidad. Identifica también qué información falta para evaluarla."
                  }
                </p>
              </article>
              <article className="cn-card">
                <span className="cn-icon">
                  <svg
                    aria-hidden="true"
                    className="lucide lucide-folder-open"
                    fill="none"
                    height="22"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="22"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </span>
                <h3>{"Expedientes con seguimiento"}</h3>
                <p>
                  {
                    "Organiza documentos, solicitudes y avances de tus clientes. Consulta en qué etapa está cada caso y qué necesita para continuar."
                  }
                </p>
              </article>
              <article className="cn-card">
                <span className="cn-icon">
                  <svg
                    aria-hidden="true"
                    className="lucide lucide-circle-dollar-sign"
                    fill="none"
                    height="22"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="22"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
                    <path d="M12 18V6"></path>
                  </svg>
                </span>
                <h3>{"Comisiones con trazabilidad"}</h3>
                <p>
                  {
                    "Revisa la información de tus comisiones según tu rol. El cálculo, la validación y el pago siguen las condiciones de cada operación y de tu red."
                  }
                </p>
              </article>
            </div>
          </div>
        </section>
        <section
          aria-labelledby="earning-title"
          className="cn-section cn-earning"
        >
          <div className="cn-container cn-earning-inner">
            <div>
              <span className="cn-eyebrow">
                {"Convierte tus contactos en oportunidades"}
              </span>
              <h2 id="earning-title">
                {"Tú conectas al cliente."}
                <br />
                <em>{"Hagamos crecer tus oportunidades de comisión."}</em>
              </h2>
              <p>
                {
                  "Una empresa que necesita liquidez. Un conocido que busca equipo. Una familia que quiere una vivienda. Tu siguiente oportunidad puede estar en una conversación."
                }
              </p>
              <p className="cn-note">
                {
                  "Te ayudamos a explorar opciones con distintas instituciones. La comisión depende de cada operación y de tu esquema de colaboración."
                }
              </p>
            </div>
            <a className="cn-button" href="#form-brokers">
              {"Quiero empezar "}
              <span aria-hidden="true">{"→"}</span>
            </a>
          </div>
        </section>
        <section className="cn-section cn-section--wash" id="colaboracion">
          <div className="cn-container">
            <div className="cn-section-heading">
              <div>
                <span className="cn-eyebrow">{"Dos formas de colaborar"}</span>
                <h2>{"Participa de acuerdo con tu operación."}</h2>
                <p>
                  {
                    "Te explicamos el alcance, las responsabilidades y las condiciones antes de comenzar."
                  }
                </p>
              </div>
            </div>
            <div className="cn-grid cn-grid--two">
              <article className="cn-card">
                <span className="cn-product-tag">{"Broker profesional"}</span>
                <h3>{"Gestiona tus clientes y oportunidades."}</h3>
                <p>
                  {
                    "Para brokers y despachos que integran expedientes y participan en el seguimiento comercial."
                  }
                </p>
                <ul className="cn-contact-points">
                  <li>
                    <svg
                      aria-hidden="true"
                      className="lucide lucide-check cn-check"
                      fill="none"
                      height="18"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="18"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                    {"Consulta alternativas para distintos productos."}
                  </li>
                  <li>
                    <svg
                      aria-hidden="true"
                      className="lucide lucide-check cn-check"
                      fill="none"
                      height="18"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="18"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                    {"Organiza solicitudes y documentos."}
                  </li>
                  <li>
                    <svg
                      aria-hidden="true"
                      className="lucide lucide-check cn-check"
                      fill="none"
                      height="18"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="18"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                    {"Da seguimiento al caso y a tu comisión."}
                  </li>
                </ul>
                <a
                  className="cn-text-link"
                  href="#form-brokers"
                  onClick={() => setProfile("pro")}
                >
                  {"Quiero operar como broker →"}
                </a>
              </article>
              <article className="cn-card">
                <span className="cn-product-tag">{"Aliado referidor"}</span>
                <h3>{"Conecta a quien necesita financiamiento."}</h3>
                <p>
                  {
                    "Para contadores, consultores y personas que detectan oportunidades y quieren canalizarlas."
                  }
                </p>
                <ul className="cn-contact-points">
                  <li>
                    <svg
                      aria-hidden="true"
                      className="lucide lucide-check cn-check"
                      fill="none"
                      height="18"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="18"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                    {"Comparte la oportunidad por el canal acordado."}
                  </li>
                  <li>
                    <svg
                      aria-hidden="true"
                      className="lucide lucide-check cn-check"
                      fill="none"
                      height="18"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="18"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                    {"Recibe acompañamiento del equipo comercial."}
                  </li>
                  <li>
                    <svg
                      aria-hidden="true"
                      className="lucide lucide-check cn-check"
                      fill="none"
                      height="18"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="18"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M20 6 9 17l-5-5"></path>
                    </svg>
                    {"Conoce las condiciones de tu participación."}
                  </li>
                </ul>
                <a
                  className="cn-text-link"
                  href="#form-brokers"
                  onClick={() => setProfile("referidor")}
                >
                  {"Quiero referir oportunidades →"}
                </a>
              </article>
            </div>
          </div>
        </section>
        <section className="cn-section">
          <div className="cn-container">
            <div className="cn-section-heading">
              <div>
                <span className="cn-eyebrow">
                  {"Un catálogo para distintas necesidades"}
                </span>
                <h2>{"Amplía las conversaciones con tus clientes."}</h2>
                <p>
                  {
                    "Crédito simple · Línea revolvente · Factoraje · Arrendamiento vehicular y de equipo · Hipotecario de vivienda."
                  }
                </p>
              </div>
              <a
                className="cn-text-link"
                href="https://www.creditonegocios.com.mx/#creditos"
              >
                {"Conocer los productos ↗"}
              </a>
            </div>
            <div className="cn-grid cn-grid--four">
              <article className="cn-step">
                <span className="cn-step-number">{"01"}</span>
                <h3>{"Solicita tu incorporación"}</h3>
                <p>
                  {"Nos compartes tus datos y eliges cómo quieres colaborar."}
                </p>
              </article>
              <article className="cn-step">
                <span className="cn-step-number">{"02"}</span>
                <h3>{"Conoce las condiciones"}</h3>
                <p>
                  {
                    "El equipo revisa tu perfil, explica el esquema y te orienta en la activación."
                  }
                </p>
              </article>
              <article className="cn-step">
                <span className="cn-step-number">{"03"}</span>
                <h3>{"Presenta oportunidades"}</h3>
                <p>
                  {
                    "Registra tus casos o canaliza tus referidos conforme al esquema acordado."
                  }
                </p>
              </article>
              <article className="cn-step">
                <span className="cn-step-number">{"04"}</span>
                <h3>{"Acompaña cada avance"}</h3>
                <p>
                  {
                    "Da seguimiento a la operación y a los requisitos para el pago de tu comisión."
                  }
                </p>
              </article>
            </div>
          </div>
        </section>
        <section
          aria-labelledby="testimonials-title"
          className="cn-section cn-testimonials"
        >
          <div className="cn-container">
            <div className="cn-section-heading">
              <div>
                <span className="cn-eyebrow">
                  {"La experiencia de nuestra red"}
                </span>
                <h2 id="testimonials-title">
                  {"Lo que dicen nuestros brokers y aliados."}
                </h2>
                <p>
                  {
                    "Lo que valoran brokers y aliados al acompañar a sus clientes."
                  }
                </p>
              </div>
            </div>
            <div className="cn-grid cn-grid--three">
              <figure className="cn-testimonial">
                <h3>{"Una atención más profesional"}</h3>
                <blockquote>
                  {
                    "La conversación con el cliente cambió por completo. Ahora todo se siente más serio, más claro y más fácil de mover."
                  }
                </blockquote>
                <figcaption>
                  <span>
                    <strong>{"María Fernanda R."}</strong>
                    <small>{"Broker PyME"}</small>
                  </span>
                </figcaption>
              </figure>
              <figure className="cn-testimonial">
                <h3>{"Visibilidad para dar seguimiento"}</h3>
                <blockquote>
                  {
                    "Lo que más ayuda es la visibilidad. Ya no se trabaja a ciegas y eso mejora mucho la confianza del cliente final."
                  }
                </blockquote>
                <figcaption>
                  <span>
                    <strong>{"Jorge A. Téllez"}</strong>
                    <small>{"Broker hipotecario"}</small>
                  </span>
                </figcaption>
              </figure>
              <figure className="cn-testimonial">
                <h3>{"Orden al canalizar referidos"}</h3>
                <blockquote>
                  {
                    "Incluso cuando solo referimos contactos, el proceso se ve mucho más profesional y ordenado."
                  }
                </blockquote>
                <figcaption>
                  <span>
                    <strong>{"Ana Lucía G."}</strong>
                    <small>{"Aliada comercial"}</small>
                  </span>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>
        <section className="cn-section cn-section--wash" id="form-brokers">
          <div className="cn-container cn-contact-grid">
            <div className="cn-contact-copy">
              <span className="cn-eyebrow">{"Comencemos a colaborar"}</span>
              <h2>{"Cuéntanos cómo quieres participar."}</h2>
              <p>
                {
                  "El equipo te contactará para conocer tu operación, resolver dudas y explicarte los pasos para incorporarte."
                }
              </p>
              <ul className="cn-contact-points">
                <li>
                  <svg
                    aria-hidden="true"
                    className="lucide lucide-check cn-check"
                    fill="none"
                    height="18"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="18"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                  {"Recibe orientación sobre el esquema de colaboración."}
                </li>
                <li>
                  <svg
                    aria-hidden="true"
                    className="lucide lucide-check cn-check"
                    fill="none"
                    height="18"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="18"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                  {
                    "Conoce las condiciones de acceso antes de activar tu cuenta."
                  }
                </li>
                <li>
                  <svg
                    aria-hidden="true"
                    className="lucide lucide-check cn-check"
                    fill="none"
                    height="18"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="18"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                  {"Solicita una demo si quieres ver el funcionamiento."}
                </li>
              </ul>
              <p className="cn-note">
                {"¿Ya tienes cuenta? "}
                <a
                  className="cn-text-link"
                  href="https://app.creditonegocios.com.mx/"
                >
                  {"Inicia sesión"}
                </a>
                {"."}
              </p>
            </div>
            <form
              aria-label="Solicitar incorporación al programa"
              className="cn-form"
              onSubmit={submit}
            >
              <fieldset className="cn-mode-options">
                <legend>{"¿Cómo quieres colaborar?"}</legend>
                <label className="cn-mode">
                  <input
                    name="brokerProfile"
                    type="radio"
                    value="pro"
                    checked={profile === "pro"}
                    onChange={() => setProfile("pro")}
                  />
                  <span>
                    <strong>{"Broker profesional"}</strong>
                    <small>{"Gestiono clientes y expedientes."}</small>
                  </span>
                </label>
                <label className="cn-mode">
                  <input
                    name="brokerProfile"
                    type="radio"
                    value="referidor"
                    checked={profile === "referidor"}
                    onChange={() => setProfile("referidor")}
                  />
                  <span>
                    <strong>{"Aliado referidor"}</strong>
                    <small>{"Quiero canalizar oportunidades."}</small>
                  </span>
                </label>
              </fieldset>
              <div className="cn-fields">
                <div className="cn-field cn-field--full">
                  <label htmlFor="broker-name">{"Nombre completo"}</label>
                  <input
                    autoComplete="name"
                    id="broker-name"
                    maxLength={120}
                    minLength={2}
                    name="name"
                    placeholder="¿Cómo te llamas?"
                    required={true}
                  />
                </div>
                <div className="cn-field">
                  <label htmlFor="broker-phone">{"Teléfono / WhatsApp"}</label>
                  <input
                    autoComplete="tel"
                    id="broker-phone"
                    maxLength={25}
                    minLength={8}
                    name="phone"
                    placeholder="55 0000 0000"
                    required={true}
                    type="tel"
                  />
                </div>
                <div className="cn-field">
                  <label htmlFor="broker-email">{"Correo electrónico"}</label>
                  <input
                    autoComplete="email"
                    id="broker-email"
                    maxLength={254}
                    name="email"
                    placeholder="nombre@empresa.com"
                    required={true}
                    type="email"
                  />
                </div>
                {profile === "pro" && (
                  <div className="cn-field">
                    <label htmlFor="broker-company">
                      {"Empresa o despacho "}
                      <span>{"(opcional)"}</span>
                    </label>
                    <input
                      autoComplete="organization"
                      id="broker-company"
                      maxLength={180}
                      name="company"
                    />
                  </div>
                )}
                {profile === "pro" && (
                  <div className="cn-field">
                    <label htmlFor="broker-type">
                      {"Especialidad principal"}
                    </label>
                    <select id="broker-type" name="brokerType" required={true}>
                      <option value="">{"Selecciona una opción"}</option>
                      <option value="pyme">
                        {"Crédito empresarial / PyME"}
                      </option>
                      <option value="pfae">
                        {"Personas físicas con actividad empresarial"}
                      </option>
                      <option value="hipotecario">{"Hipotecario"}</option>
                      <option value="mixto">
                        {"Varios productos / otra especialidad"}
                      </option>
                    </select>
                  </div>
                )}
                <div className="cn-field cn-field--full">
                  <label htmlFor="broker-message">
                    {"Mensaje "}
                    <span>{"(opcional)"}</span>
                  </label>
                  <textarea
                    id="broker-message"
                    maxLength={1200}
                    name="message"
                    placeholder="¿Qué tipo de clientes atiendes? También puedes pedir una demo."
                  ></textarea>
                </div>
              </div>
              <p className="cn-note">
                {
                  "Usaremos tus datos para atender tu solicitud. Consulta nuestro "
                }
                <a
                  href="/legal/aviso"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {"Aviso de Privacidad"}
                </a>
                {"."}
              </p>
              <button className="cn-button" type="submit" disabled={busy}>
                {busy ? "Enviando…" : "Solicitar incorporación →"}
              </button>
              <p className="cn-note">
                {
                  "Respuesta comercial normalmente dentro de las siguientes 24 horas hábiles. El envío no activa una cuenta ni genera un cobro."
                }
              </p>
              {status && (
                <p
                  role={status.error ? "alert" : "status"}
                  className={
                    "cn-status" + (status.error ? " cn-status--error" : "")
                  }
                >
                  {status.message}
                </p>
              )}
            </form>
          </div>
        </section>
        <section className="cn-section" id="preguntas">
          <div className="cn-container">
            <div className="cn-faq">
              <span className="cn-eyebrow">{"Colabora con claridad"}</span>
              <h2 className="cn-title-gap">
                {"Lo que necesitas saber antes de empezar."}
              </h2>
              <details>
                <summary>{"¿Qué productos puedo trabajar?"}</summary>
                <p>
                  {
                    "Crédito simple, líneas revolventes, factoraje, arrendamiento vehicular y de maquinaria o equipo, e hipotecario de vivienda. La disponibilidad de alternativas depende del perfil del cliente y del catálogo vigente de instituciones y productos."
                  }
                </p>
              </details>
              <details>
                <summary>{"¿Necesito ser broker para participar?"}</summary>
                <p>
                  {
                    "Puedes solicitar tu incorporación como broker profesional o como aliado referidor. Si solo quieres canalizar oportunidades, nuestro equipo te explica cómo compartirlas y qué seguimiento corresponde a cada parte."
                  }
                </p>
              </details>
              <details>
                <summary>
                  {"¿Cómo conozco mi comisión y cuándo se paga?"}
                </summary>
                <p>
                  {
                    "La comisión depende del producto, la operación y tu esquema de colaboración. El monto se valida antes del pago y se cumplen los requisitos documentales y comerciales correspondientes. Puedes consultar el desglose y estado disponible según tu rol. Si perteneces a una red, Crédito Negocios paga al Master y este liquida a sus brokers; si operas sin Master, el pago corresponde directamente al broker."
                  }
                </p>
              </details>
              <details>
                <summary>
                  {"¿Cómo se protege la oportunidad que registro?"}
                </summary>
                <p>
                  {
                    "La oportunidad queda registrada para dar seguimiento a su atribución comercial. La protección, vigencia, renovaciones y resolución de coincidencias se rigen por el convenio y las reglas aplicables; te las explicamos durante tu incorporación."
                  }
                </p>
              </details>
              <details>
                <summary>{"¿Qué condiciones tiene el acceso?"}</summary>
                <p>
                  {
                    "El equipo te confirma las condiciones de acceso y cualquier beneficio o promoción vigente antes de activar tu cuenta. Enviar esta solicitud no activa una suscripción ni genera un cobro."
                  }
                </p>
              </details>
              <details>
                <summary>
                  {"¿Mi cuenta se activa al enviar el formulario?"}
                </summary>
                <p>
                  {
                    "Primero recibimos tu solicitud. Normalmente te contactamos dentro de las siguientes 24 horas hábiles para conocer tu operación, explicar las condiciones y ayudarte con la invitación y activación. Puedes pedir una demostración durante ese contacto."
                  }
                </p>
              </details>
            </div>
          </div>
        </section>
      </main>
      <footer className="cn-footer">
        <div className="cn-container">
          <div className="cn-footer-top">
            <div>
              <a className="cn-logo" href="https://www.creditonegocios.com.mx/">
                <img
                  alt="Crédito Negocios"
                  height="52"
                  loading="lazy"
                  src="/credito-negocios-07.jpg"
                  width="190"
                />
              </a>
              <p>
                {
                  "Alternativas de financiamiento para tus clientes. Herramientas y acompañamiento para tu operación."
                }
              </p>
            </div>
            <div className="cn-footer-links">
              <a href="https://app.creditonegocios.com.mx/">
                {"Acceder a la plataforma"}
              </a>
              <a
                href="https://wa.me/525623300270"
                rel="noopener noreferrer"
                target="_blank"
              >
                {"WhatsApp"}
              </a>
              <a href="mailto:info@creditonegocios.com.mx">
                {"info@creditonegocios.com.mx"}
              </a>
            </div>
          </div>
          <div className="cn-footer-bottom">
            <span>{"© 2026 Crédito Negocios"}</span>
            <div className="cn-footer-links">
              <a href="/legal/aviso">{"Aviso de Privacidad"}</a>
              <a href="/legal/terminos">{"Términos y Condiciones"}</a>
              <a href="https://www.creditonegocios.com.mx/">
                {"Busco financiamiento"}
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
