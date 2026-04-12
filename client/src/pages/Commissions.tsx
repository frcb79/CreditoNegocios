import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Commission } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const statusConfig = {
  pending: { label: "Pendiente", color: "bg-warning/10 text-warning" },
  paid: { label: "Pagado", color: "bg-success/10 text-success" },
  advance_requested: { label: "Adelanto Solicitado", color: "bg-primary/10 text-primary" },
  advance_paid: { label: "Adelanto Pagado", color: "bg-secondary/10 text-secondary" },
};

export default function Commissions() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedCommission, setSelectedCommission] = useState<Commission | null>(null);
  const [accountNumber, setAccountNumber] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: commissions, isLoading } = useQuery<Commission[]>({
    queryKey: ["/api/commissions"],
  });

  const paymentMutation = useMutation({
    mutationFn: async ({ id, accountNumber }: { id: string; accountNumber: string }) => {
      const response = await apiRequest("POST", `/api/commissions/${id}/pay`, { accountNumber });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/commissions"] });
      toast({
        title: "Pago procesado",
        description: `Transacción: ${data.transactionId}`,
      });
      setSelectedCommission(null);
      setAccountNumber("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error en el pago",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePayment = () => {
    if (selectedCommission && accountNumber) {
      paymentMutation.mutate({ 
        id: selectedCommission.id, 
        accountNumber 
      });
    }
  };

  const filteredCommissions = commissions?.filter(commission => {
    const matchesSearch = 
      commission.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      commission.amount.toString().includes(searchTerm);
    
    const matchesStatus = filterStatus === "all" || commission.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  }) || [];

  const totalPending = commissions?.filter(c => c.status === 'pending').reduce((sum, c) => sum + parseFloat(c.amount), 0) || 0;
  const totalPaid = commissions?.filter(c => c.status === 'paid').reduce((sum, c) => sum + parseFloat(c.amount), 0) || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen flex bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header 
            title="Comisiones"
            subtitle="Gestiona tus comisiones y pagos"
          />
          
          <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
              <Skeleton className="h-96 w-full" />
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
          title="Comisiones"
          subtitle="Gestiona tus comisiones y pagos STP"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Comisiones Pendientes</p>
                    <p className="text-2xl font-bold text-warning">
                      ${totalPending.toLocaleString('es-MX')}
                    </p>
                    <p className="text-xs text-neutral mt-1">
                      {commissions?.filter(c => c.status === 'pending').length || 0} pagos pendientes
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-clock text-warning text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Comisiones Pagadas</p>
                    <p className="text-2xl font-bold text-success">
                      ${totalPaid.toLocaleString('es-MX')}
                    </p>
                    <p className="text-xs text-neutral mt-1">
                      {commissions?.filter(c => c.status === 'paid').length || 0} pagos completados
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-check-circle text-success text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-neutral text-sm font-medium">Total Comisiones</p>
                    <p className="text-2xl font-bold text-primary">
                      ${(totalPending + totalPaid).toLocaleString('es-MX')}
                    </p>
                    <p className="text-xs text-neutral mt-1">Este mes</p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-dollar-sign text-primary text-lg"></i>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters and Actions */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div className="flex space-x-4">
                  <div className="w-80">
                    <Input
                      placeholder="Buscar por ID o monto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      data-testid="input-search-commissions"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant={filterStatus === "all" ? "default" : "outline"}
                      onClick={() => setFilterStatus("all")}
                      size="sm"
                    >
                      Todos
                    </Button>
                    <Button
                      variant={filterStatus === "pending" ? "default" : "outline"}
                      onClick={() => setFilterStatus("pending")}
                      size="sm"
                      className={filterStatus === "pending" ? "bg-warning hover:bg-yellow-600" : ""}
                    >
                      Pendientes
                    </Button>
                    <Button
                      variant={filterStatus === "paid" ? "default" : "outline"}
                      onClick={() => setFilterStatus("paid")}
                      size="sm"
                      className={filterStatus === "paid" ? "bg-success hover:bg-green-600" : ""}
                    >
                      Pagados
                    </Button>
                  </div>
                </div>
                
                <Button className="bg-primary text-white hover:bg-primary-dark">
                  <i className="fas fa-bolt mr-2"></i>
                  Solicitar Adelanto
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Commissions List */}
          <Card>
            <CardHeader>
              <CardTitle>Historial de Comisiones ({filteredCommissions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredCommissions.length === 0 ? (
                <div className="text-center py-8">
                  <i className="fas fa-dollar-sign text-4xl text-gray-300 mb-4"></i>
                  <p className="text-neutral mb-4">
                    {commissions?.length === 0 ? "No tienes comisiones registradas" : "No se encontraron comisiones"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCommissions.map((commission) => (
                    <div
                      key={commission.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      data-testid={`commission-${commission.id}`}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
                          <i className="fas fa-dollar-sign text-white"></i>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            ${parseFloat(commission.amount).toLocaleString('es-MX')} MXN
                          </h3>
                          <p className="text-sm text-neutral">ID: {commission.id.slice(-8)}</p>
                          <p className="text-xs text-neutral">
                            {formatDistanceToNow(new Date(commission.createdAt!), { 
                              addSuffix: true, 
                              locale: es 
                            })}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right space-y-2">
                        <Badge 
                          className={statusConfig[commission.status as keyof typeof statusConfig]?.color || "bg-gray-100 text-gray-800"}
                          data-testid={`commission-status-${commission.id}`}
                        >
                          {statusConfig[commission.status as keyof typeof statusConfig]?.label || commission.status}
                        </Badge>
                        
                        {commission.status === 'pending' && (
                          <div>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button 
                                  size="sm"
                                  className="bg-success text-white hover:bg-green-700"
                                  onClick={() => setSelectedCommission(commission)}
                                  data-testid={`button-pay-${commission.id}`}
                                >
                                  <i className="fas fa-credit-card mr-1"></i>
                                  Pagar STP
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Procesar Pago STP</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <p className="font-semibold">Monto a pagar:</p>
                                    <p className="text-2xl text-primary">
                                      ${parseFloat(commission.amount).toLocaleString('es-MX')} MXN
                                    </p>
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium mb-2">
                                      Número de Cuenta (CLABE)
                                    </label>
                                    <Input
                                      placeholder="012345678901234567"
                                      value={accountNumber}
                                      onChange={(e) => setAccountNumber(e.target.value)}
                                      maxLength={18}
                                      data-testid="input-account-number"
                                    />
                                  </div>
                                  <div className="flex justify-end space-x-4">
                                    <Button variant="outline" onClick={() => setSelectedCommission(null)}>
                                      Cancelar
                                    </Button>
                                    <Button 
                                      onClick={handlePayment}
                                      disabled={!accountNumber || paymentMutation.isPending}
                                      className="bg-success text-white hover:bg-green-700"
                                      data-testid="button-confirm-payment"
                                    >
                                      {paymentMutation.isPending && <i className="fas fa-spinner fa-spin mr-2"></i>}
                                      Procesar Pago
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        )}
                        
                        {commission.paidAt && (
                          <p className="text-xs text-success">
                            Pagado el {new Date(commission.paidAt).toLocaleDateString('es-MX')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
