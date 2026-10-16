import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePublic,publicFeed,subscribeUser,preferencesUser,claimUser,finishUser,viewUser} from '../cloud/state.mjs';
const now=Date.parse('2026-10-16T12:00:00Z');
const prefs={resetAlerts:true,forecastAlerts:true,threshold:60,language:'zh',zone:'Europe/London'};
const forecast=p=>({id:'watch-1',probability:p,publishedAt:new Date(now-1000).toISOString(),validUntil:new Date(now+3600000).toISOString(),sourceFreshUntil:new Date(now+1800000).toISOString()});
const snapshot=(records=[],f)=>({records,forecast:f,checkedAt:new Date(now).toISOString(),sources:[{name:'watch',status:'ok',checkedAt:new Date(now).toISOString()}]});
const record={id:'2110951585983631505',category:'reset',resetType:'automatic',postedAt:new Date(now+1000).toISOString(),url:'https://x.com/thsottiaux/status/2110951585983631505'};
const user=()=>subscribeUser(null,prefs,{reset:true,forecast:true},'receipt_123456789',now);
test('cloud ingestion keeps baseline and hides stale forecasts',()=>{
 const s=mergePublic(null,snapshot([record],forecast(70)),now);
 assert.equal(s.baseline,now);assert.equal(publicFeed(s,now).forecast.probability,70);
 assert.equal(publicFeed(s,now+3600001).forecast,null);
 assert.equal(mergePublic(s,snapshot([],undefined),now+1).forecast.id,'watch-1');
});
test('cloud consent receipts are idempotent and preferences cannot manufacture consent',()=>{
 const u=user();const claimed=claimUser(u,mergePublic(null,snapshot([],forecast(70)),now),now);
 assert.equal(viewUser(claimed.user).forecastCredits,0);
 assert.equal(viewUser(subscribeUser(claimed.user,prefs,{forecast:true},'receipt_123456789',now+1)).forecastCredits,0);
 const off=preferencesUser(u,{...prefs,forecastAlerts:false},now);
 assert.equal(preferencesUser(off,prefs,now).settings.forecastAlerts,false);
});
test('cloud skips historical resets but sends an unknown record when it becomes classified',()=>{
 let state=mergePublic(null,snapshot([{...record,resetType:'unknown'}]),now);
 let u=user();assert.equal(claimUser(u,state,now+2000).job,null);
 state=mergePublic(state,snapshot([record]),now+2000);
 const c=claimUser(u,state,now+2000);assert.equal(c.job.kind,'reset');
 const finished=finishUser(c.user,c.job,{state:'sent',code:0},now+3000);
 assert.equal(claimUser(subscribeUser(finished,prefs,{reset:true},'next_receipt_12345',now+4000),state,now+4000).job,null);
});
test('cloud forecast follows current probability and never duplicates successful sends',()=>{
 let s=mergePublic(null,snapshot([],forecast(70)),now);let u=user();
 s=mergePublic(s,snapshot([],forecast(20)),now+1);assert.equal(claimUser(u,s,now+1).job,null);
 s=mergePublic(s,snapshot([],forecast(80)),now+2);let c=claimUser(u,s,now+2);assert.equal(c.job.event.probability,80);
 u=finishUser(c.user,c.job,{state:'sent'},now+3);
 u=subscribeUser(u,prefs,{forecast:true},'next_receipt_12345',now+4);
 assert.equal(claimUser(u,s,now+4).job,null);
});
test('cloud old denial cannot revoke newer consent and uncertain sends are not retried',()=>{
 const s=mergePublic(null,snapshot([],forecast(70)),now);const c=claimUser(user(),s,now);
 const newer=subscribeUser(c.user,prefs,{forecast:true},'next_receipt_12345',now+1);
 const done=finishUser(newer,c.job,{state:'denied',code:43101},now+2);
 assert.equal(done.settings.forecastAlerts,true);assert.equal(viewUser(done).forecastCredits,1);
 const crashed=claimUser(c.user,s,now+180001);assert.equal(crashed.job,null);assert.equal(crashed.user.jobs[0].state,'unknown');
});
