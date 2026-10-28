import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { INVITATION_FOLLOWUP_DAYS, invitationAgeDays, matchesInvitationFollowup, type InvitationFollowupFilter } from "@shared/brokerInvitationFollowup";
import { Mail, Phone, RefreshCw, Search, UserRoundX } from "lucide-react";

type InviteContact = {
  id: string; firstName: string | null; lastName: string | null;
  email: string; phone: string; role: string;
  masterEmail: string | null; invitedAt: string;
  sentDays: number[]; lastReminderAt: string | null;
  failedReminders: number; paused: boolean;
};

export default function PendingBrokerInvitations() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InvitationFollowupFilter>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const client = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isFetching, isError, dataUpdatedAt, refetch } = useQuery<{ total: number; contacts: InviteContact[] }>({
    queryKey: ["/api/broker-invitations/pending"],
    queryFn: async () => {
      const response = await fetch("/api/broker-invitations/pending", { credentials: "include" });
      if (!response.ok) throw new Error("No fue posible consultar las invitaciones");
      return response.json();
    },
    refetchInterval: 60000,
  });
  const contacts = data?.contacts || [];
  const now = Date.now();
  const filtered = contacts.filter(contact => matchesInvitationFollowup(contact, filter, search, now));
  const overdueCount = contacts.filter(contact => matchesInvitationFollowup(contact, "overdue", "", now)).length;
  const pausedCount = contacts.filter(contact => contact.paused).length;

  const refresh = async () => {
    const result = await refetch();
    if (result.isError) {
      toast({ title: "No se pudo actualizar", description: "Revisa tu conexión y tu sesión de Super Admin.", variant: "destructive" });
      return;
    }
    void client.invalidateQueries({ queryKey: ["/api/broker-network"] });
    toast({ title: "Lista actualizada", description: `${result.data?.total || 0} invitaciones pendientes. Los registros activados ya no aparecen aquí.` });
  };

  const setPaused = async (c: InviteContact) => {
    setSavingId(c.id);
    try {
      const response = await fetch("/api/broker-invitations/pending/" +
        encodeURIComponent(c.id) + "/pause", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !c.paused }),
      });
      if (!response.ok) throw new Error("No se pudo guardar la preferencia.");
      await client.invalidateQueries({ queryKey: ["/api/broker-invitations/pending"] });
    } catch (error: any) {
      toast({ title: "No se pudo actualizar el seguimiento", description: error?.message, variant: "destructive" });
    } finally { setSavingId(null); }
  };


  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base">Invitaciones pendientes de registro</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Contactos invitados por correo que aún no han creado su contraseña.
              Recordatorios a los 3, 7 y 12 días. A partir de 15 días, puedes identificar a quién dar seguimiento para futuras campañas.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={()=>void refresh()} disabled={isFetching} data-testid="refresh-pending-invites">
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> {isFetching ? "Actualizando…" : "Actualizar"}
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap pt-3">
          {!isLoading && !isError && <>
            <Button type="button" size="sm" variant={filter === "all" ? "default" : "outline"}
              aria-pressed={filter === "all"} onClick={()=>setFilter("all")} data-testid="summary-invites-all">{data?.total || 0} sin registrar</Button>
            <Button type="button" size="sm" variant={filter === "overdue" ? "default" : "outline"}
              aria-pressed={filter === "overdue"} onClick={()=>setFilter("overdue")} data-testid="summary-invites-overdue">{overdueCount} con 15 días o más</Button>
          </>}
        </div>
        <div className="flex items-center gap-2 flex-wrap pt-2">
          <div className="relative flex-1 min-w-[230px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={event=>setSearch(event.target.value)}
              className="pl-9 h-9" placeholder="Buscar persona, correo, teléfono o Master" />
          </div>
          <div role="group" aria-label="Seguimiento de invitaciones" className="flex flex-wrap gap-1">
            {([ ["all", `Todos los pendientes (${contacts.length})`], ["overdue", `15 días o más (${overdueCount})`], ["paused", `No contactar (${pausedCount})`] ] as const).map(([value, label]) =>
              <Button key={value} type="button" size="sm" variant={filter === value ? "default" : "outline"}
                aria-pressed={filter === value} onClick={()=>setFilter(value)} data-testid={`filter-invites-${value}`}>{label}</Button>)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p role="status" aria-live="polite" className="text-xs text-slate-500 mb-3" data-testid="pending-invites-status">
          {filter === "overdue" ? "15 días o más sin registro" : filter === "paused" ? "No contactar" : "Todos los pendientes"}: {filtered.length} resultados.
          {dataUpdatedAt > 0 && <> Última consulta: {new Date(dataUpdatedAt).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City" })}.</>}
        </p>
        {isLoading && <p className="text-sm text-slate-500">Consultando invitados...</p>}
        {isError && <p className="text-sm text-red-700">No se pudo consultar el seguimiento. Revisa tu sesión de Super Admin.</p>}
        {!isLoading && !isError && filtered.length === 0 && (
          <p className="text-sm text-slate-500 border rounded-lg p-6 text-center">
            {filter === "overdue" ? "No hay invitaciones con 15 días o más sin registro." : filter === "paused" ? "No hay contactos marcados como No contactar." : "No hay personas pendientes para esta búsqueda."}
          </p>
        )}
        {!isError && filtered.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs text-left min-w-[900px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-3">Invitado y rol</th><th className="p-3">Contacto</th>
                  <th className="p-3">Master</th><th className="p-3">Invitación</th>
                  <th className="p-3">Recordatorios</th><th className="p-3">Situación</th>
                  <th className="p-3">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(c => {
                  const days = invitationAgeDays(c.invitedAt, now);
                  const manual = days >= INVITATION_FOLLOWUP_DAYS && !c.paused;
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="p-3 font-medium text-slate-800">
                        {[c.firstName,c.lastName].filter(Boolean).join(" ") || "Sin nombre"}
                        <div className="text-slate-500 mt-1 font-normal">{c.role==="master_broker"?"Master Broker":"Broker"}</div>
                      </td>
                      <td className="p-3">
                        <a className="flex items-center gap-1 text-blue-700 hover:underline" href={"mailto:"+c.email}>
                          <Mail className="w-3 h-3" />{c.email}
                        </a>
                        {c.phone ? <a className="flex items-center gap-1 text-slate-700 mt-2"
                          href={"tel:"+c.phone.replace(/[^0-9+]/g,"")}>
                          <Phone className="w-3 h-3" />{c.phone}
                        </a> : <span className="block mt-2 text-slate-400">Sin teléfono registrado</span>}
                      </td>
                      <td className="p-3 text-slate-600">{c.masterEmail || "Directo / sin Master"}</td>
                      <td className="p-3 text-slate-600">
                        {new Date(c.invitedAt).toLocaleDateString("es-MX")}<div>{days} días transcurridos</div>
                      </td>
                      <td className="p-3 text-slate-600">
                        {c.sentDays?.length ? c.sentDays.map(d=>"D"+d).join(" · ") : "Aún no corresponden"}
                        {Number(c.failedReminders)>0 && <div className="text-amber-700">Revisar error de correo</div>}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={c.paused?"text-slate-500":manual?
                          "text-amber-700 border-amber-300":"text-blue-700 border-blue-200"}>
                          {c.paused?"Sin más correos":manual?"15 días o más sin registro":"Pendiente de registro"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Button variant="outline" size="sm" disabled={savingId===c.id}
                          onClick={()=>void setPaused(c)}>
                          <UserRoundX className="w-3.5 h-3.5 mr-1"/>
                          {c.paused?"Reanudar":"No contactar"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-3">
          Esta tabla no representa correos pendientes de envío del Excel. Muestra cuentas ya invitadas
          que todavía no han creado su contraseña. El grupo de 15 días o más incluye los contactos
          marcados como «No contactar», que conservan esa restricción. Esta vista no inicia campañas ni envía correos.
        </p>
      </CardContent>
    </Card>
  );
}
