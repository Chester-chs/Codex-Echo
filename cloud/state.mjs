import {sanitizeSettings} from '../src/lib/domain.mjs';
import {mergeRecords} from '../backend/sources.mjs';
import {conditionalForecast} from '../backend/model.mjs';
const iso=n=>new Date(n).toISOString();
const clone=x=>structuredClone(x);
function forecastRevisionKey(forecast) {
 const fields={...forecast};
 for(const key of ['checkedAt','sourceFreshUntil','basisZh','savedAt'])delete fields[key];
 for(const key of ['publishedAt','validUntil','windowStart','windowEnd'])if(fields[key]&&Number.isFinite(Date.parse(fields[key])))fields[key]=iso(Date.parse(fields[key]));
 return JSON.stringify(Object.fromEntries(Object.keys(fields).sort().map(key=>[key,fields[key]])));
}
export function uniqueForecastHistory(history=[]) {
 const seen=new Set();return history.filter(forecast=>{if(!forecast)return false;const key=forecastRevisionKey(forecast);if(seen.has(key))return false;seen.add(key);return true;});
}
export const active=(f,n)=>Boolean(f&&Number.isFinite(f.probability)&&f.probability>=0&&f.probability<=100&&Date.parse(f.validUntil)>n&&Date.parse(f.sourceFreshUntil)>n&&Date.parse(f.publishedAt)<=n);
export function mergePublic(previous,snapshot,now=Date.now()){
 const state=clone(previous||{records:[],history:[],sources:[],baseline:null});
 state.records=mergeRecords(state.records,snapshot.records||[]).map(r=>({...r,firstSeenAt:r.firstSeenAt||iso(now)}));
 if(!state.baseline&&state.records.length)state.baseline=now;
 const old=state.sources;
 state.sources=(snapshot.sources||old).map(s=>({...s,lastSuccessAt:s.status==='ok'?s.checkedAt:old.find(p=>p.name===s.name)?.lastSuccessAt||null}));
 if(snapshot.sources?.some(s=>s.status==='ok'))state.lastSuccessAt=snapshot.checkedAt;
 state.lastAttemptAt=snapshot.checkedAt;
 if(snapshot.forecast!==undefined){
  state.forecast=snapshot.forecast;
  if(snapshot.forecast){
   const revision={...snapshot.forecast};delete revision.checkedAt;delete revision.sourceFreshUntil;
   const prior=state.history[0];
   if(!prior||forecastRevisionKey(prior)!==forecastRevisionKey(revision))state.history.unshift({...revision,savedAt:iso(now)});
   state.history=uniqueForecastHistory(state.history).slice(0,100);
  }
 }
 return state;
}
export function publicFeed(state,now=Date.now()){
 const s=state||{records:[],sources:[]};const records=mergeRecords(s.records).sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt));
 const fresh=s.sources.some(x=>x.status==='ok'&&Date.parse(x.lastSuccessAt)<=now+60000&&now-Date.parse(x.lastSuccessAt)<1800000);
 const model=conditionalForecast(records,now);delete model.diagnostics;
 return {sourceCredits:[{label:'Data: codex-reset.com',url:'https://codex-reset.com/'}],resets:records.filter(r=>['reset','schedule'].includes(r.category)),signals:records.filter(r=>r.category==='forecast'),posts:records,forecast:fresh&&active(s.forecast,now)?s.forecast:null,sources:s.sources,model,generatedAt:iso(now),lastPolledAt:s.lastSuccessAt||null,lastAttemptAt:s.lastAttemptAt||null,status:!fresh?'stale':s.sources.some(s=>s.status==='error')?'degraded':'live'};
}
export function viewUser(u){return u?{...u.settings,resetCredits:u.credits.reset,forecastCredits:u.credits.forecast,updatedAt:iso(u.updated)}:null;}
export function subscribeUser(previous,input,grants,receipt,now=Date.now()){
 const u=clone(previous||{created:now,settings:{},credits:{reset:0,forecast:0},versions:{reset:0,forecast:0},receipts:[],jobs:[]});
 if(u.receipts.some(r=>r.id===receipt))return u;
 const settings=sanitizeSettings(input);delete settings.demo;
 for(const kind of ['reset','forecast']){
  settings[kind+'Alerts']=settings[kind+'Alerts']&&(grants[kind]===true||u.settings[kind+'Alerts']===true);
  u.credits[kind]=settings[kind+'Alerts']?(grants[kind]===true?1:u.credits[kind]):0;
  if(grants[kind]===true)u.versions[kind]++;
 }
 u.settings=settings;u.updated=now;u.receipts.push({id:receipt,at:now});
 // Keep receipts for the full session lifetime, with a hard bound on abusive callers.
 u.receipts=u.receipts.filter(r=>now-r.at<7*86400000);
 if(u.receipts.length>1000)throw Object.assign(new Error('Too many consent requests'),{status:429});
 return u;
}
export function preferencesUser(previous,input,now=Date.now()){
 if(!previous)return null;const u=clone(previous);const settings=sanitizeSettings(input);delete settings.demo;
 for(const kind of ['reset','forecast']){
  settings[kind+'Alerts']=settings[kind+'Alerts']&&u.settings[kind+'Alerts'];
  if(!settings[kind+'Alerts']){u.credits[kind]=0;for(const j of u.jobs)if(j.kind===kind&&['pending','retry'].includes(j.state)){j.state='cancelled';j.code='disabled';}}
 }
 u.settings=settings;u.updated=now;return u;
}
export function claimUser(previous,state,now=Date.now()){
 if(!previous)return {user:null,job:null};const u=clone(previous);
 for(const j of u.jobs)if(j.state==='sending'&&now-j.updated>180000){j.state='unknown';j.code='interrupted';j.updated=now;}
 // Retain all events while they could still be eligible, including unusually long forecasts.
 u.jobs=u.jobs.filter(j=>now-j.created<7*86400000||Date.parse(j.event?.validUntil)>now||j.state==='sending');
 const events=[];
 if(state.baseline)for(const r of state.records||[])if(r.category==='reset'&&['automatic','banked'].includes(r.resetType)&&Date.parse(r.postedAt)>=Math.max(state.baseline,u.created)&&Date.parse(r.postedAt)<=now&&now-Date.parse(r.postedAt)<=6*3600000)events.push(['reset',r]);
 if(active(state.forecast,now))events.push(['forecast',state.forecast]);
 events.sort((a,b)=>Date.parse(b[1].postedAt||b[1].publishedAt)-Date.parse(a[1].postedAt||a[1].publishedAt));
 for(const [kind,event] of events){
  if(!u.settings[kind+'Alerts']||u.credits[kind]<1||(kind==='forecast'&&event.probability<u.settings.threshold))continue;
  const id=`${kind}:${event.id}`;let j=u.jobs.find(j=>j.id===id);
  if(j&&(!['retry','cancelled'].includes(j.state)||(j.state==='retry'&&j.available>now)))continue;
  if(j&&j.state==='cancelled'&&!['disabled','disabled_or_expired','below_threshold','expired_before_send'].includes(j.code))continue;
  if(!j){j={id,kind,created:now,attempts:0};u.jobs.push(j);}
  Object.assign(j,{event,updated:now,state:'sending',attempts:j.attempts+1,grantVersion:u.versions[kind]});
  u.credits[kind]--;
  return {user:u,job:{...clone(j),preferences:clone(u.settings)}};
 }
 return {user:u,job:null};
}
export function finishUser(previous,job,result,now=Date.now()){
 if(!previous)return null;const u=clone(previous);const j=u.jobs.find(j=>j.id===job.id);
 if(!j||j.state!=='sending'||j.grantVersion!==job.grantVersion||j.attempts!==job.attempts)return u;
 j.state=result.state==='retry'&&job.attempts>=3?'failed':result.state==='denied'?'failed':result.state;
 j.updated=now;j.available=now+60000*2**job.attempts;j.code=String(result.code??'');
 if(u.versions[job.kind]===job.grantVersion){
  if(['failed','retry','cancelled'].includes(result.state)&&u.settings[job.kind+'Alerts'])u.credits[job.kind]=Math.min(1,u.credits[job.kind]+1);
  if(result.state==='denied'){u.settings[job.kind+'Alerts']=false;u.credits[job.kind]=0;}
 }
 return u;
}
