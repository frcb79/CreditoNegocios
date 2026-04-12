import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building2, User, DollarSign, Send, AlertCircle, CheckCircle, AlertTriangle, Info } from "lucide-react";

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  businessName?: string;
  type: string;
  ingresoMensualPromedio?: string;
  edadCliente?: string;
  estadoCivil?: string;
  nivelEducativo?: string;
  experienciaCrediticia?: string;
  capacidadPago?: string;
  antiguedadLaboral?: string;
  historialPagos?: string;
  [key: string]: any;
}

interface FinancialInstitution {
  id: string;
  name: string;
  contactPerson?: string;
  isActive: boolean;
  requirements?: any;
  acceptedProfiles?: string[];
}

interface CreditRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedClientId?: string;
}

interface MatchResult {
  score: number;
  category: 'recommended' | 'compatible' | 'other';
  reasons: string[];
  warnings: string[];
}

interface ProductTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  targetProfiles?: string[];
}

// Schema for credit request form
const creditRequestSchema = z.object({
  clientId: z.string().min(1, "Selecciona un cliente"),
  productTemplateId: z.string().min(1, "Selecciona un tipo de producto"),
  requestedAmount: z.string()
    .min(1, "El monto es requerido")
    .refine((val) => parseFloat(val) > 0, "El monto debe ser mayor a 0"),
  purpose: z.string().optional(),
  brokerNotes: z.string().optional(),
  financialInstitutionIds: z.array(z.string()).min(1, "Selecciona al menos una financiera"),
});

type CreditRequestForm = z.infer<typeof creditRequestSchema>;

export default function CreditRequestModal({ isOpen, onClose, preselectedClientId }: CreditRequestModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedInstitutions, setSelectedInstitutions] = useState<string[]>([]);

  // Form setup
  const form = useForm<CreditRequestForm>({
    resolver: zodResolver(creditRequestSchema),
    defaultValues: {
      clientId: preselectedClientId || "",
      productTemplateId: "",
      requestedAmount: "",
      purpose: "",
      brokerNotes: "",
      financialInstitutionIds: [],
    },
  });

  // Fetch data
  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
  });

  const { data: productTemplates, isLoading: templatesLoading } = useQuery<ProductTemplate[]>({
    queryKey: ['/api/product-templates'],
  });

  const { data: institutionProducts, isLoading: instProductsLoading } = useQuery<any[]>({
    queryKey: ['/api/institution-products'],
  });

  const { data: institutions, isLoading: institutionsLoading } = useQuery<FinancialInstitution[]>({
    queryKey: ['/api/financial-institutions'],
  });

  // Create credit submission request
  const submitRequestMutation = useMutation({
    mutationFn: async (data: CreditRequestForm) => {
      const requestData = {
        clientId: data.clientId,
        productTemplateId: data.productTemplateId,
        requestedAmount: data.requestedAmount,
        purpose: data.purpose,
        brokerNotes: data.brokerNotes,
        financialInstitutionIds: data.financialInstitutionIds,
      };

      return apiRequest("POST", "/api/credit-submissions", requestData);
    },
    onSuccess: (response, variables) => {
      toast({
        title: "Solicitud enviada",
        description: "Tu solicitud de crédito ha sido enviada para aprobación administrativa",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/credit-submissions'] });
      queryClient.invalidateQueries({ queryKey: [`/api/credit-submissions/client/${variables.clientId}`] });
      form.reset();
      setSelectedInstitutions([]);
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar la solicitud",
        variant: "destructive",
      });
    },
  });

  const handleInstitutionToggle = (institutionId: string) => {
    const updatedIds = selectedInstitutions.includes(institutionId)
      ? selectedInstitutions.filter(id => id !== institutionId)
      : [...selectedInstitutions, institutionId];
    
    setSelectedInstitutions(updatedIds);
    form.setValue('financialInstitutionIds', updatedIds);
  };

  const onSubmit = (data: CreditRequestForm) => {
    submitRequestMutation.mutate(data);
  };

  const getClientDisplayName = (client: Client) => {
    if (client.type === 'persona_moral') {
      return client.businessName || 'Sin razón social';
    }
    return `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Sin nombre';
  };

  const getClientTypeBadgeColor = (type: string) => {
    const colors = {
      'persona_moral': 'bg-blue-100 text-blue-700',
      'fisica_empresarial': 'bg-purple-100 text-purple-700',
      'fisica': 'bg-green-100 text-green-700',
      'sin_sat': 'bg-orange-100 text-orange-700'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-700';
  };

  const getClientTypeLabel = (type: string) => {
    const labels = {
      'persona_moral': 'PM',
      'fisica_empresarial': 'PFAE',
      'fisica': 'PF',
      'sin_sat': 'Sin SAT'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const selectedClient = clients?.find(c => c.id === form.watch('clientId'));
  const selectedTemplateId = form.watch('productTemplateId');
  const selectedTemplate = productTemplates?.find(t => t.id === selectedTemplateId);
  const activeInstitutions = institutions?.filter(i => i.isActive) || [];
  const requestedAmount = parseFloat(form.watch('requestedAmount') || '0');
  
  // Advanced matching algorithm
  const evaluateMatch = (institution: FinancialInstitution): MatchResult => {
    if (!selectedClient || !requestedAmount || requestedAmount <= 0) {
      return { score: 0, category: 'other', reasons: [], warnings: ['Completa los datos del cliente y monto'] };
    }
    
    // FIRST: Check if institution accepts this client profile globally
    const institutionAcceptedProfiles = institution.acceptedProfiles || [];
    if (institutionAcceptedProfiles.length > 0 && !institutionAcceptedProfiles.includes(selectedClient.type)) {
      const profileLabels = {
        'persona_moral': 'Personas Morales',
        'fisica': 'Personas Físicas',
        'sin_sat': 'Sin SAT',
        'fisica_empresarial': 'PFAE'
      };
      const acceptedProfilesList = institutionAcceptedProfiles
        .map((p: string) => profileLabels[p as keyof typeof profileLabels] || p)
        .join(', ');
      
      return {
        score: 0,
        category: 'other',
        reasons: [],
        warnings: [`Esta financiera solo acepta: ${acceptedProfilesList}`]
      };
    }
    
    // Check if institution has product for selected template
    const institutionProduct = institutionProducts?.find(
      (p: any) => p.institutionId === institution.id && p.templateId === selectedTemplateId
    );
    
    if (!institutionProduct && selectedTemplateId) {
      return {
        score: 0,
        category: 'other',
        reasons: [],
        warnings: ['No ofrece este tipo de producto']
      };
    }
    
    // Check if institution product is inactive
    if (institutionProduct && institutionProduct.isActive === false) {
      return {
        score: 0,
        category: 'other',
        reasons: [],
        warnings: ['Este producto está inactivo temporalmente']
      };
    }
    
    // Check if client type is in template's targetProfiles
    if (selectedTemplate?.targetProfiles && selectedTemplate.targetProfiles.length > 0) {
      if (!selectedTemplate.targetProfiles.includes(selectedClient.type)) {
        const profileLabels = {
          'persona_moral': 'Personas Morales',
          'fisica': 'Personas Físicas',
          'sin_sat': 'Sin SAT',
          'fisica_empresarial': 'PFAE'
        };
        const requiredProfiles = selectedTemplate.targetProfiles
          .map(p => profileLabels[p as keyof typeof profileLabels] || p)
          .join(', ');
        
        return {
          score: 0,
          category: 'other',
          reasons: [],
          warnings: [`Este producto solo acepta: ${requiredProfiles}`]
        };
      }
    }
    
    // Check if institution has restricted targetProfiles for this product
    if (institutionProduct?.targetProfiles && institutionProduct.targetProfiles.length > 0) {
      if (!institutionProduct.targetProfiles.includes(selectedClient.type)) {
        const profileLabels = {
          'persona_moral': 'Personas Morales',
          'fisica': 'Personas Físicas',
          'sin_sat': 'Sin SAT',
          'fisica_empresarial': 'PFAE'
        };
        const requiredProfiles = institutionProduct.targetProfiles
          .map((p: string) => profileLabels[p as keyof typeof profileLabels] || p)
          .join(', ');
        
        return {
          score: 0,
          category: 'other',
          reasons: [],
          warnings: [`Esta financiera solo acepta para este producto: ${requiredProfiles}`]
        };
      }
    }
    
    const clientType = selectedClient.type;
    const requirements = institution.requirements?.[clientType];
    
    if (!requirements) {
      return { 
        score: 50, 
        category: 'compatible', 
        reasons: ['No hay requisitos específicos configurados'], 
        warnings: [] 
      };
    }

    let totalChecks = 0;
    let passedChecks = 0;
    const reasons: string[] = [];
    const warnings: string[] = [];
    const ranges = requirements.ranges || {};

    // Check monto range
    if (ranges.monto) {
      totalChecks++;
      const min = parseFloat(ranges.monto.min || 0);
      const max = parseFloat(ranges.monto.max || Infinity);
      
      if (requestedAmount >= min && (!max || requestedAmount <= max)) {
        passedChecks++;
        reasons.push(`Monto en rango: $${min.toLocaleString('es-MX')} - $${max.toLocaleString('es-MX')}`);
      } else {
        warnings.push(`Monto fuera de rango: $${min.toLocaleString('es-MX')} - $${max.toLocaleString('es-MX')}`);
      }
    }

    // Check other numeric ranges
    const numericFields = [
      { key: 'score', label: 'Score de Buró', clientKey: 'bureauScore' },
      { key: 'antiguedadLaboral', label: 'Antigüedad Laboral', clientKey: 'antiguedadLaboral' },
      { key: 'edadCliente', label: 'Edad del Cliente', clientKey: 'edadCliente' },
    ];

    numericFields.forEach(({ key, label, clientKey }) => {
      if (ranges[key]) {
        totalChecks++;
        const min = parseFloat(ranges[key].min || 0);
        const max = parseFloat(ranges[key].max || Infinity);
        const clientValue = parseFloat(selectedClient[clientKey] || '0');

        if (clientValue >= min && (!max || clientValue <= max)) {
          passedChecks++;
          reasons.push(`${label}: ${clientValue} (rango: ${min}-${max})`);
        } else if (clientValue > 0) {
          warnings.push(`${label}: ${clientValue} fuera del rango ${min}-${max}`);
        }
      }
    });

    // Check required profiling fields
    const selectedFields = requirements.selected || [];
    if (selectedFields.length > 0) {
      selectedFields.forEach((fieldId: string) => {
        totalChecks++;
        const clientValue = selectedClient[fieldId];
        if (clientValue && clientValue !== '' && clientValue !== 'N/A') {
          passedChecks++;
        } else {
          warnings.push(`Campo requerido sin llenar: ${fieldId}`);
        }
      });
    }

    // Check maxThreshold for participacionVentasGobierno
    if (ranges.participacionVentasGobierno?.maxThreshold) {
      totalChecks++;
      const maxThreshold = ranges.participacionVentasGobierno.maxThreshold;
      const clientValue = selectedClient.participacionVentasGobierno;
      
      if (!clientValue || clientValue === '' || clientValue === 'N/A') {
        warnings.push('Participación ventas gobierno: dato requerido no proporcionado');
      } else {
        // Define threshold hierarchy from lowest to highest
        const thresholdHierarchy: Record<string, number> = {
          '0': 0,
          'menor-10': 1,
          '0-10': 1,
          '11-20': 2,
          'menor-20': 2,
          '21-40': 3,
          'menor-40': 3,
          'menor-50': 4,
          'menor-60': 5,
          'arriba-40': 6
        };
        
        const maxAllowedLevel = thresholdHierarchy[maxThreshold] || 999;
        const clientLevel = thresholdHierarchy[clientValue] || 999;
        
        if (clientLevel <= maxAllowedLevel) {
          passedChecks++;
          const thresholdLabels: Record<string, string> = {
            '0': '0%',
            'menor-20': 'Menor a 20%',
            'menor-40': 'Menor a 40%',
            'menor-50': 'Menor a 50%',
            'menor-60': 'Menor a 60%'
          };
          reasons.push(`Participación ventas gobierno aceptable (máximo: ${thresholdLabels[maxThreshold] || maxThreshold})`);
        } else {
          const thresholdLabels: Record<string, string> = {
            '0': '0%',
            'menor-20': 'Menor a 20%',
            'menor-40': 'Menor a 40%',
            'menor-50': 'Menor a 50%',
            'menor-60': 'Menor a 60%'
          };
          warnings.push(`Participación ventas gobierno excede el máximo aceptado (${thresholdLabels[maxThreshold] || maxThreshold})`);
        }
      }
    }

    // Check acceptanceMode for opinionCumplimiento
    if (ranges.opinionCumplimiento?.acceptanceMode) {
      totalChecks++;
      const acceptanceMode = ranges.opinionCumplimiento.acceptanceMode;
      const clientValue = selectedClient.opinionCumplimiento;
      
      if (!clientValue || clientValue === '' || clientValue === 'N/A') {
        warnings.push('Opinión de cumplimiento: dato requerido no proporcionado');
      } else {
        if (acceptanceMode === 'solo-positiva') {
          if (clientValue === 'positiva') {
            passedChecks++;
            reasons.push('Opinión de cumplimiento: positiva (requerida)');
          } else {
            warnings.push('Opinión de cumplimiento: solo se acepta positiva');
          }
        } else if (acceptanceMode === 'positiva-y-negativa') {
          passedChecks++;
          reasons.push('Opinión de cumplimiento: aceptable (ambas se aceptan)');
        }
      }
    }

    // Check guarantee multipliers
    const guaranteeFields = ['garantia', 'cuentaConGarantiaFisica', 'cuentaConGarantiaSinSat'];
    guaranteeFields.forEach(fieldKey => {
      if (ranges[fieldKey]?.guaranteeMultipliers) {
        totalChecks++;
        const guaranteeMultipliers = ranges[fieldKey].guaranteeMultipliers;
        const clientGuaranteeType = selectedClient[fieldKey];
        
        if (!clientGuaranteeType || clientGuaranteeType === '' || clientGuaranteeType === 'N/A') {
          warnings.push('Tipo de garantía: dato requerido no proporcionado');
        } else {
          const multiplier = guaranteeMultipliers[clientGuaranteeType];
          if (multiplier) {
            passedChecks++;
            reasons.push(`Garantía ${clientGuaranteeType.replace(/-/g, ' ')}: aceptada (${multiplier})`);
          } else {
            warnings.push(`Tipo de garantía ${clientGuaranteeType.replace(/-/g, ' ')}: no configurado para esta institución`);
          }
        }
      }
    });

    // Check select field ranges (e.g., ingresoAnual)
    const selectRangeFields = ['ingresoAnual'];
    selectRangeFields.forEach(fieldKey => {
      if (ranges[fieldKey]?.min || ranges[fieldKey]?.max) {
        totalChecks++;
        const minOption = ranges[fieldKey].min;
        const maxOption = ranges[fieldKey].max;
        const clientValue = selectedClient[fieldKey];
        
        if (!clientValue || clientValue === '' || clientValue === 'N/A') {
          warnings.push(`${fieldKey}: dato requerido no proporcionado`);
        } else {
          // Hierarchy for ingresoAnual options
          const ingresoHierarchy: Record<string, number> = {
            'menor-100000': 0,
            '100000-250000': 1,
            '250000-500000': 2,
            '500000-1000000': 3,
            '1000000-2500000': 4,
            '2500000-5000000': 5,
            'arriba-5000000': 6
          };
          
          const clientLevel = ingresoHierarchy[clientValue] ?? -1;
          const minLevel = minOption ? (ingresoHierarchy[minOption] ?? -1) : -1;
          const maxLevel = maxOption ? (ingresoHierarchy[maxOption] ?? 999) : 999;
          
          if (clientLevel >= minLevel && clientLevel <= maxLevel) {
            passedChecks++;
            reasons.push(`Ingreso anual dentro del rango aceptable`);
          } else {
            warnings.push(`Ingreso anual fuera del rango aceptable`);
          }
        }
      }
    });

    // Add additional notes if present
    const additionalNotes = requirements.additionalNotes;
    if (additionalNotes && additionalNotes.trim()) {
      warnings.push(`📋 Nota: ${additionalNotes.trim()}`);
    }

    // Calculate score
    const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 50;
    
    // Categorize
    let category: 'recommended' | 'compatible' | 'other';
    if (score >= 80) {
      category = 'recommended';
    } else if (score >= 50) {
      category = 'compatible';
    } else {
      category = 'other';
    }

    // Add summary reason
    if (reasons.length === 0 && warnings.length === 0) {
      reasons.push('Disponible para solicitud');
    }

    return { score, category, reasons, warnings };
  };

  // Sort institutions by match score
  const institutionsWithMatch = activeInstitutions.map(inst => ({
    institution: inst,
    match: evaluateMatch(inst)
  })).sort((a, b) => b.match.score - a.match.score);

  const recommendedInstitutions = institutionsWithMatch.filter(i => i.match.category === 'recommended');
  const compatibleInstitutions = institutionsWithMatch.filter(i => i.match.category === 'compatible');
  const otherInstitutions = institutionsWithMatch.filter(i => i.match.category === 'other');

  const renderInstitutionCard = (institution: FinancialInstitution, match: MatchResult) => {
    const isSelected = selectedInstitutions.includes(institution.id);
    
    // Get institution's specific product for this template
    const institutionProduct = institutionProducts?.find(
      (p: any) => p.institutionId === institution.id && p.templateId === selectedTemplateId
    );
    const productName = institutionProduct?.customName || institutionProduct?.name || selectedTemplate?.name;
    
    let categoryBadge = null;
    let categoryIcon = null;
    
    if (match.category === 'recommended') {
      categoryBadge = (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-xs">
          ⭐ Recomendada
        </Badge>
      );
      categoryIcon = <CheckCircle className="w-4 h-4 text-green-600" />;
    } else if (match.category === 'compatible') {
      categoryBadge = (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs">
          ✓ Compatible
        </Badge>
      );
      categoryIcon = <Info className="w-4 h-4 text-blue-600" />;
    } else {
      categoryBadge = (
        <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300 text-xs">
          Otra opción
        </Badge>
      );
      categoryIcon = <AlertTriangle className="w-4 h-4 text-gray-600" />;
    }

    return (
      <TooltipProvider key={institution.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer border transition-all ${
                isSelected
                  ? 'bg-blue-50 border-blue-400 shadow-sm'
                  : match.category === 'recommended'
                  ? 'bg-green-50/50 border-green-200 hover:bg-green-50'
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
              onClick={() => handleInstitutionToggle(institution.id)}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleInstitutionToggle(institution.id)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                data-testid={`checkbox-institution-${institution.id}`}
              />
              <div className="flex items-center justify-between flex-1 min-w-0">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  {categoryIcon}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{institution.name}</p>
                    {productName && (
                      <p className="text-xs text-blue-600 font-medium truncate">📦 {productName}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-2">
                  {match.score > 0 && (
                    <span className="text-xs font-semibold text-gray-600">{match.score}%</span>
                  )}
                  {categoryBadge}
                </div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <div className="space-y-2">
              <p className="font-semibold text-sm">Score de compatibilidad: {match.score}%</p>
              {match.reasons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-600">✓ Cumple:</p>
                  <ul className="text-xs list-disc list-inside">
                    {match.reasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {match.warnings.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-yellow-600">⚠ Advertencias:</p>
                  <ul className="text-xs list-disc list-inside">
                    {match.warnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Send className="w-5 h-5 text-blue-600" />
            <span>Solicitar Crédito</span>
          </DialogTitle>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Sistema de Matching Automático</p>
                <p>
                  El sistema evalúa el perfil del cliente y sugiere las financieras más compatibles.
                  Puedes seleccionar las recomendadas o elegir otras opciones.
                </p>
              </div>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Client Selection */}
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-client">
                        <SelectValue placeholder="Selecciona un cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients?.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          <div className="flex items-center space-x-2">
                            <span>{getClientDisplayName(client)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${getClientTypeBadgeColor(client.type)}`}>
                              {getClientTypeLabel(client.type)}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Selected Client Info */}
            {selectedClient && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-full">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{getClientDisplayName(selectedClient)}</h4>
                    <p className="text-sm text-gray-600 capitalize">
                      {getClientTypeLabel(selectedClient.type)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Product Template Selection */}
            <FormField
              control={form.control}
              name="productTemplateId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Producto *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-product-template">
                        <SelectValue placeholder="Selecciona el tipo de producto" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {productTemplates
                        ?.filter((template) => {
                          if (!selectedClient) return true;
                          if (!template.targetProfiles || template.targetProfiles.length === 0) return true;
                          return template.targetProfiles.includes(selectedClient.type);
                        })
                        .map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{template.name}</span>
                              {template.description && (
                                <span className="text-xs text-gray-500">{template.description}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Requested Amount */}
              <FormField
                control={form.control}
                name="requestedAmount"
                render={({ field }) => {
                  const formatCurrency = (value: string) => {
                    if (!value) return '';
                    const number = parseInt(value, 10);
                    return number.toLocaleString('es-MX');
                  };

                  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const rawValue = e.target.value.replace(/[^0-9]/g, '');
                    field.onChange(rawValue);
                  };

                  return (
                    <FormItem>
                      <FormLabel>Monto Solicitado *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <Input
                            type="text"
                            value={formatCurrency(field.value)}
                            onChange={handleChange}
                            placeholder="0"
                            className="pl-10"
                            data-testid="input-amount"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {/* Purpose */}
              <FormField
                control={form.control}
                name="purpose"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Propósito del Crédito</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ej: Capital de trabajo, expansión..."
                        data-testid="input-purpose"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Financial Institutions with Matching */}
            <FormField
              control={form.control}
              name="financialInstitutionIds"
              render={() => (
                <FormItem>
                  <FormLabel>Financieras Disponibles *</FormLabel>
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Selecciona las financieras a las que deseas enviar esta solicitud. 
                      El sistema las ordena según su compatibilidad con el perfil del cliente.
                    </p>

                    {/* Recommended Institutions */}
                    {recommendedInstitutions.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <h4 className="font-semibold text-sm text-green-900">
                            Financieras Recomendadas ({recommendedInstitutions.length})
                          </h4>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {recommendedInstitutions.map(({ institution, match }) => 
                            renderInstitutionCard(institution, match)
                          )}
                        </div>
                      </div>
                    )}

                    {/* Compatible Institutions */}
                    {compatibleInstitutions.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Info className="w-4 h-4 text-blue-600" />
                          <h4 className="font-semibold text-sm text-blue-900">
                            Financieras Compatibles ({compatibleInstitutions.length})
                          </h4>
                        </div>
                        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                          {compatibleInstitutions.map(({ institution, match }) => 
                            renderInstitutionCard(institution, match)
                          )}
                        </div>
                      </div>
                    )}

                    {/* Other Institutions */}
                    {otherInstitutions.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-gray-600" />
                          <h4 className="font-semibold text-sm text-gray-700">
                            Otras Opciones ({otherInstitutions.length})
                          </h4>
                        </div>
                        <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                          {otherInstitutions.map(({ institution, match }) => 
                            renderInstitutionCard(institution, match)
                          )}
                        </div>
                      </div>
                    )}

                    {/* Selected Summary */}
                    {selectedInstitutions.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm font-medium text-blue-900 mb-2">
                          Financieras seleccionadas ({selectedInstitutions.length}):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedInstitutions.map(id => {
                            const institution = institutions?.find(i => i.id === id);
                            return institution ? (
                              <Badge key={id} variant="default" className="bg-blue-600 text-white">
                                {institution.name}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Broker Notes */}
            <FormField
              control={form.control}
              name="brokerNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Detalles Importantes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Información importante para la financiera sobre este crédito..."
                      rows={3}
                      data-testid="textarea-broker-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel-request"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitRequestMutation.isPending || clientsLoading || institutionsLoading}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-submit-request"
              >
                {submitRequestMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar a Financieras
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
