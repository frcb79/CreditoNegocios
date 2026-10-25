import type { ReactNode } from "react";
import type { PublishedCommercialTemplate } from "@/lib/commercialResources";
import { templateSvg } from "@/lib/commercialResources";
import {
  commercialFormat, commercialFormatLabel, commercialProductName,
  commercialStyleLabel, commercialThumbSrc
} from "@/lib/commercialLibrary";

type Props={
  template:PublishedCommercialTemplate;
  selected:boolean;
  onClick:()=>void;
  children?:ReactNode;
  compact?:boolean;
};

export default function CommercialTemplateCard({template,selected,onClick,children,compact=false}:Props){
  const src=commercialThumbSrc(template) ||
    "data:image/svg+xml;charset=utf-8,"+
    encodeURIComponent(templateSvg(template,{displayName:"Vista previa",whatsapp:"",showPhone:false}));
  return <article
    data-testid={"commercial-template-card-"+template.id}
    className={"overflow-hidden rounded-xl border bg-card transition-colors "+
      (selected?"border-primary ring-1 ring-primary":"hover:border-primary/40")}>
    <div className={compact?"flex gap-3 p-2.5":"space-y-2 p-2.5"}>
      <button type="button" onClick={onClick} aria-pressed={selected}
        className={compact?"w-20 sm:w-24 shrink-0":"block w-full"}
        aria-label={"Vista previa de "+template.name}>
        <img loading="lazy" decoding="async" src={src} alt={"Miniatura de "+template.name}
          className={(compact?"w-full max-h-32":"w-full max-h-52")+" rounded-md object-contain bg-muted/30"} />
      </button>
      <div className={compact?"min-w-0 flex-1 space-y-2":"min-w-0 space-y-2"}>
        <button type="button" onClick={onClick}
          className="block w-full text-left text-sm font-semibold leading-snug hover:text-primary break-words">
          {template.name}
        </button>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          <span>{commercialProductName(template.product)}</span>
          <span>· {commercialFormatLabel(commercialFormat(template))}</span>
          {template.style && <span>· {commercialStyleLabel(template.style)}</span>}
          {template.topic && <span className="block w-full">Tema: {template.topic}</span>}
          {template.status&&<span>· {template.status==="published"?"Publicada":template.status==="retired"?"Retirada":"Borrador"}</span>}
        </div>
        {children&&<div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  </article>;
}
