/* Project files (4.19.0).
   Builds stay one self-contained page while you work, so preview, edits and the agent team
   keep working with any model. For download and publishing, Code can lay the page out the
   way production sites are: index.html, css/styles.css and js/app.js (plus js/main.js for
   ES modules). Answers that already come as several files are previewed with their CSS and
   JS put back in, and every project can be downloaded as one .zip. */

/* "single": one index.html. "separate": index.html + css/ + js/. Read-only default. */
function projectLayout(){return db.codeFiles==='separate'?'separate':'single';}

function dedentBlock(text){
  const lines=String(text).replace(/\r\n?/g,'\n').replace(/^\s*\n/,'').replace(/\s+$/,'').split('\n');
  const pad=Math.min(...lines.filter(l=>l.trim()).map(l=>l.match(/^[ \t]*/)[0].length));
  return (Number.isFinite(pad)&&pad>0?lines.map(l=>l.slice(pad)):lines).join('\n');
}
function scriptKind(attrs){
  if(/\bsrc\s*=/i.test(attrs)) return 'external';
  const type=(attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)||[])[1]||'';
  if(!type||/^(text|application)\/(java|ecma)script$/i.test(type)) return 'classic';
  if(/^module$/i.test(type)) return 'module';
  return 'data'; // JSON, import maps, templates: they belong in the page
}
/* One page → production files. Pure and deterministic; a page with nothing inline is unchanged. */
function splitHtmlProject(html){
  html=String(html||'');
  const css=[],classic=[],modules=[];
  let page=html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,(m,attrs,body)=>{
    if(/\bmedia\s*=/i.test(attrs)&&!/\bmedia\s*=\s*["']?all/i.test(attrs)) return m; // print-only and similar stay inline
    const id=(attrs.match(/\bid\s*=\s*["']([^"']+)/i)||[])[1];
    if(body.trim()) css.push((id?'/* '+id+' */\n':'')+dedentBlock(body));
    return '<!--kita-css-->';
  });
  page=page.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(m,attrs,body)=>{
    const kind=scriptKind(attrs);
    if(kind==='external'||kind==='data'||!body.trim()) return m;
    (kind==='module'?modules:classic).push(dedentBlock(body));
    return '';
  });
  const files=[];
  if(css.length){
    let first=true;
    page=page.replace(/<!--kita-css-->/g,()=>{if(!first) return '';first=false;return '<link rel="stylesheet" href="css/styles.css">';});
    files.push({path:'css/styles.css',content:css.join('\n\n')+'\n'});
  }
  const tags=(classic.length?'<script src="js/app.js"></script>\n':'')+(modules.length?'<script type="module" src="js/main.js"></script>\n':'');
  if(tags) page=/<\/body>/i.test(page)?page.replace(/<\/body>(?![\s\S]*<\/body>)/i,tags+'</body>'):page+'\n'+tags;
  if(classic.length) files.push({path:'js/app.js',content:classic.join('\n\n;\n')+'\n'});
  if(modules.length) files.push({path:'js/main.js',content:modules.join('\n\n')+'\n'});
  page=page.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,'\n\n');
  return [{path:'index.html',content:page}].concat(files);
}

function projectPath(p){return String(p||'').trim().replace(/^\.?\//,'').replace(/^\/+/,'').replace(/\?.*$/,'').toLowerCase();}
/* Preview of a multi-file answer: put the answer's own CSS and JS files back into the page. */
function inlineProjectFiles(html,files){
  html=String(html||'');
  const byPath=new Map();
  for(const f of files||[]){const p=projectPath(f.name||f.path);if(p){byPath.set(p,f.raw!=null?f.raw:f.content);const base=p.split('/').pop();if(!byPath.has(base))byPath.set(base,f.raw!=null?f.raw:f.content);}}
  if(!byPath.size) return html;
  html=html.replace(/<link\b([^>]*?)\bhref\s*=\s*["']([^"']+)["']([^>]*)>/gi,(m,a,href,b)=>{
    if(!/\brel\s*=\s*["']?stylesheet/i.test(a+b)) return m;
    const body=byPath.get(projectPath(href));
    return body==null?m:'<style data-file="'+href.replace(/"/g,'')+'">\n'+String(body).replace(/<\/style/gi,'<\\/style')+'\n</style>';
  });
  html=html.replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi,(m,a,src,b)=>{
    const body=byPath.get(projectPath(src));
    if(body==null) return m;
    const module=/\btype\s*=\s*["']?module/i.test(a+b);
    return '<script'+(module?' type="module"':'')+' data-file="'+src.replace(/"/g,'')+'">\n'+String(body).replace(/<\/script/gi,'<\\/script')+'\n</script>';
  });
  return html;
}

/* Files to download or publish for an answer. Multi-file answers keep their own names (the
   page becomes index.html); a single page is split when the project layout is "separate". */
function projectFiles(info){
  const list=info.files&&info.files.length?info.files:[{name:info.name,raw:info.rawCode,lang:info.lang}];
  const page=list.find(f=>/^(html|htm|xhtml)$/.test(f.lang||'')&&/<(?:!doctype\s+html|html\b|body\b)/i.test(f.raw))||list.find(f=>/\.html?$/i.test(f.name));
  const icons=s=>typeof kitaInlineIcons==='function'?kitaInlineIcons(s):s;
  if(page&&list.length===1&&projectLayout()==='separate') return splitHtmlProject(icons(String(page.raw||'')));
  const files=[];
  for(const f of list){
    let path=String(f.name||'file.txt').replace(/^\/+/,'').replace(/\.\.+/g,'.');
    if(f===page) path='index.html';
    if(files.some(x=>x.path===path)) continue;
    const content=String(f.raw||'');
    files.push({path,content:/\.html?$/i.test(path)?icons(content):content});
  }
  return files;
}

/* ---------- .zip (stored, no compression: small text projects, no library needed) ---------- */
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function makeZip(files,date=new Date()){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0;
  const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
  const day=((Math.max(1980,date.getFullYear())-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
  for(const f of files){
    const name=enc.encode(String(f.path).replace(/^\/+/,'')),data=typeof f.content==='string'?enc.encode(f.content):f.content,crc=crc32(data);
    const local=new DataView(new ArrayBuffer(30));
    [[0,0x04034b50,4],[4,20,2],[6,0x0800,2],[8,0,2],[10,time,2],[12,day,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length,2],[28,0,2]]
      .forEach(([o,v,n])=>n===4?local.setUint32(o,v,true):local.setUint16(o,v,true));
    const cen=new DataView(new ArrayBuffer(46));
    [[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x0800,2],[10,0,2],[12,time,2],[14,day,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length,2],[30,0,2],[32,0,2],[34,0,2],[36,0,2],[38,0,4],[42,offset,4]]
      .forEach(([o,v,n])=>n===4?cen.setUint32(o,v,true):cen.setUint16(o,v,true));
    parts.push(new Uint8Array(local.buffer),name,data);central.push(new Uint8Array(cen.buffer),name);
    offset+=30+name.length+data.length;
  }
  const cdSize=central.reduce((n,p)=>n+p.length,0);
  const end=new DataView(new ArrayBuffer(22));
  [[0,0x06054b50,4],[4,0,2],[6,0,2],[8,files.length,2],[10,files.length,2],[12,cdSize,4],[16,offset,4],[20,0,2]]
    .forEach(([o,v,n])=>n===4?end.setUint32(o,v,true):end.setUint16(o,v,true));
  const all=parts.concat(central,[new Uint8Array(end.buffer)]),out=new Uint8Array(all.reduce((n,p)=>n+p.length,0));
  let at=0;for(const p of all){out.set(p,at);at+=p.length;}
  return out;
}
function bytesToBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s);}
function saveBinaryFile(name,bytes,mime,savedMessage){
  if(typeof window.NazFiles==='object'&&typeof window.NazFiles.saveBase64==='function'){
    window.nazFileSaved=(ok,savedName,error)=>{if(ok)toast((savedMessage||'Saved')+' · '+savedName);else if(error!=='cancelled')toast('Not saved: '+error);};
    try{if(window.NazFiles.saveBase64(name,mime,bytesToBase64(bytes)))return true;}catch(e){}
    toast('This file is too large to save');return false;
  }
  if(typeof window.NazFiles==='object'){toast('Update Kita Chat to save .zip files');return false;}
  try{
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:mime}));a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    toast((savedMessage||'Downloaded')+' · '+name);return true;
  }catch(e){toast('Could not save this file');return false;}
}
function projectSlug(title){return String(title||'kita-project').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/[\s_]+/g,'-').replace(/-+/g,'-').slice(0,40)||'kita-project';}
function downloadProjectZip(info,title){
  const files=projectFiles(info);
  return saveBinaryFile(projectSlug(title)+'.zip',makeZip(files),'application/zip','Project saved ('+files.length+' file'+(files.length===1?'':'s')+')');
}

/* Code home: how pages are laid out for download and publishing. */
function renderCodeFilesPicker(){
  const row=el('label','code-style');
  const text=el('span','code-style-text');
  const sub=()=>projectLayout()==='separate'?'index.html, css/styles.css, js/app.js':'One index.html with CSS and JS inside';
  text.innerHTML='<strong>Files</strong><small>'+esc(sub())+'</small>';
  const sel=el('select');sel.setAttribute('aria-label','How pages are saved and published');
  [['single','One file','Simplest to share and preview'],['separate','Separate files','Production layout: HTML, CSS and JS apart']].forEach(([v,n,d])=>{const o=el('option');o.value=v;o.textContent=n;o.dataset.sub=d;sel.appendChild(o);});
  sel.value=projectLayout();
  sel.onchange=()=>{db.codeFiles=sel.value;save();text.querySelector('small').textContent=sub();};
  row.append(text,sel);
  return row;
}
