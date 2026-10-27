import {test,expect,type Page} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',r=>r.fulfill({status:401,json:{message:'Local QA'}}));
});
for(const width of [360,390,768,1440])for(const [url,name] of [['/landing.html','principal'],['/brokers','brokers']]){
 test(`${name} layout and navigation ${width}`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:960});await page.goto(url);await expect(page.locator('h1')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(await page.evaluate(()=>document.fonts.check('600 16px Inter'))).toBe(true);
  expect(await page.locator('a[href^="#"]').evaluateAll(links=>links.filter(a=>!document.getElementById(a.getAttribute('href')!.slice(1))).map(a=>a.getAttribute('href')))).toEqual([]);
  if(width<=960){const b=page.getByRole('button',{name:'Menú',exact:true});await b.click();await expect(b).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Escape');await expect(b).toHaveAttribute('aria-expanded','false');}
  await page.screenshot({path:info.outputPath(`${name}-${width}.png`),fullPage:true});expect(errors).toEqual([]);
 });
}
async function details(page:Page,prefix:string){await page.locator(`#${prefix}-name`).fill('Persona Demo');await page.locator(`#${prefix}-phone`).fill('5500000000');await page.locator(`#${prefix}-email`).fill('demo@example.test')}
test('principal keeps product selection and contact API contract',async({page})=>{
 let payload:any;let calls=0;await page.route('**/api/public/website-leads',r=>{calls++;payload=r.request().postDataJSON();return r.fulfill({status:201,json:{ok:true}})});
 await page.goto('/landing.html');await page.getByRole('link',{name:/Cobrar antes tus facturas/}).click();await expect(page.locator('#lead-solution')).toHaveValue('Factoraje');await details(page,'lead');await page.locator('#lead-amount').selectOption('Por definir');await page.getByRole('button',{name:/Solicitar orientación/}).click();await expect(page.getByRole('status')).toContainText('Recibimos');expect(payload).toMatchObject({email:'demo@example.test',solutionType:'Factoraje',amountRange:'Por definir'});expect(calls).toBe(1);
});
test('principal retry keeps contact data',async({page})=>{
 await page.route('**/api/public/website-leads',r=>r.fulfill({status:500,json:{message:'Failed'}}));await page.goto('/landing.html');await details(page,'lead');await page.locator('#lead-solution').selectOption('No estoy seguro');await page.locator('#lead-amount').selectOption('Por definir');await page.getByRole('button',{name:/Solicitar orientación/}).click();await expect(page.getByRole('status')).toContainText('Conservamos tus datos');await expect(page.locator('#lead-email')).toHaveValue('demo@example.test');
});
for(const profile of ['pro','referidor'])test(`broker ${profile} submits expected payload and preserves activation semantics`,async({page})=>{
 let payload:any;await page.route('**/api/public/broker-leads',r=>{payload=r.request().postDataJSON();return r.fulfill({status:201,json:{ok:true}})});await page.goto('/brokers');await page.locator(`input[value="${profile}"]`).check();await details(page,'broker');if(profile==='pro')await page.locator('#broker-type').selectOption('pyme');else await expect(page.locator('#broker-type')).toHaveCount(0);await page.getByRole('button',{name:/Solicitar incorporación/}).click();await expect(page.getByRole('status').filter({hasText:'Recibimos'})).toContainText('todavía no está activada');expect(payload).toMatchObject({email:'demo@example.test',brokerProfile:profile,brokerType:profile==='pro'?'pyme':'mixto'});
});
test('broker error retains details and CTA selects referidor',async({page})=>{
 await page.route('**/api/public/broker-leads',r=>r.fulfill({status:429,json:{message:'Limited'}}));await page.goto('/brokers');await page.getByRole('link',{name:/Quiero referir/}).click();await expect(page.locator('input[value=referidor]')).toBeChecked();await details(page,'broker');await page.getByRole('button',{name:/Solicitar incorporación/}).click();await expect(page.getByRole('alert')).toContainText('Conservamos tus datos');await expect(page.locator('#broker-email')).toHaveValue('demo@example.test');
});
test('five real screenshots, modal Escape and focus restoration',async({page})=>{
 await page.goto('/brokers');for(const name of ['Seguimiento','Clientes','Operaciones','Documentos','Comisiones']){await page.getByRole('button',{name,exact:true}).click();await expect.poll(()=>page.locator('#demo-panel img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(1152)}
 const trigger=page.getByRole('button',{name:'Ampliar pantalla de comisiones'});await trigger.click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(trigger).toBeFocused();
});
test('mobile gallery can expand and scroll the workspace',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/brokers');await page.getByRole('button',{name:'Operaciones',exact:true}).click();await page.getByRole('button',{name:'Ampliar pantalla de operaciones'}).click();expect(await page.locator('.cn-screen-scroll').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);await page.getByRole('button',{name:'Cerrar',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('public auth and legal keep shared style',async({page})=>{
 await page.route('**/api/legal/aviso',r=>r.fulfill({json:{version:'1',content:'Texto QA',effectiveAt:'2026-10-01'}}));for(const route of ['/','/reset-password','/legal/aviso']){await page.goto(route);await expect(page.locator('.cn-public')).toBeVisible();expect(await page.locator('.cn-public').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Inter')}
});
test('recovered hero alignment and footer navigation remain intact',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/brokers');const left=await page.locator('.cn-broker-hero-grid > div:first-child > .cn-eyebrow').boundingBox(),right=await page.locator('.cn-platform-showcase').boundingBox();expect(Math.abs(left!.y-right!.y)).toBeLessThanOrEqual(1);await expect(page.locator('.cn-footer-top .cn-footer-links a')).toHaveText(['Acceder a la plataforma','WhatsApp','info@creditonegocios.com.mx']);
});
