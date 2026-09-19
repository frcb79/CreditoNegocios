import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Home,
  User,
  DollarSign,
  Send,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Calculator,
  UserCheck,
  Building2,
  HelpCircle,
  Info,
} from "lucide-react";
import { Client } from "@shared/schema";

interface MortgageLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingClient?: Client | null;
  onSuccess?: (result?: any) => void;
}

const mortgageLeadSchema = z.object({
  // Contacto (requerido si no hay existingClient)
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  rfc: z.string().optional(),

  // Operación
  propertyValue: z.string().min(1, "El valor aproximado del inmueble es requerido"),
  requestedAmount: z.string().min(1, "El monto aproximado de crédito es requerido"),
  downPayment: z.string().optional(),
  propertyLocation: z.string().min(3, "La ubicación o dirección del inmueble es requerida"),
  requestedTermMonths: z.string().default("240"),

  // Ingreso
  monthlyIncome: z.string().min(1, "El ingreso mensual es requerido"),
  incomeType: z.enum(["asalariado", "independiente", "empresario", "mixto"]).default("asalariado"),

  // Coprestatario
  hasCoBorrower: z.boolean().default(false),
  coBorrowerIncome: z.string().optional(),

  // Notas
  brokerNotes: z.string().optional(),
});

type MortgageLeadFormValues = z.infer<typeof mortgageLeadSchema>;

export default function MortgageLeadModal({
  isOpen,
  onClose,
  existingClient,
  onSuccess,
}: MortgageLeadModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedClient, setSelectedClient] = useState<Client | null>(existingClient || null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string;
    existingClient?: any;
    isSameTenant?: boolean;
  } | null>(null);

  // Inputs para formateo de moneda visual
  const [rawPropertyValue, setRawPropertyValue] = useState("");
  const [rawRequestedAmount, setRawRequestedAmount] = useState("");
  const [rawDownPayment, setRawDownPayment] = useState("");
  const [rawMonthlyIncome, setRawMonthlyIncome] = useState("");
  const [rawCoBorrowerIncome, setRawCoBorrowerIncome] = useState("");

  // Simulador sencillo
  const [simInterestRate, setSimInterestRate] = useState<string>("11.5");
  const [simTermMonths, setSimTermMonths] = useState<string>("240");
  const [selectedInstitutions, setSelectedInstitutions] = useState<string[]>([]);

  // Fetch product templates and financial institutions
  const { data: productTemplates } = useQuery<any[]>({
    queryKey: ["/api/product-templates"],
    enabled: isOpen,
  });

  const { data: institutions } = useQuery<any[]>({
    queryKey: ["/api/financial-institutions"],
    enabled: isOpen,
  });

  const { data: institutionProducts } = useQuery<any[]>({
    queryKey: ["/api/institution-products"],
    enabled: isOpen,
  });

  const form = useForm<MortgageLeadFormValues>({
    resolver: zodResolver(mortgageLeadSchema),
    defaultValues: {
      firstName: existingClient?.firstName || "",
      lastName: existingClient?.lastName || "",
      phone: existingClient?.phone || "",
      email: existingClient?.email || "",
      rfc: existingClient?.rfc || "",
      propertyValue: "",
      requestedAmount: "",
      downPayment: "",
      propertyLocation: existingClient?.address || "",
      requestedTermMonths: "240",
      monthlyIncome: existingClient?.ingresoMensualPromedio || "",
      incomeType: "asalariado",
      hasCoBorrower: false,
      coBorrowerIncome: "",
      brokerNotes: "",
    },
  });

  // Sincronizar estado cuando se abre o cambia existingClient
  useEffect(() => {
    if (isOpen) {
      setSelectedClient(existingClient || null);
      setDuplicateWarning(null);
      setSelectedInstitutions([]);
      form.reset({
        firstName: existingClient?.firstName || "",
        lastName: existingClient?.lastName || "",
        phone: existingClient?.phone || "",
        email: existingClient?.email || "",
        rfc: existingClient?.rfc || "",
        propertyValue: "",
        requestedAmount: "",
        downPayment: "",
        propertyLocation: existingClient?.address || "",
        requestedTermMonths: "240",
        monthlyIncome: existingClient?.ingresoMensualPromedio || "",
        incomeType: "asalariado",
        hasCoBorrower: false,
        coBorrowerIncome: "",
        brokerNotes: "",
      });
      setRawPropertyValue("");
      setRawRequestedAmount("");
      setRawDownPayment("");
      setRawMonthlyIncome(existingClient?.ingresoMensualPromedio || "");
      setRawCoBorrowerIncome("");
      setSimInterestRate("11.5");
      setSimTermMonths("240");
    }
  }, [isOpen, existingClient, form]);

  // Chequeo de duplicados en tiempo real (solo para prospecto nuevo)
  const checkDuplicates = async () => {
    if (selectedClient) return; // Ya es cliente existente
    const rfc = form.getValues("rfc");
    const phone = form.getValues("phone");
    const email = form.getValues("email");

    if (!rfc && !phone && !email) return;

    try {
      const res = await apiRequest("POST", "/api/clients/check-duplicates", { rfc, phone, email });
      const data = await res.json();
      if (data.hasDuplicate) {
        if (data.isSameTenant && data.existingClient) {
          setDuplicateWarning({
            message: `Ya existe un cliente en tu cartera con estos datos: ${data.existingClient.firstName} ${data.existingClient.lastName || ''} (${data.existingClient.phone || data.existingClient.email || data.existingClient.rfc}).`,
            existingClient: data.existingClient,
            isSameTenant: true,
          });
        } else {
          setDuplicateWarning({
            message: "Aviso: Existe un registro previo coincidente en la plataforma. Puedes continuar con tu registro comercial.",
            isSameTenant: false,
          });
        }
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      // Ignorar errores silenciosos en verificación preliminar
    }
  };

  // Cálculo del porcentaje financiado aproximado
  const propertyValNum = parseFloat(rawPropertyValue.replace(/[^0-9.]/g, "") || "0");
  const requestedAmtNum = parseFloat(rawRequestedAmount.replace(/[^0-9.]/g, "") || "0");
  const financedPercentage = useMemo(() => {
    if (propertyValNum > 0 && requestedAmtNum > 0) {
      const pct = Math.round((requestedAmtNum / propertyValNum) * 100);
      return Math.min(pct, 100);
    }
    return null;
  }, [propertyValNum, requestedAmtNum]);

  // Cálculo de mensualidad del simulador amortizable estándar
  // M = P * [ r*(1+r)^n ] / [ (1+r)^n - 1 ]
  const simMonthlyPayment = useMemo(() => {
    const P = requestedAmtNum > 0 ? requestedAmtNum : 1000000;
    const annualRate = parseFloat(simInterestRate || "11.5");
    const n = parseInt(simTermMonths || "240", 10);

    if (P <= 0 || isNaN(annualRate) || n <= 0) return 0;

    const r = (annualRate / 100) / 12;
    if (r === 0) return Math.round(P / n);

    const numerator = r * Math.pow(1 + r, n);
    const denominator = Math.pow(1 + r, n) - 1;
    const monthly = P * (numerator / denominator);
    return Math.round(monthly);
  }, [requestedAmtNum, simInterestRate, simTermMonths]);

  // Detección de productos de vivienda configurados (Adjustment 3: NO hardcodear)
  const mortgageTemplate = productTemplates?.find(
    (t) =>
      t.name?.toLowerCase().trim() === "hipotecario vivienda" ||
      (t.category === "hipotecario" && !t.name?.toLowerCase().includes("garantía inmobiliaria"))
  );

  const realMortgageInstitutionProducts = useMemo(() => {
    if (!mortgageTemplate || !institutionProducts) return [];
    return institutionProducts.filter(
      (ip: any) =>
        ip.templateId === mortgageTemplate.id ||
        (ip.category === "hipotecario" && !ip.customName?.toLowerCase().includes("garantía inmobiliaria"))
    );
  }, [mortgageTemplate, institutionProducts]);

  // Formateadores de moneda
  const formatMoney = (val: string) => {
    const num = parseFloat(val.replace(/[^0-9.]/g, ""));
    if (isNaN(num)) return "";
    return `$${num.toLocaleString("es-MX")}`;
  };

  const handleMoneyChange = (val: string, setter: (v: string) => void, fieldName: keyof MortgageLeadFormValues) => {
    const raw = val.replace(/[^0-9]/g, "");
    setter(raw);
    form.setValue(fieldName, raw as any);

    // Autoajustar enganche si cambia valor o monto
    if (fieldName === "propertyValue" || fieldName === "requestedAmount") {
      const pVal = fieldName === "propertyValue" ? parseFloat(raw || "0") : propertyValNum;
      const rAmt = fieldName === "requestedAmount" ? parseFloat(raw || "0") : requestedAmtNum;
      if (pVal > rAmt && rAmt > 0) {
        const autoDown = (pVal - rAmt).toString();
        setRawDownPayment(autoDown);
        form.setValue("downPayment", autoDown);
      }
    }
  };

  const saveLeadMutation = useMutation({
    mutationFn: async (data: MortgageLeadFormValues) => {
      const payload: any = {
        ...data,
        financedPercentage,
        financialInstitutionIds: selectedInstitutions,
      };

      if (selectedClient) {
        payload.clientId = selectedClient.id;
      }

      const response = await apiRequest("POST", "/api/mortgage-leads", payload);
      return response.json();
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credit-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

      toast({
        title: "Oportunidad Hipotecaria Registrada",
        description: res.message || "Se ha guardado la oportunidad y vinculado correctamente.",
      });

      onSuccess?.(res);
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Error al registrar",
        description: err.message || "No se pudo registrar la oportunidad hipotecaria.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: MortgageLeadFormValues) => {
    // Validar datos de contacto si no es cliente existente
    if (!selectedClient && (!data.firstName || !data.phone || !data.email)) {
      toast({
        title: "Datos de contacto incompletos",
        description: "Nombre, teléfono y correo electrónico son requeridos para dar de alta al prospecto.",
        variant: "destructive",
      });
      return;
    }
    saveLeadMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto p-6">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
              <Home className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span>Hipotecario Vivienda</span>
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-xs font-semibold">
                  Residencial
                </Badge>
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Alta ágil para adquisición de casa o departamento. Registro unificado de cliente y oportunidad.
              </p>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
            {/* SECCIÓN 1: DATOS DE CONTACTO */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                <div className="flex items-center space-x-2 text-sm font-semibold text-gray-800">
                  <User className="w-4 h-4 text-amber-700" />
                  <span>
                    {selectedClient ? "Cliente Seleccionado" : "1. Datos de Contacto del Prospecto"}
                  </span>
                </div>
                {selectedClient && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                    Cliente Existente
                  </Badge>
                )}
              </div>

              {selectedClient ? (
                // Camino B: Cliente Existente
                <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-blue-200">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm text-gray-900">
                      {selectedClient.type === "persona_moral"
                        ? selectedClient.businessName
                        : `${selectedClient.firstName || ""} ${selectedClient.lastName || ""}`.trim()}
                    </p>
                    <p className="text-xs text-gray-500">
                      {selectedClient.phone && `📞 ${selectedClient.phone}`}
                      {selectedClient.email && ` | ✉️ ${selectedClient.email}`}
                      {selectedClient.rfc && ` | RFC: ${selectedClient.rfc}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-blue-600 hover:text-blue-800"
                    onClick={() => setSelectedClient(null)}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : (
                // Camino A: Prospecto Nuevo
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Nombre(s) *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ej: Roberto"
                              {...field}
                              data-testid="input-lead-first-name"
                              className="bg-white text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Apellidos</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ej: González Pérez"
                              {...field}
                              data-testid="input-lead-last-name"
                              className="bg-white text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Teléfono celular *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="10 dígitos"
                              {...field}
                              onBlur={checkDuplicates}
                              data-testid="input-lead-phone"
                              className="bg-white text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">Correo electrónico *</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="nombre@ejemplo.com"
                              {...field}
                              onBlur={checkDuplicates}
                              data-testid="input-lead-email"
                              className="bg-white text-sm"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="rfc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">RFC (Opcional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="RFC con homoclave"
                              {...field}
                              onBlur={checkDuplicates}
                              data-testid="input-lead-rfc"
                              className="bg-white text-sm uppercase"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Banner preventivo de duplicados */}
                  {duplicateWarning && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start justify-between">
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">{duplicateWarning.message}</p>
                          <p className="text-amber-700 mt-0.5">
                            Puedes continuar con el alta si se trata de una nueva operación comercial.
                          </p>
                        </div>
                      </div>
                      {duplicateWarning.isSameTenant && duplicateWarning.existingClient && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="ml-3 text-xs border-amber-400 text-amber-800 hover:bg-amber-100 flex-shrink-0"
                          onClick={() => {
                            setSelectedClient(duplicateWarning.existingClient);
                            setDuplicateWarning(null);
                          }}
                        >
                          <UserCheck className="w-3.5 h-3.5 mr-1" />
                          Usar cliente existente
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SECCIÓN 2: DATOS DE LA OPERACIÓN */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center space-x-2 text-sm font-semibold text-gray-800 border-b border-gray-200 pb-2">
                <Home className="w-4 h-4 text-amber-700" />
                <span>2. Datos de la Operación Inmobiliaria</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="propertyValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Valor aprox. del inmueble *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            placeholder="$2,500,000"
                            value={rawPropertyValue ? formatMoney(rawPropertyValue) : ""}
                            onChange={(e) => handleMoneyChange(e.target.value, setRawPropertyValue, "propertyValue")}
                            data-testid="input-property-value"
                            className="pl-8 text-sm font-medium"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requestedAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Monto aprox. requerido *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            placeholder="$1,800,000"
                            value={rawRequestedAmount ? formatMoney(rawRequestedAmount) : ""}
                            onChange={(e) => handleMoneyChange(e.target.value, setRawRequestedAmount, "requestedAmount")}
                            data-testid="input-requested-amount"
                            className="pl-8 text-sm font-medium text-blue-700"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="downPayment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Enganche aproximado</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            placeholder="$700,000"
                            value={rawDownPayment ? formatMoney(rawDownPayment) : ""}
                            onChange={(e) => handleMoneyChange(e.target.value, setRawDownPayment, "downPayment")}
                            data-testid="input-down-payment"
                            className="pl-8 text-sm"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Porcentaje aproximado financiado */}
              {financedPercentage !== null && (
                <div className="flex items-center justify-between p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg text-xs">
                  <span className="font-medium text-amber-900">
                    Porcentaje aproximado financiado:{" "}
                    <strong className="text-amber-800 text-sm">{financedPercentage}%</strong>
                  </span>
                  <span className="text-amber-700 text-[11px]">
                    {financedPercentage <= 80
                      ? "✓ Cobertura dentro de estándares habituales bancarios"
                      : "Requiere validación de aforo con financiera"}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="propertyLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Ubicación / Dirección del inmueble *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: Col. Del Valle, Alcaldía Benito Juárez, CDMX"
                          {...field}
                          data-testid="input-property-location"
                          className="text-sm"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requestedTermMonths"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Plazo deseado</FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          setSimTermMonths(val);
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-mortgage-term" className="text-sm">
                            <SelectValue placeholder="Selecciona plazo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="60">5 años (60 meses)</SelectItem>
                          <SelectItem value="120">10 años (120 meses)</SelectItem>
                          <SelectItem value="180">15 años (180 meses)</SelectItem>
                          <SelectItem value="240">20 años (240 meses)</SelectItem>
                          <SelectItem value="300">25 años (300 meses)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* SECCIÓN 3: INGRESO Y COPRESTATARIO */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center space-x-2 text-sm font-semibold text-gray-800 border-b border-gray-200 pb-2">
                <DollarSign className="w-4 h-4 text-amber-700" />
                <span>3. Perfil de Ingreso y Coprestatario</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="monthlyIncome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Ingreso mensual aproximado *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            placeholder="$45,000"
                            value={rawMonthlyIncome ? formatMoney(rawMonthlyIncome) : ""}
                            onChange={(e) => handleMoneyChange(e.target.value, setRawMonthlyIncome, "monthlyIncome")}
                            data-testid="input-monthly-income"
                            className="pl-8 text-sm font-medium"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="incomeType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium">Tipo de ingreso *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-income-type" className="text-sm">
                            <SelectValue placeholder="Seleccionar tipo de ingreso" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="asalariado">Asalariado (Nómina)</SelectItem>
                          <SelectItem value="independiente">Independiente (Honorarios / PFAE)</SelectItem>
                          <SelectItem value="empresario">Empresario (Socio / Accionista)</SelectItem>
                          <SelectItem value="mixto">Mixto (Nómina + Honorarios/Negocio)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Coprestatario */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">¿Existe coprestatario?</p>
                    <p className="text-[11px] text-gray-500">
                      Cónyuge o familiar que sumará ingresos a la comprobación
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={!form.watch("hasCoBorrower") ? "default" : "outline"}
                      className="text-xs h-7 px-3"
                      onClick={() => form.setValue("hasCoBorrower", false)}
                      data-testid="toggle-coborrower-no"
                    >
                      No
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={form.watch("hasCoBorrower") ? "default" : "outline"}
                      className="text-xs h-7 px-3"
                      onClick={() => form.setValue("hasCoBorrower", true)}
                      data-testid="toggle-coborrower-yes"
                    >
                      Sí
                    </Button>
                  </div>
                </div>

                {form.watch("hasCoBorrower") && (
                  <div className="pt-2 border-t border-gray-200">
                    <FormField
                      control={form.control}
                      name="coBorrowerIncome"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium">
                            Ingreso mensual aproximado del coprestatario
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                              <Input
                                placeholder="$30,000"
                                value={rawCoBorrowerIncome ? formatMoney(rawCoBorrowerIncome) : ""}
                                onChange={(e) =>
                                  handleMoneyChange(e.target.value, setRawCoBorrowerIncome, "coBorrowerIncome")
                                }
                                data-testid="input-coborrower-income"
                                className="pl-8 text-sm"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* SECCIÓN 4: SIMULADOR HIPOTECARIO SENCILLO (Requerimiento 12 y 13) */}
            <div className="bg-gradient-to-br from-amber-50/50 to-orange-50/30 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-sm font-semibold text-amber-900 border-b border-amber-200 pb-2">
                <Calculator className="w-4 h-4 text-amber-700" />
                <span>Simulador de Mensualidad Aproximada</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div>
                  <label className="text-xs font-medium text-gray-700">Monto del crédito</label>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">
                    {requestedAmtNum > 0 ? `$${requestedAmtNum.toLocaleString("es-MX")} MXN` : "$1,000,000 MXN"}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700">Tasa anual estimada (%)</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="1"
                    max="30"
                    value={simInterestRate}
                    onChange={(e) => setSimInterestRate(e.target.value)}
                    data-testid="input-sim-rate"
                    className="bg-white text-sm h-8 mt-0.5"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700">Plazo (meses)</label>
                  <Select value={simTermMonths} onValueChange={setSimTermMonths}>
                    <SelectTrigger data-testid="select-sim-term" className="bg-white text-sm h-8 mt-0.5">
                      <SelectValue placeholder="Plazo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">60 meses (5 años)</SelectItem>
                      <SelectItem value="120">120 meses (10 años)</SelectItem>
                      <SelectItem value="180">180 meses (15 años)</SelectItem>
                      <SelectItem value="240">240 meses (20 años)</SelectItem>
                      <SelectItem value="300">300 meses (25 años)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Resultado del simulador */}
              <div className="p-3 bg-white rounded-lg border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-500 font-medium">Mensualidad aproximada calculada:</span>
                  <p className="text-lg font-bold text-amber-800" data-testid="text-sim-monthly-payment">
                    ${simMonthlyPayment.toLocaleString("es-MX")} MXN / mes
                  </p>
                </div>
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-xs">
                  {simTermMonths} meses @ {simInterestRate}% anual
                </Badge>
              </div>

              {/* Disclaimer legal estricto del simulador (Requerimiento 13) */}
              <p className="text-[11px] text-gray-500 leading-relaxed italic border-t border-amber-200/60 pt-2">
                “Simulación informativa. Los valores son estimados y no constituyen una oferta ni aprobación de crédito.
                Las condiciones finales serán determinadas por la institución financiera.”
              </p>
            </div>

            {/* SECCIÓN 5: INSTITUCIONES HIPOTECARIAS & PREFILTRO (Adjustment 3 & 4) */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                <div className="flex items-center space-x-2 text-sm font-semibold text-gray-800">
                  <Building2 className="w-4 h-4 text-amber-700" />
                  <span>Canalización a Instituciones Financieras (Opcional)</span>
                </div>
                <span className="text-[11px] text-gray-500">
                  {selectedInstitutions.length} seleccionada(s)
                </span>
              </div>

              {realMortgageInstitutionProducts.length === 0 ? (
                // Si no hay productos de vivienda parametrizados aún (Adjustment 3)
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5 text-blue-800">
                    <Info className="w-4 h-4 text-blue-600" />
                    Oportunidad registrada para revisión y canalización
                  </p>
                  <p className="text-blue-700 leading-relaxed">
                    Al guardar este prospecto, la oportunidad queda registrada en tu pipeline ("Mis Créditos") y en la
                    mesa de control administrativa. Podrás canalizarla en cualquier momento tras la revisión preliminar.
                  </p>
                </div>
              ) : (
                // Lista de productos reales configurados
                <div className="space-y-2">
                  <p className="text-xs text-gray-600">
                    Selecciona las financieras a las que deseas canalizar esta oportunidad ahora, o guárdala para
                    canalizarla después:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {realMortgageInstitutionProducts.map((ip: any) => {
                      const isSelected = selectedInstitutions.includes(ip.institutionId);
                      const instName = institutions?.find((i) => i.id === ip.institutionId)?.name || ip.customName;
                      return (
                        <div
                          key={ip.id}
                          onClick={() => {
                            setSelectedInstitutions((prev) =>
                              prev.includes(ip.institutionId)
                                ? prev.filter((id) => id !== ip.institutionId)
                                : [...prev, ip.institutionId]
                            );
                          }}
                          className={`p-2.5 rounded-lg border cursor-pointer text-xs flex items-center justify-between transition-colors ${
                            isSelected ? "bg-amber-50 border-amber-400" : "bg-white border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-gray-900">{instName}</p>
                            <p className="text-[11px] text-gray-500">{ip.customName || "Hipotecario Vivienda"}</p>
                          </div>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">
                            Disponible
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Leyenda obligatoria de prefiltro (Requerimiento 7) */}
              <p className="text-[11px] text-gray-500 italic">
                “Evaluación preliminar. La viabilidad y condiciones finales están sujetas al análisis de la institución financiera.”
              </p>
            </div>

            {/* SECCIÓN 6: NOTAS ADICIONALES */}
            <FormField
              control={form.control}
              name="brokerNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">Notas u observaciones de la operación</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Detalles específicos para la mesa de control sobre el prospecto, arraigo o urgencia..."
                      rows={2}
                      {...field}
                      data-testid="textarea-mortgage-notes"
                      className="text-xs"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* BOTONES DE ACCIÓN */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-mortgage-lead">
                Cancelar
              </Button>

              <div className="flex items-center space-x-3">
                <Button
                  type="submit"
                  disabled={saveLeadMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
                  data-testid="button-save-mortgage-lead"
                >
                  {saveLeadMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Home className="w-4 h-4 mr-1.5" />
                      {selectedInstitutions.length > 0
                        ? `Guardar y Canalizar (${selectedInstitutions.length})`
                        : "Guardar Prospecto"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
