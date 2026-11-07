const {chromium}=require('/tmp/node_modules/playwright-core');
const assert=require('assert');

// Covers automatic output budget, real native tool calling (web_search + fetch_url),
// and the edit-request shortcut that keeps the current page as the source of truth.
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium-headless-shell',args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:390,height:844}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const requests=[];

 let mode='tool';
 await p.route('https://api.test/v1/chat/completions',async route=>{
   const body=JSON.parse(route.request().postData());requests.push(body);
   const sse=(frames)=>frames.map(f=>'data: '+JSON.stringify(f)).join('\n\n')+'\n\ndata: [DONE]\n\n';
   if(mode==='tool'){
     // 1st round: model asks for a tool; 2nd round: it answers using the result.
     const hasToolResult=(body.messages||[]).some(m=>m.role==='tool');
     if(!hasToolResult){
       await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([
         {choices:[{delta:{tool_calls:[{index:0,id:'call_1',type:'function',function:{name:'web_search',arguments:'{"query":"kita chat"}'}}]}}]},
         {choices:[{delta:{},finish_reason:'tool_calls'}]}
       ])});
       return;
     }
     await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([
       {choices:[{delta:{content:'Menurut carian, Kita Chat ialah aplikasi sembang AI.'}}]},
       {choices:[{delta:{},finish_reason:'stop'}]}
     ])});
     return;
   }
   if(mode==='toomany'){
     const err='{"error":{"message":"max_tokens is too large: 65536. This model supports at most 16384 completion tokens.","type":"invalid_request_error"}}';
     await route.fulfill({status:400,headers:{'content-type':'application/json'},body:err});
     return;
   }
   if(mode==='reject-tools'){
     const hasTools=Array.isArray(body.tools)&&body.tools.length;
     if(hasTools){
       await route.fulfill({status:400,headers:{'content-type':'application/json'},body:'{"error":{"message":"tools is not supported for this model"}}'});
       return;
     }
     await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([
       {choices:[{delta:{content:'Plain answer without tools.'}}]},
       {choices:[{delta:{},finish_reason:'stop'}]}
     ])});
     return;
   }
   if(mode==='edit'){
     await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([
       {choices:[{delta:{content:'```html\n<!doctype html><html><body><h1 id="anchor">Edited Again</h1></body></html>\n```'}}]},
       {choices:[{delta:{},finish_reason:'stop'}]}
     ])});
   }
 });

 await p.goto('file:///data/user/0/id.griphub.agent/files/home/workspace/build-a-web-app-116-648/nazchat/index.html');
 await p.evaluate(()=>{localStorage.setItem('nazchat_v1',JSON.stringify({schemaVersion:3,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{m:{context_length:128000}}}],conversations:[],projects:[],prompts:[],styles:[],artifacts:[],lastProviderId:'p',lastModelId:'m',onboardingDone:true,theme:'dark',parametersByModel:{},skillSettings:{mode:'auto',selected:[],disabled:[],custom:[]}}));location.reload()});
 await p.waitForFunction(()=>typeof db!=='undefined'&&typeof currentModel==='function',{timeout:15000});

 // 1. Budget is derived from the model and needs no manual tuning.
 const budget=await p.evaluate(()=>({auto:autoMaxTokens(currentModel()),used:modelParameters(currentModel()).max_tokens}));
 assert(budget.auto>=8192,'auto budget too small: '+budget.auto);
 assert(budget.used>=budget.auto,'active budget below auto floor');
 console.log('PASS automatic output budget',budget.used,'tokens with no user input');

 // 2. Tool calling actually runs and the answer is produced.
 await p.route('https://api.duckduckgo.com/**',r=>r.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:JSON.stringify({Heading:'Kita Chat',AbstractText:'A private BYOK chat app.',AbstractURL:'https://example.com/kita',RelatedTopics:[]})}));
 await p.fill('#promptInput','cari maklumat terkini tentang kita chat');await p.click('#sendBtn');
 await p.waitForFunction(()=>!generating,{timeout:30000});
 const toolState=await p.evaluate(()=>{const m=conv.messages.at(-1);return {content:m.content,trace:m.toolTrace,sources:m.sources};});
 assert(/Kita Chat/i.test(toolState.content),'final answer after tool call missing: '+toolState.content);
 assert(toolState.trace&&toolState.trace.length===1,'tool trace not recorded');
 assert(toolState.trace[0].name==='web_search'&&toolState.trace[0].ok,'web_search did not run');
 assert(toolState.sources&&toolState.sources.length,'sources not attached from tool result');
 assert(await p.locator('.tool-trace').count(),'tool activity not shown in the answer');
 // Search chip controls the web_search tool only.
 assert(await p.evaluate(()=>new Promise(res=>{db.search=true;save();res(kitaTools().some(t=>t.function.name==='web_search'));})),'search toggle did not enable web_search');
 assert(await p.evaluate(()=>{db.search=false;save();return !kitaTools().some(t=>t.function.name==='web_search')&&kitaTools().some(t=>t.function.name==='fetch_url');}),'search toggle did not keep fetch_url');
 await p.evaluate(()=>{db.search=true;save();});
 const toolReq=requests.find(r=>Array.isArray(r.tools)&&r.tool_choice==='auto');
 assert(toolReq&&toolReq.tools.length>=1,'tools not sent to the provider');
 assert(toolReq.tools.some(t=>t.function.name==='fetch_url'),'fetch_url tool missing');
 assert(requests.some(r=>(r.messages||[]).some(m=>m.role==='tool')),'tool result not sent back');
 console.log('PASS native tool calling (web_search executed, result fed back, trace shown)');

 // 3. Rejected token ceiling is learned and retried without user action.
 mode='toomany';
 await p.fill('#promptInput','tulis artikel panjang');await p.click('#sendBtn');
 await p.waitForTimeout(900);
 const learned=await p.evaluate(()=>({max:modelParameters(currentModel()).max_tokens,err:conv.messages.at(-1).content}));
 assert(learned.max<=16384,'ceiling not learned: '+learned.max);
 console.log('PASS provider token ceiling learned automatically →',learned.max);

 // 4. Providers that reject tools still answer.
 mode='reject-tools';
 await p.evaluate(()=>{db.providers[0].name='Plain Provider';db.providers[0].baseUrl='https://api.test/v1';db.providers[0].capabilities={tools:true};save();});
 await p.fill('#promptInput','hai');await p.click('#sendBtn');
 await p.waitForFunction(()=>!generating,{timeout:20000});
 const plain=await p.evaluate(()=>conv.messages.at(-1).content);
 assert(/Plain answer/.test(plain),'fallback without tools failed: '+plain);
 console.log('PASS tool rejection falls back to a plain answer');

 // 5. Edit request sends the current document instead of the whole chat.
 mode='edit';
 await p.evaluate(()=>{conv.messages.push({id:'a1',role:'assistant',content:'```html\n<!doctype html><html><body><h1>Original Page</h1><p>keep me</p></body></html>\n```',timestamp:Date.now()});save();});
 await p.fill('#promptInput','ubah warna tajuk jadi merah');await p.click('#sendBtn');
 await p.waitForFunction(()=>!generating,{timeout:20000});
 const editReq=requests.at(-1);
 const editSystem=editReq.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
 assert(editSystem.includes('[Current document to edit]'),'current document not supplied for edit');
 assert(editSystem.includes('keep me'),'existing page content not preserved in edit request');
 assert(/Apply this change/.test(editReq.messages.at(-1).content),'edit instruction missing');
 assert(editReq.messages.length<10,'edit request still replays full history ('+editReq.messages.length+')');
 console.log('PASS edit request focuses on the current document',editReq.messages.length,'messages');

 assert.deepStrictEqual(errors,[]);
 console.log('PASS no page errors');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
