import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Clock3, CalendarDays, LogIn, Activity, ShieldAlert, Monitor, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Tenant } from "@shared/schema";

type ActivityUser = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  custom_role_title: string | null;
  first_login_at: string | null;
  last_login_at: string | null;
  last_seen_at: string | null;
  sessions_period: number;
  active_days_period: number;
  active_seconds_period: number;
  last_activity_at: string | null;
  last_event_at: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "Sin registro";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin registro" : date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(seconds?: number | null) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    "auth.login": "Inició sesión",
    "auth.logout": "Cerró sesión",
    "auth.login_failed": "Intento fallido de acceso",
    "client.created": "Creó un cliente",
    "client.updated": "Modificó un cliente",
    "client.deleted": "Eliminó un cliente",
    "credit.created": "Inició un crédito",
    "credit.updated": "Modificó un crédito",
    "credit.deleted": "Eliminó un crédito",
    "document.uploaded": "Cargó un documento",
    "document.updated": "Modificó un documento",
    "document.deleted": "Eliminó un documento",
    "submission.changed": "Actualizó una solicitud",
    "commission.changed": "Actualizó una comisión",
    "user_membership.changed": "Actualizó un usuario o membresía",
    "user_status.changed": "Cambió el estado de un usuario",
  };
  return labels[type] || type;
}

export default function UserActivityPanel({
  tenants = [],
  defaultTenantId,
  platformWide = false,
}: {
  tenants?: Tenant[];
  defaultTenantId?: string;
  platformWide?: boolean;
}) {
  const [days, setDays] = useState("30");
  const [tenantId, setTenantId] = useState(platformWide ? "all" : (defaultTenantId || "all"));
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const summaryQuery = useQuery<{ days: number; users: ActivityUser[] }>({
    queryKey: ["/api/activity/summary", days, tenantId],
    queryFn: async () => {
      const params = new URLSearchParams({ days });
      if (tenantId !== "all") params.set("tenantId", tenantId);
      const res = await apiRequest("GET", `/api/activity/summary?${params.toString()}`);
      return res.json();
    },
  });

  const detailQuery = useQuery<any>({
    queryKey: ["/api/activity/users", selectedUserId, days, tenantId],
    queryFn: async () => {
      const params = new URLSearchParams({ days });
      if (tenantId !== "all") params.set("tenantId", tenantId);
      const res = await apiRequest("GET", `/api/activity/users/${selectedUserId}?${params.toString()}`);
      return res.json();
    },
    enabled: Boolean(selectedUserId),
  });

  const users = summaryQuery.data?.users || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.first_name, u.last_name, u.email, u.custom_role_title, u.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [users, search]);

  const totalActive = users.filter((u) => u.active_days_period > 0).length;
  const totalSessions = users.reduce((sum, u) => sum + Number(u.sessions_period || 0), 0);
  const totalSeconds = users.reduce((sum, u) => sum + Number(u.active_seconds_period || 0), 0);
  const neverLogged = users.filter((u) => !u.last_login_at).length;
  const detail = detailQuery.data;

  return (
    <div className="space-y-4" data-testid="user-activity-panel">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="w-4 h-4" />Usuarios activos</div><div className="text-2xl font-bold mt-1">{totalActive}<span className="text-xs font-normal text-muted-foreground"> / {users.length}</span></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><LogIn className="w-4 h-4" />Sesiones</div><div className="text-2xl font-bold mt-1">{totalSessions}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="w-4 h-4" />Tiempo activo</div><div className="text-2xl font-bold mt-1">{formatDuration(totalSeconds)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldAlert className="w-4 h-4" />Nunca ingresaron</div><div className="text-2xl font-bold mt-1">{neverLogged}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Actividad y Bitácora</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Sesiones reales, días activos, tiempo estimado y acciones significativas. No se registran clics individuales.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {tenants.length > 0 && (
                <Select value={tenantId} onValueChange={setTenantId}>
                  <SelectTrigger className="w-[220px] h-9 text-xs"><SelectValue placeholder="Organización" /></SelectTrigger>
                  <SelectContent>
                    {platformWide && <SelectItem value="all">Todas las organizaciones</SelectItem>}
                    {tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 días</SelectItem>
                  <SelectItem value="30">30 días</SelectItem>
                  <SelectItem value="90">90 días</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar usuario, correo o rol..." className="pl-9 h-9" />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="text-left p-3 font-semibold">Usuario</th>
                  <th className="text-left p-3 font-semibold">Último acceso</th>
                  <th className="text-right p-3 font-semibold">Sesiones</th>
                  <th className="text-right p-3 font-semibold">Días activos</th>
                  <th className="text-right p-3 font-semibold">Tiempo activo</th>
                  <th className="text-left p-3 font-semibold">Última actividad</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "Usuario";
                  return (
                    <tr key={user.id} className="border-t hover:bg-muted/30">
                      <td className="p-3"><div className="font-semibold">{name}</div><div className="text-muted-foreground">{user.email}</div><Badge variant="outline" className="mt-1 text-[10px]">{user.custom_role_title || user.role}</Badge></td>
                      <td className="p-3">{formatDate(user.last_login_at)}</td>
                      <td className="p-3 text-right font-semibold">{user.sessions_period}</td>
                      <td className="p-3 text-right">{user.active_days_period}</td>
                      <td className="p-3 text-right">{formatDuration(user.active_seconds_period)}</td>
                      <td className="p-3">{formatDate(user.last_activity_at || user.last_event_at)}</td>
                      <td className="p-2"><Button variant="ghost" size="icon" onClick={() => setSelectedUserId(user.id)}><ChevronRight className="w-4 h-4" /></Button></td>
                    </tr>
                  );
                })}
                {!summaryQuery.isLoading && filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No hay actividad para los filtros seleccionados.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedUserId)} onOpenChange={(open) => !open && setSelectedUserId(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalle de actividad</DialogTitle></DialogHeader>
          {detail && (
            <Tabs defaultValue="summary">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="summary">Resumen</TabsTrigger>
                <TabsTrigger value="activity">Actividad</TabsTrigger>
                <TabsTrigger value="security">Seguridad</TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="space-y-4 mt-4">
                <div className="grid sm:grid-cols-3 gap-3">
                  <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Primer acceso</div><div className="font-semibold mt-1">{formatDate(detail.user.first_login_at)}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Último acceso</div><div className="font-semibold mt-1">{formatDate(detail.user.last_login_at)}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Última presencia</div><div className="font-semibold mt-1">{formatDate(detail.user.last_seen_at)}</div></CardContent></Card>
                </div>
                <div>
                  <div className="text-sm font-semibold mb-2 flex items-center gap-2"><CalendarDays className="w-4 h-4" />Sesiones recientes</div>
                  <div className="space-y-2">
                    {detail.sessions?.map((session: any) => (
                      <div key={session.id} className="border rounded-lg p-3 text-xs flex flex-wrap justify-between gap-2">
                        <span>{formatDate(session.started_at)} · {formatDuration(session.active_seconds)}</span>
                        <span className="text-muted-foreground">{Array.isArray(session.modules_visited) ? session.modules_visited.join(", ") : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="activity" className="mt-4">
                <div className="space-y-2">
                  {detail.events?.filter((e: any) => e.category !== "security").map((event: any) => (
                    <div key={event.id} className="border rounded-lg p-3 text-xs flex items-start justify-between gap-3">
                      <div><div className="font-semibold">{eventLabel(event.event_type)}</div><div className="text-muted-foreground">{event.module || "Plataforma"}{event.entity_id ? ` · ${event.entity_id}` : ""}</div></div>
                      <span className="text-muted-foreground whitespace-nowrap">{formatDate(event.created_at)}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="security" className="mt-4 space-y-2">
                {detail.events?.filter((e: any) => e.category === "security" || e.category === "auth").map((event: any) => (
                  <div key={event.id} className="border rounded-lg p-3 text-xs">
                    <div className="flex justify-between gap-3"><span className="font-semibold flex items-center gap-2"><Monitor className="w-4 h-4" />{eventLabel(event.event_type)}</span><span className="text-muted-foreground">{formatDate(event.created_at)}</span></div>
                    <div className="text-muted-foreground mt-1">IP: {event.ip_address || "No disponible"} · {event.user_agent || "Dispositivo no disponible"}</div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
