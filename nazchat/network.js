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
const net={info:null,hosts:new Map(),services:[],sweep:null,ports:new Set(),progress:'',audit:null,agreed:false};
const scanJobs=new Map();
window.nazScanEvent=(job,text)=>{let e;try{e=JSON.parse(text);}catch(x){return;}const fn=scanJobs.get(job);if(fn)fn(e);if(e.type==='done')scanJobs.delete(job);};
function hasNetScan(){return typeof window.NazNetScan==='object'&&typeof window.NazNetScan.sweep==='function';}
function netHost(ip){let h=net.hosts.get(ip);if(!h){h={ip,name:'',open:[],ports:[],services:[]};net.hosts.set(ip,h);}return h;}
function subnetLabel(i){return i&&i.ip?i.ip+'/'+i.prefix:'';}
async function confirmNetworkUse(){
  if(net.agreed) return true;
  const ok=await confirmDialog('Scan the network this phone is on ('+subnetLabel(net.info)+')? Only scan networks you own or have permission to test. Kita only checks private addresses on this Wi-Fi.',{title:'Scan your network',confirmText:'Scan'});
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
  const id=window.NazNetScan.ports(ip,'');if(id<0){toast('Only devices on this Wi-Fi can be checked');return;}
  const h=netHost(ip);h.ports=[];net.ports.add(ip);
  scanJobs.set(id,e=>{
    if(e.type==='port'){h.ports=h.ports.filter(p=>p.port!==e.port).concat({port:e.port,banner:e.banner||''}).sort((a,b)=>a.port-b.port);if(!h.open.includes(e.port))h.open=[...h.open,e.port].sort((a,b)=>a-b);}
    if(e.type==='done'){net.ports.delete(ip);h.checked=true;}
    renderNetworkBody();
  });
  renderNetworkBody();
}
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
  }
  if(net.audit){lines.push('','Website audit: '+net.audit.domain);for(const c of net.audit.checks)lines.push('- ['+c.level+'] '+c.label+': '+c.detail);}
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
    if(net.progress) body.appendChild(el('div','net-progress',esc(net.progress)));
    const list=el('div','net-hosts');
    for(const h of [...net.hosts.values()].sort((a,b)=>NazIpSort(a.ip,b.ip))){
      const r=el('div','net-host');r.dataset.ip=h.ip;
      const worst=h.open.map(p=>portNote(p)[0]).includes('high')?'high':h.open.map(p=>portNote(p)[0]).includes('medium')?'medium':'ok';
      const isGw=h.ip===net.info?.gateway;
      r.innerHTML='<div class="net-host-head"><span class="net-dot '+worst+'"></span><span><strong>'+esc(h.ip)+(isGw?' · router':'')+'</strong><small>'+esc([h.name,...h.services].filter(Boolean).join(' · ')||'Unknown device')+'</small></span></div>';
      if(h.open.length){const chips=el('div','net-ports');for(const p of h.open){const [lvl]=portNote(p);chips.appendChild(el('span','net-port '+lvl,String(p)));}r.appendChild(chips);}
      if(h.ports.length){const ul=el('ul','net-port-notes');for(const p of h.ports){const [lvl,note]=portNote(p.port);const li=el('li',lvl);li.innerHTML='<strong>'+p.port+'</strong> '+esc(note)+(p.banner?'<small>'+esc(p.banner)+'</small>':'');ul.appendChild(li);}r.appendChild(ul);}
      const b=el('button','mini-btn',net.ports.has(h.ip)?'Checking…':h.checked?'Check again':'Check ports');b.type='button';b.disabled=net.ports.has(h.ip);b.onclick=()=>startPorts(h.ip);r.appendChild(b);
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
  if(net.hosts.size||net.audit){const ask=el('button','btn','Ask Kita about these results');ask.type='button';ask.onclick=askKitaAboutNetwork;body.appendChild(ask);}
}
