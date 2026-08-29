import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const quickActions = [
  {
    title: "Calculadora de Créditos",
    description: "Simula diferentes escenarios para tus clientes",
    icon: "fas fa-calculator",
    iconColor: "text-primary",
    bgColor: "bg-blue-100",
    action: "Abrir calculadora →",
    actionColor: "text-primary",
    featureName: "Calculadora de Créditos",
  },
  {
    title: "Escáner OCR",
    description: "Extrae información de documentos automáticamente",
    icon: "fas fa-scan",
    iconColor: "text-secondary",
    bgColor: "bg-green-100",
    action: "Escanear documento →",
    actionColor: "text-secondary",
    featureName: "Escáner OCR de documentos",
  },
  {
    title: "Portal del Cliente",
    description: "Comparte links seguros para actualización de datos",
    icon: "fas fa-share-alt",
    iconColor: "text-purple-600",
    bgColor: "bg-purple-100",
    action: "Generar link →",
    actionColor: "text-purple-600",
    featureName: "Portal Autónomo de Clientes",
  },
  {
    title: "Adelanto de Comisión",
    description: "Solicita adelantos sobre comisiones futuras",
    icon: "fas fa-bolt",
    iconColor: "text-warning",
    bgColor: "bg-yellow-100",
    action: "Solicitar adelanto →",
    actionColor: "text-warning",
    featureName: "Adelanto de Comisiones",
  },
];

export default function QuickActionsGrid() {
  const handleFeatureClick = (featureName: string) => {
    alert(`⏳ Próximamente\n\nLa función "${featureName}" estará disponible muy pronto. Estamos finalizando los detalles para ofrecerte la mejor experiencia.`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {quickActions.map((action, index) => (
        <Card 
          key={index}
          className="border border-gray-200 hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden"
          onClick={() => handleFeatureClick(action.featureName)}
          data-testid={`quick-action-${index}`}
        >
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className={`w-12 h-12 ${action.bgColor} rounded-lg flex items-center justify-center`}>
                <i className={`${action.icon} ${action.iconColor} text-lg`}></i>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded-full">
                Próximamente
              </span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2" data-testid={`action-title-${index}`}>
              {action.title}
            </h3>
            <p className="text-sm text-neutral mb-4 animate-pulse-slow" data-testid={`action-description-${index}`}>
              {action.description}
            </p>
            <Button 
              variant="ghost"
              className={`${action.actionColor} font-medium text-sm hover:bg-gray-50 p-0 h-auto`}
              data-testid={`action-button-${index}`}
              onClick={(e) => {
                e.stopPropagation();
                handleFeatureClick(action.featureName);
              }}
            >
              {action.action}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

