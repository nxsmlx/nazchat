const assert=require('node:assert/strict');
const {launch, appUrl}=require('./browser');
const fs=require('node:fs');
const path=require('node:path');

// Skill pack v2: anti-AI design guidance is present and selected for design work;
// the new art-direction, interface-copy and design-critique skills exist and route.
(async()=>{
 const pack=require('../skills.json');
 assert(pack.packVersion>=3,'pack v3 or later');
 const html=fs.readFileSync(path.join(__dirname,'../nazchat/index.html'),'utf8');
 const embedded=JSON.parse(html.split('const SKILL_PACK = ')[1].split('const SKILL_PACK_URL')[0].trim().replace(/;\s*$/,''));
 assert.deepStrictEqual(embedded,pack,'offline embedded pack must exactly match skills.json');
 assert.equal(pack.maxSkills,3);
 const ids=pack.skills.map(s=>s.id);
 for(const id of ['frontend-design','art-direction','interface-copy','design-critique','ui-ux'])assert(ids.includes(id),'missing '+id);
 const fd=pack.skills.find(s=>s.id==='frontend-design');
 assert(fd.content.includes('cream'),'anti-AI pattern list missing cream/terracotta');
 assert(fd.content.includes('em dash'),'em dash tell missing');
 assert(fd.content.includes('unlock the power of'),'stock copy tell missing');
 for(const s of pack.skills){
   assert(s.content.length>=200,s.id+' too thin');
   assert(!/[\u2013\u2014]/.test(JSON.stringify(s)),s.id+' contains an en/em dash');
   assert(s.name && s.description && s.source && s.sourceUrl && s.license,s.id+' missing attribution or metadata');
 }
 console.log('PASS pack v2 content checks: '+pack.skills.length+' skills, anti-AI guidance, no long dashes');

 // Browser: routing still works with the v2 pack served from the repo file.
 const b=await launch();
 try{
 const p=await b.newPage({viewport:{width:390,height:844}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://raw.githubusercontent.com/**',route=>route.abort());
 await p.route('https://api.test/v1/chat/completions',route=>route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:'data: '+JSON.stringify({choices:[{delta:{content:'ok'}}]})+'\n\ndata: [DONE]\n\n'}));
 await p.addInitScript(()=>{if(window===window.top)localStorage.setItem('nazchat_v1',JSON.stringify({onboardingDone:true,providers:[{id:'p1',name:'Mock',baseUrl:'https://api.test/v1',apiType:'chat',endpointMode:'chat',secretRef:'provider:p1',selectedModels:['m1'],models:[{id:'m1',name:'M1'}],apiKey:'test',modelMeta:{m1:{context_length:128000}}}],skillPackCache:{packVersion:1,skills:[{id:'legacy',name:'Legacy',content:'Old cached guidance'}]}}));});
 await p.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});
 await p.waitForFunction(()=>typeof db!=='undefined'&&typeof renderAll==='function');
 assert.equal(await p.evaluate(()=>skillPack.packVersion),pack.packVersion,'v1 cache must not downgrade the bundled pack');
 const sel=await p.evaluate(()=>selectSkills('buat landing page yang cantik',currentModel()).map(s=>s.id));
 assert(sel.includes('frontend-design'),'frontend-design not selected for design request');
 const selArt=await p.evaluate(()=>selectSkills('choose palette and typography for a coffee brand',currentModel()).map(s=>s.id));
 assert(selArt.includes('art-direction'),'art-direction not routed for palette/typography');
 const selCopy=await p.evaluate(()=>selectSkills('write the button labels and empty states',currentModel()).map(s=>s.id));
 assert(selCopy.includes('interface-copy'),'interface-copy not routed for copywriting');
 const critique=await p.evaluate(()=>selectSkills('review and improve this interface',currentModel()).map(s=>s.id));
 assert(critique.includes('design-critique'),'critique not routed');
 const boundary=await p.evaluate(()=>selectSkills('contextual colourful brandish',currentModel()).map(s=>s.id));
 assert.deepEqual(boundary,[],'keywords must match boundaries, not substrings');
 const combined=await p.evaluate(()=>selectSkills('design palette typography copy labels accessibility',currentModel()).map(s=>s.id));
 for(const id of ['art-direction','interface-copy'])assert(combined.includes(id),'crowded request displaced '+id);
 assert(combined.length<=3);
 const small=await p.evaluate(()=>selectSkills('design palette typography copy labels accessibility',{provider:{modelMeta:{tiny:{context_length:700}}},modelId:'tiny'}).reduce((n,s)=>n+('\n\n[Skill: '+s.name+']\n'+s.content).length,0));
 assert(small<=1800,'small-model skill context exceeds budget');
 const manual=await p.evaluate(()=>{db.skillSettings.mode='manual';db.skillSettings.selected=activeSkills().map(s=>s.id);const result=selectSkills('hello',currentModel()).map(s=>s.id);db.skillSettings.mode='auto';db.skillSettings.selected=[];return result;});
 assert(manual.length<=3,'manual mode must respect up-to-3 contract');
 await p.evaluate(()=>{db.skillSettings.disabled=['art-direction'];});
 assert(!(await p.evaluate(()=>selectSkills('palette typography brand',currentModel()).map(s=>s.id))).includes('art-direction'));
 assert.deepStrictEqual(errors,[]);
 console.log('PASS v2 offline/cache routing, all new skills, boundary matching, disabled skills and up-to-3/context budgets');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
