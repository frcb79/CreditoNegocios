// Real local app UI, synthetic fixtures; no production session or data.
const { chromium } = require('@playwright/test');
const { fork } = require('node:child_process');
const path = require('node:path');
const user = { id:'demo-broker', firstName:'Broker', lastName:'Demo', role:'broker', email:'broker@example.test', isActive:true };
const clients = ['Empresa Demo Norte','Empresa Demo Centro','Empresa Demo Sur','Empresa Demo Occidente'].map((businessName,i)=>({id:`demo-${i}`,type:'persona_moral',businessName,brokerId:user.id}));
const now = new Date().toISOString();
const credits = clients.map((client,i)=>({id:`DEMO-00${i+1}`,clientId:client.id,client,brokerId:user.id,broker:user,amount:['800000','450000','1200000','350000'][i],status:['approved','active','dispersed','in_review'][i],createdAt:now,term:24,financialInstitution:{name:'Institución de ejemplo'},productTemplate:{name:['Crédito Simple','Arrendamiento','Crédito Revolvente','Factoraje'][i]}}));
const fixtures = {'/api/auth/user':user,'/api/clients':clients,'/api/credits':credits};
(async()=>{
 const server=fork(path.join(__dirname,'preview-public-web.cjs'),[],{silent:true});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject)});
 const browser=await chromium.launch({executablePath:process.env.CN_CHROMIUM_PATH,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:940}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   const icon=url.pathname.match(/^\/ajax\/libs\/font-awesome\/6\.5\.1\/(css\/all\.min\.css|webfonts\/fa-[a-z0-9-]+\.(?:woff2|ttf))$/);
   if(url.hostname==='cdnjs.cloudflare.com'&&icon&&process.env.CN_FONT_AWESOME_PATH){const file=path.join(process.env.CN_FONT_AWESOME_PATH,icon[1]);return route.fulfill({path:file,contentType:file.endsWith('.css')?'text/css':'font/woff2',headers:{'access-control-allow-origin':'*'}})}
   if(url.hostname!=='127.0.0.1')return route.abort();
   if(url.pathname.startsWith('/api/')){if(route.request().method()!=='GET')throw new Error('Mutation blocked');return route.fulfill({json:fixtures[url.pathname]??[]})}
   return route.continue();
  });
  await page.goto('http://127.0.0.1:4173/creditos');await page.getByTestId('item-DEMO-001').waitFor();await page.evaluate(()=>document.fonts.ready);await page.getByTestId('header-title').click();
  const box=await page.locator('header').boundingBox();if(box.x<200||box.width!==1184)throw new Error('Review capture boundary');
  await page.screenshot({path:path.join(__dirname,'../client/public/platform/operaciones.png'),clip:{x:box.x+16,y:0,width:1152,height:940}});
  if(errors.length)throw new Error(errors.join('\n'));console.log('Operations captured: real workspace only, synthetic data.');
 } finally {await browser.close();server.kill()}
})();
