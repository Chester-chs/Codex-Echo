import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as Vue from 'vue';
import * as domain from '../src/lib/domain.mjs';

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function harness({api,login=async()=>{},hasSession=()=>true}={}){
 const timers=new Map();let timer=0,authorization;
 const source=readFileSync(new URL('../src/pages/index/index.vue',import.meta.url),'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1];
 const stack=[true],lines=[];
 for(const line of source.split('\n')){
  const conditional=line.match(/\/\/ #(ifdef|ifndef) (\S+)/);if(conditional){const matches=conditional[2]==='MP-WEIXIN';stack.push(stack.at(-1)&&(conditional[1]==='ifdef'?matches:!matches));continue;}
  if(line.includes('// #endif')){stack.pop();continue;}if(stack.at(-1))lines.push(line);
 }
 const script=lines.join('\n').replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'];?/g,'');
 const deps={...Vue,...domain,config:{apiBase:'/api'},messages:{zh:{},en:{}},api,login,hasSession,clearSession:()=>{},fetchFeed:async()=>({feed:{records:[]},mode:'live'}),createDemo:()=>({resets:[]}),onLoad:()=>{},onShow:()=>{},onHide:()=>{},onMounted:()=>{},onUnmounted:()=>{},setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),uni:{getStorageSync:()=>({}),setStorageSync:()=>{},getWindowInfo:()=>({statusBarHeight:24}),requestSubscribeMessage:args=>{authorization=args.success({r:'accept'});},pageScrollTo:()=>{}}};
 const names=Object.keys(deps).filter(name=>/^[a-zA-Z_$][\w$]*$/.test(name)&&name!=='default');
 const component=new Function('deps',`const {${names.join(',')}}=deps;\n${script}\nreturn {settings,subscription,serverStatus,loadSubscription,authorize,removeSubscription};`)(deps);
 return {...component,timers,authorization:()=>authorization};
}
const status={wechat:{configured:true,templateIds:{reset:'r'}}};
const subscription={resetAlerts:true,forecastAlerts:false,language:'zh',zone:'Europe/London',threshold:60,resetCredits:1};
test('an edit made while service status loads cannot be replaced by stale subscription hydration',async()=>{
 const slow=deferred();const c=harness({api:async path=>path==='/status'?slow.promise:path==='/subscriptions'?{subscription}:{deliveries:[]}});
 c.settings.resetAlerts=true;c.subscription.value=subscription;await Vue.nextTick();
 const pending=c.loadSubscription();c.settings.resetAlerts=false;await Vue.nextTick();slow.resolve(status);await pending;
 assert.equal(c.settings.resetAlerts,false);assert.equal(c.timers.size,1);
});
test('authorization saves the latest preference after login and reconciles edits during save',async()=>{
 const slowLogin=deferred(),slowSave=deferred();const writes=[];
 const c=harness({hasSession:()=>false,login:()=>slowLogin.promise,api:async(path,method,data)=>{writes.push({method,data});return method==='POST'?slowSave.promise:{subscription:{...subscription,...data.settings}};}});
 c.serverStatus.value=status;c.settings.resetAlerts=true;c.authorize();c.settings.resetAlerts=false;await Vue.nextTick();slowLogin.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(writes[0].data.settings.resetAlerts,false);
 c.settings.language='en';await Vue.nextTick();slowSave.resolve({subscription});await c.authorization();
 assert.equal(writes[1].method,'PUT');assert.equal(writes[1].data.settings.language,'en');assert.equal(writes[1].data.settings.resetAlerts,false);
});
test('deleting an expired subscription can log in without requesting another notification grant',async()=>{
 let logins=0,deletes=0;
 const c=harness({hasSession:()=>false,login:async()=>{logins++;},api:async(path,method)=>{if(path==='/subscriptions'&&method==='DELETE')deletes++;return {deleted:true};}});
 await c.removeSubscription();assert.equal(logins,1);assert.equal(deletes,1);assert.equal(c.authorization(),undefined);
});
