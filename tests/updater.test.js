const assert = require('node:assert/strict');
const {launch,appUrl} = require('./browser');
(async()=>{
  const b=await launch();
  try{
    const p=await b.newPage();
    const errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.route('https://raw.githubusercontent.com/**',r=>r.abort());
    await p.addInitScript(()=>{if(window!==window.top)return;localStorage.setItem('nazchat_v1',JSON.stringify({onboardingDone:true}));});
    await p.goto(appUrl);
    const result=await p.evaluate(async()=>{
      const original=window.fetch, calls=[];
      const make=(version,versionCode)=>({version,versionCode,sha256:'a'.repeat(64),apkUrl:`https://github.com/nxsmlx/nazchat/releases/download/v${version}/NazChat.apk`});
      const current=make(APP_VERSION,APP_VERSION_CODE),next=make('4.3.2',APP_VERSION_CODE+1);
      let raw=current,latest=next,failRaw=false,failApi=false,noMarker=false;
      const request=async(url,opts)=>{
        calls.push({url,headers:opts?.headers});
        if(url.includes('raw.githubusercontent.com')){if(failRaw)throw Error('offline');return {ok:true,json:async()=>raw};}
        if(failApi)return {ok:false,status:403};
        return {ok:true,json:async()=>({tag_name:'v'+latest.version,body:noMarker?'Legacy release':`<!-- kita-update ${JSON.stringify(latest)} -->`,assets:[{name:'NazChat.apk',browser_download_url:latest.apkUrl}]})};
      };
      window.fetch=request;
      try{
        const stale=(await fetchUpdateInfo()).versionCode;
        failRaw=true;const fallback=(await fetchUpdateInfo()).versionCode;
        failRaw=false;failApi=true;const rateLimited=(await fetchUpdateInfo()).versionCode;
        failApi=false;noMarker=true;const legacy=(await fetchUpdateInfo()).versionCode;
        failRaw=true;let rejects=false;try{await fetchUpdateInfo();}catch(e){rejects=true;}
        failRaw=false;noMarker=false;raw=current;latest=next;
        window.NazUpdater={getVersion:()=>APP_VERSION_CODE,downloadAndInstall:(url,hash)=>window.installArgs=[url,hash]};
        renderSettingsAbout();await checkForUpdate();
        const button=document.querySelector('#checkUpdateBtn').textContent;
        document.querySelector('#checkUpdateBtn').click();
        const install=window.installArgs;
        raw=next;window.NazUpdater.getVersion=()=>APP_VERSION_CODE+1;await checkForUpdate();
        const upToDate=document.querySelector('#updateStatus').textContent;
        return {currentCode:APP_VERSION_CODE,stale,fallback,rateLimited,legacy,rejects,button,install,upToDate,calls,invalid:[{...current,versionCode:0},{...current,sha256:''},{...current,apkUrl:'https://example.com/bad.apk'}].every(x=>!validUpdateInfo(x))};
      }finally{window.fetch=original;delete window.NazUpdater;}
    });
    assert.equal(result.stale,result.currentCode+1);assert.equal(result.fallback,result.currentCode+1);
    assert.equal(result.rateLimited,result.currentCode);assert.equal(result.legacy,result.currentCode);
    assert(result.rejects&&result.invalid,'must reject missing/invalid exact metadata');
    assert.equal(result.button,'Install update');assert.equal(result.install[1],'a'.repeat(64));
    assert.match(result.upToDate,/up to date/);
    assert(result.calls.every(c=>!c.headers?.Authorization),'public API must not embed a GitHub token');
    assert.deepEqual(errors,[]);
    console.log('PASS updater: stale raw, API fallback, rate limits, exact versionCode, checksum and install flow');
  }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
