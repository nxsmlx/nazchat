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
  ports:(ip,spec)=>{if(/^[\d,-]+$/.test(spec)&&spec.split(',').length>1200)return -1;const id=++n;__scan.push(['ports',ip,spec]);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'port',ip,port:23,banner:'BusyBox telnetd'})),5);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'port',ip,port:80,banner:'IPCam'})),10);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'done'})),15);return id;},
  udp:ip=>{const id=++n;__scan.push(['udp',ip]);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'udp',ip,port:53,info:'DNS server · answers lookups for any name'})),5);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'done'})),10);return id;},
  discover:()=>{const id=++n;__scan.push(['discover']);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'service',ip:'192.168.1.50',via:'mdns',names:['_ipp._tcp.local','HP LaserJet']})),5);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'service',ip:'192.168.1.60',via:'ssdp',server:'Linux UPnP/1.0 SmartTV',st:'upnp:rootdevice'})),8);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'done'})),12);return id;},
  http:(url,method,origin)=>{const id=++n;__scan.push(['http',url]);const path=new URL(url).pathname;
   const r=path==='/.git/HEAD'?{status:200,headers:{},body:'ref: refs/heads/main\\n'}:path==='/'?{status:200,headers:{'set-cookie':['sid=1; Path=/'],'server':['nginx/1.18.0']},body:'<html><a href="/about">a</a></html>'}:{status:404,headers:{},body:''};
   setTimeout(()=>{nazScanEvent(id,JSON.stringify({type:'http',...r}));nazScanEvent(id,JSON.stringify({type:'done'}));},3);return id;},
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

 // 4. Public website audit is read-only and returns structured checks. The user named
 //    the domain, so it runs without asking.
 nextTool='website_audit';args={domain:'https://Kopi.example.com/menu'};
 await ask('Audit my website kopi.example.com');await done();out=lastTool();
 assert.equal(await page.locator('#customDialogScrim.open').count(),0,'asked for a domain the user typed');
 assert.equal(out.domain,'kopi.example.com');
 assert(out.checks.some(c=>c.label==='Certificate'&&c.level==='ok'));
 assert(out.checks.some(c=>c.label==='DNS address'&&/203\.0\.113\.7/.test(c.detail)));
 console.log('PASS chat website audit returns TLS, headers and DNS checks');

 // 4b. A domain the user never named needs approval, like fetch_url. Declining audits nothing.
 nextTool='website_audit';args={domain:'other.example.org'};
 await ask('Audit my website');await page.waitForSelector('#customDialogScrim.open');
 assert.match(await page.locator('#customDialogMessage').textContent(),/other\.example\.org/);
 await page.click('#customDialogCancel');await done();
 assert.match(lastTool().error,/declined auditing/);
 // Allowing the site for this chat lets later audits of it run without asking.
 await ask('Audit my website');await page.waitForSelector('#customDialogScrim.open');
 await page.getByRole('button',{name:'Allow other.example.org for this chat'}).click();await done();
 assert.equal(lastTool().domain,'other.example.org');
 assert.deepEqual(await page.evaluate(()=>conv.siteAllow),['https://other.example.org']);
 console.log('PASS chat website audit asks before an unnamed site; decline and allow-for-chat work');

 // 6. Custom port list, UDP check and service discovery, all under the same permission.
 await page.evaluate(()=>{net.agreed=true;});
 nextTool='network_ports';args={ip:'192.168.1.40',profile:'custom',ports:'22, 80, 8000-8100'};
 await ask('Check ports 22,80,8000-8100 on 192.168.1.40');await done();
 out=lastTool();assert.equal(out.profile,'custom');assert.equal(out.ports,'22,80,8000-8100');
 assert.deepEqual(await page.evaluate(()=>__scan.filter(x=>x[0]==='ports').at(-1)),['ports','192.168.1.40','22,80,8000-8100']);
 nextTool='network_ports';args={ip:'192.168.1.40',profile:'custom',ports:'all of them'};
 await ask('Check every port');await done();assert.match(lastTool().error,/list ports like 22,80/);
 nextTool='network_udp';args={ip:'192.168.1.1'};
 await ask('UDP check the router');await done();
 out=lastTool();assert.equal(out.udpServices[0].port,53);assert.equal(out.udpServices[0].risk,'medium');
 nextTool='network_discover';args={};
 await ask('What devices announce services?');await done();
 out=lastTool();assert.equal(out.deviceCount,2);
 assert.deepEqual(out.devices.map(d=>d.ip),['192.168.1.50','192.168.1.60']);
 assert.match(out.devices[0].services[0],/HP LaserJet/);assert.match(out.devices[1].services[0],/SmartTV/);
 assert.match(await page.locator('.tool-trace').last().innerText(),/Find announced services/);
 // Declining covers the new tools too.
 await page.evaluate(()=>{net.agreed=false;__scan.length=0;});
 nextTool='network_udp';args={ip:'192.168.1.1'};
 await ask('UDP check again');await page.waitForSelector('#customDialogScrim.open');
 await page.click('#customDialogCancel');await done();
 assert.match(lastTool().error,/declined/);assert.deepEqual(await page.evaluate(()=>__scan),[]);
 console.log('PASS chat custom ports, UDP check and service discovery ask first and return results');

 // 7. Website test: passive checks on any site; active checks only on a verified domain.
 nextTool='website_test';args={domain:'kopi.example.com'};
 await ask('Test kopi.example.com for security problems');await done();
 out=lastTool();assert.equal(out.verified,false);assert.match(out.note,/verify kopi\.example\.com/);
 assert(out.checks.some(c=>/Header server/.test(c.label)));
 assert(!(await page.evaluate(()=>__scan.some(x=>x[0]==='http'&&/\.git/.test(x[1])))),'active check ran on an unverified domain');
 await page.evaluate(()=>setWebTestState({verified:{'kopi.example.com':'dns'}}));
 await ask('Test kopi.example.com again');await done();
 out=lastTool();assert.equal(out.verified,true);
 assert(out.checks.some(c=>c.label==='/.git/HEAD'&&c.level==='high'));
 assert(out.checks.some(c=>c.label==='Crawl'));
 console.log('PASS chat website test: passive on any site, exposed files only on a verified domain');

 // 5. Chat tools do not leak into Code mode or into the Network sheet results.
 const defs=await page.evaluate(()=>({chat:kitaTools('chat').map(t=>t.function.name),code:kitaTools('code').map(t=>t.function.name)}));
 const isNetworkToolName=n=>/^network_|^website_/.test(n);
 assert(defs.chat.includes('network_scan')&&defs.chat.includes('website_audit'));
 assert(defs.chat.includes('network_udp')&&defs.chat.includes('network_discover')&&defs.chat.includes('website_test'));
 assert(!defs.code.some(n=>isNetworkToolName(n)));
 assert.equal(await page.evaluate(()=>net.hosts.size),0,'tool scans polluted the Network sheet');
 // Finished jobs (chat or Network sheet) leave no handler behind.
 assert.equal(await page.evaluate(()=>{scanJobs.set(99,()=>{});nazScanEvent(99,JSON.stringify({type:'done'}));return scanJobs.size;}),0);
 assert.deepEqual(errors,[]);
 console.log('PASS network chat tools stay out of Code mode and keep the sheet state separate');
 console.log('PASS network chat tools: scans, ports, permission, website audit and chat isolation');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
