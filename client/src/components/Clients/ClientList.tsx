import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Client } from "@shared/schema";

interface ClientListProps {
  onSelectClient: (client: Client) => void;
  onNewClient: () => void;
}

export default function ClientList({ onSelectClient, onNewClient }: ClientListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const filteredClients = clients?.filter(client => {
    const matchesSearch = 
      client.businessName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.rfc?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === "all" || client.type === filterType;
    
    return matchesSearch && matchesType;
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
        <div className="flex space-x-4 mt-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar por nombre, razón social o RFC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-clients"
              className="placeholder:text-gray-400"
            />
          </div>
          <div className="w-48">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger data-testid="select-client-type">
                <SelectValue placeholder="Tipo de cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="fisica">Personas Físicas</SelectItem>
                <SelectItem value="persona_moral">Personas Morales</SelectItem>
                <SelectItem value="fisica_empresarial">PFAE</SelectItem>
                <SelectItem value="sin_sat">Sin SAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
