const {launch,appUrl}=require('./browser');
const assert=require('assert');

/* Network chat tools reuse the installed app's scanner, ask before scanning and
   feed results back to the model. All providers and native bridges are mocked. */
const API='https://api.test/v1/chat/completions';
const seed={schemaVersion:3,onboardingDone:true,search:false,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{m:{context_length:128000}}}],conversations:[],projects:[],lastProviderId:'p',lastModelId:'m'};
const nativeMock=`(()=>{let n=0;window.__scan=[];
 window.NazNetScan={info:()=>JSON.stringify({type:'wifi',ip:'192.168.1.23',prefix:24,gateway:'192.168.1.1',dns:['192.168.1.1'],scannable:true}),
  cancel:id=>__scan.push(['cancel',id]),
  sweep:()=>{const id=++n;__scan.push(['sweep']);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'host',ip:'192.168.1.1',name:'router.lan',open:[80,53]})),5);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'host',ip:'192.168.1.40',name:'',open:[554,23]})),10);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'done',total:253})),15);return id;},
  ports:(ip,spec)=>{const id=++n;__scan.push(['ports',ip,spec]);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'port',ip,port:23,banner:'BusyBox telnetd'})),5);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'port',ip,port:80,banner:'IPCam'})),10);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'done'})),15);return id;},
  tls:h=>JSON.stringify({valid:true,status:200,cipher:'TLS_AES_128_GCM_SHA256',issuer:'CN=R11',notAfter:Date.now()+90*864e5,headers:{'strict-transport-security':'max-age=31536000'},httpRedirect:'https://'+h+'/'})};})()`;
const enc=x=>'data: '+JSON.stringify(x)+'\n\n';
const toolCall=(name,args)=>enc({choices:[{delta:{tool_calls:[{index:0,id:'call_1',type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]})+enc({choices:[{delta:{},finish_reason:'tool_calls'}]})+'data: [DONE]\n\n';
const answer=text=>enc({choices:[{delta:{content:text},finish_reason:'stop'}]})+'data: [DONE]\n\n';

(async()=>{
 const b=await launch();const page=await b.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const requests=[];let nextTool='network_scan',args={};
 await page.route(/^https?:\/\//,async route=>{
  const url=route.request().url();
  if(url===API){
   const body=JSON.parse(route.request().postData());requests.push(body);
   const tool=(body.messages||[]).filter(m=>m.role==='tool').at(-1);
   if(tool)return route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:answer('Network report understood.')});
   return route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:toolCall(nextTool,args)});
  }
  if(url.startsWith('https://1.1.1.1/dns-query')){
   const u=new URL(url),type=u.searchParams.get('type');
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({Status:0,Answer:type==='A'?[{data:'203.0.113.7'}]:[]})});
  }
  return route.fulfill({status:503,body:'{}'});
 });
 await page.addInitScript(db=>{try{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}}catch(e){}},seed);
 await page.goto(appUrl);await page.waitForFunction(()=>typeof send==='function');
 await page.evaluate(nativeMock);
 const ask=async(prompt)=>{
  await page.evaluate(()=>{conv=null;renderAll();});
  await page.fill('#promptInput',prompt);await page.click('#sendBtn');
 };
 const done=()=>page.waitForFunction(()=>!generating,null,{timeout:30000});
 const lastTool=()=>JSON.parse(requests.at(-1).messages.filter(m=>m.role==='tool').at(-1).content);

 // 1. The model can scan, but only after the user explicitly agrees.
 await ask('Scan my Wi-Fi for devices');
 await page.waitForSelector('#customDialogScrim.open');
 assert.match(await page.locator('#customDialogMessage').textContent(),/Only scan networks you own/);
 assert.deepEqual(await page.evaluate(()=>__scan),[]);
 await page.click('#customDialogConfirm');await done();
 let out=lastTool();
 assert.equal(out.network,'192.168.1.23/24');assert.equal(out.deviceCount,2);
 assert.deepEqual(out.devices[0].open,[53,80]);assert.deepEqual(out.devices[1].open,[23,554]);
 assert.match(await page.locator('.msg.assistant .bubble').last().innerText(),/Network report understood/);
 assert.match(await page.locator('.tool-trace').innerText(),/Scan Wi-Fi devices/);
 console.log('PASS chat network scan asks first, returns devices and feeds the model');

 // 2. The same session permission covers a port check on a discovered private device.
 nextTool='network_ports';args={ip:'192.168.1.40',profile:'quick'};
 await ask('Check ports on 192.168.1.40');await done();
 out=lastTool();assert.equal(out.ip,'192.168.1.40');assert.equal(out.openPorts.length,2);
 assert.equal(out.openPorts[0].risk,'high');assert.match(out.openPorts[0].banner,/BusyBox/);
 assert.deepEqual(await page.evaluate(()=>__scan.filter(x=>x[0]==='ports')),[['ports','192.168.1.40','quick']]);
 console.log('PASS chat port check uses the same permission and returns risk notes');

 // 3. Declining sends a clear tool error and never starts native scanning.
 nextTool='network_scan';args={};
 await page.evaluate(()=>{net.agreed=false;__scan.length=0;});
 await ask('Scan again');await page.waitForSelector('#customDialogScrim.open');
 await page.click('#customDialogCancel');await done();
 assert.match(lastTool().error,/declined/);assert.deepEqual(await page.evaluate(()=>__scan),[]);
 console.log('PASS declining a chat network scan starts nothing');

 // 4. Public website audit is read-only and returns structured checks.
 nextTool='website_audit';args={domain:'https://Kopi.example.com/menu'};
 await ask('Audit my website');await done();out=lastTool();
 assert.equal(out.domain,'kopi.example.com');
 assert(out.checks.some(c=>c.label==='Certificate'&&c.level==='ok'));
 assert(out.checks.some(c=>c.label==='DNS address'&&/203\.0\.113\.7/.test(c.detail)));
 console.log('PASS chat website audit returns TLS, headers and DNS checks');

 // 5. Chat tools do not leak into Code mode or into the Network sheet results.
 const defs=await page.evaluate(()=>({chat:kitaTools('chat').map(t=>t.function.name),code:kitaTools('code').map(t=>t.function.name)}));
 assert(defs.chat.includes('network_scan')&&defs.chat.includes('website_audit'));
 assert(!defs.code.includes('network_scan')&&!defs.code.includes('network_ports')&&!defs.code.includes('website_audit'));
 assert.equal(await page.evaluate(()=>net.hosts.size),0,'tool scans polluted the Network sheet');
 assert.deepEqual(errors,[]);
 console.log('PASS network chat tools stay out of Code mode and keep the sheet state separate');
 console.log('PASS network chat tools: scans, ports, permission, website audit and chat isolation');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
