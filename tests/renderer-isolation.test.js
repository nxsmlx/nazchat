const assert=require('node:assert/strict'),fs=require('node:fs');
const {launch,appUrl}=require('./browser');
(async()=>{const b=await launch();try{const p=await b.newPage({viewport:{width:390,height:844}});await p.route('https://raw.githubusercontent.com/**',r=>r.abort());await p.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});
await p.evaluate(()=>{db.onboardingDone=true;document.querySelector('#onboardingScrim').classList.remove('open');});await p.waitForTimeout(550);await p.evaluate(()=>document.querySelector('#onboardingScrim').classList.remove('open'));
fs.mkdirSync('test-results/renderer',{recursive:true});
for(const theme of ['light','dark'])for(const live of [false,true])for(const fenced of [false,true]){
const result=await p.evaluate(({theme,live,fenced})=>{
db.theme=theme;applyTheme();
const html='<!doctype html>\n<html><head><style>body{font-size:200px} .bubble{display:none}</style></head>\n<body><h1 id="escaped-demo">Neutral garden studio</h1>\n'+Array.from({length:90},(_,i)=>'<div class="row">Line '+i+' '+('x'.repeat(140))+'</div>').join('\n')+'\n</body></html>';
conv={id:'renderer-test',title:'Renderer isolation',messages:[{id:'u',role:'user',content:'Create a neutral garden page'},{id:'a',role:'assistant',content:fenced?'```html\n'+html+'\n```':html}]};renderAll();
const bubble=document.querySelector('.msg.assistant .bubble');if(live)renderAssistant(bubble,conv.messages[1],true);
const toggle=bubble.querySelector('.code-toggle');if(toggle)toggle.click();
const td=bubble.querySelector('.code-source'),gutter=bubble.querySelector('.code-gutter'),body=bubble.querySelector('.code-body')||bubble.querySelector('.code-live-body');
return {leak:!!document.querySelector('#escaped-demo'),styles:bubble.querySelectorAll('style').length,overflow:document.documentElement.scrollWidth>innerWidth+1,code:body?.textContent.includes('Neutral garden studio'),gutter:gutter?getComputedStyle(gutter).display:null,white:td?getComputedStyle(td.querySelector('pre')).whiteSpace:null,height:body?.clientHeight,scroll:body?.scrollWidth,width:body?.clientWidth};
},{theme,live,fenced});
assert(!result.leak&&!result.styles,'HTML leaked into the app DOM');assert(!result.overflow,'page overflow');assert(result.code,'code was lost');if(result.gutter){assert.equal(result.gutter,'table-cell');assert.equal(result.white,'pre');}assert(result.height<=450,'unbounded code viewer');
await p.screenshot({path:`test-results/renderer/${theme}-${live?'stream':'complete'}-${fenced?'fence':'bare'}.png`});console.log('PASS isolation',theme,{live,fenced},result);
}
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
