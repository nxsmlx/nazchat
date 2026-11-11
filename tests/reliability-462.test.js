const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.6.2: long messages are not builds, native reasoning is not asked twice, cut-off
// answers reconnect and continue from the received text, and update checks retry.
const API='https://api.test/v1/chat/completions';
const sse=frames=>frames.map(f=>'data: '+JSON.stringify(f)).join('\n\n')+'\n\n';
const delta=t=>({choices:[{delta:{content:t}}]});
const stop={choices:[{delta:{},finish_reason:'stop'}]};
const seed=(model='m')=>({schemaVersion:3,onboardingDone:true,thinking:false,search:false,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:[model],modelMeta:{},capabilities:{tools:false}}],lastProviderId:'p',lastModelId:model,conversations:[],projects:[]});

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top)localStorage.setItem('nazchat_v1',JSON.stringify(db));},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }
 const ask=async(page,text)=>{await page.fill('#promptInput',text);await page.click('#sendBtn');await page.waitForFunction(()=>!generating,null,{timeout:30000});};

 await scenario('long questions and pasted code are answered normally, builds still plan',seed(),async page=>{
   const r=await page.evaluate(()=>({
     longQuestion:isLongBuildRequest('Saya ada soalan panjang tentang bagaimana cara terbaik untuk menyusun jadual belajar harian supaya saya boleh fokus pada subjek matematik dan sains tanpa rasa letih dan masih ada masa untuk rehat dan bersukan setiap petang.'),
     pastedError:isLongBuildRequest('Kenapa error ni? ```js\nconst x = y.map(z => z.id)\n``` TypeError: y.map is not a function, saya cuba buat page dashboard'),
     landing:isLongBuildRequest('Buat landing page untuk kedai kopi saya'),
     fullSite:isLongBuildRequest('Create a complete website for my bakery with menu and contact sections')}));
   assert.deepEqual(r,{longQuestion:false,pastedError:false,landing:true,fullSite:true});
 });

 for(const [model,expectTag] of [['o3-mini',false],['deepseek-reasoner',false],['llama-3.1-8b',true]]){
   await scenario(`thinking for ${model}: ${expectTag?'tag prompt':'native reasoning only'}`,{...seed(model),thinking:true},async page=>{
     const reqs=[];await page.route(API,r=>{reqs.push(JSON.parse(r.request().postData()));r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([delta('ok'),stop])+'data: [DONE]\n\n'});});
     await ask(page,'hi');
     const sys=reqs[0].messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
     assert.equal(/Think step by step inside/.test(sys),expectTag);
     assert.equal(reqs[0].reasoning_effort!==undefined,true,'reasoning parameter still sent');
   });
 }

 await scenario('a cut-off answer reconnects and continues from the received text',seed(),async page=>{
   const reqs=[];
   await page.route(API,r=>{const body=JSON.parse(r.request().postData());reqs.push(body);
     if(reqs.length===1) return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([delta('Part one of the answer, '),delta('still going')])}); // no finish, no [DONE]
     return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([delta(' and the ending.'),stop])+'data: [DONE]\n\n'});});
   await ask(page,'tell me something');
   const last=await page.evaluate(()=>conv.messages.at(-1));
   assert.equal(last.content,'Part one of the answer, still going and the ending.');
   assert.equal(last.failed,undefined);assert.equal(last.reconnects,1);
   assert.equal(reqs.length,2);
   const tail=reqs[1].messages.slice(-2);
   assert.equal(tail[0].role,'assistant');assert.equal(tail[0].content,'Part one of the answer, still going');
   assert.match(tail[1].content,/cut off by a connection problem/);assert.match(tail[1].content,/still going/);
 });

 await scenario('when reconnecting fails, the text is kept with Continue and Try again',seed(),async page=>{
   const reqs=[];
   await page.route(API,r=>{reqs.push(1);r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([delta(reqs.length===1?'Kept text':'')])});});
   await page.evaluate(()=>{window.__realDelay=abortableDelay;RECONNECT_DELAYS=[10,10,10,10];});
   await ask(page,'tell me');
   const last=await page.evaluate(()=>({content:conv.messages.at(-1).content,failed:conv.messages.at(-1).failed,interrupted:conv.messages.at(-1).interrupted}));
   assert.equal(reqs.length,5,'four automatic reconnects');
   assert.match(last.content,/^Kept text/);assert.equal(last.failed,true);assert.equal(last.interrupted,true);
   const bar=page.locator('.msg.assistant').last().locator('.action-bar');
   assert(await bar.getByRole('button',{name:'Continue',exact:true}).isVisible());
   assert(await bar.getByRole('button',{name:'Try again',exact:true}).isVisible());
   // The error note is shown to the reader but never sent back to the model.
   await page.unroute(API);const next=[];
   await page.route(API,r=>{next.push(JSON.parse(r.request().postData()));r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([delta('rest'),stop])+'data: [DONE]\n\n'});});
   const before=await page.evaluate(()=>conv.messages.length);
   await bar.getByRole('button',{name:'Continue',exact:true}).click();
   await page.waitForFunction(()=>!generating);
   const prev=next[0].messages.find(m=>m.role==='assistant');
   assert.equal(prev.content,'Kept text');assert(!/Error/.test(prev.content));
   // 4.8.2: Continue finishes the same answer instead of adding a new reply.
   assert.match(next[0].messages.at(-1).content,/cut off by a connection problem/);
   assert.equal(next[0].messages.filter(m=>m.role==='user'&&m.content==='tell me').length,1,'question is not sent twice');
   const after=await page.evaluate(()=>({n:conv.messages.length,last:conv.messages.at(-1)}));
   assert.equal(after.n,before);assert.equal(after.last.content,'Kept textrest');
   assert.equal(after.last.failed,undefined);assert.equal(after.last.interrupted,undefined);assert.equal(after.last.streaming,undefined);
 });

 await scenario('a failed update check is retried on the next opportunity',seed(),async page=>{
   const out=await page.evaluate(async()=>{
     let calls=0,fail=true;fetchUpdateInfo=async()=>{calls++;if(fail)throw new Error('offline');return {version:'99.0.0',versionCode:999,changelog:'x'};};
     db.lastAutoUpdateCheck=Date.now();db.skippedUpdateCode=0;db.updateSnoozeUntil=0;
     await automaticUpdateCheck();const afterFail=!!document.querySelector('#updateNotice');
     fail=false;await automaticUpdateCheck();
     return {calls,afterFail,shown:!!document.querySelector('#updateNotice'),label:[...document.querySelectorAll('#updateNotice button')].map(b=>b.textContent)};});
   assert.equal(out.calls,2,'a recent check from an older install must not block the launch check');
   assert.equal(out.afterFail,false);assert.equal(out.shown,true);
   assert.deepEqual(out.label,['Update now','Later','Skip this version']);
 });

 await b.close();
 console.log(failed?`4.6.2 reliability: ${failed} failed`:'4.6.2 reliability: all passed');
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
