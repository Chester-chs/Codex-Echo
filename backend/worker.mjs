export async function dispatch(store,gateway,clock=Date.now) {
 const now=typeof clock==='function'?clock:()=>clock;
 let count=0;
 while(count<50){const job=store.claim(now());if(!job)break;
  let result;
  try{result=await gateway.send(job);}catch{result={state:'unknown',code:'unexpected_sender_error'};}
  if(!['sent','retry','failed','denied','unknown','cancelled'].includes(result?.state))result={state:'unknown',code:'invalid_sender_result'};
  store.finish(job,result,now());count++;
 }return count;
}
