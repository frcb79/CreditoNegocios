import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { FinancialInstitution } from "@shared/schema";
import NewFinancieraModal from "@/components/Modals/NewFinancieraModal";
import RequestInstitutionModal from "@/components/Modals/RequestInstitutionModal";
import ProductConfigurationModal from "@/components/Modals/ProductConfigurationModal";

type FilterType = 'all' | 'active' | 'inactive';

export default function Financieras() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>('active');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [configModal, setConfigModal] = useState<{ show: boolean; financiera?: FinancialInstitution }>({ show: false });
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; financiera?: FinancialInstitution }>({ show: false });
  const { toast } = useToast();
  const { user } = useAuth();
  
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isBroker = user?.role === 'broker' || user?.role === 'master_broker';

  const { data: financialInstitutions, isLoading } = useQuery<FinancialInstitution[]>({
    queryKey: ["/api/financial-institutions"],
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
    onSuccess: (updatedInstitution, institutionId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/financial-institutions"] });
      
      // If we just deactivated an institution and we're viewing active only, switch to all
      if (!updatedInstitution.isActive && activeFilter === 'active') {
        setActiveFilter('all');
        toast({
          title: "Estado actualizado",
          description: `${updatedInstitution.name} ha sido desactivada exitosamente. Cambiando a vista "Todas" para mostrar el resultado.`,
        });
      } else if (updatedInstitution.isActive && activeFilter === 'inactive') {
        // If we just activated an institution and we're viewing inactive only, switch to all
        setActiveFilter('all');
        toast({
          title: "Estado actualizado",
          description: `${updatedInstitution.name} ha sido activada exitosamente. Cambiando a vista "Todas" para mostrar el resultado.`,
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

  // Filter by status first, then by search term
  const filteredInstitutions = financialInstitutions?.filter(institution => {
    // Filter by status
    const statusMatch = activeFilter === 'all' ? true : 
                       activeFilter === 'active' ? institution.isActive : 
                       !institution.isActive;
    
    // Filter by search term
    const searchMatch = searchTerm === '' ? true : 
                       institution.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (institution.contactPerson ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    
    return statusMatch && searchMatch;
  }) || [];

  // Calculate counts for summary
  const totalCount = financialInstitutions?.length || 0;
  const activeCount = financialInstitutions?.filter(f => f.isActive).length || 0;
  const inactiveCount = totalCount - activeCount;

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Financieras"
            subtitle="Gestiona tus instituciones financieras aliadas"
          />
          
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          title="Instituciones Financieras"
          subtitle="Administra tu red de financieras aliadas"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Summary Card */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i className="fas fa-building text-primary text-2xl"></i>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
                  <p className="text-sm text-neutral">Total Financieras</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i className="fas fa-check-circle text-green-600 text-2xl"></i>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
                  <p className="text-sm text-neutral">Activas</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i className="fas fa-pause-circle text-red-600 text-2xl"></i>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{inactiveCount}</p>
                  <p className="text-sm text-neutral">Inactivas</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i className="fas fa-handshake text-success text-2xl"></i>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">147</p>
                  <p className="text-sm text-neutral">Créditos Enviados</p>
                </div>
                <div className="text-center">
                  <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i className="fas fa-percentage text-warning text-2xl"></i>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">2.5%</p>
                  <p className="text-sm text-neutral">Comisión Promedio</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filter Tabs and Actions */}
          <Card className="mb-8">
            <CardContent className="p-6">
              {/* Filter Tabs */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeFilter === 'all'
                        ? 'bg-white text-gray-900 shadow'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    data-testid="filter-all"
                  >
                    Todas ({totalCount})
                  </button>
                  <button
                    onClick={() => setActiveFilter('active')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeFilter === 'active'
                        ? 'bg-white text-gray-900 shadow'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    data-testid="filter-active"
                  >
                    Activas ({activeCount})
                  </button>
                  <button
                    onClick={() => setActiveFilter('inactive')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeFilter === 'inactive'
                        ? 'bg-white text-gray-900 shadow'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    data-testid="filter-inactive"
                  >
                    Inactivas ({inactiveCount})
                  </button>
                </div>
                
                {isAdmin ? (
                  <Button 
                    className="bg-primary text-white hover:bg-primary-dark"
                    onClick={() => setShowNewModal(true)}
                    data-testid="button-new-financiera"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Nueva Financiera
                  </Button>
                ) : (
                  <Button 
                    className="bg-success text-white hover:bg-success/90"
                    onClick={() => setShowRequestModal(true)}
                    data-testid="button-request-financiera"
                  >
                    <i className="fas fa-paper-plane mr-2"></i>
                    Solicitar Nueva Financiera
                  </Button>
                )}
              </div>
              
              {/* Search Bar */}
              <div className="w-96">
                <Input
                  placeholder="Buscar financieras por nombre o contacto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-financieras"
                  className="placeholder:text-gray-400"
                />
              </div>
            </CardContent>
          </Card>

          {/* Financial Institutions Grid */}
          {filteredInstitutions.length === 0 ? (
            <Card>
              <CardContent className="p-12">
                <div className="text-center">
                  <i className="fas fa-building text-6xl text-gray-300 mb-6"></i>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {financialInstitutions?.length === 0 
                      ? "No hay financieras registradas"
                      : "No se encontraron financieras"
                    }
                  </h3>
                  <p className="text-neutral mb-6">
                    {financialInstitutions?.length === 0 
                      ? (isAdmin ? "Agrega tu primera institución financiera para comenzar a enviar expedientes." : "No hay financieras registradas aún.")
                      : "Intenta con otros términos de búsqueda."
                    }
                  </p>
                  {isAdmin && (
                    <Button 
                      className="bg-primary text-white hover:bg-primary-dark"
                      onClick={() => setShowNewModal(true)}
                      data-testid="button-add-financiera"
                    >
                      <i className="fas fa-plus mr-2"></i>
                      Agregar Financiera
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredInstitutions.map((institution) => (
                <Card 
                  key={institution.id}
                  className="border border-gray-200 hover:shadow-lg transition-shadow"
                  data-testid={`financiera-${institution.id}`}
                >
                  <Link href={`/financieras/${institution.id}`}>
                    <CardHeader className="pb-3 cursor-pointer hover:bg-gray-50 rounded-t-lg transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                            <i className="fas fa-building text-primary text-lg"></i>
                          </div>
                          <div>
                            <CardTitle className="text-lg" data-testid={`financiera-name-${institution.id}`}>
                              {institution.name}
                            </CardTitle>
                            <Badge 
                              variant={institution.isActive ? "default" : "secondary"}
                              className={institution.isActive 
                                ? "bg-green-100 text-green-700 border-green-200" 
                                : "bg-red-100 text-red-700 border-red-200"
                              }
                            >
                              <i className={`fas ${institution.isActive ? 'fa-check-circle' : 'fa-pause-circle'} mr-1 text-xs`}></i>
                              {institution.isActive ? "Activa" : "Inactiva"}
                            </Badge>
                          </div>
                        </div>
                        <i className="fas fa-arrow-right text-gray-400"></i>
                      </div>
                    </CardHeader>
                  </Link>
                  
                  <CardContent className="space-y-4">
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral">Contacto:</span>
                        <span className="font-medium">{institution.contactPerson ?? 'No asignado'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral">Email:</span>
                        <span className="font-medium text-xs">{institution.email || 'No proporcionado'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral">Teléfono:</span>
                        <span className="font-medium">{institution.phone || 'No proporcionado'}</span>
                      </div>
                      {/* Comisión solo visible para admin */}
                      {isAdmin && (
                        <div className="flex justify-between">
                          <span className="text-neutral">Comisión:</span>
                          <span className="text-primary font-semibold" data-testid={`commission-${institution.id}`}>
                            {(() => {
                              const commissionRates = (institution as any).commissionRates;
                              const total = commissionRates?.financiera?.total;
                              if (total !== null && total !== undefined) {
                                return `${total}%`;
                              }
                              return 'No definida';
                            })()}
                          </span>
                        </div>
                      )}
                      <div className="pt-2">
                        <span className="text-neutral text-xs block mb-2">Perfiles Aceptados:</span>
                        <div className="flex flex-wrap gap-1">
                          {(institution as any).acceptedProfiles && (institution as any).acceptedProfiles.length > 0 ? (
                            (institution as any).acceptedProfiles.map((profile: string) => {
                              const profileMap: Record<string, { label: string; color: string }> = {
                                'persona_moral': { label: 'PM', color: 'bg-blue-100 text-blue-700' },
                                'fisica_empresarial': { label: 'PFAE', color: 'bg-green-100 text-green-700' },
                                'fisica': { label: 'PF', color: 'bg-orange-100 text-orange-700' },
                                'sin_sat': { label: 'Sin SAT', color: 'bg-gray-100 text-gray-700' },
                              };
                              const profileInfo = profileMap[profile] || { label: profile, color: 'bg-gray-100 text-gray-700' };
                              return (
                                <Badge 
                                  key={profile} 
                                  variant="outline" 
                                  className={`text-xs ${profileInfo.color}`}
                                >
                                  {profileInfo.label}
                                </Badge>
                              );
                            })
                          ) : (
                            <span className="text-xs text-gray-400 italic">No configurado</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {isAdmin && (
                      <div className="flex space-x-2 pt-4 border-t">
                        {institution.isActive ? (
                          <>
                            <Button 
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setConfigModal({ show: true, financiera: institution });
                              }}
                              title="Configurar productos para esta financiera"
                              data-testid={`button-config-financiera-${institution.id}`}
                            >
                              <i className="fas fa-cog mr-1"></i>
                              Configurar
                            </Button>
                            
                            {/* Deactivate Button */}
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setConfirmDialog({ show: true, financiera: institution });
                              }}
                              disabled={toggleStatusMutation.isPending}
                              title="Desactivar financiera"
                              className="bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                              data-testid={`button-toggle-status-${institution.id}`}
                            >
                              {toggleStatusMutation.isPending && toggleStatusMutation.variables === institution.id ? (
                                <i className="fas fa-spinner fa-spin"></i>
                              ) : (
                                <i className="fas fa-pause"></i>
                              )}
                            </Button>
                          </>
                        ) : (
                          <>
                            {/* Reactivate Button - Primary action for inactive */}
                            <Button 
                              size="sm"
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => {
                                setConfirmDialog({ show: true, financiera: institution });
                              }}
                              disabled={toggleStatusMutation.isPending}
                              title="Reactivar financiera"
                              data-testid={`button-reactivate-${institution.id}`}
                            >
                              {toggleStatusMutation.isPending && toggleStatusMutation.variables === institution.id ? (
                                <i className="fas fa-spinner fa-spin mr-1"></i>
                              ) : (
                                <i className="fas fa-play mr-1"></i>
                              )}
                              Reactivar
                            </Button>
                            
                            {/* View Configuration (Read-only) */}
                            <Button 
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setConfigModal({ show: true, financiera: institution });
                              }}
                              title="Ver configuración"
                              data-testid={`button-view-config-${institution.id}`}
                            >
                              <i className="fas fa-eye"></i>
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>

        {/* Modals */}
        {isAdmin ? (
          <NewFinancieraModal 
            isOpen={showNewModal}
            onClose={() => setShowNewModal(false)}
            onFinancieraCreated={(financiera) => {
              // Abrir configuración automáticamente
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
                    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600' 
                    : 'bg-green-600 hover:bg-green-700 focus:ring-green-600'
                  }
                >
                  {confirmDialog.financiera?.isActive ? 'Desactivar' : 'Activar'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
