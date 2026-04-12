import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Client, Credit, FinancialInstitution } from "@shared/schema";

const expedienteSchema = z.object({
  clientId: z.string().min(1, "Selecciona un cliente"),
  creditId: z.string().optional(),
  requestedAmount: z.number().min(1, "El monto es requerido"),
  purpose: z.string().min(1, "El propósito es requerido"),
  notes: z.string().optional(),
});

type ExpedienteFormData = z.infer<typeof expedienteSchema>;

interface SendExpedienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  financiera: FinancialInstitution;
}

export default function SendExpedienteModal({ 
  isOpen, 
  onClose, 
  financiera 
}: SendExpedienteModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: credits } = useQuery<Credit[]>({
    queryKey: ["/api/credits"],
  });

  const form = useForm<ExpedienteFormData>({
    resolver: zodResolver(expedienteSchema),
    defaultValues: {
      clientId: "",
      creditId: "",
      requestedAmount: 0,
      purpose: "",
      notes: "",
    },
  });

  const selectedClientId = form.watch("clientId");
  const selectedClient = clients?.find(c => c.id === selectedClientId);
  const clientCredits = credits?.filter(c => c.clientId === selectedClientId);

  const sendExpedienteMutation = useMutation({
    mutationFn: async (data: ExpedienteFormData) => {
      // Crear un nuevo crédito en estado "enviado"
      const creditData = {
        clientId: data.clientId,
        financialInstitutionId: financiera.id,
        requestedAmount: data.requestedAmount,
        purpose: data.purpose,
        status: "enviado",
        notes: data.notes,
      };

      const response = await apiRequest("POST", "/api/credits", creditData);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Expediente enviado",
        description: `El expediente se ha enviado exitosamente a ${financiera.name}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar el expediente",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ExpedienteFormData) => {
    sendExpedienteMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Expediente a {financiera.name}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                            <span>{client.firstName} {client.lastName}</span>
                            <Badge variant="secondary" className="text-xs">
                              {client.type === 'individual' ? 'Individual' : 'Empresa'}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedClient && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium">{selectedClient.firstName} {selectedClient.lastName}</p>
                <p className="text-xs text-neutral">{selectedClient.email}</p>
                {selectedClient.phone && (
                  <p className="text-xs text-neutral">{selectedClient.phone}</p>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="requestedAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto Solicitado *</FormLabel>
                  <FormControl>
                    <Input 
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder="100000.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      data-testid="input-requested-amount"
                    />
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
                  <FormLabel>Propósito del Crédito *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ej. Capital de trabajo, compra de maquinaria"
                      {...field}
                      data-testid="input-purpose"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Detalles Importantes para Financiera</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Información adicional sobre el cliente o la solicitud"
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <i className="fas fa-info-circle text-blue-600"></i>
                <div className="text-sm">
                  <p className="font-medium text-blue-800">Financiera: {financiera.name}</p>
                  {financiera.commissionRate && (
                    <p className="text-blue-600">Comisión: {financiera.commissionRate}%</p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={sendExpedienteMutation.isPending}
                data-testid="button-send-expediente"
              >
                {sendExpedienteMutation.isPending ? "Enviando..." : "Enviar Expediente"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}