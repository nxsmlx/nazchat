/* Kita Studio UI integration. Uses the existing application database and real
   provider/streaming functions. No demo data, credentials or request simulation. */
'use strict';
let studioView='chat';
let studioLibraryFilter='all';
let studioSidebarFocus=null;
function studioSystemIsDark(){try{if(typeof window.NazTheme?.isSystemDark==='function')return !!window.NazTheme.isSystemDark();}catch(e){}return matchMedia('(prefers-color-scheme: dark)').matches;}
const studioOverlayFocus=new Map();
function kitaMark(){return '<svg viewBox="0 0 40 40" fill="currentColor" aria-hidden="true"><path d="M5 4h13v14H5zM22 4h13L22 18zM5 22h13v14H5zM22 22l13 14H22z"/><path opacity=".45" d="M22 4v14h13zM22 22h13v14z"/></svg>';}
function kitaIcon(name){const paths={plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',chevron:'<path d="m7 10 5 5 5-5"/>',chat:'<path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2V11.5a9 9 0 0 1 18 0Z"/><path d="M7 10h8M7 14h5"/>',folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',library:'<path d="M4 4v16M9 4v16M14 4v16m4-15 3 14"/>',pen:'<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',code:'<path d="m7 7-5 5 5 5m10-10 5 5-5 5m-4-12-2 18"/>',think:'<path d="M9 18h6m-6 3h6M8 15a7 7 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',spark:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/>',file:'<path d="M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9ZM14 2v7h7M7 14h10M7 18h6"/>'};return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.file}</svg>`;}
function studioCanNavigate(){if(generating){toast('Stop the current response before switching conversations.');return false;}return true;}
function studioFocusContent(){const node=studioView==='chat'?(conv?.messages.length?$('#chatScroll'):$('#empty')):$('#workspaceView');node?.focus({preventScroll:true});}
function studioNavigate(view){if(!studioCanNavigate())return;studioView=['chat','projects','library'].includes(view)?view:'chat';closeSidebar();renderAll();studioFocusContent();}
function studioNewChat(projectId=null){if(!studioCanNavigate())return;conv=null;db.activeProjectId=projectId;studioView='chat';pendingAttachments=[];renderAttachments();save();closeSidebar();renderAll();studioFocusContent();}
function studioOpenConversation(c){if(!studioCanNavigate())return;conv=c;db.uiMode=c.mode==='code'?'code':'chat';db.activeProjectId=c.projectId||null;studioView='chat';save();closeSidebar();renderAll();studioFocusContent();haptic();}
function renderStudioView(){
  if(!$('#workspaceView'))return;
  const chat=studioView==='chat',has=!!conv?.messages?.length;
  $('#main').dataset.view=studioView;
  $('#workspaceView').hidden=chat;$('#composerWrap').hidden=!chat;
  $('#empty').style.display=chat&&!has?'flex':'none';$('#chatScroll').style.display=chat&&has?'':'none';
  renderBottomNav(chat,has);
  document.querySelectorAll('[data-studio-view]').forEach(b=>{const active=b.dataset.studioView===studioView;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('#studioProjectCount').textContent=db.projects.length||'';$('#studioLibraryCount').textContent=(db.prompts.length+db.artifacts.length)||'';
  $('#chatTitle').textContent=chat?(conv?.title||currentProject()?.name||'Kita Chat'):studioView==='projects'?'Projects':'Library';
  $('#studioHeaderNote').textContent=chat?(currentProject()?.name||(typeof kitaMode==='function'&&kitaMode()==='code'?'Code · build and publish':'A little room to think.')):studioView==='projects'?'Keep the context together.':'Good ideas, kept close.';
  applyComfort();
  renderStudioContext();renderStudioHome();if(typeof renderModeHome==='function')renderModeHome();if(typeof syncComposerSteer==='function')syncComposerSteer();
  if(!chat){if(studioView==='projects')renderStudioProjects();else renderStudioLibrary();}
}
/* One UI style floating glass navigation for phones. It shows on Home, Projects and
   Library and steps aside inside a conversation so the composer keeps the bottom edge. */
function ensureBottomNav(){
  let nav=$('#bottomNav');if(nav)return nav;
  nav=el('nav','glass-nav');nav.id='bottomNav';nav.setAttribute('aria-label','Main');
  const items=[['home','Home','chat',()=>studioNewChat(db.activeProjectId||null)],['chats','Chats','library',()=>openSidebar()],['projects','Projects','folder',()=>studioNavigate('projects')],['library','Library','file',()=>studioNavigate('library')],['settings','Settings','settings',()=>{renderSettingsHub();openSheet('setSheet');}]];
  for(const [key,label,icon,run] of items){const b=el('button','glass-nav-item',`${kitaIcon(icon)}<span>${label}</span>`);b.type='button';b.dataset.navKey=key;b.onclick=()=>{haptic('light');run();};nav.appendChild(b);}
  document.body.appendChild(nav);
  addEventListener('resize',()=>renderBottomNav(studioView==='chat',!!conv?.messages?.length));
  return nav;
}
function renderBottomNav(chat,has){
  const nav=ensureBottomNav();
  const show=innerWidth<=760&&!(chat&&has);
  nav.hidden=!show;$('#main').classList.toggle('with-nav',show);document.body.classList.toggle('with-nav',show);
  const current=chat?'home':studioView;
  nav.querySelectorAll('[data-nav-key]').forEach(b=>{const on=b.dataset.navKey===current;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}
function renderStudioHome(){
  $('#studioGreeting').textContent=currentProject()?'Working in '+currentProject().name:'A fresh thought starts here.';
  const box=$('#studioResume');box.innerHTML='';
  const home=document.querySelector('.studio-home'),sugg=home?.querySelector('.sugg');
  const mode=typeof kitaMode==='function'?kitaMode():'chat';
  const recents=[...db.conversations].filter(c=>c.messages?.length&&(c.mode==='code'?'code':'chat')===mode&&(!db.activeProjectId||c.projectId===db.activeProjectId)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  // Returning users come back to continue: recent chats go first and the welcome copy shrinks.
  const returning=recents.length>0;
  home?.classList.toggle('returning',returning);
  if(home&&sugg){if(returning&&box.nextElementSibling!==sugg)home.insertBefore(box,sugg);else if(!returning&&sugg.nextElementSibling!==box)sugg.after(box);}
  const item=(icon,title,sub,onclick)=>{const b=el('button','studio-resume-item');b.innerHTML=`<span class="studio-resume-icon">${kitaIcon(icon)}</span><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span>${kitaIcon('arrow')}`;b.onclick=onclick;return b;};
  if(!db.providers.length)box.appendChild(returning?item('plus','Connect a provider','Add your API key to keep chatting',()=>openProvForm(null)):item('plus','Connect your first provider','Bring your own API key to start chatting',()=>openProvForm(null)));
  if(returning){
    const head=el('div','studio-resume-head');head.appendChild(el('p','studio-section-title','Continue where you left off'));
    if(recents.length>3){const all=el('button','studio-see-all','All chats');all.type='button';all.onclick=()=>openSidebar();head.appendChild(all);}
    box.appendChild(head);
    recents.slice(0,3).forEach(c=>box.appendChild(item('chat',c.title||'New chat',`${conversationDay(c.updatedAt)} · ${c.messages.length} message${c.messages.length===1?'':'s'}`,()=>studioOpenConversation(c))));
    if(sugg)sugg.setAttribute('aria-label','Start something new');
  }
}
function openStudioProjectPicker(){
  if(!studioCanNavigate())return;
  const body=$('#toolsSheetBody');body.innerHTML='';$('#studioChatControls').hidden=true;$('#toolsSheet .sheet-head h3').textContent='Conversation project';
  body.appendChild(el('p','hint','Choose the project for this conversation. Existing messages are kept.'));
  [{id:null,name:'No project'},...db.projects].forEach(p=>{const b=el('button','btn secondary',esc(p.name)+(p.id===db.activeProjectId?' ✓':''));b.onclick=()=>{if(!studioCanNavigate())return;db.activeProjectId=p.id;if(conv)conv.projectId=p.id;save();closeSheet('toolsSheet');renderAll();};body.appendChild(b);});openSheet('toolsSheet');
}
function renderStudioContext(){
  const host=$('#studioContext');if(!host)return;host.innerHTML='';const chips=[];
  const project=currentProject(),style=currentStyle();
  if(project)chips.push({label:project.name,icon:'folder',clear:()=>openStudioProjectPicker()});
  if(db.search)chips.push({label:'Web search',icon:'globe',clear:()=>{db.search=false;save();syncToggles();}});
  if(db.thinking)chips.push({label:'Thinking · '+db.reasoningEffort,icon:'think',clear:()=>{db.thinking=false;save();syncToggles();}});
  if(db.skillSettings.mode==='manual')chips.push({label:db.skillSettings.selected.length+' skills',icon:'spark',clear:()=>{db.skillSettings.mode='auto';save();syncToggles();}});
  if(style)chips.push({label:style.name,icon:'pen',clear:()=>{db.activeStyleId=null;if(conv)conv.styleId=null;save();renderStudioContext();}});
  // Bypass all is always visible while it is on; removing the chip turns it off.
  if(permissionMode()==='bypass')chips.unshift({label:'Bypass all: tools run without asking',icon:'spark',warn:true,clear:()=>{db.permissionMode='balanced';save();renderStudioContext();toast('Bypass all is off. Tools ask again.');}});
  chips.forEach(c=>{const chip=el('div','studio-context-chip'+(c.warn?' warn':''));chip.innerHTML=kitaIcon(c.icon);const label=el('span');label.textContent=c.label;chip.appendChild(label);const remove=el('button',null,kitaIcon(c.icon==='folder'?'chevron':'close'));remove.setAttribute('aria-label',(c.icon==='folder'?'Change project: ':c.warn?'Turn off ':'Remove ')+c.label.split(':')[0]);remove.onclick=()=>{if(generating){toast('Stop the response before changing context.');return;}c.clear();};chip.appendChild(remove);host.appendChild(chip);});host.hidden=!chips.length;
  const count=Number(!!db.search)+Number(!!db.thinking)+Number(db.skillSettings.mode==='manual');const badge=$('.studio-tool-count');if(badge){badge.textContent=count;badge.hidden=!count;}
}
function studioEmpty(title,text,action,label){const box=el('div','studio-empty-state');box.innerHTML=`${kitaIcon('folder')}<h2>${esc(title)}</h2><p>${esc(text)}</p>`;if(action){const b=el('button','btn secondary',esc(label));b.onclick=action;box.appendChild(b);}return box;}
function studioPage(title,description,action,label){const page=el('section','studio-workspace'),head=el('div','studio-page-head');head.innerHTML=`<div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>`;if(action){const b=el('button','mini-btn',kitaIcon('plus')+' '+esc(label));b.onclick=action;head.appendChild(b);}page.appendChild(head);$('#workspaceView').replaceChildren(page);return page;}
function renderStudioProjects(){const page=studioPage('A place for each idea.','Keep related conversations and instructions together.',()=>createProject(),'New project');if(!db.projects.length){page.appendChild(studioEmpty('Start with one idea.','A project gives your conversations shared instructions and reference documents.',()=>createProject(),'Create a project'));return;}const grid=el('div','studio-project-grid');db.projects.forEach(p=>{const b=el('button','studio-project-card');const count=db.conversations.filter(c=>c.projectId===p.id).length;b.innerHTML=`${kitaIcon('folder')}<h2>${esc(p.name)}</h2><p>${esc((p.instructions||'A space for related conversations and ideas.').slice(0,140))}</p><small>${count} conversation${count===1?'':'s'} · ${(p.sources||[]).length} source sections</small>`;b.onclick=()=>openStudioProject(p);grid.appendChild(b);});page.appendChild(grid);}
function openStudioProject(project){
  const page=studioPage(project.name,'Your conversations, context and next steps.',()=>studioNewChat(project.id),'New chat');
  const back=el('button','settings-back','← All projects');back.onclick=renderStudioProjects;page.prepend(back);
  const label=el('label','fld','Project instructions'),area=el('textarea');area.value=project.instructions||'';area.placeholder='What should Kita know about this project?';area.maxLength=6000;area.onchange=()=>{project.instructions=area.value;project.updatedAt=Date.now();save();};label.appendChild(area);page.appendChild(label);
  const conversations=db.conversations.filter(c=>c.projectId===project.id).sort((a,b)=>b.updatedAt-a.updatedAt);
  if(!conversations.length)page.appendChild(studioEmpty('Ready for a first conversation.','New messages in this project will use its instructions.',()=>studioNewChat(project.id),'Start a conversation'));
  conversations.forEach(c=>{const row=el('button','studio-library-row');row.innerHTML=`${kitaIcon('chat')}<span><strong>${esc(c.title||'New chat')}</strong><small>${esc(conversationDay(c.updatedAt))}</small></span>${kitaIcon('arrow')}`;row.onclick=()=>studioOpenConversation(c);page.appendChild(row);});
}
function renderStudioLibrary(){
  const page=studioPage('Keep the good things.','Your useful prompts and things you’ve made.',()=>createPrompt(),'Save prompt');
  const tabs=el('div','studio-library-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Library category');
  [['all','Everything'],['artifact','Artifacts'],['prompt','Prompts']].forEach(([id,label])=>{const b=el('button',studioLibraryFilter===id?'active':'',label);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(studioLibraryFilter===id));b.onclick=()=>{studioLibraryFilter=id;renderStudioLibrary();$('#workspaceView [aria-selected="true"]')?.focus();};tabs.appendChild(b);});page.appendChild(tabs);
  const items=[...db.artifacts.map(a=>({...a,_kind:'artifact'})),...db.prompts.map(p=>({...p,_kind:'prompt'}))].filter(x=>studioLibraryFilter==='all'||x._kind===studioLibraryFilter).sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  if(!items.length)page.appendChild(studioEmpty('Nothing here yet.','Save a prompt or use “Save artifact” on a code response. Your library stays on this device.'));
  items.forEach(item=>{const row=el('div','studio-library-row'),open=el('button','studio-library-open');open.innerHTML=`${kitaIcon(item._kind==='artifact'?'code':'pen')}<span><strong>${esc(item.name)}</strong><small>${item._kind==='artifact'?esc(item.kind||'Code')+' artifact':esc((item.content||'').slice(0,100))}</small></span>${kitaIcon('arrow')}`;open.onclick=()=>{if(item._kind==='prompt')usePrompt(item);else openStudioArtifact(item);};const menu=el('button','icon-btn',kitaIcon('more'));menu.setAttribute('aria-label','Manage '+item.name);menu.onclick=()=>studioManageLibraryItem(item);row.append(open,menu);page.appendChild(row);});
}
function openStudioArtifact(a){if(/^(html|htm|xhtml)$/i.test(a.kind||'')){openPreview(a.content,{live:false});return;}const page=studioPage(a.name,(a.kind||'Code')+' artifact');const back=el('button','settings-back','← Back to library');back.onclick=renderStudioLibrary;page.prepend(back);const pre=el('pre','studio-artifact-code');pre.textContent=a.content;page.appendChild(pre);const copy=el('button','mini-btn','Copy code');copy.onclick=()=>copyText(a.content);page.appendChild(copy);}
async function studioManageLibraryItem(item){const next=await promptDialog('Rename this saved item. Leave the existing name to keep it.',item.name,{title:'Saved item'});if(next===null)return;const collection=item._kind==='artifact'?db.artifacts:db.prompts;const original=collection.find(x=>x.id===item.id);if(original&&next.trim()){original.name=next.trim().slice(0,100);save();renderStudioLibrary();}}
async function studioConversationMenu(c){
  const body=$('#toolsSheetBody');body.innerHTML='';$('#studioChatControls').hidden=true;$('#toolsSheet .sheet-head h3').textContent='Conversation';
  body.appendChild(el('p','hint',esc(c.title||'New chat')));
  for(const [label,fn] of [['Rename',()=>renameConversation(c)],[c.pinned?'Unpin conversation':'Pin conversation',()=>{c.pinned=!c.pinned;save();renderSidebar();}],['Delete conversation',async()=>{if(!studioCanNavigate())return;if(await confirmDialog('Delete this conversation?',{title:'Delete conversation',danger:true,confirmText:'Delete'})){db.conversations=db.conversations.filter(x=>x.id!==c.id);if(conv?.id===c.id)conv=null;save();renderAll();}}]]){const b=el('button','btn secondary',label);if(label.startsWith('Delete'))b.classList.add('danger');b.onclick=()=>{closeSheet('toolsSheet');fn();};body.appendChild(b);}openSheet('toolsSheet');
}
function studioExtractCodeBlock(content){
  const text=String(content||'');const opening=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n/gm;let match;
  while((match=opening.exec(text))){
    const fence=match[1],info=match[2].trim();if(fence[0]==='`'&&info.includes('`'))continue;
    const start=opening.lastIndex,rest=text.slice(start),closing=new RegExp('^ {0,3}'+fence[0]+'{'+fence.length+',}[ \\t]*(?:\\r?\\n|$)','m').exec(rest);
    return {lang:(info.split(/\s+/)[0]||'text').toLowerCase(),code:closing?rest.slice(0,closing.index):rest};
  }
  return null;
}
function studioThemeName(){return db.theme==='system'?'System':db.theme==='light'?'Light':'Dark';}
function renderStudioAppearance(){renderSettingsPage('Appearance',null,null,list=>{
  list.appendChild(el('p','settings-hub-intro','Comfortable in the morning. Easy on the eyes at night.'));
  const grid=el('div','studio-theme-grid');['light','dark','system'].forEach(t=>{const b=el('button','studio-theme-option'+(db.theme===t?' active':''));b.dataset.themeChoice=t;b.setAttribute('aria-pressed',String(db.theme===t));b.innerHTML=`<span class="studio-theme-mini ${t}"></span><span>${t[0].toUpperCase()+t.slice(1)}</span>`;b.onclick=()=>{db.theme=t;applyTheme();save();grid.querySelectorAll('button').forEach(n=>{n.classList.toggle('active',n.dataset.themeChoice===t);n.setAttribute('aria-pressed',String(n.dataset.themeChoice===t));});};grid.appendChild(b);});list.appendChild(grid);
  // Accent colour: Iris is Kita's identity (and the app icon); the others are personal choices.
  const swatchColor={iris:'#7c6cf0',lagoon:'#14a394',ocean:'#3b7ce8',sunset:'#ea6a3a',forest:'#3f9a63'};
  list.appendChild(el('div','settings-section-label','Accent colour'));
  const accents=el('div','accent-row');accents.setAttribute('role','radiogroup');accents.setAttribute('aria-label','Accent colour');
  const current=ACCENTS.some(a=>a.id===db.accent)?db.accent:'iris';
  ACCENTS.forEach(a=>{const b=el('button','accent-swatch',`<i style="background:${swatchColor[a.id]}"></i><span>${a.name}</span>`);b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(a.id===current));b.tabIndex=a.id===current?0:-1;b.dataset.accent=a.id;
    b.onclick=()=>{db.accent=a.id;applyTheme();save();accents.querySelectorAll('.accent-swatch').forEach(n=>{const on=n.dataset.accent===a.id;n.setAttribute('aria-checked',String(on));n.tabIndex=on?0:-1;});};
    b.onkeydown=e=>{if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();const all=[...accents.children],i=all.indexOf(b),next=all[(i+(e.key==='ArrowRight'||e.key==='ArrowDown'?1:all.length-1))%all.length];next.focus();next.click();};
    accents.appendChild(b);});
  list.appendChild(accents);
  const card=el('div','settings-hub-group'),row=el('div','settings-row appearance-size-row');row.innerHTML='<div class="sr-text"><strong>Conversation text</strong><small>A little more room to read.</small></div>';const select=el('select');select.setAttribute('aria-label','Conversation text size');select.innerHTML='<option value="small">Small</option><option value="default">Default</option><option value="large">Larger</option><option value="extra">Extra large</option>';select.value=['small','large','extra'].includes(db.textSize)?db.textSize:'default';select.onchange=()=>{db.textSize=select.value;document.documentElement.dataset.textSize=db.textSize;applyComfort();save();};row.appendChild(select);card.appendChild(row);list.appendChild(card);renderComfortControls(list);
});}
function renderStudioWorkspaceSettings(){renderSettingsPage('Workspace',null,null,list=>{
  const group=el('div','settings-hub-group');group.appendChild(settingsHubRow('workspace','Projects','Shared instructions and reference material',()=>{closeSheet('setSheet');studioNavigate('projects');}));group.appendChild(settingsHubRow('skills','Library','Saved prompts and artifacts',()=>{closeSheet('setSheet');studioNavigate('library');}));list.appendChild(group);
  list.appendChild(el('div','settings-section-label','Data & backup'));
  const note=el('p','hint','Backups can contain private conversations. Store exported files securely. Provider keys are excluded from a standard backup.');list.appendChild(note);
  for(const [label,fn] of [['Export backup',exportBackup],['Export encrypted backup',exportEncryptedBackup],['Restore backup',importBackup]]){const b=el('button','btn secondary',label);b.onclick=fn;list.appendChild(b);}
});}
function studioOverlayOpened(id){const panel=$('#'+id);if(!panel)return;studioOverlayFocus.set(id,document.activeElement);panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',panel.querySelector('h3')?.textContent||'Dialog');panel.tabIndex=-1;requestAnimationFrame(()=>{if(panel.classList.contains('open'))panel.focus({preventScroll:true});});}
function studioOverlayClosed(id){const target=studioOverlayFocus.get(id);studioOverlayFocus.delete(id);if(target?.isConnected&&target.getClientRects().length&&getComputedStyle(target).visibility==='visible')target.focus({preventScroll:true});}
function studioTopOverlay(){return $('#providerPresetDialog .preset-picker')||$('#previewMenu.open')||$('#customDialogScrim.open .custom-dialog')||document.querySelector('.modal-scrim.open .modal')||$('#htmlPreview.open')||[...document.querySelectorAll('.sheet.open')].at(-1)||(innerWidth<=760?$('#sidebar.open #sidebarPanel'):null);}
function initializeStudio(){
  document.querySelectorAll('[data-kita-mark]').forEach(n=>n.innerHTML=kitaMark());document.querySelectorAll('[data-kita-icon]').forEach(n=>n.innerHTML=kitaIcon(n.dataset.kitaIcon));
  const controls=$('#studioChatControls');[['tglSearch','Search the web','Bring current information into the conversation.'],['tglThink','Think it through','Reasoning controls for this conversation.'],['effortBtn','Reasoning depth','Choose how much reasoning to request.'],['skillBtn','Skills','Automatic or hand-picked expert guidance.']].forEach(([id,title,description])=>{const row=el('div','studio-tool-row');row.innerHTML=`<div><strong>${title}</strong><small>${description}</small></div>`;row.appendChild($('#'+id));controls.appendChild(row);});
  const tools=$('#moreToolsBtn');tools.innerHTML=kitaIcon('settings')+'<span class="tool-label">Tools</span><span class="studio-tool-count" hidden></span>';tools.setAttribute('aria-label','Conversation tools');
  $('#inputRow').appendChild($('#attachBtn'));$('.composer-foot').appendChild($('#sendBtn'));
  $('.model-orb').innerHTML=kitaMark();$('#bottomModelBtn').insertAdjacentHTML('beforeend',kitaIcon('chevron'));
  $('#settingsBtn').innerHTML=kitaIcon('settings')+'<span>Settings</span>';$('#settingsBtn').title='Settings';$('#settingsBtn').setAttribute('aria-label','Settings');$('#appVersion').textContent='v'+APP_VERSION;
  document.querySelectorAll('[data-studio-view]').forEach(b=>b.onclick=()=>studioNavigate(b.dataset.studioView));
  document.querySelectorAll('[data-close]').forEach(b=>b.setAttribute('aria-label','Close dialog'));
  $('.onboarding-mark').innerHTML=kitaMark();
  window.nazSystemThemeChanged=()=>{if(db.theme==='system')applyTheme();};
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',window.nazSystemThemeChanged);
  document.addEventListener('keydown',e=>{
    const overlay=studioTopOverlay();if(!overlay)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(overlay.classList.contains('preset-picker')){$('#providerPresetDialog').dismiss();return;}if(overlay.id==='previewMenu'){$('#previewMenu').classList.remove('open');$('#previewMenuScrim').style.display='none';$('#previewMore').focus();return;}if($('#customDialogScrim.open'))closeCustomDialog(null);else{const modal=overlay.closest('.modal-scrim');if(modal){modal.classList.remove('open');studioOverlayClosed(modal.id);}else if(overlay.id==='htmlPreview')closePreview();else if(overlay.classList.contains('sheet'))closeSheet(overlay.id);else closeSidebar();}return;}
    if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"],summary')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility==='visible');if(!nodes.length){e.preventDefault();return;}const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||!overlay.contains(document.activeElement)||document.activeElement===overlay)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!overlay.contains(document.activeElement)||document.activeElement===overlay)){e.preventDefault();first.focus();}}
  },true);
}
