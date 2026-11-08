/* Keep Android launchers in sync with the production Studio mark.
 * npm run icons:generate writes resources; npm run test:icons verifies them.
 * Requires the existing Playwright/Chromium test setup, no image packages.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launch}=require('../tests/browser');
const root=path.resolve(__dirname,'..'),res=path.join(root,'nazchat-apk/res');
const check=process.argv.includes('--check');
const source=fs.readFileSync(path.join(root,'nazchat/studio.js'),'utf8');
const mark=source.match(/function kitaMark\(\)\{return '([^']+)';\}/)?.[1];
assert(mark,'Production kitaMark SVG missing');
const paths=[...mark.matchAll(/<path([^>]+)\/>/g)].map(m=>({d:m[1].match(/\bd="([^"]+)"/)[1],alpha:Number(m[1].match(/\bopacity="([^"]+)"/)?.[1]||1)}));
assert.equal(paths.length,2);assert.equal(paths[1].alpha,.45);
const palette=fs.readFileSync(path.join(root,'nazchat/index.html'),'utf8');
const bg=palette.match(/--bg:(#[0-9a-f]{6})/i)[1],iris=palette.match(/--accent:(#[0-9a-f]{6})/i)[1];
const xmlHeader='<?xml version="1.0" encoding="utf-8"?>\n';
function writeOrCheck(name,content){const file=path.join(res,name),data=Buffer.from(content);if(check)assert(fs.readFileSync(file).equals(data),'Stale launcher resource: '+name);else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);}}
// 1.5 scale keeps ALL opaque corners inside the central 66dp safe circle.
const vector=mono=>xmlHeader+'<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp" android:height="108dp"\n    android:viewportWidth="108" android:viewportHeight="108">\n    <group android:scaleX="1.5" android:scaleY="1.5" android:translateX="24" android:translateY="24">\n'+paths.map(p=>'        <path android:fillColor="'+(mono?'#FFFFFF':'@color/kita_icon_iris')+'"'+(p.alpha<1?' android:fillAlpha="'+p.alpha+'"':'')+'\n            android:pathData="'+p.d+'" />').join('\n')+'\n    </group>\n</vector>\n';
const adaptive=mono=>xmlHeader+'<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@drawable/kita_icon_background" />\n    <foreground android:drawable="@drawable/kita_icon_foreground" />\n'+(mono?'    <monochrome android:drawable="@drawable/kita_icon_monochrome" />\n':'')+'</adaptive-icon>\n';
writeOrCheck('values/colors.xml',xmlHeader+'<resources>\n    <color name="kita_icon_background">'+bg+'</color>\n    <color name="kita_icon_iris">'+iris+'</color>\n</resources>\n');
writeOrCheck('drawable/kita_icon_background.xml',xmlHeader+'<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n    <solid android:color="@color/kita_icon_background" />\n</shape>\n');
writeOrCheck('drawable/kita_icon_foreground.xml',vector(false));writeOrCheck('drawable/kita_icon_monochrome.xml',vector(true));
writeOrCheck('mipmap-anydpi-v26/ic_launcher.xml',adaptive(false));writeOrCheck('mipmap-anydpi-v33/ic_launcher.xml',adaptive(true));
const pathSvg=color=>paths.map(p=>`<path fill="${color}" opacity="${p.alpha}" d="${p.d}"/>`).join('');
const svg=(shape='rounded',mono=false)=>{const foreground=mono?'#413463':iris,background=mono?'#e9dcff':bg;
 const mask=shape==='circle'?'<circle cx="36" cy="36" r="36"/>':shape==='squircle'?'<path d="M36 0C65 0 72 7 72 36S65 72 36 72 0 65 0 36 7 0 36 0Z"/>':'<rect width="72" height="72" rx="16"/>';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="192" height="192"><defs><clipPath id="mask">${mask}</clipPath></defs><g clip-path="url(#mask)"><path fill="${background}" d="M0 0h72v72H0z"/><g transform="translate(6 6) scale(1.5)">${pathSvg(foreground)}</g></g></svg>`;};
(async()=>{const browser=await launch();try{const page=await browser.newPage({viewport:{width:1040,height:640},deviceScaleFactor:1});
 for(const [density,size] of [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]){
  const png=await page.evaluate(async({svg,size})=>{const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();const c=document.createElement('canvas');c.width=c.height=size;c.getContext('2d').drawImage(img,0,0,size,size);return c.toDataURL('image/png').split(',')[1];},{svg:svg(),size});
  const bytes=Buffer.from(png,'base64');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);writeOrCheck('mipmap-'+density+'/ic_launcher.png',bytes);
 }
 // Test every nontransparent pixel in the actual transformed mark (not just a box).
 const safe=await page.evaluate(async paths=>{const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 108 108"><g transform="translate(24 24) scale(1.5)">${paths.map(p=>`<path fill="white" opacity="${p.alpha}" d="${p.d}"/>`).join('')}</g></svg>`);await img.decode();const c=document.createElement('canvas');c.width=c.height=1080;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,1080,1080).data;let maxRadius=0,count=0;for(let y=0;y<1080;y++)for(let x=0;x<1080;x++)if(data[(y*1080+x)*4+3]){count++;maxRadius=Math.max(maxRadius,Math.hypot((x+.5)/10-54,(y+.5)/10-54));}return {maxRadius,count};},paths);
 assert(safe.count>10000);assert(safe.maxRadius<=33,'Logo leaves the 66dp safe circle: '+safe.maxRadius);
 assert(!fs.existsSync(path.join(res,'mipmap/ic_launcher.png')),'Remove the obsolete unqualified legacy icon');
 const manifest=fs.readFileSync(path.join(root,'nazchat-apk/AndroidManifest.xml'),'utf8');assert(manifest.includes('android:icon="@mipmap/ic_launcher"'));
 // Contact sheet: conceptual masks only, not a native Android screenshot.
 const data=s=>'data:image/svg+xml;base64,'+Buffer.from(s).toString('base64');
 await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#fafbfc;color:#222531;font:15px system-ui;padding:42px}h1{font-size:27px;margin:0 0 8px}p{color:#626879;margin:0 0 36px}.row{display:flex;gap:42px}figure{margin:0;flex:1}img{display:block;width:144px;height:144px;margin:0 auto 18px}figcaption{text-align:center}.small{background:#eef0f5;margin-top:34px;padding:26px;border-radius:20px;display:flex;gap:28px;align-items:center}.small img{width:48px;height:48px;margin:0}.note{margin-top:32px;font-size:13px}</style><h1>Kita Studio · Android launcher</h1><p>The same folded K. Ink background, iris foreground.</p><div class="row">${[['circle','Circle',false],['squircle','Squircle',false],['rounded','Legacy',false],['circle','Themed example',true]].map(([shape,label,mono])=>`<figure><img src="${data(svg(shape,mono))}"><figcaption>${label}</figcaption></figure>`).join('')}</div><div class="small">${['circle','squircle','rounded'].map(s=>`<img src="${data(svg(s))}">`).join('')}<span>48px · clean silhouette, no lettering or badge</span></div><p class="note">Mask previews only. Themed icon colors are chosen by Android and the launcher.</p>`);
 await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 const out=path.join(root,'test-results/launcher-icons');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:out+'/studio-launcher.png'});
 console.log(`PASS launcher: ${check?'verified':'generated'} 5 legacy densities, adaptive v26, themed v33, exact Studio paths/palette; radius ${safe.maxRadius.toFixed(2)}dp ≤33dp. Preview: test-results/launcher-icons/studio-launcher.png`);
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
