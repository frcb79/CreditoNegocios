import OfferPublishModal from "../../client/src/components/AdminOffers/OfferPublishModal";
import { getOfferAgePolicy } from "../../shared/offerAgePolicy";
// Fictitious, isolated component integration fixture. Every request is mocked.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import OfferDraftEditorModal from '../../client/src/components/AdminOffers/OfferDraftEditorModal';
import BatchOfferPublishModal from '../../client/src/components/AdminOffers/BatchOfferPublishModal';
import AdministrativeActivity from '../../client/src/components/AdministrativeActivity';
import {Toaster} from '../../client/src/components/ui/toaster';
const offer:any={id:'offer-qa',name:'Oferta QA',institutionId:'fin-qa',status:'draft',productType:'credito_simple'};
const draft:any={id:'v1',versionNumber:1,versionHash:'a'.repeat(64),conditions:{minAmount:100000,maxAmount:500000,maxTermMonths:36,rateSource:'TIIE + 8 puntos',clientOpeningSource:'2% al cliente',sourceTechnicalFields:{'Nota fuente':'No perder información'},commissionRates:{financiera:{apertura:4,sobretasa:1,renovacion:2},masterBroker:{apertura:2},broker:{apertura:1}}},requirements:{targetProfiles:['persona_moral','fisica_empresarial'],businessAgeSource:'2-3 años',minMonthsInBusiness:24,minMonthlyIncome:150000,minAnnualIncome:1800000,bureauPolicySource:'Sin quitas',guarantee:'Obligado con inmueble'},requiredDocuments:['Documento del maestro'],variablesConfiguration:{keep:'preservado'},changeReason:'Revisión QA'};
const reply=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
(window as any).qaCalls=[];
window.fetch=async(input:any,init?:RequestInit)=>{
 const url=String(input),method=init?.method||'GET';
 const body=init?.body?JSON.parse(String(init.body)):null;
 (window as any).qaCalls.push({url,method,body});
 if(url.endsWith('/draft')){if(method==='PUT'){Object.assign(draft,{conditions:{...draft.conditions,...body.conditions},requirements:{...draft.requirements,...body.requirements},requiredDocuments:body.requiredDocuments,variablesConfiguration:body.variablesConfiguration});if(body.businessAgeReview)draft.requirements.businessAgeResolution={...body.businessAgeReview,basis:getOfferAgePolicy(draft.conditions,draft.requirements).basis,reviewedBy:'test-admin',reviewedAt:new Date().toISOString()};return reply({product:offer,version:draft});}return reply({product:offer,draftVersion:draft});}
 if(url.endsWith('/publish-preview'))return reply({draftVersion:draft,validation:{isValid:!url.includes('blocked'),errors:url.includes('blocked')?['Falta monto']:[],warnings:['Tasa variable conservada']},summary:{amounts:{min:100000,max:500000},rates:{min:null,max:null},terms:{max:36},commissions:{financiera:4,brokerDirecto:1,masterBroker:2,platformMarginDirect:3,platformMarginMaster:2}}});
 if(url.endsWith('/publish'))return reply({publishedVersion:{status:'published'}});
 if(url.startsWith('/api/admin/activity-audit')){const offset=Number(new URL(url,'https://qa.example.test').searchParams.get('offset')||0);return reply({logs:[{id:offset?'old':'new',action:offset?'invitation_registered':'login_success',newState:'success',createdAt:new Date().toISOString(),metadata:{actorName:offset?'Broker Registrado QA':'Admin Acceso QA',actorEmail:'qa@example.test',actorRole:offset?'broker':'super_admin',route:'/api/auth/login',method:'POST',statusCode:200}}],hasMore:offset===0,nextOffset:100});}
 throw Error('Unexpected mock request '+url);
};
const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>(await fetch(String(queryKey[0]))).json()}}});
function App(){const [screen,setScreen]=useState('editor');return <QueryClientProvider client={queryClient}>
 <button onClick={()=>setScreen('editor')}>Abrir editor QA</button><button onClick={()=>setScreen('batch')}>Abrir lote QA</button><button onClick={()=>setScreen('audit')}>Abrir auditoría QA</button><button onClick={()=>setScreen('individual')}>Abrir individual QA</button>
 {screen==='editor' && <OfferDraftEditorModal isOpen offer={offer} onClose={()=>setScreen('closed')} onOpenPublish={()=>{(window as any).qaOpenedPreviewAfterPut=(window as any).qaCalls.some((c:any)=>c.method==='PUT');setScreen('preview');}}/>}
 {screen==='preview'&&<p>Revisión posterior a guardado</p>}
 {screen==='batch'&&<BatchOfferPublishModal offers={[offer,{...offer,id:'blocked',name:'Oferta bloqueada QA'}]} onClose={()=>setScreen('closed')}/>}
 {screen==='individual'&&<OfferPublishModal isOpen offer={offer} onClose={()=>setScreen('closed')}/>}
 {screen==='audit'&&<AdministrativeActivity/>}<Toaster/>
 </QueryClientProvider>;}
createRoot(document.getElementById('root')!).render(<App/>);
