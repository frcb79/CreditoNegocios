import {Resend} from "resend";
import {pool} from "./db";
import {commercialMailSchema} from "../shared/commercialMailDrafts";
import {COMMERCIAL_MAIL_RECIPIENTS_SQL} from "./commercialMailRecipients";
import {commercialMailDispatchSettings,commercialEmailHash,commercialUnsubscribeToken,renderCommercialMail} from "./commercialMailDispatchRender";
import {CLAIM_COMMERCIAL_MAIL_SQL,DUE_COMMERCIAL_MAIL_SQL,EXPIRE_COMMERCIAL_MAIL_SQL} from "./commercialMailDispatchSchema";
const mark=async(j:any,status:string,reason:string)=>pool.query("INSERT INTO public.commercial_mail_dispatches(plan_id,user_id,step_day,status,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(plan_id,user_id,step_day) DO NOTHING",[j.plan_id,j.user_id,j.step_day,status,reason]);
async function eligible(j:any,audience:string){
  const rows=(await pool.query(COMMERCIAL_MAIL_RECIPIENTS_SQL,[audience])).rows;
  if(rows.length>500)return null;
  const user=rows.find(r=>r.id===j.user_id);
  if(!user||j.recipient_hashes?.[j.user_id]!==commercialEmailHash(user.email))return null;
  // New commercial bounces or complaints block subsequent campaigns as well.
  const blocked=await pool.query(`SELECT 1 FROM public.commercial_mail_dispatches d
    JOIN public.resend_delivery_events e ON e.provider_message_id=d.provider_message_id
    WHERE d.user_id=$1 AND e.event_type IN ('email.bounced','email.complained','email.suppressed') LIMIT 1`,[j.user_id]);
  return blocked.rowCount?null:user;
}
export async function runCommercialMailDispatch(){
  const settings=commercialMailDispatchSettings(process.env);
  const stats={enabled:settings.enabled,sent:0,skipped:0,uncertain:0};
  if(!settings.enabled)return stats;
  const lock=await pool.connect();
  try{
    // Session lock across the bounded batch prevents overlapping workers and claims.
    const acquired=(await lock.query("SELECT pg_try_advisory_lock(hashtextextended('commercial-mail-dispatch-global',0)) AS acquired")).rows[0].acquired;
    if(!acquired)return stats;
    try{
      await lock.query("UPDATE public.commercial_mail_dispatches SET status='uncertain',reason='claim_interrupted' WHERE status='claimed' AND claimed_at<now()-interval '30 minutes'");
      await lock.query(EXPIRE_COMMERCIAL_MAIL_SQL);
      const {rows}=await lock.query(DUE_COMMERCIAL_MAIL_SQL);
      const resend=new Resend(process.env.RESEND_API_KEY!);
      for(const j of rows){
        const parsed=commercialMailSchema.safeParse(j.content);
        const step=parsed.success?parsed.data.steps.find(s=>s.day===j.step_day):undefined;
        if(!parsed.success||!step||parsed.data.audience==="pending_registration"){await mark(j,"skipped","invalid_revision");stats.skipped++;continue;}
        const user=await eligible(j,parsed.data.audience);
        if(!user){await mark(j,"skipped","eligibility_changed");stats.skipped++;continue;}
        const recent=await lock.query(`SELECT 1 FROM public.broker_activation_welcome_events WHERE user_id=$1 AND created_at>now()-interval '24 hours'
          UNION ALL SELECT 1 FROM public.broker_invitation_reminder_events WHERE user_id=$1 AND claimed_at>now()-interval '24 hours'
          UNION ALL SELECT 1 FROM public.notifications WHERE type='broker_invitation_sent' AND data->>'brokerId'=$1 AND created_at>now()-interval '24 hours' LIMIT 1`,[j.user_id]);
        if(recent.rowCount)continue;
        const claim=await lock.query(CLAIM_COMMERCIAL_MAIL_SQL,[j.plan_id,j.user_id,j.step_day,user.email]);
        if(!claim.rowCount)continue;
        const update=async(status:string,reason:string,provider:string|null=null)=>lock.query(`UPDATE public.commercial_mail_dispatches SET status=$4,reason=$5,provider_message_id=$6,sent_at=CASE WHEN $4::varchar='sent' THEN now() ELSE NULL END
          WHERE plan_id=$1 AND user_id=$2 AND step_day=$3 AND status='claimed'`,[j.plan_id,j.user_id,j.step_day,status,reason,provider]);
        try{
          // Cancellation, first request, opt-out and address changes are checked immediately before transport.
          const active=(await lock.query("SELECT 1 FROM public.commercial_mail_plans WHERE id=$1 AND state='planned'",[j.plan_id])).rowCount;
          const fresh=await eligible(j,parsed.data.audience);
          if(!active||!fresh||fresh.email!==user.email||!commercialMailDispatchSettings(process.env).enabled){await update("skipped","eligibility_changed");stats.skipped++;continue;}
          const unsubscribe=settings.base+"/api/commercial-mail/unsubscribe/"+commercialUnsubscribeToken(user.id,user.email,settings.secret);
          const mail=renderCommercialMail(step,[fresh.firstName,fresh.lastName].filter(Boolean).join(" "),settings.base!,unsubscribe);
          const result=await resend.emails.send({from:settings.from,to:user.email,replyTo:settings.replyTo,...mail,headers:{"List-Unsubscribe":"<"+unsubscribe+">","List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}},{idempotencyKey:"cn-commercial/"+j.plan_id+"/"+j.user_id+"/"+j.step_day});
          if(result.data?.id){await update("sent","provider_accepted",result.data.id);stats.sent++;}
          else{await update("uncertain","provider_unconfirmed");stats.uncertain++;}
        }catch{await update("uncertain","provider_or_persistence_unconfirmed").catch(()=>{});stats.uncertain++;}
      }
    }finally{await lock.query("SELECT pg_advisory_unlock(hashtextextended('commercial-mail-dispatch-global',0))").catch(()=>{});}
  }finally{lock.release();}
  return stats;
}
