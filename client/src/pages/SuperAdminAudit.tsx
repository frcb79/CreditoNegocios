import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { ClipboardList, ArrowRight } from "lucide-react";

type AuditEntry = {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  previousState?: string | null;
  newState?: string | null;
  performedBy?: string | null;
  createdAt?: string | Date | null;
  metadata?: { reason?: unknown } | null;
};

type StatusRequest = {
  id: string;
  requestedStatus: string;
  status: string;
  reason?: string | null;
  createdAt?: string | Date | null;
  reviewedAt?: string | Date | null;
  requester?: { firstName?: string; lastName?: string; email?: string } | null;
  targetUser?: { firstName?: string; lastName?: string; email?: string } | null;
};

type AuditSection = "commercial" | "configuration" | "requests";

function formatDate(dateValue?: string | Date | null) {
  if (!dateValue) return "Sin fecha";
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime())
    ? "Sin fecha"
    : date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

function displayName(person?: StatusRequest["requester"]) {
  if (!person) return "Cuenta no disponible";
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email || "Cuenta no disponible";
}

function getReason(metadata?: AuditEntry["metadata"]) {
  return typeof metadata?.reason === "string" ? metadata.reason : null;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  if (!response.ok) throw new Error("No fue posible consultar la bitácora.");
  return response.json();
}

export default function SuperAdminAudit() {
  const [section, setSection] = useState<AuditSection>("commercial");

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

  const requests = useQuery<StatusRequest[]>({
    queryKey: ["/api/admin/status-requests"],
    enabled: section === "requests",
    queryFn: () => getJson<StatusRequest[]>("/api/admin/status-requests"),
  });

  const selectedAudit = section === "commercial" ? commercial : configuration;
  const entries = section === "commercial"
    ? commercial.data || []
    : configuration.data?.logs || [];

  return (
    <MainLayout>
      <Header title="Auditoría Administrativa" subtitle="Consulta de registros existentes, exclusiva de Super Admin" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-4">
          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList className="w-4 h-4" /> Consulta administrativa de solo lectura
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Consolida tres consultas ya existentes. No representa una bitácora completa de
                clientes, créditos, comisiones, expedientes o cambios de estado ejecutados
                directamente. Ningún dato se edita desde esta pantalla.
              </CardDescription>
            </CardHeader>
          </Card>

          <Tabs value={section} onValueChange={(value) => setSection(value as AuditSection)}>
            <TabsList className="flex flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="commercial" data-testid="audit-tab-commercial" className="text-xs">
                Gobernanza comercial
              </TabsTrigger>
              <TabsTrigger value="configuration" data-testid="audit-tab-configuration" className="text-xs">
                Reglas comerciales
              </TabsTrigger>
              <TabsTrigger value="requests" data-testid="audit-tab-requests" className="text-xs">
                Solicitudes de estado
              </TabsTrigger>
            </TabsList>

            <TabsContent value="commercial" className="mt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Hasta 100 eventos recientes de gobernanza comercial, incluidos los movimientos de red que hayan sido registrados.
              </p>
              <div data-testid="audit-commercial-content">
                {selectedAudit.isLoading ? <p className="text-sm">Cargando bitácora...</p> :
                  selectedAudit.isError ? <p className="text-sm text-destructive">No se pudo consultar la bitácora. Comprueba la sesión y los permisos.</p> :
                  <AuditEntries entries={entries} />}
              </div>
            </TabsContent>

            <TabsContent value="configuration" className="mt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Hasta 100 modificaciones registradas a los parámetros de las reglas comerciales.
              </p>
              {selectedAudit.isLoading ? <p className="text-sm">Cargando cambios...</p> :
                selectedAudit.isError ? <p className="text-sm text-destructive">No se pudo consultar la configuración histórica.</p> :
                <AuditEntries entries={entries} />}
              <Link href="/configuracion?tab=commercial_rules">
                <Button variant="outline" size="sm" className="text-xs mt-3">
                  Abrir Reglas Comerciales <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            </TabsContent>

            <TabsContent value="requests" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Solicitudes de cambio de estado realizadas por la red; no incluye necesariamente todos los cambios directos.
              </p>
              {requests.isLoading ? <p className="text-sm">Cargando solicitudes...</p> :
                requests.isError ? <p className="text-sm text-destructive">No se pudieron consultar las solicitudes.</p> :
                !requests.data?.length ? <p className="text-sm text-muted-foreground py-4">Sin solicitudes registradas.</p> :
                <div className="space-y-2">
                  {requests.data.slice(0, 100).map((request) => (
                    <Card key={request.id}>
                      <CardContent className="p-3 sm:p-4 text-xs space-y-1.5">
                        <div className="flex justify-between gap-3 flex-wrap items-center">
                          <span className="font-semibold">
                            {displayName(request.targetUser)} · {request.requestedStatus === "active" ? "Reactivación" : "Cambio a inactivo"}
                          </span>
                          <Badge variant="outline">{request.status}</Badge>
                        </div>
                        <p className="text-muted-foreground">
                          Solicitante: {displayName(request.requester)} · {formatDate(request.createdAt)}
                        </p>
                        {request.reason && <p>Motivo: {request.reason}</p>}
                        {request.reviewedAt && <p className="text-muted-foreground">Revisión: {formatDate(request.reviewedAt)}</p>}
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

function AuditEntries({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return (
    <p className="text-sm text-muted-foreground py-4">No hay registros disponibles en esta fuente.</p>
  );

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardContent className="p-3 sm:p-4 text-xs space-y-1.5">
            <div className="flex justify-between gap-3 flex-wrap">
              <span className="font-semibold break-words">{entry.action}</span>
              <span className="text-muted-foreground">{formatDate(entry.createdAt)}</span>
            </div>
            <p className="text-muted-foreground break-all">
              {entry.entityType || "Configuración"}{entry.entityId ? ` · ${entry.entityId}` : ""}
            </p>
            {(entry.previousState || entry.newState) && (
              <p>{entry.previousState || "—"} → {entry.newState || "—"}</p>
            )}
            {getReason(entry.metadata) && <p>Motivo: {getReason(entry.metadata)}</p>}
            <p className="text-muted-foreground">
              Responsable: {entry.performedBy || "No disponible en el registro"}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
