const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.8.0: accent colours (Iris stays the identity) and tool permission modes,
// including Bypass all with its visible badge and activity log.
const tools=[{name:'search_docs',description:'Find docs',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{}}},
  {name:'create_issue',description:'Create an issue',annotations:{},inputSchema:{type:'object',properties:{}}},
  {name:'delete_project',description:'Delete',annotations:{destructiveHint:true},inputSchema:{type:'object',properties:{}}}];
const seed=extra=>({schemaVersion:3,onboardingDone:true,providers:[],conversations:[{id:'c',title:'Chat',updatedAt:Date.now(),messages:[{id:'u',role:'user',content:'hi'}]}],projects:[],
  mcpServers:[{id:'srv1',name:'Tracker',url:'https://mcp.tracker.test/mcp',enabled:true,tools}],...extra});

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top)localStorage.setItem('nazchat_v1',JSON.stringify(db));},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');await page.evaluate(()=>{conv=db.conversations[0];renderAll();newAbortController();});await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }
 const fn=(page,tool)=>page.evaluate(t=>mcpToolDefs().find(d=>d.function.name.includes(t)).function.name,tool);
 const call=async(page,tool)=>{const n=await fn(page,tool);await page.evaluate(n=>{window.__perm=confirmMcpCall(n,{id:1});},n);};
 const dialogOpen=page=>page.evaluate(()=>document.querySelector('#customDialogScrim').classList.contains('open'));
 const result=page=>page.evaluate(()=>window.__perm);

 await scenario('accent colours: picker, persistence, Iris default, contrast',seed({}),async page=>{
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.accent),undefined,'Iris needs no attribute');
   await page.evaluate(()=>{renderSettingsHub();openSheet('setSheet');renderSettingsAppearance();});
   const swatches=page.locator('[role=radiogroup][aria-label="Accent colour"] [role=radio]');
   assert.deepEqual(await swatches.allTextContents(),['Iris','Lagoon','Ocean','Sunset','Forest']);
   assert.equal(await swatches.nth(0).getAttribute('aria-checked'),'true');
   await swatches.nth(1).click();
   assert.equal(await swatches.nth(1).getAttribute('aria-checked'),'true');
   assert.equal(await page.evaluate(()=>[document.documentElement.dataset.accent,db.accent].join()),'lagoon,lagoon');
   const lum=c=>{const m=c.match(/\d+/g).slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*m[0]+.7152*m[1]+.0722*m[2];};
   for(const accent of ['iris','lagoon','ocean','sunset','forest']) for(const theme of ['light','dark']){
     const c=await page.evaluate(([a,t])=>{db.accent=a;db.theme=t;applyTheme();const s=getComputedStyle(document.documentElement);const probe=document.createElement('i');document.body.appendChild(probe);const rgb=v=>{probe.style.color=v;return getComputedStyle(probe).color;};const r=[rgb(s.getPropertyValue('--accent')),rgb(s.getPropertyValue('--bg')),rgb(s.getPropertyValue('--on-primary'))];probe.remove();return r;},[accent,theme]);
     const ratio=(a,b2)=>{const x=lum(a),y=lum(b2);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
     assert(ratio(c[0],c[1])>=4.5,`${accent}/${theme} accent on background ${ratio(c[0],c[1]).toFixed(2)}`);
     assert(ratio(c[2],c[0])>=4.5,`${accent}/${theme} button text ${ratio(c[2],c[0]).toFixed(2)}`);
   }
   await page.evaluate(()=>{db.accent='iris';applyTheme();});
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.accent),undefined);
 });

 await scenario('balanced: read-only runs, others ask with chat/always choices, destructive never "always"',seed({}),async page=>{
   await call(page,'search_docs');assert.equal(await result(page),true);assert.equal(await dialogOpen(page),false);
   await call(page,'create_issue');await page.waitForFunction(()=>document.querySelector('#customDialogScrim.open'));
   assert.deepEqual(await page.locator('.dialog-choice').allTextContents(),['Allow for this chat','Always allow this tool']);
   await page.getByRole('button',{name:'Allow for this chat'}).click();assert.equal(await result(page),true);
   assert.deepEqual(await page.evaluate(()=>conv.toolAllow),['srv1:create_issue']);
   await call(page,'create_issue');assert.equal(await dialogOpen(page),false);assert.equal(await result(page),true);
   await call(page,'delete_project');await page.waitForFunction(()=>document.querySelector('#customDialogScrim.open'));
   assert.deepEqual(await page.locator('.dialog-choice').allTextContents(),['Allow for this chat']);
   assert.match(await page.locator('#customDialogMessage').textContent(),/destructive/);
   await page.getByRole('button',{name:'Decline'}).click();assert.equal(await result(page),false);
   const log=await page.evaluate(()=>db.toolActivity.map(e=>e.tool+':'+e.how));
   assert.deepEqual(log,['search_docs:Read-only','create_issue:Allowed for this chat']);
 });

 await scenario('careful asks for read-only too; Always and Block rules apply',seed({permissionMode:'careful'}),async page=>{
   await call(page,'search_docs');await page.waitForFunction(()=>document.querySelector('#customDialogScrim.open'));
   await page.getByRole('button',{name:'Always allow this tool'}).click();
   assert.deepEqual(await page.evaluate(()=>db.toolRules),{'srv1:search_docs':'allow'});
   await call(page,'search_docs');assert.equal(await dialogOpen(page),false);assert.equal(await result(page),true);
   await page.evaluate(()=>{db.toolRules['srv1:create_issue']='block';});
   await call(page,'create_issue');assert.equal(await result(page),false);assert.equal(await dialogOpen(page),false);
 });

 await scenario('Bypass all: confirmed on, badge visible, everything runs, badge turns it off',seed({}),async page=>{
   await page.evaluate(()=>{renderSettingsHub();openSheet('setSheet');renderPermissionSettings();});
   await page.locator('.permission-mode[data-mode="bypass"]').click();
   await page.waitForFunction(()=>document.querySelector('#customDialogScrim.open'));
   assert.match(await page.locator('#customDialogMessage').textContent(),/without your approval/);
   await page.getByRole('button',{name:'Turn on'}).click();
   assert.equal(await page.evaluate(()=>db.permissionMode),'bypass');
   await page.evaluate(()=>closeSheet('setSheet'));
   const chip=page.locator('.studio-context-chip.warn');assert(await chip.isVisible());assert.match(await chip.innerText(),/Bypass all/);
   for(const t of ['search_docs','create_issue','delete_project']){await call(page,t);assert.equal(await result(page),true,t);assert.equal(await dialogOpen(page),false);}
   const urlOk=await page.evaluate(()=>confirmFetchUrl('https://elsewhere.test/a',null));assert.equal(urlOk,true);
   assert.equal(await page.evaluate(()=>db.toolActivity.filter(e=>e.how==='Bypass all').length),4);
   await page.getByRole('button',{name:'Turn off Bypass all'}).click();
   assert.equal(await page.evaluate(()=>db.permissionMode),'balanced');assert.equal(await chip.count(),0);
   assert.equal(await page.evaluate(()=>isPrivateHostName('192.168.1.1')),true,'private network block is not a permission');
 });

 await scenario('pages: allow a site for this chat',seed({}),async page=>{
   await page.evaluate(()=>{window.__p=confirmFetchUrl('https://news.test/a',null);});
   await page.waitForFunction(()=>document.querySelector('#customDialogScrim.open'));
   await page.getByRole('button',{name:'Allow news.test for this chat'}).click();
   assert.equal(await page.evaluate(()=>window.__p),true);
   assert.deepEqual(await page.evaluate(()=>conv.siteAllow),['https://news.test']);
   assert.equal(await page.evaluate(()=>confirmFetchUrl('https://news.test/b',null)),true);
   assert.equal(await dialogOpen(page),false);
 });

 await b.close();
 console.log(failed?`4.8.0: ${failed} failed`:'4.8.0: all passed');
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
