import {commercialMailPreview,type CommercialMailDraft} from "../shared/commercialMailDrafts";
export function commercialMailTestSettings(env:NodeJS.ProcessEnv){
  const enabled=env.RAILWAY_ENVIRONMENT_NAME==="staging"&&env.COMMERCIAL_MAIL_TEST_ENABLED==="true"&&!!env.RESEND_API_KEY&&!!env.EMAIL_FROM;
  const recipients=enabled?[...new Set((env.COMMERCIAL_MAIL_TEST_RECIPIENTS??"").split(",").map(x=>x.trim().toLowerCase()).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))].slice(0,10):[];
  return {enabled:enabled&&recipients.length>0,recipients};
}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function renderCommercialTest(step:CommercialMailDraft["steps"][number]){
  const subject="[PRUEBA] "+commercialMailPreview(step.subject);
  const body=commercialMailPreview(step.body);
  const label={activate:"Activar cuenta",login:"Entrar a plataforma",reply:"Responder al correo",none:""}[step.cta];
  const note="Correo de prueba. No contiene enlaces de acceso reales ni inicia una campaña.";
  return {subject,text:body+(label?"\n\n["+label+" — deshabilitado]":"")+"\n\n"+note,
    html:'<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172033"><div style="background:#142b4a;color:white;padding:20px;font-weight:bold">CRÉDITO NEGOCIOS · PRUEBA</div><div style="padding:24px;white-space:pre-wrap">'+escape(body)+'</div>'+(label?'<div style="padding:0 24px 24px"><span style="background:#285c99;color:white;padding:12px;border-radius:5px">'+escape(label)+' (deshabilitado)</span></div>':'')+'<p style="padding:16px;color:#475569;font-size:12px">'+note+'</p></div>'};
}
