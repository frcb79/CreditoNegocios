import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {isPublicProspectJourneyPath} from "../../shared/publicProspectRouteGuard";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const token="q".repeat(32);
describe("Public acquisition route isolation",()=>{
  it("accepts only personal token paths, never app or malformed routes",()=>{
    expect(isPublicProspectJourneyPath("/c/"+token)).toBe(true);
    expect(isPublicProspectJourneyPath("/completar-perfil/"+token)).toBe(true);
    for(const path of ["/","/clientes","/configuracion","/recursos-comerciales",
      "/c/x","/c/"+token+"/clientes","/completar-perfil/"+token+"/admin",
      "/c/%2e%2e%2fclientes","/clientes/"+token])
      expect(isPublicProspectJourneyPath(path)).toBe(false);
  });
  it("renders guest-only public routes without mounting protected app or redirects",()=>{
    const app=source("client/src/App.tsx");
    const guest=app.slice(app.indexOf("function GuestProspectRouter()"),
      app.indexOf("function App()"));
    expect(guest).toContain('<Route path="/c/:token"');
    expect(guest).toContain('<Route path="/completar-perfil/:token"');
    expect(guest).not.toContain("ProtectedRoute");
    expect(guest).not.toContain("Redirect");
    expect(app).toContain("publicJourney ? <GuestProspectRouter/>");
    expect(app).toContain("<NotificationProvider><Router/></NotificationProvider>");
  });
  it("public APIs never require, mint or expose authenticated sessions",()=>{
    const campaign=source("server/campaignAcquisitionRoutes.ts");
    const completion=source("server/prospectCompletionRoutes.ts");
    const landing=source("client/src/pages/PublicCampaignLanding.tsx");
    const publicForm=source("client/src/pages/PublicProspectCompletion.tsx");
    expect(campaign).toContain('app.get("/api/public/campaign/:token"');
    expect(campaign).toContain('app.post("/api/public/campaign/:token/submit"');
    expect(completion).toContain('app.get("/api/public/prospect-completion/:token"');
    expect(completion).toContain('app.post("/api/public/prospect-completion/:token"');
    expect(landing).toContain('credentials:"omit"');
    expect(publicForm).toContain('credentials:"omit"');
    expect(completion).toContain("l.used_at IS NULL");
    expect(completion).toContain("l.disabled_at IS NULL");
    expect(completion).toContain("l.expires_at>NOW()");
    expect(completion).toContain('res.setHeader("Cache-Control", "private, no-store")');
    const publicRoutes=completion.slice(completion.indexOf('app.get("/api/public/prospect-completion/'));
    expect(publicRoutes).not.toContain("res.redirect(");
    expect(publicRoutes).not.toContain("req.login(");
    expect(publicRoutes).not.toContain("req.session.regenerate");
  });
});
