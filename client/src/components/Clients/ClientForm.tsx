import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatedInsertClientSchema, type InsertClient } from "@shared/schema";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CurrencyInput from "@/components/ui/currency-input";
import { User, TrendingUp } from "lucide-react";

interface ClientFormProps {
  client?: any;
  onSuccess?: () => void;
}

const formSchema = updatedInsertClientSchema.extend({
  brokerId: updatedInsertClientSchema.shape.brokerId.optional(),
  rfc: updatedInsertClientSchema.shape.rfc.optional(), // RFC opcional para SIN SAT
}).superRefine((data, ctx) => {
  // Validaciones SOLO condicionales - permitir crear clientes con datos parciales
  
  // Validación condicional: si seleccionas "si" en atrasos, debes dar detalles
  if (data.atrasosDeudas === "si" && !data.atrasosDetalles) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Detalles de atrasos son requeridos cuando se selecciona 'SI'",
      path: ["atrasosDetalles"],
    });
  }
  
  // Validación condicional: si seleccionas "no" en SAT CIEC, debes indicar si tienes estados financieros
  if (data.satCiec === "no" && !data.estadosFinancieros) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Información sobre estados financieros es requerida cuando no acepta SAT CIEC",
      path: ["estadosFinancieros"],
    });
  }
  
  // Validación condicional: si seleccionas "negativa" en opinión, debes dar detalles
  if (data.opinionCumplimiento === "negativa" && !data.opinionDetalles) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Detalles de opinión negativa son requeridos",
      path: ["opinionDetalles"],
    });
  }
  
  // Validación condicional: si tienes créditos vigentes, debes dar detalles
  if (data.creditosVigentes === "si" && (!data.creditosVigentesDetalles || !Array.isArray(data.creditosVigentesDetalles) || data.creditosVigentesDetalles.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Detalles de créditos vigentes son requeridos cuando se selecciona 'SI'",
      path: ["creditosVigentesDetalles"],
    });
  }
  

  // Validaciones específicas para Persona Física
  if (data.type === "fisica") {
    if (!data.estadoCivil) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Estado civil es requerido para Persona Física",
        path: ["estadoCivil"],
      });
    }
    if (!data.nivelEducativo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nivel de educación es requerido para Persona Física",
        path: ["nivelEducativo"],
      });
    }
    if (!data.tipoVivienda) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tipo de vivienda es requerido para Persona Física",
        path: ["tipoVivienda"],
      });
    }
    if (!data.antiguedadLaboral) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Antigüedad laboral es requerida para Persona Física",
        path: ["antiguedadLaboral"],
      });
    }
    if (!data.puesto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Puesto es requerido para Persona Física",
        path: ["puesto"],
      });
    }
    if (data.dependientesEconomicos === undefined || data.dependientesEconomicos === null || data.dependientesEconomicos === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Número de dependientes económicos es requerido para Persona Física",
        path: ["dependientesEconomicos"],
      });
    }
    // Validaciones de perfilamiento para Persona Física
    if (!data.ingresoMensualPromedioComprobables) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ingreso mensual comprobable es requerido",
        path: ["ingresoMensualPromedioComprobables"],
      });
    }
    if (!data.ingresoMensualPromedioNoComprobables) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ingreso mensual no comprobable es requerido",
        path: ["ingresoMensualPromedioNoComprobables"],
      });
    }
    if (!data.gastosFijosMensualesPromedio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Gastos fijos mensuales es requerido",
        path: ["gastosFijosMensualesPromedio"],
      });
    }
    if (!data.buroPersonaFisica) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Información del buró de crédito persona física es requerida",
        path: ["buroPersonaFisica"],
      });
    }
    if (!data.atrasosDeudasBuro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Información sobre atrasos/deudas en buró es requerida",
        path: ["atrasosDeudasBuro"],
      });
    }
    if (data.atrasosDeudasBuro === "si" && !data.atrasosDeudasBuroDetalles) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Detalles de atrasos/deudas son requeridos cuando se selecciona 'SI'",
        path: ["atrasosDeudasBuroDetalles"],
      });
    }
    if (!data.cuentaConGarantiaFisica) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Información sobre garantía es requerida",
        path: ["cuentaConGarantiaFisica"],
      });
    }
    if (!data.tieneAvalObligadoSolidarioFisica) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Información sobre aval/obligado solidario es requerida",
        path: ["tieneAvalObligadoSolidarioFisica"],
      });
    }
    if (!data.creditosVigentes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Información sobre créditos vigentes es requerida",
        path: ["creditosVigentes"],
      });
    }
    // Validaciones condicionales para garantía prendaria - Persona Física
    if (data.cuentaConGarantiaFisica === "prendaria" && (!data.garantiaFisicaDetalles || Object.keys(data.garantiaFisicaDetalles).length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Detalles de garantía prendaria son requeridos",
        path: ["garantiaFisicaDetalles"],
      });
    }
    if (data.cuentaConGarantiaFisica === "hipotecaria" && (!data.garantiaFisicaDetalles || Object.keys(data.garantiaFisicaDetalles).length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Detalles de garantía hipotecaria son requeridos",
        path: ["garantiaFisicaDetalles"],
      });
    }
    // Validaciones condicionales para créditos vigentes - Persona Física
    if (data.creditosVigentes === "si" && (!data.creditosVigentesDetalles || !Array.isArray(data.creditosVigentesDetalles) || data.creditosVigentesDetalles.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Detalles de créditos vigentes son requeridos cuando se selecciona 'SI'",
        path: ["creditosVigentesDetalles"],
      });
    }
  }
});

export default function ClientForm({ client, onSuccess }: ClientFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [clientType, setClientType] = useState<"persona_moral" | "fisica_empresarial" | "fisica" | "sin_sat">(client?.type || "fisica");

  const form = useForm<InsertClient>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: clientType,
      businessName: client?.businessName || "",
      firstName: client?.firstName || "",
      lastName: client?.lastName || "",
      rfc: client?.rfc || "",
      curp: client?.curp || "",
      email: client?.email || "",
      phone: client?.phone || "",
      street: client?.street || "",
      number: client?.number || "",
      interior: client?.interior || "",
      postalCode: client?.postalCode || "",
      state: client?.state || "",
      industry: client?.industry || "",
      yearsInBusiness: client?.yearsInBusiness || 0,
      notes: client?.notes || "",
      profilingData: client?.profilingData || {},
      nivelEducacionAccionista: client?.nivelEducacionAccionista || "",
      tiempoActividad: client?.tiempoActividad || "",
      estadoCivil: client?.estadoCivil || "",
      sectoreEconomico: client?.sectoreEconomico || "",
      antiguedadEmpleo: client?.antiguedadEmpleo || "",
      // Campos específicos para Persona Moral
      ingresoMensualPromedio: client?.ingresoMensualPromedio || "",
      egresoMensualPromedio: client?.egresoMensualPromedio || "",
      ingresoAnual: client?.ingresoAnual || "",
      participacionVentasGobierno: client?.participacionVentasGobierno || "",
      ventasTerminalBancaria: client?.ventasTerminalBancaria || "",
      buroAccionistaPrincipal: client?.buroAccionistaPrincipal || "",
      buroEmpresa: client?.buroEmpresa || "",
      atrasosDeudas: client?.atrasosDeudas || "",
      atrasosDetalles: client?.atrasosDetalles || "",
      garantia: client?.garantia || "",
      garantiaDetalles: client?.garantiaDetalles || {},
      avalObligadoSolidario: client?.avalObligadoSolidario || "",
      satCiec: client?.satCiec || "",
      estadosFinancieros: client?.estadosFinancieros || "",
      opinionCumplimiento: client?.opinionCumplimiento || "",
      opinionDetalles: client?.opinionDetalles || "",
      creditosVigentes: client?.creditosVigentes || "",
      creditosVigentesDetalles: client?.creditosVigentesDetalles || [],
      // Nuevos campos específicos para Persona Física
      puesto: client?.puesto || "",
      antiguedadLaboral: client?.antiguedadLaboral || "",
      ingresoMensualPromedioComprobables: client?.ingresoMensualPromedioComprobables || "",
      ingresoMensualPromedioNoComprobables: client?.ingresoMensualPromedioNoComprobables || "",
      gastosFijosMensualesPromedio: client?.gastosFijosMensualesPromedio || "",
      buroPersonaFisica: client?.buroPersonaFisica || "",
      atrasosDeudasBuro: client?.atrasosDeudasBuro || "",
      atrasosDeudasBuroDetalles: client?.atrasosDeudasBuroDetalles || "",
      cuentaConGarantiaFisica: client?.cuentaConGarantiaFisica || "",
      garantiaFisicaDetalles: client?.garantiaFisicaDetalles || {},
      tieneAvalObligadoSolidarioFisica: client?.tieneAvalObligadoSolidarioFisica || "",
      observacionesAdicionalesFisica: client?.observacionesAdicionalesFisica || "",
      // Nuevos campos específicos para Sin SAT
      nombreComercial: client?.nombreComercial || "",
      ocupacion: client?.ocupacion || "",
      direccionNegocioAplica: client?.direccionNegocioAplica || "",
      esMismaDireccionNegocio: client?.esMismaDireccionNegocio || "",
      calleNegocio: client?.calleNegocio || "",
      numeroNegocio: client?.numeroNegocio || "",
      interiorNegocio: client?.interiorNegocio || "",
      codigoPostalNegocio: client?.codigoPostalNegocio || "",
      estadoNegocio: client?.estadoNegocio || "",
      ingresoMensualPromedioComprobablesSinSat: client?.ingresoMensualPromedioComprobablesSinSat || "",
      ingresoMensualPromedioNoComprobablesSinSat: client?.ingresoMensualPromedioNoComprobablesSinSat || "",
      gastosFijosMensualesPromedioSinSat: client?.gastosFijosMensualesPromedioSinSat || "",
      buroPersonaFisicaSinSat: client?.buroPersonaFisicaSinSat || "",
      atrasosDeudasBuroSinSat: client?.atrasosDeudasBuroSinSat || "",
      atrasosDeudasBuroDetallesSinSat: client?.atrasosDeudasBuroDetallesSinSat || "",
      cuentaConGarantiaSinSat: client?.cuentaConGarantiaSinSat || "",
      garantiaSinSatDetalles: client?.garantiaSinSatDetalles || {},
      tieneAvalObligadoSolidarioSinSat: client?.tieneAvalObligadoSolidarioSinSat || "",
      observacionesAdicionalesSinSat: client?.observacionesAdicionalesSinSat || "",
      ...client,
    },
  });

  // useFieldArray hook for managing multiple credits (unified for all client types)
  const { fields: creditFields, append: appendCredit } = useFieldArray({
    control: form.control,
    name: "creditosVigentesDetalles",
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertClient) => {
      const response = await apiRequest("POST", "/api/clients", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: "Cliente creado",
        description: "El cliente ha sido creado exitosamente.",
      });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertClient) => {
      const response = await apiRequest("PUT", `/api/clients/${client.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: "Cliente actualizado",
        description: "El cliente ha sido actualizado exitosamente.",
      });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertClient) => {
    const submitData = {
      ...data,
      type: clientType,
    };

    if (client) {
      updateMutation.mutate(submitData);
    } else {
      createMutation.mutate(submitData);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{client ? "Editar Cliente" : "Nuevo Cliente"}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Client Type Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">Tipo de Cliente</label>
              <Tabs value={clientType} onValueChange={(value) => {
                  setClientType(value as "persona_moral" | "fisica_empresarial" | "fisica" | "sin_sat");
                  form.setValue("type", value as any, { shouldValidate: true });
                }}>
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto bg-transparent gap-1">
                  <TabsTrigger 
                    value="persona_moral" 
                    data-testid="tab-persona-moral" 
                    disabled={!!client} 
                    className="text-xs sm:text-sm py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=inactive]:bg-blue-100 data-[state=inactive]:text-blue-700 data-[state=inactive]:hover:bg-blue-200 border border-blue-300 rounded-md transition-colors"
                  >
                    Persona Moral
                  </TabsTrigger>
                  <TabsTrigger 
                    value="fisica_empresarial" 
                    data-testid="tab-pfae" 
                    disabled={!!client} 
                    className="text-xs sm:text-sm py-2 data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=inactive]:bg-green-100 data-[state=inactive]:text-green-700 data-[state=inactive]:hover:bg-green-200 border border-green-300 rounded-md transition-colors"
                  >
                    PFAE
                  </TabsTrigger>
                  <TabsTrigger 
                    value="fisica" 
                    data-testid="tab-fisica" 
                    disabled={!!client} 
                    className="text-xs sm:text-sm py-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=inactive]:bg-purple-100 data-[state=inactive]:text-purple-700 data-[state=inactive]:hover:bg-purple-200 border border-purple-300 rounded-md transition-colors"
                  >
                    Persona Física
                  </TabsTrigger>
                  <TabsTrigger 
                    value="sin_sat" 
                    data-testid="tab-sin-sat" 
                    disabled={!!client} 
                    className="text-xs sm:text-sm py-2 data-[state=active]:bg-gray-600 data-[state=active]:text-white data-[state=inactive]:bg-gray-100 data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-200 border border-gray-300 rounded-md transition-colors"
                  >
                    Sin SAT
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="fisica" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre(s)</FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre(s)" {...field} value={field.value || ''} data-testid="input-first-name" />
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
                          <FormLabel>Apellidos</FormLabel>
                          <FormControl>
                            <Input placeholder="Apellidos" {...field} value={field.value || ''} data-testid="input-last-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="curp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CURP</FormLabel>
                        <FormControl>
                          <Input placeholder="CURP" {...field} value={field.value || ''} data-testid="input-curp" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Datos Básicos para Personas Físicas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="estadoCivil"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estado Civil</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-fisica-marital-status">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="soltero">Soltero(a)</SelectItem>
                              <SelectItem value="casado">Casado(a)</SelectItem>
                              <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                              <SelectItem value="viudo">Viudo(a)</SelectItem>
                              <SelectItem value="union_libre">Unión Libre</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="dependientesEconomicos"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número de Dependientes Económicos</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              placeholder="0"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value)}
                              value={field.value ?? ''}
                              data-testid="input-fisica-dependents"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="nivelEducativo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nivel de Educación</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-fisica-education">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="primaria">Primaria</SelectItem>
                              <SelectItem value="secundaria">Secundaria</SelectItem>
                              <SelectItem value="preparatoria">Preparatoria</SelectItem>
                              <SelectItem value="universidad">Universidad</SelectItem>
                              <SelectItem value="posgrado">Posgrado</SelectItem>
                              <SelectItem value="otro">Otro</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="tipoVivienda"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Vivienda</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-fisica-housing">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="propia">Propia</SelectItem>
                              <SelectItem value="rentada">Rentada</SelectItem>
                              <SelectItem value="familiar">Familiar</SelectItem>
                              <SelectItem value="otra">Otra</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="antiguedadLaboral"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Antigüedad Laboral</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-fisica-work-seniority">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="menos-6-meses">Menos de 6 meses</SelectItem>
                              <SelectItem value="6-12-meses">6 a 12 meses</SelectItem>
                              <SelectItem value="1-2-anos">1 a 2 años</SelectItem>
                              <SelectItem value="2-5-anos">2 a 5 años</SelectItem>
                              <SelectItem value="5-10-anos">5 a 10 años</SelectItem>
                              <SelectItem value="mas-10-anos">Más de 10 años</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="puesto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Puesto</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Ej. Gerente, Vendedor, Contador"
                              {...field}
                              value={field.value ?? ''}
                              data-testid="input-fisica-position"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="sin_sat" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre(s)</FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre(s)" {...field} value={field.value || ''} data-testid="input-first-name" />
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
                          <FormLabel>Apellidos</FormLabel>
                          <FormControl>
                            <Input placeholder="Apellidos" {...field} value={field.value || ''} data-testid="input-last-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="curp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CURP</FormLabel>
                          <FormControl>
                            <Input placeholder="CURP" {...field} value={field.value || ''} data-testid="input-sinsat-curp" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="ocupacion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ocupación</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-sinsat-occupation">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="empleado">Empleado</SelectItem>
                              <SelectItem value="independiente">Independiente</SelectItem>
                              <SelectItem value="empresario">Empresario</SelectItem>
                              <SelectItem value="pensionado">Pensionado</SelectItem>
                              <SelectItem value="estudiante">Estudiante</SelectItem>
                              <SelectItem value="ama-casa">Ama de casa</SelectItem>
                              <SelectItem value="otro">Otro</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Datos Básicos específicos para Sin SAT */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="estadoCivil"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estado Civil</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-sinsat-marital-status">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="soltero">Soltero(a)</SelectItem>
                              <SelectItem value="casado">Casado(a)</SelectItem>
                              <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                              <SelectItem value="viudo">Viudo(a)</SelectItem>
                              <SelectItem value="union_libre">Unión Libre</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="dependientesEconomicos"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número de Dependientes Económicos</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              min="0"
                              placeholder="0"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value)}
                              value={field.value ?? ''}
                              data-testid="input-sinsat-dependents"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="nivelEducativo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nivel De Educación</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-sinsat-education">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="primaria">Primaria</SelectItem>
                              <SelectItem value="secundaria">Secundaria</SelectItem>
                              <SelectItem value="preparatoria">Preparatoria</SelectItem>
                              <SelectItem value="tecnico">Técnico</SelectItem>
                              <SelectItem value="licenciatura">Licenciatura</SelectItem>
                              <SelectItem value="posgrado">Posgrado</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="tipoVivienda"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Vivienda</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-sinsat-housing">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="propia">Propia</SelectItem>
                              <SelectItem value="rentada">Rentada</SelectItem>
                              <SelectItem value="familiar">Familiar</SelectItem>
                              <SelectItem value="hipotecada">Hipotecada</SelectItem>
                              <SelectItem value="otro">Otro</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="nombreComercial"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre Comercial</FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre del negocio" {...field} value={field.value || ''} data-testid="input-sinsat-business-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Giro Comercial</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej. Comercio, Servicios" {...field} value={field.value || ''} data-testid="input-sinsat-industry" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="puesto"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Puesto</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ej. Gerente, Vendedor, Contador, Propietario"
                            {...field}
                            value={field.value ?? ''}
                            data-testid="input-sinsat-position"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Dirección del Negocio */}
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="text-lg font-medium">Dirección del Negocio</h3>
                    
                    <FormField
                      control={form.control}
                      name="direccionNegocioAplica"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>¿Aplica dirección de negocio?</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-sinsat-business-address-applies">
                                <SelectValue placeholder="Seleccionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="si">Sí</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    {form.watch("direccionNegocioAplica") === "si" && (
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="esMismaDireccionNegocio"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>¿Es la misma dirección personal?</FormLabel>
                              <Select 
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  if (value === "si") {
                                    // Copiar datos de dirección personal a negocio
                                    const personalStreet = form.getValues("street");
                                    const personalNumber = form.getValues("number");
                                    const personalInterior = form.getValues("interior");
                                    const personalPostalCode = form.getValues("postalCode");
                                    const personalState = form.getValues("state");
                                    
                                    form.setValue("calleNegocio", personalStreet || "");
                                    form.setValue("numeroNegocio", personalNumber || "");
                                    form.setValue("interiorNegocio", personalInterior || "");
                                    form.setValue("codigoPostalNegocio", personalPostalCode || "");
                                    form.setValue("estadoNegocio", personalState || "");
                                  }
                                }}
                                value={field.value || ""}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-sinsat-same-address">
                                    <SelectValue placeholder="Seleccionar" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="si">Sí</SelectItem>
                                  <SelectItem value="no">No</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        {form.watch("esMismaDireccionNegocio") === "no" && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name="calleNegocio"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Calle del Negocio</FormLabel>
                                    <FormControl>
                                      <Input 
                                        placeholder="Nombre de la calle"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-sinsat-business-street"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="numeroNegocio"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Número del Negocio</FormLabel>
                                    <FormControl>
                                      <Input 
                                        placeholder="123"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-sinsat-business-number"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <FormField
                                control={form.control}
                                name="interiorNegocio"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Interior (Opcional)</FormLabel>
                                    <FormControl>
                                      <Input 
                                        placeholder="Local 1, Piso 2"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-sinsat-business-interior"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="codigoPostalNegocio"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Código Postal</FormLabel>
                                    <FormControl>
                                      <Input 
                                        placeholder="12345"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-sinsat-business-postal"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="estadoNegocio"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Estado</FormLabel>
                                    <FormControl>
                                      <Input 
                                        placeholder="Estado"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-sinsat-business-state"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="persona_moral" className="space-y-4">
                  <FormField
                    control={form.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Razón Social</FormLabel>
                        <FormControl>
                          <Input placeholder="Razón Social de la empresa" {...field} value={field.value || ''} data-testid="input-business-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Giro/Industria</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej. Comercio, Manufactura" {...field} value={field.value || ''} data-testid="input-industry" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="yearsInBusiness"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Años en el Negocio</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              min="0"
                              placeholder="5"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              value={field.value ?? ''}
                              data-testid="input-years-business"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Nivel de Educación Accionista / Dueño - Solo para Persona Moral */}
                  <FormField
                    control={form.control}
                    name="nivelEducacionAccionista"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nivel de Educación Accionista / Dueño</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-shareholder-education">
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="primaria">Primaria</SelectItem>
                            <SelectItem value="secundaria">Secundaria</SelectItem>
                            <SelectItem value="preparatoria">Preparatoria</SelectItem>
                            <SelectItem value="tecnico">Técnico</SelectItem>
                            <SelectItem value="licenciatura">Licenciatura</SelectItem>
                            <SelectItem value="posgrado">Posgrado</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                <TabsContent value="fisica_empresarial" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre(s)</FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre(s)" {...field} value={field.value || ''} data-testid="input-first-name" />
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
                          <FormLabel>Apellidos</FormLabel>
                          <FormControl>
                            <Input placeholder="Apellidos" {...field} value={field.value || ''} data-testid="input-last-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Actividad Empresarial</FormLabel>
                        <FormControl>
                          <Input placeholder="Descripción de la actividad empresarial" {...field} value={field.value || ''} data-testid="input-business-activity" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="curp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CURP</FormLabel>
                          <FormControl>
                            <Input placeholder="CURP" {...field} value={field.value || ''} data-testid="input-curp" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="industry"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Giro Profesional</FormLabel>
                          <FormControl>
                            <Input placeholder="Ej. Consultoría, Servicios" {...field} value={field.value || ''} data-testid="input-industry" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Estado Civil - Solo para PFAE */}
                  <FormField
                    control={form.control}
                    name="estadoCivil"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado Civil</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-pfae-marital-status">
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="soltero">Soltero</SelectItem>
                            <SelectItem value="casado">Casado</SelectItem>
                            <SelectItem value="union-libre">Unión libre</SelectItem>
                            <SelectItem value="divorciado">Divorciado</SelectItem>
                            <SelectItem value="viudo">Viudo</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>
            </div>
            
            {/* Perfilamiento Tab */}
            <div className="space-y-6">
              <Tabs defaultValue="datos-basicos" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-transparent gap-2 p-1">
                  <TabsTrigger 
                    value="datos-basicos"
                    className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:bg-sky-100 data-[state=inactive]:text-sky-700 data-[state=inactive]:hover:bg-sky-200 border border-sky-300 rounded-md transition-colors font-medium"
                  >
                    <User className="w-4 h-4 mr-2" aria-hidden="true" />
                    Datos Básicos
                  </TabsTrigger>
                  <TabsTrigger 
                    value="perfilamiento"
                    className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=inactive]:bg-teal-100 data-[state=inactive]:text-teal-700 data-[state=inactive]:hover:bg-teal-200 border border-teal-300 rounded-md transition-colors font-medium"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" aria-hidden="true" />
                    Perfilamiento
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="datos-basicos" className="space-y-4">
                  {/* RFC and Phone fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {clientType !== "sin_sat" && (
                      <FormField
                        control={form.control}
                        name="rfc"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>RFC *</FormLabel>
                            <FormControl>
                              <Input placeholder="RFC" {...field} value={field.value || ''} data-testid="input-rfc" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Teléfono</FormLabel>
                          <FormControl>
                            <Input placeholder="+52 55 1234 5678" {...field} value={field.value || ''} data-testid="input-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="correo@ejemplo.com" {...field} value={field.value || ''} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Dirección separada en campos */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="street"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Calle</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Nombre de la calle"
                              {...field}
                              value={field.value || ''}
                              data-testid="input-street"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="123"
                              {...field}
                              value={field.value || ''}
                              data-testid="input-number"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="interior"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Interior (Opcional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Apt 101, Piso 2"
                              {...field}
                              value={field.value || ''}
                              data-testid="input-interior"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Código Postal</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="12345"
                              {...field}
                              value={field.value || ''}
                              data-testid="input-postal-code"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estado</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Ciudad de México"
                              {...field}
                              value={field.value || ''}
                              data-testid="input-state"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notas</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Notas adicionales..."
                            className="min-h-[80px]"
                            {...field}
                            value={field.value || ''}
                            data-testid="input-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                
                <TabsContent value="perfilamiento" className="space-y-6">
                  <Card className="border-primary/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <i className="fas fa-user-chart text-primary"></i>
                        Perfil del Cliente
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Campos específicos de perfilamiento para Persona Física */}
                      {clientType === "fisica" && (
                        <>
                          <div className="mt-2 pt-4 border-t border-primary/20">
                            {/* Ingreso mensual promedio con subcampos */}
                            <div className="space-y-4 mb-6">
                              <h3 className="text-lg font-semibold text-primary">Ingreso Mensual Promedio (últimos 6 meses)</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                  control={form.control}
                                  name="ingresoMensualPromedioComprobables"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Comprobables</FormLabel>
                                      <FormControl>
                                        <CurrencyInput
                                          value={field.value || ''}
                                          onChange={(formatted, raw) => field.onChange(raw)}
                                          placeholder="Ingresa el monto comprobable"
                                          data-testid="input-fisica-income-provable"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                
                                <FormField
                                  control={form.control}
                                  name="ingresoMensualPromedioNoComprobables"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>No Comprobables</FormLabel>
                                      <FormControl>
                                        <CurrencyInput
                                          value={field.value || ''}
                                          onChange={(formatted, raw) => field.onChange(raw)}
                                          placeholder="Ingresa el monto no comprobable"
                                          data-testid="input-fisica-income-non-provable"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>

                            {/* Gastos fijos mensuales promedio */}
                            <FormField
                              control={form.control}
                              name="gastosFijosMensualesPromedio"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Gastos Fijos Mensuales Promedio (últimos 6 meses)</FormLabel>
                                  <FormControl>
                                    <CurrencyInput
                                      value={field.value || ''}
                                      onChange={(formatted, raw) => field.onChange(raw)}
                                      placeholder="Ingresa el monto de gastos fijos"
                                      data-testid="input-fisica-fixed-expenses"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Buró de Crédito Persona Física */}
                            <FormField
                              control={form.control}
                              name="buroPersonaFisica"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Buró de Crédito Persona Física</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-fisica-credit-bureau">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="alto-694-760">Alto 694-760</SelectItem>
                                      <SelectItem value="bueno-592-693">Bueno 592-693</SelectItem>
                                      <SelectItem value="medio-524-591">Medio 524-591</SelectItem>
                                      <SelectItem value="bajo-490-523">Bajo 490-523</SelectItem>
                                      <SelectItem value="malo-456-489">Malo 456-489</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Atrasos, Deudas, Quitas en Buró */}
                            <FormField
                              control={form.control}
                              name="atrasosDeudasBuro"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Atrasos, Deudas, Quitas en Buró?</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-fisica-bureau-delays">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campo condicional para detalles de atrasos */}
                            {form.watch("atrasosDeudasBuro") === "si" && (
                              <FormField
                                control={form.control}
                                name="atrasosDeudasBuroDetalles"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Detalles de Atrasos, Deudas, Quitas</FormLabel>
                                    <FormControl>
                                      <Textarea 
                                        placeholder="Describir detalles..."
                                        className="min-h-[80px]"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-fisica-delays-details"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {/* Cuenta con Garantía */}
                            <FormField
                              control={form.control}
                              name="cuentaConGarantiaFisica"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cuenta con Garantía</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-fisica-guarantee">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="sin-garantia">Sin Garantía</SelectItem>
                                      <SelectItem value="prendaria">Prendaria</SelectItem>
                                      <SelectItem value="hipotecaria">Hipotecaria / Inmuebles</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campos condicionales para garantía prendaria */}
                            {form.watch("cuentaConGarantiaFisica") === "prendaria" && (
                              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-gray-50">
                                <h4 className="col-span-full font-semibold text-gray-800">Detalles Garantía Prendaria</h4>
                                <FormField
                                  control={form.control}
                                  name="garantiaFisicaDetalles.tipo"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Tipo</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value || ""}>
                                        <FormControl>
                                          <SelectTrigger data-testid="select-fisica-prendaria-type">
                                            <SelectValue placeholder="Seleccionar" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="vehiculos">Vehículos</SelectItem>
                                          <SelectItem value="maquinaria">Maquinaria</SelectItem>
                                          <SelectItem value="otros">Otros</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="garantiaFisicaDetalles.valor"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Valor</FormLabel>
                                      <FormControl>
                                        <CurrencyInput
                                          value={field.value || ''}
                                          onChange={(formatted, raw) => field.onChange(raw)}
                                          placeholder="Ingresa el valor"
                                          data-testid="input-fisica-prendaria-value"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="garantiaFisicaDetalles.ano"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Año</FormLabel>
                                      <FormControl>
                                        <Input 
                                          placeholder="2020"
                                          {...field}
                                          value={field.value || ''}
                                          data-testid="input-fisica-prendaria-year"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            )}

                            {/* Campos condicionales para garantía hipotecaria */}
                            {form.watch("cuentaConGarantiaFisica") === "hipotecaria" && (
                              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-gray-50">
                                <h4 className="col-span-full font-semibold text-gray-800">Detalles Garantía Hipotecaria / Inmuebles</h4>
                                <FormField
                                  control={form.control}
                                  name="garantiaFisicaDetalles.tipoInmueble"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Tipo de Inmueble</FormLabel>
                                      <Select onValueChange={field.onChange} value={field.value || ""}>
                                        <FormControl>
                                          <SelectTrigger data-testid="select-fisica-hipotecaria-type">
                                            <SelectValue placeholder="Seleccionar" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="oficina">Oficina</SelectItem>
                                          <SelectItem value="departamento">Departamento</SelectItem>
                                          <SelectItem value="casa">Casa</SelectItem>
                                          <SelectItem value="bodega">Bodega</SelectItem>
                                          <SelectItem value="terreno">Terreno</SelectItem>
                                          <SelectItem value="otro">Otro</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="garantiaFisicaDetalles.valor"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Valor</FormLabel>
                                      <FormControl>
                                        <CurrencyInput
                                          value={field.value || ''}
                                          onChange={(formatted, raw) => field.onChange(raw)}
                                          placeholder="Ingresa el valor"
                                          data-testid="input-fisica-hipotecaria-value"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="garantiaFisicaDetalles.ubicacion"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Ubicación</FormLabel>
                                      <FormControl>
                                        <Input 
                                          placeholder="Ciudad, Estado"
                                          {...field}
                                          value={field.value || ''}
                                          data-testid="input-fisica-hipotecaria-location"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={form.control}
                                  name="garantiaFisicaDetalles.situacionLegal"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Situación Legal</FormLabel>
                                      <FormControl>
                                        <Input 
                                          placeholder="En regla, Con gravamen, etc."
                                          {...field}
                                          value={field.value || ''}
                                          data-testid="input-fisica-hipotecaria-legal"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            )}

                            {/* Tiene Aval u Obligado Solidario */}
                            <FormField
                              control={form.control}
                              name="tieneAvalObligadoSolidarioFisica"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Tiene Aval u Obligado Solidario (en caso de ser necesario)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-fisica-guarantor">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Créditos vigentes */}
                            <FormField
                              control={form.control}
                              name="creditosVigentes"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Créditos Vigentes</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-fisica-active-credits">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campos condicionales para créditos vigentes */}
                            {form.watch("creditosVigentes") === "si" && (
                              <div className="mt-4 space-y-4">
                                <h4 className="text-md font-medium">Detalles de Créditos Vigentes</h4>
                                {creditFields.map((field, index) => (
                                  <div key={field.id} className="border p-4 rounded-lg space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.tipo`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Tipo</FormLabel>
                                            <FormControl>
                                              <Input 
                                                placeholder="Hipotecario, Automotriz, Personal, etc."
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-fisica-credit-type-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.institucion`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Institución</FormLabel>
                                            <FormControl>
                                              <Input 
                                                placeholder="Banco, Financiera, etc."
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-fisica-credit-institution-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.saldoOriginal`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Saldo Original</FormLabel>
                                            <FormControl>
                                              <CurrencyInput
                                                value={field.value || ''}
                                                onChange={(formatted, raw) => field.onChange(raw)}
                                                placeholder="Ingresa el saldo original"
                                                data-testid={`input-fisica-credit-original-balance-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.saldo`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Saldo Actual</FormLabel>
                                            <FormControl>
                                              <CurrencyInput
                                                value={field.value || ''}
                                                onChange={(formatted, raw) => field.onChange(raw)}
                                                placeholder="Ingresa el saldo actual"
                                                data-testid={`input-fisica-credit-current-balance-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.fechaInicio`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Fecha Inicio</FormLabel>
                                            <FormControl>
                                              <Input 
                                                type="date"
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-fisica-credit-start-date-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.fechaTermino`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Fecha Término</FormLabel>
                                            <FormControl>
                                              <Input 
                                                type="date"
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-fisica-credit-end-date-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                  </div>
                                ))}
                                
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => appendCredit({ tipo: "", saldoOriginal: "", saldo: "", institucion: "", fechaInicio: "", fechaTermino: "" })}
                                    className="px-4 py-2 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary hover:text-white transition-colors"
                                    data-testid="button-fisica-add-credit"
                                  >
                                    + Agregar otro crédito
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Observaciones Adicionales */}
                            <FormField
                              control={form.control}
                              name="observacionesAdicionalesFisica"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Observaciones Adicionales</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      placeholder="Observaciones adicionales..."
                                      className="min-h-[100px]"
                                      {...field}
                                      value={field.value || ''}
                                      data-testid="input-fisica-additional-observations"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </>
                      )}

                      {/* Campos específicos para Sin SAT */}
                      {clientType === "sin_sat" && (
                        <>
                          <div className="mt-8 pt-6 border-t border-primary/20">
                            {/* Ingresos Mensuales Comprobables y No Comprobables */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                              <FormField
                                control={form.control}
                                name="ingresoMensualPromedioComprobablesSinSat"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Ingreso Mensual Promedio Comprobables (últimos 6 meses)</FormLabel>
                                    <FormControl>
                                      <CurrencyInput
                                        value={field.value || ''}
                                        onChange={(formatted, raw) => field.onChange(raw)}
                                        placeholder="Ingresa el monto comprobable"
                                        data-testid="input-sinsat-provable-income"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="ingresoMensualPromedioNoComprobablesSinSat"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Ingreso Mensual Promedio No Comprobables (últimos 6 meses)</FormLabel>
                                    <FormControl>
                                      <CurrencyInput
                                        value={field.value || ''}
                                        onChange={(formatted, raw) => field.onChange(raw)}
                                        placeholder="Ingresa el monto no comprobable"
                                        data-testid="input-sinsat-unprovable-income"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            {/* Gastos Fijos Mensuales */}
                            <FormField
                              control={form.control}
                              name="gastosFijosMensualesPromedioSinSat"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Gastos Fijos Mensuales Promedio (últimos 6 meses)</FormLabel>
                                  <FormControl>
                                    <CurrencyInput
                                      value={field.value || ''}
                                      onChange={(formatted, raw) => field.onChange(raw)}
                                      placeholder="Ingresa el monto de gastos fijos"
                                      data-testid="input-sinsat-fixed-expenses"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Buró de Crédito Persona Física */}
                            <FormField
                              control={form.control}
                              name="buroPersonaFisicaSinSat"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Buró de Crédito Persona Física</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-sinsat-credit-bureau">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Scoring de Buró - Solo aparece si tiene buró */}
                            {form.watch("buroPersonaFisicaSinSat") === "si" && (
                              <FormField
                                control={form.control}
                                name="buroAccionistaPrincipal" // Reutilizamos este campo para el scoring
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Scoring en Buró de Crédito</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                      <FormControl>
                                        <SelectTrigger data-testid="select-sinsat-credit-scoring">
                                          <SelectValue placeholder="Seleccionar" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="alto-694-760">Alto 694-760</SelectItem>
                                        <SelectItem value="bueno-592-693">Bueno 592-693</SelectItem>
                                        <SelectItem value="medio-524-591">Medio 524-591</SelectItem>
                                        <SelectItem value="bajo-490-523">Bajo 490-523</SelectItem>
                                        <SelectItem value="malo-456-489">Malo 456-489</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {/* Atrasos, Deudas, Quitas en Buró */}
                            <FormField
                              control={form.control}
                              name="atrasosDeudasBuroSinSat"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Atrasos, Deudas, Quitas en Buró?</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-sinsat-bureau-issues">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campo condicional para detalles de atrasos */}
                            {form.watch("atrasosDeudasBuroSinSat") === "si" && (
                              <FormField
                                control={form.control}
                                name="atrasosDeudasBuroDetallesSinSat"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Detalle de Atrasos/Deudas</FormLabel>
                                    <FormControl>
                                      <Textarea 
                                        placeholder="Describa los atrasos, deudas o quitas..."
                                        className="min-h-[80px]"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-sinsat-bureau-issues-details"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {/* Cuenta con Garantía */}
                            <FormField
                              control={form.control}
                              name="cuentaConGarantiaSinSat"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cuenta con Garantía</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-sinsat-guarantee-type">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="sin-garantia">Sin Garantía</SelectItem>
                                      <SelectItem value="prendaria">Prendaria (Vehículos, Maquinaria, etc.)</SelectItem>
                                      <SelectItem value="hipotecaria">Hipotecaria / Inmuebles</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Detalles de Garantía Prendaria */}
                            {form.watch("cuentaConGarantiaSinSat") === "prendaria" && (
                              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField
                                  control={form.control}
                                  name="garantiaSinSatDetalles.tipo"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Tipo</FormLabel>
                                      <FormControl>
                                        <Input 
                                          placeholder="Vehículo, Maquinaria, etc."
                                          {...field}
                                          value={field.value || ''}
                                          data-testid="input-sinsat-collateral-type"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                
                                <FormField
                                  control={form.control}
                                  name="garantiaSinSatDetalles.valor"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Valor</FormLabel>
                                      <FormControl>
                                        <CurrencyInput
                                          value={field.value || ''}
                                          onChange={(formatted, raw) => field.onChange(raw)}
                                          placeholder="Ingresa el valor"
                                          data-testid="input-sinsat-collateral-value"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                
                                <FormField
                                  control={form.control}
                                  name="garantiaSinSatDetalles.ano"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Año</FormLabel>
                                      <FormControl>
                                        <Input 
                                          type="number"
                                          placeholder="2020"
                                          {...field}
                                          value={field.value || ''}
                                          data-testid="input-sinsat-collateral-year"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            )}

                            {/* Detalles de Garantía Hipotecaria */}
                            {form.watch("cuentaConGarantiaSinSat") === "hipotecaria" && (
                              <div className="mt-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="garantiaSinSatDetalles.tipoInmueble"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Tipo de Inmueble</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || ""}>
                                          <FormControl>
                                            <SelectTrigger data-testid="select-sinsat-property-type">
                                              <SelectValue placeholder="Seleccionar" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <SelectItem value="oficina">Oficina</SelectItem>
                                            <SelectItem value="departamento">Departamento</SelectItem>
                                            <SelectItem value="casa">Casa</SelectItem>
                                            <SelectItem value="bodega">Bodega</SelectItem>
                                            <SelectItem value="terreno">Terreno</SelectItem>
                                            <SelectItem value="otro">Otro</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  
                                  <FormField
                                    control={form.control}
                                    name="garantiaSinSatDetalles.valorInmueble"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Valor</FormLabel>
                                        <FormControl>
                                          <CurrencyInput
                                            value={field.value || ''}
                                            onChange={(formatted, raw) => field.onChange(raw)}
                                            placeholder="Ingresa el valor"
                                            data-testid="input-sinsat-property-value"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="garantiaSinSatDetalles.ubicacion"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Ubicación</FormLabel>
                                        <FormControl>
                                          <Input 
                                            placeholder="Ciudad, Estado"
                                            {...field}
                                            value={field.value || ''}
                                            data-testid="input-sinsat-property-location"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  
                                  <FormField
                                    control={form.control}
                                    name="garantiaSinSatDetalles.situacionLegal"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Situación Legal</FormLabel>
                                        <FormControl>
                                          <Input 
                                            placeholder="Escriturado, En trámite, etc."
                                            {...field}
                                            value={field.value || ''}
                                            data-testid="input-sinsat-property-legal-status"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Tiene Aval u Obligado Solidario */}
                            <FormField
                              control={form.control}
                              name="tieneAvalObligadoSolidarioSinSat"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Tiene Aval u Obligado Solidario (en caso de ser necesario)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-sinsat-guarantor">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Créditos Vigentes */}
                            <FormField
                              control={form.control}
                              name="creditosVigentes"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Créditos Vigentes</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-sinsat-active-credits">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Detalles de Créditos Vigentes */}
                            {form.watch("creditosVigentes") === "si" && (
                              <div className="mt-4 space-y-4">
                                <h4 className="text-md font-medium">Detalles de Créditos Vigentes</h4>
                                {creditFields.map((field, index) => (
                                  <div key={field.id} className="border p-4 rounded-lg space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.tipo`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Tipo</FormLabel>
                                            <FormControl>
                                              <Input 
                                                placeholder="Hipotecario, Automotriz, Personal, etc."
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-sinsat-credit-type-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.institucion`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Institución</FormLabel>
                                            <FormControl>
                                              <Input 
                                                placeholder="Banco, Financiera, etc."
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-sinsat-credit-institution-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.saldoOriginal`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Saldo Original</FormLabel>
                                            <FormControl>
                                              <CurrencyInput
                                                value={field.value || ''}
                                                onChange={(formatted, raw) => field.onChange(raw)}
                                                placeholder="Ingresa el saldo original"
                                                data-testid={`input-sinsat-credit-original-balance-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.saldo`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Saldo Actual</FormLabel>
                                            <FormControl>
                                              <CurrencyInput
                                                value={field.value || ''}
                                                onChange={(formatted, raw) => field.onChange(raw)}
                                                placeholder="Ingresa el saldo actual"
                                                data-testid={`input-sinsat-credit-balance-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.fechaInicio`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Fecha Inicio</FormLabel>
                                            <FormControl>
                                              <Input 
                                                type="date"
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-sinsat-credit-start-date-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.fechaTermino`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Fecha Término</FormLabel>
                                            <FormControl>
                                              <Input 
                                                type="date"
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-sinsat-credit-end-date-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                  </div>
                                ))}
                                
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => appendCredit({ tipo: "", saldoOriginal: "", saldo: "", institucion: "", fechaInicio: "", fechaTermino: "" })}
                                    className="px-4 py-2 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary hover:text-white transition-colors"
                                    data-testid="button-sinsat-add-credit"
                                  >
                                    + Agregar otro crédito
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Observaciones Adicionales */}
                            <FormField
                              control={form.control}
                              name="observacionesAdicionalesSinSat"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Observaciones Adicionales</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      placeholder="Observaciones adicionales..."
                                      className="min-h-[100px]"
                                      {...field}
                                      value={field.value || ''}
                                      data-testid="input-sinsat-additional-observations"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </>
                      )}

                      {/* Campos específicos para PFAE */}
                      {clientType === "fisica_empresarial" && (
                        <>
                          <div className="mt-8 pt-6 border-t border-primary/20">
                            {/* Información Laboral */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                              <FormField
                                control={form.control}
                                name="puesto"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Puesto</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="Gerente, Director, etc."
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-pfae-position"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="antiguedadLaboral"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Antigüedad Laboral</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="5 años, 2 años 6 meses, etc."
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-pfae-seniority"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="sectoreEconomico"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Sector Económico</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="Comercio, Servicios, etc."
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-pfae-sector"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            
                            {/* Ingreso mensual promedio con subcampos */}
                            <div className="space-y-4 mb-6">
                              <h3 className="text-lg font-semibold text-primary">Ingreso Mensual Promedio (últimos 6 meses)</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                  control={form.control}
                                  name="ingresoMensualPromedioComprobables"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Comprobables</FormLabel>
                                      <FormControl>
                                        <CurrencyInput
                                          value={field.value || ''}
                                          onChange={(formatted, raw) => field.onChange(raw)}
                                          placeholder="Ingresa el monto comprobable"
                                          data-testid="input-pfae-income-provable"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                
                                <FormField
                                  control={form.control}
                                  name="ingresoMensualPromedioNoComprobables"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>No Comprobables</FormLabel>
                                      <FormControl>
                                        <CurrencyInput
                                          value={field.value || ''}
                                          onChange={(formatted, raw) => field.onChange(raw)}
                                          placeholder="Ingresa el monto no comprobable"
                                          data-testid="input-pfae-income-non-provable"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            </div>
                            
                            {/* Gastos Fijos Mensuales */}
                            <FormField
                              control={form.control}
                              name="gastosFijosMensualesPromedio"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Gastos Fijos Mensuales Promedio</FormLabel>
                                  <FormControl>
                                    <CurrencyInput
                                      value={field.value || ''}
                                      onChange={(formatted, raw) => field.onChange(raw)}
                                      placeholder="Ingresa los gastos fijos mensuales"
                                      data-testid="input-pfae-monthly-expenses"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Ingreso Anual */}
                            <FormField
                              control={form.control}
                              name="ingresoAnual"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Ingreso Anual</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-pfae-annual-income">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="menor-100000">Menor a $100,000</SelectItem>
                                      <SelectItem value="100000-250000">$100,000 a $250,000</SelectItem>
                                      <SelectItem value="250000-500000">$250,000 a $500,000</SelectItem>
                                      <SelectItem value="500000-1000000">$500,000 a $1,000,000</SelectItem>
                                      <SelectItem value="1000000-2500000">$1,000,000 a $2,500,000</SelectItem>
                                      <SelectItem value="2500000-5000000">$2,500,000 a $5,000,000</SelectItem>
                                      <SelectItem value="arriba-5000000">Arriba de $5,000,000</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Participación de Ventas con Gobierno */}
                            <FormField
                              control={form.control}
                              name="participacionVentasGobierno"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Participación de Ventas con Gobierno</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-pfae-government-sales">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="0">0%</SelectItem>
                                      <SelectItem value="0-10">0% a 10%</SelectItem>
                                      <SelectItem value="11-20">11% a 20%</SelectItem>
                                      <SelectItem value="21-40">21% al 40%</SelectItem>
                                      <SelectItem value="arriba-40">Arriba del 40%</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Ventas con Terminal Bancaria */}
                            <FormField
                              control={form.control}
                              name="ventasTerminalBancaria"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Ventas con Terminal Bancaria (mensuales)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-pfae-banking-terminal-sales">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="no">No</SelectItem>
                                      <SelectItem value="hasta-15000">Hasta $15,000</SelectItem>
                                      <SelectItem value="15000-30000">$15,000 a $30,000</SelectItem>
                                      <SelectItem value="30000-50000">$30,000 a $50,000</SelectItem>
                                      <SelectItem value="50000-100000">$50,000 a $100,000</SelectItem>
                                      <SelectItem value="mayores-100000">Mayores a $100,000</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Buró de Crédito PFAE */}
                            <FormField
                              control={form.control}
                              name="buroPersonaFisica"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Buró de Crédito Persona Física</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-pfae-credit-bureau">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="alto-694-760">Alto 694-760</SelectItem>
                                      <SelectItem value="bueno-592-693">Bueno 592-693</SelectItem>
                                      <SelectItem value="medio-524-591">Medio 524-591</SelectItem>
                                      <SelectItem value="bajo-490-523">Bajo 490-523</SelectItem>
                                      <SelectItem value="malo-456-489">Malo 456-489</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Atrasos en Deudas Buró */}
                            <FormField
                              control={form.control}
                              name="atrasosDeudasBuro"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Atrasos en Deudas Buró</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-pfae-bureau-issues">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">Sí</SelectItem>
                                      <SelectItem value="no">No</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campo condicional para detalles de atrasos */}
                            {form.watch("atrasosDeudasBuro") === "si" && (
                              <FormField
                                control={form.control}
                                name="atrasosDeudasBuroDetalles"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Detalles de Atrasos en Buró</FormLabel>
                                    <FormControl>
                                      <Textarea 
                                        placeholder="Describa los atrasos en el buró de crédito..."
                                        className="min-h-[80px]"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-pfae-bureau-issues-details"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {/* Cuenta con Garantía */}
                            <FormField
                              control={form.control}
                              name="garantia"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cuenta con Garantía</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-pfae-guarantee-type">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="sin-garantia">Sin Garantía</SelectItem>
                                      <SelectItem value="prendaria">Prendaria</SelectItem>
                                      <SelectItem value="hipotecaria">Hipotecaria</SelectItem>
                                      <SelectItem value="otros">Otros</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campos condicionales para garantía */}
                            {form.watch("garantia") === "prendaria" && (
                              <div className="mt-4 bg-gray-50 p-4 rounded-lg space-y-4">
                                <h4 className="font-medium text-gray-700">Detalles de Garantía Prendaria - Vehículos, Maquinaria, etc.</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="garantiaDetalles.tipo"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Tipo</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || ""}>
                                          <FormControl>
                                            <SelectTrigger data-testid="select-pfae-prendaria-type">
                                              <SelectValue placeholder="Seleccionar" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <SelectItem value="vehiculos">Vehículos</SelectItem>
                                            <SelectItem value="maquinaria">Maquinaria</SelectItem>
                                            <SelectItem value="otros">Otros</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="garantiaDetalles.monto"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Valor</FormLabel>
                                        <FormControl>
                                          <CurrencyInput
                                            value={field.value || ''}
                                            onChange={(formatted, raw) => field.onChange(raw)}
                                            placeholder="Ingresa el valor"
                                            data-testid="input-pfae-prendaria-value"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="garantiaDetalles.ano"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Año</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="2018"
                                            {...field}
                                            value={field.value || ''}
                                            data-testid="input-pfae-prendaria-year"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>
                            )}

                            {form.watch("garantia") === "hipotecaria" && (
                              <div className="mt-4 bg-gray-50 p-4 rounded-lg space-y-4">
                                <h4 className="font-medium text-gray-700">Detalles de Garantía Hipotecaria / Inmuebles</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <FormField
                                    control={form.control}
                                    name="garantiaDetalles.tipoInmueble"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Tipo de Inmueble</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value || ""}>
                                          <FormControl>
                                            <SelectTrigger data-testid="select-pfae-property-type">
                                              <SelectValue placeholder="Seleccionar" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            <SelectItem value="oficina">Oficina</SelectItem>
                                            <SelectItem value="departamento">Departamento</SelectItem>
                                            <SelectItem value="casa">Casa</SelectItem>
                                            <SelectItem value="bodega">Bodega</SelectItem>
                                            <SelectItem value="terreno">Terreno</SelectItem>
                                            <SelectItem value="otro">Otro</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="garantiaDetalles.monto"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Valor</FormLabel>
                                        <FormControl>
                                          <CurrencyInput
                                            value={field.value || ''}
                                            onChange={(formatted, raw) => field.onChange(raw)}
                                            placeholder="Ingresa el valor"
                                            data-testid="input-pfae-property-value"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="garantiaDetalles.ubicacion"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Ubicación</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="Ciudad, Estado"
                                            {...field}
                                            value={field.value || ''}
                                            data-testid="input-pfae-property-location"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="garantiaDetalles.situacionLegal"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Situación Legal</FormLabel>
                                        <FormControl>
                                          <Input
                                            placeholder="Escriturado, En trámite, etc."
                                            {...field}
                                            value={field.value || ''}
                                            data-testid="input-pfae-property-legal"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              </div>
                            )}

                            {form.watch("garantia") === "otros" && (
                              <div className="mt-4 bg-gray-50 p-4 rounded-lg">
                                <FormField
                                  control={form.control}
                                  name="garantiaDetalles.descripcion"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Descripción</FormLabel>
                                      <FormControl>
                                        <Input
                                          placeholder="Describe otros activos (Inventarios/otros activos)"
                                          {...field}
                                          value={field.value || ''}
                                          data-testid="input-pfae-other-guarantee"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            )}

                            {/* Aval u Obligado Solidario */}
                            <FormField
                              control={form.control}
                              name="avalObligadoSolidario"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Tiene Aval u Obligado Solidario (en caso de ser necesario)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-pfae-guarantor">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* SAT CIEC */}
                            <FormField
                              control={form.control}
                              name="satCiec"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Abierto a conectarse con SAT vía CIEC?</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-pfae-sat-ciec">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campo condicional para estados financieros */}
                            {form.watch("satCiec") === "no" && (
                              <FormField
                                control={form.control}
                                name="estadosFinancieros"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>¿Cuenta con Estados Financieros?</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                      <FormControl>
                                        <SelectTrigger data-testid="select-pfae-financial-statements">
                                          <SelectValue placeholder="Seleccionar" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="si">SI</SelectItem>
                                        <SelectItem value="no">NO</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {/* Opinión de Cumplimiento */}
                            <FormField
                              control={form.control}
                              name="opinionCumplimiento"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Opinión de Cumplimiento</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-pfae-compliance-opinion">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="positiva">Positiva</SelectItem>
                                      <SelectItem value="negativa">Negativa</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campo condicional para detalles de opinión negativa */}
                            {form.watch("opinionCumplimiento") === "negativa" && (
                              <FormField
                                control={form.control}
                                name="opinionDetalles"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Detalle de Opinión Negativa</FormLabel>
                                    <FormControl>
                                      <Textarea 
                                        placeholder="Describa los detalles de la opinión negativa..."
                                        className="min-h-[80px]"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-pfae-compliance-details"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {/* Créditos Vigentes */}
                            <FormField
                              control={form.control}
                              name="creditosVigentes"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Créditos Vigentes</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-pfae-active-credits">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campos condicionales para créditos vigentes */}
                            {form.watch("creditosVigentes") === "si" && (
                              <div className="mt-4 space-y-4">
                                <h4 className="text-md font-medium">Detalles de Créditos Vigentes</h4>
                                {creditFields.map((field, index) => (
                                  <div key={field.id} className="border p-4 rounded-lg space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.tipo`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Tipo</FormLabel>
                                            <FormControl>
                                              <Input 
                                                placeholder="Hipotecario, Automotriz, Personal, etc."
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-pfae-credit-type-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.institucion`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Institución</FormLabel>
                                            <FormControl>
                                              <Input 
                                                placeholder="Banco, Financiera, etc."
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-pfae-credit-institution-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.saldoOriginal`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Saldo Original</FormLabel>
                                            <FormControl>
                                              <CurrencyInput
                                                value={field.value || ''}
                                                onChange={(formatted, raw) => field.onChange(raw)}
                                                placeholder="Ingresa el saldo original"
                                                data-testid={`input-pfae-credit-original-balance-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.saldo`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Saldo Actual</FormLabel>
                                            <FormControl>
                                              <CurrencyInput
                                                value={field.value || ''}
                                                onChange={(formatted, raw) => field.onChange(raw)}
                                                placeholder="Ingresa el saldo actual"
                                                data-testid={`input-pfae-credit-balance-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.fechaInicio`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Fecha Inicio</FormLabel>
                                            <FormControl>
                                              <Input 
                                                type="date"
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-pfae-credit-start-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.fechaTermino`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Fecha Término</FormLabel>
                                            <FormControl>
                                              <Input 
                                                type="date"
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-pfae-credit-end-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                  </div>
                                ))}
                                
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => appendCredit({ tipo: "", saldoOriginal: "", saldo: "", institucion: "", fechaInicio: "", fechaTermino: "" })}
                                    className="px-4 py-2 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary hover:text-white transition-colors"
                                    data-testid="button-pfae-add-credit"
                                  >
                                    + Agregar otro crédito
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Observaciones Adicionales */}
                            <FormField
                              control={form.control}
                              name="notes"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Observaciones Adicionales</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      placeholder="Comentarios adicionales sobre el perfil del cliente..."
                                      className="min-h-[80px]"
                                      {...field}
                                      value={field.value || ''}
                                      data-testid="input-pfae-profile-observations"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </>
                      )}

                      {/* Campos específicos para Persona Moral */}
                      {clientType === "persona_moral" && (
                        <>
                          <div className="mt-8 pt-6 border-t border-primary/20">
                            {/* Ingresos y Egresos Mensuales */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                              <FormField
                                control={form.control}
                                name="ingresoMensualPromedio"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Ingreso Mensual Promedio (últimos 6 meses)</FormLabel>
                                    <FormControl>
                                      <CurrencyInput
                                        value={field.value || ''}
                                        onChange={(formatted, raw) => field.onChange(raw)}
                                        placeholder="Ingresa el monto mensual"
                                        data-testid="input-monthly-income-average"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="egresoMensualPromedio"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Egreso Mensual Promedio (últimos 6 meses)</FormLabel>
                                    <FormControl>
                                      <CurrencyInput
                                        value={field.value || ''}
                                        onChange={(formatted, raw) => field.onChange(raw)}
                                        placeholder="Ingresa el monto de egresos"
                                        data-testid="input-monthly-expense-average"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            {/* Ingreso Anual */}
                            <FormField
                              control={form.control}
                              name="ingresoAnual"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Ingreso Anual</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-annual-income">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="menor-100000">Menor a $100,000</SelectItem>
                                      <SelectItem value="100000-250000">$100,000 a $250,000</SelectItem>
                                      <SelectItem value="250000-500000">$250,000 a $500,000</SelectItem>
                                      <SelectItem value="500000-1000000">$500,000 a $1,000,000</SelectItem>
                                      <SelectItem value="1000000-2500000">$1,000,000 a $2,500,000</SelectItem>
                                      <SelectItem value="2500000-5000000">$2,500,000 a $5,000,000</SelectItem>
                                      <SelectItem value="arriba-5000000">Arriba de $5,000,000</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Participación de Ventas con Gobierno */}
                            <FormField
                              control={form.control}
                              name="participacionVentasGobierno"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Participación de Ventas con Gobierno</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-government-sales">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="0">0%</SelectItem>
                                      <SelectItem value="menor-10">Menor a 10%</SelectItem>
                                      <SelectItem value="11-20">11% a 20%</SelectItem>
                                      <SelectItem value="21-40">21% al 40%</SelectItem>
                                      <SelectItem value="arriba-40">Arriba del 40%</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Ventas con Terminal Bancaria */}
                            <FormField
                              control={form.control}
                              name="ventasTerminalBancaria"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Ventas con Terminal Bancaria (mensuales)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-banking-terminal-sales">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="no">No</SelectItem>
                                      <SelectItem value="hasta-50000">Hasta $50,000</SelectItem>
                                      <SelectItem value="50000-150000">$50,000 a $150,000</SelectItem>
                                      <SelectItem value="mayores-150000">Mayores a $150,000</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Buró de Crédito */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                              <FormField
                                control={form.control}
                                name="buroAccionistaPrincipal"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Buró de Crédito Accionista Principal</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                      <FormControl>
                                        <SelectTrigger data-testid="select-shareholder-credit-bureau">
                                          <SelectValue placeholder="Seleccionar" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="alto-694-760">Alto 694-760</SelectItem>
                                        <SelectItem value="bueno-592-693">Bueno 592-693</SelectItem>
                                        <SelectItem value="medio-524-591">Medio 524-591</SelectItem>
                                        <SelectItem value="bajo-490-523">Bajo 490-523</SelectItem>
                                        <SelectItem value="malo-456-489">Malo 456-489</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              
                              <FormField
                                control={form.control}
                                name="buroEmpresa"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Buró de Crédito Empresa</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                      <FormControl>
                                        <SelectTrigger data-testid="select-company-credit-bureau">
                                          <SelectValue placeholder="Seleccionar" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="alto-310-400">Alto 310-400</SelectItem>
                                        <SelectItem value="bueno-250-309">Bueno 250-309</SelectItem>
                                        <SelectItem value="medio-230-249">Medio 230-249</SelectItem>
                                        <SelectItem value="bajo-220-229">Bajo 220-229</SelectItem>
                                        <SelectItem value="malo-100-219">Malo 100-219</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            {/* Atrasos, Deudas, Quitas en Buró */}
                            <FormField
                              control={form.control}
                              name="atrasosDeudas"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Atrasos, Deudas, Quitas en Buró?</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-bureau-issues">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campo condicional para detalles de atrasos */}
                            {form.watch("atrasosDeudas") === "si" && (
                              <FormField
                                control={form.control}
                                name="atrasosDetalles"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Detalle de Atrasos/Deudas</FormLabel>
                                    <FormControl>
                                      <Textarea 
                                        placeholder="Describa los atrasos, deudas o quitas..."
                                        className="min-h-[80px]"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-bureau-issues-details"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {/* Cuenta con Garantía */}
                            <FormField
                              control={form.control}
                              name="garantia"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Cuenta con Garantía</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-guarantee-type">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="sin-garantia">Sin Garantía</SelectItem>
                                      <SelectItem value="prendaria">Prendaria</SelectItem>
                                      <SelectItem value="hipotecaria">Hipotecaria</SelectItem>
                                      <SelectItem value="otros">Otros</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campos condicionales para garantía */}
                            {form.watch("garantia") === "prendaria" && (
                              <div className="mt-4 bg-gray-50 p-4 rounded-lg space-y-4">
                                <h4 className="font-medium text-gray-700">Detalles de Garantía Prendaria</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <Input placeholder="Tipo (Vehículo, Maquinaria, etc.)" data-testid="input-prendaria-type" />
                                  <Input placeholder="Valor estimado" data-testid="input-prendaria-value" />
                                  <Input placeholder="Año" data-testid="input-prendaria-year" />
                                </div>
                              </div>
                            )}

                            {form.watch("garantia") === "hipotecaria" && (
                              <div className="mt-4 bg-gray-50 p-4 rounded-lg space-y-4">
                                <h4 className="font-medium text-gray-700">Detalles de Garantía Hipotecaria</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <Select>
                                    <SelectTrigger data-testid="select-property-type">
                                      <SelectValue placeholder="Tipo de inmueble" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="oficina">Oficina</SelectItem>
                                      <SelectItem value="departamento">Departamento</SelectItem>
                                      <SelectItem value="casa">Casa</SelectItem>
                                      <SelectItem value="bodega">Bodega</SelectItem>
                                      <SelectItem value="terreno">Terreno</SelectItem>
                                      <SelectItem value="otro">Otro</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input placeholder="Valor estimado" data-testid="input-property-value" />
                                  <Input placeholder="Ubicación" data-testid="input-property-location" />
                                  <Input placeholder="Situación Legal" data-testid="input-property-legal" />
                                </div>
                              </div>
                            )}

                            {form.watch("garantia") === "otros" && (
                              <div className="mt-4 bg-gray-50 p-4 rounded-lg">
                                <Input placeholder="Describe otros activos (Inventarios, etc.)" data-testid="input-other-guarantee" />
                              </div>
                            )}

                            {/* Aval u Obligado Solidario */}
                            <FormField
                              control={form.control}
                              name="avalObligadoSolidario"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Tiene Aval u Obligado Solidario (en caso de ser necesario)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-guarantor">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* SAT CIEC */}
                            <FormField
                              control={form.control}
                              name="satCiec"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Abierto a conectarse con SAT vía CIEC?</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-sat-ciec">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campo condicional para estados financieros */}
                            {form.watch("satCiec") === "no" && (
                              <FormField
                                control={form.control}
                                name="estadosFinancieros"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>¿Cuenta con Estados Financieros?</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ""}>
                                      <FormControl>
                                        <SelectTrigger data-testid="select-financial-statements">
                                          <SelectValue placeholder="Seleccionar" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="si">SI</SelectItem>
                                        <SelectItem value="no">NO</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {/* Opinión de Cumplimiento */}
                            <FormField
                              control={form.control}
                              name="opinionCumplimiento"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Opinión de Cumplimiento</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-compliance-opinion">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="positiva">Positiva</SelectItem>
                                      <SelectItem value="negativa">Negativa</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campo condicional para detalles de opinión negativa */}
                            {form.watch("opinionCumplimiento") === "negativa" && (
                              <FormField
                                control={form.control}
                                name="opinionDetalles"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Detalle de Opinión Negativa</FormLabel>
                                    <FormControl>
                                      <Textarea 
                                        placeholder="Describa los detalles de la opinión negativa..."
                                        className="min-h-[80px]"
                                        {...field}
                                        value={field.value || ''}
                                        data-testid="input-compliance-details"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {/* Créditos Vigentes */}
                            <FormField
                              control={form.control}
                              name="creditosVigentes"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Créditos Vigentes</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ""}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-active-credits">
                                        <SelectValue placeholder="Seleccionar" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="si">SI</SelectItem>
                                      <SelectItem value="no">NO</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Campos condicionales para créditos vigentes */}
                            {form.watch("creditosVigentes") === "si" && (
                              <div className="mt-4 space-y-4">
                                <h4 className="text-md font-medium">Detalles de Créditos Vigentes</h4>
                                {creditFields.map((field, index) => (
                                  <div key={field.id} className="border p-4 rounded-lg space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.tipo`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Tipo</FormLabel>
                                            <FormControl>
                                              <Input 
                                                placeholder="Hipotecario, Automotriz, Personal, etc."
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-moral-credit-type-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.institucion`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Institución</FormLabel>
                                            <FormControl>
                                              <Input 
                                                placeholder="Banco, Financiera, etc."
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-moral-credit-institution-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.saldoOriginal`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Saldo Original</FormLabel>
                                            <FormControl>
                                              <CurrencyInput
                                                value={field.value || ''}
                                                onChange={(formatted, raw) => field.onChange(raw)}
                                                placeholder="Ingresa el saldo original"
                                                data-testid={`input-moral-credit-original-balance-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.saldo`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Saldo Actual</FormLabel>
                                            <FormControl>
                                              <CurrencyInput
                                                value={field.value || ''}
                                                onChange={(formatted, raw) => field.onChange(raw)}
                                                placeholder="Ingresa el saldo actual"
                                                data-testid={`input-moral-credit-balance-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.fechaInicio`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Fecha Inicio</FormLabel>
                                            <FormControl>
                                              <Input 
                                                type="date"
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-moral-credit-start-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      
                                      <FormField
                                        control={form.control}
                                        name={`creditosVigentesDetalles.${index}.fechaTermino`}
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Fecha Término</FormLabel>
                                            <FormControl>
                                              <Input 
                                                type="date"
                                                {...field}
                                                value={field.value || ''}
                                                data-testid={`input-moral-credit-end-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                  </div>
                                ))}
                                
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => appendCredit({ tipo: "", saldoOriginal: "", saldo: "", institucion: "", fechaInicio: "", fechaTermino: "" })}
                                    className="px-4 py-2 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary hover:text-white transition-colors"
                                    data-testid="button-moral-add-credit"
                                  >
                                    + Agregar otro crédito
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Observaciones Adicionales - después de Créditos Vigentes */}
                            <FormField
                              control={form.control}
                              name="notes"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Observaciones Adicionales</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      placeholder="Comentarios adicionales sobre el perfil del cliente..."
                                      className="min-h-[80px]"
                                      {...field}
                                      value={field.value || ''}
                                      data-testid="input-profile-observations"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            <div className="flex justify-end space-x-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onSuccess?.()}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
                className="bg-primary text-white hover:bg-primary-dark"
                data-testid="button-submit-client"
              >
                {isLoading && <i className="fas fa-spinner fa-spin mr-2"></i>}
                {client ? "Actualizar Cliente" : "Crear Cliente"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
