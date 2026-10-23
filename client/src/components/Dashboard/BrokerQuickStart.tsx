import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextualHelpLink } from "@/components/Help/ContextualHelpLink";

const highlights = [
  {
    label: "1. Registra un prospecto",
    description: "Empieza con nombre y teléfono o correo. Elige empresarial, hipotecario o arrendamiento."
  },
  {
    label: "2. Captura su necesidad",
    description: "Desde su ficha registra monto y tipo de financiamiento; completa el perfil cuando lo necesites."
  },
  {
    label: "3. Sigue la operación",
    description: "Consulta opciones y avances en Gestión de Créditos. La financiera evalúa cada solicitud."
  }
];

export default function BrokerQuickStart({ userId }: { userId: string }) {
  const [, setLocation] = useLocation();
  const storageKey = "brokerQuickStart:dismissed:" + userId;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey) === "true"; }
    catch { return false; }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(storageKey, "true"); } catch { /* private browsing */ }
    setDismissed(true);
  };

  return (
    <section
      aria-label="Cómo empezar a trabajar"
      data-testid="broker-quick-start"
      className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-bold text-foreground">Empieza tu primera operación</p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Tres pasos para pasar de un contacto a una solicitud de financiamiento.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-1.5 hover:bg-muted text-muted-foreground"
          aria-label="Ocultar guía de primeros pasos"
          data-testid="button-dismiss-quick-start"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {highlights.map(item => (
          <div key={item.label} className="rounded-lg bg-background/90 border border-border/70 p-3">
            <p className="text-sm font-semibold flex gap-2 items-center">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />{item.label}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{item.description}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" className="gap-2" onClick={() => setLocation("/clientes")} data-testid="button-start-first-prospect">
          Registrar prospecto <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <ContextualHelpLink
          slug="como-registro-un-cliente"
          label="¿Cómo funciona?"
          variant="inline"
          className="text-xs gap-1.5"
        />
      </div>
    </section>
  );
}
