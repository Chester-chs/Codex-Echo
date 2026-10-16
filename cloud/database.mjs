import {createHash} from 'node:crypto';
export const userKey=openid=>createHash('sha256').update(openid).digest('hex');
export function repository(db){
 const collection='pulse_radar';
 const read=async(id,scope=db)=>{
  // Query reads return an empty array for a missing document, without masking service errors.
  if(scope===db){const r=await db.collection(collection).where({_id:id}).limit(1).get();return r.data[0]?.value||null;}
  try{const r=await scope.collection(collection).doc(id).get();return r.data?.value||null;}
  catch(e){if(e.errCode===-1&&/not exist|not found/i.test(e.errMsg||e.message||''))return null;throw e;}
 };
 const write=async(id,value,scope=db)=>{
  // CloudBase documents are bounded. Fail visibly instead of silently losing history.
  if(Buffer.byteLength(JSON.stringify(value))>850000)throw new Error('Cloud document capacity reached; migrate public history before continuing');
  await scope.collection(collection).doc(id).set({data:{value}});
 };
 return {
  read,write,
  async change(id,fn){return db.runTransaction(async tx=>{
   const old=await read(id,tx);const result=await fn(old);
   if(result.value===null){if(old)await tx.collection(collection).doc(id).remove();}
   else if(result.value!==undefined)await write(id,result.value,tx);
   return result.result;
  });},
  async users(after=''){
   const lower=after||'user:';
   const r=await db.collection(collection).where({_id:db.command.gt(lower).and(db.command.lt('user;'))}).orderBy('_id','asc').limit(50).get();
   return r.data.map(d=>({id:d._id,value:d.value}));
  }
 };
}
