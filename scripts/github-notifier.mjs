import {DatabaseSync} from 'node:sqlite';
import {readFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {parseBarkKey,runBark,sendBark,queueBarkTest} from '../web/bark.mjs';

const BRANCH='echo-notifier-state',FILE='state.json',DAY=86400000;
function flag(value,fallback=true) {
 if(value===undefined||value==='')return fallback;
 if(!['true','false'].includes(value))throw new Error('Notification switches must be true or false');
 return value==='true';
}
export function readPersonalSettings(input) {
 const threshold=Number(input.BARK_THRESHOLD||60),dailyLimit=Number(input.BARK_DAILY_LIMIT||20),language=input.BARK_LANGUAGE||'zh';
 if(!Number.isInteger(threshold)||threshold<40||threshold>90||threshold%5||!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>20||!['zh','en'].includes(language))throw new Error('Invalid notification preferences');
 return {BARK_ENABLED:String(flag(input.BARK_ENABLED)),BARK_DEVICE_KEY:parseBarkKey(input.BARK_DEVICE_KEY),BARK_RESET_ALERTS:String(flag(input.BARK_RESET_ALERTS)),BARK_FORECAST_ALERTS:String(flag(input.BARK_FORECAST_ALERTS)),BARK_THRESHOLD:String(threshold),BARK_DAILY_LIMIT:String(dailyLimit),BARK_LANGUAGE:language};
}

function localStore(snapshot,persist,now) {
 if(snapshot&&(snapshot.version!==1||!['controls','events','daily'].every(k=>Array.isArray(snapshot[k])&&snapshot[k].length<=5000)))throw new Error('Invalid saved notification state');
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../web/migrations/0001_bark.sql',import.meta.url),'utf8'));
 const tables={controls:['bark_control',['id','baseline_at','lease_token','lease_until','last_run_at']],events:['bark_events',['recipient','event_key','kind','payload','state','attempts','available','created','updated','code']],daily:['bark_daily',['recipient','day','attempts']]};
 for(const [key,[table,columns]] of Object.entries(tables))for(const row of snapshot?.[key]||[])sql.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]??null));
 sql.prepare("DELETE FROM bark_events WHERE updated<? AND state NOT IN('pending','retry','sending')").run(now-30*DAY);
 sql.prepare('DELETE FROM bark_daily WHERE day<?').run(new Date(now-7*DAY).toISOString().slice(0,10));
 function exportState() {
  return {version:1,controls:sql.prepare('SELECT * FROM bark_control ORDER BY id').all().map(r=>({...r,last_run_at:null})),events:sql.prepare('SELECT * FROM bark_events ORDER BY recipient,event_key').all().map(r=>({...r,payload:['pending','retry'].includes(r.state)?r.payload:'{}'})),daily:sql.prepare('SELECT * FROM bark_daily ORDER BY recipient,day').all()};
 }
 let previous=JSON.stringify(snapshot);
 async function save() {const state=exportState(),serialized=JSON.stringify(state);if(serialized!==previous){await persist(state);previous=serialized;}}
 const db={prepare(query){let values=[];return {bind(...args){values=args;return this;},async run(){const r=sql.prepare(query).run(...values);if(r.changes&&query.startsWith("UPDATE bark_events SET state='sending'"))await save();return {meta:{changes:Number(r.changes)}};},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};}};},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 return {db,save,close:()=>sql.close()};
}

export async function runPersonalNotifier({env,storage,feed,now=Date.now,send,testId}) {
 const settings=readPersonalSettings(env);
 if(settings.BARK_ENABLED!=='true')return {state:'disabled',attempted:0};
 if(!feed||!Array.isArray(feed.records)||!Array.isArray(feed.sources))throw new Error('Invalid public feed');
 const clock=typeof now==='function'?now:()=>now;
 const snapshot=await storage.load(),store=localStore(snapshot,state=>storage.save(state),clock()),runtime={...settings,NOTIFY_DB:store.db};
 try{
  if(testId)await queueBarkTest(runtime,testId,clock());
  const result=await runBark(runtime,feed,{now:clock,send:send||((job)=>sendBark(job,runtime))});
  await store.save();
  return result;
 }finally{store.close();}
}

export class GitHubStateStore {
 constructor({repository,token,commit,fetcher=fetch}) {
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository||'')||!token||!/^[a-f\d]{40}$/i.test(commit||''))throw new Error('GitHub workflow context is missing');
  Object.assign(this,{base:'https://api.github.com/repos/'+repository,token,commit,fetcher,sha:undefined,createBranch:false});
 }
 async request(path,{method='GET',body,allowMissing=false}={}) {
  let response;
  try{response=await this.fetcher(this.base+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+this.token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json','User-Agent':'echo-radar-personal-notifier'},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(20000)});}catch{throw new Error('GitHub state request unavailable');}
  if(allowMissing&&response.status===404)return null;
  if(!response.ok)throw new Error('GitHub state request failed (HTTP '+response.status+'); check Actions contents-write permission');
  const raw=await response.text();if(Buffer.byteLength(raw)>2000000)throw new Error('GitHub state response too large');
  try{return JSON.parse(raw);}catch{throw new Error('Invalid GitHub response');}
 }
 async load() {
  const file=await this.request('/contents/'+FILE+'?ref='+BRANCH,{allowMissing:true});
  if(file===null){
   const branch=await this.request('/git/ref/heads/'+BRANCH,{allowMissing:true});
   if(branch)throw new Error('Saved state file is missing; refusing to reset deduplication');
   this.createBranch=true;return null;
  }
  if(file.encoding!=='base64'||!file.sha||typeof file.content!=='string')throw new Error('Invalid saved notification file');
  this.sha=file.sha;
  try{return JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));}catch{throw new Error('Corrupt notification state');}
 }
 async save(value) {
  const content=Buffer.from(JSON.stringify(value)+'\n');if(content.length>700000)throw new Error('Notification state too large');
  if(this.createBranch){await this.request('/git/refs',{method:'POST',body:{ref:'refs/heads/'+BRANCH,sha:this.commit}});this.createBranch=false;}
  const result=await this.request('/contents/'+FILE,{method:'PUT',body:{message:'Update personal notification state [skip ci]',branch:BRANCH,content:content.toString('base64'),...(this.sha?{sha:this.sha}:{})}});
  if(!result.content?.sha)throw new Error('GitHub did not confirm saved state');
  this.sha=result.content.sha;
 }
}

export async function fetchPublicFeed(fetcher=fetch) {
 const response=await fetcher('https://pulse-radar-api.chqua75.workers.dev/api/feed',{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('Public feed is unavailable');
 const text=await response.text();if(Buffer.byteLength(text)>3000000)throw new Error('Public feed is too large');
 const data=JSON.parse(text);
 if(!Array.isArray(data.resets)||!Array.isArray(data.sources))throw new Error('Invalid public feed');
 return {records:Array.isArray(data.posts)?data.posts:data.resets,forecast:data.forecast,sources:data.sources};
}

async function main() {
 if(!process.env.BARK_DEVICE_KEY){console.log('Bark is not configured. Add the BARK_DEVICE_KEY repository secret.');return;}
 const env=process.env;
 if(!flag(env.BARK_ENABLED)){console.log('Personal notifications are paused.');return;}
 const storage=new GitHubStateStore({repository:env.GITHUB_REPOSITORY,token:env.GITHUB_TOKEN,commit:env.GITHUB_SHA});
 const result=await runPersonalNotifier({env,storage,feed:await fetchPublicFeed(),testId:env.ECHO_SEND_TEST==='true'?'manual-'+env.GITHUB_RUN_ID+'-'+env.GITHUB_RUN_ATTEMPT:undefined});
 console.log('Personal notification check: '+result.state+'; dispatch attempts: '+(result.attempted||0));
 if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,'Personal notification check completed. State: '+result.state+'. Provider acceptance is not proof of Lock Screen delivery.\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{
 // Do not echo response bodies, environment values or device addresses into public logs.
 console.error('Notification check failed. '+(['GitHub','Saved','Corrupt','Invalid','Notification','Public'].some(prefix=>error.message.startsWith(prefix))?error.message:'Check your Bark secret and repository variables.'));
 process.exitCode=1;
});
