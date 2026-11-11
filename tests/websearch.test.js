const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.13.0: Web & DNS. Search order (model search → keyed search APIs → DuckDuckGo),
// several keys per service used in turn, each service's request format, and the DNS
// setting handed to native code.
const seed=extra=>({schemaVersion:3,onboardingDone:true,thinking:false,search:true,providers:[{id:'p',name:'GripHub',baseUrl:'https://gw.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'gw-key',headers:[],selectedModels:['m'],modelMeta:{}}],lastProviderId:'p',lastModelId:'m',conversations:[],projects:[],...extra});
const json=(r,status,obj)=>r.fulfill({status,headers:{'content-type':'application/json'},body:JSON.stringify(obj)});

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderWebDnsSettings==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }
 const duck=async(page,hits)=>{await page.route('https://html.duckduckgo.com/**',r=>{hits.push('duck');r.fulfill({status:200,contentType:'text/html',body:'<div class="result"><a class="result__a" href="https://duck.example/a">Duck result</a><div class="result__snippet">from duck</div></div>'});});};

 await scenario('no keys and no model search: the built-in DuckDuckGo search answers',seed(),async page=>{
   const hits=[];await duck(page,hits);
   const rows=await page.evaluate(()=>webSearch('kopi kl'));
   assert.equal(rows[0].url,'https://duck.example/a');assert.ok(hits.length>=1);
 });

 await scenario('search API keys: saved per service, used in turn, a refused key hands over to the next',seed(),async page=>{
   const seen=[];
   await page.route('https://api.search.brave.com/**',r=>{const k=r.request().headers()['x-subscription-token'];seen.push(k);
     if(k==='brave-bad-1111') return json(r,401,{message:'invalid key'});
     return json(r,200,{web:{results:[{title:'Brave hit',url:'https://brave.example/1',description:'<strong>kopi</strong> spot',extra_snippets:['more']}]}});});
   await page.evaluate(()=>{renderWebDnsSettings();openSheet('setSheet');});
   const card=page.locator('.search-card[data-provider="brave"]');
   await card.locator('textarea').fill('brave-bad-1111\nbrave-good-2222\n');await card.getByRole('button',{name:'Save'}).click();
   const st=await page.evaluate(()=>webSettings().keys.brave);assert.deepEqual(st,{count:2,hints:['1111','2222']});
   assert.equal(JSON.stringify(await page.evaluate(()=>db)).includes('brave-good'),false,'keys never stored in app data');
   assert.match(await page.locator('.search-card[data-provider="brave"]').innerText(),/2 keys saved · …1111, …2222/);
   const rows=await page.evaluate(()=>webSearch('kopi'));
   assert.deepEqual(seen,['brave-bad-1111','brave-good-2222']);
   assert.deepEqual(rows[0],{title:'Brave hit',url:'https://brave.example/1',snippet:'kopi spot more'});
   // The next search starts with the key after the one that worked.
   seen.length=0;await page.evaluate(()=>webSearch('teh'));assert.deepEqual(seen,['brave-bad-1111','brave-good-2222']);
   assert.equal(await page.evaluate(()=>webSettings().turn.brave),0);
   // Remove.
   await page.evaluate(()=>renderWebDnsSettings());
   await page.locator('.search-card[data-provider="brave"]').getByRole('button',{name:'Remove'}).click();
   assert.equal(await page.evaluate(()=>searchKeyCount('brave')),0);
 });

 await scenario('every search API is called in its own format',seed(),async page=>{
   const calls={};
   const rec=(id,resp)=>async r=>{calls[id]={method:r.request().method(),headers:r.request().headers(),body:r.request().postData()};json(r,200,resp);};
   await page.route('https://api.tavily.com/**',rec('tavily',{results:[{title:'T',url:'https://t.example',content:'tav'}]}));
   await page.route('https://api.search1api.com/**',rec('search1api',{results:[{title:'S',link:'https://s.example',snippet:'s1'}]}));
   await page.route('https://api.exa.ai/**',rec('exa',{results:[{title:'E',url:'https://e.example',text:'exa text'}]}));
   await page.route('https://google.serper.dev/**',rec('serper',{organic:[{title:'G',link:'https://g.example',snippet:'serp'}]}));
   const out=await page.evaluate(async()=>{const r={};for(const id of ['tavily','search1api','exa','serper']){saveSearchKeys(id,id+'-key-0001');const p=SEARCH_PROVIDERS.find(x=>x.id===id);r[id]=await searchWithKeys(p,'nasi lemak');}return r;});
   assert.equal(out.tavily[0].url,'https://t.example');assert.equal(calls.tavily.headers.authorization,'Bearer tavily-key-0001');assert.deepEqual(JSON.parse(calls.tavily.body),{query:'nasi lemak',max_results:6,search_depth:'basic'});
   assert.equal(out.search1api[0].url,'https://s.example');assert.equal(calls.search1api.headers.authorization,'Bearer search1api-key-0001');
   assert.equal(out.exa[0].content,'exa text');assert.equal(calls.exa.headers['x-api-key'],'exa-key-0001');
   assert.equal(out.serper[0].url,'https://g.example');assert.equal(calls.serper.headers['x-api-key'],'serper-key-0001');assert.deepEqual(JSON.parse(calls.serper.body),{q:'nasi lemak',num:8});
 });

 await scenario('model search runs first: OpenAI Responses web search, then Anthropic Messages web search',seed({webSearch:{openai:{on:true,providerId:'p',model:'gpt-5.6-luna'},anthropic:{on:true,providerId:'p',model:'claude-haiku-5.5'}}}),async page=>{
   const hits=[];await duck(page,hits);let openaiUp=true;const bodies={};
   await page.route('https://gw.test/v1/responses',r=>{bodies.openai={body:JSON.parse(r.request().postData()),auth:r.request().headers().authorization};
     if(!openaiUp) return json(r,500,{error:'down'});
     json(r,200,{output:[{type:'web_search_call'},{type:'message',content:[{type:'output_text',text:'Kopi Pelita opens at 8am.',annotations:[{type:'url_citation',url:'https://kopi.example',title:'Kopi Pelita',start_index:0,end_index:11}]}]}]});});
   await page.route('https://gw.test/v1/messages',r=>{bodies.anthropic={body:JSON.parse(r.request().postData()),headers:r.request().headers()};
     json(r,200,{content:[{type:'server_tool_use'},{type:'web_search_tool_result',content:[{type:'web_search_result',url:'https://a.example',title:'A result'}]},{type:'text',text:'Answer from Claude.',citations:[{type:'web_search_result_location',url:'https://a.example',title:'A result',cited_text:'cited bit'}]}]});});
   const rows=await page.evaluate(()=>webSearch('kopi pelita'));
   assert.deepEqual(rows,[{title:'Kopi Pelita',url:'https://kopi.example',snippet:'Kopi Pelita',content:'Kopi Pelita opens at 8am.'}]);
   assert.equal(bodies.openai.body.model,'gpt-5.6-luna');assert.deepEqual(bodies.openai.body.tools,[{type:'web_search'}]);assert.equal(bodies.openai.auth,'Bearer gw-key');
   assert.equal(bodies.anthropic,undefined,'Anthropic is not asked when OpenAI answered');
   openaiUp=false;
   const rows2=await page.evaluate(()=>webSearch('kopi pelita'));
   assert.deepEqual(rows2,[{title:'A result',url:'https://a.example',snippet:'cited bit',content:'Answer from Claude.'}]);
   assert.equal(bodies.anthropic.body.tools[0].type,'web_search_20250305');assert.equal(bodies.anthropic.headers['anthropic-version'],'2023-06-01');
   assert.equal(hits.length,0,'DuckDuckGo not needed');
 });

 await scenario('DNS: choose Cloudflare, Google, custom DoH or System; handed to native code',seed(),async page=>{
   await page.evaluate(()=>{window.__dns=[];window.NazDns={setMode:(m,u)=>{__dns.push([m,u]);return true;},test:h=>'104.18.1.1',getMode:()=>'system'};renderWebDnsSettings();openSheet('setSheet');});
   const modes=await page.locator('.dns-mode strong').allTextContents();assert.deepEqual(modes,['Cloudflare','Google','Custom DoH','System']);
   assert.equal(await page.locator('.dns-mode.on').getAttribute('data-mode'),'system');
   await page.locator('.dns-mode[data-mode="cloudflare"]').click();
   assert.deepEqual(await page.evaluate(()=>__dns.at(-1)),['cloudflare','']);
   assert.equal(await page.locator('.dns-mode.on').getAttribute('data-mode'),'cloudflare');
   // Custom needs an https address first.
   await page.locator('.dns-mode[data-mode="custom"]').click();
   assert.equal(await page.locator('.dns-mode.on').getAttribute('data-mode'),'cloudflare','not switched without an address');
   await page.fill('#dnsCustom','http://insecure.example/dns-query');await page.getByRole('button',{name:'Use'}).click();
   assert.equal(await page.evaluate(()=>webSettings().dns.mode),'cloudflare');
   await page.fill('#dnsCustom','https://dns.example/dns-query');await page.getByRole('button',{name:'Use'}).click();
   assert.deepEqual(await page.evaluate(()=>[webSettings().dns,__dns.at(-1)]),[{mode:'custom',custom:'https://dns.example/dns-query'},['custom','https://dns.example/dns-query']]);
   // The saved setting is handed to native code on start.
   await page.evaluate(()=>{__dns.length=0;applyDnsSetting();});
   assert.deepEqual(await page.evaluate(()=>__dns),[['custom','https://dns.example/dns-query']]);
   await page.evaluate(()=>renderSettingsHub());
   assert.match(await page.locator('#provList').innerText(),/Web & DNS\s+DNS: Custom DoH · built-in search/);
 });

 await scenario('Android: search keys go to Keystore and are sent natively with the key number',seed(),async page=>{
   const r=await page.evaluate(async()=>{
     const stored={};window.NazSecrets={get:()=>'',put:(ref,v)=>{stored[ref]=v;return true;},has:ref=>!!stored[ref],remove:ref=>{delete stored[ref];return true;},listProviderKeys:()=>'[]'};
     saveSearchKeys('brave','k-one-0001\nk-two-0002');
     const seen=[];const real=window.netFetch;
     window.netFetch=async(url,o)=>{seen.push({url,secretRef:o.secretRef||null,token:o.headers['X-Subscription-Token']||null});return seen.length===1?{ok:false,status:429,text:async()=>'{"message":"rate"}'}:{ok:true,status:200,text:async()=>JSON.stringify({web:{results:[{title:'x',url:'https://x.example'}]}})};};
     try{await webSearch('q');}finally{window.netFetch=real;}
     return {stored,seen};
   });
   assert.deepEqual(r.stored,{'search:brave':'k-one-0001\nk-two-0002'});
   assert.deepEqual(r.seen.map(s=>[s.secretRef,s.token]),[['search:brave#0',null],['search:brave#1',null]]);
 });

 await b.close();
 if(failed){console.error(failed+' failed');process.exitCode=1;}else console.log('4.13.0 web & DNS: all passed');
})();
