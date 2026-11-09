'use strict';

// Run directly: node tests/studio.test.js
// Exercise the production document, never design-lab fixtures or replacement UI.
// Provider requests are fulfilled locally; only public static CDN assets may load.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {launch, appUrl, root} = require('./browser');

const output = path.join(root, 'test-results/studio');
const API = 'https://studio-provider.invalid/v1/chat/completions';
const PROJECT = 'upgrade-project';
const GENERAL_CHAT = 'upgrade-general-chat';
const PROJECT_CHAT = 'upgrade-project-chat';
const PROMPT = 'Summarise only these fixture notes.\nKeep the literal <draft> marker and explain “why”, not just “what”.';
const CODE = '<!doctype html>\n<html><body><h1>Saved from a real message</h1></body></html>\n';
const PREVIEW = '<!doctype html><html><body><h1>Restored document fixture</h1></body></html>';
const INSTRUCTIONS = 'Use the retained project glossary: amber means awaiting review.';
const prototypeContent = /A quieter landing page|Studio website|Things I’m learning|Notes from a good read/;

function legacyDb() {
  const timestamp = 1700000000000;
  return {
    schemaVersion:3, onboardingDone:true, theme:'dark', search:false, thinking:false,
    reasoningEffort:'medium', activeProjectId:null,
    lastProviderId:'studio-fixture-provider', lastModelId:'studio-test-a',
    providers:[{
      id:'studio-fixture-provider', name:'Offline fixture provider',
      baseUrl:'https://studio-provider.invalid/v1', endpointMode:'base', apiType:'chat_completions',
      secretRef:'provider:studio-fixture-dummy', apiKey:'dummy-test-key-not-a-secret', headers:[],
      selectedModels:['studio-test-a','studio-test-b'],
      modelMeta:{'studio-test-a':{context_length:128000},'studio-test-b':{context_length:64000}}
    }],
    conversations:[
      {id:GENERAL_CHAT, title:'Retained standalone discussion', providerId:'studio-fixture-provider',
        modelId:'studio-test-a', updatedAt:timestamp, messages:[
          {id:'old-user',role:'user',content:'Keep this standalone question.',timestamp},
          {id:'old-answer',role:'assistant',content:'The standalone answer survives the Studio upgrade.',timestamp}
        ]},
      {id:PROJECT_CHAT, title:'Retained project discussion', providerId:'studio-fixture-provider',
        modelId:'studio-test-b', projectId:PROJECT, updatedAt:timestamp+1, messages:[
          {id:'project-user',role:'user',content:'Keep this project question.',timestamp},
          {id:'project-answer',role:'assistant',content:'Here is the retained document.\n\n```html\n'+CODE+'```',timestamp}
        ]}
    ],
    projects:[{id:PROJECT,name:'Upgrade project — retained context',instructions:INSTRUCTIONS,
      sources:[{id:'old-source',name:'Glossary.txt',text:'Amber: awaiting review.',terms:['amber','review']}],
      createdAt:timestamp,updatedAt:timestamp}],
    prompts:[{id:'old-prompt',name:'Retained prompt label, not its content',content:PROMPT,tags:['upgrade'],createdAt:timestamp}],
    artifacts:[{id:'old-artifact',name:'Retained HTML document',kind:'html',content:PREVIEW,conversationId:GENERAL_CHAT,createdAt:timestamp}],
    styles:[], parametersByModel:{},
    skillSettings:{mode:'auto',selected:[],disabled:[],custom:[{
      id:'fixture-guidance',name:'Fixture review guidance',content:'Check only the supplied fixture facts.',keywords:[]
    }]}
    // Deliberately no Studio-specific fields (for example textSize).
  };
}

function emptyDb() {
  return {schemaVersion:3,onboardingDone:true,providers:[],conversations:[],projects:[],prompts:[],styles:[],artifacts:[]};
}

async function ready(page) {
  await page.waitForFunction(() => typeof db !== 'undefined' &&
    typeof studioNavigate === 'function' && document.querySelector('#main')?.dataset.view === 'chat');
}
async function reload(page) { await page.reload(); await ready(page); }
async function stored(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('nazchat_v1'))); }
async function screenshot(page, name) { await page.screenshot({path:path.join(output, name+'.png')}); }
async function sidebar(page) {
  if (await page.locator('#menuBtn').isVisible() && !(await page.locator('[data-studio-view="projects"]').isVisible())) {
    await page.locator('#menuBtn').click();
  }
}
async function navigate(page, view) {
  await sidebar(page);
  await page.locator(`[data-studio-view="${view}"]`).click();
  await page.waitForFunction(view => document.querySelector('#main').dataset.view === view, view);
  assert.equal(await page.locator(`[data-studio-view="${view}"]`).getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('#composerWrap').isVisible(), view === 'chat');
  assert.equal(await page.locator('#workspaceView').isVisible(), view !== 'chat');
}
async function settings(page, section) {
  await sidebar(page);
  await page.locator('#settingsBtn').click();
  await page.locator('#setSheet').getByRole('button', {name:new RegExp('^'+section+'\\b')}).click();
  assert.equal(await page.locator('#setSheetTitle').innerText(), section);
}
async function escapeSheet(page, id) {
  await page.keyboard.press('Escape');
  await page.locator('#'+id).waitFor({state:'hidden'});
}
async function assertContext(page, id, projectId) {
  assert.deepEqual(await page.evaluate(() => ({id:conv?.id || null,projectId:db.activeProjectId,
    current:currentProject()?.id || null,view:document.querySelector('#main').dataset.view})),
  {id,projectId,current:projectId,view:'chat'});
}

function sse(text) {
  return [{choices:[{delta:{content:text}}]}, {choices:[{delta:{},finish_reason:'stop'}]}]
    .map(frame => 'data: '+JSON.stringify(frame)+'\n\n').join('')+'data: [DONE]\n\n';
}
async function mockProvider(page, text, gate = Promise.resolve()) {
  const requests = [];
  await page.route(API, async route => {
    requests.push({method:route.request().method(),body:route.request().postDataJSON()});
    await gate;
    await route.fulfill({status:200,contentType:'text/event-stream',
      headers:{'access-control-allow-origin':'*'},body:sse(text)});
  });
  return requests;
}
async function send(page, text, answer) {
  await page.locator('#promptInput').fill(text);
  const request = page.waitForRequest(API);
  await page.locator('#sendBtn').click();
  await request;
  await page.waitForFunction(answer => !generating && conv?.messages.at(-1)?.content === answer, answer);
  assert(await page.locator('#chatInner .msg.assistant').last().getByText(answer, {exact:true}).isVisible());
  assert.equal(await page.locator('#promptInput').inputValue(), '');
}

async function noOverflow(page, label) {
  const bad = await page.evaluate(() => {
    const nodes = [document.documentElement, document.body,
      ...document.querySelectorAll('#main,#composer,#workspaceView,#chatScroll,#sidebarPanel,.sheet.open .sheet-body')];
    return nodes.filter(n => n.getClientRects().length && getComputedStyle(n).visibility === 'visible' &&
      n.scrollWidth > n.clientWidth+1).map(n => ({node:n.id || n.tagName,width:n.clientWidth,scroll:n.scrollWidth}));
  });
  assert.deepEqual(bad, [], label+': horizontal overflow');
}
async function target(page, selector, scroll = false) {
  const node = page.locator(selector);
  if (scroll) await node.scrollIntoViewIfNeeded();
  assert(await node.isVisible(), selector+' is hidden');
  const box = await node.evaluate(n => {
    const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,
      viewportWidth:innerWidth,viewportHeight:innerHeight,reachable:hit === n || n.contains(hit)};
  });
  assert(box.width >= 43.5 && box.height >= 43.5, selector+': target smaller than 44px '+JSON.stringify(box));
  assert(box.x >= -1 && box.y >= -1 && box.right <= box.viewportWidth+1 && box.bottom <= box.viewportHeight+1,
    selector+': outside viewport '+JSON.stringify(box));
  assert(box.reachable, selector+': obscured or clipped '+JSON.stringify(box));
}

(async () => {
  fs.mkdirSync(output, {recursive:true});
  const browser = await launch();
  const results = [];
  async function test(name, fixture, run, viewport = {width:1280,height:900}) {
    const context = await browser.newContext({viewport,reducedMotion:'reduce',colorScheme:'dark'});
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [], unexpected = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      // No real provider, search, GitHub API or other application network calls.
      // Markdown, syntax and font assets are bundled locally, so any remote request is unexpected.
      await page.route(/^https?:\/\//, route => {
        const req = route.request(), url = new URL(req.url());
        unexpected.push(req.method()+' '+url.origin+url.pathname);
        return route.abort();
      });
      await page.route('https://raw.githubusercontent.com/**', route => route.abort());
      // Expected background updater traffic is mocked, not counted as an unexpected API call.
      // All other GitHub/provider/search requests remain caught by the strict guard above.
      await page.route('https://api.github.com/repos/nxsmlx/nazchat/releases/latest', route =>
        route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({draft:false,prerelease:false,tag_name:'v0.0.0',assets:[],body:''})}));
      await page.addInitScript(seed => {
        // A reload must test persistence, not silently reinstall the old snapshot.
        // Preview srcdoc/blank frames must never seed or access storage.
        if (window !== window.top || sessionStorage.getItem('studio-regression-seeded')) return;
        sessionStorage.setItem('studio-regression-seeded','1');
        localStorage.setItem('nazchat_v1',JSON.stringify(seed));
      }, fixture);
      await page.goto(appUrl, {waitUntil:'domcontentloaded',timeout:60000});
      await ready(page);
      await run(page);
      assert.deepEqual(errors, [], 'uncaught application errors');
      assert.deepEqual(unexpected, [], 'unexpected external requests (all were blocked)');
      results.push({name,status:'passed'});
      fs.rmSync(path.join(output,name+'-failure.png'),{force:true});
      console.log('PASS '+name);
    } catch (error) {
      await screenshot(page, name+'-failure').catch(() => {});
      results.push({name,status:'failed',error:error.stack,pageErrors:errors,blockedRequests:unexpected});
      console.error('FAIL '+name+'\n'+error.stack);
    } finally { await context.close(); }
  }
  try {
    await test('upgrade-retains-schema3-data', legacyDb(), async page => {
      const seed = legacyDb();
      const assertRetained = async () => {
        const snapshots = [await page.evaluate(() => db), await stored(page)];
        for (const snapshot of snapshots) {
          assert(snapshot.schemaVersion >= 3, 'schema version must not move backwards');
          for (const collection of ['conversations','projects','prompts','artifacts','styles','skillSettings']) {
            assert.deepEqual(snapshot[collection],seed[collection],collection+' changed during upgrade/navigation');
          }
          for (const [key,value] of Object.entries(seed.providers[0])) {
            assert.deepEqual(snapshot.providers.find(p => p.id === seed.providers[0].id)?.[key], value, 'provider '+key+' lost');
          }
        }
      };
      await assertRetained();
      assert(await page.locator('#convList').getByText(seed.conversations[0].title,{exact:true}).isVisible());
      await navigate(page,'projects');
      assert(await page.locator('#workspaceView').getByRole('heading',{name:seed.projects[0].name,exact:true}).isVisible());
      await navigate(page,'library');
      assert(await page.locator('#workspaceView').getByText(seed.prompts[0].name,{exact:true}).isVisible());
      assert(await page.locator('#workspaceView').getByText(seed.artifacts[0].name,{exact:true}).isVisible());
      await navigate(page,'chat');
      // An actual settings change forces the migrated data through save().
      await settings(page,'Appearance');
      await page.locator('[data-theme-choice="light"]').click();
      await reload(page);
      await assertRetained();
      assert.equal((await stored(page)).theme,'light');
      assert.doesNotMatch(await page.locator('#main').innerText(),prototypeContent);
      await screenshot(page,'upgrade-home');
    });

    await test('empty-workspace-and-settings-navigation', emptyDb(), async page => {
      assert(await page.getByRole('button',{name:/Connect your first provider/}).isVisible());
      assert.match(await page.locator('#convList').innerText(),/No conversations yet/);
      await page.locator('#bottomModelBtn').click();
      assert.match(await page.locator('#modelList').innerText(),/No models yet|No providers yet/);
      assert.equal(await page.locator('#modelList .model-item').count(),0,'prototype models leaked');
      await escapeSheet(page,'modelSheet');
      await navigate(page,'projects');
      assert(await page.getByRole('heading',{name:'Start with one idea.',exact:true}).isVisible());
      assert.equal(await page.locator('.studio-project-card').count(),0);
      await page.getByRole('button',{name:'Create a project',exact:true}).click();
      await page.locator('#customDialogInput').fill('Cancelled fixture project');
      await page.keyboard.press('Escape');
      await page.locator('#customDialogScrim').waitFor({state:'hidden'});
      assert.deepEqual((await stored(page)).projects,[],'Escape created a project');
      await navigate(page,'library');
      for (const category of ['Everything','Artifacts','Prompts']) {
        await page.getByRole('tab',{name:category,exact:true}).click();
        assert.equal(await page.getByRole('tab',{name:category,exact:true}).getAttribute('aria-selected'),'true');
        assert(await page.getByRole('heading',{name:'Nothing here yet.',exact:true}).isVisible());
      }
      assert.doesNotMatch(await page.locator('#workspaceView').innerText(),prototypeContent);
      await screenshot(page,'empty-library');
      await settings(page,'Workspace');
      for (const name of ['Export backup','Export encrypted backup','Restore backup']) {
        assert(await page.locator('#setSheet').getByRole('button',{name,exact:true}).isVisible());
      }
      assert.match(await page.locator('#setSheet').innerText(),/Provider keys are excluded/);
      await page.locator('#setSheet').getByRole('button',{name:/^Projects\b/}).click();
      assert.equal(await page.locator('#main').getAttribute('data-view'),'projects');
      assert(!(await page.locator('#setSheet').isVisible()));
      await settings(page,'Workspace');
      await page.locator('#setSheet').getByRole('button',{name:/^Library\b/}).click();
      assert.equal(await page.locator('#main').getAttribute('data-view'),'library');
      await navigate(page,'chat');
      for (const key of ['conversations','providers','projects','prompts','artifacts']) assert.deepEqual((await stored(page))[key],[]);
    });

    await test('library-uses-prompt-content-and-restored-preview', legacyDb(), async page => {
      await navigate(page,'library');
      await page.getByRole('tab',{name:'Prompts',exact:true}).click();
      const prompt = page.locator('.studio-library-open').filter({hasText:legacyDb().prompts[0].name});
      assert(!(await page.getByText('Retained HTML document',{exact:true}).isVisible()));
      await prompt.click();
      assert.equal(await page.locator('#main').getAttribute('data-view'),'chat');
      assert.equal(await page.locator('#promptInput').inputValue(),PROMPT,'label/placeholder used instead of saved content');
      assert(await page.locator('#promptInput').evaluate(n => n === document.activeElement));
      assert.deepEqual((await stored(page)).conversations,legacyDb().conversations,'using a prompt must not auto-send');
      await navigate(page,'library');
      await page.getByRole('tab',{name:'Artifacts',exact:true}).click();
      const before = await stored(page);
      await page.locator('.studio-library-open').filter({hasText:'Retained HTML document'}).click();
      await page.frameLocator('#previewFrame').getByRole('heading',{name:'Restored document fixture',exact:true}).waitFor();
      assert.deepEqual(await stored(page),before,'preview iframe reseeded the top-level database');
      await screenshot(page,'restored-artifact-preview');
      await page.keyboard.press('Escape');
      await page.locator('#htmlPreview').waitFor({state:'hidden'});
      await reload(page);
      assert.deepEqual((await stored(page)).artifacts,before.artifacts);
    });

    for (const [label,draft] of [
      ['hidden-draft','Unsent <draft> for review.\nKeep "quotes" and `backticks` literal.'],
      ['empty-composer','']
    ]) {
      await test('library-save-prompt-requires-review-'+label, legacyDb(), async page => {
        await page.locator('#promptInput').fill(draft);
        await navigate(page,'library');
        assert(!(await page.locator('#promptInput').isVisible()),'composer must be hidden while saving from Library');
        const before = await stored(page);
        const name = 'Reviewed prompt — '+label;
        const content = 'Explicitly reviewed <content>, not the prompt name.\nPreserve this second line and "quotes".';
        const savePrompt = page.locator('#workspaceView').getByRole('button',{name:'Save prompt',exact:true});
        const assertUnchanged = async () => {
          assert.deepEqual(await stored(page),before,'opening/cancelling prompt review changed saved data');
          assert.deepEqual(await page.evaluate(() => db.prompts),before.prompts);
          assert.equal(await page.locator('#promptInput').inputValue(),draft,'prompt review changed the hidden composer draft');
          assert.equal(await page.locator('#main').getAttribute('data-view'),'library');
        };
        const review = async () => {
          await savePrompt.click();
          await page.locator('#customDialogInput').waitFor({state:'visible'});
          assert.equal(await page.locator('#customDialogTitle').innerText(),'Save prompt');
          assert(!(await page.locator('#customDialogTextarea').isVisible()),'name dialog exposed an extra textarea');
          await page.locator('#customDialogInput').fill(name);
          await page.locator('#customDialogConfirm').click();
          await page.locator('#customDialogTextarea').waitFor({state:'visible'});
          assert.equal(await page.locator('#customDialogTitle').innerText(),'Prompt text');
          assert(!(await page.locator('#customDialogInput').isVisible()),'content review still shows the name input');
          assert.equal(await page.locator('#customDialogTextarea').inputValue(),draft,'review was not seeded from the composer');
          await assertUnchanged();
        };
        // Neither cancelling the name nor cancelling a seeded review may save anything.
        await savePrompt.click();
        await page.locator('#customDialogCancel').click();
        await page.locator('#customDialogScrim').waitFor({state:'hidden'});
        await assertUnchanged();
        await review();
        await page.locator('#customDialogTextarea').fill('This cancelled edit must never be saved.');
        await escapeSheet(page,'customDialogScrim');
        await assertUnchanged();
        await review();
        await page.locator('#customDialogTextarea').fill(content);
        await page.locator('#customDialogConfirm').click();
        await page.locator('#customDialogScrim').waitFor({state:'hidden'});
        const after = await stored(page);
        assert.equal(after.prompts.length,before.prompts.length+1,'review must save exactly one prompt');
        assert.deepEqual(after.prompts.slice(0,-1),before.prompts,'existing prompts changed');
        const saved = after.prompts.at(-1);
        assert.equal(saved.name,name);
        assert.equal(saved.content,content,'saved hidden draft/name instead of the reviewed content');
        assert.deepEqual(await page.evaluate(() => db.prompts),after.prompts);
        assert.deepEqual(after.conversations,before.conversations,'saving a prompt must not send or create a conversation');
        assert.deepEqual(after.artifacts,before.artifacts);
        assert.equal(await page.locator('#promptInput').inputValue(),draft);
        const row = page.locator('.studio-library-open').filter({hasText:name});
        assert(await row.isVisible(),'new prompt was not rendered in Library');
        await row.click();
        assert.equal(await page.locator('#main').getAttribute('data-view'),'chat');
        assert.equal(await page.locator('#promptInput').inputValue(),content);
        assert.deepEqual((await stored(page)).conversations,before.conversations,'using the reviewed prompt auto-sent it');
        await reload(page);
        assert.deepEqual((await stored(page)).prompts,after.prompts,'reviewed prompt did not survive reload');
      });
    }

    await test('preview-menu-escape-order-and-close-cleanup', legacyDb(), async page => {
      await navigate(page,'library');
      const before = await stored(page);
      const artifact = page.locator('.studio-library-open').filter({hasText:'Retained HTML document'});
      const openArtifact = async () => {
        await artifact.click();
        await page.frameLocator('#previewFrame').getByRole('heading',{name:'Restored document fixture',exact:true}).waitFor();
        assert.equal(await page.locator('#htmlPreview').getAttribute('aria-hidden'),'false');
        assert(!(await page.locator('#previewMenu').isVisible()),'preview reopened with a stale menu');
        assert(!(await page.locator('#previewMenuScrim').isVisible()),'preview reopened with a stale scrim');
      };
      const assertClosed = async () => {
        await page.locator('#htmlPreview').waitFor({state:'hidden'});
        assert.equal(await page.locator('#htmlPreview').getAttribute('aria-hidden'),'true');
        assert(!(await page.locator('#previewMenu').isVisible()),'closing preview left its menu visible');
        assert(!(await page.locator('#previewMenuScrim').isVisible()),'closing preview left a blocking scrim');
        assert.equal(await page.locator('#previewFrame').getAttribute('srcdoc'),null);
        assert.equal(await page.locator('#previewFrame').getAttribute('src'),'about:blank');
        assert.deepEqual(await stored(page),before,'preview controls changed saved data');
      };
      await openArtifact();
      const documentBefore = await page.locator('#previewFrame').getAttribute('srcdoc');
      await page.locator('#previewMore').click();
      assert(await page.locator('#previewMenu').isVisible());
      assert(await page.locator('#previewMenuScrim').isVisible());
      await page.locator('#pmCopy').focus();
      await page.keyboard.press('Escape');
      await page.locator('#previewMenu').waitFor({state:'hidden'});
      assert(!(await page.locator('#previewMenuScrim').isVisible()));
      assert(await page.locator('#htmlPreview').isVisible(),'first Escape incorrectly closed the preview too');
      assert.equal(await page.locator('#htmlPreview').getAttribute('aria-hidden'),'false');
      assert.equal(await page.locator('#previewFrame').getAttribute('srcdoc'),documentBefore,'first Escape unloaded the document');
      assert(await page.locator('#previewMore').evaluate(n => n === document.activeElement),'menu dismissal did not restore focus');
      await page.keyboard.press('Escape');
      await assertClosed();
      await openArtifact();
      await page.locator('#previewMore').click();
      assert(await page.locator('#previewMenu').isVisible());
      // Exercise the close API while the menu is open, independently of Escape's menu-first path.
      await page.evaluate(() => closePreview());
      await assertClosed();
      // A real click below the old scrim must work, and the next preview must start clean.
      await page.getByRole('tab',{name:'Artifacts',exact:true}).click();
      await openArtifact();
      await page.locator('#previewClose').click();
      await assertClosed();
    });

    await test('artifact-save-action-and-deduplication', legacyDb(), async page => {
      await page.evaluate(id => studioOpenConversation(db.conversations.find(c => c.id === id)),PROJECT_CHAT);
      const saveButton = page.locator('#chatInner').getByRole('button',{name:'Save artifact',exact:true});
      await saveButton.click();
      const after = await stored(page);
      const saved = after.artifacts.filter(a => a.conversationId === PROJECT_CHAT && a.content === CODE);
      assert.equal(saved.length,1,'Save artifact did not extract the actual fenced HTML');
      assert.equal(saved[0].kind,'html');
      await saveButton.click();
      assert.deepEqual((await stored(page)).artifacts,after.artifacts,'repeat save duplicated the artifact');
      await navigate(page,'library');
      await page.locator('.studio-library-open').filter({hasText:legacyDb().conversations[1].title}).click();
      await page.frameLocator('#previewFrame').getByRole('heading',{name:'Saved from a real message',exact:true}).waitFor();
      await page.keyboard.press('Escape');
      await reload(page);
      assert.deepEqual((await stored(page)).artifacts,after.artifacts);
    });

    await test('artifact-regex-real-newlines-language-and-no-code', legacyDb(), async page => {
      await page.evaluate(id => studioOpenConversation(db.conversations.find(c => c.id === id)),GENERAL_CHAT);
      const examples = [
        {content:'Before\n```javascript\nconst line = "\\n";\nconsole.log(line);\n```\nAfter',kind:'javascript',code:'const line = "\\n";\nconsole.log(line);\n'},
        {content:'```  C++ \r\nint value = 42;\r\n```',kind:'c++',code:'int value = 42;\r\n'},
        {content:'```\nplain code without a language\n```',kind:'text',code:'plain code without a language\n'},
        {content:'```css\nbody { color: red; }',kind:'css',code:'body { color: red; }'},
        {content:'```js\nconst fence = "```";\nconsole.log(fence);\n```',kind:'js',code:'const fence = "```";\nconsole.log(fence);\n'},
        {content:'~~~~html\n<h1>Nested ``` stays intact</h1>\n~~~~',kind:'html',code:'<h1>Nested ``` stays intact</h1>\n'}
      ];
      for (const example of examples) {
        await page.evaluate(content => saveArtifactFromMessage({role:'assistant',content}),example.content);
        const artifacts = (await stored(page)).artifacts;
        assert.equal(artifacts.filter(a => a.content === example.code && a.kind === example.kind && a.conversationId === GENERAL_CHAT).length,1);
        await page.evaluate(content => saveArtifactFromMessage({role:'assistant',content}),example.content);
        assert.deepEqual((await stored(page)).artifacts,artifacts,'regex fixture was duplicated');
      }
      const before = (await stored(page)).artifacts;
      for (const content of ['Ordinary prose and `inline code`.', '```js\\nnot a real newline```']) {
        await page.evaluate(content => saveArtifactFromMessage({content}),content);
      }
      assert.deepEqual((await stored(page)).artifacts,before,'non-fenced text saved as code');
      await navigate(page,'library');
      await page.getByRole('tab',{name:'Artifacts',exact:true}).click();
      // Non-HTML artifacts use the real code reader, not a canned preview.
      await page.locator('.studio-library-row').filter({hasText:'javascript artifact'}).locator('.studio-library-open').click();
      assert.equal(await page.locator('.studio-artifact-code').textContent(),examples[0].code);
    });

    await test('projects-create-and-restore-conversation-context', legacyDb(), async page => {
      const answer = 'Acknowledged by the local fixture.';
      const requests = await mockProvider(page,answer);
      await navigate(page,'projects');
      await page.locator('.studio-project-card').filter({hasText:legacyDb().projects[0].name}).click();
      assert.equal(await page.getByLabel('Project instructions',{exact:true}).inputValue(),INSTRUCTIONS);
      await page.locator('#workspaceView').getByRole('button',{name:new RegExp(legacyDb().conversations[1].title)}).click();
      await assertContext(page,PROJECT_CHAT,PROJECT);
      assert(await page.locator('#chatInner').getByText('Keep this project question.',{exact:true}).isVisible());
      await navigate(page,'projects');
      await page.locator('.studio-project-card').click();
      await page.locator('#workspaceView').getByRole('button',{name:'New chat',exact:true}).click();
      await assertContext(page,null,PROJECT);
      assert.match(await page.locator('#studioContext').innerText(),/Upgrade project/);
      await send(page,'Please acknowledge this message.',answer);
      assert.equal(await page.evaluate(() => conv.projectId),PROJECT);
      assert(requests[0].body.messages.some(m => m.role === 'system' && m.content.includes(INSTRUCTIONS)), 'project instructions missing from real request');
      await sidebar(page);
      await page.locator('.studio-conv-open').filter({hasText:legacyDb().conversations[0].title}).click();
      await assertContext(page,GENERAL_CHAT,null);
      assert(!(await page.locator('#studioContext').getByText(legacyDb().projects[0].name,{exact:true}).isVisible()));
      await send(page,'Please acknowledge the standalone message.',answer);
      assert(!requests.at(-1).body.messages.some(m => m.role === 'system' && m.content.includes(INSTRUCTIONS)), 'project instructions leaked into standalone chat');
      await page.evaluate(id => studioOpenConversation(db.conversations.find(c => c.id === id)),PROJECT_CHAT);
      await page.locator('#newChatBtn').click();
      await assertContext(page,null,null);
      await navigate(page,'projects');
      await page.getByRole('button',{name:'New project',exact:true}).click();
      await page.locator('#customDialogInput').fill('Created through Studio');
      await page.locator('#customDialogConfirm').click();
      await page.getByRole('heading',{name:'Created through Studio',exact:true}).waitFor();
      await page.getByLabel('Project instructions',{exact:true}).fill('Keep this new project instruction.');
      await page.getByLabel('Project instructions',{exact:true}).press('Tab');
      const created = (await stored(page)).projects.find(p => p.name === 'Created through Studio');
      assert.equal(created.instructions,'Keep this new project instruction.');
      await page.getByRole('button',{name:'Start a conversation',exact:true}).click();
      await assertContext(page,null,created.id);
      await reload(page);
      assert.equal((await stored(page)).projects.find(p => p.id === created.id).instructions,created.instructions);
    });

    await test('project-reassignment-keeps-messages-through-chip-and-tools', legacyDb(), async page => {
      const projectName = legacyDb().projects[0].name;
      const openConversation = async () => {
        await sidebar(page);
        await page.locator('.studio-conv-open').filter({hasText:legacyDb().conversations[1].title}).click();
      };
      await openConversation();
      const before = await stored(page);
      const assertAssignment = async projectId => {
        await assertContext(page,PROJECT_CHAT,projectId);
        assert.equal(await page.evaluate(() => conv.projectId),projectId,'conversation and active project disagree');
        const expected = before.conversations.map(c => c.id === PROJECT_CHAT ? {...c,projectId} : c);
        for (const snapshot of [await page.evaluate(() => db), await stored(page)]) {
          assert.equal(snapshot.activeProjectId,projectId);
          assert.deepEqual(snapshot.conversations,expected,'project reassignment altered messages, metadata or another conversation');
          assert.deepEqual(snapshot.projects,before.projects,'project reassignment altered project data');
        }
        assert(await page.locator('#chatInner').getByText('Keep this project question.',{exact:true}).isVisible());
        assert.match(await page.locator('#chatInner .msg.assistant').innerText(),/Here is the retained document/);
        assert.equal(await page.locator('#studioContext').getByRole('button',{name:'Change project: '+projectName,exact:true}).count(),projectId ? 1 : 0);
      };
      const chip = page.locator('#studioContext').getByRole('button',{name:'Change project: '+projectName,exact:true});
      await chip.click();
      assert.equal(await page.locator('#toolsSheet').getAttribute('aria-label'),'Conversation project');
      assert(!(await page.locator('#studioChatControls').isVisible()));
      assert(await page.locator('#toolsSheet').getByRole('button',{name:projectName+' ✓',exact:true}).isVisible());
      await escapeSheet(page,'toolsSheet');
      await assertAssignment(PROJECT);
      await chip.click();
      await page.locator('#toolsSheet').getByRole('button',{name:'No project',exact:true}).click();
      await page.locator('#toolsSheet').waitFor({state:'hidden'});
      await assertAssignment(null);
      await reload(page);
      assert.equal((await stored(page)).activeProjectId,null);
      await openConversation();
      await assertAssignment(null);
      await page.locator('#moreToolsBtn').click();
      await page.locator('#toolsSheet').getByRole('button',{name:'Project: None',exact:true}).click();
      assert(await page.locator('#toolsSheet').getByRole('button',{name:'No project ✓',exact:true}).isVisible());
      await page.locator('#toolsSheet').getByRole('button',{name:projectName,exact:true}).click();
      await page.locator('#toolsSheet').waitFor({state:'hidden'});
      await assertAssignment(PROJECT);
      // Tools must also expose the current assignment, not a stale None label.
      await page.locator('#moreToolsBtn').click();
      await page.locator('#toolsSheet').getByRole('button',{name:'Project: '+projectName,exact:true}).click();
      assert(await page.locator('#toolsSheet').getByRole('button',{name:projectName+' ✓',exact:true}).isVisible());
      await escapeSheet(page,'toolsSheet');
      await reload(page);
      assert.equal((await stored(page)).activeProjectId,PROJECT);
      await openConversation();
      await assertAssignment(PROJECT);
    });

    await test('generation-blocks-navigation-with-real-mocked-send', legacyDb(), async page => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const requests = await mockProvider(page,'The delayed fixture response is complete.',gate);
      try {
        await page.evaluate(id => studioNewChat(id),PROJECT);
        await page.locator('#promptInput').fill('Say hello once.');
        const request = page.waitForRequest(API);
        await page.locator('#sendBtn').click();
        await request;
        await page.waitForFunction(() => generating);
        const before = await page.evaluate(() => ({id:conv.id,project:db.activeProjectId,messages:conv.messages.map(m => m.id)}));
        const unchanged = async () => {
          assert.deepEqual(await page.evaluate(() => ({id:conv.id,project:db.activeProjectId,messages:conv.messages.map(m => m.id)})),before);
          assert.equal(await page.locator('#main').getAttribute('data-view'),'chat');
          assert.equal(await page.evaluate(() => generating),true);
        };
        for (const view of ['projects','library','chat']) {
          await page.locator(`[data-studio-view="${view}"]`).click();
          await unchanged();
        }
        for (const selector of ['#newChatBtn','#sideNew']) { await page.locator(selector).click(); await unchanged(); }
        await page.locator('.studio-conv-open').filter({hasText:legacyDb().conversations[0].title}).click();
        await unchanged();
        await page.evaluate(() => studioNewChat(null));
        await unchanged();
        assert.match(await page.locator('#toast').innerText(),/Stop the current response/);
        assert.equal(await page.locator('#sendBtn').getAttribute('aria-label'),'Stop response');
        release();
        await page.waitForFunction(() => !generating && conv.messages.at(-1).content === 'The delayed fixture response is complete.');
        assert.equal(requests[0].method,'POST');
        assert.equal(requests[0].body.model,'studio-test-a');
        assert.equal(requests[0].body.messages.at(-1).content,'Say hello once.');
        assert((await stored(page)).conversations.some(c => c.id === before.id && c.messages.at(-1).content === 'The delayed fixture response is complete.'));
        await navigate(page,'projects');
      } finally { release(); }
    });

    await test('tools-real-controls-persistence-and-context-chips', legacyDb(), async page => {
      for (const id of ['tglSearch','tglThink','effortBtn','skillBtn']) {
        assert(!(await page.locator('#'+id).isVisible()),id+' should be inside the closed Tools sheet');
        assert(await page.locator('#'+id).evaluate(n => !!n.closest('#toolsSheet')));
      }
      await page.locator('#moreToolsBtn').click();
      await page.locator('#tglSearch').click();
      await page.locator('#tglThink').click();
      assert.equal(await page.locator('#tglSearch').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#tglThink').getAttribute('aria-pressed'),'true');
      await page.locator('#effortBtn').click();
      await page.locator('#effortOptions').getByRole('button',{name:'High',exact:true}).click();
      await page.locator('#skillBtn').click();
      await page.locator('#skillSheet').getByRole('button',{name:'Manual',exact:true}).click();
      await page.getByRole('switch',{name:'Select Fixture review guidance',exact:true}).click();
      await escapeSheet(page,'skillSheet');
      const chosen = await stored(page);
      assert.equal(chosen.search,true); assert.equal(chosen.thinking,true);
      assert.equal(chosen.reasoningEffort,'high');
      assert.deepEqual(chosen.skillSettings.selected,['custom-fixture-guidance']);
      assert.equal(chosen.skillSettings.mode,'manual');
      await reload(page);
      for (const name of ['Remove Web search','Remove Thinking · high','Remove 1 skills']) {
        assert(await page.locator('#studioContext').getByRole('button',{name,exact:true}).isVisible());
      }
      await page.locator('#moreToolsBtn').click();
      assert.equal(await page.locator('#tglSearch').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#tglThink').getAttribute('aria-pressed'),'true');
      assert.match(await page.locator('#effortBtn').innerText(),/High/);
      await escapeSheet(page,'toolsSheet');
      assert(await page.locator('#moreToolsBtn').evaluate(n => n === document.activeElement));
      await screenshot(page,'tools-context-chips');
      for (const name of ['Remove Web search','Remove Thinking · high','Remove 1 skills']) {
        await page.locator('#studioContext').getByRole('button',{name,exact:true}).click();
      }
      await reload(page);
      const cleared = await stored(page);
      assert.equal(cleared.search,false); assert.equal(cleared.thinking,false);
      assert.equal(cleared.skillSettings.mode,'auto');
      assert(!(await page.locator('#studioContext').isVisible()));
    });

    await test('model-selection-remains-real-and-persists', legacyDb(), async page => {
      await page.locator('#bottomModelBtn').click();
      await page.getByPlaceholder('Search models…',{exact:true}).fill('studio-test-b');
      await page.locator('#modelList .model-item').filter({hasText:'studio-test-b'}).click();
      assert.equal(await page.evaluate(() => currentModel().modelId),'studio-test-b');
      assert.match(await page.locator('#modelName').innerText(),/Studio Test B/);
      await reload(page);
      assert.equal(await page.evaluate(() => currentModel().modelId),'studio-test-b');
      await page.evaluate(id => studioOpenConversation(db.conversations.find(c => c.id === id)),GENERAL_CHAT);
      assert.equal(await page.evaluate(() => currentModel().modelId),'studio-test-a','chat must restore its own model');
      await page.locator('#bottomModelBtn').click();
      await page.locator('#modelList .model-item').filter({hasText:'studio-test-b'}).click();
      assert.equal((await stored(page)).conversations.find(c => c.id === GENERAL_CHAT).modelId,'studio-test-b');
      const requests = await mockProvider(page,'Selected model fixture response.');
      await send(page,'Say hello.', 'Selected model fixture response.');
      assert.equal(requests[0].body.model,'studio-test-b','composer ignored the selected model');
    });

    await test('conversation-text-size-changes-rendered-text', legacyDb(), async page => {
      await page.evaluate(id => studioOpenConversation(db.conversations.find(c => c.id === id)),GENERAL_CHAT);
      const normalSize = await page.locator('.msg.assistant .md').evaluate(n => parseFloat(getComputedStyle(n).fontSize));
      await settings(page,'Appearance');
      await page.getByRole('combobox',{name:'Conversation text size',exact:true}).selectOption('large');
      await escapeSheet(page,'setSheet');
      const largerSize = await page.locator('.msg.assistant .md').evaluate(n => parseFloat(getComputedStyle(n).fontSize));
      assert(largerSize > normalSize,`Larger text has no rendered effect: default=${normalSize}px, large=${largerSize}px`);
    });

    await test('appearance-persists-and-system-follows-matchmedia', legacyDb(), async page => {
      await settings(page,'Appearance');
      const size = page.getByRole('combobox',{name:'Conversation text size',exact:true});
      await size.selectOption('large');
      for (const theme of ['light','dark']) {
        await page.locator(`[data-theme-choice="${theme}"]`).click();
        assert.equal(await page.locator(`[data-theme-choice="${theme}"]`).getAttribute('aria-pressed'),'true');
        await reload(page);
        assert.equal((await stored(page)).theme,theme);
        assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
        assert.equal(await page.locator('html').getAttribute('data-text-size'),'large');
        await settings(page,'Appearance');
        assert.equal(await page.locator(`[data-theme-choice="${theme}"]`).getAttribute('aria-pressed'),'true');
        assert.equal(await size.inputValue(),'large');
      }
      await page.locator('[data-theme-choice="system"]').click();
      for (const colorScheme of ['light','dark','light']) {
        await page.emulateMedia({colorScheme});
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme,colorScheme);
        assert.equal((await stored(page)).theme,'system','system preference was replaced by a resolved theme');
        assert.equal(await page.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches),colorScheme === 'light');
      }
      await reload(page);
      assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
      await page.emulateMedia({colorScheme:'dark'});
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      await settings(page,'Appearance');
      assert.equal(await page.locator('[data-theme-choice="system"]').getAttribute('aria-pressed'),'true');
      await screenshot(page,'appearance-system');
      await size.selectOption('default');
      await reload(page);
      assert.equal((await stored(page)).textSize,'default');
      // Explicit themes must ignore subsequent OS changes.
      await settings(page,'Appearance');
      await page.locator('[data-theme-choice="dark"]').click();
      await page.emulateMedia({colorScheme:'light'});
      assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    });

    await test('appearance-mocked-native-system-preference-overrides-browser', {...legacyDb(),theme:'system'}, async page => {
      // Browser-only mock of the optional Android bridge: this is NOT a device/OS integration test.
      // Install before reload so startup, rather than a direct applyTheme() call, resolves the theme.
      await page.addInitScript(() => {
        if (window !== window.top) return;
        window.studioMockNativeTheme = {dark:false,reads:0,syncs:[]};
        window.NazTheme = {
          isSystemDark:() => { window.studioMockNativeTheme.reads++; return window.studioMockNativeTheme.dark; },
          sync:(...args) => window.studioMockNativeTheme.syncs.push(args)
        };
      });
      await reload(page);
      const assertTheme = async (resolved,preference = 'system') => {
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme,resolved);
        assert.equal(await page.locator('html').evaluate(n => getComputedStyle(n).colorScheme),resolved,'rendered controls use the wrong palette');
        assert.equal(await page.locator('meta[name="color-scheme"]').getAttribute('content'),resolved);
        assert.equal(await page.evaluate(() => db.theme),preference);
        assert.equal((await stored(page)).theme,preference,'resolved native theme overwrote the stored preference');
        assert.equal(await page.evaluate(() => window.studioMockNativeTheme.syncs.at(-1)?.[0]),resolved === 'light');
      };
      assert.equal(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches),true);
      assert(await page.evaluate(() => window.studioMockNativeTheme.reads > 0),'native preference was not read on startup');
      await assertTheme('light'); // Mock native light must beat browser dark, including a false return value.
      await settings(page,'Appearance');
      assert.equal(await page.locator('[data-theme-choice="system"]').getAttribute('aria-pressed'),'true');
      for (const colorScheme of ['light','dark','light']) {
        const reads = await page.evaluate(() => window.studioMockNativeTheme.reads);
        await page.emulateMedia({colorScheme});
        await page.waitForFunction(before => window.studioMockNativeTheme.reads > before,reads);
        assert.equal(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches),colorScheme === 'dark');
        await assertTheme('light');
      }
      // Simulate native configuration callbacks while browser media remains light.
      for (const dark of [true,false,true]) {
        await page.evaluate(dark => {
          window.studioMockNativeTheme.dark = dark;
          window.nazSystemThemeChanged();
        },dark);
        assert.equal(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches),false);
        await assertTheme(dark ? 'dark' : 'light');
      }
      for (const theme of ['light','dark']) {
        await page.locator(`[data-theme-choice="${theme}"]`).click();
        const syncs = await page.evaluate(() => window.studioMockNativeTheme.syncs.length);
        await page.evaluate(dark => {
          window.studioMockNativeTheme.dark = dark;
          window.nazSystemThemeChanged();
        },theme === 'light'); // Opposite mock native preference must not override an explicit theme.
        await assertTheme(theme,theme);
        assert.equal(await page.evaluate(() => window.studioMockNativeTheme.syncs.length),syncs,'native callback reapplied an explicit theme');
        assert.equal(await page.locator(`[data-theme-choice="${theme}"]`).getAttribute('aria-pressed'),'true');
      }
      await page.locator('[data-theme-choice="system"]').click();
      await assertTheme('light');
      await reload(page);
      await assertTheme('light');
    });

    await test('keyboard-dialog-escape-and-focus', legacyDb(), async page => {
      await page.locator('#moreToolsBtn').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement.id === 'toolsSheet');
      assert.equal(await page.locator('#toolsSheet').getAttribute('role'),'dialog');
      assert.equal(await page.locator('#toolsSheet').getAttribute('aria-modal'),'true');
      await page.keyboard.press('Tab');
      assert(await page.locator('[data-close="toolsSheet"]').evaluate(n => n === document.activeElement));
      await page.keyboard.press('Shift+Tab');
      assert(await page.evaluate(() => document.querySelector('#toolsSheet').contains(document.activeElement)), 'focus escaped the dialog');
      assert(!(await page.locator('[data-close="toolsSheet"]').evaluate(n => n === document.activeElement)), 'reverse Tab did not wrap');
      await escapeSheet(page,'toolsSheet');
      assert(await page.locator('#moreToolsBtn').evaluate(n => n === document.activeElement));
      await page.locator('#bottomModelBtn').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement.id === 'modelSheet');
      await escapeSheet(page,'modelSheet');
      assert(await page.locator('#bottomModelBtn').evaluate(n => n === document.activeElement));
      await page.locator('#menuBtn').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#menuBtn').getAttribute('aria-expanded'),'false');
      assert(await page.locator('#menuBtn').evaluate(n => n === document.activeElement));
    },{width:390,height:844});

    for (const viewport of [{width:390,height:844},{width:1440,height:900},{width:320,height:480},{width:800,height:400}]) {
      await test('responsive-'+viewport.width+'x'+viewport.height, {...legacyDb(),search:true,thinking:true}, async page => {
        // Resize a running app, including keyboard-height and landscape cases.
        await page.setViewportSize(viewport);
        const font = await page.locator('body').evaluate(n => getComputedStyle(n).fontFamily);
        assert.match(font,/DM Sans/,'Studio font CSS is not applied');
        // The font ships in the app; it must load with every network request blocked.
        assert(await page.locator('head link[rel="stylesheet"]').evaluateAll(links => links.some(n => /vendor\/fonts\.css$/.test(n.href))));
        assert(await page.evaluate(async () => (await document.fonts.load('16px "DM Sans"')).length > 0), 'bundled DM Sans did not load');
        await page.locator('#promptInput').fill(Array.from({length:12},(_,i) => 'Line '+i+' of the unsent resize fixture.').join('\n'));
        for (const selector of ['#promptInput','#attachBtn','#bottomModelBtn','#moreToolsBtn','#sendBtn']) await target(page,selector);
        await noOverflow(page,'composer '+viewport.width);
        await screenshot(page,'composer-'+viewport.width+'x'+viewport.height);
        await page.locator('#moreToolsBtn').click();
        for (const id of ['tglSearch','tglThink','effortBtn','skillBtn']) await target(page,'#'+id,true);
        await noOverflow(page,'Tools '+viewport.width);
        await screenshot(page,'tools-'+viewport.width+'x'+viewport.height);
        await page.locator('#tglSearch').click();
        assert.equal((await stored(page)).search,false,'Tools control not operable after resizing');
        await escapeSheet(page,'toolsSheet');
        await page.locator('#bottomModelBtn').click();
        await target(page,'#modelList .model-item:first-of-type',true);
        await noOverflow(page,'models '+viewport.width);
        await escapeSheet(page,'modelSheet');
        await page.evaluate(id => studioOpenConversation(db.conversations.find(c => c.id === id)),PROJECT_CHAT);
        await noOverflow(page,'conversation '+viewport.width);
        for (const selector of ['#promptInput','#attachBtn','#bottomModelBtn','#moreToolsBtn','#sendBtn']) await target(page,selector);
        await screenshot(page,'conversation-'+viewport.width+'x'+viewport.height);
        await navigate(page,'projects');
        await noOverflow(page,'projects '+viewport.width);
        await navigate(page,'library');
        await screenshot(page,'library-'+viewport.width+'x'+viewport.height);
        await noOverflow(page,'library '+viewport.width);
      },{width:390,height:844});
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
  }
  const failed = results.filter(result => result.status === 'failed');
  console.log(`${results.length-failed.length}/${results.length} Studio regression cases passed. Artifacts: test-results/studio/`);
  if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
