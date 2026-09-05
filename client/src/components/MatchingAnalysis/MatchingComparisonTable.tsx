import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, AlertCircle, Info, HelpCircle } from "lucide-react";
import {
  evaluateAllFieldsForClient,
  ComparisonField,
} from "./matchingRules";

interface Client {
  [key: string]: any;
}

interface FinancialInstitution {
  id: string;
  name: string;
  requirements?: any;
  acceptedProfiles?: string[];
}

interface MatchingComparisonTableProps {
  client: Client;
  institution: FinancialInstitution;
  productTemplate?: {
    id: string;
    name: string;
  };
  requestedAmount?: number | string;
}

export default function MatchingComparisonTable({
  client,
  institution,
  productTemplate,
  requestedAmount
}: MatchingComparisonTableProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'pass' | 'warning' | 'info'>('all');

  // Evaluate all 18 fields using the unified matching rules engine
  const matchResult = evaluateAllFieldsForClient(client, institution, requestedAmount);
  const fields = matchResult.fields;

  // Group fields into the 3 canonical categories requested:
  // 1. Compatibles (pass)
  // 2. Advertencias / No cumple (warning or fail with provided client data)
  // 3. Sin datos / Informativo (unprovided client data or informative notes)
  const compatibleFields = fields.filter(f => f.status === 'pass');
  const warningFields = fields.filter(f => (f.status === 'fail' || f.status === 'warning') && f.clientValue !== 'No proporcionado');
  const infoFields = fields.filter(f => f.status === 'info' || f.clientValue === 'No proporcionado');

  const getStatusIcon = (status: string, clientVal?: string) => {
    if (clientVal === 'No proporcionado') {
      return <HelpCircle className="w-4 h-4 text-muted-foreground" />;
    }
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    }
  };

  const getStatusBadge = (status: string, clientVal?: string) => {
    if (clientVal === 'No proporcionado') {
      return <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Sin datos</Badge>;
    }
    switch (status) {
      case 'pass':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300">Cumple</Badge>;
      case 'warning':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300">Advertencia</Badge>;
      case 'fail':
        return <Badge className="bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300">No cumple</Badge>;
      default:
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300">Informativo</Badge>;
    }
  };

  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Info className="w-12 h-12 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-sm">No hay requisitos configurados para este perfil de cliente</p>
      </div>
    );
  }

  const renderFieldsTable = (items: ComparisonField[], tableId: string) => (
    <div className="border rounded-lg overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[30%] text-xs font-semibold uppercase tracking-wider">Campo</TableHead>
            <TableHead className="w-[32%] text-xs font-semibold uppercase tracking-wider">Requisito Financiera</TableHead>
            <TableHead className="w-[23%] text-xs font-semibold uppercase tracking-wider">Dato Cliente</TableHead>
            <TableHead className="w-[15%] text-center text-xs font-semibold uppercase tracking-wider">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((field, index) => (
            <TableRow key={`${tableId}-${field.fieldName}-${index}`} data-testid={`matching-row-${field.fieldName}`}>
              <TableCell className="font-medium text-sm text-foreground">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(field.status, field.clientValue)}
                  <span>{field.label}</span>
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground font-medium">
                {field.requirementValue}
              </TableCell>
              <TableCell className="text-sm text-foreground font-medium">
                {field.clientValue}
              </TableCell>
              <TableCell className="text-center">
                {getStatusBadge(field.status, field.clientValue)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Overview Banner */}
      <div className="bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-2">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-900 dark:text-blue-300">
              <p className="font-semibold mb-0.5">Análisis de Compatibilidad ({matchResult.score}%)</p>
              <p className="text-blue-700 dark:text-blue-400">
                Comparación detallada de los requisitos de la financiera vs. los datos del cliente.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs bg-card border-border font-medium">
            {institution.name}
          </Badge>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-muted/60 rounded-lg border border-border text-xs">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-md font-medium transition-all ${
            activeFilter === 'all'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Todos ({fields.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('pass')}
          className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center space-x-1.5 ${
            activeFilter === 'pass'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Compatibles ({compatibleFields.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('warning')}
          className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center space-x-1.5 ${
            activeFilter === 'warning'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Advertencias ({warningFields.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('info')}
          className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center space-x-1.5 ${
            activeFilter === 'info'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Sin datos ({infoFields.length})</span>
        </button>
      </div>

      {/* Grouped Content Sections */}
      <div className="space-y-4">
        {/* Section 1: ✅ Compatibles */}
        {(activeFilter === 'all' || activeFilter === 'pass') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h4 className="font-semibold text-sm text-emerald-900 dark:text-emerald-300">
                  Requisitos Compatibles ({compatibleFields.length})
                </h4>
              </div>
              <span className="text-xs text-muted-foreground">El cliente cumple plenamente</span>
            </div>
            {compatibleFields.length > 0 ? (
              renderFieldsTable(compatibleFields, 'compatible')
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                No hay campos evaluados que cumplan actualmente
              </div>
            )}
          </div>
        )}

        {/* Section 2: ⚠️ Advertencias / No cumple */}
        {(activeFilter === 'all' || activeFilter === 'warning') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-300">
                  Advertencias y Requisitos No Cumplidos ({warningFields.length})
                </h4>
              </div>
              <span className="text-xs text-muted-foreground">Requieren revisión o ajuste</span>
            </div>
            {warningFields.length > 0 ? (
              renderFieldsTable(warningFields, 'warning')
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                Ninguna advertencia detectada en los datos proporcionados
              </div>
            )}
          </div>
        )}

        {/* Section 3: ℹ️ Sin datos / Informativo */}
        {(activeFilter === 'all' || activeFilter === 'info') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-300">
                  Sin Datos / Información Adicional ({infoFields.length})
                </h4>
              </div>
              <span className="text-xs text-muted-foreground">Datos no provistos o notas informativas</span>
            </div>
            {infoFields.length > 0 ? (
              renderFieldsTable(infoFields, 'info')
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                No hay campos sin información ni notas adicionales
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Stats Footer */}
      <div className="flex items-center justify-between bg-muted/40 border border-border rounded-lg p-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center space-x-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">{compatibleFields.length}</strong> Cumple
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">{warningFields.length}</strong> Advertencias
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">{infoFields.length}</strong> Sin datos / Notas
            </span>
          </div>
        </div>
        <div className="text-muted-foreground font-medium">
          Total: {fields.length} campos evaluados ({matchResult.score}% compatibilidad)
        </div>
      </div>
    </div>
  );
}
