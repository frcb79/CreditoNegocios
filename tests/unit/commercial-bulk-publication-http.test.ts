import express from "express";
// @ts-ignore
import request from "supertest";
import { pool } from "../../server/db";
import { storage } from "../../server/storage";
import { registerCommercialResourceRoutes } from "../../server/commercialResourcesRoutes";

const ids=["a97507e9-46c2-4c39-88bb-000000000001","a97507e9-46c2-4c39-88bb-000000000002"];
const selected=[
  {id:ids[0],slug:"campaign-a",version:1,name:"Campaña A",status:"draft",
    definition:{headline:"Aprobado"},artwork_id:null},
  {id:ids[1],slug:"campaign-b",version:3,name:"Campaña B",status:"draft",
    definition:{graphic:{typographyReviewRequired:false}},artwork_id:ids[1]},
];

describe("Commercial bulk publication HTTP — Super Admin, locks and rollback",()=>{
  const app=express();
  let role:string|null="super_admin";
  app.use(express.json());
  app.use((req:any,_res,next)=>{req.isAuthenticated=()=>Boolean(role);
    req.user=role?{id:"qa-user"}:null;next();});
  registerCommercialResourceRoutes(app);

  let query:jest.Mock,release:jest.Mock;
  beforeEach(()=>{
    role="super_admin";
    jest.spyOn(storage,"getUser").mockImplementation(async()=>({
      id:"qa-user",role,isActive:true,status:"active",
    }) as any);
    query=jest.fn(async(sql:string)=>{
      if(sql.includes("SELECT DISTINCT slug"))
        return {rows:[{slug:"campaign-a"},{slug:"campaign-b"}],rowCount:2};
      if(sql.includes("LEFT JOIN public.commercial_resource_artworks"))
        return {rows:selected,rowCount:2};
      if(sql.includes("SET status='retired'"))
        return {rows:[{id:"older-campaign-a"}],rowCount:1};
      if(sql.includes("SET status='published',published_by"))
        return {rows:ids.map(id=>({id,status:"published"})),rowCount:2};
      return {rows:[],rowCount:0};
    });
    release=jest.fn();
    jest.spyOn(pool,"connect").mockResolvedValue({query,release} as never);
  });
  afterEach(()=>jest.restoreAllMocks());
  const publish=()=>request(app).post("/api/admin/commercial-resources/drafts/publish")
    .send({ids,editorialLegalApproved:true});

  it("refuses Broker, Master Broker and Admin before touching the database",async()=>{
    for(const denied of ["broker","master_broker","admin"]){
      role=denied;
      expect((await publish()).status).toBe(403);
      expect(pool.connect).not.toHaveBeenCalled();
    }
  });
  it("requires unique IDs and commercial/legal approval without opening a transaction",async()=>{
    expect((await request(app).post("/api/admin/commercial-resources/drafts/publish")
      .send({ids,editorialLegalApproved:false})).status).toBe(400);
    expect((await request(app).post("/api/admin/commercial-resources/drafts/publish")
      .send({ids:[ids[0],ids[0]],editorialLegalApproved:true})).status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it("publishes two versions atomically and retires only prior published versions",async()=>{
    const response=await publish();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({published:2,retired:1});
    const sql=query.mock.calls.map(x=>x[0]);
    expect(sql[0]).toBe("BEGIN");
    expect(sql.filter(x=>x.includes("pg_advisory_xact_lock"))).toHaveLength(2);
    expect(sql.findIndex(x=>x.includes("ORDER BY t.id FOR UPDATE OF t")))
      .toBeLessThan(sql.findIndex(x=>x.includes("SET status='retired'")));
    expect(sql.findIndex(x=>x.includes("SET status='retired'")))
      .toBeLessThan(sql.findIndex(x=>x.includes("SET status='published',published_by")));
    expect(sql.at(-1)).toBe("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });
  it("rolls back WITHOUT any publication when an artwork lacks approval",async()=>{
    query.mockImplementation(async(sql:string)=>{
      if(sql.includes("SELECT DISTINCT slug"))return {rows:[{slug:"campaign-a"},{slug:"campaign-b"}],rowCount:2};
      if(sql.includes("LEFT JOIN public.commercial_resource_artworks"))
        return {rows:[selected[0],{...selected[1],artwork_id:null}],rowCount:2};
      return {rows:[],rowCount:0};
    });
    const response=await publish();
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/No se publicó ninguna/);
    const sql=query.mock.calls.map(x=>x[0]);
    expect(sql).toContain("ROLLBACK");
    expect(sql.some(x=>x.includes("UPDATE public.commercial_resource_templates"))).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it("reverts all changes if the second UPDATE fails or updates fewer rows",async()=>{
    query.mockImplementation(async(sql:string)=>{
      if(sql.includes("SELECT DISTINCT slug"))return {rows:[{slug:"campaign-a"},{slug:"campaign-b"}],rowCount:2};
      if(sql.includes("LEFT JOIN public.commercial_resource_artworks"))
        return {rows:selected,rowCount:2};
      if(sql.includes("SET status='retired'"))return {rows:[{id:"old"}],rowCount:1};
      if(sql.includes("SET status='published',published_by"))
        return {rows:[{id:ids[0]}],rowCount:1};
      return {rows:[],rowCount:0};
    });
    const errorSpy=jest.spyOn(console,"error").mockImplementation(()=>{});
    const response=await publish();
    expect(response.status).toBe(503);
    expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
