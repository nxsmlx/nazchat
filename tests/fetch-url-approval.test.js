const {launch, appUrl}=require('./browser');
const assert=require('assert');

// fetch_url must not let the model (or text injected into a fetched page or tool
// result) send chat data to an address the user never chose. URLs the user typed
// and URLs returned by a search open directly; anything else needs approval, and
// private network addresses are always refused.
(async()=>{
 const b=await launch();
 const p=await b.newPage({viewport:{width:390,height:844}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const pages=[];let toolUrl='';const toolResults=[];
 await p.route(/^https?:\/\//,route=>{
   const url=route.request().url();
   if(url==='https://api.test/v1/chat/completions'){
     const body=JSON.parse(route.request().postData());
     const sse=f=>f.map(x=>'data: '+JSON.stringify(x)).join('\n\n')+'\n\ndata: [DONE]\n\n';
     const tool=(body.messages||[]).find(m=>m.role==='tool');
     if(!tool) return route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([
       {choices:[{delta:{tool_calls:[{index:0,id:'call_1',type:'function',function:{name:'fetch_url',arguments:JSON.stringify({url:toolUrl})}}]}}]},
       {choices:[{delta:{},finish_reason:'tool_calls'}]}])});
     toolResults.push(tool.content);
     return route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse([{choices:[{delta:{content:'Done.'},finish_reason:'stop'}]}])});
   }
   // Background skill-pack and updater checks are not page fetches.
   if(/^https:\/\/(raw\.githubusercontent\.com|api\.github\.com)\//.test(url)) return route.fulfill({status:503,body:'{}'});
   pages.push(url);
   return route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'Page fixture text'});
 });
 await p.goto(appUrl);
 await p.evaluate(()=>{localStorage.setItem('nazchat_v1',JSON.stringify({schemaVersion:3,onboardingDone:true,search:false,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{m:{context_length:128000}}}],conversations:[],projects:[],lastProviderId:'p',lastModelId:'m'}));});
 await p.reload();
 await p.waitForFunction(()=>typeof db!=='undefined'&&typeof currentModel==='function',{timeout:15000});
 const ask=async(prompt,url)=>{toolUrl=url;await p.evaluate(()=>{conv=null;renderAll();});await p.fill('#promptInput',prompt);await p.click('#sendBtn');};
 const done=()=>p.waitForFunction(()=>!generating,null,{timeout:30000});

 // 1. A URL the user typed opens without a prompt.
 await ask('Summarise https://docs.test/guide please','https://docs.test/guide');await done();
 assert.deepEqual(pages,['https://docs.test/guide'],'typed URL was not fetched directly: '+JSON.stringify(pages));
 assert.equal(await p.locator('#customDialogScrim.open').count(),0);
 console.log('PASS URL typed by the user opens without approval');

 // 2. A URL the model composed asks first; declining fetches nothing.
 pages.length=0;toolResults.length=0;
 await ask('What does my last note say?','https://collector.test/log?d=private+chat+text');
 await p.waitForFunction(()=>document.querySelector('#customDialogScrim.open')&&document.querySelector('#customDialogTitle').textContent==='Open this page?',null,{timeout:15000});
 const dialogText=await p.evaluate(()=>document.querySelector('#customDialogMessage').textContent);
 assert(dialogText.includes('https://collector.test/log?d=private+chat+text'),'dialog does not show the full address: '+dialogText);
 await p.click('#customDialogCancel');await done();
 assert.deepEqual(pages,[],'declined URL was still requested');
 assert(toolResults.some(t=>/declined/i.test(t)),'model was not told the user declined');
 console.log('PASS composed URL needs approval; declining sends nothing');

 // 3. Approving opens it once.
 pages.length=0;
 await ask('Check the status page','https://status.test/now');
 await p.waitForFunction(()=>document.querySelector('#customDialogScrim.open')&&document.querySelector('#customDialogTitle').textContent==='Open this page?',null,{timeout:15000});
 await p.click('#customDialogConfirm');await done();
 assert.deepEqual(pages,['https://status.test/now'],'approved URL was not fetched');
 console.log('PASS approved URL is fetched once');

 // 4. Private network addresses are refused even when typed by the user.
 pages.length=0;toolResults.length=0;
 await ask('Open http://192.168.1.1/admin','http://192.168.1.1/admin');await done();
 assert.deepEqual(pages,[],'private address was requested');
 assert(toolResults.some(t=>/Private network/i.test(t)),'private address refusal missing');
 for(const host of ['localhost','127.0.0.1','10.0.0.2','172.16.4.1','169.254.169.254','[::1]','printer.local','100.64.0.1'])
   assert(await p.evaluate(h=>isPrivateHostName(new URL('http://'+h+'/').hostname),host),'not treated as private: '+host);
 for(const host of ['example.com','8.8.8.8','172.32.0.1','100.128.0.1'])
   assert(!(await p.evaluate(h=>isPrivateHostName(new URL('http://'+h+'/').hostname),host)),'public host refused: '+host);
 console.log('PASS private network addresses are refused');

 assert.deepEqual(errors,[]);
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
