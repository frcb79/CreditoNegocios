const {JSDOM,VirtualConsole}=require('jsdom');
const esbuild=require('esbuild');const path=require('node:path');const assert=require('node:assert/strict');
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>console.error(e.message));
const bundle=esbuild.buildSync({absWorkingDir:path.resolve(__dirname,'..'),entryPoints:['tests/fixtures/broker-network-ui.tsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'}});
const html='<!doctype html><html><body><main id="root"></main><script>'+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
const dom=new JSDOM(html,{url:'https://qa.example.test',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(w){w.Response=Response;w.TextEncoder=TextEncoder;w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.HTMLElement.prototype.scrollIntoView=function(){};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});}});
const {document,MouseEvent}=dom.window;
dom.window.document.querySelectorAll("script").forEach(element=>element.remove());

const text=()=>document.body.textContent;
async function waitFor(fn,message){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error(message+'\n'+text().slice(-3000));}
async function click(testId){const el=document.querySelector(`[data-testid="${testId}"]`);assert(el,'Missing '+testId);el.click();await new Promise(r=>setTimeout(r,25));}
function button(label){return [...document.querySelectorAll('button')].find(e=>e.textContent.trim()===label);}
(async()=>{
 await waitFor(()=>text().includes('Master Registrado QA'),'network initial');
 assert(!document.querySelector('[data-testid="network-all"]'),'no redundant network filters');
 assert(!text().includes('Master Invitado QA'),'pending master hidden in registered network');
 const tab=[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent.includes('Invitaciones pendientes'));
 tab.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));tab.click();
 await waitFor(()=>document.querySelector('[data-testid="summary-invites-all"]'),'pending loaded');
 assert.equal(document.querySelectorAll('tbody tr').length,4);
 await click('summary-invites-overdue');assert.equal(document.querySelectorAll('tbody tr').length,2);assert(text().includes('Broker Antiguo QA'));assert(!text().includes('Broker Reciente QA'));
 await click('filter-invites-paused');assert.equal(document.querySelectorAll('tbody tr').length,1);assert(text().includes('Broker Pausado QA'));
 await click('filter-invites-all');assert.equal(document.querySelectorAll('tbody tr').length,4);
 const search=document.querySelector('input[placeholder="Buscar persona, correo, teléfono o Master"]');
 async function searchFor(value) {
   Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(search,value);
   search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
   await new Promise(r=>setTimeout(r,25));
 }
 await searchFor('Antiguo');assert.equal(document.querySelectorAll('tbody tr').length,1);
 await click('summary-invites-overdue');await searchFor('Invitado');
 assert.equal(document.querySelectorAll('tbody tr').length,0);
 assert(text().includes('No hay invitaciones con 15 días o más sin registro.'));
 await searchFor('');await click('filter-invites-all');
 button('Simular activación').click();await click('refresh-pending-invites');
 await waitFor(()=>document.querySelectorAll('tbody tr').length===3,'refresh removes activated');assert(text().includes('Lista actualizada'));
 await click('filter-invites-overdue');const row=[...document.querySelectorAll('tbody tr')].find(e=>e.textContent.includes('Broker Antiguo QA'));row.querySelector('button').click();
 await waitFor(()=>row.textContent.includes('Sin más correos'),'pause persists');
 await click('filter-invites-paused');assert.equal(document.querySelectorAll('tbody tr').length,2);
 await click('summary-invites-all');button('Simular fallo de consulta').click();await click('refresh-pending-invites');
 await waitFor(()=>text().includes('No se pudo consultar el seguimiento'),'error visible');await click('refresh-pending-invites');
 await waitFor(()=>document.querySelectorAll('tbody tr').length===3,'refresh recovers');
 console.log('PASS: registered network without redundant filters, pending status, clickable summary, overdue/paused/all filters, refresh after activation, pause persistence, error feedback and recovery.');
})().then(()=>{dom.window.close();process.exit(0);}).catch(e=>{console.error(e.stack);dom.window.close();process.exit(1);});
