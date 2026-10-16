import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {sanitizeSettings} from '../src/lib/domain.mjs';
import {mergeRecords} from './sources.mjs';
import {conditionalForecast} from './model.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const iso=value=>new Date(value).toISOString();
const parse=value=>value?JSON.parse(value):null;
const activeForecast=(f,now)=>f&&Number.isFinite(f.probability)&&f.probability>=0&&f.probability<=100&&Date.parse(f.validUntil)>now&&Date.parse(f.sourceFreshUntil)>now&&Date.parse(f.publishedAt)<=now;
export function createStore(path) {
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,payload TEXT NOT NULL,first_seen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS revisions(id TEXT,at INTEGER,payload TEXT NOT NULL,PRIMARY KEY(id,at));
 CREATE TABLE IF NOT EXISTS forecasts(id TEXT PRIMARY KEY,at INTEGER,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS forecast_revisions(id TEXT,at INTEGER,payload TEXT NOT NULL,PRIMARY KEY(id,at));
 CREATE TABLE IF NOT EXISTS subscriptions(openid TEXT PRIMARY KEY,settings TEXT NOT NULL,reset_credit INTEGER NOT NULL DEFAULT 0,forecast_credit INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,openid TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS receipts(id TEXT,openid TEXT,created INTEGER,PRIMARY KEY(id,openid));
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,openid TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,available INTEGER NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,code TEXT);
 CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(state,available);
 CREATE INDEX IF NOT EXISTS jobs_user ON jobs(openid,created);
 `);
 for(const [table,column] of [['subscriptions','reset_version'],['subscriptions','forecast_version'],['jobs','grant_version']]){
  if(!db.prepare(`PRAGMA table_info(${table})`).all().some(r=>r.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
 }
 const get=key=>parse(db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value);
 const set=(key,value)=>db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
 const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 const subscription=openid=>{const row=db.prepare('SELECT * FROM subscriptions WHERE openid=?').get(openid);return row?{...parse(row.settings),resetCredits:row.reset_credit,forecastCredits:row.forecast_credit,updatedAt:iso(row.updated)}:null;};
 const queue=(kind,event,now)=>{
  for(const s of db.prepare('SELECT * FROM subscriptions').all()){
   const prefs=parse(s.settings);if(!prefs[kind+'Alerts']||s[kind+'_credit']<1)continue;
   if(kind==='forecast'&&event.probability<prefs.threshold)continue;
   if(kind==='reset'&&s.created>Date.parse(event.postedAt))continue;
   const key=hash(`${kind}:${event.id}:${s.openid}`);
   db.prepare(`INSERT INTO jobs(id,openid,kind,payload,available,created,updated) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state='pending',payload=excluded.payload,available=excluded.available,updated=excluded.updated,code=NULL WHERE jobs.kind='forecast' AND jobs.state='cancelled' AND jobs.code IN ('below_threshold','disabled','disabled_or_expired')`).run(key,s.openid,kind,JSON.stringify(event),now,now,now);
  }
 };
 const api={
  close:()=>db.close(), get,set,
  records:()=>db.prepare('SELECT payload,first_seen FROM records').all().map(r=>({...parse(r.payload),firstSeenAt:iso(r.first_seen)})),
  saveOriginal(record){const prior=db.prepare('SELECT first_seen FROM records WHERE id=?').get(record.id);if(!prior)return;db.prepare('UPDATE records SET payload=? WHERE id=?').run(JSON.stringify(record),record.id);},
  ingest(snapshot,now=Date.now()) {return tx(()=>{
   const baseline=get('baseline');
   for(const incoming of snapshot.records||[]){
    const old=db.prepare('SELECT payload FROM records WHERE id=?').get(incoming.id);
    const previous=parse(old?.payload);
    const merged=mergeRecords(previous?[previous]:[],[incoming])[0];
    const data=JSON.stringify(merged);
    db.prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(incoming.id,data,now);
    if(old?.payload!==data)db.prepare('INSERT OR REPLACE INTO revisions VALUES (?,?,?)').run(incoming.id,now,data);
    const published=Date.parse(incoming.postedAt);
    const wasEligible=previous?.category==='reset'&&['automatic','banked'].includes(previous?.resetType);
    if(baseline&&!wasEligible&&merged.category==='reset'&&['automatic','banked'].includes(merged.resetType)&&published>=baseline&&published<=now&&now-published<=6*3600000)queue('reset',merged,now);
   }
   if(snapshot.records?.length&&!baseline)set('baseline',now);
   const health=get('sources')||[];
   set('sources',(snapshot.sources||health).map(s=>({...s,lastSuccessAt:s.status==='ok'?s.checkedAt:health.find(h=>h.name===s.name)?.lastSuccessAt||null})));
   if(snapshot.sources?.some(s=>s.status==='ok'))set('lastSuccessAt',snapshot.checkedAt);
   set('lastAttemptAt',snapshot.checkedAt);
   if(snapshot.forecast!==undefined){
    set('forecast',snapshot.forecast);
    if(snapshot.forecast){const f=snapshot.forecast;db.prepare('INSERT INTO forecasts VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(f.id,now,JSON.stringify(f));
     const prior=db.prepare('SELECT payload FROM forecast_revisions WHERE id=? ORDER BY at DESC LIMIT 1').get(f.id);
     const revision={...f};delete revision.checkedAt;delete revision.sourceFreshUntil;
     if(prior?.payload!==JSON.stringify(revision))db.prepare('INSERT OR REPLACE INTO forecast_revisions VALUES (?,?,?)').run(f.id,now,JSON.stringify(revision));
    }
   }
   const f=get('forecast');if(baseline&&activeForecast(f,now))queue('forecast',f,now);
  });},
  feed(now=Date.now()){
   const records=api.records().sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt));
   const f=get('forecast');const sources=get('sources')||[];
   const fresh=sources.some(s=>s.status==='ok'&&now-Date.parse(s.lastSuccessAt)<30*60000);
   const stale=!fresh;
   const model=conditionalForecast(records,now);
   return {resets:records.filter(r=>r.category==='reset'),signals:records.filter(r=>r.category==='forecast'),posts:records,generatedAt:iso(now),lastPolledAt:get('lastSuccessAt'),lastAttemptAt:get('lastAttemptAt'),forecast:!stale&&activeForecast(f,now)?f:null,model:{...model,diagnostics:undefined},sources,status:stale?'stale':sources.some(s=>s.status==='error')?'degraded':'live'};
  },
  forecastHistory(limit=50){return db.prepare('SELECT payload,at FROM forecast_revisions ORDER BY at DESC LIMIT ?').all(limit).map(r=>({...parse(r.payload),savedAt:iso(r.at)}));},
  subscription,
  subscribe(openid,preferences,grants,receipt,now=Date.now()) {return tx(()=>{
   const settings=sanitizeSettings(preferences);delete settings.demo;
   const result=db.prepare('INSERT OR IGNORE INTO receipts VALUES (?,?,?)').run(receipt,openid,now);
   if(!result.changes)return subscription(openid);
   const old=subscription(openid);
   settings.resetAlerts=settings.resetAlerts&&(grants.reset===true||old?.resetAlerts===true);
   settings.forecastAlerts=settings.forecastAlerts&&(grants.forecast===true||old?.forecastAlerts===true);
   const reset=settings.resetAlerts?(grants.reset===true?1:old?.resetCredits||0):0;
   const forecast=settings.forecastAlerts?(grants.forecast===true?1:old?.forecastCredits||0):0;
   db.prepare('INSERT INTO subscriptions(openid,settings,reset_credit,forecast_credit,created,updated) VALUES (?,?,?,?,?,?) ON CONFLICT(openid) DO UPDATE SET settings=excluded.settings,reset_credit=excluded.reset_credit,forecast_credit=excluded.forecast_credit,updated=excluded.updated').run(openid,JSON.stringify(settings),reset,forecast,now,now);
   if(grants.reset===true)db.prepare('UPDATE subscriptions SET reset_version=reset_version+1 WHERE openid=?').run(openid);
   if(grants.forecast===true)db.prepare('UPDATE subscriptions SET forecast_version=forecast_version+1 WHERE openid=?').run(openid);
   return subscription(openid);
  });},
  updatePreferences(openid,input,now=Date.now()){
   const old=subscription(openid);if(!old)return null;
   const settings=sanitizeSettings(input);delete settings.demo;
   // A preference update cannot grant fresh WeChat consent.
   settings.resetAlerts=settings.resetAlerts&&old.resetAlerts;
   settings.forecastAlerts=settings.forecastAlerts&&old.forecastAlerts;
   db.prepare('UPDATE subscriptions SET settings=?,reset_credit=?,forecast_credit=?,updated=? WHERE openid=?').run(JSON.stringify(settings),settings.resetAlerts?old.resetCredits:0,settings.forecastAlerts?old.forecastCredits:0,now,openid);
   for(const kind of ['reset','forecast'])if(!settings[kind+'Alerts'])db.prepare("UPDATE jobs SET state='cancelled',updated=?,code='disabled' WHERE openid=? AND kind=? AND state IN ('pending','retry')").run(now,openid,kind);
   return subscription(openid);
  },
  session(openid,now=Date.now(),ttl=7*86400000){const token=randomBytes(32).toString('base64url');db.prepare('DELETE FROM sessions WHERE expires<?').run(now);db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),openid,now+ttl);return token;},
  authenticate(token,now=Date.now()){if(typeof token!=='string'||token.length>100)return null;return db.prepare('SELECT openid FROM sessions WHERE token=? AND expires>?').get(hash(token),now)?.openid||null;},
  deleteAccount(openid){tx(()=>{for(const table of ['subscriptions','sessions','receipts','jobs'])db.prepare(`DELETE FROM ${table} WHERE openid=?`).run(openid);});},
  deliveries(openid){return db.prepare('SELECT id,kind,state,attempts,created,updated,code FROM jobs WHERE openid=? ORDER BY created DESC LIMIT 50').all(openid).map(r=>({...r,createdAt:iso(r.created),updatedAt:iso(r.updated)}));},
  recover(){db.prepare("UPDATE jobs SET state='unknown',code='interrupted' WHERE state='sending'").run();},
  claim(now=Date.now()){return tx(()=>{
   while(true){
   const candidates=db.prepare("SELECT j.* FROM jobs j JOIN subscriptions s ON s.openid=j.openid WHERE j.state IN ('pending','retry') AND j.available<=? AND ((j.kind='reset' AND s.reset_credit>0) OR (j.kind='forecast' AND s.forecast_credit>0)) ORDER BY j.created LIMIT 100").all(now);
   if(!candidates.length)return null;
   for(const job of candidates){
    const s=subscription(job.openid),queued=parse(job.payload);
    const event=job.kind==='forecast'?get('forecast'):queued;
    const expired=job.kind==='forecast'?(!activeForecast(event,now)||event?.id!==queued.id):now-Date.parse(event.postedAt)>6*3600000;
    if(!s||!s[job.kind+'Alerts']||expired||(job.kind==='forecast'&&event.probability<s.threshold)){
     const reason=!expired&&s?.[job.kind+'Alerts']?'below_threshold':'disabled_or_expired';
     db.prepare("UPDATE jobs SET state='cancelled',updated=?,code=? WHERE id=?").run(now,reason,job.id);continue;
    }
    if(s[job.kind+'Credits']<1)continue;
    const column=job.kind==='reset'?'reset_credit':'forecast_credit';
    const grantVersion=db.prepare(`SELECT ${job.kind}_version AS version FROM subscriptions WHERE openid=?`).get(job.openid).version;
    db.prepare(`UPDATE subscriptions SET ${column}=${column}-1 WHERE openid=?`).run(job.openid);
    db.prepare("UPDATE jobs SET state='sending',attempts=attempts+1,updated=?,grant_version=?,payload=? WHERE id=?").run(now,grantVersion,JSON.stringify(event),job.id);
    return {...job,event,preferences:s,grantVersion,attempts:job.attempts+1};
   }if(candidates.length<100)return null;
   }
  });},
  finish(job,result,now=Date.now()){tx(()=>{
   const state=result.state==='retry'&&job.attempts>=3?'failed':result.state==='denied'?'failed':result.state;
   db.prepare('UPDATE jobs SET state=?,updated=?,available=?,code=? WHERE id=? AND state=\'sending\'').run(state,now,now+60000*2**job.attempts,String(result.code??''),job.id);
   const column=job.kind==='reset'?'reset_credit':'forecast_credit';
   const version=job.kind+'_version';
   if(['retry','failed','cancelled'].includes(result.state))db.prepare(`UPDATE subscriptions SET ${column}=MIN(1,${column}+1) WHERE openid=? AND ${version}=?`).run(job.openid,job.grantVersion);
   if(result.state==='denied'&&db.prepare(`SELECT ${version} AS version FROM subscriptions WHERE openid=?`).get(job.openid)?.version===job.grantVersion){const s=subscription(job.openid);if(s){s[job.kind+'Alerts']=false;api.updatePreferences(job.openid,s,now);}}
  });}
 };
 return api;
}
