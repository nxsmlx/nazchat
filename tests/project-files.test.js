const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const {launch,appUrl,root}=require('./browser');
/* 4.19.0 project files: a page is split into index.html + css/ + js/ for download and publish
   when Code is set to separate files; multi-file answers preview with their own CSS/JS; every
   project downloads as a valid .zip. */
(async()=>{const b=await launch();try{
const page=await b.newPage({viewport:{width:390,height:844},hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://raw.githubusercontent.com/**',r=>r.abort());await page.route('https://api.github.com/**',r=>r.abort());
await page.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});
await page.evaluate(()=>{db.onboardingDone=true;save();});await page.goto(page.url(),{waitUntil:'domcontentloaded'});

// 1. Split: styles and classic/module scripts move out; JSON, external and print styles stay.
const src=`<!doctype html>
<html><head><meta charset="utf-8"><title>Kopi</title>
<style id="kita-design-system">
  :root{--brand:#2b5d3a}
</style>
<style>
  body{margin:0}
</style>
<style media="print">nav{display:none}</style>
<script type="application/ld+json">{"@type":"Cafe"}</script>
<script src="https://example.com/lib.js"></script>
</head><body><button onclick="order()"><i data-icon="coffee"></i> Order</button>
<script>
  function order(){document.body.dataset.ordered='1'}
</script>
<script type="module">
  import x from './x.js';
</script>
</body></html>`;
const split=await page.evaluate(s=>splitHtmlProject(s),src);
assert.deepEqual(split.map(f=>f.path),['index.html','css/styles.css','js/app.js','js/main.js']);
const [idx,css,js,mod]=split.map(f=>f.content);
assert.equal((idx.match(/<link rel="stylesheet" href="css\/styles\.css">/g)||[]).length,1);
assert.match(idx,/<script src="js\/app\.js"><\/script>\n<script type="module" src="js\/main\.js"><\/script>\n<\/body>/);
assert.match(idx,/<style media="print">nav\{display:none\}<\/style>/);assert.match(idx,/application\/ld\+json/);assert.match(idx,/https:\/\/example\.com\/lib\.js/);
assert.doesNotMatch(idx,/function order|--brand|body\{margin:0\}/);
assert.equal(css,'/* kita-design-system */\n:root{--brand:#2b5d3a}\n\nbody{margin:0}\n');
assert.equal(js,"function order(){document.body.dataset.ordered='1'}\n");
assert.equal(mod,"import x from './x.js';\n");
assert.deepEqual(await page.evaluate(()=>splitHtmlProject('<p>plain</p>')),[{path:'index.html',content:'<p>plain</p>'}]);
console.log('PASS split: CSS and JS move to css/ and js/, data scripts and print styles stay');
// The split site still works when opened from its files: CSS applies and the script runs.
{const dir=path.join(root,'test-results/project-files/site');fs.rmSync(dir,{recursive:true,force:true});
 for(const f of split){const p=path.join(dir,f.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,f.path==='js/main.js'?'':f.content);}
 const site=await b.newPage();await site.route('https://example.com/**',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
 await site.goto('file://'+path.join(dir,'index.html'));
 assert.equal(await site.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()),'#2b5d3a');
 assert.equal(await site.evaluate(()=>getComputedStyle(document.body).marginTop),'0px');
 await site.click('button');assert.equal(await site.evaluate(()=>document.body.dataset.ordered),'1');
 await site.close();
 console.log('PASS the split files work as a site: styles load and the button script runs');}

// 2. Files for publish / download follow the Code setting; icons are inlined in HTML only.
const files=await page.evaluate(s=>{const info={name:'index.html',rawCode:s,lang:'html',isPage:true};
  const one=projectFiles(info).map(f=>f.path);db.codeFiles='separate';const sep=projectFiles(info);const pub=siteFilesFrom(info).map(f=>f.path);delete db.codeFiles;
  const multi=projectFiles({files:[{name:'home.html',raw:'<!doctype html><html><body><i data-icon="x"></i></body></html>',lang:'html'},{name:'styles.css',raw:'a{}',lang:'css'}]});
  return {one,sep:sep.map(f=>f.path),sepHtml:sep[0].content,pub,multi};},src);
assert.deepEqual(files.one,['index.html']);
assert.deepEqual(files.sep,['index.html','css/styles.css','js/app.js','js/main.js']);
assert.deepEqual(files.pub,files.sep,'publish uses the same layout');
assert.match(files.sepHtml,/<svg[^>]*class="kita-icon"/);
assert.deepEqual(files.multi.map(f=>f.path),['index.html','styles.css']);assert.match(files.multi[0].content,/<svg/);
console.log('PASS project files: one file by default, separate on request, publish matches');

// 3. A real .zip: names, contents and CRCs verified by Python's zipfile.
const b64=await page.evaluate(s=>bytesToBase64(makeZip(splitHtmlProject(s),new Date(2026,10,12,10,30,0))),src);
const out=path.join(root,'test-results/project-files');fs.mkdirSync(out,{recursive:true});const zipPath=path.join(out,'kopi.zip');
fs.writeFileSync(zipPath,Buffer.from(b64,'base64'));
const report=execFileSync('python3',['-c',`import zipfile,sys,json
z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None
print(json.dumps({i.filename:[z.read(i).decode('utf-8'),i.date_time[:5],i.flag_bits&0x800] for i in z.infolist()}))`,zipPath],{encoding:'utf8'});
const zip=JSON.parse(report);
assert.deepEqual(Object.keys(zip),['index.html','css/styles.css','js/app.js','js/main.js']);
assert.equal(zip['css/styles.css'][0],css);assert.deepEqual(zip['js/app.js'][1],[2026,11,12,10,30]);assert.equal(zip['index.html'][2],0x800);
console.log('PASS zip: valid archive with the split files');

// 4. Code home: Files picker, read-only default, saved choice.
await page.evaluate(()=>{conv=null;setKitaMode('code');renderAll();});
const pick=page.locator('select[aria-label="How pages are saved and published"]');await pick.waitFor();
assert.equal(await pick.inputValue(),'single');assert.equal(await page.evaluate(()=>'codeFiles' in db),false);
await pick.tap();await page.locator('.kita-select').waitFor();
assert.match(await page.locator('.kita-select-option',{hasText:'Separate files'}).innerText(),/Production layout/);
await page.locator('.kita-select-option',{hasText:'Separate files'}).click();await page.locator('.kita-select-scrim').waitFor({state:'detached'});
assert.equal(await page.evaluate(()=>db.codeFiles),'separate');
assert.match(await pick.locator('xpath=ancestor::label').locator('small').innerText(),/css\/styles\.css/);
console.log('PASS Code home Files picker saves the layout');

// 5. A multi-file answer: Open previews with its own CSS/JS; menu offers the project .zip.
await page.evaluate(()=>{
  const answer='Here are the files.\n\n```html index.html\n<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Kopi</h1><script src="./app.js"></script></body></html>\n```\n\n```css styles.css\nh1{color:rgb(1,2,3)}\n```\n\n```js app.js\ndocument.title="ok";\n```\n';
  const c={id:'cv1',title:'Kopi',mode:'code',messages:[{id:'u1',role:'user',content:'build',timestamp:1},{id:'a1',role:'assistant',content:answer,timestamp:2}],createdAt:1,updatedAt:2};
  db.conversations.unshift(c);conv=c;renderAll();
  window.__pv=null;openPreview=(h)=>{window.__pv=h;};window.__zip=null;saveBinaryFile=(n,bytes)=>{window.__zip=[n,bytes.length];return true;};
});
const card=page.locator('.artifact-card').first();await card.waitFor();
await card.getByRole('button',{name:/^Open/}).click();
const pv=await page.evaluate(()=>window.__pv);
assert.match(pv,/<style data-file="styles\.css">\nh1\{color:rgb\(1,2,3\)\}/);assert.match(pv,/<script data-file="\.\/app\.js">\ndocument\.title="ok";/);
assert.doesNotMatch(pv,/href="styles\.css"|src="\.\/app\.js"/);
await card.locator('.artifact-more').click();
await page.getByRole('menuitem',{name:'Download project (.zip)'}).click();
const zipped=await page.evaluate(()=>window.__zip);
assert.equal(zipped[0],'kopi.zip');assert(zipped[1]>100);
console.log('PASS multi-file answer previews with its own CSS/JS and downloads as a .zip');
assert.deepEqual(errors,[]);
console.log('PASS project files: split, preview, publish layout, zip and Code setting');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
