#!/usr/bin/env node
"use strict";
// Public, unauthenticated, read-only release probe. Never creates accounts,
// financial records, OTPs or files; guarded write routes must reject first.
const base=(process.env.STAGING_PUBLIC_BASE_URL||
 "https://creditonegocios-staging.up.railway.app").replace(/\/+$/,"");
const cases=[
 {name:"health + PostgreSQL",method:"GET",path:"/api/health",ok:[200],validate:j=>j?.status==="ok"&&j?.services?.database==="ok"&&(j?.services?.schema===undefined||j?.services?.schema==="ok")},
 {name:"public terms",method:"GET",path:"/legal/terminos",ok:[200,301,302,307,308]},
 {name:"public privacy",method:"GET",path:"/legal/aviso",ok:[200,301,302,307,308]},
 {name:"anon user profile denied",method:"GET",path:"/api/auth/user",ok:[401,403]},
 {name:"anon submissions denied",method:"GET",path:"/api/credit-submission-targets",ok:[401,403]},
 {name:"anon audit denied",method:"GET",path:"/api/commercial/audit-logs",ok:[401,403]},
 {name:"anon commercial-contact denied",method:"PATCH",path:"/api/credit-submission-targets/qa-does-not-exist/start-commercial-contact",ok:[401,403]},
 {name:"anon institution-proposal denied",method:"POST",path:"/api/credit-submission-targets/qa-does-not-exist/institution-proposal",ok:[401,403]},
 {name:"anon proposal-file denied",method:"GET",path:"/api/credit-submission-targets/qa-does-not-exist/proposal-document",ok:[401,403]},
];
(async()=>{
 console.log("Staging public/auth smoke; this does NOT prove deployed SHA or authenticated E2E.");
 if(!/^https:\/\/[a-z0-9.-]+\.up\.railway\.app$/i.test(base))throw new Error("Use an allowlisted Railway Staging HTTPS origin");
 let fails=0;
 for(const item of cases){
   try{
     const response=await fetch(base+item.path,{method:item.method,redirect:"manual",
       headers:{"Accept":"application/json","User-Agent":"CreditoNegocios-Prelaunch-Public-Smoke/1.0"},
       signal:AbortSignal.timeout(15000)});
     const raw=await response.text();
     let json=null;try{json=JSON.parse(raw)}catch{}
     const valid=item.ok.includes(response.status)&&(!item.validate||item.validate(json));
     if(item.name==="health + PostgreSQL"&&json?.services?.schema===undefined)
       console.log("NOTE: Staging has previous health contract; schema readiness check begins after updated SHA deploy.");
     console.log((valid?"PASS":"FAIL")+" "+item.name+" HTTP "+response.status);
     if(!valid)fails++;
   }catch(e){
     fails++;console.error("FAIL "+item.name+": "+String(e.message||e).slice(0,220));
   }
 }
 if(fails)throw new Error("Public smoke: "+fails+" failing checks");
 console.log("PASS all "+cases.length+" anonymous probes; no data were created.");
})().catch(e=>{console.error(e.message);process.exitCode=1});
