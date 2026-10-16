import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {barkSettings,formatBark,sendBark,runBark,queueBarkTest,barkStatus,parseBarkKey} from '../web/bark.mjs';
import {handleRequest} from '../web/worker.mjs';

const now=Date.parse('2026-10-16T12:00:00Z'),iso=n=>new Date(n).toISOString();
const post=(id='1')=>({id,url:'https://x.com/thsottiaux/status/'+id,category:'reset',resetType:'automatic',original:'A new public announcement',translation:'新的公开公告',postedAt:iso(now),resetAt:null});
const forecast=(probability=70)=>({id:'watch-1',kind:'source-watch',probability,basis:'A public hint',basisZh:'公开线索',windowText:'within 24h',publishedAt:iso(now),checkedAt:iso(now),sourceFreshUntil:iso(now+1800000),validUntil:iso(now+3600000),sourceUrl:post().url});
const feed=(records=[],f=null)=>({records,forecast:f,sources:[{name:'history',status:'ok',lastSuccessAt:iso(now)}]});
function db(beforeRun=async()=>{}){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../web/migrations/0001_bark.sql',import.meta.url),'utf8'));let statements=0;
 return {sql,get statements(){return statements;},prepare(query){statements++;let values=[];return {bind(...args){values=args;return this;},async run(){await beforeRun(query,values);const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}};},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};}};},async batch(statements){sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
const env=()=>({NOTIFY_DB:db(),BARK_DEVICE_KEY:'test-device-key',BARK_ENABLED:'true',BARK_ADMIN_TOKEN:'a'.repeat(64)});

test('Bark input is parsed as data and rejects arbitrary destinations',()=>{
 assert.equal(parseBarkKey('https://api.day.app/test-device-key/hello'),'test-device-key');
 assert.equal(parseBarkKey('curl -X POST "https://api.day.app/test-device-key/hello"'),'test-device-key');
 for(const input of ['https://evil.test/key','https://api.day.app@evil.test/key','short','https://api.day.app:9443/key'])assert.throws(()=>parseBarkKey(input));
 assert.equal(barkSettings({}).threshold,60);assert.equal(barkSettings({BARK_THRESHOLD:'999'}).threshold,90);
});

test('Bark payloads distinguish announcements, source estimates and account credits in both languages',()=>{
 for(const language of ['zh','en']){
  const reset=formatBark({kind:'reset',event:post()},{language});
  const prediction=formatBark({kind:'forecast',event:forecast()},{language});
  assert.ok(reset.body.includes('2026/10/16'));assert.ok(reset.body.includes('London')||reset.body.includes('伦敦'));
  assert.ok(reset.body.includes('Beijing')||reset.body.includes('北京'));assert.match(prediction.body,/70%/);
  assert.ok(prediction.body.includes('not an official')||prediction.body.includes('非官方'));
  assert.ok(reset.body.includes('account')||reset.body.includes('账号'));
 }
});

test('long multilingual source text fits a regular APNs payload',()=>{
 for(const language of ['zh','en'])for(const kind of ['reset','forecast']){
  const event={...post(),...forecast(),original:'汉字😀'.repeat(3000),translation:'汉字😀'.repeat(3000),basis:'汉字😀'.repeat(3000),basisZh:'汉字😀'.repeat(3000),windowText:'x'.repeat(10000)};
  const payload=formatBark({kind,event},{language});
  assert.ok(new TextEncoder().encode(JSON.stringify({aps:{alert:{title:payload.title,body:payload.body}},...payload})).length<4096);
 }
});

test('first successful source check baselines history; new resets and threshold crossings send once',async()=>{
 const e=env(),sent=[],send=async job=>{sent.push(job);return {state:'sent',code:'accepted'};};
 await runBark(e,feed([post('100')],forecast(40)),{now,send});assert.equal(sent.length,0);
 await runBark(e,feed([post('200'),post('100')],forecast()),{now:now+1000,send});
 assert.deepEqual(sent.map(j=>j.kind).sort(),['forecast','reset']);
 await runBark(e,feed([post('200'),post('100')],forecast()),{now:now+2000,send});assert.equal(sent.length,2);
 assert.equal((await barkStatus(e)).receipts.filter(r=>r.state==='sent').length,2);
});

test('a corrected cancellation blocks a generic reset retry queued before plan support',async()=>{
 const e=env();await runBark(e,feed(),{now});let attempts=0;
 const send=async()=>{attempts++;return {state:'retry',code:'provider_429'};};
 await runBark(e,feed([post('200')]),{now:now+1000,send});
 assert.equal(attempts,1);
 const cancelled={...post('200'),textStatus:'verified',original:'We have cancelled the reset.'};
 await runBark(e,feed([cancelled]),{now:now+130000,send});
 assert.equal(attempts,1);
 assert.equal((await barkStatus(e)).receipts[0].state,'cancelled');
});

test('a revised announced target cancels the old retry and sends the new plan only once',async()=>{
 const e=env();await runBark(e,feed(),{now});const sent=[];
 const planned={...post('200'),textStatus:'verified',original:'We will reset in 5 hours.'};
 const send=async job=>{sent.push(job);return sent.length===1?{state:'retry',code:'provider_429'}:{state:'sent',code:'accepted'};};
 await runBark(e,feed([planned]),{now:now+1000,send});
 const revised={...planned,original:'We will reset in 6 hours.'};
 await runBark(e,feed([revised]),{now:now+130000,send});
 await runBark(e,feed([revised]),{now:now+140000,send});
 assert.equal(sent.length,2);assert.equal(sent[1].event.scheduledAt,iso(now+6*3600000));
 assert.deepEqual((await barkStatus(e)).receipts.map(r=>r.state).sort(),['cancelled','sent']);
});

test('personal notifiers distinguish plan publication from a later verified completion and deduplicate each',async()=>{
 const e=env(),sent=[],send=async job=>{sent.push(job);return {state:'sent',code:'accepted'};};
 const fresh=(records,time)=>({...feed(records),sources:[{name:'history',status:'ok',lastSuccessAt:iso(time)}]});
 await runBark(e,fresh([],now),{now,send});
 const plan={...post('2117536046041595910'),postedAt:iso(now+1000),original:'We will reset in 5 hours.',textStatus:'verified'};
 await runBark(e,fresh([plan],now+2000),{now:now+2000,send});
 const at=now+5*3600000+61000;
 await runBark(e,fresh([plan],at),{now:at,send});assert.equal(sent.length,1);
 const done={...post('2117536046041595911'),postedAt:iso(at-1000),category:'post',resetType:'unknown',original:'The reset is complete.',textStatus:'verified'};
 await runBark(e,fresh([done,plan],at),{now:at,send});
 await runBark(e,fresh([done,plan],at+1000),{now:at+1000,send});
 assert.equal(sent.length,2);assert.equal(sent[1].event.id,done.id);
 for(const language of ['zh','en'])assert.match(formatBark(sent[1],{language}).title,language==='zh'?/来源确认.*完成/:/completion confirmed/i);
});

test('large history baselines stay within the free D1 statement budget',async()=>{
 const e=env();await runBark(e,feed(Array.from({length:500},(_,i)=>post(String(i+1000)))),{now});
 assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) AS n FROM bark_events').get().n,500);
 assert.ok(e.NOTIFY_DB.statements<20);
});

test('stale data, old backfills, expired forecasts and disabled channels do not notify',async()=>{
 const e=env(),sent=[],send=async job=>{sent.push(job);return {state:'sent',code:'accepted'};};
 await runBark(e,{...feed(),sources:[]},{now,send});assert.equal((await barkStatus(e)).initialized,false);
 await runBark(e,feed(),{now,send});
 await runBark(e,feed([{...post('100'),postedAt:iso(now-86400000)}],{...forecast(),validUntil:iso(now-1)}),{now:now+1000,send});
 e.BARK_RESET_ALERTS='false';e.BARK_FORECAST_ALERTS='false';
 await runBark(e,feed([post('200')],forecast()),{now:now+2000,send});assert.equal(sent.length,0);
});

test('concurrent checks share a lease and cannot deliver the same event twice',async()=>{
 const e=env();await runBark(e,feed(),{now});
 let release;const pending=new Promise(resolve=>release=resolve);let sent=0;
 const a=runBark(e,feed([post()]),{now:now+1000,send:async()=>{sent++;await pending;return {state:'sent',code:'accepted'};}});
 while(!sent)await new Promise(resolve=>setImmediate(resolve));
 const b=await runBark(e,feed([post()]),{now:now+1000,send:async()=>{sent++;return {state:'sent'};}});
 assert.equal(b.state,'busy');release();await a;assert.equal(sent,1);
});

test('a paused dispatcher loses permission to send after a new lease claims its event',async()=>{
 const e=env();let release,paused,block=false;
 const gate=new Promise(resolve=>release=resolve),reached=new Promise(resolve=>paused=resolve);
 e.NOTIFY_DB=db(async query=>{if(block&&query.startsWith("UPDATE bark_events SET state='sending'")){block=false;paused();await gate;}});
 await runBark(e,feed(),{now});let sent=0;
 const send=async()=>{sent++;return {state:'sent',code:'accepted'};};block=true;
 const a=runBark(e,feed([post()]),{now:now+1000,send});await reached;
 await runBark(e,feed([post()]),{now:now+400000,send});
 release();await a;assert.equal(sent,1);
 assert.equal((await barkStatus(e)).receipts[0].attempts,1);
});

test('a late send result cannot overwrite recovery of an interrupted delivery',async()=>{
 const e=env();await runBark(e,feed(),{now});let release,started,sent=0;
 const gate=new Promise(resolve=>release=resolve),reached=new Promise(resolve=>started=resolve);
 const a=runBark(e,feed([post()]),{now:now+1000,send:async()=>{sent++;started();await gate;return {state:'retry',code:'429'};}});await reached;
 await runBark(e,feed([post()]),{now:now+400000,send:async()=>{sent++;return {state:'sent'};}});
 release();await a;
 assert.equal(sent,1);assert.equal((await barkStatus(e)).receipts[0].state,'unknown');
});

test('withdrawn, downgraded and replaced forecasts cancel the superseded queued retry',async()=>{
 for(const replacement of [null,forecast(20),{...forecast(80),id:'watch-2'}]){
  const e=env();await runBark(e,feed(),{now});const sent=[];
  const send=async job=>{sent.push(job.event.probability);return {state:'retry',code:'429'};};
  await runBark(e,feed([],forecast()),{now:now+1000,send});
  await runBark(e,feed([],replacement),{now:now+200000,send});
  assert.equal(sent.filter(p=>p===70).length,1);
  assert.equal((await barkStatus(e)).receipts.find(r=>r.state==='cancelled').kind,'forecast');
 }
});

test('a forecast discovered after partial initialization does not backfill a pre-enable prediction',async()=>{
 const e=env();let sent=0;await runBark(e,feed(),{now:now+1000});
 await runBark(e,feed([],forecast()),{now:now+2000,send:async()=>{sent++;return {state:'sent'};}});
 assert.equal(sent,0);
});

test('a forecast expiring during database writes is cancelled before the network send',async()=>{
 const e=env();let time=now,expire=false,sent=0;
 e.NOTIFY_DB=db(async query=>{if(expire&&query.startsWith("UPDATE bark_events SET state='sending'"))time=now+12000;});
 await runBark(e,feed(),{now});time=now+1000;expire=true;
 await runBark(e,feed([],{...forecast(),validUntil:iso(now+5000)}),{now:()=>time,send:async()=>{sent++;return {state:'sent'};}});
 assert.equal(sent,0);assert.equal((await barkStatus(e)).receipts[0].code,'expired_before_dispatch');
});

test('deliveries expiring during claims still count toward the per-run database budget',async()=>{
 const e=env();let time=now,expire=false,sent=0;
 e.NOTIFY_DB=db(async query=>{if(expire&&query.startsWith("UPDATE bark_events SET state='sending'"))time+=5000;});
 await runBark(e,feed(),{now});const id=e.NOTIFY_DB.sql.prepare('SELECT id FROM bark_control').get().id;
 for(let i=0;i<20;i++){
  const p={...post(String(i+100)),postedAt:iso(now-21600000+2500+i*5000)};
  e.NOTIFY_DB.sql.prepare("INSERT INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated) VALUES(?,?,'reset',?,'pending',?,?,?)").run(id,'reset:'+p.id,JSON.stringify(p),now,now-i,now);
 }
 const before=e.NOTIFY_DB.statements;expire=true;
 await runBark(e,feed(),{now:()=>time,send:async()=>{sent++;return {state:'sent'};}});
 assert.equal(sent,0);assert.equal(e.NOTIFY_DB.sql.prepare('SELECT attempts FROM bark_daily').get().attempts,3);
 assert.equal(e.NOTIFY_DB.sql.prepare("SELECT count(*) AS n FROM bark_events WHERE state='cancelled'").get().n,3);
 assert.ok(e.NOTIFY_DB.statements-before<50);
});

test('unknown outcomes never retry; explicit failures retry within limits and daily budget',async()=>{
 const e=env();e.BARK_DAILY_LIMIT='1';await runBark(e,feed(),{now});let sends=0;
 await runBark(e,feed([post('1'),post('2')]),{now:now+1000,send:async()=>{sends++;return {state:'unknown',code:'transport_uncertain'};}});
 await runBark(e,feed([post('1'),post('2')]),{now:now+10000,send:async()=>{sends++;return {state:'sent'};}});
 assert.equal(sends,1);assert.equal((await barkStatus(e)).receipts.filter(r=>r.state==='unknown').length,1);
 const r=env();await runBark(r,feed(),{now});let retries=0;
 const fail=async()=>{retries++;return {state:'retry',code:'429'};};
 for(const offset of [1000,200000,600000,1200000])await runBark(r,feed([post()]),{now:now+offset,send:fail});
 assert.equal(retries,3);assert.equal((await barkStatus(r)).receipts[0].state,'failed');
});

test('expired queued forecast is rechecked before a retry and recipient changes baseline separately',async()=>{
 const e=env();await runBark(e,feed(),{now});let sends=0;
 await runBark(e,feed([],forecast()),{now:now+1000,send:async()=>{sends++;return {state:'retry',code:'429'};}});
 await runBark(e,feed(),{now:now+3600001,send:async()=>{sends++;return {state:'sent'};}});assert.equal(sends,1);
 e.BARK_DEVICE_KEY='another-device-key';await runBark(e,{...feed([post('300')]),sources:[{status:'ok',lastSuccessAt:iso(now+4000000)}]},{now:now+4000000,send:async()=>{sends++;return {state:'sent'};}});assert.equal(sends,1);assert.equal((await barkStatus(e)).initialized,true);
});

test('provider acceptance is distinct from phone receipt and request errors never reveal credentials',async()=>{
 const e=env(),job={kind:'test',event:{}};
 const accepted=await sendBark(job,e,{fetcher:async(url,options)=>{assert.equal(url,'https://api.day.app/push');assert.equal(options.redirect,'manual');assert.equal(JSON.parse(options.body).device_key,e.BARK_DEVICE_KEY);return Response.json({code:200});}});
 assert.equal(accepted.state,'sent');
 assert.equal((await sendBark(job,e,{fetcher:async()=>{throw new Error(e.BARK_DEVICE_KEY);}})).state,'unknown');
 assert.equal((await sendBark(job,e,{fetcher:async()=>Response.json({code:429},{status:429})})).state,'retry');
 assert.ok(!JSON.stringify(accepted).includes(e.BARK_DEVICE_KEY));
});

test('admin test requests are idempotent and public endpoints never expose a key or push receipts',async()=>{
 const e=env(),key='test-request-0001';await queueBarkTest(e,key,now);await queueBarkTest(e,key,now);
 assert.equal(e.NOTIFY_DB.sql.prepare("SELECT count(*) AS n FROM bark_events WHERE kind='test'").get().n,1);
 const publicStatus=await handleRequest(new Request('https://radar.test/api/status'),e,{},now);
 const body=await publicStatus.text();assert.ok(!body.includes(e.BARK_DEVICE_KEY));assert.ok(!body.includes('receipts'));
 for(const path of ['/api/bark/status','/api/bark/test','/api/bark/check']){
  const r=await handleRequest(new Request('https://radar.test'+path,{method:path.endsWith('status')?'GET':'POST'}),e,{},now);assert.equal(r.status,401);
 }
 const headers={Authorization:'Bearer '+e.BARK_ADMIN_TOKEN,'Content-Type':'application/json'};
 const authorized=await handleRequest(new Request('https://radar.test/api/bark/status',{headers}),e,{},now);
 assert.equal(authorized.status,200);assert.equal(authorized.headers.get('Cache-Control'),'no-store');
 assert.equal(authorized.headers.get('Access-Control-Allow-Origin'),null);
 assert.ok(!(await authorized.text()).includes(e.BARK_DEVICE_KEY));
 const injected=await handleRequest(new Request('https://radar.test/api/bark/test',{method:'POST',headers,body:JSON.stringify({requestId:key,device_key:'another-device-key'})}),e,{},now);
 assert.equal(injected.status,400);
});
