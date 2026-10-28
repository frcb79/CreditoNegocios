const {JSDOM,VirtualConsole}=require('jsdom');const esbuild=require('esbuild');const path=require('node:path');const assert=require('node:assert/strict');
const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const bundle=esbuild.buildSync({absWorkingDir:path.resolve(__dirname,'..'),entryPoints:['tests/fixtures/matching-unified-ui.tsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'}});
const dom=new JSDOM('<!doctype html><html><body><main id="root"></main><script>'+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script></body></html>',{url:'https://qa.example.test',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.Response=Response;w.TextEncoder=TextEncoder;w.HTMLElement.prototype.hasPointerCapture=function(){return false};w.HTMLElement.prototype.setPointerCapture=function(){};w.HTMLElement.prototype.releasePointerCapture=function(){};w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.HTMLElement.prototype.scrollIntoView=function(){};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});}});
const w=dom.window,d=w.document;
dom.window.document.querySelectorAll("script").forEach(element=>element.remove());
const text=()=>d.body.textContent;const pause=()=>new Promise(r=>setTimeout(r,35));
const findButton=label=>[...d.querySelectorAll('button')].find(e=>e.textContent.trim()===label);
async function waitFor(fn,label){for(let i=0;i<300;i++){if(fn())return;await pause();}throw Error(label+' '+text().slice(-2500)+' ERRORS '+errors.join('\n'));}
async function clickId(id){const e=d.querySelector(`[data-testid="${id}"]`);assert(e,'Missing '+id);e.click();await pause();}
async function tab(id){const e=d.querySelector(`[data-testid="${id}"]`);e.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,button:0}));e.click();await pause();}
async function input(e,value){Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();}
(async()=>{
 await waitFor(()=>d.querySelector('[data-testid="published-offer-comparison"]'),'comparison loaded');
 const compare=d.querySelector('[data-testid="published-offer-comparison"]');
 assert(compare.textContent.includes('Oferta valida'));assert(compare.textContent.includes('Oferta rechazada'));assert(!compare.textContent.includes('Oferta pendiente'));assert(compare.textContent.includes('v2'));
 await waitFor(()=>d.querySelector('[data-testid="metric-total-evaluated"]'),'saved request matching');
 assert.equal(d.querySelector('[data-testid="metric-total-evaluated"]').textContent.trim(),'3');
 assert.equal(d.querySelector('[data-testid="metric-not-compatible-count"]').textContent.trim(),'1');
 assert(w.matchingCalls.some(url=>url.startsWith('/api/matching/preview?')));assert(w.matchingCalls.includes('/api/credit-submissions/r1/matching'));
 findButton('Abrir solicitud QA').click();await waitFor(()=>d.querySelector('[data-testid="select-product-template"]'),'request form');
 const product=d.querySelector('[data-testid="select-product-template"]');product.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await pause();
 await waitFor(()=>[...d.querySelectorAll('[role="option"]')].length,'product options');
 const option=[...d.querySelectorAll('[role="option"]')][0];option.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));option.click();await pause();
 const amount=d.querySelector('input[data-testid="input-requested-amount"]') || d.querySelector('input[placeholder="0"]');assert(amount,'amount input');await input(amount,'100000');
 await waitFor(()=>text().includes('Oferta valida'),'preview used by request form');assert(text().includes('Información Insuficiente'));
 const calls=w.matchingCalls.filter(url=>url.startsWith('/api/matching/preview?'));assert(calls.length>=2);assert(!w.matchingCalls.includes('/api/institution-products'));
 findButton('Simular fallo QA').click();await waitFor(()=>text().includes('No se pudo consultar el matching'),'request error');assert(!text().includes('Oferta valida'));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: per-offer comparison and saved requests use the published API; multiple offers/versions preserved; new-request preview shares results; failed requests never fall back to legacy green scores.');
})().then(()=>{w.close();process.exit(0)}).catch(e=>{console.error(e.stack);w.close();process.exit(1)});
