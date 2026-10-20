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
 {name:"anon credits denied",method:"GET",path:"/api/credits",ok:[401,403]},
 {name:"anon client credits denied",method:"GET",path:"/api/credits/client/qa-unknown-client",ok:[401,403]},
 {name:"anon documents denied",method:"GET",path:"/api/documents",ok:[401,403]},
 {name:"anon document file denied",method:"GET",path:"/api/documents/qa-unknown-document/download",ok:[401,403]},
 {name:"anon commercial-contact denied",method:"PATCH",path:"/api/credit-submission-targets/qa-does-not-exist/start-commercial-contact",ok:[401,403]},
 {name:"anon institution-proposal denied",method:"POST",path:"/api/credit-submission-targets/qa-does-not-exist/institution-proposal",ok:[401,403]},
 {name:"anon proposal-file denied",method:"GET",path:"/api/credit-submission-targets/qa-does-not-exist/proposal-document",ok:[401,403]},
];
// Use Node's HTTPS upgrade mechanism: no credential, no user, no writes.
// The spoofed ?userId= value must NEVER authorize a WebSocket subscription.
async function verifyUnauthenticatedWebSocket(name, path, origin) {
 const https = require("node:https");
 const { randomBytes } = require("node:crypto");
 const url = new URL(path, base);
 const key = randomBytes(16).toString("base64");
 return new Promise((resolve, reject) => {
   const req = https.request({
     hostname: url.hostname, port: url.port || 443,
     method: "GET", path: url.pathname + url.search,
     headers: {
       Host: url.host, Origin: origin || base,
       Connection: "Upgrade", Upgrade: "websocket",
       "Sec-WebSocket-Key": key, "Sec-WebSocket-Version": "13",
       "User-Agent": "CreditoNegocios-Prelaunch-WS-Probe/1.0"
     }, timeout: 15000,
   }, response => {
     response.resume();
     const valid = response.statusCode === 401 || response.statusCode === 403;
     console.log((valid ? "PASS" : "FAIL")+" "+name+" HTTP "+response.statusCode);
     resolve(valid);
   });
   req.on("upgrade", (_response, socket) => {
     socket.destroy();
     console.log("FAIL "+name+" UPGRADED WITHOUT SESSION");
     resolve(false);
   });
   req.on("timeout", () => req.destroy(new Error("WebSocket probe timed out")));
   req.on("error", reject);
   req.end();
 });
}

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
 // Negative WebSocket handshake probes against the ACTUAL Staging service.
 const websocketChecks = [
   ["unauthenticated ws identity-spoof denied", "/ws?userId=user-super-admin", base],
   ["unauthenticated ws without identity denied", "/ws", base],
   ["foreign-origin ws identity-spoof denied", "/ws?userId=user-super-admin", "https://untrusted.example"],
 ];
 for (const [name, path, origin] of websocketChecks) {
   try { if (!(await verifyUnauthenticatedWebSocket(name, path, origin))) fails++; }
   catch (err) { fails++; console.error("FAIL "+name+": "+String(err.message||err).slice(0,220)); }
 }
 if(fails)throw new Error("Public smoke: "+fails+" failing checks");
 console.log("PASS all "+(cases.length+websocketChecks.length)+" anonymous HTTP+WS probes; no data were created.");
})().catch(e=>{console.error(e.message);process.exitCode=1});
