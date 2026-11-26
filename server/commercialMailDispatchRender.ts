import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {commercialMailPreview,type CommercialMailDraft} from "../shared/commercialMailDrafts";
export function commercialMailDispatchSettings(env:NodeJS.ProcessEnv){
  const base=env.FRONTEND_BASE_URL?.replace(/\/$/,"");
  const secret=env.COMMERCIAL_MAIL_UNSUBSCRIBE_SECRET||"";
  const replyTo=env.COMMERCIAL_MAIL_REPLY_TO||"";
  const enabled=env.NODE_ENV!=="test"&&env.RAILWAY_ENVIRONMENT_NAME==="production"&&env.COMMERCIAL_MAIL_DISPATCH_ENABLED==="true"&&base==="https://app.creditonegocios.com.mx"&&secret.length>=32&&!!env.RESEND_API_KEY&&!!env.EMAIL_FROM&&!!env.RESEND_WEBHOOK_SECRET&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo);
  return {enabled,base,secret,replyTo,from:env.EMAIL_FROM||""};
}
export const commercialEmailHash=(email:string)=>createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
const sign=(value:string,secret:string)=>createHmac("sha256",secret).update("commercial-optout:"+value).digest("base64url");
export function commercialUnsubscribeToken(id:string,email:string,secret:string){
  const value=Buffer.from(JSON.stringify([id,commercialEmailHash(email)])).toString("base64url");
  return value+"."+sign(value,secret);
}
export function readCommercialUnsubscribeToken(token:string,secret:string):{id:string;hash:string}|null{
  if(secret.length<32||token.length>700||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(token))return null;
  const [value,signature]=token.split(".");
  const a=Buffer.from(signature),b=Buffer.from(sign(value,secret));
  if(a.length!==b.length||!timingSafeEqual(a,b))return null;
  try{const [id,hash]=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));return typeof id==="string"&&id.length<=100&&typeof hash==="string"&&/^[a-f0-9]{64}$/.test(hash)?{id,hash}:null;}catch{return null;}
}
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function renderCommercialMail(step:CommercialMailDraft["steps"][number],name:string,base:string,unsubscribe:string){
  if(step.cta==="activate")throw Error("Invitation activation is not a commercial dispatch");
  const subject=commercialMailPreview(step.subject,name||"Asesor").replace(/[\r\n]/g," ");
  const body=commercialMailPreview(step.body,name||"Asesor");
  const cta=step.cta==="login"?'<p><a style="display:inline-block;background:#05478a;color:white;padding:12px 20px;border-radius:6px;text-decoration:none" href="'+esc(base)+'/login">Entrar a la plataforma</a></p>':step.cta==="reply"?'<p>Responde directamente a este correo.</p>':"";
  return {subject,text:body+(step.cta==="login"?"\n\n"+base+"/login":step.cta==="reply"?"\n\nResponde directamente a este correo.":"")+"\n\nDejar de recibir correos comerciales: "+unsubscribe,html:'<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172e49"><div style="background:#05478a;color:white;padding:20px;font-weight:bold">CRÉDITO NEGOCIOS</div><div style="padding:24px"><div style="white-space:pre-wrap">'+esc(body)+'</div>'+cta+'</div><p style="font-size:12px;padding:16px;color:#475569"><a href="'+esc(unsubscribe)+'">Dejar de recibir correos comerciales</a></p></div>'};
}
