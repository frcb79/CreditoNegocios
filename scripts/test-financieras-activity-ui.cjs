const {JSDOM,VirtualConsole}=require('jsdom');const esbuild=require('esbuild');const path=require('node:path');const assert=require('node:assert/strict');
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const bundle=esbuild.buildSync({absWorkingDir:path.resolve(__dirname,'..'),entryPoints:['tests/fixtures/financieras-activity-ui.tsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'}});
const dom=new JSDOM('<!doctype html><html><body><main id="root"></main><script>'+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script></body></html>',{url:'https://qa.example.test',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.Response=Response;w.TextEncoder=TextEncoder;w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.HTMLElement.prototype.scrollIntoView=function(){};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});}});
const w=dom.window,d=w.document;
dom.window.document.querySelectorAll("script").forEach(element=>element.remove());
const text=()=>d.body.textContent;const pause=()=>new Promise(r=>setTimeout(r,35));
const findButton=label=>[...d.querySelectorAll('button')].find(e=>e.textContent.trim()===label);
async function waitFor(fn,label){for(let i=0;i<300;i++){if(fn())return;await pause();}throw Error(label+' '+text().slice(-2500)+' ERRORS '+errors.join('\n'));}
async function clickId(id){const e=d.querySelector(`[data-testid="${id}"]`);assert(e,'Missing '+id);e.click();await pause();}
async function tab(id){const e=d.querySelector(`[data-testid="${id}"]`);e.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,button:0}));e.click();await pause();}
async function input(e,value){Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();}
(async()=>{
 await waitFor(()=>text().includes('TIIE + 8 puntos'),'import source loaded');assert(text().includes('2% al cliente'));
 await tab('tab-elegibilidad');assert(text().includes('Sin quitas'));assert(text().includes('Obligado con inmueble'));assert(text().includes('1800000'));
 assert([...d.querySelectorAll('input')].some(e=>e.value==='24'));assert([...d.querySelectorAll('input')].some(e=>e.value==='150000'));
 assert(text().includes('Conciliar antigüedad por perfil'));
 await input(d.querySelector('input[aria-label="Antigüedad confirmada persona_moral"]'),'24');
 await input(d.querySelector('input[aria-label="Antigüedad confirmada fisica_empresarial"]'),'36');
 await input(d.querySelector('[data-testid="age-review-reason"]'),'Cotejado con la financiera QA');
 await clickId('age-review-confirm');
 await tab('tab-documentos');
 const label=[...d.querySelectorAll('label')].find(e=>e.textContent.includes('Constancia de Situación Fiscal'));assert(label);
 const cb=label.querySelector('[role="checkbox"]');cb.click();await pause();assert.equal(cb.getAttribute('aria-checked'),'true');
 cb.click();await pause();assert.equal(cb.getAttribute('aria-checked'),'false');
 label.click();await pause();assert.equal(cb.getAttribute('aria-checked'),'true');
 assert(text().includes('Documentos Solicitados (2)'));
 const custom=d.querySelector('input[placeholder="Ej. Estados Financieros Auditados 2025"]');await input(custom,'Documento adicional QA');findButton('Agregar').click();await pause();assert(text().includes('Documentos Solicitados (3)'));
 await clickId('button-open-publish-from-editor');await waitFor(()=>text().includes('Revisión posterior a guardado'),'save before publish');assert(w.qaOpenedPreviewAfterPut);
 const save=w.qaCalls.find(c=>c.method==='PUT');assert(!save.body.conditions.commissionRates,'unchanged commissions omitted');assert.equal(JSON.stringify(save.body.businessAgeReview.monthsByProfile),JSON.stringify({persona_moral:24,fisica_empresarial:36}));assert.equal(save.body.variablesConfiguration.keep,'preservado');assert(save.body.requiredDocuments.includes('Documento adicional QA'));
 findButton('Abrir lote QA').click();await waitFor(()=>text().includes('1 ofertas listas'),'batch preview');assert(text().includes('1 bloqueadas'));assert(text().includes('Falta monto'));assert(text().includes('Antigüedad mínima (meses): 36'));assert(text().includes('Sin quitas'));assert(text().includes('Documento adicional QA'));
 const submit=d.querySelector('[data-testid="batch-publish-submit"]');assert(submit.disabled);await input(d.querySelector('[data-testid="batch-publish-reason"]'),'Revisión conjunta QA');await clickId('batch-publish-confirm');assert(!submit.disabled);submit.click();submit.click();await waitFor(()=>text().includes('Publicada'),'batch result');
 const publications=w.qaCalls.filter(c=>c.url.endsWith('/publish')&&c.method==='POST');assert.equal(publications.length,1);assert.equal(publications[0].body.expectedVersionHash,'a'.repeat(64));assert(!publications[0].url.includes('blocked'));
 findButton('Cerrar').click();await pause();findButton('Abrir individual QA').click();await waitFor(()=>text().includes('Elegibilidad y documentación'),'individual requirements');assert(text().includes('Antigüedad mínima (meses): 36'));assert(text().includes('Documento adicional QA'));assert(text().includes('Sin quitas'));assert(!text().includes('Matching Inactivo'));findButton('Cancelar').click();await pause();findButton('Abrir auditoría QA').click();await waitFor(()=>text().includes('Admin Acceso QA'),'audit login');assert(text().includes('Inicio de sesión'));
 findButton('Cargar eventos anteriores').click();await waitFor(()=>text().includes('Broker Registrado QA'),'older audit records');assert(text().includes('Registro por invitación'));
 await input(d.querySelector('[data-testid="activity-search"]'),'Broker Registrado');assert(!text().includes('Admin Acceso QA'));assert(text().includes('Broker Registrado QA'));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: imported conditions/eligibility, document checkbox and label toggles, custom documents, preserve commissions and variables, save before review, confirmed batch excludes blocked drafts, audit login/registration/pagination/search.');
})().then(()=>{w.close();process.exit(0)}).catch(e=>{console.error(e.stack);w.close();process.exit(1)});
