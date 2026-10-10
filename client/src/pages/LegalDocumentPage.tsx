import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import LegalLinks from "@/components/LegalLinks";
import { buildApiUrl } from "@/lib/runtimeConfig";
import type { PublicLegalDocument, PublishedLegalDocument } from "@shared/legalDocuments";

export default function LegalDocumentPage({ document }: { document: PublicLegalDocument }) {
  const search = useSearch();
  const version = new URLSearchParams(search).get("version");
  const title = document === "terminos" ? "Términos y Condiciones" : "Aviso de Privacidad Integral";
  const { data, isLoading, error, refetch } = useQuery<PublishedLegalDocument>({
    queryKey: ["/api/legal", document, version],
    queryFn: async () => {
      const suffix = version === null ? "" : `?version=${encodeURIComponent(version)}`;
      const response = await fetch(buildApiUrl(`/api/legal/${document}${suffix}`));
      if (!response.ok) {
        throw new Error(response.status === 404 || response.status === 400
          ? "Esta versión no está disponible."
          : "No pudimos cargar el documento. Intenta nuevamente.");
      }
      return response.json();
    },
    retry: false,
  });

  useEffect(() => {
    const previousTitle = window.document.title;
    window.document.title = `${title} | Crédito Negocios`;
    return () => { window.document.title = previousTitle; };
  }, [title]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-5 py-4">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <Link href="/" className="font-semibold text-primary">Crédito Negocios</Link>
          <Link href="/" className="text-sm underline">Volver a la plataforma</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-8 sm:py-12">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {isLoading ? <p role="status" className="mt-6">Cargando documento…</p> : null}
        {error ? (
          <div role="alert" className="mt-6 space-y-3">
            <p>{error.message}</p>
            <Button variant="outline" onClick={() => refetch()}>Reintentar</Button>
            {version !== null ? <p><Link href={`/legal/${document}`} className="underline">Consultar versión vigente</Link></p> : null}
          </div>
        ) : null}
        {data ? (
          <>
            <p className="mt-3 text-sm text-slate-600">
              Versión {data.version} · Vigente a partir del {new Intl.DateTimeFormat("es-MX", {
                day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City",
              }).format(new Date(data.effectiveAt))}
            </p>
            <p className="mt-2 text-sm"><Link href={`/legal/${document}?version=${encodeURIComponent(data.version)}`} className="underline">Enlace a esta versión</Link></p>
            <article aria-label={title} className="mt-6 rounded-xl border bg-white p-5 sm:p-8">
              <div className="whitespace-pre-wrap break-words text-sm leading-7">{data.content}</div>
            </article>
          </>
        ) : null}
      </main>
      <footer className="border-t bg-white px-5 py-6"><LegalLinks /></footer>
    </div>
  );
}
