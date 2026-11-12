/* Kita integrations: GitHub, Vercel and Cloudflare (Pages and Workers) publishing.
   Tokens are stored in Android Keystore (NazSecrets, "integration:<service>") and are
   attached by native code only to that service's official API origin. JavaScript
   never reads them back. In a desktop browser (development) they stay in memory. */
'use strict';

/* BLAKE3 (hash mode, 32-byte digest) in plain JS. Cloudflare Pages addresses uploaded
   files by blake3(base64(content) + extension), so direct uploads need it. */
const BLAKE3_IV=new Uint32Array([0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19]);
const BLAKE3_PERM=[2,6,3,10,7,0,4,13,1,11,12,5,9,14,15,8];
function blake3Compress(cv,m,counter,blockLen,flags){
  const v=new Uint32Array(16);
  v.set(cv,0);v[8]=BLAKE3_IV[0];v[9]=BLAKE3_IV[1];v[10]=BLAKE3_IV[2];v[11]=BLAKE3_IV[3];
  v[12]=counter>>>0;v[13]=Math.floor(counter/4294967296)>>>0;v[14]=blockLen;v[15]=flags;
  let w=Uint32Array.from(m);
  const g=(a,b,c,d,x,y)=>{
    v[a]=v[a]+v[b]+x;v[d]=((v[d]^v[a])>>>16)|((v[d]^v[a])<<16);
    v[c]=v[c]+v[d];v[b]=((v[b]^v[c])>>>12)|((v[b]^v[c])<<20);
    v[a]=v[a]+v[b]+y;v[d]=((v[d]^v[a])>>>8)|((v[d]^v[a])<<24);
    v[c]=v[c]+v[d];v[b]=((v[b]^v[c])>>>7)|((v[b]^v[c])<<25);
  };
  for(let r=0;r<7;r++){
    g(0,4,8,12,w[0],w[1]);g(1,5,9,13,w[2],w[3]);g(2,6,10,14,w[4],w[5]);g(3,7,11,15,w[6],w[7]);
    g(0,5,10,15,w[8],w[9]);g(1,6,11,12,w[10],w[11]);g(2,7,8,13,w[12],w[13]);g(3,4,9,14,w[14],w[15]);
    if(r<6){const p=new Uint32Array(16);for(let i=0;i<16;i++)p[i]=w[BLAKE3_PERM[i]];w=p;}
  }
  for(let i=0;i<8;i++){v[i]^=v[i+8];v[i+8]^=cv[i];}
  return v;
}
function blake3Words(bytes,off,len){
  const w=new Uint32Array(16);
  for(let i=0;i<len;i++) w[i>>2]|=bytes[off+i]<<((i&3)*8);
  return w;
}
function blake3Hex(input){
  const bytes=typeof input==="string"?new TextEncoder().encode(input):input;
  const CHUNK=1024,START=1,END=2,PARENT=4,ROOT=8;
  const chunks=Math.max(1,Math.ceil(bytes.length/CHUNK));
  const stack=[];
  let out=null; // {cv,words,counter,len,flags} of the last compression (not yet run)
  for(let c=0;c<chunks;c++){
    const off=c*CHUNK, len=Math.min(CHUNK,bytes.length-off), blocks=Math.max(1,Math.ceil(len/64));
    let cv=BLAKE3_IV.slice();
    for(let b=0;b<blocks;b++){
      const bo=off+b*64, bl=Math.min(64,len-b*64);
      const flags=(b===0?START:0)|(b===blocks-1?END:0);
      const words=blake3Words(bytes,bo,bl);
      if(b===blocks-1){ out={cv,words,counter:c,len:bl,flags}; }
      else cv=blake3Compress(cv,words,c,64,flags).slice(0,8);
    }
    if(c<chunks-1){
      let chunkCv=blake3Compress(out.cv,out.words,out.counter,out.len,out.flags).slice(0,8);
      let total=c+1;
      while((total&1)===0){ const left=stack.pop(); const m=new Uint32Array(16); m.set(left,0); m.set(chunkCv,8); chunkCv=blake3Compress(BLAKE3_IV,m,0,64,PARENT).slice(0,8); total>>=1; }
      stack.push(chunkCv);
    }
  }
  while(stack.length){
    const right=blake3Compress(out.cv,out.words,out.counter,out.len,out.flags).slice(0,8);
    const m=new Uint32Array(16); m.set(stack.pop(),0); m.set(right,8);
    out={cv:BLAKE3_IV.slice(),words:m,counter:0,len:64,flags:PARENT};
  }
  const v=blake3Compress(out.cv,out.words,out.counter,out.len,out.flags|ROOT);
  let hex="";for(let i=0;i<8;i++){const x=v[i];for(let k=0;k<4;k++)hex+=((x>>>(8*k))&255).toString(16).padStart(2,"0");}
  return hex;
}

const INTEGRATIONS={
  github:{name:'GitHub',origin:'https://api.github.com',tokenUrl:'https://github.com/settings/tokens/new?scopes=repo&description=Kita%20Chat',
    steps:'Create a classic token with the "repo" scope (or a fine-grained token for all repositories with Contents, Administration and Pages: read and write), then paste it here.'},
  vercel:{name:'Vercel',origin:'https://api.vercel.com',tokenUrl:'https://vercel.com/account/tokens',
    steps:'Create a token (scope: your account or team), then paste it here. Team ID is only needed to deploy into a team.'},
  cloudflare:{name:'Cloudflare',origin:'https://api.cloudflare.com',tokenUrl:'https://dash.cloudflare.com/profile/api-tokens',
    steps:'Create a custom API token with Account permissions: Cloudflare Pages: Edit, Workers Scripts: Edit and Account Settings: Read. Paste it here.'},
};
const PUBLISH_TARGETS=[
  {id:'vercel',service:'vercel',label:'Vercel',host:n=>n+'.vercel.app'},
  {id:'cloudflare-pages',service:'cloudflare',label:'Cloudflare Pages',host:n=>n+'.pages.dev'},
  {id:'cloudflare-workers',service:'cloudflare',label:'Cloudflare Workers',host:n=>n+'.'+(integrationState('cloudflare').subdomain||'<subdomain>')+'.workers.dev'},
  {id:'github-pages',service:'github',label:'GitHub Pages',host:n=>(integrationState('github').login||'<you>')+'.github.io/'+n},
  {id:'github',service:'github',label:'GitHub repository',host:n=>'github.com/'+(integrationState('github').login||'<you>')+'/'+n},
];
const integrationMemoryTokens={};
function integrationState(service){const all=db.integrations&&typeof db.integrations==='object'?db.integrations:null;return (all&&all[service])||{};}
function setIntegrationState(service,state){db.integrations=db.integrations&&typeof db.integrations==='object'?db.integrations:{};if(state)db.integrations[service]=state;else delete db.integrations[service];save();}
function integrationConnected(service){return !!integrationState(service).connected;}
function integrationRef(service){return 'integration:'+service;}
function storeIntegrationToken(service,token){
  if(hasNativeSecrets()){ if(!window.NazSecrets.put(integrationRef(service),token)) throw new Error('Could not store the token on this device'); }
  else integrationMemoryTokens[service]=token;
}
function forgetIntegrationToken(service){ try{ if(hasNativeSecrets()) window.NazSecrets.remove(integrationRef(service)); }catch(e){} delete integrationMemoryTokens[service]; }
function integrationErrorText(service,status,data,raw){
  const m=data&&(data.message||data.error?.message||(Array.isArray(data.errors)&&data.errors.map(e=>e.message||e).filter(Boolean).join('; '))||data.error_description||(typeof data.error==='string'?data.error:''));
  const base=m||String(raw||'').slice(0,200)||'request failed';
  if(status===401||status===403) return INTEGRATIONS[service].name+' refused the token ('+status+'): '+base+'. Check the token and its permissions.';
  return INTEGRATIONS[service].name+' error'+(status?' '+status:'')+': '+base;
}
/* One request to a service API. auth:false sends the request without the stored token
   (Cloudflare's upload JWT is passed in headers instead). */
async function integrationFetch(service,path,opts={}){
  const meta=INTEGRATIONS[service];
  const url=/^https:\/\//.test(path)?path:meta.origin+path;
  const headers={Accept:'application/json',...(opts.headers||{})};
  if(service==='github'){headers.Accept='application/vnd.github+json';headers['X-GitHub-Api-Version']='2022-11-28';}
  let body=opts.body;
  if(body!==undefined&&typeof body!=='string'){body=JSON.stringify(body);headers['Content-Type']=headers['Content-Type']||'application/json';}
  const req={method:opts.method||'GET',headers,timeout:opts.timeout||60000};
  if(body) req.body=body;
  if(opts.auth!==false){
    if(hasNativeSecrets()) req.secretRef=integrationRef(service);
    else if(integrationMemoryTokens[service]) headers.Authorization='Bearer '+integrationMemoryTokens[service];
  }
  const res=await netFetch(url,req);
  const raw=await res.text();
  let data=null;try{data=raw?JSON.parse(raw):null;}catch(e){}
  if(!res.ok){const err=new Error(integrationErrorText(service,res.status,data,raw));err.status=res.status;err.data=data;throw err;}
  return data;
}
/* Checks a token and records who it belongs to (never the token itself). */
async function connectIntegration(service,token,extra={}){
  token=String(token||'').trim();
  if(!token) throw new Error('Paste a token first');
  storeIntegrationToken(service,token);
  try{
    const state={connected:true,hint:token.length>=12?token.slice(-4):'',at:Date.now()};
    if(service==='github'){const u=await integrationFetch('github','/user');state.login=u.login;state.label='@'+u.login;}
    if(service==='vercel'){const u=await integrationFetch('vercel','/v2/user');state.user=u.user?.username||u.user?.email||'';state.label=state.user;if(extra.teamId)state.teamId=String(extra.teamId).trim();}
    if(service==='cloudflare'){
      await integrationFetch('cloudflare','/client/v4/user/tokens/verify');
      const acc=await integrationFetch('cloudflare','/client/v4/accounts?per_page=50');
      const list=(acc.result||[]);if(!list.length)throw new Error('This token cannot see any Cloudflare account. Add "Account Settings: Read".');
      const chosen=list.find(a=>a.id===extra.accountId)||list[0];
      state.accountId=chosen.id;state.accountName=chosen.name;state.accounts=list.map(a=>({id:a.id,name:a.name}));state.label=chosen.name;
      try{const sd=await integrationFetch('cloudflare','/client/v4/accounts/'+chosen.id+'/workers/subdomain');state.subdomain=sd.result?.subdomain||'';}catch(e){state.subdomain='';}
    }
    if(service==='supabase'){
      const list=await integrationFetch('supabase','/v1/projects');
      state.projects=(Array.isArray(list)?list:[]).map(p=>({ref:p.ref||p.id,name:p.name,region:p.region||'',status:p.status||''})).filter(p=>p.ref);
      if(!state.projects.length) throw new Error('This Supabase account has no projects yet. Create one at supabase.com first.');
      state.label=state.projects.length+' project'+(state.projects.length===1?'':'s');state.useInCode=true;
      setIntegrationState(service,state);
      const pick=state.projects.find(p=>p.ref===extra.ref)||(state.projects.length===1?state.projects[0]:null);
      if(pick) await supabaseLoadProject(pick.ref);
      return integrationState(service);
    }
    setIntegrationState(service,state);
    return state;
  }catch(e){forgetIntegrationToken(service);setIntegrationState(service,null);throw e;}
}
function disconnectIntegration(service){forgetIntegrationToken(service);setIntegrationState(service,null);}

/* ---------- Files to publish ---------- */
function utf8Base64(text){const bytes=new TextEncoder().encode(String(text));let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s);}
function siteSlug(text){
  let s=String(text||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  // Default names stay short: cut at a word boundary around 40 characters.
  if(s.length>40){const cut=s.slice(0,41).lastIndexOf('-');s=s.slice(0,cut>=12?cut:40);}
  return s.replace(/-+$/,'')||'kita-site';
}
const SITE_TYPES={html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',json:'application/json',svg:'image/svg+xml',txt:'text/plain; charset=utf-8',md:'text/markdown; charset=utf-8',xml:'application/xml',webmanifest:'application/manifest+json'};
function siteType(path){return SITE_TYPES[(String(path).split('.').pop()||'').toLowerCase()]||'text/plain; charset=utf-8';}
/* Files from an answer: the page becomes index.html; named files keep their names. */
function siteFilesFrom(info){
  const files=[];
  const list=info.files&&info.files.length?info.files:[{name:info.name,raw:info.rawCode,lang:info.lang}];
  const page=list.find(f=>/^(html|htm|xhtml)$/.test(f.lang||'')&&/<(?:!doctype\s+html|html\b|body\b)/i.test(f.raw))||list.find(f=>/\.html?$/i.test(f.name));
  for(const f of list){
    let path=String(f.name||'file.txt').replace(/^\/+/,'').replace(/\.\.+/g,'.');
    if(f===page) path='index.html';
    if(files.some(x=>x.path===path)) continue;
    const content=String(f.raw||'');
    files.push({path,content:/\.html?$/i.test(path)&&typeof kitaInlineIcons==='function'?kitaInlineIcons(content):content});
  }
  return files;
}

/* ---------- Publishers ---------- */
async function publishVercel(name,files,log){
  const st=integrationState('vercel'),q=st.teamId?'&teamId='+encodeURIComponent(st.teamId):'';
  log('Uploading '+files.length+' file'+(files.length===1?'':'s')+' to Vercel…');
  const dep=await integrationFetch('vercel','/v13/deployments?skipAutoDetectionConfirmation=1'+q,{method:'POST',body:{name,target:'production',files:files.map(f=>({file:f.path,data:f.content,encoding:'utf-8'})),projectSettings:{framework:null}}});
  let cur=dep;
  for(let i=0;i<30&&!/^(READY|ERROR|CANCELED)$/.test(cur.readyState||cur.status||'');i++){
    log('Vercel is building… '+String(cur.readyState||cur.status||'QUEUED').toLowerCase());
    await new Promise(r=>setTimeout(r,2000));
    cur=await integrationFetch('vercel','/v13/deployments/'+encodeURIComponent(dep.id)+(q?'?'+q.slice(1):''));
  }
  const state=cur.readyState||cur.status;
  if(state==='ERROR'||state==='CANCELED') throw new Error('Vercel deployment '+state.toLowerCase()+': '+(cur.errorMessage||'see the Vercel dashboard'));
  const aliases=(cur.alias||dep.alias||[]);
  const prod=aliases.find(a=>a===name+'.vercel.app')||aliases[0]||cur.url||dep.url;
  return {url:'https://'+prod,detail:state==='READY'?'Live':'Deploying (finishes in a moment)'};
}
async function cloudflareProject(acc,name,log){
  try{return (await integrationFetch('cloudflare','/client/v4/accounts/'+acc+'/pages/projects/'+name)).result;}
  catch(e){ if(e.status!==404) throw e; }
  log('Creating Cloudflare Pages project '+name+'…');
  return (await integrationFetch('cloudflare','/client/v4/accounts/'+acc+'/pages/projects',{method:'POST',body:{name,production_branch:'main'}})).result;
}
function multipartBody(parts){
  const boundary='----KitaChat'+Math.random().toString(16).slice(2)+Date.now().toString(16);
  let body='';
  for(const p of parts){
    body+='--'+boundary+'\r\nContent-Disposition: form-data; name="'+p.name+'"'+(p.filename?'; filename="'+p.filename+'"':'')+'\r\n';
    if(p.type) body+='Content-Type: '+p.type+'\r\n';
    body+='\r\n'+p.value+'\r\n';
  }
  body+='--'+boundary+'--\r\n';
  return {body,type:'multipart/form-data; boundary='+boundary};
}
async function publishCloudflarePages(name,files,log){
  const acc=integrationState('cloudflare').accountId;if(!acc)throw new Error('Reconnect Cloudflare to choose an account');
  const project=await cloudflareProject(acc,name,log);
  log('Preparing upload…');
  const jwt=(await integrationFetch('cloudflare','/client/v4/accounts/'+acc+'/pages/projects/'+name+'/upload-token')).result?.jwt;
  if(!jwt) throw new Error('Cloudflare did not return an upload token');
  const assets=files.map(f=>{const b64=utf8Base64(f.content),ext=(f.path.split('.').pop()||'');return {path:'/'+f.path,b64,type:siteType(f.path),hash:blake3Hex(b64+ext).slice(0,32)};});
  const jwtHeaders={Authorization:'Bearer '+jwt};
  const missing=(await integrationFetch('cloudflare','/client/v4/pages/assets/check-missing',{method:'POST',auth:false,headers:jwtHeaders,body:{hashes:assets.map(a=>a.hash)}})).result||[];
  const upload=assets.filter(a=>missing.includes(a.hash));
  if(upload.length){log('Uploading '+upload.length+' file'+(upload.length===1?'':'s')+'…');await integrationFetch('cloudflare','/client/v4/pages/assets/upload',{method:'POST',auth:false,headers:jwtHeaders,body:upload.map(a=>({key:a.hash,value:a.b64,metadata:{contentType:a.type},base64:true}))});}
  await integrationFetch('cloudflare','/client/v4/pages/assets/upsert-hashes',{method:'POST',auth:false,headers:jwtHeaders,body:{hashes:assets.map(a=>a.hash)}});
  log('Creating the deployment…');
  const manifest={};assets.forEach(a=>{manifest[a.path]=a.hash;});
  const mp=multipartBody([{name:'manifest',value:JSON.stringify(manifest)},{name:'branch',value:'main'}]);
  const dep=(await integrationFetch('cloudflare','/client/v4/accounts/'+acc+'/pages/projects/'+name+'/deployments',{method:'POST',headers:{'Content-Type':mp.type},body:mp.body})).result||{};
  const host=project?.subdomain||(name+'.pages.dev');
  return {url:'https://'+host,detail:'Live in about a minute',preview:dep.url||''};
}
function workerSource(files){
  const map={};files.forEach(f=>{map['/'+f.path]={t:siteType(f.path),b:f.content};});
  return '// Published from Kita Chat\nconst FILES='+JSON.stringify(map)+';\nexport default {\n  async fetch(request) {\n    let path = new URL(request.url).pathname;\n    if (path.endsWith("/")) path += "index.html";\n    const file = FILES[path] || FILES[path + ".html"] || (path.includes(".") ? null : FILES["/index.html"]);\n    if (!file) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });\n    return new Response(file.b, { headers: { "content-type": file.t, "cache-control": "public, max-age=60" } });\n  }\n};\n';
}
async function publishCloudflareWorker(name,files,log){
  const st=integrationState('cloudflare'),acc=st.accountId;if(!acc)throw new Error('Reconnect Cloudflare to choose an account');
  let sub=st.subdomain;
  if(!sub){try{sub=(await integrationFetch('cloudflare','/client/v4/accounts/'+acc+'/workers/subdomain')).result?.subdomain||'';if(sub)setIntegrationState('cloudflare',{...st,subdomain:sub});}catch(e){}}
  if(!sub) throw new Error('Your Cloudflare account has no workers.dev subdomain yet. Open Workers & Pages in the Cloudflare dashboard once to create it, then try again.');
  log('Uploading the Worker…');
  const mp=multipartBody([{name:'metadata',type:'application/json',value:JSON.stringify({main_module:'worker.js',compatibility_date:'2025-01-01'})},{name:'worker.js',filename:'worker.js',type:'application/javascript+module',value:workerSource(files)}]);
  await integrationFetch('cloudflare','/client/v4/accounts/'+acc+'/workers/scripts/'+name,{method:'PUT',headers:{'Content-Type':mp.type},body:mp.body});
  log('Turning on the workers.dev address…');
  await integrationFetch('cloudflare','/client/v4/accounts/'+acc+'/workers/scripts/'+name+'/subdomain',{method:'POST',body:{enabled:true,previews_enabled:false}});
  return {url:'https://'+name+'.'+sub+'.workers.dev',detail:'Live'};
}
async function githubRepo(login,name,pages,log){
  try{return await integrationFetch('github','/repos/'+login+'/'+name);}
  catch(e){ if(e.status!==404) throw e; }
  log('Creating repository '+login+'/'+name+'…');
  return await integrationFetch('github','/user/repos',{method:'POST',body:{name,private:!pages,auto_init:true,description:'Published from Kita Chat'}});
}
async function publishGitHub(name,files,log,pages,opts={}){
  let login=integrationState('github').login;
  if(!login){login=(await integrationFetch('github','/user')).login;setIntegrationState('github',{...integrationState('github'),login});}
  let repo=await githubRepo(login,name,pages,log);
  const branch=repo.default_branch||'main',base='/repos/'+login+'/'+name;
  // Pages serves the files as they are: .nojekyll skips the Jekyll build (faster, keeps _files).
  if(pages&&!files.some(f=>f.path==='.nojekyll')) files=files.concat({path:'.nojekyll',content:''});
  // GitHub Pages on a free plan needs a public repository. An existing private one (for
  // example published earlier as "GitHub repository") is made public only if the user agrees,
  // and nothing is committed before that is settled.
  if(pages&&repo.private){
    const ok=opts.confirmPublic?await opts.confirmPublic(login+'/'+name):false;
    if(!ok) throw new Error(login+'/'+name+' is private, and GitHub Pages on a free plan needs a public repository. Choose another site name, or allow making it public.');
    log('Making '+login+'/'+name+' public…');
    repo=await integrationFetch('github',base,{method:'PATCH',body:{private:false}});
  }
  let ref=null,empty=false;
  for(let i=0;i<6&&!ref;i++){try{ref=await integrationFetch('github',base+'/git/ref/heads/'+branch);}catch(e){if(e.status!==404&&e.status!==409)throw e;empty=e.status===409;if(empty)break;await new Promise(r=>setTimeout(r,1500));}}
  if(!ref&&empty){
    // An existing repository with no commits has no branch to build on: add the files one by one.
    log('Repository is empty. Adding '+files.length+' file'+(files.length===1?'':'s')+'…');
    for(const f of files) await integrationFetch('github',base+'/contents/'+f.path.split('/').map(encodeURIComponent).join('/'),{method:'PUT',body:{message:'Publish from Kita Chat',content:utf8Base64(f.content),branch}});
  }else{
  if(!ref) throw new Error('The new repository is not ready yet. Try again in a moment.');
  const head=ref.object.sha;
  const commit=await integrationFetch('github',base+'/git/commits/'+head);
  log('Committing '+files.length+' file'+(files.length===1?'':'s')+'…');
  const tree=await integrationFetch('github',base+'/git/trees',{method:'POST',body:{base_tree:commit.tree.sha,tree:files.map(f=>({path:f.path,mode:'100644',type:'blob',content:f.content}))}});
  const next=await integrationFetch('github',base+'/git/commits',{method:'POST',body:{message:'Publish from Kita Chat',tree:tree.sha,parents:[head]}});
  await integrationFetch('github',base+'/git/refs/heads/'+branch,{method:'PATCH',body:{sha:next.sha}});
  }
  if(!pages) return {url:repo.html_url||('https://github.com/'+login+'/'+name),detail:'Committed to '+branch};
  log('Turning on GitHub Pages…');
  let site=null;
  try{site=await integrationFetch('github',base+'/pages');}
  catch(e){
    if(e.status!==404) throw e;
    try{ site=await integrationFetch('github',base+'/pages',{method:'POST',body:{source:{branch,path:'/'}}}); }
    catch(err){ if(err.status===422&&/plan/i.test(err.message)) throw new Error('GitHub Pages is not available for '+login+'/'+name+' on your plan. Make the repository public in its GitHub settings, or publish under another site name.'); throw err; }
  }
  const url=site?.html_url||('https://'+login.toLowerCase()+'.github.io/'+name+'/');
  // The site answers 404 until GitHub has built it, so wait for the build before saying it is live.
  log('Waiting for GitHub Pages to build…');
  const until=Date.now()+(opts.buildWaitMs??150000);
  let status='';
  while(Date.now()<until){
    await new Promise(r=>setTimeout(r,opts.buildPollMs??5000));
    try{const b=await integrationFetch('github',base+'/pages/builds/latest');status=b?.status||'';
      if(status==='built') return {url,detail:'Live',repo:repo.html_url};
      if(status==='errored') throw new Error('GitHub Pages could not build the site: '+(b.error?.message||'see the repository\'s Actions tab'));
    }catch(e){ if(/could not build/.test(e.message)) throw e; if(e.status&&e.status!==404) throw e; }
  }
  return {url,detail:'Still building on GitHub. If the link shows 404, refresh in a minute or two.',repo:repo.html_url};
}
async function publishSite(targetId,name,files,log=()=>{},opts={}){
  const slug=siteSlug(name);
  if(targetId==='vercel') return publishVercel(slug,files,log);
  if(targetId==='cloudflare-pages') return publishCloudflarePages(slug,files,log);
  if(targetId==='cloudflare-workers') return publishCloudflareWorker(slug,files,log);
  if(targetId==='github-pages') return publishGitHub(slug,files,log,true,opts);
  if(targetId==='github') return publishGitHub(slug,files,log,false);
  throw new Error('Unknown publish target');
}

/* ---------- Settings → Integrations ---------- */
function integrationIcon(service){
  const p={github:'<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.5 6-6.6a5 5 0 0 0-1.4-3.6 4.7 4.7 0 0 0-.1-3.6s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.5 0C6 1.1 4.9 1.4 4.9 1.4a4.7 4.7 0 0 0-.1 3.6A5 5 0 0 0 3.4 8.6c0 5.1 3 6.3 6 6.6a3 3 0 0 0-.9 2.4V21"/>',vercel:'<path d="M12 4 21 20H3z"/>',cloudflare:'<path d="M17.5 19H7a5 5 0 1 1 1.1-9.9A6 6 0 0 1 19.6 11 4 4 0 0 1 17.5 19z"/>',supabase:'<path d="M13 3 4 14h8l-1 7 9-11h-8z"/>'};
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(p[service]||p.github)+'</svg>';
}
function integrationsSummary(){const on=Object.keys(INTEGRATIONS).filter(integrationConnected).map(s=>INTEGRATIONS[s].name);return on.length?on.join(' · '):'Publish to GitHub, Vercel and Cloudflare';}
function renderIntegrationsSettings(){
  renderSettingsPage('Integrations','',null,list=>{
    list.appendChild(el('div','hint','Design in Code, then publish from your phone. Tokens are stored in Android Keystore and only ever sent to that service\'s official API. Every publish asks you first.'));
    for(const service of Object.keys(INTEGRATIONS)){
      const meta=INTEGRATIONS[service],st=integrationState(service),on=!!st.connected;
      const card=el('div','integration-card'+(on?' on':''));card.dataset.service=service;
      const head=el('div','integration-head');
      head.innerHTML='<span class="integration-icon">'+integrationIcon(service)+'</span><span class="integration-copy"><strong>'+esc(meta.name)+'</strong><small>'+esc(on?('Connected'+(st.label?' as '+st.label:'')+(st.hint?' · token …'+st.hint:'')):'Not connected')+'</small></span>';
      card.appendChild(head);
      if(on){
        if(service==='cloudflare'){
          const info=el('div','integration-note');info.textContent='Account: '+(st.accountName||st.accountId||'?')+(st.subdomain?' · workers.dev: '+st.subdomain:' · no workers.dev subdomain yet');card.appendChild(info);
          if((st.accounts||[]).length>1){const sel=el('select');sel.setAttribute('aria-label','Cloudflare account');sel.innerHTML=st.accounts.map(a=>'<option value="'+esc(a.id)+'"'+(a.id===st.accountId?' selected':'')+'>'+esc(a.name)+'</option>').join('');sel.onchange=async()=>{const a=st.accounts.find(x=>x.id===sel.value);let sub='';try{sub=(await integrationFetch('cloudflare','/client/v4/accounts/'+a.id+'/workers/subdomain')).result?.subdomain||'';}catch(e){}setIntegrationState('cloudflare',{...st,accountId:a.id,accountName:a.name,label:a.name,subdomain:sub});renderIntegrationsSettings();};card.appendChild(sel);}
        }
        if(service==='supabase'){
          const sel=el('select');sel.setAttribute('aria-label','Supabase project');
          sel.innerHTML='<option value="">Choose a project…</option>'+(st.projects||[]).map(p=>'<option value="'+esc(p.ref)+'"'+(p.ref===st.ref?' selected':'')+'>'+esc(p.name+(p.region?' · '+p.region:''))+'</option>').join('');
          sel.onchange=async()=>{if(!sel.value)return;sel.disabled=true;try{await supabaseLoadProject(sel.value);toast('Supabase project selected');}catch(e){toast(e.message);}renderIntegrationsSettings();};
          card.appendChild(sel);
          if(st.ref){
            const info=el('div','integration-note');info.textContent=st.url+' · public key …'+String(st.anonKey||'').slice(-6)+' · '+(st.tables||0)+' table'+(st.tables===1?'':'s');card.appendChild(info);
            const row=el('div','tools-row');row.innerHTML='<span><strong>Use in Code</strong><small>Apps you build can sign users in and store data in this project</small></span>';
            const sw=el('button','switch'+(st.useInCode!==false?' on':''));sw.type='button';sw.setAttribute('role','switch');sw.setAttribute('aria-checked',String(st.useInCode!==false));sw.setAttribute('aria-label','Use Supabase in Code');
            sw.onclick=()=>{setIntegrationState('supabase',{...integrationState('supabase'),useInCode:st.useInCode===false});renderIntegrationsSettings();};
            row.appendChild(sw);card.appendChild(row);
            if(st.schema){const pre=el('pre','supabase-schema');pre.textContent=st.schema;card.appendChild(pre);}
          }
        }
        if(service==='vercel'&&st.teamId){const info=el('div','integration-note');info.textContent='Team: '+st.teamId;card.appendChild(info);}
        const actions=el('div','integration-actions');
        const test=el('button','mini-btn','Test');test.type='button';test.onclick=async()=>{test.disabled=true;try{if(service==='github')await integrationFetch('github','/user');if(service==='vercel')await integrationFetch('vercel','/v2/user');if(service==='cloudflare')await integrationFetch('cloudflare','/client/v4/user/tokens/verify');if(service==='supabase'){await integrationFetch('supabase','/v1/projects');if(supabaseProject())await supabaseRefreshSchema();renderIntegrationsSettings();}toast(meta.name+' connection works');}catch(e){toast(e.message);}finally{test.disabled=false;}};
        const off=el('button','mini-btn danger','Disconnect');off.type='button';off.onclick=async()=>{if(await confirmDialog('Remove the '+meta.name+' token from this device? Sites you published stay online.',{title:'Disconnect '+meta.name,danger:true,confirmText:'Disconnect'})){disconnectIntegration(service);renderIntegrationsSettings();}};
        actions.append(test,off);card.appendChild(actions);
      }else{
        card.appendChild(el('p','integration-steps',esc(meta.steps)));
        const link=el('a','integration-link','Create a token on '+meta.name+' ↗');link.href=meta.tokenUrl;link.target='_blank';link.rel='noopener';card.appendChild(link);
        const input=el('input');input.type='password';input.autocomplete='off';input.placeholder=meta.name+' token';input.setAttribute('aria-label',meta.name+' token');card.appendChild(input);
        let extra=null;
        if(service==='vercel'){extra=el('input');extra.placeholder='Team ID (optional)';extra.setAttribute('aria-label','Vercel team ID');card.appendChild(extra);}
        const go=el('button','btn','Connect '+meta.name);go.type='button';
        go.onclick=async()=>{go.disabled=true;go.textContent='Checking…';try{const st2=await connectIntegration(service,input.value,{teamId:extra?.value});input.value='';toast(meta.name+' connected'+(st2.label?' as '+st2.label:''));renderIntegrationsSettings();}catch(e){toast(e.message);go.disabled=false;go.textContent='Connect '+meta.name;}};
        card.appendChild(go);
      }
      list.appendChild(card);
    }
  });
}

/* ---------- Publish sheet ---------- */
function openPublishSheet(info){
  const files=siteFilesFrom(info);
  const c=conv;c&&(c.sites=c.sites||{});
  const body=$('#toolsSheetBody');body.innerHTML='';$('#studioChatControls').hidden=true;$('#toolsSheet .sheet-head h3').textContent='Publish';
  const last=c&&Object.values(c.sites||{}).sort((a,b)=>(b.at||0)-(a.at||0))[0];
  const nameRow=el('label','publish-field');nameRow.innerHTML='<span>Site name</span>';
  const name=el('input');name.id='publishName';const realTitle=info.title&&!/\.[a-z0-9]{1,5}$/i.test(info.title)?info.title:'';
  name.value=last?.name||siteSlug(realTitle||(c?.title&&c.title!=='New chat'?c.title:'')||'kita-site');name.setAttribute('aria-label','Site name');name.autocapitalize='off';name.spellcheck=false;nameRow.appendChild(name);body.appendChild(nameRow);
  body.appendChild(el('p','hint',esc(files.length+' file'+(files.length===1?'':'s')+': '+files.map(f=>f.path).join(', '))));
  const list=el('div','publish-targets');list.setAttribute('role','radiogroup');list.setAttribute('aria-label','Where to publish');
  let chosen=(last&&PUBLISH_TARGETS.find(t=>t.id===last.target&&integrationConnected(t.service)))||PUBLISH_TARGETS.find(t=>integrationConnected(t.service));
  const preview=el('div','publish-preview');
  const refresh=()=>{
    list.querySelectorAll('.publish-target').forEach(b=>{const on=b.dataset.target===chosen?.id;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));});
    const slug=siteSlug(name.value);
    preview.textContent=chosen?('https://'+chosen.host(slug)+(c?.sites?.[chosen.id]?'  · updates your existing site':'')):'Connect a service in Settings → Integrations to publish.';
    go.disabled=!chosen||!slug;
    renderVersions();
  };
  for(const t of PUBLISH_TARGETS){
    const ok=integrationConnected(t.service),b=el('button','publish-target'+(ok?'':' off'));b.type='button';b.dataset.target=t.id;b.setAttribute('role','radio');
    b.innerHTML='<span class="integration-icon">'+integrationIcon(t.service)+'</span><span><strong>'+esc(t.label)+'</strong><small>'+esc(ok?(c?.sites?.[t.id]?'Published · '+c.sites[t.id].url.replace(/^https:\/\//,''):t.host('name').replace('name','…')):'Not connected · tap to connect')+'</small></span>';
    b.onclick=()=>{if(!ok){closeSheet('toolsSheet');renderIntegrationsSettings();openSheet('setSheet');return;}chosen=t;refresh();};
    list.appendChild(b);
  }
  const versions=el('div','publish-versions');
  body.appendChild(list);body.appendChild(preview);body.appendChild(versions);
  const progress=el('ol','publish-progress');progress.setAttribute('aria-live','polite');
  const go=el('button','btn','Publish');go.id='publishGo';go.type='button';
  name.oninput=refresh;
  // Every publish is kept as a version (its files, the answer it came from, when and where).
  // Rollback publishes an earlier version again to the same site, the same way on every service.
  // Short by default: the live version and the two before it; the rest on request.
  let showAllVersions=false;
  const VERSIONS_SHOWN=3;
  const renderVersions=()=>{
    versions.innerHTML='';
    const list=chosen?siteVersions(c,chosen.id,siteSlug(name.value)):[];
    if(!list.length) return;
    versions.appendChild(el('p','studio-section-title','Versions'));
    (showAllVersions?list:list.slice(0,VERSIONS_SHOWN)).forEach((v,i)=>{
      const row=el('div','publish-version'+(i===0?' live':''));
      const when=new Date(v.at).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      const from=v.rollbackOf?'rollback to version '+(siteVersionNumber(c,v.rollbackOf)||'?'):(v.messageId&&v.messageId===info.messageId?'this page':'an earlier answer');
      row.innerHTML='<span><strong>Version '+v.n+(i===0?' · live':'')+'</strong><small>'+esc(when+' · '+v.files.length+' file'+(v.files.length===1?'':'s')+' · '+from)+'</small></span>';
      if(i>0){const rb=el('button','mini-btn','Rollback');rb.type='button';rb.setAttribute('aria-label','Roll back to version '+v.n);rb.onclick=()=>publishNow(v.files,{rollbackOf:v.id,label:'version '+v.n});row.appendChild(rb);}
      versions.appendChild(row);
    });
    if(list.length>VERSIONS_SHOWN){
      const more=el('button','publish-more',showAllVersions?'Show fewer':'Show all '+list.length+' versions');more.type='button';
      more.setAttribute('aria-expanded',String(showAllVersions));
      more.onclick=()=>{showAllVersions=!showAllVersions;renderVersions();};
      versions.appendChild(more);
    }
  };
  const publishNow=async(sendFiles,opts={})=>{
    const slug=siteSlug(name.value),t=chosen;if(!t||!slug)return;name.value=slug;
    const where='https://'+t.host(slug);
    const ok=opts.rollbackOf
      ? await confirmDialog('Publish '+opts.label+' again to '+where+'? It replaces what is live now. You can roll forward the same way.',{title:'Roll back '+t.label,confirmText:'Roll back'})
      : await confirmDialog('Publish '+sendFiles.length+' file'+(sendFiles.length===1?'':'s')+' to '+where+'? '+(t.id==='github'?'The repository is private.':'Anyone with the link can open it.'),{title:'Publish to '+t.label,confirmText:'Publish'});
    if(!ok)return;
    go.disabled=true;go.textContent=opts.rollbackOf?'Rolling back…':'Publishing…';progress.innerHTML='';body.querySelectorAll('.publish-done').forEach(n=>n.remove());
    versions.querySelectorAll('button').forEach(b=>b.disabled=true);
    const log=m=>{const li=el('li');li.textContent=m;progress.appendChild(li);};
    try{
      const r=await publishSite(t.id,slug,sendFiles,log,{confirmPublic:full=>confirmDialog(full+' is a private repository. GitHub Pages on a free plan only works with public repositories. Make it public so the site can go live? Anyone will be able to see its files.',{title:'Make repository public?',confirmText:'Make public',danger:true})});
      if(c){c.sites=c.sites||{};c.sites[t.id]={target:t.id,name:slug,url:r.url,at:Date.now()};recordSiteVersion(c,{target:t.id,name:slug,url:r.url,files:sendFiles,messageId:opts.rollbackOf?null:info.messageId,rollbackOf:opts.rollbackOf||null});c.updatedAt=Date.now();save();}
      log('✓ '+(r.detail||'Published'));
      const done=el('div','publish-done');
      done.innerHTML='<strong>'+(opts.rollbackOf?'Rolled back to '+esc(opts.label):'Published')+'</strong><a href="'+esc(r.url)+'" target="_blank" rel="noopener">'+esc(r.url.replace(/^https:\/\//,''))+'</a>';
      const copy=el('button','mini-btn','Copy link');copy.type='button';copy.onclick=()=>copyText(r.url,copy,'Copied');done.appendChild(copy);
      body.appendChild(done);go.textContent='Publish again';go.disabled=false;
      toast((opts.rollbackOf?'Rolled back on ':'Published to ')+t.label);haptic?.('success');
    }catch(e){log('✕ '+String(e.message||e));go.disabled=false;go.textContent='Try again';}
    renderVersions();
  };
  go.onclick=()=>publishNow(files);
  body.appendChild(go);body.appendChild(progress);
  refresh();openSheet('toolsSheet');
}
/* Version history per conversation: newest first for one target and site name. */
const SITE_VERSIONS_KEPT=10;
function siteVersions(c,target,name){return (c?.siteHistory||[]).filter(v=>v.target===target&&v.name===name).sort((a,b)=>b.n-a.n);}
function siteVersionNumber(c,id){return (c?.siteHistory||[]).find(v=>v.id===id)?.n||0;}
function recordSiteVersion(c,v){
  c.siteHistory=Array.isArray(c.siteHistory)?c.siteHistory:[];
  const same=siteVersions(c,v.target,v.name);
  const entry={id:uid(),n:(same[0]?.n||0)+1,at:Date.now(),...v,files:v.files.map(f=>({path:f.path,content:f.content}))};
  c.siteHistory.push(entry);
  // Keep the last versions of each site (their files live in app data).
  const drop=new Set(siteVersions(c,v.target,v.name).slice(SITE_VERSIONS_KEPT).map(x=>x.id));
  if(drop.size) c.siteHistory=c.siteHistory.filter(x=>!drop.has(x.id));
  return entry;
}

/* ---------- Chat | Code modes ---------- */
/* Chat is for questions and research; Code is for building and publishing. Each
   conversation belongs to one mode and the lists show the current mode only. */
function kitaMode(){return conv?convMode(conv):(db.uiMode==='code'?'code':'chat');}
/* New conversations carry their mode. Older ones are read as Code when they built a web
   page, without changing the stored data (an upgrade must not rewrite conversations). */
const inferredModes=new WeakMap();
function convMode(c){
  if(!c) return 'chat';
  if(c.mode==='code'||c.mode==='chat') return c.mode;
  if(inferredModes.has(c)) return inferredModes.get(c);
  const m=(Array.isArray(c.messages)&&c.messages.some(x=>x&&x.role==='assistant'&&(x.phases||/```html|<!doctype html/i.test(String(x.content||'')))))?'code':'chat';
  inferredModes.set(c,m);return m;
}
function setKitaMode(mode){
  mode=mode==='code'?'code':'chat';
  if(typeof generating!=='undefined'&&generating){toast('Stop the current response first');return;}
  db.uiMode=mode;
  if(conv&&convMode(conv)!==mode){
    if(conv.messages?.length){conv=null;pendingAttachments=[];renderAttachments();}
    else conv.mode=mode;
  }
  save();haptic('light');renderAll();renderSidebar();
}
function modeSwitch(extraClass=''){
  const wrap=el('div','mode-switch'+(extraClass?' '+extraClass:''));wrap.setAttribute('role','tablist');wrap.setAttribute('aria-label','Mode');
  const cur=kitaMode();
  for(const [id,label,icon] of [['chat','Chat','chat'],['code','Code','code']]){
    const b=el('button','mode-tab'+(cur===id?' on':''),kitaIcon(icon)+'<span>'+label+'</span>');b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(cur===id));b.dataset.mode=id;
    b.onclick=()=>{if(kitaMode()!==id)setKitaMode(id);};wrap.appendChild(b);
  }
  return wrap;
}
const CODE_HOME={greeting:'What are we building?',title:'Design it here.<br>Publish from your phone.',text:'Agents write the page, Kita tests it, and you publish to Vercel, Cloudflare or GitHub.',sugg:[
  ['code','Landing page','A complete, polished one-page site','Buat landing page lengkap untuk kedai kopi dengan hero, menu, galeri, testimoni dan borang hubungi.'],
  ['spark','Small web app','An interactive tool in one page','Build a web app to split bills between friends, with a clean mobile layout and saved history.'],
  ['folder','Portfolio','Show your work beautifully','Create a portfolio website for a freelance designer with projects, about and contact sections.']]};
function renderModeHome(){
  const home=document.querySelector('.studio-home');if(!home)return;
  const mode=kitaMode();
  home.dataset.mode=mode;
  let sw=home.querySelector(':scope > .mode-switch');const fresh=modeSwitch('home-mode');
  if(sw)sw.replaceWith(fresh);else home.prepend(fresh);
  const h=home.querySelector('h2'),p=home.querySelector('h2 + p'),sugg=home.querySelector('.sugg');
  // Chat keeps the original welcome; Code swaps in its own (originals are kept to restore).
  if(!home._chatHome&&h&&p&&sugg) home._chatHome={title:h.innerHTML,text:p.textContent,nodes:[...sugg.children]};
  const orig=home._chatHome;
  if(mode==='code'){
    if(!currentProject?.())$('#studioGreeting').textContent=CODE_HOME.greeting;
    if(h)h.innerHTML=CODE_HOME.title;if(p)p.textContent=CODE_HOME.text;
    if(sugg&&sugg.dataset.mode!=='code'){
      sugg.dataset.mode='code';sugg.replaceChildren();
      for(const [icon,title,sub,prompt] of CODE_HOME.sugg){const b=el('button');b.type='button';b.dataset.p=prompt;b.innerHTML='<span class="ico">'+kitaIcon(icon)+'</span><span><strong>'+esc(title)+'</strong><small>'+esc(sub)+'</small></span><span class="studio-arrow">'+kitaIcon('arrow')+'</span>';b.onclick=()=>{if(!generating){$('#promptInput').value=prompt;doSend();}};sugg.appendChild(b);}
    }
  }else if(orig){
    if(h)h.innerHTML=orig.title;if(p)p.textContent=orig.text;
    if(sugg&&sugg.dataset.mode==='code'){delete sugg.dataset.mode;sugg.replaceChildren(...orig.nodes);}
  }
  let sites=home.querySelector('.code-sites');
  if(mode!=='code'){sites?.remove();return;}
  if(!sites){sites=el('div','code-sites');home.appendChild(sites);}
  sites.innerHTML='';
  if(typeof renderCodeStylePicker==='function') sites.appendChild(renderCodeStylePicker());
  const connected=Object.keys(INTEGRATIONS).filter(integrationConnected);
  const bar=el('button','code-integrations');bar.type='button';
  bar.innerHTML='<span class="integration-icons">'+Object.keys(INTEGRATIONS).map(s=>'<span class="integration-icon'+(integrationConnected(s)?' on':'')+'">'+integrationIcon(s)+'</span>').join('')+'</span><span><strong>'+(connected.length?'Publishing to '+connected.map(s=>INTEGRATIONS[s].name).join(', '):'Connect where to publish')+'</strong><small>'+(connected.length?'Manage integrations':'GitHub, Vercel and Cloudflare')+'</small></span>'+kitaIcon('arrow');
  bar.onclick=()=>{renderIntegrationsSettings();openSheet('setSheet');};
  sites.appendChild(bar);
  const published=[];db.conversations.forEach(c=>Object.values(c.sites||{}).forEach(s=>published.push({c,s})));
  published.sort((a,b)=>(b.s.at||0)-(a.s.at||0));
  if(published.length){
    sites.appendChild(el('p','studio-section-title','Your sites'));
    published.slice(0,4).forEach(({c,s})=>{
      const row=el('div','code-site');
      const t=(PUBLISH_TARGETS.find(x=>x.id===s.target)||{}).label||s.target;
      row.innerHTML='<a href="'+esc(s.url)+'" target="_blank" rel="noopener"><strong>'+esc(s.url.replace(/^https:\/\//,''))+'</strong><small>'+esc(t+' · '+(c.title||'Project'))+'</small></a>';
      const open=el('button','mini-btn','Open project');open.type='button';open.onclick=()=>studioOpenConversation(c);row.appendChild(open);
      sites.appendChild(row);
    });
  }
}
/* A build request typed in Chat starts its own Code project. */
function routeBuildToCode(c,text){
  if(!c||convMode(c)==='code'||c.messages.filter(m=>m.role==='user').length>1) return false;
  if(!isLongBuildRequest(text)) return false;
  c.mode='code';db.uiMode='code';save();toast('Moved to Code: building and publishing live there');
  return true;
}
/* Code mode recognises shorter build requests too ("buat kalkulator", "create a form page"). */
function isCodeBuildRequest(text){
  const t=String(text||'');
  if(isLongBuildRequest(t)) return true;
  if(/```|\b(error|ralat|bug|exception|traceback|kenapa|why|debug|explain|terangkan)\b/i.test(t)) return false;
  return /\b(buat|bina|bikin|create|build|make|design|reka|generate)\b/i.test(t) && /\b(page|laman|web|site|app|aplikasi|dashboard|landing|portfolio|game|permainan|form|borang|kalkulator|calculator|ui|kedai|store|shop)\b/i.test(t);
}
const CODE_MODE_NOTE="Code mode: the user is designing and building something to run and publish. Return complete, runnable files (a whole HTML document with inline CSS and JS for pages), mobile-first and accessible, with no placeholders like 'add your code here'. Keep the explanation short and put it before the code.";

/* ---------- Supabase (4.11.0) ---------- */
/* A Supabase project gives generated apps a real database, sign-in and storage.
   The personal access token (Management API) stays in Keystore and is only used
   for api.supabase.com; generated pages get the project URL and the PUBLIC anon /
   publishable key only. The service_role key is never fetched into the app. */
INTEGRATIONS.supabase={name:'Supabase',origin:'https://api.supabase.com',tokenUrl:'https://supabase.com/dashboard/account/tokens',
  steps:'Create an access token in your Supabase account settings and paste it here. Then choose the project your apps should use.'};
function supabaseProject(){const st=integrationState('supabase');return st.connected&&st.ref?st:null;}
function supabaseInCode(){const st=supabaseProject();return !!st&&st.useInCode!==false;}
async function supabaseLoadProject(ref){
  const st=integrationState('supabase');
  const keys=await integrationFetch('supabase','/v1/projects/'+encodeURIComponent(ref)+'/api-keys');
  // Only a public key is kept: the new publishable key, else the legacy anon key.
  const pub=(Array.isArray(keys)?keys:[]).find(k=>k&&(k.type==='publishable'))||(Array.isArray(keys)?keys:[]).find(k=>k&&k.name==='anon');
  if(!pub||!pub.api_key) throw new Error('Supabase did not return a public (anon) key for this project');
  if(/service_role|sb_secret_/i.test(String(pub.name)+String(pub.api_key))) throw new Error('Refusing to use a secret key in apps');
  const p=(st.projects||[]).find(x=>x.ref===ref)||{ref,name:ref};
  const next={...st,ref,projectName:p.name,region:p.region||'',url:'https://'+ref+'.supabase.co',anonKey:pub.api_key,label:p.name};
  setIntegrationState('supabase',next);
  try{await supabaseRefreshSchema();}catch(e){}
  return integrationState('supabase');
}
async function supabaseQuery(sql){
  const st=supabaseProject();if(!st) throw new Error('Choose a Supabase project in Settings → Integrations');
  return await integrationFetch('supabase','/v1/projects/'+encodeURIComponent(st.ref)+'/database/query',{method:'POST',body:{query:String(sql)},timeout:90000});
}
const SUPABASE_SCHEMA_SQL="select c.table_name, c.column_name, c.data_type, c.is_nullable, coalesce(t.rowsecurity,false) as rls from information_schema.columns c left join pg_tables t on t.schemaname=c.table_schema and t.tablename=c.table_name where c.table_schema='public' order by c.table_name, c.ordinal_position";
async function supabaseRefreshSchema(){
  const rows=await supabaseQuery(SUPABASE_SCHEMA_SQL);
  const tables={};
  (Array.isArray(rows)?rows:[]).forEach(r=>{const t=tables[r.table_name]=tables[r.table_name]||{rls:!!r.rls,cols:[]};t.cols.push(r.column_name+' '+r.data_type+(r.is_nullable==='YES'?'?':''));});
  const text=Object.entries(tables).map(([n,t])=>n+(t.rls?' [RLS on]':' [RLS OFF]')+': '+t.cols.join(', ')).join('\n');
  const st=integrationState('supabase');setIntegrationState('supabase',{...st,schema:text.slice(0,6000),tables:Object.keys(tables).length,schemaAt:Date.now()});
  return text;
}
function supabaseContextNote(){
  const st=supabaseProject();if(!st||st.useInCode===false) return '';
  return '\n\n[Supabase project "'+st.projectName+'" is connected to this app]\nURL: '+st.url+'\nPublic anon key: '+st.anonKey+'\n(The anon key is safe in browser code. Never use, print or ask for the service_role or secret key.)\nTables in the public schema'+(st.schema?':\n'+st.schema:': none yet')
    +'\nIn web pages use supabase-js v2: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> then const supabase = window.supabase.createClient(URL, KEY). Use supabase.auth for sign-in and Row Level Security policies to protect every table.'
    +' To create or change tables, policies or buckets, call the supabase_sql tool with the SQL (the user approves each run); if you cannot call tools, put the SQL in a ```sql block so the user can tap Run on Supabase.';
}
function codeContextNote(){return CODE_MODE_NOTE+(typeof kitaDesignNote==='function'?kitaDesignNote():'')+supabaseContextNote();}
/* SQL risk: reads, changes, and destructive changes (always shown in red). */
function sqlRisk(sql){
  const s=String(sql||'').replace(/--.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'').trim();
  if(/\b(drop|truncate|revoke)\b|\bdelete\s+from\b|\balter\s+table\b[\s\S]*?\bdrop\b|\bdisable\s+row\s+level\s+security\b/i.test(s)) return 'destructive';
  if(/^(select|with|explain|show|table)\b/i.test(s)&&!/\b(insert|update|delete|create|alter|grant|drop|truncate|comment|copy|call|do)\b/i.test(s)) return 'read';
  return 'write';
}
async function confirmSupabaseSql(sql,reason){
  const risk=sqlRisk(sql),st=supabaseProject();
  // Reads follow the permission mode; every change asks, also in Bypass all.
  if(risk==='read'&&permissionMode()!=='careful') return true;
  const shown=String(sql).length>900?String(sql).slice(0,900)+'\n…':String(sql);
  return !!await customDialog({title:risk==='destructive'?'Destructive database change':'Run SQL on Supabase',
    message:(reason?reason+'\n\n':'')+'Project: '+(st?.projectName||'?')+'\n\n'+shown+(risk==='destructive'?'\n\nThis can delete data and cannot be undone.':''),
    confirmText:risk==='read'?'Run':'Run on Supabase',danger:risk==='destructive'});
}
function supabaseToolDefs(){
  if(!supabaseInCode()||kitaMode()!=='code') return [];
  return [
    {type:'function',function:{name:'supabase_sql',description:'Run SQL on the connected Supabase project (Postgres). Use it to create tables, Row Level Security policies, functions and storage buckets, or to inspect data. The user approves every change.',parameters:{type:'object',properties:{query:{type:'string',description:'SQL to run'},purpose:{type:'string',description:'One short sentence explaining why'}},required:['query']}}},
    {type:'function',function:{name:'supabase_schema',description:'Get the current tables and columns of the connected Supabase project.',parameters:{type:'object',properties:{}}}},
  ];
}
async function runSupabaseTool(name,args){
  try{
    if(name==='supabase_schema') return {schema:await supabaseRefreshSchema()||'(no tables yet)'};
    if(name==='supabase_sql'){
      const rows=await supabaseQuery(String(args.query||''));
      if(sqlRisk(args.query)!=='read'){try{await supabaseRefreshSchema();}catch(e){}}
      const list=Array.isArray(rows)?rows:[];
      return {ok:true,rows:list.slice(0,50),rowCount:list.length};
    }
  }catch(e){return {error:String(e.message||e)};}
  return {error:'Unknown Supabase tool'};
}
/* "Run on Supabase" under SQL code blocks (models without tools, or SQL written by hand). */
function supabaseRunButton(sql,wrap){
  if(!supabaseProject()) return null;
  const b=el('button','copy-btn supabase-run','Run on Supabase');b.type='button';
  b.onclick=async()=>{
    if(!await confirmSupabaseSql(sql)) return;
    b.disabled=true;b.textContent='Running…';
    let note=wrap.parentElement?.querySelector(':scope > .supabase-result');
    try{
      const rows=await supabaseQuery(sql);
      if(sqlRisk(sql)!=='read'){try{await supabaseRefreshSchema();}catch(e){}}
      const n=Array.isArray(rows)?rows.length:0;
      if(!note){note=el('div','supabase-result');wrap.after(note);}
      note.className='supabase-result ok';note.textContent='✓ Ran on '+supabaseProject().projectName+(n?' · '+n+' row'+(n===1?'':'s')+': '+JSON.stringify(rows.slice(0,3)).slice(0,300):'');
      toast('SQL ran on Supabase');
    }catch(e){
      if(!note){note=el('div','supabase-result');wrap.after(note);}
      note.className='supabase-result warn';note.textContent='✕ '+String(e.message||e);
    }finally{b.disabled=false;b.textContent='Run on Supabase';}
  };
  return b;
}
