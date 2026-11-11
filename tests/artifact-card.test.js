const {launch, appUrl}=require('./browser');
const assert=require('assert');

// 4.8.2: whole pages and long files show as an artifact card (title, kind, lines,
// Open / Code / More) instead of a wall of code; short snippets stay inline.
(async()=>{
 const b=await launch();const page=await b.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
 await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');
 await page.locator('#onboardingSkip').click();
 const html='<!DOCTYPE html>\n<html>\n<head>\n<title>Kedai Kopi &amp; Teh</title>\n</head>\n<body>\n<h1>Hello</h1>\n</body>\n</html>';
 const show=(content,extra)=>page.evaluate(([content,extra])=>{conv={id:'c',title:'t',messages:[{id:'u',role:'user',content:'q'},{id:'a',role:'assistant',content,...extra}]};renderAll();
   const bb=document.querySelector('.msg.assistant .bubble');
   return [...bb.querySelectorAll('.artifact-card')].map(c=>({kind:c.dataset.kind,title:c.querySelector('.artifact-title strong').textContent,meta:c.querySelector('.artifact-title small').textContent,buttons:[...c.querySelectorAll('.artifact-actions > button')].map(x=>x.textContent.trim()||x.getAttribute('aria-label')),codeVisible:getComputedStyle(c.querySelector('.code-wrap')).display!=='none'}));
 },[content,extra||{}]);
 try{
  // A short page is still a card (it is a whole page), titled from <title>.
  const pageCards=await show('Here it is.\n\n```html\n'+html+'\n```',{codeChecks:[{errors:['boom']},{errors:[]}]});
  assert.equal(pageCards.length,1);
  assert.deepEqual({...pageCards[0],buttons:pageCards[0].buttons.slice(0,3)},{kind:'page',title:'Kedai Kopi & Teh',meta:'Web page · 9 lines · ✓ tested',buttons:['Open','Publish','Code'],codeVisible:false});
  // Open goes to the preview; Code reveals the full viewer, expanded.
  await page.getByRole('button',{name:'Open Kedai Kopi & Teh'}).click();
  assert.ok(await page.evaluate(()=>$('#htmlPreview').classList.contains('open')));
  assert.match(await page.evaluate(()=>$('#previewCode').value),/<title>Kedai Kopi &amp; Teh<\/title>/);
  await page.evaluate(()=>closePreview?closePreview():$('#htmlPreview').classList.remove('open'));
  await page.evaluate(()=>document.querySelector('.artifact-card .artifact-btn:not(.primary):not(.artifact-more):not(.publish)').click());
  const shown=await page.evaluate(()=>{const c=document.querySelector('.artifact-card');return {cls:c.classList.contains('show-code'),btn:c.querySelector('[aria-expanded="true"]')?.textContent,collapsed:c.querySelector('.code-wrap').classList.contains('collapsed'),code:c.querySelector('.code-body').textContent.includes('<h1>Hello</h1>')};});
  assert.deepEqual(shown,{cls:true,btn:'Hide code',collapsed:false,code:true});
  // More menu: copy and download.
  await page.evaluate(()=>{window.__saved=[];window.downloadText=(n,t)=>window.__saved.push([n,t.length]);});
  await page.locator('.artifact-more').click();
  const items=await page.locator('.artifact-actions .msg-menu-item').allTextContents();
  assert.deepEqual(items.slice(0,2),['Copy code','Download snippet.html']);
  await page.locator('.artifact-actions .msg-menu-item',{hasText:'Download'}).click();
  assert.equal((await page.evaluate(()=>window.__saved))[0][0],'snippet.html');

  // Failing test result is shown on the card.
  const failing=await show('```html\n'+html+'\n```',{codeChecks:[{errors:['a']},{errors:['a','b']}]});
  assert.match(failing[0].meta,/· 2 errors$/);

  // Long non-page code: card with View code; short snippets stay as plain code blocks.
  const py=Array.from({length:40},(_,i)=>`print(${i})`).join('\n');
  const codeCards=await show('```python\n'+py+'\n```');
  assert.deepEqual(codeCards.map(c=>[c.kind,c.title,c.meta,c.buttons[0]]),[['code','snippet.py','PYTHON file · 40 lines','View code']]);
  assert.deepEqual(await show('```js\nconst a = 1;\n```'),[]);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.msg.assistant .code-wrap').length),1);

  // Several files including a page: one card for the set, tabs inside.
  const multi=await show('Files:\n\n```html\n'+html+'\n```\n\n```css\nbody{margin:0}\n```');
  assert.equal(multi.length,1);assert.match(multi[0].meta,/^Web page \+ 1 more file · 10 lines/);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.artifact-card .code-tab').length),2);
  // Two short snippets keep the plain tab viewer.
  assert.deepEqual(await show('```js\nlet a=1\n```\n\n```css\nb{}\n```'),[]);
  assert.deepEqual(errors,[]);
  console.log('PASS artifact cards: pages and long files as cards with Open/Code/More and test status; short snippets inline');
 }catch(e){console.error(e);process.exitCode=1;}finally{await b.close();}
})();
