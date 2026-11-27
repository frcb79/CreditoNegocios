export const COMMERCIAL_BATCH_SIZE=10;
export const COMMERCIAL_BATCH_MINUTES=30;
const SLOT=COMMERCIAL_BATCH_MINUTES*60_000;
const DAY=86400000;
const clock=new Intl.DateTimeFormat("en-US",{timeZone:"America/Mexico_City",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
export function commercialSendWindow(date:Date){
  const parts=Object.fromEntries(clock.formatToParts(date).map(p=>[p.type,p.value]));
  const hour=Number(parts.hour);
  return !["Sat","Sun"].includes(parts.weekday)&&hour>=9&&hour<18;
}
export function commercialBatchDate(start:Date,dayOffset:number,batch:number):Date{
  let time=Math.ceil((start.getTime()+dayOffset*DAY)/SLOT)*SLOT;
  if(!Number.isFinite(time)||!Number.isInteger(batch)||batch<0)throw Error("Invalid commercial schedule");
  while(!commercialSendWindow(new Date(time)))time+=SLOT;
  for(let i=0;i<batch;i++){time+=SLOT;while(!commercialSendWindow(new Date(time)))time+=SLOT;}
  return new Date(time);
}
export function commercialPlanJobs(start:Date,ids:string[],days:number[],recovery:boolean){
  const first=recovery?days[0]:1;
  return days.flatMap(day=>{
    const times=Array.from({length:Math.ceil(ids.length/COMMERCIAL_BATCH_SIZE)},(_,batch)=>commercialBatchDate(start,day-first,batch).toISOString());
    return ids.map((userId,i)=>({userId,day,scheduledFor:times[Math.floor(i/COMMERCIAL_BATCH_SIZE)]}));
  });
}
