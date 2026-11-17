const {launch, appUrl}=require('./browser');
const assert=require('node:assert/strict');

// 4.27.1: a project can be renamed and deleted from ⋯ on its page. Deleting keeps the chats
// (they leave the project), removes its instructions and sources, and clears it if active.
(async()=>{
 const b=await launch();
 let failed=0;
 const now=Date.now();
 const seed={schemaVersion:3,onboardingDone:true,autoTitles:false,providers:[],activeProjectId:'pk',
   projects:[{id:'pk',name:'Kedai Kopi',instructions:'Jawab dalam BM.',sources:[{id:'s1',text:'menu'},{id:'s2',text:'harga'}],createdAt:1,updatedAt:1},{id:'pw',name:'Kerja',instructions:'',createdAt:2,updatedAt:2}],
   conversations:[{id:'c1',title:'Menu baharu',mode:'chat',projectId:'pk',updatedAt:now,messages:[{id:'u',role:'user',content:'menu'}]},
     {id:'c2',title:'Harga',mode:'chat',projectId:'pk',updatedAt:now-1000,messages:[{id:'u2',role:'user',content:'harga'}]},
     {id:'c3',title:'Lain',mode:'chat',projectId:'pw',updatedAt:now-2000,messages:[{id:'u3',role:'user',content:'lain'}]}]};
 async function scenario(name,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(s=>{if(window===window.top&&!sessionStorage.getItem('seeded')){localStorage.setItem('nazchat_v1',JSON.stringify(s));sessionStorage.setItem('seeded','1');}},seed);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof studioProjectMenu==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}
   finally{await ctx.close();}
 }
 const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('nazchat_v1')));
 const openProject=async(page,name)=>{await page.evaluate(()=>studioNavigate('projects'));await page.locator('.studio-project-card',{hasText:name}).click();};

 await scenario('rename a project from ⋯ on its page',async page=>{
   await openProject(page,'Kedai Kopi');
   const manage=page.getByRole('button',{name:'Manage project: Kedai Kopi'});
   const box=await manage.boundingBox();assert(box.width>=44&&box.height>=44,'touch target');
   await manage.click();
   await page.locator('#toolsSheet.open').getByRole('button',{name:'Rename project'}).click();
   await page.waitForSelector('#customDialogScrim.open');await page.fill('#customDialogInput','Kopi Kita');await page.click('#customDialogConfirm');
   assert.equal((await stored(page)).projects.find(p=>p.id==='pk').name,'Kopi Kita');
   assert.match(await page.locator('.studio-page-head h1').innerText(),/Kopi Kita/);
   // Cancelling leaves the name alone.
   await page.getByRole('button',{name:'Manage project: Kopi Kita'}).click();
   await page.locator('#toolsSheet.open').getByRole('button',{name:'Rename project'}).click();
   await page.waitForSelector('#customDialogScrim.open');await page.click('#customDialogCancel');
   assert.equal((await stored(page)).projects.find(p=>p.id==='pk').name,'Kopi Kita');
 });

 await scenario('delete a project: chats are kept, instructions and sources go, the active project is cleared',async page=>{
   await openProject(page,'Kedai Kopi');
   await page.getByRole('button',{name:'Manage project: Kedai Kopi'}).click();
   await page.locator('#toolsSheet.open').getByRole('button',{name:'Delete project'}).click();
   await page.waitForSelector('#customDialogScrim.open');
   assert.match(await page.locator('#customDialogMessage').innerText(),/Its 2 chats are kept and moved out of the project\. Its instructions and 2 source sections are removed\./);
   // Cancel first: nothing changes.
   await page.click('#customDialogCancel');
   assert.equal((await stored(page)).projects.length,2);
   await page.getByRole('button',{name:'Manage project: Kedai Kopi'}).click();
   await page.locator('#toolsSheet.open').getByRole('button',{name:'Delete project'}).click();
   await page.waitForSelector('#customDialogScrim.open');await page.click('#customDialogConfirm');
   const s=await stored(page);
   assert.deepEqual(s.projects.map(p=>p.id),['pw']);
   assert.equal(s.conversations.length,3,'no chat is deleted');
   assert.deepEqual(s.conversations.filter(c=>c.id!=='c3').map(c=>c.projectId),[null,null]);
   assert.equal(s.conversations.find(c=>c.id==='c3').projectId,'pw','other projects are untouched');
   assert.equal(s.activeProjectId,null);
   assert.match(await page.evaluate(()=>document.querySelector('#toast').textContent),/Project deleted\. Chats kept\./);
   // Back on the project list, which no longer shows it.
   assert.equal(await page.locator('.studio-project-card',{hasText:'Kedai Kopi'}).count(),0);
   assert.equal(await page.locator('.studio-project-card',{hasText:'Kerja'}).count(),1);
   // The kept chats are in the chat list.
   await page.evaluate(()=>{studioNavigate('chat');openSidebar();renderSidebar();});
   assert.deepEqual((await page.locator('#convList .conv-item .t').allInnerTexts()).sort(),['Harga','Lain','Menu baharu']);
 });

 await scenario('the project menu closes with Escape and Android Back',async page=>{
   await openProject(page,'Kerja');
   await page.getByRole('button',{name:'Manage project: Kerja'}).click();
   await page.waitForSelector('#toolsSheet.open');
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#toolsSheet.open').count(),0);
   await page.getByRole('button',{name:'Manage project: Kerja'}).click();
   await page.waitForSelector('#toolsSheet.open');
   assert.equal(await page.evaluate(()=>window.kitaHandleBack()),true);
   assert.equal(await page.locator('#toolsSheet.open').count(),0);
 });

 await b.close();
 if(failed){console.error(failed+' scenario(s) failed');process.exit(1);}
 console.log('PASS projects: rename and delete from the project page, chats kept');
})();
