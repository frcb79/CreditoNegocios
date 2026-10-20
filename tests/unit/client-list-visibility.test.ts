import { filterAuthorizedClientListing } from "../../server/clientListVisibility";

describe("client list obeys individual commercial authorization (P0)",()=>{
  const clients=Array.from({length:20},(_,i)=>({id:"client-"+i,brokerId:i%2?"other":"own"}));
  it("never returns a sibling Broker's clients merely because they share a tenant",async()=>{
    const visible=await filterAuthorizedClientListing(clients,async c=>c.brokerId==="own");
    expect(visible.map(c=>c.id)).toEqual(clients.filter(c=>c.brokerId==="own").map(c=>c.id));
  });
  it("denies when a commercial relationship/authorization check errors",async()=>{
    const visible=await filterAuthorizedClientListing(clients,async c=>{
      if(c.id==="client-0")throw new Error("lookup failed");
      return c.id==="client-1";
    });
    expect(visible.map(c=>c.id)).toEqual(["client-1"]);
  });
  it("preserves authorized result order and never authorizes unchecked entries",async()=>{
    const checked:string[]=[];
    const visible=await filterAuthorizedClientListing(clients,async c=>{
      checked.push(c.id);
      return ["client-4","client-12"].includes(c.id);
    });
    expect(visible.map(c=>c.id)).toEqual(["client-4","client-12"]);
    expect(checked).toHaveLength(clients.length);
  });
  it("filters document metadata by per-document access", async () => {
    const docs = [{id:"a",brokerId:"mine"},{id:"b",brokerId:"another"}];
    const allowed = await filterAuthorizedClientListing(docs, async d => d.brokerId==="mine");
    expect(allowed).toEqual([docs[0]]);
  });
  it("fails closed for document permission errors", async () => {
    const docs = [{id:"a"},{id:"b"}];
    const allowed = await filterAuthorizedClientListing(docs, async d => {
      if(d.id==="b")throw new Error("denied");
      return true;
    });
    expect(allowed).toEqual([docs[0]]);
  });

});
