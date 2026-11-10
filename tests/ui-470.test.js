const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.7.0: glass bottom navigation, conversation summary for long chats, and the coding
// loop that runs a generated page and sends its errors back for a fix.
const API='https://api.test/v1/chat/completions';
const sse=frames=>frames.map(f=>'data: '+JSON.stringify(f)).join('\n\n')+'\n\ndata: [DONE]\n\n';
const answer=t=>sse([{choices:[{delta:{content:t}}]},{choices:[{delta:{},finish_reason:'stop'}]}]);
const seed=extra=>({schemaVersion:3,onboardingDone:true,thinking:false,search:false,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{},capabilities:{tools:false}}],lastProviderId:'p',lastModelId:'m',conversations:[],projects:[],...extra});

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run,viewport={width:390,height:844}){
   const ctx=await b.newContext({viewport});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top)localStorage.setItem('nazchat_v1',JSON.stringify(db));},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');await run(page);assert.deepEqual(errors.filter(e=>!/renderCart/.test(e)),[],'app errors (the tested page\'s own errors are expected)');console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }
 const ask=async(page,text)=>{await page.fill('#promptInput',text);await page.click('#sendBtn');await page.waitForFunction(()=>!generating,null,{timeout:30000});};
 const chat=n=>Array.from({length:n},(_,i)=>({id:'m'+i,role:i%2?'assistant':'user',content:(i%2?'Answer ':'Question ')+i+' '+'detail '.repeat(20)}));

 await scenario('glass navigation on Home, Projects and Library; hidden inside a conversation',seed({conversations:[{id:'c',title:'Chat',updatedAt:Date.now(),messages:chat(2)}]}),async page=>{
   const nav=page.locator('#bottomNav');
   assert(await nav.isVisible());assert.equal(await nav.getByRole('button',{name:'Home'}).getAttribute('aria-current'),'page');
   await nav.getByRole('button',{name:'Projects'}).click();
   assert.equal(await page.evaluate(()=>studioView),'projects');assert.equal(await nav.getByRole('button',{name:'Projects'}).getAttribute('aria-current'),'page');
   await nav.getByRole('button',{name:'Library'}).click();assert.equal(await page.evaluate(()=>studioView),'library');
   await nav.getByRole('button',{name:'Settings'}).click();assert(await page.locator('#setSheet.open').count());
   // Open sheets and the sidebar must cover the navigation, never sit under it.
   const covered=await page.evaluate(()=>{const n=document.querySelector('#bottomNav').getBoundingClientRect();const hit=document.elementFromPoint(n.left+n.width/2,n.top+n.height/2);return !hit.closest('#bottomNav');});
   assert(covered,'settings sheet is under the navigation bar');
   await page.evaluate(()=>{document.querySelectorAll('.sheet.open').forEach(s=>s.classList.remove('open'));studioOpenConversation(db.conversations[0]);});
   assert.equal(await nav.isVisible(),false,'conversation keeps the bottom edge for the composer');
   await page.evaluate(()=>{conv=null;renderAll();});
   const box=await page.locator('#composer').boundingBox(),navBox=await nav.boundingBox();
   assert(box.y+box.height<=navBox.y+1,'composer must sit above the navigation');
   const small=await page.evaluate(()=>[...document.querySelectorAll('#bottomNav button')].filter(b=>b.getBoundingClientRect().height<44).length);assert.equal(small,0);
 });
 await scenario('no bottom navigation on wide screens',seed({}),async page=>{assert.equal(await page.locator('#bottomNav').isVisible(),false);},{width:1280,height:900});

 await scenario('long chats send a running summary plus the latest messages',seed({conversations:[{id:'c',title:'Long',updatedAt:Date.now(),messages:chat(30)}]}),async page=>{
   const reqs=[];
   await page.route(API,r=>{const body=JSON.parse(r.request().postData());reqs.push(body);
     if(!body.stream) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'- Earlier: user asked 18 questions about detail.'}}]})});
     return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:answer('ok')});});
   await page.evaluate(()=>{conv=db.conversations[0];renderAll();});
   await ask(page,'next question');
   assert.equal(reqs.length,2);assert.equal(reqs[0].stream,false);
   assert.match(reqs[0].messages.at(-1).content,/running summary/);
   const sent=reqs[1].messages;
   assert(sent.some(m=>m.role==='system'&&/Summary of the earlier conversation/.test(m.content)&&/18 questions/.test(m.content)));
   assert.equal(sent.filter(m=>m.role!=='system').length,13,'12 recent messages plus the new question');
   assert.equal(await page.evaluate(()=>conv.summary.count),18);
   reqs.length=0;await ask(page,'one more');
   assert.equal(reqs.length,1,'summary is reused until 8 more messages are older');
   assert(reqs[0].messages.some(m=>/Summary of the earlier conversation/.test(m.content)));
 });

 await scenario('one-off requests (summary, Compare) reach base URLs without a trailing slash',seed({}),async page=>{
   const urls=[];await page.route(/^https:\/\/api\.test\//,r=>{urls.push(r.request().url());r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'ok'}}]})});});
   const out=await page.evaluate(()=>requestOnce(currentModel(),'hi'));
   assert.equal(out,'ok');assert.deepEqual(urls,['https://api.test/v1/chat/completions']);
 });
 await scenario('short chats are unchanged (no summary call)',seed({conversations:[{id:'c',title:'Short',updatedAt:Date.now(),messages:chat(6)}]}),async page=>{
   const reqs=[];await page.route(API,r=>{reqs.push(JSON.parse(r.request().postData()));r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:answer('ok')});});
   await page.evaluate(()=>{conv=db.conversations[0];renderAll();});await ask(page,'hi');
   assert.equal(reqs.length,1);assert.equal(reqs[0].messages.filter(m=>m.role!=='system').length,7);
 });

 const broken='```html\n<!doctype html><html><body><h1>Shop</h1><script>renderCart();</script></body></html>\n```';
 const fixed='```html\n<!doctype html><html><body><h1>Shop</h1><script>function renderCart(){document.body.dataset.ok=1}renderCart();</script></body></html>\n```';
 await scenario('coding loop: a page that throws is fixed automatically',seed({}),async page=>{
   const reqs=[];
   await page.route(API,r=>{const body=JSON.parse(r.request().postData());reqs.push(body);r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:answer(reqs.length===1?broken:fixed)});});
   await ask(page,'make a tiny shop page');
   const m=await page.evaluate(()=>({content:conv.messages.at(-1).content,checks:conv.messages.at(-1).codeChecks}));
   assert.equal(reqs.length,2,'one fix request');
   assert.match(reqs[1].messages.at(-1).content,/It reported these errors/);assert.match(reqs[1].messages.at(-1).content,/renderCart/);
   assert.equal(m.content,fixed);
   assert.equal(m.checks.length,2);assert(m.checks[0].errors.length>=1);assert.deepEqual(m.checks[1].errors,[]);
   assert.match(await page.locator('.msg.assistant .code-check').innerText(),/fixed 1 error automatically/);
 });
 await scenario('coding loop: clean pages, prose and the off switch make no extra calls',seed({}),async page=>{
   const reqs=[];let reply=fixed;
   await page.route(API,r=>{reqs.push(1);r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:answer(reply)});});
   await ask(page,'tiny shop page');assert.equal(reqs.length,1);
   assert.match(await page.locator('.msg.assistant .code-check').last().innerText(),/no errors/);
   reply='Just a plain explanation.';await ask(page,'explain');assert.equal(reqs.length,2);
   await page.evaluate(()=>{db.autoCheckCode=false;});reply=broken;await ask(page,'again');assert.equal(reqs.length,3);
   assert.equal(await page.evaluate(()=>conv.messages.at(-1).codeChecks),undefined);
 });

 await b.close();
 console.log(failed?`4.7.0: ${failed} failed`:'4.7.0: all passed');
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
