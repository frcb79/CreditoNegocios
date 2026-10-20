import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
// @ts-ignore
import request from "supertest";
import * as XLSX from "xlsx";
import cron from "node-cron";
import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { pool } from "../../server/db";

function template(role="Broker",masterEmail=""):Buffer{
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ["nombre","apellido","correo","rol","correo_master_asignado","telefono","mensaje_personal"],
    ["Prueba","Segura",`test-${randomUUID()}@example.test`,role,masterEmail,"",""],
  ]),"Invitaciones");
  return XLSX.write(wb,{type:"buffer",bookType:"xlsx"}) as Buffer;
}

describe("SEC-INVITES: bulk preview and explicit send routes",()=>{
  let app:express.Express,server:Server;
  let user:any=null,superAdmin:any,broker:any;
  const courtesyCode = "COURTESY12-" + randomUUID().slice(0,8).toUpperCase();
  const previousDefaultPromo = process.env.INVITATION_WELCOME_PROMO_CODE;
  beforeAll(async()=>{
    process.env.NODE_ENV="test";
    app=express();app.use(express.json());
    app.use((req:any,_res,next)=>{
      req.isAuthenticated=()=>Boolean(user);
      req.user=user?{...user,claims:{sub:user.id}}:null;
      req.dbUser=user;
      next();
    });
    server=await registerRoutes(app);
    superAdmin=await storage.createUser({
      email:`super-invite-${randomUUID()}@example.test`,
      firstName:"SA",lastName:"Test",role:"super_admin",isActive:true,status:"active",
    } as any);
    broker=await storage.createUser({
      email:`broker-invite-${randomUUID()}@example.test`,
      firstName:"B",lastName:"Test",role:"broker",isActive:true,status:"active",
    } as any);
    await storage.createPromoCode({
      code: courtesyCode, name: "Cortesía de lanzamiento",
      benefitType: "free_months", benefitValue: "0", durationMonths: 12,
      targetScope: "global", isActive: true, maxUses: 100,
    } as any);
    process.env.INVITATION_WELCOME_PROMO_CODE = courtesyCode;
  });
  afterAll(async()=>{
    user=null;
    if (previousDefaultPromo === undefined) delete process.env.INVITATION_WELCOME_PROMO_CODE;
    else process.env.INVITATION_WELCOME_PROMO_CODE = previousDefaultPromo;
    cron.getTasks().forEach((task:any)=>task.stop());
    if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
    try{await pool.end();}catch{}
  });
  beforeEach(()=>{user=null;});
  it("requires authenticated Super Admin even for preview",async()=>{
    const file=template();
    let r=await request(app).post("/api/broker-invitations/bulk/preview").attach("file",file,"carga.xlsx");
    expect(r.status).toBe(401);
    user=broker;
    r=await request(app).post("/api/broker-invitations/bulk/preview").attach("file",file,"carga.xlsx");
    expect(r.status).toBe(403);
  });
  it("refuses a batch with no configured coupon before sending",async()=>{
    user=superAdmin;
    delete process.env.INVITATION_WELCOME_PROMO_CODE;
    const r=await request(app).post("/api/broker-invitations/bulk/preview")
      .attach("file",template(),"carga.xlsx");
    expect(r.status).toBe(200);
    expect(r.body.ready).toBe(false);
    expect(r.body.errors.some((x:any)=>x.field==="codigo_promocional")).toBe(true);
    process.env.INVITATION_WELCOME_PROMO_CODE = courtesyCode;
  });
  it("previews valid invites without creating accounts",async()=>{
    user=superAdmin;
    const file=template();
    const response=await request(app).post("/api/broker-invitations/bulk/preview")
      .attach("file",file,"carga.xlsx");
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
    expect(response.body.total).toBe(1);
    expect(response.body.errors).toHaveLength(0);
    const users=await storage.getAllUsers();
    expect(users.some(u=>u.email===response.body.rows[0].email)).toBe(false);
  });
  it("requires explicit send confirmation before any account creation or mail",async()=>{
    user=superAdmin;
    const file=template();
    const response=await request(app).post("/api/broker-invitations/bulk/send")
      .attach("file",file,"carga.xlsx");
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Confirma/);
  });
  it("reports unknown Master and prevents sending",async()=>{
    user=superAdmin;
    const r=await request(app).post("/api/broker-invitations/bulk/preview")
      .attach("file",template("Broker","no-master@example.test"),"carga.xlsx");
    expect(r.status).toBe(200);
    expect(r.body.ready).toBe(false);
    expect(r.body.errors.some((x:any)=>x.field==="correo_master_asignado")).toBe(true);
  });
  it("serves the official XLSX template only to Super Admin",async()=>{
    user=broker;
    const denied=await request(app).get("/api/broker-invitations/bulk/template");
    expect(denied.status).toBe(403);
    user=superAdmin;
    const ok=await request(app).get("/api/broker-invitations/bulk/template");
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/spreadsheet/);
    expect(ok.headers["content-disposition"]).toMatch(/CreditoNegocios_Invitaciones/);
  });
});
