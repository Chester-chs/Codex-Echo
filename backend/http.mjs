import {createServer} from 'node:http';
const fail=(status,message)=>Object.assign(new Error(message),{status});
async function body(req){
 if(!(req.headers['content-type']||'').startsWith('application/json'))throw fail(415,'JSON required');
 let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw fail(413,'Request too large');text+=chunk.toString('utf8');}
 try{const data=JSON.parse(text);if(!data||Array.isArray(data)||typeof data!=='object')throw 0;return data;}catch{throw fail(400,'Invalid JSON');}
}
export function createApi({store,gateway,allowedOrigin='',trustProxy=false}) {
 const rates=new Map();
 return createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const reply=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value));};
  try{
   const origin=req.headers.origin;
   if(origin&&allowedOrigin&&origin===allowedOrigin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');}
   if(req.method==='OPTIONS'){reply(204,{});return;}
   const path=new URL(req.url,'http://localhost').pathname;
   if(req.method==='GET'&&path==='/healthz'){reply(200,{status:'ok'});return;}
   if(req.method==='GET'&&path==='/api/feed'){reply(200,store.feed());return;}
   if(req.method==='GET'&&path==='/api/forecasts'){reply(200,{forecasts:store.forecastHistory()});return;}
   if(req.method==='GET'&&path==='/api/status'){reply(200,{wechat:{configured:gateway.enabled,ready:gateway.ready,templateIds:gateway.templateIds},pollSeconds:300});return;}
   if(req.method==='POST'&&path==='/api/auth/wechat'){
    const ip=trustProxy?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0]:req.socket.remoteAddress;
    const now=Date.now();for(const [key,value] of rates)if(value.expires<now)rates.delete(key);
    const rate=rates.get(ip)||{count:0,expires:now+60000};if(++rate.count>10||rates.size>10000)throw fail(429,'Too many login attempts');rates.set(ip,rate);
    const data=await body(req);if(typeof data.code!=='string'||data.code.length<1||data.code.length>256)throw fail(400,'Invalid login code');
    const {openid}=await gateway.login(data.code);reply(200,{token:store.session(openid),expiresIn:604800});return;
   }
   const openid=store.authenticate(req.headers.authorization?.replace(/^Bearer /,''));
   if(!openid)throw fail(401,'Login required');
   if(path==='/api/deliveries'&&req.method==='GET'){reply(200,{deliveries:store.deliveries(openid)});return;}
   if(path==='/api/subscriptions'){
    if(req.method==='GET'){reply(200,{subscription:store.subscription(openid)});return;}
    if(req.method==='DELETE'){store.deleteAccount(openid);reply(200,{deleted:true});return;}
    if(req.method==='POST'||req.method==='PUT'){
     const data=await body(req);if(data.openid||data.touser||!data.settings||typeof data.settings!=='object')throw fail(400,'Invalid subscription');
     if(req.method==='PUT'){reply(200,{subscription:store.updatePreferences(openid,data.settings)});return;}
     if(typeof data.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(data.requestId)||!data.grants)throw fail(400,'Invalid consent receipt');
     const grants={reset:data.grants.reset===true&&Boolean(gateway.templateIds.reset),forecast:data.grants.forecast===true&&Boolean(gateway.templateIds.forecast)};
     reply(200,{subscription:store.subscribe(openid,data.settings,grants,data.requestId)});return;
    }
   }
   throw fail(404,'Not found');
  }catch(e){reply(e.status||502,{error:e.status?e.message:'Service temporarily unavailable'});}
 });
}
