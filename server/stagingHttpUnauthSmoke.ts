/**
 * Read-only unauthenticated HTTP checks via staging-local loopback.
 * Does not create sessions, users, clients, offers, files or any operation.
 */
export async function runStagingUnauthenticatedHttpSmoke(port:number):Promise<void>{
  if(process.env.STAGING_AUDIT_HTTP!=="true")return;
  if(process.env.RAILWAY_ENVIRONMENT_NAME!=="staging" ||
     process.env.RAILWAY_ENVIRONMENT_ID!=="e3134695-aaec-41e2-8622-41e3701ed985")return;
  const checks:Array<[string,number]>=[
    ["/api/health",200],
    ["/api/auth/user",401],
    ["/api/clients",401],
    ["/api/credits",401],
    ["/api/documents",401],
    ["/api/users",401],
    ["/api/matching/preview",401],
    ["/api/credit-submissions/staging-no-access-id/matching",401]
  ];
  const results:Array<{path:string;expected:number;status:number;pass:boolean}>=[];
  for(const [route,expected] of checks) {
    try {
      const response=await fetch("http://127.0.0.1:"+port+route,{
        method:"GET",redirect:"manual",headers:{"accept":"application/json"},
        signal:AbortSignal.timeout(5000)
      });
      results.push({path:route,expected,status:response.status,pass:response.status===expected});
      await response.body?.cancel();
    }catch{
      results.push({path:route,expected,status:0,pass:false});
    }
  }
  console.info("[STAGING-HTTP-UNAUTH-QA] "+JSON.stringify({
    tested:results.length,passed:results.filter(r=>r.pass).length,
    results,allPassed:results.every(r=>r.pass)
  }));
}
