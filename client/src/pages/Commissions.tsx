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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Commission } from "@shared/schema";
import { apiRequest, invalidateAllCreditQueries } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getStatusLabel, getStatusBadgeClass } from "@/lib/statusConfig";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import CommissionBulkUploader from "@/components/Commissions/CommissionBulkUploader";
import { cn } from "@/lib/utils";
import { 
  Search, 
  Clock, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  MoreHorizontal, 
  History, 
  X, 
  Check, 
  HandCoins, 
  Building2, 
  User, 
  Users, 
  ArrowUpRight, 
  Layers, 
  DollarSign, 
  FileSpreadsheet, 
  SlidersHorizontal,
  RefreshCw,
  Wallet,
  RotateCcw,
  Landmark,
  Percent,
  Receipt,
  Network,
  AlertCircle,
  Loader2,
  Info
} from "lucide-react";

const statusConfig: Record<string, { label: string; badgeClass: string; dotClass: string }> = {
  generated: { label: "Generada", badgeClass: "bg-amber-50 text-amber-800 border-amber-200/80", dotClass: "bg-amber-500" },
  pending: { label: "Por Aprobar", badgeClass: "bg-amber-50 text-amber-800 border-amber-200/80", dotClass: "bg-amber-500" },
  approved: { label: "Aprobada", badgeClass: "bg-blue-50 text-blue-800 border-blue-200/80", dotClass: "bg-blue-500" },
  dispersing: { label: "En Dispersión", badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200/80", dotClass: "bg-indigo-500 animate-pulse" },
  paid: { label: "Pagada", badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200/80", dotClass: "bg-emerald-500" },
  failed: { label: "Fallida", badgeClass: "bg-rose-50 text-rose-800 border-rose-200/80", dotClass: "bg-rose-500" },
  cancelled: { label: "Cancelada", badgeClass: "bg-slate-100 text-slate-700 border-slate-200/80", dotClass: "bg-slate-400" },
  advance_requested: { label: "Adelanto Solicitado", badgeClass: "bg-blue-50 text-blue-800 border-blue-200/80", dotClass: "bg-blue-500" },
  advance_paid: { label: "Adelanto Pagado", badgeClass: "bg-purple-50 text-purple-800 border-purple-200/80", dotClass: "bg-purple-500" },
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
  const isSuperAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isMasterBrokerRole = user?.role === 'master_broker';
  const isBrokerRole = user?.role === 'broker';

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
  
  // Bloque 6: Subpestañas operativas de Super Admin
  const [adminSubTab, setAdminSubTab] = useState<'por_aprobar' | 'dispersion' | 'historial'>('por_aprobar');
  const [selectedApproveIds, setSelectedApproveIds] = useState<string[]>([]);
  const [selectedDisperseIds, setSelectedDisperseIds] = useState<string[]>([]);
  const [cancellingCommission, setCancellingCommission] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [manualPaidCommission, setManualPaidCommission] = useState<any | null>(null);
  const [manualPaidNotes, setManualPaidNotes] = useState("");
  const [manualPaidReference, setManualPaidReference] = useState("");
  const [viewingAuditLogsCommission, setViewingAuditLogsCommission] = useState<any | null>(null);

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
    mutationFn: async ({ id, accountNumber, idempotencyKey }: { id: string; accountNumber?: string; idempotencyKey?: string }) => {
      const response = await apiRequest("POST", `/api/commissions/${id}/pay`, { accountNumber, idempotencyKey });
      return response.json();
    },
    onSuccess: (data) => {
      invalidateAllCreditQueries(queryClient);
      toast({
        title: data.alreadyPaid ? "Comisión ya pagada" : "Dispersión procesada exitosamente",
        description: `Se dispersó exitosamente por $${Number(data.commission?.payoutAmount || data.commission?.amount).toLocaleString('es-MX')} MXN.`,
      });
      setSelectedCommission(null);
      setAccountNumber("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error en la dispersión",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, notes, reference }: { id: string; notes: string; reference?: string }) => {
      const response = await apiRequest("POST", `/api/commissions/${id}/mark-paid`, { notes, reference });
      return response.json();
    },
    onSuccess: () => {
      invalidateAllCreditQueries(queryClient);
      toast({
        title: "Comisión Pagada",
        description: "La comisión fue marcada como pagada correctamente.",
      });
      setSelectedCommission(null);
      setManualPaidCommission(null);
      setManualPaidNotes("");
      setManualPaidReference("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error al liquidar comisión",
        description: error.message || "No se pudo actualizar el estado de la comisión",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/commissions/${id}/approve`, {});
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAllCreditQueries(queryClient);
      toast({
        title: "Comisión Aprobada",
        description: data.message || "La comisión quedó aprobada y congelada para dispersión.",
      });
      setSelectedApproveIds(prev => prev.filter(id => id !== data.commission?.id));
    },
    onError: (err: Error) => {
      toast({
        title: "Error al aprobar comisión",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", `/api/commissions/bulk-approve`, { ids });
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAllCreditQueries(queryClient);
      toast({
        title: "Aprobación Masiva Completada",
        description: `Se aprobaron exitosamente ${data.count} comisiones.`,
      });
      setSelectedApproveIds([]);
    },
    onError: (err: Error) => {
      toast({
        title: "Error en aprobación masiva",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/commissions/${id}/cancel`, { reason });
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAllCreditQueries(queryClient);
      toast({
        title: "Comisión Cancelada",
        description: data.message || "La comisión ha sido cancelada.",
      });
      setCancellingCommission(null);
      setCancelReason("");
    },
    onError: (err: Error) => {
      toast({
        title: "Error al cancelar comisión",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const bulkPayMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", `/api/commissions/bulk-pay`, { ids });
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAllCreditQueries(queryClient);
      toast({
        title: "Dispersión Masiva Completada",
        description: `Se dispersaron exitosamente ${data.totalProcessed} comisiones por $${Number(data.totalAmount).toLocaleString('es-MX')} MXN.`,
      });
      setSelectedDisperseIds([]);
    },
    onError: (err: Error) => {
      toast({
        title: "Error en dispersión masiva",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const { data: auditLogs = [], isLoading: isLoadingAuditLogs } = useQuery<any[]>({
    queryKey: [`/api/commissions/${viewingAuditLogsCommission?.id}/audit-logs`],
    queryFn: async () => {
      if (!viewingAuditLogsCommission?.id) return [];
      const res = await apiRequest("GET", `/api/commissions/${viewingAuditLogsCommission.id}/audit-logs`);
      return res.json();
    },
    enabled: !!viewingAuditLogsCommission?.id,
  });

  const handlePayment = () => {
    if (selectedCommission && accountNumber) {
      paymentMutation.mutate({ 
        id: selectedCommission.id, 
        accountNumber,
        idempotencyKey: `pay-${selectedCommission.id}-${Date.now()}`
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

  // Helper for network payout (Option B: To Master Broker if exists, else to Broker)
  const getPayoutAmount = (c: any): number => {
    if (c.frozenAmount) return safeFloat(c.frozenAmount);
    const isMasterDirect = c.masterBrokerId && String(c.brokerId) === String(c.masterBrokerId);
    if (isMasterDirect) {
      return safeFloat(c.masterBrokerShare) || safeFloat(c.brokerShare) || safeFloat(c.amount);
    }
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
    return commissions
      .filter(c => ['pending', 'generated', 'approved', 'dispersing'].includes(c.status))
      .reduce((sum, c) => sum + getPayoutAmount(c), 0);
  }, [commissions]);

  const totalPaidPayout = useMemo(() => {
    return commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + getPayoutAmount(c), 0);
  }, [commissions]);

  // Master Broker figures
  const mbGrossFromPlatform = useMemo(() => {
    return commissions.reduce((sum, c) => {
      const isMasterDirect = c.masterBrokerId && String(c.brokerId) === String(c.masterBrokerId);
      if (isMasterDirect) {
        return sum + (safeFloat(c.masterBrokerShare) || safeFloat(c.brokerShare) || safeFloat(c.amount));
      }
      return sum + safeFloat(c.masterBrokerShare) + safeFloat(c.brokerShare);
    }, 0);
  }, [commissions]);

  const mbOwedToBrokers = useMemo(() => {
    return commissions.reduce((sum, c) => sum + safeFloat(c.brokerShare), 0);
  }, [commissions]);

  const mbNetEarnings = useMemo(() => {
    return commissions.reduce((sum, c) => sum + safeFloat(c.masterBrokerShare), 0);
  }, [commissions]);

  const mbNetPending = useMemo(() => {
    return commissions
      .filter(c => ['pending', 'generated', 'approved', 'dispersing'].includes(c.status))
      .reduce((sum, c) => sum + safeFloat(c.masterBrokerShare), 0);
  }, [commissions]);

  const mbNetPaid = useMemo(() => {
    return commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + safeFloat(c.masterBrokerShare), 0);
  }, [commissions]);

  // Broker Direct figures
  const brokerTotalPending = useMemo(() => {
    return commissions
      .filter(c => ['pending', 'generated', 'approved', 'dispersing'].includes(c.status))
      .reduce((sum, c) => sum + safeFloat(c.brokerShare || (c.masterBrokerShare ? '0' : c.amount)), 0);
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

  // Subtab counts and filtered lists for Super Admin
  const countPorAprobar = useMemo(() => {
    return commissions.filter(c => c.status === 'generated' || c.status === 'pending').length;
  }, [commissions]);

  const countDispersion = useMemo(() => {
    return commissions.filter(c => c.status === 'approved' || c.status === 'dispersing' || c.status === 'failed').length;
  }, [commissions]);

  const countHistorial = useMemo(() => {
    return commissions.filter(c => c.status === 'paid' || c.status === 'cancelled').length;
  }, [commissions]);

  // Operational amounts for Super Admin KPIs
  const saPorAprobarAmount = useMemo(() => {
    return commissions
      .filter(c => c.status === 'generated' || c.status === 'pending')
      .reduce((sum, c) => sum + getPayoutAmount(c), 0);
  }, [commissions]);

  const saAprobadoDispersionAmount = useMemo(() => {
    return commissions
      .filter(c => c.status === 'approved')
      .reduce((sum, c) => sum + getPayoutAmount(c), 0);
  }, [commissions]);

  const saEnDispersionAmount = useMemo(() => {
    return commissions
      .filter(c => c.status === 'dispersing')
      .reduce((sum, c) => sum + getPayoutAmount(c), 0);
  }, [commissions]);

  const saPagadoAmount = useMemo(() => {
    return commissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + getPayoutAmount(c), 0);
  }, [commissions]);

  const displayCommissions = useMemo(() => {
    if (!isSuperAdmin) return filteredCommissions;
    if (adminSubTab === 'por_aprobar') {
      return filteredCommissions.filter(c => c.status === 'generated' || c.status === 'pending');
    }
    if (adminSubTab === 'dispersion') {
      return filteredCommissions.filter(c => c.status === 'approved' || c.status === 'dispersing' || c.status === 'failed');
    }
    if (adminSubTab === 'historial') {
      return filteredCommissions.filter(c => c.status === 'paid' || c.status === 'cancelled');
    }
    return filteredCommissions;
  }, [filteredCommissions, isSuperAdmin, adminSubTab]);

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
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Error al cargar la información de comisiones</h3>
                <p className="text-sm text-muted-foreground mt-1">{(error as any)?.message || "Ocurrió un error inesperado al consultar el servidor."}</p>
              </div>
              <Button onClick={() => refetch()} className="bg-primary text-primary-foreground">
                <RotateCcw className="w-4 h-4 mr-2" /> Reintentar
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
        subtitle="Gestiona el control de comisiones y dispersiones a la red"
      />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Alerta de cuenta bancaria pendiente */}
          {needsBankSetup && (
            <div className="mb-6 p-4 bg-orange-50 border-2 border-orange-300 rounded-xl flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
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
                <Landmark className="w-4 h-4 mr-1.5" />
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
                <Users className="w-4 h-4 mr-2" />
                Comisiones de Red & Brokers
              </Button>
              <Button
                variant={activeTab === 'sobretasa' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('sobretasa')}
                className={activeTab === 'sobretasa' ? 'bg-purple-700 text-white hover:bg-purple-800' : 'text-purple-800 border-purple-300'}
              >
                <Percent className="w-4 h-4 mr-2" />
                Control de Sobretasa (Financieras)
              </Button>
              <Button
                variant={activeTab === 'importar-comisiones' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('importar-comisiones')}
                className={activeTab === 'importar-comisiones' ? 'bg-blue-700 text-white hover:bg-blue-800' : 'text-blue-800 border-blue-300'}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Carga Masiva de Comisiones (Excel)
              </Button>
            </div>
          )}

          {/* Contenido de Comisiones Normales */}
          {activeTab === 'commissions' && (
            <>
              {/* KPIs de Comisiones */}
                  {/* KPIs de Comisiones — Fintech Institucional (Máximo 3-4 métricas sobrias) */}
              {isSuperAdmin ? (
                /* Super Admin: 4 métricas operativas clave */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {/* KPI 1: Por Aprobar */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Por Aprobar
                      </span>
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
                        {countPorAprobar} pendientes
                      </span>
                    </div>
                    <div className="mt-1">
                      <div className="text-2xl font-bold text-slate-900 tracking-tight">
                        ${saPorAprobarAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-slate-500 ml-1">MXN</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Comisiones congelables previas a dispersión
                      </p>
                    </div>
                  </div>

                  {/* KPI 2: Aprobado para Dispersión */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Listo para Dispersión
                      </span>
                      <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-full">
                        {countDispersion} listos
                      </span>
                    </div>
                    <div className="mt-1">
                      <div className="text-2xl font-bold text-slate-900 tracking-tight">
                        ${saAprobadoDispersionAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-slate-500 ml-1">MXN</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Aprobado formalmente para dispersión
                      </p>
                    </div>
                  </div>

                  {/* KPI 3: En Dispersión */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        En Dispersión
                      </span>
                      <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
                        {commissions.filter(c => c.status === 'dispersing').length} en proceso
                      </span>
                    </div>
                    <div className="mt-1">
                      <div className="text-2xl font-bold text-slate-900 tracking-tight">
                        ${saEnDispersionAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-slate-500 ml-1">MXN</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Procesándose en cola de dispersión
                      </p>
                    </div>
                  </div>

                  {/* KPI 4: Pagado */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Pagado a la Red
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                        {commissions.filter(c => c.status === 'paid').length} liquidados
                      </span>
                    </div>
                    <div className="mt-1">
                      <div className="text-2xl font-bold text-emerald-700 tracking-tight">
                        ${totalPaidPayout.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-slate-500 ml-1">MXN</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Liquidadas exitosamente a brokers y redes
                      </p>
                    </div>
                  </div>
                </div>
              ) : isMasterBrokerRole ? (
                /* Master Broker: 3 métricas de red institucional */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* MB KPI 1: Ingreso Bruto Red */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Ingreso Bruto de Red
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">Plataforma</span>
                    </div>
                    <div className="mt-1">
                      <div className="text-2xl font-bold text-slate-900 tracking-tight">
                        ${mbGrossFromPlatform.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-slate-500 ml-1">MXN</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Monto asignado por la plataforma para tu red
                      </p>
                    </div>
                  </div>

                  {/* MB KPI 2: Por Pagar a Brokers */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Corresponde a Originadores
                      </span>
                      <span className="text-[11px] font-medium text-amber-700">Subordinados</span>
                    </div>
                    <div className="mt-1">
                      <div className="text-2xl font-bold text-slate-900 tracking-tight">
                        ${mbOwedToBrokers.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-slate-500 ml-1">MXN</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Comisiones a transferir a originadores de tu red
                      </p>
                    </div>
                  </div>

                  {/* MB KPI 3: Ganancia Neta Master */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Tu Ganancia Neta
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
                        Neto
                      </span>
                    </div>
                    <div className="mt-1">
                      <div className="text-2xl font-bold text-emerald-700 tracking-tight">
                        ${mbNetEarnings.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-slate-500 ml-1">MXN</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Pagado: ${mbNetPaid.toLocaleString('es-MX', { maximumFractionDigits: 0 })} • Pendiente: ${mbNetPending.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Broker Directo: 3 métricas sobrias */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {/* Broker KPI 1: Pendientes */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Comisiones Pendientes
                      </span>
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
                        {commissions?.filter(c => c.status === 'pending' || c.status === 'generated' || c.status === 'approved' || c.status === 'dispersing').length || 0}
                      </span>
                    </div>
                    <div className="mt-1">
                      <div className="text-2xl font-bold text-slate-900 tracking-tight">
                        ${brokerTotalPending.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-slate-500 ml-1">MXN</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        En trámite de aprobación o dispersión
                      </p>
                    </div>
                  </div>

                  {/* Broker KPI 2: Pagadas */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Comisiones Pagadas
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                        {commissions?.filter(c => c.status === 'paid').length || 0}
                      </span>
                    </div>
                    <div className="mt-1">
                      <div className="text-2xl font-bold text-emerald-700 tracking-tight">
                        ${brokerTotalPaid.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-slate-500 ml-1">MXN</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Transferidas a tu cuenta bancaria
                      </p>
                    </div>
                  </div>

                  {/* Broker KPI 3: Total Acumulado */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        Total Generado
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">Histórico</span>
                    </div>
                    <div className="mt-1">
                      <div className="text-2xl font-bold text-slate-900 tracking-tight">
                        ${brokerTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-slate-500 ml-1">MXN</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Total de comisiones registradas
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Commissions Table Container */}
              <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden mb-8">
                {/* Subheader Toolbar & Subtabs */}
                <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col gap-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                          {isSuperAdmin ? 'Gestión Operativa de Comisiones' : 'Mis Comisiones'}
                        </h2>
                        <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          {displayCommissions.length}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {isSuperAdmin 
                          ? 'Control de aprobación, dispersión y conciliación financiera' 
                          : 'Consulta el estado de tus comisiones y montos a recibir'}
                      </p>
                    </div>

                    {/* Operational Subtabs for Super Admin */}
                    {isSuperAdmin && (
                      <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-lg border border-slate-200/80 self-start md:self-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setAdminSubTab('por_aprobar');
                            setSelectedApproveIds([]);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            adminSubTab === 'por_aprobar'
                              ? "bg-white text-slate-900 font-semibold shadow-sm"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                          )}
                        >
                          <span>Por Aprobar</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900">
                            {countPorAprobar}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAdminSubTab('dispersion');
                            setSelectedDisperseIds([]);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            adminSubTab === 'dispersion'
                              ? "bg-white text-slate-900 font-semibold shadow-sm"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                          )}
                        >
                          <span>Centro de Dispersión</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-900">
                            {countDispersion}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdminSubTab('historial')}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            adminSubTab === 'historial'
                              ? "bg-white text-slate-900 font-semibold shadow-sm"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                          )}
                        >
                          <span>Historial & Conciliación</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-900">
                            {countHistorial}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 flex-1 max-w-lg">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="Buscar por ID, cliente, financiera o monto..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          data-testid="input-search-commissions"
                          className="pl-9 h-9 text-xs placeholder:text-slate-400 border-slate-200 bg-slate-50/50 focus:bg-white transition-colors"
                        />
                        {searchTerm && (
                          <button
                            onClick={() => {
                              setSearchTerm("");
                              if (typeof window !== "undefined") {
                                window.history.replaceState({}, '', window.location.pathname);
                              }
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                            title="Limpiar búsqueda"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Status Filter buttons */}
                      <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-50/50">
                        <Button
                          variant={filterStatus === "all" ? "default" : "ghost"}
                          onClick={() => setFilterStatus("all")}
                          size="sm"
                          className={cn("h-7 px-2.5 text-xs", filterStatus === "all" ? "bg-slate-800 text-white" : "text-slate-600")}
                        >
                          Todos
                        </Button>
                        <Button
                          variant={filterStatus === "pending" ? "default" : "ghost"}
                          onClick={() => setFilterStatus("pending")}
                          size="sm"
                          className={cn("h-7 px-2.5 text-xs", filterStatus === "pending" ? "bg-amber-600 text-white hover:bg-amber-700" : "text-slate-600")}
                        >
                          Pendientes
                        </Button>
                        <Button
                          variant={filterStatus === "paid" ? "default" : "ghost"}
                          onClick={() => setFilterStatus("paid")}
                          size="sm"
                          className={cn("h-7 px-2.5 text-xs", filterStatus === "paid" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "text-slate-600")}
                        >
                          Pagados
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button 
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
                        onClick={() => setShowRatesModal(true)}
                        data-testid="button-view-commission-rates"
                      >
                        <Layers className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                        Esquema de Comisiones
                      </Button>

                      <Button 
                        size="sm"
                        className="h-9 text-xs bg-primary hover:bg-primary-dark text-white shadow-sm"
                        onClick={() => {
                          alert("⏳ Próximamente\n\nEsta opción estará disponible pronto. Estamos trabajando para que puedas solicitar adelantos sobre tus comisiones directamente desde la plataforma.");
                        }}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5 mr-1 text-white" />
                        Solicitar Adelanto
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Subtab Operational Banner */}
                {isSuperAdmin && adminSubTab === 'por_aprobar' && (
                  <div className="px-5 py-2.5 bg-amber-50/60 border-b border-amber-200/80 text-xs text-amber-900 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Comisiones pendientes de revisión y congelamiento. Al aprobar, el monto a liquidar queda congelado frente a modificaciones posteriores del crédito.</span>
                    </div>
                    {selectedApproveIds.length > 0 && (
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-7 px-3"
                        onClick={() => bulkApproveMutation.mutate(selectedApproveIds)}
                        disabled={bulkApproveMutation.isPending}
                      >
                        {bulkApproveMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                        Aprobar seleccionadas ({selectedApproveIds.length})
                      </Button>
                    )}
                  </div>
                )}

                {isSuperAdmin && adminSubTab === 'dispersion' && (
                  <div className="px-5 py-2.5 bg-blue-50/60 border-b border-blue-200/80 text-xs text-blue-900 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Send className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Comisiones formalmente aprobadas. Puedes enviar a dispersión o registrar liquidación manual con bitácora inmutable.</span>
                    </div>
                    {selectedDisperseIds.length > 0 && (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-7 px-3"
                        onClick={() => bulkPayMutation.mutate(selectedDisperseIds)}
                        disabled={bulkPayMutation.isPending}
                      >
                        {bulkPayMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                        Enviar a dispersión ({selectedDisperseIds.length})
                      </Button>
                    )}
                  </div>
                )}

                {isSuperAdmin && adminSubTab === 'historial' && (
                  <div className="px-5 py-2.5 bg-emerald-50/60 border-b border-emerald-200/80 text-xs text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>Registro histórico inmutable y trazabilidad auditada de comisiones liquidadas y canceladas.</span>
                  </div>
                )}

                {/* Table Content */}
                {displayCommissions.length === 0 ? (
                  <div className="text-center py-16 px-4">
                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                      <Wallet className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 mb-1">
                      {isSuperAdmin 
                        ? (adminSubTab === 'por_aprobar' ? "No hay comisiones pendientes de aprobación" : adminSubTab === 'dispersion' ? "No hay comisiones en espera de dispersión" : "No hay registros en el historial") 
                        : "No tienes comisiones registradas con los filtros actuales"}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {isSuperAdmin 
                        ? "Las operaciones originadas y formalizadas por la red aparecerán aquí para control financiero."
                        : "Las comisiones generadas por tus créditos formalizados aparecerán listadas en esta sección."}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 select-none">
                          {isSuperAdmin && (adminSubTab === 'por_aprobar' || adminSubTab === 'dispersion') && (
                            <th className="py-3 px-3 text-center w-10">
                              <input
                                type="checkbox"
                                className="rounded text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                                checked={
                                  adminSubTab === 'por_aprobar'
                                    ? selectedApproveIds.length === displayCommissions.length && displayCommissions.length > 0
                                    : selectedDisperseIds.length === displayCommissions.length && displayCommissions.length > 0
                                }
                                onChange={(e) => {
                                  if (adminSubTab === 'por_aprobar') {
                                    setSelectedApproveIds(e.target.checked ? displayCommissions.map(c => c.id) : []);
                                  } else {
                                    setSelectedDisperseIds(e.target.checked ? displayCommissions.map(c => c.id) : []);
                                  }
                                }}
                                title="Seleccionar todas"
                              />
                            </th>
                          )}
                          <th className="py-3 px-4">Operación / Cliente</th>
                          <th className="py-3 px-3">Financiera</th>
                          <th className="py-3 px-4">Beneficiario Efectivo</th>
                          <th className="py-3 px-3 text-center">Tipo / Origen</th>
                          <th className="py-3 px-3 text-right">Monto Base</th>
                          <th className="py-3 px-2 text-center">%</th>
                          <th className="py-3 px-4 text-right">Comisión</th>
                          <th className="py-3 px-3 text-center">Estado</th>
                          <th className="py-3 px-3 text-center">Fecha</th>
                          <th className="py-3 px-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayCommissions.map((commission) => {
                          const statusInfo = statusConfig[commission.status] || { 
                            label: commission.status, 
                            badgeClass: "bg-slate-100 text-slate-700 border-slate-200/80", 
                            dotClass: "bg-slate-400" 
                          };
                          const isGenerated = commission.status === 'generated' || commission.status === 'pending';
                          const isApproved = commission.status === 'approved';
                          const isDispersing = commission.status === 'dispersing';
                          const isPaid = commission.status === 'paid';
                          const isFailed = commission.status === 'failed';
                          const isCancelled = commission.status === 'cancelled';

                          const brokerShare = safeFloat(commission.brokerShare || (commission.masterBrokerShare ? '0' : commission.amount));
                          const masterBrokerShare = safeFloat(commission.masterBrokerShare);
                          const appShare = safeFloat(commission.appShare);
                          const totalGrossAmount = safeFloat(commission.amount);
                          const isMb = commission.masterBrokerId && masterBrokerShare > 0;
                          const payoutToNetwork = commission.frozenAmount 
                            ? safeFloat(commission.frozenAmount)
                            : (isMb ? (masterBrokerShare + brokerShare) : brokerShare);

                          // Profile specific commission amount protagonist
                          const isOwnCreditAsMB = isMasterBrokerRole && (commission.brokerId === user?.id || !commission.masterBrokerId);
                          const profileSpecificAmount = isBrokerRole 
                            ? brokerShare 
                            : (isMasterBrokerRole ? (isOwnCreditAsMB ? brokerShare : masterBrokerShare) : payoutToNetwork);

                          const hasValidClabe = commission.effectiveBankAccount?.clabe && /^\d{18}$/.test(commission.effectiveBankAccount.clabe);
                          const clientObj = commission.client || commission.credit?.client;
                          const clientDisplayName = clientObj ? (clientObj.businessName || `${clientObj.firstName || ''} ${clientObj.lastName || ''}`.trim()) : 'Cliente';
                          const creditAmount = safeFloat(commission.credit?.amount || commission.amount);
                          const appliedRate = commission.brokerRate || commission.rate || commission.financialInstitutionRate || (isMasterBrokerRole ? commission.masterRate : null);

                          return (
                            <tr
                              key={commission.id}
                              onClick={() => setViewingCommission(commission)}
                              className="hover:bg-slate-50/70 transition-colors cursor-pointer group h-[60px]"
                              data-testid={`commission-${commission.id}`}
                            >
                              {/* Batch Checkbox (SA only in por_aprobar or dispersion) */}
                              {isSuperAdmin && (adminSubTab === 'por_aprobar' || adminSubTab === 'dispersion') && (
                                <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="rounded text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                                    checked={
                                      adminSubTab === 'por_aprobar'
                                        ? selectedApproveIds.includes(commission.id)
                                        : selectedDisperseIds.includes(commission.id)
                                    }
                                    onChange={(e) => {
                                      if (adminSubTab === 'por_aprobar') {
                                        setSelectedApproveIds(prev =>
                                          e.target.checked ? [...prev, commission.id] : prev.filter(id => id !== commission.id)
                                        );
                                      } else {
                                        setSelectedDisperseIds(prev =>
                                          e.target.checked ? [...prev, commission.id] : prev.filter(id => id !== commission.id)
                                        );
                                      }
                                    }}
                                  />
                                </td>
                              )}

                              {/* 1. Operación / Cliente */}
                              <td className="py-3 px-4">
                                <div className="flex flex-col min-w-0 max-w-[190px]">
                                  <span 
                                    className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors truncate"
                                    title={clientDisplayName}
                                  >
                                    {clientDisplayName}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-0.5">
                                    <span>#{String(commission.creditId || commission.id || "").slice(-8)}</span>
                                    {commission.trackingKey && (
                                      <>
                                        <span className="text-slate-300">•</span>
                                        <span className="text-emerald-700 font-medium truncate" title={`Rastreo: ${commission.trackingKey}`}>
                                          STP: {String(commission.trackingKey).slice(-6)}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* 2. Financiera */}
                              <td className="py-3 px-3">
                                <div className="flex flex-col text-xs max-w-[140px]">
                                  <span className="font-medium text-slate-800 truncate" title={commission.financialInstitution?.name || 'Financiera'}>
                                    {commission.financialInstitution?.name || 'Financiera'}
                                  </span>
                                  <span className="text-[11px] text-slate-400 capitalize truncate">
                                    {commission.productName || commission.credit?.productTemplate?.name || 'Crédito'}
                                  </span>
                                </div>
                              </td>

                              {/* 3. Beneficiario Efectivo */}
                              <td className="py-3 px-4">
                                <div className="flex flex-col text-xs max-w-[180px]">
                                  {isSuperAdmin ? (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-slate-900 truncate" title={commission.effectiveBeneficiary?.name || commission.broker?.firstName || 'Broker'}>
                                          {commission.effectiveBeneficiary?.name || `${commission.broker?.firstName || ''} ${commission.broker?.lastName || ''}`.trim() || 'Broker'}
                                        </span>
                                        <span className={cn(
                                          "px-1.5 py-0.2 rounded text-[10px] font-semibold border shrink-0",
                                          isMb 
                                            ? "bg-indigo-50 text-indigo-700 border-indigo-200/80"
                                            : "bg-slate-100 text-slate-700 border-slate-200/80"
                                        )}>
                                          {isMb ? 'Master' : 'Directo'}
                                        </span>
                                      </div>
                                      {isMb && (
                                        <span className="text-[10px] text-slate-500 truncate mt-0.5" title={`Incluye $${brokerShare.toLocaleString('es-MX')} para ${commission.broker?.firstName || 'Broker'}`}>
                                          Incluye ${brokerShare.toLocaleString('es-MX', { maximumFractionDigits: 0 })} p/ {commission.broker?.firstName || 'red'}
                                        </span>
                                      )}
                                    </>
                                  ) : isMasterBrokerRole ? (
                                    <>
                                      <span className="font-semibold text-slate-900 truncate">
                                        {isOwnCreditAsMB ? 'Tu Colocación Directa' : `${commission.broker?.firstName || 'Broker'} ${commission.broker?.lastName || ''}`.trim()}
                                      </span>
                                      <span className="text-[10px] text-slate-500 truncate">
                                        {isOwnCreditAsMB ? 'Cobras 100% de la comisión' : `Originador de tu red`}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="font-semibold text-slate-900 truncate">
                                        {user?.firstName} {user?.lastName}
                                      </span>
                                      <span className="text-[10px] text-emerald-700 font-medium truncate">
                                        Pago a tu CLABE
                                      </span>
                                    </>
                                  )}
                                </div>
                              </td>

                              {/* 4. Tipo / Origen */}
                              <td className="py-3 px-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/80 whitespace-nowrap">
                                  {commissionTypeLabels[commission.commissionType || ""] || (commission.commissionType || "Apertura")}
                                </span>
                              </td>

                              {/* 5. Monto Base Colocado */}
                              <td className="py-3 px-3 text-right">
                                <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                                  ${creditAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </td>

                              {/* 6. Porcentaje Aplicado */}
                              <td className="py-3 px-2 text-center">
                                <span className="text-xs font-semibold text-slate-500 font-mono">
                                  {appliedRate !== null && appliedRate !== undefined ? `${appliedRate}%` : '—'}
                                </span>
                              </td>

                              {/* 7. Monto Comisión (PROTAGONISTA) */}
                              <td className="py-3 px-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-sm font-bold text-slate-900 whitespace-nowrap">
                                    ${profileSpecificAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  {commission.frozenAmount ? (
                                    <span className="text-[10px] font-mono text-blue-700 font-medium">
                                      Congelado
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      MXN
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 8. Estado */}
                              <td className="py-3 px-3 text-center">
                                <span 
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap",
                                    statusInfo.badgeClass
                                  )}
                                >
                                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusInfo.dotClass)} />
                                  <span>{statusInfo.label}</span>
                                </span>
                              </td>

                              {/* 9. Fecha */}
                              <td className="py-3 px-3 text-center">
                                <span 
                                  className="text-xs text-slate-500 whitespace-nowrap"
                                  title={commission.createdAt ? format(new Date(commission.createdAt), "dd/MM/yyyy HH:mm", { locale: es }) : undefined}
                                >
                                  {commission.createdAt ? format(new Date(commission.createdAt), "dd/MM/yyyy") : "—"}
                                </span>
                              </td>

                              {/* 10. Acciones (1 Primaria + ... Menú Secundario) */}
                              <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Primary Actions based on role & status */}
                                  {isSuperAdmin && isGenerated && (
                                    <Button
                                      size="sm"
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium h-7 px-2.5 shadow-sm"
                                      onClick={() => approveMutation.mutate(commission.id)}
                                      disabled={approveMutation.isPending}
                                      title="Aprobar y congelar comisión"
                                    >
                                      {approveMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                                      Aprobar
                                    </Button>
                                  )}

                                  {isSuperAdmin && isApproved && (
                                    <Button
                                      size="sm"
                                      className="bg-primary hover:bg-primary-dark text-white text-xs font-medium h-7 px-2.5 shadow-sm"
                                      onClick={() => {
                                        setSelectedCommission(commission);
                                        setAccountNumber(commission.effectiveBankAccount?.clabe || "");
                                      }}
                                      title="Enviar a dispersión a la red"
                                    >
                                      <Send className="w-3 h-3 mr-1 text-white" />
                                      Enviar a dispersión
                                    </Button>
                                  )}

                                  {isSuperAdmin && isFailed && (
                                    <Button
                                      size="sm"
                                      className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium h-7 px-2.5 shadow-sm"
                                      onClick={() => {
                                        setSelectedCommission(commission);
                                        setAccountNumber(commission.effectiveBankAccount?.clabe || "");
                                      }}
                                      title="Reintentar dispersión"
                                    >
                                      <RefreshCw className="w-3 h-3 mr-1" />
                                      Reintentar
                                    </Button>
                                  )}

                                  {/* Default primary action for view details when no pending admin action */}
                                  {(!isSuperAdmin || (!isGenerated && !isApproved && !isFailed)) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2.5 text-xs font-medium text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-50"
                                      onClick={() => setViewingCommission(commission)}
                                      title="Ver desglose completo de la comisión"
                                    >
                                      Ver detalle
                                    </Button>
                                  )}

                                  {/* Secondary Actions Dropdown (...) */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                                        title="Más opciones"
                                      >
                                        <MoreHorizontal className="w-4 h-4" />
                                        <span className="sr-only">Acciones</span>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 text-xs">
                                      <DropdownMenuItem 
                                        onClick={() => setViewingCommission(commission)}
                                        className="cursor-pointer gap-2"
                                      >
                                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                                        <span>Ver detalle completo</span>
                                      </DropdownMenuItem>

                                      <DropdownMenuItem 
                                        onClick={() => setViewingAuditLogsCommission(commission)}
                                        className="cursor-pointer gap-2"
                                      >
                                        <History className="w-3.5 h-3.5 text-indigo-600" />
                                        <span>Bitácora de movimientos</span>
                                      </DropdownMenuItem>

                                      {/* Super Admin manual pay / cancel options */}
                                      {isSuperAdmin && (isApproved || isFailed) && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem 
                                            onClick={() => {
                                              setManualPaidCommission(commission);
                                              setManualPaidNotes("");
                                              setManualPaidReference("");
                                            }}
                                            className="cursor-pointer gap-2 text-emerald-700 focus:text-emerald-800"
                                          >
                                            <HandCoins className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>Registrar pago manual</span>
                                          </DropdownMenuItem>
                                        </>
                                      )}

                                      {isSuperAdmin && (isGenerated || isApproved) && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem 
                                            onClick={() => {
                                              setCancellingCommission(commission);
                                              setCancelReason("");
                                            }}
                                            className="cursor-pointer gap-2 text-rose-600 focus:text-rose-700"
                                          >
                                            <X className="w-3.5 h-3.5 text-rose-600" />
                                            <span>Cancelar comisión</span>
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Ranking y Rendimiento de Colocadores para Super Admin — Harmonized Styling */}
              {isSuperAdmin && (
                <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden mb-8">
                  <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                          Ranking y Rendimiento de Colocadores
                        </h3>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                          {brokerRankings.length} originador{brokerRankings.length !== 1 ? 'es' : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Consolidado de colocación por broker y red para incentivos y retención comercial
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 select-none">
                          <th className="py-3 px-3 text-center w-14">Lugar</th>
                          <th className="py-3 px-4">Broker Originador</th>
                          <th className="py-3 px-3">Red / Master Broker</th>
                          <th className="py-3 px-3 text-center">Créditos</th>
                          <th className="py-3 px-4 text-right">Volumen Colocado</th>
                          <th className="py-3 px-4 text-right font-semibold text-slate-900">Comisiones Totales</th>
                          <th className="py-3 px-3 text-center">Estatus Pago</th>
                          <th className="py-3 px-3 text-center">Incentivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {brokerRankings.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-12 text-center text-slate-400">
                              No se han registrado colocaciones de brokers aún.
                            </td>
                          </tr>
                        ) : (
                          brokerRankings.map((brk, index) => {
                            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}°`;
                            const isTop = index === 0 || brk.totalVolume >= 1000000;

                            return (
                              <tr key={brk.brokerId} className="hover:bg-slate-50/70 transition-colors h-[56px]">
                                <td className="py-3 px-3 text-center font-bold text-sm text-slate-700">
                                  {medal}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-col min-w-0 max-w-[180px]">
                                    <span className="font-semibold text-slate-900 truncate">{brk.name}</span>
                                    <span className="text-[11px] text-slate-400 truncate">{brk.email}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <span className="text-slate-600 font-medium truncate block max-w-[140px]" title={brk.masterBrokerName}>
                                    {brk.masterBrokerName}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                    {brk.creditsCount}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right font-medium text-slate-700">
                                  ${brk.totalVolume.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-slate-900">
                                  ${brk.totalCommissions.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <div className="flex flex-col items-center text-[11px] space-y-0.5">
                                    <span className="text-emerald-700 font-medium">
                                      Pagado: ${brk.paidCommissions.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                                    </span>
                                    {brk.pendingCommissions > 0 && (
                                      <span className="text-amber-700 font-semibold">
                                        Pend: ${brk.pendingCommissions.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {isTop ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                      Candidato a Bono
                                    </span>
                                  ) : brk.creditsCount > 1 ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      Buen Desempeño
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                      Activo
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
          {/* Vista de Sobretasas para Super Admin (#11) */}
          {activeTab === 'sobretasa' && (user?.role === 'admin' || user?.role === 'super_admin') ? (
            <div className="space-y-6">
              {/* Disclaimer informativo sobre Sobretasas */}
              <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl flex items-start gap-3 shadow-sm">
                <Info className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
                <div className="text-xs text-purple-900">
                  <p className="font-bold text-sm">Módulo Analítico y de Proyección de Sobretasas</p>
                  <p className="mt-1 text-purple-800 leading-relaxed">
                    Este panel proyecta las estimaciones de sobretasa pactadas con financieras por crédito colocado para análisis comercial. En esta fase operativa, la emisión de facturación fiscal CFDI y dispersiones automáticas fiscales no forman parte de este ciclo comercial.
                  </p>
                </div>
              </div>

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
                <Info className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
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
                    <DollarSign className="w-5 h-5 text-purple-700" />
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
                <Percent className="w-5 h-5 text-primary" />
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
                                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
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
            <DialogFooter className="pt-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowRatesModal(false)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de Detalle de Comisión */}
        <Dialog open={!!viewingCommission} onOpenChange={(open) => !open && setViewingCommission(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary" />
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
                  <Badge className={statusConfig[viewingCommission.status as keyof typeof statusConfig]?.badgeClass || "bg-gray-100 text-gray-800"}>
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
                      <span className="font-semibold text-gray-900">{viewingCommission.financialInstitution.name}</span>
                    </div>
                  )}
                  {(viewingCommission.productName || viewingCommission.credit?.productTemplate?.name) && (
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-neutral">Producto:</span>
                      <span className="font-medium text-gray-800">{viewingCommission.productName || viewingCommission.credit?.productTemplate?.name}</span>
                    </div>
                  )}
                  {viewingCommission.credit && (
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-neutral">Monto del Crédito:</span>
                      <span className="font-semibold text-gray-900">${safeFloat(viewingCommission.credit.amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</span>
                    </div>
                  )}
                  <div className="bg-blue-50/50 p-2.5 rounded border border-blue-100 text-xs space-y-1">
                    <p className="font-bold text-blue-950 flex items-center gap-1">
                      <Percent className="w-4 h-4 text-blue-700" /> Origen y Porcentajes de Comisión:
                    </p>
                    <div className="flex justify-between text-blue-900">
                      <span>• Tasa Pagada por Financiera a CN:</span>
                      <span className="font-semibold">{viewingCommission.financialInstitutionRate || viewingCommission.rate || viewingCommission.financialInstitution?.commissionRates?.financiera?.apertura || '4.0'}%</span>
                    </div>
                    {safeFloat(viewingCommission.masterBrokerShare) > 0 && (
                      <div className="flex justify-between text-blue-900">
                        <span>• Tasa Asignada a Master Broker:</span>
                        <span className="font-semibold">{viewingCommission.masterRate || viewingCommission.financialInstitution?.commissionRates?.masterBroker?.apertura || '3.0'}%</span>
                      </div>
                    )}
                    <div className="flex justify-between text-blue-900">
                      <span>• Tasa Final Asignada al Bróker:</span>
                      <span className="font-semibold">{viewingCommission.brokerRate || viewingCommission.brokerNetworkRate || viewingCommission.financialInstitution?.commissionRates?.broker?.apertura || '2.0'}%</span>
                    </div>
                  </div>
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
                      <Network className="w-4 h-4 text-primary" />
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

                <DialogFooter className="flex justify-between items-center pt-3 border-t sm:justify-between">
                  {viewingCommission.status === 'pending' && canProcessPayments ? (
                    <Button 
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                      onClick={() => {
                        const comm = viewingCommission;
                        setViewingCommission(null);
                        setManualPaidCommission(comm);
                        setManualPaidNotes("");
                        setManualPaidReference("");
                      }}
                    >
                      <Check className="w-4 h-4 mr-1.5" />
                      Marcar Comisión como Pagada
                    </Button>
                  ) : <div />}
                  <Button variant="outline" size="sm" onClick={() => setViewingCommission(null)}>
                    Cerrar
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal Único para Dispersión */}
        <Dialog open={!!selectedCommission} onOpenChange={(open) => !open && setSelectedCommission(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-primary" />
                Procesar Dispersión
              </DialogTitle>
            </DialogHeader>
            {selectedCommission && (
              <div className="space-y-4 pt-1">
                <div className="bg-primary/5 p-3.5 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs text-neutral">Monto de Comisión a Dispersar:</p>
                    <p className="text-xl text-primary font-bold">
                      ${safeFloat(selectedCommission.payoutAmount || selectedCommission.amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                    Dispersión
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
                      <span>Monto a Dispersar a la Red:</span>
                      <span>-${safeFloat(selectedCommission.payoutAmount || selectedCommission.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
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
                    <AlertTriangle className="w-4 h-4 mt-0.5 text-orange-600 shrink-0" />
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

                <DialogFooter className="gap-2 pt-3 border-t">
                  <Button variant="outline" size="sm" onClick={() => setSelectedCommission(null)} disabled={paymentMutation.isPending}>
                    Cancelar
                  </Button>
                  <Button 
                    size="sm"
                    onClick={handlePayment}
                    disabled={!accountNumber || accountNumber.length < 18 || paymentMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    data-testid="button-confirm-payment"
                  >
                    {paymentMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Confirmar Dispersión
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Cancelación de Comisión */}
        <Dialog open={!!cancellingCommission} onOpenChange={(open) => !open && setCancellingCommission(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-rose-700">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Cancelar Comisión #{cancellingCommission?.id?.slice(-8)}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                Esta acción cancelará permanentemente la comisión y registrará un evento inmutable en la bitácora de auditoría.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Motivo de Cancelación (Obligatorio)
                </label>
                <Input
                  placeholder="Ej. Crédito cancelado por la financiera / Ajuste comercial"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="text-xs"
                />
              </div>
              <DialogFooter className="gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => setCancellingCommission(null)} disabled={cancelMutation.isPending}>
                  Volver
                </Button>
                <Button
                  size="sm"
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
                  disabled={!cancelReason.trim() || cancelMutation.isPending}
                  onClick={() => {
                    if (cancellingCommission) {
                      cancelMutation.mutate({ id: cancellingCommission.id, reason: cancelReason });
                    }
                  }}
                >
                  {cancelMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Confirmar Cancelación
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Liquidación Manual */}
        <Dialog open={!!manualPaidCommission} onOpenChange={(open) => !open && setManualPaidCommission(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-emerald-800">
                <DollarSign className="w-5 h-5 text-emerald-800" />
                Registrar Liquidación Manual de Comisión
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2 text-xs">
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                <div className="flex justify-between font-bold text-emerald-950">
                  <span>Monto a Liquidar:</span>
                  <span>${safeFloat(manualPaidCommission?.frozenAmount || manualPaidCommission?.payoutAmount || manualPaidCommission?.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                </div>
                <p className="text-[11px] text-emerald-800 mt-1">
                  Beneficiario: {manualPaidCommission?.effectiveBeneficiary?.name || manualPaidCommission?.broker?.firstName || 'Broker'}
                </p>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Justificación / Notas Operativas (Obligatorio)
                </label>
                <Input
                  placeholder="Ej. Transferencia manual vía portal Banorte con folio 98234"
                  value={manualPaidNotes}
                  onChange={(e) => setManualPaidNotes(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Referencia Bancaria / Folio de Rastreo (Opcional)
                </label>
                <Input
                  placeholder="Ej. REF-2026-09-012"
                  value={manualPaidReference}
                  onChange={(e) => setManualPaidReference(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
              <DialogFooter className="gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => setManualPaidCommission(null)} disabled={markPaidMutation.isPending}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                  disabled={!manualPaidNotes.trim() || markPaidMutation.isPending}
                  onClick={() => {
                    if (manualPaidCommission) {
                      markPaidMutation.mutate({
                        id: manualPaidCommission.id,
                        notes: manualPaidNotes.trim(),
                        reference: manualPaidReference.trim(),
                      });
                    }
                  }}
                >
                  {markPaidMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Confirmar Liquidación
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Historial de Movimientos */}
        <Dialog open={!!viewingAuditLogsCommission} onOpenChange={(open) => !open && setViewingAuditLogsCommission(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Historial de movimientos — Comisión #{viewingAuditLogsCommission?.id?.slice(-8)}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-3 pt-2 text-xs">
              {isLoadingAuditLogs ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> Cargando historial de movimientos...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No hay movimientos registrados para esta comisión.
                </div>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log: any) => {
                    const actionMap: Record<string, string> = {
                      create: 'Generación inicial',
                      generate: 'Generación inicial',
                      approve: 'Aprobación de comisión',
                      bulk_approve: 'Aprobación masiva',
                      disperse_stp: 'Dispersión STP iniciada',
                      pay: 'Pago STP enviado',
                      mark_paid: 'Liquidación manual registrada',
                      manual_paid: 'Liquidación manual',
                      cancel: 'Cancelación de comisión',
                      fail: 'Error en dispersión',
                      freeze: 'Congelamiento de tasas',
                    };
                    const actionLabel = actionMap[log.action] || log.action;
                    const reference = log.details?.reference || log.details?.referenceNumber || log.details?.trackingKey || log.details?.transactionId;
                    const notes = log.details?.notes || log.details?.reason;
                    const error = log.details?.error || log.details?.errorMessage;

                    return (
                      <div key={log.id} className="p-3.5 bg-white border border-gray-200 rounded-lg shadow-sm space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-1 border-b border-gray-100 pb-2">
                          <span className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                            {actionLabel}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {log.createdAt ? new Date(log.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-600 pt-1">
                          <div>
                            <span className="text-gray-400">Usuario / Actor: </span>
                            <strong className="text-gray-800">{log.actorName || log.actorRole || 'Sistema'}</strong>
                          </div>
                          {log.previousStatus && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-400">Transición: </span>
                              <Badge variant="outline" className="text-[10px] bg-gray-50">{getStatusLabel(log.previousStatus)}</Badge>
                              <span>→</span>
                              <Badge className="text-[10px] font-semibold bg-blue-100 text-blue-800 border-blue-200">{getStatusLabel(log.newStatus)}</Badge>
                            </div>
                          )}
                        </div>
                        {reference && (
                          <div className="bg-emerald-50 text-emerald-900 p-2 rounded text-[11px] border border-emerald-200 flex items-center gap-2">
                            <Receipt className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span>Referencia / Rastreo: <strong className="font-mono">{reference}</strong></span>
                          </div>
                        )}
                        {notes && (
                          <div className="bg-gray-50 text-gray-700 p-2 rounded text-[11px] border border-gray-200">
                            <span className="font-semibold text-gray-500">Nota / Motivo: </span>
                            <span>{notes}</span>
                          </div>
                        )}
                        {error && (
                          <div className="bg-rose-50 text-rose-900 p-2 rounded text-[11px] border border-rose-200 flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>Error: {error}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <DialogFooter className="pt-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setViewingAuditLogsCommission(null)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </MainLayout>
    );
  }
