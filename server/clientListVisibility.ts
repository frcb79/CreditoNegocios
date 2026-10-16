/**
 * Apply the same per-client commercial permission as GET /api/clients/:id
 * before returning any client attributes in a collection.
 */
export async function filterAuthorizedClientListing<T extends {id:string}>(
  rows:T[],canView:(row:T)=>Promise<boolean>,
):Promise<T[]>{
  const visible=new Array<boolean>(rows.length).fill(false);
  let next=0;
  const worker=async()=>{
    while(next<rows.length){
      const i=next++;
      try{visible[i]=Boolean(await canView(rows[i]));}
      catch{visible[i]=false;} // Fail closed on relationship lookup errors.
    }
  };
  await Promise.all(Array.from({length:Math.min(8,rows.length)},worker));
  return rows.filter((_,i)=>visible[i]);
}
