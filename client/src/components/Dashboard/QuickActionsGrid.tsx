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
  },
  {
    title: "Escáner OCR",
    description: "Extrae información de documentos automáticamente",
    icon: "fas fa-scan",
    iconColor: "text-secondary",
    bgColor: "bg-green-100",
    action: "Escanear documento →",
    actionColor: "text-secondary",
  },
  {
    title: "Portal del Cliente",
    description: "Comparte links seguros para actualización de datos",
    icon: "fas fa-share-alt",
    iconColor: "text-purple-600",
    bgColor: "bg-purple-100",
    action: "Generar link →",
    actionColor: "text-purple-600",
  },
  {
    title: "Adelanto de Comisión",
    description: "Solicita adelantos sobre comisiones futuras",
    icon: "fas fa-bolt",
    iconColor: "text-warning",
    bgColor: "bg-yellow-100",
    action: "Solicitar adelanto →",
    actionColor: "text-warning",
  },
];

export default function QuickActionsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {quickActions.map((action, index) => (
        <Card 
          key={index}
          className="border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
          data-testid={`quick-action-${index}`}
        >
          <CardContent className="p-6">
            <div className={`w-12 h-12 ${action.bgColor} rounded-lg flex items-center justify-center mb-4`}>
              <i className={`${action.icon} ${action.iconColor} text-lg`}></i>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2" data-testid={`action-title-${index}`}>
              {action.title}
            </h3>
            <p className="text-sm text-neutral mb-4" data-testid={`action-description-${index}`}>
              {action.description}
            </p>
            <Button 
              variant="ghost"
              className={`${action.actionColor} font-medium text-sm hover:bg-gray-50 p-0 h-auto`}
              data-testid={`action-button-${index}`}
            >
              {action.action}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
