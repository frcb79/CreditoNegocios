import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import CurrencyInput from "@/components/ui/currency-input";
import { 
  Settings, 
  DollarSign, 
  FileText, 
  Package, 
  CheckCircle, 
  Plus, 
  Trash2,
  Sliders 
} from "lucide-react";
import { 
  InstitutionProductWithTemplate,
  ProductTemplate,
  FinancialInstitution
} from "@shared/schema";

// Profiling fields by client type - EXACT names from ClientForm database
const PROFILING_FIELDS_BY_TYPE: Record<string, any[]> = {
  persona_moral: [
    { id: 'ingresoMensualPromedio', label: 'Ingreso Mensual Promedio (últimos 6 meses)', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: true },
    { id: 'egresoMensualPromedio', label: 'Egreso Mensual Promedio (últimos 6 meses)', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: false },
    { id: 'ingresoAnual', label: 'Ingreso Anual', type: 'select', options: ['menor-100000', '100000-250000', '250000-500000', '500000-1000000', '1000000-2500000', '2500000-5000000', 'arriba-5000000'] },
    { id: 'participacionVentasGobierno', label: 'Participación de Ventas con Gobierno', type: 'select', options: ['0', 'menor-10', '11-20', '21-40', 'arriba-40'], hasMaxThreshold: true, thresholdOptions: ['0', 'menor-20', 'menor-40', 'menor-50', 'menor-60'] },
    { id: 'ventasTerminalBancaria', label: 'Ventas con Terminal Bancaria (mensuales)', type: 'select', options: ['no', 'hasta-50000', '50000-150000', 'mayores-150000'] },
    { id: 'buroAccionistaPrincipal', label: 'Buró de Crédito Accionista Principal', type: 'select', hasRange: true, rangeType: 'score', rangeOnlyMin: true, options: ['alto-694-760', 'bueno-592-693', 'medio-524-591', 'bajo-490-523', 'malo-456-489'] },
    { id: 'buroEmpresa', label: 'Buró de Crédito Empresa', type: 'select', hasRange: true, rangeType: 'score', rangeOnlyMin: true, options: ['alto-310-400', 'bueno-250-309', 'medio-230-249', 'bajo-220-229', 'malo-100-219'] },
    { id: 'atrasosDeudas', label: 'Atrasos, Deudas, Quitas en Buró', type: 'select', options: ['si', 'no'], hasRange: true, rangeType: 'currency', rangeLabel: 'Monto Máximo Atrasos' },
    { id: 'garantia', label: 'Garantía', type: 'select', options: ['sin-garantia', 'prendaria', 'hipotecaria', 'otros'], hasMultiplier: true },
    { id: 'avalObligadoSolidario', label: 'Aval u Obligado Solidario', type: 'select', options: ['si', 'no'] },
    { id: 'satCiec', label: 'Conectarse a SAT (CIEC)', type: 'select', options: ['si', 'no'] },
    { id: 'estadosFinancieros', label: 'Estados Financieros', type: 'select', options: ['si', 'no'] },
    { id: 'opinionCumplimiento', label: 'Opinión de Cumplimiento', type: 'select', options: ['positiva', 'negativa'], hasAcceptanceMode: true },
    { id: 'creditosVigentes', label: 'Créditos Vigentes', type: 'select', options: ['si', 'no'] },
  ],
  fisica_empresarial: [
    { id: 'puesto', label: 'Puesto', type: 'text' },
    { id: 'antiguedadLaboral', label: 'Antigüedad Laboral', type: 'text' },
    { id: 'sectoreEconomico', label: 'Sector Económico', type: 'text' },
    { id: 'ingresoMensualPromedioComprobables', label: 'Ingreso Mensual Promedio Comprobables (últimos 6 meses)', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: true },
    { id: 'ingresoMensualPromedioNoComprobables', label: 'Ingreso Mensual Promedio No Comprobables (últimos 6 meses)', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: true },
    { id: 'gastosFijosMensualesPromedio', label: 'Gastos Fijos Mensuales Promedio', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: false },
    { id: 'ingresoAnual', label: 'Ingreso Anual', type: 'select', hasRange: true, rangeType: 'select', rangeOnlyMin: false, options: ['menor-100000', '100000-250000', '250000-500000', '500000-1000000', '1000000-2500000', '2500000-5000000', 'arriba-5000000'] },
    { id: 'participacionVentasGobierno', label: 'Participación de Ventas con Gobierno', type: 'select', options: ['0', '0-10', '11-20', '21-40', 'arriba-40'], hasMaxThreshold: true, thresholdOptions: ['0', 'menor-20', 'menor-40', 'menor-50', 'menor-60'] },
    { id: 'ventasTerminalBancaria', label: 'Ventas con Terminal Bancaria (mensuales)', type: 'select', options: ['no', 'hasta-15000', '15000-30000', '30000-50000', '50000-100000', 'mayores-100000'] },
    { id: 'buroPersonaFisica', label: 'Buró de Crédito Persona Física', type: 'select', hasRange: true, rangeType: 'score', rangeOnlyMin: true, options: ['alto-694-760', 'bueno-592-693', 'medio-524-591', 'bajo-490-523', 'malo-456-489'] },
    { id: 'atrasosDeudasBuro', label: 'Atrasos, Deudas, Quitas en Buró', type: 'select', options: ['si', 'no'], hasRange: true, rangeType: 'currency', rangeLabel: 'Monto Máximo Atrasos' },
    { id: 'garantia', label: 'Garantía', type: 'select', options: ['sin-garantia', 'prendaria', 'hipotecaria'], hasMultiplier: true },
    { id: 'avalObligadoSolidario', label: 'Aval u Obligado Solidario', type: 'select', options: ['si', 'no'] },
    { id: 'satCiec', label: 'Conectarse a SAT (CIEC)', type: 'select', options: ['si', 'no'] },
    { id: 'estadosFinancieros', label: 'Estados Financieros', type: 'select', options: ['si', 'no'] },
    { id: 'opinionCumplimiento', label: 'Opinión de Cumplimiento', type: 'select', options: ['positiva', 'negativa'], hasAcceptanceMode: true },
    { id: 'creditosVigentes', label: 'Créditos Vigentes', type: 'select', options: ['si', 'no'] },
  ],
  fisica: [
    { id: 'estadoCivil', label: 'Estado Civil', type: 'select', options: ['soltero', 'casado', 'divorciado', 'viudo', 'union-libre'] },
    { id: 'nivelEducativo', label: 'Nivel Educativo', type: 'select', options: ['primaria', 'secundaria', 'preparatoria', 'licenciatura', 'maestria', 'doctorado'] },
    { id: 'tipoVivienda', label: 'Tipo de Vivienda', type: 'select', options: ['propia', 'rentada', 'familiar', 'hipotecada'] },
    { id: 'dependientesEconomicos', label: 'Dependientes Económicos', type: 'number' },
    { id: 'puesto', label: 'Puesto', type: 'text' },
    { id: 'antiguedadLaboral', label: 'Antigüedad Laboral', type: 'select', options: ['menos-1', '1-2', '2-5', '5-10', 'mas-10'] },
    { id: 'ingresoMensualPromedioComprobables', label: 'Ingreso Mensual Promedio Comprobables (últimos 6 meses)', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: true },
    { id: 'ingresoMensualPromedioNoComprobables', label: 'Ingreso Mensual Promedio No Comprobables (últimos 6 meses)', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: true },
    { id: 'gastosFijosMensualesPromedio', label: 'Gastos Fijos Mensuales Promedio (últimos 6 meses)', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: false },
    { id: 'buroPersonaFisica', label: 'Buró de Crédito Persona Física', type: 'select', hasRange: true, rangeType: 'score', rangeOnlyMin: true, options: ['alto-694-760', 'bueno-592-693', 'medio-524-591', 'bajo-490-523', 'malo-456-489'] },
    { id: 'atrasosDeudasBuro', label: 'Atrasos, Deudas, Quitas en Buró', type: 'select', options: ['si', 'no'], hasRange: true, rangeType: 'currency', rangeLabel: 'Monto Máximo Atrasos' },
    { id: 'cuentaConGarantiaFisica', label: 'Cuenta con Garantía', type: 'select', options: ['sin-garantia', 'prendaria', 'hipotecaria'], hasMultiplier: true },
    { id: 'tieneAvalObligadoSolidarioFisica', label: 'Tiene Aval u Obligado Solidario', type: 'select', options: ['si', 'no'] },
    { id: 'creditosVigentes', label: 'Créditos Vigentes', type: 'select', options: ['si', 'no'] },
  ],
  sin_sat: [
    { id: 'nombreComercial', label: 'Nombre Comercial del Negocio', type: 'text' },
    { id: 'industry', label: 'Sector/Industria del Negocio', type: 'text' },
    { id: 'ocupacion', label: 'Ocupación', type: 'select', options: ['empleado', 'profesionista-independiente', 'comerciante', 'prestador-servicios', 'otro'] },
    { id: 'estadoCivil', label: 'Estado Civil', type: 'select', options: ['soltero', 'casado', 'divorciado', 'viudo', 'union-libre'] },
    { id: 'nivelEducativo', label: 'Nivel Educativo', type: 'select', options: ['primaria', 'secundaria', 'preparatoria', 'licenciatura', 'maestria', 'doctorado'] },
    { id: 'tipoVivienda', label: 'Tipo de Vivienda', type: 'select', options: ['propia', 'rentada', 'familiar', 'hipotecada'] },
    { id: 'dependientesEconomicos', label: 'Dependientes Económicos', type: 'number' },
    { id: 'puesto', label: 'Puesto', type: 'text' },
    { id: 'ingresoMensualPromedioComprobablesSinSat', label: 'Ingreso Mensual Promedio Comprobables (últimos 6 meses)', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: true },
    { id: 'ingresoMensualPromedioNoComprobablesSinSat', label: 'Ingreso Mensual Promedio No Comprobables (últimos 6 meses)', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: true },
    { id: 'gastosFijosMensualesPromedioSinSat', label: 'Gastos Fijos Mensuales Promedio (últimos 6 meses)', type: 'currency', hasRange: true, rangeType: 'currency', rangeOnlyMin: false },
    { id: 'buroPersonaFisicaSinSat', label: 'Buró de Crédito Persona Física', type: 'select', options: ['si', 'no'] },
    { id: 'atrasosDeudasBuroSinSat', label: 'Atrasos, Deudas, Quitas en Buró', type: 'select', options: ['si', 'no'], hasRange: true, rangeType: 'currency', rangeLabel: 'Monto Máximo Atrasos' },
    { id: 'cuentaConGarantiaSinSat', label: 'Cuenta con Garantía', type: 'select', options: ['sin-garantia', 'prendaria', 'hipotecaria'], hasMultiplier: true },
    { id: 'tieneAvalObligadoSolidarioSinSat', label: 'Tiene Aval u Obligado Solidario', type: 'select', options: ['si', 'no'] },
    { id: 'creditosVigentes', label: 'Créditos Vigentes', type: 'select', options: ['si', 'no'] },
  ],
};

// Schema for updating financial institution data
const updateFinancieraSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  acceptedProfiles: z.array(z.enum(["persona_moral", "fisica_empresarial", "fisica", "sin_sat"])).optional(),
  contactPerson: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  street: z.string().min(1, "La calle es requerida"),
  number: z.string().min(1, "El número es requerido"),
  interior: z.string().optional(),
  city: z.string().min(1, "La ciudad es requerida"),
  postalCode: z.string().min(5, "El código postal debe tener al menos 5 dígitos"),
  state: z.string().min(1, "El estado es requerido"),
  isActive: z.boolean(),
});

type UpdateFinancieraData = z.infer<typeof updateFinancieraSchema>;

// Local interfaces for configuration system (not in schema yet)
interface ConfigField {
  id: string;
  tabKey: string;
  key: string;
  label: string;
  type: string;
  description?: string;
  entityScope: string[];
  isRequired: boolean;
  isReusable: boolean;
  status: string;
  order: number;
  options?: unknown;
  validation?: unknown;
  defaultValue?: unknown;
}

interface InstitutionFieldValue {
  id: string;
  institutionId: string;
  fieldId: string;
  value: any;
  isEnabled: boolean;
}

interface ProductConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  financiera: FinancialInstitution;
  onSave?: (data: any) => void;
}

interface UploadedDocument {
  id: string;
  type: string;
  fileName: string;
  uploadDate: string;
}

// Tab configuration mapping
const TAB_CONFIG = {
  'basic': { label: 'Configuración Básica', icon: Settings },
  'commissions': { label: 'Comisiones', icon: DollarSign },
  'requirements': { label: 'Requisitos', icon: FileText },
  'products': { label: 'Productos', icon: Package },
  'expediente': { label: 'Expediente', icon: FileText },
};

export default function ProductConfigurationModal({ 
  isOpen, 
  onClose, 
  financiera, 
  onSave 
}: ProductConfigurationModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('basic');
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showCustomDocModal, setShowCustomDocModal] = useState(false);
  const [customDocumentName, setCustomDocumentName] = useState('');
  const [useSameAddress, setUseSameAddress] = useState(false);
  
  // Estados para edición de variables de productos
  const [editingProduct, setEditingProduct] = useState<InstitutionProductWithTemplate | null>(null);
  const [showVariableEditModal, setShowVariableEditModal] = useState(false);
  const [editableVariables, setEditableVariables] = useState<any[]>([]);
  
  // Estado para variables mapeadas por ID de producto (para multi-producto)
  const [productVariablesMap, setProductVariablesMap] = useState<Record<string, any[]>>({});
  
  // Estado para dirección fiscal
  const [fiscalAddress, setFiscalAddress] = useState({
    street: '',
    number: '',
    interior: '',
    city: '',
    postalCode: '',
    state: ''
  });

  // Form for financial institution data
  const financieraForm = useForm<UpdateFinancieraData>({
    resolver: zodResolver(updateFinancieraSchema),
    defaultValues: {
      name: financiera.name || '',
      description: (financiera as any).description || '',
      acceptedProfiles: (financiera as any).acceptedProfiles || [],
      contactPerson: financiera.contactPerson || '',
      email: financiera.email || '',
      phone: financiera.phone || '',
      street: financiera.street || '',
      number: financiera.number || '',
      interior: financiera.interior || '',
      city: financiera.city || '',
      postalCode: financiera.postalCode || '',
      state: financiera.state || '',
      isActive: financiera.isActive || false,
    },
  });

  // Mutation to update financial institution data
  const updateFinancieraMutation = useMutation({
    mutationFn: async (data: UpdateFinancieraData) => {
      const response = await apiRequest("PATCH", `/api/financial-institutions/${financiera.id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Datos actualizados",
        description: "Los datos de la financiera se han actualizado exitosamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-institutions"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudieron actualizar los datos",
        variant: "destructive",
      });
    },
  });

  // File upload handler
  const handleFileUpload = async (file: File, documentType: string) => {
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', documentType);
      // Use financial institution ID as clientId for organization
      formData.append('clientId', financiera.id);

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Error al subir el archivo');
      }

      const uploadedDoc = await response.json();
      
      // Add to uploaded documents list
      const newDoc: UploadedDocument = {
        id: uploadedDoc.id,
        type: documentType,
        fileName: file.name,
        uploadDate: new Date().toISOString(),
      };

      setUploadedDocuments(prev => [...prev, newDoc]);

      toast({
        title: "Documento subido",
        description: `${file.name} se ha subido exitosamente.`,
      });

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: "No se pudo subir el archivo. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Trigger file input
  const triggerFileInput = (documentType: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFileUpload(file, documentType);
      }
    };
    input.click();
  };
  
  // Basic config state
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  
  // Commissions state - 12 fields (4 Financiera + 4 Master Broker + 4 Broker)
  const [commissions, setCommissions] = useState({
    financiera: {
      total: (financiera.commissionRates as any)?.financiera?.total || '',
      apertura: (financiera.commissionRates as any)?.financiera?.apertura || '',
      sobretasa: (financiera.commissionRates as any)?.financiera?.sobretasa || '',
      renovacion: (financiera.commissionRates as any)?.financiera?.renovacion || '',
    },
    masterBroker: {
      total: (financiera.commissionRates as any)?.masterBroker?.total || '',
      apertura: (financiera.commissionRates as any)?.masterBroker?.apertura || '',
      sobretasa: (financiera.commissionRates as any)?.masterBroker?.sobretasa || '',
      renovacion: (financiera.commissionRates as any)?.masterBroker?.renovacion || '',
    },
    broker: {
      total: (financiera.commissionRates as any)?.broker?.total || '',
      apertura: (financiera.commissionRates as any)?.broker?.apertura || '',
      sobretasa: (financiera.commissionRates as any)?.broker?.sobretasa || '',
      renovacion: (financiera.commissionRates as any)?.broker?.renovacion || '',
    },
  });
  
  // Requirements state per client type
  const [requirementsClientType, setRequirementsClientType] = useState<'persona_moral' | 'fisica_empresarial' | 'fisica' | 'sin_sat'>('persona_moral');
  const [requirementsByType, setRequirementsByType] = useState({
    persona_moral: (financiera.requirements as any)?.persona_moral?.selected || [],
    fisica_empresarial: (financiera.requirements as any)?.fisica_empresarial?.selected || [],
    fisica: (financiera.requirements as any)?.fisica?.selected || [],
    sin_sat: (financiera.requirements as any)?.sin_sat?.selected || [],
  });
  
  // Ranges state for matching - stores min/max values for each requirement
  const [rangesByType, setRangesByType] = useState({
    persona_moral: (financiera.requirements as any)?.persona_moral?.ranges || {},
    fisica_empresarial: (financiera.requirements as any)?.fisica_empresarial?.ranges || {},
    fisica: (financiera.requirements as any)?.fisica?.ranges || {},
    sin_sat: (financiera.requirements as any)?.sin_sat?.ranges || {},
  });
  
  // Additional notes state for requirements
  const [additionalNotesByType, setAdditionalNotesByType] = useState({
    persona_moral: (financiera.requirements as any)?.persona_moral?.additionalNotes || '',
    fisica_empresarial: (financiera.requirements as any)?.fisica_empresarial?.additionalNotes || '',
    fisica: (financiera.requirements as any)?.fisica?.additionalNotes || '',
    sin_sat: (financiera.requirements as any)?.sin_sat?.additionalNotes || '',
  });
  
  // Variables state
  const [activeVariables, setActiveVariables] = useState<any[]>([]);

  // Configuration system state
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});

  // Load config fields for current tab from central catalog
  const { data: configFields = [], isLoading: fieldsLoading } = useQuery<ConfigField[]>({
    queryKey: [`/api/config/fields?tabKey=${activeTab}&entityScope=institution`],
    enabled: isOpen && !!activeTab,
  });

  // Load existing field values for this institution
  const { data: institutionValues = [], isLoading: valuesLoading } = useQuery<InstitutionFieldValue[]>({
    queryKey: [`/api/config/institution-field-values?institutionId=${financiera.id}`],
    enabled: isOpen && !!financiera.id,
  });

  // Load institution products (assigned templates) for this specific financiera
  const { data: institutionProducts = [], isLoading: productsLoading } = useQuery<InstitutionProductWithTemplate[]>({
    queryKey: [`/api/institution-products?institutionId=${financiera.id}`],
    enabled: isOpen && !!financiera.id,
  });

  // Initialize product variables map when institution products load
  useEffect(() => {
    if (institutionProducts.length > 0) {
      setProductVariablesMap(prevMap => {
        const newMap: Record<string, any[]> = {};
        
        institutionProducts.forEach(product => {
          const serverVariables = Array.isArray(product.activeVariables) && product.activeVariables.length > 0
            ? product.activeVariables
            : [];
          
          // Preferir datos del servidor como fuente de verdad
          // Solo preservar cambios locales si el producto está siendo editado actualmente
          if (editingProduct && editingProduct.id === product.id) {
            // Producto siendo editado: preservar variables editables actuales
            newMap[product.id] = editableVariables.length > 0 ? editableVariables : serverVariables;
          } else {
            // Producto no siendo editado: usar datos del servidor (fuente de verdad)
            newMap[product.id] = serverVariables;
          }
        });
        
        return newMap;
      });
    }
  }, [institutionProducts, editingProduct, editableVariables]);

  // Initialize field values when data loads
  useEffect(() => {
    if (institutionValues.length > 0) {
      const valueMap: Record<string, any> = {};
      institutionValues.forEach(item => {
        valueMap[item.fieldId] = item.value;
      });
      setFieldValues(valueMap);
    }
  }, [institutionValues]);

  // Save field value mutation
  const saveFieldValueMutation = useMutation({
    mutationFn: async ({ fieldId, value, isEnabled }: { fieldId: string; value: any; isEnabled: boolean }) => {
      // Check if value already exists
      const existingValue = institutionValues.find(item => item.fieldId === fieldId);
      
      if (existingValue) {
        // Update existing value
        return apiRequest('PATCH', `/api/config/institution-field-values/${existingValue.id}`, {
          value,
          isEnabled,
        });
      } else {
        // Create new value
        return apiRequest('POST', '/api/config/institution-field-values', {
          institutionId: financiera.id,
          fieldId,
          value,
          isEnabled,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/config/institution-field-values?institutionId=${financiera.id}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar el valor del campo",
        variant: "destructive",
      });
    },
  });

  // Handle field value change
  const handleFieldValueChange = (fieldId: string, value: any) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
    
    // Auto-save field value (debounced)
    saveFieldValueMutation.mutate({
      fieldId,
      value,
      isEnabled: true,
    });
  };

  // Update mutation - Real backend endpoint with validation
  const updateCommissionsMutation = useMutation({
    mutationFn: async (commissionData: any) => {
      // Validate and convert to numbers
      const validatePercentage = (value: any, fieldName: string): number => {
        const trimmed = String(value).trim();
        if (trimmed === '' || trimmed === null || trimmed === undefined) {
          return 0; // Empty values default to 0
        }
        
        const num = parseFloat(trimmed);
        if (isNaN(num)) {
          throw new Error(`${fieldName}: "${value}" no es un número válido.`);
        }
        if (num < 0 || num > 100) {
          throw new Error(`${fieldName}: ${num}% fuera de rango. Debe estar entre 0 y 100.`);
        }
        return num;
      };

      const validatedData = {
        financiera: {
          total: validatePercentage(commissionData.financiera?.total || 0, 'Financiera Total'),
          apertura: validatePercentage(commissionData.financiera?.apertura || 0, 'Financiera Apertura'),
          sobretasa: validatePercentage(commissionData.financiera?.sobretasa || 0, 'Financiera Sobretasa'),
          renovacion: validatePercentage(commissionData.financiera?.renovacion || 0, 'Financiera Renovación'),
        },
        masterBroker: {
          total: validatePercentage(commissionData.masterBroker.total, 'MB Total'),
          apertura: validatePercentage(commissionData.masterBroker.apertura, 'MB Apertura'),
          sobretasa: validatePercentage(commissionData.masterBroker.sobretasa, 'MB Sobretasa'),
          renovacion: validatePercentage(commissionData.masterBroker.renovacion, 'MB Renovación'),
        },
        broker: {
          total: validatePercentage(commissionData.broker.total, 'Broker Total'),
          apertura: validatePercentage(commissionData.broker.apertura, 'Broker Apertura'),
          sobretasa: validatePercentage(commissionData.broker.sobretasa, 'Broker Sobretasa'),
          renovacion: validatePercentage(commissionData.broker.renovacion, 'Broker Renovación'),
        },
      };

      const response = await apiRequest('PATCH', `/api/financial-institutions/${financiera.id}`, {
        commissionRates: validatedData,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/financial-institutions'] });
      toast({
        title: "Comisiones guardadas",
        description: `Tasas de comisión para ${financiera.name} guardadas exitosamente`,
      });
      onSave?.(data);
    },
    onError: (error: any) => {
      toast({
        title: "Error de validación",
        description: error.message || "No se pudo guardar las comisiones",
        variant: "destructive",
      });
    },
  });

  const handleSaveCommissions = () => {
    updateCommissionsMutation.mutate(commissions);
  };

  const handleRequirementToggle = (fieldId: string) => {
    setRequirementsByType(prev => {
      const currentList = prev[requirementsClientType];
      const newList = currentList.includes(fieldId)
        ? currentList.filter((id: string) => id !== fieldId)
        : [...currentList, fieldId];
      return { ...prev, [requirementsClientType]: newList };
    });
  };
  
  const handleRangeChange = (fieldId: string, rangeType: 'min' | 'max' | 'multiplier' | 'maxThreshold' | 'acceptanceMode', value: string) => {
    setRangesByType(prev => {
      const currentRanges = prev[requirementsClientType];
      const fieldRange = currentRanges[fieldId] || {};
      
      return {
        ...prev,
        [requirementsClientType]: {
          ...currentRanges,
          [fieldId]: {
            ...fieldRange,
            [rangeType]: value,
          },
        },
      };
    });
  };

  // Save requirements mutation
  const updateRequirementsMutation = useMutation({
    mutationFn: async (requirementsData: any) => {
      const response = await apiRequest('PATCH', `/api/financial-institutions/${financiera.id}`, {
        requirements: requirementsData,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/financial-institutions'] });
      toast({
        title: "Requisitos guardados",
        description: `Requisitos para ${financiera.name} guardados exitosamente`,
      });
      onSave?.(data);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar los requisitos",
        variant: "destructive",
      });
    },
  });

  const handleSaveRequirements = () => {
    const requirementsData = {
      persona_moral: { 
        selected: requirementsByType.persona_moral,
        ranges: rangesByType.persona_moral,
        additionalNotes: additionalNotesByType.persona_moral,
      },
      fisica_empresarial: { 
        selected: requirementsByType.fisica_empresarial,
        ranges: rangesByType.fisica_empresarial,
        additionalNotes: additionalNotesByType.fisica_empresarial,
      },
      fisica: { 
        selected: requirementsByType.fisica,
        ranges: rangesByType.fisica,
        additionalNotes: additionalNotesByType.fisica,
      },
      sin_sat: { 
        selected: requirementsByType.sin_sat,
        ranges: rangesByType.sin_sat,
        additionalNotes: additionalNotesByType.sin_sat,
      },
    };
    updateRequirementsMutation.mutate(requirementsData);
  };

  // Handler para editar variables de un producto específico
  const handleEditProductVariables = (product: InstitutionProductWithTemplate) => {
    setEditingProduct(product);
    
    // Usar productVariablesMap como fuente de verdad, fallback a product data
    const variablesFromMap = productVariablesMap[product.id];
    const variablesToEdit = variablesFromMap && variablesFromMap.length > 0
      ? variablesFromMap
      : (Array.isArray(product.activeVariables) && product.activeVariables.length > 0 
          ? product.activeVariables 
          : Array.isArray(product.template?.availableVariables) ? product.template.availableVariables : []);
    
    setEditableVariables(variablesToEdit);
    setShowVariableEditModal(true);
  };

  // Mutation para toggle del estado activo/inactivo de un producto
  const toggleProductStatusMutation = useMutation({
    mutationFn: async ({ productId, isActive }: { productId: string; isActive: boolean }) => {
      const response = await apiRequest("PUT", `/api/institution-products/${productId}`, {
        isActive
      });
      if (!response.ok) {
        throw new Error('Error al actualizar el estado del producto');
      }
      return { productId, isActive };
    },
    onMutate: async ({ productId, isActive }) => {
      // Cancelar queries pendientes para evitar conflictos
      await queryClient.cancelQueries({ 
        queryKey: [`/api/institution-products?institutionId=${financiera.id}`] 
      });

      // Snapshot del estado anterior para rollback
      const previousData = queryClient.getQueryData<InstitutionProductWithTemplate[]>(
        [`/api/institution-products?institutionId=${financiera.id}`]
      );

      // Actualización optimista del cache
      queryClient.setQueryData(
        [`/api/institution-products?institutionId=${financiera.id}`],
        (oldData: InstitutionProductWithTemplate[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map(product => 
            product.id === productId 
              ? { ...product, isActive }
              : product
          );
        }
      );

      return { previousData };
    },
    onSuccess: ({ isActive }) => {
      toast({
        title: "Estado actualizado",
        description: `El producto ha sido ${isActive ? 'activado' : 'desactivado'} exitosamente.`,
      });
    },
    onError: (error: any, variables, context) => {
      // Revertir al estado anterior usando el snapshot
      if (context?.previousData) {
        queryClient.setQueryData(
          [`/api/institution-products?institutionId=${financiera.id}`],
          context.previousData
        );
      }
      
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el estado del producto",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Siempre refrescar los datos del servidor al final
      queryClient.invalidateQueries({ 
        queryKey: [`/api/institution-products?institutionId=${financiera.id}`],
        refetchType: 'all' // Forzar refetch independientemente del estado activo
      });
    },
  });

  // Handler simplificado que usa la mutation
  const handleToggleProductStatus = (productId: string, isActive: boolean) => {
    toggleProductStatusMutation.mutate({ productId, isActive });
  };

  // Handler para guardar variables editadas de un producto
  const handleSaveProductVariables = async (updatedVariables: any[]) => {
    if (!editingProduct) return;

    try {
      const response = await apiRequest("PUT", `/api/institution-products/${editingProduct.id}`, {
        activeVariables: updatedVariables
      });

      if (response.ok) {
        const updatedProduct = await response.json();
        
        toast({
          title: "Variables actualizadas",
          description: `Las variables del producto ${editingProduct.customName || editingProduct.template?.name || 'producto'} se han actualizado exitosamente.`,
        });
        
        // Actualizar mapa de variables por producto (no sobrescribir - merge)
        setProductVariablesMap(prev => ({
          ...prev,
          [editingProduct.id]: updatedVariables
        }));
        
        // Actualizar el cache de react-query con los datos del servidor
        queryClient.setQueryData(
          [`/api/institution-products?institutionId=${financiera.id}`],
          (oldData: InstitutionProductWithTemplate[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.map(product => 
              product.id === editingProduct.id 
                ? { ...product, activeVariables: updatedVariables }
                : product
            );
          }
        );
        
        // Actualizar estado local del modal para reflejar cambios inmediatamente
        setEditingProduct(prev => prev ? { ...prev, activeVariables: updatedVariables } : null);
        
        // Cerrar modal
        setShowVariableEditModal(false);
        setEditingProduct(null);
        setEditableVariables([]);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudieron actualizar las variables",
        variant: "destructive",
      });
    }
  };

  // Render central config fields section
  const renderCentralConfigSection = () => {
    if (configFields.length === 0) return null;

    return (
      <div className="space-y-4">
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center space-x-2 mb-4">
            <Settings className="w-5 h-5 text-blue-600" />
            <h4 className="font-medium text-gray-900">Campos del Catálogo Central</h4>
            <Badge variant="outline" className="text-xs">
              {configFields.length} campos disponibles
            </Badge>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Configura los valores específicos para {financiera.name} usando campos del catálogo central.
          </p>
          
          {fieldsLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {configFields.map(field => renderConfigField(field))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render dynamic field from catalog
  const renderConfigField = (field: ConfigField) => {
    const currentValue = fieldValues[field.id] || field.defaultValue || '';

    const renderFieldInput = () => {
      switch (field.type) {
        case 'text':
          return (
            <Input
              value={currentValue}
              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
              placeholder={field.description}
              data-testid={`input-config-field-${field.key}`}
            />
          );
        
        case 'number':
        case 'currency':
          return (
            <Input
              type="number"
              value={currentValue}
              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
              placeholder={field.description}
              data-testid={`input-config-field-${field.key}`}
            />
          );
        
        case 'textarea':
          return (
            <Textarea
              value={currentValue}
              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
              placeholder={field.description}
              rows={3}
              data-testid={`textarea-config-field-${field.key}`}
            />
          );
        
        case 'select':
          const options = field.options as string[] || [];
          return (
            <Select 
              value={currentValue}
              onValueChange={(value) => handleFieldValueChange(field.id, value)}
            >
              <SelectTrigger data-testid={`select-config-field-${field.key}`}>
                <SelectValue placeholder={`Seleccionar ${field.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {options.map(option => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        
        case 'checkbox':
          return (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={Boolean(currentValue)}
                onChange={(e) => handleFieldValueChange(field.id, e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                data-testid={`checkbox-config-field-${field.key}`}
              />
              <Label className="text-sm">{field.description || 'Activar'}</Label>
            </div>
          );
        
        default:
          return (
            <Input
              value={currentValue}
              onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
              placeholder={field.description}
              data-testid={`input-config-field-${field.key}`}
            />
          );
      }
    };

    return (
      <Card key={field.id} className="border border-gray-200">
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium text-gray-900">{field.label}</Label>
                {field.isRequired && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    Obligatorio
                  </Badge>
                )}
              </div>
              <Badge variant="outline" className="text-xs">
                {field.type}
              </Badge>
            </div>
            
            {field.description && (
              <p className="text-sm text-gray-600">{field.description}</p>
            )}
            
            {renderFieldInput()}
            
            <div className="text-xs text-gray-500">
              Clave: <span className="font-mono bg-gray-100 px-1 rounded">{field.key}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Configurar Productos - {financiera.name}
          </DialogTitle>
          <p className="text-sm text-gray-600">
            Personaliza la configuración de productos para esta financiera
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
                <Settings className="w-4 h-4 inline mr-1" />
                Configuración Básica
              </button>
              <button
                onClick={() => setActiveTab('expediente')}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'expediente'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                data-testid="tab-expediente"
              >
                <FileText className="w-4 h-4 inline mr-1" />
                Expediente
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
                <DollarSign className="w-4 h-4 inline mr-1" />
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
                <CheckCircle className="w-4 h-4 inline mr-1" />
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
                <Package className="w-4 h-4 inline mr-1" />
                Productos
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {/* Formulario React Hook Form para editar datos de la financiera */}
              <Form {...financieraForm}>
                <form onSubmit={financieraForm.handleSubmit((data) => updateFinancieraMutation.mutate(data))} className="space-y-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <div className="flex items-center space-x-2 mb-6">
                      <Settings className="w-5 h-5 text-blue-600" />
                      <h4 className="text-lg font-semibold text-gray-900">Configuración Básica</h4>
                    </div>
                    
                    {/* Información General */}
                    <div className="mb-8">
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-3 rounded-lg mb-6">
                        <h5 className="text-lg font-semibold text-blue-800 flex items-center">
                          <i className="fas fa-building text-blue-600 mr-3 text-xl"></i>
                          Información General
                        </h5>
                      </div>
                      <div className="grid grid-cols-1 gap-6">
                        <div className="grid grid-cols-1">
                          <FormField
                            control={financieraForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium text-gray-700">Nombre de la Institución</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Nombre de la financiera"
                                    data-testid="input-institution-name"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <div className="grid grid-cols-1">
                          <FormField
                            control={financieraForm.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium text-gray-700">Descripción (Opcional)</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Breve descripción de la financiera y sus servicios"
                                    rows={2}
                                    data-testid="textarea-institution-description"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-1">
                          <FormField
                            control={financieraForm.control}
                            name="acceptedProfiles"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium text-gray-700">Perfiles de Cliente Aceptados *</FormLabel>
                                <div className="text-xs text-gray-500 mb-3">
                                  Selecciona los tipos de cliente que esta financiera acepta globalmente
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  {[
                                    { value: 'persona_moral', label: 'PM', color: 'bg-blue-100 text-blue-700 border-blue-300' },
                                    { value: 'fisica_empresarial', label: 'PFAE', color: 'bg-green-100 text-green-700 border-green-300' },
                                    { value: 'fisica', label: 'PF', color: 'bg-orange-100 text-orange-700 border-orange-300' },
                                    { value: 'sin_sat', label: 'Sin SAT', color: 'bg-gray-100 text-gray-700 border-gray-300' },
                                  ].map((profile) => (
                                    <label
                                      key={profile.value}
                                      className={`flex items-center space-x-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                        field.value?.includes(profile.value)
                                          ? `${profile.color} border-current`
                                          : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                                      }`}
                                      data-testid={`checkbox-profile-${profile.value}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={field.value?.includes(profile.value as any)}
                                        onChange={(e) => {
                                          const currentValue = field.value || [];
                                          if (e.target.checked) {
                                            field.onChange([...currentValue, profile.value as any]);
                                          } else {
                                            field.onChange(currentValue.filter((v: string) => v !== profile.value));
                                          }
                                        }}
                                        className="w-4 h-4"
                                      />
                                      <span className="font-medium">{profile.label}</span>
                                    </label>
                                  ))}
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                      </div>
                    </div>

                    {/* Información de Contacto */}
                    <div className="mb-8">
                      <div className="bg-gradient-to-r from-green-50 to-green-100 px-4 py-3 rounded-lg mb-6">
                        <h5 className="text-lg font-semibold text-green-800 flex items-center">
                          <i className="fas fa-user text-green-600 mr-3 text-xl"></i>
                          Información de Contacto
                        </h5>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <FormField
                            control={financieraForm.control}
                            name="contactPerson"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Persona de Contacto</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Nombre del contacto principal"
                                    data-testid="input-contact-person"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <div className="space-y-4">
                          <FormField
                            control={financieraForm.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Teléfono</FormLabel>
                                <FormControl>
                                  <Input
                                    type="tel"
                                    placeholder="555-1234567"
                                    data-testid="input-institution-phone"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        
                        <div className="md:col-span-2">
                          <FormField
                            control={financieraForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input
                                    type="email"
                                    placeholder="correo@financiera.com"
                                    data-testid="input-institution-email"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Dirección */}
                    <div className="mb-8">
                      <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-4 py-3 rounded-lg mb-6">
                        <h5 className="text-lg font-semibold text-purple-800 flex items-center">
                          <i className="fas fa-map-marker-alt text-purple-600 mr-3 text-xl"></i>
                          Dirección
                        </h5>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                          <FormField
                            control={financieraForm.control}
                            name="street"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Calle</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Nombre de la calle"
                                    data-testid="input-street"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div>
                          <FormField
                            control={financieraForm.control}
                            name="number"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Número</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="123"
                                    data-testid="input-number"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div>
                          <FormField
                            control={financieraForm.control}
                            name="interior"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Interior (Opcional)</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Depto 4B"
                                    data-testid="input-interior"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div>
                          <FormField
                            control={financieraForm.control}
                            name="city"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Ciudad</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Ciudad"
                                    data-testid="input-city"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div>
                          <FormField
                            control={financieraForm.control}
                            name="postalCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Código Postal</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="12345"
                                    data-testid="input-postal-code"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div>
                          <FormField
                            control={financieraForm.control}
                            name="state"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Estado</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Estado"
                                    data-testid="input-state"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Datos de Facturación */}
                    <div className="mb-8">
                      <div className="bg-gradient-to-r from-orange-50 to-orange-100 px-4 py-3 rounded-lg mb-6">
                        <h5 className="text-lg font-semibold text-orange-800 flex items-center">
                          <i className="fas fa-file-invoice text-orange-600 mr-3 text-xl"></i>
                          Datos de Facturación
                        </h5>
                      </div>
                      
                      {/* Botón Misma Dirección */}
                      <div className="mb-6">
                        <div className="flex items-center space-x-3">
                          <div 
                            className={`flex items-center space-x-2 cursor-pointer p-2 rounded-md transition-colors ${
                              useSameAddress ? 'bg-blue-50' : 'hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setUseSameAddress(!useSameAddress);
                              if (!useSameAddress) {
                                // Copy physical address to fiscal address
                                const formValues = financieraForm.getValues();
                                setFiscalAddress({
                                  street: formValues.street || '',
                                  number: formValues.number || '',
                                  interior: formValues.interior || '',
                                  city: formValues.city || '',
                                  postalCode: formValues.postalCode || '',
                                  state: formValues.state || ''
                                });
                                toast({
                                  title: "Dirección copiada",
                                  description: "La dirección física se ha copiado a la dirección fiscal.",
                                });
                              } else {
                                // Clear fiscal address when unchecked
                                setFiscalAddress({
                                  street: '',
                                  number: '',
                                  interior: '',
                                  city: '',
                                  postalCode: '',
                                  state: ''
                                });
                              }
                            }}
                            data-testid="button-same-address"
                          >
                            <div 
                              className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-colors ${
                                useSameAddress 
                                  ? 'border-blue-500 bg-blue-500' 
                                  : 'border-gray-400 bg-white'
                              }`}
                            >
                              {useSameAddress && (
                                <i className="fas fa-check text-white text-xs"></i>
                              )}
                            </div>
                            <span className={`text-sm font-medium transition-colors ${
                              useSameAddress ? 'text-blue-700' : 'text-gray-600'
                            }`}>
                              Misma Dirección
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="rfc">RFC</Label>
                            <Input
                              id="rfc"
                              placeholder="Ej: ABC123456DE1"
                              data-testid="input-rfc"
                            />
                          </div>
                          <div>
                            <Label htmlFor="razon-social">Razón Social</Label>
                            <Input
                              id="razon-social"
                              placeholder="Nombre fiscal de la empresa"
                              data-testid="input-razon-social"
                            />
                          </div>
                          <div>
                            <Label htmlFor="regimen-fiscal">Régimen Fiscal</Label>
                            <Input
                              id="regimen-fiscal"
                              placeholder="Ej: General de Ley Personas Morales"
                              data-testid="input-regimen-fiscal"
                            />
                          </div>
                          <div>
                            <Label htmlFor="uso-cfdi">Uso CFDI</Label>
                            <Input
                              id="uso-cfdi"
                              placeholder="Ej: G03 - Gastos en general"
                              data-testid="input-uso-cfdi"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="forma-pago">Forma de Pago</Label>
                            <Input
                              id="forma-pago"
                              placeholder="Ej: 03 - Transferencia electrónica"
                              data-testid="input-forma-pago"
                            />
                          </div>
                          <div>
                            <Label htmlFor="metodo-pago">Método de Pago</Label>
                            <Input
                              id="metodo-pago"
                              placeholder="Ej: PUE - Pago en una sola exhibición"
                              data-testid="input-metodo-pago"
                            />
                          </div>
                          <div>
                            <Label htmlFor="correo-facturacion">Correo de Facturación</Label>
                            <Input
                              id="correo-facturacion"
                              type="email"
                              placeholder="facturacion@financiera.com"
                              data-testid="input-correo-facturacion"
                            />
                          </div>
                          <div>
                            <Label htmlFor="terminos-pago">Términos de Pago</Label>
                            <Input
                              id="terminos-pago"
                              placeholder="Ej: 30 días"
                              data-testid="input-terminos-pago"
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Dirección Fiscal */}
                      <div className="mt-8">
                        <div className="mb-3">
                          <Label className="text-sm font-medium text-gray-700">Dirección Fiscal</Label>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="fiscal-street">Calle</Label>
                            <Input
                              id="fiscal-street"
                              placeholder="Nombre de la calle"
                              value={fiscalAddress.street}
                              onChange={(e) => setFiscalAddress(prev => ({ ...prev, street: e.target.value }))}
                              disabled={useSameAddress}
                              data-testid="input-fiscal-street"
                            />
                          </div>
                          <div>
                            <Label htmlFor="fiscal-number">Número</Label>
                            <Input
                              id="fiscal-number"
                              placeholder="123"
                              value={fiscalAddress.number}
                              onChange={(e) => setFiscalAddress(prev => ({ ...prev, number: e.target.value }))}
                              disabled={useSameAddress}
                              data-testid="input-fiscal-number"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <Label htmlFor="fiscal-interior">Interior</Label>
                            <Input
                              id="fiscal-interior"
                              placeholder="Depto 4B"
                              value={fiscalAddress.interior}
                              onChange={(e) => setFiscalAddress(prev => ({ ...prev, interior: e.target.value }))}
                              disabled={useSameAddress}
                              data-testid="input-fiscal-interior"
                            />
                          </div>
                          <div>
                            <Label htmlFor="fiscal-city">Ciudad</Label>
                            <Input
                              id="fiscal-city"
                              placeholder="Ciudad"
                              value={fiscalAddress.city}
                              onChange={(e) => setFiscalAddress(prev => ({ ...prev, city: e.target.value }))}
                              disabled={useSameAddress}
                              data-testid="input-fiscal-city"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <Label htmlFor="fiscal-postal-code">Código Postal</Label>
                            <Input
                              id="fiscal-postal-code"
                              placeholder="12345"
                              value={fiscalAddress.postalCode}
                              onChange={(e) => setFiscalAddress(prev => ({ ...prev, postalCode: e.target.value }))}
                              disabled={useSameAddress}
                              data-testid="input-fiscal-postal-code"
                            />
                          </div>
                          <div>
                            <Label htmlFor="fiscal-state">Estado</Label>
                            <Input
                              id="fiscal-state"
                              placeholder="Estado"
                              value={fiscalAddress.state}
                              onChange={(e) => setFiscalAddress(prev => ({ ...prev, state: e.target.value }))}
                              disabled={useSameAddress}
                              data-testid="input-fiscal-state"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                  
                  {/* Botón de Guardar */}
                  <div className="flex justify-end pt-6 border-t border-gray-200">
                    <Button 
                      type="submit"
                      disabled={updateFinancieraMutation.isPending}
                      data-testid="button-save-basic-config"
                    >
                      {updateFinancieraMutation.isPending ? 'Guardando...' : 'Guardar Configuración Básica'}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}

          {activeTab === 'expediente' && (
            <div className="space-y-6">
              {/* Tab Expediente con documentos */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center space-x-2 mb-6">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h4 className="text-lg font-semibold text-gray-900">Expediente de la Financiera</h4>
                  <Badge variant="outline" className="text-xs">Documentos requeridos</Badge>
                </div>
                
                {/* Documentos por defecto */}
                <div className="mb-8">
                  <h5 className="text-md font-medium text-gray-800 mb-4 border-b border-gray-100 pb-2">
                    <i className="fas fa-file-alt text-blue-500 mr-2"></i>
                    Documentos Obligatorios
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
                      <i className="fas fa-file-contract text-4xl text-gray-400 mb-2"></i>
                      <p className="text-sm text-gray-600 mb-2 font-medium">Contrato</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => triggerFileInput('contrato')}
                        disabled={isUploading}
                        data-testid="button-upload-contrato"
                      >
                        <i className={isUploading ? "fas fa-spinner fa-spin mr-2" : "fas fa-upload mr-2"}></i>
                        {isUploading ? 'Subiendo...' : 'Subir Contrato'}
                      </Button>
                    </div>
                    
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
                      <i className="fas fa-home text-4xl text-gray-400 mb-2"></i>
                      <p className="text-sm text-gray-600 mb-2 font-medium">Comprobante de Domicilio</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => triggerFileInput('comprobante_domicilio')}
                        disabled={isUploading}
                        data-testid="button-upload-comprobante"
                      >
                        <i className={isUploading ? "fas fa-spinner fa-spin mr-2" : "fas fa-upload mr-2"}></i>
                        {isUploading ? 'Subiendo...' : 'Subir Comprobante'}
                      </Button>
                    </div>
                    
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
                      <i className="fas fa-file-invoice text-4xl text-gray-400 mb-2"></i>
                      <p className="text-sm text-gray-600 mb-2 font-medium">Constancia de Situación Fiscal</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => triggerFileInput('csf')}
                        disabled={isUploading}
                        data-testid="button-upload-csf"
                      >
                        <i className={isUploading ? "fas fa-spinner fa-spin mr-2" : "fas fa-upload mr-2"}></i>
                        {isUploading ? 'Subiendo...' : 'Subir CSF'}
                      </Button>
                    </div>
                  </div>
                </div>
                
                {/* Documentos adicionales */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h5 className="text-md font-medium text-gray-800 border-b border-gray-100 pb-2">
                      <i className="fas fa-plus-circle text-blue-500 mr-2"></i>
                      Documentos Adicionales
                    </h5>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCustomDocModal(true)}
                      data-testid="button-add-custom-document"
                    >
                      <i className="fas fa-plus mr-2"></i>
                      Agregar Documento
                    </Button>
                  </div>
                  
                  {/* Lista de documentos adicionales (vacía por ahora) */}
                  <div className="text-center py-8 text-gray-500">
                    <i className="fas fa-folder-open text-4xl mb-3"></i>
                    <p className="text-sm">No hay documentos adicionales agregados</p>
                    <p className="text-xs text-gray-400 mt-1">Use el botón "Agregar Documento" para incluir documentos personalizados</p>
                  </div>
                </div>
                
                {/* Información importante */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start space-x-2">
                    <i className="fas fa-info-circle text-blue-600 mt-0.5"></i>
                    <div>
                      <p className="text-sm text-blue-800 font-medium">Documentos del Expediente</p>
                      <p className="text-xs text-blue-700 mt-1">
                        Estos documentos son necesarios para el expediente completo de la financiera. 
                        Se utilizan para validación y cumplimiento normativo.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'basic_old' && (
            <div className="space-y-6">
              {/* Sección 1: Datos Generales */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Settings className="w-5 h-5 text-blue-600" />
                  <h4 className="font-medium text-gray-900">Datos Generales</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="product-name">Nombre de Configuración</Label>
                      <Input
                        id="product-name"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        placeholder="Ej: Configuración BCM 2024"
                        data-testid="input-product-name"
                      />
                    </div>
                    
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="product-description">Descripción</Label>
                      <Textarea
                        id="product-description"
                        value={productDescription}
                        onChange={(e) => setProductDescription(e.target.value)}
                        placeholder="Descripción de la configuración específica para esta financiera"
                        rows={4}
                        data-testid="textarea-product-description"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección 2: Dirección */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <i className="fas fa-map-marker-alt text-green-600"></i>
                  <h4 className="font-medium text-gray-900">Dirección</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm bg-gray-50 rounded-lg p-4">
                  <div>
                    <span className="text-gray-500">Calle:</span>
                    <span className="ml-2 font-medium">{financiera.street || 'No definida'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Número:</span>
                    <span className="ml-2 font-medium">{financiera.number || 'No definido'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Interior:</span>
                    <span className="ml-2 font-medium">{financiera.interior || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Ciudad:</span>
                    <span className="ml-2 font-medium">{financiera.city || 'No definida'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Código Postal:</span>
                    <span className="ml-2 font-medium">{financiera.postalCode || 'No definido'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Estado:</span>
                    <span className="ml-2 font-medium">{financiera.state || 'No definido'}</span>
                  </div>
                </div>
              </div>

              {/* Sección 3: Contacto */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <i className="fas fa-phone text-purple-600"></i>
                  <h4 className="font-medium text-gray-900">Información de Contacto</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-gray-50 rounded-lg p-4">
                  <div>
                    <span className="text-gray-500">Nombre:</span>
                    <span className="ml-2 font-medium">{financiera.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Persona de Contacto:</span>
                    <span className="ml-2 font-medium">{financiera.contactPerson || 'No asignado'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Email:</span>
                    <span className="ml-2 font-medium">{financiera.email || 'No proporcionado'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Teléfono:</span>
                    <span className="ml-2 font-medium">{financiera.phone || 'No proporcionado'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Estado:</span>
                    <Badge 
                      variant={financiera.isActive ? "default" : "secondary"}
                      className={financiera.isActive ? "bg-green-100 text-green-800" : ""}
                    >
                      {financiera.isActive ? "Activa" : "Inactiva"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Sección 4: Datos de Facturación */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <i className="fas fa-file-invoice text-orange-600"></i>
                  <h4 className="font-medium text-gray-900">Datos de Facturación</h4>
                  <Badge variant="outline" className="text-xs">Para emisión de CFDIs</Badge>
                </div>
                
                {/* Botón Misma Dirección */}
                <div className="mb-6">
                  <div className="flex items-center space-x-3">
                    <div 
                      className={`flex items-center space-x-2 cursor-pointer p-2 rounded-md transition-colors ${
                        useSameAddress ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        setUseSameAddress(!useSameAddress);
                        if (!useSameAddress) {
                          // Copy physical address to fiscal address
                          const formValues = financieraForm.getValues();
                          setFiscalAddress({
                            street: formValues.street || '',
                            number: formValues.number || '',
                            interior: formValues.interior || '',
                            city: formValues.city || '',
                            postalCode: formValues.postalCode || '',
                            state: formValues.state || ''
                          });
                          toast({
                            title: "Dirección copiada",
                            description: "La dirección física se ha copiado a la dirección fiscal.",
                          });
                        } else {
                          // Clear fiscal address when unchecked
                          setFiscalAddress({
                            street: '',
                            number: '',
                            interior: '',
                            city: '',
                            postalCode: '',
                            state: ''
                          });
                        }
                      }}
                      data-testid="button-same-address"
                    >
                      <div 
                        className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-colors ${
                          useSameAddress 
                            ? 'border-blue-500 bg-blue-500' 
                            : 'border-gray-400 bg-white'
                        }`}
                      >
                        {useSameAddress && (
                          <i className="fas fa-check text-white text-xs"></i>
                        )}
                      </div>
                      <span className={`text-sm font-medium transition-colors ${
                        useSameAddress ? 'text-blue-700' : 'text-gray-600'
                      }`}>
                        Misma Dirección
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="rfc">RFC</Label>
                      <Input
                        id="rfc"
                        placeholder="Ej: ABC123456DE1"
                        data-testid="input-rfc"
                      />
                    </div>
                    <div>
                      <Label htmlFor="razon-social">Razón Social</Label>
                      <Input
                        id="razon-social"
                        placeholder="Nombre fiscal de la empresa"
                        data-testid="input-razon-social"
                      />
                    </div>
                    <div>
                      <Label htmlFor="regimen-fiscal">Régimen Fiscal</Label>
                      <Input
                        id="regimen-fiscal"
                        placeholder="Ej: General de Ley Personas Morales"
                        data-testid="input-regimen-fiscal"
                      />
                    </div>
                    <div>
                      <Label htmlFor="uso-cfdi">Uso CFDI</Label>
                      <Input
                        id="uso-cfdi"
                        placeholder="Ej: G03 - Gastos en general"
                        data-testid="input-uso-cfdi"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="forma-pago">Forma de Pago</Label>
                      <Input
                        id="forma-pago"
                        placeholder="Ej: 03 - Transferencia electrónica"
                        data-testid="input-forma-pago"
                      />
                    </div>
                    <div>
                      <Label htmlFor="metodo-pago">Método de Pago</Label>
                      <Input
                        id="metodo-pago"
                        placeholder="Ej: PUE - Pago en una sola exhibición"
                        data-testid="input-metodo-pago"
                      />
                    </div>
                    <div>
                      <Label htmlFor="correo-facturacion">Correo de Facturación</Label>
                      <Input
                        id="correo-facturacion"
                        type="email"
                        placeholder="facturacion@financiera.com"
                        data-testid="input-correo-facturacion"
                      />
                    </div>
                    <div>
                      <Label htmlFor="terminos-pago">Términos de Pago</Label>
                      <Input
                        id="terminos-pago"
                        placeholder="Ej: 30 días"
                        data-testid="input-terminos-pago"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección 5: Expediente */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <i className="fas fa-folder-open text-red-600"></i>
                  <h4 className="font-medium text-gray-900">Expediente de la Financiera</h4>
                  <Badge variant="outline" className="text-xs">Documentos requeridos</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                      <i className="fas fa-file-contract text-4xl text-gray-400 mb-2"></i>
                      <p className="text-sm text-gray-600 mb-2">Contrato</p>
                      <Button variant="outline" size="sm" data-testid="button-upload-contrato">
                        <i className="fas fa-upload mr-2"></i>
                        Subir Contrato
                      </Button>
                    </div>
                    
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                      <i className="fas fa-handshake text-4xl text-gray-400 mb-2"></i>
                      <p className="text-sm text-gray-600 mb-2">Convenio</p>
                      <Button variant="outline" size="sm" data-testid="button-upload-convenio">
                        <i className="fas fa-upload mr-2"></i>
                        Subir Convenio
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                      <i className="fas fa-home text-4xl text-gray-400 mb-2"></i>
                      <p className="text-sm text-gray-600 mb-2">Comprobante de Domicilio</p>
                      <Button variant="outline" size="sm" data-testid="button-upload-domicilio">
                        <i className="fas fa-upload mr-2"></i>
                        Subir Comprobante
                      </Button>
                    </div>
                    
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                      <i className="fas fa-file-invoice-dollar text-4xl text-gray-400 mb-2"></i>
                      <p className="text-sm text-gray-600 mb-2">Constancia de Situación Fiscal</p>
                      <Button variant="outline" size="sm" data-testid="button-upload-situacion-fiscal">
                        <i className="fas fa-upload mr-2"></i>
                        Subir Constancia
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start space-x-2">
                    <i className="fas fa-info-circle text-blue-600 mt-0.5"></i>
                    <div>
                      <p className="text-sm text-blue-800 font-medium">Documentos del Expediente</p>
                      <p className="text-xs text-blue-700 mt-1">
                        Estos documentos son necesarios para el expediente completo de la financiera. 
                        Se utilizan para validación y cumplimiento normativo.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Central Configuration Fields */}
              {renderCentralConfigSection()}
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
                  Define la estructura completa de comisiones: desde la financiera hasta brokers individuales.
                </p>
                <div className="mt-3 bg-white rounded-lg p-3 border border-green-300">
                  <p className="text-xs text-gray-600">
                    <strong>Flujo de comisiones:</strong> Financiera → Admin → Master Broker → Broker
                  </p>
                </div>
              </div>

              {/* Financiera Commissions (Admin receives from financiera) */}
              <div className="border border-orange-300 bg-orange-50 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 mb-2 flex items-center">
                  <i className="fas fa-building mr-2 text-orange-600"></i>
                  Comisiones de la Financiera (Recibe el Admin)
                </h5>
                <p className="text-xs text-gray-600 mb-4">
                  Estos son los porcentajes de comisión que {financiera.name} otorga al admin/plataforma.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="financiera-total">Comisión Total (%)</Label>
                    <Input
                      id="financiera-total"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.financiera.total}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        financiera: { ...prev.financiera, total: e.target.value }
                      }))}
                      placeholder="Ej: 5.0"
                      data-testid="input-financiera-total"
                    />
                  </div>

                  <div>
                    <Label htmlFor="financiera-apertura">Comisión Apertura (%)</Label>
                    <Input
                      id="financiera-apertura"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.financiera.apertura}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        financiera: { ...prev.financiera, apertura: e.target.value }
                      }))}
                      placeholder="Ej: 3.0"
                      data-testid="input-financiera-apertura"
                    />
                  </div>

                  <div>
                    <Label htmlFor="financiera-sobretasa">Comisión Sobretasa (%)</Label>
                    <Input
                      id="financiera-sobretasa"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.financiera.sobretasa}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        financiera: { ...prev.financiera, sobretasa: e.target.value }
                      }))}
                      placeholder="Ej: 2.0"
                      data-testid="input-financiera-sobretasa"
                    />
                  </div>

                  <div>
                    <Label htmlFor="financiera-renovacion">Renovación (%)</Label>
                    <Input
                      id="financiera-renovacion"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.financiera.renovacion}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        financiera: { ...prev.financiera, renovacion: e.target.value }
                      }))}
                      placeholder="Ej: 1.0"
                      data-testid="input-financiera-renovacion"
                    />
                  </div>
                </div>
              </div>

              {/* Master Broker Commissions */}
              <div className="border border-blue-300 bg-blue-50 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 mb-2 flex items-center">
                  <i className="fas fa-user-tie mr-2 text-blue-600"></i>
                  Comisiones Master Broker (Otorga el Admin)
                </h5>
                <p className="text-xs text-gray-600 mb-4">
                  Parte de la comisión de la financiera que el admin distribuye a master brokers.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="mb-total">Comisión Total (%)</Label>
                    <Input
                      id="mb-total"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.masterBroker.total}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        masterBroker: { ...prev.masterBroker, total: e.target.value }
                      }))}
                      placeholder="Ej: 2.5"
                      data-testid="input-mb-total"
                    />
                  </div>

                  <div>
                    <Label htmlFor="mb-apertura">Comisión Apertura (%)</Label>
                    <Input
                      id="mb-apertura"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.masterBroker.apertura}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        masterBroker: { ...prev.masterBroker, apertura: e.target.value }
                      }))}
                      placeholder="Ej: 1.0"
                      data-testid="input-mb-apertura"
                    />
                  </div>

                  <div>
                    <Label htmlFor="mb-sobretasa">Comisión Sobretasa (%)</Label>
                    <Input
                      id="mb-sobretasa"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.masterBroker.sobretasa}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        masterBroker: { ...prev.masterBroker, sobretasa: e.target.value }
                      }))}
                      placeholder="Ej: 1.5"
                      data-testid="input-mb-sobretasa"
                    />
                  </div>

                  <div>
                    <Label htmlFor="mb-renovacion">Renovación (%)</Label>
                    <Input
                      id="mb-renovacion"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.masterBroker.renovacion}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        masterBroker: { ...prev.masterBroker, renovacion: e.target.value }
                      }))}
                      placeholder="Ej: 0.5"
                      data-testid="input-mb-renovacion"
                    />
                  </div>
                </div>
              </div>

              {/* Broker Commissions */}
              <div className="border border-green-300 bg-green-50 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 mb-2 flex items-center">
                  <i className="fas fa-user mr-2 text-green-600"></i>
                  Comisiones Broker (Otorga el Admin o Master Broker)
                </h5>
                <p className="text-xs text-gray-600 mb-4">
                  Parte de la comisión que se distribuye a brokers individuales.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="broker-total">Comisión Total (%)</Label>
                    <Input
                      id="broker-total"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.broker.total}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        broker: { ...prev.broker, total: e.target.value }
                      }))}
                      placeholder="Ej: 1.5"
                      data-testid="input-broker-total"
                    />
                  </div>

                  <div>
                    <Label htmlFor="broker-apertura">Comisión Apertura (%)</Label>
                    <Input
                      id="broker-apertura"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.broker.apertura}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        broker: { ...prev.broker, apertura: e.target.value }
                      }))}
                      placeholder="Ej: 0.5"
                      data-testid="input-broker-apertura"
                    />
                  </div>

                  <div>
                    <Label htmlFor="broker-sobretasa">Comisión Sobretasa (%)</Label>
                    <Input
                      id="broker-sobretasa"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.broker.sobretasa}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        broker: { ...prev.broker, sobretasa: e.target.value }
                      }))}
                      placeholder="Ej: 1.0"
                      data-testid="input-broker-sobretasa"
                    />
                  </div>

                  <div>
                    <Label htmlFor="broker-renovacion">Renovación (%)</Label>
                    <Input
                      id="broker-renovacion"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={commissions.broker.renovacion}
                      onChange={(e) => setCommissions(prev => ({ 
                        ...prev, 
                        broker: { ...prev.broker, renovacion: e.target.value }
                      }))}
                      placeholder="Ej: 0.3"
                      data-testid="input-broker-renovacion"
                    />
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button 
                  onClick={handleSaveCommissions}
                  disabled={updateCommissionsMutation.isPending}
                  data-testid="button-save-commissions"
                >
                  {updateCommissionsMutation.isPending ? 'Guardando...' : 'Guardar Comisiones'}
                </Button>
              </div>

              {/* Central Configuration Fields */}
              {renderCentralConfigSection()}
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
                  Selecciona los campos del perfilamiento que requiere {financiera.name} según el tipo de cliente.
                </p>
              </div>

              {/* Sub-tabs for Client Types */}
              <Tabs 
                value={requirementsClientType} 
                onValueChange={(value) => setRequirementsClientType(value as 'persona_moral' | 'fisica_empresarial' | 'fisica' | 'sin_sat')}
              >
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="persona_moral" data-testid="tab-persona-moral">
                    Persona Moral
                  </TabsTrigger>
                  <TabsTrigger value="fisica_empresarial" data-testid="tab-fisica-empresarial">
                    PFAE
                  </TabsTrigger>
                  <TabsTrigger value="fisica" data-testid="tab-fisica">
                    Persona Física
                  </TabsTrigger>
                  <TabsTrigger value="sin_sat" data-testid="tab-sin-sat">
                    Sin SAT
                  </TabsTrigger>
                </TabsList>

                {/* Content for each client type */}
                <TabsContent value={requirementsClientType} className="space-y-4 mt-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h5 className="font-medium text-gray-900">Campos de Perfilamiento</h5>
                      <Badge variant="secondary" data-testid="badge-selected-count">
                        {requirementsByType[requirementsClientType].length} seleccionados
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto border rounded-lg p-4">
                      {PROFILING_FIELDS_BY_TYPE[requirementsClientType].map(field => (
                        <label key={field.id} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={requirementsByType[requirementsClientType].includes(field.id)}
                            onChange={() => handleRequirementToggle(field.id)}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            data-testid={`checkbox-requirement-${field.id}`}
                          />
                          <span className="text-sm">{field.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Ranges Configuration for Selected Requirements */}
                  {requirementsByType[requirementsClientType].length > 0 && (
                    <div className="mt-6 space-y-6">
                      {/* Range Fields */}
                      {PROFILING_FIELDS_BY_TYPE[requirementsClientType]
                        .filter(field => requirementsByType[requirementsClientType].includes(field.id) && field.hasRange)
                        .length > 0 && (
                        <div>
                          <h5 className="font-medium text-gray-900 mb-4">Rangos para Matching</h5>
                          <p className="text-sm text-gray-600 mb-4">
                            {PROFILING_FIELDS_BY_TYPE[requirementsClientType].some(f => f.hasRange && f.rangeOnlyMin) 
                              ? 'Configura valores mínimos y/o rangos para validación automática de compatibilidad'
                              : 'Configura rangos mínimos y máximos para validación automática de compatibilidad'}
                          </p>
                          <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                            {PROFILING_FIELDS_BY_TYPE[requirementsClientType]
                              .filter(field => requirementsByType[requirementsClientType].includes(field.id) && field.hasRange)
                              .map(field => {
                                const currentRange = rangesByType[requirementsClientType][field.id] || {};
                                const placeholder = field.rangeType === 'currency' ? '$' : 
                                                  field.rangeType === 'score' ? 'Score' : 
                                                  field.rangeType === 'months' ? 'Meses' : '';
                                const rangeLabel = field.rangeLabel || field.label;
                                
                                return (
                                  <div key={field.id} className={`grid grid-cols-1 gap-4 items-center ${field.rangeOnlyMin ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                                    <div className="text-sm font-medium text-gray-700">
                                      {rangeLabel}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Label className="text-xs text-gray-500 w-12">Mínimo</Label>
                                      {field.rangeType === 'currency' ? (
                                        <CurrencyInput
                                          value={currentRange.min || ''}
                                          onChange={(formatted, numeric) => handleRangeChange(field.id, 'min', numeric)}
                                          placeholder="$0"
                                          className="h-9"
                                          data-testid={`input-range-min-${field.id}`}
                                        />
                                      ) : (
                                        <Input
                                          type="number"
                                          placeholder={placeholder}
                                          value={currentRange.min || ''}
                                          onChange={(e) => handleRangeChange(field.id, 'min', e.target.value)}
                                          className="h-9"
                                          data-testid={`input-range-min-${field.id}`}
                                        />
                                      )}
                                    </div>
                                    {!field.rangeOnlyMin && (
                                      <div className="flex items-center space-x-2">
                                        <Label className="text-xs text-gray-500 w-12">Máximo</Label>
                                        {field.rangeType === 'currency' ? (
                                          <CurrencyInput
                                            value={currentRange.max || ''}
                                            onChange={(formatted, numeric) => handleRangeChange(field.id, 'max', numeric)}
                                            placeholder="$0"
                                            className="h-9"
                                            data-testid={`input-range-max-${field.id}`}
                                          />
                                        ) : (
                                          <Input
                                            type="number"
                                            placeholder={placeholder}
                                            value={currentRange.max || ''}
                                            onChange={(e) => handleRangeChange(field.id, 'max', e.target.value)}
                                            className="h-9"
                                            data-testid={`input-range-max-${field.id}`}
                                          />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Guarantee Multiplier Configuration - Type Specific */}
                      {PROFILING_FIELDS_BY_TYPE[requirementsClientType]
                        .filter(field => requirementsByType[requirementsClientType].includes(field.id) && field.hasMultiplier)
                        .length > 0 && (
                        <div>
                          <h5 className="font-medium text-gray-900 mb-4">Configuración de Garantías por Tipo</h5>
                          <p className="text-sm text-gray-600 mb-4">
                            Especifica el múltiplo requerido del monto solicitado para cada tipo de garantía
                          </p>
                          <div className="space-y-4">
                            {PROFILING_FIELDS_BY_TYPE[requirementsClientType]
                              .filter(field => requirementsByType[requirementsClientType].includes(field.id) && field.hasMultiplier)
                              .map(field => {
                                const currentRange = rangesByType[requirementsClientType][field.id] || {};
                                const guaranteeMultipliers = currentRange.guaranteeMultipliers || {};
                                
                                const handleGuaranteeMultiplierChange = (guaranteeType: string, multiplier: string) => {
                                  setRangesByType(prev => {
                                    const fieldRange = prev[requirementsClientType][field.id] || {};
                                    const currentMultipliers = fieldRange.guaranteeMultipliers || {};
                                    
                                    return {
                                      ...prev,
                                      [requirementsClientType]: {
                                        ...prev[requirementsClientType],
                                        [field.id]: {
                                          ...fieldRange,
                                          guaranteeMultipliers: {
                                            ...currentMultipliers,
                                            [guaranteeType]: multiplier,
                                          },
                                        },
                                      },
                                    };
                                  });
                                };
                                
                                return (
                                  <div key={field.id} className="border rounded-lg p-4 bg-gray-50">
                                    <h6 className="font-medium text-gray-800 mb-3">{field.label}</h6>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead className="bg-gray-100 border-b">
                                          <tr>
                                            <th className="text-left p-2 font-medium text-gray-700">Tipo de Garantía</th>
                                            <th className="text-left p-2 font-medium text-gray-700">Múltiplo Requerido</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(field as any).options
                                            .filter((guaranteeType: string) => guaranteeType !== 'sin-garantia')
                                            .map((guaranteeType: string) => (
                                            <tr key={guaranteeType} className="border-b last:border-b-0">
                                              <td className="p-2 font-medium text-gray-700 capitalize">
                                                {guaranteeType.replace(/-/g, ' ')}
                                              </td>
                                              <td className="p-2">
                                                <Select 
                                                  value={guaranteeMultipliers[guaranteeType] || ''} 
                                                  onValueChange={(value) => handleGuaranteeMultiplierChange(guaranteeType, value)}
                                                >
                                                  <SelectTrigger className="h-9 bg-white" data-testid={`select-multiplier-${field.id}-${guaranteeType}`}>
                                                    <SelectValue placeholder="Seleccionar múltiplo" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    <SelectItem value="1x">1 vez (100%)</SelectItem>
                                                    <SelectItem value="1.5x">1.5 veces (150%)</SelectItem>
                                                    <SelectItem value="2x">2 veces (200%)</SelectItem>
                                                    <SelectItem value="2.5x">2.5 veces (250%)</SelectItem>
                                                    <SelectItem value="3x">3 veces (300%)</SelectItem>
                                                    <SelectItem value="4x">4 veces (400%)</SelectItem>
                                                  </SelectContent>
                                                </Select>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Max Threshold Configuration for Government Sales */}
                      {PROFILING_FIELDS_BY_TYPE[requirementsClientType]
                        .filter(field => requirementsByType[requirementsClientType].includes(field.id) && (field as any).hasMaxThreshold)
                        .length > 0 && (
                        <div>
                          <h5 className="font-medium text-gray-900 mb-4">Umbral Máximo de Aceptación</h5>
                          <p className="text-sm text-gray-600 mb-4">
                            Especifica el porcentaje máximo aceptable de participación de ventas con gobierno
                          </p>
                          <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                            {PROFILING_FIELDS_BY_TYPE[requirementsClientType]
                              .filter(field => requirementsByType[requirementsClientType].includes(field.id) && (field as any).hasMaxThreshold)
                              .map(field => {
                                const currentRange = rangesByType[requirementsClientType][field.id] || {};
                                
                                return (
                                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                    <div className="text-sm font-medium text-gray-700">
                                      {field.label}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Select 
                                        value={currentRange.maxThreshold || ''} 
                                        onValueChange={(value) => handleRangeChange(field.id, 'maxThreshold', value)}
                                      >
                                        <SelectTrigger className="h-9" data-testid={`select-max-threshold-${field.id}`}>
                                          <SelectValue placeholder="Seleccionar umbral máximo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="0">0%</SelectItem>
                                          <SelectItem value="menor-20">Menor a 20%</SelectItem>
                                          <SelectItem value="menor-40">Menor a 40%</SelectItem>
                                          <SelectItem value="menor-50">Menor a 50%</SelectItem>
                                          <SelectItem value="menor-60">Menor a 60%</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Acceptance Mode Configuration for Opinion de Cumplimiento */}
                  {PROFILING_FIELDS_BY_TYPE[requirementsClientType]
                    .filter(field => requirementsByType[requirementsClientType].includes(field.id) && (field as any).hasAcceptanceMode)
                    .length > 0 && (
                    <div className="mt-6">
                      <h5 className="font-medium text-gray-900 mb-4">Modo de Aceptación</h5>
                      <p className="text-sm text-gray-600 mb-4">
                        Especifica qué tipo de opinión de cumplimiento acepta la financiera
                      </p>
                      <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                        {PROFILING_FIELDS_BY_TYPE[requirementsClientType]
                          .filter(field => requirementsByType[requirementsClientType].includes(field.id) && (field as any).hasAcceptanceMode)
                          .map(field => {
                            const currentRange = rangesByType[requirementsClientType][field.id] || {};
                            
                            return (
                              <div key={field.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                <div className="text-sm font-medium text-gray-700">
                                  {field.label}
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Select 
                                    value={currentRange.acceptanceMode || ''} 
                                    onValueChange={(value) => handleRangeChange(field.id, 'acceptanceMode', value)}
                                  >
                                    <SelectTrigger className="h-9" data-testid={`select-acceptance-mode-${field.id}`}>
                                      <SelectValue placeholder="Seleccionar modo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="solo-positiva">Solo Positiva</SelectItem>
                                      <SelectItem value="positiva-y-negativa">Acepta Positiva y Negativa</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Additional Notes Section */}
                  <div className="mt-6">
                    <h5 className="font-medium text-gray-900 mb-2">Notas Adicionales</h5>
                    <p className="text-sm text-gray-600 mb-3">
                      Describe requisitos especiales o información importante que el broker debe conocer durante el matching
                    </p>
                    <textarea
                      value={additionalNotesByType[requirementsClientType]}
                      onChange={(e) => setAdditionalNotesByType(prev => ({
                        ...prev,
                        [requirementsClientType]: e.target.value
                      }))}
                      className="w-full min-h-[100px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
                      placeholder="Ej: Solo aceptamos clientes con antigüedad mínima de 3 años en el RFC..."
                      data-testid="textarea-additional-notes"
                    />
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t mt-6">
                    <Button 
                      onClick={handleSaveRequirements}
                      disabled={updateRequirementsMutation.isPending}
                      data-testid="button-save-requirements"
                    >
                      {updateRequirementsMutation.isPending ? 'Guardando...' : 'Guardar Requisitos'}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Central Configuration Fields */}
              {renderCentralConfigSection()}
            </div>
          )}

          {activeTab === 'products' && (
            <div className="space-y-6">
              {/* Products Header */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  <h4 className="font-medium text-blue-900">Plantillas Asignadas</h4>
                </div>
                <p className="text-sm text-blue-700">
                  Plantillas de productos disponibles para {financiera.name}.
                </p>
              </div>

              {/* Products List */}
              {productsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">Cargando plantillas...</p>
                </div>
              ) : institutionProducts.length > 0 ? (
                <div className="space-y-4">
                  {institutionProducts.map((product) => (
                    <Card key={product.id} className="border border-gray-200">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Package className="w-5 h-5 text-blue-600" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <CardTitle className="text-base font-medium text-gray-900">
                                  {product.customName || product.template?.name || 'Producto sin nombre'}
                                </CardTitle>
                                {(() => {
                                  const profiles = product.targetProfiles || (product.template as any)?.targetProfiles || [];
                                  return profiles.length > 0 && (
                                  <div className="flex gap-1" data-testid={`target-profiles-${product.id}`}>
                                    {profiles.map((profile: string, idx: number) => (
                                      <Badge 
                                        key={idx}
                                        variant="outline" 
                                        className={
                                          profile === 'persona_moral' 
                                            ? 'bg-purple-50 text-purple-700 border-purple-200' 
                                            : profile === 'fisica_empresarial'
                                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                                            : profile === 'fisica'
                                            ? 'bg-green-50 text-green-700 border-green-200'
                                            : 'bg-orange-50 text-orange-700 border-orange-200'
                                        }
                                      >
                                        {profile === 'persona_moral' 
                                          ? 'PM' 
                                          : profile === 'fisica_empresarial'
                                          ? 'PFAE'
                                          : profile === 'fisica'
                                          ? 'PF'
                                          : 'Sin SAT'}
                                      </Badge>
                                    ))}
                                  </div>
                                  );
                                })()}
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                {product.template?.description || 'Sin descripción'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={product.isActive ?? false}
                                onCheckedChange={(checked) => handleToggleProductStatus(product.id, checked)}
                                disabled={toggleProductStatusMutation.isPending}
                                data-testid={`switch-product-status-${product.id}`}
                              />
                              <Badge variant={product.isActive ? "default" : "secondary"}>
                                {product.isActive ? "Activo" : "Inactivo"}
                              </Badge>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditProductVariables(product)}
                              data-testid={`button-edit-product-${product.id}`}
                            >
                              <Settings className="w-4 h-4 mr-1" />
                              Configurar Variables
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">
                              Variables configurables: {Array.isArray(product.activeVariables) ? product.activeVariables.length : 0}
                            </span>
                            <span className="text-gray-600">
                              Plantilla base: {product.template?.name || 'N/A'}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-sm font-medium text-gray-900 mb-1">
                    Sin Plantillas Asignadas
                  </h3>
                  <p className="text-sm text-gray-500">
                    Esta financiera no tiene plantillas asignadas. Ve a Productos para asignar plantillas.
                  </p>
                </div>
              )}

              {/* Central Configuration Fields */}
              {renderCentralConfigSection()}
            </div>
          )}


          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="button-cancel-config"
            >
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Custom Document Modal */}
      <Dialog open={showCustomDocModal} onOpenChange={setShowCustomDocModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Agregar Documento Personalizado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="custom-doc-name">Nombre del Documento</Label>
              <Input
                id="custom-doc-name"
                value={customDocumentName}
                onChange={(e) => setCustomDocumentName(e.target.value)}
                placeholder="Ej: Estados Financieros, Licencia de Operación..."
                data-testid="input-custom-doc-name"
              />
            </div>
            
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCustomDocModal(false);
                  setCustomDocumentName('');
                }}
                data-testid="button-cancel-custom-doc"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (customDocumentName.trim()) {
                    // Trigger file upload for custom document
                    triggerFileInput(customDocumentName.toLowerCase().replace(/\s+/g, '_'));
                    setShowCustomDocModal(false);
                    setCustomDocumentName('');
                  } else {
                    toast({
                      title: "Error",
                      description: "Por favor ingresa un nombre para el documento.",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={!customDocumentName.trim()}
                data-testid="button-add-custom-doc"
              >
                <i className="fas fa-plus mr-2"></i>
                Agregar y Subir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Variables Edit Modal */}
      <Dialog open={showVariableEditModal} onOpenChange={setShowVariableEditModal}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Configurar Variables - {editingProduct?.customName || editingProduct?.template?.name || 'Producto'}
            </DialogTitle>
            <p className="text-sm text-gray-600">
              Personaliza las variables de este producto específicamente para {financiera.name}
            </p>
          </DialogHeader>
          
          <div className="space-y-6">
            {editableVariables.length > 0 ? (
              <div className="grid gap-4">
                {editableVariables.map((variable, index) => (
                  <Card key={variable.id || index} className="border border-gray-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-medium">
                        {variable.name || `Variable ${index + 1}`}
                      </CardTitle>
                      {variable.description && (
                        <p className="text-sm text-gray-600">{variable.description}</p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`variable-${index}-value`} className="text-sm font-medium">
                            Valor
                          </Label>
                          <Input
                            id={`variable-${index}-value`}
                            value={variable.value || ''}
                            onChange={(e) => {
                              const updatedVariables = [...editableVariables];
                              updatedVariables[index] = { ...variable, value: e.target.value };
                              setEditableVariables(updatedVariables);
                            }}
                            placeholder="Ingresa el valor"
                            data-testid={`input-variable-${index}-value`}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`variable-${index}-dataType`} className="text-sm font-medium">
                            Tipo de Dato
                          </Label>
                          <Select
                            value={variable.dataType || 'text'}
                            onValueChange={(value) => {
                              const updatedVariables = [...editableVariables];
                              updatedVariables[index] = { ...variable, dataType: value };
                              setEditableVariables(updatedVariables);
                            }}
                          >
                            <SelectTrigger data-testid={`select-variable-${index}-dataType`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Texto</SelectItem>
                              <SelectItem value="number">Número</SelectItem>
                              <SelectItem value="boolean">Booleano</SelectItem>
                              <SelectItem value="percentage">Porcentaje</SelectItem>
                              <SelectItem value="currency">Moneda</SelectItem>
                              <SelectItem value="date">Fecha</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={variable.isRequired || false}
                            onCheckedChange={(checked) => {
                              const updatedVariables = [...editableVariables];
                              updatedVariables[index] = { ...variable, isRequired: checked };
                              setEditableVariables(updatedVariables);
                            }}
                            data-testid={`switch-variable-${index}-required`}
                          />
                          <Label className="text-sm">Obligatorio</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={variable.isVisible !== false}
                            onCheckedChange={(checked) => {
                              const updatedVariables = [...editableVariables];
                              updatedVariables[index] = { ...variable, isVisible: checked };
                              setEditableVariables(updatedVariables);
                            }}
                            data-testid={`switch-variable-${index}-visible`}
                          />
                          <Label className="text-sm">Visible</Label>
                        </div>
                      </div>

                      {variable.dataType === 'number' || variable.dataType === 'percentage' || variable.dataType === 'currency' ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`variable-${index}-min`} className="text-sm font-medium">
                              Valor Mínimo
                            </Label>
                            <Input
                              id={`variable-${index}-min`}
                              type="number"
                              value={variable.minValue || ''}
                              onChange={(e) => {
                                const updatedVariables = [...editableVariables];
                                updatedVariables[index] = { ...variable, minValue: e.target.value };
                                setEditableVariables(updatedVariables);
                              }}
                              placeholder="Mínimo"
                              data-testid={`input-variable-${index}-min`}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`variable-${index}-max`} className="text-sm font-medium">
                              Valor Máximo
                            </Label>
                            <Input
                              id={`variable-${index}-max`}
                              type="number"
                              value={variable.maxValue || ''}
                              onChange={(e) => {
                                const updatedVariables = [...editableVariables];
                                updatedVariables[index] = { ...variable, maxValue: e.target.value };
                                setEditableVariables(updatedVariables);
                              }}
                              placeholder="Máximo"
                              data-testid={`input-variable-${index}-max`}
                            />
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                <Sliders className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-sm font-medium text-gray-900 mb-1">
                  Sin Variables Configurables
                </h3>
                <p className="text-sm text-gray-500">
                  Este producto no tiene variables personalizables definidas.
                </p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <Button
              variant="outline"
              onClick={() => {
                setShowVariableEditModal(false);
                setEditingProduct(null);
                setEditableVariables([]);
              }}
              data-testid="button-cancel-variable-edit"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => handleSaveProductVariables(editableVariables)}
              disabled={!editingProduct}
              data-testid="button-save-variable-edit"
            >
              Guardar Variables
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}