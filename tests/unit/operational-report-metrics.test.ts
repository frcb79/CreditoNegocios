import { confirmedReportEvents,reportCommissionTotal } from "../../shared/operationalReportMetrics";
const period={start:new Date("2026-11-01T00:00:00Z"),end:new Date("2026-11-30T23:59:59Z")};
describe("Operational report integrity",()=>{
  it("uses actual dated verified tranches and excludes drafts, tracking-only records and old disbursements",()=>{
    const t=(amount:number,confirmedAt:string,status="confirmed")=>({confirmedAmount:amount,confirmedAt,status});
    const base={clientId:"client",createdAt:"2026-11-05",status:"approved"};
    const rows=[{...base,id:"draft"},{...base,id:"historical",status:"historical_recorded",finalProposal:{disbursementConfirmation:t(500,"2026-11-05")}},
      {...base,id:"real",createdAt:"2026-10-01",finalProposal:{disbursementTranches:[t(500,"2026-10-30"),t(300,"2026-11-05"),t(200,"2026-11-10"),t(999,"2026-11-10","reported")],disbursementConfirmation:t(200,"2026-11-10")}}];
    const events=confirmedReportEvents(rows,period);
    expect(events.map(e=>e.amount)).toEqual([300,200]);expect(new Set(events.map(e=>e.creditId)).size).toBe(1);
  });
  it("filters generated commissions by date and authorized role, not institutional gross",()=>{
    const base={status:"generated",createdAt:"2026-11-03",brokerId:"b",masterBrokerId:"m",brokerShare:"200",masterBrokerShare:"50",payoutAmount:250};
    const rows=[base,{...base,status:"cancelled"},{...base,createdAt:"2026-10-03"},{...base,brokerId:"m",masterBrokerShare:"100",brokerShare:"0",payoutAmount:100}];
    expect(reportCommissionTotal(rows,period,{role:"admin"})).toBe(350);
    expect(reportCommissionTotal(rows,period,{role:"master_broker",id:"m"})).toBe(150);
    expect(reportCommissionTotal(rows,period,{role:"broker",id:"b"})).toBe(200);
    expect(reportCommissionTotal(rows,period,{role:"broker",id:"other"})).toBe(0);
  });
});
