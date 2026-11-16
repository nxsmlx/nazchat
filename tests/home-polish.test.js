const {launch, appUrl}=require('./browser');
const assert=require('node:assert/strict');

// 4.26.0: a calmer phone home. Context chips sit inside the composer, the ☰ menu steps aside
// while the bottom navigation is shown, the home does not repeat the Kita mark, home rows use
// the icon of their mode, and a new chat gets a short title from the model after its first answer.
(async()=>{
 const b=await launch();
 let failed=0;
 const provider={id:'p1',name:'Mock',baseUrl:'https://api.test/v1',apiType:'chat',endpointMode:'chat',secretRef:'provider:p1',selectedModels:['m1'],models:[{id:'m1',name:'M1'}],apiKey:'test',modelMeta:{m1:{context_length:128000}}};
 const seed=extra=>({schemaVersion:3,onboardingDone:true,providers:[provider],lastProviderId:'p1',lastModelId:'m1',conversations:[],...extra});
 async function scenario(name,data,run,route){
   const ctx=await b.newContext({viewport:{width:390,height:844}});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,route||(r=>r.fulfill({status:503,body:'{}'})));
   await ctx.addInitScript(s=>{if(window===window.top&&!sessionStorage.getItem('seeded')){localStorage.setItem('nazchat_v1',JSON.stringify(s));sessionStorage.setItem('seeded','1');}},data);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function'&&typeof autoTitleConversation==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}
   finally{await ctx.close();}
 }
 const now=Date.now();
 const code={id:'k1',title:'Web kedai kopi',mode:'code',updatedAt:now,messages:[{id:'u',role:'user',content:'web'},{id:'a',role:'assistant',content:'ok'}]};

 await scenario('phone home: chips in the composer, no ☰ beside the bottom nav, one Kita mark, mode icons',seed({permissionMode:'bypass',uiMode:'code',conversations:[code]}),async page=>{
   await page.waitForSelector('#bottomNav:not([hidden])');
   assert.equal(await page.locator('#menuBtn').isVisible(),false,'☰ steps aside while the bottom nav is shown');
   assert.equal(await page.locator('#menuBtn').getAttribute('aria-hidden'),'true');
   assert.equal(await page.locator('.studio-welcome-mark').isVisible(),false,'the header already shows the mark');
   // The Bypass chip is a small pill inside the composer, still impossible to miss.
   const chip=page.locator('#composer #studioContext .studio-context-chip.warn');
   assert.equal(await chip.innerText(),'Bypass all is on');
   assert.equal(await chip.getAttribute('title'),'Bypass all: tools run without asking. Tap × to turn it off.');
   const box=await chip.boundingBox();assert(box.height<=36,'compact chip, got '+box.height);
   const composer=await page.locator('#composer').boundingBox();assert(box.y>=composer.y&&box.y+box.height<=composer.y+composer.height,'chip inside the composer');
   // The × keeps a 44 px touch area through its ::after.
   const hit=await page.locator('#composer #studioContext .warn button').evaluate(n=>{const r=n.getBoundingClientRect(),a=getComputedStyle(n,'::after');return {w:r.width+2*Math.abs(parseFloat(a.left)),h:r.height+2*Math.abs(parseFloat(a.top))};});
   assert(hit.w>=44&&hit.h>=44,'touch area '+JSON.stringify(hit));
   // Code home: recent rows use the code icon, like the "Start something new" rows.
   const same=await page.evaluate(()=>{const probe=document.createElement('span');probe.innerHTML=kitaIcon('code');return document.querySelector('#studioResume .studio-resume-icon').innerHTML===probe.innerHTML;});
   assert(same,'recent Code rows use the code icon');
   const tiles=await page.evaluate(()=>[...document.querySelectorAll('#studioResume .studio-resume-icon, #empty .sugg .ico')].map(n=>getComputedStyle(n).backgroundColor));
   assert.equal(new Set(tiles).size,1,'every home row uses the same tile: '+tiles);
   // Turning Bypass off removes the chip.
   await page.getByRole('button',{name:'Turn off Bypass all'}).click();
   assert.equal(await page.locator('#composer #studioContext .studio-context-chip').count(),0);
   // Inside a conversation the bottom nav steps aside and ☰ comes back.
   await page.evaluate(()=>studioOpenConversation(db.conversations[0]));
   await page.waitForSelector('#bottomNav[hidden]',{state:'attached'});
   assert.equal(await page.locator('#menuBtn').isVisible(),true);
   assert.equal(await page.locator('#menuBtn').getAttribute('aria-hidden'),null);
   // Wider screens keep ☰ (no bottom nav there).
   await page.evaluate(()=>studioNewChat(null));await page.setViewportSize({width:1100,height:800});
   await page.waitForFunction(()=>document.querySelector('#bottomNav').hidden);
   assert.equal(await page.locator('#menuBtn.nav-covered').count(),0);
 });

 await scenario('a new chat gets a short title from the model after its first answer',seed({}),async page=>{
   await page.fill('#promptInput','sy nak awak plan dulu jangan bina lagi. sy nak web kedai kopi untuk kawan saya');
   await page.click('#sendBtn');
   await page.waitForFunction(()=>db.conversations[0]?.title==='Pelan Laman Kedai Kopi',null,{timeout:15000});
   assert.equal(await page.locator('#chatTitle').innerText(),'Pelan Laman Kedai Kopi');
   const calls=await page.evaluate(()=>window.__calls);
   void calls;
   assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('nazchat_v1')).conversations[0].title)),'Pelan Laman Kedai Kopi');
 },async r=>{
   const u=r.request().url();
   if(!u.startsWith('https://api.test/')) return r.fulfill({status:503,body:'{}'});
   const body=JSON.parse(r.request().postData()||'{}');
   if(body.stream) return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content:'Baik, kita rancang dulu.'}}]})+'\n\ndata: [DONE]\n\n'});
   const asked=JSON.stringify(body.messages||body.input||'');
   assert.match(asked,/short title of 2 to 5 words[\s\S]*sy nak awak plan dulu[\s\S]*Baik, kita rancang dulu/);
   return r.fulfill({status:200,headers:{'content-type':'application/json'},body:JSON.stringify({choices:[{message:{content:'Title: "Pelan Laman Kedai Kopi."'}}]})});
 });

 await scenario('titles: a renamed chat is kept, failures keep the placeholder, odd replies are cleaned',seed({}),async page=>{
   const r=await page.evaluate(async()=>{
     const model=currentModel();
     const mk=title=>{const c={id:uid(),title,mode:'chat',updatedAt:Date.now(),messages:[{id:'u',role:'user',content:'hello there'},{id:'a',role:'assistant',content:'hi'}]};db.conversations.push(c);return c;};
     // The user renamed it while the title was on its way: keep their name.
     const a=mk('hello there');pendingAutoTitles.set(a.id,'hello there');a.title='My name';
     window.requestOnce=async()=>'Greeting';await autoTitleConversation(a,model);
     // The provider fails: the placeholder stays, quietly.
     const b2=mk('hello there');pendingAutoTitles.set(b2.id,'hello there');
     window.requestOnce=async()=>{throw new Error('HTTP 500');};await autoTitleConversation(b2,model);
     // A failed answer is not titled at all.
     const c=mk('hello there');c.messages[1].failed=true;pendingAutoTitles.set(c.id,'hello there');let asked=false;
     window.requestOnce=async()=>{asked=true;return 'X';};await autoTitleConversation(c,model);
     return {a:a.title,b:b2.title,c:c.title,asked,pending:pendingAutoTitles.size,
       clean:[cleanAutoTitle('<think>hmm</think>\n**Pelan Kedai**'),cleanAutoTitle('# Tajuk: Bajet Bulanan!'),cleanAutoTitle(''),cleanAutoTitle('x'.repeat(80)),cleanAutoTitle('(No text returned)')]};
   });
   assert.deepEqual(r,{a:'My name',b:'hello there',c:'hello there',asked:false,pending:0,clean:['Pelan Kedai','Bajet Bulanan','','','']});
 });

 await scenario('Settings → Workspace → Short chat titles off: no extra request, the placeholder stays',seed({}),async page=>{
   await page.evaluate(()=>{renderStudioWorkspaceSettings();openSheet('setSheet');});
   const sw=page.getByRole('switch',{name:'Short chat titles'});
   assert.equal(await sw.getAttribute('aria-checked'),'true');
   await sw.click();
   assert.equal(await sw.getAttribute('aria-checked'),'false');
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nazchat_v1')).autoTitles),false);
   await page.evaluate(()=>closeSheet('setSheet'));
   await page.evaluate(()=>{window.__bodies=[];});
   await page.fill('#promptInput','tolong rancang menu kedai kopi');
   await page.click('#sendBtn');
   await page.waitForFunction(()=>!generating&&db.conversations[0]?.messages?.length===2,null,{timeout:15000});
   await page.waitForTimeout(400);
   assert.equal(await page.evaluate(()=>db.conversations[0].title),'tolong rancang menu kedai kopi');
   assert.equal(await page.evaluate(()=>pendingAutoTitles.size),0);
 },async r=>{
   const u=r.request().url();
   if(!u.startsWith('https://api.test/')) return r.fulfill({status:503,body:'{}'});
   const body=JSON.parse(r.request().postData()||'{}');
   assert(body.stream,'only the answer is requested when short titles are off');
   return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content:'Baik.'}}]})+'\n\ndata: [DONE]\n\n'});
 });

 await b.close();
 if(failed){console.error(failed+' scenario(s) failed');process.exit(1);}
 console.log('PASS home polish: composer chips, ☰ beside the nav, one mark, mode icons, short titles');
})();
