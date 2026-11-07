const {chromium}=require('/tmp/node_modules/playwright-core');
const assert=require('assert');

// Simulates the two reported failures: a long HTML generation that used to
// freeze/silence, and a follow-up edit that could not be previewed.
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium-headless-shell',args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:390,height:844}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const requests=[];
 const bigHtml = (label) => `<!doctype html>\n<html><head><meta charset="utf-8"><title>${label}</title></head><body><h1 id="anchor">${label}</h1>\n${'<p>Section content for the generated page.</p>\n'.repeat(900)}</body></html>`;

 let mode='big';
 await p.route('https://api.test/v1/chat/completions',async route=>{
   const body=JSON.parse(route.request().postData());requests.push(body);
   const deltas=[];
   if(mode==='big'||mode==='edit'){
     const html=bigHtml(mode==='big'?'First Version':'Edited Version');
     const text='Here is the page:\n\n```html\n'+html+'\n```\n';
     for(let i=0;i<text.length;i+=700) deltas.push({choices:[{delta:{content:text.slice(i,i+700)}}]});
     deltas.push({choices:[{delta:{},finish_reason:'stop'}]});
   } else if(mode==='truncated'){
     deltas.push({choices:[{delta:{content:'```html\n<!doctype html><html><body><h1>Half'}}]});
     deltas.push({choices:[{delta:{},finish_reason:'length'}]});
   } else if(mode==='tool'){
     deltas.push({choices:[{delta:{tool_calls:[{index:0,id:'t1',type:'function',function:{name:'web_search',arguments:'{"q":"x"}'}}]}}]});
     deltas.push({choices:[{delta:{},finish_reason:'tool_calls'}]});
   }
   const sse=deltas.map(d=>'data: '+JSON.stringify(d)).join('\n\n')+'\n\ndata: [DONE]\n\n';
   await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse});
 });

 await p.goto('file:///data/user/0/id.griphub.agent/files/home/workspace/build-a-web-app-116-648/nazchat/index.html');
 await p.evaluate(()=>{localStorage.setItem('nazchat_v1',JSON.stringify({schemaVersion:3,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{m:{context_length:128000}}}],conversations:[],projects:[],prompts:[],styles:[],artifacts:[],lastProviderId:'p',lastModelId:'m',onboardingDone:true,theme:'dark',parametersByModel:{},skillSettings:{mode:'auto',selected:[],disabled:[],custom:[]}}));location.reload()});
 await p.waitForFunction(()=>typeof db!=='undefined'&&typeof currentModel==='function',{timeout:15000});

 // 1. Long HTML generation completes, stays responsive, and exposes Preview.
 const t0=Date.now();
 await p.fill('#promptInput','buat landing page penuh');await p.click('#sendBtn');
 await p.waitForFunction(()=>!generating,{timeout:45000});
 const elapsed=Date.now()-t0;
 const afterBig=await p.evaluate(()=>({len:conv.messages.at(-1).content.length,hasHtml:extractHtmlBlock(conv.messages.at(-1).content).includes('First Version')}));
 assert(afterBig.len>20000,'long answer did not arrive');
 assert(afterBig.hasHtml,'HTML block not detected in long answer');
 assert(elapsed<20000,'long stream took too long: '+elapsed+'ms');
 console.log('PASS long HTML stream completes in',elapsed+'ms','len',afterBig.len);

 await p.locator('.action-bar button', {hasText:'Preview'}).last().click();await p.waitForTimeout(600);
 assert(await p.locator('#htmlPreview.open').count(),'preview did not open');
 let sawFirst=false;
 for(const f of p.frames()){ if(f===p.mainFrame())continue; try{ if((await f.locator('#anchor').innerText({timeout:1200})).includes('First Version'))sawFirst=true; }catch(e){} }
 assert(sawFirst,'first preview did not render');await p.click('#previewClose');
 console.log('PASS first preview renders');

 // 2. Follow-up edit must produce a new previewable answer.
 mode='edit';
 await p.fill('#promptInput','tukar tajuk jadi Edited Version');await p.click('#sendBtn');
 await p.waitForFunction(()=>!generating,{timeout:45000});
 const editState=await p.evaluate(()=>({blocks:document.querySelectorAll('.msg.assistant').length,html:extractHtmlBlock(conv.messages.at(-1).content)}));
 assert(editState.blocks>=2,'second assistant answer missing');
 assert(editState.html.includes('Edited Version'),'edited HTML not detected: '+editState.html.slice(0,80));
 await p.locator('.msg.assistant').last().locator('.action-bar button', {hasText:'Preview'}).click();
 await p.waitForTimeout(600);
 let sawEdited=false;
 for(const f of p.frames()){ if(f===p.mainFrame())continue; try{ if((await f.locator('#anchor').innerText({timeout:1200})).includes('Edited Version'))sawEdited=true; }catch(e){} }
 assert(sawEdited,'edited preview did not render');await p.click('#previewClose');
 console.log('PASS follow-up edit previews again');

 // 3. Truncated responses are reported, not silent.
 mode='truncated';
 await p.fill('#promptInput','buat page lagi');await p.click('#sendBtn');
 await p.waitForFunction(()=>!generating,{timeout:20000});
 const trunc=await p.evaluate(()=>({flag:conv.messages.at(-1).truncated,warn:conv.messages.at(-1).content.includes('output limit'),cont:[...document.querySelectorAll('.act-btn')].some(b=>b.textContent.includes('Continue'))}));
 assert(trunc.flag&&trunc.warn,'truncation not surfaced');
 assert(trunc.cont,'Continue action missing');
 console.log('PASS truncation surfaced with Continue');

 // 4. A tool-call-only response when tools are disabled explains itself.
 mode='tool';
 await p.evaluate(()=>{db.providers[0].capabilities={tools:false};save();});
 await p.fill('#promptInput','cari web');await p.click('#sendBtn');
 await p.waitForFunction(()=>!generating,{timeout:20000});
 const tool=await p.evaluate(()=>({flag:conv.messages.at(-1).toolCall,text:conv.messages.at(-1).content}));
 assert(tool.flag,'tool-call response not flagged');
 assert(/tool/i.test(tool.text),'tool-call explanation missing');
 await p.evaluate(()=>{db.providers[0].capabilities={};save();});
 console.log('PASS tool-call-only response explained');

 // 5. Default output budget is large enough for full pages.
 const params=await p.evaluate(()=>modelParameters(currentModel()));
 assert(params.max_tokens>=8192,'default max_tokens too small: '+params.max_tokens);
 console.log('PASS default max output tokens',params.max_tokens);

 // 6. Code being written stays inside its own frame, never spilling into chat text.
 const liveFrame=await p.evaluate(()=>{
   const html='<!doctype html><html><body><h1>Frame Check</h1>'+('<p>kod halaman</p>'.repeat(200))+'</body></html>';
   const msg={id:'live',role:'assistant',content:'Ini halaman anda:\n\n```html\n'+html,reasoning:'',sources:[],timestamp:Date.now()};
   const wrap=document.createElement('div');wrap.className='msg assistant';
   const bubble=document.createElement('div');bubble.className='bubble';wrap.appendChild(bubble);
   document.querySelector('#chatInner').appendChild(wrap);
   renderAssistant(bubble,msg,true);
   const frame=bubble.querySelector('.code-live');
   const md=bubble.querySelector('.md');
   return {hasFrame:!!frame,label:frame?frame.querySelector('.think-head').innerText:'',mdText:md?md.innerText:'',bodyText:frame?frame.querySelector('.code-live-body').textContent:'',height:frame?frame.querySelector('.code-live-body').getBoundingClientRect().height:0,preview:frame?!!frame.querySelector('.preview-btn'):false};
 });
 assert(liveFrame.hasFrame,'streaming code frame missing');
 assert(/Writing html/.test(liveFrame.label),'frame label wrong: '+liveFrame.label);
 assert(liveFrame.bodyText.includes('Frame Check'),'code not inside frame');
 assert(!/kod halaman/.test(liveFrame.mdText),'code spilled into chat text');
 assert(liveFrame.height>0&&liveFrame.height<=160,'frame height wrong: '+liveFrame.height);
 assert(liveFrame.preview,'HTML preview button missing while streaming');
 console.log('PASS streaming code confined to its own frame');

 assert.deepStrictEqual(errors,[]);
 console.log('PASS no page errors');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
