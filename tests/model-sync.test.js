const {launch, appUrl}=require('./browser');
const assert=require('node:assert/strict');

// 4.29.1: a provider refresh that offers fewer models (15 → 5) no longer leaves the old picks
// hidden in the provider form and visible in the model picker. Stored data is not rewritten
// on load: the picker shows only offered models, and Save / Test connection prune the rest.
(async()=>{
 const b=await launch();
 let failed=0;
 const all15=Array.from({length:15},(_,i)=>'kita/model-'+i);
 const offered5=all15.slice(10);
 const stale={id:'p1',name:'Kita',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',secretRef:'provider:p1',headers:[],
   selectedModels:all15,fetchedModels:offered5};
 const other={id:'p2',name:'Lain',baseUrl:'https://api2.test/v1',secretRef:'provider:p2',headers:[],selectedModels:['lain/a','lain/b']};
 const seed=extra=>({schemaVersion:3,onboardingDone:true,autoTitles:false,providers:[stale,other],lastProviderId:'p1',lastModelId:'kita/model-0',conversations:[],...extra});
 async function scenario(name,data,run,route){
   const ctx=await b.newContext({viewport:{width:390,height:844}});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,route||(r=>r.fulfill({status:503,body:'{}'})));
   await ctx.addInitScript(s=>{if(window===window.top&&!sessionStorage.getItem('seeded')){localStorage.setItem('nazchat_v1',JSON.stringify(s));sessionStorage.setItem('seeded','1');}window.NazSecrets={get:()=>'',put:()=>true,has:()=>true};},data);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof providerModels==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}
   finally{await ctx.close();}
 }
 const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('nazchat_v1')));

 await scenario('picker shows only offered models; reading does not rewrite the selection',seed({}),async page=>{
   await page.click('#bottomModelBtn');await page.waitForSelector('#modelSheet.open');
   assert.deepEqual(await page.locator('.model-filter').evaluateAll(bs=>bs.map(x=>x.textContent.replace(/\s+/g,' ').trim())),['All 7','Kita 5','Lain 2']);
   await page.locator('.model-filter',{hasText:'Kita'}).click();
   assert.deepEqual(await page.locator('#modelList .model-item small').allInnerTexts(),offered5);
   // The stale last model is replaced by the first offered one, in the composer too.
   assert.equal(await page.evaluate(()=>currentModel().modelId),'kita/model-10');
   assert.equal((await stored(page)).providers[0].selectedModels.length,15,'loading must not rewrite stored data');
   // Counts elsewhere agree.
   await page.keyboard.press('Escape');
   await page.evaluate(()=>{renderSettingsHub();openSheet('setSheet');});
   await page.waitForSelector('#setSheet.open');
   assert.match(await page.locator('#setSheet .settings-hub-row',{hasText:'Providers'}).textContent(),/7 models/);
   // Providers without a fetched list are unchanged.
   assert.deepEqual(await page.evaluate(()=>providerModels(db.providers[1])),['lain/a','lain/b']);
 });

 await scenario('Save keeps only the models the provider offers',seed({}),async page=>{
   await page.evaluate(()=>openProvForm(db.providers[0]));
   await page.waitForSelector('#provSheet.open');
   assert.equal(await page.locator('#provSheet .model-row').count(),5);
   assert.equal(await page.locator('#provSheet .model-row.sel').count(),5);
   await page.locator('#provSheet .btn',{hasText:'Save provider'}).click();
   const s=await stored(page);
   assert.deepEqual(s.providers[0].selectedModels,offered5);
   assert.deepEqual(s.providers[1].selectedModels,['lain/a','lain/b']);
 });

 await scenario('Test connection drops picks the provider no longer offers and says so',seed({providers:[{...stale,fetchedModels:all15},other]}),async page=>{
   await page.evaluate(()=>openProvForm(db.providers[0]));
   await page.waitForSelector('#provSheet.open');
   assert.equal(await page.locator('#provSheet .model-row').count(),15);
   await page.locator('#provSheet button',{hasText:/Test connection/}).click();
   await page.waitForSelector('#provSheet .status-line.ok');
   assert.equal(await page.locator('#provSheet .status-line.ok').innerText(),'✓ Connected — 5 models found · 10 no longer offered, removed from your selection');
   assert.equal(await page.locator('#provSheet .model-row').count(),5);
   assert.equal(await page.locator('#provSheet .model-row.sel').count(),5);
   await page.locator('#provSheet .btn',{hasText:'Save provider'}).click();
   const s=await stored(page);
   assert.deepEqual(s.providers[0].selectedModels,offered5);
   assert.deepEqual(s.providers[0].fetchedModels,offered5);
 },async r=>{
   const u=r.request().url();
   if(u==='https://api.test/v1/models') return r.fulfill({status:200,headers:{'content-type':'application/json'},body:JSON.stringify({data:offered5.map(id=>({id}))})});
   return r.fulfill({status:503,body:'{}'});
 });

 await b.close();
 if(failed){console.error(failed+' scenario(s) failed');process.exit(1);}
 console.log('PASS model sync: refreshed providers offer only the models they list');
})();
