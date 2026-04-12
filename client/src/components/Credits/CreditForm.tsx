import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { insertCreditSchema, type InsertCredit, type Client } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

interface CreditFormProps {
  credit?: any;
  onSuccess?: () => void;
}

interface ProductTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
}

const formSchema = insertCreditSchema
  .pick({
    clientId: true,
    productTemplateId: true,
    amount: true,
    purpose: true,
  })
  .extend({
    brokerId: insertCreditSchema.shape.brokerId.optional(),
  });

export default function CreditForm({ credit, onSuccess }: CreditFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amountInput, setAmountInput] = useState(credit?.amount || "");

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: productTemplates } = useQuery<ProductTemplate[]>({
    queryKey: ["/api/product-templates"],
  });

  // Filter only active templates
  const activeTemplates = productTemplates?.filter(t => t.isActive) || [];

  const form = useForm<InsertCredit>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientId: credit?.clientId || "",
      productTemplateId: credit?.productTemplateId || "",
      amount: credit?.amount || "",
      purpose: credit?.purpose || "",
      ...credit,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertCredit) => {
      const response = await apiRequest("POST", "/api/credits", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      toast({
        title: "Crédito creado",
        description: "El crédito ha sido creado exitosamente.",
      });
      form.reset();
      setAmountInput("");
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
    mutationFn: async (data: InsertCredit) => {
      const response = await apiRequest("PUT", `/api/credits/${credit.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      toast({
        title: "Crédito actualizado",
        description: "El crédito ha sido actualizado exitosamente.",
      });
      setAmountInput("");
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

  const onSubmit = (data: InsertCredit) => {
    if (credit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Format amount for display
  const formatAmount = (value: string) => {
    const numValue = parseFloat(value.replace(/,/g, ''));
    if (isNaN(numValue)) return "";
    return `$${numValue.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN`;
  };

  const handleAmountChange = (value: string) => {
    // Remove formatting to get raw number
    const rawValue = value.replace(/[$,\s]|MXN/g, '');
    setAmountInput(rawValue);
    form.setValue('amount', rawValue);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{credit ? "Editar Crédito" : "Nueva Gestión de Crédito"}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            {client.type === 'persona_moral' ? client.businessName : `${client.firstName} ${client.lastName}`}
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
                name="productTemplateId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Crédito</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger data-testid="select-product-template">
                          <SelectValue placeholder="Selecciona tipo de crédito" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input 
                        type="text" 
                        placeholder="$100,000 MXN" 
                        value={amountInput ? formatAmount(amountInput) : ''}
                        onChange={(e) => handleAmountChange(e.target.value)}
                        data-testid="input-amount"
                        className="font-medium placeholder:text-gray-400"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fin del Crédito</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe el propósito o fin del crédito..."
                      className="min-h-[100px]"
                      {...field}
                      value={field.value || ''}
                      data-testid="input-purpose"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  form.reset();
                  setAmountInput("");
                }} 
                data-testid="button-cancel-credit"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
                className="bg-primary text-white hover:bg-primary-dark"
                data-testid="button-submit-credit"
              >
                {isLoading && <i className="fas fa-spinner fa-spin mr-2"></i>}
                {credit ? "Actualizar Crédito" : "Crear Crédito"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
