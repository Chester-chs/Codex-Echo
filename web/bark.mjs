import {getForecast,formatTime} from '../src/lib/domain.mjs';
import {chineseText,localizedWindow} from '../src/lib/localized-content.mjs';
import {interpretResetDirective,isCurrentPlanNotice,annotateResetPlan,resetNoticeKey} from '../src/lib/reset-plan.mjs';

const iso=value=>new Date(value).toISOString();
const number=(value,fallback,min,max)=>Number.isFinite(Number(value))&&value!==undefined?Math.max(min,Math.min(max,Math.round(Number(value)))):fallback;
const SITE='https://echo-radar.pages.dev/';
const LEASE=180000;
export function barkSettings(env={}) {
 return {enabled:env.BARK_ENABLED==='true',resetAlerts:env.BARK_RESET_ALERTS!=='false',forecastAlerts:env.BARK_FORECAST_ALERTS!=='false',threshold:number(env.BARK_THRESHOLD,60,40,90),language:env.BARK_LANGUAGE==='en'?'en':'zh',dailyLimit:number(env.BARK_DAILY_LIMIT,20,1,20)};
}
export function parseBarkKey(input) {
 let value=String(input??'').trim();
 const fail=()=>{throw new Error('Invalid Bark device address');};
 if(/^curl(?:\.exe)?\s/i.test(value)){const urls=value.match(/https?:\/\/[^\s"'<>`]+/gi)||[];if(urls.length!==1)fail();value=urls[0];}
 if(/^https?:/i.test(value)){
  let url;try{url=new URL(value);}catch{fail();}
  if(!['https:','http:'].includes(url.protocol)||url.hostname!=='api.day.app'||url.port||url.username||url.password)fail();
  value=url.pathname.split('/')[1];
 }
 if(!/^[A-Za-z0-9_-]{8,200}$/.test(value))fail();return value;
}
export const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const recipient=env=>digest(env.BARK_DEVICE_KEY);
function clip(text,bytes=1000) {
 let result='',used=0;for(const char of String(text||'')){const size=new TextEncoder().encode(char).length;if(used+size>bytes)return result+'…';result+=char;used+=size;}return result;
}
function bothTimes(time,zh) {
 return `${zh?'伦敦':'London'} ${formatTime(time,'en','Europe/London')}\n${zh?'北京':'Beijing'} ${formatTime(time,'en','Asia/Shanghai')}`;
}
export function formatBark(job,{language='zh'}={}) {
 const zh=language==='zh',e=job.event||{};
 const url=new URL(SITE);
 let title,body;
 if(job.kind==='test'){
  title=zh?'Codex 回响 · 锁屏推送测试':'Codex Echo · Push test';
  body=zh?'这是一条测试通知，不代表发生重置或出现新的预测。\n\n通知由云端发送，关闭网页和电脑后仍可运行。请确认 iPhone 锁屏时能看到这条消息，点击可打开回响网页。':'This is a test, not a reset announcement or a new forecast.\n\nSent by the cloud service, independently of the website and your computer. Please check this message on your iPhone Lock Screen. Tap to open Echo.';
 }else if(job.kind==='alert'&&e.kind==='tweet'){
  const label=zh?'来源原话':'Original post',quote=clip(e.original,2000),translation=zh?'\n\n中文译文\n'+clip(chineseText(e.original,e.translation)):'';
  const parent=e.parent?.original?'\n\n'+(zh?'父帖原话':'Parent post')+'\n'+clip(e.parent.original,1000)+(zh?'\n'+clip(chineseText(e.parent.original,e.parent.translation),1000):''):'';
  if(e.tweetClass==='plan'){
   title=zh?'Codex 回响 · 已公布重置计划':'Codex Echo · Planned reset announced';
   body=(zh?(e.before?'截止时间之前':e.approximate?'最晚约':'计划重置时间'):(e.before?'Before':e.approximate?'By about':'Planned reset time'))+'\n'+bothTimes(e.scheduledAt,zh)+'\n\n'+(zh?'这是来源公布的计划，不代表已经完成；到点后仍等待完成确认。':'An announced plan, not a completed reset. Completion still needs confirmation.');
  }else if(e.tweetClass==='commitment'){
   title=zh?'Codex 回响 · ⚠️ Tibo 预告重置':'Codex Echo · ⚠️ Tibo announced a reset';
   body=zh?'这是预告，不代表已完成。':'A reset announcement, not a completed reset.';
  }else{
   title=zh?'Codex 回响 · ✅ Tibo 确认重置完成':'Codex Echo · ✅ Tibo confirmed reset completion';
   body=zh?'不代表你的个人账号额度已恢复，以账号显示为准。':'This does not confirm your personal account allowance has recovered. Check your account.';
  }
  body+='\n\n'+label+'\n'+quote+parent+translation+'\n\n'+(zh?'发布时间':'Published')+'\n'+bothTimes(e.postedAt||e.sourceAt,zh)+'\n\nData: codex-reset.com';
  url.hash='/pages/index/index?record='+encodeURIComponent(e.id);
 }else if(job.kind==='alert'){
  title=zh?'Codex 回响 · ✅ Codex 已重置':'Codex Echo · ✅ Codex reset confirmed';
  const method=e.confirmationSource==='operator_observed'?(zh?'codex-reset 对其自有账号的实测；不代表所有账号':'codex-reset measurement on its own accounts; not all accounts'):(zh?'Tibo 明确确认':'Explicit confirmation from Tibo');
  body=zh?`确认方式：${method}\n\n来源记录时间\n${bothTimes(e.observedAt||e.confirmedAt||e.sourceAt,true)}\n\n不代表你的个人账号额度已恢复，以账号显示为准。\n\nData: codex-reset.com`:`Confirmed by: ${method}\n\nSource observation time\n${bothTimes(e.observedAt||e.confirmedAt||e.sourceAt,false)}\n\nThis does not confirm your personal account allowance has recovered. Check your account.\n\nData: codex-reset.com`;
  url.hash='/pages/index/index?record='+encodeURIComponent(e.id);
 }else if(job.kind==='reset'){
  const plan=interpretResetDirective(e)||(e.category==='schedule'&&Number.isFinite(Date.parse(e.scheduledAt))?{kind:'scheduled',scheduledAt:e.scheduledAt}:null);
  if(plan?.kind==='scheduled'){
   title=zh?'Codex 回响 · 已公布重置计划':'Codex Echo · Planned reset announced';
   body=zh?`${plan.before?'截止时间之前':plan.approximate?'最晚约':'计划重置时间'}\n${bothTimes(plan.scheduledAt,true)}\n\n来源原话（中文译文）\n${clip(chineseText(e.original,e.translation))}\n\n这是来源公布的计划，不代表已经完成；到点后仍等待完成确认，也不保证你的个人账号额度恢复。\n\n公告发布于\n${bothTimes(e.postedAt,true)}`:`${plan.before?'Before':plan.approximate?'By about':'Planned reset time'}\n${bothTimes(plan.scheduledAt,false)}\n\nOriginal announcement\n${clip(e.original)}\n\nAn announced plan, not a completed reset. Completion still needs confirmation after the target time; personal account availability is not guaranteed.\n\nAnnounced\n${bothTimes(e.postedAt,false)}`;
   if(e.textSource?.startsWith('https://codex-reset.com/'))body+='\n\nData: codex-reset.com';
   url.hash='/pages/index/index?record='+encodeURIComponent(e.id);
   return {title,body,group:zh?'Codex 回响':'Codex Echo',url:url.href,icon:SITE+'static/pulse.png',sound:'bell',level:'active'};
  }
  const type=e.resetTypes?.length>1?(zh?'全局重置 + 重置券':'Global + reset credit'):e.resetType==='banked'?(zh?'重置券公告':'Reset credit announcement'):(zh?'全局重置公告':'Global reset announcement');
  title=plan?.kind==='completed'?(zh?'Codex 回响 · 来源确认重置完成':'Codex Echo · Reset completion confirmed'):(zh?'Codex 回响 · ':'Codex Echo · ')+type;
  const quote=clip(zh?chineseText(e.original,e.translation):e.original);
  body=zh?`消息原话（中文译文）\n${quote}\n\n实际重置时间\n${e.resetAt?bothTimes(e.resetAt,true):'未说明，无法确定'}\n\n说明\n公开公告不代表你的账号额度已恢复，请以账号显示为准。\n\n发帖时间\n${bothTimes(e.postedAt,true)}\n\n来源：Tibo · @thsottiaux。点通知查看完整推文与出处。`:`Original announcement\n${quote}\n\nActual reset time\n${e.resetAt?bothTimes(e.resetAt,false):'Not stated; cannot be determined.'}\n\nA public announcement does not confirm your account allowance has recovered.\n\nPublished\n${bothTimes(e.postedAt,false)}\n\nSource: Tibo · @thsottiaux. Tap for the full post and source.`;
  url.hash='/pages/index/index?record='+encodeURIComponent(e.id);
 }else{
  title=zh?`Codex 回响 · 来源预测 ${e.probability}%`:`Codex Echo · Source estimate ${e.probability}%`;
  const basis=clip(zh?chineseText(e.basis,e.basisZh):e.basis),window=clip(zh?localizedWindow(e.windowText,'zh'):e.windowText||'See source',300);
  body=zh?`来源预测：${e.probability}%\n这是 AIPlanWatch 的来源判断，非官方承诺，也不是 Tibo 本人给出的概率。\n\n来源依据\n${basis}\n\n来源时间描述\n${window}（以来源记录时刻为起点）\n\n来源记录于\n${bothTimes(e.publishedAt,true)}\n\n有效期至\n${bothTimes(e.validUntil,true)}\n\n点通知查看当前预测与完整出处。`:`Source estimate: ${e.probability}%\nAn AIPlanWatch assessment, not an official promise or a probability stated by Tibo.\n\nBasis\n${basis}\n\nSource window\n${window} (from the source record time)\n\nSource recorded\n${bothTimes(e.publishedAt,false)}\n\nValid until\n${bothTimes(e.validUntil,false)}\n\nTap for the current assessment and full source.`;
  url.hash='/pages/index/index?forecast=1';
 }
 if(job.kind==='reset'&&e.textSource?.startsWith('https://codex-reset.com/'))body+='\n\nData: codex-reset.com';
 return {title,body,group:zh?'Codex 回响':'Codex Echo',url:url.href,icon:SITE+'static/pulse.png',sound:'bell',level:'active'};
}
export async function sendBark(job,env,{fetcher=fetch}={}) {
 let response,data;
 try{
  response=await fetcher('https://api.day.app/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_key:env.BARK_DEVICE_KEY,...formatBark(job,barkSettings(env)),...(job.collapseId?{id:job.collapseId}:{})}),redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(response.status===429||response.status>=500)return {state:'retry',code:'provider_'+response.status};
  data=await response.json();
 }catch{return {state:'unknown',code:'transport_uncertain'};}
 if(response.ok&&data?.code===200)return {state:'sent',code:'provider_accepted'};
 if(data?.code===429||data?.code>=500&&data?.code<600)return {state:'retry',code:'provider_'+data.code};
 if(Number.isInteger(data?.code)&&data.code>=400&&data.code<500)return {state:'failed',code:'provider_'+data.code};
 return {state:'unknown',code:'response_uncertain'};
}
export function ready(state,now){return state?.sources?.some(s=>s.status==='ok'&&Date.parse(s.lastSuccessAt)<=now+60000&&now-Date.parse(s.lastSuccessAt)<1800000);}
function snapshot(event){const copy={...event};for(const key of ['original','translation','basis','basisZh'])if(copy[key])copy[key]=clip(copy[key],6000);return copy;}
async function putEvent(db,id,key,kind,event,state,now){
 await db.prepare('INSERT OR IGNORE INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(id,key,kind,JSON.stringify(snapshot(event)),state,now,now,now).run();
}
export async function forecastKey(f){return 'forecast:'+await digest(JSON.stringify([f.id,f.probability,Date.parse(f.publishedAt),Date.parse(f.validUntil),f.windowText,f.basis,f.sourceUrl]));}
export async function queueBarkTest(env,requestId,now=Date.now()) {
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(requestId||''))throw Object.assign(new Error('Invalid test request ID'),{status:400});
 if(!env.NOTIFY_DB||!env.BARK_DEVICE_KEY)throw Object.assign(new Error('Bark not configured'),{status:503});
 await putEvent(env.NOTIFY_DB,await recipient(env),'test:'+requestId,'test',{},'pending',now);
 return {requestId};
}
export async function runBark(env,state,{now=Date.now,send=(job)=>sendBark(job,env)}={}) {
 const settings=barkSettings(env);
 if(!settings.enabled||!env.NOTIFY_DB||!env.BARK_DEVICE_KEY)return {state:'disabled'};
 const clock=typeof now==='function'?now:()=>now,n=clock(),id=await recipient(env),db=env.NOTIFY_DB,token=crypto.randomUUID();
 await db.prepare('INSERT OR IGNORE INTO bark_control(id) VALUES(?)').bind(id).run();
 const claim=await db.prepare('UPDATE bark_control SET lease_token=?,lease_until=? WHERE id=? AND lease_until<=?').bind(token,n+LEASE,id,n).run();
 if(!claim.meta.changes)return {state:'busy'};
 let sent=0,candidates=0;
 try{
  await db.prepare("UPDATE bark_events SET state='unknown',code='interrupted',updated=? WHERE recipient=? AND state='sending' AND EXISTS(SELECT 1 FROM bark_control WHERE id=? AND lease_token=? AND lease_until>?)").bind(n,id,id,token,n).run();
  const control=await db.prepare('SELECT baseline_at FROM bark_control WHERE id=?').bind(id).first();
  const fresh=ready(state,n),f=getForecast(state?.forecast,n);
  const resets=(state?.records||[]).map(annotateResetPlan).filter(r=>['reset','schedule'].includes(r.category)&&['automatic','banked'].includes(r.resetType)&&/^\d+$/.test(r.id)&&/^https:\/\/(?:x\.com|twitter\.com)\/(?:thsottiaux|i)\/status\/\d+$/.test(r.url)&&Date.parse(r.postedAt)<=n);
  if(fresh&&!control.baseline_at){
   const rows=[db.prepare("INSERT OR IGNORE INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated) SELECT ?,value,'reset','{}','baseline',?,?,? FROM json_each(?)").bind(id,n,n,n,JSON.stringify(resets.map(resetNoticeKey)))];
   if(f)rows.push(db.prepare('INSERT OR IGNORE INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated) VALUES(?,?,?,?,?,?,?,?)').bind(id,await forecastKey(f),'forecast','{}','baseline',n,n,n));
   rows.push(db.prepare('UPDATE bark_control SET baseline_at=? WHERE id=? AND lease_token=?').bind(n,id,token));
   await db.batch(rows);
  }else if(fresh){
   const eligible=settings.resetAlerts?resets.filter(r=>Date.parse(r.postedAt)>=control.baseline_at&&n-Date.parse(r.postedAt)<21600000).map(r=>({...snapshot(r),noticeKey:resetNoticeKey(r)})):[];
   if(eligible.length)await db.prepare("INSERT OR IGNORE INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated) SELECT ?,json_extract(value,'$.noticeKey'),'reset',value,'pending',?,?,? FROM json_each(?)").bind(id,n,n,n,JSON.stringify(eligible)).run();
   if(f&&settings.forecastAlerts&&f.probability>=settings.threshold&&Date.parse(f.publishedAt)>=control.baseline_at)await putEvent(db,id,await forecastKey(f),'forecast',f,'pending',n);
  }
  const currentForecastKey=f&&f.probability>=settings.threshold?await forecastKey(f):null;
  const rows=(await db.prepare("SELECT * FROM bark_events WHERE recipient=? AND state IN ('pending','retry') AND available<=? ORDER BY CASE kind WHEN 'test' THEN 0 ELSE 1 END,created DESC LIMIT 20").bind(id,n).all()).results;
  for(const row of rows){
   const at=clock();if(at>=n+LEASE-20000||candidates>=3)break;
   const event=JSON.parse(row.payload),kind=row.kind;
   const isEligible=time=>kind==='test'||ready(state,time)&&(kind==='reset'?settings.resetAlerts&&time-Date.parse(event.postedAt)<21600000&&isCurrentPlanNotice(event,state.records||[],time):settings.forecastAlerts&&getForecast(event,time)&&row.event_key===currentForecastKey);
   const eligible=isEligible(at);
   if(!eligible){await db.prepare("UPDATE bark_events SET state='cancelled',code='disabled_or_expired',updated=? WHERE recipient=? AND event_key=? AND state IN ('pending','retry') AND attempts=? AND EXISTS(SELECT 1 FROM bark_control WHERE id=? AND lease_token=? AND lease_until>?)").bind(at,id,row.event_key,row.attempts,id,token,at).run();continue;}
   candidates++;
   const day=iso(at).slice(0,10);
   await db.prepare('INSERT OR IGNORE INTO bark_daily(recipient,day) VALUES(?,?)').bind(id,day).run();
   const quota=await db.prepare('UPDATE bark_daily SET attempts=attempts+1 WHERE recipient=? AND day=? AND attempts<?').bind(id,day,settings.dailyLimit).run();
   if(!quota.meta.changes)break;
   // Fence every dispatch with the current lease and atomically claim the expected event revision.
   const renewedAt=clock();
   const renewed=await db.prepare('UPDATE bark_control SET lease_until=? WHERE id=? AND lease_token=? AND lease_until>?').bind(renewedAt+LEASE,id,token,renewedAt).run();
   if(!renewed.meta.changes)break;
   const claimedAt=clock();
   const claimed=await db.prepare("UPDATE bark_events SET state='sending',attempts=attempts+1,updated=? WHERE recipient=? AND event_key=? AND state IN ('pending','retry') AND attempts=? AND available<=? AND EXISTS(SELECT 1 FROM bark_control WHERE id=? AND lease_token=? AND lease_until>?)").bind(claimedAt,id,row.event_key,row.attempts,claimedAt,id,token,claimedAt).run();
   if(!claimed.meta.changes)continue;
   const dispatchAt=clock();
   if(!isEligible(dispatchAt)){
    await db.prepare("UPDATE bark_events SET state='cancelled',code='expired_before_dispatch',updated=? WHERE recipient=? AND event_key=? AND state='sending' AND attempts=?").bind(dispatchAt,id,row.event_key,row.attempts+1).run();
    continue;
   }
   let outcome;try{outcome=await send({kind,event,key:row.event_key});}catch{outcome={state:'unknown',code:'transport_uncertain'};}
   const attempts=row.attempts+1,result=outcome.state==='retry'&&attempts>=3?'failed':['sent','retry','failed','unknown'].includes(outcome.state)?outcome.state:'unknown';
   // Persist the outcome before releasing the global lease. An interrupted send is never automatically repeated.
   await db.prepare("UPDATE bark_events SET state=?,code=?,available=?,updated=? WHERE recipient=? AND event_key=? AND state='sending' AND attempts=?").bind(result,String(outcome.code||result).slice(0,80),at+60000*2**attempts,clock(),id,row.event_key,attempts).run();
   sent++;
  }
  await db.prepare('UPDATE bark_control SET last_run_at=? WHERE id=? AND lease_token=?').bind(clock(),id,token).run();
  return {state:fresh?'checked':'source_stale',attempted:sent};
 }finally{await db.prepare('UPDATE bark_control SET lease_until=0,lease_token=NULL WHERE id=? AND lease_token=?').bind(id,token).run();}
}
export async function barkStatus(env) {
 const settings=barkSettings(env),configured=Boolean(env.BARK_DEVICE_KEY&&env.NOTIFY_DB);
 if(!configured)return {configured:false,settings,initialized:false,receipts:[]};
 const id=await recipient(env),db=env.NOTIFY_DB;
 const control=await db.prepare('SELECT baseline_at,last_run_at FROM bark_control WHERE id=?').bind(id).first();
 const receipts=(await db.prepare("SELECT kind,state,attempts,code,updated FROM bark_events WHERE recipient=? AND state!='baseline' ORDER BY updated DESC LIMIT 10").bind(id).all()).results;
 return {configured:true,settings,initialized:Boolean(control?.baseline_at),lastRunAt:control?.last_run_at?iso(control.last_run_at):null,receipts:receipts.map(r=>({...r,updatedAt:iso(r.updated)})),deliveryMeaning:'sent means Bark accepted the request; iPhone receipt requires device verification'};
}
export async function barkAuthenticated(request,secret) {
 if(typeof secret!=='string'||secret.length<32)return false;
 const supplied=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
 if(supplied.length!==secret.length)return false;
 const [a,b]=await Promise.all([supplied,secret].map(digest));let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0;
}
