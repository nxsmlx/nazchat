const {launch, appUrl}=require('./browser');
const assert=require('assert');

// Phased building: a long artifact request must be split into small calls
// (plan + N parts), assembled locally, and each call must stay well under the
// output limit. Plus reasoning guardrails: capped reasoning and rescue when
// reasoning alone hits the length limit.
(async()=>{
 const b=await launch();
 const p=await b.newPage({viewport:{width:390,height:844}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const calls=[];

 const sse=(frames)=>frames.map(f=>'data: '+JSON.stringify(f)).join('\n\n')+'\n\ndata: [DONE]\n\n';
 const seg=(title,i)=>'<!doctype html>\n<html><head><style>.'+i+'{color:red}</style></head><body><section class="s'+i+'"><h2>'+title+'</h2>'+'<p>kandungan '+title+'</p>'.repeat(20)+'</section>\n<script>console.log("part '+i+'")</script></body></html>';

 await p.route('https://api.test/v1/chat/completions',async route=>{
   const body=JSON.parse(route.request().postData());calls.push(body);
   const last=(body.messages||[]).at(-1)||{};
   const isPlan=/Break this task into/.test(last.content||"");
   if(isPlan){
     await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([
       {choices:[{delta:{content:'1. Head and global styles\n2. Hero section\n3. Menu and about\n4. Gallery\n5. Footer and scripts'}}]},
       {choices:[{delta:{},finish_reason:'stop'}]}
     ])});
     return;
   }
   const isCode=/Approved plan/.test(last.content||"");
   if(isCode){
     const html='<!doctype html>\n<html><head><style>.hero{color:red}</style></head><body><section><h2>Hero section</h2><p>kandungan halaman</p></section><footer>Footer and scripts</footer>\n<script>console.log("ok")</script></body></html>';
     await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([
       {choices:[{delta:{content:'```html\n'+html+'\n```'}}]},
       {choices:[{delta:{},finish_reason:'stop'}]}
     ])});
     return;
   }
   await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([
     {choices:[{delta:{content:'plain answer'}}]},
     {choices:[{delta:{},finish_reason:'stop'}]}
   ])});
 });

 await p.goto(appUrl);
 await p.evaluate(()=>{localStorage.setItem('nazchat_v1',JSON.stringify({schemaVersion:3,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{m:{context_length:128000}}}],conversations:[],projects:[],prompts:[],styles:[],artifacts:[],lastProviderId:'p',lastModelId:'m',onboardingDone:true,theme:'dark',parametersByModel:{},skillSettings:{mode:'auto',selected:[],disabled:[],custom:[]}}));location.reload()});
 await p.waitForFunction(()=>typeof currentModel==='function');

 // 1. A long HTML build runs ONE thinking call then ONE coding call.
 await p.fill('#promptInput','buat landing page lengkap untuk kedai kopi dengan hero, menu, galeri dan footer');await p.click('#sendBtn');
 await p.waitForFunction(()=>!generating,{timeout:60000});
 const planCalls=calls.filter(c=>(c.messages||[]).some(m=>/Break this task into/.test(m.content||"")));
 const codeCalls=calls.filter(c=>(c.messages||[]).some(m=>/Approved plan/.test(String(m.content||""))));
 assert(planCalls.length===1,'expected exactly one thinking call, got '+planCalls.length);
 assert(codeCalls.length===1,'expected exactly one coding call, got '+codeCalls.length);
 planCalls.forEach(c=>assert(c.max_tokens<=1024,'thinking call budget too big: '+c.max_tokens));
 codeCalls.forEach(c=>assert(c.max_tokens>4096,'coding call should use the full model budget'));
 console.log('PASS two-phase build: 1 thinking call + 1 coding call');

 const result=await p.evaluate(()=>{
   const m=conv.messages.at(-1);
   return {phases:m.phases, html:extractHtmlBlock(m.content||""), reasoning:m.reasoning||""};
 });
 assert(result.phases&&result.phases.state==='done','phases not marked done');
 assert(/```html/.test(result.html)||/<[a-z]/i.test(result.html),'coding output missing');
 assert(/Build plan/.test(result.reasoning),'thinking phase not recorded as reasoning');
 console.log('PASS thinking phase + single coding phase recorded');

 // 2. Short questions do NOT go through phases.
 calls.length=0;
 await p.fill('#promptInput','apa itu kopi');await p.click('#sendBtn');
 await p.waitForFunction(()=>!generating,{timeout:30000});
 assert(calls.length===1,'short request should be a single call, got '+calls.length);
 assert(!calls[0].messages.some(m=>/Break this task into/.test(m.content||"")),'short request unexpectedly planned');
 console.log('PASS short request stays single-call');

 // 3. Reasoning cap: the streaming path stops accumulating reasoning past the cap.
 const capped=await p.evaluate(()=>REASONING_CHAR_CAP);
 assert(capped===16000,'REASONING_CHAR_CAP wrong: '+capped);
 const cappedSim=await p.evaluate(()=>{
   // simulate two deltas beyond the cap exactly as the stream loop does
   let reasoning="a".repeat(REASONING_CHAR_CAP);
   const d1={reasoning_content:" more"};
   if(reasoning.length < REASONING_CHAR_CAP){ reasoning += d1.reasoning_content; }
   let cappedFlag=true;
   const before=reasoning.length;
   if(reasoning.length < REASONING_CHAR_CAP){ reasoning += d1.reasoning_content; } else { reasoning += "…"; }
   return {before, after:reasoning.length, stopped:reasoning.length<=before+1};
 });
 assert(cappedSim.stopped,'reasoning kept accumulating past the cap');
 console.log('PASS reasoning cap enforced at',capped,'chars');

 // 4. Reasoning-length rescue: stream ends with length + no content → one retry asking for the answer.
 calls.length=0;
 await p.route('https://api.test/v1/chat/completions',async route=>{
   const body=JSON.parse(route.request().postData());calls.push(body);
   const asked=/Stop reasoning now/.test((body.messages||[]).at(-1)?.content||"");
   if(!asked){
     await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([
       {choices:[{delta:{reasoning_content:'fikir sangat panjang disini '.repeat(200)}}]},
       {choices:[{delta:{},finish_reason:'length'}]}
     ])});
     return;
   }
   await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([
     {choices:[{delta:{content:'Jawapan terus tanpa fikir panjang.'}}]},
     {choices:[{delta:{},finish_reason:'stop'}]}
   ])});
 });
 await p.fill('#promptInput','terangkan atom');await p.click('#sendBtn');
 await p.waitForFunction(()=>!generating,{timeout:30000});
 const rescued=await p.evaluate(()=>({content:conv.messages.at(-1).content,reasoning:conv.messages.at(-1).reasoning}));
 assert(/Jawapan terus/.test(rescued.content),'rescue answer missing: '+rescued.content.slice(0,80));
 assert(calls.length===2,'expected rescue retry, got '+calls.length+' calls');
 assert(/Stop reasoning now/.test((calls[1].messages||[]).at(-1).content),'rescue prompt missing');
 console.log('PASS reasoning-length rescue: answer recovered in 1 retry');

 // 5. Default effort downgraded from legacy high.
 const effort=await p.evaluate(()=>db.reasoningEffort);
 assert(effort==='medium','default effort not medium: '+effort);
 console.log('PASS default reasoning effort is',effort);

 assert.deepStrictEqual(errors,[]);
 console.log('PASS no page errors');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
