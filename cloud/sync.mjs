import {timingSafeEqual,randomUUID} from 'node:crypto';
import {collectPublicSources,enrichOriginal} from '../backend/sources.mjs';
import {mergePublic,claimUser,finishUser} from './state.mjs';
export function authorizedSync(event,secret){
 if(typeof secret!=='string'||secret.length<32)return false;
 let data=event;try{if(typeof event?.Message==='string')data=JSON.parse(event.Message);}catch{return false;}
 const supplied=data?.secret;
 return typeof supplied==='string'&&Buffer.byteLength(supplied)===Buffer.byteLength(secret)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(secret));
}
export async function synchronize({repo,gateway,collect=collectPublicSources,enrich=enrichOriginal,clock=Date.now}){
 const start=clock(),owner=randomUUID();
 const acquired=await repo.change('lease',old=>old?.until>start?{result:false}:{value:{owner,until:start+600000},result:true});
 if(!acquired)return {busy:true};
 try{
  const previous=await repo.read('public');
  // Backfill is a console-initiated first run; later polls only read current pages.
  const snapshot=await collect({backfill:!previous?.backfillCompleted,now:new Date(start).toISOString()});
  const state=mergePublic(previous,snapshot,start);
  state.backfillCompleted=previous?.backfillCompleted||snapshot.sources.filter(s=>['history','timeline'].includes(s.name)).every(s=>s.status==='ok');
  const candidates=state.records.filter(r=>(!r.textCheckedAt||!['verified','mirror'].includes(r.textStatus)||start-Date.parse(r.textCheckedAt)>86400000)&&(!r.textRetryAt||start>=Date.parse(r.textRetryAt))).sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt)).slice(0,6);
  await Promise.all(candidates.map(async record=>{
   try{const next=await enrich(record,{mirror:process.env.FXEMBED_ENABLED!=='false'});Object.assign(record,next,{textRetryAt:null});}
   catch{record.textRetryAt=new Date(clock()+600000).toISOString();}
  }));
  await repo.write('public',state);
  const cursor=await repo.read('cursor');let users=await repo.users(cursor?.last||'');
  if(!users.length&&cursor?.last)users=await repo.users();
  let last='',sent=0;
  for(const user of users){
   if(clock()-start>100000)break;
   // Claim and reserve consent together. Network calls run only after the transaction commits.
   const job=await repo.change(user.id,old=>{
    const claim=claimUser(old,state,clock());
    return {value:claim.user,result:claim.job?{...claim.job,openid:old.openid}:null};
   });
   if(job){
    const result=await gateway.send(job);
    await repo.change(user.id,old=>({value:finishUser(old,job,result,clock())}));
    if(result.state==='sent')sent++;
   }
   last=user.id;
  }
  if(last)await repo.write('cursor',{last});
  return {records:state.records.length,processed:users.length,sent};
 }finally{
  await repo.change('lease',old=>old?.owner===owner?{value:null}:{});
 }
}
