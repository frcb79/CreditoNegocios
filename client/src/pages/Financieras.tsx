import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { FinancialInstitution, InstitutionProductWithTemplate } from "@shared/schema";
import NewFinancieraModal from "@/components/Modals/NewFinancieraModal";
import RequestInstitutionModal from "@/components/Modals/RequestInstitutionModal";
import ProductConfigurationModal from "@/components/Modals/ProductConfigurationModal";
import { 
  Building2, 
  Search, 
  Plus, 
  Send, 
  MoreHorizontal, 
  Settings, 
  Pause, 
  Play, 
  Trash2, 
  Eye, 
  Layers,
  ArrowRight,
  DollarSign,
  TrendingUp,
  CreditCard
} from "lucide-react";
import { cn } from "@/lib/utils";

type FilterType = 'all' | 'active' | 'inactive';

export default function Financieras() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>('active');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [configModal, setConfigModal] = useState<{ show: boolean; financiera?: FinancialInstitution }>({ show: false });
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; financiera?: FinancialInstitution }>({ show: false });
  const [deleteDialog, setDeleteDialog] = useState<{ show: boolean; financiera?: FinancialInstitution }>({ show: false });
  const { toast } = useToast();
  const { user } = useAuth();
  
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isBroker = user?.role === 'broker' || user?.role === 'master_broker';

  // Delete financial institution permanently
  const deleteMutation = useMutation({
    mutationFn: async (institutionId: string) => {
      const response = await fetch(`/api/financial-institutions/${institutionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Error al eliminar financiera');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-institutions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/institution-products"] });
      toast({
        title: "Financiera eliminada",
        description: data.message || "Institución eliminada exitosamente.",
      });
      setDeleteDialog({ show: false });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "No se pudo eliminar la financiera.",
        variant: "destructive",
      });
    },
  });

  const { data: financialInstitutions, isLoading: institutionsLoading } = useQuery<FinancialInstitution[]>({
    queryKey: ["/api/financial-institutions"],
  });

  const { data: institutionProducts = [] } = useQuery<InstitutionProductWithTemplate[]>({
    queryKey: ["/api/institution-products"],
  });

  // Toggle status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async (institutionId: string) => {
      const response = await fetch(`/api/financial-institutions/${institutionId}/toggle-status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al actualizar estado');
      }
      
      return response.json();
    },
    onSuccess: (updatedInstitution) => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-institutions"] });
      
      if (!updatedInstitution.isActive && activeFilter === 'active') {
        setActiveFilter('all');
        toast({
          title: "Estado actualizado",
          description: `${updatedInstitution.name} ha sido desactivada exitosamente.`,
        });
      } else if (updatedInstitution.isActive && activeFilter === 'inactive') {
        setActiveFilter('all');
        toast({
          title: "Estado actualizado",
          description: `${updatedInstitution.name} ha sido activada exitosamente.`,
        });
      } else {
        toast({
          title: "Estado actualizado",
          description: `${updatedInstitution.name} ha sido ${updatedInstitution.isActive ? 'activada' : 'desactivada'} exitosamente.`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "No se pudo actualizar el estado de la financiera.",
        variant: "destructive",
      });
    },
  });

  const handleToggleStatus = (institution: FinancialInstitution) => {
    toggleStatusMutation.mutate(institution.id);
    setConfirmDialog({ show: false });
  };

  // Group products by institution ID
  const productsByInstitution = useMemo(() => {
    const map = new Map<string, InstitutionProductWithTemplate[]>();
    (institutionProducts || []).forEach(p => {
      if (p.institutionId) {
        if (!map.has(p.institutionId)) {
          map.set(p.institutionId, []);
        }
        map.get(p.institutionId)!.push(p);
      }
    });
    return map;
  }, [institutionProducts]);

  // Filter by status first, then by search term
  const filteredInstitutions = useMemo(() => {
    return (financialInstitutions || []).filter(institution => {
      const statusMatch = activeFilter === 'all' ? true : 
                         activeFilter === 'active' ? institution.isActive : 
                         !institution.isActive;
      
      const term = searchTerm.toLowerCase();
      const searchMatch = !searchTerm ? true : 
                         institution.name.toLowerCase().includes(term) ||
                         (institution.contactPerson ?? '').toLowerCase().includes(term);
      
      return statusMatch && searchMatch;
    });
  }, [financialInstitutions, activeFilter, searchTerm]);

  // Calculate counts for summary
  const totalCount = financialInstitutions?.length || 0;
  const activeCount = financialInstitutions?.filter(f => f.isActive).length || 0;
  const inactiveCount = totalCount - activeCount;

  if (institutionsLoading) {
    return (
      <MainLayout>
        <Header 
          title="Instituciones Financieras"
          subtitle="Administra tu red de financieras aliadas y condiciones operativas"
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-5 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </main>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Instituciones Financieras"
        subtitle="Administra tu red de financieras aliadas y condiciones operativas"
      />
        
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {/* Institutional Toolbar */}
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm p-4 sm:p-5 mb-6 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50/80 p-1">
              <button
                onClick={() => setActiveFilter('active')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  activeFilter === 'active'
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
                data-testid="filter-active"
              >
                Activas ({activeCount})
              </button>
              <button
                onClick={() => setActiveFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  activeFilter === 'all'
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
                data-testid="filter-all"
              >
                Todas ({totalCount})
              </button>
              <button
                onClick={() => setActiveFilter('inactive')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  activeFilter === 'inactive'
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
                data-testid="filter-inactive"
              >
                Inactivas ({inactiveCount})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-1 md:max-w-md md:justify-end">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar por nombre de financiera..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-financieras"
                className="pl-9 h-9 text-xs placeholder:text-slate-400 border-slate-200 bg-slate-50/50 focus:bg-white transition-colors"
              />
            </div>

            {isAdmin ? (
              <Button 
                onClick={() => setShowNewModal(true)}
                className="bg-primary hover:bg-primary-dark text-primary-foreground text-xs font-medium h-9 shadow-sm shrink-0"
                data-testid="button-new-financiera"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                <span>Nueva Financiera</span>
              </Button>
            ) : (
              <Button 
                onClick={() => setShowRequestModal(true)}
                variant="outline"
                className="text-xs font-medium h-9 border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
                data-testid="button-request-financiera"
              >
                <Send className="w-3.5 h-3.5 mr-1.5 text-primary" />
                <span>Solicitar Financiera</span>
              </Button>
            )}
          </div>
        </div>

        {/* Financial Institutions Catalog: Desktop Table + Mobile Cards */}
        {filteredInstitutions.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm text-center py-16 px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              {financialInstitutions?.length === 0 
                ? "No hay financieras registradas"
                : "Sin resultados para tu búsqueda"
              }
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
              {financialInstitutions?.length === 0 
                ? (isAdmin ? "Agrega tu primera institución financiera para comenzar a operar." : "No hay financieras registradas aún.")
                : "Intenta cambiar el término de búsqueda o el filtro seleccionado."
              }
            </p>
            {isAdmin && (
              <Button 
                onClick={() => setShowNewModal(true)}
                className="bg-primary hover:bg-primary-dark text-white text-xs h-8"
                data-testid="button-add-financiera"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Agregar Financiera
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Operational Table (hidden on mobile, visible on md+) */}
            <div className="hidden md:block bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Financiera</th>
                    <th className="py-3 px-3 text-center">Estado</th>
                    <th className="py-3 px-3">Perfiles Aceptados</th>
                    <th className="py-3 px-3">Productos y Categorías</th>
                    {isAdmin && <th className="py-3 px-3 text-center">Comisión</th>}
                    <th className="py-3 px-3">Contacto</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredInstitutions.map((institution) => {
                    const productsList = productsByInstitution.get(institution.id) || [];
                    const activeProductsCount = productsList.filter(p => p.isActive).length;

                    // Extract unique categories or templates
                    const categories = Array.from(new Set(
                      productsList
                        .filter(p => p.isActive)
                        .map(p => p.template?.category || p.template?.name || '')
                        .filter(Boolean)
                    ));

                    // Commission display for Admin only
                    const commissionRates = (institution as any).commissionRates;
                    const totalCommission = commissionRates?.financiera?.total ?? (institution as any).commissionRate;
                    const acceptedProfiles: string[] = (institution as any).acceptedProfiles || [];

                    const profileShort: Record<string, string> = {
                      'persona_moral': 'PM',
                      'fisica_empresarial': 'PFAE',
                      'fisica': 'PF',
                      'sin_sat': 'Sin SAT',
                    };

                    return (
                      <tr 
                        key={institution.id}
                        className={cn(
                          "transition-colors hover:bg-slate-50/70",
                          !institution.isActive && "bg-slate-50/30 opacity-75"
                        )}
                        data-testid={`financiera-${institution.id}`}
                      >
                        {/* 1. Name & Subtitle */}
                        <td className="py-3 px-4 font-medium text-slate-900">
                          <Link href={`/financieras/${institution.id}`}>
                            <span 
                              className="font-semibold text-slate-900 hover:text-primary transition-colors cursor-pointer block leading-tight text-sm truncate max-w-[200px] lg:max-w-[260px]"
                              data-testid={`financiera-name-${institution.id}`}
                              title={institution.name}
                            >
                              {institution.name}
                            </span>
                          </Link>
                          {(institution as any).type && (
                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block mt-0.5">
                              {(institution as any).type}
                            </span>
                          )}
                        </td>

                        {/* 2. Status Pill */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span 
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border",
                              institution.isActive 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200/80" 
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            )}
                          >
                            <span 
                              className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0", 
                                institution.isActive ? "bg-emerald-500" : "bg-slate-400"
                              )} 
                            />
                            <span>{institution.isActive ? "Activa" : "Inactiva"}</span>
                          </span>
                        </td>

                        {/* 3. Accepted Profiles */}
                        <td className="py-3 px-3">
                          {acceptedProfiles.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {acceptedProfiles.map((profile: string) => (
                                <span
                                  key={profile}
                                  className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 text-slate-700 border border-slate-200/70"
                                >
                                  {profileShort[profile] || profile}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Todos</span>
                          )}
                        </td>

                        {/* 4. Products & Categories */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800 shrink-0">
                              {activeProductsCount} {activeProductsCount === 1 ? 'producto' : 'productos'}
                            </span>
                            {categories.length > 0 && (
                              <div className="hidden lg:flex items-center gap-1 overflow-hidden">
                                <span className="text-slate-300">•</span>
                                {categories.slice(0, 2).map((cat, idx) => (
                                  <span 
                                    key={idx}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200/60 truncate max-w-[100px]"
                                    title={cat}
                                  >
                                    {cat}
                                  </span>
                                ))}
                                {categories.length > 2 && (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    +{categories.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 5. Commission (Admin only) */}
                        {isAdmin && (
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {totalCommission !== null && totalCommission !== undefined ? (
                              <span 
                                className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200/60"
                                data-testid={`commission-${institution.id}`}
                              >
                                {totalCommission}%
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">N/D</span>
                            )}
                          </td>
                        )}

                        {/* 6. Contact */}
                        <td className="py-3 px-3 text-slate-600 max-w-[150px] truncate" title={institution.contactPerson || "Sin contacto registrado"}>
                          {institution.contactPerson ? (
                            <span className="text-xs text-slate-700 truncate block">
                              {institution.contactPerson}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">—</span>
                          )}
                        </td>

                        {/* 7. Action */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link href={`/financieras/${institution.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2.5 font-medium border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-none gap-1"
                                data-testid={`button-view-financiera-${institution.id}`}
                              >
                                <span>Ver productos y detalle</span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                              </Button>
                            </Link>

                            {isAdmin && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                                    data-testid={`menu-financiera-${institution.id}`}
                                  >
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 text-xs">
                                  <DropdownMenuItem 
                                    onClick={() => setConfigModal({ show: true, financiera: institution })}
                                    data-testid={`button-config-financiera-${institution.id}`}
                                  >
                                    <Settings className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                    Configurar productos
                                  </DropdownMenuItem>

                                  {institution.isActive ? (
                                    <DropdownMenuItem 
                                      onClick={() => setConfirmDialog({ show: true, financiera: institution })}
                                      data-testid={`button-toggle-status-${institution.id}`}
                                      className="text-amber-700 focus:text-amber-800"
                                    >
                                      <Pause className="w-3.5 h-3.5 mr-2 text-amber-600" />
                                      Desactivar financiera
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem 
                                      onClick={() => setConfirmDialog({ show: true, financiera: institution })}
                                      data-testid={`button-reactivate-${institution.id}`}
                                      className="text-emerald-700 focus:text-emerald-800"
                                    >
                                      <Play className="w-3.5 h-3.5 mr-2 text-emerald-600" />
                                      Reactivar financiera
                                    </DropdownMenuItem>
                                  )}

                                  <DropdownMenuSeparator />

                                  <DropdownMenuItem 
                                    onClick={() => setDeleteDialog({ show: true, financiera: institution })}
                                    data-testid={`button-delete-${institution.id}`}
                                    className="text-red-600 focus:text-red-700"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 mr-2 text-red-500" />
                                    Eliminar financiera
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Compact Cards (visible only on mobile, hidden on md+) */}
            <div className="md:hidden space-y-3">
              {filteredInstitutions.map((institution) => {
                const productsList = productsByInstitution.get(institution.id) || [];
                const activeProductsCount = productsList.filter(p => p.isActive).length;

                const categories = Array.from(new Set(
                  productsList
                    .filter(p => p.isActive)
                    .map(p => p.template?.category || p.template?.name || '')
                    .filter(Boolean)
                ));

                const commissionRates = (institution as any).commissionRates;
                const totalCommission = commissionRates?.financiera?.total ?? (institution as any).commissionRate;
                const acceptedProfiles: string[] = (institution as any).acceptedProfiles || [];

                const profileShort: Record<string, string> = {
                  'persona_moral': 'PM',
                  'fisica_empresarial': 'PFAE',
                  'fisica': 'PF',
                  'sin_sat': 'Sin SAT',
                };

                return (
                  <div 
                    key={institution.id}
                    className={cn(
                      "bg-white border rounded-xl shadow-xs p-4 flex flex-col gap-2.5",
                      institution.isActive ? "border-slate-200/90" : "border-slate-200/60 opacity-85 bg-slate-50/40"
                    )}
                    data-testid={`financiera-mobile-${institution.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/financieras/${institution.id}`}>
                          <h3 
                            className="font-semibold text-slate-900 text-sm hover:text-primary transition-colors cursor-pointer truncate"
                            data-testid={`financiera-name-mobile-${institution.id}`}
                          >
                            {institution.name}
                          </h3>
                        </Link>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <Layers className="w-3 h-3 text-slate-400" />
                          <span>
                            {activeProductsCount > 0 
                              ? `${activeProductsCount} producto${activeProductsCount !== 1 ? 's' : ''}`
                              : "Sin productos activos"
                            }
                          </span>
                        </div>
                      </div>

                      <span 
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0",
                          institution.isActive 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/80" 
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        )}
                      >
                        <span 
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0", 
                            institution.isActive ? "bg-emerald-500" : "bg-slate-400"
                          )} 
                        />
                        <span>{institution.isActive ? "Activa" : "Inactiva"}</span>
                      </span>
                    </div>

                    {/* Metadata chips: Profiles & Commission */}
                    <div className="flex items-center justify-between gap-2 flex-wrap text-xs pt-1 border-t border-slate-100">
                      {acceptedProfiles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {acceptedProfiles.map((profile: string) => (
                            <span
                              key={profile}
                              className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {profileShort[profile] || profile}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Todos los perfiles</span>
                      )}

                      {isAdmin && totalCommission !== null && totalCommission !== undefined && (
                        <span 
                          className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded"
                          data-testid={`commission-mobile-${institution.id}`}
                        >
                          Comisión: {totalCommission}%
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Link href={`/financieras/${institution.id}`} className="flex-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs font-medium h-7 bg-white border-slate-200 text-slate-700 shadow-none justify-between"
                          data-testid={`button-view-financiera-mobile-${institution.id}`}
                        >
                          <span>Ver detalle</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                        </Button>
                      </Link>

                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                              data-testid={`menu-financiera-mobile-${institution.id}`}
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 text-xs">
                            <DropdownMenuItem 
                              onClick={() => setConfigModal({ show: true, financiera: institution })}
                              data-testid={`button-config-financiera-mobile-${institution.id}`}
                            >
                              <Settings className="w-3.5 h-3.5 mr-2 text-slate-500" />
                              Configurar productos
                            </DropdownMenuItem>

                            {institution.isActive ? (
                              <DropdownMenuItem 
                                onClick={() => setConfirmDialog({ show: true, financiera: institution })}
                                data-testid={`button-toggle-status-mobile-${institution.id}`}
                                className="text-amber-700 focus:text-amber-800"
                              >
                                <Pause className="w-3.5 h-3.5 mr-2 text-amber-600" />
                                Desactivar financiera
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem 
                                onClick={() => setConfirmDialog({ show: true, financiera: institution })}
                                data-testid={`button-reactivate-mobile-${institution.id}`}
                                className="text-emerald-700 focus:text-emerald-800"
                              >
                                <Play className="w-3.5 h-3.5 mr-2 text-emerald-600" />
                                Reactivar financiera
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />

                            <DropdownMenuItem 
                              onClick={() => setDeleteDialog({ show: true, financiera: institution })}
                              data-testid={`button-delete-mobile-${institution.id}`}
                              className="text-red-600 focus:text-red-700"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2 text-red-500" />
                              Eliminar financiera
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      {isAdmin ? (
        <NewFinancieraModal 
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onFinancieraCreated={(financiera) => {
            setConfigModal({ show: true, financiera });
          }}
        />
      ) : (
        <RequestInstitutionModal 
          isOpen={showRequestModal}
          onClose={() => setShowRequestModal(false)}
        />
      )}
      
      {configModal.financiera && isAdmin && (
        <ProductConfigurationModal 
          isOpen={configModal.show}
          onClose={() => setConfigModal({ show: false })}
          financiera={configModal.financiera}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.show && (
        <AlertDialog open={confirmDialog.show} onOpenChange={(open) => !open && setConfirmDialog({ show: false })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmDialog.financiera?.isActive ? 'Desactivar' : 'Activar'} Financiera
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDialog.financiera?.isActive 
                  ? `¿Estás seguro de que deseas desactivar "${confirmDialog.financiera?.name}"? Esta acción hará que la financiera no esté disponible para nuevos créditos.`
                  : `¿Estás seguro de que deseas activar "${confirmDialog.financiera?.name}"? Esta acción hará que la financiera esté disponible para nuevos créditos.`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmDialog({ show: false })}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmDialog.financiera && handleToggleStatus(confirmDialog.financiera)}
                className={confirmDialog.financiera?.isActive 
                  ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-600 text-white' 
                  : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600 text-white'
                }
              >
                {confirmDialog.financiera?.isActive ? 'Desactivar' : 'Activar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialog.show && (
        <AlertDialog open={deleteDialog.show} onOpenChange={(open) => !open && setDeleteDialog({ show: false })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-600 flex items-center">
                <Trash2 className="w-5 h-5 mr-2 text-red-600" />
                Eliminar Financiera
              </AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro de que deseas eliminar permanentemente a <strong>"{deleteDialog.financiera?.name}"</strong>?
                <br /><br />
                Esta acción es irreversible y eliminará también los productos vinculados a esta financiera en el sistema.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteDialog({ show: false })}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteDialog.financiera && deleteMutation.mutate(deleteDialog.financiera.id)}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Eliminando..." : "Eliminar Permanentemente"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </MainLayout>
  );
}
