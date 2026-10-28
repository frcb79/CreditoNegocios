import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const actionLabels: Record<string,string> = {
  session_access: "Acceso a la plataforma con sesión vigente",
  login_success: "Inicio de sesión", logout_success: "Cierre de sesión",
  account_registered: "Registro de cuenta", invitation_registered: "Registro por invitación",
  password_recovered: "Recuperación de contraseña", operation_created: "Solicitud de operación",
  operation_updated: "Actualización", operation_deleted: "Eliminación", operation_failed: "Operación no completada",
};
const roles: Record<string,string> = {super_admin:"Super Admin", admin:"Admin", master_broker:"Master Broker", broker:"Broker"};
const moduleLabel = (route:string) => {
  const key = route.split("/")[2] || "";
  return ({auth:"Acceso y registro", users:"Usuarios", clients:"Clientes", credits:"Créditos", commissions:"Comisiones", "credit-requests":"Solicitudes de crédito", "institution-products":"Ofertas financieras", "financial-institutions":"Financieras", "broker-invitations":"Invitaciones", documents:"Documentos", commercial:"Operación comercial", admin:"Administración"} as Record<string,string>)[key] || "Operación en plataforma";
};
export default function AdministrativeActivity() {
  const [search,setSearch] = useState("");
  const [role,setRole] = useState("all");
  const [result,setResult] = useState("all");
  const [from,setFrom] = useState(""); const [to,setTo] = useState("");
  const activity = useInfiniteQuery<{logs:any[];hasMore:boolean;nextOffset:number}>({
    queryKey:["/api/admin/activity-audit"], initialPageParam:0,
    queryFn:async ({pageParam}) => (await apiRequest("GET", `/api/admin/activity-audit?limit=100&offset=${pageParam}`)).json(),
    getNextPageParam:last => last.hasMore ? last.nextOffset : undefined,
    refetchInterval:60000,
  });
  const unique = new Map((activity.data?.pages.flatMap(p=>p.logs) || []).map(e=>[e.id,e]));
  const rows = Array.from(unique.values()).filter(entry=>{
    const m=entry.metadata || {};
    const text=[m.actorName,m.actorEmail,actionLabels[entry.action],moduleLabel(m.route || ""),m.route].join(" ").toLowerCase();
    const day=entry.createdAt ? new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(entry.createdAt)) : "";
    return (!search || text.includes(search.toLowerCase())) && (role==="all" || role===m.actorRole) && (result==="all" || result===entry.newState) && (!from || day>=from) && (!to || day<=to);
  });
  return <section className="space-y-4" data-testid="audit-activity-content">
    <p className="text-sm text-muted-foreground">Accesos, registros por invitación y operaciones realizadas desde la activación de esta bitácora. Cada evento identifica al responsable y el resultado de su solicitud; los movimientos contables conservan su auditoría específica.</p>
    <div className="grid sm:grid-cols-3 gap-3 rounded-xl border p-3">
      <label className="text-xs">Buscar persona, correo o acción<Input value={search} onChange={e=>setSearch(e.target.value)} data-testid="activity-search" /></label>
      <label className="text-xs">Responsable<select className="block border rounded p-2 w-full" value={role} onChange={e=>setRole(e.target.value)}><option value="all">Todos</option>{Object.entries(roles).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <label className="text-xs">Resultado<select className="block border rounded p-2 w-full" value={result} onChange={e=>setResult(e.target.value)}><option value="all">Todos</option><option value="success">Completada</option><option value="failed">No completada</option></select></label>
      <label className="text-xs">Desde<Input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label>
      <label className="text-xs">Hasta<Input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
      <Button variant="outline" onClick={()=>activity.refetch()} disabled={activity.isFetching} data-testid="activity-refresh">{activity.isFetching ? "Actualizando…" : "Actualizar"}</Button>
    </div>
    {activity.isError && <p role="alert" className="text-red-700">No se pudo actualizar la bitácora. Intenta nuevamente.</p>}
    {activity.isLoading ? <p role="status">Cargando actividad…</p> : <>
      <p className="text-xs text-muted-foreground">{rows.length} eventos para los filtros actuales · {unique.size} cargados. Fechas de Ciudad de México. Los filtros se aplican a los eventos cargados.</p>
      {!rows.length && <p>Sin actividad registrada para estos filtros.</p>}
      {rows.map(entry=>{const m=entry.metadata || {};return <article key={entry.id} className="rounded-xl border p-4 space-y-1 text-xs">
        <div className="flex justify-between gap-3"><strong>{actionLabels[entry.action] || "Actividad"} · {moduleLabel(m.route || "")}</strong><time>{new Date(entry.createdAt).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}</time></div>
        <p>Responsable: {m.actorName || m.actorEmail || "Usuario"} · {roles[m.actorRole] || "Usuario"}</p>
        {m.actorEmail && <p>{m.actorEmail}</p>}
        <p>Resultado: {entry.newState==="success" ? "Completada" : "No completada"} · HTTP {m.statusCode}</p>
        <details><summary className="cursor-pointer">Detalle de la acción</summary><p>{m.method} {m.route}</p>{m.resourceId && <p>Registro: {m.resourceId}</p>}</details>
      </article>;})}
      {activity.hasNextPage && <Button variant="outline" disabled={activity.isFetching} onClick={()=>activity.fetchNextPage()}>Cargar eventos anteriores</Button>}
    </>}
  </section>;
}
