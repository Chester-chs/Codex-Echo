import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../cloud/api.mjs';
import {authorizedSync} from '../cloud/sync.mjs';
import {cloudGateway} from '../cloud/gateway.mjs';
const identity={OPENID:'real-user',APPID:'wx-app'};
const templates={reset:{id:'template',fields:{thing1:'title'}}};
test('cloud API uses platform identity and rejects forged recipients',async()=>{
 const data=new Map();const repo={read:async k=>data.get(k)||null,change:async(k,fn)=>{const r=fn(data.get(k)||null);data.set(k,r.value);return r.result;}};
 const event={path:'/subscriptions',method:'POST',data:{settings:{resetAlerts:true},grants:{reset:true},requestId:'receipt_123456789'}};
 assert.equal((await handleApi({repo,templates,event,identity:null})).statusCode,401);
 assert.equal((await handleApi({repo,templates,event:{...event,data:{...event.data,openid:'victim'}},identity})).statusCode,400);
 assert.equal((await handleApi({repo,templates,event,identity})).data.subscription.resetCredits,1);
 const result=await handleApi({repo,templates,event:{path:'/subscriptions'},identity:{...identity,OPENID:'other-user'}});
 assert.equal(result.data.subscription,null);
});
test('scheduler rejects a forged timer event without the server-only secret',()=>{
 const secret='a'.repeat(64);
 assert.equal(authorizedSync({Type:'Timer',TriggerName:'pulse'},secret),false);
 assert.equal(authorizedSync({Message:JSON.stringify({secret})},secret),true);
 assert.equal(authorizedSync({secret},''),false);
});
test('cloud gateway supplies the app identity and treats SDK transport errors as uncertain',async()=>{
 let supplied;
 const openapi=options=>{supplied=options;return {subscribeMessage:{send:async()=>({errCode:0})}};};
 const gateway=cloudGateway({openapi},templates,'trial','wx-test');
 const job={kind:'reset',openid:'user',preferences:{language:'en',zone:'UTC'},event:{id:'1',postedAt:new Date().toISOString()}};
 assert.equal((await gateway.send(job)).state,'sent');assert.equal(supplied.appid,'wx-test');
 const broken=cloudGateway({openapi:()=>({subscribeMessage:{send:async()=>{throw {errCode:-504002};}}})},templates,'trial','wx-test');
 assert.equal((await broken.send(job)).state,'unknown');
});
