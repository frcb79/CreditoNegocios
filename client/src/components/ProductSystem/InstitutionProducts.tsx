import { useState } from "react";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Building2, FileText, Settings, DollarSign, Trash2, Package, CheckCircle, XCircle } from "lucide-react";

// Helper function to translate category values to display names
const getCategoryDisplayName = (category: string | null | undefined): string => {
  if (!category) return "";
  const categoryMap: Record<string, string> = {
    "persona_moral": "PM",
    "fisica_empresarial": "PFAE",
    "fisica": "PF",
    "sin_sat": "Sin SAT"
  };
  return categoryMap[category] || category;
};

interface ProductTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  targetProfiles: string[];
  baseVariables: any[];
}

interface FinancialInstitution {
  id: string;
  name: string;
  contactPerson: string;
  isActive: boolean;
  acceptedProfiles?: string[];
}

interface InstitutionProduct {
  id: string;
  templateId: string;
  institutionId: string;
  name: string;
  description: string;
  customVariables: any[];
  isActive: boolean;
  targetProfiles?: string[];
  template?: ProductTemplate;
  institution?: FinancialInstitution;
  customData?: {
    commissions?: {
      baseCommission: string;
      approvalCommission: string;
      disbursementCommission: string;
      adminFees: string;
    };
    requirements?: {
      selected: string[];
      custom: Array<{
        id: string;
        label: string;
        type: string;
        required: boolean;
        options?: string[];
      }>;
    };
  };
}

const assignProductSchema = z.object({
  templateId: z.string().min(1, "Selecciona una plantilla"),
  institutionIds: z.array(z.string()).min(1, "Selecciona al menos una financiera"),
  customName: z.string().optional(), // Usar customName en lugar de name
  configuration: z.any().optional(),
  activeVariables: z.any().optional(),
});

type AssignProductForm = z.infer<typeof assignProductSchema>;

export default function InstitutionProducts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InstitutionProduct | null>(null);

  // Fetch data
  const { data: templates, isLoading: templatesLoading } = useQuery<ProductTemplate[]>({
    queryKey: ['/api/product-templates'],
  });

  const { data: institutions, isLoading: institutionsLoading } = useQuery<FinancialInstitution[]>({
    queryKey: ['/api/financial-institutions'],
  });

  const { data: institutionProducts, isLoading: productsLoading } = useQuery<InstitutionProduct[]>({
    queryKey: ['/api/institution-products'],
  });

  // Form setup
  const form = useForm<AssignProductForm>({
    resolver: zodResolver(assignProductSchema),
    defaultValues: {
      templateId: "",
      institutionIds: [],
      customName: "",
    },
  });

  // Watch for template and institution selection to auto-populate name
  const selectedTemplateId = form.watch("templateId");
  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);
  const selectedInstitutionIds = form.watch("institutionIds");
  const selectedInstitutions = institutions?.filter(i => selectedInstitutionIds.includes(i.id));

  // Auto-populate customName when template and institutions are selected
  React.useEffect(() => {
    if (selectedTemplate && selectedInstitutions && selectedInstitutions.length > 0 && !form.getValues("customName")) {
      if (selectedInstitutions.length === 1) {
        form.setValue("customName", `${selectedInstitutions[0].name} ${selectedTemplate.name}`);
      } else {
        form.setValue("customName", `${selectedTemplate.name} (${selectedInstitutions.length} financieras)`);
      }
    }
  }, [selectedTemplate, selectedInstitutions, form]);

  // Assign product mutation (handles multiple institutions)
  const assignProductMutation = useMutation({
    mutationFn: async (data: AssignProductForm) => {
      // Create multiple assignments - one for each selected institution
      const assignments = data.institutionIds.map(institutionId => ({
        templateId: data.templateId,
        institutionId,
        customName: data.customName,
        configuration: data.configuration,
        activeVariables: data.activeVariables,
        // Note: createdBy is set automatically by backend for security
      }));

      // Send all assignments
      const promises = assignments.map(assignment => 
        apiRequest("POST", "/api/institution-products", assignment)
      );
      
      return await Promise.all(promises);
    },
    onSuccess: (responses) => {
      const count = responses.length;
      toast({
        title: "Productos asignados",
        description: `Se han asignado ${count} producto${count > 1 ? 's' : ''} exitosamente`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/institution-products'] });
      form.reset();
      setShowAssignModal(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudieron asignar los productos",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AssignProductForm) => {
    assignProductMutation.mutate(data);
  };



  if (templatesLoading || institutionsLoading || productsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Productos por Financiera</h2>
            <p className="text-gray-600">Asigna y configura plantillas específicamente por institución</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" data-testid="text-institution-products-title">
            Productos por Financiera
          </h2>
          <p className="text-gray-600">
            Asigna plantillas a financieras y configúralas específicamente
          </p>
        </div>
        <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
          <DialogTrigger asChild>
            <Button data-testid="button-assign-product">
              <Plus className="w-4 h-4 mr-2" />
              Asignar Producto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Asignar Producto a Financiera</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="templateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plantilla</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-template">
                            <SelectValue placeholder="Selecciona una plantilla" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {templates?.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name} ({getCategoryDisplayName(template.category)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="institutionIds"
                  render={({ field }) => {
                    // Filter institutions: active AND compatible with template profiles
                    const compatibleInstitutions = institutions?.filter(i => {
                      if (!i.isActive) return false;
                      
                      // If no template selected, show all active institutions
                      if (!selectedTemplate) return true;
                      
                      // If institution has no acceptedProfiles configured, show it (legacy support)
                      if (!i.acceptedProfiles || i.acceptedProfiles.length === 0) return true;
                      
                      // Check if institution accepts at least one of the template's target profiles
                      const templateProfiles = selectedTemplate.targetProfiles || [];
                      if (templateProfiles.length === 0) return true; // Template accepts all
                      
                      return templateProfiles.some(tp => i.acceptedProfiles?.includes(tp));
                    }) || [];
                    
                    return (
                      <FormItem>
                        <FormLabel>Financieras Compatibles</FormLabel>
                        {selectedTemplate && compatibleInstitutions.length === 0 && (
                          <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-3 mb-2">
                            <i className="fas fa-exclamation-triangle mr-2"></i>
                            No hay financieras activas que acepten los perfiles de esta plantilla. Configura los perfiles aceptados en las financieras primero.
                          </div>
                        )}
                        <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-3" data-testid="checkbox-institutions">
                          {compatibleInstitutions.map((institution) => (
                            <div key={institution.id} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`institution-${institution.id}`}
                                checked={field.value.includes(institution.id)}
                                onChange={(e) => {
                                  const updatedIds = e.target.checked
                                    ? [...field.value, institution.id]
                                    : field.value.filter(id => id !== institution.id);
                                  field.onChange(updatedIds);
                                }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                data-testid={`checkbox-institution-${institution.id}`}
                              />
                              <label 
                                htmlFor={`institution-${institution.id}`}
                                className="text-sm font-medium text-gray-700 cursor-pointer"
                              >
                                {institution.name}
                              </label>
                            </div>
                          ))}
                        </div>
                        <FormMessage />
                        <p className="text-xs text-gray-500">
                          {selectedInstitutions && selectedInstitutions.length > 0 
                            ? `${selectedInstitutions.length} financiera${selectedInstitutions.length > 1 ? 's' : ''} seleccionada${selectedInstitutions.length > 1 ? 's' : ''}`
                            : selectedTemplate
                              ? `${compatibleInstitutions.length} financiera${compatibleInstitutions.length !== 1 ? 's' : ''} compatible${compatibleInstitutions.length !== 1 ? 's' : ''} con los perfiles de esta plantilla`
                              : "Selecciona primero una plantilla para ver financieras compatibles"
                          }
                        </p>
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="customName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del Producto (Opcional)</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Deja vacío para usar nombre automático"
                          data-testid="input-product-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowAssignModal(false)}
                    data-testid="button-cancel-assign"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={assignProductMutation.isPending}
                    data-testid="button-submit-assign"
                  >
                    {assignProductMutation.isPending ? "Asignando..." : "Asignar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Plantillas</p>
                <p className="text-2xl font-bold" data-testid="text-templates-available">
                  {templates?.length || 0}
                </p>
                <p className="text-xs text-gray-500">Disponibles</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <Building2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Financieras</p>
                <p className="text-2xl font-bold" data-testid="text-institutions-active">
                  {institutions?.filter(i => i.isActive).length || 0}
                </p>
                <p className="text-xs text-gray-500">Activas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Settings className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Productos</p>
                <p className="text-2xl font-bold" data-testid="text-products-assigned">
                  {institutionProducts?.length || 0}
                </p>
                <p className="text-xs text-gray-500">Asignados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignment Complete Message */}
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Asignación de Plantillas
        </h3>
        <p className="text-gray-600 mb-4">
          Las plantillas asignadas están disponibles en el menú principal "Financieras" para configuración y personalización.
        </p>
      </div>

      {/* Product Configuration Modal */}
      {selectedProduct && (
        <ProductConfigurationModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSave={(updatedProduct) => {
            // Handle product update
            queryClient.invalidateQueries({ queryKey: ['/api/institution-products'] });
            setSelectedProduct(null);
            toast({
              title: "Producto actualizado",
              description: "La configuración ha sido guardada exitosamente",
            });
          }}
        />
      )}
    </div>
  );
}

// Product Configuration Modal Component
interface ProductConfigurationModalProps {
  product: InstitutionProduct;
  onClose: () => void;
  onSave: (product: InstitutionProduct) => void;
}

// Available profiling fields from client profiling
const PROFILING_FIELDS = [
  { id: 'ingresoMensualPromedio', label: 'Ingreso Mensual Promedio', type: 'select' },
  { id: 'edadCliente', label: 'Edad del Cliente', type: 'select' },
  { id: 'estadoCivil', label: 'Estado Civil', type: 'select' },
  { id: 'nivelEducativo', label: 'Nivel Educativo', type: 'select' },
  { id: 'experienciaCrediticia', label: 'Experiencia Crediticia', type: 'select' },
  { id: 'objetivoCredito', label: 'Objetivo del Crédito', type: 'select' },
  { id: 'plazoDeseado', label: 'Plazo Deseado', type: 'select' },
  { id: 'capacidadPago', label: 'Capacidad de Pago', type: 'select' },
  { id: 'tipoVivienda', label: 'Tipo de Vivienda', type: 'select' },
  { id: 'antiguedadLaboral', label: 'Antigüedad Laboral', type: 'select' },
  { id: 'sectoreEconomico', label: 'Sector Económico', type: 'text' },
  { id: 'garantias', label: 'Garantías', type: 'select' },
  { id: 'historialPagos', label: 'Historial de Pagos', type: 'select' },
  { id: 'referenciasComerciales', label: 'Referencias Comerciales', type: 'text' },
];

function ProductConfigurationModal({ product, onClose, onSave }: ProductConfigurationModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('basic');
  
  // Basic config state
  const [productName, setProductName] = useState(product.name || product.template?.name || '');
  const [productDescription, setProductDescription] = useState(product.description || '');
  const [isActive, setIsActive] = useState(product.isActive);
  
  // Commissions state
  const [commissions, setCommissions] = useState({
    baseCommission: product.customData?.commissions?.baseCommission || '',
    approvalCommission: product.customData?.commissions?.approvalCommission || '',
    disbursementCommission: product.customData?.commissions?.disbursementCommission || '',
    adminFees: product.customData?.commissions?.adminFees || '',
  });
  
  // Requirements state  
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>(
    product.customData?.requirements?.selected || []
  );
  const [customRequirements, setCustomRequirements] = useState<Array<{
    id: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
  }>>(product.customData?.requirements?.custom || []);
  
  // Variables state
  const [customVariables, setCustomVariables] = useState(product.customVariables || []);
  
  // Update product mutation
  const updateProductMutation = useMutation({
    mutationFn: async (data: Partial<InstitutionProduct>) => {
      const response = await apiRequest("PUT", `/api/institution-products/${product.id}`, data);
      return response.json();
    },
    onSuccess: (updatedProduct) => {
      onSave(updatedProduct);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el producto",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    const updateData = {
      name: productName,
      description: productDescription,
      isActive,
      customVariables,
      customData: {
        commissions,
        requirements: {
          selected: selectedRequirements,
          custom: customRequirements,
        },
      },
    };
    updateProductMutation.mutate(updateData);
  };

  const handleRequirementToggle = (fieldId: string) => {
    setSelectedRequirements(prev => 
      prev.includes(fieldId) 
        ? prev.filter(id => id !== fieldId)
        : [...prev, fieldId]
    );
  };

  const handleAddCustomRequirement = () => {
    const newId = `custom_${Date.now()}`;
    setCustomRequirements(prev => [...prev, {
      id: newId,
      label: '',
      type: 'text',
      required: false,
      options: [],
    }]);
  };

  const handleRemoveCustomRequirement = (id: string) => {
    setCustomRequirements(prev => prev.filter(req => req.id !== id));
  };

  const updateCustomRequirement = (id: string, field: string, value: any) => {
    setCustomRequirements(prev => 
      prev.map(req => req.id === id ? { ...req, [field]: value } : req)
    );
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Configurar Producto: {product.template?.name}
          </DialogTitle>
          <p className="text-sm text-gray-600">
            Financiera: {product.institution?.name}
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex space-x-6" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('basic')}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'basic'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                data-testid="tab-basic-config"
              >
                Configuración Básica
              </button>
              <button
                onClick={() => setActiveTab('commissions')}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'commissions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                data-testid="tab-commissions"
              >
                Comisiones
              </button>
              <button
                onClick={() => setActiveTab('requirements')}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'requirements'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                data-testid="tab-requirements"
              >
                Requisitos
              </button>
              <button
                onClick={() => setActiveTab('products')}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'products'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                data-testid="tab-products"
              >
                Productos
              </button>
              <button
                onClick={() => setActiveTab('variables')}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'variables'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                data-testid="tab-variables-config"
              >
                Variables
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {/* Basic Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="product-name">Nombre del Producto</Label>
                    <Input
                      id="product-name"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Nombre personalizado para esta financiera"
                      data-testid="input-product-name"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="product-status">Estado del Producto</Label>
                    <div className="flex items-center space-x-2 mt-2">
                      <input
                        type="checkbox"
                        id="product-status"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        data-testid="checkbox-product-active"
                      />
                      <Label htmlFor="product-status" className="font-normal">
                        Producto activo para esta financiera
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="product-description">Descripción</Label>
                    <Textarea
                      id="product-description"
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder="Descripción específica para esta financiera"
                      rows={4}
                      data-testid="textarea-product-description"
                    />
                  </div>
                </div>
              </div>

              {/* Template Information */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Información de la Plantilla Base</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Nombre:</span>
                    <span className="ml-2 font-medium">{product.template?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Categoría:</span>
                    <span className="ml-2 font-medium">{getCategoryDisplayName(product.template?.category)}</span>
                  </div>
                  <div className="col-span-full">
                    <span className="text-gray-500">Descripción:</span>
                    <span className="ml-2">{product.template?.description}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'commissions' && (
            <div className="space-y-6">
              {/* Commissions Header */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <h4 className="font-medium text-green-900">Configuración de Comisiones</h4>
                </div>
                <p className="text-sm text-green-700">
                  Define los montos y porcentajes de comisión específicos para {product.institution?.name}.
                </p>
              </div>

              {/* Commission Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="base-commission">Comisión Base (%)</Label>
                    <Input
                      id="base-commission"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.baseCommission}
                      onChange={(e) => setCommissions(prev => ({ ...prev, baseCommission: e.target.value }))}
                      placeholder="Ej: 2.5"
                      data-testid="input-base-commission"
                    />
                  </div>

                  <div>
                    <Label htmlFor="approval-commission">Comisión por Aprobación ($)</Label>
                    <Input
                      id="approval-commission"
                      type="number"
                      min="0"
                      value={commissions.approvalCommission}
                      onChange={(e) => setCommissions(prev => ({ ...prev, approvalCommission: e.target.value }))}
                      placeholder="Ej: 5000"
                      data-testid="input-approval-commission"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="disbursement-commission">Comisión por Dispersión ($)</Label>
                    <Input
                      id="disbursement-commission"
                      type="number"
                      min="0"
                      value={commissions.disbursementCommission}
                      onChange={(e) => setCommissions(prev => ({ ...prev, disbursementCommission: e.target.value }))}
                      placeholder="Ej: 3000"
                      data-testid="input-disbursement-commission"
                    />
                  </div>

                  <div>
                    <Label htmlFor="admin-fees">Gastos Administrativos ($)</Label>
                    <Input
                      id="admin-fees"
                      type="number"
                      min="0"
                      value={commissions.adminFees}
                      onChange={(e) => setCommissions(prev => ({ ...prev, adminFees: e.target.value }))}
                      placeholder="Ej: 1500"
                      data-testid="input-admin-fees"
                    />
                  </div>
                </div>
              </div>

              {/* Commission Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 mb-3">Resumen de Comisiones</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Base:</span>
                    <span className="ml-2 font-medium">{commissions.baseCommission || '0'}%</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Aprobación:</span>
                    <span className="ml-2 font-medium">${commissions.approvalCommission || '0'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Dispersión:</span>
                    <span className="ml-2 font-medium">${commissions.disbursementCommission || '0'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Gastos Admin:</span>
                    <span className="ml-2 font-medium">${commissions.adminFees || '0'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'requirements' && (
            <div className="space-y-6">
              {/* Requirements Header */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <h4 className="font-medium text-purple-900">Requisitos del Producto</h4>
                </div>
                <p className="text-sm text-purple-700">
                  Selecciona los campos del perfilamiento que requiere {product.institution?.name} y agrega requisitos personalizados.
                </p>
              </div>

              {/* Profiling Fields Selection */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h5 className="font-medium text-gray-900">Campos del Perfilamiento</h5>
                  <Badge variant="secondary">{selectedRequirements.length} seleccionados</Badge>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto border rounded-lg p-4">
                  {PROFILING_FIELDS.map(field => (
                    <label key={field.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedRequirements.includes(field.id)}
                        onChange={() => handleRequirementToggle(field.id)}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        data-testid={`checkbox-requirement-${field.id}`}
                      />
                      <span className="text-sm">{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Custom Requirements */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h5 className="font-medium text-gray-900">Requisitos Personalizados</h5>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustomRequirement}
                    data-testid="button-add-custom-requirement"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Campo
                  </Button>
                </div>

                <div className="space-y-4">
                  {customRequirements.map((requirement, index) => (
                    <div key={requirement.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h6 className="font-medium text-gray-800">Campo Personalizado {index + 1}</h6>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveCustomRequirement(requirement.id)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-remove-requirement-${requirement.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label htmlFor={`req-label-${requirement.id}`}>Nombre del Campo</Label>
                          <Input
                            id={`req-label-${requirement.id}`}
                            value={requirement.label}
                            onChange={(e) => updateCustomRequirement(requirement.id, 'label', e.target.value)}
                            placeholder="Ej: Años de experiencia"
                            data-testid={`input-requirement-label-${requirement.id}`}
                          />
                        </div>

                        <div>
                          <Label htmlFor={`req-type-${requirement.id}`}>Tipo de Campo</Label>
                          <Select
                            value={requirement.type}
                            onValueChange={(value) => updateCustomRequirement(requirement.id, 'type', value)}
                          >
                            <SelectTrigger data-testid={`select-requirement-type-${requirement.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Texto</SelectItem>
                              <SelectItem value="number">Número</SelectItem>
                              <SelectItem value="select">Selección</SelectItem>
                              <SelectItem value="checkbox">Checkbox</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center space-x-4">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={requirement.required}
                              onChange={(e) => updateCustomRequirement(requirement.id, 'required', e.target.checked)}
                              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                              data-testid={`checkbox-requirement-required-${requirement.id}`}
                            />
                            <span className="text-sm">Obligatorio</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}

                  {customRequirements.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">
                        No hay campos personalizados. Usa "Agregar Campo" para crear nuevos requisitos.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'products' && (
            <div className="space-y-6">
              {/* Products Header */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  <h4 className="font-medium text-blue-900">Plantillas de Productos Asignadas</h4>
                </div>
                <p className="text-sm text-blue-700">
                  Plantillas de productos disponibles para {product.institution?.name}.
                </p>
              </div>

              {/* Current Product */}
              <div className="border rounded-lg p-4 bg-green-50 border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <h5 className="font-medium text-green-900">Producto Actual</h5>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Configurando</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Plantilla:</span>
                    <span className="ml-2 font-medium">{product.template?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Categoría:</span>
                    <span className="ml-2 font-medium">{getCategoryDisplayName(product.template?.category)}</span>
                  </div>
                  <div className="col-span-full">
                    <span className="text-gray-600">Perfiles dirigidos:</span>
                    <span className="ml-2">
                      {(() => {
                        const hasInstitutionProfiles = product.targetProfiles && product.targetProfiles.length > 0;
                        const profiles = hasInstitutionProfiles ? product.targetProfiles : product.template?.targetProfiles;
                        
                        if (profiles && profiles.length > 0) {
                          return (
                            <span className="inline-flex gap-1 flex-wrap items-center">
                              {profiles.map((profile) => (
                                <Badge key={profile} variant="outline" className="text-xs">
                                  {getCategoryDisplayName(profile)}
                                </Badge>
                              ))}
                              {hasInstitutionProfiles && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">
                                  ✓ Perfiles específicos
                                </Badge>
                              )}
                            </span>
                          );
                        }
                        return <span className="text-gray-500 italic">Todos los perfiles</span>;
                      })()}
                    </span>
                  </div>
                  <div className="col-span-full">
                    <span className="text-gray-600">Descripción:</span>
                    <span className="ml-2">{product.template?.description}</span>
                  </div>
                </div>
              </div>

              {/* Other Available Products Placeholder */}
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-gray-900 mb-1">
                  Otras Plantillas Disponibles
                </h3>
                <p className="text-sm text-gray-500">
                  Las demás plantillas asignadas a esta financiera aparecerán aquí.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'variables' && (
            <div className="space-y-6">
              {/* Variables Configuration */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Settings className="w-5 h-5 text-blue-600" />
                  <h4 className="font-medium text-blue-900">Variables Personalizadas</h4>
                </div>
                <p className="text-sm text-blue-700">
                  Personaliza las variables específicamente para {product.institution?.name}.
                  Estos valores sobrescribirán los valores base de la plantilla.
                </p>
              </div>

              {/* Variables List */}
              <div className="space-y-4">
                {(product.template?.baseVariables?.length || 0) > 0 ? (
                  product.template?.baseVariables?.map((variable: any, index: number) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h5 className="font-medium text-gray-900">{variable.name}</h5>
                          <p className="text-sm text-gray-600">{variable.description}</p>
                        </div>
                        <Badge variant="outline">
                          {variable.category || 'General'}
                        </Badge>
                      </div>
                      
                      <div className="mt-3">
                        <Label htmlFor={`var-${index}`} className="text-sm">
                          Valor para {product.institution?.name}
                        </Label>
                        <Input
                          id={`var-${index}`}
                          placeholder={`Valor base: ${variable.defaultValue || 'No definido'}`}
                          className="mt-1"
                          data-testid={`input-variable-${index}`}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Settings className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-sm font-medium text-gray-900 mb-1">
                      No hay variables configurables
                    </h3>
                    <p className="text-sm text-gray-500">
                      Esta plantilla no tiene variables personalizables.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="button-cancel-config"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateProductMutation.isPending}
              data-testid="button-save-config"
            >
              {updateProductMutation.isPending ? "Guardando..." : "Guardar Configuración"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}