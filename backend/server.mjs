import {resolve} from 'node:path';
import {createStore} from './store.mjs';
import {createWeChat} from './wechat.mjs';
import {createApi} from './http.mjs';
import {collectPublicSources,enrichOriginal} from './sources.mjs';
import {dispatch} from './worker.mjs';

const templates=JSON.parse(process.env.WECHAT_TEMPLATES_JSON||'{}');
const gateway=createWeChat({appId:process.env.WECHAT_APP_ID||'',appSecret:process.env.WECHAT_APP_SECRET||'',templates,state:process.env.WECHAT_MESSAGE_STATE||'trial'});
const store=createStore(resolve(process.env.RADAR_DB_PATH||'data/radar.sqlite'));
store.recover();
const server=createApi({store,gateway,allowedOrigin:process.env.ALLOWED_ORIGIN||'',trustProxy:process.env.TRUST_PROXY==='true'});
let polling=false,sending=false,stopping=false;
async function poll(){
 if(polling||stopping)return;polling=true;
 try{
  const now=new Date().toISOString();const backfill=!store.get('backfillCompleted');
  const snapshot=await collectPublicSources({backfill,now});store.ingest(snapshot);
  if(backfill&&snapshot.sources.filter(s=>['history','timeline'].includes(s.name)).every(s=>s.status==='ok'))store.set('backfillCompleted',true);
  const records=store.records().filter(r=>(!r.textCheckedAt||!['verified','mirror'].includes(r.textStatus)||Date.now()-Date.parse(r.textCheckedAt)>86400000)&&(!r.textRetryAt||Date.now()>=Date.parse(r.textRetryAt))).sort((a,b)=>Date.parse(b.postedAt)-Date.parse(a.postedAt)).slice(0,20);
  // Limit public embed lookups; retries wait for the next polling round.
  for(let i=0;i<records.length;i+=3){await Promise.all(records.slice(i,i+3).map(async r=>{try{store.saveOriginal({...await enrichOriginal(r,{bearer:process.env.X_BEARER_TOKEN||'',mirror:process.env.FXEMBED_ENABLED!=='false'}),textRetryAt:null});}catch{store.saveOriginal({...r,textRetryAt:new Date(Date.now()+5*60000).toISOString()});}}));}
  console.log(JSON.stringify({event:'poll',at:now,records:snapshot.records.length,sources:snapshot.sources.map(s=>`${s.name}:${s.status}`),forecast:Boolean(store.feed().forecast)}));
 }catch{console.error(JSON.stringify({event:'poll_failed',at:new Date().toISOString()}));}finally{polling=false;}
}
async function send(){if(sending||stopping||!gateway.enabled)return;sending=true;try{await dispatch(store,gateway);}catch{console.error(JSON.stringify({event:'dispatch_failed'}));}finally{sending=false;}}
const pollMs=Math.max(60000,Number(process.env.POLL_INTERVAL_MS)||300000);
const pollTimer=setInterval(poll,pollMs),sendTimer=setInterval(send,30000);
server.listen(Number(process.env.PORT)||8787,process.env.HOST||'127.0.0.1',()=>{console.log(`Pulse API listening on port ${server.address().port}; WeChat ${gateway.enabled?'configured':'not configured'}`);poll();});
async function stop(){if(stopping)return;stopping=true;clearInterval(pollTimer);clearInterval(sendTimer);server.close();while(polling||sending)await new Promise(r=>setTimeout(r,100));store.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
