import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Activity,
  Building2,
  Clock3,
  Eye,
  Search,
  Shield,
  UserRoundCheck,
  Users,
  UserX,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Overview = {
  periodDays: number;
  totalUsers: number;
  activeUsers: number;
  neverUsed: number;
  inactive30d: number;
  sessions: number;
  activeSeconds: number;
};

type UserActivityRow = {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role: string;
  custom_role_title?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  first_login_at?: string | null;
  last_login_at?: string | null;
  last_activity_at?: string | null;
  tenant_id?: string | null;
  tenant_name?: string | null;
  sessions: number;
  active_seconds: number;
  active_days: number;
  last_event_type?: string | null;
  last_event_at?: string | null;
};

type OrganizationActivityRow = {
  id: string;
  name: string;
  type: string;
  members: number;
  active_users: number;
  last_activity_at?: string | null;
  active_seconds: number;
};

function formatDuration(totalSeconds: number): string {
  const seconds = Number(totalSeconds || 0);
  if (seconds < 60) return seconds > 0 ? "< 1 min" : "0 min";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (!hours) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

function displayName(user: UserActivityRow | any): string {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
  return name || user?.email || "Usuario";
}

function activityState(lastActivity?: string | null, firstLogin?: string | null) {
  if (!firstLogin) return { label: "Nunca ha ingresado", variant: "outline" as const };
  if (!lastActivity) return { label: "Sin actividad", variant: "secondary" as const };
  const days = (Date.now() - new Date(lastActivity).getTime()) / 86_400_000;
  if (days <= 7) return { label: "Activo", variant: "default" as const };
  if (days <= 14) return { label: "Seguimiento", variant: "secondary" as const };
  if (days <= 30) return { label: "En riesgo", variant: "outline" as const };
  return { label: "Reactivar", variant: "destructive" as const };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || "Error al consultar actividad");
  }
  return response.json();
}

export default function UserActivityView() {
  const [days, setDays] = useState("30");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserActivityRow | null>(null);
  const [detailTab, setDetailTab] = useState("summary");

  const period = Number(days);

  const overviewQuery = useQuery<Overview>({
    queryKey: ["/api/user-activity/overview", period],
    queryFn: () => getJson(`/api/user-activity/overview?days=${period}`),
  });

  const usersQuery = useQuery<UserActivityRow[]>({
    queryKey: ["/api/user-activity/users", period, search],
    queryFn: () =>
      getJson(
        `/api/user-activity/users?days=${period}&limit=150&search=${encodeURIComponent(search)}`,
      ),
  });

  const organizationsQuery = useQuery<OrganizationActivityRow[]>({
    queryKey: ["/api/user-activity/organizations", period],
    queryFn: () => getJson(`/api/user-activity/organizations?days=${period}`),
  });

  const detailQuery = useQuery<any>({
    queryKey: ["/api/user-activity/users", selectedUser?.id, period],
    queryFn: () => getJson(`/api/user-activity/users/${selectedUser!.id}?days=${period}`),
    enabled: Boolean(selectedUser?.id),
  });

  const eventsQuery = useQuery<any[]>({
    queryKey: ["/api/user-activity/users/events", selectedUser?.id],
    queryFn: () => getJson(`/api/user-activity/users/${selectedUser!.id}/events?limit=150`),
    enabled: Boolean(selectedUser?.id),
  });

  const overview = overviewQuery.data;
  const users = usersQuery.data || [];
  const organizations = organizationsQuery.data || [];

  const securityEvents = useMemo(
    () => (eventsQuery.data || []).filter((event) => event.category === "security"),
    [eventsQuery.data],
  );
  const activityEvents = useMemo(
    () => (eventsQuery.data || []).filter((event) => event.category !== "security"),
    [eventsQuery.data],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Actividad y Bitácora</h2>
          <p className="text-sm text-muted-foreground">
            Sesiones reales, uso por módulo y acciones significativas. No se registran clics individuales.
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
            <SelectItem value="365">Últimos 12 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          title="Usuarios activos"
          value={overview?.activeUsers ?? "—"}
          subtitle={`de ${overview?.totalUsers ?? "—"} usuarios`}
          icon={<UserRoundCheck className="h-4 w-4" />}
        />
        <MetricCard
          title="Sesiones"
          value={overview?.sessions ?? "—"}
          subtitle={`últimos ${period} días`}
          icon={<Activity className="h-4 w-4" />}
        />
        <MetricCard
          title="Tiempo activo"
          value={overview ? formatDuration(overview.activeSeconds) : "—"}
          subtitle="tiempo estimado real"
          icon={<Clock3 className="h-4 w-4" />}
        />
        <MetricCard
          title="Nunca ingresaron"
          value={overview?.neverUsed ?? "—"}
          subtitle="requieren activación"
          icon={<UserX className="h-4 w-4" />}
        />
        <MetricCard
          title="Inactivos +30 días"
          value={overview?.inactive30d ?? "—"}
          subtitle="candidatos a reactivación"
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">
            <Users className="mr-2 h-4 w-4" />
            Por usuario
          </TabsTrigger>
          <TabsTrigger value="organizations">
            <Building2 className="mr-2 h-4 w-4" />
            Por organización
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o correo..."
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Usuario</th>
                      <th className="px-4 py-3 font-medium">Organización</th>
                      <th className="px-4 py-3 font-medium">Última actividad</th>
                      <th className="px-4 py-3 font-medium">Sesiones</th>
                      <th className="px-4 py-3 font-medium">Días activos</th>
                      <th className="px-4 py-3 font-medium">Tiempo activo</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const state = activityState(user.last_activity_at, user.first_login_at);
                      return (
                        <tr key={user.id} className="border-b last:border-0">
                          <td className="px-4 py-3">
                            <div className="font-medium">{displayName(user)}</div>
                            <div className="text-xs text-muted-foreground">
                              {user.email} · {user.custom_role_title || user.role}
                            </div>
                          </td>
                          <td className="px-4 py-3">{user.tenant_name || "—"}</td>
                          <td className="px-4 py-3">
                            {user.last_activity_at
                              ? formatDistanceToNow(new Date(user.last_activity_at), {
                                  locale: es,
                                  addSuffix: true,
                                })
                              : "Sin actividad"}
                          </td>
                          <td className="px-4 py-3">{user.sessions || 0}</td>
                          <td className="px-4 py-3">{user.active_days || 0}</td>
                          <td className="px-4 py-3">{formatDuration(user.active_seconds)}</td>
                          <td className="px-4 py-3">
                            <Badge variant={state.variant}>{state.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setDetailTab("summary");
                              }}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Ver
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {!usersQuery.isLoading && users.length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-muted-foreground" colSpan={8}>
                          No hay usuarios para los filtros seleccionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organizations">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Organización</th>
                      <th className="px-4 py-3 font-medium">Miembros</th>
                      <th className="px-4 py-3 font-medium">Activos</th>
                      <th className="px-4 py-3 font-medium">Tiempo activo</th>
                      <th className="px-4 py-3 font-medium">Última actividad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {organizations.map((organization) => (
                      <tr key={organization.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{organization.name}</div>
                          <div className="text-xs text-muted-foreground">{organization.type}</div>
                        </td>
                        <td className="px-4 py-3">{organization.members || 0}</td>
                        <td className="px-4 py-3">{organization.active_users || 0}</td>
                        <td className="px-4 py-3">{formatDuration(organization.active_seconds)}</td>
                        <td className="px-4 py-3">
                          {organization.last_activity_at
                            ? formatDistanceToNow(new Date(organization.last_activity_at), {
                                locale: es,
                                addSuffix: true,
                              })
                            : "Sin actividad"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedUser ? displayName(selectedUser) : "Actividad de usuario"}</DialogTitle>
            <DialogDescription>
              {selectedUser?.email} · {selectedUser?.tenant_name || "Sin organización asignada"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList>
              <TabsTrigger value="summary">Resumen</TabsTrigger>
              <TabsTrigger value="activity">Actividad</TabsTrigger>
              <TabsTrigger value="security">
                <Shield className="mr-2 h-4 w-4" />
                Seguridad
              </TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-5 pt-3">
              <div className="grid gap-3 md:grid-cols-3">
                <SmallStat
                  label="Primer acceso"
                  value={
                    detailQuery.data?.user?.first_login_at
                      ? format(new Date(detailQuery.data.user.first_login_at), "dd MMM yyyy HH:mm", {
                          locale: es,
                        })
                      : "Nunca"
                  }
                />
                <SmallStat
                  label="Último acceso"
                  value={
                    detailQuery.data?.user?.last_login_at
                      ? format(new Date(detailQuery.data.user.last_login_at), "dd MMM yyyy HH:mm", {
                          locale: es,
                        })
                      : "—"
                  }
                />
                <SmallStat
                  label="Última actividad"
                  value={
                    detailQuery.data?.user?.last_activity_at
                      ? format(new Date(detailQuery.data.user.last_activity_at), "dd MMM yyyy HH:mm", {
                          locale: es,
                        })
                      : "—"
                  }
                />
              </div>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Módulos utilizados</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {(detailQuery.data?.modules || []).map((module: any) => (
                    <div key={module.module_id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{module.module_id}</span>
                        <span className="text-sm">{formatDuration(module.active_seconds)}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {module.enter_count} entradas · última vez{" "}
                        {module.last_seen_at
                          ? formatDistanceToNow(new Date(module.last_seen_at), {
                              locale: es,
                              addSuffix: true,
                            })
                          : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Sesiones recientes</h3>
                <div className="space-y-2">
                  {(detailQuery.data?.sessions || []).map((session: any) => (
                    <div key={session.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {format(new Date(session.started_at), "dd MMM yyyy HH:mm", { locale: es })}
                        </span>
                        <Badge variant="outline">{formatDuration(session.active_seconds)}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Última actividad:{" "}
                        {session.last_active_at
                          ? format(new Date(session.last_active_at), "HH:mm", { locale: es })
                          : "—"}
                        {" · "}
                        {session.end_reason || (session.ended_at ? "finalizada" : "abierta")}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="activity" className="pt-3">
              <EventList events={activityEvents} />
            </TabsContent>

            <TabsContent value="security" className="pt-3">
              <EventList events={securityEvents} showSecurity />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function EventList({ events, showSecurity = false }: { events: any[]; showSecurity?: boolean }) {
  if (!events.length) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No hay eventos registrados.</div>;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={event.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-medium">{event.event_type}</span>
              {event.module_id && (
                <Badge variant="outline" className="ml-2">
                  {event.module_id}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {format(new Date(event.occurred_at), "dd MMM yyyy HH:mm:ss", { locale: es })}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {event.entity_type ? `${event.entity_type}${event.entity_id ? ` · ${event.entity_id}` : ""}` : ""}
            {showSecurity && event.ip_address ? ` · IP ${event.ip_address}` : ""}
          </div>
          {showSecurity && event.user_agent && (
            <div className="mt-2 break-all text-xs text-muted-foreground">{event.user_agent}</div>
          )}
        </div>
      ))}
    </div>
  );
}
