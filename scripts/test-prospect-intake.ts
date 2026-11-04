import { PGlite } from "@electric-sql/pglite";
import { getTableColumns } from "drizzle-orm";
import { readFileSync } from "node:fs";
import express from "express";
// @ts-ignore runtime test dependency
import request from "supertest";
import { pool } from "../server/db";
import { storage } from "../server/storage";
import { clients } from "../shared/schema";
import { PROSPECT_INTAKE_SCHEMA_SQL, checkProspectIntakeSchemaReadiness } from "../server/prospectIntakeSchema";
import { PROSPECT_AUTO_MATCHING_SCHEMA_SQL } from "../server/prospectAutoMatchingSchema";
import { registerCampaignAcquisitionRoutes } from "../server/campaignAcquisitionRoutes";
import { registerProspectCompletionRoutes } from "../server/prospectCompletionRoutes";
import { getPublishedLegalDocument } from "../server/legalDocuments";

import { before as beforeAll, after as afterAll, afterEach, describe, it } from "node:test";
import { expect } from "expect";
import { spyOn } from "jest-mock";
const mocks: any[] = [];
function trackSpy(object: any, method: any): any { const mock = spyOn(object, method); mocks.push(mock); return mock; }
describe("Prospect self-service: HTTP → PostgreSQL transaction → advisor inbox", () => {
  let pg: PGlite, owner: any, other: any, tenant: any;
  const app = express();
  const notice = getPublishedLegalDocument("aviso")!;
  let failNotification = false;
  let queue = Promise.resolve();
  const query = async (sql: string, params?: any[]) => {
    if (failNotification && sql.includes("INSERT INTO public.notifications")) throw new Error("notification write failure");
    const result = await pg.query(sql, params);
    return { ...result, rowCount: result.affectedRows };
  };
  const asOwner = (path: string) => request(app).post(path).set("x-test-user-id", owner.id);
  const direct = async (data = {}) => {
    const result = await asOwner("/api/commercial-resources/completion-links").send(data);
    expect(result.status).toBe(200);
    return result.body.path.split("/").pop();
  };
  const submit = (token: string, profile: any) => request(app).post("/api/public/prospect-completion/" + token).send({profile,acknowledgePrivacy:true,privacyVersion:notice.version});
  const profile = (phone: string, more = {}) => ({type:"fisica",firstName:"Prospecto",phone,...more});
  beforeAll(async () => {
    pg = await PGlite.create();
    const clientColumns = Object.entries(getTableColumns(clients)).map(([key, column]) =>
      `"${column.name}" ${column.getSQLType()} ${key === "id" ? "PRIMARY KEY DEFAULT gen_random_uuid()" : ["createdAt","updatedAt"].includes(key) ? "DEFAULT NOW()" : ""}`).join(",");
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE users(id varchar PRIMARY KEY,email varchar,first_name varchar,last_name varchar,brand_name varchar,role varchar,status varchar,is_active boolean);
      CREATE TABLE tenants(id varchar PRIMARY KEY,is_active boolean);
      CREATE TABLE tenant_members(id varchar PRIMARY KEY,user_id varchar,tenant_id varchar,is_active boolean);
      CREATE TABLE clients(${clientColumns});
      CREATE TABLE sessions(sid varchar PRIMARY KEY,sess json,expire timestamp);
      CREATE TABLE commercial_audit_logs(performed_by varchar,entity_type varchar,action varchar,new_state varchar,created_at timestamp);
      CREATE TABLE commercial_resource_templates(id varchar PRIMARY KEY,name varchar,product varchar,channel varchar,status varchar);
      CREATE TABLE notifications(id varchar PRIMARY KEY DEFAULT gen_random_uuid(),user_id varchar,type varchar,title varchar,message text,data jsonb);
    `);
    await pg.exec(readFileSync("migrations/0011_commercial_campaign_links_and_leads.sql","utf8"));
    await pg.exec(PROSPECT_INTAKE_SCHEMA_SQL);
    await pg.exec(PROSPECT_AUTO_MATCHING_SCHEMA_SQL);
    await pg.exec(PROSPECT_AUTO_MATCHING_SCHEMA_SQL);
    expect((await checkProspectIntakeSchemaReadiness({query})).ready).toBe(true);
    // Same migration is replayable on both ordinary PostgreSQL and Supabase.
    await pg.exec(PROSPECT_INTAKE_SCHEMA_SQL);
    owner = await storage.createUser({email:"intake-owner@example.test",firstName:"Asesor",role:"broker",status:"active",isActive:true,password:"hash"} as any);
    other = await storage.createUser({email:"intake-other@example.test",firstName:"Otro",role:"broker",status:"active",isActive:true,password:"hash"} as any);
    tenant = await storage.createTenant({type:"broker",name:"Intake QA",slug:"intake-qa",isActive:true} as any);
    const membership = await storage.createTenantMember({tenantId:tenant.id,userId:owner.id,role:"owner",isActive:true,canOriginate:true} as any);
    for (const user of [owner,other]) await pg.query("INSERT INTO users(id,first_name,role,status,is_active) VALUES ($1,$2,'broker','active',true)",[user.id,user.firstName]);
    await pg.query("INSERT INTO tenants VALUES ($1,true)",[tenant.id]);
    await pg.query("INSERT INTO tenant_members VALUES ($1,$2,$3,true)",[membership.id,owner.id,tenant.id]);
    const originalGetClient = storage.getClient.bind(storage);
    trackSpy(storage,"getClient").mockImplementation(async (id: string) => {
      const result = await pg.query("SELECT * FROM clients WHERE id=$1",[id]);
      const row: any = result.rows[0];
      return row ? Object.fromEntries(Object.entries(getTableColumns(clients)).map(([key,column])=>[key,row[column.name]])) : originalGetClient(id);
    });
    trackSpy(storage,"isUserFormalized").mockResolvedValue({isFormalized:true,acceptedDocuments:["convenio","reglas-red"]});
    trackSpy(pool,"query").mockImplementation(query as any);
    trackSpy(pool,"connect").mockImplementation((async () => {
      const before = queue;
      let release!: () => void;
      queue = new Promise<void>(r => {release=r;});
      await before;
      return {query,release};
    }) as any);
    app.use(express.json());
    registerCampaignAcquisitionRoutes(app);
    registerProspectCompletionRoutes(app);
  });
  afterAll(async () => {mocks.forEach(mock => mock.mockRestore());await pg?.close();});
  afterEach(() => {failNotification=false;});
  it("reuses one marketing link and offers a private continuation to a NEW lead only", async () => {
    const links = "/api/commercial-resources/links";
    const a = await asOwner(links).send({}), b = await asOwner(links).send({});
    expect(a.body.path).toBe(b.body.path);
    const token = a.body.path.split("/").pop();
    const body = {fullName:"Contacto Redes",phone:"5512345001",product:"simple",acknowledgePrivacy:true,privacyVersion:notice.version};
    const first = await request(app).post(`/api/public/campaign/${token}/submit`).send(body);
    expect(first.status).toBe(201);
    expect(first.body.completionPath).toMatch(/^\/completar-perfil\/[\w-]{32}$/);
    const repeated = await request(app).post(`/api/public/campaign/${token}/submit`).send(body);
    expect(repeated.status).toBe(201);
    expect(repeated.body.completionPath).toBeUndefined();
    const inbox = await request(app).get("/api/commercial-resources/received").set("x-test-user-id",owner.id);
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0].owner_user_id).toBeUndefined();
    const continuation = first.body.completionPath.split("/").pop();
    const privateRow: any = (await pg.query("SELECT token_hash FROM prospect_completion_links")).rows[0];
    expect(privateRow.token_hash).not.toContain(continuation);
    expect((await submit(continuation,profile("5512345001",{ingresoAnual:"hasta-250000"}))).status).toBe(201);
    const lead: any = (await pg.query("SELECT * FROM commercial_marketing_leads WHERE phone='5512345001'")).rows[0];
    expect(lead.linked_client_id).toBeTruthy();
    expect(lead.profile_data.ingresoAnual).toBe("hasta-250000");
    const preapp:any=(await pg.query("SELECT * FROM prospect_preapplications WHERE lead_id=$1",[lead.id])).rows[0];
    expect(preapp).toBeTruthy();
    expect(preapp.status).toBe("awaiting_details");
    expect(preapp.owner_user_id).toBe(owner.id);
    expect((await pg.query("SELECT * FROM prospect_matching_evaluations WHERE preapplication_id=$1",[preapp.id])).rows).toHaveLength(0);

    expect((await pg.query("SELECT * FROM clients WHERE id=$1",[lead.linked_client_id])).rows).toHaveLength(1);
  });
  it("does not expose any existing prospect fields through a direct link", async () => {
    const token = await direct();
    const response = await request(app).get("/api/public/prospect-completion/"+token);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({advisorName:"Asesor",privacyVersion:notice.version});
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
  it("rejects absent consent, stale notices and owner injection before writing", async () => {
    const token = await direct();
    const endpoint = "/api/public/prospect-completion/"+token;
    expect((await request(app).post(endpoint).send({profile:profile("5512345002")})).status).toBe(400);
    expect((await request(app).post(endpoint).send({profile:profile("5512345002"),acknowledgePrivacy:true,privacyVersion:"old"})).status).toBe(409);
    expect((await submit(token,profile("5512345002",{brokerId:other.id}))).status).toBe(400);
    expect((await pg.query("SELECT * FROM clients WHERE phone='5512345002'")).rows).toHaveLength(0);
  });
  it("completes existing blanks, retains recorded values and stores the full submitted profile", async () => {
    const saved = await storage.createClient({brokerId:owner.id,tenantId:tenant.id,type:"fisica",firstName:"Nombre original",phone:"5512345003"} as any);
    await pg.query("INSERT INTO clients(id,broker_id,tenant_id,type,first_name,phone) VALUES ($1,$2,$3,'fisica','Nombre original','5512345003')",[saved.id,owner.id,tenant.id]);
    const token = await direct({clientId:saved.id});
    expect((await submit(token,profile("5512345003",{firstName:"Otro nombre",rfc:"AAAA000000AAA",ingresoAnual:"hasta-250000"}))).status).toBe(201);
    const row: any = (await pg.query("SELECT * FROM clients WHERE id=$1",[saved.id])).rows[0];
    expect(row.first_name).toBe("Nombre original");expect(row.rfc).toBe("AAAA000000AAA");
    expect(row.ingreso_anual).toBe("hasta-250000");
    expect((await pg.query("SELECT * FROM clients WHERE phone='5512345003'")).rows).toHaveLength(1);
    expect((await pg.query("SELECT profile_data FROM commercial_marketing_leads WHERE linked_client_id=$1",[saved.id])).rows[0]).toMatchObject({profile_data:{firstName:"Otro nombre"}});
  });
  it("prevents cross-owner invitations, attribution changes and reads", async () => {
    const alien = await storage.createClient({brokerId:other.id,type:"fisica",firstName:"Ajeno"} as any);
    expect((await asOwner("/api/commercial-resources/completion-links").send({clientId:alien.id})).status).toBe(403);
    expect((await asOwner("/api/commercial-resources/completion-links").send({ownerUserId:other.id})).status).toBe(400);
    const inbox = await request(app).get("/api/commercial-resources/received").set("x-test-user-id",other.id);
    expect(inbox.body).toEqual([]);
  });
  it("stores conflicting identities for review without claiming another advisor's client", async () => {
    await pg.query("INSERT INTO clients(broker_id,type,phone,first_name) VALUES ($1,'fisica','5512345004','Privado')",[other.id]);
    const token = await direct();
    expect((await submit(token,profile("5512345004"))).status).toBe(201);
    const leads: any = (await pg.query("SELECT * FROM commercial_marketing_leads WHERE phone='5512345004'")).rows[0];
    expect(leads.owner_user_id).toBe(owner.id);expect(leads.linked_client_id).toBeNull();
    expect((await pg.query("SELECT * FROM clients WHERE phone='5512345004'")).rows).toHaveLength(1);
  });
  it("consumes a completion once even for simultaneous retries", async () => {
    const token = await direct();
    const results = await Promise.all([submit(token,profile("5512345005")),submit(token,profile("5512345005"))]);
    expect(results.map(r=>r.status).sort()).toEqual([201,404]);
    expect((await pg.query("SELECT * FROM clients WHERE phone='5512345005'")).rows).toHaveLength(1);
    expect((await request(app).get("/api/public/prospect-completion/"+token)).status).toBe(404);
  });
  it("rolls back profile, lead, notification and token together and allows retry", async () => {
    const token = await direct();failNotification=true;
    expect((await submit(token,profile("5512345006"))).status).toBe(503);
    expect((await pg.query("SELECT * FROM clients WHERE phone='5512345006'")).rows).toHaveLength(0);
    expect((await pg.query("SELECT * FROM commercial_marketing_leads WHERE phone='5512345006'")).rows).toHaveLength(0);
    failNotification=false;
    expect((await submit(token,profile("5512345006"))).status).toBe(201);
  });
  it("retains the profile if the advisor has not formalized; does not bypass origination", async () => {
    (storage.isUserFormalized as any).mockResolvedValueOnce({isFormalized:false,acceptedDocuments:[]});
    const token = await direct();
    expect((await submit(token,profile("5512345007"))).status).toBe(201);
    expect((await pg.query("SELECT * FROM clients WHERE phone='5512345007'")).rows).toHaveLength(0);
    expect((await pg.query("SELECT profile_data FROM commercial_marketing_leads WHERE phone='5512345007'")).rows).toHaveLength(1);
  });
  it("rejects expired links and suspended advisors at submit time", async () => {
    const expired = await direct();
    await pg.query("UPDATE prospect_completion_links SET expires_at=NOW()-INTERVAL '1 day' WHERE used_at IS NULL");
    expect((await submit(expired,profile("5512345008"))).status).toBe(404);
    const disabled = await direct();
    await pg.query("UPDATE users SET status='suspended' WHERE id=$1",[owner.id]);
    expect((await submit(disabled,profile("5512345008"))).status).toBe(404);
    await pg.query("UPDATE users SET status='active' WHERE id=$1",[owner.id]);
  });
  it("confirms legacy sessions without inventing a historical first-access date", async () => {
    await pg.query("INSERT INTO users(id,first_name,role,status,is_active) VALUES ('legacy-session','Anterior','broker','active',true)");
    await pg.query("INSERT INTO sessions(sid,sess) VALUES ('legacy-qa',$1)",[JSON.stringify({passport:{user:{claims:{sub:"legacy-session"}}}})]);
    await pg.exec(PROSPECT_INTAKE_SCHEMA_SQL);
    const row: any = (await pg.query("SELECT * FROM user_access_history WHERE user_id='legacy-session'")).rows[0];
    expect(row.evidence_source).toBe("historical_session");
    expect(row.first_access_at).toBeNull();expect(row.last_access_at).toBeNull();
  });
  it("matches Mexico country-code formats without creating a second client", async () => {
    await pg.query("INSERT INTO clients(broker_id,tenant_id,type,phone,first_name) VALUES ($1,$2,'fisica','+52 55 1234 5009','Existente')",[owner.id,tenant.id]);
    const token = await direct();
    expect((await submit(token,profile("5512345009"))).status).toBe(201);
    const rows = (await pg.query("SELECT * FROM clients WHERE phone='+52 55 1234 5009' OR phone='5512345009'")).rows;
    expect(rows).toHaveLength(1);
  });
  it("keeps earlier financial data and exact submissions when the prospect sends more later", async () => {
    const lead: any = (await pg.query("SELECT * FROM commercial_marketing_leads WHERE phone='5512345001'")).rows[0];
    const token = await direct({leadId:lead.id});
    expect((await submit(token,profile("5512345001",{rfc:"BBBB000000BBB",ingresoAnual:""}))).status).toBe(201);
    const updated: any = (await pg.query("SELECT profile_data FROM commercial_marketing_leads WHERE id=$1",[lead.id])).rows[0];
    expect(updated.profile_data.ingresoAnual).toBe("hasta-250000");expect(updated.profile_data.rfc).toBe("BBBB000000BBB");
    const own = await request(app).get(`/api/commercial-resources/received/${lead.id}/profiles`).set("x-test-user-id",owner.id);
    expect(own.status).toBe(200);expect(own.body).toHaveLength(2);
    expect(own.body[0].profile_data.ingresoAnual).toBe("");
    expect((await request(app).get(`/api/commercial-resources/received/${lead.id}/profiles`).set("x-test-user-id",other.id)).status).toBe(404);
  });
  it("isolates sensitive tables from anonymous/authenticated Data API roles", async () => {
    for (const role of ["anon","authenticated"]) for (const table of ["user_access_history","prospect_completion_links","commercial_marketing_leads","prospect_profile_submissions"]) {
      const result: any = (await pg.query("SELECT has_table_privilege($1,$2,'SELECT') AS allowed",[role,table])).rows[0];
      expect(result.allowed).toBe(false);
    }
  });
  it("captures a complete financing request, creates one preapplication and hides institution details from the public", async () => {
    const token=await direct();
    const financing={product:"simple",amount:1000000,termMonths:36,purpose:"Ampliar capital de trabajo"};
    const answer=await request(app).post("/api/public/prospect-completion/"+token)
      .send({profile:profile("5512345025"),financing,acknowledgePrivacy:true,privacyVersion:notice.version});
    expect(answer.status).toBe(201);
    expect(answer.body.assessment).toBeTruthy();
    expect(JSON.stringify(answer.body.assessment)).not.toMatch(/institutionId|institutionName|offerId|comision|sobretasa|tasa/gi);
    const appRows=(await pg.query<any>("SELECT * FROM prospect_preapplications WHERE financing_data->>'purpose'=$1",
      [financing.purpose])).rows;
    expect(appRows).toHaveLength(1);
    const item=appRows[0];
    expect(item.owner_user_id).toBe(owner.id);
    expect(item.financing_data.amount).toBe(1000000);
    expect(item.client_id).toBeTruthy();
    const list=await request(app).get("/api/commercial-resources/received").set("x-test-user-id",owner.id);
    expect(list.status).toBe(200);
    expect(list.body.find((row:any)=>row.id===item.lead_id)?.preapplication_status).toBeTruthy();
    const disallowed=await request(app).get("/api/commercial-resources/received/"+item.lead_id+"/preapplication")
      .set("x-test-user-id",other.id);
    expect(disallowed.status).toBe(404);
    const allowed=await request(app).get("/api/commercial-resources/received/"+item.lead_id+"/preapplication")
      .set("x-test-user-id",owner.id);
    expect(allowed.status).toBe(200);
    expect(allowed.body.financing.amount).toBe(1000000);
    expect(allowed.headers["cache-control"]).toBe("private, no-store");
    // The public token remains one-use.
    expect((await submit(token,profile("5512345025"))).status).toBe(404);
  });
  it("preserves the profile if matching throws, then allows an owner-only retry", async () => {
    const previous=(storage as any).getPublishedInstitutionProductsForMatching;
    (storage as any).getPublishedInstitutionProductsForMatching=async()=>{throw new Error("Synthetic catalogue outage");};
    try {
      const token=await direct();
      const response=await request(app).post("/api/public/prospect-completion/"+token).send({
        profile:profile("5512345026"),
        financing:{product:"arrendamiento",amount:1200000,termMonths:36,
          purpose:"Adquirir maquinaria para el negocio",leasingAssetType:"maquinaria"},
        acknowledgePrivacy:true,privacyVersion:notice.version,
      });
      expect(response.status).toBe(201);
      expect(response.body.assessment.status).toBe("pending");
      const p=(await pg.query<any>(
        "SELECT * FROM prospect_preapplications WHERE financing_data->>'product'='arrendamiento' ORDER BY created_at DESC LIMIT 1")).rows[0];
      expect(p.status).toBe("failed");
      expect(p.client_id).toBeTruthy();
      expect((await pg.query("SELECT * FROM clients WHERE phone='5512345026'")).rows).toHaveLength(1);
      const forbidden=await request(app).post("/api/commercial-resources/received/"+p.lead_id+"/preapplication/retry")
        .set("x-test-user-id",other.id).send({});
      expect(forbidden.status).toBe(404);
      (storage as any).getPublishedInstitutionProductsForMatching=async()=>[];
      const success=await request(app).post("/api/commercial-resources/received/"+p.lead_id+"/preapplication/retry")
        .set("x-test-user-id",owner.id).send({});
      expect(success.status).toBe(200);
      expect(success.body.assessment.status).toBe("under_review");
      expect((await pg.query<any>("SELECT status FROM prospect_preapplications WHERE id=$1",[p.id])).rows[0].status).toBe("evaluated");
      expect((await pg.query("SELECT * FROM prospect_matching_evaluations WHERE preapplication_id=$1",[p.id])).rows).toHaveLength(1);
      const repeated=await request(app).post("/api/commercial-resources/received/"+p.lead_id+"/preapplication/retry")
        .set("x-test-user-id",owner.id).send({});
      expect(repeated.status).toBe(200);
      expect((await pg.query("SELECT * FROM prospect_matching_evaluations WHERE preapplication_id=$1",[p.id])).rows).toHaveLength(1);
    } finally { (storage as any).getPublishedInstitutionProductsForMatching=previous; }
  });

});
