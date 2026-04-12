import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const profileSchema = z.object({
  firstName: z.string().min(1, "Nombre requerido"),
  lastName: z.string().min(1, "Apellido requerido"),
  email: z.string().email("Email válido requerido"),
  phone: z.string().optional(),
  // Structured address fields
  street: z.string().optional(),
  exteriorNumber: z.string().optional(),
  interiorNumber: z.string().optional(),
  colonia: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
});

const notificationSchema = z.object({
  emailNotifications: z.boolean(),
  whatsappNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  creditExpiringAlerts: z.boolean(),
  commissionAlerts: z.boolean(),
  documentAlerts: z.boolean(),
  marketingEmails: z.boolean(),
});

const businessSchema = z.object({
  businessName: z.string().optional(),
  taxId: z.string().optional(),
  businessAddress: z.string().optional(),
  businessPhone: z.string().optional(),
  website: z.string().optional(),
  specialization: z.string().optional(),
});

const profilingSchema = z.object({
  profileType: z.enum(["persona_moral", "fisica_empresarial", "fisica", "sin_sat"]),
  
  // Broker metrics (for broker profiling)
  yearsInBusiness: z.string().optional(),
  clientPortfolioSize: z.string().optional(),
  annualGoal: z.string().optional(),
  productsHandled: z.string().optional(),
  averageTicket: z.string().optional(),
  
  // Banking information for commission payments (optional but validated when provided)
  bankName: z.string().optional(),
  clabe: z.string().optional().refine(
    (val) => !val || /^\d{18}$/.test(val),
    { message: "La CLABE debe tener exactamente 18 dígitos numéricos" }
  ),
  accountHolder: z.string().optional(),
});

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("profile");
  const [profileType, setProfileType] = useState<"persona_moral" | "fisica_empresarial" | "fisica" | "sin_sat">("persona_moral");

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      // Fallback to top-level phone for backward compatibility
      phone: (user?.profileData as any)?.phone || (user as any)?.phone || "",
      // Hydrate address from profileData with empty fallbacks
      street: (user?.profileData as any)?.address?.street || "",
      exteriorNumber: (user?.profileData as any)?.address?.exteriorNumber || "",
      interiorNumber: (user?.profileData as any)?.address?.interiorNumber || "",
      colonia: (user?.profileData as any)?.address?.colonia || "",
      city: (user?.profileData as any)?.address?.city || "",
      state: (user?.profileData as any)?.address?.state || "",
      postalCode: (user?.profileData as any)?.address?.postalCode || "",
    },
  });

  const notificationForm = useForm({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      emailNotifications: true,
      whatsappNotifications: true,
      pushNotifications: true,
      creditExpiringAlerts: true,
      commissionAlerts: true,
      documentAlerts: true,
      marketingEmails: false,
    },
  });

  const businessForm = useForm({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      businessName: "",
      taxId: "",
      businessAddress: "",
      businessPhone: "",
      website: "",
      specialization: "",
    },
  });

  const profilingForm = useForm({
    resolver: zodResolver(profilingSchema),
    defaultValues: {
      profileType: user?.profileType || "persona_moral" as const,
      // Broker metrics hydrated from profileData.brokerMetrics
      yearsInBusiness: (user?.profileData as any)?.brokerMetrics?.yearsInBusiness || "",
      clientPortfolioSize: (user?.profileData as any)?.brokerMetrics?.clientPortfolioSize || "",
      annualGoal: (user?.profileData as any)?.brokerMetrics?.annualGoal || "",
      productsHandled: (user?.profileData as any)?.brokerMetrics?.productsHandled || "",
      averageTicket: (user?.profileData as any)?.brokerMetrics?.averageTicket || "",
      // Commercial references
      commercialReferences: (user as any)?.commercialReferences || [],
      // Banking information
      bankName: (user as any)?.bankName || "",
      clabe: (user as any)?.clabe || "",
      accountHolder: (user as any)?.accountHolder || "",
    },
  });

  // State for dynamic commercial references
  const [references, setReferences] = useState<Array<{name: string, phone: string, email: string}>>(() => {
    const savedRefs = (user as any)?.commercialReferences;
    return Array.isArray(savedRefs) && savedRefs.length > 0 
      ? savedRefs 
      : [{ name: "", phone: "", email: "" }];
  });

  const addReference = () => {
    setReferences([...references, { name: "", phone: "", email: "" }]);
  };

  const removeReference = (index: number) => {
    if (references.length > 1) {
      setReferences(references.filter((_, i) => i !== index));
    }
  };

  const updateReference = (index: number, field: 'name' | 'phone' | 'email', value: string) => {
    const newRefs = [...references];
    newRefs[index] = { ...newRefs[index], [field]: value };
    setReferences(newRefs);
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", `/api/users/${user?.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Perfil actualizado",
        description: "Tu información ha sido actualizada exitosamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", `/api/users/${user?.id}/notifications`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Preferencias actualizadas",
        description: "Tus preferencias de notificaciones han sido guardadas.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onProfileSubmit = (data: any) => {
    // Separate core profile fields from address fields
    const { street, exteriorNumber, interiorNumber, colonia, city, state, postalCode, phone, ...coreFields } = data;
    
    // Shape payload with profileData.address structure
    const payload = {
      ...coreFields,
      profileData: {
        phone,
        address: {
          street,
          exteriorNumber,
          interiorNumber,
          colonia,
          city,
          state,
          postalCode,
        },
      },
    };
    
    updateProfileMutation.mutate(payload);
  };

  const onNotificationSubmit = (data: any) => {
    updateNotificationsMutation.mutate(data);
  };

  const onBusinessSubmit = (data: any) => {
    updateProfileMutation.mutate(data);
  };

  const onProfilingSubmit = (data: any) => {
    const { 
      profileType, 
      yearsInBusiness, 
      clientPortfolioSize, 
      annualGoal, 
      productsHandled, 
      averageTicket,
      bankName,
      clabe,
      accountHolder,
    } = data;
    
    // Validate commercial references manually
    // Check references that have ANY field filled (not just name)
    const refsWithAnyData = references.filter(ref => 
      ref.name.trim() !== "" || ref.phone.trim() !== "" || ref.email.trim() !== ""
    );
    
    // Validate each reference that has any data - must have name and phone
    const invalidRefs = refsWithAnyData.filter(ref => {
      const hasName = ref.name.trim() !== "";
      const hasPhone = ref.phone.trim() !== "";
      const hasValidEmail = ref.email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ref.email);
      return !hasName || !hasPhone || !hasValidEmail;
    });
    
    if (invalidRefs.length > 0) {
      toast({
        title: "Error en referencias",
        description: "Cada referencia debe tener nombre, teléfono y un email válido (o vacío)",
        variant: "destructive",
      });
      return;
    }
    
    // Shape payload with brokerMetrics and banking info
    const payload = {
      profileType,
      commercialReferences: refsWithAnyData,
      bankName,
      clabe,
      accountHolder,
      profileData: {
        brokerMetrics: {
          yearsInBusiness,
          clientPortfolioSize,
          annualGoal,
          productsHandled,
          averageTicket,
        },
      },
    };
    
    updateProfileMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Configuración"
          subtitle="Gestiona tu perfil y preferencias"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 h-auto gap-1">
                <TabsTrigger value="profile" data-testid="tab-profile" className="text-xs sm:text-sm py-2">Perfil</TabsTrigger>
                <TabsTrigger value="notifications" data-testid="tab-notifications" className="text-xs sm:text-sm py-2">Notificaciones</TabsTrigger>
                <TabsTrigger value="business" data-testid="tab-business" className="text-xs sm:text-sm py-2">Negocio</TabsTrigger>
                <TabsTrigger value="profiling" data-testid="tab-profiling" className="text-xs sm:text-sm py-2">Perfilamiento</TabsTrigger>
                <TabsTrigger value="security" data-testid="tab-security" className="text-xs sm:text-sm py-2">Seguridad</TabsTrigger>
              </TabsList>

              {/* Profile Settings */}
              <TabsContent value="profile" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Información Personal</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Form {...profileForm}>
                      <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-semibold text-xl sm:text-2xl">
                              {user?.firstName?.[0]}{user?.lastName?.[0]}
                            </span>
                          </div>
                          <div className="text-center sm:text-left">
                            <Button variant="outline" size="sm" className="sm:size-default">
                              <i className="fas fa-camera mr-2"></i>
                              Cambiar Foto
                            </Button>
                            <p className="text-xs sm:text-sm text-neutral mt-2">
                              JPG, PNG o GIF (máx. 2MB)
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={profileForm.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Nombre(s)</FormLabel>
                                <FormControl>
                                  <Input {...field} data-testid="input-first-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profileForm.control}
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Apellidos</FormLabel>
                                <FormControl>
                                  <Input {...field} data-testid="input-last-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={profileForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input type="email" {...field} data-testid="input-email" />
                              </FormControl>
                              <FormDescription>
                                Este email se usa para notificaciones y acceso a la cuenta
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={profileForm.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Teléfono</FormLabel>
                                <FormControl>
                                  <Input placeholder="+52 55 1234 5678" {...field} data-testid="input-phone" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Address Section */}
                        <div className="space-y-4">
                          <h4 className="font-semibold text-gray-900">Dirección</h4>
                          
                          <FormField
                            control={profileForm.control}
                            name="street"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Calle</FormLabel>
                                <FormControl>
                                  <Input placeholder="Nombre de la calle" {...field} data-testid="input-street" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={profileForm.control}
                              name="exteriorNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Número Exterior</FormLabel>
                                  <FormControl>
                                    <Input placeholder="123" {...field} data-testid="input-exterior-number" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={profileForm.control}
                              name="interiorNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Número Interior (Opcional)</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Depto 4B" {...field} data-testid="input-interior-number" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={profileForm.control}
                              name="colonia"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Colonia</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Nombre de la colonia" {...field} data-testid="input-colonia" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={profileForm.control}
                              name="postalCode"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Código Postal</FormLabel>
                                  <FormControl>
                                    <Input placeholder="01234" {...field} data-testid="input-postal-code" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={profileForm.control}
                              name="city"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Ciudad</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Ciudad de México" {...field} data-testid="input-city" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={profileForm.control}
                              name="state"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Estado</FormLabel>
                                  <FormControl>
                                    <Input placeholder="CDMX" {...field} data-testid="input-state" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button 
                            type="submit"
                            disabled={updateProfileMutation.isPending}
                            className="bg-primary text-white hover:bg-primary-dark"
                            data-testid="button-save-profile"
                          >
                            {updateProfileMutation.isPending && <i className="fas fa-spinner fa-spin mr-2"></i>}
                            Guardar Cambios
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Notification Settings */}
              <TabsContent value="notifications" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Preferencias de Notificaciones</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Form {...notificationForm}>
                      <form onSubmit={notificationForm.handleSubmit(onNotificationSubmit)} className="space-y-6">
                        <div className="space-y-4">
                          <h4 className="font-semibold text-gray-900">Canales de Notificación</h4>
                          
                          <FormField
                            control={notificationForm.control}
                            name="emailNotifications"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                  <FormLabel className="font-medium">Notificaciones por Email</FormLabel>
                                  <FormDescription>
                                    Recibe actualizaciones importantes por correo electrónico
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-email-notifications"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={notificationForm.control}
                            name="whatsappNotifications"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                  <FormLabel className="font-medium">Notificaciones por WhatsApp</FormLabel>
                                  <FormDescription>
                                    Alertas urgentes y recordatorios por WhatsApp
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-whatsapp-notifications"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={notificationForm.control}
                            name="pushNotifications"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                  <FormLabel className="font-medium">Notificaciones Push</FormLabel>
                                  <FormDescription>
                                    Notificaciones en tiempo real en la aplicación
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-push-notifications"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>

                        <Separator />

                        <div className="space-y-4">
                          <h4 className="font-semibold text-gray-900">Tipos de Alertas</h4>
                          
                          <FormField
                            control={notificationForm.control}
                            name="creditExpiringAlerts"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                  <FormLabel className="font-medium">Créditos por Vencer</FormLabel>
                                  <FormDescription>
                                    Alertas cuando los créditos están próximos a vencer
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-credit-expiring-alerts"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={notificationForm.control}
                            name="commissionAlerts"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                  <FormLabel className="font-medium">Comisiones</FormLabel>
                                  <FormDescription>
                                    Notificaciones sobre pagos de comisiones
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-commission-alerts"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={notificationForm.control}
                            name="documentAlerts"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                  <FormLabel className="font-medium">Documentos Pendientes</FormLabel>
                                  <FormDescription>
                                    Recordatorios de documentos faltantes o por vencer
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-document-alerts"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={notificationForm.control}
                            name="marketingEmails"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="space-y-0.5">
                                  <FormLabel className="font-medium">Emails de Marketing</FormLabel>
                                  <FormDescription>
                                    Noticias sobre productos y promociones
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="switch-marketing-emails"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button 
                            type="submit"
                            disabled={updateNotificationsMutation.isPending}
                            className="bg-primary text-white hover:bg-primary-dark"
                            data-testid="button-save-notifications"
                          >
                            {updateNotificationsMutation.isPending && <i className="fas fa-spinner fa-spin mr-2"></i>}
                            Guardar Preferencias
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Business Settings */}
              <TabsContent value="business" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Información del Negocio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Form {...businessForm}>
                      <form onSubmit={businessForm.handleSubmit(onBusinessSubmit)} className="space-y-6">
                        <FormField
                          control={businessForm.control}
                          name="businessName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nombre del Negocio</FormLabel>
                              <FormControl>
                                <Input placeholder="Mi Empresa de Brokers" {...field} data-testid="input-business-name" />
                              </FormControl>
                              <FormDescription>
                                Nombre de tu empresa o marca personal
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={businessForm.control}
                            name="taxId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>RFC</FormLabel>
                                <FormControl>
                                  <Input placeholder="XAXX010101000" {...field} data-testid="input-tax-id" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={businessForm.control}
                            name="businessPhone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Teléfono del Negocio</FormLabel>
                                <FormControl>
                                  <Input placeholder="+52 55 1234 5678" {...field} data-testid="input-business-phone" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={businessForm.control}
                          name="businessAddress"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Dirección del Negocio</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Dirección fiscal de la empresa..."
                                  {...field}
                                  data-testid="input-business-address"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={businessForm.control}
                            name="website"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Sitio Web</FormLabel>
                                <FormControl>
                                  <Input placeholder="https://miempresa.com" {...field} data-testid="input-website" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={businessForm.control}
                            name="specialization"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Especialización</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-specialization">
                                      <SelectValue placeholder="Selecciona tu especialización" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="pyme">PyME</SelectItem>
                                    <SelectItem value="personal">Crédito Personal</SelectItem>
                                    <SelectItem value="hipotecario">Hipotecario</SelectItem>
                                    <SelectItem value="automotriz">Automotriz</SelectItem>
                                    <SelectItem value="empresarial">Empresarial</SelectItem>
                                    <SelectItem value="microfinanzas">Microfinanzas</SelectItem>
                                    <SelectItem value="general">General</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button 
                            type="submit"
                            disabled={updateProfileMutation.isPending}
                            className="bg-primary text-white hover:bg-primary-dark"
                            data-testid="button-save-business"
                          >
                            {updateProfileMutation.isPending && <i className="fas fa-spinner fa-spin mr-2"></i>}
                            Guardar Información
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Profiling Settings */}
              <TabsContent value="profiling" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Perfilamiento de Cliente</CardTitle>
                    <CardDescription>
                      Selecciona tu tipo de perfil y completa la información correspondiente
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...profilingForm}>
                      <form onSubmit={profilingForm.handleSubmit(onProfilingSubmit)} className="space-y-6">
                        {/* Profile Type Selection */}
                        <FormField
                          control={profilingForm.control}
                          name="profileType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tipo de Perfil</FormLabel>
                              <Select onValueChange={(value) => {
                                field.onChange(value);
                                setProfileType(value as typeof profileType);
                              }} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-profile-type">
                                    <SelectValue placeholder="Selecciona tu tipo de perfil" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="persona_moral">Persona Moral</SelectItem>
                                  <SelectItem value="fisica_empresarial">PFAE (Persona Física con Actividad Empresarial)</SelectItem>
                                  <SelectItem value="fisica">Persona Física</SelectItem>
                                  <SelectItem value="sin_sat">Sin SAT</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Broker Metrics Section */}
                        <div className="space-y-4 border-t pt-6">
                          <div>
                            <h4 className="font-semibold text-gray-900">Métricas del Broker</h4>
                            <p className="text-sm text-gray-600 mt-1">Información sobre tu actividad como broker profesional</p>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                              control={profilingForm.control}
                              name="yearsInBusiness"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Años en el Negocio</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="Ej: 5" 
                                      {...field} 
                                      data-testid="input-years-in-business" 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={profilingForm.control}
                              name="clientPortfolioSize"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Tamaño de la Cartera de Clientes</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="Ej: 50 clientes activos" 
                                      {...field} 
                                      data-testid="input-client-portfolio-size" 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={profilingForm.control}
                              name="annualGoal"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Objetivo Anual de Colocación</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="Ej: $10,000,000" 
                                      {...field} 
                                      data-testid="input-annual-goal" 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={profilingForm.control}
                              name="productsHandled"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Productos que Maneja</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="Ej: Crédito Simple, Prendario, Hipotecario" 
                                      {...field} 
                                      data-testid="input-products-handled" 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={profilingForm.control}
                              name="averageTicket"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Monto Promedio por Operación</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="Ej: $500,000" 
                                      {...field} 
                                      data-testid="input-average-ticket" 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        {/* Referencias Comerciales */}
                        <div className="space-y-6 border-t pt-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900">Referencias Comerciales</h4>
                              <p className="text-sm text-gray-600">Agrega contactos que puedan dar referencias sobre tu trabajo</p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addReference}
                              data-testid="button-add-reference"
                            >
                              <i className="fas fa-plus mr-2"></i>
                              Agregar Referencia
                            </Button>
                          </div>
                          
                          {references.map((ref, index) => (
                            <div key={index} className="p-4 border rounded-lg bg-gray-50 space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Referencia {index + 1}</span>
                                {references.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeReference(index)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    data-testid={`button-remove-reference-${index}`}
                                  >
                                    <i className="fas fa-trash mr-1"></i>
                                    Eliminar
                                  </Button>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                                  <Input
                                    placeholder="Nombre completo"
                                    value={ref.name}
                                    onChange={(e) => updateReference(index, 'name', e.target.value)}
                                    data-testid={`input-reference-name-${index}`}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                                  <Input
                                    placeholder="10 dígitos"
                                    value={ref.phone}
                                    onChange={(e) => updateReference(index, 'phone', e.target.value)}
                                    data-testid={`input-reference-phone-${index}`}
                                  />
                                </div>
                                <div className="sm:col-span-2 md:col-span-1">
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
                                  <Input
                                    type="email"
                                    placeholder="correo@ejemplo.com"
                                    value={ref.email}
                                    onChange={(e) => updateReference(index, 'email', e.target.value)}
                                    data-testid={`input-reference-email-${index}`}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Datos Bancarios */}
                        <div className="space-y-6 border-t pt-6">
                          <div>
                            <h4 className="font-semibold text-gray-900">Datos Bancarios</h4>
                            <p className="text-sm text-gray-600">Información para el pago de tus comisiones</p>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField
                              control={profilingForm.control}
                              name="bankName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Banco</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-bank-name">
                                        <SelectValue placeholder="Selecciona tu banco" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="BBVA">BBVA</SelectItem>
                                      <SelectItem value="Santander">Santander</SelectItem>
                                      <SelectItem value="Banorte">Banorte</SelectItem>
                                      <SelectItem value="HSBC">HSBC</SelectItem>
                                      <SelectItem value="Citibanamex">Citibanamex</SelectItem>
                                      <SelectItem value="Scotiabank">Scotiabank</SelectItem>
                                      <SelectItem value="Inbursa">Inbursa</SelectItem>
                                      <SelectItem value="Banco Azteca">Banco Azteca</SelectItem>
                                      <SelectItem value="BanCoppel">BanCoppel</SelectItem>
                                      <SelectItem value="Banregio">Banregio</SelectItem>
                                      <SelectItem value="Afirme">Afirme</SelectItem>
                                      <SelectItem value="Mifel">Mifel</SelectItem>
                                      <SelectItem value="Multiva">Multiva</SelectItem>
                                      <SelectItem value="BanBajio">BanBajío</SelectItem>
                                      <SelectItem value="Otro">Otro</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={profilingForm.control}
                              name="clabe"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>CLABE Interbancaria</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="18 dígitos" 
                                      maxLength={18}
                                      {...field} 
                                      data-testid="input-clabe" 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={profilingForm.control}
                              name="accountHolder"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Titular de la Cuenta</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="Nombre como aparece en el banco" 
                                      {...field} 
                                      data-testid="input-account-holder" 
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>


                        <div className="flex justify-end">
                          <Button 
                            type="submit"
                            disabled={updateProfileMutation.isPending}
                            className="bg-primary text-white hover:bg-primary-dark"
                            data-testid="button-save-profiling"
                          >
                            {updateProfileMutation.isPending && <i className="fas fa-spinner fa-spin mr-2"></i>}
                            Guardar Perfilamiento
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Security Settings */}
              <TabsContent value="security" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuración de Seguridad</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">Cambiar Contraseña</h4>
                          <p className="text-sm text-neutral">
                            Actualiza tu contraseña regularmente para mayor seguridad
                          </p>
                        </div>
                        <Button variant="outline" data-testid="button-change-password">
                          <i className="fas fa-key mr-2"></i>
                          Cambiar
                        </Button>
                      </div>
                    </div>

                    <div className="p-4 border border-orange-200 bg-orange-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-orange-900">Solicitar Baja de Cuenta</h4>
                          <p className="text-sm text-orange-700">
                            Solicita la desactivación de tu cuenta. Un administrador revisará tu solicitud.
                          </p>
                        </div>
                        <Button 
                          variant="outline" 
                          className="border-orange-600 text-orange-600 hover:bg-orange-50"
                          onClick={() => {
                            if (window.confirm('¿Estás seguro de que deseas solicitar la baja de tu cuenta? Un administrador revisará tu solicitud.')) {
                              apiRequest('POST', `/api/users/${user?.id}/deactivation-request`, {})
                                .then(() => {
                                  toast({
                                    title: "Solicitud enviada",
                                    description: "Tu solicitud de baja ha sido enviada. Un administrador la revisará pronto.",
                                  });
                                })
                                .catch((error) => {
                                  toast({
                                    title: "Error",
                                    description: error.message || "No se pudo enviar la solicitud",
                                    variant: "destructive",
                                  });
                                });
                            }
                          }}
                          data-testid="button-request-deactivation"
                        >
                          <i className="fas fa-user-slash mr-2"></i>
                          Solicitar Baja
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
