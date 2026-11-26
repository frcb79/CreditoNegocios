import {test,expect,devices} from "@playwright/test";
// Read-only staging check. No real customer creation, credit submission, or emails.
// Run explicitly with dedicated staging credentials and URL.
for(const [device,profile] of [["iPhone 13",devices["iPhone 13"]],["Pixel 7",devices["Pixel 7"]]] as const){
  for(const role of ["BRK","MB"] as const){
    test(device+" / "+role+" — client and opportunity entry",async({browser})=>{
      const email=process.env["STAGING_"+role+"_EMAIL"],password=process.env["STAGING_"+role+"_PASSWORD"];
      const base=process.env.STAGING_URL;
      test.skip(!email||!password||!base,"Dedicated staging account and URL required.");
      if(!base||new URL(base).hostname!=="creditonegocios-staging.up.railway.app")throw new Error("Only Railway staging is permitted.");
      const context=await browser.newContext({...profile,baseURL:base});
      try{
        await context.addInitScript(()=>{const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return k.startsWith("hasSeenTour_")?"true":get.call(this,k);};});
        const page=await context.newPage();await page.goto("/");
        await page.locator("#login-email").fill(email!);await page.locator("#login-password").fill(password!);await page.locator('button[type="submit"]').click();
        await page.waitForURL(u=>!u.pathname.includes("login"),{timeout:20000});
        await page.goto("/clientes");await page.getByTestId("button-new-client").click();
        const modal=page.getByRole("dialog");await expect(modal).toBeVisible();
        await page.getByTestId("option-select-empresarial").click();
        await expect(page.getByTestId("quick-client-form")).toBeVisible();
        await expect(page.getByTestId("button-submit-client")).toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
        await page.goto("/creditos");await page.getByTestId("button-request-credit").click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.getByTestId("select-client")).toBeVisible();
        const box=await page.getByRole("dialog").boundingBox();expect(box).not.toBeNull();expect(box!.width).toBeLessThanOrEqual(profile.viewport!.width);
        await expect(page.getByTestId("button-submit-request")).toBeVisible();
      }finally{await context.close();}
    });
  }
}
