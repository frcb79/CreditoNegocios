import {commercialMailPreview,type CommercialMailDraft} from "./commercialMailDrafts";
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function renderCommercialMailLayout(step:CommercialMailDraft["steps"][number],options:{name:string;test:boolean;base?:string;unsubscribe?:string;activationUrl?:string}){
  const {name,test,base,unsubscribe,activationUrl}=options;
  if(!test&&(!base||!unsubscribe||(step.cta==="activate"&&!activationUrl)))throw Error("Invalid commercial dispatch");
  const subject=(test?"[PRUEBA] ":"")+commercialMailPreview(step.subject,name||"Asesor").replace(/[\r\n]/g," ");
  const body=commercialMailPreview(step.body,name||"Asesor");
  const label={activate:"Activar cuenta",login:"Entrar a la plataforma",reply:"Responde directamente a este correo.",none:""}[step.cta];
  const buttonStyle="display:inline-block;background:#147d52;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold";
  const target=step.cta==="activate"?activationUrl:base+"/";
  const cta=step.cta==="none"?"":step.cta==="reply"?'<p>'+esc(label)+(test?' (deshabilitado)':'')+'</p>':test?'<p><span style="'+buttonStyle+'">'+esc(label)+' (deshabilitado)</span></p>':'<p><a style="'+buttonStyle+'" href="'+esc(target!)+'">'+esc(label)+'</a></p>';
  const footer=test?'Dejar de recibir correos comerciales (deshabilitado)':'<a style="color:#475569" href="'+esc(unsubscribe!)+'">Dejar de recibir correos comerciales</a>';
  const note=test?"Correo de prueba. No contiene enlaces de acceso reales ni inicia una campaña.":"";
  const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 10px;background:#f2f5f8;font-family:Arial,Helvetica,sans-serif;color:#18304c"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#142e4a;color:white;padding:24px;font-weight:bold">CRÉDITO NEGOCIOS'+(test?' · PRUEBA':'')+'</td></tr><tr><td style="padding:24px;font-size:15px;line-height:1.6"><div style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(body)+'</div>'+cta+(step.cta==="activate"?'<p style="font-size:12px">Enlace personal de un solo uso, válido durante 24 horas.</p>':"")+'<p>Equipo Crédito Negocios</p></td></tr><tr><td style="padding:16px 24px;color:#475569;font-size:12px;border-top:1px solid #e2e8f0">'+footer+(note?'<p>'+esc(note)+'</p>':'')+'</td></tr></table></body></html>';
  const text=body+(label?"\n\n"+label+(test?" — deshabilitado":step.cta==="login"||step.cta==="activate"?"\n"+target:""):"")+"\n\nEquipo Crédito Negocios\n\nDejar de recibir correos comerciales: "+(test?"deshabilitado\n\n"+note:unsubscribe);
  return {subject,text,html};
}
