const {launch, appUrl}=require('./browser');
const assert=require('assert');

(async()=>{
  const b=await launch();
  const p=await b.newPage({viewport:{width:360,height:800}});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  // Optional font loads must not delay DOM-only checks; app scripts remain blocking.
  await p.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(250);
  const mobile=await p.evaluate(()=>{
    const root=getComputedStyle(document.documentElement), modal=getComputedStyle(document.querySelector('.modal'));
    return {
      overflow:document.documentElement.scrollWidth<=innerWidth,
      bg:root.getPropertyValue('--bg').trim(),
      accent:root.getPropertyValue('--accent').trim(),
      modalRadius:modal.borderRadius,
      modalHasGradient:!!modal.backgroundImage&&modal.backgroundImage!=='none',
      svgTools:document.querySelectorAll('.tool-btn svg').length,
      sendWidth:document.querySelector('#sendBtn').getBoundingClientRect().width
    };
  });
  assert(mobile.overflow,'mobile layout has horizontal overflow');
  assert(mobile.bg==='#171920','Studio ink background missing: '+mobile.bg);
  assert(mobile.accent==='#bdadff','Studio iris accent missing: '+mobile.accent);
  assert(mobile.modalRadius==='16px','dialog radius is not consistent: '+mobile.modalRadius);
  assert(!mobile.modalHasGradient,'dialog contains a gradient');
  assert(mobile.svgTools===5,'tool icon family incomplete: '+mobile.svgTools);
  assert(mobile.sendWidth>=44&&mobile.sendWidth<=52,'send control is not touch-sized');
  console.log('PASS mobile minimalist visual tokens and controls');

  await p.setViewportSize({width:1440,height:900});await p.waitForTimeout(150);
  const desktop=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth<=innerWidth,composer:document.querySelector('#composer').getBoundingClientRect().width,chat:document.querySelector('#chatInner').getBoundingClientRect().width}));
  assert(desktop.overflow,'desktop layout has horizontal overflow');
  assert(desktop.composer<=860,'composer exceeds desktop measure');
  assert(desktop.chat<=860,'chat measure exceeds readable width');
  console.log('PASS desktop readable measure and overflow');

  await p.setViewportSize({width:390,height:844});
  await p.evaluate(()=>{
    conv={id:'ui-test',title:'UI test',providerId:null,modelId:null,messages:[{id:'u',role:'user',content:'test'}]};
    renderAll();
    const wrap=document.createElement('div');wrap.className='msg assistant';const bubble=document.createElement('div');bubble.className='bubble';wrap.appendChild(bubble);document.querySelector('#chatInner').appendChild(wrap);
    renderLiveCode(bubble,{lang:'html',body:'<!doctype html>\n'+Array.from({length:80},(_,i)=>'<p>line '+i+'</p>').join('\n')});
  });
  const terminal=await p.evaluate(()=>{const body=document.querySelector('.code-live-body'),box=document.querySelector('.code-live');return {height:body.getBoundingClientRect().height,scroll:body.scrollHeight,box:box.getBoundingClientRect().height,hasDots:document.querySelectorAll('.term-dots i').length};});
  assert(terminal.height>100&&terminal.height<240,'terminal is not fixed to about 10 lines: '+terminal.height);
  assert(terminal.scroll>terminal.height,'terminal does not scroll internally');
  assert(terminal.hasDots===3,'terminal chrome missing');
  console.log('PASS fixed-height internal terminal scroll');

  const source=require('fs').readFileSync('nazchat/index.html','utf8');
  assert(!/window\.(alert|confirm|prompt)\s*\(/.test(source),'native browser dialog remains in source');
  await p.evaluate(()=>{customDialog({title:'Delete conversation',message:'Delete this conversation?',danger:true,confirmText:'Delete'});});await p.waitForTimeout(100);
  const dialog=await p.evaluate(()=>{const box=document.querySelector('.custom-dialog'),confirm=document.querySelector('#customDialogConfirm'),style=getComputedStyle(box);return {open:document.querySelector('#customDialogScrim').classList.contains('open'),radius:style.borderRadius,border:style.border,button:confirm.textContent,buttonClass:confirm.className};});
  assert(dialog.open,'custom dialog did not open');
  assert(dialog.radius==='16px','custom dialog radius wrong: '+dialog.radius);
  assert(dialog.button==='Delete'&&dialog.buttonClass.includes('danger'),'destructive dialog action missing');
  await p.click('#customDialogCancel');

  await p.evaluate(()=>{openSheet('modelSheet')});await p.waitForTimeout(100);
  assert(await p.locator('#modelSheet.open').count(),'model sheet did not open');
  const sheet=await p.evaluate(()=>{const s=getComputedStyle(document.querySelector('#modelSheet'));return {radius:s.borderTopLeftRadius,shadow:s.boxShadow};});
  assert(sheet.radius==='22px','sheet does not match the Studio system: '+sheet.radius);
  await p.evaluate(()=>closeSheet('modelSheet'));
  await p.evaluate(()=>{renderProvList();openSheet('setSheet');});await p.waitForTimeout(100);
  const hub=await p.evaluate(()=>({title:document.querySelector('#setSheetTitle').textContent,rows:document.querySelectorAll('.settings-hub-row').length,providerCards:document.querySelectorAll('.provider-card').length}));
  assert(hub.title==='Settings'&&hub.rows===9,'settings hub is not grouped: '+JSON.stringify(hub));
  assert(hub.providerCards===0,'provider list leaked into settings hub');
  await p.evaluate(()=>document.querySelector('.settings-hub-row').click());await p.waitForTimeout(100);
  assert(await p.locator('#setSheetTitle').filter({hasText:'Providers'}).count(),'provider drill-down did not open');
  assert(await p.locator('.settings-subnav').count(),'provider sub-navigation missing');
  await p.evaluate(()=>renderSettingsHub());
  await p.evaluate(()=>document.querySelectorAll('.settings-hub-row')[2].click());await p.waitForTimeout(100);
  assert(await p.locator('#skillSheet.open').count(),'skill library drill-down did not open');
  assert(await p.locator('.skill-search').count(),'skill library search missing');
  await p.evaluate(()=>{closeSheet('skillSheet');closeSheet('setSheet');});
  await p.evaluate(()=>{renderSettingsHub();openSheet('setSheet');[...document.querySelectorAll('.settings-hub-row')].find(row=>row.querySelector('strong')?.textContent==='About').click();});await p.waitForTimeout(100);
  assert(await p.locator('#setSheetTitle').filter({hasText:'About'}).count(),'About drill-down did not open');
  assert(await p.locator('#checkUpdateBtn').count(),'update button missing in About');
  await p.evaluate(()=>{document.querySelector('#onboardingScrim')?.classList.remove('open');checkForUpdate();});
  await p.waitForTimeout(100);
  assert.deepStrictEqual(errors,[],'page errors: '+errors.join('; '));
  console.log('PASS no page errors');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
