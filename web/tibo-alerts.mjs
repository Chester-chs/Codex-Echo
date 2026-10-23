import {parseCodexResetFeed,parseCodexResetArchive} from '../backend/codex-reset.mjs';
import {mergeRecords} from '../backend/sources.mjs';
import {classifyTiboPost,tiboReplyContext,resetNoticeKey,annotateResetPlan,normalizeResetConfirmation,completionPlanId} from '../src/lib/reset-plan.mjs';
import {archivedTranslations} from '../src/lib/translations-zh.mjs';
import {readProvider} from './provider-budget.mjs';
import {translatePublicText} from '../backend/translate.mjs';
import {digest} from './bark.mjs';
const iso=n=>new Date(n).toISOString(),FENCE='tibo-posts:baseline:v1',CONTEXT='tibo-posts:context:v1';
export async function tiboContext(db,state,now=Date.now()){
 const rows=(await db.prepare("SELECT name,value FROM bark_meta WHERE name IN(?, 'codex-reset:confirmation:v1')").bind(CONTEXT).all()).results;
 let posts=[],confirmation=null;try{const value=JSON.parse(rows.find(r=>r.name===CONTEXT)?.value||'[]');if(Array.isArray(value))posts=value;}catch{}
 try{confirmation=normalizeResetConfirmation(JSON.parse(rows.find(r=>r.name==='codex-reset:confirmation:v1')?.value||'null'),now);}catch{}
 return {...state,records:mergeRecords(state?.records||[],posts),resetConfirmation:confirmation||state?.resetConfirmation||null};
}
export async function discoverTiboPosts(env,{now=Date.now(),fetcher=fetch,translate=text=>translatePublicText(text,{fetcher:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(3000)})}),log=x=>console.log(JSON.stringify(x))}={}){
 if(!env.NOTIFY_DB||env.BARK_VISITORS_ENABLED!=='true')return null;
 const db=env.NOTIFY_DB;
 // First installation stays silent; upgrades retain the active monitor start, even after a failed read.
 await db.prepare("INSERT OR IGNORE INTO bark_meta(name,value) SELECT key,COALESCE((SELECT value FROM bark_meta WHERE name='codex-reset:baseline'),(SELECT value FROM bark_meta WHERE name='tibo-posts:baseline:v1'),value) FROM json_each(?)").bind(JSON.stringify({[FENCE]:String(now),'codex-reset:baseline':String(now)})).run();
 const results=await Promise.allSettled([
  readProvider(env,'/api/feed',{now,fetcher}).then(p=>parseCodexResetFeed(p,now)),
  readProvider(env,'/tibo/x',{now,fetcher}).then(p=>parseCodexResetArchive(p,now))
 ]);
 const posts=results.flatMap(r=>r.status==='fulfilled'?r.value:[]),feed=results[0].status==='fulfilled'?results[0].value:[];
 for(let i=0;i<results.length;i++)if(results[i].status==='rejected'&&results[i].reason?.code!=='minute_budget')log({event:'tweet_source_failed',source:i?'archive':'feed'});
 if(results[0].status==='fulfilled'){
  // A later feature rollout must not hide posts published while this monitor was already active.
  const meta=(await db.prepare("SELECT name,value FROM bark_meta WHERE name IN(?, ?, 'codex-reset:baseline') OR name IN(SELECT 'tibo-posts:seen:'||value FROM json_each(?))").bind(FENCE,CONTEXT,JSON.stringify(feed.map(p=>p.id))).all()).results;
  const baseline=Number(meta.find(p=>p.name==='codex-reset:baseline')?.value??meta.find(p=>p.name===FENCE)?.value),seen=new Set(meta.map(p=>p.name)),events=[],processed=[];
  let prior=[];try{prior=JSON.parse(meta.find(p=>p.name===CONTEXT)?.value||'[]');}catch{}
  const map=new Map([...(Array.isArray(prior)?prior:[]),...feed].map(p=>[p.id,p]));
  const relatedRecords=mergeRecords([...map.values()]).filter(r=>r.category==='schedule');
  let translations=2;
  for(const post of feed){
   const at=Date.parse(post.postedAt);if(post.visibilityOnly||at<=baseline||at>now||now-at>=21600000||seen.has('tibo-posts:seen:'+post.id))continue;
   if(events.length>=50)break;
   const parent=map.get(post.inReplyToId),reply=tiboReplyContext(post,{parent}),classification=classifyTiboPost(post,{parent});processed.push(post.id);
   if(!classification){if(reply.reason==='parent_missing'){processed.pop();}if(reply.reason==='parent_missing'||post.providerKind==='signal'||post.explicitResetClaim)log({event:'tweet_alert_skipped',id:post.id,providerKind:post.providerKind,reason:reply.reason||'no_rule_match'});continue;}
   for(const item of [post,...(reply.selfReply&&parent?[parent]:[])]){
    item.translation=item.translation||archivedTranslations[item.original]||'';
    if(!item.translation&&env.ENABLE_TRANSLATION==='true'&&translations>0){translations--;try{item.translation=await translate(item.original.slice(0,1200));}catch{/* Original text is always retained if the free translator is unavailable. */}}
   }
   const record=annotateResetPlan({...post,parent:reply.selfReply&&parent?{id:parent.id,original:parent.original.slice(0,1000),translation:parent.translation||'',resetType:parent.resetType}:undefined});
   const event={...record,original:post.original.slice(0,2000),state:classification.kind==='completed'?'confirmed':classification.kind,tweetClass:classification.kind,sourceAt:post.postedAt,...classification,kind:'tweet',threadId:post.conversationId||parent?.id||post.id};
   if(classification.kind==='plan')event.sourceTextDigest=await digest(post.original);
   if(classification.kind==='completed')event.resetPlanId=completionPlanId(record,relatedRecords,now);
   const key=classification.kind==='plan'?resetNoticeKey(record):`alert:tweet:${post.id}:${classification.kind}`;
   events.push({key,event,posted:at});
   log({event:'tweet_alert',id:post.id,class:classification.kind,lagSeconds:Math.round((now-at)/1000),providerKind:post.providerKind,selfReply:reply.selfReply});
  }
  // Batch across posts and subscribers instead of spending one query per post/device.
  if(events.length)await db.prepare(`INSERT OR IGNORE INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated)
   SELECT s.device_hash,json_extract(p.value,'$.key'),'alert',json_extract(p.value,'$.event'),'pending',?,?,? FROM json_each(?) p JOIN bark_subscriptions s JOIN bark_control c ON c.id=s.device_hash WHERE s.reset_alerts=1 AND c.baseline_at<json_extract(p.value,'$.posted')`).bind(now,now,now,JSON.stringify(events)).run();
  if(processed.length)await db.prepare("INSERT OR IGNORE INTO bark_meta(name,value) SELECT 'tibo-posts:seen:'||value,? FROM json_each(?)").bind(String(now),JSON.stringify(processed)).run();
  const context=mergeRecords(prior,feed.filter(p=>!p.visibilityOnly)).sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt)).slice(0,200);
  await db.prepare('INSERT INTO bark_meta(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value WHERE value!=excluded.value').bind(CONTEXT,JSON.stringify(context)).run();
  await db.prepare(`UPDATE bark_events AS c SET state='cancelled',code='superseded_by_plan',updated=? WHERE c.kind='alert' AND c.state IN('pending','retry') AND json_extract(c.payload,'$.tweetClass')='commitment' AND EXISTS(SELECT 1 FROM bark_events p WHERE p.recipient=c.recipient AND json_extract(p.payload,'$.tweetClass')='plan' AND p.state NOT IN('cancelled','failed') AND json_extract(p.payload,'$.threadId')=json_extract(c.payload,'$.threadId') AND ABS(julianday(json_extract(p.payload,'$.sourceAt'))-julianday(json_extract(c.payload,'$.sourceAt')))*86400000<=600000)`).bind(now).run();
 }
 try{if(posts.length&&env.RADAR){
  const state=await env.RADAR.get('public-v1','json')||{records:[],sources:[],history:[],baseline:now};
  const old=state.records||[],records=mergeRecords(old,posts).map(r=>({...r,firstSeenAt:r.firstSeenAt||iso(now)})).sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt)).slice(0,1000);
  // Health timestamps alone must not turn minute polling into 1,440 KV writes/day.
  if(JSON.stringify(records)!==JSON.stringify(old)){
   const ids=new Set(old.map(r=>r.id)),added=records.filter(r=>!ids.has(r.id)),sources=[...(state.sources||[])];
   results.forEach((r,i)=>{if(r.status!=='fulfilled')return;const name=i?'codexreset-archive':'codexreset-feed',health={name,status:'ok',checkedAt:iso(now),lastSuccessAt:iso(now)},index=sources.findIndex(s=>s.name===name);if(index<0)sources.push(health);else sources[index]=health;});
   try{const encoded=JSON.stringify({...state,records,sources,lastSuccessAt:iso(now),lastAttemptAt:iso(now)});if(new TextEncoder().encode(encoded).length>4000000)throw new Error('Snapshot too large');await env.RADAR.put('public-v1',encoded);if(added.length)log({event:'posts_updated',added:added.length,lagSeconds:Math.round((now-Math.max(...added.map(r=>Date.parse(r.postedAt))))/1000)});}catch{log({event:'posts_update_failed'});}
  }
 }}catch{log({event:'posts_update_failed'});}
 return {records:posts};
}
