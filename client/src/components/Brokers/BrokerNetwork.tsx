import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import InviteBrokerModal from "@/components/Modals/InviteBrokerModal";

export default function BrokerNetworkComponent() {
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  const { data: brokers, isLoading } = useQuery<User[]>({
    queryKey: ["/api/broker-network"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mi Red de Brokers</CardTitle>
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

  if (!brokers || brokers.length === 0) {
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
              onClick={() => setShowInviteModal(true)}
            >
              <i className="fas fa-plus mr-2"></i>
              Invitar Broker
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Network Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen de la Red</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-users text-primary text-2xl"></i>
              </div>
              <p className="text-2xl font-bold text-gray-900">{brokers.length}</p>
              <p className="text-sm text-neutral">Brokers Activos</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-dollar-sign text-success text-2xl"></i>
              </div>
              <p className="text-2xl font-bold text-gray-900">$45,230</p>
              <p className="text-sm text-neutral">Comisiones Generadas</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="fas fa-credit-card text-warning text-2xl"></i>
              </div>
              <p className="text-2xl font-bold text-gray-900">127</p>
              <p className="text-sm text-neutral">Créditos Colocados</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Broker List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Brokers en mi Red</CardTitle>
            <Button 
              className="bg-primary text-white hover:bg-primary-dark"
              onClick={() => setShowInviteModal(true)}
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
                      Unido {formatDistanceToNow(new Date(broker.createdAt!), { 
                        addSuffix: true, 
                        locale: es 
                      })}
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
                  <div className="mt-2 space-x-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        // TODO: Implementar vista detallada del broker
                        alert(`Ver detalles de ${broker.firstName} ${broker.lastName} próximamente`);
                      }}
                      data-testid={`button-view-broker-${broker.id}`}
                    >
                      <i className="fas fa-eye mr-1"></i>
                      Ver
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        // TODO: Implementar gestión del broker
                        alert(`Gestionar ${broker.firstName} ${broker.lastName} próximamente`);
                      }}
                      data-testid={`button-manage-broker-${broker.id}`}
                    >
                      <i className="fas fa-edit mr-1"></i>
                      Gestionar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {/* Invite Broker Modal */}
      <InviteBrokerModal 
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
    </div>
  );
}
