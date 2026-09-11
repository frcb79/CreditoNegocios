import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
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
import CommissionBulkUploader from "@/components/Commissions/CommissionBulkUploader";

const statusConfig = {
  pending: { label: "Pendiente", color: "bg-amber-100 text-amber-800 border-amber-300" },
  paid: { label: "Pagado", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  advance_requested: { label: "Adelanto Solicitado", color: "bg-blue-100 text-blue-800 border-blue-300" },
  advance_paid: { label: "Adelanto Pagado", color: "bg-purple-100 text-purple-800 border-purple-300" },
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
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("creditId") || params.get("search") || "";
    }
    return "";
  });
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const filter = params.get("filter");
      if (filter === "pending") return "pending";
      if (filter === "paid") return "paid";
    }
    return "all";
  });
  const [selectedCommission, setSelectedCommission] = useState<any | null>(null);
  const [viewingCommission, setViewingCommission] = useState<any | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [ratesSearchTerm, setRatesSearchTerm] = useState("");
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'commissions' | 'sobretasa' | 'importar-comisiones'>('commissions');

  const safeFloat = (val: any, fallback = 0): number => {
    if (val === null || val === undefined || val === '') return fallback;
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? fallback : n;
  };

  const getSobretasaRate = (c: any): number => {
    const proposalRate = c.credit?.finalProposal?.commissionRates?.superAdmin?.sobretasa;
    if (proposalRate !== undefined && proposalRate !== null && !isNaN(Number(proposalRate))) {
      return Number(proposalRate);
    }
    const instSuperAdminRate = c.financialInstitution?.commissionRates?.superAdmin?.sobretasa;
    if (instSuperAdminRate !== undefined && instSuperAdminRate !== null && !isNaN(Number(instSuperAdminRate))) {
      return Number(instSuperAdminRate);
    }
    const instOverRate = c.financialInstitution?.overrateCommissionRate || c.financialInstitution?.overRate;
    if (instOverRate !== undefined && instOverRate !== null && !isNaN(Number(instOverRate))) {
      return Number(instOverRate);
    }
    return 5.0; // Default standard sobretasa in the platform (5.0%)
  };

  const { data: commissionsData, isLoading, isError, error, refetch } = useQuery<any[]>({
    queryKey: ["/api/commissions"],
  });

  const commissions = Array.isArray(commissionsData) ? commissionsData : [];

  // Check if current user has pending commissions and lacks CLABE
  const needsBankSetup = (user?.role === 'broker' || user?.role === 'master_broker') && 
    !user?.clabe && 
    (commissions.some(c => c.status === 'pending') || false);

  const { data: financialInstitutions = [] } = useQuery<any[]>({
    queryKey: ["/api/financial-institutions"],
  });

  const activeInstitutions = financialInstitutions.filter((f: any) => f.isActive !== false);
  const filteredInstitutions = activeInstitutions.filter((f: any) =>
    (f.name || "").toLowerCase().includes(ratesSearchTerm.toLowerCase())
  );

  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const filteredCommissions = commissions.filter(commission => {
    const commId = String(commission.id || "").toLowerCase();
    const commCreditId = String(commission.creditId || "").toLowerCase();
    const commTargetId = String(commission.targetId || "").toLowerCase();
    const commSubmissionId = String(commission.credit?.submissionId || commission.credit?.linkedSubmissionId || "").toLowerCase();
    const commAmount = String(commission.amount ?? "");
    const brokerName = `${commission.broker?.firstName || ''} ${commission.broker?.lastName || ''}`.toLowerCase();
    const clientObj = commission.client || commission.credit?.client;
    const clientName = `${clientObj?.businessName || clientObj?.firstName || ''} ${clientObj?.lastName || ''}`.toLowerCase();
    const fiName = `${commission.financialInstitution?.name || ''}`.toLowerCase();
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = !searchTerm ||
      commId.includes(searchLower) ||
      commCreditId.includes(searchLower) ||
      commTargetId.includes(searchLower) ||
      commSubmissionId.includes(searchLower) ||
      brokerName.includes(searchLower) ||
      clientName.includes(searchLower) ||
      fiName.includes(searchLower) ||
      commAmount.includes(searchLower);
    
    const matchesStatus = filterStatus === "all" || commission.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const isSuperAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isMasterBrokerRole = user?.role === 'master_broker';
  const isBrokerRole = user?.role === 'broker';

  // Helper for network payout (Option B: To Master Broker if exists, else to Broker)
  const getPayoutAmount = (c: any): number => {
    const isMb = c.masterBrokerId && safeFloat(c.masterBrokerShare) > 0;
    return isMb 
      ? (safeFloat(c.masterBrokerShare) + safeFloat(c.brokerShare)) 
      : (safeFloat(c.brokerShare) || safeFloat(c.amount));
  };

  // Super Admin figures
  const totalGrossFinancieras = useMemo(() => {
    return commissions.reduce((sum, c) => sum + safeFloat(c.amount), 0);
  }, [commissions]);

  const totalPendingPayout = useMemo(() => {
    return commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + getPayoutAmount(c), 0);
  }, [commissions]);

  const totalPaidPayout = useMemo(() => {
    return commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + getPayoutAmount(c), 0);
  }, [commissions]);

  // Master Broker figures
  const mbGrossFromPlatform = useMemo(() => {
    return commissions.reduce((sum, c) => sum + safeFloat(c.masterBrokerShare) + safeFloat(c.brokerShare), 0);
  }, [commissions]);

  const mbOwedToBrokers = useMemo(() => {
    return commissions.reduce((sum, c) => sum + safeFloat(c.brokerShare), 0);
  }, [commissions]);

  const mbNetEarnings = useMemo(() => {
    return commissions.reduce((sum, c) => sum + safeFloat(c.masterBrokerShare), 0);
  }, [commissions]);

  const mbNetPending = useMemo(() => {
    return commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + safeFloat(c.masterBrokerShare), 0);
  }, [commissions]);

  const mbNetPaid = useMemo(() => {
    return commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + safeFloat(c.masterBrokerShare), 0);
  }, [commissions]);

  // Broker Direct figures
  const brokerTotalPending = useMemo(() => {
    return commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + safeFloat(c.brokerShare || (c.masterBrokerShare ? '0' : c.amount)), 0);
  }, [commissions]);

  const brokerTotalPaid = useMemo(() => {
    return commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + safeFloat(c.brokerShare || (c.masterBrokerShare ? '0' : c.amount)), 0);
  }, [commissions]);

  const brokerTotal = brokerTotalPending + brokerTotalPaid;

  // Active callout pending amounts:
  const totalPending = isSuperAdmin
    ? totalPendingPayout
    : (isMasterBrokerRole ? mbNetPending : brokerTotalPending);

  const totalPaid = isSuperAdmin
    ? totalPaidPayout
    : (isMasterBrokerRole ? mbNetPaid : brokerTotalPaid);

  // Total overRate generated uniquely per credit
  const totalSobretasa = useMemo(() => {
    const seenCredits = new Set<string>();
    return commissions.reduce((sum, c) => {
      if (c.creditId && seenCredits.has(c.creditId)) return sum;
      if (c.creditId) seenCredits.add(c.creditId);
      const creditAmount = safeFloat(c.credit?.amount || c.amount);
      const overRate = getSobretasaRate(c);
      return sum + (creditAmount * (overRate / 100));
    }, 0);
  }, [commissions]);

  // Monthly recurring overRate across all credits
  const totalMonthlySobretasaSinIva = useMemo(() => {
    const seenCredits = new Set<string>();
    return commissions.reduce((sum, c) => {
      if (c.creditId && seenCredits.has(c.creditId)) return sum;
      if (c.creditId) seenCredits.add(c.creditId);
      const creditAmount = safeFloat(c.credit?.amount || c.amount);
      const overRate = getSobretasaRate(c);
      const term = safeFloat(c.credit?.term, 12);
      const totalOver = creditAmount * (overRate / 100);
      return sum + (term > 0 ? totalOver / term : totalOver);
    }, 0);
  }, [commissions]);

  const totalMonthlySobretasaConIva = totalMonthlySobretasaSinIva * 1.16;

  // Platform earnings: App share of opening commissions + Total Sobretasas
  const platformApertura = useMemo(() => {
    return commissions.reduce((sum, c) => sum + safeFloat(c.appShare), 0);
  }, [commissions]);

  const totalPlatformEarnings = platformApertura + totalSobretasa;

  // Master Broker commissions breakdown
  const mbCommissions = useMemo(() => {
    return commissions.filter(c => safeFloat(c.masterBrokerShare) > 0 || c.masterBrokerId);
  }, [commissions]);
  const totalPaidToMB = mbCommissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + safeFloat(c.masterBrokerShare || c.amount), 0);
  const totalPendingToMB = mbCommissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + safeFloat(c.masterBrokerShare || c.amount), 0);

  // Broker direct commissions breakdown
  const brokerCommissions = useMemo(() => {
    return commissions.filter(c => safeFloat(c.brokerShare) > 0 || (!c.masterBrokerId && c.brokerId));
  }, [commissions]);
  const totalPaidToBrokers = brokerCommissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + safeFloat(c.brokerShare || c.amount), 0);
  const totalPendingToBrokers = brokerCommissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + safeFloat(c.brokerShare || c.amount), 0);

  // Broker performance ranking (#13)
  const brokerRankings = useMemo(() => {
    const brokerMap = new Map<string, {
      brokerId: string;
      name: string;
      email: string;
      masterBrokerName: string;
      creditsCount: number;
      totalVolume: number;
      totalCommissions: number;
      paidCommissions: number;
      pendingCommissions: number;
    }>();

    commissions.forEach(c => {
      const bId = c.brokerId || c.broker?.id || 'unknown';
      const bName = c.broker ? `${c.broker.firstName || ''} ${c.broker.lastName || ''}`.trim() : 'Broker Originador';
      const bEmail = c.broker?.email || '';
      const mbName = c.masterBroker ? (c.masterBroker.brandName || `${c.masterBroker.firstName} ${c.masterBroker.lastName}`) : 'Directo (Sin MB)';
      const creditVol = safeFloat(c.credit?.amount);
      const commAmount = safeFloat(c.amount);
      const isPaid = c.status === 'paid';

      if (!brokerMap.has(bId)) {
        brokerMap.set(bId, {
          brokerId: bId,
          name: bName,
          email: bEmail,
          masterBrokerName: mbName,
          creditsCount: 1,
          totalVolume: creditVol,
          totalCommissions: commAmount,
          paidCommissions: isPaid ? commAmount : 0,
          pendingCommissions: !isPaid ? commAmount : 0,
        });
      } else {
        const item = brokerMap.get(bId)!;
        item.creditsCount += 1;
        item.totalVolume += creditVol;
        item.totalCommissions += commAmount;
        if (isPaid) item.paidCommissions += commAmount;
        else item.pendingCommissions += commAmount;
      }
    });

    return Array.from(brokerMap.values()).sort((a, b) => b.totalVolume - a.totalVolume);
  }, [commissions]);

  if (isLoading) {
    return (
      <MainLayout>
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
      </MainLayout>
    );
  }

  if (isError) {
    return (
      <MainLayout>
        <Header 
          title="Comisiones"
          subtitle="Gestiona tus comisiones y pagos"
        />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                <i className="fas fa-exclamation-triangle text-xl"></i>
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Error al cargar la información de comisiones</h3>
                <p className="text-sm text-muted-foreground mt-1">{(error as any)?.message || "Ocurrió un error inesperado al consultar el servidor."}</p>
              </div>
              <Button onClick={() => refetch()} className="bg-primary text-primary-foreground">
                <i className="fas fa-redo mr-2"></i> Reintentar
              </Button>
            </CardContent>
          </Card>
        </main>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
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
            <div className="flex gap-2 mb-6 border-b pb-3 flex-wrap">
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
              <Button
                variant={activeTab === 'importar-comisiones' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('importar-comisiones')}
                className={activeTab === 'importar-comisiones' ? 'bg-blue-700 text-white hover:bg-blue-800' : 'text-blue-800 border-blue-300'}
              >
                <i className="fas fa-file-excel mr-2"></i>
                Carga Masiva de Comisiones (Excel)
              </Button>
            </div>
          )}

          {/* Contenido de Comisiones Normales */}
          {activeTab === 'commissions' && (
            <>
              {/* KPIs de Comisiones */}
              {isSuperAdmin ? (
                /* Super Admin Dashboard Analítico de Comisiones con Transparencia Financiera */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <Card className="border border-purple-200 bg-purple-50/50 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-purple-900 uppercase tracking-wide">
                            Ganancia Plataforma (Neta)
                          </p>
                          <p className="text-2xl font-black text-purple-900">
                            ${totalPlatformEarnings.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="text-[11px] text-purple-700 font-medium pt-1 space-y-0.5">
                            <p>• Margen Apertura: ${platformApertura.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                            <p>• Sobretasas: ${totalSobretasa.toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN</p>
                          </div>
                        </div>
                        <div className="w-12 h-12 bg-purple-200/80 rounded-xl flex items-center justify-center text-purple-900 shadow-inner">
                          <i className="fas fa-crown text-xl"></i>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-blue-200 bg-blue-50/50 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                            Ingreso Total Financieras
                          </p>
                          <p className="text-2xl font-black text-blue-900">
                            ${totalGrossFinancieras.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="text-[11px] text-blue-700 font-medium pt-1 space-y-0.5">
                            <p>Total otorgado por apertura en créditos</p>
                          </div>
                        </div>
                        <div className="w-12 h-12 bg-blue-200/80 rounded-xl flex items-center justify-center text-blue-900 shadow-inner">
                          <i className="fas fa-university text-xl"></i>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-amber-200 bg-amber-50/50 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                            Por Pagar a la Red (STP)
                          </p>
                          <p className="text-2xl font-black text-amber-900">
                            ${totalPendingPayout.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="text-[11px] text-amber-800 font-medium pt-1 space-y-0.5">
                            <p className="text-emerald-700 font-semibold">✓ Dispersado: ${totalPaidPayout.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                            <p className="text-amber-700 font-semibold">⏳ Adeudo Pendiente: ${totalPendingPayout.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                          </div>
                        </div>
                        <div className="w-12 h-12 bg-amber-200/80 rounded-xl flex items-center justify-center text-amber-900 shadow-inner">
                          <i className="fas fa-sitemap text-xl"></i>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-emerald-200 bg-emerald-50/50 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                            Estatus de Pagos Red
                          </p>
                          <p className="text-2xl font-black text-emerald-900">
                            ${(totalPaidPayout + totalPendingPayout).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="text-[11px] text-emerald-700 font-medium pt-1 space-y-0.5">
                            <p>• {commissions.filter(c => c.status === 'paid').length} créditos liquidados</p>
                            <p>• {commissions.filter(c => c.status === 'pending').length} transferencias por realizar</p>
                          </div>
                        </div>
                        <div className="w-12 h-12 bg-emerald-200/80 rounded-xl flex items-center justify-center text-emerald-900 shadow-inner">
                          <i className="fas fa-wallet text-xl"></i>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : isMasterBrokerRole ? (
                /* Master Broker Cards con Transparencia de Red */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <Card className="border border-blue-200 bg-blue-50/50 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-blue-900 uppercase tracking-wide">Ingreso Bruto de Red</p>
                          <p className="text-2xl font-black text-blue-900">
                            ${mbGrossFromPlatform.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            Monto total dispersado por plataforma a tu red
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-blue-200/80 rounded-xl flex items-center justify-center text-blue-900">
                          <i className="fas fa-hand-holding-usd text-xl"></i>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-amber-200 bg-amber-50/50 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">Por Pagar a Brókers</p>
                          <p className="text-2xl font-black text-amber-900">
                            ${mbOwedToBrokers.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-amber-700 mt-1">
                            Comisiones asignadas a tus originadores
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-amber-200/80 rounded-xl flex items-center justify-center text-amber-900">
                          <i className="fas fa-users text-xl"></i>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-emerald-200 bg-emerald-50/50 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Tu Ganancia Neta de Red</p>
                          <p className="text-2xl font-black text-emerald-900">
                            ${mbNetEarnings.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <div className="text-[11px] text-emerald-700 font-medium pt-0.5 space-y-0.5">
                            <p>✓ Pagado: ${mbNetPaid.toLocaleString('es-MX', { maximumFractionDigits: 0 })} • ⏳ Pendiente: ${mbNetPending.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                          </div>
                        </div>
                        <div className="w-12 h-12 bg-emerald-200/80 rounded-xl flex items-center justify-center text-emerald-900">
                          <i className="fas fa-chart-line text-xl"></i>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                /* Broker Directo Cards */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <Card className="border border-amber-200 bg-amber-50/30 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">Comisiones Pendientes</p>
                          <p className="text-2xl font-black text-amber-900">
                            ${brokerTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-amber-700 mt-1">
                            {commissions?.filter(c => c.status === 'pending').length || 0} pagos por recibir
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-800">
                          <i className="fas fa-clock text-xl"></i>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-emerald-200 bg-emerald-50/30 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Comisiones Pagadas</p>
                          <p className="text-2xl font-black text-emerald-900">
                            ${brokerTotalPaid.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-emerald-700 mt-1">
                            {commissions?.filter(c => c.status === 'paid').length || 0} pagos completados
                          </p>
                        </div>
                        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-800">
                          <i className="fas fa-check-circle text-xl"></i>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-gray-200 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Total Comisiones</p>
                          <p className="text-2xl font-black text-primary">
                            ${brokerTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Registradas</p>
                        </div>
                        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                          <i className="fas fa-dollar-sign text-xl"></i>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

          {/* Filters and Actions */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex justify-between items-center">
                <div className="flex space-x-4">
                  <div className="relative w-80">
                    <Input
                      placeholder="Buscar por ID, cliente, financiera o monto..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      data-testid="input-search-commissions"
                      className={searchTerm ? "pr-8" : ""}
                    />
                    {searchTerm && (
                      <button
                        onClick={() => {
                          setSearchTerm("");
                          if (typeof window !== "undefined") {
                            window.history.replaceState({}, '', window.location.pathname);
                          }
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                        title="Limpiar búsqueda"
                      >
                        ✕
                      </button>
                    )}
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
                      className={filterStatus === "pending" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
                    >
                      Pendientes
                    </Button>
                    <Button
                      variant={filterStatus === "paid" ? "default" : "outline"}
                      onClick={() => setFilterStatus("paid")}
                      size="sm"
                      className={filterStatus === "paid" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
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
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>Historial de Comisiones ({filteredCommissions.length})</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs bg-amber-50 text-amber-900 border-amber-300 font-semibold">
                    ⏳ Pendientes: {commissions.filter(c => c.status === 'pending').length}
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-900 border-emerald-300 font-semibold">
                    ✓ Pagadas: {commissions.filter(c => c.status === 'paid').length}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Callout destacado de Adeudos Activos */}
              {commissions.some(c => c.status === 'pending') && filterStatus !== 'paid' && (
                <div className="mb-4 p-3.5 bg-amber-50/90 border-2 border-amber-300 rounded-xl flex items-center justify-between flex-wrap gap-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-sm shadow-inner">
                      {commissions.filter(c => c.status === 'pending').length}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <i className="fas fa-exclamation-circle text-amber-600"></i>
                        {canProcessPayments ? 'Adeudos de comisiones pendientes por liquidar' : 'Comisiones pendientes por recibir'}
                      </p>
                      <p className="text-[11px] text-amber-800">
                        {canProcessPayments 
                          ? 'Se generaron automáticamente al dispersar los créditos. Requieren ser liquidadas vía STP.' 
                          : 'Se generaron automáticamente al dispersarse tus créditos colocados. Pendiente de pago por la administración.'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-amber-900 font-medium">Monto adeudado: </span>
                    <span className="text-base font-black text-amber-950">
                      ${totalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </span>
                  </div>
                </div>
              )}

              {filteredCommissions.length === 0 ? (
                <div className="text-center py-8">
                  <i className="fas fa-dollar-sign text-4xl text-gray-300 mb-4"></i>
                  <p className="text-neutral mb-4">
                    {commissions.length === 0 ? "No tienes comisiones registradas" : "No se encontraron comisiones"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCommissions.map((commission) => {
                    const isPending = commission.status === 'pending';
                    const isBrokerRole = user?.role === 'broker';
                    const isMasterBrokerRole = user?.role === 'master_broker';
                    const isSuperAdminRole = user?.role === 'admin' || user?.role === 'super_admin';

                    const brokerShare = safeFloat(commission.brokerShare || (commission.masterBrokerShare ? '0' : commission.amount));
                    const masterBrokerShare = safeFloat(commission.masterBrokerShare);
                    const appShare = safeFloat(commission.appShare);
                    const totalAmount = safeFloat(commission.amount);
                    const isMb = commission.masterBrokerId && masterBrokerShare > 0;
                    const payoutToNetwork = isMb ? (masterBrokerShare + brokerShare) : brokerShare;

                    // User role specific share calculation
                    const isOwnCreditAsMB = isMasterBrokerRole && (commission.brokerId === user?.id || !commission.masterBrokerId);
                    const profileSpecificAmount = isBrokerRole 
                      ? brokerShare 
                      : (isMasterBrokerRole ? (isOwnCreditAsMB ? brokerShare : masterBrokerShare) : payoutToNetwork);

                    return (
                      <div
                        key={commission.id}
                        className={`flex items-center justify-between p-4 border rounded-xl transition-all cursor-pointer ${
                          isPending 
                            ? 'border-amber-300 bg-amber-50/30 hover:bg-amber-50/60 shadow-sm' 
                            : 'border-gray-200 hover:bg-gray-50/80'
                        }`}
                        onClick={() => setViewingCommission(commission)}
                        data-testid={`commission-${commission.id}`}
                      >
                        <div className="flex items-center space-x-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isPending ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'
                          }`}>
                            <i className={`fas ${isPending ? 'fa-clock' : 'fa-dollar-sign'} text-lg`}></i>
                          </div>
                          <div>
                            {/* Monto de acuerdo al perfil del usuario */}
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <h3 className="font-bold text-gray-950 text-base">
                                ${profileSpecificAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                              </h3>
                              {totalAmount === 0 && (
                                <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-300 bg-white">
                                  Tasa 0% al dispersar
                                </Badge>
                              )}
                              {isBrokerRole && (
                                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  Tu Comisión
                                </span>
                              )}
                              {isMasterBrokerRole && (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                                  isOwnCreditAsMB 
                                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200' 
                                    : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                                }`}>
                                  {isOwnCreditAsMB ? 'Tu Comisión Directa' : 'Tu Ganancia Neta de Red'}
                                </span>
                              )}
                              {isSuperAdminRole && (
                                <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  A Dispersar a Red {isMb ? '(Vía Master Bróker)' : '(Bróker Directo)'}
                                </span>
                              )}
                            </div>

                            {/* Datos de Crédito, Cliente y Financiera */}
                            <div className="flex items-center gap-2 flex-wrap text-xs text-neutral mt-1">
                              <span className="font-semibold text-gray-800">
                                {commission.client ? (commission.client.businessName || `${commission.client.firstName || ''} ${commission.client.lastName || ''}`.trim()) : 'Cliente'}
                              </span>
                              {commission.financialInstitution && (
                                <>
                                  <span>•</span>
                                  <span className="text-gray-600 font-medium">{commission.financialInstitution.name}</span>
                                </>
                              )}
                              {commission.credit && (
                                <>
                                  <span>•</span>
                                  <span className="text-gray-700 font-medium">
                                    Crédito: ${safeFloat(commission.credit.amount).toLocaleString('es-MX')} MXN
                                  </span>
                                </>
                              )}
                              <span>•</span>
                              <span>Tipo: {commissionTypeLabels[commission.commissionType || ""] || (commission.commissionType || "Apertura")}</span>
                            </div>

                            {/* Desglose de Repartición en Cascada (#27 / Requerimiento de Perfil) */}
                            {isSuperAdminRole ? (
                              <div className="flex items-center gap-1.5 flex-wrap text-[11px] mt-2 p-2 bg-purple-50/70 rounded-lg border border-purple-200">
                                <span className="font-bold text-purple-950">Cascada Financiera:</span>
                                <span className="text-blue-900 bg-white px-2 py-0.5 rounded font-medium border border-blue-200">
                                  📥 Financiera: ${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                                </span>
                                <span className="text-amber-900 bg-white px-2 py-0.5 rounded font-medium border border-amber-200">
                                  📤 Dispersión Red: -${payoutToNetwork.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                                </span>
                                <span className="text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded font-bold border border-emerald-300">
                                  💰 Margen Plataforma: ${appShare.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                                </span>
                              </div>
                            ) : isMasterBrokerRole && !isOwnCreditAsMB ? (
                              <div className="flex items-center gap-1.5 flex-wrap text-[11px] mt-2 p-2 bg-blue-50/70 rounded-lg border border-blue-200">
                                <span className="font-bold text-blue-950">Desglose de Red:</span>
                                <span className="text-indigo-900 bg-white px-2 py-0.5 rounded font-medium border border-indigo-200">
                                  📥 Cobro Plataforma: ${(masterBrokerShare + brokerShare).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                                </span>
                                <span className="text-amber-900 bg-white px-2 py-0.5 rounded font-medium border border-amber-200">
                                  📤 Pago a Bróker: -${brokerShare.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                                </span>
                                <span className="text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded font-bold border border-emerald-300">
                                  💰 Tu Ganancia Neta: ${masterBrokerShare.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                                </span>
                              </div>
                            ) : null}

                            <p className="text-[11px] text-gray-400 mt-1">
                              ID: {String(commission.id || "").slice(-8)} • Dispersado/Generado {commission.createdAt ? formatDistanceToNow(new Date(commission.createdAt), { 
                                addSuffix: true, 
                                locale: es 
                              }) : 'recientemente'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right space-y-2 flex flex-col items-end" onClick={(e) => e.stopPropagation()}>
                          {isPending ? (
                            <Badge 
                              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs animate-pulse shadow-sm"
                              data-testid={`commission-status-${commission.id}`}
                            >
                              <i className="fas fa-clock mr-1"></i>
                              {canProcessPayments ? '🔴 ADEUDO ACTIVO (No Pagada)' : '⏳ Pendiente por Recibir'}
                            </Badge>
                          ) : (
                            <Badge 
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm"
                              data-testid={`commission-status-${commission.id}`}
                            >
                              <i className="fas fa-check-circle mr-1"></i>
                              Pagada
                            </Badge>
                          )}
                          
                          {isPending && canProcessPayments && (
                            <div className="flex items-center gap-2">
                              <Button 
                                size="sm"
                                variant="outline"
                                className="text-xs border-success text-success hover:bg-success/10 font-semibold"
                                onClick={() => markPaidMutation.mutate({ id: commission.id })}
                                disabled={markPaidMutation.isPending}
                                title="Marcar como pagada sin procesar transferencia STP"
                                data-testid={`button-mark-paid-${commission.id}`}
                              >
                                <i className="fas fa-check mr-1"></i>
                                Marcar Pagada
                              </Button>
                              <Button 
                                size="sm"
                                className="bg-success text-white hover:bg-green-700 text-xs font-semibold shadow-sm"
                                onClick={() => {
                                  setSelectedCommission({ ...commission, payoutAmount: payoutToNetwork });
                                  setAccountNumber(commission.effectiveBankAccount?.clabe || "");
                                }}
                                data-testid={`button-pay-${commission.id}`}
                              >
                                <i className="fas fa-credit-card mr-1"></i>
                                Pagar STP
                              </Button>
                            </div>
                          )}
                          
                          {commission.paidAt && (
                            <p className="text-[11px] text-success font-medium">
                              Pagado el {new Date(commission.paidAt).toLocaleDateString('es-MX')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ranking y Analítica de Colocadores para Super Admin (#13) */}
          {isSuperAdmin && (
            <Card className="border-2 border-indigo-200 bg-white shadow-sm mt-8">
              <CardHeader className="bg-indigo-50/50 pb-3 border-b">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base font-bold text-indigo-950 flex items-center gap-2">
                      <i className="fas fa-trophy text-amber-500 text-lg"></i>
                      Ranking y Rendimiento de Colocadores (Brokers & Master Brokers)
                    </CardTitle>
                    <p className="text-xs text-indigo-800 mt-0.5">
                      Identifica a los mejores originadores para otorgar bonos, evaluar retención o renegociar esquemas de comisión.
                    </p>
                  </div>
                  <Badge className="bg-indigo-700 text-white text-xs font-semibold">
                    {brokerRankings.length} Colocador{brokerRankings.length !== 1 ? 'es' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-gray-100 text-gray-700 text-xs font-semibold uppercase">
                      <tr>
                        <th className="p-3 border-b text-center w-16">Posición</th>
                        <th className="p-3 border-b">Broker Originador</th>
                        <th className="p-3 border-b">Red / Master Broker</th>
                        <th className="p-3 border-b text-center">Créditos</th>
                        <th className="p-3 border-b text-right">Volumen Colocado</th>
                        <th className="p-3 border-b text-right font-bold text-indigo-950">Comisiones Totales</th>
                        <th className="p-3 border-b text-center">Estatus Pago</th>
                        <th className="p-3 border-b text-center">Incentivo Sugerido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brokerRankings.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-500">
                            No se han registrado colocaciones de brokers aún.
                          </td>
                        </tr>
                      ) : (
                        brokerRankings.map((brk, index) => {
                          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}°`;
                          const isTop = index === 0 || brk.totalVolume >= 1000000;

                          return (
                            <tr key={brk.brokerId} className="border-b hover:bg-gray-50/80 transition-colors">
                              <td className="p-3 text-center font-bold text-base">
                                {medal}
                              </td>
                              <td className="p-3">
                                <p className="font-bold text-gray-900">{brk.name}</p>
                                <p className="text-xs text-gray-500">{brk.email}</p>
                              </td>
                              <td className="p-3 text-xs text-gray-700 font-medium">
                                {brk.masterBrokerName}
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant="outline" className="bg-blue-50 text-blue-800 font-semibold border-blue-200">
                                  {brk.creditsCount} crédito{brk.creditsCount !== 1 ? 's' : ''}
                                </Badge>
                              </td>
                              <td className="p-3 text-right font-bold text-gray-900">
                                ${brk.totalVolume.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                              </td>
                              <td className="p-3 text-right font-black text-indigo-900">
                                ${brk.totalCommissions.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                              </td>
                              <td className="p-3 text-center text-xs">
                                <div className="space-y-0.5">
                                  <span className="text-emerald-700 font-medium block">
                                    Pagado: ${brk.paidCommissions.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                                  </span>
                                  {brk.pendingCommissions > 0 && (
                                    <span className="text-amber-700 font-semibold block">
                                      Pend: ${brk.pendingCommissions.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                {isTop ? (
                                  <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold shadow-sm">
                                    ⭐ Candidato a Bono
                                  </Badge>
                                ) : brk.creditsCount > 1 ? (
                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[11px]">
                                    🔥 Buen Desempeño
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-gray-100 text-gray-700 text-[11px]">
                                    Activo
                                  </Badge>
                                )}
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
          )}
        </>
      )}
          {/* Vista de Sobretasas para Super Admin (#11) */}
          {activeTab === 'sobretasa' && (user?.role === 'admin' || user?.role === 'super_admin') ? (
            <div className="space-y-6">
              {/* Resumen de Sobretasa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border border-purple-200 bg-purple-50/50 shadow-sm">
                  <CardContent className="p-5">
                    <p className="text-xs font-bold text-purple-900 uppercase tracking-wide">Sobretasa Total Generada</p>
                    <p className="text-2xl font-black text-purple-900 mt-1">
                      ${totalSobretasa.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </p>
                    <p className="text-xs text-purple-700 mt-1 font-medium">Monto acumulado por cobrar a financieras</p>
                  </CardContent>
                </Card>

                <Card className="border border-blue-200 bg-blue-50/50 shadow-sm">
                  <CardContent className="p-5">
                    <p className="text-xs font-bold text-blue-900 uppercase tracking-wide">Cuota Mensual (sin IVA)</p>
                    <p className="text-2xl font-black text-blue-900 mt-1">
                      ${totalMonthlySobretasaSinIva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </p>
                    <p className="text-xs text-blue-700 mt-1 font-medium">Facturación mensual neta ({commissions.filter(c => c.credit).length} créditos)</p>
                  </CardContent>
                </Card>

                <Card className="border border-emerald-200 bg-emerald-50/50 shadow-sm">
                  <CardContent className="p-5">
                    <p className="text-xs font-bold text-emerald-900 uppercase tracking-wide">Cuota Mensual (con IVA 16%)</p>
                    <p className="text-2xl font-black text-emerald-900 mt-1">
                      ${totalMonthlySobretasaConIva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </p>
                    <p className="text-xs text-emerald-700 mt-1 font-medium">Total facturado mensual a instituciones</p>
                  </CardContent>
                </Card>

                <Card className="border border-indigo-200 bg-indigo-50/50 shadow-sm">
                  <CardContent className="p-5">
                    <p className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Estatus de Conciliación</p>
                    <p className="text-2xl font-black text-indigo-900 mt-1">Al día</p>
                    <p className="text-xs text-indigo-700 mt-1 font-medium">Cobranza regular programada</p>
                  </CardContent>
                </Card>
              </div>

              {/* Explicación / Fórmula Oficial (#11) */}
              <div className="bg-purple-100/70 border border-purple-300 rounded-xl p-4 flex items-start gap-3 text-purple-950 text-xs">
                <i className="fas fa-info-circle text-purple-700 text-base mt-0.5 flex-shrink-0"></i>
                <div className="space-y-1">
                  <p className="font-bold text-sm">Fórmula Oficial de Cálculo de Sobretasas:</p>
                  <p>
                    <span className="font-mono font-semibold">Total Sobretasa = Monto Aprobado × (% Sobretasa)</span> • 
                    <span className="font-mono font-semibold ml-2">Cuota Mensual sin IVA = Total Sobretasa / Plazo en meses</span> • 
                    <span className="font-mono font-semibold ml-2">Cuota Mensual con IVA (16%) = Cuota Mensual sin IVA × 1.16</span>
                  </p>
                  <p className="text-purple-900 text-[11px]">
                    Ejemplo: Monto $1,000,000 con 5% sobretasa a 24 meses = $50,000 total sobretasa ($2,083.33/mes sin IVA, $2,416.67/mes con IVA).
                  </p>
                </div>
              </div>

              {/* Tabla de Sobretasa por Operación (#11) */}
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
                          <th className="p-3 border-b text-right">Monto Aprobado</th>
                          <th className="p-3 border-b text-center">Plazo</th>
                          <th className="p-3 border-b text-center">% Sobretasa</th>
                          <th className="p-3 border-b text-right text-purple-800 font-bold">Total Sobretasa</th>
                          <th className="p-3 border-b text-right text-blue-800 font-semibold">Mensual (sin IVA)</th>
                          <th className="p-3 border-b text-right text-emerald-800 font-bold">Mensual (con IVA 16%)</th>
                          <th className="p-3 border-b text-center">Estatus Pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commissions.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="p-8 text-center text-gray-500">
                              No hay créditos colocados para cálculo de sobretasa.
                            </td>
                          </tr>
                        ) : (
                          commissions.map((c) => {
                            const creditAmount = safeFloat(c.credit?.amount || c.amount);
                            const overRate = getSobretasaRate(c);
                            const term = safeFloat(c.credit?.term, 12);
                            const totalOverRate = creditAmount * (overRate / 100);
                            const monthlySinIva = term > 0 ? (totalOverRate / term) : totalOverRate;
                            const monthlyConIva = monthlySinIva * 1.16;

                            return (
                              <tr key={c.id} className="border-b hover:bg-gray-50/80 transition-colors">
                                <td className="p-3 font-mono text-xs">
                                  #{String(c.credit?.id || c.id || "").slice(-8)}
                                  <p className="text-[11px] text-gray-400">
                                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString('es-MX') : 'Reciente'}
                                  </p>
                                </td>
                                <td className="p-3 font-semibold text-gray-900">
                                  {c.financialInstitution?.name || 'Financiera'}
                                </td>
                                <td className="p-3">
                                  {c.client ? (c.client.businessName || `${c.client.firstName || ''} ${c.client.lastName || ''}`.trim()) : 'Cliente'}
                                </td>
                                <td className="p-3">
                                  <p className="font-medium text-gray-900">{c.broker ? `${c.broker.firstName} ${c.broker.lastName}` : 'Broker'}</p>
                                  {c.masterBroker && (
                                    <p className="text-[10px] text-purple-700 font-medium">MB: {c.masterBroker.brandName || c.masterBroker.firstName}</p>
                                  )}
                                </td>
                                <td className="p-3 text-right font-medium">
                                  ${creditAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                                </td>
                                <td className="p-3 text-center font-medium">
                                  {term} meses
                                </td>
                                <td className="p-3 text-center font-bold text-purple-700">
                                  {overRate}%
                                </td>
                                <td className="p-3 text-right font-bold text-purple-900">
                                  ${totalOverRate.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                                </td>
                                <td className="p-3 text-right font-bold text-blue-700 bg-blue-50/30">
                                  ${monthlySinIva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="p-3 text-right font-black text-emerald-800 bg-emerald-50/30">
                                  ${monthlyConIva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

          {/* Vista de Carga Masiva de Comisiones para Super Admin */}
          {activeTab === 'importar-comisiones' && (user?.role === 'admin' || user?.role === 'super_admin') && (
            <CommissionBulkUploader />
          )}
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
                    <p className="text-xs text-neutral">
                      {isSuperAdmin ? 'Total Financiera' : isMasterBrokerRole ? 'Tu Comisión Neta (Master)' : 'Tu Comisión'}
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      ${(isSuperAdmin 
                        ? (safeFloat(viewingCommission.totalGrossAmount) || (safeFloat(viewingCommission.appShare) + safeFloat(viewingCommission.masterBrokerShare) + safeFloat(viewingCommission.brokerShare)) || safeFloat(viewingCommission.amount))
                        : isMasterBrokerRole 
                          ? (safeFloat(viewingCommission.masterBrokerShare) || safeFloat(viewingCommission.amount))
                          : (safeFloat(viewingCommission.brokerShare) || safeFloat(viewingCommission.amount))
                      ).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
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
                      <span className="font-medium">${safeFloat(viewingCommission.credit.amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
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
                    <span>{viewingCommission.createdAt ? new Date(viewingCommission.createdAt).toLocaleDateString('es-MX') : 'Reciente'}</span>
                  </div>
                  {viewingCommission.paidAt && (
                    <div className="flex justify-between py-1 border-b text-success">
                      <span className="font-medium">Fecha de Pago:</span>
                      <span className="font-semibold">{new Date(viewingCommission.paidAt).toLocaleDateString('es-MX')}</span>
                    </div>
                  )}

                  {/* Desglose de Repartición en Cascada */}
                  <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 text-xs space-y-2 mt-2">
                    <p className="font-bold text-gray-800 flex items-center gap-1.5">
                      <i className="fas fa-sitemap text-primary"></i>
                      Desglose de Repartición (Cascada):
                    </p>
                    
                    {isSuperAdmin && (
                      <div className="space-y-1.5 bg-white p-2.5 rounded border border-gray-200">
                        <div className="flex justify-between text-blue-950 font-semibold">
                          <span>📥 Otorgado por Financiera:</span>
                          <span>${(safeFloat(viewingCommission.totalGrossAmount) || (safeFloat(viewingCommission.appShare) + safeFloat(viewingCommission.masterBrokerShare) + safeFloat(viewingCommission.brokerShare))).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                        </div>
                        <div className="flex justify-between text-amber-900">
                          <span>📤 Dispersión a la Red:</span>
                          <span>-${(safeFloat(viewingCommission.masterBrokerShare) + safeFloat(viewingCommission.brokerShare)).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                        </div>
                        <div className="flex justify-between text-emerald-900 font-bold border-t pt-1">
                          <span>💰 Margen Plataforma:</span>
                          <span>${safeFloat(viewingCommission.appShare).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                        </div>
                      </div>
                    )}

                    {isMasterBrokerRole && (
                      <div className="space-y-1.5 bg-white p-2.5 rounded border border-gray-200">
                        <div className="flex justify-between text-indigo-950 font-semibold">
                          <span>📥 Ingreso Red de Plataforma:</span>
                          <span>${(safeFloat(viewingCommission.masterBrokerShare) + safeFloat(viewingCommission.brokerShare)).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                        </div>
                        <div className="flex justify-between text-amber-900">
                          <span>📤 Repartición a Bróker:</span>
                          <span>-${safeFloat(viewingCommission.brokerShare).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                        </div>
                        <div className="flex justify-between text-emerald-900 font-bold border-t pt-1">
                          <span>💰 Tu Ganancia Neta:</span>
                          <span>${safeFloat(viewingCommission.masterBrokerShare).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                        </div>
                      </div>
                    )}

                    <div className="pt-1 text-[11px] text-gray-500 space-y-1 border-t">
                      <div className="flex justify-between">
                        <span>👤 Cuota Bróker:</span>
                        <span className="font-semibold text-gray-700">${safeFloat(viewingCommission.brokerShare).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                      </div>
                      {safeFloat(viewingCommission.masterBrokerShare) > 0 && (
                        <div className="flex justify-between">
                          <span>🌐 Cuota Master Bróker:</span>
                          <span className="font-semibold text-gray-700">${safeFloat(viewingCommission.masterBrokerShare).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                        </div>
                      )}
                      {safeFloat(viewingCommission.appShare) > 0 && (
                        <div className="flex justify-between">
                          <span>🏢 Cuota Plataforma:</span>
                          <span className="font-semibold text-gray-700">${safeFloat(viewingCommission.appShare).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                        </div>
                      )}
                    </div>
                  </div>
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

        {/* Modal Único para Dispersión STP */}
        <Dialog open={!!selectedCommission} onOpenChange={(open) => !open && setSelectedCommission(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <i className="fas fa-university text-primary"></i>
                Procesar Dispersión STP
              </DialogTitle>
            </DialogHeader>
            {selectedCommission && (
              <div className="space-y-4 pt-1">
                <div className="bg-primary/5 p-3.5 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs text-neutral">Monto de Comisión a Dispersar (STP):</p>
                    <p className="text-xl text-primary font-bold">
                      ${safeFloat(selectedCommission.payoutAmount || selectedCommission.amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                    STP SPEI
                  </Badge>
                </div>

                {/* Desglose de Retención y Margen Plataforma para Super Admin */}
                {(safeFloat(selectedCommission.totalGrossAmount) > 0 || safeFloat(selectedCommission.appShare) > 0) && (
                  <div className="bg-purple-50/70 border border-purple-200 p-2.5 rounded-lg text-xs space-y-1">
                    <div className="flex justify-between text-purple-950 font-semibold">
                      <span>Total Otorgado por Financiera:</span>
                      <span>${safeFloat(selectedCommission.totalGrossAmount || (safeFloat(selectedCommission.appShare) + safeFloat(selectedCommission.payoutAmount || selectedCommission.amount))).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                    </div>
                    <div className="flex justify-between text-amber-900">
                      <span>Monto a Dispersar a la Red (STP):</span>
                      <span className="font-semibold">-${safeFloat(selectedCommission.payoutAmount || selectedCommission.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                    </div>
                    <div className="flex justify-between text-emerald-900 border-t border-purple-200/80 pt-1 font-bold">
                      <span>Margen de Ganancia Plataforma:</span>
                      <span>${safeFloat(selectedCommission.appShare).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                    </div>
                  </div>
                )}

                {/* Información Bancaria Pre-cargada */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2 text-xs">
                  <p className="font-bold text-gray-700 uppercase tracking-wider text-[10px]">
                    Cuenta Destino {selectedCommission.effectiveBankAccount?.beneficiaryType === 'master_broker' ? '(Master Broker - Se encarga de repartir a su Red)' : '(Bróker Directo)'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-500">Beneficiario:</span>
                      <p className="font-semibold text-gray-900 truncate">
                        {selectedCommission.effectiveBankAccount?.beneficiaryName || 'No registrado'}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Banco:</span>
                      <p className="font-semibold text-gray-900">
                        {selectedCommission.effectiveBankAccount?.bankName || 'No registrado'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">CLABE Interbancaria Registrada:</span>
                    <p className="font-mono font-semibold text-gray-900 text-xs">
                      {selectedCommission.effectiveBankAccount?.clabe || (
                        <span className="text-orange-600 font-normal">Sin CLABE registrada en el perfil</span>
                      )}
                    </p>
                  </div>
                </div>

                {!selectedCommission.effectiveBankAccount?.clabe && (
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
            )}
          </DialogContent>
        </Dialog>
      </MainLayout>
    );
  }
