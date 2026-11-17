const {launch, appUrl}=require('./browser');
const assert=require('node:assert/strict');

// 4.29.0: the elegance pass. Code frames have a one-row header with icon actions, the model
// sheet drops a filter that filters nothing, action sheets are plain lists, and page
// headings, labels and answer details say less.
(async()=>{
 const b=await launch();
 let failed=0;
 const long=Array.from({length:20},(_,i)=>'const v'+i+' = '+i+';').join('\n');
 const md='Ini kodnya.\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n\nDan yang panjang:\n\n```js util.js\n'+long+'\n```\n\n```html\n<p>Hai</p>\n```';
 const prov=(id,name)=>({id,name,baseUrl:'https://api.test/v1',secretRef:'provider:'+id,headers:[],selectedModels:['m-'+id]});
 const seed=extra=>({schemaVersion:3,onboardingDone:true,autoTitles:false,providers:[prov('p1','Kita')],lastProviderId:'p1',lastModelId:'m-p1',
   prompts:[{id:'pr',name:'Ringkaskan',content:'Ringkaskan teks',createdAt:1}],
   conversations:[{id:'c1',title:'Kod',mode:'chat',updatedAt:Date.now(),messages:[{id:'u',role:'user',content:'kod'},{id:'a',role:'assistant',content:md,usedSkills:['planning']}]}],...extra});
 async function scenario(name,data,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(s=>{if(window===window.top&&!sessionStorage.getItem('seeded')){localStorage.setItem('nazchat_v1',JSON.stringify(s));sessionStorage.setItem('seeded','1');}},data);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}
   finally{await ctx.close();}
 }

 await scenario('code frame: one-row header, named icon actions, fold only where there is something to fold',seed({}),async page=>{
   await page.evaluate(()=>studioOpenConversation(db.conversations[0]));
   const wraps=page.locator('.msg.assistant .code-wrap');
   assert.equal(await wraps.count(),3);
   // Short snippet: download and copy, no fold control, no worded buttons.
   const short=wraps.nth(0);
   assert.deepEqual(await short.locator('.code-actions button').evaluateAll(bs=>bs.filter(x=>getComputedStyle(x).display!=='none').map(x=>x.getAttribute('aria-label'))),['Download snippet.js','Copy code']);
   assert.equal((await short.locator('.code-actions').innerText()).trim(),'','icons only');
   const head=await short.locator('.code-head').boundingBox();assert(head.height<=48,'one-row header, got '+head.height);
   for(const box of await short.locator('.code-actions button').evaluateAll(bs=>bs.filter(x=>getComputedStyle(x).display!=='none').map(x=>{const r=x.getBoundingClientRect();return [r.width,r.height];}))) assert(box[0]>=44&&box[1]>=44,'touch target '+box);
   // Long file: folded at first; the chevron opens and closes it and says so.
   const file=wraps.nth(1), fold=file.getByRole('button',{name:'Expand code'});
   assert(await file.evaluate(n=>n.classList.contains('collapsed')));
   assert.equal(await fold.getAttribute('aria-expanded'),'false');
   await fold.click();
   assert(!(await file.evaluate(n=>n.classList.contains('collapsed'))));
   assert.equal(await file.getByRole('button',{name:'Collapse code'}).getAttribute('aria-expanded'),'true');
   // HTML snippets keep Preview, as an icon with a name.
   await wraps.nth(2).getByRole('button',{name:'Preview'}).click();
   await page.waitForSelector('#htmlPreview.open');
   await page.evaluate(()=>closePreview());
   // Copy confirms with a tick and goes back to the icon.
   const copy=short.getByRole('button',{name:'Copy code'});
   await page.evaluate(()=>{navigator.clipboard.writeText=async t=>{window.__copied=t;};});
   await copy.click();
   await page.waitForFunction(()=>window.__copied==='const a = 1;\nconsole.log(a);');
   assert(await copy.evaluate(n=>n.classList.contains('copied')));
   // Answer details: skills are plain text, Copy is an icon with its name kept.
   const badge=page.locator('.msg.assistant .skill-badge').first();
   assert.equal(await badge.evaluate(n=>getComputedStyle(n).borderTopWidth),'0px');
   const cp=page.locator('.msg.assistant .action-bar').getByRole('button',{name:'Copy',exact:true});
   assert(await cp.isVisible());assert((await cp.boundingBox()).width<=60,'icon-sized Copy');
 });

 await scenario('model sheet: no provider filter with one provider, shown again with two',seed({}),async page=>{
   await page.click('#bottomModelBtn');await page.waitForSelector('#modelSheet.open');
   assert.equal(await page.locator('.model-filter').count(),0);
   assert.equal(await page.locator('#modelList .model-item').count(),1);
   await page.evaluate(()=>{db.providers.push({id:'p2',name:'Lain',baseUrl:'https://api2.test/v1',secretRef:'provider:p2',headers:[],selectedModels:['m-p2']});renderModelSheet();});
   assert.deepEqual(await page.locator('.model-filter').evaluateAll(bs=>bs.map(x=>x.textContent.replace(/\s+/g,' ').trim())),['All 2','Kita 1','Lain 1']);
   await page.locator('.model-filter',{hasText:'Lain'}).click();
   assert.equal(await page.locator('#modelList .model-item').count(),1);
 });

 await scenario('action sheets are plain lists; headings and labels say less',seed({}),async page=>{
   await page.evaluate(()=>studioConversationMenu(db.conversations[0]));
   await page.waitForSelector('#toolsSheet.open');
   const rows=page.locator('#toolsSheetBody > .btn.secondary');
   assert.deepEqual(await rows.allInnerTexts(),['Rename','Pin conversation','Move to folder','Delete conversation']);
   const style=await rows.first().evaluate(n=>{const c=getComputedStyle(n);return {bg:c.backgroundColor,align:c.textAlign,h:n.getBoundingClientRect().height};});
   assert.equal(style.bg,'rgba(0, 0, 0, 0)');assert.equal(style.align,'left');assert(style.h>=44);
   const danger=await rows.last().evaluate(n=>getComputedStyle(n).color), plain=await rows.first().evaluate(n=>getComputedStyle(n).color);
   assert.notEqual(danger,plain,'Delete stays in the danger colour');
   await page.evaluate(()=>closeSheet('toolsSheet'));
   // Tools: short title; other sheets that are not menus keep their buttons.
   await page.evaluate(()=>{renderToolsSheet();openSheet('toolsSheet');});
   assert.equal(await page.locator('#toolsSheet .sheet-head h3').innerText(),'Tools');
   await page.evaluate(()=>closeSheet('toolsSheet'));
   // Sidebar: no "Recent chats" label above the search box.
   await page.evaluate(()=>{openSidebar();renderSidebar();});
   assert.equal(await page.locator('.studio-history-head').isVisible(),false);
   assert(await page.locator('#convSearch').isVisible());
   await page.evaluate(()=>closeSidebar());
   // Library and Projects: heading only, rows without arrows.
   await page.evaluate(()=>studioNavigate('library'));
   assert.equal(await page.locator('.studio-page-head p').isVisible(),false);
   assert.equal(await page.locator('.studio-library-open > svg:last-child').isVisible(),false);
   assert(await page.getByRole('button',{name:'Manage Ringkaskan'}).isVisible());
   // Settings: no intro sentence.
   await page.evaluate(()=>{studioNavigate('chat');renderSettingsHub();openSheet('setSheet');});
   await page.waitForSelector('#setSheet.open');
   assert.equal(await page.locator('.settings-hub-intro').isVisible(),false);
   await page.locator('#setSheet.open .settings-hub-row').first().waitFor();
 });

 await b.close();
 if(failed){console.error(failed+' scenario(s) failed');process.exit(1);}
 console.log('PASS elegance: code frame, model sheet, action sheets, quieter headings');
})();
