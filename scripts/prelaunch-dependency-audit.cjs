#!/usr/bin/env node
"use strict";
// Safe summary of an npm audit --omit=dev --json file generated inside CI.
// A critical runtime advisory is a NO-GO gate, even when functional CI passes.
const fs=require("node:fs");
const input=process.argv[2]||"audit-production.json";
const obj=JSON.parse(fs.readFileSync(input,"utf8"));
const v=obj.vulnerabilities||{};
const groups={critical:[],high:[],moderate:[],low:[]};
for(const [name,detail] of Object.entries(v)){
  const level=detail?.severity||"unknown";
  if(groups[level])groups[level].push({name,direct:Boolean(detail.isDirect),
     fixAvailable:detail.fixAvailable===false?"none":detail.fixAvailable===true?"auto":"update"});
}
const summary=obj.metadata?.vulnerabilities||{};
console.log("PRODUCTION-ONLY npm audit (omit=dev) | counts: "+JSON.stringify(summary));
for(const level of ["critical","high","moderate","low"]){
 for(const item of groups[level].slice(0,40))console.log("["+level.toUpperCase()+"] "+item.name+
    (item.direct?" direct":" transitive")+"; fix="+item.fixAvailable);
}
if(obj.error){console.error("Audit scanner error: "+String(obj.error.code||obj.error.message));process.exitCode=2;}
else if(groups.critical.length>0){console.error("NO-GO: runtime dependencies include CRITICAL advisories");process.exitCode=1;}
else console.log("No critical production-only advisories. Other severities still require review.");
