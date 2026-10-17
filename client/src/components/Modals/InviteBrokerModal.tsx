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
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Info } from "lucide-react";

const inviteBrokerSchema = z.object({
  email: z.string().email("Email inválido"),
  firstName: z.string().min(1, "El nombre es requerido"),
  lastName: z.string().min(1, "El apellido es requerido"),
  phone: z.string().optional(),
  message: z.string().optional(),
  role: z.enum(["broker", "master_broker"]).default("broker"),
});

type InviteBrokerFormData = z.infer<typeof inviteBrokerSchema>;

interface InviteBrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InviteBrokerModal({ isOpen, onClose }: InviteBrokerModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const queryClient = useQueryClient();

  const form = useForm<InviteBrokerFormData>({
    resolver: zodResolver(inviteBrokerSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      message: "",
      role: "broker",
    },
  });

  const inviteBrokerMutation = useMutation({
    mutationFn: async (data: InviteBrokerFormData) => {
      const response = await apiRequest("POST", "/api/broker-invitations", data);
      return await response.json();
    },
    onSuccess: (data: { invitationSent?: boolean; message?: string; broker?: { role?: string } }) => {
      if (!data.invitationSent) {
        toast({
          title: "Invitación pendiente de envío",
          description: data.message || "El correo no salió. Intenta reenviar la invitación.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Invitación enviada",
        description: data.broker?.role === "master_broker"
          ? "El correo de activación se envió al Master Broker."
          : "El correo de activación se envió al Broker.",
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
          <DialogTitle>{isSuperAdmin ? "Invitar Broker o Master Broker" : "Invitar Broker a mi Red"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {isSuperAdmin && (
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol del invitado</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar rol" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="broker">Broker</SelectItem>
                        <SelectItem value="master_broker">Master Broker</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
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

            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-center space-x-2.5">
                <Info className="w-4 h-4 text-primary shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-foreground text-xs">¿Cómo funciona?</p>
                  <p className="text-xs text-muted-foreground">La persona recibirá su usuario y un enlace privado de 24 horas para crear su contraseña. Nunca enviamos contraseñas por correo.</p>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={inviteBrokerMutation.isPending}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={inviteBrokerMutation.isPending}
                data-testid="button-send-invitation"
              >
                {inviteBrokerMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Invitación"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}