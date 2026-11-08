// Run on the Android SDK host after packaging; no credentials or npm packages.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const [apk,aapt]=process.argv.slice(2);assert(apk&&aapt,'Usage: node scripts/verify-apk-icons.cjs APK AAPT2');
const dump=(...args)=>cp.execFileSync(aapt,['dump',...args,apk],{encoding:'utf8',maxBuffer:8e6});
const files=cp.execFileSync('unzip',['-Z1',apk],{encoding:'utf8'}).trim().split('\n');
assert(!files.includes('res/mipmap/ic_launcher.png'),'Obsolete unqualified icon is packaged');
for(const [density,size] of [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]){
 const file=files.find(f=>new RegExp('^res/mipmap-'+density+'(?:-v\\d+)?/ic_launcher\\.png$').test(f));assert(file,density);
 const png=cp.execFileSync('unzip',['-p',apk,file]);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);console.log('PASS '+file+' '+size+'x'+size);
}
const table=dump('resources');assert(table.includes('mipmap/ic_launcher'));assert(table.includes('color/kita_icon_iris'));assert(!table.includes('kita_icon_mint'));assert(table.toLowerCase().includes('ff171920'));assert(table.toLowerCase().includes('ffbdadff'));
for(const api of [26,33]){
 const file='res/mipmap-anydpi-v'+api+'/ic_launcher.xml';assert(files.includes(file),file);const tree=dump('xmltree','--file',file);
 assert(tree.includes('adaptive-icon'));assert(tree.includes('background'));assert(tree.includes('foreground'));assert.equal(tree.includes('monochrome'),api===33);console.log(tree);
}
const studio=fs.readFileSync('nazchat/studio.js','utf8').match(/function kitaMark\(\)\{return '([^']+)';\}/)[1];
const paths=[...studio.matchAll(/\bd="([^"]+)"/g)].map(m=>m[1]);
for(const name of ['kita_icon_foreground','kita_icon_monochrome']){
 const file=files.find(f=>new RegExp('^res/drawable(?:-v\\d+)?/'+name+'\\.xml$').test(f));assert(file,name);const tree=dump('xmltree','--file',file);
 for(const p of paths)assert(tree.includes(p),name+' must match production K paths');
 assert(tree.includes('fillAlpha'));assert(tree.includes('scaleX'));assert(tree.includes('translateX'));console.log(tree);
}
console.log('PASS APK launcher resources: 5 legacy densities + adaptive v26 + monochrome v33 + Studio paths and ink/iris palette');
