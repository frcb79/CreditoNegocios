import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderCommercialActivationWelcome } from "../../server/commercialWelcomeEmail";

const token="A".repeat(32);
const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
describe("Issue #63 – activation welcome and confidentiality",()=>{
  const broker=renderCommercialActivationWelcome({
    firstName:"María O'Hara",role:"broker",
    appBaseUrl:"https://app.creditonegocios.com.mx",campaignToken:token
  });
  const master=renderCommercialActivationWelcome({
    firstName:"Jorge",role:"master_broker",
    appBaseUrl:"https://app.creditonegocios.com.mx",campaignToken:token
  });
  it("offers practical first-ten-minutes steps with a real configured app path",()=>{
    expect(broker.subject).toContain("primer prospecto");
    expect(broker.html).toContain("Tu primer prospecto en 10 minutos");
    expect(broker.html).toContain("/recursos-comerciales");
    expect(broker.html).toContain("/clientes");
    expect(broker.html).not.toContain("/c/"+token);
    expect(broker.text).not.toContain("/c/"+token);
    expect(broker.html).not.toContain("utm_source=");
    expect(broker.text).not.toContain("utm_medium=");
    expect(broker.html).toContain("Obtener mi enlace");
    expect(broker.html).toContain("Tu enlace de captación");
    expect(broker.text).toContain("Obtener mi enlace");
    // The server can still prepare a stable attributed URL without printing it in the email.
    expect(broker.captureUrl).toContain("/c/"+token);
    expect(broker.captureUrl).toContain("utm_source=redes_sociales");
    expect(broker.text).toContain("Crear Enlace a Prospecto");
    expect(broker.html).toContain("María O&#39;Hara");
  });
  it("uses a distinct master network message and illustrative numbers",()=>{
    expect(master.text).toContain("Master Broker");
    expect(master.text).toContain("tu red");
    expect(broker.text).not.toContain("Como Master Broker");
    for(const output of [broker,master]){
      expect(output.html).toContain("Tu próxima comisión puede estar entre tus contactos");
      expect(output.html.indexOf("$15,000")).toBeLessThan(output.html.indexOf("Tu primer prospecto en 10 minutos"));
      expect(output.html.indexOf("$20,000")).toBeLessThan(output.html.indexOf("Tu primer prospecto en 10 minutos"));
      expect(output.text.indexOf("$15,000")).toBeLessThan(output.text.indexOf("Tu meta para los próximos 10 minutos"));
      expect(output.html).toContain("$15,000");
      expect(output.html).toContain("$20,000");
      expect(output.text).toContain("1.5%");
      expect(output.text).toContain("2%");
      expect(output.text).toContain("No son promesas");
      expect(output.html.toLowerCase()).not.toContain("sobretasa");
      expect(output.html).not.toContain("Crédito Negocios paga");
      expect(output.text).toContain("No implica suscripción a newsletters");
      expect(output.html).toContain("Mensaje transaccional");
    }
  });
  it("escapes untrusted display names and never embeds an unauthorized origin",()=>{
    const data=renderCommercialActivationWelcome({
      firstName:"<script>alert('x')</script>",role:"broker",
      appBaseUrl:"https://app.creditonegocios.com.mx",campaignToken:token
    });
    expect(data.html).not.toContain("<script>");
    expect(data.html).toContain("&lt;script&gt;");
    expect(()=>renderCommercialActivationWelcome({
      firstName:"Example",role:"broker",
      appBaseUrl:"http://untrusted.example",campaignToken:token
    })).toThrow(/HTTPS/);
    expect(()=>renderCommercialActivationWelcome({
      firstName:"Example",role:"broker",
      appBaseUrl:"https://app.creditonegocios.com.mx",campaignToken:"invalid"
    })).toThrow(/Token/);
  });
  it("adds exactly one private database event within initial activation transaction",()=>{
    const storage=source("server/dbStorage.ts");
    const fn=storage.slice(storage.indexOf("async completeInvitationActivation("),
      storage.indexOf("async createCommercialAuditLog("));
    expect(fn).toContain("broker_activation_welcome_events");
    expect(fn).toMatch(/ON CONFLICT\s*\(user_id\)\s*DO NOTHING/);
    expect(fn.indexOf("broker_activation_welcome_events")).toBeLessThan(fn.indexOf("return [terms, privacy]"));
    const routes=source("server/routes.ts");
    expect(routes).toContain("if (wasInvitation && (user.role === \"broker\"");
    const migration=source("server/autoMigrate.ts");
    expect(migration).toContain("broker_activation_welcome_events");
    expect(migration).toContain("PRIMARY KEY REFERENCES public.users(id)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });
  it("refuses to email staging and claims before provider call",()=>{
    const service=source("server/commercialWelcomeService.ts");
    expect(service).toContain('process.env.RAILWAY_ENVIRONMENT_NAME !== "production"');
    expect(service).toContain("WHERE user_id=$1 AND status='pending' RETURNING user_id");
    expect(service.indexOf("status='pending' RETURNING user_id")).toBeLessThan(service.indexOf("resend.emails.send("));
    expect(service).toContain("no automatic retry");
  });
});
