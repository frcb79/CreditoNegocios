import { useState, useEffect } from "react";
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
import { Building2, User, DollarSign, Send, AlertCircle, CheckCircle, AlertTriangle, Info, HelpCircle } from "lucide-react";
import { evaluateAllFieldsForClient } from "@/components/MatchingAnalysis/matchingRules";

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
  // Shadow mode AI fields (not displayed, used for ground truth collection)
  ruleScore?: number;
  aiScore?: number;
  finalScore?: number;
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

  // Reset form when modal opens or preselected client changes
  useEffect(() => {
    if (isOpen) {
      form.reset({
        clientId: preselectedClientId || "",
        productTemplateId: "",
        requestedAmount: "",
        purpose: "",
        brokerNotes: "",
        financialInstitutionIds: [],
      });
      setSelectedInstitutions([]);
    }
  }, [isOpen, preselectedClientId, form]);

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

  const normalizeProfileType = (type?: string): string => {
    if (!type) return '';
    const t = type.toLowerCase().trim();
    if (t === 'moral' || t === 'persona_moral') return 'persona_moral';
    if (t === 'pfae' || t === 'fisica_empresarial') return 'fisica_empresarial';
    if (t === 'pf' || t === 'fisica') return 'fisica';
    if (t === 'sin_sat') return 'sin_sat';
    return t;
  };

  const matchesProfile = (profiles?: any, clientType?: string): boolean => {
    if (!profiles) return true;
    let list: string[] = [];
    if (Array.isArray(profiles)) {
      list = profiles;
    } else if (typeof profiles === 'string') {
      try {
        const parsed = JSON.parse(profiles);
        if (Array.isArray(parsed)) list = parsed;
        else list = [profiles];
      } catch {
        list = profiles.replace(/[{}]/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      }
    }
    if (list.length === 0) return true;
    const normClient = normalizeProfileType(clientType);
    return list.some(p => normalizeProfileType(p) === normClient);
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
    
    const clientType = normalizeProfileType(selectedClient.type);

    // FIRST: Check if institution accepts this client profile globally
    const institutionAcceptedProfiles = institution.acceptedProfiles || [];
    if (institutionAcceptedProfiles.length > 0 && !matchesProfile(institutionAcceptedProfiles, clientType)) {
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
      if (!matchesProfile(selectedTemplate.targetProfiles, clientType)) {
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
      if (!matchesProfile(institutionProduct.targetProfiles, clientType)) {
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
    
    const requirements = institution.requirements?.[clientType] || institution.requirements?.[selectedClient.type];
    
    if (!requirements) {
      return { 
        score: 50, 
        category: 'other', 
        reasons: ['No hay requisitos específicos configurados'], 
        warnings: [] 
      };
    }

    // Comprehensive evaluation of ALL 18 fields using the unified matching rules engine
    const fullEval = evaluateAllFieldsForClient(selectedClient, institution, requestedAmount);

    // ── AI Shadow Mode ──────────────────────────────────────────────
    // Heuristic signals not captured by the rule engine.
    // These map qualitative client fields to a 0-100 signal.
    const computeAiScore = (): number => {
      let aiPoints = 0;
      let aiChecks = 0;

      // Payment history
      const historialMap: Record<string, number> = {
        'excelente': 100, 'bueno': 75, 'regular': 40, 'malo': 10, 'sin-historial': 50
      };
      const historial = selectedClient.historialPagos;
      if (historial && historialMap[historial] !== undefined) {
        aiPoints += historialMap[historial];
        aiChecks++;
      }

      // Credit experience
      const expMap: Record<string, number> = {
        'sin-experiencia': 30, 'menos-1-anio': 45, '1-3-anios': 65,
        '3-5-anios': 80, 'mas-5-anios': 95
      };
      const experiencia = selectedClient.experienciaCrediticia;
      if (experiencia && expMap[experiencia] !== undefined) {
        aiPoints += expMap[experiencia];
        aiChecks++;
      }

      // Repayment capacity
      const capMap: Record<string, number> = {
        'baja': 25, 'media': 55, 'alta': 80, 'muy-alta': 100
      };
      const capacidad = selectedClient.capacidadPago;
      if (capacidad && capMap[capacidad] !== undefined) {
        aiPoints += capMap[capacidad];
        aiChecks++;
      }

      // Civil status
      const estadoMap: Record<string, number> = {
        'casado': 60, 'soltero': 50, 'union-libre': 55, 'divorciado': 45, 'viudo': 45
      };
      const estado = selectedClient.estadoCivil;
      if (estado && estadoMap[estado] !== undefined) {
        aiPoints += estadoMap[estado];
        aiChecks++;
      }

      // Education level
      const eduMap: Record<string, number> = {
        'sin-estudios': 40, 'primaria': 45, 'secundaria': 50, 'preparatoria': 58,
        'licenciatura': 68, 'posgrado': 75
      };
      const edu = selectedClient.nivelEducativo;
      if (edu && eduMap[edu] !== undefined) {
        aiPoints += eduMap[edu];
        aiChecks++;
      }

      return aiChecks > 0 ? Math.round(aiPoints / aiChecks) : fullEval.score;
    };

    const ruleScore = fullEval.score;
    const aiScore = computeAiScore();
    // Weighted blend: rule engine is authoritative (70%), AI heuristic adds signal (30%)
    const finalScore = Math.round(0.7 * ruleScore + 0.3 * aiScore);

    // Re-categorize:
    // If the institution has hard failures (failedChecks > 0), it goes to other/advertencia
    let finalCategory: 'recommended' | 'compatible' | 'other';
    if (fullEval.failedChecks > 0) {
      finalCategory = 'other';
    } else if (finalScore >= 80 && fullEval.warningChecks === 0) {
      finalCategory = 'recommended';
    } else if (finalScore >= 50) {
      finalCategory = 'compatible';
    } else {
      finalCategory = 'other';
    }

    // Ground truth logging (shadow mode — no UI impact)
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[AI-MATCH]', {
        institution: institution.name,
        clientType: selectedClient.type,
        requestedAmount,
        ruleScore,
        aiScore,
        finalScore,
        category: finalCategory,
      });
    }

    return {
      score: finalScore,
      category: finalCategory,
      reasons: fullEval.reasons,
      warnings: fullEval.warnings,
      ruleScore,
      aiScore,
      finalScore
    };
  };


  // Sort institutions by match score
  const institutionsWithMatch = activeInstitutions.map(inst => ({
    institution: inst,
    match: evaluateMatch(inst)
  })).sort((a, b) => b.match.score - a.match.score);

  const compatibleInstitutions = institutionsWithMatch.filter(
    i => (i.match.category === 'recommended' || i.match.category === 'compatible') && i.match.warnings.length === 0
  );
  const warningInstitutions = institutionsWithMatch.filter(
    i => i.match.warnings.length > 0 && i.match.score > 0
  );
  const otherInstitutions = institutionsWithMatch.filter(
    i => !compatibleInstitutions.includes(i) && !warningInstitutions.includes(i)
  );

  const renderInstitutionCard = (institution: FinancialInstitution, match: MatchResult) => {
    const isSelected = selectedInstitutions.includes(institution.id);
    
    // Get institution's specific product for this template
    const institutionProduct = institutionProducts?.find(
      (p: any) => p.institutionId === institution.id && p.templateId === selectedTemplateId
    );
    const productName = institutionProduct?.customName || institutionProduct?.name || selectedTemplate?.name;
    
    let categoryBadge = null;
    let categoryIcon = null;
    
    if (match.category === 'recommended' || (match.warnings.length === 0 && match.score >= 70)) {
      categoryBadge = (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-xs">
          ⭐ Recomendada
        </Badge>
      );
      categoryIcon = <CheckCircle className="w-4 h-4 text-emerald-600" />;
    } else if (match.warnings.length === 0 && match.score >= 50) {
      categoryBadge = (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs">
          ✓ Compatible
        </Badge>
      );
      categoryIcon = <CheckCircle className="w-4 h-4 text-blue-600" />;
    } else if (match.warnings.length > 0 && match.score > 0) {
      categoryBadge = (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs">
          ⚠ Advertencia
        </Badge>
      );
      categoryIcon = <AlertTriangle className="w-4 h-4 text-amber-600" />;
    } else {
      categoryBadge = (
        <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300 text-xs">
          Sin datos / No aplica
        </Badge>
      );
      categoryIcon = <HelpCircle className="w-4 h-4 text-gray-500" />;
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
                  <Select onValueChange={field.onChange} value={field.value}>
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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-product-template">
                        <SelectValue placeholder="Selecciona el tipo de producto" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {productTemplates
                        ?.filter((template) => {
                          if (!selectedClient) return true;
                          return matchesProfile(template.targetProfiles, selectedClient.type);
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

                    {/* Compatible Institutions (Recomendadas y Compatibles) */}
                    {compatibleInstitutions.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <h4 className="font-semibold text-sm text-emerald-900">
                            Financieras Compatibles ({compatibleInstitutions.length})
                          </h4>
                          <span className="text-xs text-muted-foreground">Cumplen con los requisitos</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto">
                          {compatibleInstitutions.map(({ institution, match }) => 
                            renderInstitutionCard(institution, match)
                          )}
                        </div>
                      </div>
                    )}

                    {/* Warning Institutions */}
                    {warningInstitutions.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <h4 className="font-semibold text-sm text-amber-900">
                            Financieras con Advertencias ({warningInstitutions.length})
                          </h4>
                          <span className="text-xs text-muted-foreground">Presentan requisitos no cumplidos o incompletos</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                          {warningInstitutions.map(({ institution, match }) => 
                            renderInstitutionCard(institution, match)
                          )}
                        </div>
                      </div>
                    )}

                    {/* Other / No Data Institutions */}
                    {otherInstitutions.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <HelpCircle className="w-4 h-4 text-gray-500" />
                          <h4 className="font-semibold text-sm text-gray-700">
                            Sin Datos Suficientes / No Aplica ({otherInstitutions.length})
                          </h4>
                          <span className="text-xs text-muted-foreground">Sin requisitos configurados o perfil no admitido</span>
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
