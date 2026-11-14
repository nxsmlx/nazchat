const {launch, appUrl}=require('./browser');
const assert=require('node:assert/strict');

// 4.24.0: chats can be moved into folders. Old data loads unchanged; a chat in a folder is
// listed inside it; search finds every chat; deleting a folder keeps its chats; Android
// Back leaves the folder before closing the sidebar.
(async()=>{
 const b=await launch();
 let failed=0;
 const now=Date.now();
 const seed={schemaVersion:3,onboardingDone:true,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',secretRef:'provider:p',headers:[],selectedModels:['m']}],lastProviderId:'p',lastModelId:'m',
   conversations:[
     {id:'c1',title:'Bajet kedai kopi',mode:'chat',updatedAt:now-1000,messages:[{id:'u1',role:'user',content:'bajet'}]},
     {id:'c2',title:'Laporan jualan',mode:'chat',updatedAt:now-2000,messages:[{id:'u2',role:'user',content:'laporan'}]},
     {id:'c3',title:'Resipi nasi lemak',mode:'chat',updatedAt:now-3000,messages:[{id:'u3',role:'user',content:'resipi'}]},
     {id:'k1',title:'Laman kedai',mode:'code',updatedAt:now-4000,messages:[{id:'u4',role:'user',content:'web'}]}]};
 async function scenario(name,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(seed=>{if(window===window.top&&!sessionStorage.getItem('seeded')){localStorage.setItem('nazchat_v1',JSON.stringify(seed));sessionStorage.setItem('seeded','1');}},seed);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderSidebar==='function'&&typeof createFolder==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}
   finally{await ctx.close();}
 }
 const titles=page=>page.locator('#convList .conv-item .t').allInnerTexts();
 const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('nazchat_v1')));
 const answer=async(page,text)=>{await page.waitForSelector('#customDialogScrim.open');await page.fill('#customDialogInput',text);await page.click('#customDialogConfirm');};

 await scenario('old data loads without folders and is not rewritten',async page=>{
   assert.deepEqual(await page.evaluate(()=>db.folders),[]);
   const raw=await stored(page);
   assert(!raw.conversations.some(c=>'folderId' in c),'reading must not add folderId');
   await page.evaluate(()=>openSidebar());
   assert.deepEqual(await titles(page),['Bajet kedai kopi','Laporan jualan','Resipi nasi lemak']);
   assert(await page.getByRole('button',{name:'New folder'}).isVisible());
 });

 await scenario('create a folder, move chats in, open it, search finds them, Back returns',async page=>{
   await page.evaluate(()=>openSidebar());
   await page.getByRole('button',{name:'New folder'}).click();
   await answer(page,'Kerja');
   // A new folder opens straight away, empty.
   assert.equal(await page.locator('.folder-view-title').innerText(),'Kerja');
   assert.match(await page.locator('#convList .conv-empty').innerText(),/No chats in this folder yet/);
   await page.getByRole('button',{name:'Back to all chats'}).click();
   // Move two chats with ⋯ → Move to folder.
   for(const t of ['Bajet kedai kopi','Laporan jualan']){
     await page.evaluate(()=>openSidebar());
     await page.getByRole('button',{name:'Manage conversation: '+t}).click();
     await page.locator('#toolsSheet.open').getByRole('button',{name:'Move to folder',exact:true}).click();
     await page.locator('#toolsSheet.open').getByRole('button',{name:'Kerja'}).click();
     assert.match(await page.evaluate(()=>document.querySelector('#toast').textContent),/Moved to Kerja/);
   }
   const raw=await stored(page);const kerja=raw.folders.find(f=>f.name==='Kerja');
   assert(kerja,'folder saved');
   assert.deepEqual(raw.conversations.filter(c=>c.folderId===kerja.id).map(c=>c.id).sort(),['c1','c2']);
   // All chats lists the rest; the folder shows its count.
   await page.evaluate(()=>openSidebar());
   assert.deepEqual(await titles(page),['Resipi nasi lemak']);
   assert.equal(await page.getByRole('button',{name:'Open folder Kerja, 2 chats'}).count(),1);
   await page.getByRole('button',{name:'Open folder Kerja, 2 chats'}).click();
   assert.deepEqual(await titles(page),['Bajet kedai kopi','Laporan jualan']);
   // Android Back leaves the folder first, then closes the sidebar.
   assert.equal(await page.evaluate(()=>window.kitaHandleBack()),true);
   assert.equal(await page.locator('.folder-view-title').count(),0);
   assert(await page.evaluate(()=>document.querySelector('#sidebar').classList.contains('open')),'sidebar stays open after leaving the folder');
   // Search finds chats in folders and labels them.
   await page.fill('#convSearch','laporan');
   assert.deepEqual(await titles(page),['Laporan jualan']);
   assert.equal(await page.locator('#convList .conv-folder-tag').innerText(),'Kerja');
   await page.fill('#convSearch','');
   // The conversation menu names its folder; moving back out works.
   await page.getByRole('button',{name:'Open folder Kerja, 2 chats'}).click();
   await page.getByRole('button',{name:'Manage conversation: Laporan jualan'}).click();
   await page.locator('#toolsSheet.open').getByRole('button',{name:'Move to folder · Kerja'}).click();
   assert.equal(await page.locator('#toolsSheet.open .folder-choice.active').innerText(),'Kerja ✓');
   await page.locator('#toolsSheet.open').getByRole('button',{name:'No folder'}).click();
   assert.equal((await stored(page)).conversations.find(c=>c.id==='c2').folderId,null);
   // Touch targets.
   await page.evaluate(()=>{sidebarFolderId=null;openSidebar();renderSidebar();});
   const small=await page.evaluate(()=>[...document.querySelectorAll('#convList .folder-add, #convList .folder-row')].map(n=>n.getBoundingClientRect().height).filter(h=>h<44).length);
   assert.equal(small,0);
 });

 await scenario('new folder from the move menu; rename; delete keeps the chats',async page=>{
   await page.evaluate(()=>openSidebar());
   await page.getByRole('button',{name:'Manage conversation: Resipi nasi lemak'}).click();
   await page.locator('#toolsSheet.open').getByRole('button',{name:'Move to folder',exact:true}).click();
   await page.locator('#toolsSheet.open').getByRole('button',{name:'New folder…'}).click();
   await answer(page,'Peribadi');
   let raw=await stored(page);const f=raw.folders.find(x=>x.name==='Peribadi');
   assert.equal(raw.conversations.find(c=>c.id==='c3').folderId,f.id);
   // Same name again is not duplicated.
   await page.evaluate(()=>openSidebar());
   await page.getByRole('button',{name:'New folder'}).click();await answer(page,'peribadi');
   assert.equal((await stored(page)).folders.length,1);
   // Rename.
   await page.evaluate(()=>{sidebarFolderId=db.folders[0].id;openSidebar();renderSidebar();});
   await page.getByRole('button',{name:'Manage folder: Peribadi'}).click();
   await page.locator('#toolsSheet.open').getByRole('button',{name:'Rename folder'}).click();
   await page.waitForSelector('#customDialogScrim.open');await page.fill('#customDialogInput','Rumah');await page.click('#customDialogConfirm');
   assert.equal((await stored(page)).folders[0].name,'Rumah');
   // Delete: the chat is kept and goes back to All chats.
   await page.evaluate(()=>{sidebarFolderId=db.folders[0].id;openSidebar();renderSidebar();});
   await page.getByRole('button',{name:'Manage folder: Rumah'}).click();
   await page.locator('#toolsSheet.open').getByRole('button',{name:'Delete folder'}).click();
   await page.waitForSelector('#customDialogScrim.open');
   assert.match(await page.locator('#customDialogMessage').innerText(),/Its 1 chat is kept and moved to All chats/);
   await page.click('#customDialogConfirm');
   raw=await stored(page);
   assert.equal(raw.folders.length,0);assert.equal(raw.conversations.length,4);assert.equal(raw.conversations.find(c=>c.id==='c3').folderId,null);
   await page.evaluate(()=>openSidebar());
   assert(( await titles(page)).includes('Resipi nasi lemak'));
   // Code mode keeps its own list; folders are shared.
   assert.equal(await page.evaluate(()=>{db.folders.push({id:'f9',name:'Web',createdAt:1});db.conversations.find(c=>c.id==='k1').folderId='f9';db.uiMode='code';renderSidebar();return document.querySelector('[aria-label^="Open folder Web"]').getAttribute('aria-label');}),'Open folder Web, 1 chat');
 });

 await scenario('a backup keeps folders; a missing folder does not hide its chats',async page=>{
   await page.evaluate(()=>{db.folders=[{id:'f1',name:'Kerja',createdAt:1}];db.conversations.find(c=>c.id==='c1').folderId='f1';db.conversations.find(c=>c.id==='c2').folderId='gone';save();});
   const backup=await page.evaluate(()=>{let out=null;window.NazFiles={save:(n,m,t)=>{out=t;return true;}};exportBackup();return JSON.parse(out);});
   assert.deepEqual(backup.folders,[{id:'f1',name:'Kerja',createdAt:1}]);
   await page.evaluate(()=>{openSidebar();renderSidebar();});
   assert.deepEqual(await titles(page),['Laporan jualan','Resipi nasi lemak'],'a chat whose folder no longer exists stays in All chats');
 });

 await b.close();
 if(failed){console.error(failed+' scenario(s) failed');process.exit(1);}
 console.log('PASS folders: create, move, open, search, rename, delete, Back, backup');
})();
