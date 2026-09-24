import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Type, 
  Hash, 
  List, 
  CheckSquare, 
  ArrowLeftRight, 
  Calendar, 
  ToggleLeft, 
  Sliders, 
  Plus, 
  Search, 
  Edit, 
  Trash2,
  SlidersHorizontal
} from "lucide-react";
import { ProductVariable } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProductVariableForm from "./ProductVariableForm";

const typeConfig: Record<string, { label: string; icon: any; color: string }> = {
  text: { label: "Texto", icon: Type, color: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60" },
  number: { label: "Número", icon: Hash, color: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60" },
  select: { label: "Selección", icon: List, color: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60" },
  multiple_select: { label: "Multi-selección", icon: CheckSquare, color: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60" },
  range: { label: "Rango", icon: ArrowLeftRight, color: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60" },
  date: { label: "Fecha", icon: Calendar, color: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60" },
  boolean: { label: "Sí/No", icon: ToggleLeft, color: "bg-muted text-muted-foreground border-border" }
};

const categoryConfig: Record<string, { label: string; color: string }> = {
  basic: { label: "Básico", color: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60" },
  financial: { label: "Financiero", color: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60" },
  requirements: { label: "Requisitos", color: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60" }
};

export default function ProductVariables() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingVariable, setEditingVariable] = useState<ProductVariable | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: variables, isLoading } = useQuery<ProductVariable[]>({
    queryKey: ["/api/product-variables"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (variableId: string) => {
      await apiRequest("DELETE", `/api/product-variables/${variableId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-variables"] });
      toast({
        title: "Variable eliminada",
        description: "La variable del producto se eliminó correctamente",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al eliminar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredVariables = variables?.filter(variable => {
    const matchesSearch = variable.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (variable.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
                         (variable.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesCategory = filterCategory === "all" || variable.category === filterCategory;
    const matchesType = filterType === "all" || variable.dataType === filterType;
    
    return matchesSearch && matchesCategory && matchesType;
  }) || [];

  const handleNewVariable = () => {
    setEditingVariable(null);
    setShowForm(true);
  };

  const handleEditVariable = (variable: ProductVariable) => {
    setEditingVariable(variable);
    setShowForm(true);
  };

  const handleDeleteVariable = (variable: ProductVariable) => {
    if (confirm(`¿Estás seguro de que deseas eliminar la variable "${variable.displayName || variable.name}"?`)) {
      deleteMutation.mutate(variable.id);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingVariable(null);
    queryClient.invalidateQueries({ queryKey: ["/api/product-variables"] });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            Variables del Producto
          </h3>
          <p className="text-xs text-muted-foreground">Catálogo de parámetros y campos configurables por producto</p>
        </div>
        <Button 
          onClick={handleNewVariable}
          data-testid="button-new-variable"
          className="h-8 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva Variable
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="border border-border shadow-sm bg-card">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Buscar</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre o descripción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search"
                  className="pl-9 h-8 text-xs border-border rounded-lg placeholder:text-muted-foreground bg-background"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Categoría</label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger data-testid="select-category" className="h-8 text-xs border-border rounded-lg bg-background">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todas las categorías</SelectItem>
                  <SelectItem value="basic" className="text-xs">Básico</SelectItem>
                  <SelectItem value="financial" className="text-xs">Financiero</SelectItem>
                  <SelectItem value="requirements" className="text-xs">Requisitos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Tipo de Dato</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger data-testid="select-type" className="h-8 text-xs border-border rounded-lg bg-background">
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todos los tipos</SelectItem>
                  <SelectItem value="text" className="text-xs">Texto</SelectItem>
                  <SelectItem value="number" className="text-xs">Número</SelectItem>
                  <SelectItem value="select" className="text-xs">Selección</SelectItem>
                  <SelectItem value="multiple_select" className="text-xs">Multi-selección</SelectItem>
                  <SelectItem value="range" className="text-xs">Rango</SelectItem>
                  <SelectItem value="date" className="text-xs">Fecha</SelectItem>
                  <SelectItem value="boolean" className="text-xs">Sí/No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Variables Operational Table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {filteredVariables.length === 0 ? (
          <div className="text-center py-10 px-4 bg-muted/20">
            <Sliders className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <h4 className="text-xs font-semibold text-foreground">
              No se encontraron variables
            </h4>
            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto mb-3 mt-0.5">
              {variables && variables.length > 0
                ? "No hay variables que coincidan con los filtros seleccionados."
                : "Comienza creando la primera variable configurable para las plantillas."}
            </p>
            {(!variables || variables.length === 0) && (
              <Button 
                onClick={handleNewVariable} 
                className="h-7 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Crear Primera Variable
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-2.5 px-4">Variable / Campo</th>
                  <th className="py-2.5 px-3">Tipo de Dato</th>
                  <th className="py-2.5 px-3">Categoría</th>
                  <th className="py-2.5 px-3">Regla / Parámetros</th>
                  <th className="py-2.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredVariables.map(variable => {
                  const typeInfo = typeConfig[variable.dataType as keyof typeof typeConfig] || typeConfig.text;
                  const TypeIcon = typeInfo.icon || Type;
                  const categoryInfo = categoryConfig[variable.category as keyof typeof categoryConfig] || categoryConfig.basic;
                  const config = (variable.options as any) || {};

                  return (
                    <tr 
                      key={variable.id} 
                      className="hover:bg-muted/30 transition-colors"
                      data-testid={`variable-row-${variable.id}`}
                    >
                      {/* Name & Display */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex items-center gap-2">
                          <div>
                            <span 
                              className="font-semibold text-foreground block leading-tight text-xs"
                              data-testid={`text-variable-name-${variable.id}`}
                            >
                              {variable.displayName || variable.name}
                            </span>
                            <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
                              {variable.name}
                            </span>
                            {variable.description && (
                              <span className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                {variable.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] font-semibold gap-1 py-0.5 px-2 ${typeInfo.color}`}
                        >
                          <TypeIcon className="w-3 h-3" />
                          {typeInfo.label}
                        </Badge>
                      </td>

                      {/* Category Badge */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] font-medium py-0.5 px-2 ${categoryInfo.color}`}
                        >
                          {categoryInfo.label}
                        </Badge>
                      </td>

                      {/* Parameters / Details */}
                      <td className="py-3 px-3 text-[11px] text-muted-foreground">
                        {variable.dataType === 'select' || variable.dataType === 'multiple_select' ? (
                          <span className="truncate max-w-xs block" title={Array.isArray(config) ? config.join(", ") : ""}>
                            <strong className="font-semibold text-foreground">Opciones: </strong> 
                            {(Array.isArray(config) ? config : []).slice(0, 3).join(", ")}
                            {(Array.isArray(config) ? config : []).length > 3 && ` (+${(config as any[]).length - 3})`}
                          </span>
                        ) : variable.dataType === 'range' ? (
                          <span>
                            <strong className="font-semibold text-foreground">Rango: </strong>
                            {variable.minValue ?? '0'} — {variable.maxValue ?? '∞'} {variable.unit || ''}
                          </span>
                        ) : variable.dataType === 'number' ? (
                          <span>
                            <strong className="font-semibold text-foreground">Unidad: </strong> 
                            {variable.unit || 'Sin unidad'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">Estándar</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditVariable(variable)}
                            data-testid={`button-edit-${variable.id}`}
                            className="h-7 text-xs px-2.5 font-semibold text-foreground border-border hover:bg-muted rounded-lg"
                          >
                            <Edit className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteVariable(variable)}
                            data-testid={`button-delete-${variable.id}`}
                            className="h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 rounded-lg"
                            title="Eliminar variable"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Variable Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="text-base font-bold text-foreground">
              {editingVariable ? 'Editar Variable' : 'Nueva Variable'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Configura los atributos y reglas para este parámetro de catálogo.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <ProductVariableForm
              variable={editingVariable}
              onSuccess={handleFormSuccess}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}