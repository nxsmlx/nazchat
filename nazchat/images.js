/* Images (4.20.0): attach photos and screenshots, and let vision models read them.
   - Each image is resized on the phone (longest side 1600px, JPEG) before it is sent, so
     requests stay small and fast.
   - Full images live in IndexedDB, not in the chat data (localStorage is small). A message
     keeps a ~10 KB thumbnail plus the image id, so chats stay readable even if the full
     image is gone.
   - Sent as image_url parts (Chat Completions) or input_image parts (Responses API), only
     to models that can see images. A model known to be text-only gets a short note instead. */

const IMAGE_MAX_EDGE = 1600, IMAGE_THUMB_EDGE = 160, IMAGE_MAX_BYTES = 4 * 1024 * 1024, IMAGES_PER_MESSAGE = 6;
const imageCache = new Map();   // id → data URL, for this session (also covers a missing IndexedDB)

function imageDb(){
  if(imageDb.p) return imageDb.p;
  imageDb.p = new Promise((resolve)=>{
    try{
      const req = indexedDB.open('kita-images', 1);
      req.onupgradeneeded = ()=>req.result.createObjectStore('images');
      req.onsuccess = ()=>resolve(req.result);
      req.onerror = ()=>resolve(null);
    }catch(e){ resolve(null); }
  });
  return imageDb.p;
}
async function putImage(id, dataUrl){
  imageCache.set(id, dataUrl);
  const d = await imageDb(); if(!d) return false;
  return new Promise(r=>{ try{ const tx=d.transaction('images','readwrite'); tx.objectStore('images').put({dataUrl, at:Date.now()}, id); tx.oncomplete=()=>r(true); tx.onerror=()=>r(false); }catch(e){ r(false); } });
}
async function getImage(id){
  if(imageCache.has(id)) return imageCache.get(id);
  const d = await imageDb(); if(!d) return null;
  const v = await new Promise(r=>{ try{ const q=d.transaction('images').objectStore('images').get(id); q.onsuccess=()=>r(q.result||null); q.onerror=()=>r(null); }catch(e){ r(null); } });
  if(v?.dataUrl) imageCache.set(id, v.dataUrl);
  return v?.dataUrl || null;
}

function loadImageElement(src){
  return new Promise((resolve, reject)=>{ const img=new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(new Error('This image format cannot be read here. Try a JPG or PNG.')); img.src=src; });
}
function drawScaled(img, maxEdge, quality){
  const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
  const k=Math.min(1, maxEdge/Math.max(w,h));
  const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
  const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height); // JPEG has no transparency
  g.drawImage(img,0,0,c.width,c.height);
  return {dataUrl:c.toDataURL('image/jpeg', quality), width:c.width, height:c.height};
}
/* File → attachment {name, type, imageId, thumb, width, height}. */
async function prepareImageAttachment(file){
  if(file.size > 30*1024*1024) throw new Error('Image too large: '+file.name+' (maximum 30 MB)');
  const src = await readAsDataURL(file);
  const img = await loadImageElement(src);
  let full = drawScaled(img, IMAGE_MAX_EDGE, .85);
  if(full.dataUrl.length*0.75 > IMAGE_MAX_BYTES) full = drawScaled(img, 1200, .72);
  const thumb = drawScaled(img, IMAGE_THUMB_EDGE, .7).dataUrl;
  const id = 'img_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  await putImage(id, full.dataUrl);
  return {name:file.name||'image.jpg', type:'image/jpeg', imageId:id, thumb, width:full.width, height:full.height};
}
function isImageAttachment(a){ return !!(a && a.imageId); }

/* Does the selected model accept images? true / false / null (unknown: try it). */
function modelVision(model){
  const meta = model?.provider?.modelMeta?.[model?.modelId] || {};
  const caps = meta.capabilities || {};
  if(typeof caps.vision === 'boolean') return caps.vision;
  if(typeof meta.supports_vision === 'boolean') return meta.supports_vision;
  const mods = meta.architecture?.input_modalities || meta.input_modalities || meta.modalities?.input;
  if(Array.isArray(mods)) return mods.map(String).some(m=>/image/i.test(m));
  if(typeof meta.architecture?.modality === 'string') return /image/i.test(meta.architecture.modality.split('->')[0]);
  return null;
}

/* Before a request: load the images of the messages that will be sent. */
async function preloadMessageImages(messages){
  const ids = [];
  for(const m of messages||[]) for(const a of m.attachments||[]) if(isImageAttachment(a)) ids.push(a.imageId);
  await Promise.all(ids.map(id=>getImage(id)));
}
/* Attach image data to an API message without making it part of its JSON: other request
   builders (summaries, agents) send the plain text unchanged. */
function withMessageImages(apiMsg, msg){
  const imgs = (msg.attachments||[]).filter(isImageAttachment).slice(0, IMAGES_PER_MESSAGE)
    .map(a=>({name:a.name, url:imageCache.get(a.imageId)||null}));
  if(imgs.length) Object.defineProperty(apiMsg, 'images', {value:imgs, enumerable:false});
  return apiMsg;
}
/* Turn messages with images into multimodal content for the provider's API type. */
function imagePartsForRequest(history, apiType, vision){
  let notes = 0;
  const out = history.map(h=>{
    if(!h.images || !h.images.length) return h;
    const missing = h.images.filter(i=>!i.url), ready = h.images.filter(i=>i.url);
    let text = String(h.content||'');
    if(missing.length) text += '\n\n[Image no longer on this device: '+missing.map(i=>i.name).join(', ')+']';
    if(vision === false || !ready.length){
      if(ready.length){ notes++; text += '\n\n[The user attached '+ready.length+' image'+(ready.length>1?'s':'')+' ('+ready.map(i=>i.name).join(', ')+'), but this model cannot see images. Say so briefly and ask them to switch to a model with vision.]'; }
      return {...h, content:text};
    }
    const parts = apiType==='responses'
      ? [{type:'input_text', text}].concat(ready.map(i=>({type:'input_image', image_url:i.url})))
      : [{type:'text', text}].concat(ready.map(i=>({type:'image_url', image_url:{url:i.url}})));
    return {...h, content:parts};
  });
  return {messages:out, textOnlyNotes:notes};
}

function viewImage(id, name){
  getImage(id).then(url=>{
    if(!url){ toast('This image is no longer on this device'); return; }
    openPreview('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+esc(name||'Image')+'</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#111"><img src="'+url+'" alt="'+esc(name||'Image')+'" style="max-width:100%;max-height:100vh;object-fit:contain"></body></html>', {live:false});
  });
}
