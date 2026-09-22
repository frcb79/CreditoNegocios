import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Trash2, Edit, Plus, Eye, Search, Layers } from "lucide-react";

// Form schema for ProductTemplate
const productTemplateSchema = z.object({
  name: z.string().min(1, "Nombre es requerido"),
  description: z.string().optional(),
  category: z.string().optional(),
  targetProfiles: z.array(z.string()).min(1, "Selecciona al menos un perfil de cliente"),
  availableVariables: z.record(z.any()).optional(),
  baseConfiguration: z.record(z.any()).optional(),
  isActive: z.boolean().default(true),
});

type ProductTemplateFormData = z.infer<typeof productTemplateSchema>;

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  targetProfiles: string[];
  availableVariables: Record<string, any>;
  baseConfiguration: Record<string, any>;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductVariable {
  id: string;
  name: string;
  type: string;
  category: string;
}

// Helper function to translate category values to display names
const getCategoryDisplayName = (category: string | null): string => {
  if (!category) return "";
  const categoryMap: Record<string, string> = {
    "persona_moral": "PM",
    "fisica_empresarial": "PFAE",
    "fisica": "PF",
    "sin_sat": "Sin SAT"
  };
  return categoryMap[category] || category;
};

// Helper function to get badge color classes for each category
const getCategoryBadgeColor = (category: string): string => {
  const colorMap: Record<string, string> = {
    "persona_moral": "bg-blue-100 text-blue-700 border-blue-300",
    "fisica_empresarial": "bg-green-100 text-green-700 border-green-300",
    "fisica": "bg-orange-100 text-orange-700 border-orange-300",
    "sin_sat": "bg-gray-100 text-gray-700 border-gray-300"
  };
  return colorMap[category] || "bg-gray-100 text-gray-700 border-gray-300";
};

export default function ProductTemplates() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProductTemplate | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const { toast } = useToast();

  // Fetch product templates
  const { data: templates, isLoading } = useQuery<ProductTemplate[]>({
    queryKey: ['/api/product-templates'],
  });

  // Fetch product variables for the form
  const { data: variables } = useQuery<ProductVariable[]>({
    queryKey: ['/api/product-variables'],
  });

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: (data: ProductTemplateFormData) =>
      apiRequest('POST', '/api/product-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/product-templates'] });
      setIsDialogOpen(false);
      setEditingTemplate(null);
      toast({
        title: "Plantilla creada",
        description: "La plantilla de producto ha sido creada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la plantilla.",
        variant: "destructive",
      });
    },
  });

  // Update template mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductTemplateFormData }) =>
      apiRequest('PUT', `/api/product-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/product-templates'] });
      setIsDialogOpen(false);
      setEditingTemplate(null);
      toast({
        title: "Plantilla actualizada",
        description: "La plantilla de producto ha sido actualizada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la plantilla.",
        variant: "destructive",
      });
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest('DELETE', `/api/product-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/product-templates'] });
      toast({
        title: "Plantilla eliminada",
        description: "La plantilla de producto ha sido eliminada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la plantilla.",
        variant: "destructive",
      });
    },
  });

  // Form setup
  const form = useForm<ProductTemplateFormData>({
    resolver: zodResolver(productTemplateSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      targetProfiles: [],
      availableVariables: {},
      baseConfiguration: {},
      isActive: true,
    },
  });

  // Handle form submission
  const onSubmit = (data: ProductTemplateFormData) => {
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Handle edit
  const handleEdit = (template: ProductTemplate) => {
    setEditingTemplate(template);
    form.reset({
      name: template.name,
      description: template.description || "",
      category: template.category || "",
      targetProfiles: template.targetProfiles || [],
      availableVariables: template.availableVariables,
      baseConfiguration: template.baseConfiguration,
      isActive: template.isActive,
    });
    setIsDialogOpen(true);
  };

  // Handle new template
  const handleNew = () => {
    setEditingTemplate(null);
    form.reset({
      name: "",
      description: "",
      category: "",
      targetProfiles: [],
      availableVariables: {},
      baseConfiguration: {},
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  // Filter templates
  const filteredTemplates = templates?.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesCategory = filterCategory === "all" || 
                           (template.targetProfiles && template.targetProfiles.includes(filterCategory));
    const matchesStatus = filterStatus === "all" || 
                         (filterStatus === "active" && template.isActive) ||
                         (filterStatus === "inactive" && !template.isActive);
    
    return matchesSearch && matchesCategory && matchesStatus;
  }) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Plantillas de Productos</h2>
          <p className="text-gray-600">Gestiona plantillas genéricas de productos crediticios</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNew} data-testid="button-new-template">
              <Plus className="mr-2 h-4 w-4" />
              Nueva Plantilla
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}
              </DialogTitle>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Información Básica</h3>
                    
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Ej: Crédito PYME Básico" 
                              {...field} 
                              data-testid="input-template-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Describe el propósito de esta plantilla..."
                              {...field}
                              data-testid="input-template-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="targetProfiles"
                      render={() => (
                        <FormItem>
                          <div className="mb-4">
                            <FormLabel className="text-base">Perfiles de Cliente *</FormLabel>
                            <p className="text-sm text-gray-500">Selecciona uno o más perfiles</p>
                          </div>
                          <div className="space-y-2">
                            {[
                              { value: "persona_moral", label: "Persona Moral (PM)" },
                              { value: "fisica_empresarial", label: "Persona Física con Actividad Empresarial (PFAE)" },
                              { value: "fisica", label: "Persona Física (PF)" },
                              { value: "sin_sat", label: "Sin SAT" },
                            ].map((profile) => (
                              <FormField
                                key={profile.value}
                                control={form.control}
                                name="targetProfiles"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={profile.value}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(profile.value)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...field.value, profile.value])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (value: string) => value !== profile.value
                                                  )
                                                )
                                          }}
                                          data-testid={`checkbox-profile-${profile.value}`}
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal">
                                        {profile.label}
                                      </FormLabel>
                                    </FormItem>
                                  )
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-template-active"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Plantilla activa</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Required Variables */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Variables Requeridas</h3>
                    
                    {variables && variables.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-4">
                        {variables.map((variable) => (
                          <FormField
                            key={variable.id}
                            control={form.control}
                            name="availableVariables"
                            render={({ field }) => {
                              const currentVariables = field.value || {};
                              return (
                                <FormItem
                                  key={variable.id}
                                  className="flex flex-row items-start space-x-3 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={!!currentVariables[variable.id]}
                                      onCheckedChange={(checked) => {
                                        const newVariables = { ...currentVariables };
                                        if (checked) {
                                          newVariables[variable.id] = true;
                                        } else {
                                          delete newVariables[variable.id];
                                        }
                                        field.onChange(newVariables);
                                      }}
                                      data-testid={`checkbox-variable-${variable.id}`}
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel className="text-sm font-medium">
                                      {variable.name}
                                    </FormLabel>
                                    <p className="text-xs text-gray-500">
                                      {variable.category} • {variable.type}
                                    </p>
                                  </div>
                                </FormItem>
                              )
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No hay variables disponibles</p>
                    )}
                  </div>
                </div>

                {/* Submit buttons */}
                <div className="flex justify-end space-x-2 pt-6 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    data-testid="button-cancel-template"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-template"
                  >
                    {editingTemplate ? "Actualizar" : "Crear"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="border border-slate-200/80 shadow-xs bg-white">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Buscar</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar por nombre o descripción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-templates"
                  className="pl-9 h-8 text-xs border-slate-200 rounded-lg placeholder:text-slate-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Perfil de Cliente</label>
              <Select
                value={filterCategory}
                onValueChange={(value) => setFilterCategory(value)}
              >
                <SelectTrigger data-testid="select-category-filter" className="h-8 text-xs border-slate-200 rounded-lg">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  <SelectItem value="persona_moral">Persona Moral (PM)</SelectItem>
                  <SelectItem value="fisica_empresarial">PFAE</SelectItem>
                  <SelectItem value="fisica">Persona Física (PF)</SelectItem>
                  <SelectItem value="sin_sat">Sin SAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Estado</label>
              <Select
                value={filterStatus}
                onValueChange={(value) => setFilterStatus(value)}
              >
                <SelectTrigger data-testid="select-status-filter" className="h-8 text-xs border-slate-200 rounded-lg">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="active">Activas</SelectItem>
                  <SelectItem value="inactive">Inactivas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates Compact Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
        {filteredTemplates && filteredTemplates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Plantilla / Esquema</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  <th className="py-3 px-3">Perfiles Objetivo</th>
                  <th className="py-3 px-3">Variables y Parámetros</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredTemplates.map((template) => {
                  const varsCount = template.availableVariables ? Object.keys(template.availableVariables).length : 0;
                  const configCount = template.baseConfiguration ? Object.keys(template.baseConfiguration).length : 0;

                  return (
                    <tr 
                      key={template.id} 
                      className={`transition-colors hover:bg-slate-50/70 ${!template.isActive ? 'bg-slate-50/30 opacity-75' : ''}`}
                      data-testid={`template-row-${template.id}`}
                    >
                      {/* Name & Description */}
                      <td className="py-3 px-4 max-w-sm">
                        <span 
                          className="font-semibold text-slate-900 block leading-tight text-sm truncate"
                          data-testid={`text-template-name-${template.id}`}
                          title={template.name}
                        >
                          {template.name}
                        </span>
                        {template.description ? (
                          <span 
                            className="text-[11px] text-slate-500 line-clamp-1 mt-0.5"
                            data-testid={`text-template-description-${template.id}`}
                            title={template.description}
                          >
                            {template.description}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Sin descripción</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <Badge 
                          variant="outline" 
                          className={template.isActive 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold" 
                            : "bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-semibold"}
                        >
                          {template.isActive ? "Activa" : "Inactiva"}
                        </Badge>
                      </td>

                      {/* Target Profiles */}
                      <td className="py-3 px-3">
                        {template.targetProfiles && template.targetProfiles.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {template.targetProfiles.map((profile) => (
                              <Badge 
                                key={profile}
                                variant="outline" 
                                className={`text-[10px] px-1.5 py-0.2 font-medium ${getCategoryBadgeColor(profile)}`}
                                data-testid={`badge-profile-${profile}-${template.id}`}
                              >
                                {getCategoryDisplayName(profile)}
                              </Badge>
                            ))}
                          </div>
                        ) : template.category ? (
                          <Badge variant="outline" className="text-[10px]">
                            {getCategoryDisplayName(template.category)}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Todos</span>
                        )}
                      </td>

                      {/* Variables & Configuration */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-600 text-[11px]">
                        <span className="font-semibold text-slate-800">{varsCount}</span> variables
                        <span className="text-slate-300 mx-1.5">•</span>
                        <span className="font-semibold text-slate-800">{configCount}</span> parámetros
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(template)}
                            data-testid={`button-edit-template-${template.id}`}
                            className="h-7 text-xs px-2.5 font-semibold text-slate-700 border-slate-200 hover:bg-slate-50"
                          >
                            <Edit className="h-3.5 w-3.5 mr-1" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteMutation.mutate(template.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-template-${template.id}`}
                            className="h-7 text-xs px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                            title="Eliminar plantilla"
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
        ) : (
          <div className="text-center py-12 px-4 bg-slate-50/50">
            <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-800">
              {templates && templates.length > 0 
                ? 'No se encontraron plantillas' 
                : 'No hay plantillas'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-3">
              {templates && templates.length > 0
                ? 'No hay plantillas que coincidan con los filtros seleccionados'
                : 'Crea tu primera plantilla de producto para comenzar el catálogo'}
            </p>
            {(!templates || templates.length === 0) && (
              <Button onClick={handleNew} data-testid="button-first-template" className="h-8 text-xs font-semibold bg-slate-900 text-white gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Crear Primera Plantilla
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}