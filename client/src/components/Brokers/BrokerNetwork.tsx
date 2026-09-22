import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Network,
  Users,
  Building2,
  Save,
  RotateCcw,
  Loader2,
  UserPlus,
  Percent,
  CheckCircle2,
  DollarSign,
  Crown,
  ChevronDown,
  ChevronUp,
  Search,
  Mail,
  Phone,
  ShieldCheck,
  UserCheck,
  Briefcase
} from "lucide-react";

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
      <div className="space-y-4 py-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const items = ratesData?.items || [];

  return (
    <div className="space-y-6">
      {/* Banner explicativo fintech institucional */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-sm flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3.5 flex-1 min-w-[280px]">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-400/20 flex items-center justify-center flex-shrink-0 text-blue-400 mt-0.5">
            <Network className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-100 text-sm">
              Autonomía de Comisiones para tu Red de Brókers
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed font-normal">
              Crédito Negocios te otorga un <strong className="text-white font-semibold">porcentaje techo</strong> por cada financiera. Aquí tú decides qué porcentaje compartes a los brókers de tu equipo. Tu <strong className="text-emerald-400 font-semibold">Margen Neto</strong> se calcula automáticamente y es tu retención directa por cada colocación.
            </p>
          </div>
        </div>
        {hasChanges && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm text-xs font-semibold flex-shrink-0 self-center gap-1.5"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar Cambios
          </Button>
        )}
      </div>

      <Card className="border border-slate-200/80 shadow-sm overflow-hidden bg-white">
        <CardHeader className="p-5 border-b border-slate-100 flex flex-row items-center justify-between flex-wrap gap-3 bg-slate-50/40">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900">
              Esquema de Comisiones por Financiera ({items.length} Activas)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Ajusta la comisión de apertura asignada a tu equipo. El margen retenido se calcula en tiempo real.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold gap-1.5 disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Guardar Comisiones de Red
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-600 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">Financiera</th>
                  <th className="py-3 px-4 text-center">Techo Otorgado (MB)</th>
                  <th className="py-3 px-4 text-center w-48">Comisión para tu Red (%)</th>
                  <th className="py-3 px-4 text-center">Tu Margen Neto</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-xs text-slate-500">
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
                      <tr key={item.institutionId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-slate-900">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-semibold text-xs flex-shrink-0">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-semibold text-xs text-slate-900">{item.institutionName}</p>
                              {item.category && (
                                <p className="text-[11px] text-slate-500 capitalize">{item.category}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-semibold text-xs">
                            {ceiling.toFixed(2)}% Apertura
                          </Badge>
                          {item.masterCeiling.renovacion > 0 && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Renovación: {item.masterCeiling.renovacion}%
                            </p>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <div className="max-w-[140px] mx-auto space-y-1">
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                max={ceiling || 100}
                                value={currentVal}
                                onChange={(e) => handleRateChange(item.institutionId, 'apertura', e.target.value)}
                                className={`text-center font-semibold text-xs h-8 pr-6 rounded-lg ${isOverCeiling ? 'border-rose-300 bg-rose-50 text-rose-700 focus-visible:ring-rose-400' : 'border-slate-200'}`}
                                placeholder={`${item.defaultBroker.apertura || '0'}`}
                              />
                              <span className="absolute right-2.5 top-2 text-[11px] font-semibold text-slate-400 pointer-events-none">%</span>
                            </div>
                            {isOverCeiling && (
                              <p className="text-[10px] text-rose-600 font-medium">
                                Excede tu techo ({ceiling}%)
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-xs px-2.5 py-0.5">
                            {netMargin.toFixed(2)}% Neto
                          </Badge>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-normal">
                            Retención bruta
                          </p>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[11px] text-slate-500 hover:text-slate-900 h-7 px-2"
                            onClick={() => {
                              handleRateChange(item.institutionId, 'apertura', String(item.defaultBroker.apertura || '2.5'));
                            }}
                            title="Restablecer a la tasa sugerida por defecto"
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
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
      <Card className="border border-slate-200/80 shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4 p-4 border border-slate-100 rounded-xl">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
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
          <TabsList className="bg-slate-100 p-1 rounded-xl h-10 inline-flex w-auto border border-slate-200/60">
            <TabsTrigger 
              value="team" 
              className="flex items-center gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs rounded-lg px-4 py-1.5 text-slate-600 transition-all"
            >
              <Users className="w-3.5 h-3.5" />
              Mi Equipo ({brokers.length})
            </TabsTrigger>
            <TabsTrigger 
              value="rates" 
              className="flex items-center gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs rounded-lg px-4 py-1.5 text-slate-600 transition-all"
            >
              <Percent className="w-3.5 h-3.5" />
              Comisiones de mi Red
            </TabsTrigger>
          </TabsList>

          <TabsContent value="team" className="space-y-6 mt-4">
            {brokers.length === 0 ? (
              <Card className="border border-slate-200/80 shadow-sm bg-white">
                <CardHeader className="border-b border-slate-100 p-5">
                  <CardTitle className="text-base font-semibold text-slate-900">Mi Red de Brokers</CardTitle>
                </CardHeader>
                <CardContent className="p-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <Users className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">Aún no tienes brokers en tu equipo</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5">
                    Invita a nuevos brokers para expandir tu red y recibir comisiones por cada colocación de crédito que gestionen.
                  </p>
                  <Button 
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold gap-1.5"
                    onClick={() => {
                      setInviteMasterBrokerId(user?.id || null);
                      setShowInviteModal(true);
                    }}
                    data-testid="button-invite-broker"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Invitar Primer Broker
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="border border-slate-200/80 shadow-sm bg-white">
                    <CardContent className="p-4 flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 flex-shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">Brokers en tu Equipo</p>
                        <p className="text-xl font-bold text-slate-900">{brokers.length}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-slate-200/80 shadow-sm bg-white">
                    <CardContent className="p-4 flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 flex-shrink-0">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">Comisiones de Red</p>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-semibold mt-0.5">
                          Habilitadas
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-slate-200/80 shadow-sm bg-white">
                    <CardContent className="p-4 flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 flex-shrink-0">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">Brokers Activos</p>
                        <p className="text-xl font-bold text-slate-900">{brokers.filter(b => b.isActive).length}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border border-slate-200/80 shadow-sm bg-white overflow-hidden">
                  <CardHeader className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50/40">
                    <div>
                      <CardTitle className="text-base font-semibold text-slate-900">Brokers en mi Red</CardTitle>
                      <CardDescription className="text-xs text-slate-500 mt-0.5">
                        Equipo activo de brokers autorizados para originar solicitudes bajo tu supervisión.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href="/admin/usuarios">
                        <Button variant="outline" size="sm" className="text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 gap-1.5">
                          <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                          Roles y Permisos
                        </Button>
                      </Link>
                      <Button 
                        className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold gap-1.5 shadow-xs"
                        size="sm"
                        onClick={() => {
                          setInviteMasterBrokerId(user?.id || null);
                          setShowInviteModal(true);
                        }}
                        data-testid="button-invite-broker"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Invitar Broker
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5">
                    <div className="space-y-3">
                      {brokers.map((broker) => (
                        <div
                          key={broker.id}
                          className="flex items-center justify-between p-3.5 border border-slate-200/80 rounded-xl hover:bg-slate-50/60 transition-colors bg-white"
                          data-testid={`broker-${broker.id}`}
                        >
                          <div className="flex items-center space-x-3.5">
                            <Avatar className="h-10 w-10 border border-slate-200">
                              <AvatarFallback className="bg-slate-900 text-white font-semibold text-xs">
                                {broker.firstName?.[0]}{broker.lastName?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h3 className="font-semibold text-xs sm:text-sm text-slate-900">
                                {broker.firstName} {broker.lastName}
                              </h3>
                              <p className="text-xs text-slate-500">{broker.email}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Registro {broker.createdAt ? formatDistanceToNow(new Date(broker.createdAt), { 
                                  addSuffix: true, 
                                  locale: es 
                                }) : 'reciente'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <Badge 
                              variant="outline"
                              className={broker.isActive 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-xs" 
                                : "bg-slate-50 text-slate-600 border-slate-200 font-semibold text-xs"}
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
      {/* Resumen Global Institucional para Super Admin */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-slate-200/80 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Master Brokers</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{masterBrokers.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-normal">Líderes de red autorizados</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0">
              <Network className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200/80 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Brokers en Redes MB</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {masterBrokers.reduce((acc: number, mb: any) => acc + (mb.networkBrokers?.length || 0), 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-normal">Asociados a un Master Broker</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200/80 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Brokers Directos</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{independentBrokers.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-normal">Sin Master Broker asignado</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200/80 shadow-sm bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mi Red Directa</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{adminBrokers.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5 font-normal">Casa Matriz / Super Admin</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Búsqueda y Botones de Acción */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[280px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <Input 
            placeholder="Buscar por nombre, email o marca comercial..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white pl-9 h-9 text-xs border-slate-200 rounded-lg"
          />
        </div>
        <Button 
          className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold gap-1.5 h-9"
          onClick={() => {
            setInviteMasterBrokerId(user?.id || null);
            setShowInviteModal(true);
          }}
          data-testid="button-invite-broker"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Invitar Broker a Mi Red
        </Button>
      </div>

      {/* Pestañas de Gestión de Redes */}
      <Tabs defaultValue="master_brokers" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl h-10 inline-flex w-auto border border-slate-200/60">
          <TabsTrigger 
            value="master_brokers" 
            className="flex items-center gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs rounded-lg px-4 py-1.5 text-slate-600 transition-all"
          >
            <Network className="w-3.5 h-3.5" />
            Master Brokers & Redes ({filteredMasterBrokers.length})
          </TabsTrigger>
          <TabsTrigger 
            value="direct_brokers" 
            className="flex items-center gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs rounded-lg px-4 py-1.5 text-slate-600 transition-all"
          >
            <Users className="w-3.5 h-3.5" />
            Brokers Directos ({filteredIndependentBrokers.length})
          </TabsTrigger>
          <TabsTrigger 
            value="admin_network" 
            className="flex items-center gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs rounded-lg px-4 py-1.5 text-slate-600 transition-all"
          >
            <Crown className="w-3.5 h-3.5" />
            Mi Red Directa ({filteredAdminBrokers.length})
          </TabsTrigger>
        </TabsList>

        {/* 1. VISTA DE MASTER BROKERS Y SUS REDES */}
        <TabsContent value="master_brokers" className="mt-4 space-y-3">
          {filteredMasterBrokers.length === 0 ? (
            <Card className="border border-slate-200/80 shadow-sm bg-white">
              <CardContent className="p-8 text-center text-slate-500">
                <Network className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-medium">No se encontraron Master Brokers registrados.</p>
              </CardContent>
            </Card>
          ) : (
            filteredMasterBrokers.map((mb: any) => {
              const isExpanded = expandedMasterBroker === mb.id;
              const networkCount = mb.networkBrokers?.length || 0;

              return (
                <Card key={mb.id} className="border border-slate-200/80 shadow-sm overflow-hidden bg-white">
                  <CardHeader className="bg-slate-50/50 p-4 border-b border-slate-100">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10 border border-slate-200">
                          <AvatarFallback className="bg-slate-900 text-white font-semibold text-xs">
                            {mb.firstName?.[0]}{mb.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-900 text-xs sm:text-sm">
                              {mb.firstName} {mb.lastName}
                            </h3>
                            {mb.brandName && (
                              <Badge variant="outline" className="bg-slate-100 text-slate-800 border-slate-300 text-[10px] font-semibold">
                                {mb.brandName}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-slate-400" /> {mb.email}</span>
                            {mb.phone && <span className="flex items-center gap-1">• <Phone className="w-3 h-3 text-slate-400" /> {mb.phone}</span>}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-semibold">
                          {networkCount} broker{networkCount !== 1 ? 's' : ''} en red
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpandedMasterBroker(isExpanded ? null : mb.id)}
                          className="text-xs h-8 font-semibold text-slate-700 border-slate-200 hover:bg-slate-100 gap-1"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          {isExpanded ? 'Ocultar' : 'Ver Brokers'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="p-4 bg-white">
                      {networkCount === 0 ? (
                        <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500 border border-dashed border-slate-200">
                          Este Master Broker aún no tiene brokers asociados a su red.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(mb.networkBrokers || []).map((broker: any) => (
                            <div 
                              key={broker.id}
                              className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors"
                              data-testid={`broker-${broker.id}`}
                            >
                              <div className="flex items-center space-x-3">
                                <Avatar className="h-8 w-8 border border-slate-200">
                                  <AvatarFallback className="bg-slate-200 text-slate-700 text-xs font-semibold">
                                    {broker.firstName?.[0]}{broker.lastName?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-semibold text-xs text-slate-900">
                                    {broker.firstName} {broker.lastName}
                                  </p>
                                  <p className="text-[11px] text-slate-500">{broker.email}</p>
                                </div>
                              </div>
                              <Badge 
                                variant="outline" 
                                className={broker.isActive 
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold" 
                                  : "bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-semibold"}
                              >
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
          <Card className="border border-slate-200/80 shadow-sm bg-white overflow-hidden">
            <CardHeader className="p-5 border-b border-slate-100 flex flex-row items-center justify-between flex-wrap gap-2 bg-slate-50/40">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">Brokers Directos Independientes</CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Brokers registrados que operan directamente sin pertenecer a la red de un Master Broker.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-xs font-semibold">
                {filteredIndependentBrokers.length} brokers directos
              </Badge>
            </CardHeader>
            <CardContent className="p-5">
              {filteredIndependentBrokers.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No hay brokers directos independientes registrados.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredIndependentBrokers.map((broker: any) => (
                    <div 
                      key={broker.id}
                      className="p-3.5 border border-slate-200/80 rounded-xl flex items-center justify-between hover:bg-slate-50/70 transition-colors bg-white"
                      data-testid={`broker-${broker.id}`}
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-9 w-9 border border-slate-200">
                          <AvatarFallback className="bg-amber-100 text-amber-800 font-semibold text-xs">
                            {broker.firstName?.[0]}{broker.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-xs text-slate-900">
                            {broker.firstName} {broker.lastName}
                          </p>
                          <p className="text-xs text-slate-500">{broker.email}</p>
                          {broker.clabe ? (
                            <p className="text-[11px] text-emerald-700 font-medium mt-0.5 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> CLABE Registrada
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400 mt-0.5">Sin CLABE registrada</p>
                          )}
                        </div>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={broker.isActive 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-semibold" 
                          : "bg-slate-100 text-slate-600 border-slate-200 text-xs font-semibold"}
                      >
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
          <Card className="border border-slate-200/80 shadow-sm bg-white overflow-hidden">
            <CardHeader className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-slate-50/40">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Crown className="w-4 h-4 text-emerald-600" />
                  Red Directa de Casa Matriz (Super Admin)
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Brokers directamente asociados a la red interna de administración de la plataforma.
                </CardDescription>
              </div>
              <Button 
                size="sm"
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold gap-1.5"
                onClick={() => {
                  setInviteMasterBrokerId(user?.id || null);
                  setShowInviteModal(true);
                }}
                data-testid="button-invite-broker"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Invitar a Mi Red
              </Button>
            </CardHeader>
            <CardContent className="p-5">
              {filteredAdminBrokers.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-800 text-xs">No tienes brokers directos asignados a tu red.</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Invita brokers para que operen directamente bajo Casa Matriz.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredAdminBrokers.map((broker: any) => (
                    <div 
                      key={broker.id}
                      className="p-3.5 border border-emerald-100 bg-emerald-50/20 rounded-xl flex items-center justify-between"
                      data-testid={`broker-${broker.id}`}
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-9 w-9 border border-emerald-200">
                          <AvatarFallback className="bg-emerald-700 text-white font-semibold text-xs">
                            {broker.firstName?.[0]}{broker.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-xs text-slate-900">
                            {broker.firstName} {broker.lastName}
                          </p>
                          <p className="text-xs text-slate-500">{broker.email}</p>
                          <p className="text-[11px] text-emerald-800 font-medium mt-0.5">Broker Directo de Casa Matriz</p>
                        </div>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={broker.isActive 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-semibold" 
                          : "bg-slate-100 text-slate-600 border-slate-200 text-xs font-semibold"}
                      >
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
