import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import MainLayout from "@/components/MainLayout";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Tag, Gift, CheckCircle, ShieldCheck, Clock, AlertCircle, Sparkles, Check, Info, ArrowRight, Loader2, KeyRound } from "lucide-react";
import { CommercialRulesSettings } from "@/components/Commercial/CommercialRulesSettings";

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
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>((user?.profileImageUrl as string) || null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Benefits & Promo Codes (Bloque 10)
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [validatedPromoPreview, setValidatedPromoPreview] = useState<any>(null);
  const [isRedeemingPromo, setIsRedeemingPromo] = useState(false);

  const { data: myBenefits, isLoading: isLoadingBenefits, refetch: refetchBenefits } = useQuery<{
    accessStatus: string;
    accessStatusExpiresAt: string | null;
    accessStatusNotes: string | null;
    activePromo: {
      id: string;
      code: string;
      name: string;
      description?: string | null;
      benefitType: string;
      benefitValue: string;
      durationMonths?: number | null;
      appliedAt: string;
      expiresAt?: string | null;
    } | null;
    nonBlocking: boolean;
    message: string;
  }>({
    queryKey: ['/api/promos/my-benefits'],
  });

  const handleValidatePromo = async () => {
    if (!promoCodeInput.trim()) {
      toast({
        title: "Código requerido",
        description: "Por favor escribe un código promocional.",
        variant: "destructive"
      });
      return;
    }
    setIsValidatingPromo(true);
    setValidatedPromoPreview(null);
    try {
      const res = await apiRequest('POST', '/api/promos/validate', { code: promoCodeInput.trim() });
      const data = await res.json();
      if (data.valid) {
        setValidatedPromoPreview(data.promo);
        toast({
          title: "Código válido",
          description: `Promoción: ${data.promo.name}`,
        });
      } else {
        toast({
          title: "Código no válido",
          description: data.message || "El código no es válido o ha expirado.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({
        title: "Código inválido",
        description: err.message || "No se pudo validar el código promocional.",
        variant: "destructive"
      });
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const handleRedeemPromo = async () => {
    if (!promoCodeInput.trim()) return;
    setIsRedeemingPromo(true);
    try {
      const res = await apiRequest('POST', '/api/promos/redeem', { code: promoCodeInput.trim() });
      const data = await res.json();
      toast({
        title: "¡Beneficio aplicado con éxito!",
        description: data.message || "Tu código ha sido activado.",
      });
      setPromoCodeInput("");
      setValidatedPromoPreview(null);
      refetchBenefits();
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    } catch (err: any) {
      toast({
        title: "Error al aplicar beneficio",
        description: err.message || "No se pudo canjear el código.",
        variant: "destructive"
      });
    } finally {
      setIsRedeemingPromo(false);
    }
  };

  useEffect(() => {
    setAvatarPreview((user?.profileImageUrl as string) || null);
  }, [user?.profileImageUrl]);

  const passwordSchema = z.object({
    currentPassword: z.string().min(1, "Contraseña actual requerida"),
    newPassword: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string().min(6, "Confirmar contraseña"),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

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

  const updateAvatarMutation = useMutation({
    mutationFn: async (profileImageUrl: string) => {
      const response = await apiRequest("PUT", `/api/users/${user?.id}`, { profileImageUrl });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Foto actualizada",
        description: "Tu foto de perfil se actualizó correctamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la foto de perfil",
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

  const updatePasswordMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/users/${user?.id}/change-password`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Contraseña actualizada",
        description: "Tu contraseña ha sido cambiada exitosamente.",
      });
      setShowPasswordModal(false);
      passwordForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onPasswordSubmit = (data: any) => {
    updatePasswordMutation.mutate(data);
  };

  const handleAvatarSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Archivo inválido",
        description: "Selecciona una imagen JPG, PNG o GIF.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    const maxSizeBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast({
        title: "Archivo demasiado grande",
        description: "La imagen no debe exceder 2MB.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Image = reader.result as string;
      setAvatarPreview(base64Image);
      updateAvatarMutation.mutate(base64Image);
    };
    reader.onerror = () => {
      toast({
        title: "Error",
        description: "No se pudo leer la imagen seleccionada.",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return (
    <MainLayout>
      <Header 
        title="Configuración"
        subtitle="Gestiona tu perfil, preferencias del sistema y esquema comercial"
      />
      
      <main className="flex-1 p-3 sm:p-5 lg:p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="overflow-x-auto pb-1 -mx-1 px-1">
              <TabsList className="inline-flex w-full min-w-[540px] sm:min-w-0 grid-cols-6 h-9 p-1 bg-muted/70 rounded-lg">
                <TabsTrigger value="profile" data-testid="tab-profile" className="text-xs font-medium py-1 px-2">Perfil</TabsTrigger>
                <TabsTrigger value="notifications" data-testid="tab-notifications" className="text-xs font-medium py-1 px-2">Notificaciones</TabsTrigger>
                <TabsTrigger value="business" data-testid="tab-business" className="text-xs font-medium py-1 px-2">Negocio</TabsTrigger>
                <TabsTrigger value="profiling" data-testid="tab-profiling" className="text-xs font-medium py-1 px-2">Perfilamiento</TabsTrigger>
                <TabsTrigger value="security" data-testid="tab-security" className="text-xs font-medium py-1 px-2">Seguridad</TabsTrigger>
                <TabsTrigger value="benefits" data-testid="tab-benefits" className="text-xs font-medium py-1 px-2">Beneficios</TabsTrigger>
                {user?.role === "super_admin" && (
                  <TabsTrigger value="commercial_rules" data-testid="tab-commercial-rules" className="text-xs font-medium py-1 px-2">
                    Reglas Comerciales
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* Profile Settings */}
            <TabsContent value="profile" className="space-y-4 mt-3">
              <Card className="border border-border/80 shadow-xs">
                <CardHeader className="py-3 px-4 sm:px-6 border-b border-border/60">
                  <CardTitle className="text-base font-semibold">Información Personal</CardTitle>
                  <CardDescription className="text-xs">
                    Datos principales de tu cuenta y dirección de correspondencia
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <Form {...profileForm}>
                    <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-5">
                      <div className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-muted/30 border border-border/60 rounded-lg">
                        <div className={cn(
                          "w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden shadow-xs border border-border/60",
                          avatarPreview ? "bg-transparent" : "bg-gradient-to-r from-primary to-secondary"
                        )}>
                          {avatarPreview ? (
                            <img
                              src={avatarPreview}
                              alt="Foto de perfil"
                              className="w-full h-full object-contain"
                              onError={() => setAvatarPreview(null)}
                            />
                          ) : (
                            <span className="text-white font-semibold text-lg">
                              {user?.firstName?.[0]}{user?.lastName?.[0]}
                            </span>
                          )}
                        </div>
                        <div className="text-center sm:text-left flex-1 min-w-0">
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs font-medium"
                              onClick={() => avatarInputRef.current?.click()}
                              disabled={updateAvatarMutation.isPending}
                              data-testid="button-change-profile-photo"
                            >
                              <i className={updateAvatarMutation.isPending ? "fas fa-spinner fa-spin mr-1.5" : "fas fa-camera mr-1.5"}></i>
                              {updateAvatarMutation.isPending ? "Actualizando..." : "Cambiar Foto"}
                            </Button>
                            <span className="text-xs text-muted-foreground">JPG, PNG o GIF (máx. 2MB)</span>
                          </div>
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/gif"
                            className="hidden"
                            onChange={handleAvatarSelection}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={profileForm.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Nombre(s)</FormLabel>
                              <FormControl>
                                <Input className="h-9 text-xs" {...field} data-testid="input-first-name" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={profileForm.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Apellidos</FormLabel>
                              <FormControl>
                                <Input className="h-9 text-xs" {...field} data-testid="input-last-name" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={profileForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Email</FormLabel>
                              <FormControl>
                                <Input className="h-9 text-xs" type="email" {...field} data-testid="input-email" />
                              </FormControl>
                              <FormDescription className="text-[11px] leading-tight">
                                Usado para notificaciones y acceso a la cuenta
                              </FormDescription>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={profileForm.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Teléfono</FormLabel>
                              <FormControl>
                                <Input className="h-9 text-xs" placeholder="+52 55 1234 5678" {...field} data-testid="input-phone" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Address Section */}
                      <div className="space-y-3 pt-3 border-t border-border/60">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Dirección</h4>
                        
                        <FormField
                          control={profileForm.control}
                          name="street"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Calle</FormLabel>
                              <FormControl>
                                <Input className="h-9 text-xs" placeholder="Nombre de la calle" {...field} data-testid="input-street" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField
                            control={profileForm.control}
                            name="exteriorNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Número Exterior</FormLabel>
                                <FormControl>
                                  <Input className="h-9 text-xs" placeholder="123" {...field} data-testid="input-exterior-number" />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profileForm.control}
                            name="interiorNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Número Interior (Opcional)</FormLabel>
                                <FormControl>
                                  <Input className="h-9 text-xs" placeholder="Depto 4B" {...field} data-testid="input-interior-number" />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField
                            control={profileForm.control}
                            name="colonia"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Colonia</FormLabel>
                                <FormControl>
                                  <Input className="h-9 text-xs" placeholder="Nombre de la colonia" {...field} data-testid="input-colonia" />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profileForm.control}
                            name="postalCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Código Postal</FormLabel>
                                <FormControl>
                                  <Input className="h-9 text-xs" placeholder="01234" {...field} data-testid="input-postal-code" />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField
                            control={profileForm.control}
                            name="city"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Ciudad</FormLabel>
                                <FormControl>
                                  <Input className="h-9 text-xs" placeholder="Ciudad de México" {...field} data-testid="input-city" />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profileForm.control}
                            name="state"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Estado</FormLabel>
                                <FormControl>
                                  <Input className="h-9 text-xs" placeholder="CDMX" {...field} data-testid="input-state" />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button 
                          type="submit"
                          disabled={updateProfileMutation.isPending}
                          size="sm"
                          className="h-9 text-xs font-medium px-4"
                          data-testid="button-save-profile"
                        >
                          {updateProfileMutation.isPending && <i className="fas fa-spinner fa-spin mr-1.5"></i>}
                          Guardar Cambios
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notification Settings */}
            <TabsContent value="notifications" className="space-y-4 mt-3">
              <Card className="border border-border/80 shadow-xs">
                <CardHeader className="py-3 px-4 sm:px-6 border-b border-border/60">
                  <CardTitle className="text-base font-semibold">Preferencias de Notificaciones</CardTitle>
                  <CardDescription className="text-xs">
                    Define los canales y tipos de avisos operativos que deseas recibir
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <Form {...notificationForm}>
                    <form onSubmit={notificationForm.handleSubmit(onNotificationSubmit)} className="space-y-5">
                      {/* Canales */}
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Canales de Notificación</h4>
                        
                        <div className="divide-y divide-border/60 border border-border/70 rounded-lg overflow-hidden bg-card">
                          <FormField
                            control={notificationForm.control}
                            name="emailNotifications"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/20 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                  <FormLabel className="text-xs font-semibold cursor-pointer">Notificaciones por Email</FormLabel>
                                  <FormDescription className="text-[11px] leading-tight text-muted-foreground">
                                    Actualizaciones importantes por correo electrónico
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
                              <FormItem className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/20 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                  <FormLabel className="text-xs font-semibold cursor-pointer">Notificaciones por WhatsApp</FormLabel>
                                  <FormDescription className="text-[11px] leading-tight text-muted-foreground">
                                    Alertas urgentes y recordatorios por mensajería
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
                              <FormItem className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/20 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                  <FormLabel className="text-xs font-semibold cursor-pointer">Notificaciones Push</FormLabel>
                                  <FormDescription className="text-[11px] leading-tight text-muted-foreground">
                                    Notificaciones en tiempo real en la aplicación web
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
                      </div>

                      {/* Tipos de Alertas */}
                      <div className="space-y-2.5 pt-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tipos de Alertas Operativas</h4>
                        
                        <div className="divide-y divide-border/60 border border-border/70 rounded-lg overflow-hidden bg-card">
                          <FormField
                            control={notificationForm.control}
                            name="creditExpiringAlerts"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/20 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                  <FormLabel className="text-xs font-semibold cursor-pointer">Créditos por Vencer</FormLabel>
                                  <FormDescription className="text-[11px] leading-tight text-muted-foreground">
                                    Alertas cuando las solicitudes o líneas están próximas a vencer
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
                              <FormItem className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/20 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                  <FormLabel className="text-xs font-semibold cursor-pointer">Comisiones y Pagos</FormLabel>
                                  <FormDescription className="text-[11px] leading-tight text-muted-foreground">
                                    Notificaciones sobre aprobación y dispersión de comisiones
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
                              <FormItem className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/20 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                  <FormLabel className="text-xs font-semibold cursor-pointer">Documentos Pendientes</FormLabel>
                                  <FormDescription className="text-[11px] leading-tight text-muted-foreground">
                                    Recordatorios de expedientes incompletos o documentos por renovar
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
                              <FormItem className="flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/20 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                  <FormLabel className="text-xs font-semibold cursor-pointer">Emails Informativos y Alianzas</FormLabel>
                                  <FormDescription className="text-[11px] leading-tight text-muted-foreground">
                                    Nuevos productos financieros y comunicados institucionales
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
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button 
                          type="submit"
                          disabled={updateNotificationsMutation.isPending}
                          size="sm"
                          className="h-9 text-xs font-medium px-4"
                          data-testid="button-save-notifications"
                        >
                          {updateNotificationsMutation.isPending && <i className="fas fa-spinner fa-spin mr-1.5"></i>}
                          Guardar Preferencias
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Business Settings */}
            <TabsContent value="business" className="space-y-4 mt-3">
              <Card className="border border-border/80 shadow-xs">
                <CardHeader className="py-3 px-4 sm:px-6 border-b border-border/60">
                  <CardTitle className="text-base font-semibold">Información del Negocio</CardTitle>
                  <CardDescription className="text-xs">
                    Datos comerciales y fiscales de tu entidad o despacho broker
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <Form {...businessForm}>
                    <form onSubmit={businessForm.handleSubmit(onBusinessSubmit)} className="space-y-4">
                      <FormField
                        control={businessForm.control}
                        name="businessName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">Nombre del Negocio / Marca</FormLabel>
                            <FormControl>
                              <Input className="h-9 text-xs" placeholder="Mi Despacho de Brokers" {...field} data-testid="input-business-name" />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={businessForm.control}
                          name="taxId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">RFC</FormLabel>
                              <FormControl>
                                <Input className="h-9 text-xs uppercase" placeholder="XAXX010101000" {...field} data-testid="input-tax-id" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={businessForm.control}
                          name="businessPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Teléfono del Negocio</FormLabel>
                              <FormControl>
                                <Input className="h-9 text-xs" placeholder="+52 55 1234 5678" {...field} data-testid="input-business-phone" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={businessForm.control}
                        name="businessAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">Dirección del Negocio</FormLabel>
                            <FormControl>
                              <Textarea 
                                className="text-xs min-h-[70px] resize-none"
                                placeholder="Dirección fiscal o comercial..."
                                {...field}
                                data-testid="input-business-address"
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={businessForm.control}
                          name="website"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Sitio Web</FormLabel>
                              <FormControl>
                                <Input className="h-9 text-xs" placeholder="https://miempresa.com" {...field} data-testid="input-website" />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={businessForm.control}
                          name="specialization"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-medium">Especialización</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger className="h-9 text-xs" data-testid="select-specialization">
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
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button 
                          type="submit"
                          disabled={updateProfileMutation.isPending}
                          size="sm"
                          className="h-9 text-xs font-medium px-4"
                          data-testid="button-save-business"
                        >
                          {updateProfileMutation.isPending && <i className="fas fa-spinner fa-spin mr-1.5"></i>}
                          Guardar Información
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Profiling Settings */}
            <TabsContent value="profiling" className="space-y-4 mt-3">
              <Card className="border border-border/80 shadow-xs">
                <CardHeader className="py-3 px-4 sm:px-6 border-b border-border/60">
                  <CardTitle className="text-base font-semibold">Perfilamiento Operativo y Bancario</CardTitle>
                  <CardDescription className="text-xs">
                    Régimen fiscal, métricas de colocación y datos para liquidación de comisiones
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <Form {...profilingForm}>
                    <form onSubmit={profilingForm.handleSubmit(onProfilingSubmit)} className="space-y-5">
                      {/* Profile Type Selection */}
                      <FormField
                        control={profilingForm.control}
                        name="profileType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">Tipo de Perfil / Régimen</FormLabel>
                            <Select onValueChange={(value) => {
                              field.onChange(value);
                              setProfileType(value as typeof profileType);
                            }} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-9 text-xs" data-testid="select-profile-type">
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
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />

                      {/* Broker Metrics Section */}
                      <div className="space-y-3 pt-3 border-t border-border/60">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Métricas del Broker</h4>
                          <p className="text-[11px] text-muted-foreground">Capacidad y experiencia en colocación crediticia</p>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          <FormField
                            control={profilingForm.control}
                            name="yearsInBusiness"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Años en el Negocio</FormLabel>
                                <FormControl>
                                  <Input 
                                    className="h-9 text-xs"
                                    placeholder="Ej: 5" 
                                    {...field} 
                                    data-testid="input-years-in-business" 
                                  />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profilingForm.control}
                            name="clientPortfolioSize"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Cartera de Clientes</FormLabel>
                                <FormControl>
                                  <Input 
                                    className="h-9 text-xs"
                                    placeholder="Ej: 50 clientes activos" 
                                    {...field} 
                                    data-testid="input-client-portfolio-size" 
                                  />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profilingForm.control}
                            name="annualGoal"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Meta Anual de Colocación</FormLabel>
                                <FormControl>
                                  <Input 
                                    className="h-9 text-xs"
                                    placeholder="Ej: $10,000,000" 
                                    {...field} 
                                    data-testid="input-annual-goal" 
                                  />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profilingForm.control}
                            name="productsHandled"
                            render={({ field }) => (
                              <FormItem className="sm:col-span-2">
                                <FormLabel className="text-xs font-medium">Productos que Maneja</FormLabel>
                                <FormControl>
                                  <Input 
                                    className="h-9 text-xs"
                                    placeholder="Ej: Crédito Simple, Arrendamiento, Factoraje" 
                                    {...field} 
                                    data-testid="input-products-handled" 
                                  />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profilingForm.control}
                            name="averageTicket"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Ticket Promedio</FormLabel>
                                <FormControl>
                                  <Input 
                                    className="h-9 text-xs"
                                    placeholder="Ej: $500,000" 
                                    {...field} 
                                    data-testid="input-average-ticket" 
                                  />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Referencias Comerciales */}
                      <div className="space-y-3 pt-3 border-t border-border/60">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Referencias Comerciales</h4>
                            <p className="text-[11px] text-muted-foreground">Contactos profesionales verificables</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs font-medium"
                            onClick={addReference}
                            data-testid="button-add-reference"
                          >
                            <i className="fas fa-plus mr-1.5"></i>
                            Agregar Referencia
                          </Button>
                        </div>
                        
                        <div className="space-y-2.5">
                          {references.map((ref, index) => (
                            <div key={index} className="p-3 border border-border/70 rounded-lg bg-muted/20 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-foreground">Referencia #{index + 1}</span>
                                {references.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeReference(index)}
                                    className="h-7 text-xs text-destructive hover:bg-destructive/10"
                                    data-testid={`button-remove-reference-${index}`}
                                  >
                                    <i className="fas fa-trash mr-1"></i>
                                    Eliminar
                                  </Button>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Nombre</label>
                                  <Input
                                    className="h-8 text-xs"
                                    placeholder="Nombre completo"
                                    value={ref.name}
                                    onChange={(e) => updateReference(index, 'name', e.target.value)}
                                    data-testid={`input-reference-name-${index}`}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Teléfono</label>
                                  <Input
                                    className="h-8 text-xs"
                                    placeholder="10 dígitos"
                                    value={ref.phone}
                                    onChange={(e) => updateReference(index, 'phone', e.target.value)}
                                    data-testid={`input-reference-phone-${index}`}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Correo electrónico</label>
                                  <Input
                                    className="h-8 text-xs"
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
                      </div>

                      {/* Datos Bancarios */}
                      <div className="space-y-3 pt-3 border-t border-border/60">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Datos Bancarios para Comisiones</h4>
                          <p className="text-[11px] text-muted-foreground">Cuenta destino para dispersión y pago de comisiones originadas</p>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <FormField
                            control={profilingForm.control}
                            name="bankName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Banco</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="h-9 text-xs" data-testid="select-bank-name">
                                      <SelectValue placeholder="Selecciona banco" />
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
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profilingForm.control}
                            name="clabe"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">CLABE Interbancaria (18 dígitos)</FormLabel>
                                <FormControl>
                                  <Input 
                                    className="h-9 text-xs font-mono"
                                    placeholder="18 dígitos" 
                                    maxLength={18}
                                    {...field} 
                                    data-testid="input-clabe" 
                                  />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={profilingForm.control}
                            name="accountHolder"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Titular de la Cuenta</FormLabel>
                                <FormControl>
                                  <Input 
                                    className="h-9 text-xs"
                                    placeholder="Nombre como aparece en el banco" 
                                    {...field} 
                                    data-testid="input-account-holder" 
                                  />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button 
                          type="submit"
                          disabled={updateProfileMutation.isPending}
                          size="sm"
                          className="h-9 text-xs font-medium px-4"
                          data-testid="button-save-profiling"
                        >
                          {updateProfileMutation.isPending && <i className="fas fa-spinner fa-spin mr-1.5"></i>}
                          Guardar Perfilamiento
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Settings */}
            <TabsContent value="security" className="space-y-4 mt-3">
              <Card className="border border-border/80 shadow-xs">
                <CardHeader className="py-3 px-4 sm:px-6 border-b border-border/60">
                  <CardTitle className="text-base font-semibold">Configuración de Seguridad</CardTitle>
                  <CardDescription className="text-xs">
                    Credenciales de acceso y gestión del ciclo de vida de la cuenta
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-4">
                  <div className="p-3.5 border border-border/70 rounded-lg flex items-center justify-between gap-3 bg-card">
                    <div>
                      <h4 className="text-xs font-semibold text-foreground">Cambiar Contraseña</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Actualiza periódicamente tu contraseña para proteger tu sesión y operaciones
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="h-8 text-xs font-medium"
                      data-testid="button-change-password"
                      onClick={() => setShowPasswordModal(true)}
                    >
                      <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                      Cambiar
                    </Button>
                  </div>

                  {/* Change Password Modal */}
                  <Dialog 
                    open={showPasswordModal} 
                    onOpenChange={(open) => {
                      setShowPasswordModal(open);
                      if (!open) passwordForm.reset();
                    }}
                  >
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-base font-semibold flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-primary" />
                          Cambiar Contraseña
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                          Ingresa tu contraseña actual y define tu nueva clave de acceso
                        </DialogDescription>
                      </DialogHeader>

                      <Form {...passwordForm}>
                        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-3.5">
                          <FormField
                            control={passwordForm.control}
                            name="currentPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Contraseña Actual</FormLabel>
                                <FormControl>
                                  <Input className="h-9 text-xs" type="password" {...field} />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={passwordForm.control}
                            name="newPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Nueva Contraseña</FormLabel>
                                <FormControl>
                                  <Input className="h-9 text-xs" type="password" {...field} />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={passwordForm.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-medium">Confirmar Nueva Contraseña</FormLabel>
                                <FormControl>
                                  <Input className="h-9 text-xs" type="password" {...field} />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                          <DialogFooter className="gap-2 pt-3 border-t border-border/60">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => {
                                setShowPasswordModal(false);
                                passwordForm.reset();
                              }}
                              disabled={updatePasswordMutation.isPending}
                            >
                              Cancelar
                            </Button>
                            <Button 
                              type="submit" 
                              size="sm"
                              className="h-8 text-xs font-medium"
                              disabled={updatePasswordMutation.isPending}
                            >
                              {updatePasswordMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                              Actualizar Contraseña
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>

                  <div className="p-3.5 border border-amber-500/20 bg-amber-500/5 rounded-lg flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-300">Solicitar Baja de Cuenta</h4>
                      <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                        Solicita la desactivación de tu cuenta. Un administrador revisará tu estatus operativo.
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="h-8 text-xs border-amber-600/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
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
                      <i className="fas fa-user-slash mr-1.5"></i>
                      Solicitar Baja
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Beneficios y Acceso Comercial (Bloque 10) */}
            <TabsContent value="benefits" className="space-y-4 mt-3">
              {/* Status & Active Benefit Card */}
              <Card className="border border-border/80 shadow-xs">
                <CardHeader className="py-3 px-4 sm:px-6 border-b border-border/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Gift className="h-4 w-4 text-primary" />
                        Estado de Acceso y Beneficios
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Información de tu esquema comercial y promociones activas
                      </CardDescription>
                    </div>

                    {/* Access Status Badge */}
                    <div>
                      {(() => {
                        const status = myBenefits?.accessStatus || user?.accessStatus || "free";
                        if (status === "complimentary") {
                          return <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 py-0.5 px-2.5 text-xs flex items-center gap-1 font-medium"><Sparkles className="h-3 w-3" /> Cortesía Permanente</Badge>;
                        }
                        if (status === "promotional") {
                          return <Badge className="bg-indigo-600 text-white hover:bg-indigo-700 py-0.5 px-2.5 text-xs flex items-center gap-1 font-medium"><Tag className="h-3 w-3" /> Acceso Promocional</Badge>;
                        }
                        if (status === "trial") {
                          return <Badge className="bg-amber-600 text-white hover:bg-amber-700 py-0.5 px-2.5 text-xs flex items-center gap-1 font-medium"><Clock className="h-3 w-3" /> Periodo de Prueba</Badge>;
                        }
                        if (status === "active") {
                          return <Badge className="bg-primary text-primary-foreground py-0.5 px-2.5 text-xs flex items-center gap-1 font-medium"><CheckCircle className="h-3 w-3" /> Acceso Activo</Badge>;
                        }
                        if (status === "expired") {
                          return <Badge className="bg-amber-600 text-white py-0.5 px-2.5 text-xs flex items-center gap-1 font-medium"><AlertCircle className="h-3 w-3" /> Promoción Finalizada (Acceso Estándar)</Badge>;
                        }
                        return <Badge className="bg-emerald-600 text-white py-0.5 px-2.5 text-xs flex items-center gap-1 font-medium"><CheckCircle className="h-3 w-3" /> Acceso Estándar Gratuito</Badge>;
                      })()}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-3.5">
                  {/* Active Promo Display if exists */}
                  {myBenefits?.activePromo ? (
                    <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Promoción Vigente</span>
                          <h4 className="text-sm font-bold text-foreground mt-0.5">
                            {myBenefits.activePromo.name}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {myBenefits.activePromo.description || "Beneficio comercial activo en tu cuenta."}
                          </p>
                        </div>
                        <Badge variant="outline" className="font-mono text-xs border-primary/30 bg-background text-primary">
                          {myBenefits.activePromo.code}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-primary/15 text-xs">
                        <div>
                          <span className="text-muted-foreground text-[11px]">Tipo de Beneficio:</span>
                          <p className="font-semibold text-foreground capitalize mt-0.5">
                            {myBenefits.activePromo.benefitType.replace('_', ' ')}
                          </p>
                        </div>
                        {myBenefits.activePromo.expiresAt && (
                          <div>
                            <span className="text-muted-foreground text-[11px]">Vigencia hasta:</span>
                            <p className="font-semibold text-foreground mt-0.5">
                              {new Date(myBenefits.activePromo.expiresAt).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-muted/30 border border-border/70 rounded-lg text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">No cuentas con un código promocional aplicado actualmente.</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Tu cuenta opera bajo el esquema estándar con acceso integral a todas las herramientas de colocación y matching crediticio.
                      </p>
                    </div>
                  )}

                  {/* Operational Continuance Guarantee Banner */}
                  <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-3">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] text-emerald-950 dark:text-emerald-200 leading-relaxed">
                      <span className="font-semibold block text-xs text-emerald-900 dark:text-emerald-100 mb-0.5">
                        Garantía de continuidad operativa (No-bloqueo)
                      </span>
                      Crédito Negocios prioriza la colocación efectiva de créditos. El estado de acceso comercial o vencimiento de promociones <strong>NUNCA</strong> bloquea ni suspende el alta de clientes, el motor de matching con financieras, el seguimiento de solicitudes ni la liquidación y dispersión puntual de tus comisiones ganadas.
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Redeem New Promo Code Card */}
              <Card className="border border-border/80 shadow-xs">
                <CardHeader className="py-3 px-4 sm:px-6 border-b border-border/60">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    Canjear Código Promocional
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Si dispones de un código de descuento, meses de servicio o convenio institucional, aplícalo aquí
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-3.5">
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Ingresa tu código (Ej. ALIANZA-2026)"
                        value={promoCodeInput}
                        onChange={(e) => {
                          setPromoCodeInput(e.target.value.toUpperCase());
                          setValidatedPromoPreview(null);
                        }}
                        className="pl-9 h-9 text-xs uppercase font-mono"
                        disabled={isValidatingPromo || isRedeemingPromo}
                        data-testid="input-settings-promocode"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs font-medium"
                      onClick={handleValidatePromo}
                      disabled={isValidatingPromo || isRedeemingPromo || !promoCodeInput.trim()}
                      data-testid="button-validate-promocode"
                    >
                      {isValidatingPromo ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      Validar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 text-xs font-medium"
                      onClick={handleRedeemPromo}
                      disabled={isRedeemingPromo || !promoCodeInput.trim()}
                      data-testid="button-redeem-promocode"
                    >
                      {isRedeemingPromo ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Gift className="h-3.5 w-3.5 mr-1.5" />}
                      Canjear Beneficio
                    </Button>
                  </div>

                  {/* Preview box if code was validated */}
                  {validatedPromoPreview && (
                    <div className="p-3 bg-primary/5 border border-primary/20 rounded-md text-xs text-foreground flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-xs block">{validatedPromoPreview.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {validatedPromoPreview.description || `Beneficio: ${validatedPromoPreview.benefitType}`}
                          {validatedPromoPreview.durationMonths ? ` por ${validatedPromoPreview.durationMonths} meses` : ''}
                        </span>
                      </div>
                      <Badge className="bg-primary text-primary-foreground font-medium text-[11px] py-0.5 px-2">
                        Listo para canjear
                      </Badge>
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    * Nota: Los códigos promocionales otorgan beneficios comerciales temporales o convenios y no reemplazan claves de franquicia Master Broker.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {user?.role === "super_admin" && (
              <TabsContent value="commercial_rules" className="space-y-4 mt-3">
                <CommercialRulesSettings />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </main>
    </MainLayout>
  );
  }
