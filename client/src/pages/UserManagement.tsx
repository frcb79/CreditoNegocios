import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { UserPlus, Edit, Power, Search, Users, Shield } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

const userFormSchema = z.object({
  email: z.string().email("Email inválido"),
  firstName: z.string().min(1, "Nombre requerido"),
  lastName: z.string().min(1, "Apellido requerido"),
  role: z.enum(["broker", "master_broker", "admin", "super_admin"]),
  masterBrokerId: z.string().optional(),
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
  
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  // Check admin access
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
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
      masterBrokerId: "",
    },
  });

  const watchedRole = form.watch("role");

  const createUserMutation = useMutation({
    mutationFn: async (userData: UserFormData) => {
      const response = await apiRequest("POST", "/api/users", userData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Usuario creado",
        description: "El usuario ha sido creado exitosamente",
      });
      setShowUserModal(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserFormData> }) => {
      const response = await apiRequest("PATCH", `/api/users/${id}`, data);
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users"], refetchType: 'all' });
      toast({
        title: "Usuario actualizado",
        description: "Los cambios han sido guardados",
      });
      setShowUserModal(false);
      setEditingUser(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
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

  const handleNewUser = () => {
    setEditingUser(null);
    form.reset({
      email: "",
      firstName: "",
      lastName: "",
      role: "broker",
      masterBrokerId: "",
    });
    setShowUserModal(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    form.reset({
      email: user.email || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      role: user.role as "broker" | "master_broker" | "admin" | "super_admin",
      masterBrokerId: user.masterBrokerId || "",
    });
    setShowUserModal(true);
  };

  const handleSubmit = (data: UserFormData) => {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, data });
    } else {
      createUserMutation.mutate(data);
    }
  };

  const handleToggleStatus = (user: User) => {
    setToggleDialog({ show: true, user });
  };

  const confirmToggleStatus = () => {
    if (toggleDialog.user) {
      toggleStatusMutation.mutate(toggleDialog.user.id);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
      case "super_admin":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100";
      case "master_broker":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100";
      case "broker":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "super_admin":
        return "Super Admin";
      case "admin":
        return "Admin";
      case "master_broker":
        return "Master Broker";
      case "broker":
        return "Broker";
      default:
        return role;
    }
  };

  const filteredUsers = users?.filter(user => {
    const matchesSearch = 
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === "all" || user.role === filterRole;
    const matchesStatus = 
      filterStatus === "all" || 
      (filterStatus === "active" && user.isActive) ||
      (filterStatus === "inactive" && !user.isActive);
    
    return matchesSearch && matchesRole && matchesStatus;
  }) || [];

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Gestión de Usuarios"
            subtitle="Administra los usuarios de la plataforma"
          />
          
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <Card>
              <CardContent className="p-12">
                <div className="text-center">
                  <Shield className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Acceso Restringido
                  </h3>
                  <p className="text-neutral">
                    Esta funcionalidad está disponible solo para administradores.
                  </p>
                </div>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Gestión de Usuarios"
            subtitle="Administra los usuarios de la plataforma"
          />
          
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  const activeUsers = users?.filter(u => u.isActive).length || 0;
  const totalBrokers = users?.filter(u => u.role === 'broker').length || 0;
  const totalMasterBrokers = users?.filter(u => u.role === 'master_broker').length || 0;

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Gestión de Usuarios"
          subtitle="Administra los usuarios de la plataforma"
        >
          <Button
            onClick={handleNewUser}
            className="bg-blue-600 hover:bg-blue-700 ml-3"
            data-testid="button-new-user"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Nuevo Usuario
          </Button>
        </Header>
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-neutral">
                  Total Usuarios
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-blue-600 mr-3" />
                  <div className="text-3xl font-bold">{users?.length || 0}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-neutral">
                  Usuarios Activos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Power className="h-8 w-8 text-green-600 mr-3" />
                  <div className="text-3xl font-bold">{activeUsers}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-neutral">
                  Brokers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-green-600 mr-3" />
                  <div className="text-3xl font-bold">{totalBrokers}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-neutral">
                  Master Brokers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center">
                  <Shield className="h-8 w-8 text-blue-600 mr-3" />
                  <div className="text-3xl font-bold">{totalMasterBrokers}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-neutral" />
                    <Input
                      placeholder="Buscar por nombre o email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-users"
                    />
                  </div>
                </div>

                <Select value={filterRole} onValueChange={(value) => setFilterRole(value as FilterRole)}>
                  <SelectTrigger className="w-48" data-testid="select-filter-role">
                    <SelectValue placeholder="Filtrar por rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los roles</SelectItem>
                    <SelectItem value="broker">Broker</SelectItem>
                    <SelectItem value="master_broker">Master Broker</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as FilterStatus)}>
                  <SelectTrigger className="w-48" data-testid="select-filter-status">
                    <SelectValue placeholder="Filtrar por estado" />
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
          <Card>
            <CardHeader>
              <CardTitle>Usuarios ({filteredUsers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-neutral">No se encontraron usuarios</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr className="text-left text-sm text-neutral">
                        <th className="pb-3 font-medium">Usuario</th>
                        <th className="pb-3 font-medium">Email</th>
                        <th className="pb-3 font-medium">Rol</th>
                        <th className="pb-3 font-medium">Master Broker</th>
                        <th className="pb-3 font-medium">Estado</th>
                        <th className="pb-3 font-medium">Fecha Registro</th>
                        <th className="pb-3 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr 
                          key={user.id} 
                          className="border-b last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800"
                          data-testid={`row-user-${user.id}`}
                        >
                          <td className="py-4">
                            <div className="font-medium">
                              {user.firstName} {user.lastName}
                            </div>
                          </td>
                          <td className="py-4 text-neutral">
                            {user.email}
                          </td>
                          <td className="py-4">
                            <Badge className={getRoleBadgeColor(user.role)}>
                              {getRoleLabel(user.role)}
                            </Badge>
                          </td>
                          <td className="py-4 text-neutral">
                            {user.masterBrokerId ? (
                              <span className="text-sm">
                                {users?.find(u => u.id === user.masterBrokerId)?.firstName || 'N/A'}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-4">
                            <Badge 
                              className={user.isActive 
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" 
                                : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100"
                              }
                            >
                              {user.isActive ? "Activo" : "Inactivo"}
                            </Badge>
                          </td>
                          <td className="py-4 text-neutral text-sm">
                            {user.createdAt ? format(new Date(user.createdAt), "dd MMM yyyy", { locale: es }) : "-"}
                          </td>
                          <td className="py-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditUser(user)}
                                data-testid={`button-edit-user-${user.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleStatus(user)}
                                className={user.isActive ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"}
                                data-testid={`button-toggle-status-${user.id}`}
                              >
                                <Power className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        {/* User Form Modal */}
        <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingUser ? "Editar Usuario" : "Nuevo Usuario"}
              </DialogTitle>
              <DialogDescription>
                {editingUser 
                  ? "Modifica los datos del usuario" 
                  : "Crea un nuevo usuario en la plataforma"
                }
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="email" 
                          placeholder="usuario@ejemplo.com"
                          data-testid="input-user-email"
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
                        <FormLabel>Nombre</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Juan"
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
                        <FormLabel>Apellido</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Pérez"
                            data-testid="input-user-lastname"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rol</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-user-role">
                            <SelectValue placeholder="Selecciona un rol" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="broker">Broker</SelectItem>
                          <SelectItem value="master_broker">Master Broker</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedRole === "broker" && masterBrokers && masterBrokers.length > 0 && (
                  <FormField
                    control={form.control}
                    name="masterBrokerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Master Broker (Opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger data-testid="select-master-broker">
                              <SelectValue placeholder="Ninguno" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {masterBrokers.map((mb) => (
                              <SelectItem key={mb.id} value={mb.id}>
                                {mb.firstName} {mb.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex justify-end gap-3 pt-4">
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
                    data-testid="button-submit-user"
                  >
                    {editingUser ? "Guardar Cambios" : "Crear Usuario"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Toggle Status Confirmation */}
        {toggleDialog.show && toggleDialog.user && (
          <AlertDialog open={toggleDialog.show} onOpenChange={(open) => setToggleDialog({ show: open })}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {toggleDialog.user.isActive ? "Desactivar Usuario" : "Activar Usuario"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {toggleDialog.user.isActive 
                    ? `¿Estás seguro de desactivar a ${toggleDialog.user.firstName} ${toggleDialog.user.lastName}? El usuario no podrá acceder a la plataforma.`
                    : `¿Estás seguro de activar a ${toggleDialog.user.firstName} ${toggleDialog.user.lastName}? El usuario podrá acceder nuevamente a la plataforma.`
                  }
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-toggle">
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction 
                  onClick={confirmToggleStatus}
                  data-testid="button-confirm-toggle"
                >
                  {toggleDialog.user.isActive ? "Desactivar" : "Activar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
