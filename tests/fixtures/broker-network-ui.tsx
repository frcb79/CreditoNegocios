// Isolated component fixture. All requests use fictitious data; no network or email is dispatched.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import BrokerNetwork from '../../client/src/components/Brokers/BrokerNetwork';
import {Toaster} from '../../client/src/components/ui/toaster';
const ago=(n:number)=>new Date(Date.now()-n*86400000).toISOString();
const master={id:'m1',role:'master_broker',firstName:'Master',lastName:'Registrado QA',email:'master@example.test',registrationStatus:'registered',status:'active',isActive:true};
const invited={...master,id:'m2',lastName:'Invitado QA',email:'invited@example.test',registrationStatus:'pending'};
const active={...master,id:'b1',role:'broker',firstName:'Broker',masterBrokerId:'m1',email:'registered@example.test'};
const contact=(id:string,lastName:string,days:number,paused=false)=>({id,firstName:'Broker',lastName,email:id+'@example.test',phone:'5512345678',role:'broker',masterEmail:master.email,invitedAt:ago(days),sentDays:[],lastReminderAt:null,failedReminders:0,paused});
let contacts=[contact('old','Antiguo QA',20),contact('new','Reciente QA',1),contact('paused','Pausado QA',16,true),{...contact('m2','Invitado QA',1),role:'master_broker',masterEmail:null}];
let activated=false,fail=false,reads=0,writes=0;
const reply=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input:any,init?:RequestInit)=>{
 const url=String(input);const method=init?.method||'GET';
 if(url==='/api/auth/user')return reply({id:'admin',role:'super_admin',firstName:'Admin',lastName:'QA'});
 if(url==='/api/broker-network')return reply({masterBrokers:[{...master,networkBrokers:[active,{...contacts[1],masterBrokerId:'m1',registrationStatus:activated?'registered':'pending',isActive:true,status:'active'}]},{...invited,networkBrokers:[]}],independentBrokers:[],allBrokers:[active,{...contacts[1],masterBrokerId:'m1',registrationStatus:activated?'registered':'pending'}]});
 if(url==='/api/broker-invitations/pending'){
  reads++;document.getElementById('qa-counts')!.textContent=`Consultas: ${reads}; cambios: ${writes}`;await new Promise(r=>setTimeout(r,250));
  if(fail){fail=false;return reply({message:'Fallo simulado'},500);}
  const selected=contacts.filter(c=>!activated||c.id!=='new');return reply({total:selected.length,contacts:selected});
 }
 if(url.startsWith('/api/broker-invitations/pending/')&&method==='POST'){
  const id=decodeURIComponent(url.split('/')[4]);const body=JSON.parse(String(init?.body));contacts=contacts.map(c=>c.id===id?{...c,paused:body.paused}:c);writes++;return reply({ok:true});
 }
 return reply({message:'No disponible en fixture aislado'},404);
};
const client=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>{const r=await fetch(String(queryKey[0]));if(!r.ok)throw Error('Error de consulta');return r.json();}}}});
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><div style={{padding:24}}><h1>Prueba aislada — Red de Brokers — datos ficticios</h1><div style={{display:'flex',gap:20,margin:'20px 0'}}><button onClick={()=>{activated=true}}>Simular activación</button><button onClick={()=>{fail=true}}>Simular fallo de consulta</button><span id="qa-counts">Consultas: 0; cambios: 0</span></div><BrokerNetwork/><Toaster/></div></QueryClientProvider>);
