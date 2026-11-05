import { Link } from "wouter";

export default function LegalLinks({guest=false}:{guest?:boolean}) {
  return (
    <nav aria-label="Documentos legales" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
      <Link href={guest ? "/legal/terminos?public=1" : "/legal/terminos"} className="text-primary underline underline-offset-4">Términos y Condiciones</Link>
      <Link href={guest ? "/legal/aviso?public=1" : "/legal/aviso"} className="text-primary underline underline-offset-4">Aviso de Privacidad</Link>
    </nav>
  );
}
