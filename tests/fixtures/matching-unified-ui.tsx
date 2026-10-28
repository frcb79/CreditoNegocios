import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import MatchingComparisonTable from '../../client/src/components/MatchingAnalysis/MatchingComparisonTable';
import CreditMatchingSection from '../../client/src/components/Credits/CreditMatchingSection';
import CreditRequestModal from '../../client/src/components/Modals/CreditRequestModal';
import {Toaster} from '../../client/src/components/ui/toaster';
const criterion={code:'companyAge',name:'Antigüedad mínima',requiredValue:24,actualValue:12,status:'FAILED',reason:'Antigüedad insuficiente QA'};
const row=(id:string,institutionId:string,status:string)=>({offerId:id,offerName:'Oferta '+id,institutionId,institutionName:'Financiera '+institutionId,versionNumber:2,status,criteria:{matched:status==='COMPATIBLE'?[{...criterion,status:'PASSED',reason:'Cumple QA'}]:[],failed:status==='NOT_COMPATIBLE'?[criterion]:[],missing:status==='INSUFFICIENT_DATA'?[{...criterion,status:'MISSING_DATA',reason:'Falta dato QA'}]:[]},reasons:['Regla QA'],summary:status==='COMPATIBLE'?'Compatible QA':status==='NOT_COMPATIBLE'?'No compatible QA':'Pendiente QA'});
const response={summary:{totalEvaluated:3,compatibleCount:1,notCompatibleCount:1,insufficientDataCount:1},compatible:[row('valida','f1','COMPATIBLE')],notCompatible:[row('rechazada','f1','NOT_COMPATIBLE')],insufficientData:[row('pendiente','f2','INSUFFICIENT_DATA')]};
const reply=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
let fail=false;(window as any).matchingCalls=[];
window.fetch=async(input:any)=>{const url=String(input);(window as any).matchingCalls.push(url);
 if(url.includes('/matching') || url.includes('/matching/preview')){if(fail)return reply({message:'Fallo QA'},500);return reply(response);}
 if(url==='/api/clients')return reply([{id:'c1',type:'persona_moral',businessName:'Cliente QA'}]);
 if(url==='/api/product-templates')return reply([{id:'p1',name:'Crédito QA',category:'credito_simple',targetProfiles:['persona_moral']}]);
 if(url==='/api/financial-institutions')return reply([{id:'f1',name:'Financiera f1',isActive:true,requirements:{persona_moral:{ranges:{tiempoActividad:{min:1}}}}},{id:'f2',name:'Financiera f2',isActive:true}]);
 throw Error('Unexpected fixture request '+url);
};
const client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>(await fetch(String(queryKey[0]))).json()}}});
function App(){const [mode,setMode]=useState('compare');return <QueryClientProvider client={client}><button onClick={()=>setMode('modal')}>Abrir solicitud QA</button><button onClick={()=>{fail=true;client.invalidateQueries()}}>Simular fallo QA</button>
 {mode==='compare'?<><MatchingComparisonTable client={{id:'c1'}} institution={{id:'f1',name:'Financiera f1'}} requestedAmount={100000} productTemplate={{id:'p1',name:'Crédito QA'}}/><CreditMatchingSection creditId="r1" requestType="submission"/></>:<CreditRequestModal isOpen preselectedClientId="c1" onClose={()=>setMode('compare')}/>}
 <Toaster/></QueryClientProvider>;}
createRoot(document.getElementById('root')!).render(<App/>);
