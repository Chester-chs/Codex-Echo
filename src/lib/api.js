import {config} from '../config';
const key=()=>`pulse:session:${config.cloudEnv||config.apiBase}`;
let cloudReady=false;
async function cloudRequest(path,method,data){
 if(!cloudReady){wx.cloud.init({env:config.cloudEnv,traceUser:false});cloudReady=true;}
 const {result}=await wx.cloud.callFunction({name:config.cloudFunction,data:{path,method,data:data||{}},config:{env:config.cloudEnv}});
 if(!result||result.statusCode<200||result.statusCode>=300){if(result?.statusCode===401)clearSession();throw new Error(result?.data?.error||'Cloud request failed');}
 return result.data;
}
export function api(path,method='GET',data,authenticated=false) {
 // #ifdef MP-WEIXIN
 if(config.cloudEnv)return cloudRequest(path,method,data);
 // #endif
 return new Promise((resolve,reject)=>{
  if(!config.apiBase)return reject(new Error('API not configured'));
  const token=uni.getStorageSync(key());
  uni.request({url:config.apiBase+path,method,data,timeout:15000,header:{'content-type':'application/json',...(authenticated&&token?{Authorization:'Bearer '+token}:{})},success:r=>{
   if(r.statusCode===401)uni.removeStorageSync(key());
   if(r.statusCode>=200&&r.statusCode<300)resolve(r.data);else reject(new Error(r.data?.error||'Request failed'));
  },fail:reject});
 });
}
export async function login(){
 // #ifdef MP-WEIXIN
 if(config.cloudEnv){await api('/auth/wechat','POST');uni.setStorageSync(key(),true);return;}
 // #endif
 const code=await new Promise((resolve,reject)=>uni.login({provider:'weixin',success:r=>resolve(r.code),fail:reject}));
 const result=await api('/auth/wechat','POST',{code});uni.setStorageSync(key(),result.token);
}
export function hasSession(){return Boolean(uni.getStorageSync(key()));}
export function clearSession(){uni.removeStorageSync(key());}
