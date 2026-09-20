import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const upcomingFeatures = [
  {
    title: "Calculadora de Créditos",
    description: "Simulación de escenarios de financiamiento, CAT y amortización para prospectos.",
    icon: "fas fa-calculator",
    iconColor: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    title: "Escáner OCR de Expedientes",
    description: "Extracción automática de datos desde constancias de situación fiscal y estados de cuenta.",
    icon: "fas fa-file-invoice",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    title: "Portal del Cliente",
    description: "Espacio de autogestión remota y carga documental directa para solicitantes.",
    icon: "fas fa-user-shield",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-500/10",
  },
  {
    title: "Adelanto de Comisión",
    description: "Dispersión anticipada de comisiones operadas sobre créditos aprobados.",
    icon: "fas fa-bolt",
    iconColor: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/10",
  },
];

export default function QuickActionsGrid() {
  return (
    <Card className="border border-border/70 bg-card/60 shadow-2xs" data-testid="upcoming-features-card">
      <CardHeader className="p-4 pb-2 border-b border-border/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CardTitle className="text-sm font-semibold text-foreground tracking-tight">
              Lo que viene en Crédito Negocios
            </CardTitle>
            <span className="text-[11px] text-muted-foreground">
              (Evolución del producto y próximas herramientas operativas)
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/60 font-normal">
            Hoja de ruta
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {upcomingFeatures.map((feature, index) => (
            <div
              key={index}
              className="border border-border/50 rounded-md p-3 bg-muted/15 flex flex-col justify-between"
              data-testid={`quick-action-${index}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${feature.bgColor}`}>
                    <i className={`${feature.icon} ${feature.iconColor} text-xs`}></i>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[9px] uppercase tracking-wider font-medium text-muted-foreground border-border/60 bg-muted/40 px-1.5 py-0"
                  >
                    Próximamente
                  </Badge>
                </div>
                <h4 className="text-xs font-semibold text-foreground mb-1" data-testid={`action-title-${index}`}>
                  {feature.title}
                </h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed" data-testid={`action-description-${index}`}>
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
