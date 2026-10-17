import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function redirect(href,legacyOrigin='https://legacy.example.test'){
 const script=html.match(/<script data-canonical-redirect>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'The old website needs a canonical redirect');
 const source=new URL(href),destinations=[];
 const window={location:{origin:source.origin,pathname:source.pathname,search:source.search,hash:source.hash,replace:value=>destinations.push(value)}};
 Object.defineProperty(window,'localStorage',{get(){throw Error('Subscription credentials must not be read or transferred');}});
 const document={documentElement:{getAttribute:name=>name==='data-legacy-origin'?legacyOrigin:null}};
 runInNewContext(script,{window,document,URL});
 return destinations;
}

test('the old public origin forwards to the short website',()=>{
 assert.deepEqual(redirect('https://legacy.example.test/'),['https://echo-radar.pages.dev/']);
});
test('the short website and local previews never redirect or loop',()=>{
 for(const url of ['https://echo-radar.pages.dev/','http://127.0.0.1:4174/','https://unrelated.example/'])assert.deepEqual(redirect(url),[]);
});
test('public post, forecast and section links keep their destination',()=>{
 for(const suffix of ['?lang=en#/pages/index/index?record=2117536046041595911','#/pages/index/index?forecast=1','#bark-cloud-alerts'])assert.deepEqual(redirect('https://legacy.example.test/'+suffix),['https://echo-radar.pages.dev/'+suffix]);
});
test('even a double-slash path cannot change the fixed destination origin',()=>{
 const [result]=redirect('https://legacy.example.test//unrelated.example/path');
 assert.equal(new URL(result).origin,'https://echo-radar.pages.dev');
});
test('the public template does not redirect without a deployment-only legacy origin',()=>{
 assert.deepEqual(redirect('https://legacy.example.test/',null),[]);
});
