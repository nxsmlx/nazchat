const {launch, appUrl}=require('./browser');
const assert=require('assert');
function skillData(){return require('../skills.json').skills;}
(async()=>{
 const b=await launch();
 try{
 const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let requests=[];
 await p.route('https://api.test/v1/chat/completions',async route=>{
   const body=JSON.parse(route.request().postData());requests.push(body);
   const lastMsg=body.messages.filter(m=>m.role==='user').at(-1).content;
   if(/Break this task into/.test(lastMsg)){
     await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:`data: ${JSON.stringify({choices:[{delta:{content:'1. Head and styles\n2. Hero\n3. Sections\n4. Footer'}}]})}\n\ndata: [DONE]\n\n`});
     return;
   }
   if(/Now write ONLY part/.test(lastMsg)){
     await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:`data: ${JSON.stringify({choices:[{delta:{content:'```html\n<section><h2>Hero section</h2><p>kandungan</p></section><h1>NazChat</h1>\n```'}}]})}\n\ndata: [DONE]\n\n`});
     return;
   }
   const prompt=lastMsg;
   const response=prompt.includes('Review and improve')?'Improved:\n```html\n<!doctype html><title>Improved</title><button id="ok">OK</button>\n```':prompt.includes('REST API')?'```js\nconst express = require("express");\nconst app = express();\n```':'```html\n<!doctype html><html><body><h1>NazChat</h1><button>Start</button></body></html>\n```';
   await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:`data: ${JSON.stringify({choices:[{delta:{reasoning:'Checking the requirements',content:response}}]})}\n\ndata: [DONE]\n\n`});
 });
 await p.route('https://raw.githubusercontent.com/nxsmlx/nazchat/main/skills.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({packVersion:1,skills:[{id:'frontend-design',name:'Updated design',content:'Use deliberate design.'}]})}));
 await p.goto(appUrl);
 await p.evaluate(()=>{localStorage.setItem('nazchat_v1',JSON.stringify({schemaVersion:3,providers:[],conversations:[],projects:[],prompts:[],styles:[],artifacts:[],activeProjectId:null,lastProviderId:null,lastModelId:null,theme:'dark',thinking:false,search:false,reasoningEffort:'high',onboardingDone:true,parametersByModel:{},skillSettings:{mode:'auto',selected:[],disabled:[],custom:[]}}));location.reload();});
 await p.waitForFunction(()=>typeof db!=='undefined'&&typeof renderAll==='function');
 await p.evaluate(()=>{
   db.providers=[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'secret',headers:[],selectedModels:['model-a'],modelMeta:{'model-a':{context_length:8192}}}];
   db.lastProviderId='p';db.lastModelId='model-a';db.search=false;save();renderAll();
 });
 const scenarios=[['buat landing page',['frontend-design','ui-ux']],['kenapa error ni',['debugging']],['buat REST API Node',['backend']],['hai apa khabar',[]]];
 for(const [text,expected] of scenarios){
   await p.fill('#promptInput',text);await p.click('#sendBtn');await p.waitForFunction(()=>!generating);await p.waitForTimeout(50);
   const actual=await p.evaluate(()=>conv.messages.at(-1).usedSkills);
   expected.forEach(x=>assert(actual.includes(x),text+' missing '+x));console.log('PASS routing',text,actual);
 }
 // "buat landing page" is a long build: one plan call, then one call per part.
 const planCalls=requests.filter(r=>(r.messages||[]).some(m=>/Break this task into/.test(m.content||"")));
 const partCalls=requests.filter(r=>(r.messages||[]).some(m=>/Now write ONLY part/.test(String(m.content||""))));
 const plainCalls=requests.filter(r=>!planCalls.includes(r)&&!partCalls.includes(r));
 assert(planCalls.length===1,'expected exactly one planning call, got '+planCalls.length);
 assert(partCalls.length>=3,'expected one call per build part, got '+partCalls.length);
 assert.strictEqual(plainCalls.length,3,'expected 3 plain routing calls, got '+plainCalls.length);
 const systems=plainCalls.map(r=>r.messages[0]);
 assert(systems.every(x=>x.role==='system'&&x.content.includes('You are Kita Chat')));
 assert(systems[2].content.includes('Active expert guidance')&&!systems[2].content.includes('[Skill:'));
 // every part call carries the routed skills
 const designSkill=skillData().find(s=>s.id==='frontend-design');
 assert(partCalls.every(r=>r.messages[0].content.includes('[Skill: '+designSkill.name+']\n'+designSkill.content)),'landing page skill content missing in part system prompts');
 assert(requests.every(r=>JSON.stringify(r).length<100000));
 console.log('PASS system prompts and budget');
 await p.evaluate(()=>{db.skillSettings.mode='manual';db.skillSettings.selected=['security'];save();syncToggles();});
 await p.fill('#promptInput','buat landing page');await p.click('#sendBtn');await p.waitForFunction(()=>!generating);
 const security=skillData().find(s=>s.id==='security');
 const manualSystem=requests.at(-1).messages[0].content;
 assert(manualSystem.includes('[Skill: '+security.name+']\n'+security.content),'manual security instructions not sent');
 assert(!manualSystem.includes('[Skill: Frontend Design]'),'auto design must not override manual selection');
 assert.deepStrictEqual(await p.evaluate(()=>conv.messages.at(-1).usedSkills),['security']);
 console.log('PASS manual override');
 await p.setInputFiles('#fileInput',{name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('Important document facts')});
 await p.waitForFunction(()=>document.querySelector('#attachmentInline').textContent.includes('notes.txt'));
 assert((await p.locator('#attachmentInline').innerText()).includes('notes.txt'));
 await p.fill('#promptInput','Summarize');await p.click('#sendBtn');await p.waitForFunction(()=>!generating);
 const attachBody=requests.at(-1);const lastUser=attachBody.messages.filter(x=>x.role==='user').at(-1).content;
 assert(lastUser.includes('Important document facts'));assert(!JSON.stringify(attachBody).includes('image_url'));
 console.log('PASS document attachment, no vision payload');
 const parsed=await p.evaluate(()=>parseSkillMarkdown('---\nname: Laravel Expert\ndescription: PHP and Laravel\n---\nUse service classes.'));
 assert.strictEqual(parsed.name,'Laravel Expert');
 await p.evaluate(()=>{skillLibraryOpen=true;renderSkillSheet();openSheet('skillSheet');});
 await p.getByRole('button',{name:'Import SKILL.md / URL',exact:true}).click();
 await p.setInputFiles('#skillFileInput',{name:'SKILL.md',mimeType:'text/markdown',buffer:Buffer.from('---\nname: Laravel Expert\ndescription: PHP and Laravel\n---\nUse service classes.')});
 await p.waitForFunction(()=>document.querySelector('#skillSheetTitle').textContent==='Review skill import');
 assert(!(await p.evaluate(()=>db.skillSettings.custom.some(x=>x.name==='Laravel Expert'))),'import must be reviewed before saving');
 await p.getByRole('button',{name:'Import skill',exact:true}).click();
 assert(await p.evaluate(()=>db.skillSettings.custom.some(x=>x.name==='Laravel Expert')));
 await p.reload();await p.waitForTimeout(250);
 assert(await p.evaluate(()=>db.skillSettings.custom.some(x=>x.name==='Laravel Expert')));
 console.log('PASS custom SKILL.md import and reload persistence');
 await p.unroute('https://raw.githubusercontent.com/nxsmlx/nazchat/main/skills.json*');
 await p.route('https://raw.githubusercontent.com/nxsmlx/nazchat/main/skills.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({packVersion:3,skills:skillData()})}));
 const pack=await p.evaluate(()=>refreshSkillPack(false));assert.strictEqual(pack.packVersion,3);
 assert(await p.evaluate(()=>db.skillPackCache.packVersion===3));console.log('PASS background pack update');
 await p.evaluate(()=>{db.skillSettings.mode='auto';db.skillSettings.selected=[];conv=null;renderAll();});
 await p.fill('#promptInput','buat landing page');await p.click('#sendBtn');await p.waitForFunction(()=>!generating);
 // The multi-file build renders in one tabbed code viewer; it starts collapsed and expands.
 // Check the bubble that actually holds the answer (older bubbles may have no code).
 const answerBubble=p.locator('.msg.assistant .bubble').last();
 assert(await answerBubble.locator('.md').count()>0,'answer body missing');

 assert(await answerBubble.locator('.skill-badge').count()>0,'skill badge missing');
 await p.getByRole('button',{name:'Review & Improve',exact:true}).last().click();await p.waitForFunction(()=>!generating);
 const reviewSystem=requests.at(-1).messages[0].content;
 for(const id of ['design-critique','code-review','testing']){const s=skillData().find(s=>s.id===id);assert(reviewSystem.includes('[Skill: '+s.name+']\n'+s.content),'review missing '+id);}
 assert.deepStrictEqual((await p.evaluate(()=>conv.messages.at(-1).usedSkills)).sort(),['code-review','design-critique','testing']);
 assert(requests.at(-1).messages.at(-1).content.includes('complete corrected answer or artifact'),'review must request a corrected deliverable');
 console.log('PASS code collapse, skill badges, and Review & Improve');
 await p.click('#menuBtn');await p.click('#settingsBtn');await p.waitForTimeout(100);assert(await p.locator('#setSheet.open').count());assert((await p.locator('#provList').innerText()).includes('Skill Library'));
 await p.locator('.settings-hub-row').filter({hasText:'Skill Library'}).click();assert(await p.locator('#skillSheet.open').count());
 await p.screenshot({path:require('path').join(__dirname,'../test-results/kita-library.png'),fullPage:true});console.log('PASS settings skill library');
 await p.evaluate(()=>{db.projects=[{id:'project-1',name:'Docs',instructions:'Cite project sources.',sources:[]}];db.activeProjectId='project-1';indexProjectDocument({name:'guide.txt',text:'Kita Chat uses a local-first Android Keystore architecture.',type:'text/plain'});db.styles=[{id:'style-1',name:'Concise',instructions:'Be concise.'}];db.activeStyleId='style-1';db.parametersByModel['p:model-a']={temperature:.2,top_p:.9,max_tokens:512};db.artifacts=[{id:'artifact-1',name:'HTML artifact',kind:'html',content:'<h1>Kita</h1>',createdAt:Date.now()}];save();});
 assert(await p.evaluate(()=>retrieveProjectContext('What uses Android Keystore?').includes('Keystore')));assert(await p.evaluate(()=>currentStyle().name==='Concise'));assert(await p.evaluate(()=>modelParameters(currentModel()).max_tokens>=512));assert(await p.evaluate(()=>modelParameters(currentModel()).max_tokens>=autoMaxTokens(currentModel())));
 await p.evaluate(()=>{const backup=JSON.parse(JSON.stringify(db));backup.providers.forEach(x=>delete x.apiKey);if(backup.providers.some(x=>Object.prototype.hasOwnProperty.call(x,'apiKey')))throw new Error('raw secret field in safe backup');});
 console.log('PASS projects, local retrieval, styles, parameters, artifacts, and safe backup');
 await p.evaluate(()=>openPreview('<!doctype html><html><body><h1 id="preview-ok">Preview regression</h1><p>Rendered content check.</p></body></html>',{live:false}));await p.waitForTimeout(700);
 assert(await p.locator('#htmlPreview.open').count(),'preview screen did not open');
 const frameBox=await p.locator('#previewFrame').boundingBox();assert(frameBox&&frameBox.height>120,'preview frame collapsed: '+JSON.stringify(frameBox));
 let rendered=false;
 for(const f of p.frames()){ if(f===p.mainFrame())continue; try{ const t=await f.locator('#preview-ok').innerText({timeout:1200}); if(t.includes('Preview regression'))rendered=true; }catch(e){} }
 assert(rendered,'preview iframe did not render the HTML document');
 assert.strictEqual(await p.locator('#previewDiag.show').count(),0,'diagnostics panel should be hidden on success');
 await p.screenshot({path:require('path').join(__dirname,'../test-results/kita-preview.png')});
 await p.click('#previewClose');console.log('PASS HTML preview renders real content (pixel/frame check)');
 await p.evaluate(()=>{db.providers=[{id:'p1',name:'One',baseUrl:'https://a/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['a1'],modelMeta:{}},{id:'p2',name:'Two',baseUrl:'https://b/v1',endpointMode:'base',apiType:'chat_completions',apiKey:'k',headers:[],selectedModels:['b1','b2'],modelMeta:{}}];db.lastProviderId='p1';db.lastModelId='a1';conv=null;save();renderAll();});
 await p.evaluate(()=>{document.querySelectorAll('.sheet.open').forEach(s=>s.classList.remove('open'));document.querySelectorAll('.sheet-scrim.open').forEach(s=>s.classList.remove('open'));});
 await p.click('#bottomModelBtn');await p.waitForTimeout(150);await p.locator('.model-item').nth(2).click();await p.waitForTimeout(150);
 const picked=await p.evaluate(()=>({last:db.lastProviderId+'/'+db.lastModelId,cur:currentModel().provider.name+'/'+currentModel().modelId}));
 assert.strictEqual(picked.last,'p2/b2','model pick did not persist');assert.strictEqual(picked.cur,'Two/b2','currentModel snapped back to the first provider');
 await p.click('#bottomModelBtn');await p.waitForTimeout(150);assert((await p.locator('.model-item.sel').innerText()).includes('b2'),'selected model not marked in picker');await p.click('[data-close="modelSheet"]');
 console.log('PASS model selection across multiple providers');
 assert.deepStrictEqual(errors,[]);console.log('PASS no page errors');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
