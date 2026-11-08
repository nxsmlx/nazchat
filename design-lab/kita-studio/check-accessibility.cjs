// Lightweight checks using actual computed colors and rendered control dimensions.
const {launch} = require('../../tests/browser');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');
const luminance = value => {
  const a=value.match(/\d+(?:\.\d+)?/g).slice(0,3).map(x=>Number(x)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);
  return a[0]*0.2126+a[1]*0.7152+a[2]*0.0722;
};
(async()=>{
 const browser=await launch();let colors=0,controls=0;
 try{
  for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:theme});
   await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href,{waitUntil:'networkidle'});
   const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['canvas','surface','sidebar','raised','text','muted','faint','accent','on-accent','accent-soft'].map(k=>[k,s.getPropertyValue('--'+k).trim()]))});
   function lum(hex){let h=hex.slice(1);if(h.length===3)h=h.split('').map(x=>x+x).join('');return luminance('rgb('+h.match(/../g).map(x=>parseInt(x,16)).join(',')+')')}
   for(const bg of ['canvas','surface','sidebar','raised'])for(const fg of ['text','muted','faint']){
    const l=[lum(tokens[bg]),lum(tokens[fg])].sort((a,b)=>b-a);assert.ok((l[0]+.05)/(l[1]+.05)>=4.5,`${theme} ${fg} on ${bg}`);colors++;
   }
   for(const [a,b] of [['accent','on-accent'],['accent','accent-soft']]){const l=[lum(tokens[a]),lum(tokens[b])].sort((a,b)=>b-a);assert.ok((l[0]+.05)/(l[1]+.05)>=4.5,`${theme} ${a} / ${b}`);colors++}
   const inspect=async()=>{const buttons=await page.locator('button:visible').evaluateAll(list=>list.filter(e=>!e.closest('[inert]')).map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));for(const b of buttons){assert.ok(b.w>=43.9&&b.h>=43.9,`Small touch target ${JSON.stringify(b)}`);controls++}};
   await inspect();await page.locator('[data-action="tools"]').click();await inspect();await page.keyboard.press('Escape');
   await page.locator('[data-action="models"]').click();await inspect();await page.keyboard.press('Escape');
   await page.locator('[data-action="open-nav"]').click();await inspect();await page.locator('[data-action="settings"]').click();await inspect();
   await page.locator('[data-settings-tab="appearance"]').click();await inspect();await page.close();
  }
  console.log(`PASS: ${colors} computed contrast combinations and ${controls} visible button sizes (≥44px). Not a full accessibility audit.`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
