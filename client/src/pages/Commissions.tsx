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
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const statusConfig = {
  pending: { label: "Pendiente", color: "bg-warning/10 text-warning" },
  paid: { label: "Pagado", color: "bg-success/10 text-success" },
  advance_requested: { label: "Adelanto Solicitado", color: "bg-primary/10 text-primary" },
  advance_paid: { label: "Adelanto Pagado", color: "bg-secondary/10 text-secondary" },
};

const commissionTypeLabels: Record<string, string> = {
  apertura: "Apertura",
  sobretasa: "Sobretasa",
  renovacion: "Renovación",
  total: "Total",
};

export default function Commissions() {
  const { user } = useAuth();
  const canProcessPayments = user?.role === 'admin' || user?.role === 'super_admin';
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedCommission, setSelectedCommission] = useState<any | null>(null);
  const [viewingCommission, setViewingCommission] = useState<any | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'commissions' | 'sobretasa'>('commissions');

  // Check if current user has pending commissions and lacks CLABE
  const needsBankSetup = (user?.role === 'broker' || user?.role === 'master_broker') && 
    !user?.clabe && 
    (commissions?.some(c => c.status === 'pending') || false);

  const { data: financialInstitutions = [] } = useQuery<any[]>({
    queryKey: ["/api/financial-institutions"],
  });

  const activeInstitutions = financialInstitutions.filter((f: any) => f.isActive !== false);
  const filteredInstitutions = activeInstitutions.filter((f: any) =>
    f.name.toLowerCase().includes(ratesSearchTerm.toLowerCase())
  );

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: commissions, isLoading } = useQuery<any[]>({
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

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const response = await apiRequest("POST", `/api/commissions/${id}/mark-paid`, { notes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commissions"] });
      toast({
        title: "Comisión Pagada",
        description: "La comisión fue marcada como pagada correctamente",
      });
      setSelectedCommission(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el estado de la comisión",
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
          {/* Alerta de cuenta bancaria pendiente */}
          {needsBankSetup && (
            <div className="mb-6 p-4 bg-orange-50 border-2 border-orange-300 rounded-xl flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-exclamation-triangle text-orange-600 text-lg"></i>
                </div>
                <div>
                  <h4 className="font-bold text-orange-900 text-sm">¡Tienes comisiones pendientes por cobrar!</h4>
                  <p className="text-xs text-orange-800">
                    Aún no has registrado tu cuenta bancaria (CLABE) para que la administración pueda dispersar tus pagos.
                  </p>
                </div>
              </div>
              <Button 
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-9"
                onClick={() => setLocation('/configuracion')}
              >
                <i className="fas fa-university mr-1.5"></i>
                Registrar CLABE ahora
              </Button>
            </div>
          )}

          {/* Selector de Pestañas para Super Admin */}
          {(user?.role === 'admin' || user?.role === 'super_admin') && (
            <div className="flex gap-2 mb-6 border-b pb-3">
              <Button
                variant={activeTab === 'commissions' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('commissions')}
                className={activeTab === 'commissions' ? 'bg-primary text-white' : ''}
              >
                <i className="fas fa-users-cog mr-2"></i>
                Comisiones de Red & Brokers
              </Button>
              <Button
                variant={activeTab === 'sobretasa' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('sobretasa')}
                className={activeTab === 'sobretasa' ? 'bg-purple-700 text-white hover:bg-purple-800' : 'text-purple-800 border-purple-300'}
              >
                <i className="fas fa-percentage mr-2"></i>
                Control de Sobretasa (Financieras)
              </Button>
            </div>
          {/* Contenido de Comisiones Normales */}
          {activeTab === 'commissions' && (
            <>
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
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    className="border-primary text-primary hover:bg-primary/10"
                    onClick={() => setShowRatesModal(true)}
                    data-testid="button-view-commission-rates"
                  >
                    <i className="fas fa-table mr-2"></i>
                    Esquema de Comisiones
                  </Button>

                  <Button 
                    className="bg-primary text-white hover:bg-primary-dark"
                    onClick={() => {
                      alert("⏳ Próximamente\n\nEsta opción estará disponible pronto. Estamos trabajando para que puedas solicitar adelantos sobre tus comisiones directamente desde la plataforma.");
                    }}
                  >
                    <i className="fas fa-bolt mr-2"></i>
                    Solicitar Adelanto
                  </Button>
                </div>
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
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50/80 transition-colors cursor-pointer"
                      onClick={() => setViewingCommission(commission)}
                      data-testid={`commission-${commission.id}`}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                          <i className="fas fa-dollar-sign text-lg"></i>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            ${parseFloat(commission.amount).toLocaleString('es-MX')} MXN
                          </h3>
                          <div className="flex items-center gap-2 flex-wrap text-xs text-neutral mt-0.5">
                            <span className="font-medium text-gray-700">
                              {commission.client ? (commission.client.businessName || `${commission.client.firstName || ''} ${commission.client.lastName || ''}`.trim()) : 'Cliente'}
                            </span>
                            {commission.financialInstitution && (
                              <>
                                <span>•</span>
                                <span className="text-gray-600">{commission.financialInstitution.name}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>Tipo: {commissionTypeLabels[commission.commissionType || ""] || (commission.commissionType || "Sin tipo")}</span>
                          </div>
                          {(commission.broker || commission.masterBroker) && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {commission.broker && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-gray-50 text-gray-700 border-gray-300">
                                  <i className="fas fa-user-tie text-[9px] mr-1 text-primary"></i>
                                  {commission.broker.firstName} {commission.broker.lastName}
                                </Badge>
                              )}
                              {commission.masterBroker && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-purple-50 text-purple-700 border-purple-200">
                                  <i className="fas fa-network-wired text-[9px] mr-1"></i>
                                  MB: {commission.masterBroker.brandName || `${commission.masterBroker.firstName} ${commission.masterBroker.lastName}`}
                                </Badge>
                              )}
                            </div>
                          )}
                          <p className="text-[11px] text-gray-400 mt-1">
                            ID: {commission.id.slice(-8)} • {formatDistanceToNow(new Date(commission.createdAt!), { 
                              addSuffix: true, 
                              locale: es 
                            })}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right space-y-2 flex flex-col items-end" onClick={(e) => e.stopPropagation()}>
                        <Badge 
                          className={statusConfig[commission.status as keyof typeof statusConfig]?.color || "bg-gray-100 text-gray-800"}
                          data-testid={`commission-status-${commission.id}`}
                        >
                          {statusConfig[commission.status as keyof typeof statusConfig]?.label || commission.status}
                        </Badge>
                        
                        {commission.status === 'pending' && canProcessPayments && (
                          <div className="flex items-center gap-2">
                            <Button 
                              size="sm"
                              variant="outline"
                              className="text-xs border-success text-success hover:bg-success/10"
                              onClick={() => markPaidMutation.mutate({ id: commission.id })}
                              disabled={markPaidMutation.isPending}
                              title="Marcar como pagada sin procesar transferencia STP"
                              data-testid={`button-mark-paid-${commission.id}`}
                            >
                              <i className="fas fa-check mr-1"></i>
                              Marcar Pagada
                            </Button>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button 
                                  size="sm"
                                  className="bg-success text-white hover:bg-green-700 text-xs"
                                  onClick={() => {
                                    setSelectedCommission(commission);
                                    setAccountNumber(commission.effectiveBankAccount?.clabe || "");
                                  }}
                                  data-testid={`button-pay-${commission.id}`}
                                >
                                  <i className="fas fa-credit-card mr-1"></i>
                                  Pagar STP
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <i className="fas fa-university text-primary"></i>
                                    Procesar Dispersión STP
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-1">
                                  <div className="bg-primary/5 p-3.5 rounded-lg flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-neutral">Monto de Comisión a Dispersar:</p>
                                      <p className="text-xl text-primary font-bold">
                                        ${parseFloat(commission.amount).toLocaleString('es-MX')} MXN
                                      </p>
                                    </div>
                                    <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                                      STP SPEI
                                    </Badge>
                                  </div>

                                  {/* Información Bancaria Pre-cargada */}
                                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2 text-xs">
                                    <p className="font-bold text-gray-700 uppercase tracking-wider text-[10px]">
                                      Cuenta Destino {commission.effectiveBankAccount?.beneficiaryType === 'master_broker' ? '(Master Broker)' : '(Broker Directo)'}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <span className="text-gray-500">Beneficiario:</span>
                                        <p className="font-semibold text-gray-900 truncate">
                                          {commission.effectiveBankAccount?.beneficiaryName || 'No registrado'}
                                        </p>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Banco:</span>
                                        <p className="font-semibold text-gray-900">
                                          {commission.effectiveBankAccount?.bankName || 'No registrado'}
                                        </p>
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">CLABE Interbancaria Registrada:</span>
                                      <p className="font-mono font-semibold text-gray-900 text-xs">
                                        {commission.effectiveBankAccount?.clabe || (
                                          <span className="text-orange-600 font-normal">Sin CLABE registrada en el perfil</span>
                                        )}
                                      </p>
                                    </div>
                                  </div>

                                  {!commission.effectiveBankAccount?.clabe && (
                                    <div className="bg-orange-50 border border-orange-200 p-2.5 rounded-lg text-xs text-orange-800 flex items-start gap-2">
                                      <i className="fas fa-exclamation-triangle mt-0.5 text-orange-600"></i>
                                      <span>El beneficiario aún no ha registrado sus datos bancarios en Configuración. Puedes ingresar la CLABE manualmente a continuación.</span>
                                    </div>
                                  )}

                                  <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                      CLABE para la Transferencia (18 dígitos)
                                    </label>
                                    <Input
                                      placeholder="012345678901234567"
                                      value={accountNumber}
                                      onChange={(e) => setAccountNumber(e.target.value)}
                                      maxLength={18}
                                      data-testid="input-account-number"
                                      className="font-mono text-sm"
                                    />
                                  </div>

                                  <div className="flex justify-end space-x-3 pt-2">
                                    <Button variant="outline" size="sm" onClick={() => setSelectedCommission(null)}>
                                      Cancelar
                                    </Button>
                                    <Button 
                                      size="sm"
                                      onClick={handlePayment}
                                      disabled={!accountNumber || accountNumber.length < 18 || paymentMutation.isPending}
                                      className="bg-success text-white hover:bg-green-700 text-xs"
                                      data-testid="button-confirm-payment"
                                    >
                                      {paymentMutation.isPending && <i className="fas fa-spinner fa-spin mr-1.5"></i>}
                                      Confirmar y Dispersar STP
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        )}
                        
                        {commission.paidAt && (
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
          {/* Vista de Sobretasas para Super Admin */}
          {activeTab === 'sobretasa' && (user?.role === 'admin' || user?.role === 'super_admin') ? (
            <div className="space-y-6">
              {/* Resumen de Sobretasa */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border border-purple-200 bg-purple-50/40">
                  <CardContent className="p-6">
                    <p className="text-xs font-semibold text-purple-900 uppercase">Sobretasa Total Generada</p>
                    <p className="text-2xl font-bold text-purple-900 mt-1">
                      ${commissions?.reduce((sum, c) => {
                        const creditAmount = parseFloat(c.credit?.amount || '0');
                        const overRate = parseFloat(c.financialInstitution?.overRate || '1.0');
                        return sum + (creditAmount * (overRate / 100));
                      }, 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN
                    </p>
                    <p className="text-xs text-purple-700 mt-1">Monto por cobrar a financieras</p>
                  </CardContent>
                </Card>

                <Card className="border border-blue-200 bg-blue-50/40">
                  <CardContent className="p-6">
                    <p className="text-xs font-semibold text-blue-900 uppercase">Créditos con Sobretasa</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1">
                      {commissions?.filter(c => c.credit).length || 0} operaciones
                    </p>
                    <p className="text-xs text-blue-700 mt-1">Colocaciones activas</p>
                  </CardContent>
                </Card>

                <Card className="border border-green-200 bg-green-50/40">
                  <CardContent className="p-6">
                    <p className="text-xs font-semibold text-green-900 uppercase">Estatus de Cobranza</p>
                    <p className="text-2xl font-bold text-green-800 mt-1">Al día</p>
                    <p className="text-xs text-green-700 mt-1">Facturación mensual a financieras</p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabla de Sobretasa por Operación */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <i className="fas fa-file-invoice-dollar text-purple-700"></i>
                    Seguimiento de Pagos de Sobretasa por Financiera
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead className="bg-gray-100 text-gray-700 text-xs font-semibold uppercase">
                        <tr>
                          <th className="p-3 border-b">Crédito ID / Fecha</th>
                          <th className="p-3 border-b">Financiera</th>
                          <th className="p-3 border-b">Cliente</th>
                          <th className="p-3 border-b">Broker Originador</th>
                          <th className="p-3 border-b text-right">Monto Dispersado</th>
                          <th className="p-3 border-b text-center">% Sobretasa</th>
                          <th className="p-3 border-b text-right text-purple-800 font-bold">Sobretasa a Cobrar</th>
                          <th className="p-3 border-b text-center">Estatus Pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissions?.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-6 text-center text-gray-500">
                              No hay créditos colocados para cálculo de sobretasa.
                            </td>
                          </tr>
                        ) : (
                          commissions?.map((c) => {
                            const creditAmount = parseFloat(c.credit?.amount || '0');
                            const overRate = parseFloat(c.financialInstitution?.overRate || '1.0');
                            const overRateAmount = creditAmount * (overRate / 100);
                            return (
                              <tr key={c.id} className="border-b hover:bg-gray-50/80">
                                <td className="p-3 font-mono text-xs">
                                  #{c.credit?.id?.slice(-8) || c.id.slice(-8)}
                                  <p className="text-[11px] text-gray-400">
                                    {new Date(c.createdAt).toLocaleDateString('es-MX')}
                                  </p>
                                </td>
                                <td className="p-3 font-semibold text-gray-900">
                                  {c.financialInstitution?.name || 'Financiera'}
                                </td>
                                <td className="p-3">
                                  {c.client ? (c.client.businessName || `${c.client.firstName || ''} ${c.client.lastName || ''}`.trim()) : 'Cliente'}
                                </td>
                                <td className="p-3">
                                  {c.broker ? `${c.broker.firstName} ${c.broker.lastName}` : 'Broker'}
                                  {c.masterBroker && (
                                    <p className="text-[10px] text-purple-700">MB: {c.masterBroker.brandName || c.masterBroker.firstName}</p>
                                  )}
                                </td>
                                <td className="p-3 text-right font-medium">
                                  ${creditAmount.toLocaleString('es-MX')} MXN
                                </td>
                                <td className="p-3 text-center font-bold text-purple-700">
                                  {overRate}%
                                </td>
                                <td className="p-3 text-right font-bold text-purple-900">
                                  ${overRateAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                                </td>
                                <td className="p-3 text-center">
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-xs">
                                    Por Conciliar
                                  </Badge>
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
          ) : null}
        </main>

        {/* Modal de Esquema de Comisiones por Financiera */}
        <Dialog open={showRatesModal} onOpenChange={setShowRatesModal}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <i className="fas fa-percentage text-primary"></i>
                Esquema de Porcentajes de Comisión por Financiera
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 flex-1 overflow-hidden flex flex-col pt-2">
              <div className="flex items-center justify-between gap-4">
                <Input
                  placeholder="Buscar financiera..."
                  value={ratesSearchTerm}
                  onChange={(e) => setRatesSearchTerm(e.target.value)}
                  className="max-w-xs"
                />
                <Badge variant="outline" className="text-xs bg-gray-50">
                  Rol activo: <span className="font-semibold ml-1 capitalize">{user?.role?.replace('_', ' ')}</span>
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-gray-100 text-gray-700 text-xs font-semibold sticky top-0 uppercase">
                    <tr>
                      <th className="p-3 border-b">Financiera</th>
                      {(user?.role === 'admin' || user?.role === 'super_admin') && (
                        <>
                          <th className="p-3 border-b text-center bg-blue-50 text-blue-900">Total F.</th>
                          <th className="p-3 border-b text-center bg-blue-50 text-blue-900">Apertura F.</th>
                          <th className="p-3 border-b text-center bg-blue-50 text-blue-900">Sobretasa F.</th>
                          <th className="p-3 border-b text-center bg-blue-50 text-blue-900">Renovación F.</th>
                        </>
                      )}
                      {(user?.role === 'master_broker' || user?.role === 'admin' || user?.role === 'super_admin') && (
                        <>
                          {(user?.role === 'admin' || user?.role === 'super_admin') && (
                            <th className="p-3 border-b text-center bg-green-50 text-green-900">Total MB</th>
                          )}
                          <th className="p-3 border-b text-center bg-green-50 text-green-900">Apertura MB</th>
                          {(user?.role === 'admin' || user?.role === 'super_admin') && (
                            <th className="p-3 border-b text-center bg-green-50 text-green-900">Sobretasa MB</th>
                          )}
                          <th className="p-3 border-b text-center bg-green-50 text-green-900">Renovación MB</th>
                        </>
                      )}
                      <th className="p-3 border-b text-center bg-purple-50 text-purple-900">Apertura Broker</th>
                      {(user?.role === 'admin' || user?.role === 'super_admin') && (
                        <th className="p-3 border-b text-center bg-purple-50 text-purple-900">Sobretasa Broker</th>
                      )}
                      <th className="p-3 border-b text-center bg-purple-50 text-purple-900">Renovación Broker</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredInstitutions.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-8 text-neutral">
                          No hay financieras registradas
                        </td>
                      </tr>
                    ) : (
                      filteredInstitutions.map((fi: any) => {
                        const comm = fi.commissionRates || {};
                        const fin = comm.financiera || {};
                        const mb = comm.masterBroker || {};
                        const brk = comm.broker || {};

                        return (
                          <tr key={fi.id} className="hover:bg-gray-50/80 transition-colors">
                            <td className="p-3 font-medium text-gray-900 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <i className="fas fa-building text-gray-400 text-xs"></i>
                                {fi.name}
                              </div>
                            </td>
                            {(user?.role === 'admin' || user?.role === 'super_admin') && (
                              <>
                                <td className="p-3 text-center font-semibold text-blue-700 bg-blue-50/30">
                                  {fin.total !== undefined ? `${fin.total}%` : '-'}
                                </td>
                                <td className="p-3 text-center text-blue-600 bg-blue-50/30">
                                  {fin.apertura !== undefined ? `${fin.apertura}%` : '-'}
                                </td>
                                <td className="p-3 text-center text-blue-600 bg-blue-50/30">
                                  {fin.sobretasa !== undefined ? `${fin.sobretasa}%` : '-'}
                                </td>
                                <td className="p-3 text-center text-blue-600 bg-blue-50/30">
                                  {fin.renovacion !== undefined ? `${fin.renovacion}%` : '-'}
                                </td>
                              </>
                            )}
                            {(user?.role === 'master_broker' || user?.role === 'admin' || user?.role === 'super_admin') && (
                              <>
                                {(user?.role === 'admin' || user?.role === 'super_admin') && (
                                  <td className="p-3 text-center font-semibold text-green-700 bg-green-50/30">
                                    {mb.total !== undefined ? `${mb.total}%` : '-'}
                                  </td>
                                )}
                                <td className="p-3 text-center text-green-700 font-medium bg-green-50/30">
                                  {mb.apertura !== undefined ? `${mb.apertura}%` : '-'}
                                </td>
                                {(user?.role === 'admin' || user?.role === 'super_admin') && (
                                  <td className="p-3 text-center text-green-600 bg-green-50/30">
                                    {mb.sobretasa !== undefined ? `${mb.sobretasa}%` : '-'}
                                  </td>
                                )}
                                <td className="p-3 text-center text-green-600 bg-green-50/30">
                                  {mb.renovacion !== undefined ? `${mb.renovacion}%` : '-'}
                                </td>
                              </>
                            )}
                            <td className="p-3 text-center text-purple-700 font-semibold bg-purple-50/30">
                              {brk.apertura !== undefined ? `${brk.apertura}%` : '-'}
                            </td>
                            {(user?.role === 'admin' || user?.role === 'super_admin') && (
                              <td className="p-3 text-center text-purple-600 bg-purple-50/30">
                                {brk.sobretasa !== undefined ? `${brk.sobretasa}%` : '-'}
                              </td>
                            )}
                            <td className="p-3 text-center text-purple-600 bg-purple-50/30">
                              {brk.renovacion !== undefined ? `${brk.renovacion}%` : '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Detalle de Comisión */}
        <Dialog open={!!viewingCommission} onOpenChange={(open) => !open && setViewingCommission(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <i className="fas fa-receipt text-primary"></i>
                Detalle de Comisión #{viewingCommission?.id?.slice(-8)}
              </DialogTitle>
            </DialogHeader>

            {viewingCommission && (
              <div className="space-y-4 pt-2">
                <div className="bg-primary/5 p-4 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs text-neutral">Monto de Comisión</p>
                    <p className="text-2xl font-bold text-primary">
                      ${parseFloat(viewingCommission.amount || '0').toLocaleString('es-MX')} MXN
                    </p>
                  </div>
                  <Badge className={statusConfig[viewingCommission.status as keyof typeof statusConfig]?.color || "bg-gray-100 text-gray-800"}>
                    {statusConfig[viewingCommission.status as keyof typeof statusConfig]?.label || viewingCommission.status}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-neutral">Tipo de Comisión:</span>
                    <span className="font-medium capitalize">{commissionTypeLabels[viewingCommission.commissionType || ""] || viewingCommission.commissionType || "Apertura"}</span>
                  </div>
                  {viewingCommission.client && (
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-neutral">Cliente:</span>
                      <span className="font-semibold text-gray-900">
                        {viewingCommission.client.businessName || `${viewingCommission.client.firstName || ''} ${viewingCommission.client.lastName || ''}`.trim()}
                      </span>
                    </div>
                  )}
                  {viewingCommission.financialInstitution && (
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-neutral">Financiera:</span>
                      <span className="font-medium">{viewingCommission.financialInstitution.name}</span>
                    </div>
                  )}
                  {viewingCommission.credit && (
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-neutral">Monto del Crédito:</span>
                      <span className="font-medium">${parseFloat(viewingCommission.credit.amount || '0').toLocaleString('es-MX')} MXN</span>
                    </div>
                  )}
                  {viewingCommission.broker && (
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-neutral">Broker:</span>
                      <span className="font-medium">{viewingCommission.broker.firstName} {viewingCommission.broker.lastName}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-neutral">Fecha de Generación:</span>
                    <span>{new Date(viewingCommission.createdAt).toLocaleDateString('es-MX')}</span>
                  </div>
                  {viewingCommission.paidAt && (
                    <div className="flex justify-between py-1 border-b text-success">
                      <span className="font-medium">Fecha de Pago:</span>
                      <span className="font-semibold">{new Date(viewingCommission.paidAt).toLocaleDateString('es-MX')}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2">
                  {viewingCommission.status === 'pending' && canProcessPayments && (
                    <Button 
                      size="sm"
                      className="bg-success text-white hover:bg-green-700 text-xs"
                      onClick={() => {
                        const targetId = viewingCommission.id;
                        setViewingCommission(null);
                        markPaidMutation.mutate({ id: targetId });
                      }}
                      disabled={markPaidMutation.isPending}
                    >
                      <i className="fas fa-check mr-1.5"></i>
                      Marcar Comisión como Pagada
                    </Button>
                  )}
                  <Button variant="outline" className="ml-auto" onClick={() => setViewingCommission(null)}>
                    Cerrar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
