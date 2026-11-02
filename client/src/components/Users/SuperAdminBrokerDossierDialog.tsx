import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { buildApiUrl } from "@/lib/runtimeConfig";
import SuperAdminLegalEvidenceDialog from "./SuperAdminLegalEvidenceDialog";
import SuperAdminBrokerOverview from "./SuperAdminBrokerOverview";
import { getDocumentTitle } from "@shared/legalDocuments";
import { type User } from "@shared/schema";

const date = (v?: string | null) => v ? new Date(v).toLocaleString("es-MX", { timeZone: "America/Mexico_City" }) : "Sin fecha registrada";
const docLabels: Record<string, string> = { ine: "INE / Pasaporte", csf: "Constancia de Situación Fiscal", bank_statement: "Estado de cuenta" };
const labels: Record<string, string> = { phone: "Teléfono", rfc: "RFC", curp: "CURP", address: "Dirección", street: "Calle", number: "Número", interior: "Interior", postalCode: "Código postal", state: "Estado", city: "Ciudad", businessName: "Razón social", fullName: "Nombre", email: "Correo", name: "Nombre", firstName: "Nombre", lastName: "Apellidos", industry: "Giro", legalRepresentative: "Representante legal" };
function Details({ value }: { value: unknown }) {
  if (value == null || value === "") return <span className="text-muted-foreground">Pendiente</span>;
  if (Array.isArray(value)) return value.length ? <div className="space-y-2">{value.map((v, i) => <div key={i} className="border rounded p-2"><Details value={v} /></div>)}</div> : <span>Sin registros</span>;
  if (typeof value === "object") return <dl className="grid sm:grid-cols-2 gap-3">{Object.entries(value).map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-muted-foreground">{labels[k] || k.replace(/([A-Z])/g, " $1")}</dt><dd className="break-words"><Details value={v} /></dd></div>)}</dl>;
  return <span>{typeof value === "boolean" ? value ? "Sí" : "No" : String(value)}</span>;
}
type Dossier = {
  user: { id: string; firstName: string; lastName: string; email: string; role: string; status: string; registrationStatus: string; hasAccessed: boolean; firstAccessAt: string | null; lastAccessAt: string | null; createdAt: string; profileType: string; brandName: string | null; accessStatusExpiresAt: string | null; profileData: unknown; commercialReferences: unknown; bankName: string; clabe: string; accountHolder: string; accessStatus: string; master: { name: string; email: string } | null };
  memberships: {name:string;role:string;isActive:boolean;joinedAt:string}[];
  documents: { id: string; type: string; fileName: string; uploadedAt: string; expiresAt: string | null; isValid: boolean }[];
  acceptances: { id: string; document: string; version: string; acceptedAt: string }[];
  activity: { id: string; action: string; newState: string; createdAt: string; route: string; method: string }[];
};
const actions: Record<string, string> = { account_registered: "Registro completado", invitation_registered: "Registro por invitación", login_success: "Ingreso exitoso", session_access: "Acceso a la plataforma", logout_success: "Cierre de sesión", operation_created: "Registro creado", operation_updated: "Registro actualizado", operation_deleted: "Registro eliminado", operation_failed: "Operación no completada" };

export default function SuperAdminBrokerDossierDialog({ user, allUsers, onClose }: { user: User | null; allUsers: User[]; onClose: () => void }) {
  const [tab, setTab] = useState("resumen");
  const dossier = useQuery<Dossier>({
    queryKey: ["/api/admin/brokers", user?.id, "dossier"], enabled: Boolean(user?.id),
    queryFn: async () => (await apiRequest("GET", `/api/admin/brokers/${encodeURIComponent(user!.id)}/dossier`)).json(),
  });
  const data = dossier.data;
  return <Dialog open={Boolean(user)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-y-auto" data-testid="broker-dossier">
      <DialogHeader><DialogTitle>Expediente · {[user?.firstName, user?.lastName].filter(Boolean).join(" ")}</DialogTitle><DialogDescription>Datos, accesos, documentos personales y convenios del asesor. Consulta exclusiva de Super Admin.</DialogDescription></DialogHeader>
      {dossier.isLoading ? <p role="status">Consultando expediente…</p> : dossier.isError ? <div role="alert">No se pudo consultar el expediente. <Button onClick={() => dossier.refetch()}>Reintentar</Button></div> : data && <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 mb-4">{[["resumen", "Resumen"], ["perfil", "Datos y cuenta"], ["documentos", "Documentos"], ["convenios", "Convenios y firmas"], ["actividad", "Actividad"]].map(([id, title]) => <TabsTrigger key={id} value={id}>{title}</TabsTrigger>)}</TabsList>
        <TabsContent value="resumen" className="space-y-4 text-sm">
          <Details value={{ nombre: `${data.user.firstName || ""} ${data.user.lastName || ""}`, email: data.user.email, rol: data.user.role === "master_broker" ? "Master Broker" : "Broker", estado: data.user.registrationStatus === "pending" ? "Pendiente de registro" : data.user.registrationStatus === "awaiting_first_access" ? "Registro completo · pendiente de primer acceso" : data.user.status === "active" ? "Activo · acceso confirmado" : data.user.status, cuentaCreada: date(data.user.createdAt), primerAccesoRegistrado: data.user.hasAccessed ? data.user.firstAccessAt ? date(data.user.firstAccessAt) : "Acceso histórico confirmado; fecha original no disponible" : "Pendiente", ultimoAccesoRegistrado: date(data.user.lastAccessAt), master: data.user.master ? `${data.user.master.name} · ${data.user.master.email}` : "Cuenta directa", aceptaciones: data.acceptances.length, documentosCargados: data.documents.length }} />
          <div className="rounded border p-3"><h3 className="font-semibold mb-2">Aceptaciones registradas</h3>{data.acceptances.length ? data.acceptances.map(a => <p key={a.id}>{getDocumentTitle(a.document)} · v{a.version} · {date(a.acceptedAt)}</p>) : <p>Sin aceptaciones registradas.</p>}<Button variant="outline" className="mt-3" onClick={() => setTab("convenios")}>Ver convenios y evidencia de firma</Button></div>
          {data.memberships?.length > 0 && <section className="border rounded p-3"><h3 className="font-semibold mb-2">Organizaciones</h3>{data.memberships.map((m,index) => <p key={index}>{m.name} · {m.role === "owner" ? "Titular" : m.role === "admin" ? "Administrador" : "Colaborador"} · {m.isActive ? "Membresía habilitada" : "Membresía inhabilitada"}</p>)}</section>}
          {user && <SuperAdminBrokerOverview user={user} allUsers={allUsers} />}
        </TabsContent>
        <TabsContent value="perfil" className="space-y-5 text-sm"><h3 className="font-semibold">Información personal y comercial</h3><Details value={{tipoDePersona:({persona_moral:"Persona Moral",fisica_empresarial:"Persona Física con Actividad Empresarial",fisica:"Persona Física",sin_sat:"Sin SAT"} as Record<string,string>)[data.user.profileType],marcaComercial:data.user.brandName}}/><Details value={data.user.profileData} /><h3 className="font-semibold">Referencias comerciales</h3><Details value={data.user.commercialReferences} /><h3 className="font-semibold">Cuenta para comisiones</h3><Details value={{ banco: data.user.bankName, titular: data.user.accountHolder, CLABE: data.user.clabe, beneficioDeAcceso: ({free:"Gratuito",promotional:"Promocional",trial:"Prueba",active:"Activo",complimentary:"Cortesía",expired:"Vencido",suspended:"Suspendido"} as Record<string,string>)[data.user.accessStatus],vencimientoDelBeneficio:data.user.accessStatusExpiresAt ? date(data.user.accessStatusExpiresAt) : "Sin vencimiento registrado" }} /></TabsContent>
        <TabsContent value="documentos" className="space-y-3 text-sm">{[...Object.entries(docLabels),...Array.from(new Set(data.documents.map(d => d.type))).filter(type => !docLabels[type]).map(type => [type,"Documento adicional"])].map(([type, title]) => {
          const docs = data.documents.filter(d => d.type === type);
          return <section key={type} className="rounded border p-4 space-y-2"><h3 className="font-semibold">{title}</h3>{docs.length ? docs.map(d => <div key={d.id}><p>{d.fileName} · {date(d.uploadedAt)}</p><p className="text-muted-foreground">{d.isValid ? "Validación registrada: válida" : "Requiere revisión"}{d.expiresAt ? ` · Vencimiento: ${d.expiresAt}` : ""}</p><Button asChild variant="outline" size="sm" className="mt-2"><a href={buildApiUrl(`/api/admin/brokers/${encodeURIComponent(user!.id)}/documents/${encodeURIComponent(d.id)}/download`)} target="_blank" rel="noopener noreferrer">Abrir / descargar</a></Button></div>) : <p className="text-muted-foreground">Pendiente de carga</p>}</section>;
        })}</TabsContent>
        <TabsContent value="convenios">{tab === "convenios" && <SuperAdminLegalEvidenceDialog key={user?.id} user={user} onClose={() => {}} embedded />}</TabsContent>
        <TabsContent value="actividad" className="space-y-2 text-sm"><p className="text-muted-foreground">Últimos 100 eventos registrados. Las fechas originales anteriores a la bitácora pueden no estar disponibles.</p>{data.activity.length ? data.activity.map(a => <article key={a.id} className="border rounded p-3"><p className="font-medium">{actions[a.action] || "Movimiento de plataforma"}</p><p>{date(a.createdAt)} · {a.newState === "success" ? "Completado" : "No completado"}</p><p className="text-xs text-muted-foreground">{a.method} {a.route}</p></article>) : <p>Sin eventos en la bitácora actual.</p>}</TabsContent>
      </Tabs>}
    </DialogContent>
  </Dialog>;
}
