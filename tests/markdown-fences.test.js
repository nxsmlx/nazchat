const {launch, appUrl}=require('./browser');
const assert=require('assert');

// A provider glued a notice to the opening fence ("…5.5.```html"), so the page code
// rendered as prose plus a row of "snippet.html" tabs. Fences are now normalised.
(async()=>{
 const b=await launch();const page=await b.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
 await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function');
 const render=src=>page.evaluate(src=>{conv={id:'x',title:'t',messages:[{id:'u',role:'user',content:'q'},{id:'a',role:'assistant',content:src}]};renderAll();const bb=document.querySelector('.msg.assistant .bubble');
   return {tabs:bb.querySelectorAll('.code-tab').length,wraps:bb.querySelectorAll('.code-wrap').length,code:[...bb.querySelectorAll('.code-wrap')].map(w=>w.querySelector('.code-body').textContent.replace(/\s+/g,' ').trim()),text:bb.querySelector('.md')?.innerText||''};},src);
 try{
  const glued=await render('Claude Sonnet 4.6 is no longer available. Please switch to Claude Sonnet 5.5.```html\n<!DOCTYPE html>\n<html>\n<head>\n<style>\n:root {\n    --cream: #f5f0e8;\n}\n</style>\n</head>\n<body>\n    <div class="cursor"></div>\n</body>\n</html>\n```');
  assert.equal(glued.tabs,0);assert.equal(glued.wraps,1);
  assert.match(glued.code[0],/--cream: #f5f0e8;/);assert.match(glued.code[0],/class="cursor"/);
  assert.match(glued.text,/no longer available/);
  const closing=await render('```js\nconst a = 1;\nconsole.log(a);```\nDone.');
  assert.equal(closing.wraps,1);assert.match(closing.code[0],/console\.log\(a\);/);assert.match(closing.text,/Done\./);
  const prose=await render('Use ``` to start a fence, and `inline` code stays inline.');
  assert.equal(prose.wraps,0);assert.match(prose.text,/Use ``` to start a fence/);
  const normalSrc='Intro\n\n```css\nbody { margin: 0 }\n```\n\n```js\nlet x = 2\n```\n\nInline ```not a fence``` here.';
  assert.equal(await page.evaluate(s=>normalizeFences(s),normalSrc),normalSrc,'well-formed Markdown is left untouched');
  const normal=await render(normalSrc);assert.equal(normal.tabs,2,'two real blocks become two file tabs');
  assert.equal(await page.evaluate(()=>runnableHtml(conv.messages[1].content)),'','prose has no runnable page');
  assert.match(await page.evaluate(()=>normalizeFences('Note.```html\n<html><body>x</body></html>\n```')),/^Note\.\n```html\n/);
  assert.deepEqual(errors,[]);
  console.log('PASS glued and trailing code fences render as one code block; inline and normal fences unchanged');
 }catch(e){console.error(e);process.exitCode=1;}finally{await b.close();}
})();
