import { Link } from "wouter";

export default function LegalLinks() {
  return (
    <nav aria-label="Documentos legales" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
      <Link href="/legal/terminos" className="text-primary underline underline-offset-4">Términos y Condiciones</Link>
      <Link href="/legal/aviso" className="text-primary underline underline-offset-4">Aviso de Privacidad</Link>
    </nav>
  );
}
