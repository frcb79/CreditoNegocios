import {Resend} from "resend";
import {randomBytes} from "node:crypto";
import {commercialSendWindow,COMMERCIAL_BATCH_SIZE} from "../shared/commercialMailSchedule";
import {pool} from "./db";
import type {PoolClient} from "pg";
import {commercialMailSchema} from "../shared/commercialMailDrafts";
import {COMMERCIAL_MAIL_RECIPIENTS_SQL} from "./commercialMailRecipients";
import {commercialMailDispatchSettings,commercialEmailHash,commercialUnsubscribeToken,renderCommercialMail} from "./commercialMailDispatchRender";
import {CLAIM_COMMERCIAL_MAIL_SQL,DUE_COMMERCIAL_MAIL_SQL,EXPIRE_COMMERCIAL_MAIL_SQL} from "./commercialMailDispatchSchema";
const mark=async(db:PoolClient,j:any,status:string,reason:string)=>db.query("INSERT INTO public.commercial_mail_dispatches(plan_id,user_id,step_day,status,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(plan_id,user_id,step_day) DO NOTHING",[j.plan_id,j.user_id,j.step_day,status,reason]);
async function eligible(db:PoolClient,j:any,audience:string){
  const rows=(await db.query(COMMERCIAL_MAIL_RECIPIENTS_SQL,[audience])).rows;
  if(rows.length>500)return null;
  const user=rows.find(r=>r.id===j.user_id);
  if(!user||j.recipient_hashes?.[j.user_id]!==commercialEmailHash(user.email))return null;
  // New commercial bounces or complaints block subsequent campaigns as well.
  const blocked=await db.query(`SELECT 1 FROM public.commercial_mail_dispatches d
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
      if(!commercialSendWindow(new Date()))return stats;
      const recentBatch=await lock.query("SELECT count(*)::int AS n FROM public.commercial_mail_dispatches WHERE status IN ('claimed','sent','uncertain') AND claimed_at>now()-interval '30 minutes'");
      const remaining=Math.max(0,COMMERCIAL_BATCH_SIZE-Number(recentBatch.rows[0].n));
      if(!remaining)return stats;
      const {rows}=await lock.query(DUE_COMMERCIAL_MAIL_SQL);
      const resend=new Resend(process.env.RESEND_API_KEY!);
      for(const j of rows.slice(0,remaining)){
        const parsed=commercialMailSchema.safeParse(j.content);
        const step=parsed.success?parsed.data.steps.find(s=>s.day===j.step_day):undefined;
        if(!parsed.success||!step){await mark(lock,j,"skipped","invalid_revision");stats.skipped++;continue;}
        const recovery=parsed.data.audience==="pending_registration";
        if(recovery){
          const prior=await lock.query(`SELECT 1 FROM public.broker_invitation_reminder_events WHERE user_id=$1 AND
              (reminder_day=$2 AND status IN ('claimed','sent','failed') OR status='claimed' OR (status='failed' AND (last_error LIKE 'Estado de envío no confirmado:%' OR last_error ILIKE '%inconsistent types deduced for parameter $3%')))
            UNION ALL SELECT 1 FROM public.commercial_mail_dispatches d JOIN public.commercial_mail_plans p ON p.id=d.plan_id JOIN public.commercial_mail_draft_revisions r ON r.draft_id=p.draft_id AND r.revision=p.revision
              WHERE d.user_id=$1 AND d.step_day=$2 AND r.content->>'audience'='pending_registration' AND d.status IN ('claimed','sent','uncertain') LIMIT 1`,[j.user_id,j.step_day]);
          if(prior.rowCount){await mark(lock,j,"skipped","recovery_already_attempted");stats.skipped++;continue;}
        }
        const user=await eligible(lock,j,parsed.data.audience);
        if(!user){await mark(lock,j,"skipped","eligibility_changed");stats.skipped++;continue;}
        const recent=await lock.query(`SELECT 1 FROM public.broker_activation_welcome_events WHERE user_id=$1 AND created_at>now()-interval '24 hours'
          UNION ALL SELECT 1 FROM public.broker_invitation_reminder_events WHERE user_id=$1 AND claimed_at>now()-interval '24 hours'
          UNION ALL SELECT 1 FROM public.notifications WHERE type='broker_invitation_sent' AND data->>'brokerId'=$1 AND created_at>now()-interval '24 hours' LIMIT 1`,[j.user_id]);
        if(recent.rowCount){await mark(lock,j,"skipped","recent_account_email");stats.skipped++;continue;}
        const claim=await lock.query(CLAIM_COMMERCIAL_MAIL_SQL,[j.plan_id,j.user_id,j.step_day,user.email]);
        if(!claim.rowCount){await mark(lock,j,"skipped","recent_or_uncertain_campaign");stats.skipped++;continue;}
        const update=async(status:string,reason:string,provider:string|null=null)=>lock.query(`UPDATE public.commercial_mail_dispatches SET status=$4,reason=$5,provider_message_id=$6,sent_at=CASE WHEN $4::varchar='sent' THEN now() ELSE NULL END
          WHERE plan_id=$1 AND user_id=$2 AND step_day=$3 AND status='claimed'`,[j.plan_id,j.user_id,j.step_day,status,reason,provider]);
        try{
          // Cancellation, first request, opt-out and address changes are checked immediately before transport.
          const active=(await lock.query("SELECT 1 FROM public.commercial_mail_plans WHERE id=$1 AND state='planned'",[j.plan_id])).rowCount;
          const fresh=await eligible(lock,j,parsed.data.audience);
          if(!active||!fresh||fresh.email!==user.email||!commercialMailDispatchSettings(process.env).enabled){await update("skipped","eligibility_changed");stats.skipped++;continue;}
          const unsubscribe=settings.base+"/api/commercial-mail/unsubscribe/"+commercialUnsubscribeToken(user.id,user.email,settings.secret);
          let activationUrl:string|undefined;
          if(recovery){
            const token=randomBytes(32).toString("hex");
            const set=await lock.query(`UPDATE public.users SET reset_token=$2,reset_token_expiry=now()+interval '24 hours',updated_at=now()
              WHERE id=$1 AND email=$3 AND password IS NULL AND status='active' AND is_active IS TRUE AND access_status NOT IN ('expired','suspended')
                AND COALESCE(profile_data->>'commercialMailOptOut','false')<>'true' AND COALESCE(profile_data->>'invitationFollowupPaused','false')<>'true'
                AND (reset_token_expiry IS NULL OR reset_token_expiry<=now()) RETURNING id`,[j.user_id,token,fresh.email]);
            if(!set.rowCount){await update("skipped","activation_already_available");stats.skipped++;continue;}
            activationUrl=settings.base+"/reset-password?token="+encodeURIComponent(token);
          }
          const mail=renderCommercialMail(step,[fresh.firstName,fresh.lastName].filter(Boolean).join(" "),settings.base!,unsubscribe,activationUrl);
          const result=await resend.emails.send({from:settings.from,to:user.email,replyTo:settings.replyTo,...mail,headers:{"List-Unsubscribe":"<"+unsubscribe+">","List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}},{idempotencyKey:"cn-commercial/"+j.plan_id+"/"+j.user_id+"/"+j.step_day});
          if(result.data?.id){await update("sent","provider_accepted",result.data.id);stats.sent++;}
          else{await update("uncertain","provider_unconfirmed");stats.uncertain++;}
        }catch{await update("uncertain","provider_or_persistence_unconfirmed").catch(()=>{});stats.uncertain++;}
      }
    }finally{await lock.query("SELECT pg_advisory_unlock(hashtextextended('commercial-mail-dispatch-global',0))").catch(()=>{});}
  }finally{lock.release();}
  return stats;
}
