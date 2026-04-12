import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductVariable } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProductVariableForm from "./ProductVariableForm";

const typeConfig = {
  text: { label: "Texto", icon: "fas fa-font", color: "bg-blue-100 text-blue-600" },
  number: { label: "Número", icon: "fas fa-hashtag", color: "bg-green-100 text-green-600" },
  select: { label: "Selección", icon: "fas fa-list", color: "bg-purple-100 text-purple-600" },
  multiple_select: { label: "Multi-selección", icon: "fas fa-check-double", color: "bg-orange-100 text-orange-600" },
  range: { label: "Rango", icon: "fas fa-arrows-alt-h", color: "bg-red-100 text-red-600" },
  date: { label: "Fecha", icon: "fas fa-calendar", color: "bg-indigo-100 text-indigo-600" },
  boolean: { label: "Sí/No", icon: "fas fa-toggle-on", color: "bg-gray-100 text-gray-600" }
};

const categoryConfig = {
  basic: { label: "Básico", color: "bg-blue-50 text-blue-700" },
  financial: { label: "Financiero", color: "bg-green-50 text-green-700" },
  requirements: { label: "Requisitos", color: "bg-purple-50 text-purple-700" }
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
                         variable.description?.toLowerCase().includes(searchTerm.toLowerCase());
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
    if (confirm(`¿Estás seguro de que deseas eliminar la variable "${variable.name}"?`)) {
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
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Variables del Producto</h2>
          <p className="text-gray-600">Administra el catálogo base de variables configurables</p>
        </div>
        <Button 
          onClick={handleNewVariable}
          data-testid="button-new-variable"
        >
          <i className="fas fa-plus mr-2"></i>
          Nueva Variable
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
              <Input
                placeholder="Buscar por nombre o descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search"
                className="placeholder:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
              <select
                className="w-full p-2 border border-gray-200 rounded-md"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                data-testid="select-category"
              >
                <option value="all">Todas las categorías</option>
                <option value="basic">Básico</option>
                <option value="financial">Financiero</option>
                <option value="requirements">Requisitos</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
              <select
                className="w-full p-2 border border-gray-200 rounded-md"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                data-testid="select-type"
              >
                <option value="all">Todos los tipos</option>
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="select">Selección</option>
                <option value="multiple_select">Multi-selección</option>
                <option value="range">Rango</option>
                <option value="date">Fecha</option>
                <option value="boolean">Sí/No</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Variables Grid */}
      {filteredVariables.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <i className="fas fa-search text-4xl text-gray-300 mb-4"></i>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No se encontraron variables
              </h3>
              <p className="text-neutral mb-4">
                No hay variables que coincidan con los filtros seleccionados.
              </p>
              <Button onClick={handleNewVariable}>
                <i className="fas fa-plus mr-2"></i>
                Crear Primera Variable
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVariables.map(variable => {
            const typeInfo = typeConfig[variable.dataType as keyof typeof typeConfig] || typeConfig.text;
            const categoryInfo = categoryConfig[variable.category as keyof typeof categoryConfig] || categoryConfig.basic;
            const config = (variable.options as any) || {};

            return (
              <Card key={variable.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <span data-testid={`text-variable-name-${variable.id}`}>
                          {variable.displayName || variable.name}
                        </span>
                      </CardTitle>
                      {variable.description && (
                        <p className="text-sm text-gray-600 mt-1">{variable.description}</p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge className={typeInfo?.color || "bg-gray-100 text-gray-600"}>
                        <i className={`${typeInfo?.icon || "fas fa-question"} mr-1`}></i>
                        {typeInfo?.label || "Desconocido"}
                      </Badge>
                      <Badge variant="outline" className={categoryInfo?.color || "bg-gray-50 text-gray-700"}>
                        {categoryInfo?.label || "Básico"}
                      </Badge>
                    </div>

                    {/* Configuration Preview */}
                    <div className="text-xs text-gray-500 space-y-1">
                      {variable.dataType === 'select' || variable.dataType === 'multiple_select' ? (
                        <div>
                          <span className="font-medium">Opciones:</span> {(Array.isArray(config) ? config : []).slice(0, 3).join(", ")}
                          {(Array.isArray(config) ? config : []).length > 3 && "..."}
                        </div>
                      ) : variable.dataType === 'range' ? (
                        <div>
                          <span className="font-medium">Rango:</span> {variable.minValue || 'N/A'} - {variable.maxValue || 'N/A'}
                        </div>
                      ) : variable.dataType === 'number' ? (
                        <div>
                          <span className="font-medium">Tipo:</span> Numérico
                        </div>
                      ) : null}
                    </div>

                    <div className="flex space-x-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditVariable(variable)}
                        data-testid={`button-edit-${variable.id}`}
                        className="flex-1"
                      >
                        <i className="fas fa-edit mr-1"></i>
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteVariable(variable)}
                        data-testid={`button-delete-${variable.id}`}
                        className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input hover:bg-accent h-9 rounded-md px-3 hover:text-red-700 text-[#f6f9fc] bg-[#f51e05]"
                      >
                        <i className="fas fa-trash"></i>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Variable Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingVariable ? 'Editar Variable' : 'Nueva Variable'}
            </DialogTitle>
          </DialogHeader>
          <ProductVariableForm
            variable={editingVariable}
            onSuccess={handleFormSuccess}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}