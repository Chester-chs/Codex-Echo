import {parseBarkKey,digest} from '../web/bark.mjs';
// Explicitly interactive: no device address in process arguments, files or console output.
if(!process.stdin.isTTY||!process.stdin.setRawMode)throw new Error('Run in an interactive terminal. No notifications were sent.');
process.stdout.write('This sends TWO labelled test notifications to your own device.\nPaste your Bark address (hidden), then press Enter. Ctrl+C cancels: ');
const address=await new Promise((resolve,reject)=>{
 let input='';process.stdin.setEncoding('utf8');process.stdin.setRawMode(true);process.stdin.resume();
 function finish(){process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');}
 function onData(chunk){for(const c of chunk){if(c==='\u0003'){finish();reject(new Error('Cancelled; no notifications sent.'));return;}if(c==='\r'||c==='\n'){finish();resolve(input);return;}if(c==='\u007f'||c==='\b')input=input.slice(0,-1);else if(c>=' ')input+=c;if(input.length>512){finish();reject(new Error('Input too long; no notifications sent.'));return;}}}
 process.stdin.on('data',onData);
});
const device_key=parseBarkKey(address),stamp=new Date().toISOString(),id=(await digest('collapse-test:'+stamp)).slice(0,32);
for(let n=1;n<=2;n++){
 if(n===2)await new Promise(r=>setTimeout(r,5000));
 const response=await fetch('https://api.day.app/push',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_key,id,title:'Codex Echo · Collapse test '+stamp,body:`TEST ${n}/2. Same collapse id. No reset occurred. Check your iPhone Lock Screen and Bark history.`,group:'Codex Echo tests',sound:'bell',level:'active'}),signal:AbortSignal.timeout(10000)});
 let data;try{data=await response.json();}catch{}
 if(!response.ok||data?.code!==200)throw new Error('Test request was not accepted; stopping without retry.');
 console.log(`Test ${n}/2 accepted by Bark. Device receipt must be checked on your phone.`);
}
