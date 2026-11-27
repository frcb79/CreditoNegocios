import {test,expect,type Page} from "@playwright/test";

// Deliberately opt-in: dedicated synthetic Railway staging only.
// Never run against production, and never submit commercial or financial actions.
const widths=[360,390,768,1024,1280,1366,1440,1920] as const;
const heights=[800,844,1024,768,800,768,900,1080] as const;
const base=process.env.STAGING_URL;
const roles=["SA","ADM","MB","BRK"] as const;
const common=["/","/clientes","/creditos","/re-gestion","/comisiones","/financieras","/sistema-productos","/documentos","/configuracion","/mis-solicitudes","/notificaciones","/ayuda","/recursos-comerciales","/admin/usuarios"];
const management=["/red-brokers","/reportes"];
const admin=["/solicitudes-pendientes","/importacion-masiva"];

async function bounds(page:Page){
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
  const clipped=await page.evaluate(()=>{
    const selectors='[data-testid="header-action-button"],[data-testid="button-open-sidebar"],[data-testid="button-new-client"],[data-testid="header-title"],[data-testid="metrics-grid"] [data-testid$="-value"]';
    return [...document.querySelectorAll<HTMLElement>(selectors)].filter(e=>{
      const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility==="visible"&&(r.left< -2||r.right>innerWidth+2||e.scrollWidth>e.clientWidth+2);
    }).map(e=>e.dataset.testid);
  });
  expect(clipped).toEqual([]);
}
for(const [i,width] of widths.entries()){
  for(const role of roles){
    test(`Responsive ${width} / ${role}`,async({page},info)=>{
      test.setTimeout(240000);
      const email=process.env["STAGING_"+role+"_EMAIL"],password=process.env["STAGING_"+role+"_PASSWORD"];
      test.skip(!base||process.env.STAGING_QA_SYNTHETIC!=="true"||!email||!password,"Dedicated synthetic QA credentials required");
      if(new URL(base!).origin!=="https://creditonegocios-staging.up.railway.app")throw Error("Only existing Railway staging is allowed");
      await page.setViewportSize({width,height:heights[i]});
      await page.addInitScript(()=>{const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return k.startsWith("hasSeenTour_")?"true":get.call(this,k);};});
      await page.goto(base!);
      await page.locator("#login-email").fill(email!);
      await page.locator("#login-password").fill(password!);
      await page.locator('button[type="submit"]').click();
      await expect(page.locator("#login-email")).toBeHidden({timeout:20000});
      // From this point block all non-read requests, including any accidental approval or send.
      await page.route("**/api/**",route=>["GET","HEAD","OPTIONS"].includes(route.request().method())?route.continue():route.abort());
      const routes=[...common,...(role!=="BRK"?management:[]),...(role==="SA"||role==="ADM"?admin:[]),...(role==="SA"?["/admin/auditoria"]:[])];
      for(const path of routes){
        await test.step(path,async()=>{
          await page.goto(base!+path);
          await expect(page.locator(".cn-workspace")).toBeVisible();
          await expect(page.locator("#login-email")).toBeHidden();
          await bounds(page);
          if(path==="/"){
            await expect(page.getByTestId("metrics-grid")).toBeVisible();
            await bounds(page);
          }
          if(path==="/clientes"){
            await expect(page.getByTestId("button-new-client")).toBeVisible();
            await page.getByTestId("button-new-client").click();
            const modal=page.getByRole("dialog");
            await expect(modal).toBeVisible();
            const box=await modal.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.x).toBeGreaterThanOrEqual(-2);
            expect(box!.x+box!.width).toBeLessThanOrEqual(width+2);
            expect(box!.y).toBeGreaterThanOrEqual(-2);
            expect(box!.y+box!.height).toBeLessThanOrEqual(heights[i]+2);
            await page.keyboard.press("Escape");
          }
          if(path==="/admin/auditoria"){
            await page.getByTestId("audit-tab-email").click();
            await expect(page.getByTestId("commercial-mail-drafts")).toBeVisible();
            await page.getByTestId("mail-panel-audience").click();
            await page.getByText("Nombre",{exact:true}).locator("input").fill("Borrador visual QA");
            await page.getByTestId("mail-panel-content").click();
            await page.getByTestId("mail-panel-audience").click();
            await expect(page.getByText("Nombre",{exact:true}).locator("input")).toHaveValue("Borrador visual QA");
            await page.getByTestId("commercial-mail-history").click();
            await bounds(page);
            await page.getByTestId("commercial-mail-campaign").click();
            await page.getByTestId("mail-panel-calendar").click();
            await bounds(page);
            await page.getByTestId("mail-panel-tests").click();
            await bounds(page);
          }
          await page.screenshot({path:info.outputPath(path.replace(/[^a-z0-9]+/gi,"-")+".png"),fullPage:true});
        });
      }
      if(role!=="SA"){
        await page.goto(base!+"/admin/auditoria");
        await expect(page.getByText("No tienes permisos para ver esta sección")).toBeVisible();
        await bounds(page);
      }
    });
  }
}
