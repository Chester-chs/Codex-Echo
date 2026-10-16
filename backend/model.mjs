const HOUR=3600000;
export function conditionalForecast(revisions,cutoff=Date.now()) {
 const latest=new Map();
 for(const r of revisions){const seen=Date.parse(r.firstSeenAt);if(!Number.isFinite(seen)||seen>cutoff)continue;const old=latest.get(r.id);if(!old||seen>Date.parse(old.firstSeenAt))latest.set(r.id,r);}
 const times=[...new Set([...latest.values()].filter(r=>r.resetType==='automatic'&&r.resetAt).map(r=>Date.parse(r.resetAt)).filter(t=>Number.isFinite(t)&&t<=cutoff))].sort((a,b)=>a-b);
 const intervals=times.slice(1).map((v,i)=>v-times[i]),elapsed=cutoff-times.at(-1),comparable=intervals.filter(v=>v>elapsed);
 const base={version:'conditional-intervals-v1',published:false,samples:intervals.length,comparable:comparable.length,cutoff:new Date(cutoff).toISOString(),diagnostics:[]};
 if(times.length&&elapsed<HOUR)return {...base,reason:'cooldown'};
 if(intervals.length<20)return {...base,reason:'insufficient-completed-events'};
 if(comparable.length<10)return {...base,reason:'insufficient-comparable-events'};
 return {...base,reason:'review-required',diagnostics:[24,48,72].map(hours=>({hours,probability:Math.round(100*comparable.filter(v=>v<=elapsed+hours*HOUR).length/comparable.length)}))};
}
