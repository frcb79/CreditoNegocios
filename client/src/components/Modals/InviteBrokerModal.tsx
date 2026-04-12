import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const inviteBrokerSchema = z.object({
  email: z.string().email("Email inválido"),
  firstName: z.string().min(1, "El nombre es requerido"),
  lastName: z.string().min(1, "El apellido es requerido"),
  phone: z.string().optional(),
  message: z.string().optional(),
});

type InviteBrokerFormData = z.infer<typeof inviteBrokerSchema>;

interface InviteBrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InviteBrokerModal({ isOpen, onClose }: InviteBrokerModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InviteBrokerFormData>({
    resolver: zodResolver(inviteBrokerSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      message: "",
    },
  });

  const inviteBrokerMutation = useMutation({
    mutationFn: async (data: InviteBrokerFormData) => {
      const response = await apiRequest("POST", "/api/broker-invitations", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Invitación enviada",
        description: "Se ha enviado la invitación al broker exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/broker-network"] });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo enviar la invitación",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InviteBrokerFormData) => {
    inviteBrokerMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar Broker a mi Red</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email del Broker *</FormLabel>
                  <FormControl>
                    <Input 
                      type="email"
                      placeholder="broker@email.com"
                      {...field}
                      data-testid="input-broker-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Juan"
                        {...field}
                        data-testid="input-first-name"
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
                    <FormLabel>Apellido *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Pérez"
                        {...field}
                        data-testid="input-last-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="55-1234-5678"
                      {...field}
                      data-testid="input-phone"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensaje Personal (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Te invito a formar parte de mi red de brokers. Podremos colaborar en solicitudes de crédito..."
                      {...field}
                      data-testid="textarea-message"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <i className="fas fa-info-circle text-blue-600"></i>
                <div className="text-sm text-blue-800">
                  <p className="font-medium">¿Cómo funciona?</p>
                  <p className="text-xs">El broker recibirá un email con instrucciones para unirse a tu red y podrá registrarse automáticamente.</p>
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
                disabled={inviteBrokerMutation.isPending}
                data-testid="button-send-invitation"
              >
                {inviteBrokerMutation.isPending ? "Enviando..." : "Enviar Invitación"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}