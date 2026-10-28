import {randomUUID} from 'node:crypto';
import express from 'express';
import type {Server} from 'node:http';
// @ts-ignore
import request from 'supertest';
import cron from 'node-cron';
import {storage} from '../../server/storage';
import {registerRoutes} from '../../server/routes';
import {pool} from '../../server/db';
describe('Published matching preview and saved requests share the same rules and authorization',()=>{
 let app:express.Express,server:Server,actor:any,admin:any,broker:any,client:any,template:any,submission:any,published:any;
 beforeAll(async()=>{
  app=express();app.use(express.json());app.use((req:any,_res,next)=>{req.isAuthenticated=()=>!!actor;req.user=actor?{...actor,claims:{sub:actor.id}}:null;req.dbUser=actor;next();});
  server=await registerRoutes(app);
  admin=await storage.createUser({email:`sa-match-${randomUUID()}@example.test`,role:'super_admin',isActive:true,status:'active'} as any);
  broker=await storage.createUser({email:`b-match-${randomUUID()}@example.test`,role:'broker',isActive:true,status:'active'} as any);
  client=await storage.createClient({type:'persona_moral',businessName:'QA',brokerId:admin.id,yearsInBusiness:1,ingresoMensualPromedio:'500000'} as any);
  template=await storage.createProductTemplate({name:'Crédito QA',category:'credito_simple',isActive:true,createdBy:admin.id} as any);
  const other=await storage.createProductTemplate({name:'Factoraje QA',category:'factoraje',isActive:true,createdBy:admin.id} as any);
  const institution=await storage.createFinancialInstitution({name:'Financiera QA',isActive:true,requirements:{persona_moral:{ranges:{tiempoActividad:{min:1}}}}} as any);
  async function make(name:string,templateId:string,doPublish:boolean,age=24){
    const {offer,version}=await storage.createOffer({institutionId:institution.id,templateId,name,productType:'credito_simple',isActive:true,status:'draft'},{conditions:{minAmount:100,maxAmount:1000000,commissionRates:{financiera:{apertura:5},masterBroker:{apertura:3},broker:{apertura:2}}},requirements:{targetProfiles:['persona_moral'],minMonthsInBusiness:age},requiredDocuments:[],changeReason:'QA'});
    if(doPublish)await storage.publishInstitutionProductVersion(offer.id,version.id,{changeReason:'Prueba aislada'});
    return offer;
  }
  published=await make('Oferta correcta',template.id,true);
  await make('No filtrar como primera oferta',template.id,true,36);
  await make('Borrador secreto',template.id,false);
  await make('Otra familia',other.id,true);
  submission=await storage.createCreditSubmissionRequest({clientId:client.id,brokerId:admin.id,productTemplateId:template.id,requestedAmount:'100000',status:'pending_admin'} as any);
 });
 afterAll(async()=>{cron.getTasks().forEach((t:any)=>t.stop());if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();});
 afterEach(()=>{actor=null;});
 const url=()=>`/api/matching/preview?clientId=${client.id}&productTemplateId=${template.id}&amount=100000`;
 it('does not expose the preview without authentication or outside the client ownership scope',async()=>{
  expect((await request(app).get(url())).status).toBe(401);
  actor=broker;expect((await request(app).get(url())).status).toBe(403);
 });
 it('rejects malformed or missing inputs rather than evaluating with invented values',async()=>{
  actor=admin;expect((await request(app).get('/api/matching/preview')).status).toBe(400);
  for(const amount of ['Infinity','-1','NaN','0','1mes'])expect((await request(app).get(url().replace('amount=100000','amount='+amount))).status).toBe(400);
 });
 it('uses imported age, includes both published offers and excludes drafts, different families and economics',async()=>{
  actor=admin;const r=await request(app).get(url());expect(r.status).toBe(200);
  expect(r.body.summary.totalEvaluated).toBe(2);expect(r.body.notCompatible).toHaveLength(2);
  expect(r.body.notCompatible.every((o:any)=>o.criteria.failed.some((c:any)=>c.code==='companyAge'))).toBe(true);
  const json=JSON.stringify(r.body);for(const value of ['commissionRates','masterBroker','Borrador secreto','Otra familia'])expect(json).not.toContain(value);
 });
 it('returns the same results for the preview and a saved request',async()=>{
  actor=admin;
  const preview=await request(app).get(url());const saved=await request(app).get(`/api/credit-submissions/${submission.id}/matching`);
  expect(saved.status).toBe(200);
  for(const key of ['summary','compatible','insufficientData','notCompatible'])expect(saved.body[key]).toEqual(preview.body[key]);
 });
 it('does not evaluate a future draft or institution defaults in place of the published version',async()=>{
  actor=admin;await storage.createInstitutionProductDraftVersion(published.id,{conditions:{minAmount:100,maxAmount:1000000},requirements:{targetProfiles:['persona_moral'],minMonthsInBusiness:0},changeReason:'Futuro permisivo'});
  const r=await request(app).get(url());expect(r.body.summary.totalEvaluated).toBe(2);expect(r.body.notCompatible).toHaveLength(2);
 });
});
