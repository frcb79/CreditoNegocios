import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { ClipboardList, ArrowRight, Search } from "lucide-react";

// READ-ONLY presentation of EXISTING audit sources. Do not change audit persistence,
// historical values or the permissions of their originating endpoints.
type Person = {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
};
type AuditEntry = {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  targetUserId?: string | null;
  performedBy?: string | null;
  previousState?: string | null;
  newState?: string | null;
  notes?: string | null;
  createdAt?: string | Date | null;
  metadata?: { reason?: unknown; notes?: unknown; targetEmail?: unknown } | null;
};
type StatusRequest = {
  id: string;
  requesterId?: string;
  targetUserId?: string;
  requestedStatus: string;
  status: string;
  reason?: string | null;
  createdAt?: string | Date | null;
  reviewedAt?: string | Date | null;
  requester?: Person | null;
  targetUser?: Person | null;
  reviewer?: Person | null;
};
type AuditSection = "commercial" | "configuration" | "requests";
type AuditRow = {
  entry: AuditEntry;
  actionLabel: string;
  actorLabel: string;
  actorRole: string;
  targetLabel: string;
  description: string;
  request?: StatusRequest;
};

function formatDate(dateValue?: string | Date | null) {
  if (!dateValue) return "Fecha no disponible";
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" :
    date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}
function displayName(person?: Person | null) {
  if (!person) return "Cuenta no disponible";
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    person.email || "Cuenta no disponible";
}
function roleName(role?: string | null) {
  return ({
    super_admin: "Super Admin", admin: "Admin", master_broker: "Master Broker",
    broker: "Broker",
  } as Record<string, string>)[role || ""] || "Usuario";
}
function statusName(status?: string | null) {
  const labels: Record<string, string> = {
    active: "Activo", inactive: "Inactivo", suspended: "Suspendido",
    pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada",
    registered_hold: "Reservada", protected_active: "Protegida",
    expired_released: "Liberada", disputed: "En disputa",
  };
  return labels[status || ""] || status || "No registrado";
}
function requestAction(request?: StatusRequest) {
  return request?.requestedStatus === "active" ? "Reactivación" :
    request?.requestedStatus === "inactive" ? "Baja / inactivación" : "Cambio de estado";
}
function actionLabel(entry: AuditEntry, request?: StatusRequest) {
  const labels: Record<string, string> = {
    create_status_request: "Solicitó " + requestAction(request).toLowerCase() + " de un Broker",
    approve_status_request: "Aprobó una solicitud de cambio de estado",
    reject_status_request: "Rechazó una solicitud de cambio de estado",
    reactivate: "Reactivó una cuenta", suspend: "Suspendió una cuenta",
    deactivate: "Inhabilitó una cuenta", opportunity_created: "Registró una oportunidad comercial",
    opportunity_conflict_attempt: "Intentó registrar una oportunidad protegida",
    opportunity_hold_validated: "Validó la protección de una oportunidad",
    opportunity_protection_extended: "Extendió la protección comercial",
    opportunity_expired_released: "Liberó una oportunidad por vencimiento",
    opportunity_disputed: "Abrió una disputa comercial",
    relationship_reactivated: "Reactivó una relación comercial",
    activity_logged_unqualified: "Registró una actividad comercial",
  };
  if (labels[entry.action]) return labels[entry.action];
  const subject = ({
    user: "usuario", commercial_opportunity: "oportunidad comercial",
    client_commercial_relationship: "relación comercial",
    commercial_activity: "actividad comercial", user_status_request: "solicitud de estado",
    commercial_configuration: "configuración comercial",
  } as Record<string, string>)[entry.entityType || ""];
  return subject ? "Registró un cambio de " + subject : "Registró una actividad administrativa";
}
function reasonFor(entry: AuditEntry, request?: StatusRequest) {
  if (request?.reason) return request.reason;
  if (typeof entry.metadata?.reason === "string") return entry.metadata.reason;
  if (typeof entry.metadata?.notes === "string") return entry.metadata.notes;
  // Legacy request audit events occasionally have notes but no metadata.
  return entry.notes || "";
}
function inDateRange(value: string | Date | null | undefined, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
    "-" + String(date.getDate()).padStart(2, "0");
  return (!from || day >= from) && (!to || day <= to);
}
async function getJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  if (!response.ok) throw new Error("No fue posible consultar la bitácora.");
  return response.json();
}

export default function SuperAdminAudit() {
  const [section, setSection] = useState<AuditSection>("commercial");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actorRole, setActorRole] = useState("all");
  const [result, setResult] = useState("all");

  const commercial = useQuery<AuditEntry[]>({
    queryKey: ["/api/commercial/audit-logs", { limit: 100 }],
    enabled: section === "commercial",
    queryFn: () => getJson<AuditEntry[]>("/api/commercial/audit-logs?limit=100"),
  });
  const configuration = useQuery<{ logs: AuditEntry[] }>({
    queryKey: ["/api/admin/commercial-config/audit", { limit: 100 }],
    enabled: section === "configuration",
    queryFn: () => getJson<{ logs: AuditEntry[] }>("/api/admin/commercial-config/audit?limit=100"),
  });
  // Master requests already include hydrated requester and target accounts.
  const requests = useQuery<StatusRequest[]>({
    queryKey: ["/api/admin/status-requests"],
    enabled: section !== "configuration",
    queryFn: () => getJson<StatusRequest[]>("/api/admin/status-requests"),
  });
  const users = useQuery<Person[]>({
    queryKey: ["/api/users"],
    enabled: section !== "requests",
    queryFn: () => getJson<Person[]>("/api/users"),
  });
  const userMap = useMemo(() => new Map((users.data || []).map(user => [user.id, user])), [users.data]);
  const requestMap = useMemo(() => new Map((requests.data || []).map(req => [req.id, req])), [requests.data]);
  const selectedAudit = section === "commercial" ? commercial : configuration;
  const entries = section === "commercial" ? commercial.data || [] : configuration.data?.logs || [];
  const rows = useMemo<AuditRow[]>(() => entries.map(entry => {
    const request = entry.entityType === "user_status_request" ?
      requestMap.get(entry.entityId || "") : undefined;
    const actor = entry.performedBy ? userMap.get(entry.performedBy) : undefined;
    const requestActor = request?.requester;
    const isSystem = Boolean(entry.performedBy?.startsWith("system_"));
    const actorLabel = isSystem ? "Sistema (proceso automático)" :
      displayName(actor || (entry.action === "create_status_request" ? requestActor : null));
    const actualRole = actor?.role || (entry.action === "create_status_request" ? requestActor?.role : null) || "";
    const target = entry.targetUserId ? userMap.get(entry.targetUserId) : undefined;
    const entityUser = entry.entityType === "user" && entry.entityId ? userMap.get(entry.entityId) : undefined;
    const targetLabel = request ? displayName(request.targetUser) :
      target || entityUser ? displayName(target || entityUser) :
      typeof entry.metadata?.targetEmail === "string" ? entry.metadata.targetEmail : "";
    return {
      entry, request, actorLabel,
      actorRole: isSystem ? "system" : actualRole,
      targetLabel,
      actionLabel: actionLabel(entry, request),
      description: reasonFor(entry, request),
    };
  }), [entries, userMap, requestMap]);

  const filteredRows = rows.filter(row => {
    const text = [row.actionLabel, row.actorLabel, row.targetLabel, row.description,
      row.request?.requester?.email, row.request?.targetUser?.email].filter(Boolean).join(" ").toLowerCase();
    return (!search || text.includes(search.toLowerCase())) &&
      (actorRole === "all" || row.actorRole === actorRole) &&
      (result === "all" || statusName(row.request?.status || row.entry.newState).toLowerCase() === statusName(result).toLowerCase()) &&
      inDateRange(row.entry.createdAt, fromDate, toDate);
  });
  const filteredRequests = (requests.data || []).filter(request => {
    const text = [displayName(request.requester), displayName(request.targetUser),
      request.requester?.email, request.targetUser?.email, request.reason, requestAction(request)]
      .filter(Boolean).join(" ").toLowerCase();
    return (!search || text.includes(search.toLowerCase())) &&
      (actorRole === "all" || request.requester?.role === actorRole) &&
      (result === "all" || request.status === result) &&
      inDateRange(request.createdAt, fromDate, toDate);
  });

  return (
    <MainLayout>
      <Header title="Auditoría Administrativa" subtitle="Quién hizo qué, a quién afectó y cuándo" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4">
          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="w-4 h-4" /> Historial administrativo
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Registro de sólo lectura construido con las fuentes actuales de gobernanza, reglas comerciales
                y solicitudes de estado. No incluye todavía toda la actividad de clientes, créditos y comisiones.
                Los identificadores técnicos se conservan en el sistema, no en este listado.
              </CardDescription>
            </CardHeader>
          </Card>

          <Tabs value={section} onValueChange={value => {setSection(value as AuditSection); setResult("all");}}>
            <TabsList className="flex flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="commercial" data-testid="audit-tab-commercial" className="text-xs">Gobernanza comercial</TabsTrigger>
              <TabsTrigger value="configuration" data-testid="audit-tab-configuration" className="text-xs">Reglas comerciales</TabsTrigger>
              <TabsTrigger value="requests" data-testid="audit-tab-requests" className="text-xs">Solicitudes de estado</TabsTrigger>
            </TabsList>
            <Card className="border-border/70 mt-3">
              <CardContent className="p-3 sm:p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  <label className="text-xs space-y-1 lg:col-span-2">
                    <span className="font-medium">Buscar persona, Broker, Master o acción</span>
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                      <Input value={search} onChange={event => setSearch(event.target.value)}
                        placeholder="Nombre, correo, evento o motivo" className="pl-8 h-9 text-xs"
                        data-testid="audit-filter-search" />
                    </div>
                  </label>
                  <label className="text-xs space-y-1">
                    <span className="font-medium">Desde</span>
                    <Input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)}
                      className="h-9 text-xs" data-testid="audit-filter-from" />
                  </label>
                  <label className="text-xs space-y-1">
                    <span className="font-medium">Hasta</span>
                    <Input type="date" value={toDate} onChange={event => setToDate(event.target.value)}
                      className="h-9 text-xs" data-testid="audit-filter-to" />
                  </label>
                  <label className="text-xs space-y-1">
                    <span className="font-medium">Responsable</span>
                    <select value={actorRole} onChange={event => setActorRole(event.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                      data-testid="audit-filter-role">
                      <option value="all">Todos los roles</option>
                      <option value="super_admin">Super Admin</option>
                      <option value="admin">Admin</option>
                      <option value="master_broker">Master Broker</option>
                      <option value="broker">Broker</option>
                      {section !== "requests" && <option value="system">Sistema</option>}
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <label className="text-xs flex items-center gap-2">
                    <span className="font-medium">Resultado</span>
                    <select value={result} onChange={event => setResult(event.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      data-testid="audit-filter-result">
                      <option value="all">Todos</option>
                      {section === "requests" ? (
                        <>
                          <option value="pending">Pendiente</option>
                          <option value="approved">Aprobada</option>
                          <option value="rejected">Rechazada</option>
                        </>
                      ) : (
                        <>
                          <option value="active">Activo</option>
                          <option value="inactive">Inactivo</option>
                          <option value="suspended">Suspendido</option>
                        </>
                      )}
                    </select>
                  </label>
                  <Button variant="outline" size="sm" type="button" onClick={() => {
                    setSearch(""); setFromDate(""); setToDate(""); setActorRole("all"); setResult("all");
                  }} data-testid="audit-filter-reset">Limpiar filtros</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Los filtros se aplican a los registros cargados. Gobernanza y reglas muestran hasta 100 eventos recientes;
                  una búsqueda sin resultados no significa que no existan eventos más antiguos.
                </p>
              </CardContent>
            </Card>

            <TabsContent value="commercial" className="mt-4" data-testid="audit-commercial-content">
              {selectedAudit.isLoading || users.isLoading || requests.isLoading ?
                <p className="text-sm">Cargando historial y nombres...</p> :
                selectedAudit.isError ? <p className="text-sm text-destructive">No se pudo consultar la bitácora.</p> :
                <AuditEntries rows={filteredRows} />}
            </TabsContent>
            <TabsContent value="configuration" className="mt-4">
              {selectedAudit.isLoading || users.isLoading ?
                <p className="text-sm">Cargando cambios de configuración...</p> :
                selectedAudit.isError ? <p className="text-sm text-destructive">No se pudo consultar la configuración histórica.</p> :
                <AuditEntries rows={filteredRows} />}
              <Link href="/configuracion?tab=commercial_rules">
                <Button variant="outline" size="sm" className="text-xs mt-3">
                  Abrir Reglas Comerciales <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </TabsContent>
            <TabsContent value="requests" className="mt-4 space-y-3">
              {requests.isLoading ? <p className="text-sm">Cargando solicitudes...</p> :
                requests.isError ? <p className="text-sm text-destructive">No se pudieron consultar las solicitudes.</p> :
                !filteredRequests.length ? <p className="text-sm text-muted-foreground py-4">Sin solicitudes para estos filtros.</p> :
                <div className="space-y-2">
                  {filteredRequests.map(request => (
                    <Card key={request.id}>
                      <CardContent className="p-3 sm:p-4 text-xs space-y-1.5">
                        <div className="flex justify-between gap-3 flex-wrap items-center">
                          <span className="font-semibold">{requestAction(request)} de cuenta Broker</span>
                          <Badge variant="outline">{statusName(request.status)}</Badge>
                        </div>
                        <p><span className="text-muted-foreground">Solicitante:</span> {displayName(request.requester)}
                          {request.requester?.role && " · " + roleName(request.requester.role)}</p>
                        <p><span className="text-muted-foreground">Broker afectado:</span> {displayName(request.targetUser)}</p>
                        <p><span className="text-muted-foreground">Fecha:</span> {formatDate(request.createdAt)}</p>
                        {request.reason && <p><span className="text-muted-foreground">Motivo:</span> {request.reason}</p>}
                        {request.reviewedAt && <p><span className="text-muted-foreground">Resolución:</span> {formatDate(request.reviewedAt)}
                          {request.reviewer && " · " + displayName(request.reviewer)}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>}
              <Link href="/admin/usuarios?tab=status-requests">
                <Button variant="outline" size="sm" className="text-xs">
                  Abrir gestión de solicitudes <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </MainLayout>
  );
}

function AuditEntries({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-4">Sin registros para estos filtros.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{rows.length} eventos en la selección actual</p>
      {rows.map(({entry, actionLabel: title, actorLabel, actorRole, targetLabel, description, request}) => (
        <Card key={entry.id}>
          <CardContent className="p-3 sm:p-4 text-xs space-y-1.5">
            <div className="flex justify-between gap-3 flex-wrap">
              <span className="font-semibold">{title}</span>
              <span className="text-muted-foreground">{formatDate(entry.createdAt)}</span>
            </div>
            <p><span className="text-muted-foreground">Responsable:</span> {actorLabel}
              {actorRole && actorRole !== "system" && " · " + roleName(actorRole)}</p>
            {targetLabel && <p><span className="text-muted-foreground">Persona afectada:</span> {targetLabel}</p>}
            {request && <p><span className="text-muted-foreground">Estado de la solicitud:</span> {statusName(request.status)}</p>}
            {(entry.previousState || entry.newState) &&
              <p><span className="text-muted-foreground">Cambio:</span> {statusName(entry.previousState)} → {statusName(entry.newState)}</p>}
            {description && <p><span className="text-muted-foreground">Motivo:</span> {description}</p>}
            {request && <Link href="/admin/usuarios?tab=status-requests" className="text-primary hover:underline">
              Consultar solicitud de estado
            </Link>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
