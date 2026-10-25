import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PublishedCommercialTemplate } from "@/lib/commercialResources";
import { templateSvg } from "@/lib/commercialResources";
import {
  commercialFormat, commercialFormatLabel, commercialProductName,
  commercialStyleLabel
} from "@/lib/commercialLibrary";
import { commercialArtworkEndpoint, fetchPrivateCommercialPng } from "@/lib/commercialArtworkClient";

type Props={
  template:PublishedCommercialTemplate;
  selected:boolean;
  onClick:()=>void;
  children?:ReactNode;
  compact?:boolean;
};

export default function CommercialTemplateCard({template,selected,onClick,children,compact=false}:Props){
  const article=useRef<HTMLElement|null>(null);
  const [loaded,setLoaded]=useState<{id:string;url:string}|null>(null);
  const [error,setError]=useState("");
  const isGraphic=Boolean(template.definition.graphic);

  useEffect(()=>{
    if(!isGraphic)return;
    let active=true;
    let objectUrl:string|null=null;
    let requested=false;
    const controller=new AbortController();
    const start=()=>{
      if(requested)return;
      requested=true;
      fetchPrivateCommercialPng(commercialArtworkEndpoint(template.id),controller.signal)
        .then(blob=>{
          if(!active)return;
          objectUrl=URL.createObjectURL(blob);
          setLoaded({id:template.id,url:objectUrl});
          setError("");
        })
        .catch((cause:unknown)=>{
          if(!active||controller.signal.aborted)return;
          setError(cause instanceof Error?cause.message:"No se pudo cargar la miniatura.");
        });
    };
    let observer:IntersectionObserver|null=null;
    if(typeof IntersectionObserver!=="undefined" && article.current){
      observer=new IntersectionObserver(entries=>{
        if(entries.some(e=>e.isIntersecting)){
          observer?.disconnect();
          start();
        }
      },{rootMargin:"250px"});
      observer.observe(article.current);
    }else start();
    return()=>{
      active=false;
      controller.abort();
      observer?.disconnect();
      if(objectUrl)URL.revokeObjectURL(objectUrl);
    };
  },[template.id,template.definition.graphic?.sha256,isGraphic]);

  const src=!isGraphic
    ? "data:image/svg+xml;charset=utf-8,"+
      encodeURIComponent(templateSvg(template,{displayName:"Vista previa",whatsapp:"",showPhone:false}))
    : loaded?.id===template.id?loaded.url:"";

  return <article ref={article}
    data-testid={"commercial-template-card-"+template.id}
    className={"overflow-hidden rounded-xl border bg-card transition-colors "+
      (selected?"border-primary ring-1 ring-primary":"hover:border-primary/40")}>
    <div className={compact?"flex gap-3 p-2.5":"space-y-2 p-2.5"}>
      <button type="button" onClick={onClick} aria-pressed={selected}
        className={compact?"w-20 sm:w-24 shrink-0":"block w-full"}
        aria-label={"Vista previa de "+template.name}>
        {src ? <img loading="lazy" decoding="async" src={src} alt={"Miniatura de "+template.name}
          className={(compact?"w-full max-h-32":"w-full max-h-52")+" rounded-md object-contain bg-muted/30"}/> :
          <div className="min-h-24 rounded-md bg-muted/40 flex items-center justify-center p-2 text-center text-xs text-muted-foreground"
            role="status">
            {error || "Cargando miniatura…"}
          </div>}
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
