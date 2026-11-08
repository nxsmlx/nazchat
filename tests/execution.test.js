/* Incremental execution, compact status, code viewer, search resilience and Stop.
   All provider and network traffic is mocked: no real API keys or requests. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,appUrl,root}=require('./browser');
const output=path.join(root,'test-results/execution');
const API='https://studio.test/v1/chat/completions';
fs.mkdirSync(output,{recursive:true});

const fixture=()=>({
  schemaVersion:3,onboardingDone:true,theme:'dark',search:false,thinking:false,reasoningEffort:'medium',textSize:'default',
  lastProviderId:'p1',lastModelId:'builder-1',activeProjectId:null,activeStyleId:null,
  providers:[{id:'p1',name:'Fixture Provider',baseUrl:'https://studio.test/v1',apiType:'chat',secretRef:'provider:p1',
    selectedModels:['builder-1'],modelMeta:{'builder-1':{context_length:128000}},headers:[],capabilities:{tools:false}}],
  conversations:[],projects:[],prompts:[],artifacts:[],styles:[],parametersByModel:{},
  skillSettings:{mode:'auto',selected:[],custom:[],disabled:[]}
});

function sse(text){
  return `data: ${JSON.stringify({choices:[{delta:{content:text}}]})}\n\ndata: ${JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`;
}
const PLAN='1. Head and base styles\n2. Hero section\n3. Features section\n4. Footer and scripts';

async function mockIncremental(page, parts){
  const calls=[];
  await page.route(API, async route=>{
    const body=JSON.parse(route.request().postData()||'{}');
    const system=(body.messages||[]).map(m=>m.content).join('\n');
    calls.push(body.messages.map(m=>m.content));
    let reply;
    if(/build planner/i.test(system)) reply=PLAN;
    else {
      const asked=body.messages.at(-1).content.match(/Now write ONLY part (\d+) of/);
      const idx=asked?Number(asked[1])-1:0;
      reply=parts[idx]||parts[0];
    }
    await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse(reply)});
  });
  return calls;
}

(async()=>{
  const browser=await launch();
  const results=[];
  async function test(name, run, viewport={width:420,height:900}){
    const context=await browser.newContext({viewport,reducedMotion:'reduce',colorScheme:'dark'});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:\/\//,route=>{
      const url=new URL(route.request().url());
      if(['cdn.jsdelivr.net','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)) return route.continue();
      if(url.href===API) return route.fallback();
      return route.abort();
    });
    await page.route('https://raw.githubusercontent.com/**',r=>r.abort());
    await page.addInitScript(seed=>{
      if(window!==window.top||sessionStorage.getItem('exec-seeded'))return;
      sessionStorage.setItem('exec-seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(seed));
    },fixture());
    await page.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>typeof send==='function'&&typeof db!=='undefined');
    try{ await run(page); assert.deepEqual(errors,[]); results.push({name,status:'passed'}); console.log('PASS '+name); }
    catch(e){ await page.screenshot({path:path.join(output,name+'-failure.png')}).catch(()=>{}); results.push({name,status:'failed',error:e.stack}); console.error('FAIL '+name+'\n'+e.stack); }
    finally{ await context.close(); }
  }

  await test('long-build-runs-plan-then-one-call-per-part', async page=>{
    const calls=await mockIncremental(page,[
      '<head><title>Built</title><style>body{font-family:sans-serif}</style></head>',
      '<section class="hero"><h1>Hero heading</h1></section>',
      '<section class="features"><div>Feature one</div></section>',
      '<footer>Footer</footer><script>console.log("ready")</script>'
    ]);
    await page.locator('#promptInput').fill('Buat landing page untuk studio reka bentuk kecil dengan bahagian hero, features dan footer.');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(()=>!generating,{timeout:30000});
    const msg=await page.evaluate(()=>conv.messages.at(-1));
    assert(Array.isArray(msg.phases.parts)&&msg.phases.parts.length===4,'plan was not turned into parts');
    assert.equal(msg.phases.parts.filter(p=>p.status==='done').length,4);
    assert.equal(msg.phases.state,'done');
    assert(calls.length===5,'expected 1 plan + 4 part calls, got '+calls.length);
    assert(calls.some(c=>c.some(t=>/build planner/i.test(t))),'no plan call');
    assert(/<h1>Hero heading<\/h1>/.test(msg.content)&&/<footer>Footer<\/footer>/.test(msg.content),'assembled HTML missing parts');
    assert(/<style>body\{font-family:sans-serif\}<\/style>/.test(msg.content),'head styles missing from assembly');
    // Each part is requested separately, so no single response is a 800-line dump.
    const partPrompts=calls.filter(c=>/Now write ONLY part/.test(c.at(-1)));
    assert.equal(new Set(partPrompts.map(c=>c.at(-1))).size,4,'part prompts were repeated');
  });

  await test('status-bar-is-compact-and-collapses-completed-thinking', async page=>{
    await page.route(API,route=>route.fulfill({status:200,headers:{'content-type':'text/event-stream'},
      body:`data: ${JSON.stringify({choices:[{delta:{reasoning_content:'step one. step two. step three.'}}]})}\n\ndata: ${JSON.stringify({choices:[{delta:{content:'Short answer.'},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`}));
    await page.evaluate(()=>{db.thinking=true;});
    await page.locator('#promptInput').fill('Terangkan ringkas apa itu REST.');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(()=>!generating,{timeout:20000});
    const status=page.locator('.run-status').last();
    assert.equal(await status.count(),1,'status bar missing');
    assert.equal(await page.locator('.think-box').count(),0,'legacy large thinking card still rendered');
    const detailVisible=await status.locator('.run-detail').isVisible();
    assert.equal(detailVisible,false,'completed thinking should start collapsed');
    const height=await status.evaluate(n=>n.getBoundingClientRect().height);
    assert(height<=60,'collapsed status bar is too tall: '+height);
    await status.locator('.run-summary').click();
    assert(await status.locator('.run-detail').isVisible(),'expanding the status bar failed');
    const thinkHeight=await status.locator('.run-think').evaluate(n=>n.getBoundingClientRect().height);
    assert(thinkHeight<=112,'thinking detail exceeds ~110px: '+thinkHeight);
    assert.equal(await status.locator('.run-think').evaluate(n=>getComputedStyle(n).overflowY),'auto','thinking detail must scroll internally');
    await page.screenshot({path:path.join(output,'compact-status.png')});
  });

  await test('code-viewer-line-numbers-filename-tabs-download', async page=>{
    await page.route(API,route=>route.fulfill({status:200,headers:{'content-type':'text/event-stream'},
      body:sse('```js app.js\nconst a = 1;\nconst b = 2;\nconsole.log(a + b);\n```\n\n```css styles.css\na{color:red}\nb{color:blue}\n```\n\n```python\nprint("hi")\n```')}));
    await page.locator('#promptInput').fill('Beri tiga fail contoh.');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(()=>!generating,{timeout:20000});
    const tabs=page.locator('.code-tab');
    assert.equal(await tabs.count(),3,'multi-file answer did not produce file tabs');
    assert.deepEqual(await tabs.allTextContents(),['app.js','styles.css','snippet.py']);
    await tabs.nth(1).click();
    assert.equal(await page.locator('.code-tab[aria-selected="true"]').textContent(),'styles.css');
    const pane=page.locator('.code-tab-pane').nth(0);
    // The gutter is sticky inside the scroller, so count its rows rather than text lines.
    const gutterRows=await pane.locator('.code-gutter span').allTextContents();
    assert.deepEqual(gutterRows,['1','2','3'],'line numbers missing or wrong: '+gutterRows.join(','));
    assert.equal(await pane.locator('.code-gutter').evaluate(n=>getComputedStyle(n).position),'sticky');
    assert.match(await pane.locator('.code-name').innerText(),/app\.js/);
    const overflow=await pane.locator('.code-body').evaluate(n=>({x:getComputedStyle(n).overflowX,y:getComputedStyle(n).overflowY}));
    assert.equal(overflow.x,'auto'); assert.equal(overflow.y,'auto');
    // Verify the download wiring without relying on a browser download event.
    const dlWired=await page.evaluate(()=>{
      const btns=[...document.querySelectorAll('.code-tab-pane .code-actions button')].map(b=>b.getAttribute('aria-label')||b.textContent.trim());
      const orig=URL.createObjectURL;let made=0;URL.createObjectURL=(blob)=>{made++;return orig.call(URL,blob);};
      downloadText('app.js','const a=1;');
      URL.createObjectURL=orig;
      return {btns,made};
    });
    assert(dlWired.btns.some(n=>/Download app\.js/.test(n)),'no download control with the file name: '+dlWired.btns.join('|'));
    assert.equal(dlWired.made,1,'downloadText did not create a blob');
    await page.screenshot({path:path.join(output,'code-tabs.png')});
    // Expanded code must never push the chat wider than the viewport.
    await page.locator('.code-tab').nth(0).click();
    await page.locator('.code-tab-pane').nth(0).locator('.code-toggle').first().click();
    const overflowX=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    assert(overflowX,'code viewer caused page-level horizontal overflow');
  });

  await test('stop-cancels-in-flight-request-and-keeps-partial-build', async page=>{
    let first=true;
    await page.route(API,async route=>{
      const body=JSON.parse(route.request().postData()||'{}');
      const system=(body.messages||[]).map(m=>m.content).join('\n');
      if(/build planner/i.test(system)) return route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse(PLAN)});
      if(first){
        first=false;
        // Stream slowly so Stop happens mid-part.
        await new Promise(r=>setTimeout(r,400));
        return route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse('<section class="hero">x</section>')});
      }
      await new Promise(r=>setTimeout(r,5000));
      return route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse('<p>late</p>')});
    });
    await page.locator('#promptInput').fill('Buat landing page panjang dengan banyak bahagian.');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(()=>generating,{timeout:15000});
    await page.waitForFunction(()=>conv.messages.at(-1).phases&&conv.messages.at(-1).phases.parts.length,{timeout:20000});
    await page.waitForTimeout(700);
    await page.locator('#sendBtn').click(); // Stop
    await page.waitForFunction(()=>!generating,{timeout:15000});
    const msg=await page.evaluate(()=>conv.messages.at(-1));
    assert(['paused','incomplete','execute'].includes(msg.phases.state),'unexpected state '+msg.phases.state);
    assert(await page.getByRole('button',{name:'Resume build'}).count()===1,'resume control missing after stop');
    await page.screenshot({path:path.join(output,'stopped-build.png')});
  });

  await test('search-results-survive-slow-source-and-timeouts', async page=>{
    await page.route('https://api.duckduckgo.com/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({Heading:'Docs',AbstractURL:'https://example.com/docs',AbstractText:'Reference documentation.'})}));
    await page.route('https://html.duckduckgo.com/**',route=>{
      const html='<div class="result"><a class="result__a" href="https://example.com/html">HTML result</a><div class="result__snippet">Snippet here</div></div>';
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.route('https://r.jina.ai/**',route=>route.fulfill({status:200,contentType:'text/plain',body:'Enriched page text'}));
    const results=await page.evaluate(()=>webSearch('test docs'));
    assert(results.length>=2,'parallel sources did not merge: '+JSON.stringify(results));
    assert(results[0].content==='Enriched page text','top result was not enriched');
    const urls=results.map(r=>r.url);
    assert.equal(new Set(urls).size,urls.length,'duplicate URLs were not filtered');
    // A hanging source must not block the overall search.
    await page.unroute('https://html.duckduckgo.com/**');
    await page.route('https://html.duckduckgo.com/**',()=>new Promise(()=>{}));
    const started=Date.now();
    const partial=await page.evaluate(()=>webSearch('test docs',{timeout:1200}));
    assert(partial.length>=1,'partial results were discarded when one source stalled');
    assert(Date.now()-started<6000,'search did not respect its timeout');
  });

  await test('concurrent-native-fetches-settle-independently', async page=>{
    // Drive the native bridge from the test: two requests, answered out of order.
    const out=await page.evaluate(async()=>{
      const calls=[];
      window.NazBridge={fetch:(url)=>{ calls.push({id:calls.length+1,url}); return calls.length; },cancel:()=>{}};
      window.NazStream={open:()=>1,close:()=>{}};
      HAS_NATIVE=true;
      const a=netFetch('https://a.example/one');
      const b=netFetch('https://b.example/two');
      const ids=calls.map(c=>c.id).sort((x,y)=>y-x);
      // Answer the second request first: the old single global callback swapped them.
      window.nazFetchDone(ids[0],200,'B');
      window.nazFetchDone(ids[1],200,'A');
      const [ra,rb]=await Promise.all([a,b]);
      return {a:await ra.text(),b:await rb.text(),aStatus:ra.status,bStatus:rb.status,calls:calls.length};
    });
    assert.deepEqual({a:out.a,b:out.b,aStatus:out.aStatus,bStatus:out.bStatus},{a:'A',b:'B',aStatus:200,bStatus:200},'native fetch responses crossed over');
    assert.equal(out.calls,2);
  });

  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  await browser.close();
  const failed=results.filter(r=>r.status!=='passed');
  console.log(`${results.length-failed.length}/${results.length} execution regression cases passed. Artifacts: test-results/execution/`);
  if(failed.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
