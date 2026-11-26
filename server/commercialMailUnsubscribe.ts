import express,{type Express} from "express";
import {pool} from "./db";
import {commercialEmailHash,readCommercialUnsubscribeToken} from "./commercialMailDispatchRender";
export function registerCommercialMailUnsubscribe(app:Express){
  const path="/api/commercial-mail/unsubscribe/:token";
  const verify=(token:string)=>readCommercialUnsubscribeToken(token,process.env.COMMERCIAL_MAIL_UNSUBSCRIBE_SECRET||"");
  app.get(path,(req,res)=>{
    res.set({"Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'"});
    if(!verify(req.params.token))return res.status(400).send("Enlace inválido.");
    // GET only displays a confirmation. Mail scanners cannot opt users out.
    return res.type("html").send('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preferencias de correo</title><main style="font-family:Arial;max-width:460px;margin:40px auto;padding:16px"><h1>Correos comerciales</h1><p>Confirma si deseas dejar de recibir novedades y campañas de Crédito Negocios. Los avisos operativos de tu cuenta no cambian.</p><form method="post"><button type="submit" name="confirm" value="yes">Dejar de recibir correos comerciales</button></form></main></html>');
  });
  app.post(path,express.urlencoded({extended:false,limit:"1kb"}),async(req,res)=>{
    res.set({"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow"});
    const token=verify(req.params.token);
    if(!token||!(req.body?.confirm==="yes"||req.body?.["List-Unsubscribe"]==="One-Click"))return res.status(400).send("Solicitud inválida.");
    try{
      const user=(await pool.query("SELECT email FROM public.users WHERE id=$1 AND role IN ('broker','master_broker')",[token.id])).rows[0];
      if(user?.email&&commercialEmailHash(user.email)===token.hash)await pool.query("UPDATE public.users SET profile_data=jsonb_set(COALESCE(profile_data,'{}'::jsonb),'{commercialMailOptOut}','true'::jsonb,true) WHERE id=$1 AND email=$2",[token.id,user.email]);
      return res.type("text").send("Preferencia registrada. No recibirás nuevas campañas comerciales.");
    }catch{return res.status(503).send("No se pudo registrar la preferencia. Intenta de nuevo.");}
  });
}
