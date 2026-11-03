import type { ReactNode } from "react";
import { Link } from "wouter";
import { ShieldCheck } from "lucide-react";

export function ProspectTrustNotice({ advisorName, personalLink = false }: { advisorName: string; personalLink?: boolean }) {
  return <aside className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50/70 p-4 text-sm text-slate-700" data-testid="prospect-trust-notice">
    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden="true" />
    <div className="space-y-1.5">
      <p className="font-semibold text-slate-900">Un formulario de Crédito Negocios para tu asesor</p>
      <p>Este formulario de Crédito Negocios está dirigido a <strong>{advisorName}</strong>. Tu información será recibida para dar seguimiento a tu solicitud; no se envía automáticamente a financieras.</p>
      {personalLink && <p>Tu enlace es individual, vence y se utiliza una sola vez. Los datos que ya estén en tu expediente no se muestran aquí.</p>}
      <p>No solicitamos contraseñas ni depósitos mediante este formulario. Consulta el Aviso de Privacidad antes de enviarlo.</p>
    </div>
  </aside>;
}

export default function ProspectPageLayout({ advisorName, wide = false, testId, children }: {
  advisorName?: string;
  wide?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const width = wide ? "max-w-5xl" : "max-w-2xl";
  return <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900" data-testid={testId}>
    <header className="border-b border-slate-200 bg-white px-4 py-5">
      <div className={`mx-auto ${width}`}>
        <p className="text-lg font-semibold break-words" data-testid="prospect-advisor-name">{advisorName?.trim() || "Atención personalizada"}</p>
        <p className="text-sm text-slate-600 mt-1">Asesoría en financiamiento</p>
      </div>
    </header>
    <main className={`w-full mx-auto px-4 py-8 flex-1 ${width}`}>{children}</main>
    <footer className="border-t border-slate-200 bg-white px-4 py-6">
      <div className={`mx-auto flex flex-col sm:flex-row items-center justify-between gap-5 ${width}`}>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Powered by</span>
          <img src="/credito-negocios-07.jpg" alt="Crédito Negocios" width={176} height={45} className="w-44 h-auto rounded object-contain" />
        </div>
        <nav aria-label="Documentos legales" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-600">
          <Link href="/legal/aviso" className="underline underline-offset-4">Aviso de Privacidad</Link>
          <Link href="/legal/terminos" className="underline underline-offset-4">Términos y Condiciones</Link>
        </nav>
      </div>
    </footer>
  </div>;
}
