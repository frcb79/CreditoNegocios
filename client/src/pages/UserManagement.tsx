import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { User, Tenant, TenantMemberWithUser, TenantMemberRole, TENANT_MEMBER_ROLES } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { 
  UserPlus, 
  Edit, 
  Power, 
  Search, 
  Users, 
  Shield, 
  ShieldCheck, 
  Layers, 
  Key, 
  CheckCircle2, 
  Sparkles,
  Building2,
  Lock,
  Crown,
  Copy,
  Mail,
  RefreshCw,
  Send,
  AlertTriangle,
  Tag,
  Gift,
  Plus,
  Calendar,
  UserCheck,
  Eye,
  Loader2,
  Coins,
  Info,
  Inbox
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

// Definition of Platform Modules ("¿Dónde puede ingresar?")
export const SYSTEM_MODULES = [
  { id: 'dashboard', label: 'Dashboard', desc: 'Panel con métricas y resumen general', icon: 'fas fa-chart-pie' },
  { id: 'clientes', label: 'Clientes / Prospectos', desc: 'Directorio y registro de empresas solicitantes', icon: 'fas fa-users' },
  { id: 'creditos', label: 'Solicitudes de Crédito', desc: 'Pipeline y gestión de expedientes de crédito', icon: 'fas fa-credit-card' },
  { id: 'aprobaciones', label: 'Mesa de Aprobaciones', desc: 'Dictamen de solicitudes y asignación a financieras', icon: 'fas fa-clock' },
  { id: 'comisiones', label: 'Comisiones y Dispersión', desc: 'Tableros de comisiones, balances y pagos', icon: 'fas fa-dollar-sign' },
  { id: 'financieras', label: 'Financieras y Políticas', desc: 'Catálogo de instituciones y condiciones comerciales', icon: 'fas fa-building' },
  { id: 'sistema_productos', label: 'Catálogo de Productos', desc: 'Productos de crédito disponibles en plataforma', icon: 'fas fa-layer-group' },
  { id: 'red_brokers', label: 'Red de Brókers', desc: 'Árbol jerárquico de franquicias y sub-brókers', icon: 'fas fa-network-wired' },
  { id: 'documentos', label: 'Expedientes y Documentos', desc: 'Bóveda digital de expedientes de clientes', icon: 'fas fa-file-alt' },
  { id: 'reportes', label: 'Reportes y Auditoría', desc: 'Exportación de métricas, pipelines y liquidaciones', icon: 'fas fa-chart-bar' },
  { id: 'importacion', label: 'Carga Masiva (Excel)', desc: 'Importación de fichas técnicas y comisiones', icon: 'fas fa-file-import' },
  { id: 'usuarios', label: 'Gestión de Usuarios', desc: 'Administración de cuentas, perfiles y permisos', icon: 'fas fa-users-cog' },
];

// Definition of Granular Actions ("¿Qué puede hacer?")
export const SYSTEM_ACTIONS = [
  { id: 'view', label: 'Solo Lectura', desc: 'Consultar expedientes, clientes y estadísticas sin modificar', category: 'Consulta' },
  { id: 'edit', label: 'Crear y Editar', desc: 'Capturar prospectos, editar expedientes y actualizar datos', category: 'Captura' },
  { id: 'submit_proposals', label: 'Enviar a Financieras', desc: 'Turnar propuestas a mesa de control y financieras', category: 'Operativa' },
  { id: 'approve_disperse', label: 'Aprobar y Dispersar', desc: 'Autorizar liquidaciones y dispersión de comisiones', category: 'Financiera' },
  { id: 'manage_commissions', label: 'Administrar Comisiones', desc: 'Configurar tabuladores de comisiones y techos de red', category: 'Políticas' },
  { id: 'manage_users', label: 'Administrar Usuarios', desc: 'Crear, editar y suspender usuarios o colaboradores', category: 'Gobierno' },
  { id: 'export_reports', label: 'Exportar Reportes', desc: 'Descargar auditorías, balances y reportes a Excel / CSV', category: 'Auditoría' },
];

// Quick Role Presets
export const ROLE_PRESETS = [
  {
    name: "Administrador Total",
    badge: "Acceso Completo",
    role: "admin",
    memberRole: "admin" as TenantMemberRole,
    canOriginate: true,
    title: "Administrador General",
    modules: ['dashboard', 'clientes', 'creditos', 'aprobaciones', 'comisiones', 'financieras', 'sistema_productos', 'red_brokers', 'documentos', 'reportes', 'importacion', 'usuarios'],
    actions: ['view', 'edit', 'submit_proposals', 'approve_disperse', 'manage_commissions', 'manage_users', 'export_reports'],
    adminOnly: true,
  },
  {
    name: "Mesa de Control",
    badge: "Operaciones",
    role: "broker",
    memberRole: "member" as TenantMemberRole,
    canOriginate: false,
    title: "Mesa de Control y Operaciones",
    modules: ['dashboard', 'clientes', 'creditos', 'documentos', 'financieras', 'sistema_productos'],
    actions: ['view', 'edit', 'submit_proposals', 'export_reports'],
  },
  {
    name: "Analista de Crédito",
    badge: "Análisis",
    role: "broker",
    memberRole: "member" as TenantMemberRole,
    canOriginate: false,
    title: "Analista de Crédito",
    modules: ['dashboard', 'clientes', 'creditos', 'documentos', 'financieras', 'sistema_productos'],
    actions: ['view', 'edit', 'submit_proposals'],
  },
  {
    name: "Bróker Originador",
    badge: "Comercial",
    role: "broker",
    memberRole: "member" as TenantMemberRole,
    canOriginate: true,
    title: "Bróker Originador",
    modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos', 'documentos'],
    actions: ['view', 'edit', 'submit_proposals'],
  },
  {
    name: "Master Broker",
    badge: "Master Franquicia",
    role: "master_broker",
    memberRole: "owner" as TenantMemberRole,
    canOriginate: true,
    title: "Master Broker Titular",
    modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos', 'red_brokers', 'documentos', 'reportes', 'usuarios'],
    actions: ['view', 'edit', 'submit_proposals', 'manage_commissions', 'manage_users', 'export_reports'],
  },
  {
    name: "Líder de Organización",
    badge: "Líder / Dueño",
    role: "broker",
    memberRole: "owner" as TenantMemberRole,
    canOriginate: true,
    title: "Líder / Socio Director",
    modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos', 'usuarios', 'documentos'],
    actions: ['view', 'edit', 'submit_proposals', 'manage_commissions', 'manage_users', 'export_reports'],
  },
];

// Validation schemas
const memberCreateSchema = z.object({
  email: z.string().email("Email inválido"),
  firstName: z.string().min(1, "Nombre requerido"),
  lastName: z.string().min(1, "Apellido requerido"),
  role: z.enum(TENANT_MEMBER_ROLES),
  canOriginate: z.boolean().default(true),
  customRoleTitle: z.string().optional(),
  password: z.string().optional(),
  sendInvite: z.boolean().default(true),
  modules: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
});

type MemberCreateFormData = z.infer<typeof memberCreateSchema>;

const memberEditSchema = z.object({
  role: z.enum(TENANT_MEMBER_ROLES),
  canOriginate: z.boolean().default(true),
  customRoleTitle: z.string().optional(),
  modules: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
});

type MemberEditFormData = z.infer<typeof memberEditSchema>;

const legacyUserSchema = z.object({
  email: z.string().email("Email inválido"),
  firstName: z.string().min(1, "Nombre requerido"),
  lastName: z.string().min(1, "Apellido requerido"),
  role: z.enum(["broker", "master_broker", "admin", "super_admin"]),
  customRoleTitle: z.string().optional(),
  masterBrokerId: z.string().optional(),
  modules: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
});

type LegacyUserFormData = z.infer<typeof legacyUserSchema>;

export default function UserManagement() {
  const [activeTab, setActiveTab] = useState<string>("organization");
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMemberRole, setFilterMemberRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TenantMemberWithUser | null>(null);
  const [toggleDialog, setToggleDialog] = useState<{ show: boolean; member?: TenantMemberWithUser }>({ show: false });
  const [inviteResultDialog, setInviteResultDialog] = useState<{ show: boolean; inviteUrl?: string; email?: string; isNew?: boolean }>({ show: false });
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<string>("basic");

  // Legacy user state for Super Admin global tab
  const [editingLegacyUser, setEditingLegacyUser] = useState<User | null>(null);
  const [showLegacyUserModal, setShowLegacyUserModal] = useState(false);

  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Promo codes management state (Bloque 10)
  const [showCreatePromoModal, setShowCreatePromoModal] = useState(false);
  const [selectedPromoForRedemptions, setSelectedPromoForRedemptions] = useState<any>(null);
  const [userToEditAccess, setUserToEditAccess] = useState<User | null>(null);
  const [accessStatusSelection, setAccessStatusSelection] = useState<string>("free");
  const [accessExpiresAtSelection, setAccessExpiresAtSelection] = useState<string>("");
  const [accessNotesInput, setAccessNotesInput] = useState<string>("");

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isPlatformAdmin = currentUser?.role === 'admin' || isSuperAdmin;

  // 1. Fetch available tenants for user
  const { data: tenants, isLoading: isLoadingTenants } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
    staleTime: 30000,
  });

  // Queries for Promos
  const { data: adminPromos = [], refetch: refetchAdminPromos, isLoading: isLoadingPromos } = useQuery<any[]>({
    queryKey: ['/api/admin/promos'],
    enabled: isPlatformAdmin,
  });

  const { data: promoRedemptions = [], isLoading: isLoadingRedemptions } = useQuery<any[]>({
    queryKey: ['/api/admin/promos', selectedPromoForRedemptions?.id, 'redemptions'],
    enabled: Boolean(selectedPromoForRedemptions?.id),
  });

  // Toggle Promo active mutation
  const togglePromoMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest('PATCH', `/api/admin/promos/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Código actualizado", description: "Estado actualizado exitosamente." });
      refetchAdminPromos();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo actualizar el código.", variant: "destructive" });
    }
  });

  // Create Promo Form Schema
  const promoFormSchema = z.object({
    code: z.string().min(3, "Mínimo 3 caracteres"),
    name: z.string().min(2, "Nombre requerido"),
    description: z.string().optional(),
    benefitType: z.enum(["free", "percentage_discount", "fixed_discount", "free_months", "permanent_free"]),
    benefitValue: z.string().default("0"),
    durationMonths: z.coerce.number().optional().nullable(),
    maxUses: z.coerce.number().optional().nullable(),
    targetScope: z.enum(["global", "master_broker", "broker", "organization", "alliance", "campaign"]).default("global"),
    expiresAt: z.string().optional(),
  });

  const createPromoForm = useForm<z.infer<typeof promoFormSchema>>({
    resolver: zodResolver(promoFormSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      benefitType: "free_months",
      benefitValue: "1",
      durationMonths: 1,
      targetScope: "global",
    }
  });

  const onCreatePromoSubmit = async (values: z.infer<typeof promoFormSchema>) => {
    try {
      const payload: any = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        description: values.description || null,
        benefitType: values.benefitType,
        benefitValue: values.benefitValue,
        durationMonths: values.durationMonths || null,
        maxUses: values.maxUses || null,
        targetScope: values.targetScope,
        expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
      };
      const res = await apiRequest('POST', '/api/admin/promos', payload);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Error al crear el código promocional");
      }
      toast({ title: "¡Código Promocional Creado!", description: `Código ${payload.code} activo.` });
      setShowCreatePromoModal(false);
      createPromoForm.reset();
      refetchAdminPromos();
    } catch (err: any) {
      toast({ title: "Error al crear", description: err.message || "No se pudo crear el código", variant: "destructive" });
    }
  };

  const updateUserAccessMutation = useMutation({
    mutationFn: async ({ userId, accessStatus, expiresAt, notes }: any) => {
      const res = await apiRequest('PATCH', `/api/admin/users/${userId}/access-status`, {
        accessStatus,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        notes
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Acceso Comercial Actualizado", description: "Se actualizó el estado comercial del usuario." });
      setUserToEditAccess(null);
      refetchLegacyUsers();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "No se pudo actualizar el acceso comercial.", variant: "destructive" });
    }
  });

  // Auto-select first tenant when available
  useEffect(() => {
    if (!selectedTenantId && tenants && tenants.length > 0) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [tenants, selectedTenantId]);

  const currentTenant = tenants?.find(t => t.id === selectedTenantId);
  const tenantType = currentTenant?.type || (currentUser?.role === 'master_broker' ? 'master_broker' : 'broker');

  // Determine delegable modules strictly according to administrator profile & organization
  const getDelegableModules = (canOriginate: boolean) => {
    return SYSTEM_MODULES.filter((mod) => {
      // 1. Platform-only modules
      if (['aprobaciones', 'importacion'].includes(mod.id)) {
        return isSuperAdmin;
      }
      // 2. Master Broker organization specific
      if (['red_brokers', 'reportes'].includes(mod.id)) {
        if (!isSuperAdmin && tenantType !== 'master_broker') return false;
      }
      // 3. Comisiones: only allowed if canOriginate is true
      if (mod.id === 'comisiones') {
        if (!canOriginate) return false;
      }
      return true;
    });
  };

  // 2. Fetch members of selected tenant
  const { 
    data: members, 
    isLoading: isLoadingMembers, 
    refetch: refetchMembers 
  } = useQuery<TenantMemberWithUser[]>({
    queryKey: ["/api/tenants", selectedTenantId, "members"],
    queryFn: async () => {
      if (!selectedTenantId) return [];
      const res = await apiRequest("GET", `/api/tenants/${selectedTenantId}/members`);
      return res.json();
    },
    enabled: !!selectedTenantId,
  });

  // 3. Current user's membership in the selected tenant
  const userMembershipInSelectedTenant = members?.find(m => m.userId === currentUser?.id);
  const callerRoleInTenant = isSuperAdmin ? 'super_admin' : (userMembershipInSelectedTenant?.role || null);
  const canManageMembers = isSuperAdmin || callerRoleInTenant === 'owner' || callerRoleInTenant === 'admin';
  const isOwnerOrSuper = isSuperAdmin || callerRoleInTenant === 'owner';

  // 4. Fetch legacy users for platform admin global tab
  const { data: legacyUsers, isLoading: isLoadingLegacyUsers, refetch: refetchLegacyUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isPlatformAdmin,
  });

  // Forms
  const createMemberForm = useForm<MemberCreateFormData>({
    resolver: zodResolver(memberCreateSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "member",
      canOriginate: true,
      customRoleTitle: "",
      password: "",
      sendInvite: true,
      modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos', 'documentos'],
      actions: ['view', 'edit', 'submit_proposals'],
    },
  });

  const editMemberForm = useForm<MemberEditFormData>({
    resolver: zodResolver(memberEditSchema),
    defaultValues: {
      role: "member",
      canOriginate: true,
      customRoleTitle: "",
      modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos', 'documentos'],
      actions: ['view', 'edit', 'submit_proposals'],
    },
  });

  const legacyForm = useForm<LegacyUserFormData>({
    resolver: zodResolver(legacyUserSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "broker",
      customRoleTitle: "",
      masterBrokerId: "",
      modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos'],
      actions: ['view', 'edit', 'submit_proposals'],
    },
  });

  const watchedCreateModules = createMemberForm.watch("modules") || [];
  const watchedCreateActions = createMemberForm.watch("actions") || [];
  const watchedCreateCanOriginate = createMemberForm.watch("canOriginate");

  const watchedEditModules = editMemberForm.watch("modules") || [];
  const watchedEditActions = editMemberForm.watch("actions") || [];
  const watchedEditCanOriginate = editMemberForm.watch("canOriginate");

  // Member Mutations
  const createMemberMutation = useMutation({
    mutationFn: async (data: MemberCreateFormData) => {
      const payload: any = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        canOriginate: data.canOriginate,
        customRoleTitle: data.customRoleTitle || undefined,
        password: data.password || undefined,
        sendInvite: data.sendInvite,
        permissions: {
          modules: data.modules,
          actions: data.actions,
          scope: data.role === 'owner' ? 'tenant' : 'standard',
        },
      };
      const res = await apiRequest("POST", `/api/tenants/${selectedTenantId}/members`, payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", selectedTenantId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowCreateModal(false);
      createMemberForm.reset();
      toast({
        title: "Colaborador agregado",
        description: data.message || "Usuario y membresía creados exitosamente",
      });
      if (data.inviteUrl) {
        setInviteResultDialog({
          show: true,
          inviteUrl: data.inviteUrl,
          email: data.user?.email,
          isNew: true,
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Error al agregar colaborador",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: async ({ memberId, data }: { memberId: string; data: MemberEditFormData }) => {
      const payload: any = {
        role: data.role,
        canOriginate: data.canOriginate,
        customRoleTitle: data.customRoleTitle || null,
        permissions: {
          modules: data.modules,
          actions: data.actions,
          scope: data.role === 'owner' ? 'tenant' : 'standard',
        },
      };
      const res = await apiRequest("PATCH", `/api/tenants/${selectedTenantId}/members/${memberId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", selectedTenantId, "members"] });
      setEditingMember(null);
      toast({
        title: "Perfil de miembro actualizado",
        description: "Los cambios en rol y facultades se guardaron exitosamente",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Error al actualizar",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const toggleMemberStatusMutation = useMutation({
    mutationFn: async (member: TenantMemberWithUser) => {
      const res = await apiRequest("PATCH", `/api/tenants/${selectedTenantId}/members/${member.id}/status`, {
        isActive: !member.isActive,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", selectedTenantId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setToggleDialog({ show: false });
      toast({
        title: "Estado actualizado",
        description: data.message || "El estado del miembro ha sido actualizado",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Acción no permitida",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (member: TenantMemberWithUser) => {
      const res = await apiRequest("POST", `/api/tenants/${selectedTenantId}/members/${member.id}/resend-invite`, {});
      return res.json();
    },
    onSuccess: (data: any, variables: TenantMemberWithUser) => {
      toast({
        title: "Invitación generada",
        description: data.message || "Enlace de activación listo",
      });
      if (data.inviteUrl) {
        setInviteResultDialog({
          show: true,
          inviteUrl: data.inviteUrl,
          email: variables.user?.email || undefined,
          isNew: false,
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Error al reenviar invitación",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Apply Preset to form
  const applyPresetToCreate = (preset: typeof ROLE_PRESETS[0]) => {
    setSelectedPreset(preset.name);
    createMemberForm.setValue("customRoleTitle", preset.title);
    if (isOwnerOrSuper) {
      createMemberForm.setValue("role", preset.memberRole);
    } else {
      createMemberForm.setValue("role", "member");
    }
    const presetCanOriginate = preset.canOriginate ?? true;
    createMemberForm.setValue("canOriginate", presetCanOriginate);

    const delegable = getDelegableModules(presetCanOriginate).map(m => m.id);
    const filteredModules = preset.modules.filter(m => delegable.includes(m));
    createMemberForm.setValue("modules", [...filteredModules]);
    createMemberForm.setValue("actions", [...preset.actions]);
    toast({
      title: `Plantilla: ${preset.name}`,
      description: `Módulos (${filteredModules.length}) y facultades (${preset.actions.length}) configurados`,
    });
  };

  const applyPresetToEdit = (preset: typeof ROLE_PRESETS[0]) => {
    setSelectedPreset(preset.name);
    editMemberForm.setValue("customRoleTitle", preset.title);
    if (isOwnerOrSuper) {
      editMemberForm.setValue("role", preset.memberRole);
    }
    const presetCanOriginate = preset.canOriginate ?? true;
    editMemberForm.setValue("canOriginate", presetCanOriginate);

    const delegable = getDelegableModules(presetCanOriginate).map(m => m.id);
    const filteredModules = preset.modules.filter(m => delegable.includes(m));
    editMemberForm.setValue("modules", [...filteredModules]);
    editMemberForm.setValue("actions", [...preset.actions]);
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setSelectedPreset(null);
    setModalTab("basic");
    const delegable = getDelegableModules(true).map(m => m.id);
    createMemberForm.reset({
      email: "",
      firstName: "",
      lastName: "",
      role: "member",
      canOriginate: true,
      customRoleTitle: "",
      password: "",
      sendInvite: true,
      modules: delegable,
      actions: ['view', 'edit', 'submit_proposals'],
    });
    setShowCreateModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (member: TenantMemberWithUser) => {
    setEditingMember(member);
    setSelectedPreset(null);
    setModalTab("basic");
    const perms = (member.user?.permissions as any) || {};
    const memberCanOriginate = member.role === 'owner' || (member.canOriginate ?? true);
    const delegable = getDelegableModules(memberCanOriginate).map(m => m.id);

    const defaultMods = member.user?.role === 'master_broker'
      ? ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos', 'red_brokers', 'documentos', 'reportes', 'usuarios']
      : memberCanOriginate
        ? ['dashboard', 'clientes', 'creditos', 'comisiones', 'financieras', 'sistema_productos', 'documentos']
        : ['dashboard', 'clientes', 'creditos', 'financieras', 'sistema_productos', 'documentos'];

    const rawModules: string[] = Array.isArray(perms.modules) && perms.modules.length > 0 ? perms.modules : defaultMods;
    const modules = rawModules.filter((m: string) => delegable.includes(m));
    const actions = Array.isArray(perms.actions) && perms.actions.length > 0 ? perms.actions : ['view', 'edit', 'submit_proposals'];

    editMemberForm.reset({
      role: member.role,
      canOriginate: memberCanOriginate,
      customRoleTitle: member.user?.customRoleTitle || "",
      modules,
      actions,
    });
  };

  // Filtered members list
  const filteredMembers = members?.filter((m) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = 
      !searchTerm ||
      m.user?.email?.toLowerCase().includes(search) ||
      m.user?.firstName?.toLowerCase().includes(search) ||
      m.user?.lastName?.toLowerCase().includes(search) ||
      (m.user?.customRoleTitle && m.user.customRoleTitle.toLowerCase().includes(search));

    const matchesRole = filterMemberRole === "all" || m.role === filterMemberRole;
    const matchesStatus = 
      filterStatus === "all" ||
      (filterStatus === "active" && m.isActive) ||
      (filterStatus === "inactive" && !m.isActive);

    return matchesSearch && matchesRole && matchesStatus;
  }) || [];

  // Helper Badge Colors
  const getMemberRoleBadge = (role: TenantMemberRole) => {
    switch (role) {
      case "owner":
        return (
          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border-purple-300 gap-1 text-xs">
            <Crown className="w-3 h-3 text-purple-600 dark:text-purple-300" />
            Propietario / Líder
          </Badge>
        );
      case "admin":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border-blue-300 gap-1 text-xs">
            <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-300" />
            Administrador
          </Badge>
        );
      case "member":
        return (
          <Badge variant="outline" className="bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 gap-1 text-xs">
            <Users className="w-3 h-3 text-slate-500" />
            Colaborador
          </Badge>
        );
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  const getTenantTypeBadge = (type: string) => {
    switch (type) {
      case "platform":
        return <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-[10px]">Plataforma</Badge>;
      case "master_broker":
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px]">Master Franquicia</Badge>;
      case "broker":
        return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 text-[10px]">Bróker</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{type}</Badge>;
    }
  };

  // Loading skeleton
  if (isLoadingTenants) {
    return (
      <MainLayout>
        <Header 
          title="Gestión de Organización y Equipo" 
          subtitle="Cargando estructuras organizacionales..." 
        />
        <main className="flex-1 p-6 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </main>
      </MainLayout>
    );
  }

  // Access guard: if not platform admin and has no tenant organizations
  if (!isPlatformAdmin && (!tenants || tenants.length === 0)) {
    return (
      <MainLayout>
        <Header 
          title="Gestión de Organización" 
          subtitle="Control de acceso organizacional" 
        />
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center mb-4 text-muted-foreground shadow-sm">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground mb-2">
            Sin Organización Asignada
          </h2>
          <p className="text-muted-foreground max-w-md mb-6 text-sm">
            Tu cuenta no pertenece a ninguna organización activa. Contacta a un administrador de plataforma para vincular tu cuenta a un equipo.
          </p>
        </div>
      </MainLayout>
    );
  }

  // Count active stats for current tenant
  const totalMembers = members?.length || 0;
  const activeCount = members?.filter(m => m.isActive).length || 0;
  const ownerCount = members?.filter(m => m.role === 'owner' && m.isActive).length || 0;
  const adminCount = members?.filter(m => m.role === 'admin' && m.isActive).length || 0;
  const memberCount = members?.filter(m => m.role === 'member' && m.isActive).length || 0;

  return (
    <MainLayout>
      <Header 
        title={currentTenant ? `Equipo: ${currentTenant.name}` : "Gestión de Organización y Equipo"}
        subtitle={
          currentTenant 
            ? `Organización (${currentTenant.type === 'platform' ? 'Plataforma Central' : currentTenant.type === 'master_broker' ? 'Master Franquicia' : 'Bróker'}) · Administra colaboradores, roles y permisos de tu equipo`
            : "Control de identidades, perfiles y permisos de la organización"
        }
      >
        {canManageMembers && activeTab !== "promos" && (
          <Button
            onClick={handleOpenCreateModal}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm ml-3"
            data-testid="button-new-member"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Nuevo Colaborador
          </Button>
        )}
        {isPlatformAdmin && activeTab === "promos" && (
          <Button
            onClick={() => setShowCreatePromoModal(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm ml-3"
            data-testid="button-new-promo"
          >
            <Tag className="w-4 h-4 mr-2" />
            Nuevo Código Promocional
          </Button>
        )}
      </Header>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-4">
        
        {/* Navigation Tabs for Platform Admins */}
        {isPlatformAdmin && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 max-w-2xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              <TabsTrigger value="organization" data-testid="tab-organization" className="text-xs font-semibold flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                Organización
              </TabsTrigger>
              <TabsTrigger value="global" data-testid="tab-global" className="text-xs font-semibold flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                Directorio Global ({legacyUsers?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="promos" data-testid="tab-promos" className="text-xs font-semibold flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-primary" />
                Códigos Promocionales ({adminPromos?.length || 0})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Tab 1: Organization Members View */}
        {activeTab === "organization" && (
          <>
            {/* Organization Selector Bar (Compact Institutional Style) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-xs p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Organización Activa
                  </div>
                  {tenants && tenants.length > 1 ? (
                    <Select 
                      value={selectedTenantId} 
                      onValueChange={setSelectedTenantId}
                    >
                      <SelectTrigger 
                        className="h-8 mt-0.5 font-semibold text-xs border-slate-300 min-w-[240px]" 
                        data-testid="select-tenant"
                      >
                        <SelectValue placeholder="Seleccionar organización..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {tenants.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs">{t.name}</span>
                              {getTenantTypeBadge(t.type)}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-bold text-sm text-foreground">
                        {currentTenant?.name || "Mi Organización"}
                      </span>
                      {currentTenant && getTenantTypeBadge(currentTenant.type)}
                    </div>
                  )}
                </div>
              </div>

              {/* Caller Role Status in this Organization */}
              <div className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 self-stretch sm:self-auto justify-between sm:justify-start">
                <span className="text-slate-500">Tu rol:</span>
                {isSuperAdmin ? (
                  <Badge className="bg-purple-100 text-purple-800 text-[11px] h-5 px-2">Super Admin (Plataforma)</Badge>
                ) : userMembershipInSelectedTenant ? (
                  getMemberRoleBadge(userMembershipInSelectedTenant.role)
                ) : (
                  <Badge variant="outline" className="text-[11px] h-5 px-2">Sin membresía directa</Badge>
                )}
              </div>
            </div>

            {/* Metrics Strip (Compact Institutional Bar) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800">
              <div className="flex items-center gap-3 pt-1 sm:pt-0 sm:px-2">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 shrink-0">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Miembros</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">{totalMembers}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1 sm:pt-0 sm:px-4">
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 shrink-0">
                  <Power className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Activos</div>
                  <div className="text-lg font-bold text-emerald-600 leading-tight">{activeCount}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 sm:pt-0 sm:px-4">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 shrink-0">
                  <Crown className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Líderes / Owners</div>
                  <div className="text-lg font-bold text-purple-600 leading-tight">{ownerCount}</div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 sm:pt-0 sm:px-4">
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Colaboradores</div>
                  <div className="text-lg font-bold text-slate-700 dark:text-slate-200 leading-tight">{adminCount + memberCount}</div>
                </div>
              </div>
            </div>

            {/* Filter Bar (Integrated & Compact) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 shadow-sm flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por colaborador, email o cargo (Mesa de Control, Analista)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700"
                  data-testid="input-search-members"
                />
              </div>

              <div className="flex items-center gap-2">
                <Select value={filterMemberRole} onValueChange={setFilterMemberRole}>
                  <SelectTrigger className="w-full md:w-44 h-9 text-xs border-slate-200 dark:border-slate-700" data-testid="select-filter-member-role">
                    <SelectValue placeholder="Rol interno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los roles</SelectItem>
                    <SelectItem value="owner">Propietario / Líder</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="member">Colaborador</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full md:w-36 h-9 text-xs border-slate-200 dark:border-slate-700" data-testid="select-filter-status">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="inactive">Inactivos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Members Section */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
              <div className="py-3 px-4 sm:px-5 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Miembros del Equipo</span>
                  <Badge variant="secondary" className="font-mono text-xs h-5 px-1.5">{filteredMembers.length}</Badge>
                </div>
                <div className="text-[11px] text-slate-500 hidden sm:block">
                  Credenciales únicas y facultades operativas asignadas
                </div>
              </div>

              <div>
                {isLoadingMembers ? (
                  <div className="p-6 space-y-2.5">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-2.5" />
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No se encontraron colaboradores</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {searchTerm ? "Prueba ajustando los filtros de búsqueda" : "Agrega el primer colaborador de esta organización"}
                    </p>
                    {canManageMembers && !searchTerm && (
                      <Button 
                        size="sm" 
                        onClick={handleOpenCreateModal} 
                        className="mt-3.5 h-8 text-xs font-semibold"
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                        Agregar Colaborador
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Desktop View: High Density Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                          <tr>
                            <th className="py-2.5 px-4 text-left">Colaborador</th>
                            <th className="py-2.5 px-3 text-left">Rol Interno</th>
                            <th className="py-2.5 px-3 text-left">Cargo / Puesto</th>
                            <th className="py-2.5 px-3 text-left">Facultades Asignadas</th>
                            <th className="py-2.5 px-3 text-center">Estado</th>
                            <th className="py-2.5 px-3 text-left">Ingreso</th>
                            <th className="py-2.5 px-4 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredMembers.map((m) => {
                            const perms = (m.user?.permissions as any) || {};
                            const modCount = Array.isArray(perms.modules) ? perms.modules.length : 0;
                            const actCount = Array.isArray(perms.actions) ? perms.actions.length : 0;
                            const isFull = m.user?.role === 'super_admin' || modCount === SYSTEM_MODULES.length;

                            // Protection rules for action buttons
                            const isSelf = m.userId === currentUser?.id;
                            const isCallerAdminOnly = callerRoleInTenant === 'admin';
                            const cannotTouch = isCallerAdminOnly && (m.role === 'owner' || m.role === 'admin');

                            return (
                              <tr 
                                key={m.id} 
                                className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                                data-testid={`row-member-${m.id}`}
                              >
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                                      {(m.user?.firstName?.[0] || 'U').toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 leading-tight truncate">
                                        <span>{m.user?.firstName} {m.user?.lastName}</span>
                                        {isSelf && (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/40 text-primary font-normal">
                                            Tú
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-500 font-mono leading-tight truncate">
                                        {m.user?.email}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                <td className="py-2.5 px-3">
                                  {getMemberRoleBadge(m.role)}
                                </td>

                                <td className="py-2.5 px-3">
                                  {m.user?.customRoleTitle ? (
                                    <span className="text-[11px] font-medium text-primary flex items-center gap-1 bg-primary/5 px-2 py-0.5 rounded border border-primary/20 w-fit">
                                      <Sparkles className="w-2.5 h-2.5" />
                                      {m.user.customRoleTitle}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 italic">Estándar</span>
                                  )}
                                </td>

                                <td className="py-2.5 px-3">
                                  {isFull ? (
                                    <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] h-5">
                                      <Key className="w-2.5 h-2.5 mr-1" />
                                      Acceso Total ({SYSTEM_MODULES.length})
                                    </Badge>
                                  ) : (
                                    <div className="flex flex-wrap gap-1 items-center">
                                      <Badge variant="secondary" className="text-[11px] h-5 px-1.5">
                                        <Layers className="w-2.5 h-2.5 mr-1 text-slate-500" />
                                        {modCount} mód.
                                      </Badge>
                                      <Badge variant="outline" className="text-[11px] h-5 px-1.5 text-slate-600 dark:text-slate-300">
                                        <Shield className="w-2.5 h-2.5 mr-1 text-slate-400" />
                                        {actCount} acc.
                                      </Badge>
                                    </div>
                                  )}
                                </td>

                                <td className="py-2.5 px-3 text-center">
                                  <Badge 
                                    variant="outline"
                                    className={`text-[10px] h-5 px-2 font-medium ${
                                      m.isActive 
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300" 
                                        : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400"
                                    }`}
                                  >
                                    {m.isActive ? "Activo" : "Inactivo"}
                                  </Badge>
                                </td>

                                <td className="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                                  {m.joinedAt ? format(new Date(m.joinedAt), "dd MMM yyyy", { locale: es }) : "—"}
                                </td>

                                <td className="py-2.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {canManageMembers && !cannotTouch && (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleOpenEditModal(m)}
                                          className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                                          title="Editar rol y permisos"
                                          data-testid={`button-edit-member-${m.id}`}
                                        >
                                          <Edit className="h-3.5 w-3.5" />
                                        </Button>

                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => resendInviteMutation.mutate(m)}
                                          disabled={resendInviteMutation.isPending}
                                          className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                          title="Reenviar invitación / reset contraseña"
                                          data-testid={`button-resend-invite-${m.id}`}
                                        >
                                          <Send className="h-3.5 w-3.5" />
                                        </Button>

                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setToggleDialog({ show: true, member: m })}
                                          className={`h-7 w-7 p-0 ${
                                            m.isActive 
                                              ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40" 
                                              : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                          }`}
                                          title={m.isActive ? "Desactivar miembro" : "Activar miembro"}
                                          data-testid={`button-toggle-member-${m.id}`}
                                        >
                                          <Power className="h-3.5 w-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View: Compact Cards */}
                    <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredMembers.map((m) => {
                        const perms = (m.user?.permissions as any) || {};
                        const modCount = Array.isArray(perms.modules) ? perms.modules.length : 0;
                        const actCount = Array.isArray(perms.actions) ? perms.actions.length : 0;
                        const isFull = m.user?.role === 'super_admin' || modCount === SYSTEM_MODULES.length;

                        // Protection rules for action buttons
                        const isSelf = m.userId === currentUser?.id;
                        const isCallerAdminOnly = callerRoleInTenant === 'admin';
                        const cannotTouch = isCallerAdminOnly && (m.role === 'owner' || m.role === 'admin');

                        return (
                          <div 
                            key={m.id}
                            className="p-3.5 space-y-2.5"
                            data-testid={`row-member-${m.id}-mobile`}
                          >
                            {/* Card Header: Avatar + Name + Status */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                                  {(m.user?.firstName?.[0] || 'U').toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5 leading-tight truncate">
                                    <span>{m.user?.firstName} {m.user?.lastName}</span>
                                    {isSelf && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/40 text-primary font-normal">
                                        Tú
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono truncate">
                                    {m.user?.email}
                                  </div>
                                </div>
                              </div>

                              <Badge 
                                variant="outline"
                                className={`text-[10px] h-5 px-1.5 shrink-0 ${
                                  m.isActive 
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300" 
                                    : "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400"
                                }`}
                              >
                                {m.isActive ? "Activo" : "Inactivo"}
                              </Badge>
                            </div>

                            {/* Card Body: Roles, Title, Faculties */}
                            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                              <div>
                                <span className="text-[10px] font-semibold text-slate-400 block uppercase">Rol / Cargo</span>
                                <div className="mt-0.5 space-y-1">
                                  {getMemberRoleBadge(m.role)}
                                  {m.user?.customRoleTitle && (
                                    <div className="text-[10px] font-medium text-primary truncate">
                                      {m.user.customRoleTitle}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div>
                                <span className="text-[10px] font-semibold text-slate-400 block uppercase">Facultades</span>
                                <div className="mt-0.5">
                                  {isFull ? (
                                    <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[10px] h-5">
                                      <Key className="w-2.5 h-2.5 mr-1" />
                                      Total ({SYSTEM_MODULES.length})
                                    </Badge>
                                  ) : (
                                    <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                                      {modCount} mód. · {actCount} acc.
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Card Footer: Joined Date + Action Buttons */}
                            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                              <span>Ingreso: {m.joinedAt ? format(new Date(m.joinedAt), "dd/MM/yyyy") : "—"}</span>
                              
                              <div className="flex items-center gap-1">
                                {canManageMembers && !cannotTouch && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenEditModal(m)}
                                      className="h-7 text-xs px-2 text-slate-700"
                                      data-testid={`button-edit-member-${m.id}-mobile`}
                                    >
                                      <Edit className="h-3 w-3 mr-1" />
                                      Editar
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => resendInviteMutation.mutate(m)}
                                      disabled={resendInviteMutation.isPending}
                                      className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700"
                                      title="Reenviar invitación"
                                      data-testid={`button-resend-invite-${m.id}-mobile`}
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setToggleDialog({ show: true, member: m })}
                                      className={`h-7 w-7 p-0 ${
                                        m.isActive 
                                          ? "text-rose-600 hover:text-rose-700" 
                                          : "text-emerald-600 hover:text-emerald-700"
                                      }`}
                                      title={m.isActive ? "Desactivar" : "Activar"}
                                      data-testid={`button-toggle-member-${m.id}-mobile`}
                                    >
                                      <Power className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Tab 2: Global Legacy Directory (SuperAdmin only) */}
        {activeTab === "global" && isPlatformAdmin && (
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="py-4 px-6 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Directorio Global de Usuarios</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Visualización técnica completa de registros en tabla users
                </p>
              </div>
              <Badge variant="secondary" className="font-mono text-xs">{legacyUsers?.length || 0}</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="bg-muted/40 border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3 px-6 text-left font-semibold">Usuario</th>
                      <th className="py-3 px-4 text-left font-semibold">Email</th>
                      <th className="py-3 px-4 text-left font-semibold">Rol</th>
                      <th className="py-3 px-4 text-left font-semibold">Puesto</th>
                      <th className="py-3 px-4 text-left font-semibold">Estado Cuenta</th>
                      <th className="py-3 px-4 text-left font-semibold">Acceso Comercial</th>
                      <th className="py-3 px-4 text-left font-semibold">Creado</th>
                      <th className="py-3 px-6 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {legacyUsers?.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/30">
                        <td className="py-3 px-6 font-medium">
                          {u.firstName} {u.lastName}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-muted-foreground">
                          {u.email}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="text-xs">{u.role}</Badge>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {u.customRoleTitle || "-"}
                        </td>
                        <td className="py-3 px-4">
                          <Badge 
                            variant="outline" 
                            className={u.isActive ? "bg-emerald-50 text-emerald-700 text-xs" : "bg-gray-100 text-xs"}
                          >
                            {u.isActive ? "Activo" : "Inactivo"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline" className={`text-xs w-fit ${
                              u.accessStatus === 'complimentary' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                              u.accessStatus === 'promotional' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' :
                              u.accessStatus === 'trial' ? 'bg-amber-50 text-amber-700 border-amber-300' :
                              u.accessStatus === 'active' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                              u.accessStatus === 'expired' ? 'bg-orange-50 text-orange-700 border-orange-300' :
                              'bg-green-50 text-green-700 border-green-300'
                            }`}>
                              {u.accessStatus === 'complimentary' ? 'Cortesía' :
                               u.accessStatus === 'promotional' ? 'Promocional' :
                               u.accessStatus === 'trial' ? 'Prueba' :
                               u.accessStatus === 'active' ? 'Activo' :
                               u.accessStatus === 'expired' ? 'Finalizado' :
                               'Gratuito'}
                            </Badge>
                            {u.accessStatusExpiresAt && (
                              <span className="text-[10px] text-muted-foreground">
                                Vence: {format(new Date(u.accessStatusExpiresAt), "dd/MM/yyyy")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {u.createdAt ? format(new Date(u.createdAt), "dd/MM/yyyy") : "-"}
                        </td>
                        <td className="py-3 px-6 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setUserToEditAccess(u);
                              setAccessStatusSelection(u.accessStatus || "free");
                              setAccessExpiresAtSelection(u.accessStatusExpiresAt ? format(new Date(u.accessStatusExpiresAt), "yyyy-MM-dd") : "");
                              setAccessNotesInput(u.accessStatusNotes || "");
                            }}
                            className="h-8 text-xs text-primary hover:text-primary hover:bg-primary/10"
                            title="Modificar acceso comercial"
                            data-testid={`button-edit-access-${u.id}`}
                          >
                            <Tag className="h-3.5 w-3.5 mr-1" />
                            Acceso
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 3: Promotional Codes Management (Bloque 10) */}
        {activeTab === "promos" && isPlatformAdmin && (
          <div className="space-y-6">
            <Card className="border border-border/60 shadow-sm">
              <CardHeader className="py-4 px-6 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Tag className="w-4 h-4 text-primary" />
                    Catálogo de Códigos Promocionales y Alianzas
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Define códigos de descuento, meses de gracia o cortesías. Los códigos son independientes de las claves de franquicia (referralCode).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {adminPromos?.length || 0} Códigos
                  </Badge>
                  <Button
                    onClick={() => setShowCreatePromoModal(true)}
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    data-testid="button-create-promo-inside"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Nuevo Código
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-sm">
                    <thead className="bg-muted/40 border-b text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-3 px-6 text-left font-semibold">Código</th>
                        <th className="py-3 px-4 text-left font-semibold">Nombre y Detalle</th>
                        <th className="py-3 px-4 text-left font-semibold">Beneficio</th>
                        <th className="py-3 px-4 text-left font-semibold">Alcance</th>
                        <th className="py-3 px-4 text-left font-semibold">Usos</th>
                        <th className="py-3 px-4 text-left font-semibold">Vigencia</th>
                        <th className="py-3 px-4 text-left font-semibold">Activo</th>
                        <th className="py-3 px-6 text-right font-semibold">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {adminPromos?.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                            No hay códigos promocionales registrados todavía. Crea uno para comenzar.
                          </td>
                        </tr>
                      ) : (
                        adminPromos?.map((promo: any) => (
                          <tr key={promo.id} className="hover:bg-muted/30">
                            <td className="py-3 px-6">
                              <Badge variant="outline" className="font-mono text-xs font-bold bg-primary/5 text-primary border-primary/30">
                                {promo.code}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-xs text-foreground">{promo.name}</div>
                              {promo.description && (
                                <div className="text-[11px] text-muted-foreground truncate max-w-xs">{promo.description}</div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <Badge className={`text-xs ${
                                promo.benefitType === 'permanent_free' ? 'bg-emerald-600 text-white' :
                                promo.benefitType === 'free_months' ? 'bg-indigo-600 text-white' :
                                promo.benefitType === 'percentage_discount' ? 'bg-blue-600 text-white' :
                                promo.benefitType === 'fixed_discount' ? 'bg-blue-700 text-white' :
                                'bg-green-600 text-white'
                              }`}>
                                {promo.benefitType === 'free_months' ? `${promo.durationMonths || 1} meses gratis` :
                                 promo.benefitType === 'percentage_discount' ? `${promo.benefitValue}% desc.` :
                                 promo.benefitType === 'fixed_discount' ? `$${promo.benefitValue} desc.` :
                                 promo.benefitType === 'permanent_free' ? 'Permanente' : 'Gratis'}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-xs capitalize text-muted-foreground">
                              {promo.targetScope}
                            </td>
                            <td className="py-3 px-4 text-xs font-mono">
                              <span className="font-semibold text-foreground">{promo.currentUses}</span>
                              <span className="text-muted-foreground"> / {promo.maxUses ?? '∞'}</span>
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">
                              {promo.expiresAt ? format(new Date(promo.expiresAt), "dd/MM/yyyy") : "Sin vencimiento"}
                            </td>
                            <td className="py-3 px-4">
                              <Switch
                                checked={promo.isActive}
                                onCheckedChange={(checked) => togglePromoMutation.mutate({ id: promo.id, isActive: checked })}
                                disabled={togglePromoMutation.isPending}
                                data-testid={`switch-promo-active-${promo.id}`}
                              />
                            </td>
                            <td className="py-3 px-6 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedPromoForRedemptions(promo)}
                                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                data-testid={`button-view-redemptions-${promo.id}`}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                Canjes ({promo.currentUses})
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      </main>

      {/* MODAL 1: CREATE PROMO CODE */}
      <Dialog open={showCreatePromoModal} onOpenChange={setShowCreatePromoModal}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Crear Nuevo Código Promocional
            </DialogTitle>
            <DialogDescription>
              Configura el beneficio comercial y condiciones de canje.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={createPromoForm.handleSubmit(onCreatePromoSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Código Único</label>
                <Input
                  placeholder="EJ. ALIANZA-2026"
                  {...createPromoForm.register("code")}
                  className="uppercase font-mono text-sm"
                  data-testid="input-promo-code"
                />
                {createPromoForm.formState.errors.code && (
                  <p className="text-[11px] text-destructive">{createPromoForm.formState.errors.code.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Nombre de Promoción</label>
                <Input
                  placeholder="Alianza Especial"
                  {...createPromoForm.register("name")}
                  className="text-sm"
                  data-testid="input-promo-name"
                />
                {createPromoForm.formState.errors.name && (
                  <p className="text-[11px] text-destructive">{createPromoForm.formState.errors.name.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Descripción (Opcional)</label>
              <Input
                placeholder="Beneficio especial acordado con la red..."
                {...createPromoForm.register("description")}
                className="text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Tipo de Beneficio</label>
                <Select
                  value={createPromoForm.watch("benefitType")}
                  onValueChange={(val: any) => createPromoForm.setValue("benefitType", val)}
                >
                  <SelectTrigger className="text-xs" data-testid="select-benefit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free_months">Meses Gratuitos</SelectItem>
                    <SelectItem value="percentage_discount">Porcentaje Descuento (%)</SelectItem>
                    <SelectItem value="fixed_discount">Descuento Fijo ($)</SelectItem>
                    <SelectItem value="permanent_free">Cortesía Permanente</SelectItem>
                    <SelectItem value="free">Acceso Gratuito Estándar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Valor del Beneficio</label>
                <Input
                  type="number"
                  placeholder="0"
                  {...createPromoForm.register("benefitValue")}
                  className="text-sm"
                  data-testid="input-benefit-value"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Duración (Meses)</label>
                <Input
                  type="number"
                  placeholder="Ej. 3 (opcional)"
                  {...createPromoForm.register("durationMonths")}
                  className="text-sm"
                  data-testid="input-duration-months"
                />
                <span className="text-[10px] text-muted-foreground">Vacío = sin plazo fijo</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Límite de Canjes (Máx.)</label>
                <Input
                  type="number"
                  placeholder="Ej. 50 (opcional)"
                  {...createPromoForm.register("maxUses")}
                  className="text-sm"
                  data-testid="input-max-uses"
                />
                <span className="text-[10px] text-muted-foreground">Vacío = ilimitado</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Alcance Objetivo</label>
                <Select
                  value={createPromoForm.watch("targetScope")}
                  onValueChange={(val: any) => createPromoForm.setValue("targetScope", val)}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global (Todos)</SelectItem>
                    <SelectItem value="broker">Brokers</SelectItem>
                    <SelectItem value="master_broker">Master Brokers</SelectItem>
                    <SelectItem value="alliance">Alianza Comercial</SelectItem>
                    <SelectItem value="campaign">Campaña Temporal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Fecha de Expiración</label>
                <Input
                  type="date"
                  {...createPromoForm.register("expiresAt")}
                  className="text-sm"
                  data-testid="input-expires-at"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setShowCreatePromoModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" data-testid="button-submit-promo">
                Guardar Código
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: VIEW PROMO REDEMPTIONS */}
      <Dialog open={Boolean(selectedPromoForRedemptions)} onOpenChange={(open) => !open && setSelectedPromoForRedemptions(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Canjes de: {selectedPromoForRedemptions?.code}
            </DialogTitle>
            <DialogDescription>
              {selectedPromoForRedemptions?.name} · Total de canjes: {selectedPromoForRedemptions?.currentUses}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-[160px]">
            {isLoadingRedemptions ? (
              <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Cargando canjes...
              </div>
            ) : promoRedemptions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                <Gift className="w-10 h-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm font-medium text-foreground">Ningún usuario ha canjeado este código aún.</p>
                <p className="text-xs text-muted-foreground mt-1">Los canjes aparecerán aquí cuando los colaboradores apliquen la promoción.</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b uppercase text-muted-foreground font-semibold">
                    <tr>
                      <th className="py-2.5 px-3 text-left">Usuario</th>
                      <th className="py-2.5 px-3 text-left">Email</th>
                      <th className="py-2.5 px-3 text-left">Rol</th>
                      <th className="py-2.5 px-3 text-left">Fecha Canje</th>
                      <th className="py-2.5 px-3 text-left">Vigencia</th>
                      <th className="py-2.5 px-3 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {promoRedemptions.map((r: any) => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-foreground">
                          {r.user ? `${r.user.firstName} ${r.user.lastName}` : "Usuario"}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground font-mono">
                          {r.user?.email || "-"}
                        </td>
                        <td className="py-2.5 px-3 capitalize">
                          {r.user?.role || "-"}
                        </td>
                        <td className="py-2.5 px-3">
                          {r.appliedAt ? format(new Date(r.appliedAt), "dd/MM/yyyy HH:mm") : "-"}
                        </td>
                        <td className="py-2.5 px-3">
                          {r.expiresAt ? format(new Date(r.expiresAt), "dd/MM/yyyy") : "Permanente"}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <DialogFooter className="pt-3 border-t">
            <Button variant="outline" size="sm" onClick={() => setSelectedPromoForRedemptions(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: EDIT USER ACCESS STATUS */}
      <Dialog open={Boolean(userToEditAccess)} onOpenChange={(open) => !open && setUserToEditAccess(null)}>
        <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Modificar Acceso Comercial
            </DialogTitle>
            <DialogDescription>
              {userToEditAccess?.firstName} {userToEditAccess?.lastName} ({userToEditAccess?.email})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Estado de Acceso Comercial</label>
              <Select value={accessStatusSelection} onValueChange={setAccessStatusSelection}>
                <SelectTrigger className="text-xs" data-testid="select-user-access-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Gratuito / Estándar</SelectItem>
                  <SelectItem value="promotional">Promocional</SelectItem>
                  <SelectItem value="trial">Periodo de Prueba</SelectItem>
                  <SelectItem value="active">Activo Comercial</SelectItem>
                  <SelectItem value="complimentary">Cortesía Permanente</SelectItem>
                  <SelectItem value="expired">Expirado / Finalizado</SelectItem>
                  <SelectItem value="suspended">Suspendido Comercial</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                * Nota: Incluso en estado "Expirado", la plataforma garantiza operatividad continua para colocación y comisiones.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Fecha de Expiración del Beneficio (Opcional)</label>
              <Input
                type="date"
                value={accessExpiresAtSelection}
                onChange={(e) => setAccessExpiresAtSelection(e.target.value)}
                className="text-xs"
                data-testid="input-user-access-expires"
              />
              <span className="text-[10px] text-muted-foreground">Vacío = sin expiración fijada</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Notas Administrativas</label>
              <Input
                placeholder="Ej. Promoción extendida por acuerdo comercial"
                value={accessNotesInput}
                onChange={(e) => setAccessNotesInput(e.target.value)}
                className="text-xs"
                data-testid="input-user-access-notes"
              />
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t">
              <Button type="button" variant="outline" onClick={() => setUserToEditAccess(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (userToEditAccess) {
                    updateUserAccessMutation.mutate({
                      userId: userToEditAccess.id,
                      accessStatus: accessStatusSelection,
                      expiresAt: accessExpiresAtSelection || null,
                      notes: accessNotesInput
                    });
                  }
                }}
                disabled={updateUserAccessMutation.isPending}
                data-testid="button-save-user-access"
              >
                {updateUserAccessMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Guardar Cambios
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CREATE MEMBER MODAL */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="p-6 pb-4 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-primary" />
                  Alta de Colaborador en {currentTenant?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Agrega un nuevo usuario con cuenta independiente y asigna sus facultades dentro de la organización.
                </DialogDescription>
              </div>
              {currentTenant && getTenantTypeBadge(currentTenant.type)}
            </div>
          </DialogHeader>

          <Form {...createMemberForm}>
            <form onSubmit={createMemberForm.handleSubmit((data) => createMemberMutation.mutate(data))} className="p-6 space-y-6">
              
              {/* Quick Presets Picker */}
              <div className="bg-muted/30 p-3.5 rounded-xl border border-border/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Plantillas Rápidas de Rol (1-Click)
                  </span>
                  <span className="text-xs text-muted-foreground">Autocompleta módulos y facultades</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ROLE_PRESETS.filter(p => isOwnerOrSuper || p.memberRole === 'member').map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPresetToCreate(preset)}
                      className={`text-left p-2.5 rounded-lg border transition-all text-xs flex flex-col justify-between ${
                        selectedPreset === preset.name
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border/60 bg-background hover:border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-semibold text-foreground flex items-center justify-between">
                        {preset.name}
                        <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/30 text-primary">
                          {preset.badge}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                        {preset.title}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <Tabs value={modalTab} onValueChange={setModalTab} className="w-full">
                <TabsList className="grid grid-cols-3 w-full bg-muted/50 p-1">
                  <TabsTrigger value="basic" className="text-xs font-medium">
                    1. Datos y Cargo
                  </TabsTrigger>
                  <TabsTrigger value="modules" className="text-xs font-medium flex items-center gap-1.5">
                    2. Módulos ({watchedCreateModules.length})
                  </TabsTrigger>
                  <TabsTrigger value="actions" className="text-xs font-medium flex items-center gap-1.5">
                    3. Acciones ({watchedCreateActions.length})
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: Basic */}
                <TabsContent value="basic" className="space-y-4 pt-4">
                  <FormField
                    control={createMemberForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold">Correo Electrónico (Login)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="email" 
                            placeholder="ejemplo@financiera.com"
                            className="h-10"
                            data-testid="input-member-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={createMemberForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Nombre(s)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Ej: Carlos"
                              className="h-10"
                              data-testid="input-member-firstname"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createMemberForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Apellido(s)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Ej: Mendoza"
                              className="h-10"
                              data-testid="input-member-lastname"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={createMemberForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Rol en la Organización</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-10" data-testid="select-member-role">
                                <SelectValue placeholder="Selecciona un rol interno" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {isOwnerOrSuper && (
                                <SelectItem value="owner">Propietario / Líder (Owner)</SelectItem>
                              )}
                              {isOwnerOrSuper && (
                                <SelectItem value="admin">Administrador (Admin)</SelectItem>
                              )}
                              <SelectItem value="member">Colaborador (Member)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-[11px]">
                            {isOwnerOrSuper 
                              ? "Nivel de gobierno interno dentro de esta organización." 
                              : "Solo puedes dar de alta colaboradores con rol Member."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createMemberForm.control}
                      name="customRoleTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Cargo / Puesto Personalizado</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Ej: Mesa de Control, Analista Sr."
                              className="h-10"
                              data-testid="input-member-custom-title"
                            />
                          </FormControl>
                          <FormDescription className="text-[11px]">
                            Nombre descriptivo visible en expedientes y dictámenes.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createMemberForm.control}
                      name="canOriginate"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between p-3.5 rounded-xl border border-border/80 bg-background/50">
                          <div className="space-y-0.5 pr-4">
                            <FormLabel className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              <Coins className="w-4 h-4 text-amber-500 inline" />
                              Facultad de Originación Comercial (Bróker)
                            </FormLabel>
                            <FormDescription className="text-[11px] text-muted-foreground leading-snug">
                              {field.value
                                ? "Permite al colaborador capturar expedientes y consultar sus comisiones generadas."
                                : "Personal operativo/analista (Mesa de Control) sin comisiones comerciales."}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={(val) => {
                                field.onChange(val);
                                if (!val) {
                                  const curMods = createMemberForm.getValues("modules") || [];
                                  createMemberForm.setValue("modules", curMods.filter(m => m !== 'comisiones'));
                                }
                              }}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Password / Invitation Option */}
                  <div className="p-4 bg-muted/30 rounded-xl border border-border/70 space-y-3">
                    <FormField
                      control={createMemberForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold flex items-center justify-between">
                            <span>Contraseña Inicial (Opcional)</span>
                            <span className="text-[11px] text-muted-foreground font-normal">
                              Si se omite, se genera enlace de activación
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="password"
                              placeholder="••••••••"
                              className="h-10"
                              data-testid="input-member-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createMemberForm.control}
                      name="sendInvite"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox 
                              checked={field.value} 
                              onCheckedChange={field.onChange} 
                            />
                          </FormControl>
                          <FormLabel className="text-xs font-normal cursor-pointer">
                            Enviar correo electrónico con enlace seguro para activar cuenta (válido 24 hrs)
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                {/* TAB 2: Modules */}
                <TabsContent value="modules" className="space-y-4 pt-4">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Acceso a Vistas y Módulos</h4>
                      <p className="text-xs text-muted-foreground">
                        Módulos delegables según el perfil de tu organización y originación comercial.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => createMemberForm.setValue("modules", getDelegableModules(watchedCreateCanOriginate).map(m => m.id))}
                        className="text-xs h-7"
                      >
                        Marcar Todos
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => createMemberForm.setValue("modules", [])}
                        className="text-xs h-7 text-muted-foreground"
                      >
                        Desmarcar
                      </Button>
                    </div>
                  </div>

                  {!watchedCreateCanOriginate && (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                      <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>El módulo de <strong>Comisiones</strong> está oculto porque este colaborador no tiene facultades de originación comercial (canOriginate = false).</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                    {getDelegableModules(watchedCreateCanOriginate).map((mod) => {
                      const isChecked = watchedCreateModules.includes(mod.id);
                      return (
                        <div
                          key={mod.id}
                          onClick={() => {
                            const current = createMemberForm.getValues("modules") || [];
                            createMemberForm.setValue(
                              "modules",
                              isChecked ? current.filter(id => id !== mod.id) : [...current, mod.id]
                            );
                          }}
                          className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-3 select-none ${
                            isChecked ? "bg-primary/5 border-primary/60 shadow-xs" : "bg-background border-border/60 hover:bg-muted/30"
                          }`}
                        >
                          <Checkbox checked={isChecked} className="mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                              <i className={`${mod.icon} text-primary text-[11px] w-4`} />
                              {mod.label}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                              {mod.desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>

                {/* TAB 3: Actions */}
                <TabsContent value="actions" className="space-y-4 pt-4">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Facultades Operativas</h4>
                      <p className="text-xs text-muted-foreground">
                        Restringe o concede facultades operativas (liquidar, dictaminar, exportar).
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => createMemberForm.setValue("actions", SYSTEM_ACTIONS.map(a => a.id))}
                        className="text-xs h-7"
                      >
                        Marcar Todas
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => createMemberForm.setValue("actions", [])}
                        className="text-xs h-7 text-muted-foreground"
                      >
                        Desmarcar
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {SYSTEM_ACTIONS.map((act) => {
                      const isChecked = watchedCreateActions.includes(act.id);
                      return (
                        <div
                          key={act.id}
                          onClick={() => {
                            const current = createMemberForm.getValues("actions") || [];
                            createMemberForm.setValue(
                              "actions",
                              isChecked ? current.filter(id => id !== act.id) : [...current, act.id]
                            );
                          }}
                          className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between select-none ${
                            isChecked ? "bg-primary/5 border-primary/60 shadow-xs" : "bg-background border-border/60 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox checked={isChecked} className="mt-0.5" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground">{act.label}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {act.category}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {act.desc}
                              </p>
                            </div>
                          </div>
                          {isChecked ? (
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-2" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 ml-2" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Buttons */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-xs text-muted-foreground">
                  Configurado: <strong className="text-foreground">{watchedCreateModules.length} módulos</strong> y <strong className="text-foreground">{watchedCreateActions.length} acciones</strong>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMemberMutation.isPending}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
                    data-testid="button-submit-create-member"
                  >
                    {createMemberMutation.isPending ? "Guardando..." : "Crear Colaborador"}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* EDIT MEMBER MODAL */}
      {editingMember && (
        <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
          <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 gap-0">
            <DialogHeader className="p-6 pb-4 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <Edit className="w-5 h-5 text-primary" />
                    Editar Colaborador: {editingMember.user?.firstName} {editingMember.user?.lastName}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-1">
                    {editingMember.user?.email} · Modifica su nivel de gobierno y facultades operativas.
                  </DialogDescription>
                </div>
                {getMemberRoleBadge(editingMember.role)}
              </div>
            </DialogHeader>

            <Form {...editMemberForm}>
              <form 
                onSubmit={editMemberForm.handleSubmit((data) => 
                  updateMemberMutation.mutate({ memberId: editingMember.id, data })
                )} 
                className="p-6 space-y-6"
              >
                {/* Presets */}
                <div className="bg-muted/30 p-3.5 rounded-xl border border-border/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      Plantillas Rápidas
                    </span>
                    <span className="text-xs text-muted-foreground">Reconfigurar facultades</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ROLE_PRESETS.filter(p => isOwnerOrSuper || p.memberRole === 'member').map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => applyPresetToEdit(preset)}
                        className={`text-left p-2.5 rounded-lg border transition-all text-xs flex flex-col justify-between ${
                          selectedPreset === preset.name
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border/60 bg-background hover:border-border hover:bg-muted/40"
                        }`}
                      >
                        <div className="font-semibold text-foreground flex items-center justify-between">
                          {preset.name}
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/30 text-primary">
                            {preset.badge}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                          {preset.title}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <Tabs value={modalTab} onValueChange={setModalTab} className="w-full">
                  <TabsList className="grid grid-cols-3 w-full bg-muted/50 p-1">
                    <TabsTrigger value="basic" className="text-xs font-medium">
                      1. Rol y Cargo
                    </TabsTrigger>
                    <TabsTrigger value="modules" className="text-xs font-medium flex items-center gap-1.5">
                      2. Módulos ({watchedEditModules.length})
                    </TabsTrigger>
                    <TabsTrigger value="actions" className="text-xs font-medium flex items-center gap-1.5">
                      3. Acciones ({watchedEditActions.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="basic" className="space-y-4 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={editMemberForm.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold">Rol en la Organización</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={!isOwnerOrSuper}>
                              <FormControl>
                                <SelectTrigger className="h-10">
                                  <SelectValue placeholder="Rol interno" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="owner">Propietario / Líder (Owner)</SelectItem>
                                <SelectItem value="admin">Administrador (Admin)</SelectItem>
                                <SelectItem value="member">Colaborador (Member)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-[11px]">
                              {!isOwnerOrSuper ? "Solo un propietario puede alterar roles de gobierno." : "Regulado por la regla del último propietario activo."}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={editMemberForm.control}
                        name="customRoleTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold">Cargo / Puesto Personalizado</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="Ej: Mesa de Control, Analista Sr."
                                className="h-10"
                              />
                            </FormControl>
                            <FormDescription className="text-[11px]">
                              Visible para clientes y equipo en expedientes.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={editMemberForm.control}
                      name="canOriginate"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-xs">
                          <div className="space-y-0.5">
                            <FormLabel className="text-xs font-semibold">Originador Comercial</FormLabel>
                            <FormDescription className="text-[11px]">
                              Si está activo, el colaborador puede originar créditos y tener acceso a sus comisiones.
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                if (!checked) {
                                  const currentMods = editMemberForm.getValues("modules") || [];
                                  editMemberForm.setValue("modules", currentMods.filter(m => m !== 'comisiones'));
                                }
                              }}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="modules" className="space-y-4 pt-4">
                    <div className="flex items-center justify-between pb-2 border-b">
                      <div>
                        <h4 className="text-sm font-bold text-foreground">Acceso a Vistas y Módulos</h4>
                        <p className="text-xs text-muted-foreground">
                          Módulos delegables según el perfil de tu organización y originación comercial.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => editMemberForm.setValue("modules", getDelegableModules(watchedEditCanOriginate).map(m => m.id))}
                          className="text-xs h-7"
                        >
                          Marcar Todos
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => editMemberForm.setValue("modules", [])}
                          className="text-xs h-7 text-muted-foreground"
                        >
                          Desmarcar
                        </Button>
                      </div>
                    </div>

                    {!watchedEditCanOriginate && (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                        <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>El módulo de <strong>Comisiones</strong> está oculto porque este colaborador no tiene facultades de originación comercial (canOriginate = false).</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                      {getDelegableModules(watchedEditCanOriginate).map((mod) => {
                        const isChecked = watchedEditModules.includes(mod.id);
                        return (
                          <div
                            key={mod.id}
                            onClick={() => {
                              const current = editMemberForm.getValues("modules") || [];
                              editMemberForm.setValue(
                                "modules",
                                isChecked ? current.filter(id => id !== mod.id) : [...current, mod.id]
                              );
                            }}
                            className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-3 select-none ${
                              isChecked ? "bg-primary/5 border-primary/60 shadow-xs" : "bg-background border-border/60 hover:bg-muted/30"
                            }`}
                          >
                            <Checkbox checked={isChecked} className="mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                <i className={`${mod.icon} text-primary text-[11px] w-4`} />
                                {mod.label}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                                {mod.desc}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>

                  <TabsContent value="actions" className="space-y-4 pt-4">
                    <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                      {SYSTEM_ACTIONS.map((act) => {
                        const isChecked = watchedEditActions.includes(act.id);
                        return (
                          <div
                            key={act.id}
                            onClick={() => {
                              const current = editMemberForm.getValues("actions") || [];
                              editMemberForm.setValue(
                                "actions",
                                isChecked ? current.filter(id => id !== act.id) : [...current, act.id]
                              );
                            }}
                            className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between select-none ${
                              isChecked ? "bg-primary/5 border-primary/60 shadow-xs" : "bg-background border-border/60 hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox checked={isChecked} className="mt-0.5" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-foreground">{act.label}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {act.category}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {act.desc}
                                </p>
                              </div>
                            </div>
                            {isChecked ? (
                              <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-2" />
                            ) : (
                              <Lock className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 ml-2" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-xs text-muted-foreground">
                    Configurado: <strong className="text-foreground">{watchedEditModules.length} módulos</strong> y <strong className="text-foreground">{watchedEditActions.length} acciones</strong>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingMember(null)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateMemberMutation.isPending}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
                    >
                      {updateMemberMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* TOGGLE MEMBER STATUS CONFIRMATION DIALOG */}
      {toggleDialog.show && toggleDialog.member && (
        <AlertDialog open={toggleDialog.show} onOpenChange={(open) => setToggleDialog({ show: open })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {toggleDialog.member.isActive ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    Desactivar Colaborador
                  </>
                ) : (
                  <>
                    <Power className="w-5 h-5 text-emerald-600" />
                    Activar Colaborador
                  </>
                )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {toggleDialog.member.isActive 
                  ? `¿Confirmas que deseas desactivar a ${toggleDialog.member.user?.firstName} ${toggleDialog.member.user?.lastName}? El usuario perderá acceso inmediato a esta organización. (Si es el último propietario activo, la operación será bloqueada por seguridad).`
                  : `¿Confirmas que deseas activar a ${toggleDialog.member.user?.firstName} ${toggleDialog.member.user?.lastName}? Podrá volver a operar en esta organización.`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => toggleDialog.member && toggleMemberStatusMutation.mutate(toggleDialog.member)}
                className={toggleDialog.member.isActive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-emerald-600 text-white hover:bg-emerald-700"}
              >
                {toggleDialog.member.isActive ? "Desactivar Membresía" : "Activar Membresía"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* INVITATION URL COPY DIALOG */}
      {inviteResultDialog.show && (
        <Dialog 
          open={inviteResultDialog.show} 
          onOpenChange={(open) => setInviteResultDialog({ show: open })}
        >
          <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                {inviteResultDialog.isNew ? "Colaborador Registrado con Éxito" : "Invitación Reenviada"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {inviteResultDialog.email && (
                  <span>Para: <strong>{inviteResultDialog.email}</strong> · </span>
                )}
                Puedes compartirle el enlace de activación directamente o esperar que lo reciba por correo.
              </DialogDescription>
            </DialogHeader>

            {inviteResultDialog.inviteUrl ? (
              <div className="space-y-3 py-2">
                <div className="text-xs font-semibold text-muted-foreground">
                  Enlace seguro de activación (válido 24 horas):
                </div>
                <div className="flex items-center gap-2">
                  <Input 
                    readOnly 
                    value={inviteResultDialog.inviteUrl} 
                    className="font-mono text-xs bg-muted/40 h-9 select-all"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (inviteResultDialog.inviteUrl) {
                        navigator.clipboard.writeText(inviteResultDialog.inviteUrl);
                        toast({
                          title: "Copiado al portapapeles",
                          description: "Enlace listo para enviar",
                        });
                      }
                    }}
                    className="shrink-0 h-9"
                  >
                    <Copy className="w-4 h-4 mr-1.5" />
                    Copiar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                El correo electrónico de activación ha sido enviado al destinatario.
              </p>
            )}

            <div className="flex justify-end pt-2">
              <Button 
                size="sm"
                onClick={() => setInviteResultDialog({ show: false })}
              >
                Entendido
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

    </MainLayout>
  );
}
