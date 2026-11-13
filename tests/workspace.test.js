const assert=require('node:assert/strict');const {launch,appUrl}=require('./browser');
/* 4.21.0 workspace: Code follow-ups edit project files with read/edit/write tools instead of
   rewriting the whole page; the request carries no full file, edits are exact, runtime
   errors come back for a small fix, and the result is a normal artifact. */
const API='https://api.test/v1/chat/completions';
const PAGE='<!doctype html>\n<html><head><title>Kopi</title>\n<style>\nh1{color:#222}\n</style></head>\n<body>\n<h1>Hello coffee</h1>\n<p>'+'Menu line. '.repeat(400)+'</p>\n<script>\ndocument.title="Kopi";\n</script>\n</body></html>';
const seed={schemaVersion:3,onboardingDone:true,search:false,uiMode:'code',agentTeam:{designer:false,review:false},providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['m'],modelMeta:{m:{context_length:128000}}}],
  conversations:[{id:'c1',title:'Kopi',mode:'code',messages:[{id:'u1',role:'user',content:'Buat landing page kedai kopi',timestamp:1},{id:'a1',role:'assistant',content:'Here is the page.\n\n```html\n'+PAGE+'\n```',timestamp:2}],createdAt:1,updatedAt:2}],projects:[],lastProviderId:'p',lastModelId:'m'};
const enc=x=>'data: '+JSON.stringify(x)+'\n\n';
const call=(name,args,id)=>enc({choices:[{delta:{tool_calls:[{index:0,id,type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]})+enc({choices:[{delta:{},finish_reason:'tool_calls'}]})+'data: [DONE]\n\n';
const say=t=>enc({choices:[{delta:{content:t},finish_reason:'stop'}]})+'data: [DONE]\n\n';
(async()=>{const b=await launch();try{
const page=await b.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://raw.githubusercontent.com/**',r=>r.abort());await page.route('https://api.github.com/**',r=>r.abort());
await page.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}},seed);
await page.goto(appUrl);await page.waitForFunction(()=>typeof send==='function');

// 1. Tools on their own: read ranges, exact edits, ambiguity, loose whitespace, write, paths.
const unit=await page.evaluate(p=>{const ws={files:new Map([['index.html',p],['css/styles.css','a{color:red}  \r\nb{}\n']])};
  return {list:runWorkspaceTool(ws,'list_files',{}),read:runWorkspaceTool(ws,'read_file',{path:'index.html',start_line:6,end_line:7}),
    edit:runWorkspaceTool(ws,'edit_file',{path:'index.html',old_string:'<h1>Hello coffee</h1>',new_string:'<h1>Kopi Kita</h1>'}),
    twice:runWorkspaceTool(ws,'edit_file',{path:'index.html',old_string:'Menu line.',new_string:'X'}),
    missing:runWorkspaceTool(ws,'edit_file',{path:'index.html',old_string:'<h2>nope</h2>',new_string:'x'}),
    loose:runWorkspaceTool(ws,'edit_file',{path:'css/styles.css',old_string:'a{color:red}\nb{}',new_string:'a{color:green}\nb{}'}),
    write:runWorkspaceTool(ws,'write_file',{path:'js/extra.js',content:'console.log(1)'}),
    bad:runWorkspaceTool(ws,'read_file',{path:'../secret'}),
    css:ws.files.get('css/styles.css'),changed:[...ws.changed]};},PAGE);
assert.deepEqual(unit.list.files.map(f=>f.path),['index.html','css/styles.css']);
assert.equal(unit.read.lines,'6-7 of 12');assert.match(unit.read.content,/^6\| <body>\n7\| <h1>Hello coffee<\/h1>$/);
assert.equal(unit.edit.ok,true);assert.equal(unit.edit.at_line,7);assert.match(unit.edit.now,/Kopi Kita/);
assert.match(unit.twice.error,/appears 400 times/);assert.match(unit.missing.error,/not found/);
assert.equal(unit.loose.ok,true);assert.equal(unit.css,'a{color:green}\nb{}\n');
assert.equal(unit.write.created,true);assert.match(unit.bad.error,/relative file path/);
assert.deepEqual(unit.changed.sort(),['css/styles.css','index.html','js/extra.js']);
console.log('PASS workspace tools: ranged reads, exact and loose edits, ambiguity and path checks');

// 2. Full follow-up in Code: read → edit → page test finds an error → fix → summary.
const bodies=[];let step=0;
await page.route(API,async r=>{const body=JSON.parse(r.request().postData());bodies.push(body);step++;
  const replies=[call('read_file',{path:'index.html',start_line:1,end_line:12},'r1'),
    call('edit_file',{path:'index.html',old_string:'<h1>Hello coffee</h1>',new_string:'<h1>Kopi Kita</h1>\n<button onclick="order()">Order</button>'},'e1'),
    say('Tukar tajuk dan tambah butang Order.'),
    call('edit_file',{path:'index.html',old_string:'document.title="Kopi";',new_string:'document.title="Kopi";\nfunction order(){}'},'e2'),
    say('Tajuk ditukar, butang Order ditambah dan fungsi order() dibetulkan.')];
  return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:replies[Math.min(step,replies.length)-1]});});
await page.evaluate(()=>{let n=0;window.__checked=[];checkHtmlRuns=async doc=>{window.__checked.push(doc);return n++===0?['ReferenceError: order is not defined']:[];};conv=db.conversations[0];renderAll();});
await page.fill('#promptInput','Tukar tajuk jadi Kopi Kita dan tambah butang Order');await page.click('#sendBtn');
await page.waitForFunction(()=>!generating,null,{timeout:30000});
// The first request offers the file tools, explains the workspace, and carries no full page.
const first=bodies[0];
assert.deepEqual(first.tools.map(t=>t.function.name).filter(n=>/_file|list_files/.test(n)),['list_files','read_file','edit_file','write_file']);
assert.match(JSON.stringify(first.messages),/\[Project workspace\][\s\S]*index\.html \(12 lines\)/);
assert.doesNotMatch(JSON.stringify(first.messages),/Menu line\. Menu line\./,'the full page was sent');
assert(JSON.stringify(first).length<20000,'first request too large: '+JSON.stringify(first).length);
// Tool results reach the model; the error report goes back as a user message.
assert.match(JSON.stringify(bodies[1].messages),/7\| <h1>Hello coffee<\/h1>/);
assert.match(JSON.stringify(bodies[3].messages),/ReferenceError: order is not defined[\s\S]*edit_file/);
assert.equal(await page.evaluate(()=>window.__checked.length),2);
// The answer: final summary + all project files as a normal page artifact.
const msg=await page.evaluate(()=>conv.messages.at(-1));
assert.match(msg.content,/^Tajuk ditukar, butang Order ditambah/);
assert.match(msg.content,/Project files after this change:\n```html index\.html\n<!doctype html>/);
assert.match(msg.content,/<h1>Kopi Kita<\/h1>\n<button onclick="order\(\)">Order<\/button>/);assert.match(msg.content,/function order\(\)\{\}/);
assert.deepEqual(msg.workspace,{files:['index.html'],changed:['index.html']});
assert.deepEqual(msg.toolTrace.map(t=>t.name),['read_file','edit_file','edit_file']);
assert.equal(msg.codeChecks.at(-1).errors.length,0);
await page.locator('.msg.assistant').last().locator('.artifact-card.is-page').waitFor();
assert.match(await page.locator('.msg.assistant .tool-trace').last().innerText(),/Read index\.html 1-12[\s\S]*Edit index\.html/);
console.log('PASS Code follow-up: small edits, page test and fix, no full page sent, result is an artifact');

// 3. The next follow-up starts from the edited files, and history omits old code.
assert.match(await page.evaluate(()=>[...workspaceFrom(conv).files.get('index.html').matchAll(/Kopi Kita/g)].length+''),/1/);
await page.unroute(API);bodies.length=0;
await page.route(API,r=>{bodies.push(JSON.parse(r.request().postData()));return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:say('Halaman ni ada tajuk dan butang Order.')});});
await page.fill('#promptInput','Apa yang ada dalam halaman ni?');await page.click('#sendBtn');await page.waitForFunction(()=>!generating);
const hist=JSON.stringify(bodies[0].messages);
assert.match(hist,/\[code omitted: the current files are in the project workspace\]/);assert.doesNotMatch(hist,/Menu line\. Menu line\./);
assert.equal(await page.evaluate(()=>conv.messages.at(-1).workspace),undefined,'no files appended without changes');
console.log('PASS follow-up without edits: no files appended; old code left out of history');

// 4. Separate files layout: the workspace is the split project and the answer lists each file.
const sep=await page.evaluate(p=>{db.codeFiles='separate';const ws=workspaceFrom({messages:[{role:'assistant',id:'x',content:'```html\n'+p+'\n```'}]});const r=runWorkspaceTool(ws,'edit_file',{path:'css/styles.css',old_string:'h1{color:#222}',new_string:'h1{color:#7a4}'});
  const block=workspaceFilesBlock(ws);const files=namedFences(block);delete db.codeFiles;return {paths:[...ws.files.keys()],ok:r.ok,block,files:files.map(f=>f.name),preview:workspacePreviewDoc(ws)};},PAGE);
assert.deepEqual(sep.paths,['index.html','css/styles.css','js/app.js']);assert.equal(sep.ok,true);
assert.deepEqual(sep.files,['index.html','css/styles.css','js/app.js']);
assert.match(sep.preview,/<style data-file="css\/styles\.css">\nh1\{color:#7a4\}/);
console.log('PASS separate layout: edits target css/ and js/; preview puts them back together');

// 4b. A provider that rejects tools: Kita falls back to handing over the whole document.
await page.unroute(API);bodies.length=0;let n2=0;
await page.route(API,r=>{const body=JSON.parse(r.request().postData());bodies.push(body);n2++;
  if(body.tools) return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'tools are not supported for this model'}})});
  return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:say('Done.\n\n```html\n<!doctype html><html><body><h1>Tanpa tools</h1></body></html>\n```')});});
await page.fill('#promptInput','Tukar tajuk jadi Tanpa tools');await page.click('#sendBtn');await page.waitForFunction(()=>!generating);
assert.equal(bodies.length,2);assert.equal(bodies[1].tools,undefined);
assert.match(JSON.stringify(bodies[1].messages),/\[Current document to edit\][\s\S]*Kopi Kita[\s\S]*Return the complete updated document/);
assert.doesNotMatch(JSON.stringify(bodies[1].messages),/\[Project workspace\]/);
assert.match(await page.evaluate(()=>conv.messages.at(-1).content),/<h1>Tanpa tools<\/h1>/);
console.log('PASS provider without tools: falls back to the whole-document edit');

// 5. A clear new build in Code still starts a fresh build (no workspace).
assert.equal(await page.evaluate(()=>{const t='Buat landing page baru untuk kedai bunga';return !!(isCodeBuildRequest(t)&&!isEditRequest(t));}),true);
assert.deepEqual(errors,[]);
console.log('PASS workspace: tools, edit loop, artifact, history, separate files');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
