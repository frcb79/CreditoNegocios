import {test,expect,devices,chromium,webkit,type Page,type Locator} from "@playwright/test";
// Dedicated synthetic staging accounts only. No submission, email or production writes.
// npx playwright install chromium webkit
// npx playwright test tests/e2e/mobile-commercial-capture.spec.ts
async function fits(page:Page,locator:Locator){
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const b=await locator.boundingBox(),v=page.viewportSize();
  expect(b).not.toBeNull();expect(v).not.toBeNull();
  expect(b!.x).toBeGreaterThanOrEqual(-2);expect(b!.x+b!.width).toBeLessThanOrEqual(v!.width+2);
  expect(b!.y).toBeGreaterThanOrEqual(-2);expect(b!.y+b!.height).toBeLessThanOrEqual(v!.height+2);
}
async function noPageOverflow(page:Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
}
for(const [device,profile,engine] of [["iPhone 13",devices["iPhone 13"],webkit],["Pixel 7",devices["Pixel 7"],chromium]] as const){
  for(const role of ["BRK","MB"] as const){
    test(device+" / "+role+" — client and opportunity entry",async()=>{
      test.setTimeout(90000);
      const email=process.env["STAGING_"+role+"_EMAIL"],password=process.env["STAGING_"+role+"_PASSWORD"],base=process.env.STAGING_URL;
      test.skip(!email||!password||!base,"Dedicated staging account and URL required.");
      const url=new URL(base!);
      if(url.origin!=="https://creditonegocios-staging.up.railway.app"||url.username||url.password)throw new Error("Only Railway staging is permitted.");
      const browser=await engine.launch();
      try{
        const context=await browser.newContext({...profile,baseURL:base});
        await context.addInitScript(()=>{const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return k.startsWith("hasSeenTour_")?"true":get.call(this,k);};});
        const page=await context.newPage();await page.goto("/");
        await page.locator("#login-email").fill(email!);await page.locator("#login-password").fill(password!);await page.locator('button[type="submit"]').click();
        await expect(page.locator("#login-email")).toBeHidden({timeout:20000});
        await page.goto("/");
        const metrics=page.getByTestId("metrics-grid");
        await expect(metrics).toBeVisible();
        expect(await metrics.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(2);
        await noPageOverflow(page);
        await page.goto("/comisiones");
        await expect(page.getByTestId("input-search-commissions")).toBeVisible();
        await noPageOverflow(page);
        const open=async()=>{await page.goto("/clientes");await page.getByTestId("button-new-client").click();await expect(page.getByRole("dialog")).toBeVisible();};
        await open();await page.getByTestId("option-select-empresarial").click();
        await expect(page.getByTestId("quick-client-form")).toBeVisible();
        const types=await page.locator('[data-testid^="quick-type-"]').all();
        expect(types.length).toBe(4);
        const positions=await Promise.all(types.map(t=>t.boundingBox()));
        expect(positions.every(b=>b&&Math.abs(b.y-positions[0]!.y)<3)).toBe(true);
        await page.getByTestId("quick-type-fisica_empresarial").click();
        await expect(page.getByTestId("quick-tab-matching")).toBeDisabled();
        await page.getByTestId("quick-next-matching").click();
        await expect(page.getByText("Completa los datos de contacto señalados para continuar.")).toBeVisible();
        await page.getByTestId("quick-client-firstName").fill("Prospecto QA");
        await page.getByTestId("quick-client-phone").fill("5512345678");
        await page.getByTestId("quick-next-matching").click();
        await expect(page.getByTestId("quick-matching-panel")).toBeVisible();
        await expect(page.getByTestId("quick-client-firstName")).toBeHidden();
        await page.getByTestId("quick-client-industry").fill("Comercio");
        await page.getByTestId("quick-tab-contact").click();
        await expect(page.getByTestId("quick-client-firstName")).toHaveValue("Prospecto QA");
        await page.getByTestId("quick-tab-matching").click();
        await expect(page.getByTestId("quick-client-industry")).toHaveValue("Comercio");
        await fits(page,page.getByTestId("quick-save-and-profile"));
        await fits(page,page.getByTestId("button-submit-client"));await noPageOverflow(page);
        await open();await page.getByTestId("option-select-hipotecario").click();
        await expect(page.getByRole("dialog")).toBeVisible();await fits(page,page.getByTestId("button-save-mortgage-lead"));await noPageOverflow(page);
        await open();await page.getByTestId("option-select-arrendamiento").click();
        await expect(page.getByTestId("modal-leasing-lead")).toBeVisible();await fits(page,page.getByTestId("button-submit-leasing"));await noPageOverflow(page);
        await page.goto("/creditos");await page.getByTestId("button-request-credit").click();
        await expect(page.getByRole("dialog")).toBeVisible();await fits(page,page.getByTestId("select-client"));
        await fits(page,page.getByTestId("button-submit-request"));await noPageOverflow(page);
      }finally{await browser.close();}
    });
  }
}
