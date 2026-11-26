import {strict as assert} from "node:assert";
import {test} from "node:test";
import {summarizeCommercialMailPlan} from "../server/commercialMailPreflight";
test("revalidates eligibility and never treats overdue messages as ready to dispatch",()=>{
 const jobs=[{userId:"a",scheduledFor:"2026-12-01T12:00:00Z"},{userId:"a",scheduledFor:"2026-12-04T12:00:00Z"},{userId:"b",scheduledFor:"2026-12-04T12:00:00Z"}];
 const now=new Date("2026-12-02T00:00:00Z");
 const result=summarizeCommercialMailPlan("pending_registration","planned",jobs,new Set(["a"]),now);
 assert.equal(result.recipientCount,2);assert.equal(result.eligibleRecipients,1);assert.equal(result.excludedRecipients,1);assert.equal(result.overdueJobs,1);assert.equal(result.eligibleFutureJobs,1);assert.equal(result.dispatchEnabled,false);
 assert.ok(result.blockers.some(x=>x.includes("invitaciones")));
 const activation=summarizeCommercialMailPlan("registered_no_requests","cancelled",jobs,new Set(),now);
 assert.equal(activation.eligibleFutureJobs,0);assert.equal(activation.excludedRecipients,2);assert.ok(activation.blockers.some(x=>x.includes("cancelada")));
});
