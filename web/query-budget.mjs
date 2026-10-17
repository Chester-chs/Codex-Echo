export function countingDb(database,limit=48){
 if(database.queryBudget)return database;
 const raw=new WeakMap();
 const budget={used:0,limit,get remaining(){return this.limit-this.used;},reserve(n){return this.remaining>=n;}};
 function take(count){if(!budget.reserve(count))throw Object.assign(new Error('D1 query budget exhausted'),{code:'query_budget'});budget.used+=count;}
 return {queryBudget:budget,prepare(sql){const wrap=statement=>{const proxy={bind(...args){return wrap(statement.bind(...args));},...Object.fromEntries(['run','first','all','raw'].map(method=>[method,async(...args)=>{take(1);return statement[method](...args);}]))};raw.set(proxy,statement);return proxy;};return wrap(database.prepare(sql));},async batch(statements){take(statements.length);return database.batch(statements.map(s=>raw.get(s)));}};
}
