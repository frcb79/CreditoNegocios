import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <img
            src="/credito-negocios-07.jpg"
            alt="Crédito Negocios"
            className="h-12 w-auto rounded-md shadow-xs object-contain"
          />
        </div>

        <Card className="border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5 rounded-2xl">
          <CardContent className="pt-8 pb-6 px-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
              <FileQuestion className="h-8 w-8 text-primary" />
            </div>

            <div>
              <h1 className="text-2xl font-black text-slate-900">404 - Página no encontrada</h1>
              <p className="mt-2 text-sm text-slate-600">
                La página que buscas no existe, ha sido movida o no está disponible.
              </p>
            </div>

            <div className="pt-2">
              <Button asChild className="w-full bg-primary hover:bg-primary/90 text-white font-semibold">
                <a href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Volver al inicio
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500 mt-6">
          © 2026 Crédito Negocios. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
