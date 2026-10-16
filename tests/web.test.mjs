import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebMonitor,canUsePageNotifications} from '../src/lib/web-alerts.mjs';
import {handleRequest,syncPublic} from '../web/worker.mjs';
const now=Date.parse('2026-10-16T12:00:00Z');
const record={id:'2110951585983631505',type:'automatic',category:'reset',resetType:'automatic',postedAt:new Date(now).toISOString(),url:'https://x.com/thsottiaux/status/2110951585983631505',original:'Complete announcement'};
const forecast={id:'watch-1',kind:'source-watch',sourceUrl:record.url,basis:'Source assessment',windowText:'within 24h',checkedAt:new Date(now).toISOString(),probability:70,publishedAt:new Date(now-1000).toISOString(),validUntil:new Date(now+3600000).toISOString(),sourceFreshUntil:new Date(now+1800000).toISOString()};
const settings={resetAlerts:true,forecastAlerts:true,threshold:60};

test('foreground notification controls do not promise unsupported mobile delivery',()=>{
 const environment={secure:true,notification:function Notification(){},userAgent:'Desktop browser'};
 assert.equal(canUsePageNotifications(environment),true);
 for(const userAgent of ['iPhone','iPad','Android'])assert.equal(canUsePageNotifications({...environment,userAgent}),false);
 assert.equal(canUsePageNotifications({...environment,platform:'MacIntel',maxTouchPoints:5}),false);
 assert.equal(canUsePageNotifications({...environment,secure:false}),false);
 assert.equal(canUsePageNotifications({...environment,notification:null}),false);
});
test('web alerts baseline existing records, honor thresholds and never alert from stale or demo data',()=>{
 const monitor=createWebMonitor();const feed={records:[record],forecast:null};
 assert.deepEqual(monitor.check(feed,settings,'live',now),[]);
 const fresh={...feed,records:[record,{...record,id:'new'}],forecast};
 assert.deepEqual(monitor.check(fresh,settings,'cached',now),[]);
 assert.deepEqual(monitor.check(fresh,settings,'demo',now),[]);
 assert.deepEqual(monitor.check(fresh,settings,'live',now).map(x=>x.kind),['reset','forecast']);
 assert.deepEqual(monitor.check(fresh,settings,'live',now),[]);
});
test('web alerts reject expired forecasts and allow later threshold crossing',()=>{
 const monitor=createWebMonitor();monitor.check({records:[]},settings,'live',now);
 assert.deepEqual(monitor.check({records:[],forecast:{...forecast,probability:40}},settings,'live',now),[]);
 assert.equal(monitor.check({records:[],forecast},settings,'live',now).length,1);
 assert.deepEqual(createWebMonitor().check({records:[],forecast},settings,'live',now+3600001),[]);
});
function kv(initial){let data=initial,writes=0;return {get:async()=>data,put:async(key,value)=>{data=JSON.parse(value);writes++;},get data(){return data;},get writes(){return writes;}};}
test('public web API exposes read-only public data and marks old snapshots stale',async()=>{
 const RADAR=kv({records:[record],sources:[],history:[forecast]});const env={RADAR};
 const response=await handleRequest(new Request('https://radar.test/api/feed'),env,{},now);
 const data=await response.json();assert.equal(data.resets[0].original,record.original);assert.equal(data.status,'stale');assert.equal(data.forecast,null);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
 assert.equal((await handleRequest(new Request('https://radar.test/api/sync',{method:'POST'}),env,{},now)).status,405);
 assert.equal((await handleRequest(new Request('https://radar.test/api/subscriptions'),env,{},now)).status,404);
 assert.equal(RADAR.writes,0);
});

test('future source check timestamps cannot mark old data live',async()=>{
 const RADAR=kv({records:[record],sources:[{name:'history',status:'ok',lastSuccessAt:new Date(now+86400000).toISOString()}]});
 const data=await (await handleRequest(new Request('https://radar.test/api/feed'),{RADAR},{},now)).json();
 assert.equal(data.status,'stale');assert.equal(data.forecast,null);
});

test('forecast history deduplicates equivalent timestamp formats but keeps changed assessments',async()=>{
 const base={...forecast,savedAt:new Date(now).toISOString()};
 const RADAR=kv({records:[],sources:[],history:[base,{...base,publishedAt:base.publishedAt.replace('.000Z','Z'),validUntil:base.validUntil.replace('.000Z','Z'),basisZh:'译文',savedAt:new Date(now-1000).toISOString()},{...base,probability:60}]});
 const data=await (await handleRequest(new Request('https://radar.test/api/forecasts'),{RADAR},{},now)).json();
 assert.deepEqual(data.forecasts.map(f=>f.probability),[70,60]);
});
test('scheduled collection keeps full originals on upstream failure and writes one snapshot',async()=>{
 const RADAR=kv({records:[record],history:[],sources:[],baseline:now});
 await syncPublic({RADAR},{now,collect:async()=>({records:[],sources:[{name:'history',status:'error',checkedAt:new Date(now).toISOString()}],checkedAt:new Date(now).toISOString()}),enrich:async r=>r});
 assert.equal(RADAR.data.records[0].original,record.original);assert.equal(RADAR.writes,1);
});
test('history backfill retries after initial source failure and stops after complete success',async()=>{
 const RADAR=kv(null),backfills=[];let success=false;
 const collect=async options=>{backfills.push(options.backfill);return {records:[],checkedAt:new Date(now).toISOString(),sources:['history','timeline'].map(name=>({name,status:success?'ok':'error',checkedAt:new Date(now).toISOString()}))};};
 await syncPublic({RADAR},{now,collect});success=true;
 await syncPublic({RADAR},{now:now+600000,collect});await syncPublic({RADAR},{now:now+1200000,collect});
 assert.deepEqual(backfills,[true,true,false]);
});
test('forecast and posts share a bounded translation budget and localization creates no extra forecast revisions',async()=>{
 const RADAR=kv(null),calls=[];
 const records=Array.from({length:4},(_,i)=>({...record,id:String(i),category:'post',original:'Unique public text '+i,textStatus:'verified'}));
 const collect=async()=>({records,forecast,sources:['history','timeline'].map(name=>({name,status:'ok',checkedAt:new Date(now).toISOString()})),checkedAt:new Date(now).toISOString()});
 const translate=async text=>{calls.push(text);return '中文译文';};
 await syncPublic({RADAR,ENABLE_TRANSLATION:'true'},{now,collect,translate});
 assert.equal(calls.length,3);assert.equal(RADAR.data.forecast.basisZh,'中文译文');assert.equal(RADAR.data.history.length,1);
 await syncPublic({RADAR,ENABLE_TRANSLATION:'true'},{now:now+600000,collect,translate});
 assert.equal(RADAR.data.history.length,1);assert.equal(calls.filter(text=>text===forecast.basis).length,1);
 assert.ok(RADAR.data.records.every(r=>r.translation==='中文译文'));assert.equal(RADAR.data.records[0].original,'Unique public text 0');
});
