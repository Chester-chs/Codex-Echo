import {parseLatestAlert} from '../backend/codex-reset.mjs';
import {readProvider} from './provider-budget.mjs';
export const ALERT_KEY=a=>`alert:${a.id}:${a.kind}:${a.state}`;
export function validAlertAt(a,now,baseline=0){const at=Date.parse(a?.sourceAt);const type=a?.kind==='reset'&&a.state==='confirmed'||a?.kind==='tweet'&&['plan','commitment','completed'].includes(a.tweetClass)&&(a.tweetClass!=='plan'||Date.parse(a.scheduledAt)>now);return Boolean(type&&Number.isFinite(at)&&at>baseline&&at<=now&&now-at<21600000);}
export async function discoverCodexReset(env,{now=Date.now(),fetcher=fetch}={}){
 if(!env.NOTIFY_DB||env.BARK_VISITORS_ENABLED!=='true')return null;
 const db=env.NOTIFY_DB,path='/api/forecast';
 try{
  const payload=await readProvider(env,path,{fetcher,now}),alert=parseLatestAlert(payload);
  // Set the deployment fence before considering the current event: installing a new source never replays history.
  await db.prepare("INSERT OR IGNORE INTO bark_meta(name,value) VALUES('codex-reset:baseline',?)").bind(String(now)).run();
  await db.prepare("INSERT INTO bark_meta(name,value) VALUES('codex-reset:last-ok',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").bind(String(now)).run();
  if(!validAlertAt(alert,now))return null;
  const result=await db.prepare(`INSERT OR IGNORE INTO bark_events(recipient,event_key,kind,payload,state,available,created,updated)
   SELECT s.device_hash,?,'alert',?,'pending',?,?,? FROM bark_subscriptions s JOIN bark_control c ON c.id=s.device_hash
   WHERE s.reset_alerts=1 AND c.baseline_at<? AND CAST((SELECT value FROM bark_meta WHERE name='codex-reset:baseline') AS INTEGER)<?`).bind(ALERT_KEY(alert),JSON.stringify(alert),now,now,now,Date.parse(alert.sourceAt),Date.parse(alert.sourceAt)).run();
  if(result.meta.changes)console.log(JSON.stringify({event:'codex_reset_alert',id:alert.id,kind:alert.kind,state:alert.state,lagSeconds:Math.round((now-Date.parse(alert.sourceAt))/1000)}));
  return alert;
 }catch(error){if(error.code!=='minute_budget')console.warn(JSON.stringify({event:'codex_reset_failed',path,reason:/^HTTP \d+$|^Response too large$|^Invalid codex-reset schema$/.test(error.message)?error.message:'Fetch or validation failed'}));return null;}
}
export const KIND_ORDER="CASE kind WHEN 'test' THEN 0 WHEN 'alert' THEN 1 WHEN 'reset' THEN 2 WHEN 'forecast' THEN 3 ELSE 4 END";
