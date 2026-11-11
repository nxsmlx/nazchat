/* Website test (4.15.0). Passive checks run on any site (what a normal visit sees:
   cookies, CORS, mixed content, version leaks). Active checks — looking for files that
   should not be public, open directory listings, a short crawl — run only after you
   prove the domain is yours, with a DNS TXT record or a file under /.well-known/, the
   same way search consoles verify ownership. */
'use strict';

function webTestState(){const w=db.webTest&&typeof db.webTest==='object'?db.webTest:{};return {tokens:w.tokens||{},verified:w.verified||{}};}
function setWebTestState(patch){const cur=db.webTest&&typeof db.webTest==='object'?db.webTest:{};db.webTest={...cur,...patch};save();}
function webTestToken(domain){
  const st=webTestState();if(st.tokens[domain]) return st.tokens[domain];
  const t='kita-'+Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>x.toString(16).padStart(2,'0')).join('');
  setWebTestState({tokens:{...st.tokens,[domain]:t}});return t;
}
function normDomain(d){d=String(d||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/[\/?#].*$/,'').replace(/:\d+$/,'');if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new Error('Enter a domain name like example.com');return d;}
/* One native HTTPS request (status, all headers, body start). */
function nativeHttp(url,method='GET',origin=''){
  return new Promise((resolve,reject)=>{
    if(!hasNetScan()||typeof window.NazNetScan.http!=='function'){reject(new Error('The website test needs the installed app'));return;}
    const id=window.NazNetScan.http(url,method,origin);
    if(id<0){reject(new Error('Request refused'));return;}
    scanJobs.set(id,e=>{if(e.type==='http')resolve(e);});
  });
}
const hdr=(r,k)=>((r.headers||{})[k]||[]).join(', ');
async function verifyDomain(domain){
  const token=webTestToken(domain);
  const txt=[...await dohRecords(domain,'TXT'),...await dohRecords('_kita-verify.'+domain,'TXT')];
  if(txt.some(t=>t.replace(/"/g,'').includes('kita-verify='+token))) return 'dns';
  try{const r=await nativeHttp('https://'+domain+'/.well-known/kita-verify.txt');if(r.status===200&&String(r.body||'').includes(token)) return 'file';}catch(e){}
  return '';
}
const WEBTEST_PATHS=[
  ['/.git/HEAD',(r)=>/^ref:\s*refs\//m.test(r.body||''),'high','Git repository is public: source code and history can be downloaded'],
  ['/.env',(r)=>r.status===200&&/^[A-Z][A-Z0-9_]+=.+/m.test(r.body||'')&&!/<html/i.test(r.body||''),'high','.env file is public: it usually holds passwords and API keys'],
  ['/.DS_Store',(r)=>r.status===200&&/Bud1/.test(r.body||''),'medium','.DS_Store reveals file names in a folder'],
  ['/wp-config.php.bak',(r)=>/DB_PASSWORD/.test(r.body||''),'high','WordPress config backup shows the database password'],
  ['/config.php.bak',(r)=>r.status===200&&/<\?php/.test(r.body||''),'high','PHP config backup can be read as text'],
  ['/backup.zip',(r)=>r.status===200&&/zip|octet-stream/i.test(hdr(r,'content-type')),'high','A backup archive can be downloaded'],
  ['/phpinfo.php',(r)=>/phpinfo\(\)|PHP Version/i.test(r.body||''),'medium','phpinfo() shows server details'],
  ['/server-status',(r)=>/Apache Server Status/i.test(r.body||''),'medium','Apache server-status is public'],
  ['/.htaccess',(r)=>r.status===200&&/RewriteRule|Deny from|Require /i.test(r.body||''),'medium','.htaccess can be read'],
  ['/uploads/',(r)=>/<title>\s*Index of/i.test(r.body||''),'medium','Directory listing is on for /uploads/'],
  ['/admin/',(r)=>r.status===200&&/type=["']?password/i.test(r.body||''),'info','Admin login page: use strong passwords, 2FA and rate limiting'],
  ['/wp-login.php',(r)=>r.status===200&&/user_login/i.test(r.body||''),'info','WordPress login page: use strong passwords, 2FA and rate limiting'],
];
function cookieChecks(r,add){
  for(const c of (r.headers||{})['set-cookie']||[]){
    const name=c.split('=')[0].trim(),miss=[];
    if(!/;\s*secure/i.test(c)) miss.push('Secure');
    if(!/;\s*httponly/i.test(c)) miss.push('HttpOnly');
    if(!/;\s*samesite=/i.test(c)) miss.push('SameSite');
    add(miss.length?(/sess|auth|token|login|jwt/i.test(name)&&miss.includes('HttpOnly')?'high':'medium'):'ok','Cookie '+name,miss.length?'missing '+miss.join(', '):'Secure, HttpOnly and SameSite set');
  }
}
function pageChecks(url,r,add){
  const body=String(r.body||'');
  const mixed=[...body.matchAll(/<(?:script|img|iframe|link|source|video|audio)[^>]+(?:src|href)=["']http:\/\/[^"']+/gi)].length;
  if(mixed) add('medium','Mixed content on '+url,mixed+' resource'+(mixed===1?'':'s')+' loaded over http:// on an https page');
  for(const m of body.matchAll(/<form[^>]*action=["']http:\/\/[^"']+/gi)) add('high','Form sends data unencrypted',m[0].slice(0,120));
  const gen=(body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i)||[])[1];
  if(gen&&/\d/.test(gen)) add('low','Generator tag',gen+' (version shown publicly)');
}
async function runWebTest(domain,onStep=()=>{}){
  domain=normDomain(domain);
  const checks=[],add=(level,label,detail)=>checks.push({level,label,detail});
  const verified=!!webTestState().verified[domain];
  onStep('Loading https://'+domain+'/…');
  const home=await nativeHttp('https://'+domain+'/');
  if(!home.status) throw new Error(home.error||'Could not reach https://'+domain+'/');
  add(home.status<400?'ok':'medium','Home page','HTTP '+home.status);
  cookieChecks(home,add);pageChecks('/',home,add);
  for(const k of ['x-powered-by','server','x-aspnet-version']){const v=hdr(home,k);if(v&&/\d/.test(v))add('low','Header '+k,v+' (version shown publicly)');}
  onStep('Checking CORS…');
  const evil='https://kita-cors-check.invalid';
  const cors=await nativeHttp('https://'+domain+'/','GET',evil);
  const acao=hdr(cors,'access-control-allow-origin'),acac=/true/i.test(hdr(cors,'access-control-allow-credentials'));
  if(acao===evil) add(acac?'high':'medium','CORS','reflects any origin'+(acac?' with credentials: other sites can read logged-in data':''));
  else if(acao==='*') add(acac?'high':'low','CORS','Access-Control-Allow-Origin: *'+(acac?' with credentials':''));
  else add('ok','CORS','does not trust other origins');
  if(!verified){add('info','Active checks','Verify you own '+domain+' to look for exposed files and crawl the site');return {domain,checks,verified,at:Date.now()};}
  for(const [path,test,level,note] of WEBTEST_PATHS){
    onStep('Checking '+path+'…');
    try{const r=await nativeHttp('https://'+domain+path);if(test(r)) add(level,path,note);}catch(e){}
    await new Promise(x=>setTimeout(x,250));
  }
  try{const r=await nativeHttp('https://'+domain+'/robots.txt');const dis=[...String(r.body||'').matchAll(/^disallow:\s*(\S+)/gim)].map(m=>m[1]).slice(0,10);if(r.status===200&&dis.length)add('info','robots.txt','hides '+dis.join(', ')+' (these paths are public anyway)');}catch(e){}
  // Short same-site crawl: up to 10 pages.
  const links=[...new Set([...String(home.body||'').matchAll(/href=["'](\/[^"'#?]*|https:\/\/[^"'#?]+)["']/gi)].map(m=>m[1]).filter(u=>u.startsWith('/')||new URL(u).hostname===domain).map(u=>u.startsWith('/')?u:new URL(u).pathname))].filter(p=>p!=='/'&&!/\.(png|jpe?g|gif|svg|webp|css|js|ico|pdf|zip)$/i.test(p)).slice(0,10);
  for(const p of links){onStep('Crawling '+p+'…');try{const r=await nativeHttp('https://'+domain+p);pageChecks(p,r,add);cookieChecks(r,add);}catch(e){}await new Promise(x=>setTimeout(x,250));}
  add('info','Crawl',links.length+' page'+(links.length===1?'':'s')+' checked');
  return {domain,checks,verified,at:Date.now()};
}
