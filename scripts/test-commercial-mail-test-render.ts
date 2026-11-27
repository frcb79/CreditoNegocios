import {strict as assert} from "node:assert";
import {test} from "node:test";
import {commercialMailTestSettings,renderCommercialTest} from "../server/commercialMailTestRender";
import {renderCommercialMail} from "../server/commercialMailDispatchRender";
test("test mail requires staging, explicit enable, key, sender and allowlist; escapes HTML and omits live links",()=>{
  const env={RAILWAY_ENVIRONMENT_NAME:"staging",COMMERCIAL_MAIL_TEST_ENABLED:"true",RESEND_API_KEY:"synthetic",EMAIL_FROM:"qa@example.test",COMMERCIAL_MAIL_TEST_RECIPIENTS:" QA@example.test,qa@example.test,invalid"};
  assert.deepEqual(commercialMailTestSettings(env),{enabled:true,recipients:["qa@example.test"]});
  assert.equal(commercialMailTestSettings({...env,RAILWAY_ENVIRONMENT_NAME:"production"}).enabled,false);
  assert.equal(commercialMailTestSettings({...env,NODE_ENV:"test"}).enabled,false);
  assert.equal(commercialMailTestSettings({...env,COMMERCIAL_MAIL_TEST_ENABLED:"false"}).enabled,false);
  assert.equal(commercialMailTestSettings({...env,COMMERCIAL_MAIL_TEST_RECIPIENTS:""}).enabled,false);
  const mail=renderCommercialTest({day:1,subject:"Hola {{nombre}}",body:"<script>alert(1)</script> {{nombre}}",cta:"activate"});
  assert.ok(mail.subject.startsWith("[PRUEBA]"));assert.ok(mail.html.includes("&lt;script&gt;"));assert.ok(!mail.html.includes("<script>"));assert.ok(!mail.html.includes("href="));assert.ok(mail.text.includes("deshabilitado"));
});

test("test and real mail share corporate layout, test links remain inert",()=>{
  const step={day:1,subject:"Hola {{nombre}}",body:"Contenido de ejemplo",cta:"login" as const};
  const testMail=renderCommercialTest(step),real=renderCommercialMail(step,"Asesor de ejemplo","https://app.creditonegocios.com.mx","https://app.creditonegocios.com.mx/optout");
  for(const html of [testMail.html,real.html]){assert.ok(html.includes("background:#142e4a"));assert.ok(html.includes('role="presentation"'));assert.ok(html.includes("background:#147d52"));assert.ok(html.includes("Equipo Crédito Negocios"));}
  assert.ok(!testMail.html.includes("href="));assert.ok(real.html.includes('href="https://app.creditonegocios.com.mx/"'));
});

test("approved recovery uses fresh activation and unsubscribe links; test stays inert",()=>{
 const step={day:25,subject:"Recupera acceso",body:"Hola {{nombre}}",cta:"activate" as const};
 const real=renderCommercialMail(step,"Asesor","https://app.creditonegocios.com.mx","https://app.creditonegocios.com.mx/optout","https://app.creditonegocios.com.mx/reset-password?token=synthetic");
 assert.ok(real.html.includes("reset-password?token=synthetic"));assert.ok(real.html.includes("24 horas"));assert.ok(real.html.includes("/optout"));assert.ok(!renderCommercialTest(step).html.includes("href="));
});
