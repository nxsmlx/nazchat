const assert=require('node:assert/strict');const {launch,appUrl}=require('./browser');
/* 4.21.1: Settings → About links to the official website, privacy policy and terms, and
   shares the download page. */
(async()=>{const b=await launch();try{
for(const theme of ['light','dark']){
const page=await b.newPage({viewport:{width:390,height:844},colorScheme:theme});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://raw.githubusercontent.com/**',r=>r.abort());await page.route('https://api.github.com/**',r=>r.abort());
await page.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});
await page.evaluate(t=>{db.onboardingDone=true;db.theme=t;save();},theme);await page.goto(page.url(),{waitUntil:'domcontentloaded'});
await page.evaluate(()=>{window.__shared=null;shareText=t=>{window.__shared=t;};renderSettingsAbout();openSheet('setSheet');});
const links=page.locator('.about-links a.about-link');await links.first().waitFor();
assert.deepEqual(await links.evaluateAll(as=>as.map(a=>[a.querySelector('strong').textContent,a.getAttribute('href'),a.target,a.rel])),[
  ['Website','https://keetakita.my/','_blank','noopener'],['Privacy Policy','https://keetakita.my/privacy.html','_blank','noopener'],['Terms of Use','https://keetakita.my/terms.html','_blank','noopener']]);
for(const a of await links.all()){const box=await a.boundingBox();assert(box.height>=44,'touch target too small');}
await page.getByRole('button',{name:/Share Kita Chat/}).click();
assert.match(await page.evaluate(()=>window.__shared),/https:\/\/keetakita\.my$/);
assert(await page.getByRole('button',{name:'Check for updates'}).isVisible(),'update button still there');
if(theme==='dark') await page.screenshot({path:require('node:path').join(require('./browser').root,'test-results/about-site-dark.png')});
assert.deepEqual(errors,[]);await page.close();}
console.log('PASS About: website, privacy and terms links, share, light and dark');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
