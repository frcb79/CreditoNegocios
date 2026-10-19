import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeIsolatedTestDatabase } from '../testDbSafety';
import { BenefitError, calendarMonths, changeUserBenefit, effectiveRedemptionStatus, userBenefitHistory } from '../../server/promoBenefitManagement';

const url = process.env.TEST_DATABASE_URL;
if (url) assertSafeIsolatedTestDatabase(url);
const describePg = url ? describe : describe.skip;
const schemaName = 'benefit_prelaunch_test';
const uid = randomUUID();
const sa = 'super-' + uid, admin = 'admin-' + uid, broker = 'broker-' + uid, master = 'master-' + uid;
let database:pg.Pool;

describe('Beneficios: fechas y estado efectivo sin cobros', () => {
  it('usa meses calendario reales y respeta el fin de mes', () => {
    expect(calendarMonths(new Date('2026-01-31T10:30:00Z'),1).toISOString()).toBe('2026-02-28T10:30:00.000Z');
    expect(calendarMonths(new Date('2026-10-19T10:30:00Z'),12).toISOString()).toBe('2027-10-19T10:30:00.000Z');
    expect(() => calendarMonths(new Date(),0)).toThrow(BenefitError);
  });
  it('expira sin afectar la operación', () => {
    expect(effectiveRedemptionStatus({status:'active',expires_at:new Date('2020-01-01')})).toBe('expired');
    expect(effectiveRedemptionStatus({status:'revoked',expires_at:null})).toBe('revoked');
  });
});

describePg('PostgreSQL aislado: administración atómica, roles e historial', () => {
  beforeAll(async () => {
    const setup = new pg.Pool({connectionString:url});
    await setup.query('CREATE SCHEMA IF NOT EXISTS ' + schemaName);
    await setup.query('DROP TABLE IF EXISTS ' + schemaName + '.commercial_audit_logs CASCADE');
    await setup.query('DROP TABLE IF EXISTS ' + schemaName + '.promo_redemptions CASCADE');
    await setup.query('DROP TABLE IF EXISTS ' + schemaName + '.promo_codes CASCADE');
    await setup.query('DROP TABLE IF EXISTS ' + schemaName + '.users CASCADE');
    await setup.query('CREATE TABLE ' + schemaName + '.users (id text primary key, role text not null, first_name text, last_name text, is_active boolean default true, status text default \'active\', access_status text default \'free\', access_status_expires_at timestamp, access_status_notes text, active_promo_id text, updated_at timestamp)');
    await setup.query('CREATE TABLE ' + schemaName + '.promo_codes (id text primary key, code text unique not null, name text, benefit_type text, benefit_value numeric, duration_months integer, starts_at timestamp default now(), expires_at timestamp, is_active boolean default true, current_uses integer default 0, max_uses integer, target_scope text, target_entity_id text, updated_at timestamp)');
    await setup.query('CREATE TABLE ' + schemaName + '.promo_redemptions (id uuid primary key default gen_random_uuid(), promo_code_id text not null references ' + schemaName + '.promo_codes(id), user_id text not null references ' + schemaName + '.users(id), applied_at timestamp default now(), starts_at timestamp, expires_at timestamp, status text default \'active\', metadata jsonb default \'{}\')');
    await setup.query('CREATE TABLE ' + schemaName + '.commercial_audit_logs (id uuid primary key default gen_random_uuid(), entity_type text, entity_id text, broker_id text, performed_by text, action text, previous_state text, new_state text, metadata jsonb, created_at timestamp default now())');
    await setup.end();
    database = new pg.Pool({connectionString:url, options:'-c search_path=' + schemaName});
  });
  afterAll(async () => {
    await database?.end();
    const setup = new pg.Pool({connectionString:url});
    await setup.query('DROP SCHEMA IF EXISTS ' + schemaName + ' CASCADE');
    await setup.end();
  });
  beforeEach(async () => {
    await database.query('TRUNCATE commercial_audit_logs,promo_redemptions,promo_codes,users CASCADE');
    await database.query("INSERT INTO users(id,role) VALUES ($1,'super_admin'),($2,'admin'),($3,'broker'),($4,'master_broker')",[sa,admin,broker,master]);
    await database.query("INSERT INTO promo_codes(id,code,name,benefit_type,benefit_value,duration_months,max_uses,target_scope) VALUES ('c3','COURTESY3','3 meses','free_months',0,3,40,'global'),('c12','ANUAL12','12 meses','free_months',0,12,44,'global'),('d50','DESC50','50%','percentage_discount',50,6,40,'global')");
  });
  const change=(userId:string, action:'assign'|'replace'|'extend'|'revoke'|'redeem', extra:any={}) =>
    changeUserBenefit({actorId:sa,userId,action,reason:'Acuerdo comercial documentado',...extra},database);
  it('asigna individual a Broker, cuenta un cupo y audita responsable', async () => {
    const r=await change(broker,'assign',{code:'COURTESY3'});
    expect(r.accessStatus).toBe('promotional');
    expect(r.expiresAt).toBeTruthy();
    const h=await userBenefitHistory(broker,database);
    expect(h.redemptions).toHaveLength(1);
    expect(h.changes[0].performed_by).toBe(sa);
    const count=await database.query("SELECT current_uses FROM promo_codes WHERE id='c3'");
    expect(Number(count.rows[0].current_uses)).toBe(1);
  });
  it('extiende una cortesía del Master seis meses sin nuevo canje', async () => {
    const first=await change(master,'assign',{code:'COURTESY3'});
    const next=await change(master,'extend',{months:6});
    expect(next.expiresAt?.getTime()).toBeGreaterThan(first.expiresAt!.getTime());
    const h=await userBenefitHistory(master,database);
    expect(h.redemptions).toHaveLength(1);
    expect(h.changes.map(x=>x.action)).toEqual(['benefit_extend','benefit_assign']);
  });
  it('sustituye cortesía por descuento 50% y conserva ambos beneficios', async () => {
    await change(broker,'assign',{code:'COURTESY3'});
    await change(broker,'replace',{code:'DESC50',months:4});
    const h=await userBenefitHistory(broker,database);
    expect(h.redemptions).toHaveLength(2);
    expect(h.redemptions.filter(x=>x.effectiveStatus==='active')).toHaveLength(1);
    expect(h.redemptions.find(x=>x.code==='COURTESY3')?.status).toBe('revoked');
    expect(h.redemptions.find(x=>x.code==='DESC50')?.metadata?.billingConfigured).toBe(false);
  });
  it('revoca manualmente con motivo sin suspender acceso ni créditos', async () => {
    await change(master,'assign',{code:'COURTESY3'});
    await change(master,'revoke');
    const h=await userBenefitHistory(master,database);
    expect(h.redemptions[0].effectiveStatus).toBe('revoked');
    const u=await database.query('SELECT access_status,active_promo_id,status FROM users WHERE id=$1',[master]);
    expect(u.rows[0]).toMatchObject({access_status:'free',active_promo_id:null,status:'active'});
  });
  it('solo Super Admin puede editar; Broker/Master/Admin no pueden administrar terceros', async () => {
    for (const actorId of [broker,master,admin]) {
      await expect(changeUserBenefit({actorId,userId:broker,action:'assign',code:'COURTESY3',reason:'No autorizado'},database)).rejects.toMatchObject({status:403});
    }
    expect((await database.query('SELECT count(*)::int AS n FROM promo_redemptions')).rows[0].n).toBe(0);
  });
  it('canje individual por cuenta activa sin privilegios administrativos ni cambio de duración', async () => {
    const r=await changeUserBenefit({actorId:broker,userId:broker,action:'redeem',code:'COURTESY3'},database);
    expect(r.accessStatus).toBe('promotional');
    await expect(changeUserBenefit({actorId:broker,userId:broker,action:'redeem',code:'COURTESY3'},database)).rejects.toMatchObject({status:409});
    await expect(changeUserBenefit({actorId:broker,userId:master,action:'redeem',code:'ANUAL12'},database)).rejects.toMatchObject({status:403});
    await expect(changeUserBenefit({actorId:master,userId:master,action:'redeem',code:'ANUAL12',months:24},database)).rejects.toMatchObject({status:403});
  });
  it('respeta destinatarios de códigos ligados a un Broker o Master específico', async () => {
    await database.query(
      "INSERT INTO promo_codes(id,code,name,benefit_type,benefit_value,duration_months,target_scope,target_entity_id) VALUES ('targeted-broker','DIRECTBROKER','Beneficio individual','free_months',0,6,'broker',$1),('targeted-master','DIRECTMASTER','Beneficio Master','free_months',0,6,'master_broker',$2),('targeted-global','DIRECTGLOBAL','Beneficio restringido','free_months',0,6,'global',$1)",
      [broker,master]
    );
    // Mismo rol no basta: destinatario incorrecto se rechaza incluso en autocanje.
    await expect(changeUserBenefit({actorId:master,userId:master,action:'redeem',code:'DIRECTBROKER'},database)).rejects.toMatchObject({status:403});
    await expect(change(broker,'assign',{code:'DIRECTMASTER'})).rejects.toMatchObject({status:403});
    await expect(change(master,'assign',{code:'DIRECTGLOBAL'})).rejects.toMatchObject({status:403});
    expect((await database.query('SELECT count(*)::int AS n FROM promo_redemptions')).rows[0].n).toBe(0);
    expect((await database.query("SELECT current_uses FROM promo_codes WHERE id='targeted-broker'")).rows[0].current_uses).toBe(0);
    // Sí se concede al destinatario previsto; nunca se rechaza por su propia restricción.
    await change(broker,'assign',{code:'DIRECTBROKER'});
    await change(master,'assign',{code:'DIRECTMASTER'});
    expect((await database.query('SELECT count(*)::int AS n FROM promo_redemptions')).rows[0].n).toBe(2);
  });
  it('bloquea canje doble en concurrencia y no sobrevende cupos', async () => {
    const results=await Promise.allSettled([
      change(broker,'assign',{code:'COURTESY3'}),
      change(broker,'assign',{code:'COURTESY3'}),
    ]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    const used=await database.query("SELECT current_uses FROM promo_codes WHERE id='c3'");
    expect(Number(used.rows[0].current_uses)).toBe(1);
    expect((await userBenefitHistory(broker,database)).redemptions).toHaveLength(1);
  });
  it('desactivar el catálogo no revoca una cortesía ya otorgada', async () => {
    await change(broker,'assign',{code:'ANUAL12'});
    await database.query("UPDATE promo_codes SET is_active=false WHERE id='c12'");
    expect((await userBenefitHistory(broker,database)).redemptions[0].effectiveStatus).toBe('active');
    await change(broker,'extend',{months:3});
    expect((await userBenefitHistory(broker,database)).redemptions).toHaveLength(1);
    await expect(change(master,'assign',{code:'ANUAL12'})).rejects.toMatchObject({status:409});
  });
  it('identifica expirados históricos y permite nuevo beneficio sin cobrar', async () => {
    await database.query("INSERT INTO promo_redemptions(promo_code_id,user_id,starts_at,expires_at,status) VALUES ('c12',$1,NOW() - INTERVAL '13 months',NOW() - INTERVAL '1 month','active')",[broker]);
    expect((await userBenefitHistory(broker,database)).redemptions[0].effectiveStatus).toBe('expired');
    await change(broker,'assign',{code:'COURTESY3'});
    expect((await userBenefitHistory(broker,database)).redemptions).toHaveLength(2);
  });
});
