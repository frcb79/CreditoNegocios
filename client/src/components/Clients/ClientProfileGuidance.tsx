import type { Client } from "@shared/schema";
import { ClipboardList, Info, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProfileEnrichmentSuggestions } from "@/lib/clientProfileGuidance";

export default function ClientProfileGuidance({ client, onEdit }: {
  client: Client;
  onEdit: () => void;
}) {
  const suggestions = getProfileEnrichmentSuggestions(client);
  return (
    <section
      className="rounded-xl border border-border/80 bg-card px-4 py-3 sm:p-4 shadow-xs space-y-3"
      data-testid="client-profile-guidance"
      aria-labelledby="profile-guidance-title"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <ClipboardList className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
          <div className="min-w-0">
            <h2 id="profile-guidance-title" className="font-semibold text-sm">Información que puede mejorar el perfil</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Sugerencias de datos faltantes, no requisitos obligatorios. Cada oferta publicada determinará su propia compatibilidad.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" type="button" onClick={onEdit} data-testid="button-enrich-profile">
          Completar perfil <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Información adicional no proporcionada">
          {suggestions.map(label => (
            <Badge key={label} variant="outline" className="font-normal text-xs px-2 py-1 max-w-full whitespace-normal text-left">
              {label}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Los datos generales de referencia están presentes. Una financiera podría solicitar información adicional para una operación específica.</p>
      )}
      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        No calculamos porcentajes de elegibilidad sin condiciones verificadas del producto; cuando falten variables para matching se indicará información insuficiente.
      </p>
    </section>
  );
}
