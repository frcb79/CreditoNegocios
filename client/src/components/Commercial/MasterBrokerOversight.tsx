import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  getOpportunityStatusConfig, 
  getNeedTypeLabel, 
  formatOpportunityDate, 
  getDaysRemaining 
} from "./CommercialLabels";
import { 
  ShieldCheck, 
  Clock, 
  AlertTriangle, 
  Briefcase, 
  Users, 
  Search, 
  Calendar,
  CheckCircle,
  Eye,
  RefreshCw
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function MasterBrokerOversight() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: opportunities, isLoading: loadingOpps } = useQuery<any[]>({
    queryKey: ["/api/commercial/opportunities"],
  });

  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/clients"],
  });

  const clientMap = useMemo(() => {
    const map = new Map<string, any>();
    (clients || []).forEach(c => map.set(c.id, c));
    return map;
  }, [clients]);

  // SLA and metrics calculations
  const metrics = useMemo(() => {
    const list = opportunities || [];
    const active = list.filter(o => o.status === 'protected_active').length;
    const hold = list.filter(o => o.status === 'registered_hold').length;
    const disputed = list.filter(o => o.status === 'disputed').length;
    const renewals = list.filter(o => o.needType === 'renovacion' && (o.status === 'protected_active' || o.status === 'registered_hold')).length;
    
    // Expiring in next 3 days
    const now = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const expiringSoon = list.filter(o => {
      if (o.status !== 'protected_active' && o.status !== 'registered_hold') return false;
      const expDate = o.protectionExpiresAt ? new Date(o.protectionExpiresAt) : (o.holdExpiresAt ? new Date(o.holdExpiresAt) : null);
      return expDate && expDate > now && expDate <= threeDays;
    }).length;

    return { total: list.length, active, hold, disputed, renewals, expiringSoon };
  }, [opportunities]);

  const filteredOpps = useMemo(() => {
    return (opportunities || []).filter(opp => {
      const client = clientMap.get(opp.clientId);
      const clientName = client ? (client.businessName || `${client.firstName || ''} ${client.lastName || ''}`).toLowerCase() : '';
      const brokerName = opp.broker ? `${opp.broker.firstName || ''} ${opp.broker.lastName || ''}`.toLowerCase() : '';
      const term = searchTerm.toLowerCase();

      const matchesSearch = !searchTerm || clientName.includes(term) || brokerName.includes(term) || (opp.needDescription || '').toLowerCase().includes(term);
      const matchesStatus = filterStatus === 'all' || opp.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [opportunities, clientMap, searchTerm, filterStatus]);

  if (loadingOpps) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border border-slate-200">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-7 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border border-slate-200 p-6">
          <Skeleton className="h-48 w-full" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="master-broker-oversight-view">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <Card className="border border-slate-200/80 shadow-xs bg-white">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-medium">Oportunidades Red</span>
              <Briefcase className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{metrics.total}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">En supervisión activa</p>
          </CardContent>
        </Card>

        <Card className="border border-emerald-200/80 shadow-xs bg-emerald-50/20">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-xs font-medium">Protegidas Activas</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-950">{metrics.active}</div>
            <p className="text-[11px] text-emerald-600/80 mt-0.5">Con actividad comercial</p>
          </CardContent>
        </Card>

        <Card className="border border-amber-200/80 shadow-xs bg-amber-50/20">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-xs font-medium">En Reserva Inicial</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-950">{metrics.hold}</div>
            <p className="text-[11px] text-amber-600/80 mt-0.5">Requieren primera actividad</p>
          </CardContent>
        </Card>

        <Card className="border border-red-200/80 shadow-xs bg-red-50/20">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-red-700 mb-1">
              <span className="text-xs font-medium">Por Vencer (≤3d)</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-950">{metrics.expiringSoon}</div>
            <p className="text-[11px] text-red-600/80 mt-0.5">Atención urgente requerida</p>
          </CardContent>
        </Card>

        <Card className="border border-purple-200/80 shadow-xs bg-purple-50/20">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-purple-700 mb-1">
              <span className="text-xs font-medium">Renovaciones</span>
              <RefreshCw className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-purple-950">{metrics.renewals}</div>
            <p className="text-[11px] text-purple-600/80 mt-0.5">Clientes con ventana abierta</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border border-slate-200/80 shadow-sm bg-white">
        <CardHeader className="border-b border-slate-100 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-700" />
              Supervisión de Oportunidades de la Red
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Monitorea el cumplimiento de SLA, retención y protección comercial de los brokers a tu cargo sin edición directa.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar cliente o broker..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs border-slate-200 bg-slate-50/50"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-xs w-40 border-slate-200 bg-white">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="protected_active">Oportunidades protegidas</SelectItem>
                <SelectItem value="registered_hold">Reserva inicial</SelectItem>
                <SelectItem value="expired_released">Expiradas / liberadas</SelectItem>
                <SelectItem value="disputed">En controversia</SelectItem>
                <SelectItem value="converted_credit">Crédito colocado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredOpps.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <Briefcase className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-medium text-slate-600">No hay oportunidades que coincidan con la búsqueda</p>
              <p className="text-[11px] text-slate-400 mt-1">Los brokers de tu red registrarán oportunidades conforme atiendan a sus clientes.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Cliente</th>
                    <th className="py-2.5 px-4">Broker Asignado</th>
                    <th className="py-2.5 px-3">Necesidad</th>
                    <th className="py-2.5 px-3 text-center">Estado Comercial</th>
                    <th className="py-2.5 px-3">Última Actividad</th>
                    <th className="py-2.5 px-3">Vigencia / SLA</th>
                    <th className="py-2.5 px-4 text-center">Alerta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOpps.map(opp => {
                    const client = clientMap.get(opp.clientId);
                    const clientName = client ? (client.businessName || `${client.firstName || ''} ${client.lastName || ''}`) : 'Cliente ID: ' + opp.clientId.slice(0, 8);
                    const statusConfig = getOpportunityStatusConfig(opp.status);
                    const brokerName = opp.broker ? `${opp.broker.firstName} ${opp.broker.lastName || ''}` : 'Broker ID: ' + opp.brokerId.slice(0, 8);
                    
                    const expDate = opp.protectionExpiresAt ? new Date(opp.protectionExpiresAt) : (opp.holdExpiresAt ? new Date(opp.holdExpiresAt) : null);
                    const daysRemaining = getDaysRemaining(expDate);

                    const isUrgent = daysRemaining !== null && daysRemaining <= 3 && (opp.status === 'protected_active' || opp.status === 'registered_hold');

                    return (
                      <tr key={opp.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {clientName}
                          {opp.amountRequested && (
                            <div className="text-[11px] text-slate-500 font-normal">
                              ${Number(opp.amountRequested).toLocaleString('es-MX')} MXN
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800">{brokerName}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-slate-700">{getNeedTypeLabel(opp.needType)}</span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusConfig.badgeClass}`}>
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {opp.lastCommercialActivityAt ? (
                            formatDistanceToNow(new Date(opp.lastCommercialActivityAt), { addSuffix: true, locale: es })
                          ) : (
                            <span className="text-slate-400 italic">Sin actividad</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {expDate ? (
                            <div>
                              <span className="text-slate-700 font-medium">
                                {daysRemaining !== null && daysRemaining >= 0 ? `${daysRemaining} días` : 'Vencida'}
                              </span>
                              <div className="text-[10px] text-slate-400">
                                {formatOpportunityDate(expDate)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isUrgent ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                              <AlertTriangle className="w-3 h-3 text-red-600" />
                              Vence pronto
                            </span>
                          ) : opp.status === 'disputed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Controversia
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Normal</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
