import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Client, User } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

interface ClientListProps {
  onSelectClient: (client: Client) => void;
  onNewClient: () => void;
}

export default function ClientList({ onSelectClient, onNewClient }: ClientListProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isMasterBroker = user?.role === 'master_broker';

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterBroker, setFilterBroker] = useState<string>("all");
  const [filterMasterBroker, setFilterMasterBroker] = useState<string>("all");

  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  // Extract brokers and master brokers for filter dropdowns
  const brokerOptions = (allUsers || []).filter(u => u.role === 'broker');
  const masterBrokerOptions = (allUsers || []).filter(u => u.role === 'master_broker');

  const filteredClients = clients?.filter(client => {
    const matchesSearch = 
      client.businessName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.rfc?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === "all" || client.type === filterType;

    const matchesBroker = filterBroker === "all" || 
      client.brokerId === filterBroker || 
      (client as any).broker?.id === filterBroker;

    const matchesMasterBroker = filterMasterBroker === "all" || 
      (client as any).masterBroker?.id === filterMasterBroker ||
      (client as any).broker?.masterBrokerId === filterMasterBroker;
    
    return matchesSearch && matchesType && matchesBroker && matchesMasterBroker;
  }) || [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Clientes ({filteredClients.length})</CardTitle>
          <Button 
            onClick={onNewClient}
            className="bg-primary text-white hover:bg-primary-dark"
            data-testid="button-new-client"
          >
            <i className="fas fa-plus mr-2"></i>
            Nuevo Cliente
          </Button>
        </div>
        
        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className={isAdmin ? "lg:col-span-1" : "sm:col-span-2 lg:col-span-3"}>
            <Input
              placeholder="Buscar por nombre, razón social o RFC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-clients"
              className="placeholder:text-gray-400"
            />
          </div>
          <div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger data-testid="select-client-type">
                <SelectValue placeholder="Tipo de cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los Tipos</SelectItem>
                <SelectItem value="fisica">Personas Físicas</SelectItem>
                <SelectItem value="persona_moral">Personas Morales</SelectItem>
                <SelectItem value="fisica_empresarial">PFAE</SelectItem>
                <SelectItem value="sin_sat">Sin SAT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isAdmin && (
            <>
              <div>
                <Select value={filterMasterBroker} onValueChange={setFilterMasterBroker}>
                  <SelectTrigger data-testid="select-master-broker">
                    <SelectValue placeholder="Master Broker" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los Master Brokers</SelectItem>
                    {masterBrokerOptions.map((mb) => (
                      <SelectItem key={mb.id} value={mb.id}>
                        {mb.brandName || `${mb.firstName} ${mb.lastName}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select value={filterBroker} onValueChange={setFilterBroker}>
                  <SelectTrigger data-testid="select-broker">
                    <SelectValue placeholder="Broker" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los Brokers</SelectItem>
                    {brokerOptions.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.firstName} {b.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {filteredClients.length === 0 ? (
          <div className="text-center py-8">
            <i className="fas fa-users text-4xl text-gray-300 mb-4"></i>
            <p className="text-neutral mb-4">
              {clients?.length === 0 ? "No tienes clientes registrados" : "No se encontraron clientes"}
            </p>
            <Button 
              onClick={onNewClient}
              className="bg-primary text-white hover:bg-primary-dark"
            >
              <i className="fas fa-plus mr-2"></i>
              Agregar primer cliente
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredClients.map((client) => (
              <div
                key={client.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelectClient(client)}
                data-testid={`client-${client.id}`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    client.type === 'persona_moral' ? 'bg-blue-100 text-blue-700' :
                    client.type === 'fisica_empresarial' ? 'bg-purple-100 text-purple-700' :
                    client.type === 'fisica' ? 'bg-green-100 text-green-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    <span className="font-semibold text-sm">
                      {client.type === 'persona_moral' 
                        ? client.businessName?.slice(0, 2).toUpperCase()
                        : `${client.firstName?.[0]}${client.lastName?.[0]}`
                      }
                    </span>
                  </div>
                  <div>
                    {client.type === 'persona_moral' ? (
                      <>
                        <h3 className="font-semibold text-gray-900" data-testid={`client-name-${client.id}`}>
                          {client.businessName}
                        </h3>
                        <p className="text-sm text-neutral">RFC: {client.rfc || 'No proporcionado'}</p>
                      </>
                    ) : (
                      <>
                        <h3 className="font-semibold text-gray-900" data-testid={`client-name-${client.id}`}>
                          {client.firstName} {client.lastName}
                        </h3>
                        <p className="text-sm text-neutral">RFC: {client.rfc || 'No proporcionado'}</p>
                      </>
                    )}
                    {client.phone && (
                      <p className="text-xs text-neutral">{client.phone}</p>
                    )}
                    {((client as any).broker || (client as any).masterBroker) && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {(client as any).broker && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-gray-50 text-gray-700 border-gray-300">
                            <i className="fas fa-user-tie text-[9px] mr-1 text-primary"></i>
                            {(client as any).broker.firstName} {(client as any).broker.lastName}
                          </Badge>
                        )}
                        {(client as any).masterBroker && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-purple-50 text-purple-700 border-purple-200">
                            <i className="fas fa-network-wired text-[9px] mr-1"></i>
                            MB: {(client as any).masterBroker.brandName || `${(client as any).masterBroker.firstName} ${(client as any).masterBroker.lastName}`}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-right flex flex-col items-end space-y-1">
                  <Badge 
                    variant="outline"
                    className={
                      client.type === 'persona_moral' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      client.type === 'fisica_empresarial' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      client.type === 'fisica' ? 'bg-green-50 text-green-700 border-green-200' :
                      'bg-orange-50 text-orange-700 border-orange-200'
                    }
                    data-testid={`client-type-${client.id}`}
                  >
                    {client.type === 'persona_moral' ? 'PM' :
                     client.type === 'fisica_empresarial' ? 'PFAE' :
                     client.type === 'fisica' ? 'PF' :
                     'Sin SAT'}
                  </Badge>
                  {client.type === 'fisica' && client.puesto && (
                    <p className="text-xs text-neutral">{client.puesto}</p>
                  )}
                  {client.type !== 'fisica' && client.industry && (
                    <p className="text-xs text-neutral">{client.industry}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
