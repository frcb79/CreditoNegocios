import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { User } from '@shared/schema';

type Action = 'assign' | 'replace' | 'extend' | 'revoke';
type Promo = { id:string; code:string; name:string; benefitType:string; durationMonths:number|null; benefitValue:string; isActive:boolean };
type Redemption = {
  id:string; code:string; name:string; benefit_type:string; benefit_value:string; starts_at:string;
  expires_at:string|null; effectiveStatus:string; metadata?:any;
};
type Change = { id:string; action:string; created_at:string; metadata:any; actor_name:string };
type History = { redemptions:Redemption[]; changes:Change[] };
function when(value:string|null|undefined) {
  return value ? new Date(value).toLocaleDateString('es-MX', {year:'numeric',month:'short',day:'numeric'}) : 'Sin vencimiento';
}
function description(p:Redemption) {
  return p.benefit_type === 'free_months' ? 'Cortesía sin costo'
    : p.benefit_type === 'percentage_discount' ? p.benefit_value + '% de descuento (sin cobro configurado)'
    : p.benefit_type === 'fixed_discount' ? '$' + p.benefit_value + ' de descuento (sin cobro configurado)'
    : 'Beneficio comercial';
}
export default function ManualBenefitsManager({
  users, promos, initialUserId = '',
}: { users:User[]; promos:Promo[]; initialUserId?:string }) {
  const { toast } = useToast();
  const [selectedId,setSelectedId] = useState(initialUserId);
  const [action,setAction] = useState<Action>('assign');
  const [code,setCode] = useState('');
  const [months,setMonths] = useState('');
  const [reason,setReason] = useState('');
  const [busy,setBusy] = useState(false);
  const eligible = users.filter(u => ['broker','master_broker'].includes(u.role) && u.isActive !== false && u.status === 'active');
  const historyKey = '/api/admin/users/' + selectedId + '/benefits';
  const {data:history,isLoading,refetch} = useQuery<History>({
    queryKey:[historyKey], enabled:!!selectedId,
    queryFn:async()=> (await apiRequest('GET',historyKey)).json(),
  });
  const active = history?.redemptions.find(r=>r.effectiveStatus === 'active');
  const effectiveAction = action;
  const requiresCode = effectiveAction === 'assign' || effectiveAction === 'replace';
  const canSend = !!selectedId && reason.trim().length >= 5 && (!requiresCode || !!code)
    && (effectiveAction !== 'extend' || Number(months) >= 1) && !busy;
  async function submit() {
    if (!canSend) return;
    if ((effectiveAction === 'revoke' || effectiveAction === 'replace') &&
        !window.confirm('¿Confirmas la ' + (effectiveAction === 'revoke' ? 'revocación' : 'sustitución') + ' del beneficio vigente?')) return;
    setBusy(true);
    try {
      const body:any = { action:effectiveAction, reason:reason.trim() };
      if (requiresCode) body.code=code;
      if (months.trim() && effectiveAction !== 'revoke') body.months=Number(months);
      const response = await apiRequest('POST',historyKey,body);
      if (!response.ok) throw new Error((await response.json()).message || 'Error al guardar');
      toast({title:'Beneficio actualizado',description:'El cambio y su auditoría quedaron registrados.'});
      setReason('');setMonths('');setCode('');
      await refetch();
      queryClient.invalidateQueries({queryKey:['/api/users']});
      queryClient.invalidateQueries({queryKey:['/api/admin/promos']});
    } catch (e:any) {
      toast({title:'No se pudo modificar',description:e.message || 'Revisa el beneficio',variant:'destructive'});
    } finally {setBusy(false);}
  }
  return <Card className="border border-border/60 shadow-sm">
    <CardHeader><CardTitle className="text-base">Beneficios individuales de Brokers y Masters</CardTitle>
      <p className="text-xs text-muted-foreground">Asigna, amplía, sustituye o revoca beneficios de cuentas activas. No genera cargos ni suspende operaciones.</p>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1"><label className="text-xs font-medium">Beneficiario</label>
          <Select value={selectedId} onValueChange={v=>{setSelectedId(v);setAction('assign');setCode('');}}>
            <SelectTrigger data-testid="manual-beneficiary"><SelectValue placeholder="Selecciona Broker o Master" /></SelectTrigger>
            <SelectContent>{eligible.map(u=><SelectItem key={u.id} value={u.id}>
              {[u.firstName,u.lastName].filter(Boolean).join(' ') || u.email} — {u.role === 'broker' ? 'Broker' : 'Master'} ({u.email})
            </SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><label className="text-xs font-medium">Operación</label>
          <Select value={action} onValueChange={v=>setAction(v as Action)}>
            <SelectTrigger data-testid="manual-benefit-action"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="assign">Asignar nueva cortesía/descuento</SelectItem>
              <SelectItem value="extend">Extender cortesía vigente</SelectItem>
              <SelectItem value="replace">Sustituir beneficio vigente</SelectItem>
              <SelectItem value="revoke">Revocar beneficio vigente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {selectedId && <div className="text-sm rounded border p-3" data-testid="benefit-current">
        {isLoading ? 'Consultando historial…' : active ?
          <><strong>Vigente: {active.name} ({active.code})</strong>
            <p>{description(active)} · Inicio: {when(active.starts_at)} · Fin: {when(active.expires_at)}</p></>
          : <span>Este usuario no tiene beneficio vigente.</span>}
      </div>}
      {requiresCode && <div className="space-y-1">
        <label className="text-xs font-medium">Código promocional del catálogo</label>
        <Select value={code} onValueChange={setCode}>
          <SelectTrigger data-testid="manual-benefit-code"><SelectValue placeholder="Selecciona un código activo"/></SelectTrigger>
          <SelectContent>{promos.filter(p=>p.isActive).map(p=><SelectItem key={p.id} value={p.code}>
            {p.code} — {p.name} ({p.benefitType === 'percentage_discount' ? p.benefitValue+'%' : p.durationMonths ? p.durationMonths+' meses' : p.benefitType})
          </SelectItem>)}</SelectContent>
        </Select>
      </div>}
      {action !== 'revoke' && <div className="space-y-1">
        <label className="text-xs font-medium">{action === 'extend' ? 'Meses adicionales (obligatorio)' : 'Meses de duración (opcional, por defecto los del cupón)'}</label>
        <Input data-testid="manual-benefit-months" type="number" min="1" max="60" value={months} onChange={e=>setMonths(e.target.value)} placeholder="Ej. 3 o 6"/>
      </div>}
      <div className="space-y-1"><label className="text-xs font-medium">Motivo obligatorio (mínimo 5 caracteres)</label>
        <Input data-testid="manual-benefit-reason" value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}
          placeholder="Ej. Acuerdo comercial autorizado"/>
      </div>
      <Button data-testid="manual-benefit-submit" type="button" disabled={!canSend} onClick={submit}>
        {busy?'Guardando…':'Confirmar y registrar en bitácora'}
      </Button>
      {selectedId && history && <div className="space-y-2">
        <h3 className="text-sm font-semibold">Historial de beneficios</h3>
        {history.redemptions.length === 0 && <p className="text-xs text-muted-foreground">Sin beneficios anteriores.</p>}
        {history.redemptions.map(r=><div key={r.id} className="border-b pb-2 text-xs">
          <strong>{r.name} · {r.code}</strong> — {r.effectiveStatus === 'active' ? 'Vigente' : r.effectiveStatus === 'revoked' ? 'Revocado' : 'Finalizado'}
          <p>{description(r)} · {when(r.starts_at)} → {when(r.expires_at)}</p>
        </div>)}
        {history.changes.length > 0 && <><h4 className="text-sm font-semibold">Cambios administrativos</h4>
          {history.changes.map(c=><p key={c.id} className="text-xs border-b pb-1">
            {when(c.created_at)} · {c.action.replace('benefit_','')} · {c.actor_name || 'Responsable registrado'} · {c.metadata?.reason || 'Sin observaciones'}
          </p>)}</>}
      </div>}
    </CardContent>
  </Card>;
}
