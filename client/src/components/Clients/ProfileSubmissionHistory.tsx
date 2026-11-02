import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ProfileSubmissionSummary from "./ProfileSubmissionSummary";

export default function ProfileSubmissionHistory({ leadId }: { leadId: string }) {
  const history = useQuery<{ id: string; profile_data: Record<string, unknown>; submitted_at: string }[]>({
    queryKey: ["/api/commercial-resources/received",leadId,"profiles"],
    queryFn: async () => (await apiRequest("GET",`/api/commercial-resources/received/${encodeURIComponent(leadId)}/profiles`)).json(),
  });
  return <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Historial de información enviada</h3>
    {history.isLoading ? <p>Cargando envíos…</p> : history.isError ? <p role="alert">No se pudo consultar el historial.</p> : history.data?.map((submission,index) => <details key={submission.id} className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Envío {history.data!.length-index} · {new Date(submission.submitted_at).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}</summary><div className="pt-3"><ProfileSubmissionSummary profile={submission.profile_data}/></div></details>)}
  </section>;
}
