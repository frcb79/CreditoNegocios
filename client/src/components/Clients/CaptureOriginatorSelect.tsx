import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";

export function useCaptureOriginators(enabled:boolean) {
  return useQuery<Array<{id:string;firstName?:string;lastName?:string;brandName?:string;role:string;organization?:string}>>({queryKey:["/api/admin/capture-originators"],enabled});
}
export function CaptureOriginatorSelect({value,onChange,id,query}:{value:string;onChange:(v:string)=>void;id:string;query:ReturnType<typeof useCaptureOriginators>}) {
  return <section className="space-y-2">
    <Label htmlFor={id}>Asignar cliente a *</Label>
    <select id={id} data-testid={id} className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={value} onChange={e=>onChange(e.target.value)}>
      <option value="">Selecciona un asesor</option>
      <option value="__self__">Plataforma / registro directo</option>
      {query.data?.map(u=><option key={u.id} value={u.id}>{u.brandName || [u.firstName,u.lastName].filter(Boolean).join(" ") || u.id} · {u.role==="master_broker"?"Master Broker":"Broker"} · {u.organization}</option>)}
    </select>
    {query.isError && <p role="alert" className="text-sm text-destructive">No se pudo cargar la red.</p>}
    {query.isLoading && <p className="text-xs text-muted-foreground">Cargando asesores...</p>}
    <p className="text-xs text-muted-foreground">Se conserva tu usuario como capturista y el asesor como originador comercial.</p>
  </section>;
}
export function validCaptureOriginator(value:string,query:ReturnType<typeof useCaptureOriginators>) {
  return value==="__self__" || Boolean(value && query.data?.some(u=>u.id===value));
}
