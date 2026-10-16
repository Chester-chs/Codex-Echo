import {templateMessage} from '../backend/wechat.mjs';
import {active} from './state.mjs';
export function cloudGateway(cloud,templates,state='trial',appId){
 return {async send(job){
  let message;try{message=templateMessage(job,{templates,state});}catch{return {state:'failed',code:'template_not_configured'};}
  if(job.kind==='forecast'&&!active(job.event,Date.now()))return {state:'cancelled',code:'expired_before_send'};
  const {template_id,miniprogram_state,...rest}=message;
  try{
   const result=await cloud.openapi({appid:appId}).subscribeMessage.send({...rest,templateId:template_id,miniprogramState:miniprogram_state});
   const code=result.errCode??result.errcode;
   return code===0?{state:'sent',code:0}:classify(code);
  }catch(e){return classify(e.errCode??e.errcode);}
 }};
}
function classify(code){
 if([43101,40003].includes(code))return {state:'denied',code};
 if(code===-1)return {state:'retry',code};
 // Cloud SDK transport failures often have negative SDK codes, not a definitive WeChat rejection.
 return typeof code==='number'&&code>0?{state:'failed',code}:{state:'unknown',code:code??'transport_uncertain'};
}
