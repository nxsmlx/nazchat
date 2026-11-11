const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.12.0: agent team. Orchestrator → Designer → (Database) → Coders → Tester →
// Reviewer → Fixer (only the parts with problems) → Tester again; a model per role.
const SB='https://api.supabase.com';
const enc=o=>'data: '+JSON.stringify(o)+'\n\n';
const done=t=>enc({choices:[{delta:{content:t}}]})+enc({choices:[{delta:{},finish_reason:'stop'}]})+'data: [DONE]\n\n';
const PLAN=db=>'CONTRACT:\n--brand: #6b4f3a\nSection ids: #hero, #menu\nPARTS:\n1. Head — <head> and styles\n2. Hero — #hero\n3. Menu and script — #menu + JS\n'+(db?'DATABASE: bookings':'DATABASE: none');
const PARTS=['<!doctype html><html><head><title>Kopi</title><style>body{margin:0}</style></head><body>','<section id="hero" class="k-section"><h1>Kopi</h1></section>','<section id="menu"><ul><li>Latte</li></ul></section><script>missingHelper()</script></body></html>'];
const FIXED='<section id="menu"><ul><li>Latte</li></ul></section><script>document.body.dataset.ready="1"</script></body></html>';
const CSS=':root{--brand:#6b4f3a}\n.k-section{padding:24px}';
const providers=[
  {id:'p',name:'Fast',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m','small'],modelMeta:{},capabilities:{tools:false}},
  {id:'q',name:'Strong',baseUrl:'https://big.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k2',headers:[],selectedModels:['big'],modelMeta:{},capabilities:{tools:false}}];
const seed=extra=>({schemaVersion:3,onboardingDone:true,thinking:false,search:false,uiMode:'code',providers,lastProviderId:'p',lastModelId:'m',conversations:[],projects:[],...extra});
const ASK='buat landing page lengkap untuk kedai kopi dengan hero dan menu';
const json=(r,status,obj)=>r.fulfill({status,headers:{'content-type':'application/json'},body:JSON.stringify(obj)});

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof runQualityLoop==='function');await run(page);assert.deepEqual(errors.filter(e=>!/missingHelper/.test(e)),[],'only the planted page error');console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }
 // One mock for both providers; classifies each call by role.
 async function team(page,o={}){
   const calls=[];
   const handler=async r=>{const body=JSON.parse(r.request().postData()),sys=body.messages[0]?.content||'',last=body.messages.at(-1).content||'';
     const role=/Break this task into/.test(last)?'orchestrator':/You are the designer/.test(sys)?'designer':/You are the database agent/.test(sys)?'database':/You are the reviewer/.test(sys)?'reviewer':/You are the fixer/.test(sys)?'fixer':/Now write ONLY part/.test(last)?'coder':'other';
     calls.push({role,url:r.request().url(),model:body.model,body});
     let out='plain';
     if(role==='orchestrator') out=PLAN(o.db);
     if(role==='designer') out='```css\n'+CSS+'\n```\n.k-section: every section';
     if(role==='database') out=o.dbSql||'```sql\ncreate table if not exists bookings (id bigint generated always as identity primary key, name text);\nalter table bookings enable row level security;\ncreate policy "insert" on bookings for insert to anon with check (true);\n```\nbookings: table bookings';
     if(role==='coder'){const i=Number(last.match(/Now write ONLY part (\d+)/)[1])-1;out=PARTS[i];}
     if(role==='reviewer') out=o.review??'{"issues":[{"part":3,"severity":"high","problem":"missingHelper is not defined","fix":"remove the call"},{"part":2,"severity":"low","problem":"heading could be larger"}]}';
     if(role==='fixer') out=FIXED;
     await r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:done(out)});};
   await page.route('https://api.test/v1/chat/completions',handler);
   await page.route('https://big.test/v1/chat/completions',handler);
   return calls;
 }
 const build=async page=>{await page.fill('#promptInput',ASK);await page.click('#sendBtn');await page.waitForFunction(()=>!generating,null,{timeout:60000});return page.evaluate(()=>conv.messages.at(-1));};

 await scenario('full team: design system, coders, tester, reviewer, fixer only for the broken part, tested again',seed(),async page=>{
   const calls=await team(page);
   const msg=await build(page);
   const roles=calls.map(c=>c.role);assert.equal(msg.phases.parts.length,3,'the DATABASE line is not a part');
   assert.deepEqual(roles.filter(r=>r!=='coder'),['orchestrator','designer','reviewer','fixer']);
   assert.equal(roles.filter(r=>r==='coder').length,3);
   // Coders get the Designer's styles in their contract; the page carries them once.
   calls.filter(c=>c.role==='coder').forEach(c=>assert.match(c.body.messages.at(-1).content,/\[Design system[\s\S]*\.k-section\{padding:24px\}/));
   assert.equal((msg.content.match(/id="kita-design-system"/g)||[]).length,1);
   // The Reviewer saw the Tester's error; the Fixer rewrote part 3 only.
   const rev=calls.find(c=>c.role==='reviewer').body.messages.at(-1).content;
   assert.match(rev,/\[Errors when the page ran\][\s\S]*missingHelper/);assert.match(rev,/### Part 3: Menu and script/);
   const fix=calls.find(c=>c.role==='fixer').body.messages.at(-1).content;
   assert.match(fix,/Part 3 of 3/);assert.match(fix,/missingHelper is not defined/);assert.doesNotMatch(fix,/heading could be larger/,'minor issues are not sent to the Fixer');
   assert.match(msg.content,/dataset\.ready="1"/);assert.doesNotMatch(msg.content,/missingHelper\(\)/);
   assert.deepEqual(msg.phases.review.fixed,[3]);
   assert.deepEqual(msg.codeChecks.map(c=>c.errors.length>0),[true,false],'tested before and after the fix');
   assert.equal(msg.phases.state,'done');
   const tm=Object.fromEntries(msg.phases.team.map(r=>[r.role,r.status+': '+r.note]));
   assert.match(tm.orchestrator,/^done: Planned 3 parts/);assert.match(tm.designer,/^done: 2 lines of shared styles/);
   assert.match(tm.reviewer,/^done: 1 issue to fix · 1 minor/);assert.match(tm.fixer,/^done: Fixed 1 part: Menu and script/);
   assert.match(tm.tester,/^done: After fixes: page runs without errors/);
   // The answer lists the team and the coders; the card says tested.
   await page.locator('.run-summary').last().click();
   const rows=await page.locator('.msg.assistant .run-part').allInnerTexts();
   assert.ok(rows.some(r=>/Orchestrator · Planned 3 parts/.test(r)));assert.ok(rows.some(r=>/Coder 3 · Menu and script · fixed/.test(r)));assert.ok(rows.some(r=>/Fixer · Fixed 1 part/.test(r)));
   assert.match(await page.locator('.artifact-card .artifact-title small').innerText(),/✓ tested/);
 });

 await scenario('a model per role: strong Orchestrator and Reviewer, fast Coders, chat model for the rest',seed({agentTeam:{models:{orchestrator:'q::big',reviewer:'q::big',coder:'p::small'}}}),async page=>{
   const calls=await team(page);await build(page);
   const by=r=>calls.filter(c=>c.role===r).map(c=>c.url.replace(/\/chat\/completions$/,'')+' '+c.model);
   assert.deepEqual(by('orchestrator'),['https://big.test/v1 big']);assert.deepEqual(by('reviewer'),['https://big.test/v1 big']);
   assert.deepEqual([...new Set(by('coder'))],['https://api.test/v1 small']);
   assert.deepEqual(by('designer'),['https://api.test/v1 m']);assert.deepEqual(by('fixer'),['https://api.test/v1 m']);
 });

 await scenario('switches: no problems means no Fixer; Reviewer and Designer can be turned off',seed(),async page=>{
   let calls=await team(page,{review:'{"issues":[]}'});await build(page);
   assert.equal(calls.some(c=>c.role==='fixer'),false);
   assert.match((await page.evaluate(()=>conv.messages.at(-1).phases.team.find(r=>r.role==='reviewer').note)),/No problems found/);
   await page.evaluate(()=>{setAgentTeam({designer:false,review:false});studioNewChat();});
   await page.unroute('https://api.test/v1/chat/completions');await page.unroute('https://big.test/v1/chat/completions');
   calls=await team(page);await build(page);
   assert.deepEqual([...new Set(calls.map(c=>c.role))],['orchestrator','coder']);
 });

 const linked={integrations:{supabase:{connected:true,ref:'abcd1234',projectName:'Kopi DB',url:'https://abcd1234.supabase.co',anonKey:'eyJanon',schema:'',useInCode:true}}};
 await scenario('Database agent: plans tables when the app stores data, asks first, coders get the tables',seed(linked),async page=>{
   const sb=[];await page.route(SB+'/**',r=>{const body=JSON.parse(r.request().postData()||'{}');sb.push(body.query||'');
     if(/information_schema/.test(body.query||'')) return json(r,201,[{table_name:'bookings',column_name:'name',data_type:'text',is_nullable:'YES',rls:true}]);return json(r,201,[]);});
   const calls=await team(page,{db:true});
   await page.fill('#promptInput',ASK);await page.click('#sendBtn');
   await page.waitForSelector('#customDialogScrim.open',{timeout:20000});
   assert.match(await page.locator('#customDialogMessage').innerText(),/Database agent wants to set up these tables[\s\S]*create table if not exists bookings/);
   await page.locator('#customDialogConfirm').click();
   await page.waitForFunction(()=>!generating,null,{timeout:60000});
   assert.ok(sb.some(q=>/create table if not exists bookings/.test(q)),'SQL ran on Supabase');
   assert.match(calls.find(c=>c.role==='orchestrator').body.messages.at(-1).content,/DATABASE: <the data the app must store/);
   calls.filter(c=>c.role==='coder').forEach(c=>assert.match(c.body.messages.at(-1).content,/\[Supabase tables ready for this app\][\s\S]*bookings \[RLS on\]/));
   calls.filter(c=>c.role==='coder').forEach(c=>assert.match(c.body.messages[0].content,/Supabase project "Kopi DB"/,'coders get the Supabase context'));
   assert.match(await page.evaluate(()=>conv.messages.at(-1).phases.team.find(r=>r.role==='database').note),/1 table ready in Kopi DB/);
   // Declined: built without new tables.
   await page.evaluate(()=>studioNewChat());sb.length=0;
   await page.fill('#promptInput',ASK);await page.click('#sendBtn');
   await page.waitForSelector('#customDialogScrim.open',{timeout:20000});await page.locator('#customDialogCancel').click();
   await page.waitForFunction(()=>!generating,null,{timeout:60000});
   assert.equal(sb.some(q=>/create table/.test(q)),false);
   assert.match(await page.evaluate(()=>conv.messages.at(-1).phases.team.find(r=>r.role==='database').note),/You declined/);
   assert.equal(await page.evaluate(()=>conv.messages.at(-1).phases.state),'done');
 });

 await scenario('Database agent never runs destructive SQL',seed(linked),async page=>{
   const sb=[];await page.route(SB+'/**',r=>{sb.push(r.request().postData());return json(r,201,[]);});
   await team(page,{db:true,dbSql:'```sql\ndrop table orders;\ncreate table bookings (id int);\n```'});
   await build(page);
   assert.equal(sb.some(q=>/drop table/.test(q||'')),false);
   assert.match(await page.evaluate(()=>conv.messages.at(-1).phases.team.find(r=>r.role==='database').note),/Refused: the SQL would delete data/);
 });

 await scenario('Settings → Agent team: roles, models and switches',seed(),async page=>{
   await page.evaluate(()=>{renderToolsSheet();openSheet('toolsSheet');});
   await page.getByRole('button',{name:'Open agent team settings'}).click();
   assert.equal(await page.locator('#setSheetTitle').textContent(),'Agent team');
   assert.deepEqual(await page.locator('.agent-role strong').allTextContents(),['Orchestrator','Designer','Database','Coders','Reviewer','Fixer']);
   const opts=await page.locator('.agent-role[data-role="reviewer"] select option').allTextContents();
   assert.deepEqual(opts,['Same as chat','Fast · M','Fast · Small','Strong · Big']);
   await page.locator('.agent-role[data-role="reviewer"] select').selectOption('q::big');
   assert.equal(await page.evaluate(()=>agentTeam().models.reviewer),'q::big');
   await page.getByRole('switch',{name:'Designer'}).click();
   assert.equal(await page.evaluate(()=>agentTeam().designer),false);
   assert.equal(await page.getByRole('switch',{name:'Designer'}).getAttribute('aria-checked'),'false');
   // A removed model falls back to the chat model.
   const fb=await page.evaluate(()=>{setAgentTeam({models:{coder:'gone::x'}});const m=agentModel('coder',currentModel());return m.modelId;});
   assert.equal(fb,'m');
 });

 await b.close();
 if(failed){console.error(failed+' failed');process.exitCode=1;}else console.log('4.12.0 agent team: all passed');
})();
