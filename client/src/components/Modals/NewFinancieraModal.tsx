import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
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

// Schema with address fields required
const financieraSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  contactPerson: z.string().optional(),
  email: z.string().email("Email inválido").optional(),
  phone: z.string().optional(),
  // Address fields (required)
  street: z.string().min(1, "La calle es requerida"),
  number: z.string().min(1, "El número es requerido"),
  interior: z.string().optional(),
  city: z.string().min(1, "La ciudad es requerida"),
  postalCode: z.string().min(5, "Código postal inválido"),
  state: z.string().min(1, "El estado es requerido"),
  description: z.string().optional(),
});

type FinancieraFormData = z.infer<typeof financieraSchema>;

interface NewFinancieraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFinancieraCreated?: (financiera: any) => void;
}

export default function NewFinancieraModal({ isOpen, onClose, onFinancieraCreated }: NewFinancieraModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const form = useForm<FinancieraFormData>({
    resolver: zodResolver(financieraSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      email: "",
      phone: "",
      street: "",
      number: "",
      interior: "",
      city: "",
      postalCode: "",
      state: "",
      description: "",
    },
  });

  const createFinancieraMutation = useMutation({
    mutationFn: async (data: FinancieraFormData) => {
      const response = await apiRequest("POST", "/api/financial-institutions", data);
      return await response.json();
    },
    onSuccess: (createdFinanciera) => {
      toast({
        title: "Financiera creada",
        description: "La nueva financiera se ha registrado exitosamente. Abriendo configuración...",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-institutions"] });
      form.reset();
      onClose();
      
      // Abrir configuración automáticamente
      if (onFinancieraCreated) {
        setTimeout(() => {
          onFinancieraCreated(createdFinanciera);
        }, 500);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la financiera",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FinancieraFormData) => {
    createFinancieraMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Institución Financiera</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la Financiera *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ej. Banco Comercial México"
                      {...field}
                      data-testid="input-financiera-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contactPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Persona de Contacto</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Nombre del ejecutivo"
                      {...field}
                      data-testid="input-contact-person"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input 
                        type="email"
                        placeholder="email@financiera.com"
                        {...field}
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
            </div>

            {/* Address Section */}
            <div className="space-y-4">
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-900 mb-4">Dirección de la Financiera</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="street"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Calle *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ej. Av. Reforma"
                            {...field}
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
                        <FormLabel>Número *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ej. 123"
                            {...field}
                            data-testid="input-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="interior"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Interior</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ej. 4A, Piso 5"
                            {...field}
                            data-testid="input-interior"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ciudad *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ej. Ciudad de México"
                            {...field}
                            data-testid="input-city"
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
                        <FormLabel>Código Postal *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ej. 06600"
                            maxLength={5}
                            {...field}
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
                        <FormLabel>Estado *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ej. Ciudad de México"
                            {...field}
                            data-testid="input-state"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>


            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Descripción adicional sobre la financiera"
                      {...field}
                      data-testid="textarea-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                disabled={createFinancieraMutation.isPending}
                data-testid="button-save-financiera"
              >
                {createFinancieraMutation.isPending ? "Guardando..." : "Crear Financiera"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}