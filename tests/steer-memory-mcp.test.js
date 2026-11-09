const {launch, appUrl}=require('./browser');
const assert=require('node:assert/strict');

// Real browser Response + incremental ReadableStream. Abort completion is held by
// the test, proving that handoff awaits settlement rather than a timer or a click.
(async()=>{
 const b=await launch();
 try{
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{
   if(window!==window.top)return;
   localStorage.setItem('nazchat_v1',JSON.stringify({onboardingDone:true,providers:[{id:'p1',name:'Mock',baseUrl:'https://api.test/v1',apiType:'chat_completions',endpointMode:'base',apiKey:'test',selectedModels:['m1'],modelMeta:{m1:{context_length:128000}}}],lastProviderId:'p1',lastModelId:'m1'}));
   const realFetch=window.fetch.bind(window),enc=new TextEncoder();
   window.streamMock={requests:[],push(i,text){this.requests[i].controller.enqueue(enc.encode('data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\n'));},finish(i){const r=this.requests[i];r.controller.enqueue(enc.encode('data: [DONE]\n\n'));r.controller.close();},releaseAbort(i){const r=this.requests[i];if(!r.aborted)throw Error('Request not aborted');r.controller.error(new DOMException('Aborted','AbortError'));r.released=true;}};
   window.fetch=(url,opts={})=>{
    if(String(url).startsWith('https://raw.githubusercontent.com/'))return Promise.resolve(new Response('{}',{status:503}));
    if(String(url)!=='https://api.test/v1/chat/completions')return realFetch(url,opts);
    const r={body:JSON.parse(opts.body),aborted:false};
    const stream=new ReadableStream({start(c){r.controller=c;}});
    opts.signal.addEventListener('abort',()=>{r.aborted=true;},{once:true});
    streamMock.requests.push(r);
    return Promise.resolve(new Response(stream,{status:200,headers:{'Content-Type':'text/event-stream'}}));
   };
  });
  await p.goto(appUrl,{waitUntil:'domcontentloaded'});
  const waitCalls=n=>p.waitForFunction(n=>streamMock.requests.length===n,n);
  const idle=()=>p.waitForFunction(()=>!generating && !activeRun && !steerHandoff);
  const start=async text=>{await p.fill('#promptInput',text);await p.click('#sendBtn');};
  const push=async(i,text)=>{await p.evaluate(({i,text})=>streamMock.push(i,text),{i,text});await p.waitForFunction(({text})=>activeRun?.message.content.includes(text),{text});};
  const finish=async(i,text)=>{if(text)await push(i,text);await p.evaluate(i=>streamMock.finish(i),i);await idle();};
  await p.evaluate(()=>{const c=ensureConv();c.messages.push({id:'older',role:'assistant',content:'OLDER ANSWER MUST NOT REPLACE THE PARTIAL'});save();renderAll();});
  await start('Hai');await waitCalls(1);
  await push(0,'Ini jawapan separa.');
  await push(0,' Chunk kedua tiba.');
  assert((await p.locator('.msg.assistant .md').last().innerText()).includes('Ini jawapan separa.'),'first chunk visibly rendered before completion');
  const originalId=await p.evaluate(()=>conv.id);
  await p.fill('#promptInput','Jawab panjang');
  assert.equal(await p.locator('#sendBtn').getAttribute('aria-label'),'Stop response');
  assert(await p.locator('#steerBtn').isVisible());
  assert.equal(await p.locator('#steerBtn').getAttribute('aria-label'),'Steer response with this message');
  await p.click('#steerBtn');
  await p.waitForFunction(()=>streamMock.requests[0].aborted && !!steerHandoff);
  const duringHandoff=await p.locator('.msg.assistant .bubble').last().innerText();
  assert(duringHandoff.includes('Ini jawapan separa.'),'partial stays in assistant bubble during handoff');
  assert(!(await p.locator('.msg.user .bubble').last().innerText()).includes('Ini jawapan separa.'),'pending steer bubble never receives assistant paint');
  await p.fill('#promptInput','Jawab dengan ringkas sahaja');await p.click('#steerBtn');
  await p.waitForTimeout(250); // exceeds the old 120ms race while the stream is deliberately unsettled
  assert.equal(await p.evaluate(()=>streamMock.requests.length),1,'no continuation before old run settles');
  assert.equal(await p.evaluate(()=>conv.messages.filter(m=>m.steer).length),1,'newest pending steer replaces, not queues');
  await p.evaluate(()=>streamMock.releaseAbort(0));await waitCalls(2);
  const req=await p.evaluate(()=>streamMock.requests[1].body);
  assert.equal(req.messages.filter(m=>m.role==='assistant'&&m.content.includes('Ini jawapan separa. Chunk kedua tiba.')).length,1,'exact interrupted answer included once');
  assert.equal(req.messages.filter(m=>m.role==='user'&&m.content.includes('Jawab dengan ringkas sahaja')).length,1,'newest instruction included once');
  assert(!JSON.stringify(req).includes('Jawab panjang'),'superseded pending instruction not sent');
  assert.equal(await p.evaluate(()=>conv.id),originalId);
  await finish(1,'Jawapan ringkas.');
  assert.equal(await p.evaluate(()=>conv.messages.filter(m=>m.role==='assistant').length),3,'original and continued answer preserved');
  console.log('PASS incremental steer: exact partial, newest instruction, awaited settlement, separate Stop');

  await start('Stop handoff');await waitCalls(3);await push(2,'Simpan separa.');
  await p.fill('#promptInput','Batal arahan ini');await p.click('#steerBtn');await p.click('#sendBtn');
  await p.evaluate(()=>streamMock.releaseAbort(2));await idle();
  assert.equal(await p.evaluate(()=>streamMock.requests.length),3,'Stop cancels handoff without new request');
  assert.equal(await p.evaluate(()=>conv.messages.at(-1).steerState),'cancelled');
  await start('Stop biasa');await waitCalls(4);await push(3,'Masih separa.');
  await p.fill('#promptInput','Draf belum dihantar');await p.click('#sendBtn');
  await p.evaluate(()=>streamMock.releaseAbort(3));await idle();
  assert.equal(await p.inputValue('#promptInput'),'Draf belum dihantar','normal Stop keeps typed draft');
  assert.equal(await p.evaluate(()=>streamMock.requests.length),4);
  console.log('PASS Stop cancels pending steer and remains Stop while text is entered');

  await start('Identity check');await waitCalls(5);await push(4,'Original conversation only.');
  await p.fill('#promptInput','Keep identity');await p.click('#steerBtn');
  await p.evaluate(()=>{conv=null;ensureConv();renderAll();streamMock.releaseAbort(4);});await idle();
  assert.equal(await p.evaluate(()=>streamMock.requests.length),5,'never continue in a different conversation');
  assert.equal(await p.evaluate(()=>conv.messages.length),0);
  console.log('PASS conversation identity guarded at handoff');

  await start('buat landing page lengkap');await waitCalls(6);
  await p.evaluate(()=>{streamMock.push(5,'1. Head and styles\n2. Hero section\n3. Footer');streamMock.finish(5);});await waitCalls(7);
  await p.evaluate(()=>{streamMock.push(6,'```html\n<head><title>Retained title</title><style>body{color:red}</style></head>\n```');streamMock.finish(6);});await waitCalls(8);
  await p.evaluate(()=>streamMock.push(7,'<section>UNFINISHED RUNNING PART'));
  await p.waitForFunction(()=>activeRun.message.phases.parts[1].chars>0);
  await p.fill('#promptInput','Tukar warna kepada biru');await p.click('#steerBtn');
  await p.evaluate(()=>streamMock.releaseAbort(7));await waitCalls(9);
  const build=await p.evaluate(()=>({source:conv.messages.find(m=>m.phases),request:streamMock.requests[8].body}));
  assert.equal(build.source.phases.state,'paused');assert.equal(build.source.phases.parts[0].status,'done');assert.equal(build.source.phases.parts[1].status,'pending');
  assert(build.request.messages.some(m=>m.content.includes('Retained title')),'completed artifact retained');
  assert(!JSON.stringify(build.request).includes('UNFINISHED RUNNING PART'),'unfinished part not claimed as retained');
  assert(build.request.messages.at(-1).content.includes('not a resume of the original phases'));
  assert.equal(await p.getByRole('button',{name:'Resume build',exact:true}).count(),0,'steered source must not offer stale phase resume');
  await finish(8,'```html\n<!doctype html><title>Blue replacement</title><p>Siap</p>\n```');
  console.log('PASS phased steer uses honest paused-build and retained completed artifact continuation');

  // Actual settings navigation, opt-in, add/edit/cancel and delete note.
  await p.click('#menuBtn');await p.click('#settingsBtn');
  await p.locator('.settings-hub-row').filter({hasText:'Memory'}).click();
  assert.equal(await p.getByRole('switch',{name:'Remember with Memory'}).getAttribute('aria-checked'),'false');
  await p.getByRole('button',{name:'Add note',exact:true}).click();
  await p.locator('#provForm textarea').fill('Saya suka jawapan ringkas.');await p.getByRole('button',{name:'Save note',exact:true}).click();
  assert.equal(await p.evaluate(()=>db.memory.items.length),1);
  assert.equal(await p.evaluate(()=>db.memory.enabled),false,'adding a note never opts in');
  assert(!(await p.evaluate(()=>skillSystemMessage([]))).includes('Saya suka jawapan ringkas.'));
  await p.getByRole('button',{name:'Edit memory note',exact:true}).click();
  await p.locator('#provForm textarea').fill('Saya suka jawapan dalam Bahasa Melayu.');await p.getByRole('button',{name:'Save note',exact:true}).click();
  assert.equal(await p.evaluate(()=>db.memory.items[0].text),'Saya suka jawapan dalam Bahasa Melayu.');
  await p.getByRole('switch',{name:'Remember with Memory'}).click();
  const sys=await p.evaluate(()=>skillSystemMessage([],'language preference'));
  assert(sys.includes('Saya suka jawapan dalam Bahasa Melayu.'));assert(sys.includes('[SUGGEST MEMORY]'));
  await p.getByRole('button',{name:'Delete memory note',exact:true}).click();await p.click('#customDialogConfirm');
  assert.equal(await p.evaluate(()=>db.memory.items.length),0);
  assert((await p.evaluate(()=>skillSystemMessage([]))).includes('[SUGGEST MEMORY]'),'empty opt-in memory can receive suggestions');
  await p.getByRole('button',{name:'Add note',exact:true}).click();
  await p.locator('#provForm textarea').fill('Cancelled note');await p.locator('#provForm').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await p.evaluate(()=>db.memory.items.length),0,'cancelled note never saved');
  await p.click('[data-close="setSheet"]');
  await start('Saya suka kod bersih');await waitCalls(10);
  await finish(9,'Baik. [SUGGEST MEMORY] Pengguna suka kod bersih [/SUGGEST MEMORY]');
  assert.equal(await p.evaluate(()=>db.memory.items.length),0,'never auto saves');
  assert(!(await p.locator('.msg.assistant .md').last().innerText()).includes('[SUGGEST MEMORY]'));
  await p.getByRole('button',{name:'Dismiss this memory suggestion',exact:true}).click();
  assert.equal(await p.evaluate(()=>db.memory.items.length),0);
  await start('Saya suka kod bersih');await waitCalls(11);await finish(10,'Baik. [SUGGEST MEMORY] Pengguna suka kod bersih [/SUGGEST MEMORY]');
  await p.getByRole('button',{name:'Save this memory note',exact:true}).click();
  assert.equal(await p.evaluate(()=>db.memory.items.length),1);
  assert.equal(await p.locator('.memory-suggest').count(),0);
  await p.evaluate(()=>{for(let i=0;i<90;i++)db.memory.items.push({id:'note-'+i,text:'Postgres migration ownership '+i});db.memory.items.push({id:'unrelated',text:'Astronomy orbital mechanics secret fixture'});});
  const bounded=await p.evaluate(()=>relevantMemory('Postgres migration'));
  assert(bounded.length<=1800);assert(bounded.split('\n- ').length<=6);assert(!bounded.includes('Astronomy'));
  assert.equal(await p.evaluate(()=>{db.memory.enabled=false;return relevantMemory('Postgres');}),'');
  console.log('PASS memory: editable opt-in notes, bounded relevance, empty-memory suggestions and explicit confirmation');

  await p.evaluate(()=>{db.mcpServers=[{id:'srv1',url:'https://mcp.test/mcp',name:'Test MCP',enabled:true,tools:[{name:'get_weather',description:'Weather',inputSchema:{type:'object',properties:{city:{type:'string'}}}}]}];save();});
  assert((await p.evaluate(()=>kitaTools().map(t=>t.function.name))).includes('mcp_srv1_get_weather'));
  await p.evaluate(()=>{db.mcpServers[0].enabled=false;save();});
  assert(!(await p.evaluate(()=>kitaTools().map(t=>t.function.name))).includes('mcp_srv1_get_weather'));
  console.log('PASS MCP tool exposure and disabled-server filtering (native transport not tested)');

  // Resume after another request has finished must bind the current conversation,
  // not a stale closure. Steering an active resume uses the same settled handoff.
  await p.evaluate(()=>{conv=null;streamMock.requests=[];renderAll();});
  await start('buat landing page lengkap');await waitCalls(1);
  await p.evaluate(()=>{streamMock.push(0,'1. Head and styles\n2. Hero section\n3. Footer');streamMock.finish(0);});await waitCalls(2);
  await p.evaluate(()=>{streamMock.push(1,'<head><title>Resumable artifact</title><style>body{color:red}</style></head>');streamMock.finish(1);});await waitCalls(3);
  await p.click('#sendBtn');await p.evaluate(()=>streamMock.releaseAbort(2));await idle();
  const resumeId=await p.evaluate(()=>conv.messages.at(-1).id);
  assert.equal(await p.evaluate(()=>conv.messages.at(-1).phases.state),'paused');
  await p.getByRole('button',{name:'Resume build',exact:true}).last().click();await waitCalls(4);
  const resumed=await p.evaluate(()=>({id:activeRun.message.id,request:streamMock.requests[3].body}));
  assert.equal(resumed.id,resumeId,'resume must not add another assistant message');
  assert(resumed.request.messages.at(-1).content.includes('part 2 of 3'),'resume skips already completed part');
  await p.evaluate(()=>streamMock.push(3,'<section>Unfinished resumed part'));
  await p.waitForFunction(()=>activeRun.message.phases.parts[1].chars>0);
  await p.fill('#promptInput','Apply blue on this resume');await p.click('#steerBtn');
  assert.equal(await p.evaluate(()=>streamMock.requests.length),4);
  await p.evaluate(()=>streamMock.releaseAbort(3));await waitCalls(5);
  assert((await p.evaluate(()=>streamMock.requests[4].body.messages)).some(m=>m.content.includes('Resumable artifact')));
  assert.equal(await p.evaluate(id=>conv.messages.find(m=>m.id===id).phases.state,resumeId),'paused');
  await finish(4,'Completed new continuation.');
  console.log('PASS normal build resume skips done parts and can itself be safely steered');
  assert.deepEqual(errors,[]);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
