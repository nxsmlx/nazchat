/* Small, isolated comfort/update module. No provider keys or chat diagnostics exported. */
function applyComfort(){
 const root=document.documentElement;
 root.dataset.textSize=['small','default','large','extra'].includes(db.textSize)?db.textSize:'default';
 root.dataset.codeSize=['small','default','large','extra'].includes(db.codeSize)?db.codeSize:'default';
 root.dataset.reducedMotion=db.reduceMotion?'true':'false';
}
function renderComfortControls(list){
 const options='<option value="small">Small</option><option value="default">Default</option><option value="large">Large</option><option value="extra">Extra large</option>';
 const row=(label,key,select=false)=>{const node=el('label','settings-row');const title=el('span');title.textContent=label;const control=el(select?'select':'input');control.setAttribute('aria-label',label);if(select){control.innerHTML=options;control.value=db[key]||'default';control.onchange=()=>{db[key]=control.value;applyComfort();save();};}else{control.type='checkbox';control.checked=key==='autoScroll'?db[key]!==false:!!db[key];control.onchange=()=>{db[key]=control.checked;applyComfort();save();};}node.append(title,control);list.appendChild(node);};
 row('Code text size','codeSize',true);row('Reduce motion','reduceMotion');row('Follow new responses','autoScroll');
 const sample=el('p');sample.textContent='Preview: A little room to read. 0123456789';sample.className='comfort-preview';list.appendChild(sample);
 const reset=el('button','btn secondary','Reset reading preferences');reset.onclick=()=>{db.textSize='default';db.codeSize='default';db.reduceMotion=false;db.autoScroll=true;applyComfort();save();renderStudioAppearance();};list.appendChild(reset);
}
let updateNoticeInfo=null,updateCheckBusy=false;
function showUpdateNotice(info){
 let banner=document.querySelector('#updateNotice');if(banner)banner.remove();
 updateNoticeInfo=null;
 banner=el('aside');banner.id='updateNotice';banner.setAttribute('aria-label','Application update');
 const title=el('strong');title.textContent=`Update ${info.version} available · installed ${APP_VERSION}`;
 const details=el('p');details.textContent=String(info.changelog||'An application update is available.').slice(0,500);banner.append(title,details);
 // "Update" goes straight to download + install (the About page shows progress).
 for(const [label,action] of [['Update now',async()=>{banner.remove();renderSettingsAbout();openSheet('setSheet');await checkForUpdate();const b=document.querySelector('#checkUpdateBtn');if(b&&/Install update/.test(b.textContent))b.click();}],['Later',()=>{db.updateSnoozeUntil=Date.now()+24*3600000;save();banner.remove();}],['Skip this version',()=>{db.skippedUpdateCode=info.versionCode;save();banner.remove();}]]){const button=el('button','mini-btn',label);button.onclick=action;banner.appendChild(button);}
 document.body.appendChild(banner);
 // Swipe sideways to dismiss (same as Later).
 let startX=null,dx=0;
 banner.addEventListener('touchstart',e=>{if(e.target.closest('button'))return;startX=e.touches[0].clientX;dx=0;banner.classList.add('dragging');},{passive:true});
 banner.addEventListener('touchmove',e=>{if(startX===null)return;dx=e.touches[0].clientX-startX;banner.style.transform=`translateX(${dx}px)`;banner.style.opacity=String(Math.max(.2,1-Math.abs(dx)/260));},{passive:true});
 banner.addEventListener('touchend',()=>{if(startX===null)return;banner.classList.remove('dragging');startX=null;
   if(Math.abs(dx)>90){banner.style.transform=`translateX(${dx>0?120:-120}%)`;banner.style.opacity='0';db.updateSnoozeUntil=Date.now()+24*3600000;save();setTimeout(()=>banner.remove(),200);}
   else{banner.style.transform='';banner.style.opacity='';}});
}
/* Checks for a new release when the app opens and when it returns after 30 minutes.
   A failed check (offline, rate limit) is retried next time instead of waiting hours. */
let launchCheckDone=false;
async function automaticUpdateCheck(){
 if(updateCheckBusy||document.hidden)return;
 if(updateNoticeInfo&&!generating&&Date.now()>Number(db.updateSnoozeUntil||0)&&updateNoticeInfo.versionCode!==db.skippedUpdateCode){showUpdateNotice(updateNoticeInfo);return;}
 const now=Date.now();if(launchCheckDone&&now-Number(db.lastAutoUpdateCheck||0)<30*60000)return;
 updateCheckBusy=true;
 try{const info=await fetchUpdateInfo();launchCheckDone=true;db.lastAutoUpdateCheck=now;save();let local=APP_VERSION_CODE;try{local=Math.max(local,Number(window.NazUpdater?.getVersion()||0));}catch(e){}
 if(info.versionCode>local&&info.versionCode>Number(db.skippedUpdateCode||0)&&now>Number(db.updateSnoozeUntil||0)){updateNoticeInfo=info;if(!generating)showUpdateNotice(info);}
 }catch(e){/* Background check failures never block chatting. */}finally{updateCheckBusy=false;}
}
window.kitaHandleBack=function(){
 if(document.querySelector('.msg-menu')){closeMessageMenu();return true;}
 const overlay=studioTopOverlay();if(overlay){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true;}
 if(studioView!=='chat'){studioNavigate('chat');return true;}return false;
};
function copySafeDiagnostics(){
 const report={app:APP_VERSION,versionCode:APP_VERSION_CODE,platform:navigator.userAgent,theme:db.theme,textSize:db.textSize||'default',codeSize:db.codeSize||'default',nativeUpdater:!!window.NazUpdater,online:navigator.onLine};
 // Intentionally exclude prompts, endpoint URLs, provider headers, keys and chat content.
 copyText(JSON.stringify(report,null,2));
}
function initializeComfort(){
 document.addEventListener('click',event=>{if(event.target.closest('[data-safe-diagnostics]'))copySafeDiagnostics();});
 applyComfort();setTimeout(automaticUpdateCheck,3500);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)automaticUpdateCheck();});
 // Deferred notice is displayed only once the current generation ends.
 const send=document.querySelector('#sendBtn');new MutationObserver(()=>{if(!generating&&updateNoticeInfo){const info=updateNoticeInfo;updateNoticeInfo=null;if(!document.querySelector('#updateNotice'))showUpdateNotice(info);}}).observe(send,{attributes:true,attributeFilter:['class']});
}
