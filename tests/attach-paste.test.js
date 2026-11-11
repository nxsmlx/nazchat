const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.8.2: Markdown and other text files attach (Android offered only PDFs), binary files
// are refused, and a long paste becomes an attachment chip instead of a wall of text.
(async()=>{
 const b=await launch();const page=await b.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
 await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');
 try{
  // File types: decided by the page, since the picker now offers every file.
  const kinds=await page.evaluate(()=>[
    ['notes.md',''],['notes.md','application/octet-stream'],['README',''],['spec.markdown','text/x-markdown'],
    ['a.pdf','application/pdf'],['b.docx',''],['c.py','text/x-python'],['photo.jpg','image/jpeg'],['app.apk','application/vnd.android.package-archive'],['x.zip','application/zip']
  ].map(([n,t])=>attachableKind({name:n,type:t})));
  assert.deepEqual(kinds,['text','text','text','text','doc','doc','text','image','','']);

  const attach=(name,type,content)=>page.evaluate(async([name,type,content])=>{
    const bytes=typeof content==='string'?new TextEncoder().encode(content):new Uint8Array(content);
    pendingAttachments=[];toastLog=[];const orig=window.toast;window.toast=m=>toastLog.push(String(m));
    try{await handleFiles([new File([bytes],name,{type})]);}finally{window.toast=orig;}
    return {list:pendingAttachments.map(a=>({name:a.name,type:a.type,len:a.text.length})),toasts:toastLog,chips:[...document.querySelectorAll('#attachmentInline .attachment-chip')].map(c=>c.textContent.trim())};
  },[name,type,content]);
  await page.evaluate(()=>{window.toastLog=[];});
  const md=await attach('Plan.md','','# Plan\n\n- one\n- two\n');
  assert.equal(md.list.length,1);assert.equal(md.list[0].type,'text/markdown');assert.match(md.chips[0],/^MD/);
  const bin=await attach('blob.bin','',[0,1,2,3,0,0,255,254,0,7]);
  assert.equal(bin.list.length,0);assert.ok(bin.toasts.some(t=>/Can't read blob\.bin/.test(t)),bin.toasts.join('|'));
  const noext=await attach('LICENSE','',[80,75,3,4,0,0,0,0,20,0]);
  assert.equal(noext.list.length,0);assert.ok(noext.toasts.some(t=>/not a text file/.test(t)),noext.toasts.join('|'));

  // Long paste via a real paste event.
  await page.evaluate(()=>{pendingAttachments=[];renderAttachments();const i=$('#promptInput');i.value='Please review: ';i.focus();i.setSelectionRange(i.value.length,i.value.length);});
  const long=Array.from({length:120},(_,i)=>`line ${i+1}: some pasted log output that goes on`).join('\n');
  const pasted=await page.evaluate(text=>{
    const dt=new DataTransfer();dt.setData('text/plain',text);
    const i=$('#promptInput');i.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
    return {value:i.value,att:pendingAttachments.map(a=>({name:a.name,pasted:!!a.pasted,len:a.text.length})),chip:document.querySelector('#attachmentInline .attachment-chip.pasted')?.textContent||''};
  },long);
  assert.equal(pasted.value,'Please review: ','box keeps only what was typed');
  assert.deepEqual(pasted.att,[{name:'Pasted text.txt',pasted:true,len:long.length}]);
  assert.match(pasted.chip,/PASTE/);assert.match(pasted.chip,/line 1: some pasted/);assert.match(pasted.chip,/120 lines/);

  // A short paste stays inline (no preventDefault).
  const short=await page.evaluate(()=>{const dt=new DataTransfer();dt.setData('text/plain','hello');const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});$('#promptInput').dispatchEvent(ev);return {prevented:ev.defaultPrevented,n:pendingAttachments.length};});
  assert.deepEqual(short,{prevented:false,n:1});

  // Keyboard clipboard insert (no paste event): caught as one large insertion, and the
  // longer native clipboard copy wins when the keyboard inserted only part of it.
  const full=long+'\n'+Array.from({length:200},(_,i)=>`tail ${i}`).join('\n');
  const ime=await page.evaluate(([part,full])=>{
    window.NazClipboard={text:()=>full};
    const i=$('#promptInput');i.value='Fix this ';i.setSelectionRange(9,9);
    i.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:part,bubbles:true,cancelable:true}));
    i.value='Fix this '+part;i.dispatchEvent(new InputEvent('input',{inputType:'insertText',data:part,bubbles:true}));
    delete window.NazClipboard;
    const last=pendingAttachments[pendingAttachments.length-1];
    return {value:i.value,name:last.name,len:last.text.length};
  },[long.slice(0,3000),full]);
  assert.deepEqual(ime,{value:'Fix this ',name:'Pasted text 2.txt',len:full.length});

  // Typing and a draft loaded programmatically are never turned into attachments.
  const typed=await page.evaluate(()=>{const before=pendingAttachments.length;const i=$('#promptInput');i.value='x'.repeat(5000);
    i.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'y',bubbles:true}));i.value+='y';i.dispatchEvent(new InputEvent('input',{inputType:'insertText',data:'y',bubbles:true}));
    return {n:pendingAttachments.length-before,len:i.value.length};});
  assert.deepEqual(typed,{n:0,len:5001});

  // The sent message keeps the pasted flag and shows "Pasted text · N lines"; the model gets the full text.
  const sent=await page.evaluate(()=>{const a=pendingAttachments.filter(x=>x.pasted);conv={id:'p',title:'t',messages:[{id:'u',role:'user',content:'Please review:',attachments:a.map(x=>({name:x.name,type:x.type,text:x.text,pasted:true}))}]};renderAll();
    return {files:[...document.querySelectorAll('.user-file')].map(f=>f.textContent),api:apiContent('Please review:',a)};});
  assert.match(sent.files[0],/^Pasted text · 120 lines$/);assert.match(sent.api,/\[Document: Pasted text\.txt\]\nline 1:/);assert.match(sent.api,/tail 199/);
  assert.deepEqual(errors,[]);
  console.log('PASS Markdown/text files attach, binaries refused, long pastes (event or keyboard insert) become attachments with full clipboard text');
 }catch(e){console.error(e);process.exitCode=1;}finally{await b.close();}
})();
