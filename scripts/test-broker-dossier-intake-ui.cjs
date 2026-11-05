const {JSDOM,VirtualConsole}=require('jsdom');
const esbuild=require('esbuild'),assert=require('node:assert/strict'),path=require('node:path');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const bundle=esbuild.buildSync({absWorkingDir:path.resolve(__dirname,'..'),entryPoints:['tests/fixtures/broker-dossier-intake-ui.tsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'}});
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div><script>'+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script></body></html>',{url:'https://qa.example.test',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.Response=Response;w.TextEncoder=TextEncoder;w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};w.HTMLElement.prototype.scrollIntoView=function(){};w.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});w.open=url=>{w.qaOpened=url;};}});
const w=dom.window,d=w.document,text=()=>d.body.textContent;
d.querySelectorAll("script").forEach(el=>el.remove());
const pause=()=>new Promise(r=>setTimeout(r,25));
async function waitFor(fn,label){for(let i=0;i<200;i++){if(fn())return;await pause();}throw Error(label+' '+text().slice(-3500)+' '+errors.join('\n'));}
function button(label){const b=[...d.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert(b,'Missing button '+label);return b;}
async function tab(label){const el=[...d.querySelectorAll('[role="tab"]')].find(el=>el.textContent.trim()===label);assert(el);el.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,button:0}));el.click();await pause();}
(async()=>{
 await waitFor(()=>text().includes('Activo · acceso confirmado'),'dossier summary and access');
 await tab('Documentos');assert(text().includes('identificacion-qa.pdf'));for(const title of ['Constancia de Situación Fiscal','Estado de cuenta']) {const section=[...d.querySelectorAll('section')].find(s=>s.querySelector('h3')?.textContent===title);assert(section);assert(section.textContent.includes('Pendiente de carga'));}
 const download=d.querySelector('a[href*="/documents/ine-qa/download"]');assert(download);assert(download.href.includes('/brokers/broker-qa/'));
 await tab('Convenios y firmas');await waitFor(()=>text().includes('Convenio formalizado'),'embedded legal evidence');
 button('Ver evidencia').click();await waitFor(()=>text().includes('CONVENIO HISTÓRICO EXACTO QA'),'exact signed agreement');
 button('Comprobante PDF').click();assert(w.qaOpened.endsWith('/acceptances/accept-qa/comprobante'));
 await tab('Actividad');assert(text().includes('Ingreso exitoso'));
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause();
 button('Formulario QA').click();await waitFor(()=>text().includes('Confirma el Aviso de Privacidad'),'public consent');
 assert(!d.querySelector('[data-testid="button-submit-client"]'));
 d.querySelector('[role="checkbox"]').click();await waitFor(()=>d.querySelector('[data-testid="button-submit-client"]'),'same advanced profile form');
 assert(text().includes('Completa tu información'));
 d.querySelector('[data-testid="button-submit-client"]').click();await waitFor(()=>Boolean(d.querySelector('[data-testid="prospect-profile-success"]')),'public profile submitted');
 const save=w.qaCalls.find(c=>c.method==='POST'&&c.path.includes('/api/public/prospect-completion/'));assert(save);assert.equal(save.body.acknowledgePrivacy,true);assert.equal(save.body.profile.firstName,'Prospecto QA');assert.equal(save.body.profile.phone,'5512345678');assert(!('brokerId' in save.body.profile));
 button('Enlace QA').click();await waitFor(()=>d.querySelector('[data-testid="prospect-completion-link"]'),'direct link button');
 d.querySelector('[data-testid="prospect-completion-link"]').click();await waitFor(()=>d.querySelector('input[aria-label="Enlace para completar información"]'),'private direct link');
 assert.equal(w.qaCalls.find(c=>c.path==='/api/commercial-resources/completion-links').body.clientId,'client-qa');
 assert(d.querySelector('input[aria-label="Enlace para completar información"]').value.startsWith('https://qa.example.test/completar-perfil/'));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: dossier tabs, confirmed access, personal document scope, embedded signed agreement and PDF, activity, public consent, full profile submit and existing-client invitation.');
})().then(()=>{w.close();process.exit(0)}).catch(error=>{console.error(error.stack);w.close();process.exit(1)});
