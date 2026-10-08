import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LegalLinks from "@/components/LegalLinks";
import { buildApiUrl } from "@/lib/runtimeConfig";
import { getDocumentTitle, formatAcceptedDate } from "@shared/legalDocuments";
import { ShieldCheck, Calendar, Lock, AlertCircle } from "lucide-react";

interface LegalDocumentApiResponse {
  id: string;
  document: string;
  title: string;
  version: string;
  content: string;
  contentSha256: string;
  effectiveAt?: string;
  isPrivate?: boolean;
  userAcceptance?: {
    id: string;
    acceptedAt: string;
    contentSha256: string;
    userEmail: string;
    acceptanceType: string;
    ipAddress?: string;
    userAgent?: string;
  } | null;
}

export default function LegalDocumentPage({ document }: { document: string }) {
  const search = useSearch();
  const version = new URLSearchParams(search).get("version");
  const title = getDocumentTitle(document);
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const isPrivateDoc = ["convenio", "reglas-red", "reglas-master"].includes(document);
  const queryUserKey = isPrivateDoc ? (user?.id ?? "unauthenticated") : "public";
  const isPrivateBlocked = isPrivateDoc && !isAuthLoading && !isAuthenticated;

  const { data, isLoading: isQueryLoading, error, refetch, isError: isQueryError } = useQuery<LegalDocumentApiResponse>({
    queryKey: ["/api/legal", document, version, queryUserKey],
    enabled: isPrivateDoc ? (Boolean(user?.id) && Boolean(isAuthenticated)) : true,
    queryFn: async () => {
      const suffix = version === null ? "" : `?version=${encodeURIComponent(version)}`;
      const response = await fetch(buildApiUrl(`/api/legal/${document}${suffix}`), {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("AUTH_REQUIRED:Se requiere iniciar sesión en la plataforma para consultar este documento contractual.");
        }
        if (response.status === 403) {
          throw new Error("FORBIDDEN:No cuentas con los permisos o el rol requerido para consultar este documento.");
        }
        if (response.status === 404 || response.status === 400) {
          throw new Error("Esta versión no está disponible.");
        }
        throw new Error("No pudimos cargar el documento. Intenta nuevamente.");
      }
      return response.json();
    },
    retry: false,
  });

  useEffect(() => {
    const previousTitle = window.document.title;
    window.document.title = `${title} | Crédito Negocios`;
    return () => {
      window.document.title = previousTitle;
    };
  }, [title]);

  const isLoading = isPrivateDoc && isAuthLoading ? true : isQueryLoading;
  const isError = isPrivateBlocked || isQueryError;
  const isAuthRequired = isPrivateBlocked || Boolean(error?.message?.startsWith("AUTH_REQUIRED:"));
  const isForbidden = Boolean(error?.message?.startsWith("FORBIDDEN:"));
  const errorMessage = isPrivateBlocked
    ? "Se requiere iniciar sesión en la plataforma para consultar este documento contractual."
    : error?.message
        ?.replace("AUTH_REQUIRED:", "")
        ?.replace("FORBIDDEN:", "");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white px-5 py-4">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <Link href="/" className="font-semibold text-primary">
            Crédito Negocios
          </Link>
          <Link href="/" className="text-sm underline">
            Volver a la plataforma
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {data?.isPrivate && (
            <Badge variant="outline" className="text-xs gap-1">
              <Lock className="h-3 w-3 text-muted-foreground" /> Documento Privado de Red
            </Badge>
          )}
        </div>

        {isLoading ? <p role="status" className="mt-6">Cargando documento…</p> : null}

        {isError && (
          <div role="alert" className="mt-6 rounded-xl border bg-white p-6 space-y-4">
            <div className="flex items-start gap-3">
              {isAuthRequired ? (
                <Lock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              )}
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">
                  {isAuthRequired
                    ? "Acceso Autenticado Requerido"
                    : isForbidden
                      ? "Acceso No Autorizado"
                      : "Documento No Disponible"}
                </h3>
                <p className="text-sm text-slate-600">{errorMessage}</p>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap gap-3">
              {isAuthRequired ? (
                <Link href="/">
                  <Button size="sm">Iniciar Sesión en la Plataforma</Button>
                </Link>
              ) : (
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Reintentar
                </Button>
              )}
              {version !== null && (
                <Link href={`/legal/${document}`} className="text-sm text-primary underline self-center">
                  Consultar versión vigente
                </Link>
              )}
            </div>
          </div>
        )}

        {data ? (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <p>
                Versión {data.version}
                {data.effectiveAt && (
                  <>
                    {" "}· Vigente a partir del{" "}
                    {new Intl.DateTimeFormat("es-MX", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "America/Mexico_City",
                    }).format(new Date(data.effectiveAt))}
                  </>
                )}
              </p>

              <span className="font-mono text-xs text-muted-foreground" title={data.contentSha256}>
                SHA-256: {data.contentSha256.slice(0, 10)}...{data.contentSha256.slice(-8)}
              </span>
            </div>

            {/* Evidence card if current user has accepted this version */}
            {data.userAcceptance && (
              <div
                className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50/70 p-4 text-xs space-y-1.5 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                data-testid="card-user-acceptance-evidence"
              >
                <div className="flex items-center gap-1.5 font-semibold text-emerald-900 dark:text-emerald-100">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Aceptación vinculada a tu cuenta:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-muted-foreground">Fecha de firma: </span>
                    <span className="font-medium">
                      {formatAcceptedDate(data.userAcceptance.acceptedAt).formatted}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Correo registrado: </span>
                    <span className="font-mono font-medium">{data.userAcceptance.userEmail}</span>
                  </div>
                </div>
              </div>
            )}

            <p className="mt-3 text-sm">
              <Link
                href={`/legal/${document}?version=${encodeURIComponent(data.version)}`}
                className="underline text-primary"
              >
                Enlace a esta versión
              </Link>
            </p>

            <article
              aria-label={title}
              className="mt-6 rounded-xl border bg-white p-5 sm:p-8"
              data-testid={`article-legal-document-${document}`}
            >
              <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-800">
                {data.content}
              </div>
            </article>
          </>
        ) : null}
      </main>

      <footer className="border-t bg-white px-5 py-6">
        <LegalLinks />
      </footer>
    </div>
  );
}
