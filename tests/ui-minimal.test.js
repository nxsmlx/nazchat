const {chromium}=require('/tmp/node_modules/playwright-core');
const assert=require('assert');

(async()=>{
  const b=await chromium.launch({executablePath:'/usr/bin/chromium-headless-shell',args:['--no-sandbox']});
  const p=await b.newPage({viewport:{width:360,height:800}});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('file:///data/user/0/id.griphub.agent/files/home/workspace/build-a-web-app-116-648/nazchat/index.html');
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
  assert(mobile.bg==='#0f1012','minimal graphite background missing: '+mobile.bg);
  assert(mobile.accent==='#8490a3','muted accent missing: '+mobile.accent);
  assert(mobile.modalRadius==='14px','dialog radius is not consistent');
  assert(!mobile.modalHasGradient,'dialog contains a gradient');
  assert(mobile.svgTools===5,'tool icon family incomplete: '+mobile.svgTools);
  assert(mobile.sendWidth>=36&&mobile.sendWidth<=44,'send control is not touch-sized');
  console.log('PASS mobile minimalist visual tokens and controls');

  await p.setViewportSize({width:1440,height:900});await p.waitForTimeout(150);
  const desktop=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth<=innerWidth,composer:document.querySelector('#composer').getBoundingClientRect().width,chat:document.querySelector('#chatInner').getBoundingClientRect().width}));
  assert(desktop.overflow,'desktop layout has horizontal overflow');
  assert(desktop.composer<=820,'composer exceeds desktop measure');
  assert(desktop.chat<=820,'chat measure exceeds readable width');
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

  await p.evaluate(()=>{openSheet('modelSheet')});await p.waitForTimeout(100);
  assert(await p.locator('#modelSheet.open').count(),'model sheet did not open');
  const sheet=await p.evaluate(()=>{const s=getComputedStyle(document.querySelector('#modelSheet'));return {radius:s.borderTopLeftRadius,shadow:s.boxShadow};});
  assert(sheet.radius==='16px','sheet is not minimalist');
  await p.evaluate(()=>closeSheet('modelSheet'));
  assert.deepStrictEqual(errors,[],'page errors: '+errors.join('; '));
  console.log('PASS no page errors');
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
