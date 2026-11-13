const assert=require('node:assert/strict');const {launch,appUrl}=require('./browser');
/* 4.20.0 images: attach (picker or paste), resize on the phone, send to vision models as
   image_url / input_image parts, keep full images out of the chat data, survive a reload,
   and tell text-only models instead of sending them pictures. */
const API='https://api.test/v1/chat/completions',RESP='https://api.test/v1/responses';
const seed={schemaVersion:3,onboardingDone:true,search:false,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['see','blind'],
  modelMeta:{see:{context_length:128000,capabilities:{vision:true}},blind:{context_length:128000,capabilities:{vision:false}}}}],conversations:[],projects:[],lastProviderId:'p',lastModelId:'see'};
const sse=t=>'data: '+JSON.stringify({choices:[{delta:{content:t},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n';
(async()=>{const b=await launch();try{
const page=await b.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const bodies=[];
await page.route(/^https?:\/\//,async r=>{const u=r.request().url();
  if(u===API){bodies.push(JSON.parse(r.request().postData()));return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse('I see a red and blue picture.')});}
  if(u===RESP){bodies.push(JSON.parse(r.request().postData()));return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:'data: '+JSON.stringify({type:'response.output_text.delta',delta:'Seen.'})+'\n\ndata: '+JSON.stringify({type:'response.completed',response:{status:'completed'}})+'\n\n'});}
  return r.fulfill({status:503,body:'{}'});});
await page.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}},seed);
await page.goto(appUrl);await page.waitForFunction(()=>typeof send==='function');
const makeFile=(w,h,name)=>page.evaluate(async([w,h,name])=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#d00';g.fillRect(0,0,w/2,h);g.fillStyle='#00d';g.fillRect(w/2,0,w/2,h);
  const blob=await new Promise(r=>c.toBlob(r,'image/png'));window.__f=new File([blob],name,{type:'image/png'});},[w,h,name]);
const done=()=>page.waitForFunction(()=>!generating,null,{timeout:30000});

// 1. Attach from the picker: resized to 1600px, thumbnail chip shown.
await makeFile(3000,1000,'banner.png');
await page.evaluate(()=>handleFiles([window.__f]));
await page.locator('.attachment-chip.image img.attachment-thumb').waitFor();
assert.match(await page.locator('.attachment-chip.image').innerText(),/banner\.png\s*1600 × 533/);
// 2. Send to a vision model: text + image_url (JPEG data URL).
await page.fill('#promptInput','Apa dalam gambar ni?');await page.click('#sendBtn');await done();
let user=bodies.at(-1).messages.at(-1);
assert(Array.isArray(user.content),'user content should be multimodal');
assert.deepEqual(user.content[0],{type:'text',text:'Apa dalam gambar ni?'});
assert.equal(user.content[1].type,'image_url');assert.match(user.content[1].image_url.url,/^data:image\/jpeg;base64,/);
assert.match(await page.locator('.msg.assistant .bubble').last().innerText(),/red and blue/);
console.log('PASS attach + send: resized JPEG sent as an image_url part to a vision model');

// 3. Chat data keeps only a small thumbnail; the full image is in IndexedDB.
const stored=await page.evaluate(()=>{const raw=localStorage.getItem('nazchat_v1');const a=JSON.parse(raw).conversations[0].messages[0].attachments[0];return {keys:Object.keys(a).sort(),thumb:a.thumb.length,big:/data:image\/jpeg;base64,[A-Za-z0-9+/=]{60000}/.test(raw)};});
assert.deepEqual(stored.keys,['height','imageId','name','thumb','type','width']);
assert(stored.thumb<30000,'thumbnail too big: '+stored.thumb);assert.equal(stored.big,false,'full image leaked into chat data');
// 4. A fresh session (memory cache empty, as after the app restarts) reads the image back from
//    IndexedDB; the thumbnail shows and a follow-up still sends the image. (A full page reload is
//    avoided: headless Chromium can read stale localStorage after reloading a file:// page.)
await page.evaluate(()=>{imageCache.clear();renderAll();});
assert.match(await page.evaluate(async()=>{const id=conv.messages[0].attachments[0].imageId;imageCache.clear();return (await getImage(id))||'';}),/^data:image\/jpeg;base64,/);
await page.evaluate(()=>imageCache.clear());
await page.locator('.user-image img').first().waitFor();
await page.fill('#promptInput','Warna apa di kiri?');await page.click('#sendBtn');await done();
const prev=bodies.at(-1).messages.find(m=>Array.isArray(m.content));
assert(prev&&prev.content[1].image_url.url.startsWith('data:image/jpeg'),'image lost after reload');
console.log('PASS image kept out of chat data, restored from IndexedDB after reload');

// 5. Tap the thumbnail to view the full image.
await page.evaluate(()=>{window.__pv=null;openPreview=h=>{window.__pv=h;};});
await page.locator('.user-image').first().click();await page.waitForFunction(()=>window.__pv);
assert.match(await page.evaluate(()=>window.__pv),/<img src="data:image\/jpeg;base64,/);

// 6. Responses API gets input_text + input_image.
await page.evaluate(()=>{db.providers[0].apiType='responses';conv=null;renderAll();});
await makeFile(400,300,'small.png');await page.evaluate(()=>handleFiles([window.__f]));await page.locator('.attachment-chip.image').waitFor();
await page.fill('#promptInput','Describe');await page.click('#sendBtn');await done();
user=bodies.at(-1).input.at(-1);
assert.equal(user.content[0].type,'input_text');assert.equal(user.content[1].type,'input_image');assert.match(user.content[1].image_url,/^data:image\/jpeg/);
console.log('PASS Responses API gets input_image parts');

// 7. A text-only model gets a note instead of the picture, and the user is told.
await page.evaluate(()=>{db.providers[0].apiType='chat_completions';db.lastModelId='blind';conv=null;renderAll();});
await makeFile(400,300,'menu.png');await page.evaluate(()=>handleFiles([window.__f]));await page.locator('.attachment-chip.image').waitFor();
await page.fill('#promptInput','Baca menu ni');await page.click('#sendBtn');
await page.waitForFunction(()=>/can't see images/.test(document.querySelector('#toast')?.textContent||''));await done();
user=bodies.at(-1).messages.at(-1);
assert.equal(typeof user.content,'string');assert.match(user.content,/cannot see images/);assert.doesNotMatch(JSON.stringify(bodies.at(-1)),/data:image/);
console.log('PASS text-only model: no image sent, model and user are told');

// 7b. A provider that rejects tools: the retry without tools still carries the image.
await page.evaluate(()=>{db.lastModelId='see';conv=null;renderAll();});
await page.unroute(/^https?:\/\//);const retry=[];
await page.route(/^https?:\/\//,r=>{if(r.request().url()!==API)return r.fulfill({status:503,body:'{}'});const body=JSON.parse(r.request().postData());retry.push(body);
  if(body.tools)return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'tools are not supported'}})});
  return r.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:sse('Seen without tools.')});});
await makeFile(300,200,'retry.png');await page.evaluate(()=>handleFiles([window.__f]));await page.locator('.attachment-chip.image').waitFor();
await page.fill('#promptInput','Tengok ni');await page.click('#sendBtn');await done();
assert.equal(retry.length,2);assert.equal(retry[1].tools,undefined);
assert.equal(retry[1].messages.at(-1).content[1].type,'image_url','image lost on the retry without tools');
console.log('PASS retry without tools keeps the image');

// 8. Pasting an image attaches it.
await page.evaluate(async()=>{const dt=new DataTransfer();dt.items.add(window.__f);const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});document.querySelector('#promptInput').dispatchEvent(ev);});
await page.waitForFunction(()=>pendingAttachments.some(a=>a.imageId));
console.log('PASS pasting an image attaches it');
assert.deepEqual(errors,[]);
console.log('PASS images: attach, resize, vision request formats, storage, reload, view, paste');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
