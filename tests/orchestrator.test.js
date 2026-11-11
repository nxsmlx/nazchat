const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.9.0: a long build is planned by an orchestrator (shared contract + parts) and the
// parts are written by sub-agents at the same time (default 3), each retrying on its
// own; rate limits drop to one agent; Android keeps it running with a notification.
const API='https://api.test/v1/chat/completions';
const sse=frames=>frames.map(f=>'data: '+JSON.stringify(f)).join('\n\n')+'\n\n';
const delta=t=>({choices:[{delta:{content:t}}]});
const stop={choices:[{delta:{},finish_reason:'stop'}]};
const done=t=>sse([delta(t),stop])+'data: [DONE]\n\n';
const PLAN='CONTRACT:\n--brand: #6b4f3a; --font: "Inter"\nSection ids: #hero, #menu, #gallery\nClass prefix per part: hero-, menu-, gal-\nPARTS:\n1. Head and styles — <head> with all shared CSS\n2. Hero — #hero banner\n3. Menu — #menu list\n4. Gallery — #gallery grid\n5. Footer and scripts — footer + JS';
const PARTS=['<!doctype html><html><head><title>Kopi Kita</title><style>:root{--brand:#6b4f3a}</style></head><body>','<section id="hero"><h1>Kopi Kita</h1></section>','<section id="menu"><ul><li>Latte</li></ul></section>','<section id="gallery"><div>g</div></section>','<footer>f</footer><script>document.body.dataset.ok="1"</script></body></html>'];
const seed=extra=>({schemaVersion:3,onboardingDone:true,thinking:false,search:false,autoCheckCode:false,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{},capabilities:{tools:false}}],lastProviderId:'p',lastModelId:'m',conversations:[],projects:[],...extra});
const ASK='buat landing page lengkap untuk kedai kopi dengan hero, menu, galeri dan footer';

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }
 // A mock provider that holds each part open for a while so overlap can be measured.
 async function provider(page,opts={}){
   const st={plan:0,parts:[],live:0,maxLive:0,order:[]};
   await page.route(API,async r=>{
     const body=JSON.parse(r.request().postData());const last=body.messages.at(-1).content;
     if(/Break this task into/.test(last)){st.plan++;st.planBody=body;return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:done(PLAN)});}
     const m=last.match(/Now write ONLY part (\d+) of/);if(!m)return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:done('plain')});
     const i=Number(m[1])-1;st.parts.push({i,body});
     const res=opts.respond?await opts.respond(i,st):null;if(res)return r.fulfill(res);
     st.live++;st.maxLive=Math.max(st.maxLive,st.live);
     await new Promise(x=>setTimeout(x,opts.hold??300));
     st.live--;st.order.push(i);
     return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:done(PARTS[i])});
   });
   return st;
 }
 const ask=async page=>{await page.fill('#promptInput',ASK);await page.click('#sendBtn');await page.waitForFunction(()=>!generating,null,{timeout:60000});};

 await scenario('3 agents write parts at the same time, following the shared contract',seed(),async page=>{
   const st=await provider(page);
   await page.fill('#promptInput',ASK);await page.click('#sendBtn');
   // While running: agents are listed with live state (no terminal frame).
   await page.waitForFunction(()=>document.querySelectorAll('.run-part.running').length>=2,null,{timeout:10000});
   const live=await page.evaluate(()=>({rows:[...document.querySelectorAll('.run-part')].map(r=>r.textContent),label:document.querySelector('.run-label').textContent,open:document.querySelector('.run-status').classList.contains('open'),terminal:!!document.querySelector('.code-live')}));
   assert.equal(live.terminal,false);assert.equal(live.open,true);
   assert.match(live.rows.find(r=>/Coder 1/.test(r)),/^.Coder 1 · Head and styles/);assert.match(live.label,/agents? working/);
   await page.waitForFunction(()=>!generating,null,{timeout:60000});
   assert.equal(st.plan,1);assert.equal(st.parts.length,5);
   assert.equal(st.maxLive,3,'three agents at once');
   const seg=st.parts.map(p=>p.body.messages.at(-1).content);
   seg.forEach(c=>{assert.match(c,/\[Shared contract/);assert.match(c,/--brand: #6b4f3a/);});
   assert.match(st.parts[0].body.messages[0].content,/one of several coders/);
   const msg=await page.evaluate(()=>conv.messages.at(-1));
   assert.equal(msg.phases.state,'done');assert.match(msg.phases.contract,/Section ids: #hero/);
   const html=await page.evaluate(()=>extractHtmlBlock(conv.messages.at(-1).content));
   // Assembled in plan order even though parts finished out of order.
   const pos=['id="hero"','id="menu"','id="gallery"','<footer>'].map(x=>html.indexOf(x));
   assert.ok(pos.every((p,k)=>p>0&&(k===0||p>pos[k-1])),'parts out of order: '+pos);
   assert.equal(await page.locator('.msg.assistant .artifact-card').count(),1,'result is one artifact card');
 });

 await scenario('Settings: 1 agent runs the parts one by one',seed({agentConcurrency:1}),async page=>{
   const st=await provider(page,{hold:120});await ask(page);
   assert.equal(st.maxLive,1);assert.equal(st.parts.length,5);
 });

 await scenario('a rate limit (429) drops to one agent and the part is retried',seed(),async page=>{
   let limited=0;
   const st=await provider(page,{hold:200,respond:async(i)=>{ if(i===2&&limited<1){limited++;return {status:429,body:'{"error":{"message":"rate limited"}}'};} return null; }});
   await page.evaluate(()=>{const real=abortableDelay;window.abortableDelay=ms=>real(Math.min(ms,50));});
   await ask(page);
   const msg=await page.evaluate(()=>conv.messages.at(-1));
   assert.equal(msg.phases.state,'done');assert.ok(msg.phases.parts.every(p=>p.status==='done'));
   assert.equal(st.parts.filter(p=>p.i===2).length,2,'part 3 retried once');
 });

 await scenario('a part cut off mid-stream is retried on its own; finished parts are kept',seed(),async page=>{
   let cut=0;
   const st=await provider(page,{hold:50,respond:async(i)=>{ if(i===1&&cut<1){cut++;return {status:200,headers:{'content-type':'text/event-stream'},body:sse([delta('<section id="hero">half')])};} return null; }});
   await page.evaluate(()=>{RECONNECT_DELAYS=[10,10,10,10];});
   await ask(page);
   const msg=await page.evaluate(()=>conv.messages.at(-1));
   assert.equal(msg.phases.state,'done');
   assert.equal(st.parts.filter(p=>p.i===1).length,2);assert.equal(st.parts.filter(p=>p.i!==1).length,4,'other parts not repeated');
   assert.doesNotMatch(msg.content,/half/);
 });

 await scenario('Android: background service starts, reports progress, finishes; Stop from the notification',seed(),async page=>{
   await page.evaluate(()=>{window.__work=[];window.NazWork={start:(t,x)=>__work.push(['start',t,x]),update:(x,d,n)=>__work.push(['update',x,d,n]),finish:(t,x,ok)=>__work.push(['finish',t,x,ok])};});
   await provider(page,{hold:100});await ask(page);
   const w=await page.evaluate(()=>__work);
   assert.equal(w[0][0],'start');assert.match(w[0][1],/landing page/);
   assert.ok(w.some(e=>e[0]==='update'&&e[2]===5&&e[3]===5),'final progress 5/5');
   assert.deepEqual(w.at(-1),['finish','Build finished','5 parts assembled. Tap to open.',true]);
   // Stop button in the notification stops the build and the service.
   await page.evaluate(()=>{__work.length=0;});
   await page.unroute(API);await provider(page,{hold:3000});
   await page.fill('#promptInput',ASK);await page.click('#sendBtn');
   await page.waitForFunction(()=>document.querySelectorAll('.run-part.running').length>0,null,{timeout:10000});
   await page.evaluate(()=>kitaStopFromNotification());
   await page.waitForFunction(()=>!generating,null,{timeout:10000});
   const w2=await page.evaluate(()=>__work);
   assert.equal(w2.at(-1)[0],'finish');assert.equal(w2.at(-1)[1],'Build stopped');assert.equal(w2.at(-1)[3],false);
   const m=await page.evaluate(()=>conv.messages.at(-1).phases.state);assert.equal(m,'paused');
 });

 await scenario('background notifications can be turned off; normal answers never start the service',seed({backgroundWork:false}),async page=>{
   await page.evaluate(()=>{window.__work=[];window.NazWork={start:()=>__work.push('start'),update:()=>{},finish:()=>__work.push('finish')};});
   await provider(page,{hold:20});await ask(page);
   await page.fill('#promptInput','apa itu kopi');await page.click('#sendBtn');await page.waitForFunction(()=>!generating);
   assert.deepEqual(await page.evaluate(()=>__work),[]);
   // The Tools sheet shows both settings.
   await page.evaluate(()=>{renderToolsSheet();openSheet('toolsSheet');});
   assert.equal(await page.locator('#agentConcurrency').inputValue(),'3');
   assert.equal(await page.getByRole('switch',{name:'Keep building in the background'}).getAttribute('aria-checked'),'false');
   await page.selectOption('#agentConcurrency','2');assert.equal(await page.evaluate(()=>db.agentConcurrency),2);
 });

 await b.close();
 if(failed){console.error(failed+' failed');process.exitCode=1;}else console.log('4.9.0 orchestrator: all passed');
})();
