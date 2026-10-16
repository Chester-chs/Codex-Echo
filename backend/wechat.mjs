import {formatTime} from '../src/lib/domain.mjs';
const cut=(text,n)=>[...String(text)].slice(0,n).join('');
export function validateTemplates(templates={}) {
 for(const [kind,t] of Object.entries(templates)){
  if(!['reset','forecast'].includes(kind)||typeof t.id!=='string'||!t.id||!t.fields||!Object.keys(t.fields).length)throw new Error('Invalid WeChat template configuration');
  for(const [key,value] of Object.entries(t.fields))if(!/^(thing|time|number|phrase|character_string)\d+$/.test(key)||!['title','time','summary','probability','type'].includes(value))throw new Error('Invalid WeChat template field mapping');
 }
 return templates;
}
export function templateMessage(job,config) {
 const template=config.templates[job.kind];if(!template?.id)throw new Error('Template not configured');
 const en=job.preferences.language==='en',f=job.event;
 const title=job.kind==='forecast'?(en?'Reset forecast':'重置预测提醒'):(en?'New reset signal':'新的重置信号');
 const type=f.resetType==='banked'?(en?'Banked reset':'储备重置'):(en?'Global reset':'全局重置');
 const values={title,type,summary:job.kind==='forecast'?`${f.probability}% · ${f.windowText||''}`:f.original||type,probability:String(f.probability??0),time:formatTime(f.postedAt||f.publishedAt,'en',job.preferences.zone).replaceAll('/','-')};
 const data={};for(const [key,field] of Object.entries(template.fields)){
  const value=values[field];
  data[key]={value:key.startsWith('thing')?cut(value,20):key.startsWith('phrase')?cut(value,5):key.startsWith('character_string')?cut(value.replace(/[^a-zA-Z0-9_\-]/g,''),32):value};
 }
 return {touser:job.openid,template_id:template.id,page:`pages/index/index?${job.kind==='forecast'?'forecast=1':'record='+encodeURIComponent(f.id)}`,data,miniprogram_state:config.state||'trial',lang:en?'en_US':'zh_CN'};
}
export function createWeChat(config,fetcher=fetch) {
 validateTemplates(config.templates);
 let cached=null,pending=null;
 const enabled=Boolean(config.appId&&config.appSecret);
 const request=async(url,body)=>{
  const r=await fetcher(url,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!r.ok)throw new Error('WeChat transport failure');return r.json();
 };
 async function accessToken(){
  if(cached&&cached.expires>Date.now())return cached.token;
  if(pending)return pending;
  pending=(async()=>{const value=await request('https://api.weixin.qq.com/cgi-bin/stable_token',{grant_type:'client_credential',appid:config.appId,secret:config.appSecret,force_refresh:false});
   if(!value.access_token||!Number.isFinite(value.expires_in))throw new Error('Access token unavailable');
   cached={token:value.access_token,expires:Date.now()+Math.max(0,value.expires_in-300)*1000};return cached.token;})();
  try{return await pending;}finally{pending=null;}
 }
 return {
  enabled,
  ready:enabled&&Boolean(config.templates.reset&&config.templates.forecast),
  templateIds:Object.fromEntries(Object.entries(config.templates).map(([kind,t])=>[kind,t.id])),
  async login(code){
   if(!enabled)throw Object.assign(new Error('WeChat not configured'),{status:503});
   const query=new URLSearchParams({appid:config.appId,secret:config.appSecret,js_code:code,grant_type:'authorization_code'});
   const value=await request('https://api.weixin.qq.com/sns/jscode2session?'+query);
   if(value.errcode||typeof value.openid!=='string'||!value.openid)throw Object.assign(new Error('WeChat login rejected'),{status:401});
   return {openid:value.openid};
  },
  async send(job){
   if(!enabled)return {state:'failed',code:'not_configured'};
   let payload;try{payload=templateMessage(job,config);}catch{return {state:'failed',code:'template_not_configured'};}
   for(let attempt=0;attempt<2;attempt++){
    let token;try{token=await accessToken();}catch{return {state:'retry',code:'access_token_unavailable'};}
    if(job.kind==='forecast'&&(Date.parse(job.event.validUntil)<=Date.now()||Date.parse(job.event.sourceFreshUntil)<=Date.now()))return {state:'cancelled',code:'expired_before_send'};
    let result;try{result=await request('https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token='+encodeURIComponent(token),payload);}catch{return {state:'unknown',code:'transport_uncertain'};}
    if(result.errcode===0)return {state:'sent',code:0};
    if([40001,40014,42001].includes(result.errcode)&&attempt===0){cached=null;continue;}
    if([43101,40003].includes(result.errcode))return {state:'denied',code:result.errcode};
    if(result.errcode===-1)return {state:'retry',code:-1};
    return {state:typeof result.errcode==='number'?'failed':'unknown',code:result.errcode??'invalid_response'};
   }
  }
 };
}
