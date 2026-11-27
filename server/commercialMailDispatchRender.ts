import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import type {CommercialMailDraft} from "../shared/commercialMailDrafts";
import {renderCommercialMailLayout} from "../shared/commercialMailLayout";
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
export function renderCommercialMail(step:CommercialMailDraft["steps"][number],name:string,base:string,unsubscribe:string){
  return renderCommercialMailLayout(step,{name,test:false,base,unsubscribe});
}
