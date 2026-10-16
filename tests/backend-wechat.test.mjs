import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeChat,templateMessage} from '../backend/wechat.mjs';
const config={appId:'test-app',appSecret:'server-secret',state:'trial',templates:{reset:{id:'reset-template',fields:{thing1:'title',time2:'time',thing3:'summary'}},forecast:{id:'forecast-template',fields:{thing1:'title',number2:'probability'}}}};
const job={openid:'trusted-openid',kind:'reset',event:{id:'1',postedAt:'2026-10-16T12:00:00Z',resetType:'automatic',original:'A very long public announcement that must fit in the WeChat card.'},preferences:{language:'en',zone:'Europe/London'}};
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
test('login identity comes only from code2Session and session_key never leaves gateway',async()=>{
 const gateway=createWeChat(config,async(url)=>{assert.match(url,/jscode2session/);return json({openid:'server-openid',session_key:'private-key'});});
 assert.deepEqual(await gateway.login('one-time-code'),{openid:'server-openid'});
});
test('template mapping uses configured fields, limits text and respects language/timezone',()=>{
 const payload=templateMessage(job,config);
 assert.equal(payload.touser,'trusted-openid'); assert.equal(payload.lang,'en_US');
 assert.equal(payload.data.time2.value,'2026-10-16 13:00');
 assert.ok([...payload.data.thing3.value].length<=20);assert.equal(payload.miniprogram_state,'trial');
});
test('token is cached and expired token rejection retries once without duplicating accepted message',async()=>{
 let tokens=0,sends=0;
 const gateway=createWeChat(config,async(url)=>{if(url.includes('stable_token')){tokens++;return json({access_token:'access-'+tokens,expires_in:7200});}sends++;return json(sends===1?{errcode:42001}:{errcode:0});});
 assert.equal((await gateway.send(job)).state,'sent');assert.equal(tokens,2);assert.equal(sends,2);
 await gateway.send(job);assert.equal(tokens,2);
});
test('network error after send is unknown while 43101 is denied',async()=>{
 const gateway=createWeChat(config,async(url)=>{if(url.includes('stable_token'))return json({access_token:'a',expires_in:7200});throw new Error('timeout');});
 assert.equal((await gateway.send(job)).state,'unknown');
 const denied=createWeChat(config,async(url)=>json(url.includes('stable_token')?{access_token:'a',expires_in:7200}:{errcode:43101}));
 assert.equal((await denied.send(job)).state,'denied');
});
