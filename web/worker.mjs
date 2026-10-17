import {countingDb} from './query-budget.mjs';
import {discoverCodexReset} from './codex-alerts.mjs';
import {readProvider} from './provider-budget.mjs';
import {discoverTiboPosts} from './tibo-alerts.mjs';
import {sendBark} from './bark.mjs';
import {collectPublicSources,enrichOriginal,mergeRecords} from '../backend/sources.mjs';
import {mergePublic,publicFeed,uniqueForecastHistory} from '../cloud/state.mjs';
import {translatePublicText} from '../backend/translate.mjs';
import {archivedTranslations} from '../src/lib/translations-zh.mjs';
import {runBark,queueBarkTest,barkStatus,barkAuthenticated} from './bark.mjs';
import {handleVisitorRequest,runVisitorBark,ensureOwnerSubscription,visitorAdminStatus,queueVisitorTest,visitorCapacity,consumeBarkBatch} from './visitor-bark.mjs';

const KEY='public-v1';
const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=30'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});

export async function handleRequest(request,env,ctx={},now=Date.now()) {
 const {pathname}=new URL(request.url);
 if(pathname==='/api/bark/subscription'||pathname.startsWith('/api/bark/subscription/'))return handleVisitorRequest(request,env,{now});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(['/api/bark/status','/api/bark/test','/api/bark/check'].includes(pathname)){
  const privateJson=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(!await barkAuthenticated(request,env.BARK_ADMIN_TOKEN))return privateJson({error:'Unauthorized'},401);
  try{
   if(env.BARK_VISITORS_ENABLED==='true'){
    if(pathname==='/api/bark/status'&&request.method==='GET')return privateJson(await visitorAdminStatus(env));
    if(request.method!=='POST'||pathname==='/api/bark/status')return privateJson({error:'Method not allowed'},405);
    if(pathname==='/api/bark/test'){
     await ensureOwnerSubscription(env,now);
     const input=await request.json();if(!input||Object.keys(input).some(k=>k!=='requestId'))return privateJson({error:'Invalid request'},400);
     const marker=await env.NOTIFY_DB.prepare("SELECT value FROM bark_meta WHERE name='owner-import:v1'").first();
     const owner=marker&&await env.NOTIFY_DB.prepare('SELECT * FROM bark_subscriptions WHERE device_hash=?').bind(marker.value).first();
     if(!owner)return privateJson({error:'Owner unsubscribed'},404);
     await queueVisitorTest(env,owner,input.requestId,now);
     return privateJson({queued:true},202);
    }
    const state=await env.RADAR?.get(KEY,'json');return privateJson(await runVisitorBark(env,state||{}));
   }
   if(pathname==='/api/bark/status'&&request.method==='GET')return privateJson(await barkStatus(env));
   if(request.method!=='POST'||pathname==='/api/bark/status')return privateJson({error:'Method not allowed'},405);
   if(!env.NOTIFY_DB||!env.BARK_DEVICE_KEY)return privateJson({error:'Bark not configured'},503);
   if(pathname==='/api/bark/test'){
    const raw=await request.text();if(raw.length>256)return privateJson({error:'Request too large'},413);
    let input;try{input=JSON.parse(raw);}catch{return privateJson({error:'Invalid JSON'},400);}
    if(!input||Object.keys(input).some(key=>key!=='requestId'))return privateJson({error:'Unexpected test field'},400);
    await queueBarkTest(env,input.requestId,now);
   }
   const state=await env.RADAR?.get(KEY,'json');
   await runBark(env,state||{});
   return privateJson(await barkStatus(env));
  }catch(error){return privateJson({error:'Bark operation failed'},error.status===400?400:503);}
 }
 if(!['GET','HEAD'].includes(request.method))return json({error:'Read-only public API'},405);
 if(pathname==='/healthz')return json({status:'ok'});
 if(pathname==='/api/status')return json({web:true,wechat:{configured:false,ready:false},bark:{personalChannelSupported:true,selfService:env.BARK_VISITORS_ENABLED==='true',capacity:visitorCapacity(env)},pollSeconds:Number(env.PUBLIC_POLL_SECONDS)||600});
 if(!['/api/feed','/api/forecasts'].includes(pathname))return json({error:'Not found'},404);
 try {
  const state=await env.RADAR.get(KEY,'json');
  if(!state)return json({error:'First cloud sync pending'},503);
  const body=pathname==='/api/feed'?publicFeed(state,now):{forecasts:uniqueForecastHistory(state.history||[])};
  return request.method==='HEAD'?new Response(null,{headers}):json(body);
 } catch {return json({error:'Data temporarily unavailable'},503);}
}

export async function syncPublic(env,{now=Date.now(),collect=collectPublicSources,enrich=enrichOriginal,translate=translatePublicText,fetcher=fetch}={}) {
 const previous=await env.RADAR.get(KEY,'json');
 const backfill=!previous?.backfillComplete;
 const codexRequest=path=>readProvider(env,path,{now,fetcher});
 const snapshot=await collect({now:new Date(now).toISOString(),backfill,codexRequest});
 let state=mergePublic(previous,snapshot,now);
 if(backfill&&['history','timeline'].every(name=>snapshot.sources?.some(s=>s.name===name&&s.status==='ok')))state.backfillComplete=true;
 const candidates=state.records.filter(r=>!['verified','mirror'].includes(r.textStatus)).sort((a,b)=>(Date.parse(a.textCheckedAt)||0)-(Date.parse(b.textCheckedAt)||0)).slice(0,3);
 const enriched=await Promise.all(candidates.map(async r=>{try{return await enrich(r,{now:new Date(now).toISOString()});}catch{return {...r,textCheckedAt:new Date(now).toISOString()};}}));
 state.records=mergeRecords(state.records,enriched).sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt)).slice(0,1000);
 for(const record of state.records)if(archivedTranslations[record.original])record.translation=archivedTranslations[record.original];
 let translationBudget=3;
 const forecasts=[state.forecast,...(state.history||[])].filter(Boolean);
 for(const f of forecasts)if(!f.basisZh)f.basisZh=archivedTranslations[f.basis]||(previous?.forecast?.basis===f.basis?previous.forecast.basisZh:'')||previous?.history?.find(p=>p.basis===f.basis&&p.basisZh)?.basisZh||'';
 if(env.ENABLE_TRANSLATION==='true'&&state.forecast&&!state.forecast.basisZh){translationBudget--;try{state.forecast.basisZh=state.records.find(r=>r.original===state.forecast.basis&&r.translation)?.translation||await translate(state.forecast.basis);for(const f of state.history||[])if(f.basis===state.forecast.basis)f.basisZh=state.forecast.basisZh;}catch{}}
 if(env.ENABLE_TRANSLATION==='true'){
  for(const r of state.records)if(!r.translation&&r.original===state.forecast?.basis&&state.forecast.basisZh)r.translation=state.forecast.basisZh;
  const pending=state.records.filter(r=>r.original&&!r.translation&&(!r.translationCheckedAt||now-Date.parse(r.translationCheckedAt)>3600000)).slice(0,translationBudget);
  for(const record of pending){record.translationCheckedAt=new Date(now).toISOString();try{record.translation=await translate(record.original);record.translationSource='machine';}catch{}}
 }
 const latest=await env.RADAR.get(KEY,'json');if(latest)state.records=mergeRecords(latest.records||[],state.records).sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt)).slice(0,1000);
 const encoded=JSON.stringify(state);
 if(new TextEncoder().encode(encoded).length>4000000)throw new Error('Public snapshot exceeds storage budget');
 await env.RADAR.put(KEY,encoded);
 console.log(JSON.stringify({event:'public_sync',at:state.lastAttemptAt,records:state.records.length,sources:state.sources.map(s=>({name:s.name,status:s.status})),forecast:state.forecast?.probability??null}));
 return state;
}

export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  const cacheKey=new Request(url.origin+url.pathname);
  if(request.method==='GET'&&['/api/feed','/api/forecasts','/api/status'].includes(url.pathname)&&globalThis.caches){
   const cache=caches.default,cached=await cache.match(cacheKey);if(cached)return cached;
   const response=await handleRequest(request,env,ctx);
   if(response.ok)ctx.waitUntil(cache.put(cacheKey,response.clone()));
   return response;
  }
  return handleRequest(request,env,ctx);
 },
 async queue(batch,env){return consumeBarkBatch(batch,env);},
 async scheduled(controller,env,ctx,{now=Date.now(),fetcher=fetch,send=sendBark}={}){
  if(env.NOTIFY_DB)env={...env,NOTIFY_DB:countingDb(env.NOTIFY_DB)};
  if(controller.cron==='* * * * *'&&env.BARK_VISITORS_ENABLED==='true'){
   await discoverCodexReset(env,{now,fetcher});
   try{await discoverTiboPosts(env,{now,fetcher});}catch{console.error(JSON.stringify({event:'tweet_discovery_failed'}));}
  }
  let state;try{state=controller.cron==='* * * * *'?await env.RADAR.get(KEY,'json'):await syncPublic(env,{now,fetcher});}catch{console.error(JSON.stringify({event:'public_sync_failed'}));if(env.BARK_VISITORS_ENABLED==='true'&&controller.cron!=='* * * * *')return;state={};}
  if(env.BARK_VISITORS_ENABLED==='true'&&controller.cron!=='* * * * *')return;
  try{console.log(JSON.stringify({event:'bark_check',...await (env.BARK_VISITORS_ENABLED==='true'?runVisitorBark(env,state||{},{now,send}):runBark(env,state||{}))}));}catch{console.error(JSON.stringify({event:'bark_check_failed'}));}
 },
};
