const assert=require('node:assert/strict');const {launch,appUrl}=require('./browser');
/* 4.17.2: Test connection on the phone. A key is locked to the first URL it is used with;
   fixing a mistyped URL and testing again must move it, and a failed test must say why
   instead of a bare "HTTP 0". NazBridge / NazSecrets are mocked like the native ones. */
(async()=>{const b=await launch();try{
const page=await b.newPage({viewport:{width:390,height:844}});
await page.route('https://api.github.com/**',r=>r.abort());await page.route('https://raw.githubusercontent.com/**',r=>r.abort());
await page.addInitScript(()=>{
 const keys={},bound={};let n=0;window.__calls=[];
 window.NazSecrets={put:(ref,v)=>{keys[ref]=v;delete bound[ref];return true;},has:ref=>!!keys[ref],get:()=>'',remove:ref=>{delete keys[ref];delete bound[ref];return true;},list:()=>'[]'};
 const reply=(id,status,body)=>setTimeout(()=>nazFetchDone(id,status,body),5);
 window.NazBridge={cancel:()=>{},fetch:()=>{const id=++n;reply(id,0,'Network error: no key');return id;},
  fetchSecret:(url,method,headers,body,ref)=>{const id=++n;const origin=new URL(url).origin;__calls.push([origin,keys[ref]]);
   if(bound[ref]&&bound[ref]!==origin){reply(id,0,'Network error: This API key is locked to '+bound[ref]+'. Re-enter the key in Edit Provider to use it with '+origin+'.');return id;}
   bound[ref]=origin;
   if(origin==='https://ai.example.my')reply(id,200,JSON.stringify({object:'list',data:[{id:'solar-pro4'},{id:'solar-mini4'}]}));
   else if(origin==='https://bad.example.my')reply(id,0,'Network error: Unable to resolve host "bad.example.my": No address associated with hostname');
   else reply(id,401,JSON.stringify({error:{message:'Invalid API key'}}));
   return id;}};
 window.NazStream={open:()=>-1,cancel:()=>{}};
});
await page.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});
await page.evaluate(()=>{db.onboardingDone=true;save();});await page.goto(page.url(),{waitUntil:'domcontentloaded'});
await page.evaluate(()=>openProvForm(null));
const url=page.locator('#provForm input[placeholder="https://api.example.com/v1"]');
const key=page.locator('#provForm input[type="password"]');
const test=page.getByRole('button',{name:'Test connection & fetch models'});
const status=page.locator('#provForm .status-line');
// 1. Mistyped host: the real reason is shown, not "HTTP 0".
await url.fill('https://bad.example.my/v1');await key.fill('sk-test-123');await test.click();
await page.waitForFunction(()=>/Could not connect/.test(document.querySelector('#provForm .status-line')?.textContent||''));
assert.match(await status.innerText(),/Unable to resolve host "bad\.example\.my"/);
assert.doesNotMatch(await status.innerText(),/HTTP 0/);
// 2. Fix the URL and test again: the typed key is bound to the new URL and models load.
await url.fill('https://ai.example.my/v1');await test.click();
await page.waitForFunction(()=>/Connected/.test(document.querySelector('#provForm .status-line')?.textContent||''));
assert.match(await status.innerText(),/2 models found/);
assert.deepEqual(await page.evaluate(()=>__calls.map(c=>c[0])),['https://bad.example.my','https://ai.example.my']);
// 3. Re-rendering the form (switching endpoint mode) keeps the typed key for the next test.
await page.getByRole('button',{name:'Full endpoint URL'}).click();await page.getByRole('button',{name:'Base URL'}).click();
assert.equal(await key.inputValue(),'sk-test-123');
// 4. A provider error shows its own message and a hint.
await url.fill('https://other.example.my/v1');await test.click();
await page.waitForFunction(()=>/HTTP 401/.test(document.querySelector('#provForm .status-line')?.textContent||''));
assert.match(await status.innerText(),/HTTP 401: Invalid API key \(check the API key\)/);
// The key never lands in saved app data.
assert.doesNotMatch(await page.evaluate(()=>localStorage.getItem('nazchat_v1')),/sk-test-123/);
console.log('PASS provider test connection: real failure reason, re-test after fixing the URL rebinds the key, key not stored in app data');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
