/* Project workspace (4.21.0): small edits instead of rewriting whole files.
   In Code, a follow-up on an existing page gives the model file tools for the project:
   list_files, read_file (line ranges), edit_file (exact old → new text) and write_file.
   No shell, no network: the tools only touch the project's own files, in memory.
   - The project is read from the latest built answer in the chat (one page, the files of a
     multi-file answer, or the page split into css/ and js/ when Code uses separate files).
   - The model sends only the changes, so long projects are edited quickly and cheaply, and
     an answer can no longer stop halfway through a 3000-line file.
   - When it finishes, Kita appends every project file to the answer, so the result is a
     normal artifact: preview, page test, download and publish work as before. */

const WORKSPACE_MARK = 'Project files after this change:';
const WORKSPACE_TOOL_NAMES = ['list_files','read_file','edit_file','write_file'];
const WORKSPACE_READ_LINES = 250, WORKSPACE_RESULT_CHARS = 24000, WORKSPACE_MAX_ROUNDS = 16;

const WORKSPACE_TOOLS = [
  {type:'function', function:{name:'list_files', description:'List the files of the project being edited, with their line counts.', parameters:{type:'object', properties:{}}}},
  {type:'function', function:{name:'read_file', description:'Read part of a project file with line numbers. Read only the lines you need (at most '+WORKSPACE_READ_LINES+' per call).', parameters:{type:'object', properties:{path:{type:'string'}, start_line:{type:'integer', description:'First line, 1-based'}, end_line:{type:'integer', description:'Last line, inclusive'}}, required:['path']}}},
  {type:'function', function:{name:'edit_file', description:'Replace an exact piece of text in a project file. old_string must match the file exactly, including spaces, and appear once (add surrounding lines to make it unique) unless replace_all is true. Copy it from read_file output without the line numbers.', parameters:{type:'object', properties:{path:{type:'string'}, old_string:{type:'string'}, new_string:{type:'string'}, replace_all:{type:'boolean'}}, required:['path','old_string','new_string']}}},
  {type:'function', function:{name:'write_file', description:'Create a new project file, or replace a whole file when most of it changes. Prefer edit_file for changes to existing files.', parameters:{type:'object', properties:{path:{type:'string'}, content:{type:'string'}}, required:['path','content']}}}
];
function isWorkspaceTool(name){ return WORKSPACE_TOOL_NAMES.includes(name); }

function fenceLangFor(path){
  const ext=(String(path).split('.').pop()||'').toLowerCase();
  return {htm:'html',html:'html',css:'css',js:'js',mjs:'js',json:'json',md:'markdown',svg:'svg',txt:'text',xml:'xml'}[ext]||ext||'text';
}
/* Named code blocks of an answer: ```lang name ... ``` (also longer fences). */
function namedFences(content){
  const out=[];
  const re=/(^|\n)(`{3,})[ \t]*([\w+#.-]*)[ \t]+([^\s`]+)[^\n]*\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/g;
  let m; while((m=re.exec(String(content||'')))) out.push({lang:m[3].toLowerCase(), name:m[4].replace(/^\.?\//,''), raw:m[5]});
  return out;
}
function cleanPath(p){
  const path=String(p||'').trim().replace(/\\/g,'/').replace(/^\.?\//,'').replace(/^\/+/,'');
  if(!path || path.split('/').some(s=>s==='..'||s==='') || path.length>120) return '';
  return path;
}

/* The project of the latest built answer, or null when there is none. */
function workspaceFrom(conversation){
  const msgs=conversation?.messages||[];
  for(let i=msgs.length-1;i>=0;i--){
    const m=msgs[i];
    if(m.role!=='assistant'||!m.content) continue;
    const named=namedFences(m.content).filter(f=>cleanPath(f.name));
    const page=named.find(f=>/\.html?$/i.test(f.name)&&/<(?:!doctype\s+html|html\b|body\b)/i.test(f.raw));
    if(page && named.length>1){
      const files=new Map();
      for(const f of named){ const p=f===page?'index.html':cleanPath(f.name); if(!files.has(p)) files.set(p,f.raw); }
      return {files, sourceId:m.id};
    }
    const html=typeof extractHtmlBlock==='function'?extractHtmlBlock(m.content):'';
    if(html && html.length>40){
      const list=typeof projectLayout==='function'&&projectLayout()==='separate'&&typeof splitHtmlProject==='function'
        ? splitHtmlProject(html) : [{path:'index.html', content:html}];
      return {files:new Map(list.map(f=>[f.path,f.content])), sourceId:m.id};
    }
  }
  return null;
}

function lineCount(text){ return String(text).split('\n').length; }
function numberedLines(text, start, end){
  const lines=String(text).split('\n');
  const s=Math.max(1, Math.floor(Number(start)||1)), e=Math.min(lines.length, Math.floor(Number(end)||lines.length), s+WORKSPACE_READ_LINES-1);
  const width=String(e).length;
  return {from:s, to:e, total:lines.length, text:lines.slice(s-1,e).map((l,i)=>String(s+i).padStart(width,' ')+'| '+l).join('\n')};
}
function countOccurrences(hay, needle){ if(!needle) return 0; let n=0,i=0; while((i=hay.indexOf(needle,i))!==-1){ n++; i+=needle.length; } return n; }
/* Same text with line endings unified and trailing spaces removed, for a forgiving match. */
function looseText(t){ return String(t).replace(/\r\n?/g,'\n').split('\n').map(l=>l.replace(/[ \t]+$/,'')).join('\n'); }

/* Runs one workspace tool on ws.files (a Map). Records changed paths in ws.changed. */
function runWorkspaceTool(ws, name, args){
  ws.changed=ws.changed||new Set();
  const files=ws.files;
  if(name==='list_files') return {files:[...files].map(([path,c])=>({path, lines:lineCount(c), bytes:new TextEncoder().encode(c).length}))};
  const path=cleanPath(args.path);
  if(!path) return {error:'Give a relative file path such as index.html or css/styles.css.'};
  if(name==='write_file'){
    if(typeof args.content!=='string') return {error:'content must be the full text of the file.'};
    const existed=files.has(path); files.set(path,args.content); ws.changed.add(path);
    return {ok:true, path, created:!existed, lines:lineCount(args.content)};
  }
  if(!files.has(path)) return {error:'No file '+path+'. Files: '+[...files.keys()].join(', ')};
  const text=files.get(path);
  if(name==='read_file'){ const r=numberedLines(text,args.start_line,args.end_line); return {path, lines:r.from+'-'+r.to+' of '+r.total, content:r.text}; }
  if(name==='edit_file'){
    const oldS=String(args.old_string??''), newS=String(args.new_string??'');
    if(!oldS) return {error:'old_string is empty. Copy the exact text to replace from read_file.'};
    if(oldS===newS) return {error:'old_string and new_string are the same; nothing to change.'};
    let base=text, find=oldS, n=countOccurrences(base,find);
    if(!n){ base=looseText(text); find=looseText(oldS); n=countOccurrences(base,find); }
    if(!n) return {error:'old_string was not found in '+path+'. Read the lines again and copy them exactly (without the line numbers).'};
    if(n>1 && !args.replace_all) return {error:'old_string appears '+n+' times in '+path+'. Include more surrounding lines so it is unique, or set replace_all.'};
    const at=base.indexOf(find);
    const next=args.replace_all ? base.split(find).join(newS) : base.slice(0,at)+newS+base.slice(at+find.length);
    files.set(path,next); ws.changed.add(path);
    const line=base.slice(0,at).split('\n').length;
    const around=numberedLines(next, Math.max(1,line-2), line+lineCount(newS)+1);
    return {ok:true, path, replaced:args.replace_all?n:1, at_line:line, now:around.text};
  }
  return {error:'Unknown tool '+name};
}

function workspaceToolLabel(name, args){
  const p=cleanPath(args?.path)||'';
  if(name==='list_files') return 'List project files';
  if(name==='read_file') return 'Read '+p+(args?.start_line?' '+args.start_line+'-'+(args.end_line||''):'');
  if(name==='edit_file') return 'Edit '+p;
  if(name==='write_file') return 'Write '+p;
  return name;
}
function workspaceSystemNote(ws){
  const list=[...ws.files].map(([p,c])=>'- '+p+' ('+lineCount(c)+' lines)').join('\n');
  return '[Project workspace]\nYou are changing an existing project. Its files:\n'+list+'\n\n'
    +'Work like this: read only the parts you need with read_file (line ranges), then change them with edit_file, copying old_string exactly from what you read (without line numbers) and adding nearby lines if it is not unique. '
    +'Use write_file only for a new file or when most of a file changes. Do not paste whole files in your reply: Kita shows the updated files automatically. '
    +'Keep the existing structure, style and working features. When you are done, reply with a short summary of what you changed, in the user\'s language.';
}
/* Assistant answers in history lose their code blocks (the model reads files instead). */
function stripCodeForWorkspace(content){
  const s=String(content||'').split(WORKSPACE_MARK)[0];
  return s.replace(/(^|\n)(`{3,})[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g,'$1[code omitted: the current files are in the project workspace]');
}
/* Appends the project files to the answer as named code blocks (a normal artifact). */
function workspaceFilesBlock(ws){
  const ordered=[...ws.files.keys()].sort((a,b)=>(a==='index.html'?-1:b==='index.html'?1:a.localeCompare(b)));
  return '\n\n'+WORKSPACE_MARK+'\n'+ordered.map(p=>{
    const body=ws.files.get(p), longest=Math.max(2,...(String(body).match(/`+/g)||['']).map(s=>s.length));
    const fence='`'.repeat(longest+1);
    return fence+fenceLangFor(p)+' '+p+'\n'+body.replace(/\n$/,'')+'\n'+fence;
  }).join('\n\n');
}
/* The project as one page, for the automatic page test. */
function workspacePreviewDoc(ws){
  const page=ws.files.get('index.html')||[...ws.files.values()].find(c=>/<html|<body/i.test(c))||'';
  const files=[...ws.files].map(([path,raw])=>({name:path,raw}));
  return typeof inlineProjectFiles==='function'?inlineProjectFiles(page,files):page;
}
