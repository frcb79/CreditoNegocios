import type { ReactNode } from "react";
import { Link } from "wouter";

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
