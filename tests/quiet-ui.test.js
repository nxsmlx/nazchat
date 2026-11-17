const {launch, appUrl}=require('./browser');
const assert=require('node:assert/strict');

// 4.27.0: a quieter UI. Fewer words on the home, the composer, result cards and answers;
// Code options in Tools; Edit appears when you tap your message; previews use the page title.
(async()=>{
 const b=await launch();
 let failed=0;
 const provider={id:'p1',name:'Kita',baseUrl:'https://api.test/v1',apiType:'chat',endpointMode:'chat',secretRef:'provider:p1',selectedModels:['m1'],models:[{id:'m1',name:'M1'}],apiKey:'test'};
 const page_='<!doctype html><html><head><title>Kopi Kita</title></head><body><h1>Kopi</h1></body></html>';
 const now=Date.now();
 // Noon yesterday, so the short time reads "Yesterday" whatever time the test runs.
 const yesterdayNoon=(()=>{const d=new Date();d.setDate(d.getDate()-1);d.setHours(12,0,0,0);return d.getTime();})();
 const data=extra=>({schemaVersion:3,onboardingDone:true,autoTitles:false,providers:[provider],lastProviderId:'p1',lastModelId:'m1',
   conversations:[{id:'c1',title:'Laman kopi',mode:'code',updatedAt:yesterdayNoon,messages:[{id:'u',role:'user',content:'buat laman kopi'},{id:'a',role:'assistant',content:'Siap.\n\n```html\n'+page_+'\n```',codeChecks:[{round:1,errors:[]}]}]}],...extra});
 async function scenario(name,seed,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(s=>{if(window===window.top&&!sessionStorage.getItem('seeded')){localStorage.setItem('nazchat_v1',JSON.stringify(s));sessionStorage.setItem('seeded','1');}},seed);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}
   finally{await ctx.close();}
 }

 await scenario('home: no eyebrow or intro line, one-line recent rows, idea chips, Code options in Tools',data({uiMode:'code'}),async page=>{
   assert.equal(await page.locator('#studioGreeting').isVisible(),false);
   assert.equal(await page.locator('.studio-home > p:not(.studio-greeting)').first().isVisible(),false);
   const row=page.locator('#studioResume .studio-recent').first();
   assert.equal(await row.innerText(),'Laman kopi\nYesterday');
   assert.equal(await row.locator('svg').count(),1,'one icon, no arrow');
   assert((await row.boundingBox()).height<=52,'one line');
   // Ideas are chips: a few words each, their descriptions only for screen readers.
   const chip=page.locator('#empty .sugg button').first();
   const desc=await chip.locator('small').boundingBox();assert(desc.width<=1&&desc.height<=1,'description is for screen readers only');
   assert.match(await chip.locator('small').textContent(),/\w/);
   assert((await chip.boundingBox()).width<200,'a chip, not a full-width row');
   // Style, Files and publishing are in Tools, not on the home.
   assert.equal(await page.locator('#empty select').count(),0);
   assert.equal(await page.locator('#empty .code-integrations').count(),0);
   await page.evaluate(()=>{renderToolsSheet();openSheet('toolsSheet');});
   await page.locator('#toolsSheet select[aria-label="Design style for new builds"]').waitFor();
   assert(await page.locator('#toolsSheet select[aria-label="How pages are saved and published"]').isVisible());
   assert(await page.locator('#toolsSheet .code-integrations').isVisible());
   await page.evaluate(()=>closeSheet('toolsSheet'));
   // Chat mode keeps its own Tools without the Code section.
   await page.evaluate(()=>{setKitaMode('chat');renderToolsSheet();});
   assert.equal(await page.locator('#toolsSheet .tools-code').count(),0);
   // Inside a project the greeting names it.
   await page.evaluate(()=>{setKitaMode('code');db.projects.push({id:'pj',name:'Kedai',instructions:''});db.activeProjectId='pj';renderAll();});
   assert.match(await page.locator('#studioGreeting').innerText(),/Kedai/);
   assert(await page.locator('#studioGreeting').isVisible());
 });

 await scenario('composer: model on one line, Tools as an icon, no tagline',data({}),async page=>{
   assert.equal(await page.locator('#providerName').isVisible(),false);
   assert(await page.locator('#modelName').isVisible());
   assert.equal(await page.locator('#moreToolsBtn .tool-label').isVisible(),false);
   assert.equal(await page.locator('#moreToolsBtn').getAttribute('aria-label'),'Conversation tools');
   assert.equal(await page.locator('.studio-composer-note').filter({visible:true}).count(),0);
 });

 await scenario('answers: one worded action on the page card, nothing said twice, no name label, Edit on tap',data({}),async page=>{
   await page.evaluate(()=>studioOpenConversation(db.conversations[0]));
   const card=page.locator('.msg.assistant .artifact-card');
   assert.deepEqual(await card.locator('.artifact-actions > button').evaluateAll(b=>b.map(x=>x.textContent.trim()||'['+x.getAttribute('aria-label')+']')),['Open','[Publish Kopi Kita]','[Show code]','[More for Kopi Kita]']);
   assert.match(await card.locator('.artifact-status').innerText(),/✓ tested/);
   assert.equal(await page.locator('.msg.assistant .code-check').count(),0);
   assert.equal(await page.locator('.msg.assistant .action-bar').getByRole('button',{name:'Preview',exact:true}).count(),0);
   assert.equal(await page.locator('.studio-assistant-label').isVisible(),false);
   // A page test that fixed something is still worth a line.
   await page.evaluate(()=>{db.conversations[0].messages[1].codeChecks=[{round:1,errors:['x']},{round:2,errors:[]}];renderAll();});
   assert.match(await page.locator('.msg.assistant .code-check').innerText(),/fixed 1 error/);
   // Edit is hidden until you tap your message.
   const edit=page.locator('.msg.user .action-bar .act-btn');
   assert.equal(await edit.isVisible(),false);
   await page.locator('.msg.user .bubble').click();
   assert(await edit.isVisible(),'Edit shows after a tap');
   await page.locator('.msg.user .bubble').click();
   assert.equal(await edit.isVisible(),false,'a second tap hides it');
   // With the keyboard, focusing the message shows Edit too.
   await page.keyboard.press('Shift');await page.locator('.msg.user .bubble').focus();
   assert(await edit.isVisible(),'keyboard focus shows Edit too');
 });

 await scenario('previews are named after the page, also on Android',data({}),async page=>{
   await page.evaluate(()=>studioOpenConversation(db.conversations[0]));
   await page.locator('.msg.assistant .artifact-card .artifact-btn.primary').click();
   await page.waitForSelector('#htmlPreview.open');
   await page.waitForFunction(()=>document.querySelector('#previewTitle').textContent==='Kopi Kita');
   assert.equal(await page.locator('#previewTitle').textContent(),'Kopi Kita');
   assert.equal(await page.locator('.preview-tabs .vp-seg').isVisible(),false,'width buttons are hidden on a phone');
   assert(await page.locator('.preview-tabs #previewJs').isVisible());
   const titles=await page.evaluate(()=>{const out=[];window.NazPreview={open:(h,t,js)=>out.push(t)};openPreview('<html><head><title>Kedai &amp; Kafe</title></head></html>');openPreview('<h1>Menu</h1>');openPreview('<p>x</p>');delete window.NazPreview;return out;});
   assert.deepEqual(titles,['Kedai & Kafe','Menu','Preview']);
 });

 await b.close();
 if(failed){console.error(failed+' scenario(s) failed');process.exit(1);}
 console.log('PASS quiet UI: fewer words on home, composer, cards and answers; Code options in Tools; Edit on tap; titled previews');
})();
