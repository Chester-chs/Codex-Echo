const STORAGE='echo:bark:management:v1';
export function createVisitorBarkClient({base='https://pulse-radar-api.chqua75.workers.dev/api',storage,fetcher=fetch}={}){
 let token='',persistent=true;try{token=storage?.getItem(STORAGE)||'';}catch{}
 async function request(path='',method='GET',data){
  const requestToken=token;
  let response;try{response=await fetcher(base+'/bark/subscription'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});}catch{throw Object.assign(new Error('network'),{code:'network'});}
  let result;try{result=await response.json();}catch{throw Object.assign(new Error('unavailable'),{code:'unavailable'});}
  if(!response.ok){if(response.status===401&&requestToken===token){token='';try{storage?.removeItem(STORAGE);}catch{}}throw Object.assign(new Error(result.error||'unavailable'),{code:result.error||'unavailable'});}return result;
 }
 return {
  hasSession:()=>Boolean(token),isPersistent:()=>persistent,
  async load(){return token?request():null;},
  async bind(deviceAddress,settings,requestId){const result=await request('','POST',{deviceAddress,settings,requestId,consentVersion:'bark-v1'});token=result.token;try{storage?.setItem(STORAGE,token);}catch{persistent=false;}const {token:secret,...safe}=result;return safe;},
  save:(settings,version)=>request('','PATCH',{settings,version}),
  test:requestId=>request('/test','POST',{requestId}),
  async unsubscribe(){const result=await request('','DELETE');token='';try{storage?.removeItem(STORAGE);}catch{}return result;}
 };
}
