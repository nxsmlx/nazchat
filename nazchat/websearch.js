/* Kita web search and DNS settings (4.13.0).
   Search order: model search (OpenAI / Anthropic, if on) → search APIs with your keys
   (several keys per service, used in turn) → the built-in DuckDuckGo search.
   Keys live in Android Keystore ("search:<service>") and native code sends each one
   only to that service's API host. DNS-over-HTTPS is applied natively (NazDns). */
'use strict';

const SEARCH_PROVIDERS=[
  {id:'brave',name:'Brave Search API',keysUrl:'https://api-dashboard.search.brave.com/app/keys',header:'X-Subscription-Token',prefix:''},
  {id:'tavily',name:'Tavily',keysUrl:'https://app.tavily.com/home',header:'Authorization',prefix:'Bearer '},
  {id:'search1api',name:'Search1API',keysUrl:'https://www.search1api.com/',header:'Authorization',prefix:'Bearer '},
  {id:'exa',name:'Exa',keysUrl:'https://dashboard.exa.ai/api-keys',header:'x-api-key',prefix:''},
  {id:'serper',name:'Serper (Google results)',keysUrl:'https://serper.dev/api-key',header:'X-API-KEY',prefix:''},
];
const searchMemoryKeys={};
function webSettings(){const w=db.webSearch&&typeof db.webSearch==='object'?db.webSearch:{};return {keys:w.keys||{},turn:w.turn||{},openai:w.openai||{},anthropic:w.anthropic||{},dns:w.dns||{mode:'system',custom:''}};}
function setWebSettings(patch){const cur=db.webSearch&&typeof db.webSearch==='object'?db.webSearch:{};db.webSearch={...cur,...patch};save();}
function searchKeyCount(id){return Number(webSettings().keys[id]?.count||0);}
function saveSearchKeys(id,text){
  const keys=String(text||'').split(/[\r\n,]+/).map(s=>s.trim()).filter(Boolean).slice(0,20);
  if(!keys.length) throw new Error('Paste at least one key');
  if(hasNativeSecrets()){ if(!window.NazSecrets.put('search:'+id,keys.join('\n'))) throw new Error('Could not store the keys on this device'); }
  else searchMemoryKeys[id]=keys;
  const w=webSettings();setWebSettings({keys:{...w.keys,[id]:{count:keys.length,hints:keys.map(k=>k.slice(-4))}},turn:{...w.turn,[id]:0}});
  return keys.length;
}
function removeSearchKeys(id){
  try{ if(hasNativeSecrets()) window.NazSecrets.remove('search:'+id); }catch(e){}
  delete searchMemoryKeys[id];
  const w=webSettings(),keys={...w.keys};delete keys[id];setWebSettings({keys});
}
/* One request with key number i. Native attaches the key; the browser build adds it here. */
async function searchRequest(p,i,url,opts={}){
  const headers={Accept:'application/json',...(opts.headers||{})};
  let body=opts.body;if(body!==undefined&&typeof body!=='string'){body=JSON.stringify(body);headers['Content-Type']='application/json';}
  const req={method:opts.method||'GET',headers,timeout:15000};if(body)req.body=body;
  if(hasNativeSecrets()) req.secretRef='search:'+p.id+'#'+i;
  else{const k=searchMemoryKeys[p.id]?.[i];if(k)headers[p.header]=p.prefix+k;}
  if(opts.signal) req.signal=opts.signal;
  const res=await netFetch(url,req);const raw=await res.text();let data=null;try{data=JSON.parse(raw);}catch(e){}
  if(!res.ok){const err=new Error(p.name+' '+res.status+': '+String(data?.message||data?.error?.message||data?.error||data?.detail||raw).slice(0,160));err.status=res.status;throw err;}
  return data||{};
}
const SEARCH_CALLS={
  brave:async(p,i,q,s)=>((await searchRequest(p,i,'https://api.search.brave.com/res/v1/web/search?count=8&q='+encodeURIComponent(q),{signal:s})).web?.results||[]).map(r=>({title:r.title,url:r.url,snippet:[r.description,...(r.extra_snippets||[])].filter(Boolean).join(' ').replace(/<[^>]+>/g,'')})),
  tavily:async(p,i,q,s)=>((await searchRequest(p,i,'https://api.tavily.com/search',{method:'POST',body:{query:q,max_results:6,search_depth:'basic'},signal:s})).results||[]).map(r=>({title:r.title,url:r.url,snippet:r.content||'',content:r.raw_content||''})),
  search1api:async(p,i,q,s)=>((await searchRequest(p,i,'https://api.search1api.com/search',{method:'POST',body:{query:q,search_service:'google',max_results:6},signal:s})).results||[]).map(r=>({title:r.title,url:r.link||r.url,snippet:r.snippet||r.content||''})),
  exa:async(p,i,q,s)=>((await searchRequest(p,i,'https://api.exa.ai/search',{method:'POST',body:{query:q,numResults:6,contents:{text:{maxCharacters:1500}}},signal:s})).results||[]).map(r=>({title:r.title||r.url,url:r.url,snippet:(r.text||'').slice(0,400),content:r.text||''})),
  serper:async(p,i,q,s)=>((await searchRequest(p,i,'https://google.serper.dev/search',{method:'POST',body:{q,num:8},signal:s})).organic||[]).map(r=>({title:r.title,url:r.link,snippet:r.snippet||''})),
};
/* Tries each key of a service in turn (starting after the last one used). A key that is
   refused, out of credit or rate limited hands over to the next. */
async function searchWithKeys(p,q,signal){
  const n=searchKeyCount(p.id);if(!n) return null;
  const w=webSettings();let start=Number(w.turn[p.id]||0)%n,lastErr=null;
  for(let k=0;k<n;k++){
    const i=(start+k)%n;
    try{
      const rows=(await SEARCH_CALLS[p.id](p,i,q,signal)).filter(r=>r&&r.url);
      setWebSettings({turn:{...webSettings().turn,[p.id]:(i+1)%n}});
      return rows;
    }catch(e){ if(e.name==='AbortError') throw e; lastErr=e; if(!(e.status===401||e.status===402||e.status===403||e.status===429)) break; }
  }
  if(lastErr) console.warn(lastErr.message);
  return null;
}
/* Search through a chat provider's own web search tool. */
function providerBase(p){return p&&p.endpointMode!=='full'?String(p.baseUrl||'').replace(/\/+$/,''):'';}
async function modelSearch(kind,q,signal){
  const cfg=webSettings()[kind];if(!cfg.on) return null;
  const p=db.providers.find(x=>x.id===cfg.providerId);const base=providerBase(p);const model=String(cfg.model||'').trim();
  if(!p||!base||!model) return null;
  prepareProviderSecret(p);
  const ask='Search the web for: '+q+'\nAnswer in a few sentences and cite your sources.';
  const headers={...buildHeaders(p),'Content-Type':'application/json'};
  let url,body;
  if(kind==='openai'){url=base+'/responses';body={model,input:ask,tools:[{type:'web_search'}]};}
  else{url=base+'/messages';headers['anthropic-version']='2023-06-01';body={model,max_tokens:1024,messages:[{role:'user',content:ask}],tools:[{type:'web_search_20250305',name:'web_search',max_uses:3}]};}
  const res=await netFetch(url,{method:'POST',headers,body:JSON.stringify(body),secretRef:p.secretRef,timeout:60000,signal});
  if(!res.ok){console.warn((kind==='openai'?'OpenAI':'Anthropic')+' search '+res.status);return null;}
  const data=await res.json().catch(()=>null);if(!data) return null;
  const rows=[],seen=new Set(),add=(url,title,snippet)=>{if(!url||seen.has(url))return;seen.add(url);rows.push({title:title||url,url,snippet:snippet||''});};
  let text='';
  if(kind==='openai'){
    for(const item of data.output||[]) for(const c of item.content||[]){ if(c.type==='output_text'){text+=c.text||'';for(const a of c.annotations||[]) if(a.type==='url_citation') add(a.url,a.title,String(c.text||'').slice(a.start_index||0,a.end_index||0));} }
  }else{
    for(const c of data.content||[]){
      if(c.type==='web_search_tool_result') for(const r of Array.isArray(c.content)?c.content:[]) if(r.type==='web_search_result') add(r.url,r.title,'');
      if(c.type==='text'){text+=c.text||'';for(const ct of c.citations||[]) if(ct.url){ if(seen.has(ct.url)){const row=rows.find(x=>x.url===ct.url);if(row&&!row.snippet)row.snippet=ct.cited_text||'';} else add(ct.url,ct.title,ct.cited_text);} }
    }
  }
  if(!rows.length) return null;
  rows[0].content=text.trim().slice(0,3000);
  return rows;
}
/* The search every feature uses (tools, pre-search, agents). */
async function webSearch(query,opts){
  opts=opts||{};const q=String(query||'').slice(0,300);
  for(const kind of ['openai','anthropic']){
    try{const rows=await modelSearch(kind,q,opts.signal);if(rows&&rows.length) return rows.slice(0,6);}catch(e){if(e.name==='AbortError')throw e;}
  }
  for(const p of SEARCH_PROVIDERS){
    try{const rows=await searchWithKeys(p,q,opts.signal);if(rows&&rows.length) return rows.slice(0,6);}catch(e){if(e.name==='AbortError')throw e;}
  }
  return webSearchBuiltIn(query,opts);
}

/* ---------- DNS ---------- */
const DNS_MODES=[
  {id:'cloudflare',name:'Cloudflare',sub:'1.1.1.1 · over HTTPS · recommended'},
  {id:'google',name:'Google',sub:'8.8.8.8 · over HTTPS'},
  {id:'custom',name:'Custom DoH',sub:'Any JSON DNS-over-HTTPS endpoint'},
  {id:'system',name:'System',sub:'Whatever the phone and network use'},
];
function hasNazDns(){return typeof window.NazDns==='object'&&typeof window.NazDns.setMode==='function';}
function applyDnsSetting(){
  const d=webSettings().dns;
  if(hasNazDns()){try{window.NazDns.setMode(d.mode||'system',d.custom||'');}catch(e){}}
}
function setDnsMode(mode,custom){
  if(mode==='custom'&&!/^https:\/\/[^\s/@]+\//i.test(String(custom||'')+'/')) throw new Error('Enter an https:// DNS-over-HTTPS address');
  if(hasNazDns()&&!window.NazDns.setMode(mode,custom||'')) throw new Error('This DNS setting was refused');
  setWebSettings({dns:{mode,custom:custom||''}});
}

/* ---------- Settings → Web & DNS ---------- */
function webDnsSummary(){const w=webSettings(),dns=DNS_MODES.find(m=>m.id===(w.dns.mode||'system'))?.name||'System';const keys=SEARCH_PROVIDERS.filter(p=>searchKeyCount(p.id)).length;return 'DNS: '+dns+' · '+(keys?keys+' search API'+(keys===1?'':'s'):'built-in search')+((w.openai.on||w.anthropic.on)?' · model search':'');}
let dnsCustomOpen=false;
function renderWebDnsSettings(){
  renderSettingsPage('Web & DNS','',null,list=>{
    const w=webSettings();
    list.appendChild(el('p','studio-section-title','DNS'));
    list.appendChild(el('div','hint','Some networks answer DNS with a block page. DNS-over-HTTPS sends lookups encrypted, so models, search, MCP, integrations and updates reach the real servers. Certificates are still checked against the real site names.'));
    const group=el('div','dns-modes');group.setAttribute('role','radiogroup');group.setAttribute('aria-label','DNS');
    for(const m of DNS_MODES){
      const on=(w.dns.mode||'system')===m.id,b=el('button','dns-mode'+(on?' on':''));b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(on));b.dataset.mode=m.id;
      b.innerHTML='<span><strong>'+esc(m.name)+'</strong><small>'+esc(m.sub)+'</small></span><span class="dns-check" aria-hidden="true"></span>';
      b.onclick=()=>{
        // Custom needs an address first: show the field, switch once it is saved.
        if(m.id==='custom'&&!w.dns.custom){dnsCustomOpen=true;renderWebDnsSettings();document.querySelector('#dnsCustom')?.focus();return;}
        dnsCustomOpen=m.id==='custom';
        try{setDnsMode(m.id,w.dns.custom);toast('DNS: '+m.name);}catch(e){toast(e.message);}
        renderWebDnsSettings();
      };
      group.appendChild(b);
    }
    list.appendChild(group);
    if(w.dns.mode==='custom'||dnsCustomOpen){
      const row=el('div','dns-custom');const inp=el('input');inp.id='dnsCustom';inp.type='url';inp.placeholder='https://dns.example/dns-query';inp.value=w.dns.custom||'';inp.setAttribute('aria-label','Custom DoH address');
      const save=el('button','mini-btn','Use');save.type='button';save.onclick=()=>{try{setDnsMode('custom',inp.value.trim());dnsCustomOpen=false;toast('Custom DNS saved');}catch(e){toast(e.message);}renderWebDnsSettings();};
      row.append(inp,save);list.appendChild(row);
    }
    const testRow=el('div','toolbar-row');
    const test=el('button','mini-btn','Test lookup');test.type='button';
    test.onclick=()=>{if(!hasNazDns()){toast('DNS settings apply in the installed app');return;}test.disabled=true;setTimeout(()=>{try{toast('api.openai.com → '+window.NazDns.test('api.openai.com'));}catch(e){toast(e.message);}test.disabled=false;},10);};
    testRow.appendChild(test);list.appendChild(testRow);
    list.appendChild(el('div','hint','Applies to every request the app makes natively. Pages shown in Preview use the phone\'s DNS.'));
    if(!hasNazDns()) list.appendChild(el('div','hint','DNS settings take effect in the installed app.'));

    list.appendChild(el('p','studio-section-title','Web search'));
    const built=el('div','search-card builtin');built.innerHTML='<strong>Built in, no key needed</strong><small>Kita tries model search first if you turn it on, then your search API keys, then DuckDuckGo.</small>';list.appendChild(built);
    // Model search
    const providers=(db.providers||[]).filter(p=>p.endpointMode!=='full');
    for(const [kind,label,sub] of [['openai','OpenAI search','Responses API web search · GPT models · uses the provider\'s saved key'],['anthropic','Anthropic search','Messages API web search · Claude models · uses the provider\'s saved key']]){
      const cfg=w[kind],card=el('div','search-card model');card.dataset.kind=kind;
      const head=el('div','tools-row');head.innerHTML='<span><strong>'+esc(label)+'</strong><small>'+esc(sub)+'</small></span>';
      const sw=el('button','switch'+(cfg.on?' on':''));sw.type='button';sw.setAttribute('role','switch');sw.setAttribute('aria-checked',String(!!cfg.on));sw.setAttribute('aria-label',label);
      sw.onclick=()=>{setWebSettings({[kind]:{...webSettings()[kind],on:!cfg.on}});renderWebDnsSettings();};head.appendChild(sw);card.appendChild(head);
      if(cfg.on){
        const sel=el('select');sel.setAttribute('aria-label',label+' provider');sel.innerHTML='<option value="">Choose a provider…</option>'+providers.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===cfg.providerId?' selected':'')+'>'+esc(p.name)+'</option>').join('');
        sel.onchange=()=>setWebSettings({[kind]:{...webSettings()[kind],providerId:sel.value}});
        const model=el('input');model.placeholder=kind==='openai'?'gpt-5.6-luna':'claude-haiku-5.5';model.value=cfg.model||'';model.setAttribute('aria-label',label+' model');
        model.onchange=()=>setWebSettings({[kind]:{...webSettings()[kind],model:model.value.trim()}});
        card.append(sel,model);
      }
      list.appendChild(card);
    }
    list.appendChild(el('div','hint','Optional API keys give faster, more reliable results. Add several to use them in turn.'));
    for(const p of SEARCH_PROVIDERS){
      const n=searchKeyCount(p.id),card=el('div','search-card'+(n?' on':''));card.dataset.provider=p.id;
      card.innerHTML='<div class="search-head"><strong>'+esc(p.name)+'</strong><a href="'+esc(p.keysUrl)+'" target="_blank" rel="noopener" aria-label="Get '+esc(p.name)+' keys">Get keys ↗</a></div>';
      if(n){const hints=(w.keys[p.id]?.hints||[]).map(h=>'…'+h).join(', ');card.appendChild(el('small','search-saved',esc(n+' key'+(n===1?'':'s')+' saved · '+hints)));}
      const ta=el('textarea');ta.rows=2;ta.placeholder='API keys, one per line';ta.setAttribute('aria-label',p.name+' keys');ta.autocomplete='off';ta.spellcheck=false;card.appendChild(ta);
      const row=el('div','toolbar-row');
      const saveB=el('button','mini-btn',n?'Replace keys':'Save');saveB.type='button';saveB.onclick=()=>{try{const c=saveSearchKeys(p.id,ta.value);ta.value='';toast(c+' '+p.name+' key'+(c===1?'':'s')+' saved');renderWebDnsSettings();}catch(e){toast(e.message);}};
      row.appendChild(saveB);
      if(n){const rm=el('button','mini-btn danger','Remove');rm.type='button';rm.onclick=()=>{removeSearchKeys(p.id);renderWebDnsSettings();};row.appendChild(rm);}
      card.appendChild(row);list.appendChild(card);
    }
  });
}
