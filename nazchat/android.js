/* Android app builder (4.22.0): turn a page built in Code into an installable Android app.
   Publish → "Android app (APK)" puts the site and a small Android project (a WebView that shows
   the site, with no bridges) in a private GitHub repository of the user's. A GitHub Actions
   workflow in that repository builds and signs the APK with the plain Android SDK and attaches
   it to a GitHub Release.
   Signing: the same key must sign every version, or phones refuse the update. On the first
   build Kita stores a random seed as the repository secret KITA_SIGNING_SEED, encrypted on the
   phone with GitHub's sealed-box format (X25519 + XSalsa20-Poly1305, BLAKE2b nonce). The
   workflow then creates the key once and keeps it in the repository only encrypted with that
   seed. The seed never leaves GitHub's secret store; Kita does not keep it. */

const ANDROID_BT = '36.0.0', ANDROID_PLATFORM = 'android-36';
let androidBuildPollMs = 10000; // how often the build status is checked (tests shorten it)

/* ---------- BLAKE2b (RFC 7693), for the sealed-box nonce ---------- */
const B2B_IV = new Uint32Array([0xF3BCC908,0x6A09E667,0x84CAA73B,0xBB67AE85,0xFE94F82B,0x3C6EF372,0x5F1D36F1,0xA54FF53A,0xADE682D1,0x510E527F,0x2B3E6C1F,0x9B05688C,0xFB41BD6B,0x1F83D9AB,0x137E2179,0x5BE0CD19]);
const B2B_SIGMA = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3,11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4,7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8,9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13,2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9,12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11,13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10,6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5,10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3].map(x=>x*2);
function b2bAdd64(v,a,b){const o0=v[a]+v[b];let o1=v[a+1]+v[b+1];if(o0>=0x100000000)o1++;v[a]=o0;v[a+1]=o1;}
function b2bAdd64c(v,a,b0,b1){let o0=v[a]+b0;if(b0<0)o0+=0x100000000;let o1=v[a+1]+b1;if(o0>=0x100000000)o1++;v[a]=o0;v[a+1]=o1;}
function b2bGet32(arr,i){return arr[i]^(arr[i+1]<<8)^(arr[i+2]<<16)^(arr[i+3]<<24);}
function b2bG(v,m,a,b,c,d,ix,iy){
  const x0=m[ix],x1=m[ix+1],y0=m[iy],y1=m[iy+1];
  b2bAdd64(v,a,b);b2bAdd64c(v,a,x0,x1);
  let xor0=v[d]^v[a],xor1=v[d+1]^v[a+1];v[d]=xor1;v[d+1]=xor0;
  b2bAdd64(v,c,d);
  xor0=v[b]^v[c];xor1=v[b+1]^v[c+1];v[b]=(xor0>>>24)^(xor1<<8);v[b+1]=(xor1>>>24)^(xor0<<8);
  b2bAdd64(v,a,b);b2bAdd64c(v,a,y0,y1);
  xor0=v[d]^v[a];xor1=v[d+1]^v[a+1];v[d]=(xor0>>>16)^(xor1<<16);v[d+1]=(xor1>>>16)^(xor0<<16);
  b2bAdd64(v,c,d);
  xor0=v[b]^v[c];xor1=v[b+1]^v[c+1];v[b]=(xor1>>>31)^(xor0<<1);v[b+1]=(xor0>>>31)^(xor1<<1);
}
function b2bCompress(ctx,last){
  const v=new Uint32Array(32),m=new Uint32Array(32);
  for(let i=0;i<16;i++){v[i]=ctx.h[i];v[i+16]=B2B_IV[i];}
  v[24]^=ctx.t;v[25]^=(ctx.t/0x100000000);
  if(last){v[28]=~v[28];v[29]=~v[29];}
  for(let i=0;i<32;i++)m[i]=b2bGet32(ctx.b,4*i);
  for(let i=0;i<12;i++){
    b2bG(v,m,0,8,16,24,B2B_SIGMA[i*16+0],B2B_SIGMA[i*16+1]);b2bG(v,m,2,10,18,26,B2B_SIGMA[i*16+2],B2B_SIGMA[i*16+3]);
    b2bG(v,m,4,12,20,28,B2B_SIGMA[i*16+4],B2B_SIGMA[i*16+5]);b2bG(v,m,6,14,22,30,B2B_SIGMA[i*16+6],B2B_SIGMA[i*16+7]);
    b2bG(v,m,0,10,20,30,B2B_SIGMA[i*16+8],B2B_SIGMA[i*16+9]);b2bG(v,m,2,12,22,24,B2B_SIGMA[i*16+10],B2B_SIGMA[i*16+11]);
    b2bG(v,m,4,14,16,26,B2B_SIGMA[i*16+12],B2B_SIGMA[i*16+13]);b2bG(v,m,6,8,18,28,B2B_SIGMA[i*16+14],B2B_SIGMA[i*16+15]);
  }
  for(let i=0;i<16;i++)ctx.h[i]=ctx.h[i]^v[i]^v[i+16];
}
function blake2b(input,outlen=64){
  const ctx={b:new Uint8Array(128),h:new Uint32Array(16),t:0,c:0,outlen};
  for(let i=0;i<16;i++)ctx.h[i]=B2B_IV[i];
  ctx.h[0]^=0x01010000^outlen;
  for(let i=0;i<input.length;i++){if(ctx.c===128){ctx.t+=ctx.c;b2bCompress(ctx,false);ctx.c=0;}ctx.b[ctx.c++]=input[i];}
  ctx.t+=ctx.c;while(ctx.c<128)ctx.b[ctx.c++]=0;b2bCompress(ctx,true);
  const out=new Uint8Array(outlen);for(let i=0;i<outlen;i++)out[i]=ctx.h[i>>2]>>(8*(i&3));
  return out;
}
function base64ToBytes(b64){const s=atob(b64);const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
function concatBytes(...parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
/* libsodium crypto_box_seal: ephemeral key || box(message, nonce=BLAKE2b-24(epk||pk)). */
async function sealedBox(message, publicKeyB64){
  if(typeof nacl==='undefined') await loadVendorScript('vendor/nacl-fast.min.js');
  const pk=base64ToBytes(publicKeyB64);
  if(pk.length!==32) throw new Error('GitHub returned an unexpected public key');
  const eph=nacl.box.keyPair();
  const nonce=blake2b(concatBytes(eph.publicKey,pk),24);
  const sealed=nacl.box(new TextEncoder().encode(message),nonce,pk,eph.secretKey);
  return bytesToBase64(concatBytes(eph.publicKey,sealed));
}

/* ---------- The Android project ---------- */
const JAVA_KEYWORDS=new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record yield'.split(' '));
function androidSegment(s){
  let seg=String(s||'').toLowerCase().replace(/[^a-z0-9_]+/g,'_').replace(/^_+|_+$/g,'').replace(/_+/g,'_').slice(0,30);
  if(!seg) seg='app';
  if(!/^[a-z]/.test(seg)) seg='a'+seg;
  if(JAVA_KEYWORDS.has(seg)) seg+='_app';
  return seg;
}
function androidPackageId(login, slug){ return 'com.'+androidSegment(login)+'.'+androidSegment(slug); }
function validPackageId(id){ return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(id) && id.split('.').every(s=>!JAVA_KEYWORDS.has(s)); }
/* A string resource: XML-escaped, and aapt2's own escapes for quotes and a leading @ or ?. */
function androidString(text){
  return String(text).replace(/\\/g,'\\\\').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,"\\'").replace(/"/g,'\\"').replace(/^([@?])/,'\\$1');
}
function androidAppName(text){ return String(text||'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,40) || 'My app'; }

const ANDROID_ICON_SIZES={mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192};
/* Launcher icons: the app's first letter on Kita's dark surface, as PNG (base64). */
function androidIcons(appName){
  const letter=(String(appName).trim().match(/[\p{L}\p{N}]/u)||['K'])[0].toUpperCase();
  const out={};
  for(const [dens,size] of Object.entries(ANDROID_ICON_SIZES)){
    const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');
    const r=size*0.22;g.fillStyle='#171920';g.beginPath();
    g.moveTo(r,0);g.arcTo(size,0,size,size,r);g.arcTo(size,size,0,size,r);g.arcTo(0,size,0,0,r);g.arcTo(0,0,size,0,r);g.closePath();g.fill();
    g.fillStyle='#BDADFF';g.font='700 '+Math.round(size*0.56)+'px "DM Sans", system-ui, sans-serif';g.textAlign='center';g.textBaseline='middle';
    g.fillText(letter,size/2,size*0.54);
    out[dens]=c.toDataURL('image/png').replace(/^data:image\/png;base64,/,'');
  }
  return out;
}

function androidManifest(app){
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${app.packageId}"
    android:versionCode="${app.versionCode}"
    android:versionName="${app.versionName}">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34" />
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:allowBackup="true"
        android:usesCleartextTraffic="false"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|uiMode">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
}
function androidActivity(app){
  return `package ${app.packageId};

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Shows the bundled site (assets/site). Links to other sites open in the browser. Generated by Kita Chat. */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/site/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
`;
}
const ANDROID_BUILD_SH = `#!/bin/sh
# Builds and signs the APK with the plain Android SDK (no Gradle). Generated by Kita Chat.
# Needs: JDK 17, ANDROID_HOME with platforms;${ANDROID_PLATFORM} and build-tools;${ANDROID_BT},
# and KS (keystore path) + KS_PASS (its password) in the environment.
set -eu
SDK=\${ANDROID_HOME:?Set ANDROID_HOME}
BT="$SDK/build-tools/${ANDROID_BT}"
PLAT="$SDK/platforms/${ANDROID_PLATFORM}/android.jar"
rm -rf build
mkdir -p build/obj build/dex build/assets/site
cp -R site/. build/assets/site/
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$PLAT" -d build/obj $(find android/src -name '*.java')
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --release --min-api 24 --lib "$PLAT" --output build/dex $(find build/obj -name '*.class')
"$BT/aapt2" compile --dir android/res -o build/res.flata
"$BT/aapt2" link -o build/base.apk -I "$PLAT" --manifest android/AndroidManifest.xml \\
  --min-sdk-version 24 --target-sdk-version 34 -A build/assets build/res.flata
(cd build && zip -qj base.apk dex/classes*.dex)
"$BT/zipalign" -P 16 -f 4 build/base.apk build/aligned.apk
java -jar "$BT/lib/apksigner.jar" sign --ks "$KS" --ks-pass env:KS_PASS --key-pass env:KS_PASS \\
  --v4-signing-enabled false --out build/app.apk build/aligned.apk
java -jar "$BT/lib/apksigner.jar" verify build/app.apk
echo "Built build/app.apk"
`;
const ANDROID_WORKFLOW = `name: Build Android app

# Generated by Kita Chat. Every push builds the APK and attaches it to a GitHub Release.
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: build-apk
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    env:
      SEED: \${{ secrets.KITA_SIGNING_SEED }}
      GH_TOKEN: \${{ github.token }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Android SDK
        run: |
          set -eu
          SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
          yes | "$SDKM" --sdk_root="$ANDROID_HOME" --licenses >/dev/null || true
          "$SDKM" --sdk_root="$ANDROID_HOME" --install 'platforms;${ANDROID_PLATFORM}' 'build-tools;${ANDROID_BT}' >/dev/null

      # The signing key is made once, then kept in the repository only encrypted with the
      # KITA_SIGNING_SEED secret, so every version is signed by the same key.
      - name: Signing key
        run: |
          set -eu
          if [ -z "$SEED" ]; then echo "The KITA_SIGNING_SEED secret is missing. Build the app again from Kita Chat." >&2; exit 1; fi
          PASS=$(printf '%s' "$SEED" | sha256sum | cut -c1-40)
          echo "::add-mask::$PASS"
          KS="$RUNNER_TEMP/release.p12"
          if [ -f signing/release.p12.enc ]; then
            openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -pass env:SEED -in signing/release.p12.enc -out "$KS"
          else
            keytool -genkeypair -alias app -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Android app" \\
              -storetype PKCS12 -keystore "$KS" -storepass "$PASS" -keypass "$PASS"
            mkdir -p signing
            openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -salt -pass env:SEED -in "$KS" -out signing/release.p12.enc
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add signing/release.p12.enc
            git commit -m "Add the encrypted signing key"
            git push origin "HEAD:$GITHUB_REF_NAME"
          fi
          echo "KS=$KS" >> "$GITHUB_ENV"
          echo "KS_PASS=$PASS" >> "$GITHUB_ENV"

      - name: Build
        run: sh android/build.sh

      - name: Release
        run: |
          set -eu
          V=$(jq -r .versionName android/app.json)
          C=$(jq -r .versionCode android/app.json)
          cp build/app.apk "app-$V.apk"
          gh release delete "v$V" --yes --cleanup-tag >/dev/null 2>&1 || true
          gh release create "v$V" "app-$V.apk" --target "$GITHUB_SHA" --title "$(jq -r .appName android/app.json) $V" \\
            --notes "Built by Kita Chat from this repository. versionCode $C." --latest
`;
/* Every file of the app repository. Binary files carry {base64}. */
function androidAppFiles(app, siteFiles, icons){
  const pkgPath=app.packageId.split('.').join('/');
  const files=siteFiles.map(f=>({path:'site/'+String(f.path).replace(/^\/+/,''), content:f.content}));
  files.push({path:'android/app.json', content:JSON.stringify({appName:app.appName, packageId:app.packageId, versionName:app.versionName, versionCode:app.versionCode, builtWith:'Kita Chat '+(typeof APP_VERSION==='string'?APP_VERSION:'')},null,2)+'\n'});
  files.push({path:'android/AndroidManifest.xml', content:androidManifest(app)});
  files.push({path:'android/src/'+pkgPath+'/MainActivity.java', content:androidActivity(app)});
  files.push({path:'android/res/values/strings.xml', content:'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">'+androidString(app.appName)+'</string>\n</resources>\n'});
  for(const [dens,b64] of Object.entries(icons||{})) files.push({path:'android/res/mipmap-'+dens+'/ic_launcher.png', base64:b64});
  files.push({path:'android/build.sh', content:ANDROID_BUILD_SH});
  files.push({path:'.github/workflows/build-apk.yml', content:ANDROID_WORKFLOW});
  files.push({path:'README.md', content:'# '+app.appName+'\n\nAndroid app built with [Kita Chat](https://keetakita.my) from the site in `site/`.\n\n- Every push to `main` builds and signs the APK (Actions → Build Android app) and attaches it to a Release.\n- The signing key is kept only encrypted (`signing/release.p12.enc`), unlocked by the `KITA_SIGNING_SEED` secret. Keep this repository private, and do not delete that secret: without it, new versions cannot update the installed app.\n- Build locally: `KS=release.p12 KS_PASS=… sh android/build.sh` with JDK 17 and the Android SDK.\n'});
  return files;
}

/* ---------- GitHub ---------- */
function ghPath(p){ return p.split('/').map(encodeURIComponent).join('/'); }
function githubScopeError(e){
  if(/workflow/i.test(String(e.message||'')) && /scope|refusing|permission/i.test(String(e.message||'')))
    return new Error('Your GitHub token cannot add the build workflow. Create a new token with the repo and workflow scopes, and paste it in Settings → Integrations → GitHub.');
  return e;
}
/* Commits files (text or base64) on top of the branch, removing site/ files that are gone. */
async function githubCommitAll(base, branch, files, message, log){
  let ref=null;
  for(let i=0;i<6&&!ref;i++){ try{ ref=await integrationFetch('github',base+'/git/ref/heads/'+branch); }catch(e){ if(e.status!==404&&e.status!==409) throw e; await new Promise(r=>setTimeout(r,1500)); } }
  if(!ref) throw new Error('The repository is not ready yet. Try again in a moment.');
  const head=ref.object.sha, commit=await integrationFetch('github',base+'/git/commits/'+head);
  const tree=[];
  for(const f of files){
    if(f.base64!=null){
      const blob=await integrationFetch('github',base+'/git/blobs',{method:'POST',body:{content:f.base64,encoding:'base64'}});
      tree.push({path:f.path,mode:'100644',type:'blob',sha:blob.sha});
    }else tree.push({path:f.path,mode:f.path.endsWith('.sh')?'100755':'100644',type:'blob',content:f.content});
  }
  try{
    const old=await integrationFetch('github',base+'/git/trees/'+commit.tree.sha+'?recursive=1');
    const keep=new Set(files.map(f=>f.path));
    for(const e of old.tree||[]) if(e.type==='blob'&&e.path.startsWith('site/')&&!keep.has(e.path)) tree.push({path:e.path,mode:'100644',type:'blob',sha:null});
  }catch(e){}
  log('Committing '+files.length+' files…');
  const t=await integrationFetch('github',base+'/git/trees',{method:'POST',body:{base_tree:commit.tree.sha,tree}});
  const next=await integrationFetch('github',base+'/git/commits',{method:'POST',body:{message,tree:t.sha,parents:[head]}});
  try{ await integrationFetch('github',base+'/git/refs/heads/'+branch,{method:'PATCH',body:{sha:next.sha}}); }
  catch(e){ throw githubScopeError(e); }
  return next.sha;
}
async function githubJson(base, path){
  try{ const f=await integrationFetch('github',base+'/contents/'+ghPath(path)); return JSON.parse(new TextDecoder().decode(base64ToBytes(String(f.content||'').replace(/\s+/g,'')))); }
  catch(e){ if(e.status===404) return null; throw e; }
}
/* The repository secret the workflow signs with; created once, never read back. */
async function ensureSigningSeed(base, log){
  try{ await integrationFetch('github',base+'/actions/secrets/KITA_SIGNING_SEED'); return false; }
  catch(e){ if(e.status!==404) throw e; }
  log('Creating the signing secret…');
  const key=await integrationFetch('github',base+'/actions/secrets/public-key');
  const seed=bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
  const encrypted_value=await sealedBox(seed,key.key);
  await integrationFetch('github',base+'/actions/secrets/KITA_SIGNING_SEED',{method:'PUT',body:{encrypted_value,key_id:key.key_id}});
  return true;
}

/* Publish target "android": returns {url, detail, download?, repo}. */
async function buildAndroidApp(slug, siteFiles, log, opts={}){
  let login=integrationState('github').login;
  if(!login){ login=(await integrationFetch('github','/user')).login; setIntegrationState('github',{...integrationState('github'),login}); }
  const name=slug+'-android', base='/repos/'+login+'/'+name;
  const repo=await githubRepo(login,name,false,log);
  const branch=repo.default_branch||'main';
  const prev=await githubJson(base,'android/app.json');
  const versionCode=Math.max(1,Number(prev?.versionCode||0)+1);
  const app={
    appName:androidAppName(opts.appName||prev?.appName||slug.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase())),
    packageId:validPackageId(prev?.packageId||'')?prev.packageId:androidPackageId(login,slug),
    versionCode, versionName:'1.0.'+versionCode
  };
  await ensureSigningSeed(base,log);
  const files=androidAppFiles(app, siteFiles, androidIcons(app.appName));
  const sha=await githubCommitAll(base, branch, files, 'Build '+app.appName+' '+app.versionName+' with Kita Chat', log);
  log('Building '+app.appName+' '+app.versionName+' on GitHub (about 3 to 5 minutes)…');
  const until=Date.now()+(opts.buildWaitMs??900000), poll=opts.buildPollMs??androidBuildPollMs;
  let run=null, said='';
  while(Date.now()<until){
    await new Promise(r=>setTimeout(r,poll));
    try{
      const runs=await integrationFetch('github',base+'/actions/runs?head_sha='+sha+'&per_page=5');
      run=(runs.workflow_runs||[]).find(r=>/build-apk\.yml$/.test(r.path||'')||r.name==='Build Android app')||null;
    }catch(e){ if(e.status&&e.status!==404) throw e; }
    if(!run) continue;
    if(run.status!==said){ said=run.status; if(run.status!=='completed') log('GitHub: '+run.status.replace(/_/g,' ')+'…'); }
    if(run.status==='completed') break;
  }
  const actions=(repo.html_url||'https://github.com/'+login+'/'+name)+'/actions';
  if(!run || run.status!=='completed') return {url:actions, detail:'Still building on GitHub. Open the link to follow it; the APK will be under Releases.', repo:repo.html_url, app};
  if(run.conclusion!=='success') throw new Error('The build failed on GitHub ('+run.conclusion+'). Open '+(run.html_url||actions)+' to see why.');
  const rel=await integrationFetch('github',base+'/releases/tags/v'+app.versionName);
  const asset=(rel.assets||[]).find(a=>/\.apk$/i.test(a.name));
  return {url:rel.html_url, detail:app.appName+' '+app.versionName+' is ready ('+app.packageId+')', download:asset?.browser_download_url||'', repo:repo.html_url, app};
}
