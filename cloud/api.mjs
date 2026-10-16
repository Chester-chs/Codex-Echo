import {subscribeUser,preferencesUser,viewUser,publicFeed} from './state.mjs';
import {userKey} from './database.mjs';
export async function handleApi({repo,identity,templates,event,now=Date.now()}){
 const reply=(statusCode,data)=>({statusCode,data});
 try{
  if(!identity?.OPENID||!identity?.APPID)throw Object.assign(new Error('WeChat identity required'),{status:401});
  if(!event||Buffer.byteLength(JSON.stringify(event))>16384)throw Object.assign(new Error('Invalid request'),{status:400});
  const {path,method='GET',data={}}=event;
  const id='user:'+userKey(identity.OPENID);
  if(path==='/feed'&&method==='GET')return reply(200,publicFeed(await repo.read('public'),now));
  if(path==='/forecasts'&&method==='GET')return reply(200,{forecasts:(await repo.read('public'))?.history||[]});
  if(path==='/status'&&method==='GET')return reply(200,{wechat:{configured:true,ready:Boolean(templates.reset&&templates.forecast),templateIds:Object.fromEntries(Object.entries(templates).map(([k,t])=>[k,t.id]))},pollSeconds:600});
  if(path==='/auth/wechat'&&method==='POST')return reply(200,{authenticated:true});
  if(path==='/deliveries'&&method==='GET')return reply(200,{deliveries:((await repo.read(id))?.jobs||[]).slice().sort((a,b)=>b.created-a.created).slice(0,50).map(({id,kind,state,attempts,created,updated,code})=>({id,kind,state,attempts,code,createdAt:new Date(created).toISOString(),updatedAt:new Date(updated).toISOString()}))});
  if(path==='/subscriptions'){
   if(method==='GET')return reply(200,{subscription:viewUser(await repo.read(id))});
   if(method==='DELETE'){await repo.change(id,()=>({value:null}));return reply(200,{deleted:true});}
   if(method==='POST'||method==='PUT'){
    if(data.openid||data.touser||!data.settings||Array.isArray(data.settings)||typeof data.settings!=='object')throw Object.assign(new Error('Invalid subscription'),{status:400});
    if(method==='POST'&&(!/^[a-zA-Z0-9_-]{16,100}$/.test(data.requestId||'')||!data.grants))throw Object.assign(new Error('Invalid consent receipt'),{status:400});
    const subscription=await repo.change(id,old=>{
     const grants={reset:data.grants?.reset===true&&Boolean(templates.reset),forecast:data.grants?.forecast===true&&Boolean(templates.forecast)};
     const value=method==='POST'?subscribeUser(old,data.settings,grants,data.requestId,now):preferencesUser(old,data.settings,now);
     if(value){value.openid=identity.OPENID;value.appid=identity.APPID;}
     return {value,result:viewUser(value)};
    });
    return reply(200,{subscription});
   }
  }
  return reply(404,{error:'Not found'});
 }catch(e){return reply(e.status||503,{error:e.status?e.message:'Cloud service temporarily unavailable'});}
}
