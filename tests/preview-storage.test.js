const {launch, appUrl}=require('./browser');
const assert=require('node:assert/strict');

// Previews and the page test run pages without a site address, where the browser blocks
// localStorage, sessionStorage and cookies. Pages that save data must not be reported as
// broken because of that; real errors must still be reported with the right line.
(async()=>{
 const b=await launch();
 let failed=0;
 try{
  const p=await b.newPage({viewport:{width:390,height:844}});
  const pageErrors=[];p.on('pageerror',e=>pageErrors.push(e.message));
  await p.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
  await p.goto(appUrl);
  await p.waitForFunction(()=>typeof checkHtmlRuns==='function'&&typeof withStorageShim==='function');
  const saver='<!doctype html>\n<html>\n<head><title>Saver</title>\n<script>var early=localStorage.getItem("x");</script></head>\n<body><p id="out"></p>\n<script>\nvar n=Number(localStorage.getItem("n")||0)+1;localStorage.setItem("n",n);localStorage.extra="y";\nsessionStorage.setItem("s","1");document.cookie="theme=dark; path=/";\ndocument.getElementById("out").textContent="n="+n+" keys="+localStorage.length+" extra="+localStorage.getItem("extra")+" cookie="+document.cookie+" s="+sessionStorage.getItem("s")+" early="+early;\n</script></body></html>';

  // 1. Page test: no false SecurityError.
  assert.deepEqual(await p.evaluate(h=>checkHtmlRuns(h),saver),[]);
  console.log('PASS page test: localStorage, sessionStorage and cookies are not reported as errors');

  // 2. Real errors are still found, on the page's own line numbers.
  const buggy='<!doctype html>\n<html><head><title>Bug</title></head>\n<body>\n<script>\nlocalStorage.setItem("a","1");\nnotDefinedAnywhere();\n</script></body></html>';
  const errs=await p.evaluate(h=>checkHtmlRuns(h),buggy);
  assert.equal(errs.length,1,JSON.stringify(errs));
  assert.match(errs[0],/notDefinedAnywhere is not defined \(line 6\)/);
  console.log('PASS page test: real errors still reported with the right line');

  // 3. In-app preview (sandboxed iframe): the page runs and its saved values read back.
  await p.evaluate(h=>openPreview(h,{inApp:true}),saver);
  const frame=await (async()=>{for(let i=0;i<50;i++){const f=p.frames().find(f=>f!==p.mainFrame()&&f.url()!=='about:blank'||f.name()==='');const hit=await Promise.all(p.frames().filter(f=>f!==p.mainFrame()).map(async f=>((await f.locator('#out').count().catch(()=>0))?f:null)));const got=hit.find(Boolean);if(got)return got;await p.waitForTimeout(100);}return null;})();
  assert(frame,'preview frame with the page not found');
  await frame.waitForFunction(()=>document.getElementById('out')?.textContent,null,{timeout:5000});
  assert.equal(await frame.locator('#out').innerText(),'n=1 keys=2 extra=y cookie=theme=dark s=1 early=null');
  assert.equal(await p.locator('#previewConsole .console-line.err').count(),0);
  console.log('PASS preview: the page saves and reads values without errors');

  // 4. A page with no address at all (like the Android preview) also runs.
  const shimmed=await p.evaluate(h=>withStorageShim(h),saver);
  const d=await b.newPage();const dErrors=[];d.on('pageerror',e=>dErrors.push(e.message));
  await d.goto('data:text/html;charset=utf-8,'+encodeURIComponent(shimmed));
  assert.equal(await d.locator('#out').innerText(),'n=1 keys=2 extra=y cookie=theme=dark s=1 early=null');
  assert.deepEqual(dErrors,[]);
  await d.close();
  console.log('PASS page without an address: in-memory storage stands in');

  // 5. Where storage works, it is left alone (real Storage, data persists).
  const real=await b.newPage();
  await real.route('https://site.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:shimmed}));
  await real.goto('https://site.test/');await real.goto('https://site.test/');
  assert.match(await real.locator('#out').innerText(),/^n=2 /);
  assert(await real.evaluate(()=>localStorage instanceof Storage));
  await real.close();
  console.log('PASS real site: browser storage is not replaced');

  // 6. Shim only in preview and test: line count unchanged, applied once, files unchanged.
  const once=await p.evaluate(h=>{const a=withStorageShim(h);return {same:withStorageShim(a)===a,lines:a.split('\n').length===h.split('\n').length};},saver);
  assert.deepEqual(once,{same:true,lines:true});
  const files=await p.evaluate(h=>projectFiles({files:[{name:'index.html',raw:h,lang:'html'}]}).map(f=>String(f.content||'')).join('\n'),saver);
  assert.match(files,/localStorage\.setItem\("n",n\)/,'project files missing the page');
  assert(!/function mem\(\)\{var d=Object\.create\(null\)/.test(files),'published files must not contain the preview shim');
  for(const frag of ['<p>x</p>','<html><body><script>localStorage.a=1</script></body></html>','<!doctype html><body>y</body>'])
    assert(await p.evaluate(h=>withStorageShim(h).includes('function mem(){'),frag));
  console.log('PASS shim is added once, keeps line numbers and stays out of published files');
  assert(!pageErrors.some(m=>/SecurityError|localStorage|sessionStorage|cookie/i.test(m)),JSON.stringify(pageErrors));
 }catch(e){failed++;console.error('FAIL',e);}
 await b.close();
 if(failed)process.exit(1);
 console.log('PASS preview storage: no false storage errors in preview and page test');
})();
