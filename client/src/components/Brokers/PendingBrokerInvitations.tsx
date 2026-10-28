import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone, RefreshCw, Search, UserRoundX } from "lucide-react";

type InviteContact = {
  id: string; firstName: string | null; lastName: string | null;
  email: string; phone: string; role: string;
  masterEmail: string | null; invitedAt: string;
  sentDays: number[]; lastReminderAt: string | null;
  failedReminders: number; paused: boolean;
};

function ageDays(value: string): number {
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.floor((Date.now() - date) / 86400000)) : 0;
}

export default function PendingBrokerInvitations() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "manual" | "paused">("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const client = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<{ total: number; contacts: InviteContact[] }>({
    queryKey: ["/api/broker-invitations/pending"],
    queryFn: async () => {
      const response = await fetch("/api/broker-invitations/pending", { credentials: "include" });
      if (!response.ok) throw new Error("No fue posible consultar las invitaciones");
      return response.json();
    },
    refetchInterval: 60000,
  });
  const filtered = useMemo(() => (data?.contacts || []).filter(c => {
    const q = search.toLocaleLowerCase("es-MX").trim();
    const match = !q || [c.firstName,c.lastName,c.email,c.phone,c.masterEmail]
      .some(v => (v || "").toLocaleLowerCase("es-MX").includes(q));
    return match && (filter === "all" ||
      (filter === "manual" && ageDays(c.invitedAt) >= 12 && !c.paused) ||
      (filter === "paused" && c.paused));
  }), [data, search, filter]);

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
      window.alert(error?.message || "No se pudo actualizar el seguimiento.");
    } finally { setSavingId(null); }
  };

  const manualCount = (data?.contacts || []).filter(c=>ageDays(c.invitedAt)>=12&&!c.paused).length;

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base">Invitados pendientes de activación</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Contactos invitados por correo que aún no han creado su contraseña.
              Recordatorios únicos a los 3, 7 y 12 días; después, seguimiento personal.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={()=>void refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap pt-3">
          <Badge variant="secondary">{data?.total || 0} sin activar</Badge>
          <Badge variant="outline">{manualCount} seguimiento personal</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap pt-2">
          <div className="relative flex-1 min-w-[230px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={event=>setSearch(event.target.value)}
              className="pl-9 h-9" placeholder="Buscar persona, correo, teléfono o Master" />
          </div>
          <Button variant={filter==="all"?"default":"outline"} size="sm" onClick={()=>setFilter("all")}>Todos</Button>
          <Button variant={filter==="manual"?"default":"outline"} size="sm" onClick={()=>setFilter("manual")}>Seguimiento manual</Button>
          <Button variant={filter==="paused"?"default":"outline"} size="sm" onClick={()=>setFilter("paused")}>No contactar</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-slate-500">Consultando invitados...</p>}
        {isError && <p className="text-sm text-red-700">No se pudo consultar el seguimiento. Revisa tu sesión de Super Admin.</p>}
        {!isLoading && !isError && filtered.length === 0 && (
          <p className="text-sm text-slate-500 border rounded-lg p-6 text-center">
            No hay personas pendientes para este filtro.
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
                  const days = ageDays(c.invitedAt);
                  const manual = days >= 12 && !c.paused;
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
                        {c.phone && <a className="flex items-center gap-1 text-slate-700 mt-2"
                          href={"tel:"+c.phone.replace(/[^0-9+]/g,"")}>
                          <Phone className="w-3 h-3" />{c.phone}
                        </a>}
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
                          {c.paused?"Sin más correos":manual?"Seguimiento manual":"Pendiente de activación"}
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
          que todavía no han completado su activación. No se envían correos desde esta vista.
        </p>
      </CardContent>
    </Card>
  );
}
