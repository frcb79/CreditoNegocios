import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem 
} from "@/components/ui/dropdown-menu";
import { Client, User, Credit } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { 
  Search, 
  Plus, 
  Users, 
  MoreHorizontal, 
  Eye, 
  Mail, 
  Phone, 
  Building2, 
  User as UserIcon,
  Home,
  Briefcase
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientListProps {
  onSelectClient: (client: Client) => void;
  onNewClient: () => void;
}

export default function ClientList({ onSelectClient, onNewClient }: ClientListProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterBroker, setFilterBroker] = useState<string>("all");
  const [filterMasterBroker, setFilterMasterBroker] = useState<string>("all");

  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: credits } = useQuery<Credit[]>({
    queryKey: ["/api/credits"],
  });

  const { data: submissions } = useQuery<any[]>({
    queryKey: ["/api/credit-submissions"],
  });

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  // Extract brokers and master brokers for filter dropdowns
  const brokerOptions = (allUsers || []).filter(u => u.role === 'broker');
  const masterBrokerOptions = (allUsers || []).filter(u => u.role === 'master_broker');

  // Compute active operations count per client (credits + active submissions)
  const operationsCountMap = useMemo(() => {
    const map = new Map<string, number>();
    
    // Count credits
    (credits || []).forEach(credit => {
      if (credit.clientId) {
        map.set(credit.clientId, (map.get(credit.clientId) || 0) + 1);
      }
    });

    // Count submissions that aren't converted to credits yet
    (submissions || []).forEach(sub => {
      if (sub.clientId && !sub.creditId) {
        map.set(sub.clientId, (map.get(sub.clientId) || 0) + 1);
      }
    });

    return map;
  }, [credits, submissions]);

  const filteredClients = useMemo(() => {
    return (clients || []).filter(client => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        !searchTerm ||
        client.businessName?.toLowerCase().includes(term) ||
        client.firstName?.toLowerCase().includes(term) ||
        client.lastName?.toLowerCase().includes(term) ||
        client.rfc?.toLowerCase().includes(term) ||
        client.email?.toLowerCase().includes(term) ||
        client.phone?.includes(term);
      
      const matchesType = filterType === "all" || client.type === filterType;

      const matchesBroker = filterBroker === "all" || 
        client.brokerId === filterBroker || 
        (client as any).broker?.id === filterBroker;

      const matchesMasterBroker = filterMasterBroker === "all" || 
        (client as any).masterBroker?.id === filterMasterBroker ||
        (client as any).broker?.masterBrokerId === filterMasterBroker;
      
      return matchesSearch && matchesType && matchesBroker && matchesMasterBroker;
    });
  }, [clients, searchTerm, filterType, filterBroker, filterMasterBroker]);

  const formatRelativeDate = (dateVal: any) => {
    if (!dateVal) return "—";
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return "—";
      return formatDistanceToNow(d, { addSuffix: true, locale: es });
    } catch {
      return "—";
    }
  };

  const getClientDisplayName = (client: Client) => {
    if (client.type === 'persona_moral') {
      return client.businessName || "Sin razón social";
    }
    const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim();
    return fullName || client.businessName || "Sin nombre";
  };

  const getTypeBadge = (client: Client) => {
    switch (client.type) {
      case 'persona_moral':
        return {
          label: 'PM',
          title: 'Persona Moral',
          badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/80',
          dotClass: 'bg-blue-500'
        };
      case 'fisica_empresarial':
        return {
          label: 'PFAE',
          title: 'Persona Física con Actividad Empresarial',
          badgeClass: 'bg-purple-50 text-purple-700 border-purple-200/80',
          dotClass: 'bg-purple-500'
        };
      case 'fisica':
        return {
          label: 'PF',
          title: 'Persona Física',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
          dotClass: 'bg-emerald-500'
        };
      default:
        return {
          label: 'Sin SAT',
          title: 'Sin registro SAT',
          badgeClass: 'bg-slate-50 text-slate-700 border-slate-200/80',
          dotClass: 'bg-slate-400'
        };
    }
  };

  if (clientsLoading) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4 p-3 border border-slate-100 rounded-lg">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <div className="flex-1" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
      {/* Subheader / Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row gap-4 md:items-center md:justify-between bg-white">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Clientes registrados
            </h2>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {filteredClients.length}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 flex-1 md:max-w-none lg:max-w-2xl md:justify-end">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por cliente, RFC o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-clients"
              className="pl-9 h-9 text-xs placeholder:text-slate-400 border-slate-200 bg-slate-50/50 focus:bg-white transition-colors"
            />
          </div>

          {/* Filter Type */}
          <div className="w-full sm:w-40">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger data-testid="select-client-type" className="h-9 text-xs border-slate-200 bg-white">
                <SelectValue placeholder="Tipo de cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los Tipos</SelectItem>
                <SelectItem value="fisica">Personas Físicas (PF)</SelectItem>
                <SelectItem value="persona_moral">Personas Morales (PM)</SelectItem>
                <SelectItem value="fisica_empresarial">PFAE</SelectItem>
                <SelectItem value="sin_sat">Sin SAT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Admin filters */}
          {isAdmin && (
            <>
              {masterBrokerOptions.length > 0 && (
                <div className="w-full sm:w-44">
                  <Select value={filterMasterBroker} onValueChange={setFilterMasterBroker}>
                    <SelectTrigger data-testid="select-master-broker" className="h-9 text-xs border-slate-200 bg-white">
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
              )}

              {brokerOptions.length > 0 && (
                <div className="w-full sm:w-40">
                  <Select value={filterBroker} onValueChange={setFilterBroker}>
                    <SelectTrigger data-testid="select-broker" className="h-9 text-xs border-slate-200 bg-white">
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
              )}
            </>
          )}

          {/* Primary CTA */}
          <Button 
            onClick={onNewClient}
            className="bg-primary hover:bg-primary-dark text-primary-foreground text-xs font-medium h-9 shadow-sm shrink-0 whitespace-nowrap"
            data-testid="button-new-client"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>Nuevo Cliente</span>
          </Button>
        </div>
      </div>

      {/* Table Content */}
      {filteredClients.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">
            {clients?.length === 0 ? "No tienes clientes registrados" : "Sin resultados para tu búsqueda"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            {clients?.length === 0
              ? "Agrega tu primer cliente o prospecto para comenzar a originar expedientes de crédito."
              : "Intenta ajustar el término de búsqueda o cambia los filtros seleccionados."}
          </p>
          <Button 
            onClick={onNewClient}
            className="bg-primary hover:bg-primary-dark text-white text-xs h-8"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            + Nuevo Cliente / Prospecto
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 select-none">
                <th className="py-3 px-4">Cliente / Razón Social</th>
                <th className="py-3 px-3 text-center">Tipo</th>
                <th className="py-3 px-4">Contacto</th>
                <th className="py-3 px-3 text-center">Operaciones</th>
                <th className="py-3 px-4">Originador</th>
                <th className="py-3 px-3 text-center">Última Actividad</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClients.map((client) => {
                const typeInfo = getTypeBadge(client);
                const activeOps = operationsCountMap.get(client.id) || 0;
                const displayName = getClientDisplayName(client);
                const lastActivityDate = client.updatedAt || client.createdAt;

                return (
                  <tr
                    key={client.id}
                    onClick={() => onSelectClient(client)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer group h-[60px]"
                    data-testid={`client-${client.id}`}
                  >
                    {/* 1. Cliente / Razón Social */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col min-w-0 max-w-xs sm:max-w-sm">
                        <div className="flex items-center gap-1.5">
                          <span 
                            className="text-sm font-semibold text-slate-900 group-hover:text-primary transition-colors truncate"
                            data-testid={`client-name-${client.id}`}
                            title={displayName}
                          >
                            {displayName}
                          </span>
                          {client.originOpportunity === 'hipotecario_vivienda' && (
                            <span 
                              data-testid={`client-origin-${client.id}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 shrink-0"
                              title="Origen Hipotecario Vivienda"
                            >
                              <Home className="w-2.5 h-2.5 text-amber-700" />
                              <span>Hipotecario</span>
                            </span>
                          )}
                          {client.originOpportunity === 'credito_empresarial' && (
                            <span 
                              data-testid={`client-origin-${client.id}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-800 border border-blue-200 shrink-0"
                              title="Origen Crédito Empresarial"
                            >
                              <Briefcase className="w-2.5 h-2.5 text-blue-700" />
                              <span>Empresarial</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span>RFC: {client.rfc || 'No proporcionado'}</span>
                          {client.industry && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="truncate max-w-[140px]" title={client.industry}>{client.industry}</span>
                            </>
                          )}
                          {client.puesto && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="truncate max-w-[140px]" title={client.puesto}>{client.puesto}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 2. Tipo PF / PM */}
                    <td className="py-3 px-3 text-center">
                      <span 
                        data-testid={`client-type-${client.id}`}
                        title={typeInfo.title}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap",
                          typeInfo.badgeClass
                        )}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", typeInfo.dotClass)} />
                        <span>{typeInfo.label}</span>
                      </span>
                    </td>

                    {/* 3. Contacto */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col text-xs text-slate-700 space-y-0.5 max-w-[200px]">
                        {client.phone ? (
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate font-medium">{client.phone}</span>
                          </div>
                        ) : null}
                        {client.email ? (
                          <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate" title={client.email}>{client.email}</span>
                          </div>
                        ) : null}
                        {!client.phone && !client.email && (
                          <span className="text-xs text-slate-400 italic">Sin contacto</span>
                        )}
                      </div>
                    </td>

                    {/* 4. Operaciones activas */}
                    <td className="py-3 px-3 text-center">
                      {activeOps > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {activeOps} {activeOps === 1 ? 'activa' : 'activas'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    {/* 5. Originador */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col text-xs max-w-[160px]">
                        {(client as any).broker ? (
                          <span 
                            className="font-medium text-slate-800 truncate"
                            title={`${(client as any).broker.firstName} ${(client as any).broker.lastName || ''}`}
                          >
                            {(client as any).broker.firstName} {(client as any).broker.lastName || ''}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">No asignado</span>
                        )}
                        {(client as any).masterBroker && (
                          <span 
                            className="text-[11px] text-slate-500 truncate"
                            title={`MB: ${(client as any).masterBroker.brandName || (client as any).masterBroker.firstName}`}
                          >
                            MB: {(client as any).masterBroker.brandName || `${(client as any).masterBroker.firstName} ${(client as any).masterBroker.lastName || ''}`}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 6. Última actividad */}
                    <td className="py-3 px-3 text-center">
                      <span 
                        className="text-xs text-slate-500 whitespace-nowrap"
                        title={lastActivityDate ? format(new Date(lastActivityDate), "dd 'de' MMMM, yyyy HH:mm", { locale: es }) : undefined}
                      >
                        {formatRelativeDate(lastActivityDate)}
                      </span>
                    </td>

                    {/* 7. Acciones */}
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs font-medium text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-50"
                          onClick={() => onSelectClient(client)}
                        >
                          Ver detalle
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
                              data-testid={`menu-client-${client.id}`}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 text-xs">
                            <DropdownMenuItem onClick={() => onSelectClient(client)}>
                              <Eye className="w-3.5 h-3.5 mr-2 text-slate-500" />
                              Ver expediente
                            </DropdownMenuItem>
                            {client.email && (
                              <DropdownMenuItem onClick={() => window.open(`mailto:${client.email}`, '_blank')}>
                                <Mail className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                Enviar correo
                              </DropdownMenuItem>
                            )}
                            {client.phone && (
                              <DropdownMenuItem onClick={() => window.open(`tel:${client.phone}`, '_blank')}>
                                <Phone className="w-3.5 h-3.5 mr-2 text-slate-500" />
                                Llamar
                              </DropdownMenuItem>
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
  );
}
