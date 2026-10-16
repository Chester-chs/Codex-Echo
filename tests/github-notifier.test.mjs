import test from 'node:test';
import assert from 'node:assert/strict';

let api;
try { api = await import('../scripts/github-notifier.mjs'); } catch {}
test('personal GitHub notifier is available', () => assert.ok(api?.runPersonalNotifier, 'The personal notifier has not been implemented'));
const now = Date.parse('2026-10-16T12:00:00Z');
const env = {BARK_DEVICE_KEY:'qa-personal-device-key',BARK_RESET_ALERTS:'true',BARK_FORECAST_ALERTS:'true',BARK_THRESHOLD:'60',BARK_LANGUAGE:'zh'};
const post = id => ({id,category:'reset',resetType:'automatic',original:'Public reset announcement',postedAt:new Date(now+1000).toISOString(),url:'https://x.com/thsottiaux/status/'+id});
const forecast = probability => ({id:'watch-personal',kind:'source-watch',probability,basis:'Public assessment',windowText:'within 24h',sourceUrl:'https://x.com/thsottiaux/status/99',publishedAt:new Date(now+1000).toISOString(),checkedAt:new Date(now+1000).toISOString(),sourceFreshUntil:new Date(now+1800000).toISOString(),validUntil:new Date(now+3600000).toISOString()});
const feed = (records=[],f=null) => ({records,forecast:f,sources:[{status:'ok',lastSuccessAt:new Date(now).toISOString()}]});
function remote() { let value=null;const saves=[];return {saves,load:async()=>structuredClone(value),save:async next=>{value=structuredClone(next);saves.push(structuredClone(next));},get value(){return value;}}; }
const options = () => ({skip:!api});

test('first run establishes a baseline and later runs send a reset and qualifying forecast once', options(), async()=>{
 const storage=remote(),sent=[];const send=async job=>{sent.push(job);return {state:'sent',code:'provider_accepted'};};
 await api.runPersonalNotifier({env,storage,feed:feed([post('1')]),now,send});
 assert.equal(sent.length,0);
 await api.runPersonalNotifier({env,storage,feed:feed([post('2')],forecast(70)),now:now+2000,send});
 assert.deepEqual(sent.map(j=>j.kind).sort(),['forecast','reset']);
 await api.runPersonalNotifier({env,storage,feed:feed([post('2')],forecast(70)),now:now+3000,send});
 assert.equal(sent.length,2);assert.ok(!JSON.stringify(storage.value).includes(env.BARK_DEVICE_KEY));
 const saves=storage.saves.length;
 await api.runPersonalNotifier({env,storage,feed:feed([post('2')],forecast(70)),now:now+4000,send});
 assert.equal(storage.saves.length,saves,'An idle run must not create a repository commit');
});

test('GitHub state is durable before an external notification is attempted', options(), async()=>{
 const storage=remote();await api.runPersonalNotifier({env,storage,feed:feed(),now});
 let sent=0;
 await api.runPersonalNotifier({env,storage,feed:feed([post('3')]),now:now+2000,send:async()=>{
  assert.equal(storage.value.events.find(r=>r.event_key==='reset:3').state,'sending');sent++;return {state:'sent',code:'provider_accepted'};
 }});
 assert.equal(sent,1);assert.equal(storage.value.events[0].state,'sent');
});

test('a failed state write prevents sending and interrupted delivery is not repeated', options(), async()=>{
 const storage=remote();await api.runPersonalNotifier({env,storage,feed:feed(),now});
 const save=storage.save;let sent=0;
 storage.save=async()=>{throw new Error('Repository write unavailable');};
 await assert.rejects(api.runPersonalNotifier({env,storage,feed:feed([post('4')]),now:now+2000,send:async()=>{sent++;return {state:'sent'};}}));
 assert.equal(sent,0);storage.save=save;
 await api.runPersonalNotifier({env,storage,feed:feed([post('4')]),now:now+3000,send:async()=>{
  storage.save=async()=>{throw new Error('Final write interrupted');};sent++;return {state:'sent'};
 }}).catch(()=>{});
 assert.equal(sent,1);assert.equal(storage.value.events.find(r=>r.event_key==='reset:4').state,'sending');
 storage.save=save;
 await api.runPersonalNotifier({env,storage,feed:feed([post('4')]),now:now+600000,send:async()=>{sent++;return {state:'sent'};}});
 assert.equal(sent,1);assert.equal(storage.value.events.find(r=>r.event_key==='reset:4').state,'unknown');
});

test('personal settings disable reset alerts and reject forecasts below the selected threshold', options(), async()=>{
 const storage=remote(),sent=[],settings={...env,BARK_RESET_ALERTS:'false',BARK_THRESHOLD:'80',BARK_LANGUAGE:'en'};
 const send=async job=>{sent.push(job);return {state:'sent',code:'provider_accepted'};};
 await api.runPersonalNotifier({env:settings,storage,feed:feed(),now,send});
 await api.runPersonalNotifier({env:settings,storage,feed:feed([post('5')],forecast(70)),now:now+2000,send});
 assert.equal(sent.length,0);
 await api.runPersonalNotifier({env:settings,storage,feed:feed([post('5')],forecast(85)),now:now+3000,send});
 assert.deepEqual(sent.map(j=>j.kind),['forecast']);
 for(const invalid of [{BARK_THRESHOLD:'abc'},{BARK_LANGUAGE:'fr'},{BARK_RESET_ALERTS:'maybe'},{BARK_DAILY_LIMIT:'0'}])assert.throws(()=>api.readPersonalSettings({...env,...invalid}));
});

test('manual tests require an explicit unique request and stale feeds do not trigger automatic alerts', options(), async()=>{
 const storage=remote(),sent=[];const send=async job=>{sent.push(job);return {state:'sent',code:'provider_accepted'};};
 await api.runPersonalNotifier({env,storage,feed:feed(),now,send});
 await api.runPersonalNotifier({env,storage,feed:{...feed([post('6')]),sources:[]},now:now+2000,send});
 assert.equal(sent.length,0);
 await api.runPersonalNotifier({env,storage,feed:feed(),now:now+3000,send,testId:'manual-1234'});
 await api.runPersonalNotifier({env,storage,feed:feed(),now:now+4000,send,testId:'manual-1234'});
 assert.deepEqual(sent.map(j=>j.kind),['test']);
});

test('forecast expiry during a durable GitHub state write blocks the provider call', options(), async()=>{
 const storage=remote();let clock=now;
 const realNow=Date.now;Date.now=()=>clock;
 try{
 await api.runPersonalNotifier({env,storage,feed:feed()});
 const save=storage.save;storage.save=async value=>{await save(value);if(value.events.some(r=>r.state==='sending'))clock+=10000;};
 let sent=0;clock=now+2000;
 await api.runPersonalNotifier({env,storage,feed:feed([], {...forecast(70),validUntil:new Date(now+5000).toISOString()}),send:async()=>{sent++;return {state:'sent'};}});
 assert.equal(sent,0);assert.equal(storage.value.events.find(r=>r.kind==='forecast').code,'expired_before_dispatch');
 }finally{Date.now=realNow;}
});

test('GitHub store fences state updates with SHA and never puts credentials into the saved document', options(), async()=>{
 const calls=[];let doc=null,sha;
 const fetcher=async(url,init={})=>{
  calls.push({url,init});assert.ok(url.startsWith('https://api.github.com/repos/test-owner/echo-radar/'));
  if(init.method==='PUT') {const body=JSON.parse(init.body);assert.equal(body.branch,'echo-notifier-state');assert.equal(body.sha,sha);doc=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));sha='a'.repeat(40);return Response.json({content:{sha}});}
  if(init.method==='POST')return Response.json({}, {status:201});
  if(doc)return Response.json({sha,encoding:'base64',content:Buffer.from(JSON.stringify(doc)).toString('base64')});
  return Response.json({}, {status:404});
 };
 const store=new api.GitHubStateStore({repository:'test-owner/echo-radar',token:'test-github-token',commit:'b'.repeat(40),fetcher});
 assert.equal(await store.load(),null);
 await store.save({version:1,controls:[],events:[],daily:[]});
 await store.save({version:1,controls:[],events:[],daily:[{recipient:'anonymous',day:'2026-10-16',attempts:1}]});
 assert.ok(!JSON.stringify(doc).includes('test-github-token'));
 assert.equal(calls.filter(c=>c.init.method==='PUT').length,2);
});

test('corrupt state or a missing state file on an existing branch fails closed', options(), async()=>{
 const storage=remote();await storage.save({version:999,controls:[],events:[],daily:[]});
 await assert.rejects(api.runPersonalNotifier({env,storage,feed:feed(),now}));
 const store=new api.GitHubStateStore({repository:'test-owner/echo-radar',token:'test-token',commit:'b'.repeat(40),fetcher:async url=>url.includes('/contents/')?Response.json({},{status:404}):Response.json({ref:'refs/heads/echo-notifier-state'})});
 await assert.rejects(store.load());
});
