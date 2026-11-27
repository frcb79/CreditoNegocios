import {strict as assert} from "node:assert";
import {test} from "node:test";
import {PGlite} from "@electric-sql/pglite";
import {commercialPlanJobs,commercialBatchDate,commercialSendWindow} from "../shared/commercialMailSchedule";
import {COMMERCIAL_MAIL_PLAN_SCHEMA_SQL,INSERT_COMMERCIAL_MAIL_PLAN_JOBS_SQL,LIST_COMMERCIAL_MAIL_PLANS_SQL} from "../server/commercialMailPlanSchema";
import {COMMERCIAL_MAIL_DISPATCH_SCHEMA_SQL,DUE_COMMERCIAL_MAIL_SQL,CLAIM_COMMERCIAL_MAIL_SQL,EXPIRE_COMMERCIAL_MAIL_SQL} from "../server/commercialMailDispatchSchema";
test("campaign plans retain immutable revision, unique jobs and cancelled history",async()=>{
  const pg=await PGlite.create();
  try{
    await pg.exec(`CREATE TABLE public.users(id varchar PRIMARY KEY);
      INSERT INTO public.users VALUES('admin'),('a'),('b');
      CREATE TABLE public.commercial_mail_draft_revisions(draft_id varchar(36),revision int,content jsonb,PRIMARY KEY(draft_id,revision));
      INSERT INTO public.commercial_mail_draft_revisions VALUES('draft',1,'{"name":"Test","audience":"registered_no_requests"}'),('draft',2,'{"name":"New","audience":"newsletter"}');`);
    await pg.exec(COMMERCIAL_MAIL_PLAN_SCHEMA_SQL);await pg.exec(COMMERCIAL_MAIL_PLAN_SCHEMA_SQL);await pg.exec(COMMERCIAL_MAIL_DISPATCH_SCHEMA_SQL);await pg.exec(COMMERCIAL_MAIL_DISPATCH_SCHEMA_SQL);
    const create=async(id:string)=>pg.query("INSERT INTO public.commercial_mail_plans(id,draft_id,revision,starts_at,created_by) VALUES($1,'draft',1,'2026-12-01T15:00:00Z','admin')",[id]);
    await create("p1");
    const jobs=commercialPlanJobs(new Date("2026-12-01T15:00:00Z"),["a","b"],[1,4,8,14],false);
    await pg.query(INSERT_COMMERCIAL_MAIL_PLAN_JOBS_SQL,["p1",jobs.map(j=>j.userId),jobs.map(j=>j.day),jobs.map(j=>j.scheduledFor)]);
    await assert.rejects(create("p2"));
    await assert.rejects(pg.query(INSERT_COMMERCIAL_MAIL_PLAN_JOBS_SQL,["p1",["a"],[1],["2026-12-01T15:00:00Z"]]));
    const list=await pg.query<any>(LIST_COMMERCIAL_MAIL_PLANS_SQL);assert.equal(list.rows[0].name,"Test");assert.equal(list.rows[0].jobCount,8);assert.equal(list.rows[0].recipientCount,2);
    const date=await pg.query<any>("SELECT scheduled_for FROM public.commercial_mail_plan_jobs WHERE plan_id='p1' AND user_id='a' AND step_day=14");assert.equal(new Date(date.rows[0].scheduled_for).toISOString(),"2026-12-14T15:00:00.000Z");
    await pg.exec("UPDATE public.commercial_mail_plan_jobs SET scheduled_for=now()-interval '1 minute' WHERE plan_id='p1' AND step_day=1");
    assert.equal((await pg.query(DUE_COMMERCIAL_MAIL_SQL)).rows.length,0);
    await pg.exec("INSERT INTO public.commercial_mail_approvals(plan_id,approved_by,recipient_hashes) VALUES('p1','admin','{}')");
    assert.equal((await pg.query(DUE_COMMERCIAL_MAIL_SQL)).rows.length,2);
    assert.equal((await pg.query(CLAIM_COMMERCIAL_MAIL_SQL,["p1","a",1,"a@example.test"])).rows.length,1);
    assert.equal((await pg.query(CLAIM_COMMERCIAL_MAIL_SQL,["p1","a",1,"a@example.test"])).rows.length,0);
    await pg.exec("UPDATE public.commercial_mail_plan_jobs SET scheduled_for=now()-interval '25 hours' WHERE plan_id='p1' AND step_day=4");
    await pg.exec(EXPIRE_COMMERCIAL_MAIL_SQL);
    assert.equal((await pg.query("SELECT 1 FROM public.commercial_mail_dispatches WHERE status='expired'")).rows.length,2);
    await pg.exec("UPDATE public.commercial_mail_plans SET state='cancelled',cancelled_at=now(),cancelled_by='admin' WHERE id='p1'");
    await create("p2");assert.equal((await pg.query<any>(LIST_COMMERCIAL_MAIL_PLANS_SQL)).rows[0].state,"cancelled");
    assert.equal((await pg.query<any>("SELECT count(*)::int AS n FROM public.commercial_mail_plan_jobs")).rows[0].n,8);
  }finally{await pg.close();}
});

test("39 recipients automatically split into four batches; weekends roll forward",()=>{
 const ids=Array.from({length:39},(_,i)=>"u"+i);
 const jobs=commercialPlanJobs(new Date("2026-12-01T15:00:00Z"),ids,[25,29,33,39],true);
 const first=jobs.filter(j=>j.day===25);
 assert.deepEqual([0,10,20,30].map(i=>first[i].scheduledFor),["2026-12-01T15:00:00.000Z","2026-12-01T15:30:00.000Z","2026-12-01T16:00:00.000Z","2026-12-01T16:30:00.000Z"]);
 assert.equal(commercialBatchDate(new Date("2026-12-04T23:30:00Z"),0,1).toISOString(),"2026-12-07T15:00:00.000Z");
 assert.equal(commercialSendWindow(new Date("2026-12-05T15:00:00Z")),false);
 assert.equal(jobs.length,156);
});
