/** Reporting uses verified dated disbursement events, never approved/requested amounts or creation dates. */
export type ReportCredit = {id:string;clientId:string;status:string;createdAt?:Date|string|null;finalProposal?:unknown};
export type ReportCommission = {status:string;createdAt?:Date|string|null;brokerId?:string|null;masterBrokerId?:string|null;brokerShare?:string|null;masterBrokerShare?:string|null;payoutAmount?:unknown};
export type DatePeriod={start:Date;end:Date};
export function inReportPeriod(value:unknown,{start,end}:DatePeriod):boolean {
  if(!(value instanceof Date)&&typeof value!=="string")return false;
  const date=new Date(value);
  return Number.isFinite(date.getTime())&&date>=start&&date<=end;
}
function positive(value:unknown):number {
  if(typeof value!=="number"&&typeof value!=="string")return 0;
  const n=Number(value);return Number.isFinite(n)&&n>0?n:0;
}
export function confirmedReportEvents(credits:ReportCredit[],period:DatePeriod) {
  return credits.flatMap(credit=>{
    const proposal=(credit.finalProposal||{}) as Record<string,any>;
    if(credit.status==="historical_recorded"||proposal.historicalRecord)return [];
    const tranches=Array.isArray(proposal.disbursementTranches)?proposal.disbursementTranches:proposal.disbursementConfirmation?[proposal.disbursementConfirmation]:[];
    return tranches.filter((t:any)=>t?.status==="confirmed"&&positive(t.confirmedAmount)>0&&inReportPeriod(t.confirmedAt,period)).map((t:any)=>({creditId:credit.id,clientId:credit.clientId,date:new Date(t.confirmedAt),amount:positive(t.confirmedAmount)}));
  });
}
export function reportCommissionTotal(commissions:ReportCommission[],period:DatePeriod,user:{id?:string;role?:string}|null|undefined):number {
  return commissions.filter(c=>["pending","generated","approved","dispersing","paid"].includes(c.status)&&inReportPeriod(c.createdAt,period)).reduce((sum,c)=>{
    // Administrative total is the network payout, not institution gross or platform margin.
    if(user?.role==="admin"||user?.role==="super_admin")return sum+positive(c.payoutAmount);
    if(!user?.id)return sum;
    if(user.role==="master_broker"){
      if(c.brokerId===user.id)return sum+(positive(c.masterBrokerShare)||positive(c.brokerShare));
      if(c.masterBrokerId===user.id)return sum+positive(c.masterBrokerShare);
    }
    if(user.role==="broker"&&c.brokerId===user.id)return sum+positive(c.brokerShare);
    return sum;
  },0);
}
