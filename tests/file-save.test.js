const {launch, appUrl}=require('./browser');
const assert=require('assert');

// Android WebView ignores <a download>: backups and code downloads produced no file.
// The app now hands the text to NazFiles (Android "Save to" screen); browsers still
// download normally.
(async()=>{
 const b=await launch();
 let failed=0;
 const seed={schemaVersion:3,onboardingDone:true,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',secretRef:'provider:p',apiKey:'sk-must-not-leak',headers:[],selectedModels:['m']}],lastProviderId:'p',lastModelId:'m',
   conversations:[{id:'c',title:'Code',updatedAt:Date.now(),messages:[{id:'u',role:'user',content:'code'},{id:'a',role:'assistant',content:'```js\nconsole.log(1)\n```'}]}]};
 async function scenario(name,native,run){
   const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(([seed,native])=>{if(window!==window.top)return;localStorage.setItem('nazchat_v1',JSON.stringify(seed));
     if(native){window.__saves=[];window.NazSecrets={get:()=>'',put:()=>true,has:()=>true};window.NazFiles={save:(n,m,t)=>{window.__saves.push({name:n,mime:m,text:t});return true;}};}},[seed,native]);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}
   finally{await ctx.close();}
 }
 const toast=page=>page.evaluate(()=>document.querySelector('#toast')?.textContent||'');

 await scenario('Android: backup opens the Save to screen with a dated JSON file and no keys',true,async page=>{
   await page.evaluate(()=>exportBackup());
   const s=await page.evaluate(()=>window.__saves[0]);
   assert.match(s.name,/^kita-chat-backup-\d{4}-\d{2}-\d{2}\.json$/);assert.equal(s.mime,'application/json');
   const data=JSON.parse(s.text);assert.equal(data.format,'kita-chat-backup-v2');assert.equal(data.providers[0].name,'Mock');
   assert(!s.text.includes('sk-must-not-leak'),'API key in backup');
   await page.evaluate(n=>window.nazFileSaved(true,n,''),s.name);
   assert.match(await toast(page),/Backup saved \(API keys not included\) · kita-chat-backup-/);
   await page.evaluate(()=>{document.querySelector('#toast').textContent='';window.nazFileSaved(false,'x','cancelled');});
   assert.equal(await toast(page),'','cancelling must stay quiet');
   await page.evaluate(()=>window.nazFileSaved(false,'x','Disk full'));
   assert.match(await toast(page),/Not saved: Disk full/);
 });
 await scenario('Android: code Download and preview Download save through NazFiles',true,async page=>{
   await page.evaluate(()=>{conv=db.conversations[0];renderAll();});
   await page.locator('.code-wrap').getByRole('button',{name:/^Download /}).click();
   await page.evaluate(()=>{openPreview('<!doctype html><p>x</p>',{inApp:true});document.querySelector('#pmDownload').click();});
   const saves=await page.evaluate(()=>window.__saves.map(s=>[s.name,s.mime,s.text.length>0]));
   assert.deepEqual(saves,[['snippet.js','text/plain',true],['kita-preview.html','text/html',true]]);
 });
 await scenario('Android: encrypted backup saves an encrypted envelope',true,async page=>{
   await page.evaluate(()=>{window.__exporting=exportEncryptedBackup();});
   await page.locator('#customDialogInput').fill('correct horse battery');
   await page.locator('#customDialogConfirm').click();
   await page.waitForFunction(()=>window.__saves.length===1);
   const s=await page.evaluate(()=>window.__saves[0]);
   assert.match(s.name,/^kita-chat-encrypted-backup-\d{4}-\d{2}-\d{2}\.json$/);
   const env=JSON.parse(s.text);assert.equal(env.format,'kita-chat-encrypted-v1');assert(!s.text.includes('Mock'),'plaintext leaked');
 });
 await scenario('Browser: backup still downloads as a file',false,async page=>{
   const [download]=await Promise.all([page.waitForEvent('download'),page.evaluate(()=>exportBackup())]);
   assert.match(download.suggestedFilename(),/^kita-chat-backup-\d{4}-\d{2}-\d{2}\.json$/);
 });
 await b.close();
 console.log(failed?`File save: ${failed} failed`:'File save: all passed');
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
