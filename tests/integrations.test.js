const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.10.0: Chat | Code modes and publishing to Vercel, Cloudflare (Pages, Workers) and
// GitHub (repository, Pages) with mocked service APIs.
const PAGE='<!doctype html><html><body>Hi</body></html>';
const PAGE_HASH='788e3bf7836e296a075a37322a3a9984'; // blake3(base64(PAGE)+"html")[:32] from the reference implementation
const seed=extra=>({schemaVersion:3,onboardingDone:true,thinking:false,search:false,autoCheckCode:false,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{},capabilities:{tools:false}}],lastProviderId:'p',lastModelId:'m',conversations:[],projects:[],...extra});
const sse=t=>'data: '+JSON.stringify({choices:[{delta:{content:t}}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
const json=(r,status,obj)=>r.fulfill({status,headers:{'content-type':'application/json'},body:JSON.stringify(obj)});

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function'&&typeof publishSite==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }
 const confirm=async page=>{await page.locator('#customDialogScrim.open #customDialogConfirm').click();};
 const pageConv={id:'c1',title:'Kopi Kita',mode:'code',updatedAt:Date.now(),messages:[{id:'u',role:'user',content:'buat page'},{id:'a',role:'assistant',content:'```html\n'+PAGE+'\n```'}]};
 async function connect(page,service,routes,extra){
   await page.evaluate(([s,e])=>connectIntegration(s,'tok-'+s+'-123456789',e||{}),[service,extra]);
 }

 await scenario('Chat | Code: separate lists, mode switch, build requests move to Code',seed({conversations:[{id:'a',title:'Soalan',mode:'chat',updatedAt:2,messages:[{id:'1',role:'user',content:'hi'}]},{id:'b',title:'Site lama',updatedAt:1,messages:[{id:'1',role:'user',content:'x'},{id:'2',role:'assistant',content:'```html\n<!doctype html><html></html>\n```'}]}]}),async page=>{
   // Old conversations: the one that built a page is classified as Code.
   assert.deepEqual(await page.evaluate(()=>db.conversations.map(c=>convMode(c))),['chat','code']);
   assert.equal(await page.evaluate(()=>'mode' in db.conversations[1]),false,'stored data is not rewritten');
   await page.evaluate(()=>{renderSidebar();});
   assert.deepEqual(await page.locator('#convList .conv-item .t').allTextContents(),['Soalan']);
   await page.locator('.home-mode .mode-tab[data-mode="code"]').click();
   assert.equal(await page.evaluate(()=>db.uiMode),'code');
   assert.deepEqual(await page.locator('#convList .conv-item .t').allTextContents(),['Site lama']);
   assert.equal(await page.getAttribute('#promptInput','placeholder'),'Describe what to build…');
   assert.match(await page.locator('.studio-home h2').innerText(),/Publish from your phone/);
   // A new conversation in Code mode is a Code project and gets the Code prompt.
   const reqs=[];await page.route('https://api.test/v1/chat/completions',r=>{reqs.push(JSON.parse(r.request().postData()));r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse('ok')});});
   await page.fill('#promptInput','apa itu flexbox');await page.click('#sendBtn');await page.waitForFunction(()=>!generating);
   assert.equal(await page.evaluate(()=>conv.mode),'code');
   assert.ok(reqs[0].messages.some(m=>m.role==='system'&&/Code mode:/.test(m.content)));
   // Short build requests count as builds in Code mode only.
   assert.deepEqual(await page.evaluate(()=>[isCodeBuildRequest('buat kalkulator'),isLongBuildRequest('buat kalkulator'),isCodeBuildRequest('kenapa error ni'),isCodeBuildRequest('apa itu css')]),[true,false,false,false]);
   // Chat mode: a build request in a fresh chat moves it to Code.
   await page.evaluate(()=>openSidebar());await page.locator('.side-mode .mode-tab[data-mode="chat"]').click();await page.evaluate(()=>closeSidebar());
   assert.equal(await page.evaluate(()=>conv),null,'switching mode leaves a non-empty conversation');
   await page.evaluate(()=>{db.agentConcurrency=1;});
   await page.unroute('https://api.test/v1/chat/completions');
   await page.route('https://api.test/v1/chat/completions',r=>r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse('ok')}));
   await page.fill('#promptInput','buat landing page lengkap untuk kedai kopi');await page.click('#sendBtn');await page.waitForFunction(()=>!generating,null,{timeout:30000});
   assert.equal(await page.evaluate(()=>conv.mode),'code');assert.equal(await page.evaluate(()=>db.uiMode),'code');
   // Opening a conversation follows its mode.
   await page.evaluate(()=>studioOpenConversation(db.conversations.find(c=>c.id==='a')));
   assert.equal(await page.evaluate(()=>db.uiMode),'chat');
 });

 await scenario('Integrations: connect, wrong token message, disconnect',seed(),async page=>{
   const auth=[];
   await page.route('https://api.github.com/**',r=>{auth.push([r.request().url(),r.request().headers().authorization]);
     if(r.request().headers().authorization==='Bearer bad-token-123456') return json(r,401,{message:'Bad credentials'});
     return json(r,200,{login:'nazz'});});
   await page.evaluate(()=>{renderIntegrationsSettings();openSheet('setSheet');});
   const card=page.locator('.integration-card[data-service="github"]');
   await card.locator('input').fill('bad-token-123456');await card.getByRole('button',{name:'Connect GitHub'}).click();
   await page.waitForFunction(()=>document.querySelector('.toast, #toast')?.textContent?.includes('refused')||false,null,{timeout:5000}).catch(()=>{});
   assert.equal(await page.evaluate(()=>integrationConnected('github')),false);
   await card.locator('input').fill('ghp_good_token_1234');await card.getByRole('button',{name:'Connect GitHub'}).click();
   await page.waitForFunction(()=>integrationConnected('github'));
   const st=await page.evaluate(()=>integrationState('github'));
   assert.equal(st.login,'nazz');assert.equal(st.hint,'1234');assert.equal(JSON.stringify(st).includes('ghp_good'),false,'token is never saved in app data');
   assert.equal(auth.at(-1)[1],'Bearer ghp_good_token_1234');
   assert.match(await page.locator('.integration-card[data-service="github"]').innerText(),/Connected as @nazz/);
   // Settings hub shows the row.
   await page.evaluate(()=>renderSettingsHub());
   assert.match(await page.locator('#provList').innerText(),/Integrations\s+GitHub/);
   await page.evaluate(()=>{renderIntegrationsSettings();});
   await page.locator('.integration-card[data-service="github"]').getByRole('button',{name:'Disconnect'}).click();await confirm(page);
   await page.waitForFunction(()=>!integrationConnected('github'));
 });

 await scenario('Publish to Vercel from the artifact card',seed({conversations:[pageConv],uiMode:'code'}),async page=>{
   const calls=[];
   await page.route('https://api.vercel.com/**',async r=>{const u=new URL(r.request().url());calls.push([r.request().method(),u.pathname+u.search,r.request().postData()]);
     if(u.pathname==='/v2/user') return json(r,200,{user:{username:'nazz'}});
     if(u.pathname==='/v13/deployments'&&r.request().method()==='POST') return json(r,200,{id:'dpl_1',url:'kopi-kita-abc.vercel.app',readyState:'BUILDING'});
     if(u.pathname==='/v13/deployments/dpl_1') return json(r,200,{id:'dpl_1',url:'kopi-kita-abc.vercel.app',readyState:'READY',alias:['kopi-kita.vercel.app']});
     return json(r,404,{error:{message:'nope'}});});
   await connect(page,'vercel');
   await page.evaluate(()=>studioOpenConversation(db.conversations[0]));
   await page.locator('.artifact-btn.publish').click();
   assert.equal(await page.inputValue('#publishName'),'kopi-kita');
   await page.locator('.publish-target[data-target="vercel"]').click();
   assert.match(await page.locator('.publish-preview').innerText(),/https:\/\/kopi-kita\.vercel\.app/);
   await page.click('#publishGo');await confirm(page);
   await page.waitForSelector('.publish-done',{timeout:15000});
   assert.match(await page.locator('.publish-done').innerText(),/kopi-kita\.vercel\.app/);
   const post=calls.find(c=>c[0]==='POST');const body=JSON.parse(post[2]);
   assert.match(post[1],/skipAutoDetectionConfirmation=1/);
   assert.equal(body.name,'kopi-kita');assert.equal(body.target,'production');assert.deepEqual(body.files,[{file:'index.html',data:PAGE,encoding:'utf-8'}]);
   const site=await page.evaluate(()=>conv.sites.vercel);assert.equal(site.url,'https://kopi-kita.vercel.app');
   // Code home lists the published site.
   await page.evaluate(()=>{studioNewChat();});
   assert.match(await page.locator('.code-sites').innerText(),/kopi-kita\.vercel\.app/);
 });

 await scenario('Publish to Cloudflare Pages: project, BLAKE3 upload, manifest deployment',seed(),async page=>{
   const calls=[];
   await page.route('https://api.cloudflare.com/**',async r=>{const u=new URL(r.request().url()),m=r.request().method(),h=r.request().headers();calls.push({m,p:u.pathname,auth:h.authorization,ct:h['content-type'],body:r.request().postData()});
     const p=u.pathname;
     if(p.endsWith('/user/tokens/verify')) return json(r,200,{success:true,result:{status:'active'}});
     if(p.endsWith('/accounts')) return json(r,200,{success:true,result:[{id:'acc1',name:'Nazz'}]});
     if(p.endsWith('/workers/subdomain')) return json(r,200,{success:true,result:{subdomain:'nazz'}});
     if(p.endsWith('/pages/projects/kopi')&&m==='GET') return json(r,404,{success:false,errors:[{code:8000007,message:'Project not found'}]});
     if(p.endsWith('/pages/projects')&&m==='POST') return json(r,200,{success:true,result:{name:'kopi',subdomain:'kopi-9x.pages.dev'}});
     if(p.endsWith('/upload-token')) return json(r,200,{success:true,result:{jwt:'JWT123'}});
     if(p.endsWith('/pages/assets/check-missing')) return json(r,200,{success:true,result:JSON.parse(r.request().postData()).hashes});
     if(p.endsWith('/pages/assets/upload')||p.endsWith('/pages/assets/upsert-hashes')) return json(r,200,{success:true,result:null});
     if(p.endsWith('/pages/projects/kopi/deployments')) return json(r,200,{success:true,result:{url:'https://abc123.kopi-9x.pages.dev'}});
     return json(r,404,{success:false,errors:[{message:'unexpected '+p}]});});
   await connect(page,'cloudflare');
   const st=await page.evaluate(()=>integrationState('cloudflare'));assert.equal(st.accountId,'acc1');assert.equal(st.subdomain,'nazz');
   const r=await page.evaluate(PAGE=>publishSite('cloudflare-pages','Kopi',[{path:'index.html',content:PAGE}]),PAGE);
   assert.equal(r.url,'https://kopi-9x.pages.dev');
   const upload=calls.find(c=>c.p.endsWith('/pages/assets/upload'));const items=JSON.parse(upload.body);
   assert.equal(items[0].key,PAGE_HASH,'BLAKE3 content key matches the reference');assert.equal(items[0].base64,true);assert.equal(items[0].metadata.contentType,'text/html; charset=utf-8');
   assert.equal(upload.auth,'Bearer JWT123','asset upload uses the short-lived upload token, not the API token');
   const dep=calls.find(c=>c.p.endsWith('/deployments'));
   assert.match(dep.ct,/^multipart\/form-data; boundary=/);assert.match(dep.body,new RegExp('name="manifest"\\r\\n\\r\\n\\{"/index.html":"'+PAGE_HASH+'"\\}'));
   assert.equal(dep.auth,'Bearer tok-cloudflare-123456789');
 });

 await scenario('Publish to Cloudflare Workers: module upload and workers.dev route',seed(),async page=>{
   const calls=[];
   await page.route('https://api.cloudflare.com/**',async r=>{const u=new URL(r.request().url()),m=r.request().method();calls.push({m,p:u.pathname,ct:r.request().headers()['content-type'],body:r.request().postData()});
     const p=u.pathname;
     if(p.endsWith('/user/tokens/verify')) return json(r,200,{success:true});
     if(p.endsWith('/accounts')) return json(r,200,{success:true,result:[{id:'acc1',name:'Nazz'}]});
     if(p.endsWith('/workers/subdomain')) return json(r,200,{success:true,result:{subdomain:'nazz'}});
     if(p.endsWith('/workers/scripts/kopi')&&m==='PUT') return json(r,200,{success:true,result:{id:'kopi'}});
     if(p.endsWith('/workers/scripts/kopi/subdomain')) return json(r,200,{success:true,result:{enabled:true}});
     return json(r,404,{success:false,errors:[{message:'unexpected '+p}]});});
   await connect(page,'cloudflare');
   const r=await page.evaluate(PAGE=>publishSite('cloudflare-workers','kopi',[{path:'index.html',content:PAGE},{path:'style.css',content:'body{color:red}'}]),PAGE);
   assert.equal(r.url,'https://kopi.nazz.workers.dev');
   const put=calls.find(c=>c.m==='PUT');
   assert.match(put.body,/name="metadata"[\s\S]*"main_module":"worker\.js"/);assert.match(put.body,/filename="worker\.js"\r\nContent-Type: application\/javascript\+module/);
   // The generated Worker serves the files.
   const src=await page.evaluate(PAGE=>workerSource([{path:'index.html',content:PAGE},{path:'style.css',content:'body{color:red}'}]),PAGE);
   const mod=await import('data:text/javascript,'+encodeURIComponent(src));
   const res=await mod.default.fetch(new Request('https://kopi.nazz.workers.dev/'));assert.equal(await res.text(),PAGE);assert.match(res.headers.get('content-type'),/text\/html/);
   const css=await mod.default.fetch(new Request('https://kopi.nazz.workers.dev/style.css'));assert.equal(await css.text(),'body{color:red}');
   assert.equal((await mod.default.fetch(new Request('https://kopi.nazz.workers.dev/nope.png'))).status,404);
 });

 await scenario('Publish to GitHub Pages: new public repo, one commit, Pages on',seed(),async page=>{
   const calls=[];
   await page.route('https://api.github.com/**',async r=>{const u=new URL(r.request().url()),m=r.request().method(),p=u.pathname;calls.push({m,p,body:r.request().postData(),h:r.request().headers()});
     if(p==='/user') return json(r,200,{login:'Nazz'});
     if(p==='/repos/Nazz/kopi'&&m==='GET') return json(r,404,{message:'Not Found'});
     if(p==='/user/repos') return json(r,201,{name:'kopi',default_branch:'main',html_url:'https://github.com/Nazz/kopi'});
     if(p==='/repos/Nazz/kopi/git/ref/heads/main') return json(r,200,{object:{sha:'c0'}});
     if(p==='/repos/Nazz/kopi/git/commits/c0') return json(r,200,{tree:{sha:'t0'}});
     if(p==='/repos/Nazz/kopi/git/trees') return json(r,201,{sha:'t1'});
     if(p==='/repos/Nazz/kopi/git/commits') return json(r,201,{sha:'c1'});
     if(p==='/repos/Nazz/kopi/git/refs/heads/main'&&m==='PATCH') return json(r,200,{object:{sha:'c1'}});
     if(p==='/repos/Nazz/kopi/pages'&&m==='GET') return json(r,404,{message:'Not Found'});
     if(p==='/repos/Nazz/kopi/pages'&&m==='POST') return json(r,201,{html_url:'https://nazz.github.io/kopi/'});
     if(p==='/repos/Nazz/kopi/pages/builds/latest') return json(r,200,{status:(calls.filter(c=>c.p.endsWith('/builds/latest')).length>1)?'built':'building'});
     return json(r,404,{message:'unexpected '+m+' '+p});});
   await connect(page,'github');
   const r=await page.evaluate(PAGE=>publishSite('github-pages','kopi',[{path:'index.html',content:PAGE}],()=>{},{buildPollMs:10}),PAGE);
   assert.equal(r.url,'https://nazz.github.io/kopi/');assert.equal(r.detail,'Live','waits until the Pages build is done');
   assert.equal(calls.filter(c=>c.p.endsWith('/builds/latest')).length,2);
   const create=JSON.parse(calls.find(c=>c.p==='/user/repos').body);assert.deepEqual([create.name,create.private,create.auto_init],['kopi',false,true]);
   const tree=JSON.parse(calls.find(c=>c.p.endsWith('/git/trees')).body);assert.deepEqual(tree,{base_tree:'t0',tree:[{path:'index.html',mode:'100644',type:'blob',content:PAGE},{path:'.nojekyll',mode:'100644',type:'blob',content:''}]});
   assert.deepEqual(JSON.parse(calls.find(c=>c.m==='PATCH').body),{sha:'c1'});
   assert.equal(calls.find(c=>c.p==='/user/repos').h['x-github-api-version'],'2022-11-28');
   // Repository only: private, no Pages.
   calls.length=0;
   const r2=await page.evaluate(PAGE=>publishSite('github','kopi',[{path:'index.html',content:PAGE}]),PAGE);
   assert.equal(r2.url,'https://github.com/Nazz/kopi');assert.equal(JSON.parse(calls.find(c=>c.p==='/user/repos').body).private,true);
   assert.equal(calls.some(c=>c.p.endsWith('/pages')),false);
   // An existing empty repository (no branch yet): files are added with the contents API.
   await page.unroute('https://api.github.com/**');calls.length=0;
   await page.route('https://api.github.com/**',async r=>{const u=new URL(r.request().url()),m=r.request().method(),p=u.pathname;calls.push({m,p,body:r.request().postData()});
     if(p==='/repos/Nazz/empty'&&m==='GET') return json(r,200,{name:'empty',default_branch:'main',html_url:'https://github.com/Nazz/empty'});
     if(p==='/repos/Nazz/empty/git/ref/heads/main') return json(r,409,{message:'Git Repository is empty.'});
     if(p.startsWith('/repos/Nazz/empty/contents/')&&m==='PUT') return json(r,201,{content:{path:p}});
     return json(r,404,{message:'unexpected '+m+' '+p});});
   const r3=await page.evaluate(PAGE=>publishSite('github','empty',[{path:'index.html',content:PAGE},{path:'css/site.css',content:'a{}'}]),PAGE);
   assert.equal(r3.url,'https://github.com/Nazz/empty');
   const puts=calls.filter(c=>c.m==='PUT');assert.deepEqual(puts.map(c=>c.p),['/repos/Nazz/empty/contents/index.html','/repos/Nazz/empty/contents/css/site.css']);
   assert.equal(JSON.parse(puts[0].body).content,Buffer.from(PAGE).toString('base64'));
 });

 await scenario('GitHub Pages on an existing private repo: ask to make it public; decline commits nothing',seed(),async page=>{
   const calls=[];
   await page.route('https://api.github.com/**',async r=>{const u=new URL(r.request().url()),m=r.request().method(),p=u.pathname;calls.push({m,p,body:r.request().postData()});
     if(p==='/user') return json(r,200,{login:'nxsmlx'});
     if(p==='/repos/nxsmlx/kopi'&&m==='GET') return json(r,200,{name:'kopi',private:true,default_branch:'main',html_url:'https://github.com/nxsmlx/kopi'});
     if(p==='/repos/nxsmlx/kopi'&&m==='PATCH') return json(r,200,{name:'kopi',private:false,default_branch:'main',html_url:'https://github.com/nxsmlx/kopi'});
     if(p.endsWith('/git/ref/heads/main')) return json(r,200,{object:{sha:'c0'}});
     if(p.endsWith('/git/commits/c0')) return json(r,200,{tree:{sha:'t0'}});
     if(p.endsWith('/git/trees')) return json(r,201,{sha:'t1'});
     if(p.endsWith('/git/commits')) return json(r,201,{sha:'c1'});
     if(p.endsWith('/git/refs/heads/main')) return json(r,200,{});
     if(p.endsWith('/pages')&&m==='GET') return json(r,404,{message:'Not Found'});
     if(p.endsWith('/pages')&&m==='POST') return json(r,201,{html_url:'https://nxsmlx.github.io/kopi/'});
     if(p.endsWith('/pages/builds/latest')) return json(r,200,{status:'built'});
     return json(r,404,{message:'unexpected '+m+' '+p});});
   await connect(page,'github');
   // Declined: a clear message, and nothing is changed or committed.
   const err=await page.evaluate(PAGE=>publishSite('github-pages','kopi',[{path:'index.html',content:PAGE}],()=>{},{confirmPublic:async()=>false}).then(()=>'ok',e=>e.message),PAGE);
   assert.match(err,/nxsmlx\/kopi is private, and GitHub Pages on a free plan needs a public repository/);
   assert.equal(calls.filter(c=>c.m!=='GET').length,0);
   // Accepted: made public, then committed, then Pages.
   calls.length=0;let asked='';
   const r=await page.evaluate(PAGE=>{window.__asked='';return publishSite('github-pages','kopi',[{path:'index.html',content:PAGE}],()=>{},{buildPollMs:10,confirmPublic:async full=>{window.__asked=full;return true;}});},PAGE);
   assert.equal(await page.evaluate(()=>window.__asked),'nxsmlx/kopi');
   assert.equal(r.url,'https://nxsmlx.github.io/kopi/');
   assert.equal(r.detail,'Live');
   const writes=calls.filter(c=>c.m!=='GET').map(c=>c.m+' '+c.p);
   assert.deepEqual(writes,['PATCH /repos/nxsmlx/kopi','POST /repos/nxsmlx/kopi/git/trees','POST /repos/nxsmlx/kopi/git/commits','PATCH /repos/nxsmlx/kopi/git/refs/heads/main','POST /repos/nxsmlx/kopi/pages']);
   assert.deepEqual(JSON.parse(calls.find(c=>c.m==='PATCH'&&c.p==='/repos/nxsmlx/kopi').body),{private:false});
   // A plan error from Pages reads as advice.
   await page.unroute('https://api.github.com/**');
   await page.route('https://api.github.com/**',async r=>{const u=new URL(r.request().url()),m=r.request().method(),p=u.pathname;
     if(p==='/repos/nxsmlx/kopi'&&m==='GET') return json(r,200,{name:'kopi',private:false,default_branch:'main'});
     if(p.endsWith('/git/ref/heads/main')) return json(r,200,{object:{sha:'c0'}});
     if(p.endsWith('/git/commits/c0')) return json(r,200,{tree:{sha:'t0'}});
     if(p.endsWith('/git/trees')) return json(r,201,{sha:'t1'});
     if(p.endsWith('/git/commits')) return json(r,201,{sha:'c1'});
     if(p.endsWith('/git/refs/heads/main')) return json(r,200,{});
     if(p.endsWith('/pages')&&m==='GET') return json(r,404,{message:'Not Found'});
     if(p.endsWith('/pages')&&m==='POST') return json(r,422,{message:'Your current plan does not support GitHub Pages for this repository.'});
     return json(r,404,{message:'unexpected'});});
   const err2=await page.evaluate(PAGE=>publishSite('github-pages','kopi',[{path:'index.html',content:PAGE}]).then(()=>'ok',e=>e.message),PAGE);
   assert.match(err2,/GitHub Pages is not available for nxsmlx\/kopi on your plan\. Make the repository public/);
   // A failed Pages build is reported; a slow one says it is still building.
   await page.unroute('https://api.github.com/**');
   let buildStatus='errored';
   await page.route('https://api.github.com/**',async r=>{const u=new URL(r.request().url()),m=r.request().method(),p=u.pathname;
     if(p==='/repos/nxsmlx/kopi'&&m==='GET') return json(r,200,{name:'kopi',private:false,default_branch:'main'});
     if(p.endsWith('/git/ref/heads/main')) return json(r,200,{object:{sha:'c0'}});
     if(p.endsWith('/git/commits/c0')) return json(r,200,{tree:{sha:'t0'}});
     if(p.endsWith('/git/trees')) return json(r,201,{sha:'t1'});
     if(p.endsWith('/git/commits')) return json(r,201,{sha:'c1'});
     if(p.endsWith('/git/refs/heads/main')) return json(r,200,{});
     if(p.endsWith('/pages')&&m==='GET') return json(r,200,{html_url:'https://nxsmlx.github.io/kopi/'});
     if(p.endsWith('/pages/builds/latest')) return json(r,200,{status:buildStatus,error:{message:'Page build failed.'}});
     return json(r,404,{message:'unexpected'});});
   const err3=await page.evaluate(PAGE=>publishSite('github-pages','kopi',[{path:'index.html',content:PAGE}],()=>{},{buildPollMs:10}).then(()=>'ok',e=>e.message),PAGE);
   assert.match(err3,/could not build the site: Page build failed/);
   buildStatus='building';
   const slow=await page.evaluate(PAGE=>publishSite('github-pages','kopi',[{path:'index.html',content:PAGE}],()=>{},{buildPollMs:10,buildWaitMs:60}),PAGE);
   assert.match(slow.detail,/Still building on GitHub/);
   // Default names are short and cut at a word.
   assert.equal(await page.evaluate(()=>siteSlug('Kopi Pelita — Pemanggang kelompok kecil, ruang kopi kampung')),'kopi-pelita-pemanggang-kelompok-kecil');
 });

 await scenario('Android: tokens go to Keystore and only through the native secret path',seed(),async page=>{
   // HAS_NATIVE is fixed at page load, so the request builder is checked directly.
   const req=await page.evaluate(async()=>{
     const stored={};window.NazSecrets={get:()=>'',put:(ref,v)=>{stored[ref]=v;return true;},has:ref=>!!stored[ref],remove:ref=>{delete stored[ref];return true;},listProviderKeys:()=>'[]'};
     const seen=[];const real=window.netFetch;window.netFetch=async(url,o)=>{seen.push({url,secretRef:o.secretRef||null,auth:o.headers.Authorization||null});return {ok:true,status:200,text:async()=>'{"login":"nazz","result":{"jwt":"J"}}'};};
     try{
       await connectIntegration('github','ghp_native_token_9999');
       await integrationFetch('cloudflare','/client/v4/pages/assets/upload',{method:'POST',auth:false,headers:{Authorization:'Bearer J'},body:[]});
     }finally{window.netFetch=real;}
     return {stored,seen,state:integrationState('github')};
   });
   assert.deepEqual(req.stored,{'integration:github':'ghp_native_token_9999'});
   assert.deepEqual(req.seen[0],{url:'https://api.github.com/user',secretRef:'integration:github',auth:null});
   assert.deepEqual(req.seen[1],{url:'https://api.cloudflare.com/client/v4/pages/assets/upload',secretRef:null,auth:'Bearer J'});
   assert.equal(JSON.stringify(req.state).includes('native_token'),false);
 });

 await b.close();
 if(failed){console.error(failed+' failed');process.exitCode=1;}else console.log('4.10.0 integrations: all passed');
})();
