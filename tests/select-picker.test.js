const assert=require('node:assert/strict');const {launch,appUrl}=require('./browser');
// 4.15.2: every <select> opens Kita's own picker instead of the system dialog.
(async()=>{const browser=await launch();try{
const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const page=await ctx.newPage();
await page.route('https://raw.githubusercontent.com/**',r=>r.abort());await page.route('https://api.github.com/**',r=>r.abort());
await page.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});
await page.evaluate(()=>{db.onboardingDone=true;db.textSize='default';save();});await page.goto(page.url(),{waitUntil:'domcontentloaded'});
await page.evaluate(()=>{renderStudioAppearance();openSheet('setSheet');});
const text=page.getByLabel('Conversation text size',{exact:true});
// Tap: Kita menu opens, titled from the select, current choice marked.
await text.tap();
const menu=page.locator('.kita-select');await menu.waitFor();
assert.equal(await menu.locator('.kita-select-title').innerText(),'Conversation text size');
assert.deepEqual(await menu.locator('.kita-select-option').allInnerTexts(),['Small','Default','Larger','Extra large']);
assert.equal(await menu.locator('.kita-select-option.on').innerText(),'Default');
// Choosing writes back to the <select> and fires its change handler.
await menu.getByRole('option',{name:'Larger'}).click();
await page.locator('.kita-select-scrim').waitFor({state:'detached'});
assert.equal(await text.inputValue(),'large');assert.equal(await page.evaluate(()=>db.textSize),'large');
assert.equal(await page.locator('html').getAttribute('data-text-size'),'large');
// Mouse opens it too; tapping the scrim closes without a change.
await text.click();await menu.waitFor();
await page.mouse.click(195,20);await page.locator('.kita-select-scrim').waitFor({state:'detached'});
assert.equal(await page.evaluate(()=>db.textSize),'large');
// Android Back closes the picker first, leaving the sheet open.
await text.click();await menu.waitFor();
assert.equal(await page.evaluate(()=>kitaHandleBack()),true);
await page.locator('.kita-select-scrim').waitFor({state:'detached'});assert.equal(await page.locator('#setSheet.open').count(),1);
// Keyboard: Enter opens, arrows move, Enter picks; Escape closes.
await text.focus();await page.keyboard.press('Enter');await menu.waitFor();
await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
await page.locator('.kita-select-scrim').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>db.textSize),'extra');
await text.focus();await page.keyboard.press('Enter');await menu.waitFor();await page.keyboard.press('Escape');
await page.locator('.kita-select-scrim').waitFor({state:'detached'});assert.equal(await page.locator('#setSheet.open').count(),1,'Escape closed the sheet too');
// Network sheet port profile (the reported dialog) uses the same picker.
await page.evaluate(()=>{closeSheet('setSheet');let n=0;const emit=(id,o,ms)=>setTimeout(()=>nazScanEvent(id,JSON.stringify(o)),ms);
 window.NazNetScan={info:()=>JSON.stringify({type:'wifi',ip:'192.168.1.23',prefix:24,gateway:'192.168.1.1',scannable:true}),cancel:()=>{},tls:()=>'{}',discover:()=>-1,
  sweep:()=>{const id=++n;emit(id,{type:'host',ip:'192.168.1.1',name:'router',open:[53,80]},5);emit(id,{type:'done',total:253},20);return id;}};
 openNetworkSheet();net.agreed=true;});
await page.getByRole('button',{name:'Scan devices'}).click();
const profile=page.locator('.net-profile select');await profile.waitFor();
await profile.tap();await menu.waitFor();
assert.equal(await menu.locator('.kita-select-option').count(),await profile.evaluate(s=>s.options.length));
await menu.locator('.kita-select-option').nth(1).click();await page.locator('.kita-select-scrim').waitFor({state:'detached'});
assert.equal(await profile.inputValue(),await profile.evaluate(s=>s.options[1].value));
console.log('PASS select-picker: tap/mouse/keyboard open Kita picker, writes value + change, scrim/Back/Escape close');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
