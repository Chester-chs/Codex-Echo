import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../web/worker.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleVisitorRequest,runVisitorBark,sealDevice,openDevice,ensureOwnerSubscription} from '../web/visitor-bark.mjs';
import {createVisitorBarkClient} from '../src/lib/visitor-bark-client.mjs';
import {digest} from '../web/bark.mjs';

const NOW=Date.parse('2026-10-16T12:00:00Z'),iso=n=>new Date(n).toISOString(),origin='https://echo-radar.pages.dev';
const prefs=(p={})=>({resetAlerts:true,forecastAlerts:true,threshold:60,language:'zh',...p});
function database(before=async()=>{}){
 const sql=new DatabaseSync(':memory:');for(const f of ['0001_bark.sql','0002_visitor_bark.sql'])sql.exec(readFileSync(new URL('../web/migrations/'+f,import.meta.url),'utf8'));let queries=0;
 return {sql,get queries(){return queries;},prepare(q){queries++;let args=[];return {bind(...v){args=v;return this;},async run(){await before(q,args);return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}};},async first(){await before(q,args);return sql.prepare(q).get(...args)||null;},async all(){await before(q,args);return {results:sql.prepare(q).all(...args)};}};},async batch(list){sql.exec('BEGIN');try{const out=[];for(const p of list)out.push(await p.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
const env=()=>({NOTIFY_DB:database(),BARK_VISITORS_ENABLED:'true',BARK_ENABLED:'true',BARK_CIPHER_SECRET:'b'.repeat(64)});
const accepted=async()=>Response.json({code:200});
function request(path='',method='GET',body,token,site=origin){return new Request('https://radar.test/api/bark/subscription'+path,{method,headers:{Origin:site,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});}
async function bind(e,key='visitor-device-001',settings=prefs(),time=NOW){
 const r=await handleVisitorRequest(request('','POST',{deviceAddress:'https://api.day.app/'+key,requestId:'request-'+key,settings,consentVersion:'bark-v1'}),e,{now:time,fetcher:accepted});
 assert.equal(r.status,201,await r.clone().text());return r.json();
}
const reset=(id,posted=NOW+1000)=>({id,url:'https://x.com/thsottiaux/status/'+id,category:'reset',resetType:'automatic',original:'A public reset',translation:'公开重置公告',postedAt:iso(posted)});
const forecast=(probability=70,time=NOW+1000)=>({id:'watch-1',kind:'source-watch',probability,basis:'Public clue',basisZh:'公开线索',windowText:'within 24h',publishedAt:iso(time),checkedAt:iso(time),sourceFreshUntil:iso(time+1800000),validUntil:iso(time+3600000),sourceUrl:reset('10').url});
const feed=(records=[],f=null,time=NOW)=>({records,forecast:f,sources:[{name:'history',status:'ok',lastSuccessAt:iso(time)}]});

test('display-only archive posts never send reset or plan pushes, while real alerts still deliver',async()=>{
 const {mergeRecords}=await import('../backend/sources.mjs');const e=env();await bind(e,'context-device-001');
 const ordinary=['The reset is complete.','We will reset in 5 hours.'].map((original,i)=>({...reset('211753604604159590'+i),original,textStatus:'verified',visibilityOnly:true}));
 const sent=[],send=async job=>{sent.push(job);return {state:'sent',code:'provider_accepted'};};
 await runVisitorBark(e,feed(mergeRecords(ordinary)),{now:NOW+2000,send});assert.equal(sent.length,0);
 const actual={...reset('2117536046041595909',NOW+2000),original:'The reset is complete.',textStatus:'verified'};
 const current=feed(mergeRecords(ordinary,[actual]),forecast());
 await runVisitorBark(e,current,{now:NOW+3000,send});assert.equal(sent.length,1);assert.equal(sent[0].kind,'reset');
 await runVisitorBark(e,current,{now:NOW+63000,send});assert.equal(sent.length,2);assert.equal(sent[1].kind,'forecast');
});

test('announced plans use reset opt-in, ignore forecast thresholds, and never dispatch after their target',async()=>{
 const e=env();await bind(e,'plan-device-001',prefs({forecastAlerts:false,threshold:90}));
 const plan={...reset('2117536046041595904'),original:'We will reset Codex in 5 hours.',textStatus:'verified'};
 const sent=[];await runVisitorBark(e,feed([plan]),{now:NOW+2000,send:async job=>{sent.push(job);return {state:'sent',code:'provider_accepted'};}});
 assert.equal(sent.length,1);assert.equal(sent[0].event.scheduledAt,iso(NOW+1000+5*3600000));
 const e2=env();await bind(e2,'plan-device-002');
 let late=0;await runVisitorBark(e2,feed([plan],null,NOW+5*3600000+2000),{now:NOW+5*3600000+2000,send:async()=>{late++;return {state:'sent'};}});assert.equal(late,0);
});

test('a cancelled or superseded plan cannot be sent from a pending visitor queue',async()=>{
 const e=env();await bind(e,'plan-device-003');
 const old={...reset('2117536046041595904'),original:'We will reset in 5 hours.',textStatus:'verified'};
 const cancel={...reset('2117536046041595905',NOW+2000),original:'The reset is cancelled.',textStatus:'verified'};
 const sent=[];await runVisitorBark(e,feed([old,cancel]),{now:NOW+3000,send:async job=>{sent.push(job);return {state:'sent'};}});assert.equal(sent.length,0);
});

test('visitors receive one plan alert and one verified completion alert even before source classification catches up',async()=>{
 const e=env();await bind(e,'two-stage-device-001',prefs({forecastAlerts:false,threshold:90}));
 const plan={...reset('2117536046041595910'),original:'We will reset in 5 hours.',textStatus:'verified'};
 const sent=[],send=async job=>{sent.push(job);return {state:'sent',code:'provider_accepted'};};
 await runVisitorBark(e,feed([plan],null,NOW+2000),{now:NOW+2000,send});
 const at=NOW+5*3600000+61000;
 await runVisitorBark(e,feed([plan],null,at),{now:at,send});assert.equal(sent.length,1,'Passing the target is not completion');
 const done={...reset('2117536046041595911',at-1000),category:'post',resetType:'unknown',original:'The reset is complete.',textStatus:'verified'};
 await runVisitorBark(e,feed([done,plan],null,at),{now:at,send});
 await runVisitorBark(e,feed([done,plan],null,at+1000),{now:at+1000,send});
 assert.equal(sent.length,2);assert.equal(sent[1].event.id,done.id);assert.equal(sent[1].event.resetAt??null,null);
});

test('visitor subscriptions reject an unrelated website before processing a device address',async()=>{
 const request=new Request('https://radar.test/api/bark/subscription',{method:'POST',headers:{Origin:'https://unrelated.test','Content-Type':'application/json'},body:JSON.stringify({deviceAddress:'https://api.day.app/sample-device-key'})});
 const response=await handleRequest(request,{});
 assert.equal(response.status,403);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('binding validates the fixed Bark provider, encrypts addresses and returns only a management capability',async()=>{
 const e=env(),key='secret-visitor-device-001';let destination;
 const r=await handleVisitorRequest(request('','POST',{deviceAddress:'https://api.day.app/'+key,requestId:'bind-request-001',settings:prefs(),consentVersion:'bark-v1'}),e,{now:NOW,fetcher:async(url,options)=>{destination=url;assert.equal(options.redirect,'manual');return accepted();}});
 assert.equal(r.status,201);const value=await r.json();assert.match(value.token,/^[a-f0-9]{64}$/);assert.equal(value.deviceHint,'•••• -001');
 assert.equal(destination,'https://api.day.app/register/'+key);assert.ok(!JSON.stringify(value).includes(key));
 const row=e.NOTIFY_DB.sql.prepare('SELECT * FROM bark_subscriptions').get();assert.ok(!JSON.stringify(row).includes(key));assert.notEqual(row.token_hash,value.token);
 assert.equal(await openDevice(row.device_cipher,e.BARK_CIPHER_SECRET),key);
 assert.notEqual(await sealDevice(key,e.BARK_CIPHER_SECRET),row.device_cipher);
 await assert.rejects(openDevice(row.device_cipher,'a'.repeat(64)));
});

test('settings, receipts and deletion are isolated between visitors and stale edits are rejected',async()=>{
 const e=env(),a=await bind(e),b=await bind(e,'visitor-device-002',prefs({threshold:85,language:'en'}));
 let r=await handleVisitorRequest(request('','PATCH',{settings:prefs({resetAlerts:false,threshold:75}),version:a.version},a.token),e,{now:NOW+1000});
 assert.equal(r.status,200);assert.equal((await r.json()).settings.threshold,75);
 r=await handleVisitorRequest(request('','PATCH',{settings:prefs(),version:a.version},a.token),e,{now:NOW+1001});assert.equal(r.status,409);
 r=await handleVisitorRequest(request('','GET',null,b.token),e);assert.equal((await r.json()).settings.threshold,85);
 r=await handleVisitorRequest(request('','DELETE',null,a.token),e);assert.equal(r.status,200);
 assert.equal((await handleVisitorRequest(request('','GET',null,a.token),e)).status,401);
 assert.equal((await handleVisitorRequest(request('','GET',null,b.token),e)).status,200);
 const rows=e.NOTIFY_DB.sql.prepare('SELECT count(*) AS n FROM bark_subscriptions').get();assert.equal(rows.n,1);
});

test('malformed preferences, forged recipients, invalid provider keys and hostile origins never bind',async()=>{
 for(const settings of [prefs({threshold:65.1}),prefs({threshold:95}),prefs({language:'fr'}),{...prefs(),device_key:'forged'}]){
  const e=env(),r=await handleVisitorRequest(request('','POST',{deviceAddress:'valid-device-001',requestId:'bad-request-001',settings,consentVersion:'bark-v1'}),e,{now:NOW,fetcher:accepted});assert.equal(r.status,400);
 }
 const e=env();
 for(const deviceAddress of ['https://evil.test/private','https://api.day.app:444/key']){
  const r=await handleVisitorRequest(request('','POST',{deviceAddress,requestId:'bad-request-002',settings:prefs(),consentVersion:'bark-v1'}),e,{now:NOW,fetcher:()=>assert.fail('No arbitrary host request')});assert.equal(r.status,400);
 }
 const r=await handleVisitorRequest(request('','POST',{deviceAddress:'invalid-device-001',requestId:'bad-request-003',settings:prefs(),consentVersion:'bark-v1'}),e,{now:NOW,fetcher:async()=>Response.json({code:400})});assert.equal(r.status,400);
 assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) AS n FROM bark_subscriptions').get().n,0);
 const options=await handleVisitorRequest(request('','OPTIONS'),e);assert.equal(options.status,204);assert.equal(options.headers.get('Access-Control-Allow-Origin'),origin);
 assert.equal((await handleVisitorRequest(request('','GET',null,null,'https://evil.test'),e)).status,403);
});

test('same-device rebinding uses one subscription, rotates its management token, and respects free capacity',async()=>{
 const e=env();e.BARK_VISITOR_CAPACITY='1';const a=await bind(e);
 const r=await handleVisitorRequest(request('','POST',{deviceAddress:'visitor-device-001',requestId:'new-browser-0001',settings:prefs({threshold:80}),consentVersion:'bark-v1'}),e,{now:NOW+1000,fetcher:accepted});assert.equal(r.status,201);const next=await r.json();assert.notEqual(next.token,a.token);
 assert.equal((await handleVisitorRequest(request('','GET',null,a.token),e)).status,401);
 const full=await handleVisitorRequest(request('','POST',{deviceAddress:'visitor-device-002',requestId:'new-device-0002',settings:prefs(),consentVersion:'bark-v1'}),e,{now:NOW+2000,fetcher:accepted});assert.equal(full.status,503);assert.equal((await full.json()).error,'capacity_reached');
 assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) AS n FROM bark_subscriptions').get().n,1);
});

test('subscription controls apply independently and initial history never broadcasts',async()=>{
 const e=env();await bind(e,'visitor-device-001',prefs({forecastAlerts:false}));await bind(e,'visitor-device-002',prefs({resetAlerts:false,threshold:80,language:'en'}));
 const sent=[],send=async(job,recipient)=>{sent.push({job,recipient});return {state:'sent',code:'provider_accepted'};};
 await runVisitorBark(e,feed([reset('1',NOW-1000)],forecast(90,NOW-1000)),{now:NOW,send});assert.equal(sent.length,0);
 await runVisitorBark(e,feed([reset('2')],forecast(70)),{now:NOW+2000,send});
 assert.equal(sent.length,1);assert.equal(sent[0].recipient.BARK_DEVICE_KEY,'visitor-device-001');assert.equal(sent[0].job.kind,'reset');
 await runVisitorBark(e,feed([reset('2')],forecast(85,NOW+3000)),{now:NOW+4000,send});
 assert.equal(sent.length,2);assert.equal(sent[1].recipient.BARK_DEVICE_KEY,'visitor-device-002');assert.equal(sent[1].recipient.BARK_LANGUAGE,'en');
 await runVisitorBark(e,feed([reset('2')],forecast(85,NOW+3000)),{now:NOW+5000,send});assert.equal(sent.length,2);
});

test('test messages queue idempotently, are throttled, and cannot manufacture device receipt',async()=>{
 const e=env(),a=await bind(e);
 const q=()=>handleVisitorRequest(request('/test','POST',{requestId:'test-request-001'},a.token),e,{now:NOW+1000});
 assert.equal((await q()).status,202);assert.equal((await q()).status,202);
 assert.equal((await handleVisitorRequest(request('/test','POST',{requestId:'test-request-002'},a.token),e,{now:NOW+2000})).status,429);
 let r=await handleVisitorRequest(request('','GET',null,a.token),e);let state=await r.json();assert.equal(state.receipts[0].state,'pending');
 await runVisitorBark(e,feed(),{now:NOW+3000,send:async()=>({state:'sent',code:'provider_accepted'})});
 state=await (await handleVisitorRequest(request('','GET',null,a.token),e)).json();assert.equal(state.receipts[0].code,'provider_accepted');assert.ok(!JSON.stringify(state).includes(a.token));
});

test('unknown results never repeat, superseded retries cancel, and stale sources do not notify',async()=>{
 const e=env();await bind(e);let sends=0;
 const send=async job=>{sends++;return job.kind==='reset'?{state:'unknown',code:'transport_uncertain'}:{state:'retry',code:'provider_429'};};
 await runVisitorBark(e,feed([reset('1')],forecast(70)),{now:NOW+2000,send});
 await runVisitorBark(e,feed([reset('1')],forecast(70)),{now:NOW+3000,send});assert.equal(sends,2);
 await runVisitorBark(e,feed([reset('1')],forecast(20)),{now:NOW+300000,send});assert.equal(sends,2);
 assert.equal(e.NOTIFY_DB.sql.prepare("SELECT state FROM bark_events WHERE kind='forecast'").get().state,'cancelled');
 await runVisitorBark(e,{...feed([reset('2')],forecast(90)),sources:[]},{now:NOW+301000,send});assert.equal(sends,2);
});

test('owner import happens once, retains deduplication, and unsubscribe is never undone by a timer',async()=>{
 const e=env();e.BARK_DEVICE_KEY='owner-device-key';await ensureOwnerSubscription(e,NOW);await ensureOwnerSubscription(e,NOW+1000);
 assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) AS n FROM bark_subscriptions').get().n,1);
 const owner=await bind(e,'owner-device-key');await handleVisitorRequest(request('','DELETE',null,owner.token),e);
 await ensureOwnerSubscription(e,NOW+2000);assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) AS n FROM bark_subscriptions').get().n,0);
});

test('unsubscribe during dispatch preparation prevents the queued network send',async()=>{
 const e=env();let cancel=false,subscriber;
 e.NOTIFY_DB=database(async q=>{if(cancel&&q.startsWith("UPDATE bark_events SET state='sending'")){cancel=false;e.NOTIFY_DB.sql.prepare('DELETE FROM bark_subscriptions WHERE token_hash=?').run(subscriber.token_hash);}});
 await bind(e);subscriber=e.NOTIFY_DB.sql.prepare('SELECT token_hash FROM bark_subscriptions').get();cancel=true;let sends=0;
 await runVisitorBark(e,feed([reset('1')]),{now:NOW+2000,send:async()=>{sends++;return {state:'sent'};}});assert.equal(sends,0);
});

test('three-dispatch budget covers 1000 recent posts and the worst source queue path on D1 Free',async()=>{
 const e=env();for(let i=0;i<3;i++)await bind(e,'visitor-device-00'+i);
 const before=e.NOTIFY_DB.queries;let sends=0;
 await runVisitorBark(e,feed(Array.from({length:1000},(_,i)=>reset(String(i+100))),forecast()),{now:NOW+2000,send:async()=>{sends++;return {state:'sent',code:'provider_accepted'};}});
 assert.equal(sends,3);assert.ok(e.NOTIFY_DB.queries-before<=50,e.NOTIFY_DB.queries-before+' queries');
});

test('unsubscribe cannot reset the device daily allowance, even after a fresh binding',async()=>{
 const e=env(),a=await bind(e),id=e.NOTIFY_DB.sql.prepare('SELECT device_hash FROM bark_subscriptions').get().device_hash;
 e.NOTIFY_DB.sql.prepare('INSERT INTO bark_daily(recipient,day,attempts) VALUES(?,?,20)').run(id,iso(NOW).slice(0,10));
 await handleVisitorRequest(request('','DELETE',null,a.token),e);await bind(e,'visitor-device-001',prefs(),NOW+1000);let sends=0;
 await runVisitorBark(e,feed([reset('1',NOW+2000)]),{now:NOW+3000,send:async()=>{sends++;return {state:'sent'};}});
 assert.equal(sends,0);assert.equal(e.NOTIFY_DB.sql.prepare('SELECT attempts FROM bark_daily WHERE recipient=?').get(id).attempts,20);
});

test('the final subscription fence blocks unsubscribe and preference changes after event claim',async()=>{
 for(const mode of ['unsubscribe','pause']){
  const e=env();let act=false,a;
  e.NOTIFY_DB=database(async q=>{if(act&&q.startsWith('SELECT 1 AS valid FROM bark_subscriptions')){act=false;if(mode==='unsubscribe')await handleVisitorRequest(request('','DELETE',null,a.token),e);else await handleVisitorRequest(request('','PATCH',{settings:prefs({resetAlerts:false,forecastAlerts:false}),version:a.version},a.token),e);}});
  a=await bind(e);act=true;let sends=0;
  await runVisitorBark(e,feed([reset('1')]),{now:NOW+2000,send:async()=>{sends++;return {state:'sent'};}});assert.equal(sends,0);
 }
});

test('expiry during the last database await is rechecked before a provider request',async()=>{
 const e=env();let time=NOW,expire=false;
 e.NOTIFY_DB=database(async q=>{if(expire&&q.startsWith('SELECT 1 AS valid FROM bark_subscriptions'))time=NOW+10000;});
 await bind(e);expire=true;time=NOW+2000;let sends=0;
 await runVisitorBark(e,feed([],{...forecast(),validUntil:iso(NOW+5000)}),{now:()=>time,send:async()=>{sends++;return {state:'sent'};}});
 assert.equal(sends,0);assert.equal(e.NOTIFY_DB.sql.prepare('SELECT code FROM bark_events').get().code,'expired_before_dispatch');
});

test('a concurrent replacement credential cannot receive a false successful unsubscribe',async()=>{
 const e=env();let replace=false;
 e.NOTIFY_DB=database(async q=>{if(replace&&q.startsWith('DELETE FROM bark_subscriptions')){replace=false;e.NOTIFY_DB.sql.prepare("UPDATE bark_subscriptions SET token_hash='replacement'").run();}});
 const a=await bind(e);replace=true;
 const r=await handleVisitorRequest(request('','DELETE',null,a.token),e);assert.equal(r.status,401);assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) AS n FROM bark_subscriptions').get().n,1);
});

test('bind requests are rate limited before making more provider requests',async()=>{
 const e=env();let calls=0;
 for(let i=0;i<7;i++){
  const r=await handleVisitorRequest(request('','POST',{deviceAddress:'visitor-device-001',requestId:'rate-request-00'+i,settings:prefs(),consentVersion:'bark-v1'}),e,{now:NOW,fetcher:async()=>{calls++;return accepted();}});
  assert.equal(r.status,i<6?201:429);
 }
 assert.equal(calls,6);
});

test('browser stores only the management token and an old unauthorized response cannot erase a new session',async()=>{
 const stored=new Map(),key='client-secret-device',firstToken='a'.repeat(64),nextToken='c'.repeat(64);let release,number=0;
 const storage={getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 const client=createVisitorBarkClient({storage,fetcher:async(url,options)=>{
  assert.ok(!url.includes(key));
  if(options.method==='POST'){number++;return Response.json({bound:true,token:number===1?firstToken:nextToken});}
  if(options.method==='GET')return new Promise(resolve=>release=()=>resolve(Response.json({error:'session_expired'},{status:401})));
  return Response.json({deleted:true});
 }});
 const bound=await client.bind(key,prefs(),'client-request-001');assert.ok(!JSON.stringify(bound).includes(firstToken));assert.deepEqual([...stored.values()],[firstToken]);
 const pending=client.load();await new Promise(resolve=>setImmediate(resolve));await client.bind(key,prefs(),'client-request-002');release();await assert.rejects(pending);
 assert.equal(client.hasSession(),true);assert.deepEqual([...stored.values()],[nextToken]);await client.unsubscribe();assert.equal(stored.size,0);
});

test('expired dispatch leases cannot duplicate a delivery claimed by a newer invocation',async()=>{
 const e=env();let block=false,release,reached;
 const gate=new Promise(resolve=>release=resolve),paused=new Promise(resolve=>reached=resolve);
 e.NOTIFY_DB=database(async q=>{if(block&&q.startsWith("UPDATE bark_events SET state='sending'")){block=false;reached();await gate;}});
 await bind(e);let sends=0;const send=async()=>{sends++;return {state:'sent',code:'provider_accepted'};};block=true;
 const a=runVisitorBark(e,feed([reset('1')]),{now:NOW+2000,send});await paused;
 await runVisitorBark(e,feed([reset('1')]),{now:NOW+400000,send});release();await a;assert.equal(sends,1);
});

test('a recovered interrupted visitor send is never resent or overwritten by its late response',async()=>{
 const e=env();await bind(e);let release,reached,sends=0;
 const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>reached=resolve);
 const a=runVisitorBark(e,feed([reset('1')]),{now:NOW+2000,send:async()=>{sends++;reached();await gate;return {state:'retry',code:'provider_429'};}});await started;
 await runVisitorBark(e,feed([reset('1')]),{now:NOW+400000,send:async()=>{sends++;return {state:'sent'};}});release();await a;
 assert.equal(sends,1);assert.equal(e.NOTIFY_DB.sql.prepare('SELECT state FROM bark_events').get().state,'unknown');
});

test('global daily cap stops every recipient without making a provider request',async()=>{
 const e=env();await bind(e);e.NOTIFY_DB.sql.prepare('INSERT INTO bark_daily(recipient,day,attempts) VALUES(?,?,600)').run('visitor-dispatch:v1',iso(NOW).slice(0,10));let sends=0;
 await runVisitorBark(e,feed([reset('1')]),{now:NOW+2000,send:async()=>{sends++;return {state:'sent'};}});assert.equal(sends,0);
});

test('tests are rejected when daily allowance is exhausted and old queued tests expire',async()=>{
 const e=env(),a=await bind(e),id=e.NOTIFY_DB.sql.prepare('SELECT device_hash FROM bark_subscriptions').get().device_hash;
 e.NOTIFY_DB.sql.prepare('INSERT INTO bark_daily(recipient,day,attempts) VALUES(?,?,20)').run(id,iso(NOW).slice(0,10));
 const capped=await handleVisitorRequest(request('/test','POST',{requestId:'daily-test-001'},a.token),e,{now:NOW+1000});assert.equal(capped.status,429);assert.equal((await capped.json()).error,'daily_limit');
 e.NOTIFY_DB.sql.prepare('UPDATE bark_daily SET attempts=0').run();
 await handleVisitorRequest(request('/test','POST',{requestId:'daily-test-002'},a.token),e,{now:NOW+1000});let sends=0;
 await runVisitorBark(e,feed(),{now:NOW+1000000,send:async()=>{sends++;return {state:'sent'};}});assert.equal(sends,0);assert.equal(e.NOTIFY_DB.sql.prepare('SELECT state FROM bark_events').get().state,'cancelled');
});

test('first-owner migration, 1000 source records, stale cancellation and three sends fit Free D1 together',async t=>{
 const e=env();for(let i=0;i<3;i++)await bind(e,'visitor-device-00'+i);
 const row=e.NOTIFY_DB.sql.prepare('SELECT * FROM bark_subscriptions LIMIT 1').get();
 for(let i=0;i<17;i++){
  const id='old-recipient-'+i;
  e.NOTIFY_DB.sql.prepare('INSERT INTO bark_subscriptions(device_hash,device_cipher,device_hint,token_hash,reset_alerts,forecast_alerts,threshold,language,created,updated) VALUES(?,?,?,?,1,1,60,\'zh\',?,?)').run(id,row.device_cipher,'test','test-token-'+i,NOW,NOW);
  e.NOTIFY_DB.sql.prepare('INSERT INTO bark_control(id,baseline_at) VALUES(?,?)').run(id,NOW);
  e.NOTIFY_DB.sql.prepare("INSERT INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated) VALUES(?,?,'forecast',?,'pending',?,?,?)").run(id,'forecast:old-'+i,JSON.stringify(forecast(90,NOW-1000)),NOW,NOW-1,NOW);
 }
 e.BARK_DEVICE_KEY='owner-device-key';e.NOTIFY_DB.sql.prepare('INSERT INTO bark_control(id,baseline_at) VALUES(?,?)').run(await digest(e.BARK_DEVICE_KEY),NOW);
 const before=e.NOTIFY_DB.queries;let sends=0;
 await runVisitorBark(e,feed(Array.from({length:1000},(_,i)=>reset(String(i+100))),forecast()),{now:NOW+2000,send:async()=>{sends++;return {state:'sent',code:'provider_accepted'};}});
 assert.equal(sends,3);const count=e.NOTIFY_DB.queries-before;assert.ok(count<=50,count+' queries');t.diagnostic('Worst-path SQL statements: '+count);
});
