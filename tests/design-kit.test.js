const assert=require('node:assert/strict');const {launch,appUrl}=require('./browser');
/* 4.18.0 design kit: bundled Lucide icons swapped in for preview / publish, style presets
   with open font pairings on Code home, passed to builds and the Designer agent, and the
   new design skills route to the right requests. */
(async()=>{const b=await launch();try{
const page=await b.newPage({viewport:{width:390,height:844},hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://raw.githubusercontent.com/**',r=>r.abort());await page.route('https://api.github.com/**',r=>r.abort());
await page.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});
await page.evaluate(()=>{db.onboardingDone=true;save();});await page.goto(page.url(),{waitUntil:'domcontentloaded'});

// 1. Icons: placeholder → inline SVG; class and label kept; unknown names untouched; idempotent.
const r=await page.evaluate(()=>{
  const src='<!doctype html><html><head><title>t</title></head><body><button><i data-icon="search" class="ico"></i> Search</button><span data-icon="x" aria-label="Close"></span><i data-icon="no-such-icon"></i></body></html>';
  const once=kitaInlineIcons(src),twice=kitaInlineIcons(once);
  return {once,twice,count:KITA_ICON_NAMES.length,plain:kitaInlineIcons('<p>no icons</p>')};
});
assert(r.count>=90,'icon set too small: '+r.count);
assert.match(r.once,/<svg[^>]*class="kita-icon ico"[^>]*aria-hidden="true"[^>]*><path d="m21 21-4\.34-4\.34"/);
assert.match(r.once,/<svg[^>]*role="img" aria-label="Close"/);
assert.match(r.once,/<i data-icon="no-such-icon"><\/i>/);
assert.equal((r.once.match(/<style id="kita-icons">/g)||[]).length,1);assert.match(r.once,/<head><style id="kita-icons">/);
assert.equal(r.twice,r.once,'running twice changed the page');
assert.equal(r.plain,'<p>no icons</p>');
console.log('PASS icons: inline SVG in currentColor, labels kept, unknown left, idempotent');

// 2. Preview and publish get the icons; the answer itself keeps the placeholder.
const pp=await page.evaluate(()=>{
  const html='<!doctype html><html><head></head><body><i data-icon="house"></i></body></html>';
  return {preview:buildPreviewDoc(html,false),files:siteFilesFrom({files:[{name:'index.html',raw:html,lang:'html'},{name:'notes.txt',raw:'<i data-icon="house"></i>',lang:'text'}]})};
});
assert.match(pp.preview,/<svg[^>]*class="kita-icon"/);
assert.match(pp.files.find(f=>f.path==='index.html').content,/<svg[^>]*class="kita-icon"/);
assert.equal(pp.files.find(f=>f.path==='notes.txt').content,'<i data-icon="house"></i>','non-HTML files must not change');
console.log('PASS preview and publish inline the icons; other files untouched');

// 3. Code home: style picker, saved choice, notes for builds and the Designer agent.
await page.evaluate(()=>{conv=null;setKitaMode('code');renderAll();});
const pick=page.locator('select[aria-label="Design style for new builds"]');await pick.waitFor();
assert.equal(await pick.inputValue(),'auto');
assert.equal(await page.evaluate(()=>codeStyleNote()),'','Auto adds no style note');
assert.equal(await page.evaluate(()=>'codeStyle' in db),false,'reading must not create the setting');
await pick.tap();await page.locator('.kita-select').waitFor();
assert.match(await page.locator('.kita-select-option',{hasText:'Editorial'}).innerText(),/Editorial\s+Magazine type/);
await page.locator('.kita-select-option',{hasText:'Editorial'}).click();
assert.equal(await pick.evaluate(s=>s.options[s.selectedIndex].textContent),'Editorial');
await page.locator('.kita-select-scrim').waitFor({state:'detached'});
assert.equal(await page.evaluate(()=>db.codeStyle),'editorial');
assert.match(await pick.locator('xpath=ancestor::label').locator('small').innerText(),/Magazine type/);
const note=await page.evaluate(()=>codeContextNote());
assert.match(note,/Visual style chosen by the user: Editorial/);
assert.match(note,/fonts\.googleapis\.com\/css2\?family=Newsreader/);assert.match(note,/fallback stack Newsreader, Georgia/);
assert.match(note,/<i data-icon="NAME"/);assert.match(note,/house, search, menu/);
const designer=await page.evaluate(async()=>{let seen=null;const real=agentCall;agentCall=async(m,msgs)=>{seen=msgs;return '```css\n:root{--x:1}\n```';};
  try{await runDesigner({phases:{}},{model:{modelId:'m'},task:'Coffee shop page',contract:'',paint:()=>{}});}finally{agentCall=real;}return seen.map(x=>x.content).join('\n');});
assert.match(designer,/Visual style chosen by the user: Editorial/);
// Raw has no web fonts and says so.
await page.evaluate(()=>{db.codeStyle='brutalist';});
assert.match(await page.evaluate(()=>codeStyleNote()),/Font stack: system-ui/);
assert.doesNotMatch(await page.evaluate(()=>codeStyleNote()),/googleapis/);
console.log('PASS style picker saves the choice; builds and the Designer agent get style, fonts and icons');

// 4. Skill routing for the new design skills (Malay and English), pack v3 embedded.
const sel=await page.evaluate(()=>{const m=currentModel();const ids=t=>selectSkills(t,m).map(s=>s.id);return {
  dash:ids('buat dashboard jualan dengan carta dan kpi'),motion:ids('tambah animasi hover dan transisi yang lancar'),
  icons:ids('letak ikon pada setiap feature dan gambar hero'),layout:ids('susun atur hero, pricing dan faq untuk landing page'),
  landing:ids('buat landing page yang cantik'),version:skillPack.packVersion};});
assert(sel.version>=3);
assert(sel.dash.includes('data-viz'),'data-viz: '+sel.dash);
assert(sel.motion.includes('motion'),'motion: '+sel.motion);
assert(sel.icons.includes('icons-imagery'),'icons: '+sel.icons);
assert(sel.layout.includes('layout-patterns'),'layout: '+sel.layout);
assert(sel.landing.includes('frontend-design'),'landing lost frontend-design: '+sel.landing);
const sys=await page.evaluate(()=>({design:skillSystemMessage(selectSkills('buat landing page yang cantik',currentModel()),''),plain:skillSystemMessage([],'')}));
assert.match(sys.design,/data-icon="NAME"/);assert.doesNotMatch(sys.plain,/data-icon/);
console.log('PASS new design skills route correctly; design answers learn about the icons');
assert.deepEqual(errors,[]);
console.log('PASS design kit: icons, styles, fonts, designer agent and skills');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
