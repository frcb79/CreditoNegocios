import {strict as assert} from "node:assert";
import {test} from "node:test";
import {commercialMailTestSettings,renderCommercialTest} from "../server/commercialMailTestRender";
test("test mail requires staging, explicit enable, key, sender and allowlist; escapes HTML and omits live links",()=>{
  const env={RAILWAY_ENVIRONMENT_NAME:"staging",COMMERCIAL_MAIL_TEST_ENABLED:"true",RESEND_API_KEY:"synthetic",EMAIL_FROM:"qa@example.test",COMMERCIAL_MAIL_TEST_RECIPIENTS:" QA@example.test,qa@example.test,invalid"};
  assert.deepEqual(commercialMailTestSettings(env),{enabled:true,recipients:["qa@example.test"]});
  assert.equal(commercialMailTestSettings({...env,RAILWAY_ENVIRONMENT_NAME:"production"}).enabled,false);
  assert.equal(commercialMailTestSettings({...env,COMMERCIAL_MAIL_TEST_ENABLED:"false"}).enabled,false);
  assert.equal(commercialMailTestSettings({...env,COMMERCIAL_MAIL_TEST_RECIPIENTS:""}).enabled,false);
  const mail=renderCommercialTest({day:1,subject:"Hola {{nombre}}",body:"<script>alert(1)</script> {{nombre}}",cta:"activate"});
  assert.ok(mail.subject.startsWith("[PRUEBA]"));assert.ok(mail.html.includes("&lt;script&gt;"));assert.ok(!mail.html.includes("<script>"));assert.ok(!mail.html.includes("href="));assert.ok(mail.text.includes("deshabilitado"));
});
