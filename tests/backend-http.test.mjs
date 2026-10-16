import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../backend/store.mjs';
import {createApi} from '../backend/http.mjs';
test('HTTP API authenticates identity, rejects recipient injection and isolates delivery history',async(t)=>{
 const store=createStore(':memory:');
 const gateway={enabled:true,ready:true,templateIds:{reset:'r',forecast:'f'},login:async code=>({openid:code==='alice-code'?'alice':'bob'})};
 const server=createApi({store,gateway}); await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>{server.close();store.close();});const base=`http://127.0.0.1:${server.address().port}`;
 const call=(path,method='GET',data,token)=>fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
 assert.equal((await call('/api/subscriptions')).status,401);
 const auth=await(await call('/api/auth/wechat','POST',{code:'alice-code'})).json();
 assert.ok(auth.token);assert.equal(auth.openid,undefined);assert.equal(auth.session_key,undefined);
 assert.equal((await call('/api/subscriptions','POST',{openid:'bob',requestId:'receipt-123456789',settings:{resetAlerts:true},grants:{reset:true}},auth.token)).status,400);
 assert.equal((await call('/api/subscriptions','POST',{requestId:'receipt-123456789',settings:{resetAlerts:true},grants:{reset:true}},auth.token)).status,200);
 assert.equal(store.subscription('bob'),null);
 assert.equal((await call('/api/subscriptions','DELETE',undefined,auth.token)).status,200);
 assert.equal((await call('/api/deliveries','GET',undefined,auth.token)).status,401);
});
