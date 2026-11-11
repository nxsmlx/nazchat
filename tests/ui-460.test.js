const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.6.0 interface: returning-user home, message actions menu, jump to latest,
// friendly provider errors with Try again, offline notice, unified Tools rows.
const provider={id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m','m2'],modelMeta:{}};
const longAnswer=Array.from({length:60},(_,i)=>'Paragraph '+i+' of a long answer.').join('\n\n');
const conv=(id,title,at,messages)=>({id,title,updatedAt:at,messages});

(async()=>{
 const b=await launch();
 const results=[];
 async function scenario(name,seed,run){
   const ctx=await b.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(seed=>{if(window===window.top)localStorage.setItem('nazchat_v1',JSON.stringify(seed));},seed);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');await run(page,ctx);assert.deepEqual(errors,[]);console.log('PASS '+name);results.push(true);}
   catch(e){console.error('FAIL '+name+'\n'+(e.stack||e));results.push(false);}
   finally{await ctx.close();}
 }
 const base=extra=>({schemaVersion:3,onboardingDone:true,providers:[provider],lastProviderId:'p',lastModelId:'m',conversations:[],projects:[],...extra});

 await scenario('first run keeps the welcome; returning users see recent chats first',base({providers:[],conversations:[]}),async page=>{
   assert(await page.getByRole('button',{name:/Connect your first provider/}).isVisible());
   assert.equal(await page.locator('.studio-home.returning').count(),0);
   await page.evaluate(()=>{const now=Date.now();db.conversations=[1,2,3,4].map(i=>({id:'c'+i,title:'Chat '+i,updatedAt:now-i*1000,messages:[{id:'u'+i,role:'user',content:'hi'}]}));conv=null;renderAll();});
   assert.equal(await page.locator('.studio-home.returning').count(),1);
   const order=await page.evaluate(()=>{const r=document.querySelector('#studioResume'),s=document.querySelector('.sugg');return !!(r.compareDocumentPosition(s)&Node.DOCUMENT_POSITION_FOLLOWING);});
   assert(order,'recent chats must come before suggestions');
   assert.deepEqual(await page.locator('#studioResume .studio-resume-item strong').allTextContents(),['Connect a provider','Chat 1','Chat 2','Chat 3']);
   assert(await page.getByRole('button',{name:'All chats',exact:true}).isVisible());
   assert.match(await page.locator('#studioResume .studio-resume-item').nth(1).innerText(),/1 message$/);
 });

 await scenario('answer actions: Copy and Regenerate visible, the rest in a keyboard menu',base({conversations:[conv('c','Code',Date.now(),[{id:'u',role:'user',content:'make a page'},{id:'a',role:'assistant',content:'```html\n<!doctype html><html><body>x</body></html>\n```'}])]}),async page=>{
   await page.evaluate(()=>{conv=db.conversations[0];renderAll();});
   const bar=page.locator('.msg.assistant .action-bar');
   for(const n of ['Copy','Regenerate','Preview','More actions']) assert(await bar.getByRole('button',{name:n,exact:true}).isVisible(),n+' missing');
   assert.equal(await bar.getByRole('button',{name:'Review & Improve'}).count(),0,'secondary action should be in the menu');
   await bar.getByRole('button',{name:'More actions'}).click();
   assert.equal(await bar.getByRole('button',{name:'More actions'}).getAttribute('aria-expanded'),'true');
   assert.deepEqual(await page.getByRole('menuitem').allTextContents(),['Compare models','Review & Improve','Save artifact']);
   assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Compare models');
   await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Review & Improve');
   await page.keyboard.press('Escape');assert.equal(await page.locator('.msg-menu').count(),0);
   await bar.getByRole('button',{name:'More actions'}).click();
   assert.equal(await page.evaluate(()=>window.kitaHandleBack()),true,'Android back closes the menu');
   assert.equal(await page.locator('.msg-menu').count(),0);
   await bar.getByRole('button',{name:'More actions'}).click();await page.getByRole('menuitem',{name:'Save artifact'}).click();
   assert.equal(await page.evaluate(()=>db.artifacts.length),1);
   await page.evaluate(()=>{const seen=[];window.NazShare={text:t=>seen.push(t)};window.__shared=seen;renderAll();});
   await bar.getByRole('button',{name:'More actions'}).click();await page.getByRole('menuitem',{name:'Share'}).click();
   assert.equal(await page.evaluate(()=>window.__shared[0].startsWith('```html')),true);
 });

 await scenario('jump to latest appears away from the bottom and returns there',base({conversations:[conv('c','Long',Date.now(),[{id:'u',role:'user',content:'long'},{id:'a',role:'assistant',content:longAnswer}])]}),async page=>{
   await page.evaluate(()=>{conv=db.conversations[0];renderAll();});
   const jump=page.locator('#jumpLatest');
   await page.waitForFunction(()=>document.querySelector('#jumpLatest').hidden);
   await page.evaluate(()=>{document.querySelector('#chatScroll').scrollTop=0;});
   await jump.waitFor({state:'visible'});
   await jump.click();
   await page.waitForFunction(()=>{const s=document.querySelector('#chatScroll');return s.scrollHeight-s.scrollTop-s.clientHeight<50;});
   await page.waitForFunction(()=>document.querySelector('#jumpLatest').hidden);
 });

 await scenario('provider errors read as advice with Try again',base({conversations:[]}),async page=>{
   const cases=await page.evaluate(()=>{const m={provider:{baseUrl:'https://api.test/v1'}};return {
     auth:friendlyProviderError('HTTP 401 {"error":"bad key"}',m),rate:friendlyProviderError('HTTP 429 slow down',m),
     quota:friendlyProviderError('HTTP 400 insufficient_quota',m),down:friendlyProviderError('HTTP 503 upstream',m),
     net:friendlyProviderError('Network error: connection failed',m),locked:friendlyProviderError('Network error: This API key is locked to https://a.test. Re-enter the key',m),
     other:friendlyProviderError('Something odd',m)};});
   assert.match(cases.auth,/api\.test did not accept the API key \(401\)/);assert.match(cases.auth,/`HTTP 401/);
   assert.match(cases.rate,/Too many requests/);assert.match(cases.quota,/out of credit or quota/);
   assert.match(cases.down,/had a problem \(503\)/);assert.match(cases.net,/Could not reach api\.test/);
   assert.match(cases.locked,/locked to https:\/\/a\.test/);assert.equal(cases.other,'⚠️ **Error:** Something odd');
   await page.route('https://api.test/v1/chat/completions',r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":{"message":"Incorrect API key"}}'}));
   await page.fill('#promptInput','hello');await page.click('#sendBtn');
   await page.waitForFunction(()=>!generating);
   const last=await page.evaluate(()=>({content:conv.messages.at(-1).content,failed:conv.messages.at(-1).failed}));
   assert.match(last.content,/did not accept the API key/);assert.equal(last.failed,true);
   await page.unroute('https://api.test/v1/chat/completions');
   await page.route('https://api.test/v1/chat/completions',r=>r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content:'Fixed answer'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'}));
   await page.locator('.msg.assistant').last().getByRole('button',{name:'Try again'}).click();
   await page.waitForFunction(()=>!generating&&conv.messages.at(-1).content==='Fixed answer');
   assert.equal(await page.locator('.msg.assistant').last().getByRole('button',{name:'Try again'}).count(),0);
 });

 await scenario('offline notice follows the connection',base({}),async (page,ctx)=>{
   assert.equal(await page.locator('#offlineNotice').isVisible(),false);
   await ctx.setOffline(true);await page.waitForFunction(()=>!document.querySelector('#offlineNotice').hidden);
   assert.match(await page.locator('#offlineNotice').innerText(),/offline/);
   await ctx.setOffline(false);await page.waitForFunction(()=>document.querySelector('#offlineNotice').hidden);
 });

 await scenario('Tools rows: project, voice, style and library share one pattern',base({}),async page=>{
   await page.evaluate(()=>openToolsSheet());
   const rows=await page.locator('#toolsSheetBody .tools-row').count();assert.equal(rows,7,'5 rows plus the 4.9.0 agent and background rows');
   assert(await page.getByRole('button',{name:'Project: None',exact:true}).isVisible());
   for(const n of ['Dictate','Read latest answer aloud','New response style','Open prompt & artifact library'])assert(await page.getByRole('button',{name:n}).isVisible(),n);
   assert(await page.getByRole('combobox',{name:'Response style'}).isVisible());
   const tooSmall=await page.evaluate(()=>[...document.querySelectorAll('#toolsSheetBody button, #toolsSheetBody select')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect()).filter(r=>r.height<44).length);
   assert.equal(tooSmall,0,'touch targets under 44px');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 });

 await scenario('connector gallery adds known MCP servers in one tap',base({}),async page=>{
   await page.evaluate(()=>{window.__refreshed=[];mcpRefreshTools=async s=>{window.__refreshed.push(s.url);s.tools=[{name:'ask'}];s.toolCount=1;save();return s.tools;};
     window.__oauth=[];window.NazOAuth={start:(url,id,client)=>window.__oauth.push([url,client]),hasToken:()=>false,signOut:()=>{}};
     renderSettingsHub();openSheet('setSheet');renderMcpSettings();});
   const rows=page.locator('.connector-row');
   assert.equal(await rows.count(),11);
   assert.match(await rows.filter({hasText:'Vercel'}).innerText(),/only accepts apps it has approved/);
   await page.getByRole('button',{name:'Add DeepWiki',exact:true}).click();
   await page.waitForFunction(()=>window.__refreshed.length===1);
   assert.deepEqual(await page.evaluate(()=>window.__refreshed),['https://mcp.deepwiki.com/mcp']);
   await page.getByRole('button',{name:'Add Linear',exact:true}).click();
   assert.deepEqual(await page.evaluate(()=>window.__oauth),[['https://mcp.linear.app/mcp','']]);
   assert.deepEqual(await page.evaluate(()=>mcpServers().map(s=>s.name)),['DeepWiki','Linear']);
   assert(await page.getByRole('button',{name:'Added: Linear',exact:true}).isDisabled());
   assert.equal(await page.evaluate(()=>MCP_CONNECTORS.every(c=>/^https:\/\//.test(c.url)&&!/\/sse\/?$/.test(c.url))),true,'connectors must be HTTPS Streamable HTTP endpoints');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 });

 await b.close();
 const failed=results.filter(x=>!x).length;
 console.log(`4.6.0 interface: ${results.length-failed}/${results.length} passed`);
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
