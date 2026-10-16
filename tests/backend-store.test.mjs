import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../backend/store.mjs';
import {dispatch} from '../backend/worker.mjs';
const T=Date.parse('2026-10-16T12:00:00Z');
const iso=t=>new Date(t).toISOString();
const record=(id,t=T)=>({id,url:`https://x.com/i/status/${id}`,postedAt:iso(t),original:'Reset is done.',resetType:'automatic',category:'reset'});
const prefs={resetAlerts:true,forecastAlerts:true,threshold:60,language:'en',zone:'Europe/London'};
test('first fetch establishes a baseline, delayed history is never broadcast, new events deduplicate',()=>{
 const db=createStore(':memory:');
 db.subscribe('alice',prefs,{reset:true,forecast:true},'consent-a',T-60000);
 db.ingest({records:[record('old',T-10000)],sources:[],checkedAt:iso(T)},T);
 assert.equal(db.deliveries('alice').length,0);
 db.ingest({records:[record('archive',T-86400000),record('new',T+1000)],sources:[],checkedAt:iso(T+2000)},T+2000);
 db.ingest({records:[record('new',T+1000)],sources:[],checkedAt:iso(T+3000)},T+3000);
 assert.equal(db.deliveries('alice').length,1);
 db.close();
});
test('forecast threshold is per user and expires before send; no repeated alert per source window',async()=>{
 const db=createStore(':memory:');db.ingest({records:[record('old')],sources:[],checkedAt:iso(T)},T);
 db.subscribe('alice',prefs,{forecast:true},'a',T);db.subscribe('bob',{...prefs,threshold:80},{forecast:true},'b',T);
 const forecast={id:'watch:1',kind:'source-watch',probability:70,publishedAt:iso(T),validUntil:iso(T+60000),sourceFreshUntil:iso(T+60000),sourceUrl:'https://x.com/i/status/1',basis:'Soon',windowText:'within 24h'};
 db.ingest({records:[],forecast,sources:[],checkedAt:iso(T+1000)},T+1000);
 assert.equal(db.deliveries('alice').length,1);assert.equal(db.deliveries('bob').length,0);
 let sends=0;await dispatch(db,{send:async()=>{sends++;return {state:'sent'};}},T+61000);
 assert.equal(sends,0);assert.equal(db.deliveries('alice')[0].state,'cancelled');db.close();
});
test('timeout is unknown, does not retry or manufacture delivery confirmation',async()=>{
 const db=createStore(':memory:');db.ingest({records:[record('old')],checkedAt:iso(T)},T);
 db.subscribe('alice',prefs,{reset:true},'a',T);
 db.ingest({records:[record('new',T+1000)],checkedAt:iso(T+2000)},T+2000);
 let sends=0;const gateway={send:async()=>{sends++;return {state:'unknown',code:'network'};}};
 await dispatch(db,gateway,T+3000);await dispatch(db,gateway,T+900000);
 assert.equal(sends,1);assert.equal(db.deliveries('alice')[0].state,'unknown');
 assert.equal(db.subscription('alice').resetCredits,0);db.close();
});
test('subscription receipts are idempotent and opt-out cancels pending delivery',async()=>{
 const db=createStore(':memory:');db.ingest({records:[record('old')],checkedAt:iso(T)},T);
 db.subscribe('alice',prefs,{reset:true},'receipt',T);
 db.ingest({records:[record('new',T+1000)],checkedAt:iso(T+2000)},T+2000);
 await dispatch(db,{send:async()=>({state:'sent',code:0})},T+3000);
 db.subscribe('alice',prefs,{reset:true},'receipt',T+4000);
 assert.equal(db.subscription('alice').resetCredits,0);
 db.subscribe('alice',prefs,{reset:true},'new-receipt',T+5000);
 db.ingest({records:[record('newer',T+6000)],checkedAt:iso(T+7000)},T+7000);
 db.updatePreferences('alice',{...prefs,resetAlerts:false},T+8000);
 let sends=0;await dispatch(db,{send:async()=>{sends++;return {state:'sent'};}},T+9000);
 assert.equal(sends,0);db.close();
});
test('expired sessions and account deletion cannot access a recipient',()=>{
 const db=createStore(':memory:'); const token=db.session('alice',T,60000);
 assert.equal(db.authenticate(token,T),'alice');assert.equal(db.authenticate(token,T+60001),null);
 const second=db.session('alice',T);db.deleteAccount('alice');assert.equal(db.authenticate(second,T),null);db.close();
});
test('later classification queues a new eligible announcement and a revised forecast uses current probability',()=>{
 const db=createStore(':memory:');db.ingest({records:[record('old')],checkedAt:iso(T)},T);db.subscribe('alice',prefs,{reset:true,forecast:true},'a',T);
 db.ingest({records:[{...record('new',T+1000),resetType:'unknown'}],checkedAt:iso(T+2000)},T+2000);
 db.ingest({records:[record('new',T+1000)],checkedAt:iso(T+3000)},T+3000);
 assert.equal(db.deliveries('alice').length,1);
 const first=db.claim(T+4000);db.finish(first,{state:'sent'},T+4000);
 const f={id:'watch:1',probability:70,publishedAt:iso(T),validUntil:iso(T+3600000),sourceFreshUntil:iso(T+60000)};
 db.ingest({records:[],forecast:f,checkedAt:iso(T+5000)},T+5000);
 db.ingest({records:[],forecast:{...f,probability:20},checkedAt:iso(T+6000)},T+6000);
 assert.equal(db.claim(T+7000),null);db.close();
});
test('a response for consumed old consent cannot revoke a newer grant',()=>{
 const db=createStore(':memory:');db.ingest({records:[record('old')],checkedAt:iso(T)},T);db.subscribe('alice',prefs,{reset:true},'a',T);
 db.ingest({records:[record('new',T+1000)],checkedAt:iso(T+2000)},T+2000);const job=db.claim(T+3000);
 db.subscribe('alice',prefs,{reset:true},'b',T+4000);db.finish(job,{state:'denied',code:43101},T+5000);
 assert.equal(db.subscription('alice').resetAlerts,true);assert.equal(db.subscription('alice').resetCredits,1);db.close();
});
test('dispatcher rechecks the clock between recipients',async()=>{
 const db=createStore(':memory:');db.ingest({records:[record('old')],checkedAt:iso(T)},T);
 for(const name of ['alice','bob'])db.subscribe(name,prefs,{forecast:true},name,T);
 const f={id:'watch:1',probability:70,publishedAt:iso(T),validUntil:iso(T+1000),sourceFreshUntil:iso(T+60000)};
 db.ingest({records:[],forecast:f,checkedAt:iso(T)},T);
 let clock=T,sends=0;await dispatch(db,{send:async()=>{sends++;clock=T+2000;return {state:'sent'};}},()=>clock);
 assert.equal(sends,1);db.close();
});
test('an unsent forecast may qualify again after falling below threshold',()=>{
 const db=createStore(':memory:');db.ingest({records:[record('old')],checkedAt:iso(T)},T);db.subscribe('alice',prefs,{forecast:true},'a',T);
 const f={id:'watch:1',probability:70,publishedAt:iso(T),validUntil:iso(T+3600000),sourceFreshUntil:iso(T+60000)};
 db.ingest({records:[],forecast:f,checkedAt:iso(T+1000)},T+1000);
 db.ingest({records:[],forecast:{...f,probability:20},checkedAt:iso(T+2000)},T+2000);assert.equal(db.claim(T+3000),null);
 db.ingest({records:[],forecast:{...f,probability:80},checkedAt:iso(T+4000)},T+4000);const job=db.claim(T+5000);assert.equal(job.event.probability,80);
 db.finish(job,{state:'sent'},T+6000);db.subscribe('alice',prefs,{forecast:true},'new',T+7000);db.ingest({records:[],forecast:{...f,probability:90},checkedAt:iso(T+8000)},T+8000);assert.equal(db.claim(T+9000),null);db.close();
});
test('a creditless backlog cannot starve a later user with permission',()=>{
 const db=createStore(':memory:');db.ingest({records:[record('old')],checkedAt:iso(T)},T);
 for(let i=0;i<101;i++)db.subscribe(String(i),prefs,{reset:true},String(i),T);
 db.ingest({records:[record('new',T+1000),record('new2',T+2000)],checkedAt:iso(T+3000)},T+3000);
 for(let i=0;i<101;i++){const job=db.claim(T+4000);assert.ok(job);db.finish(job,{state:'sent'},T+4000);}
 db.subscribe('late',prefs,{reset:true},'late',T+5000);db.ingest({records:[record('new3',T+6000)],checkedAt:iso(T+7000)},T+7000);
 assert.equal(db.claim(T+8000)?.openid,'late');db.close();
});
test('definitive transient failure retries boundedly and 43101 revokes only affected channel',async()=>{
 const db=createStore(':memory:');db.ingest({records:[record('old')],checkedAt:iso(T)},T);
 db.subscribe('alice',prefs,{reset:true,forecast:true},'a',T);
 db.ingest({records:[record('new',T+1000)],checkedAt:iso(T+2000)},T+2000);
 await dispatch(db,{send:async()=>({state:'retry',code:-1})},T+3000);
 assert.equal(db.subscription('alice').resetCredits,1);
 await dispatch(db,{send:async()=>({state:'denied',code:43101})},T+900000);
 assert.equal(db.subscription('alice').resetAlerts,false);
 assert.equal(db.subscription('alice').forecastAlerts,true);db.close();
});
