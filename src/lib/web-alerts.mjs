import {getForecast} from './domain.mjs';

// This implementation uses desktop foreground notifications, not a mobile push service.
export function canUsePageNotifications({secure=false,notification=null,userAgent='',platform='',maxTouchPoints=0}={}) {
 return secure&&typeof notification==='function'&&!/iPhone|iPad|iPod|Android/i.test(userAgent)&&!(platform==='MacIntel'&&maxTouchPoints>1);
}

// A local, foreground-only monitor. A new session starts with a silent baseline.
export function createWebMonitor() {
 let initialized=false;
 const seen=new Set(),forecastSeen=new Set();
 return {check(feed,settings,mode,now=Date.now()) {
  if(!['live','degraded'].includes(mode))return [];
  const notices=[];
  for(const r of feed.records||[]) {
   const key=r.id+':'+r.type;
   if(initialized&&!seen.has(key)&&settings.resetAlerts&&['automatic','banked'].includes(r.type)&&Date.parse(r.postedAt)<=now&&now-Date.parse(r.postedAt)<6*3600000)notices.push({kind:'reset',record:r,key});
   seen.add(key);
  }
  const forecast=getForecast(feed.forecast,now);
  if(forecast&&forecast.probability>=settings.threshold&&settings.forecastAlerts) {
   const key=feed.forecast.id;
   if(initialized&&!forecastSeen.has(key))notices.push({kind:'forecast',forecast,key});
   forecastSeen.add(key);
  }
  initialized=true;
  return notices;
 }};
}
