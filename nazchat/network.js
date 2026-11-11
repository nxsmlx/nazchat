/* Kita network tools (4.14.0): audit your OWN network from the phone.
   Device sweep of the phone's Wi-Fi subnet, port checks with what each service says,
   SSDP/mDNS discovery and a website audit (TLS, security headers, DNS records).
   Native code refuses anything outside the phone's private local subnet (NazScanCore);
   there are no attack features: no password guessing, exploits or public-IP scans. */
'use strict';

const PORT_NOTES={
  21:['high','FTP: passwords travel unencrypted'],22:['info','SSH remote login: use keys or a strong password'],23:['high','Telnet: unencrypted remote login, often with a default password'],
  25:['medium','Mail server (SMTP)'],53:['info','DNS server'],80:['medium','Web page without encryption (often a device admin page)'],110:['medium','POP3 mail without encryption'],
  139:['medium','Windows file sharing (NetBIOS)'],143:['medium','IMAP mail without encryption'],443:['info','Web page over HTTPS'],445:['medium','Windows / SMB file sharing'],
  554:['medium','RTSP video stream (camera): make sure it needs a password'],631:['info','Printer (IPP)'],1883:['high','MQTT without TLS: smart-home messages can be read, often no password'],
  1900:['medium','UPnP: devices can open ports on your router'],3306:['high','MySQL database open on the network'],3389:['high','Remote Desktop (RDP)'],5000:['info','Web app or NAS'],
  5353:['info','mDNS (devices announcing themselves)'],5432:['high','PostgreSQL database open on the network'],5555:['high','Android debugging (ADB) over the network: anyone here can control that device'],
  5900:['high','VNC remote screen'],6379:['high','Redis, usually without a password'],7000:['info','AirPlay'],7547:['high','TR-069 router remote management'],
  8000:['medium','Web service without encryption'],8008:['info','Chromecast / Google device'],8080:['medium','Web admin or proxy without encryption'],8443:['info','Web admin over HTTPS'],
  8888:['medium','Web service without encryption'],9000:['medium','Web service without encryption'],9100:['info','Printer (raw printing)'],27017:['high','MongoDB open on the network'],
  32400:['info','Plex media server'],49152:['medium','UPnP device service'],62078:['info','Apple device sync (iPhone / iPad)'],
};
function portNote(p){return PORT_NOTES[p]||['info','Open port'];}
const net={info:null,hosts:new Map(),services:[],sweep:null,ports:new Set(),progress:'',audit:null,agreed:false,profile:'quick',custom:'',webtest:null,webStep:'',capture:null};
const scanJobs=new Map();
/* Chat tools use the same native scanner as the Network sheet. Each job gets its own
   event stream, so opening the sheet or running a port check never mixes results. */
function scanToolJob(start,onEvent,timeoutMs=90000){
  return new Promise((resolve,reject)=>{
    let id=-1,timer;
    const signal=currentAbortSignal();
    const done=()=>{clearTimeout(timer);scanJobs.delete(id);signal?.removeEventListener('abort',abort);};
    const abort=()=>{try{if(id>=0)window.NazNetScan.cancel(id);}catch(e){}done();reject(cancellationError());};
    const onDone=()=>{if(signal?.aborted){abort();return;}done();resolve();};
    try{id=start();if(id<0){done();reject(new Error('Only devices on this private Wi-Fi can be checked'));return;}}catch(e){done();reject(e);return;}
    scanJobs.set(id,e=>{
      try{
        if(e.type==='error'){done();reject(new Error(String(e.message||'Network scan failed')));return;}
        onEvent?.(e);
        if(e.type==='done')onDone();
      }catch(err){done();reject(err);}
    });
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{try{window.NazNetScan.cancel(id);}catch(e){}done();reject(new Error('Network scan timed out'));},timeoutMs);
  });
}
function scanToolHosts(hosts){
  return [...hosts.values()].sort((a,b)=>NazIpSort(a.ip,b.ip)).map(h=>({
    ip:h.ip,name:h.name||'',services:(h.services||[]).slice(0,20),
    open:[...new Set([...(h.open||[]),...(h.ports||[]).map(p=>p.port)])].sort((a,b)=>a-b)
  }));
}
async function networkScanTool(){
  if(!hasNetScan())return {error:'Network scans require the installed app on Wi-Fi. Website audit still works in a browser.'};
  refreshNetInfo();
  if(!net.info?.scannable)return {error:'Connect to Wi-Fi first. Mobile data networks are never scanned.'};
  const hosts=new Map();
  await scanToolJob(()=>window.NazNetScan.sweep(),e=>{
    if(e.type==='host'){const h=hosts.get(e.ip)||{ip:e.ip,name:'',open:[],services:[]};h.name=e.name||h.name;h.open=[...new Set([...h.open,...(e.open||[])])];hosts.set(e.ip,h);}
  });
  return {network:subnetLabel(net.info),gateway:net.info.gateway||'',deviceCount:hosts.size,devices:scanToolHosts(hosts)};
}
function scanToolIp(ip){
  ip=String(ip||'').trim();
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)&&!ip.split('.').some(n=>Number(n)>255)?ip:'';
}
async function networkPortsTool(ip,profile,list){
  if(!hasNetScan())return {error:'Port checks require the installed app on Wi-Fi.'};
  ip=scanToolIp(ip);profile=['quick','top','custom'].includes(profile)?profile:'quick';
  if(!ip)return {error:'Enter a valid IPv4 address on your Wi-Fi.'};
  const spec=profile==='custom'?String(list||'').replace(/\s+/g,''):profile;
  if(profile==='custom'&&!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(spec))return {error:'For a custom check, list ports like 22,80,8000-8100 (up to 1200).'};
  refreshNetInfo();
  if(!net.info?.scannable)return {error:'Connect to Wi-Fi first. Mobile data networks are never scanned.'};
  const ports=[];
  await scanToolJob(()=>{const id=window.NazNetScan.ports(ip,spec);if(id<0&&profile==='custom')throw new Error('Use up to 1200 ports, like 22,80,8000-8100, on a device on this Wi-Fi');return id;},e=>{if(e.type==='port')ports.push({port:e.port,banner:String(e.banner||'').slice(0,200),note:portNote(e.port)[1],risk:portNote(e.port)[0]});},profile==='quick'?90000:240000);
  return {ip,profile,...(profile==='custom'?{ports:spec}:{}),openPorts:ports.sort((a,b)=>a.port-b.port)};
}
async function networkUdpTool(ip){
  if(!hasNetScan())return {error:'UDP checks require the installed app on Wi-Fi.'};
  ip=scanToolIp(ip);if(!ip)return {error:'Enter a valid IPv4 address on your Wi-Fi.'};
  refreshNetInfo();
  if(!net.info?.scannable)return {error:'Connect to Wi-Fi first. Mobile data networks are never scanned.'};
  const found=[];
  await scanToolJob(()=>window.NazNetScan.udp(ip),e=>{if(e.type==='udp'){const n=UDP_NOTES[e.port]||['info','UDP service'];found.push({port:e.port,info:String(e.info||'').slice(0,200),note:n[1],risk:n[0]});}});
  return {ip,checked:'DNS 53, NTP 123, NetBIOS 137',udpServices:found.sort((a,b)=>a.port-b.port)};
}
async function networkDiscoverTool(){
  if(!hasNetScan())return {error:'Service discovery requires the installed app on Wi-Fi.'};
  refreshNetInfo();
  if(!net.info?.scannable)return {error:'Connect to Wi-Fi first. Mobile data networks are never scanned.'};
  const byIp=new Map();
  await scanToolJob(()=>window.NazNetScan.discover(),e=>{
    if(e.type!=='service')return;
    const label=e.via==='ssdp'?[e.server,e.st].filter(Boolean).join(' · '):(e.names||[]).join(', ');
    const d=byIp.get(e.ip)||{ip:e.ip,services:[]};
    if(label&&!d.services.includes(label)&&d.services.length<20)d.services.push(String(label).slice(0,160));
    byIp.set(e.ip,d);
  });
  const devices=[...byIp.values()].sort((a,b)=>NazIpSort(a.ip,b.ip));
  return {network:subnetLabel(net.info),deviceCount:devices.length,devices};
}
async function websiteTestTool(domain){
  if(typeof runWebTest!=='function')return {error:'Website test is not available.'};
  // runWebTest reports each step before its request; stop there as soon as Stop is pressed.
  const r=await runWebTest(domain,()=>{if(currentAbortSignal()?.aborted)throw cancellationError();});
  const out={domain:r.domain,verified:r.verified,checks:r.checks.slice(0,60)};
  if(!r.verified)out.note='Only passive checks ran. To look for exposed files and crawl the site, the owner must verify '+r.domain+' in Tools → Network → Website test.';
  return out;
}
// A job ends with "done" (or "error"); forget its handler then, so finished Network-sheet
// scans do not pile up. Chat tool jobs already remove themselves inside their handler.
window.nazScanEvent=(job,text)=>{let e;try{e=JSON.parse(text);}catch(x){return;}const fn=scanJobs.get(job);if(fn)fn(e);if(e.type==='done'||e.type==='error')scanJobs.delete(job);};
function hasNetScan(){return typeof window.NazNetScan==='object'&&typeof window.NazNetScan.sweep==='function';}
function netHost(ip){let h=net.hosts.get(ip);if(!h){h={ip,name:'',open:[],ports:[],services:[],udp:[]};net.hosts.set(ip,h);}return h;}
function subnetLabel(i){return i&&i.ip?i.ip+'/'+i.prefix:'';}
async function confirmNetworkUse(){
  if(net.agreed) return true;
  // Chat tools can ask before the Network sheet ever loaded the Wi-Fi details.
  if(hasNetScan()&&!net.info?.ip) refreshNetInfo();
  const label=subnetLabel(net.info);
  const ok=await confirmDialog('Scan the network this phone is on'+(label?' ('+label+')':'')+'? Only scan networks you own or have permission to test. Kita only checks private addresses on this Wi-Fi.',{title:'Scan your network',confirmText:'Scan'});
  if(ok) net.agreed=true;
  return ok;
}
function refreshNetInfo(){try{net.info=JSON.parse(window.NazNetScan.info()||'{}');}catch(e){net.info={error:String(e.message||e)};}}
async function startSweep(){
  if(!await confirmNetworkUse()) return;
  net.hosts.clear();net.progress='Scanning…';
  const id=window.NazNetScan.sweep();if(id<0){toast('This network cannot be scanned');return;}
  net.sweep=id;
  scanJobs.set(id,e=>{
    if(e.type==='host'){const h=netHost(e.ip);h.name=e.name||h.name;h.open=[...new Set([...(h.open||[]),...(e.open||[])])].sort((a,b)=>a-b);}
    if(e.type==='progress') net.progress='Checked '+e.done+' of '+e.total+' addresses';
    if(e.type==='done'){net.sweep=null;net.progress=(e.cancelled?'Stopped · ':'Done · ')+net.hosts.size+' device'+(net.hosts.size===1?'':'s')+' found';}
    renderNetworkBody();
  });
  renderNetworkBody();
}
async function startDiscover(){
  if(!await confirmNetworkUse()) return;
  const id=window.NazNetScan.discover();if(id<0){toast('This network cannot be scanned');return;}
  net.progress='Listening for devices that announce themselves…';
  scanJobs.set(id,e=>{
    if(e.type==='service'){const h=netHost(e.ip);const label=e.via==='ssdp'?[e.server,e.st].filter(Boolean).join(' · '):(e.names||[]).join(', ');if(label&&!h.services.includes(label))h.services.push(label);}
    if(e.type==='done') net.progress='Discovery done · '+[...net.hosts.values()].filter(h=>h.services.length).length+' announcing';
    renderNetworkBody();
  });
  renderNetworkBody();
}
async function startPorts(ip){
  if(!await confirmNetworkUse()) return;
  const spec=net.profile==='custom'?net.custom.trim():net.profile;
  const id=window.NazNetScan.ports(ip,spec);if(id<0){toast(net.profile==='custom'?'Use up to 1200 ports, like 22,80,8000-8100':'Only devices on this Wi-Fi can be checked');return;}
  const h=netHost(ip);h.ports=[];net.ports.add(ip);h.scanNote='';
  scanJobs.set(id,e=>{
    if(e.type==='progress'){h.scanNote='Checked '+e.done+' of '+e.total+' ports';}
    if(e.type==='port'){h.ports=h.ports.filter(p=>p.port!==e.port).concat({port:e.port,banner:e.banner||''}).sort((a,b)=>a.port-b.port);if(!h.open.includes(e.port))h.open=[...h.open,e.port].sort((a,b)=>a-b);}
    if(e.type==='done'){net.ports.delete(ip);h.checked=true;h.scanNote=(e.cancelled?'Stopped · ':'')+h.ports.length+' open port'+(h.ports.length===1?'':'s')+(spec==='top'?' of ~1100 checked':'');}
    renderNetworkBody();
  });
  renderNetworkBody();
}
async function startUdp(ip){
  if(!await confirmNetworkUse()) return;
  const id=window.NazNetScan.udp(ip);if(id<0){toast('Only devices on this Wi-Fi can be checked');return;}
  const h=netHost(ip);h.udp=[];h.udpChecking=true;
  scanJobs.set(id,e=>{
    if(e.type==='udp') h.udp=h.udp.filter(u=>u.port!==e.port).concat({port:e.port,info:e.info});
    if(e.type==='done'){h.udpChecking=false;h.udpChecked=true;}
    renderNetworkBody();
  });
  renderNetworkBody();
}
const UDP_NOTES={53:['medium','answers DNS: fine for your router, risky on other devices'],123:['info','time server (NTP)'],137:['medium','Windows name service (NetBIOS) answers']};
function exportNetworkReport(){const name='kita-network-report-'+new Date().toISOString().slice(0,10)+'.txt';saveTextFile(name,networkReport(),'text/plain','Report saved');}
/* Website audit for your own domain: TLS (native), security headers, DNS records. */
async function dohRecords(name,type){
  try{const r=await netFetch('https://1.1.1.1/dns-query?name='+encodeURIComponent(name)+'&type='+type,{headers:{Accept:'application/dns-json'},timeout:10000});const j=await r.json();return (j.Answer||[]).map(a=>String(a.data||''));}catch(e){return [];}
}
async function auditSite(domain){
  domain=String(domain||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'');
  if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('Enter a domain name like example.com');
  const tls=hasNetScan()?JSON.parse(window.NazNetScan.tls(domain)||'{}'):{error:'TLS details need the installed app'};
  const [a,aaaa,mx,txt,caa,dmarc]=await Promise.all([dohRecords(domain,'A'),dohRecords(domain,'AAAA'),dohRecords(domain,'MX'),dohRecords(domain,'TXT'),dohRecords(domain,'CAA'),dohRecords('_dmarc.'+domain,'TXT')]);
  const checks=[],add=(level,label,detail)=>checks.push({level,label,detail});
  if(tls.error&&!tls.valid) add('high','HTTPS',tls.error);
  else if(tls.valid){
    const days=tls.notAfter?Math.round((tls.notAfter-Date.now())/864e5):null;
    add(days!==null&&days<14?'high':days!==null&&days<30?'medium':'ok','Certificate',(tls.issuer||'').replace(/^.*?CN=([^,]+).*$/,'$1')+(days!==null?' · expires in '+days+' days':'')+(tls.cipher?' · '+tls.cipher:''));
    const h=tls.headers||{};
    add(/^https:/i.test(tls.httpRedirect||'')?'ok':'medium','http → https',tls.httpRedirect?'redirects to '+tls.httpRedirect:'plain http:// does not redirect to https://');
    add(h['strict-transport-security']?'ok':'medium','HSTS',h['strict-transport-security']||'missing: browsers may still try http://');
    add(h['content-security-policy']?'ok':'medium','Content-Security-Policy',h['content-security-policy']?'set':'missing: limits damage from injected scripts');
    add(h['x-frame-options']||/frame-ancestors/i.test(h['content-security-policy']||'')?'ok':'low','Clickjacking protection',h['x-frame-options']||'missing X-Frame-Options / frame-ancestors');
    add(h['x-content-type-options']?'ok':'low','X-Content-Type-Options',h['x-content-type-options']||'missing (nosniff)');
    add(h['referrer-policy']?'ok':'low','Referrer-Policy',h['referrer-policy']||'missing');
    if(h.server&&/\d/.test(h.server)) add('low','Server header','shows a version: '+h.server);
  }
  add(a.length||aaaa.length?'ok':'high','DNS address',[...a,...aaaa].join(', ')||'no A/AAAA record');
  if(mx.length){
    add(txt.some(t=>/v=spf1/i.test(t))?'ok':'medium','SPF (mail)',txt.find(t=>/v=spf1/i.test(t))||'missing: others can send mail as this domain');
    add(dmarc.some(t=>/v=DMARC1/i.test(t))?'ok':'medium','DMARC (mail)',dmarc.find(t=>/v=DMARC1/i.test(t))||'missing');
  }
  add(caa.length?'ok':'low','CAA',caa.join(', ')||'no CAA record (any certificate authority may issue)');
  return {domain,checks,at:Date.now()};
}
function networkReport(){
  const lines=['Network: '+(net.info?.type||'?')+' '+subnetLabel(net.info)+' · gateway '+(net.info?.gateway||'?')];
  for(const h of [...net.hosts.values()].sort((a,b)=>NazIpSort(a.ip,b.ip))){
    lines.push('- '+h.ip+(h.name?' ('+h.name+')':'')+(h.services.length?' · '+h.services.join('; '):''));
    const ports=h.ports.length?h.ports:h.open.map(p=>({port:p,banner:''}));
    for(const p of ports){const [lvl,note]=portNote(p.port);lines.push('    port '+p.port+' ['+lvl+'] '+note+(p.banner?' · says: '+p.banner:''));}
    for(const u of h.udp||[]) lines.push('    udp '+u.port+' ['+(UDP_NOTES[u.port]||['info'])[0]+'] '+u.info);
  }
  if(net.audit){lines.push('','Website audit: '+net.audit.domain);for(const c of net.audit.checks)lines.push('- ['+c.level+'] '+c.label+': '+c.detail);}
  if(net.webtest){lines.push('','Website test: '+net.webtest.domain+(net.webtest.verified?' (ownership verified, active checks on)':' (passive checks only)'));for(const c of net.webtest.checks)lines.push('- ['+c.level+'] '+c.label+': '+c.detail);}
  if(net.capture){lines.push('',net.capture.text);}
  return lines.join('\n');
}
function NazIpSort(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<4;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;}
function askKitaAboutNetwork(){
  const text=networkReport();
  closeSheet('toolsSheet');
  if(conv&&conv.messages.length&&convMode(conv)!=='chat'){conv=null;}
  db.uiMode='chat';
  pendingAttachments.push({name:'network-report.txt',type:'text/plain',text,pasted:true});renderAttachments();
  $('#promptInput').value='Explain these results from my own network: which devices and open services are risky, and what should I fix first? Give clear steps.';
  $('#promptInput').dispatchEvent(new Event('input'));renderAll();$('#promptInput').focus();
}

/* ---------- The Network sheet ---------- */
function openNetworkSheet(){
  $('#studioChatControls').hidden=true;$('#toolsSheet .sheet-head h3').textContent='Network';
  if(hasNetScan()) refreshNetInfo();
  renderNetworkBody();openSheet('toolsSheet');
}
function renderNetworkBody(){
  const body=$('#toolsSheetBody');if(!body||$('#toolsSheet .sheet-head h3').textContent!=='Network')return;
  body.innerHTML='';
  body.appendChild(el('div','hint','Check the network you are on and your own websites: which devices are there, what they leave open, and what to fix. Only scan networks you own or have permission to test.'));
  if(!hasNetScan()){body.appendChild(el('div','settings-empty','Network tools work in the installed app.'));}
  else{
    const i=net.info||{},card=el('div','net-info');
    card.innerHTML='<strong>'+esc(i.type==='wifi'?'Wi-Fi':i.type==='cellular'?'Mobile data':i.type||'No network')+(i.ip?' · '+esc(subnetLabel(i)):'')+'</strong><small>'+esc((i.gateway?'Gateway '+i.gateway:'')+(i.dns?.length?' · DNS '+i.dns.join(', '):''))+'</small>';
    body.appendChild(card);
    if(!i.scannable) body.appendChild(el('div','hint warn','Connect to Wi-Fi to scan your local network. Mobile data networks belong to your carrier and are never scanned.'));
    const row=el('div','net-actions');
    const sweep=el('button','btn',net.sweep?'Stop':'Scan devices');sweep.type='button';sweep.disabled=!i.scannable;
    sweep.onclick=()=>{if(net.sweep){window.NazNetScan.cancel(net.sweep);return;}startSweep();};
    const disc=el('button','btn secondary','Discover services');disc.type='button';disc.disabled=!i.scannable;disc.onclick=startDiscover;
    row.append(sweep,disc);body.appendChild(row);
    const prof=el('div','net-profile');prof.innerHTML='<span>Port check</span>';
    const sel=el('select');sel.setAttribute('aria-label','Ports to check');
    sel.innerHTML=[['quick','Quick · 35 common ports'],['top','Top ports · ~1100 (1-1024 + well-known)'],['custom','Custom list']].map(([v,l])=>'<option value="'+v+'"'+(net.profile===v?' selected':'')+'>'+l+'</option>').join('');
    sel.onchange=()=>{net.profile=sel.value;renderNetworkBody();};prof.appendChild(sel);
    if(net.profile==='custom'){const ci=el('input');ci.placeholder='22,80,443,8000-8100';ci.value=net.custom;ci.setAttribute('aria-label','Custom ports');ci.oninput=()=>{net.custom=ci.value;};prof.appendChild(ci);}
    body.appendChild(prof);
    if(net.progress) body.appendChild(el('div','net-progress',esc(net.progress)));
    const list=el('div','net-hosts');
    for(const h of [...net.hosts.values()].sort((a,b)=>NazIpSort(a.ip,b.ip))){
      const r=el('div','net-host');r.dataset.ip=h.ip;
      const worst=h.open.map(p=>portNote(p)[0]).includes('high')?'high':h.open.map(p=>portNote(p)[0]).includes('medium')?'medium':'ok';
      const isGw=h.ip===net.info?.gateway;
      r.innerHTML='<div class="net-host-head"><span class="net-dot '+worst+'"></span><span><strong>'+esc(h.ip)+(isGw?' · router':'')+'</strong><small>'+esc([h.name,...h.services].filter(Boolean).join(' · ')||'Unknown device')+'</small></span></div>';
      if(h.open.length){const chips=el('div','net-ports');for(const p of h.open){const [lvl]=portNote(p);chips.appendChild(el('span','net-port '+lvl,String(p)));}r.appendChild(chips);}
      if(h.ports.length){const ul=el('ul','net-port-notes');for(const p of h.ports){const [lvl,note]=portNote(p.port);const li=el('li',lvl);li.innerHTML='<strong>'+p.port+'</strong> '+esc(note)+(p.banner?'<small>'+esc(p.banner)+'</small>':'');ul.appendChild(li);}r.appendChild(ul);}
      if(h.udp?.length){const ul=el('ul','net-port-notes');for(const u of h.udp){const [lvl,note]=UDP_NOTES[u.port]||['info',''];const li=el('li',lvl);li.innerHTML='<strong>UDP '+u.port+'</strong> '+esc(u.info)+(note?'<small>'+esc(note)+'</small>':'');ul.appendChild(li);}r.appendChild(ul);}
      if(h.scanNote) r.appendChild(el('small','net-scan-note',esc(h.scanNote)));
      const acts=el('div','net-host-actions');
      const b=el('button','mini-btn',net.ports.has(h.ip)?'Checking…':h.checked?'Check again':'Check ports');b.type='button';b.disabled=net.ports.has(h.ip);b.onclick=()=>startPorts(h.ip);
      const u=el('button','mini-btn',h.udpChecking?'Asking…':'UDP check');u.type='button';u.disabled=!!h.udpChecking;u.onclick=()=>startUdp(h.ip);
      acts.append(b,u);r.appendChild(acts);
      list.appendChild(r);
    }
    body.appendChild(list);
  }
  body.appendChild(el('p','studio-section-title','Audit a website'));
  const ar=el('div','dns-custom');const inp=el('input');inp.id='auditDomain';inp.placeholder='yourdomain.com';inp.setAttribute('aria-label','Domain to audit');inp.value=net.audit?.domain||'';
  const go=el('button','mini-btn','Audit');go.type='button';
  go.onclick=async()=>{go.disabled=true;go.textContent='Checking…';try{net.audit=await auditSite(inp.value);}catch(e){toast(e.message);}renderNetworkBody();};
  ar.append(inp,go);body.appendChild(ar);
  if(net.audit){const ul=el('ul','net-audit');for(const c of net.audit.checks){const li=el('li',c.level);li.innerHTML='<strong>'+esc(c.label)+'</strong><small>'+esc(c.detail)+'</small>';ul.appendChild(li);}body.appendChild(ul);}
  renderWebTestSection(body);
  renderCaptureSection(body);
  if(net.hosts.size||net.audit||net.webtest||net.capture){
    const ask=el('button','btn','Ask Kita about these results');ask.type='button';ask.onclick=askKitaAboutNetwork;body.appendChild(ask);
    const ex=el('button','btn secondary','Save report');ex.type='button';ex.onclick=exportNetworkReport;body.appendChild(ex);
  }
}
function renderWebTestSection(body){
  body.appendChild(el('p','studio-section-title','Website test'));
  body.appendChild(el('div','hint','Passive checks (cookies, CORS, mixed content, version leaks) work on any site. Looking for exposed files and crawling run only on domains you prove are yours.'));
  const row=el('div','dns-custom');const inp=el('input');inp.id='webtestDomain';inp.placeholder='yourdomain.com';inp.setAttribute('aria-label','Domain to test');inp.value=net.webtestDomain||'';inp.oninput=()=>{net.webtestDomain=inp.value;};
  const run=el('button','mini-btn','Test');run.type='button';run.disabled=!!net.webStep;
  run.onclick=async()=>{let d;try{d=normDomain(inp.value);}catch(e){toast(e.message);return;}net.webtestDomain=d;
    if(!await confirmDialog('Test https://'+d+'/? '+(webTestState().verified[d]?'Ownership is verified, so Kita will also look for exposed files and crawl up to 10 pages.':'Only passive checks run until you verify the domain is yours.'),{title:'Website test',confirmText:'Test'}))return;
    net.webStep='Starting…';renderNetworkBody();
    try{net.webtest=await runWebTest(d,step=>{net.webStep=step;renderNetworkBody();});}catch(e){toast(e.message);}
    net.webStep='';renderNetworkBody();};
  row.append(inp,run);body.appendChild(row);
  if(net.webStep) body.appendChild(el('div','net-progress',esc(net.webStep)));
  let d='';try{d=normDomain(net.webtestDomain);}catch(e){}
  if(d){
    const st=webTestState(),ok=st.verified[d];
    const box=el('div','net-verify'+(ok?' ok':''));
    if(ok) box.innerHTML='<strong>✓ '+esc(d)+' is verified</strong><small>Verified '+esc(new Date(ok.at).toLocaleDateString())+' by '+(ok.method==='dns'?'DNS TXT record':'file')+'. Active checks are on.</small>';
    else{
      const token=webTestToken(d);
      box.innerHTML='<strong>Verify that '+esc(d)+' is yours</strong><small>Either add a DNS TXT record on '+esc(d)+' (or on _kita-verify.'+esc(d)+'):</small><code>kita-verify='+esc(token)+'</code><small>or put a file at https://'+esc(d)+'/.well-known/kita-verify.txt containing:</small><code>'+esc(token)+'</code>';
      const v=el('button','mini-btn','Verify');v.type='button';
      v.onclick=async()=>{v.disabled=true;v.textContent='Checking…';const how=await verifyDomain(d);if(how){setWebTestState({verified:{...webTestState().verified,[d]:{method:how,at:Date.now()}}});toast(d+' verified');}else toast('Not found yet. DNS changes can take a few minutes.');renderNetworkBody();};
      box.appendChild(v);
    }
    body.appendChild(box);
  }
  if(net.webtest){const ul=el('ul','net-audit');for(const c of net.webtest.checks){const li=el('li',c.level);li.innerHTML='<strong>'+esc(c.label)+'</strong><small>'+esc(c.detail)+'</small>';ul.appendChild(li);}body.appendChild(ul);}
}
function renderCaptureSection(body){
  body.appendChild(el('p','studio-section-title','Traffic capture'));
  const hint=el('div','hint');hint.innerHTML='Android lets an app record only this phone\'s own traffic. Record it with PCAPdroid (free), save the .pcap, then open it here. Kita reads which sites and trackers the phone talked to and what went unencrypted. ';
  const a=el('a','integration-link','Get PCAPdroid ↗');a.href=PCAPDROID_URL;a.target='_blank';a.rel='noopener';hint.appendChild(a);body.appendChild(hint);
  const pick=el('input');pick.type='file';pick.accept='.pcap,.pcapng,.cap,application/vnd.tcpdump.pcap,application/octet-stream';pick.hidden=true;pick.id='captureFile';
  pick.onchange=async()=>{const f=pick.files?.[0];pick.value='';if(!f)return;try{if(f.size>50*1024*1024)throw new Error('Capture is larger than 50 MB');net.capture=await captureFileToAttachment(f);}catch(e){toast(e.message);}renderNetworkBody();};
  const b=el('button','btn secondary','Open a capture (.pcap)');b.type='button';b.onclick=()=>pick.click();
  body.append(pick,b);
  if(net.capture){const pre=el('pre','net-capture');pre.textContent=net.capture.text;body.appendChild(pre);}
}
