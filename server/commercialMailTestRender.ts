import type {CommercialMailDraft} from "../shared/commercialMailDrafts";
import {renderCommercialMailLayout} from "../shared/commercialMailLayout";
export function commercialMailTestSettings(env:NodeJS.ProcessEnv){
  const enabled=env.NODE_ENV!=="test"&&env.RAILWAY_ENVIRONMENT_NAME==="staging"&&env.COMMERCIAL_MAIL_TEST_ENABLED==="true"&&!!env.RESEND_API_KEY&&!!env.EMAIL_FROM;
  const recipients=enabled?Array.from(new Set((env.COMMERCIAL_MAIL_TEST_RECIPIENTS??"").split(",").map(x=>x.trim().toLowerCase()).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))).slice(0,10):[];
  return {enabled:enabled&&recipients.length>0,recipients};
}
export function renderCommercialTest(step:CommercialMailDraft["steps"][number]){
  return renderCommercialMailLayout(step,{name:"Asesor de ejemplo",test:true});
}
