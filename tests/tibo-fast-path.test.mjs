import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{syncPublic,handleRequest} from '../web/worker.mjs';
import * as tweets from '../web/tibo-alerts.mjs';
import {discoverCodexReset} from '../web/codex-alerts.mjs';
import {runVisitorBark,consumeBarkBatch,sealDevice} from '../web/visitor-bark.mjs';
import {digest} from '../web/bark.mjs';
import {mergeRecords} from '../backend/sources.mjs';
const NOW=Date.parse('2026-10-17T16:00:00Z'),iso=n=>new Date(n).toISOString();
function database(){const sql=new DatabaseSync(':memory:');for(const f of ['0001_bark.sql','0002_visitor_bark.sql'])sql.exec(readFileSync(new URL('../web/migrations/'+f,import.meta.url),'utf8'));let queries=0;return {sql,get queries(){return queries;},prepare(q){queries++;let args=[];return {bind(...v){args=v;return this;},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}};},async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};}};},async batch(list){sql.exec('BEGIN');try{const out=[];for(const p of list)out.push(await p.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};}
const record=(text='We will reset in 2 hours.',id='2117536046041595904',at=NOW-1000,extra={})=>({id,url:'https://x.com/thsottiaux/status/'+id,text,at:iso(at),kind:'signal',explicit_reset_claim:false,is_reply:false,replying_to:null,in_reply_to_tweet_id:null,...extra});
const feed=(rows=[],context=[],at=NOW)=>({source:'x-api',fetched_at:iso(at),stale:false,tweets:rows,radar_context:context});
async function setup({count=1,baseline=true,queue=false}={}){const db=database();let value={records:[],sources:[{name:'history',status:'ok',lastSuccessAt:iso(NOW)}],history:[],backfillComplete:true,baseline:NOW-3600000},writes=0;
 const e={NOTIFY_DB:db,BARK_ENABLED:'true',BARK_VISITORS_ENABLED:'true',BARK_CIPHER_SECRET:'d'.repeat(64),RADAR:{async get(){return structuredClone(value);},async put(key,body){writes++;value=JSON.parse(body);}},get kv(){return value;},get writes(){return writes;}};
 if(queue)e.BARK_QUEUE={messages:[],async sendBatch(rows){this.messages.push(...rows);}};
 if(baseline)for(const key of ['codex-reset:baseline','tibo-posts:baseline:v1'])db.sql.prepare('INSERT INTO bark_meta VALUES(?,?)').run(key,String(NOW-3600000));
 for(let i=0;i<count;i++){const id=await digest('fast-device-'+i),cipher=await sealDevice('fast-device-'+i,e.BARK_CIPHER_SECRET);db.sql.prepare("INSERT INTO bark_subscriptions(device_hash,device_cipher,device_hint,token_hash,reset_alerts,forecast_alerts,threshold,language,created,updated) VALUES(?,?,?,?,1,1,90,'en',?,?)").run(id,cipher,'test',await digest('fast-token-'+i),NOW-3600000,NOW-3600000);db.sql.prepare('INSERT INTO bark_control(id,baseline_at) VALUES(?,?)').run(id,NOW-3600000);}
 return e;
}
function source(payload,latest=null){const calls=[];const fetcher=async url=>{calls.push(url);if(url.endsWith('/api/feed'))return Response.json(payload);if(url.endsWith('/api/forecast'))return Response.json({latest_alert:latest});if(url.endsWith('/tibo/x'))return new Response('<html>Archive temporarily unavailable</html>');return new Response('missing',{status:503});};return {fetcher,calls};}
const log=()=>{};
test('ordinary posts update the website once, never add Bark events, and repeated minutes do not write KV',async()=>{
 const e=await setup(),p=record('Working on something fun.');p.kind='other';const context={id:'2117536046041595905',url:'https://x.com/thsottiaux/status/2117536046041595905',text:'A daily reply',at:iso(NOW-500),visibility_only:true,display_kind:'context'};
 const upstream=source(feed([p],[context]));await tweets.discoverTiboPosts(e,{now:NOW,...upstream,log});assert.equal(e.writes,1);assert.equal(e.kv.records.length,2);assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) n FROM bark_events').get().n,0);
 await tweets.discoverTiboPosts(e,{now:NOW+60000,...upstream,log});assert.equal(e.writes,1);
});
test('one minute scheduled call discovers and sends a new plan without waiting for KV propagation',async()=>{
 const e=await setup(),upstream=source(feed([record()])),sent=[];const originalGet=e.RADAR.get;e.RADAR.get=async()=>({records:[],sources:[]});
 await worker.scheduled({cron:'* * * * *'},e,{}, {now:NOW,...upstream,send:async job=>{sent.push(job);return {state:'sent',code:'provider_accepted'};}});e.RADAR.get=originalGet;
 assert.equal(sent.length,1);assert.equal(sent[0].kind,'alert');assert.match(sent[0].key,/^reset:2117536046041595904:plan:/);assert.equal(sent[0].event.tweetClass,'plan');
 const after=e.NOTIFY_DB.sql.prepare('SELECT state FROM bark_events').get();assert.equal(after.state,'sent');
 await tweets.discoverTiboPosts(e,{now:NOW+60000,...upstream,log});await runVisitorBark(e,{...e.kv,records:mergeRecords(e.kv.records)},{now:NOW+60000,send:()=>assert.fail('Duplicate plan')});
});
test('queue configuration enqueues references within the same scheduled call',async()=>{
 const e=await setup({queue:true}),upstream=source(feed([record()]));await worker.scheduled({cron:'* * * * *'},e,{}, {now:NOW,...upstream});assert.equal(e.BARK_QUEUE.messages.length,1);assert.ok(e.BARK_QUEUE.messages[0].body.eventKey.includes(':plan:'));
});
test('a new deployment fences past tweets while still displaying them',async()=>{
 const e=await setup({baseline:false}),upstream=source(feed([record()]));await tweets.discoverTiboPosts(e,{now:NOW,...upstream,log});assert.equal(e.kv.records.length,1);assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) n FROM bark_events').get().n,0);await runVisitorBark(e,e.kv,{now:NOW,send:()=>assert.fail('Historical plan replayed through legacy path')});assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) n FROM bark_events').get().n,0);
});
test('upgrading an active monitor catches a plan published before the first new-code run exactly once',async()=>{
 for(const oldFeatureFence of [false,true]){
  const e=await setup(),db=e.NOTIFY_DB.sql;
  db.prepare("DELETE FROM bark_meta WHERE name='tibo-posts:baseline:v1'").run();
  if(oldFeatureFence)db.prepare('INSERT INTO bark_meta VALUES(?,?)').run('tibo-posts:baseline:v1',String(NOW-144469));
  const parent=record('Day 13/ Le limit reset','2111492673890824348',NOW-300000),plan=record('Landing sometime today by EOD PST','2111492738025959922',NOW-288938,{is_reply:true,replying_to:'thsottiaux',in_reply_to_tweet_id:parent.id}),upstream=source(feed([plan,parent])),sent=[];
  const prefs=db.prepare('SELECT reset_alerts,forecast_alerts,threshold,language,token_hash,device_cipher,revision FROM bark_subscriptions').all();
  for(const now of [NOW,NOW+60000,NOW+120000])await worker.scheduled({cron:'* * * * *'},e,{}, {now,...upstream,send:async j=>{sent.push(j);return {state:'sent',code:'provider_accepted'};}});
  assert.equal(sent.length,1);assert.equal(sent[0].event.id,'2111492738025959922');assert.equal(sent[0].event.tweetClass,'plan');
  assert.equal(db.prepare("SELECT count(*) n FROM bark_events WHERE state='sent'").get().n,1);
  assert.equal(db.prepare("SELECT code FROM bark_events WHERE state='cancelled'").get().code,'superseded_by_plan');
  assert.deepEqual(db.prepare('SELECT reset_alerts,forecast_alerts,threshold,language,token_hash,device_cipher,revision FROM bark_subscriptions').all(),prefs);
 }
});

test('upgrade recovery does not replay a plan already sent by the legacy path or notify a later subscriber',async()=>{
 const e=await setup({count:2}),db=e.NOTIFY_DB.sql,p=record(),upstream=source(feed([p]));
 await tweets.discoverTiboPosts(e,{now:NOW,...upstream,log});
 db.prepare("UPDATE bark_events SET kind='reset',state='sent',attempts=1,code='provider_accepted'").run();
 db.prepare("DELETE FROM bark_meta WHERE name LIKE 'tibo-posts:seen:%'").run();
 db.prepare("UPDATE bark_meta SET value=? WHERE name='tibo-posts:baseline:v1'").run(String(NOW));
 const devices=db.prepare('SELECT device_hash FROM bark_subscriptions ORDER BY device_hash').all();
 db.prepare('DELETE FROM bark_events WHERE recipient=?').run(devices[1].device_hash);
 db.prepare('UPDATE bark_control SET baseline_at=? WHERE id=?').run(NOW,devices[1].device_hash);
 await worker.scheduled({cron:'* * * * *'},e,{}, {now:NOW+60000,...upstream,send:()=>assert.fail('Already notified or subscribed after the post')});
 const rows=db.prepare('SELECT kind,state,attempts FROM bark_events').all();assert.equal(rows.length,1);assert.equal(rows[0].state,'sent');assert.equal(rows[0].attempts,1);
});

test('legacy fallback uses the active monitor start when an upgrade feed read fails',async()=>{
 const e=await setup(),db=e.NOTIFY_DB.sql,p=record();
 await tweets.discoverTiboPosts(e,{now:NOW,...source(feed([p])),log});db.prepare('DELETE FROM bark_events').run();
 db.prepare("UPDATE bark_meta SET value=? WHERE name='tibo-posts:baseline:v1'").run(String(NOW));
 const sent=[];await worker.scheduled({cron:'* * * * *'},e,{}, {now:NOW+60000,fetcher:async()=>new Response('Unavailable',{status:503}),send:async j=>{sent.push(j);return {state:'sent',code:'provider_accepted'};}});
 assert.equal(sent.length,1);assert.equal(sent[0].event.id,p.id);
});

test('a failed or throttled first feed read still fences historical KV plans',async()=>{
 for(const throttled of [false,true]){const e=await setup({baseline:false}),p=record(),r={id:p.id,url:p.url,postedAt:p.at,original:p.text,textStatus:'mirror',textSource:'https://codex-reset.com/api/feed',category:'post'};await e.RADAR.put('public-v1',JSON.stringify({...e.kv,records:[r]}));
  if(throttled)for(const path of ['/api/feed','/tibo/x'])e.NOTIFY_DB.sql.prepare('INSERT INTO bark_meta VALUES(?,?)').run('codex-reset:attempt:'+path,String(NOW));
  await worker.scheduled({cron:'* * * * *'},e,{}, {now:NOW,fetcher:async()=>new Response('Unavailable',{status:503}),send:()=>assert.fail('History replayed after first-read failure')});assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) n FROM bark_events').get().n,0);assert.ok(e.NOTIFY_DB.sql.prepare("SELECT value FROM bark_meta WHERE name='tibo-posts:baseline:v1'").get());
 }
});
test('strong provider labels never turn replies to other people into alerts; missing parents can arrive later',async()=>{
 const e=await setup(),other=record('Global reset by EOD.','2117536046041595907',NOW-500,{is_reply:true,replying_to:'poteto'}),parent=record('Loading a banked reset.','2117536046041595908',NOW-2000),child=record('Will be there by EOD PST.','2117536046041595909',NOW-1000,{is_reply:true,replying_to:'thsottiaux',in_reply_to_tweet_id:parent.id});
 const logs=[];await tweets.discoverTiboPosts(e,{now:NOW,...source(feed([other,child])),log:r=>logs.push(r)});assert.equal(e.NOTIFY_DB.sql.prepare('SELECT count(*) n FROM bark_events').get().n,0);assert.ok(logs.some(l=>l.reason==='reply_to_other'));assert.ok(logs.some(l=>l.reason==='parent_missing'));
 await tweets.discoverTiboPosts(e,{now:NOW+60000,...source(feed([other,child,parent])),log});const event=JSON.parse(e.NOTIFY_DB.sql.prepare('SELECT payload FROM bark_events').get().payload);assert.equal(event.tweetClass,'plan');assert.equal(event.scope,'banked');assert.equal(e.kv.records.length,3);
});
test('cancelled and superseded fast plans are not sent before the slow KV path catches up',async()=>{
 for(const cancelled of [true,false]){const e=await setup(),first=record(),next=record(cancelled?'The reset is cancelled.':'We will reset in 5 hours.','2117536046041595909',NOW+1000);
  await tweets.discoverTiboPosts(e,{now:NOW,...source(feed([first])),log});await tweets.discoverTiboPosts(e,{now:NOW+60000,...source(feed([next,first])),log});const sent=[];await runVisitorBark(e,{records:[],sources:[]},{now:NOW+60000,send:async j=>{sent.push(j);return {state:'sent'};}});assert.equal(sent.length,cancelled?0:1);if(!cancelled)assert.equal(sent[0].event.id,next.id);
 }
});
test('KV failure cannot prevent direct D1 alert delivery',async()=>{
 const e=await setup(),upstream=source(feed([record()])),sent=[];e.RADAR.get=async()=>{throw new Error('KV temporarily unavailable');};await worker.scheduled({cron:'* * * * *'},e,{}, {now:NOW,...upstream,send:async j=>{sent.push(j);return {state:'sent'};}});assert.equal(sent.length,1);
});
test('a self-reply inherits a parent from the preceding minute even when KV is unavailable',async()=>{
 const e=await setup(),parent=record('Loading a banked reset.','2117536046041595908',NOW-2000),child=record('Will be there by EOD PST.','2117536046041595909',NOW-1000,{is_reply:true,replying_to:'thsottiaux',in_reply_to_tweet_id:parent.id});await tweets.discoverTiboPosts(e,{now:NOW,...source(feed([parent])),log});e.RADAR.get=async()=>{throw new Error('KV unavailable');};const sent=[];await worker.scheduled({cron:'* * * * *'},e,{}, {now:NOW+60000,...source(feed([child])),send:async j=>{sent.push(j);return {state:'sent'};}});assert.equal(sent.length,1);assert.equal(sent[0].event.scope,'banked');
});
test('a legacy reset sent first covers the subsequent completion tweet and provider event',async()=>{
 for(const measured of [false,true]){const e=await setup(),post=record('The reset is complete.'),recipient=e.NOTIFY_DB.sql.prepare('SELECT device_hash FROM bark_subscriptions').get().device_hash;
  e.NOTIFY_DB.sql.prepare("INSERT INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated) VALUES(?,?,'reset',?,'sent',?,?,?)").run(recipient,'reset:'+post.id,JSON.stringify({id:post.id,category:'reset'}),NOW-1000,NOW-1000,NOW-1000);
  if(measured){const alert={id:post.id,kind:'reset',state:'confirmed',source_at:post.at,summary:'Observed reset',url:post.url,confirmation_source:'operator_observed',observed_at:post.at};await discoverCodexReset(e,{now:NOW,...source(feed(),alert)});}else await tweets.discoverTiboPosts(e,{now:NOW,...source(feed([post])),log});
  await runVisitorBark(e,e.kv,{now:NOW,send:()=>assert.fail('Duplicate completion after legacy reset')});assert.equal(e.NOTIFY_DB.sql.prepare("SELECT code FROM bark_events WHERE kind='alert'").get().code,'covered_by_earlier_alert');
 }
});
test('two Queue consumers cannot send two confirmations concurrently',async()=>{
 const e=await setup({queue:true}),first=record('The reset is complete.'),second=record('All propagated.','2117536046041595909',NOW-500);await tweets.discoverTiboPosts(e,{now:NOW,...source(feed([first,second])),log});const rows=e.NOTIFY_DB.sql.prepare("SELECT recipient,event_key FROM bark_events WHERE kind='alert'").all(),message=r=>({body:{recipient:r.recipient,eventKey:r.event_key},ack(){},retry(){}});let release,started;const gate=new Promise(r=>release=r),begin=new Promise(r=>started=r),sent=[];
 const one=consumeBarkBatch({messages:[message(rows[0])]},e,{now:NOW,send:async j=>{sent.push(j);started();await gate;return {state:'sent'};}});await begin;await consumeBarkBatch({messages:[message(rows[1])]},e,{now:NOW,send:()=>assert.fail('Concurrent completion')});release();await one;await consumeBarkBatch({messages:[message(rows[1])]},e,{now:NOW+60000,send:()=>assert.fail('Completion already covered')});assert.equal(sent.length,1);assert.equal(e.NOTIFY_DB.sql.prepare("SELECT code FROM bark_events WHERE kind='alert' AND state='cancelled'").get().code,'covered_by_earlier_alert');
});
test('a prior completion cannot block a valid legacy plan with no completion flag',async()=>{
 for(const queue of [false,true]){const e=await setup({queue}),p=record();await tweets.discoverTiboPosts(e,{now:NOW,...source(feed([p])),log});e.NOTIFY_DB.sql.prepare("UPDATE bark_events SET kind='reset'").run();const row=e.NOTIFY_DB.sql.prepare('SELECT * FROM bark_events').get();
  e.NOTIFY_DB.sql.prepare("INSERT INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated) VALUES(?,'previous','alert',?,'sent',?,?,?)").run(row.recipient,JSON.stringify({kind:'reset',state:'confirmed',id:'2117536046041595998',sourceAt:iso(NOW-60000)}),NOW-60000,NOW-60000,NOW-60000);
  const sent=[],send=async j=>{sent.push(j);return {state:'sent'};};if(queue)await consumeBarkBatch({messages:[{body:{recipient:row.recipient,eventKey:row.event_key},ack(){},retry(){}}]},e,{now:NOW,send});else await runVisitorBark(e,e.kv,{now:NOW,send});assert.equal(sent.length,1);assert.equal(sent[0].event.category,'schedule');
 }
});
test('all endpoint budgets are shared with slow collection in both concurrent orders',async()=>{
 for(const slowFirst of [false,true]){const e=await setup(),upstream=source(feed()),collect=async({codexRequest,now})=>{await Promise.allSettled(['/api/feed','/tibo/x','/api/forecast'].map(codexRequest));return {records:[],sources:[],checkedAt:now};};
  const slow=()=>syncPublic(e,{now:NOW,collect,fetcher:upstream.fetcher}),fast=()=>worker.scheduled({cron:'* * * * *'},e,{}, {now:NOW,...upstream});
  await Promise.all(slowFirst?[slow(),fast()]:[fast(),slow()]);for(const path of ['/api/feed','/tibo/x','/api/forecast'])assert.equal(upstream.calls.filter(u=>u.endsWith(path)).length,1,path);
 }
});
test('completion tweet and measured confirmation deliver once in either arrival order',async()=>{
 for(const tweetFirst of [true,false]){const e=await setup(),post=record('The reset is complete.'),alert={id:'2117536046041595999',kind:'reset',state:'confirmed',source_at:iso(NOW-500),summary:'Observed reset',url:'https://x.com/thsottiaux/status/2117536046041595999',confirmation_source:'operator_observed',observed_at:iso(NOW-500)},sent=[];
  const send=async j=>{sent.push(j);return {state:'sent',code:'provider_accepted'};};
  if(tweetFirst)await tweets.discoverTiboPosts(e,{now:NOW,...source(feed([post])),log});else await discoverCodexReset(e,{now:NOW,...source(feed(),alert)});
  await runVisitorBark(e,e.kv,{now:NOW,send});
  if(tweetFirst)await discoverCodexReset(e,{now:NOW+60000,...source(feed(),alert)});else await tweets.discoverTiboPosts(e,{now:NOW+60000,...source(feed([post])),log});
  await runVisitorBark(e,e.kv,{now:NOW+60000,send});assert.equal(sent.length,1);assert.equal(e.NOTIFY_DB.sql.prepare("SELECT code FROM bark_events WHERE kind='alert' AND state='cancelled'").get().code,'covered_by_earlier_alert');
 }
});
test('a thread plan supersedes pending commitment, but adds detail after an already sent commitment',async()=>{
 for(const alreadySent of [false,true]){const e=await setup(),parent=record('Day 8/ Reset'),plan=record('Landing within the next 2 hours','2117536046041595905',NOW-500,{is_reply:true,replying_to:'THSOTTIAUX',in_reply_to_tweet_id:parent.id});
  if(alreadySent){await tweets.discoverTiboPosts(e,{now:NOW-100,...source(feed([parent])),log});await runVisitorBark(e,e.kv,{now:NOW-100,send:async()=>({state:'sent'})});}
  await tweets.discoverTiboPosts(e,{now:alreadySent?NOW+60000:NOW,...source(feed([plan,parent])),log});const rows=e.NOTIFY_DB.sql.prepare('SELECT event_key,state,code FROM bark_events ORDER BY created').all();assert.equal(rows.find(r=>r.event_key.endsWith('commitment')).state,alreadySent?'sent':'cancelled');if(!alreadySent)assert.equal(rows.find(r=>r.event_key.endsWith('commitment')).code,'superseded_by_plan');assert.equal(rows.find(r=>r.event_key.includes(':plan:')).state,'pending');
 }
});
test('complete minute cron respects Free D1 budget with many records and multiple recipients',async t=>{
 const e=await setup({count:5}),rows=Array.from({length:1000},(_,i)=>record('The reset is complete.',String(2117536046041595900n+BigInt(i)),NOW-1000-i)),upstream=source(feed(rows)),sent=[];
 const before=e.NOTIFY_DB.queries;await worker.scheduled({cron:'* * * * *'},e,{}, {now:NOW,...upstream,send:async j=>{sent.push(j);return {state:'sent'};}});const used=e.NOTIFY_DB.queries-before;assert.ok(used<=48,used+' queries');assert.ok(sent.length>=1);t.diagnostic('Minute D1 queries: '+used);
});

test('confirmed provider events reach the public page without KV writes or duplicate Bark sends',async()=>{
 const e=await setup(),p=record(),sent=[],send=async j=>{sent.push(j);return {state:'sent',code:'provider_accepted'};};
 await worker.scheduled({cron:'* * * * *'},e,{}, {now:NOW,...source(feed([p])),send});const writes=e.writes;
 const alert={id:p.id,kind:'reset',state:'confirmed',source_at:iso(NOW+30000),summary:'Observed reset; awaiting Tibo',url:p.url,confirmation_source:'operator_observed',observed_at:iso(NOW+30000)};
 for(const now of [NOW+60000,NOW+120000])await worker.scheduled({cron:'* * * * *'},e,{}, {now,...source(feed([p]),alert),send});
 const response=await handleRequest(new Request('https://radar.test/api/feed'),e,{},NOW+120000),body=await response.json();assert.equal(response.status,200);assert.equal(body.resetConfirmation.confirmationSource,'operator_observed');assert.equal(body.resetConfirmation.id,p.id);assert.equal(e.writes,writes);assert.equal(sent.length,2);assert.equal(sent.filter(j=>j.kind==='alert'&&j.event.state==='confirmed').length,1);
});

test('an older provider observation cannot downgrade the same event after Tibo confirmation',async()=>{
 const e=await setup(),p=record(),observed={id:p.id,kind:'reset',state:'confirmed',source_at:iso(NOW-1000),summary:'Observed reset',url:p.url,confirmation_source:'operator_observed',observed_at:iso(NOW-1000)},official={...observed,confirmation_source:'tibo_confirmed',confirmed_at:iso(NOW+1000),confirmation_url:p.url};
 for(const [index,alert] of [observed,official,observed].entries())await discoverCodexReset(e,{now:NOW+index*60000,...source(feed(),alert)});
 const response=await handleRequest(new Request('https://radar.test/api/feed'),e,{},NOW+120000);assert.equal((await response.json()).resetConfirmation.confirmationSource,'tibo_confirmed');
});
