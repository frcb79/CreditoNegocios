import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { User } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import InviteBrokerModal from "@/components/Modals/InviteBrokerModal";

function MasterBrokerRatesConfig({ user }: { user: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [ratesForm, setRatesForm] = useState<Record<string, { apertura: string; sobretasa?: string; renovacion?: string }>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data: ratesData, isLoading } = useQuery<{
    rates: Record<string, any>;
    items: Array<{
      institutionId: string;
      institutionName: string;
      logoUrl?: string;
      category?: string;
      masterCeiling: { total: number; apertura: number; sobretasa: number; renovacion: number };
      defaultBroker: { total: number; apertura: number; sobretasa: number; renovacion: number };
      assignedRate: { apertura: number; sobretasa?: number; renovacion?: number } | null;
    }>;
  }>({
    queryKey: ["/api/master-broker/network-rates"],
  });

  // Initialize form when data loads
  useEffect(() => {
    if (ratesData?.items) {
      const initial: Record<string, { apertura: string; sobretasa?: string; renovacion?: string }> = {};
      ratesData.items.forEach(item => {
        const assigned = item.assignedRate;
        initial[item.institutionId] = {
          apertura: assigned?.apertura !== undefined ? String(assigned.apertura) : String(item.defaultBroker.apertura || ''),
          sobretasa: assigned?.sobretasa !== undefined ? String(assigned.sobretasa) : String(item.defaultBroker.sobretasa || ''),
          renovacion: assigned?.renovacion !== undefined ? String(assigned.renovacion) : String(item.defaultBroker.renovacion || ''),
        };
      });
      setRatesForm(initial);
      setHasChanges(false);
    }
  }, [ratesData]);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("PUT", "/api/master-broker/network-rates", { rates: payload });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master-broker/network-rates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-institutions"] });
      setHasChanges(false);
      toast({
        title: "Comisiones de Red Guardadas",
        description: "El esquema de comisiones para tu equipo ha sido actualizado.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Error al guardar",
        description: err.message || "No se pudieron guardar las comisiones",
        variant: "destructive",
      });
    },
  });

  const handleRateChange = (instId: string, field: 'apertura' | 'sobretasa' | 'renovacion', value: string) => {
    setRatesForm(prev => ({
      ...prev,
      [instId]: {
        ...prev[instId],
        [field]: value,
      }
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (ratesData?.items) {
      for (const item of ratesData.items) {
        const val = parseFloat(ratesForm[item.institutionId]?.apertura || '0');
        const ceiling = item.masterCeiling.apertura;
        if (val > ceiling && ceiling > 0) {
          toast({
            title: "Tasa no permitida",
            description: `Para ${item.institutionName}, la comisión (${val}%) no puede superar tu techo de ${ceiling}%.`,
            variant: "destructive",
          });
          return;
        }
      }
    }
    saveMutation.mutate(ratesForm);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 py-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const items = ratesData?.items || [];

  return (
    <div className="space-y-6">
      {/* Banner explicativo */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 flex-1 min-w-[280px]">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-700 mt-0.5">
            <i className="fas fa-sitemap"></i>
          </div>
          <div className="text-xs">
            <h4 className="font-bold text-blue-950 text-sm mb-1">
              Autonomía de Comisiones para tu Red de Brókers
            </h4>
            <p className="text-blue-900 leading-relaxed">
              Crédito Negocios te otorga un <strong>porcentaje techo</strong> por cada financiera. Aquí tú decides con total libertad qué porcentaje le compartes a los brókers de tu equipo. Tu <strong>Margen Neto</strong> se calcula automáticamente y es lo que recibes directamente en cada crédito colocado.
            </p>
          </div>
        </div>
        {hasChanges && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-success text-white hover:bg-green-700 shadow-sm text-xs flex-shrink-0 self-center"
          >
            {saveMutation.isPending && <i className="fas fa-spinner fa-spin mr-1.5"></i>}
            <i className="fas fa-save mr-1.5"></i>
            Guardar Cambios
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base font-bold text-gray-900">
              Esquema de Comisiones por Financiera ({items.length} Financieras Activas)
            </CardTitle>
            <p className="text-xs text-neutral mt-0.5">
              Ajusta la comisión de apertura para tu equipo. El margen retenido se actualiza en tiempo real.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
            className="bg-primary text-white hover:bg-primary-dark text-xs"
          >
            {saveMutation.isPending && <i className="fas fa-spinner fa-spin mr-1.5"></i>}
            <i className="fas fa-save mr-1.5"></i>
            Guardar Comisiones de Red
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100/80 text-gray-700 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Financiera</th>
                  <th className="p-3.5 text-center bg-blue-50/70 text-blue-950">
                    Techo Otorgado (MB)
                  </th>
                  <th className="p-3.5 text-center bg-amber-50/70 text-amber-950 w-44">
                    Comisión para tu Red (%)
                  </th>
                  <th className="p-3.5 text-center bg-emerald-50/70 text-emerald-950">
                    Tu Margen Neto
                  </th>
                  <th className="p-3.5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-neutral">
                      No hay financieras activas registradas en la plataforma.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const ceiling = item.masterCeiling.apertura;
                    const currentVal = ratesForm[item.institutionId]?.apertura ?? '';
                    const parsedVal = parseFloat(currentVal || '0');
                    const isOverCeiling = parsedVal > ceiling && ceiling > 0;
                    const netMargin = Math.max(0, ceiling - parsedVal);

                    return (
                      <tr key={item.institutionId} className="hover:bg-gray-50/80 transition-colors">
                        <td className="p-3.5 font-medium text-gray-900">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-primary font-bold text-xs border border-gray-200">
                              <i className="fas fa-building"></i>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{item.institutionName}</p>
                              {item.category && (
                                <p className="text-[11px] text-gray-400 capitalize">{item.category}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5 text-center bg-blue-50/30">
                          <Badge className="bg-blue-100 text-blue-900 border-blue-200 font-bold">
                            {ceiling.toFixed(2)}% Apertura
                          </Badge>
                          {item.masterCeiling.renovacion > 0 && (
                            <p className="text-[10px] text-blue-700 mt-0.5">
                              Renovación: {item.masterCeiling.renovacion}%
                            </p>
                          )}
                        </td>

                        <td className="p-3.5 text-center bg-amber-50/30">
                          <div className="max-w-[140px] mx-auto space-y-1">
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                max={ceiling || 100}
                                value={currentVal}
                                onChange={(e) => handleRateChange(item.institutionId, 'apertura', e.target.value)}
                                className={`text-center font-bold text-sm h-9 ${isOverCeiling ? 'border-destructive bg-destructive/10 text-destructive' : 'border-amber-300'}`}
                                placeholder={`${item.defaultBroker.apertura || '0'}`}
                              />
                              <span className="absolute right-2.5 top-2 text-xs font-bold text-gray-500 pointer-events-none">%</span>
                            </div>
                            {isOverCeiling && (
                              <p className="text-[10px] text-destructive font-semibold">
                                Excede tu techo ({ceiling}%)
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="p-3.5 text-center bg-emerald-50/30">
                          <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 font-bold text-xs px-2.5 py-1">
                            💰 {netMargin.toFixed(2)}% Neto
                          </Badge>
                          <p className="text-[10px] text-emerald-700 mt-0.5">
                            Tu ganancia retenida
                          </p>
                        </td>

                        <td className="p-3.5 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-gray-500 hover:text-gray-800"
                            onClick={() => {
                              handleRateChange(item.institutionId, 'apertura', String(item.defaultBroker.apertura || '2.5'));
                            }}
                            title="Restablecer a la tasa sugerida por defecto"
                          >
                            <i className="fas fa-undo mr-1 text-[10px]"></i>
                            Sugerida ({item.defaultBroker.apertura}%)
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BrokerNetworkComponent() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteMasterBrokerId, setInviteMasterBrokerId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedMasterBroker, setExpandedMasterBroker] = useState<string | null>(null);

  const { data: networkData, isLoading } = useQuery<any>({
    queryKey: ["/api/broker-network"],
  });

  if (isLoading || isAuthLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Red de Brokers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Si es un Master Broker regular (retorna un array plano de brokers)
  if (!isAdmin) {
    const brokers: User[] = Array.isArray(networkData) ? networkData : [];

    return (
      <div className="space-y-6">
        <Tabs defaultValue="team" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md bg-gray-100 p-1 rounded-xl">
            <TabsTrigger value="team" className="flex items-center gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <i className="fas fa-users"></i>
              Mi Equipo de Brokers ({brokers.length})
            </TabsTrigger>
            <TabsTrigger value="rates" className="flex items-center gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <i className="fas fa-percentage"></i>
              Comisiones de mi Red
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="space-y-6 mt-4">
            {brokers.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Mi Red de Brokers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <i className="fas fa-network-wired text-4xl text-gray-300 mb-4"></i>
                    <p className="text-neutral mb-4">Aún no tienes brokers en tu red</p>
                    <Button 
                      className="bg-primary text-white hover:bg-primary-dark"
                      onClick={() => {
                        setInviteMasterBrokerId(user?.id || null);
                        setShowInviteModal(true);
                      }}
                    >
                      <i className="fas fa-plus mr-2"></i>
                      Invitar Broker
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Resumen de mi Red</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                          <i className="fas fa-users text-primary text-2xl"></i>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{brokers.length}</p>
                        <p className="text-sm text-neutral">Brokers en tu Equipo</p>
                      </div>
                      <div className="text-center">
                        <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-3">
                          <i className="fas fa-dollar-sign text-success text-2xl"></i>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">Activo</p>
                        <p className="text-sm text-neutral">Comisiones de Red Habilitadas</p>
                      </div>
                      <div className="text-center">
                        <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-3">
                          <i className="fas fa-user-check text-warning text-2xl"></i>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{brokers.filter(b => b.isActive).length}</p>
                        <p className="text-sm text-neutral">Brokers Activos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <CardTitle>Brokers en mi Red</CardTitle>
                      <div className="flex items-center gap-2">
                        <Link href="/admin/usuarios">
                          <Button variant="outline" size="sm" className="text-xs">
                            <i className="fas fa-users-cog mr-1.5 text-primary"></i>
                            Roles y Permisos Granulares
                          </Button>
                        </Link>
                        <Button 
                          className="bg-primary text-white hover:bg-primary-dark text-xs"
                          size="sm"
                          onClick={() => {
                            setInviteMasterBrokerId(user?.id || null);
                            setShowInviteModal(true);
                          }}
                          data-testid="button-invite-broker"
                        >
                          <i className="fas fa-user-plus mr-1.5"></i>
                          Invitar Broker
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {brokers.map((broker) => (
                        <div
                          key={broker.id}
                          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          data-testid={`broker-${broker.id}`}
                        >
                          <div className="flex items-center space-x-4">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-primary text-white font-semibold">
                                {broker.firstName?.[0]}{broker.lastName?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h3 className="font-semibold text-gray-900">
                                {broker.firstName} {broker.lastName}
                              </h3>
                              <p className="text-sm text-neutral">{broker.email}</p>
                              <p className="text-xs text-neutral">
                                Unido {broker.createdAt ? formatDistanceToNow(new Date(broker.createdAt), { 
                                  addSuffix: true, 
                                  locale: es 
                                }) : 'Reciente'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <Badge 
                              variant={broker.isActive ? "default" : "secondary"}
                              className={broker.isActive ? "bg-success/10 text-success" : ""}
                            >
                              {broker.isActive ? "Activo" : "Inactivo"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="rates" className="space-y-6 mt-4">
            <MasterBrokerRatesConfig user={user} />
          </TabsContent>
        </Tabs>

        <InviteBrokerModal 
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
        />
      </div>
    );
  }

  // Vista exclusiva para SUPER ADMIN / ADMIN
  const masterBrokers = Array.isArray(networkData?.masterBrokers) ? networkData.masterBrokers : [];
  const independentBrokers = Array.isArray(networkData?.independentBrokers) ? networkData.independentBrokers : [];
  const adminBrokers = Array.isArray(networkData?.adminBrokers) ? networkData.adminBrokers : [];
  const allBrokers = Array.isArray(networkData?.allBrokers) ? networkData.allBrokers : [];

  const filteredMasterBrokers = masterBrokers.filter((mb: any) => {
    if (!mb) return false;
    const text = `${mb.firstName || ''} ${mb.lastName || ''} ${mb.email || ''} ${mb.brandName || ''}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  const filteredIndependentBrokers = independentBrokers.filter((b: any) => {
    if (!b) return false;
    const text = `${b.firstName || ''} ${b.lastName || ''} ${b.email || ''}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  const filteredAdminBrokers = adminBrokers.filter((b: any) => {
    if (!b) return false;
    const text = `${b.firstName || ''} ${b.lastName || ''} ${b.email || ''}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Resumen Global para Super Admin */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-purple-200 bg-purple-50/40">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-purple-900 uppercase">Master Brokers</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">{masterBrokers.length}</p>
              <p className="text-[11px] text-purple-700 mt-0.5">Líderes de red activos</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-200/60 text-purple-800 flex items-center justify-center">
              <i className="fas fa-network-wired text-xl"></i>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-blue-900 uppercase">Brokers en Redes MB</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">
                {masterBrokers.reduce((acc: number, mb: any) => acc + (mb.networkBrokers?.length || 0), 0)}
              </p>
              <p className="text-[11px] text-blue-700 mt-0.5">Pertenecen a un Master Broker</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-200/60 text-blue-800 flex items-center justify-center">
              <i className="fas fa-users text-xl"></i>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50/40">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-orange-900 uppercase">Brokers Directos</p>
              <p className="text-2xl font-bold text-orange-900 mt-1">{independentBrokers.length}</p>
              <p className="text-[11px] text-orange-700 mt-0.5">Sin Master Broker asignado</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-200/60 text-orange-800 flex items-center justify-center">
              <i className="fas fa-user-tag text-xl"></i>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50/40">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-green-900 uppercase">Mi Red Directa</p>
              <p className="text-2xl font-bold text-green-900 mt-1">{adminBrokers.length}</p>
              <p className="text-[11px] text-green-700 mt-0.5">Casa Matriz / Super Admin</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-green-200/60 text-green-800 flex items-center justify-center">
              <i className="fas fa-crown text-xl"></i>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Búsqueda y Botones de Acción */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <Input 
            placeholder="Buscar por nombre, email o marca comercial..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button 
            className="bg-primary text-white hover:bg-primary-dark text-xs"
            onClick={() => {
              setInviteMasterBrokerId(user?.id || null);
              setShowInviteModal(true);
            }}
          >
            <i className="fas fa-user-plus mr-1.5"></i>
            Invitar Broker a Mi Red
          </Button>
        </div>
      </div>

      {/* Pestañas de Gestión de Redes */}
      <Tabs defaultValue="master_brokers" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="master_brokers" className="text-xs sm:text-sm">
            <i className="fas fa-sitemap mr-2"></i>
            1. Master Brokers & Redes ({filteredMasterBrokers.length})
          </TabsTrigger>
          <TabsTrigger value="direct_brokers" className="text-xs sm:text-sm">
            <i className="fas fa-user-tie mr-2"></i>
            2. Brokers Directos ({filteredIndependentBrokers.length})
          </TabsTrigger>
          <TabsTrigger value="admin_network" className="text-xs sm:text-sm">
            <i className="fas fa-crown mr-2"></i>
            3. Mi Red Directa ({filteredAdminBrokers.length})
          </TabsTrigger>
        </TabsList>

        {/* 1. VISTA DE MASTER BROKERS Y SUS REDES */}
        <TabsContent value="master_brokers" className="mt-4 space-y-4">
          {filteredMasterBrokers.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <i className="fas fa-users-slash text-3xl mb-2 text-gray-400"></i>
                <p>No se encontraron Master Brokers registrados.</p>
              </CardContent>
            </Card>
          ) : (
            filteredMasterBrokers.map((mb: any) => {
              const isExpanded = expandedMasterBroker === mb.id;
              const networkCount = mb.networkBrokers?.length || 0;

              return (
                <Card key={mb.id} className="border border-gray-200 overflow-hidden">
                  <CardHeader className="bg-gray-50/60 p-4 border-b">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10 border border-purple-200">
                          <AvatarFallback className="bg-purple-700 text-white font-bold text-sm">
                            {mb.firstName?.[0]}{mb.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900 text-sm">
                              {mb.firstName} {mb.lastName}
                            </h3>
                            {mb.brandName && (
                              <Badge variant="outline" className="bg-purple-100 text-purple-900 border-purple-300 text-[10px]">
                                {mb.brandName}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{mb.email} • {mb.phone || 'Sin teléfono'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge className="bg-purple-50 text-purple-700 border border-purple-200 text-xs font-semibold">
                          {networkCount} broker{networkCount !== 1 ? 's' : ''} en red
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpandedMasterBroker(isExpanded ? null : mb.id)}
                          className="text-xs h-8"
                        >
                          <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} mr-1.5`}></i>
                          {isExpanded ? 'Ocultar Red' : 'Ver Brokers'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="p-4 bg-white">
                      {networkCount === 0 ? (
                        <div className="p-4 bg-gray-50 rounded-lg text-center text-xs text-gray-500">
                          Este Master Broker aún no tiene brokers asociados a su red.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(mb.networkBrokers || []).map((broker: any) => (
                            <div 
                              key={broker.id}
                              className="p-3 bg-gray-50/70 border border-gray-200 rounded-lg flex items-center justify-between"
                            >
                              <div className="flex items-center space-x-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                                    {broker.firstName?.[0]}{broker.lastName?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-semibold text-xs text-gray-900">
                                    {broker.firstName} {broker.lastName}
                                  </p>
                                  <p className="text-[11px] text-gray-500">{broker.email}</p>
                                </div>
                              </div>
                              <Badge variant={broker.isActive ? "default" : "secondary"} className="text-[10px]">
                                {broker.isActive ? "Activo" : "Inactivo"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* 2. VISTA DE BROKERS DIRECTOS INDEPENDIENTES */}
        <TabsContent value="direct_brokers" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">Brokers Directos Independientes</CardTitle>
                  <p className="text-xs text-neutral mt-0.5">
                    Brokers registrados en la plataforma que operan de forma directa sin pertenecer a la red de un Master Broker.
                  </p>
                </div>
                <Badge variant="outline" className="bg-orange-50 text-orange-800 border-orange-200">
                  {filteredIndependentBrokers.length} brokers directos
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {filteredIndependentBrokers.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No hay brokers directos independientes registrados.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredIndependentBrokers.map((broker: any) => (
                    <div 
                      key={broker.id}
                      className="p-4 border border-gray-200 rounded-lg flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-orange-100 text-orange-800 font-bold">
                            {broker.firstName?.[0]}{broker.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm text-gray-900">
                            {broker.firstName} {broker.lastName}
                          </p>
                          <p className="text-xs text-neutral">{broker.email}</p>
                          {broker.clabe ? (
                            <p className="text-[11px] text-green-700 font-mono mt-0.5">✓ CLABE Registrada</p>
                          ) : (
                            <p className="text-[11px] text-orange-600 font-medium mt-0.5">Sin CLABE registrada</p>
                          )}
                        </div>
                      </div>
                      <Badge variant={broker.isActive ? "default" : "secondary"} className="text-xs">
                        {broker.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. VISTA DE MI RED DIRECTA (SUPER ADMIN COMO CASA MATRIZ) */}
        <TabsContent value="admin_network" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <i className="fas fa-crown text-yellow-500"></i>
                    Red Directa de Casa Matriz (Super Admin)
                  </CardTitle>
                  <p className="text-xs text-neutral mt-0.5">
                    Brokers que están directamente asociados a tu red interna de administración.
                  </p>
                </div>
                <Button 
                  size="sm"
                  className="bg-primary text-white hover:bg-primary-dark text-xs"
                  onClick={() => {
                    setInviteMasterBrokerId(user?.id || null);
                    setShowInviteModal(true);
                  }}
                >
                  <i className="fas fa-user-plus mr-1.5"></i>
                  Invitar a Mi Red
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filteredAdminBrokers.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                  <p className="font-medium text-gray-700">No tienes brokers directos asignados a tu red.</p>
                  <p className="text-xs text-neutral mt-1">
                    Puedes invitar brokers con el botón "Invitar a Mi Red" para que operen directamente bajo Casa Matriz.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredAdminBrokers.map((broker: any) => (
                    <div 
                      key={broker.id}
                      className="p-4 border border-green-200 bg-green-50/20 rounded-lg flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10 border border-green-300">
                          <AvatarFallback className="bg-green-700 text-white font-bold">
                            {broker.firstName?.[0]}{broker.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm text-gray-900">
                            {broker.firstName} {broker.lastName}
                          </p>
                          <p className="text-xs text-neutral">{broker.email}</p>
                          <p className="text-[11px] text-green-800 font-semibold mt-0.5">Broker Directo de Casa Matriz</p>
                        </div>
                      </div>
                      <Badge variant={broker.isActive ? "default" : "secondary"} className="text-xs">
                        {broker.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <InviteBrokerModal 
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
    </div>
  );
}
