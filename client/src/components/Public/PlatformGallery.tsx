import { useRef, useState } from "react";

const views = [
  {
    key: "seguimiento",
    label: "Seguimiento",
    title: "Identifica qué sigue en cada operación.",
    description:
      "Consulta las etapas de tus solicitudes y los pendientes que necesitan tu atención.",
  },
  {
    key: "clientes",
    label: "Clientes",
    title: "Tu cartera, organizada y a la mano.",
    description:
      "Localiza clientes, consulta sus operaciones y entra al detalle para dar seguimiento.",
  },
  {
    key: "operaciones",
    label: "Operaciones",
    title: "Cada solicitud, con su avance a la vista.",
    description:
      "Consulta montos, productos y estados de tus operaciones desde un mismo espacio.",
  },
  {
    key: "documentos",
    label: "Documentos",
    title: "Un expediente organizado para avanzar.",
    description:
      "Localiza los archivos de cada cliente y consulta cuáles están validados o requieren revisión.",
  },
  {
    key: "comisiones",
    label: "Comisiones",
    title: "Dale seguimiento también a tu ingreso.",
    description:
      "Consulta el monto y el estado de tus comisiones: generadas, aprobadas y pagadas.",
  },
] as const;

export function PlatformGallery() {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const view = views[index];
  const alt = `Área de ${view.label.toLowerCase()} de la plataforma real, sin menú lateral; datos de demostración.`;
  return (
    <div className="cn-showcase cn-platform-showcase">
      <div className="cn-showcase-head">
        <span className="cn-eyebrow">Así se trabaja en Crédito Negocios</span>
        <h2 style={{ fontSize: "1.65rem" }}>
          Tu próxima operación empieza aquí.
        </h2>
      </div>
      <div
        className="cn-demo-tabs"
        role="group"
        aria-label="Ver pantallas de la plataforma"
      >
        {views.map((item, i) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={i === index}
            aria-controls="demo-panel"
            onClick={() => setIndex(i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id="demo-panel" className="cn-platform-panel" aria-live="polite">
        <button
          className="cn-screen-button"
          type="button"
          aria-label={`Ampliar pantalla de ${view.label.toLowerCase()}`}
          onClick={() => dialog.current?.showModal()}
        >
          <img
            src={`/platform/${view.key}.png`}
            alt={alt}
            width={1152}
            height={940}
          />
          <span>Ampliar pantalla ↗</span>
        </button>
        <div className="cn-platform-description">
          <h3>{view.title}</h3>
          <p>{view.description}</p>
        </div>
      </div>
      <p className="cn-demo-caption">
        Capturas de la plataforma real con datos de demostración. Las funciones
        disponibles dependen de tu rol y esquema de colaboración.
      </p>
      <dialog
        ref={dialog}
        className="cn-screen-dialog"
        aria-labelledby="screen-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="cn-screen-dialog-head">
          <div>
            <h2 id="screen-title">{view.label}</h2>
            <p>Plataforma real · Datos de demostración</p>
          </div>
          <button
            className="cn-button cn-button--outline"
            type="button"
            onClick={() => dialog.current?.close()}
          >
            Cerrar
          </button>
        </div>
        <div className="cn-screen-scroll">
          <img
            src={`/platform/${view.key}.png`}
            alt={alt}
            width={1152}
            height={940}
          />
        </div>
      </dialog>
    </div>
  );
}
