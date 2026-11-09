const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {launch, appUrl, root} = require('./browser');

// Real component rendering + computed contrast, not just checking token strings.
// Fixtures never send a provider request or read the user's app data.
(async () => {
  const browser = await launch();
  const output = path.join(root, 'test-results/themes');
  fs.mkdirSync(output, {recursive:true});
  let checks = 0;
  try {
    for (const width of [360, 390, 1440]) {
      const page = await browser.newPage({viewport:{width, height:width > 760 ? 1000 : 844}, reducedMotion:'reduce'});
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://raw.githubusercontent.com/**', r => r.abort());
      await page.addInitScript(() => {
        if(window!==window.top)return;
        if(!localStorage.getItem('nazchat_v1'))localStorage.setItem('nazchat_v1',JSON.stringify({onboardingDone:true}));
        window.themeSyncs = [];
        window.NazTheme = {sync:(...args) => window.themeSyncs.push(args)};
      });
      await page.goto(appUrl);
      await page.waitForFunction(() => typeof applyTheme === 'function' && typeof renderAll === 'function');
      await page.evaluate(() => {
        db.onboardingDone = true;
        document.querySelector('#onboardingScrim').classList.remove('open');
        db.providers = [{id:'theme-provider', name:'Example provider', baseUrl:'https://example.invalid/v1', apiKey:'test-only', headers:[], selectedModels:['model-one','model-two'], modelMeta:{'model-one':{context_length:128000}}}];
        db.lastProviderId = 'theme-provider'; db.lastModelId = 'model-one';
        db.prompts = [{id:'prompt',name:'Explain clearly',content:'Explain this code with an example.'}];
        db.artifacts = [{id:'artifact',name:'Sample page',kind:'html',content:'<h1>Sample</h1>',createdAt:Date.now()}];
        save(); renderAll();
      });

      async function checkScreen(label, theme) {
        const expected={empty:'#empty',chat:'.code-wrap',sidebar:'#sidebarPanel',models:'#modelSheet',settings:'#setSheet',appearance:'#provList .settings-row',providers:'.provider-card','provider-form':'#provSheet',skills:'.skill-row',tools:'#toolsSheet','dialog-input':'#customDialogScrim','dialog-textarea':'#customDialogScrim','dialog-danger':'#customDialogScrim',effort:'#effortScrim',edit:'#editScrim',onboarding:'#onboardingScrim','preview-code':'#previewCode','preview-console':'#previewConsole',toasts:'#toast'};
        const required=expected[label]||(label.startsWith('models')?'#modelSheet':null);
        if(required)assert(await page.locator(required).first().isVisible(),`${label}: expected screen is hidden`);
        const result = await page.evaluate(() => {
          const parse = str => {
            const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
            ctx.fillStyle = str; ctx.fillRect(0,0,1,1);
            const rgba = [...ctx.getImageData(0,0,1,1).data]; rgba[3] /= 255;
            return rgba;
          };
          const over = (fg,bg) => fg.slice(0,3).map((x,i) => x*fg[3]+bg[i]*(1-fg[3])).concat(1);
          const background = element => {
            const chain = []; for(let n=element;n;n=n.parentElement)chain.unshift(n);
            return chain.reduce((bg,n) => over(parse(getComputedStyle(n).backgroundColor),bg), [255,255,255,1]);
          };
          // Composite each opacity group onto its parent's surface (opacity is not inherited).
          const opacityComposite = (color,element) => {
            for(let n=element;n;n=n.parentElement){
              const alpha=Number(getComputedStyle(n).opacity);
              if(alpha<1)color=over([...color.slice(0,3),alpha],n.parentElement?background(n.parentElement):[255,255,255,1]);
            }
            return color;
          };
          const luminance = c => c.slice(0,3).map(x => x/255).map(x => x<=.04045 ? x/12.92 : ((x+.055)/1.055)**2.4).reduce((a,x,i) => a+x*[.2126,.7152,.0722][i],0);
          const ratio = (a,b) => {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
          const visible = n => {
            if(!n.getClientRects().length || getComputedStyle(n).visibility !== 'visible')return false;
            if(n.closest('.sheet:not(.open),.modal-scrim:not(.open),#customDialogScrim:not(.open),.preview-screen:not(.open)'))return false;
            for(let p=n;p;p=p.parentElement)if(Number(getComputedStyle(p).opacity)===0)return false;
            return !n.closest('#previewFrame');
          };
          const low = [];
          for(const n of document.querySelectorAll('body *')){
            if(!visible(n) || n.closest('svg,script,style') || n.matches(':disabled'))continue;
            const direct = [...n.childNodes].some(x=>x.nodeType===3 && x.textContent.trim());
            if(!direct && !n.matches('input:not([type=range]):not([type=checkbox]),textarea'))continue;
            const s=getComputedStyle(n),bg=background(n),fg=over(parse(s.color),bg);
            const min = parseFloat(s.fontSize)>=24 || (parseFloat(s.fontSize)>=18.66 && Number(s.fontWeight)>=700) ? 3 : 4.5;
            const c=ratio(opacityComposite(fg,n),opacityComposite(bg,n));
            if(c < min-.03)low.push({node:n.id||n.className||n.tagName,text:n.textContent.trim().slice(0,42),contrast:c.toFixed(2),fg:s.color,bg});
            if(n.matches('input,textarea') && n.placeholder){
              const ps=getComputedStyle(n,'::placeholder'),pf=parse(ps.color);pf[3]*=Number(ps.opacity);
              const pc=ratio(opacityComposite(over(pf,bg),n),opacityComposite(bg,n));
              if(pc<4.47)low.push({node:(n.id||n.className)+'::placeholder',contrast:pc.toFixed(2)});
            }
          }
          const variables = getComputedStyle(document.documentElement);
          const surfaceSelectors = ['#main','#sidebarPanel','#composer','#inputRow','.sheet.open','.modal-scrim.open .modal','#customDialogScrim.open .custom-dialog','.settings-hub-group','.code-live-body','#previewCode'];
          const fade=getComputedStyle(document.querySelector('#composerWrap')).backgroundImage;
          const surfaces=surfaceSelectors.flatMap(sel=>[...document.querySelectorAll(sel)].filter(visible).map(n=>({sel,light:luminance(background(n))>.5})));
          return {low,surfaces,fade,overflow:document.documentElement.scrollWidth>innerWidth,scheme:variables.colorScheme,bg:variables.getPropertyValue('--bg').trim(),meta:document.querySelector('meta[name=theme-color]').content};
        });
        assert.equal(result.overflow,false,`${width}/${theme}/${label}: horizontal overflow`);
        assert.equal(result.scheme,theme,`${label}: native control scheme`);
        assert(result.fade==='none'||result.fade.includes(theme==='light'?'250, 251, 252':'23, 25, 32'),`${label}: composer uses the wrong palette`);
        assert.equal(result.meta,result.bg,`${label}: stale browser theme-color`);
        assert.deepEqual(result.low,[],`${width}/${theme}/${label}: low text contrast\n${JSON.stringify(result.low,null,2)}`);
        for(const s of result.surfaces)assert.equal(s.light,theme==='light',`${width}/${theme}/${label}: wrong surface ${s.sel}`);
        checks++;
      }
      async function screenshot(label, theme) {
        if(width===390 || width===1440)await page.screenshot({path:path.join(output,`${theme}-${width}-${label}.png`)});
      }
      async function closeOverlays() {
        await page.evaluate(() => {
          document.querySelectorAll('.sheet.open,.sheet-scrim.open,.modal-scrim.open').forEach(n=>n.classList.remove('open'));
          closeCustomDialog(); closeSidebar(); closePreview();
        });
      }
      for(const theme of ['light','dark']) {
        await closeOverlays();
        await page.evaluate(theme => {db.theme=theme;applyTheme();save();conv=null;renderAll();}, theme);
        await checkScreen('empty',theme); await screenshot('empty',theme);
        await page.evaluate(() => {
          const assistant={id:'a',role:'assistant',reasoning:'Check the layout, contrast and responsive behavior before writing the page.',content:'## A clear workspace\nReadable body text with **strong emphasis**, `inline code` and a [reference link](https://example.com).\n\n> Reference material stays distinct from the answer.\n\n| Item | Status |\n| --- | --- |\n| Theme | Ready |\n\n```html\n<!doctype html>\n<html><body><h1 class="title">Hello</h1><!-- Comment --></body></html>\n```',usedSkills:['frontend-design'],sources:[{title:'Documentation',url:'https://example.com'}],timestamp:Date.now()};
          conv={id:'theme-chat',title:'Theme verification',providerId:'theme-provider',modelId:'model-one',updatedAt:Date.now(),messages:[{id:'u',role:'user',content:'Build a readable page in both themes.'},assistant]};
          db.conversations=[conv];renderAll();
          // The viewer now renders as a tabbed code frame; open it before measuring.
          const viewer=document.querySelector('.code-wrap');
          if(viewer) viewer.classList.remove('collapsed');
          const wrap=document.createElement('div');wrap.className='msg assistant';
          const bubble=document.createElement('div');bubble.className='bubble';wrap.appendChild(bubble);document.querySelector('#chatInner').appendChild(wrap);
          renderLiveCode(bubble,{lang:'html',body:'<!doctype html>\n'+Array.from({length:80},(_,i)=>'<p>Section '+i+'</p>').join('\n')});
          document.querySelector('#chatScroll').scrollTop=0;
        });
        await page.evaluate(()=>{const code=document.querySelector('.code-wrap code');if(!code)return;for(const cls of ['hljs-title class_ inherited__','hljs-operator','hljs-selector-attr','hljs-selector-pseudo','hljs-subst','hljs-code','hljs-formula','hljs-emphasis','hljs-strong']){const span=document.createElement('span');span.className=cls;span.textContent=' token ';code.appendChild(span);}});
        assert(await page.locator('.code-wrap [class^="hljs-"]').count()>0,'syntax highlighting must load before testing its colors');
        await checkScreen('chat',theme); await screenshot('chat',theme);
        const terminal=await page.locator('.code-live-body').evaluate(n=>({height:n.clientHeight,scroll:n.scrollHeight}));
        assert(terminal.height>100 && terminal.height<240 && terminal.scroll>terminal.height,'terminal must scroll internally');
        await page.evaluate(()=>openSidebar()); await checkScreen('sidebar',theme); await screenshot('sidebar',theme); await page.evaluate(()=>closeSidebar());
        await page.evaluate(()=>{renderModelSheet();openSheet('modelSheet');});
        await checkScreen('models',theme); await screenshot('models',theme);
        await page.locator('.model-search input').focus();
        const focus=await page.locator('.model-search input').evaluate(n=>({style:getComputedStyle(n).outlineStyle,width:parseFloat(getComputedStyle(n).outlineWidth)}));
        assert(focus.style!=='none' && focus.width>=2,'keyboard focus must be visible');
        await page.locator('.model-filter').first().hover();await checkScreen('models-hover',theme);
        await page.evaluate(()=>{db.theme=db.theme==='light'?'dark':'light';applyTheme();});
        await checkScreen('models-open-theme-switch',theme==='light'?'dark':'light');
        await page.evaluate(()=>{db.theme=db.theme==='light'?'dark':'light';applyTheme();});
        await closeOverlays();
        await page.evaluate(()=>{renderSettingsHub();openSheet('setSheet');});
        await checkScreen('settings',theme); await screenshot('settings',theme);
        await page.evaluate(()=>renderSettingsAppearance()); await checkScreen('appearance',theme);
        await page.evaluate(()=>renderProvidersSubView()); await checkScreen('providers',theme); await screenshot('providers',theme);
        await page.evaluate(()=>openProvForm(db.providers[0])); await checkScreen('provider-form',theme); await screenshot('provider-form',theme); await closeOverlays();
        await page.evaluate(()=>{skillLibraryOpen=true;renderSkillSheet();openSheet('skillSheet');});
        await checkScreen('skills',theme); await screenshot('skills',theme); await closeOverlays();
        await page.evaluate(()=>openToolsSheet()); await checkScreen('tools',theme); await screenshot('tools',theme); await closeOverlays();
        await page.evaluate(()=>{customDialog({title:'Rename conversation',message:'Choose a clear, memorable name.',mode:'input',value:'Theme verification',confirmText:'Save'});});
        assert(await page.locator('#customDialogInput').isVisible());
        assert(!(await page.locator('#customDialogTextarea').isVisible()),'input dialog must not show an extra textarea');
        await checkScreen('dialog-input',theme); await screenshot('dialog',theme); await closeOverlays();
        await page.evaluate(()=>{customDialog({title:'Project instructions',message:'Keep replies concise.',mode:'textarea',value:'Use clear language.'});});
        assert(await page.locator('#customDialogTextarea').isVisible());assert(!(await page.locator('#customDialogInput').isVisible()));
        await checkScreen('dialog-textarea',theme);await closeOverlays();
        await page.evaluate(()=>{customDialog({title:'Delete conversation',message:'This action cannot be undone.',danger:true,confirmText:'Delete'});});
        await checkScreen('dialog-danger',theme); await closeOverlays();
        await page.evaluate(()=>document.querySelector('#effortBtn').click()); await checkScreen('effort',theme); await closeOverlays();
        await page.evaluate(()=>openEdit(conv.messages[0])); await checkScreen('edit',theme); await closeOverlays();
        await page.evaluate(()=>document.querySelector('#onboardingScrim').classList.add('open')); await checkScreen('onboarding',theme); await closeOverlays();
        await page.evaluate(()=>{openPreview('<!doctype html><html><body><h1>Independent artifact</h1></body></html>',{inApp:true});showPreviewTab('code');});
        await checkScreen('preview-code',theme); await screenshot('preview',theme);
        await page.evaluate(()=>{showPreviewTab('console');addConsole('warn','Example warning');addConsole('error','Example error');});
        await checkScreen('preview-console',theme); await closeOverlays();
        await page.evaluate(()=>{toast('Theme saved');miniToast('Copied');}); await checkScreen('toasts',theme);
        // Both switching controls, persistence and native sync use the same source of truth.
        await page.evaluate(()=>{renderSettingsAppearance();document.querySelector('[data-theme-choice="'+(db.theme==='light'?'dark':'light')+'"]').click();});
        assert.equal(await page.evaluate(()=>db.theme),theme==='light'?'dark':'light');
        await page.evaluate(()=>document.querySelector('#themeBtn').click());
        const sync=await page.evaluate(()=>window.themeSyncs.at(-1));
        assert.equal(sync[0],theme==='light');assert(sync.slice(1).every(c=>/^#[0-9a-f]{6}$/i.test(c)));
        await page.goto(page.url());await page.waitForFunction(()=>typeof db!=='undefined');
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme,'theme must persist after reload');
      }
      assert.deepEqual(errors,[],`page errors: ${errors.join('; ')}`);
      console.log(`PASS themes at ${width}px: text contrast, surfaces, dialogs, preview, switching, persistence and native sync`);
      await page.close();
    }
    console.log(`PASS ${checks} theme/screen checks. Screenshots: test-results/themes/`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
