import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SuperAdminBrokerDossierDialog from "../../client/src/components/Users/SuperAdminBrokerDossierDialog";
import { ProspectCompletionForm } from "../../client/src/pages/PublicProspectCompletion";
import ProspectCompletionLinkButton from "../../client/src/components/Clients/ProspectCompletionLinkButton";
import { Toaster } from "../../client/src/components/ui/toaster";
const broker: any = {id:"broker-qa",firstName:"Asesor",lastName:"Prueba",email:"broker@example.test",role:"broker",status:"active",isActive:true};
const response = (body: unknown, status=200) => new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
(window as any).qaCalls=[];
window.fetch=async (url: any, init?: RequestInit) => {
  const path=String(url),method=init?.method || "GET",body=init?.body ? JSON.parse(String(init.body)):null;
  (window as any).qaCalls.push({path,method,body});
  if(path==="/api/auth/user") return response(broker);
  if(path.endsWith("/dossier")) return response({user:{...broker,registrationStatus:"registered",hasAccessed:true,firstAccessAt:"2026-11-01T15:00:00Z",lastAccessAt:"2026-11-02T15:00:00Z",createdAt:"2026-10-28T15:00:00Z",profileData:{phone:"5512345678",rfc:"AAAA010101AAA"},commercialReferences:[],bankName:"Banco QA",clabe:"000000000000000000",accountHolder:"Asesor Prueba",master:null},memberships:[],documents:[{id:"ine-qa",type:"ine",fileName:"identificacion-qa.pdf",uploadedAt:"2026-11-01T15:00:00Z",isValid:true}],acceptances:[{id:"accept-qa",document:"convenio",version:"1.0",acceptedAt:"2026-11-01T15:00:00Z"}],activity:[{id:"event-qa",action:"login_success",newState:"success",createdAt:"2026-11-01T15:00:00Z",route:"/api/auth/login",method:"POST"}]});
  if(path.startsWith("/api/admin/broker-network/transitions/")) return response({history:[]});
  if(path==="/api/admin/legal/users/broker-qa/acceptances") return response({user:broker,formalization:{status:"formalized",acceptedDocuments:["convenio","reglas-red"],requiredDocuments:["convenio","reglas-red"],latestAcceptedAt:"2026-11-01T15:00:00Z"},acceptances:[{id:"accept-qa",document:"convenio",version:"1.0",acceptedAt:"2026-11-01T15:00:00Z"}]});
  if(path==="/api/admin/legal/users/broker-qa/acceptances/accept-qa") return response({acceptance:{document:"convenio",acceptedAt:"2026-11-01T15:00:00Z",contentSha256:"hash-qa"},document:{title:"Convenio QA",content:"CONVENIO HISTÓRICO EXACTO QA"},isPersonalized:false});
  if(path.startsWith("/api/public/prospect-completion/")) return response(method==="POST"?{message:"Información recibida"}:{advisorName:"Asesor Prueba",privacyVersion:"1.0"},method==="POST"?201:200);
  if(path==="/api/commercial-resources/completion-links") return response({path:"/completar-perfil/"+"x".repeat(32),expiresAt:"2026-11-09T15:00:00Z"});
  return response({message:"Sin respuesta ficticia"},404);
};
const cache=new QueryClient({defaultOptions:{queries:{retry:false,queryFn:async({queryKey})=>(await fetch(String(queryKey[0]))).json()}}});
function Fixture(){const[mode,setMode]=useState("dossier");return <><nav><button onClick={()=>setMode("dossier")}>Expediente QA</button><button onClick={()=>setMode("profile")}>Formulario QA</button><button onClick={()=>setMode("link")}>Enlace QA</button></nav>{mode==="dossier"?<SuperAdminBrokerDossierDialog user={broker} allUsers={[broker]} onClose={()=>setMode("link")}/>:mode==="profile"?<ProspectCompletionForm token={"q".repeat(32)} initialProfile={{type:"fisica",firstName:"Prospecto QA",phone:"5512345678"}}/>:<ProspectCompletionLinkButton clientId="client-qa"/>}<Toaster/></>;}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={cache}><Fixture/></QueryClientProvider>);
