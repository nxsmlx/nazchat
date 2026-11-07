const {chromium}=require('/tmp/node_modules/playwright-core');
const assert=require('assert');
function skillData(){return require('/data/user/0/id.griphub.agent/files/home/workspace/build-a-web-app-116-648/skills.json').skills;}
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/chromium-headless-shell',args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:390,height:844}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let requests=[];
 await p.route('https://api.test/v1/chat/completions',async route=>{
   const body=JSON.parse(route.request().postData());requests.push(body);
   const prompt=body.messages.filter(m=>m.role==='user').at(-1).content;
   const response=prompt.includes('Review and improve')?'Improved:\n```html\n<!doctype html><title>Improved</title><button id="ok">OK</button>\n```':prompt.includes('REST API')?'```js\nconst express = require("express");\nconst app = express();\n```':'```html\n<!doctype html><html><body><h1>NazChat</h1><button>Start</button></body></html>\n```';
   await route.fulfill({status:200,headers:{'content-type':'text/event-stream'},body:`data: ${JSON.stringify({choices:[{delta:{reasoning:'Checking the requirements',content:response}}]})}\n\ndata: [DONE]\n\n`});
 });
 await p.route('https://raw.githubusercontent.com/nxsmlx/nazchat/main/skills.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({packVersion:1,skills:[{id:'frontend-design',name:'Updated design',content:'Use deliberate design.'}]})}));
 await p.goto('file:///data/user/0/id.griphub.agent/files/home/workspace/build-a-web-app-116-648/nazchat/index.html');
 await p.waitForTimeout(400);
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
 assert.strictEqual(requests.length,4);
 const systems=requests.map(r=>r.messages[0]);
 assert(systems.every(x=>x.role==='system'&&x.content.includes('You are NazChat')));
 assert(systems[3].content.includes('Active expert guidance')&&!systems[3].content.includes('[Skill:'));
 assert(systems[0].content.includes('design lead'));
 assert(requests.every(r=>JSON.stringify(r).length<100000));
 console.log('PASS system prompts and budget');
 await p.evaluate(()=>{db.skillSettings.mode='manual';db.skillSettings.selected=['security'];save();syncToggles();});
 await p.fill('#promptInput','buat landing page');await p.click('#sendBtn');await p.waitForFunction(()=>!generating);
 assert(requests.at(-1).messages[0].content.includes('defense in depth'));assert(!requests.at(-1).messages[0].content.includes('design lead'));
 console.log('PASS manual override');
 await p.setInputFiles('#fileInput',{name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('Important document facts')});
 assert((await p.locator('#attachmentInline').innerText()).includes('notes.txt'));
 await p.fill('#promptInput','Summarize');await p.click('#sendBtn');await p.waitForFunction(()=>!generating);
 const attachBody=requests.at(-1);const lastUser=attachBody.messages.filter(x=>x.role==='user').at(-1).content;
 assert(lastUser.includes('Important document facts'));assert(!JSON.stringify(attachBody).includes('image_url'));
 console.log('PASS document attachment, no vision payload');
 const parsed=await p.evaluate(()=>parseSkillMarkdown('---\nname: Laravel Expert\ndescription: PHP and Laravel\n---\nUse service classes.'));
 assert.strictEqual(parsed.name,'Laravel Expert');
 await p.evaluate(()=>importSkillText('---\nname: Laravel Expert\ndescription: PHP and Laravel\n---\nUse service classes.'));
 assert(await p.evaluate(()=>db.skillSettings.custom.some(x=>x.name==='Laravel Expert')));
 await p.reload();await p.waitForTimeout(250);
 assert(await p.evaluate(()=>db.skillSettings.custom.some(x=>x.name==='Laravel Expert')));
 console.log('PASS custom SKILL.md import and reload persistence');
 await p.unroute('https://raw.githubusercontent.com/nxsmlx/nazchat/main/skills.json*');
 await p.route('https://raw.githubusercontent.com/nxsmlx/nazchat/main/skills.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({packVersion:2,skills:skillData()})}));
 const pack=await p.evaluate(()=>refreshSkillPack(false));assert.strictEqual(pack.packVersion,2);
 assert(await p.evaluate(()=>db.skillPackCache.packVersion===2));console.log('PASS background pack update');
 await p.evaluate(()=>{db.skillSettings.mode='auto';db.skillSettings.selected=[];conv=null;renderAll();});
 await p.fill('#promptInput','buat landing page');await p.click('#sendBtn');await p.waitForFunction(()=>!generating);
 assert(await p.locator('.code-wrap.collapsed').count());assert(await p.locator('.skill-badge').count());
 await p.click('.code-toggle');assert(await p.locator('.code-wrap:not(.collapsed)').count());
 await p.click('text=✦ Review & Improve');await p.waitForFunction(()=>!generating);
 assert(requests.at(-1).messages[0].content.includes('Review against the stated requirements'));
 assert(await p.evaluate(()=>conv.messages.at(-1).usedSkills.includes('code-review')));
 console.log('PASS code collapse, skill badges, and Review & Improve');
 await p.click('#menuBtn');await p.click('#settingsBtn');await p.waitForTimeout(100);assert(await p.locator('#setSheet.open').count());assert((await p.locator('#provList').innerText()).includes('Skill Library'));
 await p.click('#manageSkillsBtn');assert(await p.locator('#skillSheet.open').count());
 await p.screenshot({path:'/tmp/naz-v28-library.png',fullPage:true});console.log('PASS settings skill library');
 assert.deepStrictEqual(errors,[]);console.log('PASS no page errors');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
