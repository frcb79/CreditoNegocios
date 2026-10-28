import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
// @ts-ignore
import request from "supertest";
import bcrypt from "bcrypt";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { pool } from "../../server/db";

const rates = {financiera:{apertura:4,sobretasa:1,renovacion:2,total:7},masterBroker:{apertura:2,sobretasa:0,renovacion:1,total:3},broker:{apertura:1,sobretasa:0,renovacion:0.5,total:1.5},type:"porcentaje",notes:"No alterar otros componentes"};

describe("Financieras editing/publication and administrative activity HTTP",()=>{
 let app:express.Express,server:Server,user:any=null,admin:any,broker:any,offer:any,version:any;
 beforeAll(async()=>{
  app=express();app.use(express.json());
  app.use((req:any,_res,next)=>{req.isAuthenticated=()=>Boolean(user);req.user=user?{...user,claims:{sub:user.id}}:null;req.dbUser=user;next();});
  server=await registerRoutes(app);
  admin=await storage.createUser({email:`sa-${randomUUID()}@example.test`,firstName:"SA",lastName:"QA",role:"super_admin",isActive:true,status:"active",password:await bcrypt.hash("Test1234!Only",4)} as any);
  broker=await storage.createUser({email:`b-${randomUUID()}@example.test`,role:"broker",isActive:true,status:"active"} as any);
  const institution=await storage.createFinancialInstitution({name:"Financiera QA",isActive:true} as any);
  const created=await storage.createOffer({institutionId:institution.id,name:"Oferta V5 QA",productType:"credito_simple",status:"draft",isActive:true},{conditions:{minAmount:100000,maxAmount:500000,maxTermMonths:36,rateSource:"TIIE + 8 puntos",commissionRates:rates,sourceTechnicalFields:{"Dato fuente":"Conservar"}},requirements:{targetProfiles:["persona_moral"],minMonthsInBusiness:24,minMonthlyIncome:150000,minAnnualIncome:1800000,guarantee:"Obligado con inmueble",bureauPolicySource:"Sin quitas",ranges:{tiempoActividad:{min:24}}},requiredDocuments:["Documento importado"],changeReason:"Alta QA"});
  offer=created.offer;version=created.version;
 });
 afterAll(async()=>{cron.getTasks().forEach((t:any)=>t.stop());if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();});
 afterEach(()=>{user=null;jest.restoreAllMocks();});
 it("guards global activity audit by verified Super Admin role",async()=>{
  expect((await request(app).get('/api/admin/activity-audit')).status).toBe(401);
  user=broker;expect((await request(app).get('/api/admin/activity-audit')).status).toBe(403);
  user=admin;expect((await request(app).get('/api/admin/activity-audit?offset=-1')).status).toBe(400);
 });
 it("round-trips imported source/eligibility/documents and preserves full commissions on unrelated draft edits",async()=>{
  user=admin;
  const get=await request(app).get(`/api/institution-products/${offer.id}/draft`);
  expect(get.body.draftVersion.requirements.minMonthsInBusiness).toBe(24);
  const saved=await request(app).put(`/api/institution-products/${offer.id}/draft`).send({name:"Editado",conditions:{minCompanyAgeMonths:24,minMonthlyRevenue:150000,minInterestRate:null},requirements:{targetProfiles:["persona_moral"]},requiredDocuments:["Documento importado","CSF"],variablesConfiguration:{futureMetadata:{name:"Editado"}},changeReason:"Revisión QA"});
  expect(saved.status).toBe(200);
  expect(saved.body.version.conditions.commissionRates).toEqual(rates);
  expect(saved.body.version.conditions.rateSource).toBe("TIIE + 8 puntos");
  expect(saved.body.version.conditions.sourceTechnicalFields).toEqual({"Dato fuente":"Conservar"});
  expect(saved.body.version.requirements.minAnnualIncome).toBe(1800000);
  expect(saved.body.version.requirements.guarantee).toBe("Obligado con inmueble");
  expect(saved.body.version.requiredDocuments).toEqual(["Documento importado","CSF"]);
 });
 it("validates publication snapshot, refuses changed/repeated publication and retains history",async()=>{
  user=admin;
  const preview=await request(app).get(`/api/institution-products/${offer.id}/publish-preview`);
  expect(preview.body.validation.isValid).toBe(true);
  const old=preview.body.draftVersion;
  await request(app).put(`/api/institution-products/${offer.id}/draft`).send({conditions:{maxAmount:600000},changeReason:"Cambio posterior"});
  const stale=await request(app).post(`/api/institution-products/${offer.id}/publish`).send({confirmPublish:true,changeReason:"Publicación QA",expectedDraftId:old.id,expectedVersionHash:old.versionHash});
  expect(stale.status).toBe(400);expect(stale.body.message).toContain("OFFER_DRAFT_CHANGED");
  const fresh=await request(app).get(`/api/institution-products/${offer.id}/publish-preview`);
  const body={confirmPublish:true,changeReason:"Publicación QA",expectedDraftId:fresh.body.draftVersion.id,expectedVersionHash:fresh.body.draftVersion.versionHash};
  const published=await request(app).post(`/api/institution-products/${offer.id}/publish`).send(body);
  expect(published.status).toBe(200);expect(published.body.publishedVersion.status).toBe("published");
  expect(published.body.publishedVersion.conditions.commissionRates).toEqual(rates);
  expect((await request(app).post(`/api/institution-products/${offer.id}/publish`).send(body)).status).toBe(400);
  const draft=await storage.createInstitutionProductDraftVersion(offer.id,{changeReason:"Futura"});
  await request(app).put(`/api/institution-products/${offer.id}/draft`).send({name:"Nombre futuro",conditions:{maxAmount:900000,minCompanyAgeMonths:36},variablesConfiguration:{futureMetadata:{name:"Nombre futuro"}},changeReason:"Futura QA"});
  const parent=await storage.getInstitutionProduct(offer.id);
  expect(parent?.configuration).toEqual(published.body.publishedVersion.conditions);
  expect((await storage.getInstitutionProductVersions(offer.id)).find(v=>v.id===version.id)?.status).toBe("published");
  expect(parent?.name).toBe("Editado");expect(draft.id).not.toBe(version.id);
  const future=await storage.getInstitutionProductVersion(draft.id);
  expect((future?.requirements as any).minMonthsInBusiness).toBe(36);
  expect((future?.requirements as any).ranges.tiempoActividad.min).toBe(36);
 });
 it("records successful and rejected mutations using route templates, with no body or query secrets",async()=>{
  user=admin;
  await request(app).put(`/api/institution-products/${offer.id}/draft?private=do-not-log`).send({conditions:{maxAmount:-1},password:"never-log-me",changeReason:"Rejected QA"});
  await new Promise(resolve=>setTimeout(resolve,20));
  const response=await request(app).get('/api/admin/activity-audit?limit=2');
  expect(response.status).toBe(200);expect(response.body.logs).toHaveLength(2);expect(response.body.hasMore).toBe(true);
  const serialized=JSON.stringify(response.body);
  expect(serialized).not.toContain("never-log-me");expect(serialized).not.toContain("do-not-log");expect(serialized).not.toContain("private=");
  expect(response.body.logs.some((e:any)=>e.newState==="failed")).toBe(true);
  expect(response.body.logs[0].metadata.route).toBe('/api/institution-products/:id/draft');
  const older=await request(app).get('/api/admin/activity-audit?limit=2&offset=2');
  expect(older.body.logs.every((e:any)=>!response.body.logs.some((r:any)=>r.id===e.id))).toBe(true);
 });
 it("records access with an existing session once per session/day",async()=>{
  user=admin;
  const agent=request.agent(app);
  const before=await storage.getCommercialAuditLogs({entityType:"administrative_activity"});
  expect((await agent.get('/api/auth/user')).status).toBe(200);
  expect((await agent.get('/api/auth/user')).status).toBe(200);
  await new Promise(resolve=>setTimeout(resolve,20));
  const after=await storage.getCommercialAuditLogs({entityType:"administrative_activity"});
  expect(after.filter(e=>e.action==="session_access"&&!before.some(b=>b.id===e.id))).toHaveLength(1);
 });
 it("records login and logout only after successful authentication",async()=>{
  const before=await storage.getCommercialAuditLogs({entityType:"administrative_activity"});
  const failed=await request(app).post('/api/auth/login').send({email:admin.email,password:"wrong"});expect(failed.status).toBe(401);
  const success=await request(app).post('/api/auth/login').send({email:admin.email,password:"Test1234!Only"});expect(success.status).toBe(200);
  user=admin;expect((await request(app).get('/api/logout')).status).toBe(302);
  await new Promise(resolve=>setTimeout(resolve,20));
  const after=await storage.getCommercialAuditLogs({entityType:"administrative_activity"});
  const recent=after.filter(e=>!before.some(b=>b.id===e.id));
  expect(recent.filter(e=>e.action==="login_success")).toHaveLength(1);
  expect(recent.filter(e=>e.action==="logout_success")).toHaveLength(1);
  expect(JSON.stringify(recent)).not.toContain("Test1234!Only");
 });
});
