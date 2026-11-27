// Browser regression for the actual compiled CSS, with synthetic content only.
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.resolve("dist/public");
const styles = fs.readdirSync(path.join(root,"assets")).filter(n=>n.endsWith(".css"));
assert(styles.length,"Expected compiled app CSS");
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/brand.css">${styles.map(n=>'<link rel="stylesheet" href="/assets/'+n+'">').join("")}</head><body>
<div class="cn-workspace min-h-screen flex"><aside id="sidebar" class="shrink-0" style="width:64px"></aside><div class="cn-workspace-content flex-1 flex flex-col min-w-0"><main class="p-3 sm:p-6 lg:p-8">
<div class="cn-kpi-grid grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4" id="grid">${Array.from({length:4},(_,i)=>'<div class="cn-card min-w-0 max-w-full rounded-lg border bg-card" data-card><div class="min-w-0 p-2.5 sm:p-4"><div class="flex items-start justify-between gap-1 sm:gap-3"><div class="flex-1 min-w-0"><p class="text-[10px] sm:text-[11px] font-medium" data-label>Volumen confirmado del periodo</p><p class="text-sm sm:text-xl font-bold font-mono tabular-nums cn-kpi-value break-words" data-value>$123,456,789.00 MXN</p></div><div class="hidden sm:flex w-9 h-9 shrink-0"></div></div></div></div>').join("")}</div>
<div class="cn-card min-w-0 max-w-full rounded-lg border bg-card mt-4"><div class="p-4"><div class="cn-pipeline-grid grid grid-cols-2 sm:grid-cols-5 gap-2">${Array.from({length:5},()=>'<div class="p-2.5 rounded-md border text-center"><p class="text-lg font-bold font-mono">123456</p><p class="text-[11px] break-words">Pendiente de documentación</p></div>').join("")}</div></div></div>
</main></div></div><div class="cn-public"><div class="cn-card" id="publicCard"><p>Contenido de la página pública</p></div></div></body></html>`;
const server=http.createServer((req,res)=>{
 if(req.url==="/"){res.setHeader("Content-Type","text/html");return res.end(fixture);}
 const f=path.resolve(root,"."+req.url);
 if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.statusCode=404;return res.end();}
 res.setHeader("Content-Type",f.endsWith(".css")?"text/css":f.endsWith(".woff2")?"font/woff2":"application/octet-stream");
 fs.createReadStream(f).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  for(const width of [360,390,768,1024,1280,1366,1440,1920]){
   await page.setViewportSize({width,height:768});
   await page.goto("http://127.0.0.1:"+server.address().port);
   for(const sidebar of width<1024?[0]:[64,256]){
    const got=await page.evaluate(async(sidebar)=>{
     document.querySelector("#sidebar").style.width=sidebar+"px";
     await document.fonts.load("400 14px Inter");
     await document.fonts.ready;
     const card=document.querySelector("[data-card]"),label=document.querySelector("[data-label]"),value=document.querySelector("[data-value]");
     const rect=e=>e.getBoundingClientRect();
     const clips=[...document.querySelectorAll("[data-card]")].filter(c=>[...c.querySelectorAll("p")].some(p=>{const r=rect(p),b=rect(c);return r.right>b.right+1||r.left<b.left-1||p.scrollWidth>p.clientWidth+1;})).length;
     return {clips,overflow:document.documentElement.scrollWidth-innerWidth,cardPadding:getComputedStyle(card).paddingLeft,cardDisplay:getComputedStyle(card).display,labelSize:getComputedStyle(label).fontSize,valueSize:getComputedStyle(value).fontSize,bodyFont:getComputedStyle(document.body).fontFamily,fontLoaded:[...document.fonts].some(f=>f.family==="Inter"&&f.status==="loaded"),publicPadding:getComputedStyle(document.querySelector("#publicCard")).paddingLeft};
    },sidebar);
    assert.equal(got.cardPadding,"0px",JSON.stringify(got));assert.equal(got.cardDisplay,"block");
    assert.equal(got.labelSize,width<640?"10px":"11px");assert.equal(got.valueSize,width<640?"14px":"20px");
    assert(got.bodyFont.includes("Inter")&&got.fontLoaded,JSON.stringify(got));
    assert.equal(got.publicPadding,width<=760?"24px":"28px");
    assert(got.overflow<=2&&got.clips===0,JSON.stringify({width,sidebar,...got}));
    console.log("PASS",width,sidebar,got.labelSize,got.valueSize);
   }
  }
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
