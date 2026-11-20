import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { usesFirstPartyApiProxy } from "../../client/src/lib/apiOriginPolicy";

const text=(file:string)=>readFileSync(resolve(process.cwd(),file),"utf8");

describe("First-party session API routing — no DNS or subdomain changes",()=>{
  it("uses /api on the existing production and staging Vercel app hosts",()=>{
    for(const host of [
      "app.creditonegocios.com.mx",
      "credito-negocios.vercel.app",
      "credito-negocios-staging.vercel.app",
      "credito-negocios-staging-qrzqgshck-francos-projects-62938903.vercel.app",
      "credito-negocios-lydfthhqt-francos-projects-62938903.vercel.app",
      "APP.CREDITONEGOCIOS.COM.MX.",
    ])expect(usesFirstPartyApiProxy(host)).toBe(true);
  });

  it("never treats unrelated, landing, attacker or direct Railway hosts as the app proxy",()=>{
    for(const host of [
      "creditonegocios.com.mx",
      "www.creditonegocios.com.mx",
      "credito-negocios-landing.vercel.app",
      "credito-negocios-landing-test.vercel.app",
      "app.creditonegocios.com.mx.attacker.example",
      "creditonegocios-production.up.railway.app",
      "creditonegocios-staging.up.railway.app",
      "localhost",
      "sample.other-site.vercel.app",
    ])expect(usesFirstPartyApiProxy(host)).toBe(false);
  });

  it("honors the first-party path before the old Railway API env override",()=>{
    const code=text("client/src/lib/runtimeConfig.ts");
    expect(code.indexOf("usesFirstPartyApiProxy(window.location.hostname)"))
      .toBeLessThan(code.indexOf("import.meta.env.VITE_API_BASE_URL?.trim()"));
    expect(code).toContain('if (typeof window !== "undefined" &&');
    expect(code).toContain('usesFirstPartyApiProxy(window.location.hostname)) return "";');
    expect(code).toContain("return `${getApiBaseUrl()}${path}`");
    expect(code).toContain("buildWebSocketUrl(path)");
    expect(code).toContain("const override = import.meta.env.VITE_WS_BASE_URL?.trim()");
  });

  it("keeps production and staging backends isolated without changing known hostnames",()=>{
    const config=JSON.parse(text("vercel.json"));
    expect(config.rewrites).toHaveLength(3);
    const [staging,production,fallback]=config.rewrites;
    expect(staging.source).toBe("/api/(.*)");
    expect(staging.destination)
      .toBe("https://creditonegocios-staging.up.railway.app/api/$1");
    expect(production.destination)
      .toBe("https://creditonegocios-production.up.railway.app/api/$1");
    expect(production.has).toBeUndefined();
    expect(fallback).toEqual({source:"/(.*)",destination:"/index.html"});

    const hostRule=staging.has[0];
    expect(hostRule.type).toBe("host");
    const matcher=new RegExp("^"+hostRule.value+"$");
    for(const host of ["credito-negocios-staging.vercel.app",
      "credito-negocios-staging-abc-francos-projects-62938903.vercel.app"]){
      expect(matcher.test(host)).toBe(true);
    }
    for(const host of ["app.creditonegocios.com.mx","credito-negocios.vercel.app",
      "credito-negocios-landing.vercel.app","attacker.vercel.app"]){
      expect(matcher.test(host)).toBe(false);
    }
  });

  it("allows only exact public Vercel app origins through CSRF protections",()=>{
    const config=text("server/runtimeConfig.ts");
    expect(config).toContain('"https://app.creditonegocios.com.mx"');
    expect(config).toContain('"https://credito-negocios.vercel.app"');
    expect(config).toContain('process.env.RAILWAY_ENVIRONMENT_NAME==="staging"');
    expect(config).toContain('STAGING_AUTH_PREVIEW_ORIGIN');
    expect(config).toContain('francos-projects-62938903');
    expect(config).toContain('process.env.RAILWAY_ENVIRONMENT_NAME==="staging"');
    expect(config).toContain("if (allowedOrigins.has(norm)) return true");
    expect(config).toContain("return false;");
  });

  it("prohibits CDN caching for all authenticated API responses",()=>{
    const conf=JSON.parse(text("vercel.json"));
    expect(conf.headers).toEqual([{
      source:"/api/(.*)",
      headers:[
        {key:"x-vercel-enable-rewrite-caching",value:"0"},
        {key:"Cache-Control",value:"private, no-store"},
      ],
    }]);
  });
});
