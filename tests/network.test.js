const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.14.0: network tools. Uses a mocked NazNetScan (the real limits are tested on the
// host JVM in native-scan): device sweep, port notes, discovery, the website audit,
// mobile-data refusal and "Ask Kita" with the report attached.
const seed=extra=>({schemaVersion:3,onboardingDone:true,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{}}],lastProviderId:'p',lastModelId:'m',conversations:[],projects:[],...extra});
const mock=(info)=>`(()=>{let n=0;window.__scan=[];const emit=(id,o)=>setTimeout(()=>nazScanEvent(id,JSON.stringify(o)),5);
 window.NazNetScan={info:()=>JSON.stringify(${JSON.stringify(info)}),cancel:id=>__scan.push(['cancel',id]),
  sweep:()=>{const id=++n;__scan.push(['sweep']);emit(id,{type:'host',ip:'192.168.1.1',name:'router.lan',open:[80,53]});emit(id,{type:'host',ip:'192.168.1.40',name:'',open:[554,23]});emit(id,{type:'progress',done:64,total:253});setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'done',cancelled:false,total:253})),30);return id;},
  ports:(ip,spec)=>{const id=++n;__scan.push(['ports',ip,spec]);if(ip==='192.168.1.40'){emit(id,{type:'port',ip,port:23,banner:'BusyBox telnetd'});emit(id,{type:'port',ip,port:554,banner:''});emit(id,{type:'port',ip,port:80,banner:'HTTP 200 · IPCam'});}setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'done'})),30);return id;},
  discover:()=>{const id=++n;__scan.push(['discover']);emit(id,{type:'service',via:'ssdp',ip:'192.168.1.1',server:'MiniUPnPd/2.1',st:'upnp:rootdevice'});emit(id,{type:'service',via:'mdns',ip:'192.168.1.50',names:['_ipp._tcp.local']});setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'done'})),30);return id;},
  tls:h=>JSON.stringify({valid:true,status:200,cipher:'TLS_AES_128_GCM_SHA256',issuer:'CN=R11,O=Let\\'s Encrypt',notAfter:Date.now()+20*864e5,headers:{'strict-transport-security':'max-age=31536000',server:'nginx/1.18.0'},httpStatus:301,httpRedirect:'https://'+h+'/'})};})()`;

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof openNetworkSheet==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }
 const confirm=async page=>{await page.locator('#customDialogScrim.open #customDialogConfirm').click();};

 await scenario('scan devices on Wi-Fi (asks once), check ports with risk notes, discover services',seed(),async page=>{
   await page.evaluate(mock({type:'wifi',ip:'192.168.1.23',prefix:24,gateway:'192.168.1.1',dns:['192.168.1.1'],scannable:true}));
   await page.evaluate(()=>{renderToolsSheet();openSheet('toolsSheet');});
   await page.getByRole('button',{name:'Open network tools'}).click();
   assert.match(await page.locator('.net-info').innerText(),/Wi-Fi · 192\.168\.1\.23\/24[\s\S]*Gateway 192\.168\.1\.1/);
   await page.getByRole('button',{name:'Scan devices'}).click();
   await page.waitForSelector('#customDialogScrim.open');
   assert.match(await page.locator('#customDialogMessage').textContent(),/192\.168\.1\.23\/24[\s\S]*Only scan networks you own/);
   await confirm(page);
   await page.waitForFunction(()=>/Done · 2 devices found/.test(document.querySelector('.net-progress')?.textContent||''));
   const hosts=await page.locator('.net-host').allInnerTexts();
   assert.match(hosts[0],/192\.168\.1\.1 · router[\s\S]*router\.lan/);assert.match(hosts[1],/192\.168\.1\.40[\s\S]*Unknown device/);
   assert.equal(await page.locator('.net-host[data-ip="192.168.1.40"] .net-dot').getAttribute('class'),'net-dot high','telnet makes the device high risk');
   // Port check (no second confirmation in the same session).
   await page.locator('.net-host[data-ip="192.168.1.40"]').getByRole('button',{name:'Check ports'}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.net-host[data-ip="192.168.1.40"] .net-port-notes li').length===3);
   const notes=await page.locator('.net-host[data-ip="192.168.1.40"] .net-port-notes li').allInnerTexts();
   assert.match(notes[0],/^23\s+Telnet: unencrypted remote login[\s\S]*BusyBox telnetd/);assert.match(notes[1],/^80\s+Web page without encryption[\s\S]*IPCam/);assert.match(notes[2],/^554\s+RTSP video stream/);
   assert.deepEqual(await page.evaluate(()=>__scan.filter(x=>x[0]==='ports')),[['ports','192.168.1.40','']]);
   // Discovery.
   await page.getByRole('button',{name:'Discover services'}).click();
   await page.waitForFunction(()=>/Discovery done/.test(document.querySelector('.net-progress')?.textContent||''));
   assert.match(await page.locator('.net-host[data-ip="192.168.1.1"]').innerText(),/MiniUPnPd\/2\.1 · upnp:rootdevice/);
   assert.match(await page.locator('.net-host[data-ip="192.168.1.50"]').innerText(),/_ipp\._tcp\.local/);
   assert.equal(await page.evaluate(()=>__scan.filter(x=>x[0]==='sweep').length),1);
 });

 await scenario('mobile data is never scanned',seed(),async page=>{
   await page.evaluate(mock({type:'cellular',ip:'100.70.1.2',prefix:24,scannable:false}));
   await page.evaluate(()=>openNetworkSheet());
   assert.match(await page.locator('#toolsSheetBody').textContent(),/Mobile data networks belong to your carrier and are never scanned/);
   assert.equal(await page.getByRole('button',{name:'Scan devices'}).isDisabled(),true);
   assert.equal(await page.getByRole('button',{name:'Discover services'}).isDisabled(),true);
 });

 await scenario('declining the scan prompt scans nothing',seed(),async page=>{
   await page.evaluate(mock({type:'wifi',ip:'192.168.1.23',prefix:24,scannable:true}));
   await page.evaluate(()=>openNetworkSheet());
   await page.getByRole('button',{name:'Scan devices'}).click();
   await page.locator('#customDialogScrim.open #customDialogCancel').click();
   assert.deepEqual(await page.evaluate(()=>__scan),[]);
 });

 await scenario('website audit: certificate, http→https, headers and DNS records',seed(),async page=>{
   await page.evaluate(mock({type:'wifi',ip:'192.168.1.23',prefix:24,scannable:true}));
   await page.route('https://1.1.1.1/dns-query**',r=>{const u=new URL(r.request().url()),t=u.searchParams.get('type'),n=u.searchParams.get('name');
     const ans={A:[{data:'203.0.113.7'}],MX:[{data:'10 mx.example.com.'}],TXT:n.startsWith('_dmarc')?[]:[{data:'"v=spf1 include:_spf.example.com ~all"'}],AAAA:[],CAA:[]}[t]||[];
     r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({Status:0,Answer:ans})});});
   await page.evaluate(()=>openNetworkSheet());
   await page.fill('#auditDomain','https://Kopi.example.com/menu');await page.getByRole('button',{name:'Audit'}).click();
   await page.waitForSelector('.net-audit li');
   const rows=await page.locator('.net-audit li').evaluateAll(ls=>ls.map(l=>l.className+' '+l.innerText.replace(/\s+/g,' ')));
   const find=k=>rows.find(r=>r.includes(k))||'';
   assert.match(find('Certificate'),/^medium Certificate R11 · expires in 20 days/);
   assert.match(find('http → https'),/^ok/);assert.match(find('HSTS'),/^ok/);
   assert.match(find('Content-Security-Policy'),/^medium/);assert.match(find('Server header'),/^low .*nginx\/1\.18\.0/);
   assert.match(find('DNS address'),/^ok .*203\.0\.113\.7/);assert.match(find('SPF'),/^ok/);assert.match(find('DMARC'),/^medium .*missing/);
   assert.equal(await page.evaluate(()=>net.audit.domain),'kopi.example.com');
   await page.fill('#auditDomain','not a domain');await page.getByRole('button',{name:'Audit'}).click();
 });

 await scenario('Ask Kita: the report goes into a Chat message as an attachment',seed(),async page=>{
   await page.evaluate(mock({type:'wifi',ip:'192.168.1.23',prefix:24,gateway:'192.168.1.1',scannable:true}));
   await page.evaluate(()=>{openNetworkSheet();net.agreed=true;});
   await page.getByRole('button',{name:'Scan devices'}).click();
   await page.waitForFunction(()=>/Done/.test(document.querySelector('.net-progress')?.textContent||''));
   await page.getByRole('button',{name:'Ask Kita about these results'}).click();
   const r=await page.evaluate(()=>({att:pendingAttachments.map(a=>[a.name,a.pasted]),text:pendingAttachments[0].text,input:$('#promptInput').value,mode:kitaMode()}));
   assert.deepEqual(r.att,[['network-report.txt',true]]);assert.equal(r.mode,'chat');
   assert.match(r.text,/Network: wifi 192\.168\.1\.23\/24 · gateway 192\.168\.1\.1/);assert.match(r.text,/192\.168\.1\.40[\s\S]*port 23 \[high\] Telnet/);
   assert.match(r.input,/which devices and open services are risky/);
 });

 await scenario('browser build: explains that network tools need the app',seed(),async page=>{
   await page.evaluate(()=>openNetworkSheet());
   assert.match(await page.locator('#toolsSheetBody').textContent(),/Network tools work in the installed app/);
 });

 await b.close();
 if(failed){console.error(failed+' failed');process.exitCode=1;}else console.log('4.14.0 network tools: all passed');
})();
