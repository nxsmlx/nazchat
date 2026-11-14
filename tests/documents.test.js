const {launch, appUrl}=require('./browser');
const assert=require('node:assert/strict');

// 4.23.0: PDF, Word, Excel and PowerPoint files made on the phone from Markdown.
// Checks the packages (every XML part parses, every relationship points at a part, content
// types cover every part), the content of each format, the PDF through the bundled pdf.js,
// and the chat UI: file cards for ```docx / ```xlsx blocks and "Download as…" in the ⋯ menu.
const SAMPLE=`# Laporan Jualan Kopi Kita 2026
Disediakan untuk **pemilik kedai**, dengan *ringkasan* dan \`kod\`. Lihat [laman web](https://keetakita.my).

## Ringkasan
- Jualan naik **18%** berbanding 2025
- Produk paling laris: Kopi Aceh
  - Cawangan Shah Alam
- Café & "teh tarik" <selamat> 🎉

1. Tambah menu baharu
2. Buka cawangan ketiga

> Nota: angka ini belum diaudit.

## Jadual jualan
| Bulan | Unit | Hasil (RM) | Margin |
|:--|--:|--:|--:|
| Januari | 1,200 | RM 4,800.00 | 32% |
| Februari | 1,350 | RM 5,400.50 | 35.5% |
| **Jumlah** | =SUM(B2:B3) | =SUM(C2:C3) | |

## Kod
\`\`\`js
function jumlah(a,b){
  return a+b;
}
\`\`\`

---

## Langkah seterusnya
${'Ayat panjang untuk menguji pembalutan baris dan halaman. '.repeat(60)}
`;

(async()=>{
 const b=await launch();
 let failed=0;
 const seed={schemaVersion:3,onboardingDone:true,providers:[{id:'p',name:'Mock',baseUrl:'https://api.test/v1',secretRef:'provider:p',headers:[],selectedModels:['m']}],lastProviderId:'p',lastModelId:'m',
   conversations:[{id:'c',title:'Bajet',updatedAt:Date.now(),messages:[{id:'u',role:'user',content:'buat bajet excel dan laporan word'},
     {id:'a',role:'assistant',content:'Ini fail anda.\n\n```xlsx Bajet-2026.xlsx\n## Bajet\n| Item | Kos |\n|--|--|\n| Sewa | RM 1,200 |\n| Gaji | RM 3,000.50 |\n| **Jumlah** | =SUM(B2:B3) |\n```\n\n```docx Laporan.docx\n# Laporan\n\nRingkasan pendek.\n```\n\nSelesai.'},
     {id:'u2',role:'user',content:'ringkaskan'},{id:'a2',role:'assistant',content:'## Ringkasan\n\n- Satu\n- Dua\n\n| A | B |\n|--|--|\n| 1 | 2 |'}]}]};
 async function scenario(name,run){
   const ctx=await b.newContext({viewport:{width:390,height:844}});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await ctx.route(/^https?:\/\//,r=>r.fulfill({status:503,body:'{}'}));
   await ctx.addInitScript(seed=>{if(window!==window.top)return;localStorage.setItem('nazchat_v1',JSON.stringify(seed));
     window.__saves=[];window.NazSecrets={get:()=>'',put:()=>true,has:()=>true};window.NazFiles={save:()=>true,saveBase64:(n,m,b64)=>{window.__saves.push({name:n,mime:m,b64});return true;}};},seed);
   try{await page.goto(appUrl);await page.waitForFunction(()=>typeof renderAll==='function'&&typeof buildDocument==='function');await run(page);assert.deepEqual(errors,[]);console.log('PASS '+name);}
   catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e));}
   finally{await ctx.close();}
 }
 // Reads a stored zip (what makeZip writes) and checks every XML part, relationship and content type.
 const inspect=(page,format,md)=>page.evaluate(async([format,md])=>{
   const bytes=await buildDocument(format,md);
   const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), dec=new TextDecoder(), files={};
   let at=0; while(dv.getUint32(at,true)===0x04034b50){ const method=dv.getUint16(at+8,true), size=dv.getUint32(at+18,true), nl=dv.getUint16(at+26,true), xl=dv.getUint16(at+28,true);
     if(method!==0) throw new Error('compressed entry'); const name=dec.decode(bytes.subarray(at+30,at+30+nl)); files[name]=dec.decode(bytes.subarray(at+30+nl+xl,at+30+nl+xl+size)); at+=30+nl+xl+size; }
   const bad=[];
   for(const [name,text] of Object.entries(files)){ if(!/\.(xml|rels)$/.test(name)) continue; const doc=new DOMParser().parseFromString(text,'application/xml'); if(doc.querySelector('parsererror')) bad.push(name); }
   const missing=[];
   for(const [name,text] of Object.entries(files)){ if(!name.endsWith('.rels')) continue; const dir=name.replace(/_rels\/[^/]*\.rels$/,'');
     for(const m of text.matchAll(/<Relationship [^>]*Target="([^"]+)"([^>]*)>/g)){ if(/TargetMode="External"/.test(m[2])) continue; const parts=(dir+m[1]).split('/'); const outp=[]; for(const p of parts){ if(p==='..') outp.pop(); else if(p&&p!=='.') outp.push(p); } if(!files[outp.join('/')]) missing.push(name+' -> '+m[1]); } }
   const types=files['[Content_Types].xml']||'';
   const untyped=Object.keys(files).filter(n=>n.endsWith('.xml')&&n!=='[Content_Types].xml'&&!types.includes('PartName="/'+n+'"'));
   return {names:Object.keys(files),files,bad,missing,untyped,first:Object.keys(files)[0]};
 },[format,md]);
 const sound=pkg=>{ assert.deepEqual(pkg.bad,[],'XML parts that do not parse'); assert.deepEqual(pkg.missing,[],'relationships to missing parts'); assert.deepEqual(pkg.untyped,[],'parts without a content type'); assert.equal(pkg.first,'[Content_Types].xml'); };

 await scenario('Word: styles, nested and numbered lists, table, hyperlink, quote, code',async page=>{
   const pkg=await inspect(page,'docx',SAMPLE); sound(pkg);
   const d=pkg.files['word/document.xml'];
   assert.match(d,/<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">Laporan Jualan Kopi Kita 2026/);
   assert.match(d,/<w:pStyle w:val="Heading2"\/>[\s\S]*Ringkasan/);
   assert.match(d,/<w:ilvl w:val="1"\/><w:numId w:val="1"\/>[\s\S]*Cawangan Shah Alam/);
   assert.match(d,/<w:numId w:val="2"\/>[\s\S]*Tambah menu baharu/);
   assert(d.includes('Café &amp; &quot;teh tarik&quot; ')&&d.includes('&lt;selamat&gt;'),'special characters escaped and kept');
   assert.match(d,/<w:tbl>[\s\S]*<w:tblHeader\/>[\s\S]*Hasil \(RM\)[\s\S]*<w:jc w:val="right"\/>/);
   assert.match(d,/<w:pStyle w:val="Quote"\/>/);assert.match(d,/<w:pStyle w:val="Code"\/>[\s\S]*function jumlah/);
   assert.match(d,/<w:hyperlink r:id="rIdL1">/);
   assert.match(pkg.files['word/_rels/document.xml.rels'],/Target="https:\/\/keetakita.my" TargetMode="External"/);
   assert.match(pkg.files['docProps/core.xml'],/<dc:title>Laporan Jualan Kopi Kita 2026<\/dc:title>/);
 });
 await scenario('Excel: sheet per table, numbers, money, percent, formulas with the column format',async page=>{
   const pkg=await inspect(page,'xlsx',SAMPLE); sound(pkg);
   assert.match(pkg.files['xl/workbook.xml'],/<sheet name="Jadual jualan" sheetId="1"/);
   const s=pkg.files['xl/worksheets/sheet1.xml'];
   assert.match(s,/<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Bulan<\/t>/);
   assert.match(s,/<c r="B2" s="6"><v>1200<\/v><\/c><c r="C2" s="3"><v>4800<\/v><\/c><c r="D2" s="4"><v>0.32<\/v><\/c>/);
   assert.match(s,/<c r="D3" s="5"><v>0.355<\/v><\/c>/);
   assert.match(s,/<c r="A4" t="inlineStr" s="7">[\s\S]*Jumlah[\s\S]*<c r="B4" s="6"><f>SUM\(B2:B3\)<\/f><\/c><c r="C4" s="3"><f>SUM\(C2:C3\)<\/f><\/c>/);
   assert.match(s,/<pane ySplit="1"/);
   assert.match(pkg.files['xl/workbook.xml'],/fullCalcOnLoad="1"/);
   // Leading zeros (phone numbers, ids) stay text; no table → one row per line.
   assert.deepEqual(await page.evaluate(()=>docBlocks('Dear <Nama Syarikat>, <b>ok</b><br>baris').map(b=>docRunsText(b.runs))),['Dear <Nama Syarikat>, ok\nbaris']);
   const v=await page.evaluate(()=>[xlsxValue('0123456789'),xlsxValue('-RM 50'),xlsxValue('=A1*2'),xlsxValue('12.5%'),xlsxSheets('# Senarai\n\n- satu\n- dua')]);
   assert.deepEqual(v[0],{t:'0123456789'});assert.deepEqual(v[1],{n:-50,fmt:'money'});assert.deepEqual(v[2],{f:'A1*2'});assert.deepEqual(v[3],{n:0.125,fmt:'pct2'});
   assert.equal(v[4].length,1);assert.equal(v[4][0].rows.length,3);
   // Sheet names: forbidden characters removed, 31 characters, unique.
   const names=await page.evaluate(()=>{const u=new Set();return [xlsxSheetName('Q1/Q2 [draft]: *jualan*',u),xlsxSheetName('q1 q2 draft jualan',u),xlsxSheetName('x'.repeat(40),u)];});
   assert.equal(names[0],'Q1 Q2 draft jualan');assert.equal(names[1],'q1 q2 draft jualan (2)');assert.equal(names[2].length,31);
 });
 await scenario('PowerPoint: cover, one slide per heading, bullets, table, code, slide numbers',async page=>{
   const pkg=await inspect(page,'pptx',SAMPLE); sound(pkg);
   const slides=pkg.names.filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n));
   assert.equal(slides.length,5);
   assert.equal((pkg.files['ppt/presentation.xml'].match(/<p:sldId /g)||[]).length,5);
   assert.match(pkg.files['ppt/slides/slide1.xml'],/srgbClr val="1E1B4B"[\s\S]*Laporan Jualan Kopi Kita 2026[\s\S]*pemilik kedai/);
   assert.match(pkg.files['ppt/slides/slide2.xml'],/Ringkasan[\s\S]*<a:buChar char="•"\/>[\s\S]*Jualan naik[\s\S]*<a:buAutoNum type="arabicPeriod"\/>[\s\S]*Tambah menu baharu/);
   assert.match(pkg.files['ppt/slides/slide3.xml'],/Jadual jualan[\s\S]*<a:tbl>[\s\S]*Hasil \(RM\)[\s\S]*<a:pPr algn="r"\/>/);
   assert.match(pkg.files['ppt/slides/slide4.xml'],/typeface="Consolas"[\s\S]*function jumlah/);
   assert.match(pkg.files['ppt/slides/slide5.xml'],/Langkah seterusnya[\s\S]*>5<\/a:t>/);
   // Many bullets continue on a second slide.
   const n=await page.evaluate(()=>pptxSlides('## Banyak\n'+Array.from({length:14},(_,i)=>'- Perkara '+(i+1)).join('\n')).map(s=>s.title));
   assert.deepEqual(n,['Banyak','Banyak (2)']);
 });
 await scenario('PDF: text, pages, page numbers and links; other scripts become page images',async page=>{
   const r=await page.evaluate(async md=>{
     const bytes=await buildDocument('pdf',md);
     await loadVendorScript('vendor/pdf.min.js');pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';
     const pdf=await pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
     const pages=[];let links=[];
     for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);pages.push((await p.getTextContent()).items.map(x=>x.str).join(' '));links=links.concat((await p.getAnnotations()).map(a=>a.url).filter(Boolean));}
     const cjk=await buildDocument('pdf','# 报告 Laporan\n\n- 你好 hello\n- தமிழ்');
     const head=new TextDecoder().decode(bytes.subarray(0,8)), raw=new TextDecoder('latin1').decode(cjk);
     return {n:pdf.numPages,pages,links,head,info:(await pdf.getMetadata()).info,cjkImage:/\/DCTDecode/.test(raw),cjkText:/\/Helvetica[\s\S]*BT/.test(raw.split('stream')[1]||'')};
   },SAMPLE);
   assert.equal(r.head,'%PDF-1.4');assert.equal(r.n,2);
   const all=r.pages.join(' ').replace(/\s+/g,' ');
   for(const want of ['Laporan Jualan Kopi Kita 2026','pemilik kedai','Jualan naik','Cawangan Shah Alam','Café','<selamat>','Tambah menu baharu','Hasil (RM)','RM 4,800.00','function jumlah','1 / 2','2 / 2']) assert(all.includes(want),'PDF text missing: '+want);
   assert(!all.includes('🎉'),'emoji must be dropped from the text PDF');
   assert(r.links.length>=1&&r.links.every(u=>u==='https://keetakita.my/'),'link annotations: '+r.links);
   assert.equal(r.info.Title,'Laporan Jualan Kopi Kita 2026');assert.equal(r.info.Producer,'Kita Chat');
   assert(r.cjkImage,'Chinese and Tamil text must be drawn as page images');
 });
 await scenario('Chat: document blocks become file cards with Download, not code tabs',async page=>{
   await page.evaluate(()=>{conv=db.conversations[0];renderAll();});
   const cards=page.locator('.doc-card');
   assert.equal(await cards.count(),2);
   assert.equal(await page.locator('.code-tabs').count(),0,'document blocks must not become code tabs');
   assert.equal(await cards.nth(0).locator('.doc-card-name').innerText(),'Bajet-2026.xlsx');
   assert.equal(await cards.nth(0).locator('.doc-card-sub').innerText(),'Excel workbook · 1 sheet · 3 rows');
   assert.equal(await cards.nth(1).locator('.doc-card-name').innerText(),'Laporan.docx');
   assert.match(await cards.nth(1).locator('.doc-card-sub').innerText(),/^Word document · \d+ words$/);
   // Show content reveals the Markdown behind the file.
   await cards.nth(0).locator('summary').click();
   assert.match(await cards.nth(0).locator('.doc-card-source pre').innerText(),/\| Sewa \| RM 1,200 \|/);
   await cards.nth(0).getByRole('button',{name:'Download Bajet-2026.xlsx'}).click();
   await page.waitForFunction(()=>window.__saves.length===1);
   const s=await page.evaluate(()=>window.__saves[0]);
   assert.equal(s.name,'Bajet-2026.xlsx');assert.equal(s.mime,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   const zip=Buffer.from(s.b64,'base64').toString('latin1');
   assert.match(zip,/xl\/worksheets\/sheet1\.xml/);assert.match(zip,/<sheet name="Bajet"/);assert.match(zip,/<f>SUM\(B2:B3\)<\/f>/);
   await page.evaluate(n=>window.nazFileSaved(true,n,''),s.name);
   assert.match(await page.evaluate(()=>document.querySelector('#toast').textContent),/Excel file saved · Bajet-2026\.xlsx/);
   // Touch target size.
   const box=await cards.nth(0).locator('.doc-card-download').boundingBox();assert(box.height>=44&&box.width>=44);
 });
 await scenario('Chat: ⋯ → Download as… offers PDF, Word, Excel (with a table) and PowerPoint',async page=>{
   await page.evaluate(()=>{conv=db.conversations[0];renderAll();});
   const bar=page.locator('.msg').filter({hasText:'Satu'}).locator('.action-bar').last();
   const more=page.locator('.act-more').last();
   await more.click();
   await page.locator('.msg-menu-item',{hasText:'Download as…'}).click();
   await page.waitForSelector('.msg-menu .msg-menu-item:has-text("PowerPoint (.pptx)")');
   assert.deepEqual(await page.locator('.msg-menu .msg-menu-item').allInnerTexts(),['PDF','Word (.docx)','Excel (.xlsx)','PowerPoint (.pptx)']);
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('.msg-menu').count(),0,'Escape closes the menu');
   await more.click();await page.locator('.msg-menu-item',{hasText:'Download as…'}).click();
   await page.locator('.msg-menu .msg-menu-item',{hasText:'PDF'}).click();
   await page.waitForFunction(()=>window.__saves.length===1);
   const s=await page.evaluate(()=>window.__saves[0]);
   assert.equal(s.name,'Ringkasan.pdf');assert.equal(s.mime,'application/pdf');
   assert.equal(Buffer.from(s.b64,'base64').subarray(0,5).toString(),'%PDF-');
   void bar;
   // Without a table there is no Excel choice.
   const plain=await page.evaluate(()=>documentMenuItems({content:'Hanya teks.'}).map(i=>i[0]));
   assert.deepEqual(plain,['PDF','Word (.docx)','PowerPoint (.pptx)']);
 });
 await scenario('The model learns the file format only when a file is asked for',async page=>{
   const r=await page.evaluate(()=>({excel:skillSystemMessage([],'tolong buat excel bajet bulanan'),slides:skillSystemMessage([],'make me a pitch deck in powerpoint'),hello:skillSystemMessage([],'hai apa khabar')}));
   assert.match(r.excel,/\[Files\][\s\S]*```xlsx Bajet-2026\.xlsx[\s\S]*row 1 is the header/);
   assert.match(r.slides,/\[Files\]/);
   assert(!r.hello.includes('[Files]'));
 });
 await scenario('Make a file: one kind of file per conversation, shown as a chip, only that format asked for',async page=>{
   await page.evaluate(()=>{conv=db.conversations[0];renderAll();renderToolsSheet();openSheet('toolsSheet');});
   assert.equal(await page.locator('#fileFocusPick').inputValue(),'');
   await page.selectOption('#fileFocusPick','pptx');
   assert.equal(await page.evaluate(()=>conv.fileFormat),'pptx');
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nazchat_v1')).conversations[0].fileFormat),'pptx');
   await page.evaluate(()=>closeSheet('toolsSheet'));
   assert.match(await page.locator('#studioContext').innerText(),/PowerPoint file/);
   const note=await page.evaluate(()=>skillSystemMessage([],'tolong buat tentang kopi'));
   assert.match(note,/\[File: PowerPoint\][\s\S]*```pptx Pitch-Deck\.pptx[\s\S]*Make only this PowerPoint file/);
   assert(!/```xlsx|```docx/.test(note),'only the chosen format is described');
   // Removing the chip turns it off.
   await page.locator('#studioContext .studio-context-chip').filter({hasText:'PowerPoint file'}).locator('button').click();
   assert.equal(await page.evaluate(()=>fileFocus()),'');
   assert(!(await page.evaluate(()=>skillSystemMessage([],'tolong buat tentang kopi'))).includes('[File'));
   // Chosen before the first message: the new conversation keeps it.
   const r=await page.evaluate(()=>{conv=null;setFileFocus('xlsx');const before=fileFocus();const c=ensureConv();return {before,saved:c.fileFormat,after:pendingFileFormat};});
   assert.deepEqual(r,{before:'xlsx',saved:'xlsx',after:''});
   // Without a choice, a file request is told to make only the format asked for.
   const general=await page.evaluate(()=>{conv=db.conversations[0];return skillSystemMessage([],'buat slaid powerpoint pasal kopi');});
   assert.match(general,/\[Files\][\s\S]*Make only the format the user asked for, and only one file/);
   // Old conversations without the field read as "only when asked" and are not rewritten.
   assert.equal(await page.evaluate(()=>{const c=db.conversations[0];delete c.fileFormat;conv=c;return fileFocus()+'|'+('fileFormat' in c);}),'|false');
 });
 await b.close();
 if(failed){console.error(failed+' scenario(s) failed');process.exit(1);}
 console.log('PASS documents: PDF, Word, Excel and PowerPoint files from Markdown');
})();
