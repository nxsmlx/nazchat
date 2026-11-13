const {launch,appUrl}=require('./browser');const assert=require('assert');
/* 4.22.0: Publish → Android app (APK). Kita writes the site and an Android project to a private
   GitHub repository, stores a sealed-box signing secret once, waits for the build and links the
   APK. GitHub is mocked; the generated project itself is built for real in android-build. */
const PAGE='<!doctype html><html><head><style>h1{color:#7a4}</style></head><body><h1>Kopi Kita</h1><script>document.title="Kopi"</script></body></html>';
const seed=extra=>({schemaVersion:3,onboardingDone:true,search:false,autoCheckCode:false,providers:[],conversations:[{id:'c1',title:'Kopi Kita',mode:'code',updatedAt:Date.now(),messages:[{id:'u',role:'user',content:'buat page'},{id:'a',role:'assistant',content:'```html\n'+PAGE+'\n```'}]}],projects:[],...extra});
const json=(r,status,obj)=>r.fulfill({status,headers:{'content-type':'application/json'},body:JSON.stringify(obj)});
(async()=>{const b=await launch();let failed=0;
 async function scenario(name,db,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.addInitScript(db=>{if(window===window.top&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('nazchat_v1',JSON.stringify(db));}},db);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof buildAndroidApp==='function'&&typeof publishSite==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}finally{await ctx.close();}
 }
 // A small fake GitHub. state.app = android/app.json in the repo (null = first build).
 function fakeGitHub(page,state){
   const calls=[];
   return page.route(/^https?:\/\//,async r=>{
     const u=new URL(r.request().url()),m=r.request().method(),body=r.request().postData();calls.push([m,u.pathname+u.search,body]);state.calls=calls;
     if(u.host!=='api.github.com') return r.fulfill({status:503,body:'{}'});
     const p=u.pathname;
     if(p==='/user') return json(r,200,{login:'naz'});
     if(p==='/repos/naz/kopi-kita-android'&&m==='GET') return state.repo?json(r,200,state.repo):json(r,404,{message:'Not Found'});
     if(p==='/user/repos'&&m==='POST'){state.repo={html_url:'https://github.com/naz/kopi-kita-android',default_branch:'main',private:JSON.parse(body).private};return json(r,201,state.repo);}
     const base='/repos/naz/kopi-kita-android';
     if(p===base+'/contents/android/app.json') return state.app?json(r,200,{content:Buffer.from(JSON.stringify(state.app)).toString('base64')}):json(r,404,{message:'Not Found'});
     if(p===base+'/actions/secrets/KITA_SIGNING_SEED'&&m==='GET') return state.secret?json(r,200,{name:'KITA_SIGNING_SEED'}):json(r,404,{message:'Not Found'});
     if(p===base+'/actions/secrets/public-key') return json(r,200,{key_id:'kid1',key:state.publicKey});
     if(p===base+'/actions/secrets/KITA_SIGNING_SEED'&&m==='PUT'){state.secret=JSON.parse(body);return r.fulfill({status:201,body:''});}
     if(p===base+'/git/ref/heads/main') return json(r,200,{object:{sha:'h1'}});
     if(p===base+'/git/commits/h1') return json(r,200,{tree:{sha:'t0'}});
     if(p===base+'/git/blobs'){state.blobs=(state.blobs||0)+1;return json(r,201,{sha:'blob'+state.blobs});}
     if(p===base+'/git/trees/t0') return json(r,200,{tree:[{type:'blob',path:'site/old.css'},{type:'blob',path:'README.md'}]});
     if(p===base+'/git/trees'&&m==='POST'){state.tree=JSON.parse(body);return json(r,201,{sha:'t1'});}
     if(p===base+'/git/commits'&&m==='POST'){state.commit=JSON.parse(body);return json(r,201,{sha:'c1'});}
     if(p===base+'/git/refs/heads/main'&&m==='PATCH') return state.refError?json(r,422,{message:state.refError}):json(r,200,{});
     if(p===base+'/actions/runs'){state.polls=(state.polls||0)+1;const done=state.polls>1;
       return json(r,200,{workflow_runs:[{path:'.github/workflows/build-apk.yml',status:done?'completed':'in_progress',conclusion:done?(state.conclusion||'success'):null,html_url:'https://github.com/naz/kopi-kita-android/actions/runs/9'}]});}
     const tag=p.match(/\/releases\/tags\/v([\d.]+)$/);
     if(tag) return json(r,200,{html_url:'https://github.com/naz/kopi-kita-android/releases/tag/v'+tag[1],assets:[{name:'app-'+tag[1]+'.apk',browser_download_url:'https://github.com/naz/kopi-kita-android/releases/download/v'+tag[1]+'/app-'+tag[1]+'.apk'}]});
     return json(r,404,{message:'unexpected '+m+' '+p});
   });
 }
 const keypair=page=>page.evaluate(async()=>{await loadVendorScript('vendor/nacl-fast.min.js');const k=nacl.box.keyPair();window.__k=k;return bytesToBase64(k.publicKey);});
 const openSecret=(page,sealed)=>page.evaluate(s=>{const all=base64ToBytes(s),epk=all.slice(0,32),ct=all.slice(32);const nonce=blake2b(concatBytes(epk,window.__k.publicKey),24);const pt=nacl.box.open(ct,nonce,epk,window.__k.secretKey);return pt?new TextDecoder().decode(pt):null;},sealed);
 const publishAndroid=async page=>{
   await page.evaluate(()=>{androidBuildPollMs=20;connectIntegration('github','tok-github-123456789',{});studioOpenConversation(db.conversations[0]);});
   await page.locator('.artifact-btn.publish').click();
   await page.locator('.publish-target[data-target="android"]').click();
   assert.match(await page.locator('.publish-preview').innerText(),/github\.com\/naz\/kopi-kita-android\/releases/);
   assert.equal(await page.locator('#publishGo').innerText(),'Build app');
   await page.click('#publishGo');await page.waitForSelector('#customDialogScrim.open');
   assert.match(await page.locator('#customDialogMessage').innerText(),/private repository github\.com\/naz\/kopi-kita-android[\s\S]*3 to 5 minutes/);
   await page.locator('#customDialogScrim.open #customDialogConfirm').click();
 };

 await scenario('first build: private repo, sealed signing secret, Android project, waits, APK link',seed({integrations:{github:{connected:true,login:'naz'}}}),async page=>{
   const state={};state.publicKey=await keypair(page);await fakeGitHub(page,state);
   await publishAndroid(page);
   await page.waitForSelector('.publish-done a.publish-download',{timeout:15000});
   assert.equal(await page.locator('.publish-done a.publish-download').getAttribute('href'),'https://github.com/naz/kopi-kita-android/releases/download/v1.0.1/app-1.0.1.apk');
   assert.match(await page.locator('.publish-done').innerText(),/App ready[\s\S]*releases\/tag\/v1\.0\.1/);
   assert.match(await page.locator('.publish-progress').innerText(),/Creating repository naz\/kopi-kita-android[\s\S]*Creating the signing secret[\s\S]*Building Kopi Kita 1\.0\.1 on GitHub[\s\S]*Kopi Kita 1\.0\.1 is ready \(com\.naz\.kopi_kita\)/);
   assert.equal(state.repo.private,true,'the app repository must be private');
   // The secret: sealed for GitHub's key, opens to a 32-byte random seed; never stored by Kita.
   assert.equal(state.secret.key_id,'kid1');
   const seedText=await openSecret(page,state.secret.encrypted_value);
   assert.match(seedText,/^[A-Za-z0-9+/]{43}=$/);
   assert.doesNotMatch(await page.evaluate(()=>localStorage.getItem('nazchat_v1')),new RegExp(seedText.replace(/[+/=]/g,'.')));
   // The commit: site files, Android project, workflow, icons as blobs, the old site file removed.
   const t=state.tree.tree,paths=t.map(e=>e.path);
   for(const want of ['site/index.html','site/css/styles.css','site/js/app.js','android/app.json','android/AndroidManifest.xml','android/src/com/naz/kopi_kita/MainActivity.java','android/res/values/strings.xml','android/build.sh','.github/workflows/build-apk.yml','README.md'])
     assert(paths.includes(want)||want.startsWith('site/css')||want.startsWith('site/js'),'missing '+want);
   assert(paths.includes('site/index.html'));
   assert.equal(t.filter(e=>/mipmap-.*ic_launcher\.png$/.test(e.path)&&/^blob\d+$/.test(e.sha)).length,5,'5 launcher icons as blobs');
   assert.deepEqual(t.find(e=>e.path==='site/old.css'),{path:'site/old.css',mode:'100644',type:'blob',sha:null});
   assert.equal(t.find(e=>e.path==='README.md').sha,undefined,'README is rewritten, not deleted');
   assert.equal(t.find(e=>e.path==='android/build.sh').mode,'100755');
   const manifest=t.find(e=>e.path==='android/AndroidManifest.xml').content;
   assert.match(manifest,/package="com\.naz\.kopi_kita"[\s\S]*android:versionCode="1"[\s\S]*android:versionName="1\.0\.1"[\s\S]*android:usesCleartextTraffic="false"/);
   assert.match(t.find(e=>e.path==='.github/workflows/build-apk.yml').content,/KITA_SIGNING_SEED[\s\S]*openssl enc -d -aes-256-cbc[\s\S]*gh release create/);
   assert.deepEqual(JSON.parse(t.find(e=>e.path==='android/app.json').content).versionCode,1);
   assert.equal(state.commit.message,'Build Kopi Kita 1.0.1 with Kita Chat');
   const site=await page.evaluate(()=>db.conversations[0].sites.android);
   assert.equal(site.url,'https://github.com/naz/kopi-kita-android/releases/tag/v1.0.1');
 });

 await scenario('next build: same package, version +1, secret kept',seed({integrations:{github:{connected:true,login:'naz'}}}),async page=>{
   const state={repo:{html_url:'https://github.com/naz/kopi-kita-android',default_branch:'main',private:true},app:{appName:'Kopi Kita',packageId:'com.naz.kopi_kita',versionCode:4,versionName:'1.0.4'},secret:{existing:true}};
   state.publicKey=await keypair(page);await fakeGitHub(page,state);
   await publishAndroid(page);
   await page.waitForSelector('.publish-done a.publish-download',{timeout:15000});
   assert.match(await page.locator('.publish-done a.publish-download').getAttribute('href'),/v1\.0\.5\/app-1\.0\.5\.apk$/);
   assert.deepEqual(state.secret,{existing:true},'the signing secret must not be replaced');
   assert(!state.calls.some(c=>c[0]==='PUT'),'no secret written');
   const manifest=state.tree.tree.find(e=>e.path==='android/AndroidManifest.xml').content;
   assert.match(manifest,/package="com\.naz\.kopi_kita"[\s\S]*android:versionCode="5"/);
 });

 await scenario('token without the workflow scope: clear message',seed({integrations:{github:{connected:true,login:'naz'}}}),async page=>{
   const state={refError:'refusing to allow a Personal Access Token to create or update workflow `.github/workflows/build-apk.yml` without `workflow` scope'};
   state.publicKey=await keypair(page);await fakeGitHub(page,state);
   await publishAndroid(page);
   await page.waitForFunction(()=>/✕/.test(document.querySelector('.publish-progress')?.textContent||''),null,{timeout:15000});
   assert.match(await page.locator('.publish-progress').innerText(),/new token with the repo and workflow scopes/);
   assert.equal(await page.locator('#publishGo').innerText(),'Try again');
 });

 await scenario('failed build on GitHub: says so with the run link',seed({integrations:{github:{connected:true,login:'naz'}}}),async page=>{
   const state={conclusion:'failure'};state.publicKey=await keypair(page);await fakeGitHub(page,state);
   await publishAndroid(page);
   await page.waitForFunction(()=>/✕/.test(document.querySelector('.publish-progress')?.textContent||''),null,{timeout:15000});
   assert.match(await page.locator('.publish-progress').innerText(),/build failed on GitHub \(failure\)[\s\S]*actions\/runs\/9/);
 });

 await scenario('names: package ids and Android string escapes',seed({}),async page=>{
   const r=await page.evaluate(()=>({a:androidPackageId('Naz-Dev','2kopi-class'),b:androidPackageId('x','new'),c:validPackageId('com.naz.kopi'),d:validPackageId('com.class.x'),
     s:androidString("Kopi's \"best\" @ <cafe> & co"),at:androidString('@home'),name:androidAppName('  a\n b  ')}));
   assert.deepEqual(r,{a:'com.naz_dev.a2kopi_class',b:'com.x.new_app',c:true,d:false,s:"Kopi\\'s \\\"best\\\" @ &lt;cafe&gt; &amp; co",at:'\\@home',name:'a b'});
 });
 await b.close();if(failed){console.error(failed+' scenario(s) failed');process.exit(1);}
 console.log('PASS android app: repo, secret, project, build wait, versions, errors');
})();
