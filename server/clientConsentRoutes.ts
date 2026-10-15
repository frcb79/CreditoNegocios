import type { Express } from "express";
import rateLimit from "express-rate-limit";
import {
  ClientConsentError,inspectConsentLink,prepareConsentOtp,
  verifyConsentOtp,invalidateConsentRequest,getClientConsentReceipt,
  prepareConsentRevocationOtp,revokeConsentWithOtp,
} from "./clientConsentService";
import {sendClientConsentOtpEmail} from "./emailService";
import {renderLegalVoucherPdf} from "./legalVoucherPdf";

const limiter=rateLimit({windowMs:60*60*1000,limit:25,standardHeaders:"draft-7",
  legacyHeaders:false,message:{message:"Demasiadas solicitudes. Intenta más tarde."}});
function fail(res:any,error:any) {
  if (error instanceof ClientConsentError)
    return res.status(error.status).json({code:error.code,message:error.message});
  console.error("[LEG10] Client consent request error:", error?.message || String(error));
  return res.status(503).json({code:"CLIENT_CONSENT_UNAVAILABLE",
    message:"El servicio de autorización no está disponible actualmente."});
}
export function registerClientConsentPublicRoutes(app:Express) {
  app.get("/api/client-consent/:token/comprobante",limiter,async(req,res)=>{
    try {
      const evidence=await getClientConsentReceipt(String(req.params.token));
      const bytes=await renderLegalVoucherPdf(evidence.text);
      res.setHeader("Content-Type","application/pdf");
      res.setHeader("Cache-Control","private, no-store");
      res.setHeader("Content-Disposition",
        "attachment; filename=\"autorizacion-cliente-"+evidence.evidenceId.replace(/[^a-z0-9-]/gi,"")+".pdf\"");
      return res.send(bytes);
    } catch(e){return fail(res,e);}
  });
  app.post("/api/client-consent/:token/revoke/request-otp",limiter,async(req,res)=>{
    try{
      const prepared=await prepareConsentRevocationOtp(String(req.params.token));
      const result=await sendClientConsentOtpEmail({to:prepared.to,
        signerName:prepared.name,code:prepared.code});
      if(!result.success) {
        await invalidateConsentRequest(prepared.id);
        return res.status(502).json({message:"No fue posible entregar el código de revocación."});
      }
      return res.json({success:true,message:"Código de revocación enviado al correo del firmante."});
    }catch(e){return fail(res,e);}
  });
  app.post("/api/client-consent/:token/revoke/verify-otp",limiter,async(req,res)=>{
    try{
      const out=await revokeConsentWithOtp({
        token:String(req.params.token),code:String(req.body?.code||"").trim(),
        ip:req.ip||null,userAgent:String(req.headers["user-agent"]||"unknown").slice(0,512),
      });
      if(!out.success) return res.status(400).json({code:out.code,message:"El código de revocación no coincide."});
      return res.json(out);
    }catch(e){return fail(res,e);}
  });
  // The bearer link is scoped to one specific pending challenge.
  app.get("/api/client-consent/:token",limiter,async(req,res)=>{
    try { return res.json(await inspectConsentLink(String(req.params.token))); }
    catch(e){return fail(res,e);}
  });
  app.post("/api/client-consent/:token/request-otp",limiter,async(req,res)=>{
    try {
      const prepared=await prepareConsentOtp(String(req.params.token));
      const mail=await sendClientConsentOtpEmail({
        to:prepared.to,signerName:prepared.name,code:prepared.code,
      });
      if (!mail.success) {
        // Code is invalidated with the challenge. Never leave an undelivered
        // code usable, and never return it to the caller.
        await invalidateConsentRequest(prepared.id);
        return res.status(502).json({code:"CLIENT_CONSENT_EMAIL_FAILED",
          message:"No se pudo enviar el código al correo del cliente."});
      }
      return res.json({success:true,expiresAt:prepared.expiresAt,
        message:"Código de seis dígitos enviado al correo del cliente."});
    } catch(e){return fail(res,e);}
  });
  app.post("/api/client-consent/:token/verify-otp",limiter,async(req,res)=>{
    try {
      const code=typeof req.body?.code==="string"?req.body.code.trim():"";
      const out=await verifyConsentOtp({
        token:String(req.params.token),code,confirmed:req.body?.confirmed===true,
        ip:req.ip || null,userAgent:String(req.headers["user-agent"]||"unknown").slice(0,512),
      });
      if(!out.success) return res.status(400).json({
        code:out.code,message:"El código es incorrecto. Verifica e intenta de nuevo."
      });
      return res.json({success:true,evidenceId:out.evidenceId,
        acceptedAt:out.acceptedAt,representationPending:out.representationPending,
        message:out.representationPending
          ?"Autorización recibida. La representación legal debe ser verificada antes de compartir el expediente."
          :"Autorización registrada y conservada para esta financiera."});
    } catch(e){return fail(res,e);}
  });
}
