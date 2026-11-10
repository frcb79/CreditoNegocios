import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  commercialBulkPublishSchema, bulkPublicationBlockers,
  type CommercialPublicationCandidate,
} from "../../server/commercialBulkPublication";

const id=(suffix:string)=>"a97507e9-46c2-4c39-88bb-"+suffix.padStart(12,"0");
const draft=(n:number,props:Partial<CommercialPublicationCandidate>={}):CommercialPublicationCandidate=>({
  id:id(String(n)),slug:"template-"+n,name:"Plantilla "+n,status:"draft",
  definition:{headline:"Contenido comercial aprobado"},artwork_id:null,
  ...props,
});
const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("Commercial Resources — atomic batch publication",()=>{
  it("accepts a unique, explicitly approved selection of up to 200 drafts",()=>{
    const one=commercialBulkPublishSchema.safeParse({
      ids:[id("1"),id("2")],editorialLegalApproved:true,
    });
    expect(one.success).toBe(true);
    expect(commercialBulkPublishSchema.safeParse({
      ids:[id("1"),id("1")],editorialLegalApproved:true,
    }).success).toBe(false);
    expect(commercialBulkPublishSchema.safeParse({
      ids:[id("1")],editorialLegalApproved:false,
    }).success).toBe(false);
    expect(commercialBulkPublishSchema.safeParse({
      ids:[],editorialLegalApproved:true,
    }).success).toBe(false);
    expect(commercialBulkPublishSchema.safeParse({
      ids:Array.from({length:201},(_,i)=>id(String(i+1))),
      editorialLegalApproved:true,
    }).success).toBe(false);
    expect(commercialBulkPublishSchema.safeParse({
      ids:[id("1")],editorialLegalApproved:true,deleteAfterPublishing:true,
    }).success).toBe(false);
  });

  it("allows distinct approved drafts including graphics with original PNG",()=>{
    const rows=[
      draft(1),
      draft(2,{definition:{graphic:{typographyReviewRequired:false}},
        artwork_id:id("200")}),
    ];
    expect(bulkPublicationBlockers(rows.map(r=>r.id),rows)).toEqual([]);
  });

  it("blocks missing, superseded or duplicated selections BEFORE any mutation",()=>{
    expect(bulkPublicationBlockers([id("1"),id("2")],[draft(1)])).not.toHaveLength(0);
    expect(bulkPublicationBlockers([id("1")],
      [draft(1,{status:"published"})]).join(" ")).toMatch(/ya no es un borrador/);
    const dup=[draft(1),draft(2,{slug:"template-1"})];
    expect(bulkPublicationBlockers(dup.map(x=>x.id),dup).join(" ")).toMatch(/dos versiones/);
  });

  it("blocks artwork missing an original PNG or requiring typography approval",()=>{
    const withoutPng=draft(1,{definition:{graphic:{typographyReviewRequired:false}}});
    expect(bulkPublicationBlockers([withoutPng.id],[withoutPng]).join(" ")).toMatch(/PNG/);
    const pending=draft(1,{definition:{graphic:{typographyReviewRequired:true}},
      artwork_id:id("200")});
    expect(bulkPublicationBlockers([pending.id],[pending]).join(" ")).toMatch(/tipografía/);
  });

  it("backend is Super Admin-only, per-slug locked, all-or-nothing and keeps history",()=>{
    const routes=source("server/commercialResourcesRoutes.ts");
    const start=routes.indexOf('app.post("/api/admin/commercial-resources/drafts/publish"');
    const end=routes.indexOf('app.post("/api/admin/commercial-resources/templates/:id/publish"',start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const endpoint=routes.slice(start,end);
    expect(endpoint).toContain('user?.role!=="super_admin"');
    expect(endpoint).toContain("commercialBulkPublishSchema.safeParse(req.body)");
    expect(endpoint).toContain('await client.query("BEGIN")');
    expect(endpoint).toContain("ORDER BY slug");
    expect(endpoint).toContain("pg_advisory_xact_lock");
    expect(endpoint).toContain("FOR UPDATE OF t");
    expect(endpoint).toContain("bulkPublicationBlockers(");
    expect(endpoint.indexOf("bulkPublicationBlockers(")).toBeLessThan(
      endpoint.indexOf("SET status='retired'"));
    expect(endpoint).toContain("status='published',published_by=$2,published_at=NOW()");
    expect(endpoint).toContain("published.rowCount!==ids.length");
    expect(endpoint).toContain('await client.query("COMMIT")');
    expect(endpoint).toContain('await client.query("ROLLBACK")');
    expect(endpoint).not.toContain("DELETE FROM");
  });

  it("the bulk publish button opens a review modal and requests approval",()=>{
    const ui=source("client/src/components/Commercial/CommercialResourcesAdmin.tsx");
    expect(ui).toContain('data-testid="select-filtered-drafts"');
    expect(ui).toContain('data-testid="publish-selected-drafts"');
    expect(ui).toContain('data-testid="resource-bulk-publish-dialog"');
    expect(ui).toContain('data-testid="resource-bulk-publish-approval"');
    expect(ui).toContain('data-testid="confirm-bulk-publish"');
    expect(ui).toContain('data-testid="resource-bulk-keep-latest"');
    expect(ui).toContain("item.version>current.version");
    expect(ui).toContain('"/api/admin/commercial-resources/drafts/publish"');
    expect(ui).toContain("editorialLegalApproved:true");
    expect(ui).toContain("duplicatedSlugCount===0&&typographyPending===0");
    expect(ui).toContain("setSelectedDraftIds(previous=>previous.filter(id=>!ids.includes(id)))");
  });
});
