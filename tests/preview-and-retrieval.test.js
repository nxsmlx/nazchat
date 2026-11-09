const {launch, appUrl}=require('./browser');
const assert=require('assert');

// Regression checks for two review findings:
// 1. Project retrieval ranked every chunk 0 or 1 because of operator precedence.
// 2. Unchecking "Run JS" did not stop scripts in either preview renderer.
(async()=>{
 const b=await launch();
 try{
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
  await p.goto(appUrl);
  await p.waitForFunction(()=>typeof retrieveProjectContext==='function'&&typeof openPreview==='function');

  // Ranking: more matching terms must rank first, not merely "any match".
  const order=await p.evaluate(()=>{
    currentProject=()=>({sources:[
      {name:'one-match',text:'A',terms:['alpha']},
      {name:'three-matches',text:'B',terms:['alpha','bravo','charlie']},
      {name:'two-matches',text:'C',terms:['alpha','bravo']},
      {name:'no-match',text:'D',terms:['zulu']}]});
    return [...retrieveProjectContext('alpha bravo charlie').matchAll(/\[Project source \d+: ([\w-]+)\]/g)].map(m=>m[1]);
  });
  assert.deepEqual(order,['three-matches','two-matches','one-match'],'ranking ignores the number of matching terms');
  console.log('PASS project sources ranked by number of matching terms');

  // Browser renderer: the iframe sandbox decides whether scripts may run.
  const html='<!doctype html><html><head></head><body><p>Fixture</p><script>console.log("script ran")</script></body></html>';
  for(const runJs of [true,false]){
    await p.evaluate(([html,runJs])=>{document.querySelector('#previewJs').checked=runJs;openPreview(html,{inApp:true});},[html,runJs]);
    const sandbox=await p.locator('#previewFrame').getAttribute('sandbox');
    assert.equal(/\ballow-scripts\b/.test(sandbox),runJs,'sandbox for runJs='+runJs+': '+sandbox);
    await p.waitForTimeout(800);
    const count=Number(await p.locator('#consoleCount').textContent());
    assert.equal(count>0,runJs,'script '+(runJs?'did not run':'ran')+' with Run JS '+(runJs?'on':'off'));
    await p.evaluate(()=>closePreview());
  }
  console.log('PASS in-app preview runs scripts only when Run JS is on');

  // Native renderer: the switch is passed to PreviewActivity.
  const calls=await p.evaluate(html=>{
    const seen=[];window.NazPreview={open:(...a)=>seen.push(a.slice(1))};
    for(const runJs of [true,false]){document.querySelector('#previewJs').checked=runJs;openPreview(html);}
    delete window.NazPreview;return seen;
  },html);
  assert.deepEqual(calls,[['Kita Chat Preview',true],['Kita Chat Preview',false]],'native preview did not receive the Run JS setting');
  console.log('PASS native preview receives the Run JS setting');
  assert.deepEqual(errors,[]);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
