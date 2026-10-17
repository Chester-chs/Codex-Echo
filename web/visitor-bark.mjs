import {countingDb} from './query-budget.mjs';
import {validAlertAt,KIND_ORDER} from './codex-alerts.mjs';
import {parseBarkKey,digest,sendBark,barkSettings,ready,forecastKey} from './bark.mjs';
import {getForecast} from '../src/lib/domain.mjs';
import {annotateResetPlan,isCurrentPlanNotice,resetNoticeKey,getResetPlanState} from '../src/lib/reset-plan.mjs';
import {tiboContext} from './tibo-alerts.mjs';

const BASE='/api/bark/subscription',LOCK='visitor-dispatch:v1',LEASE=180000,DAY=86400000;
const ORIGINS=new Set(['https://echo-radar.pages.dev','http://127.0.0.1:4174','http://127.0.0.1:5173','http://127.0.0.1:5174']);
const encoder=new TextEncoder(),iso=n=>new Date(n).toISOString();
const fail=(code,status=400)=>{throw Object.assign(new Error(code),{code,status});};
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(id);
const publicErrors=new Set(['invalid_input','invalid_preferences','invalid_device','request_too_large','session_expired','rate_limited','test_cooldown','daily_limit','preferences_changed','provider_unavailable','capacity_reached']);
const configured=env=>env.BARK_VISITORS_ENABLED==='true'&&env.NOTIFY_DB&&/^[a-f0-9]{64}$/.test(env.BARK_CIPHER_SECRET||'');
export const visitorCapacity=env=>Math.max(1,Math.min(30,Number(env.BARK_VISITOR_CAPACITY)||30));
function strict(obj,keys){if(!obj||Array.isArray(obj)||typeof obj!=='object'||Object.keys(obj).some(k=>!keys.includes(k)))fail('invalid_input');}
function preferences(p){
 strict(p,['resetAlerts','forecastAlerts','threshold','language']);
 if(typeof p.resetAlerts!=='boolean'||typeof p.forecastAlerts!=='boolean'||!Number.isInteger(p.threshold)||p.threshold<40||p.threshold>90||p.threshold%5||!['zh','en'].includes(p.language))fail('invalid_preferences');
 return p;
}
async function keyFor(secret,purpose){return Uint8Array.from((await digest(purpose+':'+secret)).match(/../g),x=>parseInt(x,16));}
export async function sealDevice(value,secret){
 const key=await crypto.subtle.importKey('raw',await keyFor(secret,'encryption'),'AES-GCM',false,['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(value)));
 return Array.from(new Uint8Array([...iv,...data]),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function openDevice(value,secret){
 const data=Uint8Array.from(value.match(/../g),x=>parseInt(x,16));
 const key=await crypto.subtle.importKey('raw',await keyFor(secret,'encryption'),'AES-GCM',false,['decrypt']);
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12)},key,data.slice(12)));
}
async function managementToken(secret,device,requestId){
 const key=await crypto.subtle.importKey('raw',await keyFor(secret,'management'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(device+':'+requestId))),x=>x.toString(16).padStart(2,'0')).join('');
}
async function takeRate(db,bucket,limit,duration,now){
 const row=await db.prepare('INSERT INTO bark_rates(bucket,hits,expires) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN expires<=? THEN 1 ELSE hits+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END WHERE expires<=? OR hits<? RETURNING hits').bind(bucket,now+duration,now,now,now,limit).first();
 if(!row)fail('rate_limited',429);
}
async function readInput(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('invalid_input');
 if(Number(request.headers.get('Content-Length'))>4096)fail('request_too_large',413);
 const reader=request.body?.getReader();if(!reader)fail('invalid_input');let size=0,parts=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();fail('request_too_large',413);}parts.push(value);}}finally{reader.releaseLock();}
 try{const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return JSON.parse(new TextDecoder().decode(bytes));}catch{fail('invalid_input');}
}
async function authenticate(request,db){
 const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)fail('session_expired',401);
 const row=await db.prepare('SELECT * FROM bark_subscriptions WHERE token_hash=?').bind(await digest(token)).first();if(!row)fail('session_expired',401);return row;
}
function publicSettings(row){return {resetAlerts:Boolean(row.reset_alerts),forecastAlerts:Boolean(row.forecast_alerts),threshold:row.threshold,language:row.language};}
async function status(db,row,env={}){
 const receipts=(await db.prepare("SELECT kind,state,attempts,code,updated FROM bark_events WHERE recipient=? AND state!='baseline' ORDER BY updated DESC LIMIT 5").bind(row.device_hash).all()).results;
 return {bound:true,deviceHint:row.device_hint,settings:publicSettings(row),version:row.revision,updatedAt:iso(row.updated),testAvailableAt:row.last_test_at?iso(row.last_test_at+600000):null,receipts:receipts.map(r=>({kind:r.kind,state:r.state,attempts:r.attempts,code:r.code,updatedAt:iso(r.updated)})),limits:{dailyAttempts:20,testCooldownSeconds:600,sourceCheckSeconds:Number(env.PUBLIC_POLL_SECONDS)||600,dispatchSeconds:60}};
}
async function validateDevice(key,fetcher){
 let response,data;try{response=await fetcher('https://api.day.app/register/'+key,{redirect:'manual',signal:AbortSignal.timeout(10000)});data=await response.json();}catch{fail('provider_unavailable',503);}
 if(response.ok&&data?.code===200)return;
 if(data?.code>=400&&data?.code<500&&data.code!==429)fail('invalid_device');
 fail('provider_unavailable',503);
}
export async function ensureOwnerSubscription(env,now=Date.now()){
 if(!configured(env))return;
 const db=env.NOTIFY_DB,marker=await db.prepare("SELECT value FROM bark_meta WHERE name='owner-import:v1'").first();
 if(marker||!env.BARK_DEVICE_KEY)return;
 const key=parseBarkKey(env.BARK_DEVICE_KEY),id=await digest(key),s=barkSettings(env),cipher=await sealDevice(key,env.BARK_CIPHER_SECRET);
 await db.batch([
  db.prepare('INSERT OR IGNORE INTO bark_subscriptions(device_hash,device_cipher,device_hint,token_hash,reset_alerts,forecast_alerts,threshold,language,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,cipher,'•••• '+key.slice(-4),await digest(crypto.randomUUID()),Number(s.resetAlerts),Number(s.forecastAlerts),s.threshold,s.language,now,now),
  db.prepare('INSERT OR IGNORE INTO bark_control(id,baseline_at) VALUES(?,?)').bind(id,now),
  db.prepare("INSERT OR IGNORE INTO bark_meta(name,value) VALUES('owner-import:v1',?)").bind(id)
 ]);
}
export async function queueVisitorTest(env,row,requestId,now){
 if(!validId(requestId))fail('invalid_input');const db=env.NOTIFY_DB,key='test:'+requestId;
 const existing=await db.prepare('SELECT state FROM bark_events WHERE recipient=? AND event_key=?').bind(row.device_hash,key).first();if(existing)return {queued:true,state:existing.state};
 const quota=await db.prepare('SELECT (SELECT attempts FROM bark_daily WHERE recipient=? AND day=?) AS personal,(SELECT attempts FROM bark_daily WHERE recipient=? AND day=?) AS total').bind(row.device_hash,iso(now).slice(0,10),LOCK,iso(now).slice(0,10)).first();
 if(quota?.personal>=20||quota?.total>=600)fail('daily_limit',429);
 const updated=await db.prepare('UPDATE bark_subscriptions SET last_test_at=? WHERE device_hash=? AND token_hash=? AND last_test_at<=?').bind(now,row.device_hash,row.token_hash,now-600000).run();
 if(!updated.meta.changes)fail('test_cooldown',429);
 await db.prepare("INSERT OR IGNORE INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated) SELECT ?,?,'test','{}','pending',?,?,? WHERE EXISTS(SELECT 1 FROM bark_subscriptions WHERE device_hash=? AND token_hash=?)").bind(row.device_hash,key,now,now,now,row.device_hash,row.token_hash).run();
 if(env.BARK_QUEUE)await enqueuePendingBark(env,now);
 return {queued:true,state:'pending'};
}
export async function handleVisitorRequest(request,env,{now=Date.now(),fetcher=fetch}={}){
 const origin=request.headers.get('Origin'),url=new URL(request.url);
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, PATCH, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}:{})};
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!ORIGINS.has(origin))return json({error:'origin_denied'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!configured(env))return json({error:'unavailable'},503);
 const db=env.NOTIFY_DB;
 try{
  if(url.pathname===BASE&&request.method==='POST'){
   const data=await readInput(request);strict(data,['deviceAddress','requestId','settings','consentVersion']);
   if(typeof data.deviceAddress!=='string'||data.deviceAddress.length>512||!validId(data.requestId)||data.consentVersion!=='bark-v1')fail('invalid_input');
   let key;try{key=parseBarkKey(data.deviceAddress);}catch{fail('invalid_device');}
   const p=preferences(data.settings),id=await digest(key),ip=await digest('ip:'+env.BARK_CIPHER_SECRET+':'+(request.headers.get('CF-Connecting-IP')||'unknown'));
   await takeRate(db,'bind-global:'+iso(now).slice(0,10),500,DAY,now);
   await takeRate(db,'bind-ip:'+ip,6,3600000,now);await takeRate(db,'bind-device:'+id,6,3600000,now);
   await ensureOwnerSubscription(env,now);await validateDevice(key,fetcher);
   const token=await managementToken(env.BARK_CIPHER_SECRET,key,data.requestId),hash=await digest(token),cipher=await sealDevice(key,env.BARK_CIPHER_SECRET);
   const result=await db.prepare(`INSERT INTO bark_subscriptions(device_hash,device_cipher,device_hint,token_hash,reset_alerts,forecast_alerts,threshold,language,created,updated)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM bark_subscriptions)<? OR EXISTS(SELECT 1 FROM bark_subscriptions WHERE device_hash=?)
    ON CONFLICT(device_hash) DO UPDATE SET device_cipher=excluded.device_cipher,token_hash=excluded.token_hash,reset_alerts=excluded.reset_alerts,forecast_alerts=excluded.forecast_alerts,threshold=excluded.threshold,language=excluded.language,updated=excluded.updated,revision=bark_subscriptions.revision+1`).bind(id,cipher,'•••• '+key.slice(-4),hash,Number(p.resetAlerts),Number(p.forecastAlerts),p.threshold,p.language,now,now,visitorCapacity(env),id).run();
   if(!result.meta.changes)fail('capacity_reached',503);
   await db.prepare('INSERT OR IGNORE INTO bark_control(id,baseline_at) VALUES(?,?)').bind(id,now).run();
   const row=await db.prepare('SELECT * FROM bark_subscriptions WHERE device_hash=?').bind(id).first();
   return json({...await status(db,row,env),token},201);
  }
  const row=await authenticate(request,db);
  if(url.pathname===BASE&&request.method==='GET')return json(await status(db,row,env));
  if(url.pathname===BASE&&request.method==='PATCH'){
   const data=await readInput(request);strict(data,['settings','version']);const p=preferences(data.settings);
   if(!Number.isInteger(data.version))fail('invalid_input');
   const result=await db.prepare('UPDATE bark_subscriptions SET reset_alerts=?,forecast_alerts=?,threshold=?,language=?,revision=revision+1,updated=? WHERE device_hash=? AND token_hash=? AND revision=?').bind(Number(p.resetAlerts),Number(p.forecastAlerts),p.threshold,p.language,now,row.device_hash,row.token_hash,data.version).run();
   if(!result.meta.changes)fail('preferences_changed',409);
   return json(await status(db,{...row,reset_alerts:Number(p.resetAlerts),forecast_alerts:Number(p.forecastAlerts),threshold:p.threshold,language:p.language,revision:row.revision+1,updated:now},env));
  }
  if(url.pathname===BASE&&request.method==='DELETE'){
   const deletion=await db.batch([
    db.prepare('DELETE FROM bark_subscriptions WHERE device_hash=? AND token_hash=?').bind(row.device_hash,row.token_hash),
    db.prepare('DELETE FROM bark_events WHERE recipient=? AND NOT EXISTS(SELECT 1 FROM bark_subscriptions WHERE device_hash=?)').bind(row.device_hash,row.device_hash),
    db.prepare('DELETE FROM bark_control WHERE id=? AND NOT EXISTS(SELECT 1 FROM bark_subscriptions WHERE device_hash=?)').bind(row.device_hash,row.device_hash)
   ]);if(!deletion[0].meta.changes)fail('session_expired',401);return json({bound:false,deleted:true});
  }
  if(url.pathname===BASE+'/test'&&request.method==='POST'){
   const data=await readInput(request);strict(data,['requestId']);return json(await queueVisitorTest(env,row,data.requestId,now),202);
  }
  return json({error:'method_not_allowed'},405);
 }catch(error){return json({error:publicErrors.has(error.code)?error.code:'unavailable'},[400,401,409,413,429,503].includes(error.status)?error.status:503);}
}

function compact(event){
 const out={};for(const k of ['id','url','category','completionNotice','textSource','textStatus','scheduledAt','approximate','parent','isReply','replyingTo','inReplyToId','providerKind','explicitResetClaim','resetType','resetTypes','original','translation','postedAt','resetAt','probability','kind','basis','basisZh','windowText','publishedAt','checkedAt','sourceFreshUntil','validUntil','sourceUrl'])if(event[k]!==undefined)out[k]=event[k];
 for(const k of ['original','translation','basis','basisZh','windowText'])if(out[k])out[k]=Array.from(out[k]).slice(0,1000).join('');return out;
}
export async function runVisitorBark(env,state,{now=Date.now,send=sendBark}={}){
 if(!configured(env)||env.BARK_ENABLED!=='true')return {state:'disabled'};
 env={...env,NOTIFY_DB:countingDb(env.NOTIFY_DB)};
 const clock=typeof now==='function'?now:()=>now,n=clock(),db=env.NOTIFY_DB,token=crypto.randomUUID();
 state=await tiboContext(db,state||{},n);
 await ensureOwnerSubscription(env,n);
 await db.prepare('INSERT OR IGNORE INTO bark_control(id) VALUES(?)').bind(LOCK).run();
 const lease=await db.prepare('UPDATE bark_control SET lease_token=?,lease_until=? WHERE id=? AND lease_until<=?').bind(token,n+LEASE,LOCK,n).run();if(!lease.meta.changes)return {state:'busy'};
 let attempted=0,candidates=0;const served=[];
 const fence='EXISTS(SELECT 1 FROM bark_control WHERE id=? AND lease_token=? AND lease_until>?)';
 try{
  // Maintenance gets its own minute so collection, cleanup and dispatch never share a Free-plan budget.
  if(new Date(n).getUTCMinutes()===37&&!await db.prepare("SELECT 1 AS urgent FROM bark_events WHERE kind='alert' AND state IN('pending','retry') AND available<=? LIMIT 1").bind(n).first()){
   await db.prepare('DELETE FROM bark_rates WHERE expires<?').bind(n).run();
   await db.prepare("DELETE FROM bark_meta WHERE name GLOB 'tibo-posts:seen:*' AND CAST(value AS INTEGER)<?").bind(n-30*DAY).run();
   await db.prepare("DELETE FROM bark_events WHERE updated<? AND state NOT IN('pending','retry','sending')").bind(n-30*DAY).run();
   await db.prepare('DELETE FROM bark_daily WHERE day<?').bind(iso(n-7*DAY).slice(0,10)).run();
   return {state:'maintenance',attempted:0,...(env.BARK_QUEUE?await enqueuePendingBark(env,n):{})};
  }
  if(!env.BARK_QUEUE)await db.prepare(`UPDATE bark_events SET state='unknown',code='interrupted',updated=? WHERE state='sending' AND recipient IN(SELECT device_hash FROM bark_subscriptions) AND ${fence}`).bind(n,LOCK,token,n).run();
  const fresh=ready(state,n),forecast=getForecast(state?.forecast,n),currentKey=forecast?await forecastKey(forecast):null;
  if(fresh){
   const resets=(state?.records||[]).map(annotateResetPlan).filter(r=>['reset','schedule'].includes(r.category)&&['automatic','banked'].includes(r.resetType)&&/^\d+$/.test(r.id)&&/^https:\/\/(?:x\.com|twitter\.com)\/(?:thsottiaux|i)\/status\/\d+$/.test(r.url)&&Date.parse(r.postedAt)<=n&&n-Date.parse(r.postedAt)<21600000).slice(0,1000).map(r=>({posted:Date.parse(r.postedAt),event:{...compact(r),noticeKey:resetNoticeKey(r)}}));
   for(let i=0;i<resets.length;i+=100)await db.prepare(`INSERT OR IGNORE INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated)
    SELECT s.device_hash,json_extract(r.value,'$.event.noticeKey'),'reset',json_extract(r.value,'$.event'),'pending',?,?,? FROM json_each(?) r JOIN bark_subscriptions s JOIN bark_control c ON c.id=s.device_hash WHERE s.reset_alerts=1 AND json_extract(r.value,'$.posted')>=c.baseline_at AND json_extract(r.value,'$.posted')>CAST(COALESCE((SELECT value FROM bark_meta WHERE name='codex-reset:baseline'),(SELECT value FROM bark_meta WHERE name='tibo-posts:baseline:v1'),'0') AS INTEGER)`).bind(n,n,n,JSON.stringify(resets.slice(i,i+100))).run();
   if(forecast)await db.prepare(`INSERT INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated)
    SELECT s.device_hash,?,'forecast',?,'pending',?,?,? FROM bark_subscriptions s JOIN bark_control c ON c.id=s.device_hash WHERE s.forecast_alerts=1 AND s.threshold<=? AND c.baseline_at<=?
    ON CONFLICT(recipient,event_key) DO UPDATE SET state='pending',available=excluded.available,updated=excluded.updated,payload=excluded.payload WHERE bark_events.state='cancelled' AND bark_events.attempts<3 AND bark_events.code IN('disabled_or_expired','expired_before_dispatch')`).bind(currentKey,JSON.stringify(compact(forecast)),n,n,n,forecast.probability,Date.parse(forecast.publishedAt)).run();
  }
  await db.prepare(`UPDATE bark_events AS e SET state='cancelled',code=CASE WHEN e.kind='alert' THEN 'covered_by_earlier_alert' ELSE 'covered_by_codex_reset' END,updated=? WHERE state IN('pending','retry') AND ((${coveredSQL}) OR (${completionCoveredSQL}))`).bind(n,...coverageTimes(n),n-21600000).run();
  if((state.records||[]).some(r=>r.category==='schedule')){
   const plan=getResetPlanState(state.records,n,state.resetConfirmation),current=plan?.phase==='scheduled'?plan:null;
   await db.prepare(`UPDATE bark_events SET state='cancelled',code='superseded_or_cancelled',updated=? WHERE state IN('pending','retry') AND (json_extract(payload,'$.category')='schedule' OR json_extract(payload,'$.tweetClass')='plan') AND (json_extract(payload,'$.id')!=? OR json_extract(payload,'$.scheduledAt')!=?)`).bind(n,current?.record.id||'',current?.scheduledAt||'').run();
  }
  if(env.BARK_QUEUE)return {state:fresh?'checked':'source_stale',...await enqueuePendingBark(env,n)};
  const day=iso(n).slice(0,10);
  const rows=(await db.prepare(`WITH ranked AS(SELECT e.*,s.device_cipher,s.token_hash,s.revision,s.reset_alerts,s.forecast_alerts,s.threshold,s.language,s.last_served,ROW_NUMBER() OVER(PARTITION BY e.recipient ORDER BY CASE e.kind WHEN 'test' THEN 0 WHEN 'alert' THEN 1 WHEN 'reset' THEN 2 ELSE 3 END,e.created) AS rank
   FROM bark_events e JOIN bark_subscriptions s ON s.device_hash=e.recipient WHERE e.state IN('pending','retry') AND e.available<=? AND COALESCE((SELECT attempts FROM bark_daily WHERE recipient=e.recipient AND day=?),0)<20)
   SELECT * FROM ranked WHERE rank=1 ORDER BY CASE kind WHEN 'test' THEN 0 WHEN 'alert' THEN 1 WHEN 'reset' THEN 2 ELSE 3 END,last_served,created,recipient LIMIT 20`).bind(n,day).all()).results;
  const eligible=(r,time)=>r.kind==='test'?time-r.created<900000:r.kind==='alert'?r.reset_alerts&&alertEligible(r.event,state,time):ready(state,time)&&(r.kind==='reset'?r.reset_alerts&&time-Date.parse(r.event.postedAt)<21600000&&isCurrentPlanNotice(r.event,state.records||[],time,state.resetConfirmation):r.forecast_alerts&&r.event_key===currentKey&&forecast&&forecast.probability>=r.threshold&&getForecast(forecast,time));
  for(const r of rows)r.event=JSON.parse(r.payload);
  const invalid=rows.filter(r=>!eligible(r,clock())).map(r=>({id:r.recipient,key:r.event_key,attempts:r.attempts}));
  if(invalid.length)await db.prepare(`UPDATE bark_events SET state='cancelled',code='disabled_or_expired',updated=? WHERE state IN('pending','retry') AND EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.id')=recipient AND json_extract(j.value,'$.key')=event_key AND json_extract(j.value,'$.attempts')=attempts) AND ${fence}`).bind(clock(),JSON.stringify(invalid),LOCK,token,clock()).run();
  for(const row of rows){
   const at=clock();if(at>=n+LEASE-20000||candidates>=3||!db.queryBudget.reserve(13))break;if(!eligible(row,at))continue;candidates++;
   const dispatchDay=iso(at).slice(0,10);
   await db.prepare("INSERT OR IGNORE INTO bark_daily(recipient,day) SELECT value,? FROM json_each(?)").bind(dispatchDay,JSON.stringify([row.recipient,LOCK])).run();
   const global=await db.prepare('UPDATE bark_daily SET attempts=attempts+1 WHERE recipient=? AND day=? AND attempts<600').bind(LOCK,dispatchDay).run();if(!global.meta.changes)break;
   const quota=await db.prepare('UPDATE bark_daily SET attempts=attempts+1 WHERE recipient=? AND day=? AND attempts<20').bind(row.recipient,dispatchDay).run();if(!quota.meta.changes)continue;
   const renewedAt=clock(),renew=await db.prepare('UPDATE bark_control SET lease_until=? WHERE id=? AND lease_token=? AND lease_until>?').bind(renewedAt+LEASE,LOCK,token,renewedAt).run();if(!renew.meta.changes)break;
   const claimAt=clock(),claim=await db.prepare(`UPDATE bark_events SET state='sending',attempts=attempts+1,updated=? WHERE recipient=? AND event_key=? AND state IN('pending','retry') AND attempts=? AND ${fence} AND ${completionClaim} AND EXISTS(SELECT 1 FROM bark_subscriptions WHERE device_hash=? AND token_hash=? AND revision=?)`).bind(claimAt,row.recipient,row.event_key,row.attempts,LOCK,token,claimAt,claimAt-21600000,row.recipient,row.token_hash,row.revision).run();if(!claim.meta.changes)continue;
   let outcome;
   if(!eligible(row,clock()))outcome={state:'cancelled',code:'expired_before_dispatch'};
   else{
    try{
     const key=await openDevice(row.device_cipher,env.BARK_CIPHER_SECRET);
     const live=await db.prepare(`SELECT 1 AS valid FROM bark_subscriptions WHERE device_hash=? AND token_hash=? AND revision=? AND ${fence}`).bind(row.recipient,row.token_hash,row.revision,LOCK,token,clock()).first();
     if(!live){
      await db.prepare("UPDATE bark_events SET state='pending',attempts=?,available=?,updated=? WHERE recipient=? AND event_key=? AND state='sending' AND attempts=?").bind(row.attempts,clock()+60000,clock(),row.recipient,row.event_key,row.attempts+1).run();
      continue;
     }
     if(!eligible(row,clock())||clock()>=renewedAt+LEASE)outcome={state:'cancelled',code:'expired_before_dispatch'};
     else outcome=await send({kind:row.kind,event:row.kind==='forecast'?forecast:row.event,key:row.event_key,collapseId:(await digest(row.event_key)).slice(0,32)},{BARK_DEVICE_KEY:key,BARK_LANGUAGE:row.language});
    }
    catch{outcome={state:'unknown',code:'transport_uncertain'};}if(outcome.code!=='expired_before_dispatch')attempted++;
   }
   const attempts=row.attempts+1,result=outcome.state==='retry'&&attempts>=3?'failed':['sent','retry','failed','unknown','cancelled'].includes(outcome.state)?outcome.state:'unknown';
   const code=['provider_accepted','transport_uncertain','response_uncertain','expired_before_dispatch'].includes(outcome.code)||/^provider_\d{3}$/.test(outcome.code)?outcome.code:result;
   await db.prepare("UPDATE bark_events SET state=?,code=?,available=?,updated=? WHERE recipient=? AND event_key=? AND state='sending' AND attempts=?").bind(result,code,at+60000*2**attempts,clock(),row.recipient,row.event_key,attempts).run();
   served.push(row.recipient);
  }
  if(served.length)await db.prepare('UPDATE bark_subscriptions SET last_served=? WHERE device_hash IN(SELECT value FROM json_each(?))').bind(clock(),JSON.stringify(served)).run();
  await db.prepare('UPDATE bark_control SET last_run_at=? WHERE id=? AND lease_token=?').bind(clock(),LOCK,token).run();
  return {state:fresh?'checked':'source_stale',attempted};
 }finally{await db.prepare('UPDATE bark_control SET lease_until=0,lease_token=NULL WHERE id=? AND lease_token=?').bind(LOCK,token).run();}
}
export async function visitorAdminStatus(env){
 if(!configured(env))return {configured:false};const db=env.NOTIFY_DB;
 const row=await db.prepare('SELECT count(*) AS total FROM bark_subscriptions').first();
 const marker=await db.prepare("SELECT value FROM bark_meta WHERE name='owner-import:v1'").first();
 const receipts=(await db.prepare("SELECT kind,state,attempts,code,updated FROM bark_events WHERE state!='baseline' ORDER BY updated DESC LIMIT 10").all()).results;
 return {configured:true,visitorSubscriptions:row.total,ownerMigrated:Boolean(marker),capacity:visitorCapacity(env),receipts:receipts.map(r=>({...r,updatedAt:iso(r.updated)}))};
}

export async function enqueuePendingBark(env,now=Date.now(),db=env.NOTIFY_DB){
 if(!env.BARK_QUEUE)return {queued:0};
 const rows=(await db.prepare(`SELECT recipient,event_key,attempts,state FROM bark_events WHERE available<=? AND ((state IN('pending','retry') AND (updated<=? OR code IS NULL)) OR (state='sending' AND updated<=?)) ORDER BY ${KIND_ORDER},created LIMIT 100`).bind(now,now-120000,now-120000).all()).results;
 if(!rows.length)return {queued:0};
 try{
  await env.BARK_QUEUE.sendBatch(rows.map(r=>({body:{recipient:r.recipient,eventKey:r.event_key}})));
  await db.prepare(`UPDATE bark_events SET updated=?,code='queue_enqueued' WHERE state IN('pending','retry') AND EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,'$.recipient')=recipient AND json_extract(j.value,'$.event_key')=event_key AND json_extract(j.value,'$.attempts')=attempts)`).bind(now,JSON.stringify(rows)).run();
  return {queued:rows.length};
 }catch{console.warn(JSON.stringify({event:'bark_queue_enqueue_failed'}));return {queued:0};}
}
const coverageTimes=n=>[n-900000,n-43200000,n-21600000,n-21600000];
const completionEvent="e.kind='alert' AND json_extract(e.payload,'$.state')='confirmed'";
const completionCoveredSQL=`${completionEvent} AND EXISTS(SELECT 1 FROM bark_events a WHERE a.recipient=e.recipient AND a.event_key!=e.event_key AND a.state='sent' AND a.updated>? AND ((a.kind='alert' AND json_extract(a.payload,'$.state')='confirmed') OR (a.kind='reset' AND json_extract(a.payload,'$.category')!='schedule' AND (json_extract(a.payload,'$.completionNotice')=1 OR json_extract(a.payload,'$.id')=json_extract(e.payload,'$.id')))))`;
const coveredSQL=`e.kind='reset' AND json_extract(e.payload,'$.category')!='schedule' AND EXISTS(SELECT 1 FROM bark_events a WHERE a.recipient=e.recipient AND a.kind='alert' AND a.state='sent' AND json_extract(a.payload,'$.state')='confirmed' AND ((CAST(COALESCE((SELECT value FROM bark_meta WHERE name='codex-reset:last-ok'),'0') AS INTEGER)>? AND a.updated>? AND (json_extract(a.payload,'$.id')=json_extract(e.payload,'$.id') OR (a.updated>? AND ABS(julianday(json_extract(a.payload,'$.sourceAt'))-julianday(json_extract(e.payload,'$.postedAt')))*86400000<21600000) OR (json_extract(e.payload,'$.resetAt') IS NOT NULL AND (json_extract(a.payload,'$.observedAt')=json_extract(e.payload,'$.resetAt') OR json_extract(a.payload,'$.confirmedAt')=json_extract(e.payload,'$.resetAt'))))) OR (json_extract(a.payload,'$.tweetClass')='completed' AND a.updated>? AND ABS(julianday(json_extract(a.payload,'$.sourceAt'))-julianday(json_extract(e.payload,'$.postedAt')))*86400000<21600000)))`;
const awaitingSQL=coveredSQL.replace("a.state='sent'","a.state IN('pending','retry','sending')");
// A correlated claim prevents two Queue consumers from simultaneously sending completion alerts.
const completionClaim=`NOT (((bark_events.kind='alert' AND json_extract(bark_events.payload,'$.state')='confirmed') OR (bark_events.kind='reset' AND COALESCE(json_extract(bark_events.payload,'$.completionNotice'),0)=1)) AND EXISTS(SELECT 1 FROM bark_events a WHERE a.recipient=bark_events.recipient AND a.event_key!=bark_events.event_key AND ((a.kind='alert' AND json_extract(a.payload,'$.state')='confirmed') OR (a.kind='reset' AND json_extract(a.payload,'$.category')!='schedule' AND (json_extract(a.payload,'$.completionNotice')=1 OR json_extract(a.payload,'$.id')=json_extract(bark_events.payload,'$.id')))) AND a.state IN('sending','sent','unknown') AND a.updated>?))`;
function alertEligible(event,state,now,baseline=0){return validAlertAt(event,now,baseline)&&(event.tweetClass!=='plan'||isCurrentPlanNotice({...event,category:'schedule'},state.records||[],now,state.resetConfirmation));}
function queueEligible(row,state,now){
 if(row.kind==='test')return now-row.created<900000;
 if(row.kind==='alert')return row.reset_alerts&&alertEligible(row.event,state,now,row.baseline_at);
 if(!ready(state,now))return false;
 if(row.kind==='reset')return row.reset_alerts&&Date.parse(row.event.postedAt)<=now&&now-Date.parse(row.event.postedAt)<21600000&&isCurrentPlanNotice(row.event,state.records||[],now,state.resetConfirmation);
 return row.kind==='forecast'&&row.forecast_alerts&&row.event_key===row.currentForecastKey&&getForecast(state.forecast,now)?.probability>=row.threshold;
}
export async function consumeBarkBatch(batch,env,{now=Date.now,send=sendBark}={}){
 const db=countingDb(env.NOTIFY_DB),clock=typeof now==='function'?now:()=>now;
 const summary={event:'bark_queue_batch',size:batch.messages.length,sent:0,retried:0,skipped:0,d1Queries:0};
 let state={};try{state=await env.RADAR?.get('public-v1','json')||{};}catch{}
 state=await tiboContext(db,state,clock());
 const forecast=getForecast(state.forecast,clock()),currentForecastKey=forecast?await forecastKey(forecast):null;
 for(const message of batch.messages){
  if(!db.queryBudget.reserve(9)){message.retry({delaySeconds:0});summary.retried++;continue;}
  const n=clock(),body=message.body;
  if(!body||typeof body.recipient!=='string'||!/^[a-f0-9]{64}$/.test(body.recipient)||typeof body.eventKey!=='string'||body.eventKey.length>256){message.ack();summary.skipped++;continue;}
  try{
   const row=await db.prepare(`SELECT e.*,s.device_cipher,s.token_hash,s.revision,s.reset_alerts,s.forecast_alerts,s.threshold,s.language,c.baseline_at,(${coveredSQL}) AS covered,(${awaitingSQL}) AS awaiting,(${completionCoveredSQL}) AS completion_covered FROM bark_events e JOIN bark_subscriptions s ON s.device_hash=e.recipient JOIN bark_control c ON c.id=e.recipient WHERE e.recipient=? AND e.event_key=?`).bind(...coverageTimes(n),...coverageTimes(n),n-21600000,body.recipient,body.eventKey).first();
   if(!row||!['pending','retry','sending'].includes(row.state)){message.ack();summary.skipped++;continue;}
   if(row.state==='sending'&&n-row.updated<=120000){message.retry({delaySeconds:120});summary.retried++;continue;}
   row.event=JSON.parse(row.payload);row.currentForecastKey=currentForecastKey;
   const finish=async(state,code,available=n)=>db.prepare('UPDATE bark_events SET state=?,code=?,available=?,updated=? WHERE recipient=? AND event_key=? AND state=? AND attempts=? AND updated=?').bind(state,code,available,clock(),row.recipient,row.event_key,row.state,row.attempts,row.updated).run();
   if(row.covered||row.completion_covered||!queueEligible(row,state,n)||env.BARK_ENABLED!=='true'||!configured(env)){await finish('cancelled',row.completion_covered?'covered_by_earlier_alert':row.covered?'covered_by_codex_reset':'disabled_or_expired');message.ack();summary.skipped++;continue;}
   if(row.awaiting){message.retry({delaySeconds:60});summary.retried++;continue;}
   if(row.state==='sending'&&env.BARK_RESEND_UNCERTAIN==='false'){await finish('unknown','interrupted');message.ack();summary.skipped++;continue;}
   if(row.attempts>=3){await finish('failed','attempts_exhausted');message.ack();summary.skipped++;continue;}
   if(row.available>n){message.retry({delaySeconds:Math.min(86400,Math.ceil((row.available-n)/1000))});summary.retried++;continue;}
   const claimAt=clock(),attempts=row.attempts+1;
   const claim=await db.prepare(`UPDATE bark_events SET state='sending',attempts=attempts+1,updated=? WHERE recipient=? AND event_key=? AND state=? AND attempts=? AND updated=? AND ${completionClaim} AND EXISTS(SELECT 1 FROM bark_subscriptions WHERE device_hash=? AND token_hash=? AND revision=?)`).bind(claimAt,row.recipient,row.event_key,row.state,row.attempts,row.updated,claimAt-21600000,row.recipient,row.token_hash,row.revision).run();
   if(!claim.meta.changes){message.retry({delaySeconds:120});summary.retried++;continue;}
   const save=(result,code,available=claimAt,tries=attempts)=>db.prepare("UPDATE bark_events SET state=?,code=?,available=?,updated=?,attempts=? WHERE recipient=? AND event_key=? AND state='sending' AND attempts=? AND updated=?").bind(result,code,available,clock(),tries,row.recipient,row.event_key,attempts,claimAt).run();
   const day=iso(claimAt).slice(0,10);
   await db.prepare('INSERT OR IGNORE INTO bark_daily(recipient,day) SELECT value,? FROM json_each(?)').bind(day,JSON.stringify([row.recipient,LOCK])).run();
   const total=await db.prepare('UPDATE bark_daily SET attempts=attempts+1 WHERE recipient=? AND day=? AND attempts<600 AND COALESCE((SELECT attempts FROM bark_daily WHERE recipient=? AND day=?),0)<20').bind(LOCK,day,row.recipient,day).run();
   const personal=total.meta.changes?await db.prepare('UPDATE bark_daily SET attempts=attempts+1 WHERE recipient=? AND day=? AND attempts<20').bind(row.recipient,day).run():null;
   if(!personal?.meta.changes){await save('pending','daily_limit',Date.parse(day)+DAY,row.attempts);message.ack();summary.skipped++;continue;}
   const key=await openDevice(row.device_cipher,env.BARK_CIPHER_SECRET);
   const live=await db.prepare('SELECT 1 AS valid FROM bark_subscriptions WHERE device_hash=? AND token_hash=? AND revision=?').bind(row.recipient,row.token_hash,row.revision).first();
   if(!live){await save('pending','preferences_changed',clock()+60000,row.attempts);message.retry({delaySeconds:60});summary.retried++;continue;}
   if(!queueEligible(row,state,clock())){await save('cancelled','expired_before_dispatch');message.ack();summary.skipped++;continue;}
   let outcome;try{outcome=await send({kind:row.kind,event:row.kind==='forecast'?forecast:row.event,key:row.event_key,collapseId:(await digest(row.event_key)).slice(0,32)},{BARK_DEVICE_KEY:key,BARK_LANGUAGE:row.language});}catch{outcome={state:'unknown',code:'transport_uncertain'};}
   const uncertain=outcome.state==='unknown'&&env.BARK_RESEND_UNCERTAIN!=='false';
   const retry=(outcome.state==='retry'||uncertain)&&attempts<3;
   const result=retry?'retry':outcome.state==='retry'||uncertain?'failed':['sent','failed','unknown'].includes(outcome.state)?outcome.state:'unknown';
   const code=['provider_accepted','transport_uncertain','response_uncertain'].includes(outcome.code)||/^provider_\d{3}$/.test(outcome.code)?outcome.code:result;
   await save(result,code,retry?clock()+60000*2**attempts:clock());
   if(retry){message.retry({delaySeconds:60*2**attempts});summary.retried++;}else{message.ack();if(result==='sent'){summary.sent++;if(['reset','alert'].includes(row.kind))console.log(JSON.stringify({event:'bark_sent',kind:row.kind,postId:row.event.id,lagSeconds:Math.round((clock()-Date.parse(row.event.sourceAt||row.event.postedAt))/1000)}));}else summary.skipped++;}
  }catch{message.retry({delaySeconds:120});summary.retried++;}
 }
 summary.d1Queries=db.queryBudget.used;console.log(JSON.stringify(summary));return summary;
}
