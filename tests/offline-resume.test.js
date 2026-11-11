const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.8.2: a long answer survives the internet going down (the app waits for the
// connection instead of giving up) and the app closing mid-answer (Continue resumes
// the same message).
const API='https://api.test/v1/chat/completions';
const sse=frames=>frames.map(f=>'data: '+JSON.stringify(f)).join('\n\n')+'\n\n';
const delta=t=>({choices:[{delta:{content:t}}]});
const stop={choices:[{delta:{},finish_reason:'stop'}]};
const seed=extra=>({schemaVersion:3,onboardingDone:true,thinking:false,search:false,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{},capabilities:{tools:false}}],lastProviderId:'p',lastModelId:'m',conversations:[],projects:[],...extra});

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}
     window.__online=true;Object.defineProperty(Navigator.prototype,'onLine',{get(){return window.__online;},configurable:true});},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }

 await scenario('offline mid-answer: waits for the connection, then continues the same answer',seed(),async page=>{
   const reqs=[];
   await page.route(API,async r=>{reqs.push(JSON.parse(r.request().postData()));
     if(reqs.length===1){await page.evaluate(()=>{window.__online=false;});return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([delta('<!doctype html>\n<html><body>\n<h1>Big page</h1>\n')])});}
     return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([delta('<p>rest</p>\n</body></html>'),stop])+'data: [DONE]\n\n'});});
   await page.evaluate(()=>{RECONNECT_DELAYS=[10,10,10,10];});
   await page.fill('#promptInput','show me the html');await page.click('#sendBtn');
   await page.waitForFunction(()=>/offline/i.test(document.querySelector('.stream-status')?.textContent||''),null,{timeout:10000});
   const note=await page.locator('.stream-status').textContent();
   assert.match(note,/You're offline\. Waiting for the connection… 4 lines received so far are kept\./);
   await page.waitForTimeout(800);
   assert.equal(reqs.length,1,'no request is spent while offline');
   assert.equal(await page.evaluate(()=>generating),true);
   // What arrived was saved before waiting.
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('nazchat_v1')).conversations[0].messages.at(-1));
   assert.match(saved.content,/Big page/);assert.equal(saved.streaming,true);
   await page.evaluate(()=>{window.__online=true;window.dispatchEvent(new Event('online'));});
   await page.waitForFunction(()=>!generating,null,{timeout:15000});
   assert.equal(reqs.length,2);
   const last=await page.evaluate(()=>conv.messages.at(-1));
   assert.equal(last.content,'<!doctype html>\n<html><body>\n<h1>Big page</h1>\n<p>rest</p>\n</body></html>');
   assert.equal(last.failed,undefined);assert.equal(last.streaming,undefined);
   assert.match(reqs[1].messages.at(-1).content,/cut off by a connection problem/);
 });

 await scenario('Stop while waiting offline ends the wait at once and keeps the text',seed(),async page=>{
   await page.route(API,async r=>{await page.evaluate(()=>{window.__online=false;});r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([delta('Partial words')])});});
   await page.fill('#promptInput','hi');await page.click('#sendBtn');
   await page.waitForFunction(()=>/offline/i.test(document.querySelector('.stream-status')?.textContent||''),null,{timeout:10000});
   await page.click('#sendBtn');
   await page.waitForFunction(()=>!generating,null,{timeout:5000});
   const last=await page.evaluate(()=>conv.messages.at(-1));
   assert.match(last.content,/^Partial words/);assert.equal(last.streaming,undefined);
 });

 await scenario('Android stream: going offline or a long silence ends the attempt as a connection error',seed(),async page=>{
   const r=await page.evaluate(async()=>{
     const closed=[];window.NazStream={close:id=>closed.push(id)};
     newAbortController();
     const read=async it=>{const got=[];try{for await(const l of it)got.push(l);return {got,err:null};}catch(e){return {got,err:e.message};}};
     const it1=nativeSSE(701,currentAbortSignal());const p1=read(it1);
     nazStreamOnLine(701,'data: {"x":1}');await new Promise(r=>setTimeout(r,20));
     window.dispatchEvent(new Event('offline'));const r1=await p1;
     STREAM_STALL_MS=200;const it2=nativeSSE(702,currentAbortSignal());const p2=read(it2);
     nazStreamOnLine(702,'data: {"x":2}');const r2=await p2;STREAM_STALL_MS=120000;
     return {r1,r2,closed,int1:isInterruption(r1.err),int2:isInterruption(r2.err)};
   });
   assert.deepEqual(r.r1.got,['data: {"x":1}']);assert.match(r.r1.err,/Network connection lost \(offline\)/);
   assert.match(r.r2.err,/no data for 0s|timed out/);assert.deepEqual(r.closed.slice(0,2),[701,702]);
   assert.equal(r.int1,true);assert.equal(r.int2,true);
 });

 const cut={id:'c1',title:'Site',createdAt:1,updatedAt:1,providerId:'p',modelId:'m',messages:[
   {id:'u1',role:'user',content:'buat website',timestamp:1},
   {id:'a1',role:'assistant',content:'Here:\n\n```html\n<!doctype html>\n<html><body>\n<h1>Half',streaming:true,timestamp:2}]};
 await scenario('an answer cut by the app closing is kept, marked, and Continue finishes it in place',seed({conversations:[cut]}),async page=>{
   await page.evaluate(()=>{conv=db.conversations[0];renderAll();});
   const state=await page.evaluate(()=>({msg:conv.messages[1],hint:[...document.querySelectorAll('.msg.assistant .hint')].map(h=>h.textContent).join('|')}));
   assert.equal(state.msg.streaming,undefined);assert.equal(state.msg.closedEarly,true);
   assert.match(state.hint,/app closed before this answer finished/);
   const reqs=[];
   await page.route(API,r=>{reqs.push(JSON.parse(r.request().postData()));r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([delta(' page</h1>\n</body></html>\n```\nDone.'),stop])+'data: [DONE]\n\n'});});
   await page.locator('.msg.assistant .action-bar').getByRole('button',{name:'Continue',exact:true}).click();
   await page.waitForFunction(()=>!generating,null,{timeout:15000});
   const tail=reqs[0].messages.slice(-3);
   assert.deepEqual(tail.map(m=>m.role),['user','assistant','user']);
   assert.equal(tail[0].content,'buat website');assert.match(tail[1].content,/<h1>Half$/);assert.match(tail[2].content,/inside a code block, continue the code/);
   const after=await page.evaluate(()=>({n:conv.messages.length,msg:conv.messages[1],cards:document.querySelectorAll('.msg.assistant .artifact-card').length,hint:document.querySelector('.msg.assistant .hint')?.textContent||''}));
   assert.equal(after.n,2);assert.match(after.msg.content,/<h1>Half page<\/h1>\n<\/body><\/html>\n```\nDone\.$/);
   assert.equal(after.msg.closedEarly,undefined);assert.equal(after.cards,1,'the finished page is one artifact card');
   assert.doesNotMatch(after.hint,/app closed/);
 });

 await b.close();
 if(failed){console.error(failed+' failed');process.exitCode=1;}else console.log('4.8.2 offline and resume: all passed');
})();
