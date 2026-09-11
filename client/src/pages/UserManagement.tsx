import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  Lock
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
    title: "Administrador General",
    modules: ['dashboard', 'clientes', 'creditos', 'aprobaciones', 'comisiones', 'financieras', 'sistema_productos', 'red_brokers', 'documentos', 'reportes', 'importacion', 'usuarios'],
    actions: ['view', 'edit', 'submit_proposals', 'approve_disperse', 'manage_commissions', 'manage_users', 'export_reports'],
    adminOnly: true,
  },
  {
    name: "Mesa de Control",
    badge: "Operaciones",
    role: "broker",
    title: "Mesa de Control y Operaciones",
    modules: ['dashboard', 'clientes', 'creditos', 'aprobaciones', 'documentos', 'financieras', 'sistema_productos'],
    actions: ['view', 'edit', 'submit_proposals', 'export_reports'],
  },
  {
    name: "Analista de Crédito",
    badge: "Análisis",
    role: "broker",
    title: "Analista de Crédito",
    modules: ['dashboard', 'clientes', 'creditos', 'documentos', 'sistema_productos'],
    actions: ['view', 'edit', 'submit_proposals'],
  },
  {
    name: "Auditor Financiero",
    badge: "Finanzas",
    role: "broker",
    title: "Auditor Financiero",
    modules: ['dashboard', 'comisiones', 'reportes', 'aprobaciones'],
    actions: ['view', 'approve_disperse', 'export_reports'],
  },
  {
    name: "Master Bróker (Líder)",
    badge: "Líder de Red",
    role: "master_broker",
    title: "Master Broker (Líder de Franquicia)",
    modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'red_brokers', 'documentos', 'reportes', 'usuarios'],
    actions: ['view', 'edit', 'submit_proposals', 'manage_commissions', 'manage_users', 'export_reports'],
    adminOnly: true,
  },
  {
    name: "Bróker Originador",
    badge: "Comercial",
    role: "broker",
    title: "Bróker Originador",
    modules: ['dashboard', 'clientes', 'creditos', 'documentos', 'sistema_productos'],
    actions: ['view', 'edit', 'submit_proposals'],
  },
  {
    name: "Organización (Líder)",
    badge: "Empresa / Red",
    role: "master_broker",
    title: "Líder de Organización",
    modules: ['dashboard', 'clientes', 'creditos', 'comisiones', 'red_brokers', 'documentos', 'reportes', 'usuarios'],
    actions: ['view', 'edit', 'submit_proposals', 'manage_commissions', 'manage_users', 'export_reports'],
    adminOnly: true,
  },
  {
    name: "Bróker Independiente",
    badge: "Independiente",
    role: "broker",
    title: "Bróker Independiente",
    modules: ['dashboard', 'clientes', 'creditos', 'documentos', 'sistema_productos', 'comisiones'],
    actions: ['view', 'edit', 'submit_proposals'],
  },
];

const userFormSchema = z.object({
  email: z.string().email("Email inválido"),
  firstName: z.string().min(1, "Nombre requerido"),
  lastName: z.string().min(1, "Apellido requerido"),
  role: z.enum(["broker", "master_broker", "admin", "super_admin"]),
  customRoleTitle: z.string().optional(),
  masterBrokerId: z.string().optional(),
  referralCode: z.string().optional(),
  modules: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
});

type UserFormData = z.infer<typeof userFormSchema>;

type FilterRole = "all" | "broker" | "master_broker" | "admin" | "super_admin";
type FilterStatus = "all" | "active" | "inactive";

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState<FilterRole>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("active");
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [toggleDialog, setToggleDialog] = useState<{ show: boolean; user?: User }>({ show: false });
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<string>("basic");
  
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const isMasterBroker = currentUser?.role === 'master_broker';
  const canManage = isAdmin || isMasterBroker;

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: canManage,
  });

  const { data: masterBrokers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
    select: (data) => data?.filter(u => u.role === 'master_broker') || [],
  });

  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "broker",
      customRoleTitle: "",
      masterBrokerId: "",
      modules: ['dashboard', 'clientes', 'creditos', 'documentos'],
      actions: ['view', 'edit', 'submit_proposals'],
    },
  });

  const watchedRole = form.watch("role");
  const watchedModules = form.watch("modules") || [];
  const watchedActions = form.watch("actions") || [];

  const createUserMutation = useMutation({
    mutationFn: async (formData: UserFormData) => {
      const payload: any = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        customRoleTitle: formData.customRoleTitle || undefined,
        masterBrokerId: isMasterBroker ? currentUser?.id : (formData.masterBrokerId || undefined),
        permissions: {
          modules: formData.modules,
          actions: formData.actions,
          scope: isMasterBroker ? 'network' : (formData.role === 'super_admin' ? 'global' : 'standard'),
        },
      };
      const response = await apiRequest("POST", "/api/users", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Usuario creado",
        description: "El perfil y permisos han sido configurados correctamente",
      });
      setShowUserModal(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error al crear usuario",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: Partial<UserFormData> }) => {
      const payload: any = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        customRoleTitle: formData.customRoleTitle || undefined,
      };

      if (!isMasterBroker && formData.role) {
        payload.role = formData.role;
        payload.masterBrokerId = formData.masterBrokerId || null;
      }

      if (formData.modules || formData.actions) {
        payload.permissions = {
          modules: formData.modules || [],
          actions: formData.actions || [],
          scope: isMasterBroker ? 'network' : (formData.role === 'super_admin' ? 'global' : 'standard'),
        };
      }

      const response = await apiRequest("PATCH", `/api/users/${id}`, payload);
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users"], refetchType: 'all' });
      toast({
        title: "Usuario actualizado",
        description: "Los cambios en el perfil y permisos han sido guardados",
      });
      setShowUserModal(false);
      setEditingUser(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error al actualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("PATCH", `/api/users/${userId}/toggle-status`, {});
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users"], refetchType: 'all' });
      toast({
        title: "Estado actualizado",
        description: "El estado del usuario ha sido actualizado",
      });
      setToggleDialog({ show: false });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const applyPreset = (preset: typeof ROLE_PRESETS[0]) => {
    setSelectedPreset(preset.name);
    form.setValue("customRoleTitle", preset.title);
    if (!isMasterBroker) {
      form.setValue("role", preset.role as any);
    }
    form.setValue("modules", [...preset.modules]);
    form.setValue("actions", [...preset.actions]);
    toast({
      title: `Plantilla aplicada: ${preset.name}`,
      description: `Módulos (${preset.modules.length}) y acciones (${preset.actions.length}) configurados automáticamente.`,
    });
  };

  const toggleAllModules = (select: boolean) => {
    if (select) {
      form.setValue("modules", SYSTEM_MODULES.map(m => m.id));
    } else {
      form.setValue("modules", []);
    }
  };

  const toggleAllActions = (select: boolean) => {
    if (select) {
      form.setValue("actions", SYSTEM_ACTIONS.map(a => a.id));
    } else {
      form.setValue("actions", []);
    }
  };

  const handleNewUser = () => {
    setEditingUser(null);
    setSelectedPreset(null);
    setModalTab("basic");
    form.reset({
      email: "",
      firstName: "",
      lastName: "",
      role: "broker",
      customRoleTitle: "",
      masterBrokerId: isMasterBroker ? currentUser?.id : "",
      modules: ['dashboard', 'clientes', 'creditos', 'documentos'],
      actions: ['view', 'edit', 'submit_proposals'],
    });
    setShowUserModal(true);
  };

  const handleEditUser = (targetUser: User) => {
    setEditingUser(targetUser);
    setSelectedPreset(null);
    setModalTab("basic");
    const perms = (targetUser.permissions as any) || {};
    const currentModules = Array.isArray(perms.modules) ? perms.modules : ['dashboard', 'clientes', 'creditos'];
    const currentActions = Array.isArray(perms.actions) ? perms.actions : ['view', 'edit'];

    form.reset({
      email: targetUser.email || "",
      firstName: targetUser.firstName || "",
      lastName: targetUser.lastName || "",
      role: targetUser.role as any,
      customRoleTitle: targetUser.customRoleTitle || "",
      masterBrokerId: targetUser.masterBrokerId || "",
      modules: currentModules,
      actions: currentActions,
    });
    setShowUserModal(true);
  };

  const handleSubmit = (data: UserFormData) => {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, formData: data });
    } else {
      createUserMutation.mutate(data);
    }
  };

  const handleToggleStatus = (targetUser: User) => {
    setToggleDialog({ show: true, user: targetUser });
  };

  const confirmToggleStatus = () => {
    if (toggleDialog.user) {
      toggleStatusMutation.mutate(toggleDialog.user.id);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border-purple-300";
      case "admin":
        return "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200 border-red-300";
      case "master_broker":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border-blue-300";
      case "broker":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border-emerald-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "super_admin":
        return "Super Admin";
      case "admin":
        return "Admin Plataforma";
      case "master_broker":
        return "Master Broker";
      case "broker":
        return "Broker";
      default:
        return role;
    }
  };

  const filteredUsers = users?.filter(u => {
    const matchesSearch = 
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.customRoleTitle && u.customRoleTitle.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesRole = filterRole === "all" || u.role === filterRole;
    const matchesStatus = 
      filterStatus === "all" || 
      (filterStatus === "active" && u.isActive) ||
      (filterStatus === "inactive" && !u.isActive);
    
    return matchesSearch && matchesRole && matchesStatus;
  }) || [];

  if (!canManage) {
    return (
      <MainLayout>
        <Header 
          title="Gestión de Usuarios y Accesos"
          subtitle="Administra los usuarios y permisos de la plataforma"
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Acceso Restringido
              </h3>
              <p className="text-muted-foreground">
                Esta funcionalidad requiere privilegios de Administrador o Master Broker.
              </p>
            </CardContent>
          </Card>
        </main>
      </MainLayout>
    );
  }

  if (isLoading) {
    return (
      <MainLayout>
        <Header 
          title="Gestión de Usuarios y Accesos"
          subtitle="Administra los usuarios y permisos de la plataforma"
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </main>
      </MainLayout>
    );
  }

  const activeUsers = users?.filter(u => u.isActive).length || 0;
  const totalBrokers = users?.filter(u => u.role === 'broker').length || 0;
  const totalMasterBrokers = users?.filter(u => u.role === 'master_broker').length || 0;

  return (
    <MainLayout>
      <Header 
        title={isMasterBroker ? "Mi Equipo y Brókers de Red" : "Gestión de Usuarios y Accesos"}
        subtitle={
          isMasterBroker 
            ? "Administra tu equipo de colaboradores (Mesa de Control, Analistas) y brókers de tu franquicia" 
            : "Control de identidades, perfiles granulares y permisos de acceso al sistema"
        }
      >
        <Button
          onClick={handleNewUser}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm ml-3"
          data-testid="button-new-user"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          {isMasterBroker ? "Nuevo Colaborador / Bróker" : "Nuevo Usuario"}
        </Button>
      </Header>
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto space-y-6">
        {/* Top Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Registrados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-extrabold">{users?.length || 0}</div>
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                  <Users className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Usuarios Activos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-extrabold text-emerald-600">{activeUsers}</div>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                  <Power className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Brókers / Ejecutivos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-extrabold">{totalBrokers}</div>
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                  <Building2 className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isMasterBroker ? "Mi Franquicia" : "Master Brókers"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-extrabold">{isMasterBroker ? 1 : totalMasterBrokers}</div>
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                  <ShieldCheck className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters Bar */}
        <Card className="border border-border/60 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, email o puesto personalizado..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-10"
                  data-testid="input-search-users"
                />
              </div>

              {!isMasterBroker && (
                <Select value={filterRole} onValueChange={(value) => setFilterRole(value as FilterRole)}>
                  <SelectTrigger className="w-full md:w-48 h-10" data-testid="select-filter-role">
                    <SelectValue placeholder="Filtrar por rol base" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los roles</SelectItem>
                    <SelectItem value="broker">Broker</SelectItem>
                    <SelectItem value="master_broker">Master Broker</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              )}

              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as FilterStatus)}>
                <SelectTrigger className="w-full md:w-40 h-10" data-testid="select-filter-status">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="inactive">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="border border-border/60 shadow-sm">
          <CardHeader className="py-4 px-6 border-b flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">Usuarios Registrados</CardTitle>
              <Badge variant="secondary" className="font-mono text-xs">{filteredUsers.length}</Badge>
            </div>
            <div className="text-xs text-muted-foreground hidden sm:block">
              Control granular de módulos y acciones activas
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-16">
                <Users className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                <h4 className="text-sm font-semibold">No se encontraron usuarios</h4>
                <p className="text-xs text-muted-foreground mt-1">Prueba ajustando los filtros de búsqueda</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="py-3 px-6 text-left font-semibold">Usuario</th>
                      <th className="py-3 px-4 text-left font-semibold">Email</th>
                      <th className="py-3 px-4 text-left font-semibold">Rol / Puesto</th>
                      <th className="py-3 px-4 text-left font-semibold">Permisos Granulares</th>
                      {!isMasterBroker && <th className="py-3 px-4 text-left font-semibold">Red / Franquicia</th>}
                      <th className="py-3 px-4 text-left font-semibold">Estado</th>
                      <th className="py-3 px-4 text-left font-semibold">Registro</th>
                      <th className="py-3 px-6 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredUsers.map((u) => {
                      const perms = (u.permissions as any) || {};
                      const modCount = Array.isArray(perms.modules) ? perms.modules.length : 0;
                      const actCount = Array.isArray(perms.actions) ? perms.actions.length : 0;
                      const isFull = u.role === 'super_admin' || modCount === SYSTEM_MODULES.length;

                      return (
                        <tr 
                          key={u.id} 
                          className="hover:bg-muted/30 transition-colors"
                          data-testid={`row-user-${u.id}`}
                        >
                          <td className="py-3.5 px-6 font-medium">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                {(u.firstName?.[0] || 'U').toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-foreground">
                                  {u.firstName} {u.lastName}
                                </div>
                                <div className="text-xs text-muted-foreground sm:hidden">
                                  {u.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-muted-foreground font-mono text-xs">
                            {u.email}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-col gap-1 items-start">
                              <Badge variant="outline" className={`text-xs px-2 py-0.5 border ${getRoleBadgeColor(u.role)}`}>
                                {getRoleLabel(u.role)}
                              </Badge>
                              {u.customRoleTitle && (
                                <span className="text-xs font-medium text-primary flex items-center gap-1 bg-primary/5 px-2 py-0.5 rounded border border-primary/20">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  {u.customRoleTitle}
                                </span>
                              )}
                              {(u as any).referralCode && (
                                <span className="text-xs font-mono font-medium text-amber-700 dark:text-amber-300 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-300/40" title="Clave de Franquicia para afiliar brokers">
                                  <Key className="w-2.5 h-2.5" />
                                  Clave: {(u as any).referralCode}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {isFull ? (
                              <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-300 text-xs">
                                <Key className="w-3 h-3 mr-1" />
                                Acceso Total (12/12)
                              </Badge>
                            ) : (
                              <div className="flex flex-wrap gap-1 items-center">
                                <Badge variant="secondary" className="text-xs">
                                  <Layers className="w-3 h-3 mr-1 text-muted-foreground" />
                                  {modCount} mód.
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  <Shield className="w-3 h-3 mr-1 text-muted-foreground" />
                                  {actCount} acc.
                                </Badge>
                              </div>
                            )}
                          </td>

                          {!isMasterBroker && (
                            <td className="py-3.5 px-4 text-muted-foreground text-xs">
                              {u.masterBrokerId ? (
                                <span className="font-medium text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-1 rounded">
                                  {users?.find(mb => mb.id === u.masterBrokerId)?.firstName || 'Franquicia'}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/60">Directo (Plataforma)</span>
                              )}
                            </td>
                          )}

                          <td className="py-3.5 px-4">
                            <Badge 
                              variant="outline"
                              className={`text-xs px-2 py-0.5 ${
                                u.isActive 
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300" 
                                  : "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300"
                              }`}
                            >
                              {u.isActive ? "Activo" : "Inactivo"}
                            </Badge>
                          </td>

                          <td className="py-3.5 px-4 text-muted-foreground text-xs whitespace-nowrap">
                            {u.createdAt ? format(new Date(u.createdAt), "dd MMM yyyy", { locale: es }) : "-"}
                          </td>

                          <td className="py-3.5 px-6 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditUser(u)}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                                title="Editar perfil y permisos"
                                data-testid={`button-edit-user-${u.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleStatus(u)}
                                className={`h-8 w-8 p-0 ${
                                  u.isActive 
                                    ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40" 
                                    : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                }`}
                                title={u.isActive ? "Desactivar usuario" : "Activar usuario"}
                                data-testid={`button-toggle-status-${u.id}`}
                              >
                                <Power className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* User Create / Edit Granular Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="p-6 pb-4 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  {editingUser ? "Configurar Perfil y Permisos" : "Alta de Nuevo Usuario / Colaborador"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Define el puesto, rol operativo y asigna con precisión a qué módulos puede ingresar y qué acciones puede ejecutar.
                </DialogDescription>
              </div>
              {editingUser && (
                <Badge variant="outline" className="text-xs font-mono">
                  ID: {editingUser.id.slice(0, 8)}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="p-6 space-y-6">
              
              {/* Presets Quick Picker */}
              <div className="bg-muted/30 p-3.5 rounded-xl border border-border/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Plantillas Rápidas de Rol (1-Click Presets)
                  </span>
                  <span className="text-xs text-muted-foreground">Autocompleta módulos y facultades</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ROLE_PRESETS.filter(p => !isMasterBroker || !p.adminOnly).map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
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

              {/* Tabs for Granular Configuration */}
              <Tabs value={modalTab} onValueChange={setModalTab} className="w-full">
                <TabsList className="grid grid-cols-3 w-full bg-muted/50 p-1">
                  <TabsTrigger value="basic" className="text-xs font-medium">
                    1. Datos y Puesto
                  </TabsTrigger>
                  <TabsTrigger value="modules" className="text-xs font-medium flex items-center gap-1.5">
                    2. ¿Dónde ingresa? ({watchedModules.length})
                  </TabsTrigger>
                  <TabsTrigger value="actions" className="text-xs font-medium flex items-center gap-1.5">
                    3. ¿Qué puede hacer? ({watchedActions.length})
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: Basic Information & Custom Title */}
                <TabsContent value="basic" className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
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
                            data-testid="input-user-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Nombre(s)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Ej: Carlos"
                              className="h-10"
                              data-testid="input-user-firstname"
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
                          <FormLabel className="text-xs font-semibold">Apellido(s)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Ej: Mendoza"
                              className="h-10"
                              data-testid="input-user-lastname"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="customRoleTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold flex items-center justify-between">
                            <span>Título / Puesto Personalizado</span>
                            <span className="text-[11px] text-muted-foreground font-normal">Visible en la plataforma</span>
                          </FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="Ej: Mesa de Control, Analista Sr., Auditor"
                              className="h-10"
                              data-testid="input-custom-role-title"
                            />
                          </FormControl>
                          <FormDescription className="text-[11px]">
                            Nombre comercial del puesto para tu organigrama y equipo.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {!isMasterBroker ? (
                      <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold">Nivel Base del Sistema</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-10" data-testid="select-user-role">
                                  <SelectValue placeholder="Selecciona un rol base" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="broker">Broker / Colaborador Operativo</SelectItem>
                                <SelectItem value="master_broker">Master Broker (Líder Franquicia)</SelectItem>
                                <SelectItem value="admin">Admin Plataforma</SelectItem>
                                <SelectItem value="super_admin">Super Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-[11px]">
                              Determina la jerarquía y pertenencia estructural.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <div className="p-3 bg-muted/40 rounded-lg border flex flex-col justify-center">
                        <span className="text-xs font-semibold text-foreground">Pertenencia de Red</span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          Colaborador adscrito a tu franquicia: <strong>{currentUser?.firstName} {currentUser?.lastName}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {!isMasterBroker && watchedRole === "broker" && masterBrokers && masterBrokers.length > 0 && (
                    <FormField
                      control={form.control}
                      name="masterBrokerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold">Master Broker Responsable (Opcional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger className="h-10" data-testid="select-master-broker">
                                <SelectValue placeholder="Directo Plataforma (Sin Master Broker)" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">Directo Plataforma (Sin Master Broker)</SelectItem>
                              {masterBrokers.map((mb) => (
                                <SelectItem key={mb.id} value={mb.id}>
                                  {mb.firstName} {mb.lastName} ({mb.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-[11px]">
                            Si se asigna, el bróker pertenecerá a la subred de dicho Master Broker.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </TabsContent>

                {/* TAB 2: Modules Selection ("¿Dónde puede ingresar?") */}
                <TabsContent value="modules" className="space-y-4 pt-4">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Acceso a Vistas y Módulos</h4>
                      <p className="text-xs text-muted-foreground">
                        El usuario solo verá en su menú lateral los módulos que selecciones aquí.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAllModules(true)}
                        className="text-xs h-7"
                      >
                        Marcar Todos
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAllModules(false)}
                        className="text-xs h-7 text-muted-foreground"
                      >
                        Desmarcar
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                    {SYSTEM_MODULES.map((mod) => {
                      const isChecked = watchedModules.includes(mod.id);
                      return (
                        <div
                          key={mod.id}
                          onClick={() => {
                            const current = form.getValues("modules") || [];
                            if (isChecked) {
                              form.setValue("modules", current.filter(id => id !== mod.id));
                            } else {
                              form.setValue("modules", [...current, mod.id]);
                            }
                          }}
                          className={`p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-3 select-none ${
                            isChecked
                              ? "bg-primary/5 border-primary/60 shadow-xs"
                              : "bg-background border-border/60 hover:bg-muted/30"
                          }`}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              const current = form.getValues("modules") || [];
                              if (checked) {
                                form.setValue("modules", [...current, mod.id]);
                              } else {
                                form.setValue("modules", current.filter(id => id !== mod.id));
                              }
                            }}
                            className="mt-0.5"
                          />
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

                {/* TAB 3: Actions Permissions ("¿Qué puede hacer?") */}
                <TabsContent value="actions" className="space-y-4 pt-4">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Facultades Operativas y Acciones</h4>
                      <p className="text-xs text-muted-foreground">
                        Restringe o concede facultades como liquidar comisiones, exportar auditorías o alterar datos.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleAllActions(true)}
                        className="text-xs h-7"
                      >
                        Marcar Todas
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAllActions(false)}
                        className="text-xs h-7 text-muted-foreground"
                      >
                        Desmarcar
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                    {SYSTEM_ACTIONS.map((act) => {
                      const isChecked = watchedActions.includes(act.id);
                      return (
                        <div
                          key={act.id}
                          onClick={() => {
                            const current = form.getValues("actions") || [];
                            if (isChecked) {
                              form.setValue("actions", current.filter(id => id !== act.id));
                            } else {
                              form.setValue("actions", [...current, act.id]);
                            }
                          }}
                          className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between select-none ${
                            isChecked
                              ? "bg-primary/5 border-primary/60 shadow-xs"
                              : "bg-background border-border/60 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const current = form.getValues("actions") || [];
                                if (checked) {
                                  form.setValue("actions", [...current, act.id]);
                                } else {
                                  form.setValue("actions", current.filter(id => id !== act.id));
                                }
                              }}
                              className="mt-0.5"
                            />
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

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-xs text-muted-foreground">
                  Configurado: <strong className="text-foreground">{watchedModules.length} módulos</strong> y <strong className="text-foreground">{watchedActions.length} acciones</strong>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowUserModal(false);
                      setEditingUser(null);
                      form.reset();
                    }}
                    data-testid="button-cancel-user"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createUserMutation.isPending || updateUserMutation.isPending}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
                    data-testid="button-submit-user"
                  >
                    {createUserMutation.isPending || updateUserMutation.isPending ? (
                      "Guardando..."
                    ) : editingUser ? (
                      "Guardar Cambios"
                    ) : (
                      "Crear Usuario"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Toggle Status Confirmation Dialog */}
      {toggleDialog.show && toggleDialog.user && (
        <AlertDialog open={toggleDialog.show} onOpenChange={(open) => setToggleDialog({ show: open })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {toggleDialog.user.isActive ? "Desactivar Usuario" : "Activar Usuario"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {toggleDialog.user.isActive 
                  ? `¿Estás seguro de desactivar a ${toggleDialog.user.firstName} ${toggleDialog.user.lastName}? El usuario perderá el acceso inmediato a la plataforma.`
                  : `¿Estás seguro de activar a ${toggleDialog.user.firstName} ${toggleDialog.user.lastName}? El usuario podrá ingresar nuevamente con sus credenciales.`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-toggle">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmToggleStatus}
                className={toggleDialog.user.isActive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-emerald-600 text-white hover:bg-emerald-700"}
                data-testid="button-confirm-toggle"
              >
                {toggleDialog.user.isActive ? "Desactivar" : "Activar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </MainLayout>
  );
}
