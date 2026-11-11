const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.15.0: capture analysis (pcap + pcapng built here byte by byte), the website test
// (passive checks; active checks only after domain verification) and the scanner's
// port profiles, UDP probes and report export. Native parts are mocked.
const seed=extra=>({schemaVersion:3,onboardingDone:true,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{}}],lastProviderId:'p',lastModelId:'m',conversations:[],projects:[],...extra});

// ---- capture builders ----
const u16=n=>[n>>8&255,n&255];
const ip4=s=>s.split('.').map(Number);
function ipv4(src,dst,proto,payload){const len=20+payload.length;return [0x45,0,...u16(len),0,0,0,0,64,proto,0,0,...ip4(src),...ip4(dst),...payload];}
function udp(sp,dp,data){return [...u16(sp),...u16(dp),...u16(8+data.length),0,0,...data];}
function tcp(sp,dp,data){return [...u16(sp),...u16(dp),0,0,0,1,0,0,0,0,0x50,0x18,0xff,0xff,0,0,0,0,...data];}
function qname(n){const o=[];for(const l of n.split('.')){o.push(l.length,...Buffer.from(l));}o.push(0);return o;}
function dnsQuery(name){return [0x12,0x34,1,0,0,1,0,0,0,0,0,0,...qname(name),0,1,0,1];}
function dnsAnswer(name,ip){return [0x12,0x34,0x81,0x80,0,1,0,1,0,0,0,0,...qname(name),0,1,0,1,0xc0,12,0,1,0,1,0,0,0,60,0,4,...ip4(ip)];}
function clientHello(host){
  const sni=[0,0,...u16(host.length+5),...u16(host.length+3),0,...u16(host.length),...Buffer.from(host)];
  const body=[3,3,...new Array(32).fill(1),0,0,2,0x13,1,1,0,...u16(sni.length),...sni];
  const hs=[1,0,...u16(body.length),...body];
  return [0x16,3,1,...u16(hs.length),...hs];
}
const eth=ip=>[...new Array(12).fill(0),8,0,...ip];
const pkts=[
  ipv4('10.0.0.2','8.8.8.8',17,udp(5000,53,dnsQuery('tracker.ads.example'))),
  ipv4('10.0.0.2','8.8.8.8',17,udp(5001,53,dnsQuery('api.example.com'))),
  ipv4('8.8.8.8','10.0.0.2',17,udp(53,5001,dnsAnswer('api.example.com','93.184.216.34'))),
  ipv4('10.0.0.2','93.184.216.34',6,tcp(40000,443,clientHello('api.example.com'))),
  ipv4('10.0.0.2','203.0.113.9',6,tcp(40001,80,[...Buffer.from('GET /login?user=nazz HTTP/1.1\r\nHost: plain.example\r\n\r\n')])),
  ipv4('10.0.0.2','142.250.1.1',17,udp(40002,443,new Array(30).fill(0xc3))),
];
function pcap(){const h=[0xd4,0xc3,0xb2,0xa1,2,0,4,0,0,0,0,0,0,0,0,0,0xff,0xff,0,0,1,0,0,0];const out=[...h];pkts.forEach((p,i)=>{const d=eth(p),le=n=>[n&255,n>>8&255,n>>16&255,n>>24&255];out.push(...le(1700000000+i),...le(0),...le(d.length),...le(d.length),...d);});return out;}
function pcapng(){
  const le32=n=>[n&255,n>>8&255,n>>16&255,n>>24&255],le16=n=>[n&255,n>>8&255];
  const block=(type,body)=>{const pad=(4-body.length%4)%4,len=12+body.length+pad;return [...le32(type),...le32(len),...body,...new Array(pad).fill(0),...le32(len)];};
  const out=[...block(0x0A0D0D0A,[...le32(0x1A2B3C4D),1,0,0,0,...new Array(8).fill(0xff)]),...block(1,[...le16(101),0,0,...le32(65535)])];
  pkts.forEach((p,i)=>out.push(...block(6,[...le32(0),...le32(0),...le32(1000000*i),...le32(p.length),...le32(p.length),...p])));
  return out;
}

(async()=>{
 const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof analyzeCapture==='function'&&typeof runWebTest==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }

 await scenario('capture analysis: pcap and pcapng give DNS lookups, TLS sites, plain HTTP and hosts',seed(),async page=>{
   for(const [label,bytes] of [['pcap',pcap()],['pcapng',pcapng()]]){
     const r=await page.evaluate(bytes=>{const a=analyzeCapture(new Uint8Array(bytes).buffer);return {format:a.format,packets:a.packets,dns:[...a.dns.keys()],sni:[...a.sni.keys()],http:a.http,quic:a.proto.quic,name:a.names.get('93.184.216.34'),summary:captureSummary(a,'x.pcap')};},bytes);
     assert.equal(r.format,label);assert.equal(r.packets,6);
     assert.deepEqual(r.dns,['tracker.ads.example','api.example.com']);assert.deepEqual(r.sni,['api.example.com']);
     assert.deepEqual(r.http,[{host:'plain.example',line:'GET /login?user=nazz HTTP/1.1',port:80}]);
     assert.equal(r.quic,1);assert.equal(r.name,'api.example.com');
     assert.match(r.summary,/Top hosts by data:[\s\S]*93\.184\.216\.34 \(api\.example\.com\)/);
     assert.match(r.summary,/Unencrypted HTTP requests \(1\):\n- plain\.example · GET \/login\?user=nazz/);
   }
   assert.match(await page.evaluate(()=>{try{analyzeCapture(new Uint8Array([1,2,3,4,5,6,7,8]).buffer);return 'ok';}catch(e){return e.message;}}),/not a \.pcap/);
   // Attaching a .pcap in chat adds the summary, not the binary.
   const att=await page.evaluate(async bytes=>{pendingAttachments=[];await handleFiles([new File([new Uint8Array(bytes)],'phone.pcap',{type:'application/octet-stream'})]);return pendingAttachments.map(a=>[a.name,a.type,a.text]);},pcap());
   assert.equal(att.length,1);assert.deepEqual(att[0].slice(0,2),['phone.pcap.summary.txt','text/plain']);
   assert.match(att[0][2],/^Capture phone\.pcap: 6 packets, \d+ B over 5s \(pcap\)/);
 });

 const site=(paths)=>`(()=>{let n=0;window.__http=[];window.NazNetScan={info:()=>'{}',sweep:()=>-1,ports:()=>-1,discover:()=>-1,udp:()=>-1,cancel:()=>{},tls:()=>'{}',
   http:(url,method,origin)=>{const id=++n;__http.push([new URL(url).pathname,origin||'']);const P=${JSON.stringify(paths)};const r=P[new URL(url).pathname]||{status:404,headers:{},body:'not found'};
     const h={...r.headers};if(origin&&r.cors)h['access-control-allow-origin']=[origin],h['access-control-allow-credentials']=['true'];
     setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'http',status:r.status,headers:h,body:r.body||''})),5);setTimeout(()=>nazScanEvent(id,JSON.stringify({type:'done'})),10);return id;}};})()`;
 const PATHS={
   '/':{status:200,cors:true,headers:{'set-cookie':['sessionid=abc; Path=/','theme=dark; Path=/; Secure; HttpOnly; SameSite=Lax'],'x-powered-by':['PHP/7.4.3']},body:'<html><img src="http://cdn.example/a.png"><form action="http://kopi.example/login"></form><a href="/menu">m</a><a href="https://kopi.example/about">a</a><a href="https://other.example/x">x</a></html>'},
   '/.git/HEAD':{status:200,headers:{},body:'ref: refs/heads/main\n'},
   '/.env':{status:200,headers:{},body:'DB_PASSWORD=secret\nAPI_KEY=xyz\n'},
   '/uploads/':{status:200,headers:{},body:'<html><title>Index of /uploads</title></html>'},
   '/robots.txt':{status:200,headers:{},body:'User-agent: *\nDisallow: /private\n'},
   '/menu':{status:200,headers:{},body:'<script src="http://cdn.example/x.js"></script>'},
   '/about':{status:200,headers:{},body:'ok'},
   '/.well-known/kita-verify.txt':{status:404,headers:{},body:''},
 };
 await scenario('website test: passive checks on any site; active checks only after verification',seed(),async page=>{
   await page.evaluate(site(PATHS));
   await page.route('https://1.1.1.1/dns-query**',r=>{const u=new URL(r.request().url());const ans=u.searchParams.get('type')==='TXT'&&u.searchParams.get('name')==='kopi.example'?[{data:'"kita-verify='+(globalThis.__tok||'none')+'"'}]:[];r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({Status:0,Answer:ans})});});
   const passive=await page.evaluate(()=>runWebTest('https://Kopi.example/home'));
   const lv=k=>(passive.checks.find(c=>c.label.startsWith(k))||{}).level;
   assert.equal(passive.domain,'kopi.example');assert.equal(passive.verified,false);
   assert.equal(lv('Cookie sessionid'),'high');assert.equal(lv('Cookie theme'),'ok');assert.equal(lv('CORS'),'high');
   assert.equal(lv('Mixed content on /'),'medium');assert.equal(lv('Form sends data unencrypted'),'high');assert.equal(lv('Header x-powered-by'),'low');
   assert.equal(lv('Active checks'),'info');
   const probed=await page.evaluate(()=>__http.map(x=>x[0]));
   assert.deepEqual([...new Set(probed)],['/'],'no file probes or crawl before verification');
   // Verify with a DNS TXT record.
   const token=await page.evaluate(()=>webTestToken('kopi.example'));
   await page.addInitScript(()=>{});await page.evaluate(t=>{globalThis.__tok=t;},token);
   await page.route('https://1.1.1.1/dns-query**',r=>{const u=new URL(r.request().url());const ans=u.searchParams.get('type')==='TXT'&&u.searchParams.get('name')==='kopi.example'?[{data:'"kita-verify='+token+'"'}]:[];r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({Status:0,Answer:ans})});});
   assert.equal(await page.evaluate(()=>verifyDomain('kopi.example')),'dns');
   await page.evaluate(()=>setWebTestState({verified:{'kopi.example':{method:'dns',at:Date.now()}}}));
   await page.evaluate(()=>{__http.length=0;});
   const active=await page.evaluate(()=>runWebTest('kopi.example'));
   const find=k=>active.checks.find(c=>c.label===k)||{};
   assert.equal(find('/.git/HEAD').level,'high');assert.equal(find('/.env').level,'high');assert.equal(find('/uploads/').level,'medium');
   assert.equal(find('/backup.zip').level,undefined,'404s are not findings');
   assert.match(find('robots.txt').detail,/\/private/);
   assert.equal((active.checks.find(c=>c.label==='Mixed content on /menu')||{}).level,'medium');
   assert.match(find('Crawl').detail,/^2 pages checked/);
   const paths=await page.evaluate(()=>__http.map(x=>x[0]));
   assert.ok(!paths.includes('/x'),'other sites are not crawled');
 });

 await scenario('verification by file; wrong token is not accepted',seed(),async page=>{
   const token='kita-0123456789abcdef01234567';
   await page.evaluate(site({'/.well-known/kita-verify.txt':{status:200,headers:{},body:'kita-0123456789abcdef01234567\n'}}));
   await page.route('https://1.1.1.1/dns-query**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"Status":0}'}));
   await page.evaluate(t=>setWebTestState({tokens:{'kopi.example':t,'other.example':'kita-ffffffffffffffffffffffff'}}),token);
   assert.equal(await page.evaluate(()=>verifyDomain('kopi.example')),'file');
   assert.equal(await page.evaluate(()=>verifyDomain('other.example')),'');
 });

 await scenario('scanner: Top ports profile, custom list, UDP check, saved report',seed(),async page=>{
   await page.evaluate(()=>{let n=0;window.__scan=[];const emit=(id,o,ms)=>setTimeout(()=>nazScanEvent(id,JSON.stringify(o)),ms);
     window.NazNetScan={info:()=>JSON.stringify({type:'wifi',ip:'192.168.1.23',prefix:24,gateway:'192.168.1.1',scannable:true}),cancel:()=>{},tls:()=>'{}',discover:()=>-1,
       sweep:()=>{const id=++n;emit(id,{type:'host',ip:'192.168.1.1',name:'router',open:[53,80]},5);emit(id,{type:'done',total:253},20);return id;},
       ports:(ip,spec)=>{__scan.push(['ports',ip,spec]);if(spec==='99999')return -1;const id=++n;emit(id,{type:'progress',done:500,total:1123},5);emit(id,{type:'port',ip,port:6379,banner:'Redis · no password required'},10);emit(id,{type:'done'},20);return id;},
       udp:ip=>{__scan.push(['udp',ip]);const id=++n;emit(id,{type:'udp',ip,port:53,info:'DNS server · answers lookups for any name (recursion on)'},5);emit(id,{type:'udp',ip,port:137,info:'NetBIOS name OFFICE-PC'},8);emit(id,{type:'done'},20);return id;}};
     window.__saved=[];window.saveTextFile=(n,t)=>{__saved.push([n,t]);};openNetworkSheet();net.agreed=true;});
   await page.getByRole('button',{name:'Scan devices'}).click();
   await page.waitForFunction(()=>/Done/.test(document.querySelector('.net-progress')?.textContent||''));
   await page.locator('.net-profile select').selectOption('top');
   await page.locator('.net-host[data-ip="192.168.1.1"]').getByRole('button',{name:'Check ports'}).click();
   await page.waitForFunction(()=>/1 open port of ~1100 checked/.test(document.querySelector('.net-scan-note')?.textContent||''));
   assert.match(await page.locator('.net-host[data-ip="192.168.1.1"] .net-port-notes').innerText(),/6379\s+Redis, usually without a password[\s\S]*Redis · no password required/);
   await page.locator('.net-host[data-ip="192.168.1.1"]').getByRole('button',{name:'UDP check'}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.net-host[data-ip="192.168.1.1"] .net-port-notes li').length===3);
   assert.match(await page.locator('.net-host[data-ip="192.168.1.1"]').innerText(),/UDP 137\s+NetBIOS name OFFICE-PC/);
   await page.locator('.net-profile select').selectOption('custom');await page.fill('.net-profile input','99999');
   await page.locator('.net-host[data-ip="192.168.1.1"]').getByRole('button',{name:'Check again'}).click();
   assert.deepEqual(await page.evaluate(()=>__scan.filter(x=>x[0]==='ports').map(x=>x[2])),['top','99999']);
   await page.getByRole('button',{name:'Save report'}).click();
   const saved=await page.evaluate(()=>__saved[0]);
   assert.match(saved[0],/^kita-network-report-\d{4}-\d{2}-\d{2}\.txt$/);
   assert.match(saved[1],/port 6379 \[high\] Redis[\s\S]*udp 53 \[medium\] DNS server[\s\S]*udp 137/);
 });

 await b.close();
 if(failed){console.error(failed+' failed');process.exitCode=1;}else console.log('4.15.0 security tools: all passed');
})();
