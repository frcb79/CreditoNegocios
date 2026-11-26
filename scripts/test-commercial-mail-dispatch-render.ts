import {strict as assert} from "node:assert";
import {test} from "node:test";
import {commercialMailDispatchSettings,commercialEmailHash,commercialUnsubscribeToken,readCommercialUnsubscribeToken,renderCommercialMail} from "../server/commercialMailDispatchRender";
test("dispatch requires explicit production configuration and a signed opt-out",()=>{
 const env={NODE_ENV:"production",RAILWAY_ENVIRONMENT_NAME:"production",COMMERCIAL_MAIL_DISPATCH_ENABLED:"true",FRONTEND_BASE_URL:"https://app.creditonegocios.com.mx",COMMERCIAL_MAIL_UNSUBSCRIBE_SECRET:"synthetic-secret-for-tests-not-production",COMMERCIAL_MAIL_REPLY_TO:"reply@example.test",EMAIL_FROM:"sender@example.test",RESEND_API_KEY:"test",RESEND_WEBHOOK_SECRET:"test"};
 assert.equal(commercialMailDispatchSettings(env).enabled,true);
 for(const patch of [{RAILWAY_ENVIRONMENT_NAME:"staging"},{NODE_ENV:"test"},{COMMERCIAL_MAIL_DISPATCH_ENABLED:"false"},{FRONTEND_BASE_URL:"https://example.test"},{COMMERCIAL_MAIL_UNSUBSCRIBE_SECRET:"short"},{RESEND_WEBHOOK_SECRET:""}])assert.equal(commercialMailDispatchSettings({...env,...patch}).enabled,false);
 const secret=env.COMMERCIAL_MAIL_UNSUBSCRIBE_SECRET;
 const token=commercialUnsubscribeToken("synthetic","a@example.test",secret);
 assert.deepEqual(readCommercialUnsubscribeToken(token,secret),{id:"synthetic",hash:commercialEmailHash("a@example.test")});
 assert.equal(readCommercialUnsubscribeToken(token+"x",secret),null);
 assert.equal(readCommercialUnsubscribeToken(token,secret+"x"),null);
 const mail=renderCommercialMail({day:1,subject:"Hola {{nombre}}",body:"Hola {{nombre}} <script>",cta:"login"},"<Asesor>",env.FRONTEND_BASE_URL,"https://app.creditonegocios.com.mx/api/commercial-mail/unsubscribe/"+token);
 assert.ok(mail.html.includes("&lt;Asesor&gt;"));assert.ok(!mail.html.includes("<script>"));assert.ok(mail.html.includes('href="https://app.creditonegocios.com.mx/"'));assert.ok(mail.text.includes("Dejar de recibir"));
 assert.throws(()=>renderCommercialMail({day:1,subject:"Hola",body:"Hola asesor",cta:"activate"},"Asesor",env.FRONTEND_BASE_URL,"https://example.test"));
});
