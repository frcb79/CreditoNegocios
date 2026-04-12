import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const requestInstitutionSchema = z.object({
  institutionName: z.string().min(1, "El nombre de la financiera es requerido"),
  reason: z.string().min(10, "Proporciona una justificación (mínimo 10 caracteres)"),
  contactName: z.string().optional(),
  contactEmail: z.string().email("Email inválido").optional().or(z.literal('')),
  contactPhone: z.string().optional(),
});

type RequestInstitutionFormData = z.infer<typeof requestInstitutionSchema>;

interface RequestInstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RequestInstitutionModal({ isOpen, onClose }: RequestInstitutionModalProps) {
  const { toast } = useToast();

  const form = useForm<RequestInstitutionFormData>({
    resolver: zodResolver(requestInstitutionSchema),
    defaultValues: {
      institutionName: "",
      reason: "",
      contactName: "",
      contactEmail: "",
      contactPhone: "",
    },
  });

  const createRequestMutation = useMutation({
    mutationFn: async (data: RequestInstitutionFormData) => {
      return await apiRequest("POST", "/api/financial-institutions/request", data);
    },
    onSuccess: () => {
      toast({
        title: "Solicitud enviada",
        description: "Tu solicitud ha sido enviada a los administradores para su revisión.",
      });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "No se pudo enviar la solicitud. Inténtalo nuevamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: RequestInstitutionFormData) => {
    createRequestMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Solicitar Nueva Financiera</DialogTitle>
          <DialogDescription>
            Completa el formulario para solicitar agregar una nueva institución financiera.
            Los administradores revisarán tu solicitud.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="institutionName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Financiera *</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Ej: Banco Nacional de Crédito"
                      data-testid="input-institution-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo / Justificación *</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field}
                      placeholder="Explica por qué quieres agregar esta financiera (beneficios, productos, condiciones, etc.)"
                      rows={4}
                      data-testid="input-reason"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3 text-gray-700">
                Información de Contacto (Opcional)
              </h4>
              
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del Contacto</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="Ej: Juan Pérez"
                          data-testid="input-contact-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email del Contacto</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="email"
                          placeholder="contacto@financiera.com"
                          data-testid="input-contact-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono del Contacto</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="tel"
                          placeholder="55 1234 5678"
                          data-testid="input-contact-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={createRequestMutation.isPending}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createRequestMutation.isPending}
                className="bg-primary text-white hover:bg-primary-dark"
                data-testid="button-submit-request"
              >
                {createRequestMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Enviando...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane mr-2"></i>
                    Enviar Solicitud
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
