const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {launch, root} = require('../../tests/browser');
const output = path.join(root, 'test-results/kita-studio');
fs.mkdirSync(output, {recursive:true});
const url = process.env.PREVIEW_URL || require('node:url').pathToFileURL(path.join(__dirname, 'index.html')).href;
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
async function noOverflow(page, name) {
  const measurements = await page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth,
    main: document.querySelector('.main').scrollWidth,
    mainWidth: document.querySelector('.main').clientWidth,
    dialogs: [...document.querySelectorAll('.dialog,.settings-content,.dialog-body')].filter(x=>x.getClientRects().length).map(x=>({w:x.clientWidth,s:x.scrollWidth}))
  }));
  check(measurements.document <= measurements.viewport + 1, `${name}: document overflow ${JSON.stringify(measurements)}`);
  check(measurements.main <= measurements.mainWidth + 1, `${name}: main overflow`);
  for(const d of measurements.dialogs) check(d.s <= d.w+1, `${name}: dialog overflow ${JSON.stringify(d)}`);
}
async function shot(page,name){ await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true,style:'#toast{visibility:hidden!important}'}); }
(async()=>{
  const browser=await launch();
  try {
    for (const width of [360,390,768,1440]) {
      for (const theme of ['light','dark']) {
        const page=await browser.newPage({viewport:{width,height:width>760?960:844},colorScheme:theme});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url,{waitUntil:'networkidle'});
        check(await page.locator('.home h1').isVisible(), 'Home renders');
        check(await page.evaluate(()=>document.documentElement.dataset.theme)===theme,'System theme respected');
        await noOverflow(page,`${width} ${theme} home`);
        await shot(page,`${theme}-${width}-home`);
        await page.locator('[data-action="models"]').click();
        await noOverflow(page,`${width} model picker`);
        await shot(page,`${theme}-${width}-models`);
        await page.locator('#modelSearch').fill('openai');
        check(await page.locator('[data-model]').count()===1,'Model search filters');
        await page.locator('[data-model="gpt"]').click();
        check(await page.locator('#modelName').textContent()==='GPT-4.1','Model selection updates composer');
        await page.locator('[data-action="tools"]').click();
        await page.locator('[data-toggle="search"]').click();
        await page.locator('[data-toggle="thinking"]').click();
        await page.locator('[data-depth="Deep"]').click();
        await page.locator('[data-skill="Frontend"]').click();
        check(await page.locator('[data-toggle="search"]').getAttribute('aria-checked')==='true','Search switch state');
        await noOverflow(page,`${width} tools`);
        await shot(page,`${theme}-${width}-tools`);
        await page.getByRole('button',{name:'Done',exact:true}).click();
        check(await page.locator('#toolCount').textContent()==='3','Active tool count');
        check(await page.locator('#contextLine').innerText().then(t=>t.includes('Deep thinking')),'Tool context is visible');
        await page.locator('[data-remove-context="search"]').click();
        check(await page.locator('#toolCount').textContent()==='2','Removing context updates tools');
        await page.locator('#prompt').fill('Design a calm website for a studio');
        await page.locator('#send').click();
        await page.waitForSelector('.typing-status');
        check(await page.locator('#send').getAttribute('aria-label')==='Stop response','Streaming stop action shown');
        await page.locator('#send').click();
        check(await page.locator('.response-meta').textContent().then(t=>t.includes('Stopped')),'Stop preserves partial response');
        await page.locator('[data-regenerate]').click();
        await page.waitForSelector('.artifact-card',{timeout:12000});
        await page.locator('#viewport').evaluate(e=>e.scrollTop=0);
        await noOverflow(page,`${width} chat`);
        await shot(page,`${theme}-${width}-chat`);
        await page.locator('.artifact-card').click();
        await page.frameLocator('iframe').getByRole('heading',{name:'Good things take shape.'}).waitFor();
        check(await page.locator('iframe').getAttribute('sandbox')==='','Artifact has no script/bridge permissions');
        await noOverflow(page,`${width} artifact`);
        await shot(page,`${theme}-${width}-artifact`);
        await page.locator('[data-artifact-tab="code"]').click();
        check(await page.locator('#artifactStage pre').isVisible(),'Code tab works');
        await page.locator('[data-artifact-tab="preview"]').click();
        await page.locator('[data-artifact-width="mobile"]').click();
        check(await page.locator('iframe').evaluate(e=>e.classList.contains('mobile-size')),'Preview width switches');
        await page.locator('[data-action="save-artifact"]').click();
        check(await page.locator('[data-action="save-artifact"]').innerText().then(t=>t.includes('Saved')),'Save feedback');
        await page.locator('[data-action="close-modal"]').click();
        if(width<=760) await page.locator('[data-action="open-nav"]').click();
        await page.locator('[data-action="settings"]').click();
        await page.locator('[data-test-connection="0"]').click();
        await page.waitForFunction(()=>document.querySelector('#connectionStatus0').textContent==='Demo test passed');
        check(await page.locator('#connectionStatus0').textContent()==='Demo test passed','Explicitly simulated connection test');
        await page.locator('[data-settings-tab="appearance"]').click();
        await noOverflow(page,`${width} appearance`);
        await shot(page,`${theme}-${width}-settings`);
        const opposite=theme==='light'?'dark':'light';
        await page.locator(`[data-theme-option="${opposite}"]`).click();
        check(await page.evaluate(()=>document.documentElement.dataset.theme)===opposite,'Theme switch updates entire prototype');
        check(await page.evaluate(()=>document.activeElement.matches('[data-theme-option]')),'Theme selection retains keyboard focus');
        await page.locator(`[data-theme-option="${theme}"]`).click();
        await page.locator('#textSize').selectOption('Larger');
        check(await page.locator('.response-body').first().evaluate(e=>getComputedStyle(e).fontSize)==='18px','Text size preference works');
        await page.keyboard.press('Escape');
        check(await page.locator('#modalLayer').isHidden(),'Escape closes dialog');
        if(width<=760)await page.locator('[data-action="open-nav"]').click();
        await page.locator('[data-page="projects"]').click();
        await noOverflow(page,`${width} projects`);
        await shot(page,`${theme}-${width}-projects`);
        await page.locator('[data-action="new-project"]').click();
        await page.locator('#projectName').fill('A fresh idea');
        await page.locator('#projectDescription').fill('Created while testing the frontend.');
        await page.locator('#createProject').click();
        check(await page.locator('.project-card').count()===3,'New project is added');
        await page.locator('.project-card').last().click();
        check(await page.locator('#contextLine').innerText().then(t=>t.includes('A fresh idea')),'Project context attached to chat');
        if(width<=760)await page.locator('[data-action="open-nav"]').click();
        await page.locator('[data-page="library"]').click();
        await page.locator('[data-library-tab="prompt"]').click();
        check(await page.locator('.library-row').count()===2,'Library filters prompts');
        await page.locator('[data-library-tab="all"]').click();
        await noOverflow(page,`${width} library`);
        await shot(page,`${theme}-${width}-library`);
        await page.locator('[data-library-item="prompt-1"]').click();
        check(await page.locator('#prompt').inputValue().then(t=>t.includes('clearer')),'Library prompt fills composer');
        await page.locator('#fileInput').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('NOT READ BY PROTOTYPE')});
        check(await page.locator('#contextLine').innerText().then(t=>t.includes('notes.txt')),'Attachment filename displays');
        check(await page.evaluate(()=>localStorage.getItem('nazchat_v1'))===null,'Production storage key untouched');
        check(errors.length===0,`No browser exceptions: ${errors.join(', ')}`);
        await page.close();
      }
    }
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await page.goto(url,{waitUntil:'networkidle'});
    await page.locator('[data-action="models"]').click();
    await page.locator('.dialog').focus();
    await page.keyboard.press('Tab');
    check(await page.evaluate(()=>document.activeElement.closest('.dialog')!==null),'Modal focus contained');
    await page.keyboard.press('Shift+Tab');
    check(await page.evaluate(()=>document.activeElement.closest('.dialog')!==null),'Reverse focus contained');
    check(await page.locator('.dialog').evaluate(e=>getComputedStyle(e).animationName)==='none','Reduced motion respected');
    await page.keyboard.press('Escape');
    await page.locator('[data-action="open-nav"]').click();
    await page.keyboard.press('Escape');
    check(await page.locator('#sidebar').evaluate(e=>e.inert),'Closed mobile drawer is inert');
    await page.locator('[data-action="tools"]').click();
    check(await page.locator('[data-toggle="thinking"]').getAttribute('aria-checked')==='false','Tools start with clear default state');
    await page.keyboard.press('Escape');
    await page.close();
    const flow=await browser.newPage({viewport:{width:390,height:844}});
    await flow.goto(url,{waitUntil:'networkidle'});
    await flow.locator('[data-action="open-nav"]').click();
    await flow.locator('[data-page="projects"]').click();
    check(await flow.evaluate(()=>document.activeElement.id)==='page','Drawer navigation restores content focus');
    await flow.locator('[data-project="notes"]').click();
    await flow.locator('#prompt').fill('A question about learning');
    await flow.locator('#send').click();
    await flow.waitForSelector('.response-actions',{timeout:12000});
    await flow.locator('#prompt').fill('Build a website for my notes');
    await flow.locator('#send').click();
    await flow.waitForSelector('.artifact-card',{timeout:12000});
    await flow.locator('[data-regenerate]').last().click();
    await flow.waitForSelector('.artifact-card',{timeout:12000});
    check(await flow.locator('.artifact-card').count()===1,'Regeneration retains later message type');
    await flow.locator('[data-action="open-nav"]').click();
    await flow.locator('[data-page="library"]').click();
    await flow.locator('[data-action="open-nav"]').click();
    await flow.locator('#history button').first().click();
    check(await flow.locator('#contextLine').innerText().then(t=>t.includes('Things I’m learning')),'Reopened chat restores project association');
    await flow.close();
    for (const viewport of [{width:800,height:400},{width:320,height:480}]) {
      const p=await browser.newPage({viewport});
      await p.goto(url,{waitUntil:'networkidle'});
      if(viewport.width<=760)await p.locator('[data-action="open-nav"]').click();
      await p.locator('[data-action="settings"]').click();
      await p.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
      const bounds=await p.locator('.dialog').boundingBox();
      check(bounds.y>=0 && bounds.y+bounds.height<=viewport.height+1,'Short-screen dialog stays inside viewport');
      await noOverflow(p,'short-screen settings');
      await p.keyboard.press('Escape');
      await p.locator('[data-action="tools"]').click();
      await p.locator('[data-toggle="search"]').click();
      await p.locator('[data-toggle="thinking"]').click();
      await p.locator('[data-skill="Research"]').click();
      await p.getByRole('button',{name:'Done',exact:true}).click();
      await p.locator('#fileInput').setInputFiles([1,2,3,4].map(n=>({name:'long-research-document-'+n+'.txt',mimeType:'text/plain',buffer:Buffer.from('example')})));
      const sendBox=await p.locator('#send').boundingBox();
      check(sendBox.y+sendBox.height<=viewport.height,'Composer remains visible with many context chips');
      await noOverflow(p,'short-screen full-context');
      await shot(p,`short-${viewport.width}-context`);
      await p.close();
    }
    console.log(`PASS: ${checks} assertions, 8 viewport/theme combinations. Screenshots: ${output}`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
