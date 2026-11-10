const {launch, appUrl}=require('./browser');
const assert=require('assert');

// Android WebView commits localStorage lazily, so changes made just before the process
// is killed (app update, low-memory kill) could vanish: providers added in 4.5.3 were
// lost this way after updating. Every save is now also written to a durable native file
// (NazStore), and startup uses whichever copy was saved last.
const provider=(id,name)=>({id,name,baseUrl:'https://'+id+'.test/v1',endpointMode:'base',apiType:'chat_completions',secretRef:'provider:'+id,headers:[],selectedModels:['m-'+id]});
const dbWith=(...providers)=>({schemaVersion:3,onboardingDone:true,providers,conversations:[],projects:[],prompts:[],styles:[],artifacts:[],lastProviderId:providers[0]?.id||null,lastModelId:providers[0]?'m-'+providers[0].id:null});

(async()=>{
 const b=await launch();
 const results=[];
 async function scenario(name,{local,localAt,native,store=true},check){
   const ctx=await b.newContext({viewport:{width:390,height:844}});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(({local,localAt,native,store})=>{
     if(window!==window.top)return;
     if(local!==undefined){localStorage.setItem('nazchat_v1',typeof local==='string'?local:JSON.stringify(local));}
     if(localAt!==undefined)localStorage.setItem('nazchat_v1_saved_at',String(localAt));
     window.__writes=[];
     if(store)window.NazStore={read:()=>native?JSON.stringify(native):'',write:t=>{window.__writes.push(t);return true;}};
   },{local,localAt,native,store});
   try{
     await page.goto(appUrl);await page.waitForFunction(()=>typeof db!=='undefined'&&typeof renderAll==='function');
     await check(page);assert.deepEqual(errors,[]);
     console.log('PASS '+name);results.push(true);
   }catch(e){console.error('FAIL '+name+'\n'+(e.stack||e));results.push(false);}
   finally{await ctx.close();}
 }
 const names=page=>page.evaluate(()=>db.providers.map(p=>p.name));

 await scenario('native copy newer than localStorage restores lost providers',
   {local:dbWith(provider('a','Old')),localAt:100,native:{savedAt:200,db:dbWith(provider('a','Old'),provider('b','Added before update'))}},
   async page=>assert.deepEqual(await names(page),['Old','Added before update']));
 await scenario('localStorage lost entirely: native copy is used',
   {native:{savedAt:50,db:dbWith(provider('a','Kept'))}},
   async page=>assert.deepEqual(await names(page),['Kept']));
 await scenario('newer localStorage wins over an older native copy',
   {local:dbWith(provider('a','Newer')),localAt:300,native:{savedAt:200,db:dbWith(provider('a','Older'))}},
   async page=>assert.deepEqual(await names(page),['Newer']));
 await scenario('upgrade from 4.5.4 (no stamp, no native copy) keeps localStorage',
   {local:dbWith(provider('a','From 4.5.4'))},
   async page=>assert.deepEqual(await names(page),['From 4.5.4']));
 await scenario('unreadable data is kept for recovery, not silently replaced',
   {local:'{"providers":[broken',store:false},
   async page=>{
     const kept=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('nazchat_v1_unreadable_')).map(k=>localStorage.getItem(k)));
     assert.deepEqual(kept,['{"providers":[broken']);
     assert.deepEqual(await names(page),[]);
   });
 await scenario('saves reach the durable copy (no API keys) and are flushed when hidden',
   {local:dbWith(provider('a','One')),localAt:100},
   async page=>{
     const out=await page.evaluate(async()=>{
       window.__writes.length=0;
       db.providers.push({id:'n',name:'New',baseUrl:'https://n.test/v1',secretRef:'provider:n',apiKey:'sk-secret',selectedModels:['x']});
       window.NazSecrets={get:()=>'',put:()=>true,has:()=>true};
       save();save();
       const beforeFlush=window.__writes.length;
       Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
       document.dispatchEvent(new Event('visibilitychange'));
       const state=JSON.parse(window.__writes.at(-1));
       return {beforeFlush,writes:window.__writes.length,names:state.db.providers.map(p=>p.name),key:JSON.stringify(state).includes('sk-secret'),
         savedAt:state.savedAt,localAt:Number(localStorage.getItem('nazchat_v1_saved_at'))};
     });
     assert.equal(out.beforeFlush,0,'native write should be batched, not per save');
     assert.equal(out.writes,1,'two quick saves must coalesce into one write');
     assert.deepEqual(out.names,['One','New']);
     assert.equal(out.key,false,'API key written to the durable copy');
     assert.equal(out.savedAt,out.localAt,'both copies carry the same save stamp');
     assert(out.savedAt>100,'stamp must move forward');
   });
 await scenario('full localStorage: the durable copy is written at once and the save succeeds',
   {local:dbWith(provider('a','One')),localAt:100},
   async page=>{
     const out=await page.evaluate(()=>{
       window.__writes.length=0;const real=Storage.prototype.setItem;
       Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};
       try{db.providers.push({id:'q',name:'Saved while full',baseUrl:'https://q.test/v1',secretRef:'provider:q',selectedModels:['x']});return {ok:save(),writes:window.__writes.length,names:JSON.parse(window.__writes[0]).db.providers.map(p=>p.name)};}
       finally{Storage.prototype.setItem=real;}
     });
     assert.equal(out.ok,true);assert.equal(out.writes,1);assert.deepEqual(out.names,['One','Saved while full']);
   });
 await scenario('stamp keeps increasing even if the clock goes back',
   {local:dbWith(provider('a','One')),localAt:Date.now()+3600e3},
   async page=>{
     const stamps=await page.evaluate(()=>{save();const a=Number(localStorage.getItem('nazchat_v1_saved_at'));save();return [a,Number(localStorage.getItem('nazchat_v1_saved_at'))];});
     assert(stamps[0]>Date.now()+3500e3 && stamps[1]>stamps[0]);
   });
 await scenario('installing an update writes the durable copy first',
   {local:dbWith(provider('a','One')),localAt:100},
   async page=>{
     const out=await page.evaluate(async()=>{
       const next={version:'9.9.9',versionCode:APP_VERSION_CODE+1,sha256:'a'.repeat(64),apkUrl:'https://github.com/nxsmlx/nazchat/releases/download/v9.9.9/NazChat.apk'};
       const original=window.fetch;window.fetch=async u=>String(u).includes('raw.githubusercontent')?{ok:true,json:async()=>next}:{ok:false};
       window.__writes.length=0;let writesAtInstall=-1;
       window.NazUpdater={getVersion:()=>APP_VERSION_CODE,downloadAndInstall:()=>{writesAtInstall=window.__writes.length;}};
       try{db.providers.push({id:'u',name:'Just added',baseUrl:'https://u.test/v1',secretRef:'provider:u',selectedModels:['x']});save();
         renderSettingsAbout();await checkForUpdate();document.querySelector('#checkUpdateBtn').click();
         return {writesAtInstall,names:writesAtInstall>0?JSON.parse(window.__writes.at(-1)).db.providers.map(p=>p.name):[]};}
       finally{window.fetch=original;delete window.NazUpdater;}
     });
     assert(out.writesAtInstall>0,'update started before the durable copy was written');
     assert.deepEqual(out.names,['One','Just added']);
   });
 await scenario('keys left without a provider can be reused when adding it again',
   {local:dbWith(provider('a','Still here')),localAt:100,store:false},
   async page=>{
     const out=await page.evaluate(()=>{
       const stored={'provider:a':'sk-aaaa-1111','draft:lost-1':'sk-openrouter-9f3c','draft:lost-2':'sk-deepseek-77ab'};
       window.NazSecrets={get:()=>'',put:(r,v)=>{stored[r]=v;return true;},has:r=>!!stored[r],remove:r=>{delete stored[r];return true;},
         listProviderKeys:()=>JSON.stringify(Object.keys(stored).map(ref=>({ref,hint:stored[ref].slice(-4),origin:ref==='draft:lost-1'?'https://openrouter.ai':''})))};
       renderSettingsHub();openSheet('setSheet');renderProvidersSubView();
       const note=document.querySelector('.saved-keys-note')?.textContent||'';
       openProvForm(null);
       const sel=document.querySelector('select[aria-label="Use a saved API key"]');
       const options=[...sel.options].map(o=>o.textContent);
       sel.value='draft:lost-1';sel.dispatchEvent(new Event('change'));
       provFormState.name='OpenRouter';provFormState.baseUrl='https://openrouter.ai/api/v1';provFormState.selectedModels=['openai/gpt-4o'];
       const keyDisabled=[...document.querySelectorAll('#provSheet input[type=password]')].some(i=>i.disabled);
       [...document.querySelectorAll('#provSheet button')].find(b=>b.textContent==='Save provider').click();
       const added=db.providers.find(p=>p.name==='OpenRouter');
       return {note,options,keyDisabled,ref:added?.secretRef,hasKey:hasProviderSecret(added),left:orphanProviderKeys().map(k=>k.ref),
         leaked:JSON.stringify(db).includes('sk-openrouter')};
     });
     assert.match(out.note,/^2 saved API keys are still on this device/);
     assert.deepEqual(out.options,['Enter a new key','Saved key …9f3c · openrouter.ai','Saved key …77ab']);
     assert.equal(out.keyDisabled,true);
     assert.equal(out.ref,'draft:lost-1');assert.equal(out.hasKey,true);
     assert.deepEqual(out.left,['draft:lost-2']);assert.equal(out.leaked,false);
   });
 await b.close();
 const failed=results.filter(x=>!x).length;
 console.log(`Durable state: ${results.length-failed}/${results.length} passed`);
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
