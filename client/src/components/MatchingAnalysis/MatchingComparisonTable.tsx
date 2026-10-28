import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

export default function MatchingComparisonTable({client,institution,productTemplate,requestedAmount,requestId}: {
  client:any;institution:{id:string;name:string;[key:string]:any};productTemplate?:{id:string;name:string};requestedAmount?:number|string;requestId?:string;
}) {
  const endpoint=requestId ? `/api/credit-submissions/${encodeURIComponent(requestId)}/matching` :
    `/api/matching/preview?${new URLSearchParams({clientId:client.id||"",productTemplateId:productTemplate?.id||"",amount:String(requestedAmount||"")})}`;
  const query=useQuery<any>({queryKey:["published-offer-comparison",endpoint],enabled:!!requestId || !!(client.id&&productTemplate?.id&&Number(requestedAmount)>0),
    queryFn:async()=>(await apiRequest("GET",endpoint)).json()});
  if(query.isLoading)return <p role="status">Evaluando ofertas publicadas…</p>;
  if(query.isError)return <p role="alert">No se pudo consultar el matching. <Button variant="outline" onClick={()=>query.refetch()}>Reintentar</Button></p>;
  const rows=[...(query.data?.compatible||[]),...(query.data?.insufficientData||[]),...(query.data?.notCompatible||[])].filter((r:any)=>r.institutionId===institution.id);
  if(!rows.length)return <p className="text-sm text-muted-foreground">No hay ofertas publicadas y vigentes de este producto para esta financiera.</p>;
  return <div className="space-y-4" data-testid="published-offer-comparison">{rows.map((offer:any)=><article key={offer.offerId} className="rounded-lg border p-3 space-y-2 text-xs">
    <p className="font-semibold">{offer.offerName} · v{offer.versionNumber}</p>
    <p>{offer.summary}</p>
    {[...offer.criteria.failed,...offer.criteria.missing,...offer.criteria.matched].map((criterion:any)=><div key={criterion.code} className="border-t pt-2">
      <p className="font-medium">{criterion.name} · {criterion.status==='PASSED'?'Cumple':criterion.status==='FAILED'?'No cumple':'Pendiente'}</p>
      <p>{criterion.reason}</p>
    </div>)}
  </article>)}</div>;
}
