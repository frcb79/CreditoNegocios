import type { CommercialResourceDefinition } from "@shared/commercialResourceDefinition";
import { normalizedWhatsApp } from "./commercialResources";
import type { PublishedCommercialTemplate } from "./commercialResources";
import { commercialArtworkEndpoint, loadAuthenticatedImage } from "./commercialArtworkClient";

export type GraphicIdentity = {
 displayName:string; whatsapp:string;
};

function fit(ctx:CanvasRenderingContext2D, value:string,
 field:{x:number;y:number;width:number;height:number;size:number;minSize:number;weight:600|700;color:string}):void {
 const text=value.trim();
 if(!text)throw new Error("Falta un campo obligatorio.");
 let size=field.size;
 for(;size>=field.minSize;size--){
  ctx.font=`${field.weight} ${size}px Inter, Arial, sans-serif`;
  if(ctx.measureText(text).width<=field.width)break;
 }
 if(size<field.minSize)throw new Error("El nombre o CTA excede el espacio aprobado; solicita corrección antes de exportar.");
 ctx.textBaseline="middle";
 ctx.textAlign="left";
 ctx.fillStyle=field.color;
 ctx.fillText(text,field.x,field.y+field.height/2);
}
/** Independent canvas path; previous SVG templates remain untouched. */
export async function renderCommercialGraphic(
 template:PublishedCommercialTemplate, identity:GraphicIdentity
):Promise<HTMLCanvasElement> {
 const graphic=template.definition.graphic;
 if(!graphic||graphic.mode!=="png-overlay")throw new Error("El recurso no es una plantilla gráfica.");
 const name=identity.displayName.trim().replace(/\s+/g," ");
 const phone=normalizedWhatsApp(identity.whatsapp);
 if(name.length<2||name.length>120)throw new Error("Falta un nombre válido en el perfil.");
 if(!phone)throw new Error("WhatsApp válido obligatorio en el perfil.");
 const [background] = await Promise.all([
  loadAuthenticatedImage(commercialArtworkEndpoint(template.id)),
  document.fonts.load('700 32px Inter'),
  document.fonts.load('600 25px Inter')
 ]);
 if(background.naturalWidth!==graphic.canvas.width||background.naturalHeight!==graphic.canvas.height)
  throw new Error("Dimensiones del PNG distintas de las autorizadas.");
 if(!document.fonts.check("700 32px Inter")||!document.fonts.check("600 25px Inter"))
  throw new Error("No fue posible cargar Inter.");
 const canvas=document.createElement("canvas");
 canvas.width=graphic.canvas.width;canvas.height=graphic.canvas.height;
 const ctx=canvas.getContext("2d");
 if(!ctx)throw new Error("No se pudo iniciar el renderizador.");
 ctx.drawImage(background,0,0);
 fit(ctx,name,graphic.fields.name);
 fit(ctx,"+"+phone,graphic.fields.whatsapp);
 fit(ctx,graphic.fields.cta.text,graphic.fields.cta);
 // Broker/Master identity is text-only. The CN logo is baked into the approved background.
 return canvas;
}
