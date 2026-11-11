const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.11.0: Supabase. Connect with an access token, pick a project, keep only the
// public key, give Code the URL/key/schema, and run SQL only after approval (always
// for changes, also in Bypass all). Mocked Management API.
const API='https://api.test/v1/chat/completions';
const SB='https://api.supabase.com';
const enc=o=>'data: '+JSON.stringify(o)+'\n\n';
const text=t=>enc({choices:[{delta:{content:t}}]})+enc({choices:[{delta:{},finish_reason:'stop'}]})+'data: [DONE]\n\n';
const toolCall=(name,args)=>enc({choices:[{delta:{tool_calls:[{index:0,id:'call_1',type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]})+enc({choices:[{delta:{},finish_reason:'tool_calls'}]})+'data: [DONE]\n\n';
const seed=extra=>({schemaVersion:3,onboardingDone:true,thinking:false,search:false,autoCheckCode:false,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{m:{context_length:128000}}}],lastProviderId:'p',lastModelId:'m',conversations:[],projects:[],...extra});
const json=(r,status,obj)=>r.fulfill({status,headers:{'content-type':'application/json'},body:JSON.stringify(obj)});

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof supabaseQuery==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }
 // Mock Supabase Management API; returns the recorded calls.
 async function supabase(page,opts={}){
   const calls=[];
   await page.route(SB+'/**',async r=>{const u=new URL(r.request().url()),m=r.request().method(),body=r.request().postData();calls.push({m,p:u.pathname,auth:r.request().headers().authorization,body});
     if(u.pathname==='/v1/projects') return json(r,200,opts.projects||[{id:'abcd1234',name:'Kopi DB',region:'ap-southeast-1',status:'ACTIVE_HEALTHY'},{id:'zzzz9999',name:'Other',region:'us-east-1'}]);
     if(/\/api-keys$/.test(u.pathname)) return json(r,200,opts.keys||[{name:'anon',api_key:'eyJanon.public.key'},{name:'service_role',api_key:'eyJSERVICE.secret'}]);
     if(/\/database\/query$/.test(u.pathname)){const q=JSON.parse(body).query;
       if(/information_schema\.columns/.test(q)) return json(r,201,opts.schemaRows||[{table_name:'orders',column_name:'id',data_type:'bigint',is_nullable:'NO',rls:true},{table_name:'orders',column_name:'note',data_type:'text',is_nullable:'YES',rls:true}]);
       return json(r,201,opts.result||[]);}
     return json(r,404,{message:'unexpected '+u.pathname});});
   return calls;
 }
 const confirm=async page=>{await page.locator('#customDialogScrim.open #customDialogConfirm').click();};
 const cancel=async page=>{await page.locator('#customDialogScrim.open #customDialogCancel').click();};

 await scenario('connect: choose a project, keep only the public key, read the schema',seed(),async page=>{
   const calls=await supabase(page);
   await page.evaluate(()=>{renderIntegrationsSettings();openSheet('setSheet');});
   const card=page.locator('.integration-card[data-service="supabase"]');
   await card.locator('input').fill('sbp_token_1234567890');await card.getByRole('button',{name:'Connect Supabase'}).click();
   await page.waitForFunction(()=>integrationConnected('supabase'));
   assert.equal(await page.evaluate(()=>integrationState('supabase').ref),undefined,'two projects: the user chooses');
   await page.locator('.integration-card[data-service="supabase"] select').selectOption('abcd1234');
   await page.waitForFunction(()=>integrationState('supabase').schema);
   const st=await page.evaluate(()=>integrationState('supabase'));
   assert.equal(st.url,'https://abcd1234.supabase.co');assert.equal(st.anonKey,'eyJanon.public.key');
   assert.equal(JSON.stringify(st).includes('SERVICE'),false,'service_role key is never kept');
   assert.equal(JSON.stringify(st).includes('sbp_token'),false,'access token is never in app data');
   assert.match(st.schema,/^orders \[RLS on\]: id bigint, note text\?$/);
   assert.ok(calls.every(c=>c.auth==='Bearer sbp_token_1234567890'));
   assert.match(await page.locator('.integration-card[data-service="supabase"]').innerText(),/abcd1234\.supabase\.co[\s\S]*1 table/);
 });

 await scenario('one project is chosen automatically; a publishable key is preferred; no public key is refused',seed(),async page=>{
   await supabase(page,{projects:[{id:'only1',name:'Solo'}],keys:[{name:'anon',api_key:'eyJanon'},{name:'default',type:'publishable',api_key:'sb_publishable_xyz'},{name:'secret',type:'secret',api_key:'sb_secret_no'}]});
   const st=await page.evaluate(()=>connectIntegration('supabase','sbp_x_1234567890'));
   assert.equal(st.ref,'only1');assert.equal(st.anonKey,'sb_publishable_xyz');
   await page.unroute(SB+'/**');await supabase(page,{projects:[{id:'only1',name:'Solo'}],keys:[{name:'service_role',api_key:'eyJsecret'}]});
   const err=await page.evaluate(()=>supabaseLoadProject('only1').then(()=>'ok',e=>e.message));
   assert.match(err,/did not return a public/);
 });

 const linked={integrations:{supabase:{connected:true,ref:'abcd1234',projectName:'Kopi DB',url:'https://abcd1234.supabase.co',anonKey:'eyJanon.public.key',schema:'orders [RLS on]: id bigint',useInCode:true}}};
 await scenario('Code requests get the project URL, public key, schema and SQL tools; Chat does not',seed({...linked,uiMode:'code'}),async page=>{
   await supabase(page);
   const reqs=[];await page.route(API,r=>{reqs.push(JSON.parse(r.request().postData()));r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:text('ok')});});
   await page.fill('#promptInput','senaraikan jadual');await page.click('#sendBtn');await page.waitForFunction(()=>!generating);
   const sys=reqs[0].messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
   assert.match(sys,/Supabase project "Kopi DB"/);assert.match(sys,/https:\/\/abcd1234\.supabase\.co/);assert.match(sys,/eyJanon\.public\.key/);assert.match(sys,/orders \[RLS on\]/);
   assert.match(sys,/Never use, print or ask for the service_role/);
   assert.deepEqual(reqs[0].tools.map(t=>t.function.name).filter(n=>n.startsWith('supabase_')),['supabase_sql','supabase_schema']);
   reqs[0].tools.forEach(t=>assert.deepEqual(Object.keys(t).sort(),['function','type'],'tool definitions carry only standard fields'));
   // Chat mode: nothing about Supabase.
   await page.evaluate(()=>setKitaMode('chat'));reqs.length=0;
   await page.fill('#promptInput','apa khabar');await page.click('#sendBtn');await page.waitForFunction(()=>!generating);
   assert.doesNotMatch(JSON.stringify(reqs[0]),/supabase/i);
   // "Use in Code" off: Code requests leave Supabase out.
   await page.evaluate(()=>{setIntegrationState('supabase',{...integrationState('supabase'),useInCode:false});setKitaMode('code');});reqs.length=0;
   await page.fill('#promptInput','hi');await page.click('#sendBtn');await page.waitForFunction(()=>!generating);
   assert.doesNotMatch(JSON.stringify(reqs[0]),/supabase/i);
 });

 await scenario('supabase_sql: a change asks first (also in Bypass all), runs once approved, declining runs nothing',seed({...linked,uiMode:'code',permissionMode:'bypass'}),async page=>{
   const calls=await supabase(page);
   const SQL='create table bookings (id bigint generated always as identity primary key, name text); alter table bookings enable row level security;';
   let n=0;const reqs=[];
   await page.route(API,r=>{reqs.push(JSON.parse(r.request().postData()));n++;r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:n%2===1?toolCall('supabase_sql',{query:SQL,purpose:'Store bookings'}):text('Done.')});});
   await page.evaluate(()=>{db.permissionMode='bypass';});
   await page.fill('#promptInput','buat jadual tempahan');await page.click('#sendBtn');
   await page.waitForSelector('#customDialogScrim.open');
   const dlg=await page.locator('#customDialogScrim.open').innerText();
   assert.match(dlg,/Run SQL on Supabase/);assert.match(dlg,/Project: Kopi DB/);assert.match(dlg,/create table bookings/);assert.match(dlg,/Store bookings/);
   await confirm(page);await page.waitForFunction(()=>!generating);
   const ran=calls.filter(c=>c.m==='POST'&&JSON.parse(c.body).query===SQL);assert.equal(ran.length,1);
   assert.ok(calls.filter(c=>/information_schema/.test(c.body||'')).length>=1,'schema refreshed after a change');
   const toolMsg=reqs[1].messages.find(m=>m.role==='tool');assert.match(toolMsg.content,/"ok":true/);
   // Decline: nothing runs and the model is told.
   calls.length=0;n=0;reqs.length=0;
   await page.fill('#promptInput','buat lagi');await page.click('#sendBtn');
   await page.waitForSelector('#customDialogScrim.open');await cancel(page);await page.waitForFunction(()=>!generating);
   assert.equal(calls.filter(c=>c.m==='POST').length,0);
   assert.match(reqs[1].messages.find(m=>m.role==='tool').content,/declined/);
 });

 await scenario('destructive SQL is flagged; reads follow the permission mode',seed(linked),async page=>{
   const r=await page.evaluate(()=>[sqlRisk('select * from orders'),sqlRisk('with x as (select 1) select * from x'),sqlRisk('insert into orders(note) values (1)'),sqlRisk('drop table orders'),sqlRisk('delete from orders where id=1'),sqlRisk('alter table orders drop column note'),sqlRisk('-- drop table x\nselect 1'),sqlRisk('alter table orders disable row level security')]);
   assert.deepEqual(r,['read','read','write','destructive','destructive','destructive','read','destructive']);
   assert.equal(await page.evaluate(()=>{db.permissionMode='balanced';return confirmSupabaseSql('select 1');}),true,'balanced: reads run without asking');
   const p=page.evaluate(()=>{db.permissionMode='careful';return confirmSupabaseSql('select 1');});
   await page.waitForSelector('#customDialogScrim.open');await cancel(page);assert.equal(await p,false);
   const p2=page.evaluate(()=>confirmSupabaseSql('drop table orders'));
   await page.waitForSelector('#customDialogScrim.open');
   assert.match(await page.locator('#customDialogTitle').innerText(),/Destructive database change/);
   assert.match(await page.locator('#customDialogMessage').innerText(),/cannot be undone/);
   await cancel(page);assert.equal(await p2,false);
 });

 await scenario('Run on Supabase under SQL blocks (models without tools)',seed({...linked,uiMode:'code',conversations:[{id:'c',title:'DB',mode:'code',updatedAt:1,messages:[{id:'u',role:'user',content:'sql'},{id:'a',role:'assistant',content:'Run this:\n\n```sql\ninsert into orders(note) values (\'hi\') returning id;\n```'}]}]}),async page=>{
   const calls=await supabase(page,{result:[{id:7}]});
   await page.evaluate(()=>studioOpenConversation(db.conversations[0]));
   await page.getByRole('button',{name:'Run on Supabase'}).click();
   await page.waitForSelector('#customDialogScrim.open');await confirm(page);
   await page.waitForSelector('.supabase-result.ok');
   assert.match(await page.locator('.supabase-result').innerText(),/Ran on Kopi DB · 1 row: \[\{"id":7\}\]/);
   assert.equal(calls.filter(c=>c.m==='POST'&&/insert into orders/.test(c.body)).length,1);
   // Not connected: no button.
   await page.evaluate(()=>{disconnectIntegration('supabase');renderAll();});
   assert.equal(await page.getByRole('button',{name:'Run on Supabase'}).count(),0);
 });

 await b.close();
 if(failed){console.error(failed+' failed');process.exitCode=1;}else console.log('4.11.0 Supabase: all passed');
})();
