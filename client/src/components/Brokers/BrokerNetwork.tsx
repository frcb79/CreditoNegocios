import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { User } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import InviteBrokerModal from "@/components/Modals/InviteBrokerModal";

export default function BrokerNetworkComponent() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteMasterBrokerId, setInviteMasterBrokerId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedMasterBroker, setExpandedMasterBroker] = useState<string | null>(null);

  const { data: networkData, isLoading } = useQuery<any>({
    queryKey: ["/api/broker-network"],
  });

  if (isLoading) {
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

    if (brokers.length === 0) {
      return (
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
          <InviteBrokerModal 
            isOpen={showInviteModal}
            onClose={() => setShowInviteModal(false)}
          />
        </Card>
      );
    }

    return (
      <div className="space-y-6">
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
            <div className="flex items-center justify-between">
              <CardTitle>Brokers en mi Red</CardTitle>
              <Button 
                className="bg-primary text-white hover:bg-primary-dark"
                onClick={() => {
                  setInviteMasterBrokerId(user?.id || null);
                  setShowInviteModal(true);
                }}
                data-testid="button-invite-broker"
              >
                <i className="fas fa-user-plus mr-2"></i>
                Invitar Broker
              </Button>
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

        <InviteBrokerModal 
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
        />
      </div>
    );
  }

  // Vista exclusiva para SUPER ADMIN / ADMIN
  const masterBrokers = networkData?.masterBrokers || [];
  const independentBrokers = networkData?.independentBrokers || [];
  const adminBrokers = networkData?.adminBrokers || [];
  const allBrokers = networkData?.allBrokers || [];

  const filteredMasterBrokers = masterBrokers.filter((mb: any) => {
    const text = `${mb.firstName} ${mb.lastName} ${mb.email} ${mb.brandName || ''}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  const filteredIndependentBrokers = independentBrokers.filter((b: any) => {
    const text = `${b.firstName} ${b.lastName} ${b.email}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  const filteredAdminBrokers = adminBrokers.filter((b: any) => {
    const text = `${b.firstName} ${b.lastName} ${b.email}`.toLowerCase();
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
                          {mb.networkBrokers.map((broker: any) => (
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
