/* In-app preset picker; preserves the original provider configuration contract. */
function openProviderPresetPicker(formState,trigger){
 document.querySelector('#providerPresetDialog')?.remove();
 const scrim=el('div','preset-picker-scrim');scrim.id='providerPresetDialog';
 const dialog=el('section','preset-picker');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','presetPickerTitle');
 const header=el('div','preset-picker-head'),heading=el('div');heading.innerHTML='<h3 id="presetPickerTitle">Choose a provider</h3><p>Connect your models with your own API key.</p>';
 const close=el('button','icon-btn','×');close.type='button';close.setAttribute('aria-label','Close provider picker');header.append(heading,close);
 const search=el('input','preset-picker-search');search.type='search';search.placeholder='Search providers';search.setAttribute('aria-label','Search providers');
 const list=el('div','preset-picker-list');
 const dismiss=()=>{document.removeEventListener('keydown',keyboard,true);scrim.remove();if(trigger.isConnected)trigger.focus();};
 scrim.dismiss=dismiss;
 const keyboard=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();dismiss();}if(event.key==='Tab'){const nodes=[...dialog.querySelectorAll('button,input')].filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};
 const draw=()=>{list.replaceChildren();const query=search.value.trim().toLowerCase();for(const preset of PROVIDER_PRESETS){if(!`${preset.name} ${preset.hint}`.toLowerCase().includes(query))continue;
 const button=el('button','preset-picker-item');button.type='button';button.setAttribute('aria-pressed',String(formState.presetId===preset.id));
 const badge=el('span','preset-picker-badge');badge.textContent=preset.name==='Custom endpoint'?'{}':preset.name.charAt(0);
 const text=el('span','preset-picker-text'),name=el('strong'),hint=el('small');name.textContent=preset.name;hint.textContent=preset.hint.replace(/[\u2013\u2014]/g,',');text.append(name,hint);
 const selected=el('span','preset-picker-check',formState.presetId===preset.id?'✓':'');selected.setAttribute('aria-hidden','true');button.append(badge,text,selected);
 button.onclick=()=>{formState.presetId=preset.id;formState.name=preset.name;formState.baseUrl=preset.baseUrl;formState.apiType=preset.apiType;dismiss();renderProvForm();document.querySelector('.provider-preset-trigger')?.focus();};list.appendChild(button);}
 if(!list.childNodes.length){const empty=el('p','hint','No matching provider. Try another name or choose Custom endpoint.');list.appendChild(empty);}};
 close.onclick=dismiss;scrim.onclick=e=>{if(e.target===scrim)dismiss();};search.oninput=draw;dialog.append(header,search,list);scrim.appendChild(dialog);document.body.appendChild(scrim);document.addEventListener('keydown',keyboard,true);draw();search.focus();
}
