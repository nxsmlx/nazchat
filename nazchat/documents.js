/* Documents (4.23.0): PDF, Word, Excel and PowerPoint files, made on the phone.
   - The model writes the content as Markdown inside a fenced block named after the format,
     e.g. ```docx Report.docx, and Kita shows it as a file card with Download.
   - Any answer can also be saved as one of these files from its ⋯ menu.
   - Everything is built here: Office files are zip packages of XML (makeZip in project.js),
     the PDF is written directly. No server, no library, nothing leaves the phone. */
'use strict';

const DOC_FORMATS={
  pdf:{label:'PDF',kind:'PDF document',ext:'pdf',mime:'application/pdf'},
  docx:{label:'Word',kind:'Word document',ext:'docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
  xlsx:{label:'Excel',kind:'Excel workbook',ext:'xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
  pptx:{label:'PowerPoint',kind:'PowerPoint presentation',ext:'pptx',mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}
};
const DOC_ALIASES={pdf:'pdf',docx:'docx',word:'docx',xlsx:'xlsx',excel:'xlsx',spreadsheet:'xlsx',pptx:'pptx',powerpoint:'pptx',slides:'pptx'};
function docFormatOf(lang){ return DOC_ALIASES[String(lang||'').toLowerCase()]||''; }

/* ---------- Markdown → blocks ---------- */
function docDecode(s){ return String(s??'').replace(/&(amp|lt|gt|quot|#39|#x27);/g,(m,e)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'",'#x27':"'"})[e]); }
function docInline(tokens, style){
  style=style||{}; const out=[];
  for(const t of tokens||[]){
    if(t.type==='strong') out.push(...docInline(t.tokens,{...style,bold:true}));
    else if(t.type==='em') out.push(...docInline(t.tokens,{...style,italic:true}));
    else if(t.type==='del') out.push(...docInline(t.tokens,{...style,strike:true}));
    else if(t.type==='codespan') out.push({...style,text:docDecode(t.text),code:true});
    else if(t.type==='link') out.push(...docInline(t.tokens,{...style,link:/^(https?:|mailto:)/i.test(t.href||'')?t.href:''}));
    else if(t.type==='br') out.push({...style,text:'\n'});
    else if(t.type==='image') out.push({...style,text:t.text||''});
    else if(t.type==='text'&&t.tokens) out.push(...docInline(t.tokens,style));
    else if(t.type==='html') { const s=docHtmlText(t.text); if(s) out.push({...style,text:s}); }
    else out.push({...style,text:docDecode(t.text??t.raw??'')});
  }
  return out;
}
/* Real HTML tags are dropped; placeholders such as <Nama Syarikat> stay as text. */
const DOC_HTML_TAG=/<\/?(?:br|b|i|u|em|strong|span|sup|sub|a|p|div|small|mark|del|s|ins|code|kbd|img|font|center|hr|table|tr|td|th|thead|tbody|ul|ol|li|h[1-6]|blockquote|pre|details|summary|section|article|header|footer|nav|main)\b[^>]*>/gi;
function docHtmlText(html){ return docDecode(String(html||'').replace(/<br\s*\/?>/gi,'\n').replace(DOC_HTML_TAG,'').replace(/<!--[\s\S]*?-->/g,'')); }
function docRunsText(runs){ return (runs||[]).map(r=>r.text).join(''); }
/* Blocks: heading, para, item (list item with level), table, code, hr. */
function docBlocks(markdown){
  const source=typeof normalizeFences==='function'?normalizeFences(String(markdown||'')):String(markdown||'');
  const tokens=marked.lexer(source.replace(/\r\n?/g,'\n'));
  const blocks=[]; let lists=0;
  const inline=t=>docInline(t.tokens||[{type:'text',text:t.text}]);
  function list(l,level){
    const id=++lists; let n=Number(l.start)||1;
    for(const item of l.items){
      const runs=[], after=[];
      if(item.task) runs.push({text:item.checked?'[x] ':'[ ] '});
      for(const t of item.tokens||[]){
        if(t.type==='list'||t.type==='code'||t.type==='table') after.push(t);
        else if(t.type==='text'||t.type==='paragraph'){ if(runs.length&&!(item.task&&runs.length===1)) runs.push({text:'\n'}); runs.push(...inline(t)); }
      }
      blocks.push({type:'item',ordered:!!l.ordered,level:Math.min(level,5),number:n++,list:id,runs});
      for(const t of after){ if(t.type==='list') list(t,level+1); else walk([t],false); }
    }
  }
  function walk(list_,quote){
    for(const t of list_){
      if(t.type==='heading') blocks.push({type:'heading',level:Math.min(t.depth,4),runs:inline(t)});
      else if(t.type==='paragraph'||t.type==='text') blocks.push({type:'para',runs:inline(t),quote});
      else if(t.type==='list') list(t,0);
      else if(t.type==='table') blocks.push({type:'table',header:t.header.map(c=>docInline(c.tokens)),rows:t.rows.map(r=>r.map(c=>docInline(c.tokens))),align:t.align||[]});
      else if(t.type==='code') blocks.push({type:'code',text:String(t.text||'').replace(/\t/g,'    '),lang:t.lang||''});
      else if(t.type==='blockquote') walk(t.tokens||[],true);
      else if(t.type==='hr') blocks.push({type:'hr'});
      else if(t.type==='html'){ const s=docHtmlText(t.text).trim(); if(s) blocks.push({type:'para',runs:[{text:s}],quote}); }
    }
  }
  walk(tokens,false);
  return blocks;
}
function docTitle(blocks, fallback){
  const h=blocks.find(b=>b.type==='heading'); if(h) return docRunsText(h.runs).trim().slice(0,120);
  const p=blocks.find(b=>b.type==='para'); if(p) return docRunsText(p.runs).split('\n')[0].trim().slice(0,80);
  return fallback||'Document';
}
function docFileName(name, format, title){
  const ext=DOC_FORMATS[format].ext;
  let base=String(name||'').trim().replace(/\.[a-z0-9]{1,5}$/i,'');
  if(!base) base=String(title||'document').normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-').slice(0,60)||'document';
  return base.replace(/[\\/:*?"<>|]/g,'_')+'.'+ext;
}

/* ---------- shared XML / zip helpers ---------- */
function xmlEsc(s){ return String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
const XML_HEAD='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function docRels(list){ return XML_HEAD+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+list.map(r=>'<Relationship Id="'+r.id+'" Type="'+r.type+'" Target="'+xmlEsc(r.target)+'"'+(r.external?' TargetMode="External"':'')+'/>').join('')+'</Relationships>'; }
function docCoreProps(title){
  const now=new Date().toISOString().replace(/\.\d+Z$/,'Z');
  return XML_HEAD+'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+xmlEsc(title)+'</dc:title><dc:creator>Kita Chat</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+now+'</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">'+now+'</dcterms:modified></cp:coreProperties>';
}
const DOC_APP_PROPS=XML_HEAD+'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Kita Chat</Application></Properties>';
function docPackageRels(main){
  return docRels([{id:'rId1',type:NS_REL+'/officeDocument',target:main},{id:'rId2',type:'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',target:'docProps/core.xml'},{id:'rId3',type:NS_REL+'/extended-properties',target:'docProps/app.xml'}]);
}
function docContentTypes(overrides){
  return XML_HEAD+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    +overrides.concat([['/docProps/core.xml','application/vnd.openxmlformats-package.core-properties+xml'],['/docProps/app.xml','application/vnd.openxmlformats-officedocument.extended-properties+xml']]).map(([p,t])=>'<Override PartName="'+p+'" ContentType="'+t+'"/>').join('')+'</Types>';
}

/* ---------- Word (.docx) ---------- */
function buildDocx(markdown, title){
  const blocks=docBlocks(markdown); title=title||docTitle(blocks);
  const links=[]; const nums=[]; const listNum=new Map();
  const W=9298; // text width in twips (A4, 23 mm margins)
  const run=r=>{
    const props=(r.code?'<w:rStyle w:val="InlineCode"/>':r.link?'<w:rStyle w:val="Hyperlink"/>':'')+(r.bold?'<w:b/><w:bCs/>':'')+(r.italic?'<w:i/><w:iCs/>':'')+(r.strike?'<w:strike/>':'');
    const parts=String(r.text).split('\n').map(s=>'<w:t xml:space="preserve">'+xmlEsc(s)+'</w:t>').join('<w:br/>');
    return '<w:r>'+(props?'<w:rPr>'+props+'</w:rPr>':'')+parts+'</w:r>';
  };
  const runs=list=>{
    let out='';
    for(const r of list){
      if(r.link){ const id='rIdL'+(links.length+1); links.push({id,type:NS_REL+'/hyperlink',target:r.link,external:true}); out+='<w:hyperlink r:id="'+id+'">'+run(r)+'</w:hyperlink>'; }
      else out+=run(r);
    }
    return out;
  };
  const para=(style,list,extra)=>'<w:p>'+(style||extra?'<w:pPr>'+(style?'<w:pStyle w:val="'+style+'"/>':'')+(extra||'')+'</w:pPr>':'')+runs(list)+'</w:p>';
  let body='', firstH1=true;
  for(const b of blocks){
    if(b.type==='heading'){ const style=b.level===1&&firstH1?'Title':'Heading'+b.level; if(b.level===1) firstH1=false; body+=para(style,b.runs); }
    else if(b.type==='para') body+=para(b.quote?'Quote':'',b.runs);
    else if(b.type==='item'){
      let numId=1;
      if(b.ordered){ if(!listNum.has(b.list)){ listNum.set(b.list,nums.length+2); nums.push(b.number); } numId=listNum.get(b.list); }
      body+=para('ListParagraph',b.runs,'<w:numPr><w:ilvl w:val="'+b.level+'"/><w:numId w:val="'+numId+'"/></w:numPr>');
    }
    else if(b.type==='code') body+='<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr>'+run({text:b.text})+'</w:p>';
    else if(b.type==='hr') body+='<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFC5D2"/></w:pBdr></w:pPr></w:p>';
    else if(b.type==='table'){
      const cols=Math.max(b.header.length,...b.rows.map(r=>r.length),1);
      const weight=Array.from({length:cols},(_,i)=>Math.min(40,Math.max(4,...[b.header,...b.rows].map(r=>docRunsText(r[i]||[]).length))));
      const total=weight.reduce((a,c)=>a+c,0);
      const widths=weight.map(w=>Math.round(W*w/total));
      const border='<w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(s=>'<w:'+s+' w:val="single" w:sz="4" w:space="0" w:color="BFC5D2"/>').join('')+'</w:tblBorders>';
      const cell=(r,i,head)=>{
        const jc=b.align[i]==='right'?'right':b.align[i]==='center'?'center':'';
        return '<w:tc><w:tcPr><w:tcW w:w="'+widths[i]+'" w:type="dxa"/>'+(head?'<w:shd w:val="clear" w:color="auto" w:fill="E8ECF4"/>':'')+'</w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/>'+(jc?'<w:jc w:val="'+jc+'"/>':'')+'</w:pPr>'+runs((r||[]).map(x=>head?{...x,bold:true}:x))+'</w:p></w:tc>';
      };
      const row=(cells,head)=>'<w:tr>'+(head?'<w:trPr><w:tblHeader/></w:trPr>':'')+Array.from({length:cols},(_,i)=>cell(cells[i],i,head)).join('')+'</w:tr>';
      body+='<w:tbl><w:tblPr><w:tblW w:w="'+W+'" w:type="dxa"/>'+border+'<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>'
        +widths.map(w=>'<w:gridCol w:w="'+w+'"/>').join('')+'</w:tblGrid>'+row(b.header,true)+b.rows.map(r=>row(r,false)).join('')+'</w:tbl><w:p/>';
    }
  }
  if(!body) body='<w:p/>';
  const document=XML_HEAD+'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="'+NS_REL+'"><w:body>'+body
    +'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1304" w:right="1304" w:bottom="1304" w:left="1304" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const lvl=(i,fmt,text,ind)=>'<w:lvl w:ilvl="'+i+'"><w:start w:val="1"/><w:numFmt w:val="'+fmt+'"/><w:lvlText w:val="'+text+'"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="'+ind+'" w:hanging="360"/></w:pPr></w:lvl>';
  const bullets=['•','◦','▪','•','◦','▪'], fmts=['decimal','lowerLetter','lowerRoman','decimal','lowerLetter','lowerRoman'];
  const numbering=XML_HEAD+'<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    +'<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>'+bullets.map((c,i)=>lvl(i,'bullet',c,720+i*360)).join('')+'</w:abstractNum>'
    +'<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>'+fmts.map((f,i)=>lvl(i,f,'%'+(i+1)+'.',720+i*360)).join('')+'</w:abstractNum>'
    +'<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>'
    +nums.map((start,i)=>'<w:num w:numId="'+(i+2)+'"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="'+start+'"/></w:lvlOverride></w:num>').join('')
    +'</w:numbering>';
  const heading=(id,name,size,before)=>'<w:style w:type="paragraph" w:styleId="'+id+'"><w:name w:val="'+name+'"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="'+before+'" w:after="80"/><w:outlineLvl w:val="'+(Number(id.slice(-1))-1)+'"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F2A44"/><w:sz w:val="'+size+'"/><w:szCs w:val="'+size+'"/></w:rPr></w:style>';
  const styles=XML_HEAD+'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    +'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    +'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F2A44"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>'
    +heading('Heading1','heading 1',34,360)+heading('Heading2','heading 2',28,300)+heading('Heading3','heading 3',24,240)+heading('Heading4','heading 4',22,200)
    +'<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BFC5D2"/></w:pBdr><w:ind w:left="284"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="4B5563"/></w:rPr></w:style>'
    +'<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/><w:spacing w:after="160" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>'
    +'<w:style w:type="character" w:styleId="InlineCode"><w:name w:val="Inline Code"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/></w:rPr></w:style>'
    +'<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
    +'</w:styles>';
  return makeZip([
    {path:'[Content_Types].xml',content:docContentTypes([['/word/document.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'],['/word/styles.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'],['/word/numbering.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml']])},
    {path:'_rels/.rels',content:docPackageRels('word/document.xml')},
    {path:'word/document.xml',content:document},
    {path:'word/styles.xml',content:styles},
    {path:'word/numbering.xml',content:numbering},
    {path:'word/_rels/document.xml.rels',content:docRels([{id:'rIdS',type:NS_REL+'/styles',target:'styles.xml'},{id:'rIdN',type:NS_REL+'/numbering',target:'numbering.xml'},...links])},
    {path:'docProps/core.xml',content:docCoreProps(title)},
    {path:'docProps/app.xml',content:DOC_APP_PROPS}
  ]);
}

/* ---------- Excel (.xlsx) ---------- */
function xlsxColumn(n){ let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); } return s; }
/* A cell's text → number, percent, money, formula or text. */
function xlsxValue(text){
  const s=String(text||'').trim();
  if(/^=[^=]/.test(s)) return {f:s.slice(1)};
  const pct=s.match(/^(-?\d+(?:\.\d+)?)\s?%$/);
  if(pct) return {n:Number(pct[1])/100,fmt:/\./.test(pct[1])?'pct2':'pct'};
  const money=/^(?:-\s?)?(?:RM|MYR|USD|SGD|IDR|Rp|\$|€|£)\s?/i.test(s);
  const plain=s.replace(/^(-?)\s?(?:RM|MYR|USD|SGD|IDR|Rp|\$|€|£)\s?/i,'$1').replace(/,(?=\d{3}(?:\D|$))/g,'');
  if(/^-?\d+(?:\.\d+)?$/.test(plain) && !/^-?0\d/.test(plain) && plain.replace(/\D/g,'').length<=15) return {n:Number(plain),fmt:money||/\.\d\d$/.test(plain)?'money':''};
  return {t:s};
}
function xlsxSheetName(name, used){
  let base=String(name||'').replace(/[\[\]:*?\/\\]/g,' ').replace(/^'+|'+$/g,'').replace(/\s+/g,' ').trim().slice(0,31)||'Sheet';
  let n=base, i=2; while(used.has(n.toLowerCase())){ const suffix=' ('+i+++')'; n=base.slice(0,31-suffix.length)+suffix; }
  used.add(n.toLowerCase()); return n;
}
function xlsxSheets(markdown){
  const blocks=docBlocks(markdown), sheets=[], used=new Set(); let heading='';
  for(const b of blocks){
    if(b.type==='heading') heading=docRunsText(b.runs).trim();
    if(b.type==='table') sheets.push({name:xlsxSheetName(heading||'Sheet'+(sheets.length+1),used),header:b.header,rows:b.rows});
  }
  if(!sheets.length){
    // No table: one row per line of text, headings in bold.
    const rows=[];
    for(const b of blocks){
      if(b.type==='heading') rows.push([b.runs.map(r=>({...r,bold:true}))]);
      else if(b.type==='para'||b.type==='item') docRunsText(b.runs).split('\n').forEach(l=>{ if(l.trim()) rows.push([[{text:l.trim()}]]); });
      else if(b.type==='code') b.text.split('\n').forEach(l=>rows.push([[{text:l}]]));
    }
    sheets.push({name:xlsxSheetName(docTitle(blocks,'Sheet1'),used),header:null,rows});
  }
  return sheets;
}
function buildXlsx(markdown, title){
  const sheets=xlsxSheets(markdown);
  title=title||docTitle(docBlocks(markdown));
  const style={text:2,money:3,pct:4,pct2:5,'':6};
  const sheetXml=sh=>{
    const all=(sh.header?[sh.header]:[]).concat(sh.rows);
    const cols=Math.max(1,...all.map(r=>r.length));
    const widths=Array(cols).fill(8), colFmt=Array(cols).fill('');
    const rows=all.map((cells,ri)=>{
      const head=!!sh.header&&ri===0;
      return '<row r="'+(ri+1)+'">'+Array.from({length:cols},(_,ci)=>{
        const runs=cells[ci]||[], text=docRunsText(runs), ref=xlsxColumn(ci)+(ri+1);
        const bold=head||runs.length&&runs.every(r=>r.bold||!r.text.trim());
        widths[ci]=Math.max(widths[ci],Math.min(60,text.split('\n').reduce((m,l)=>Math.max(m,l.length),0)+2));
        if(head) return '<c r="'+ref+'" t="inlineStr" s="1"><is><t xml:space="preserve">'+xmlEsc(text)+'</t></is></c>';
        if(!text.trim()) return '<c r="'+ref+'" s="2"/>';
        const v=xlsxValue(text);
        // A formula takes the number format of the values above it (money, percent).
        if(v.f) return '<c r="'+ref+'" s="'+(colFmt[ci]?style[colFmt[ci]]+(bold?5:0):bold?11:6)+'"><f>'+xmlEsc(v.f)+'</f></c>';
        if(v.n!==undefined&&v.fmt) colFmt[ci]=v.fmt;
        if(v.n!==undefined) return '<c r="'+ref+'" s="'+(style[v.fmt]+(bold?5:0))+'"><v>'+v.n+'</v></c>';
        return '<c r="'+ref+'" t="inlineStr" s="'+(bold?7:2)+'"><is><t xml:space="preserve">'+xmlEsc(v.t)+'</t></is></c>';
      }).join('')+'</row>';
    }).join('');
    const pane=sh.header&&all.length>1?'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>':'';
    return XML_HEAD+'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="'+NS_REL+'"><dimension ref="A1:'+xlsxColumn(cols-1)+Math.max(1,all.length)+'"/><sheetViews><sheetView workbookViewId="0">'+pane+'</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>'
      +widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols><sheetData>'+rows+'</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
  };
  const xf=(numFmt,font,fill,extra)=>'<xf numFmtId="'+numFmt+'" fontId="'+font+'" fillId="'+fill+'" borderId="'+(fill===-1?0:1)+'" xfId="0"'+(numFmt?' applyNumberFormat="1"':'')+(font?' applyFont="1"':'')+(fill?' applyFill="1"':'')+' applyBorder="1"'+(extra?' applyAlignment="1">'+extra+'</xf>':'/>');
  const top='<alignment vertical="top" wrapText="1"/>';
  const styles=XML_HEAD+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
    +'<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
    +'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8ECF4"/><bgColor indexed="64"/></patternFill></fill></fills>'
    +'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>'+['left','right','top','bottom'].map(s=>'<'+s+' style="thin"><color rgb="FFBFC5D2"/></'+s+'>').join('')+'<diagonal/></border></borders>'
    +'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    +'<cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    +xf(0,1,2,top)+xf(0,0,0,top)+xf(164,0,0)+xf(9,0,0)+xf(10,0,0)+xf(0,0,0)
    +xf(0,1,0,top)+xf(164,1,0)+xf(9,1,0)+xf(10,1,0)+xf(0,1,0)+'</cellXfs>'
    +'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  // Style ids: 1 header, 2 text, 3 money, 4 %, 5 0.00%, 6 number/formula; +5 = bold (7 text/formula, 8 money, 9 %, 10 0.00%, 11 number).
  const workbook=XML_HEAD+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="'+NS_REL+'"><bookViews><workbookView/></bookViews><sheets>'
    +sheets.map((s,i)=>'<sheet name="'+xmlEsc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
  const files=[
    {path:'[Content_Types].xml',content:docContentTypes([['/xl/workbook.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'],['/xl/styles.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'],...sheets.map((s,i)=>['/xl/worksheets/sheet'+(i+1)+'.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'])])},
    {path:'_rels/.rels',content:docPackageRels('xl/workbook.xml')},
    {path:'xl/workbook.xml',content:workbook},
    {path:'xl/_rels/workbook.xml.rels',content:docRels([...sheets.map((s,i)=>({id:'rId'+(i+1),type:NS_REL+'/worksheet',target:'worksheets/sheet'+(i+1)+'.xml'})),{id:'rIdS',type:NS_REL+'/styles',target:'styles.xml'}])},
    {path:'xl/styles.xml',content:styles},
    ...sheets.map((s,i)=>({path:'xl/worksheets/sheet'+(i+1)+'.xml',content:sheetXml(s)})),
    {path:'docProps/core.xml',content:docCoreProps(title)},
    {path:'docProps/app.xml',content:DOC_APP_PROPS}
  ];
  return makeZip(files);
}

/* ---------- PowerPoint (.pptx) ---------- */
const PPT={W:12192000,H:6858000,X:685800,EMU:12700};
/* Slides: a new slide at each --- and at each # / ## heading; ### and below stay inside. */
function pptxSlides(markdown){
  const blocks=docBlocks(markdown), slides=[];
  let cur=null;
  const start=()=>{ cur={title:null,items:[],tables:[]}; slides.push(cur); };
  for(const b of blocks){
    if(b.type==='hr'){ start(); continue; }
    if(b.type==='heading'){
      const text=docRunsText(b.runs).trim();
      if(cur&&cur.title===null&&!cur.items.length&&!cur.tables.length){ cur.title=text; continue; }
      if(!cur||b.level<=2){ start(); cur.title=text; continue; }
    }
    if(!cur) start();
    if(b.type==='heading') cur.items.push({runs:b.runs.map(r=>({...r,bold:true})),level:0,sub:true});
    else if(b.type==='para') cur.items.push({runs:b.runs,level:0,plain:true});
    else if(b.type==='item') cur.items.push({runs:b.runs,level:b.level,ordered:b.ordered,number:b.number});
    else if(b.type==='code') b.text.split('\n').forEach(l=>cur.items.push({runs:[{text:l,code:true}],level:0,plain:true,code:true}));
    else if(b.type==='table') cur.tables.push(b);
  }
  const out=slides.filter(s=>s.title||s.items.length||s.tables.length);
  // A first slide with a title and at most a short line under it is the title slide.
  if(out[0]&&out[0].title&&!out[0].tables.length&&out[0].items.length<=2&&out[0].items.every(i=>i.plain&&docRunsText(i.runs).length<=160)) out[0].cover=true;
  // Long slides continue on the next slide instead of running off the page.
  const fitted=[];
  for(const s of out){
    if(s.cover||s.items.length<=8&&docRunsText(s.items.flatMap(i=>i.runs)).length<=700){ fitted.push(s); continue; }
    let part=[], chars=0, n=0;
    const flush=()=>{ if(!part.length&&n) return; fitted.push({...s,items:part,tables:n?[]:s.tables,title:s.title+(n?' ('+(n+1)+')':'')}); n++; part=[]; chars=0; };
    for(const it of s.items){ const c=docRunsText(it.runs).length; if(part.length&&(part.length>=8||chars+c>700)) flush(); part.push(it); chars+=c; }
    flush();
  }
  return fitted.length?fitted:[{title:'Slide',items:[],tables:[],cover:false}];
}
function buildPptx(markdown, title){
  const slides=pptxSlides(markdown);
  title=title||slides[0]?.title||'Presentation';
  const NS='xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="'+NS_REL+'" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const DARK='1F2937', ACCENT='4F46E5', MUTED='6B7280', NAVY='1E1B4B';
  let shapeId=1;
  const rPr=(r,size,color,extra)=>'<a:rPr lang="en-US" sz="'+size+'"'+(r.bold?' b="1"':'')+(r.italic?' i="1"':'')+(r.link?' u="sng"':'')+(r.strike?' strike="sngStrike"':'')+' dirty="0"><a:solidFill><a:srgbClr val="'+(r.link?'2563EB':color)+'"/></a:solidFill><a:latin typeface="'+(r.code?'Consolas':'Calibri')+'"/>'+(extra||'')+'</a:rPr>';
  const textRuns=(runs,size,color)=>runs.flatMap(r=>String(r.text).split('\n').map((t,i)=>(i?'<a:br>'+rPr(r,size,color)+'</a:br>':'')+(t?'<a:r>'+rPr(r,size,color)+'<a:t>'+xmlEsc(t)+'</a:t></a:r>':''))).join('');
  const box=(x,y,w,h,paras,anchor)=>'<p:sp><p:nvSpPr><p:cNvPr id="'+(++shapeId)+'" name="Text '+shapeId+'"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+w+'" cy="'+h+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="'+(anchor||'t')+'"><a:normAutofit/></a:bodyPr><a:lstStyle/>'+paras+'</p:txBody></p:sp>';
  const rect=(x,y,w,h,color)=>'<p:sp><p:nvSpPr><p:cNvPr id="'+(++shapeId)+'" name="Shape '+shapeId+'"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+w+'" cy="'+h+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="'+color+'"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>';
  const table=(t,x,y,w,maxH,size)=>{
    const cols=Math.max(t.header.length,...t.rows.map(r=>r.length),1);
    const weight=Array.from({length:cols},(_,i)=>Math.min(40,Math.max(4,...[t.header,...t.rows].map(r=>docRunsText(r[i]||[]).length))));
    const total=weight.reduce((a,c)=>a+c,0), widths=weight.map(v=>Math.floor(w*v/total));
    const rowH=Math.round(size/100*PPT.EMU*2.1);
    const rows=[t.header,...t.rows].slice(0,Math.max(2,Math.floor(maxH/rowH)));
    const line=s=>'<a:'+s+' w="9525"><a:solidFill><a:srgbClr val="D1D5DB"/></a:solidFill></a:'+s+'>';
    const cell=(runs,head,i)=>'<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>'+(t.align[i]==='right'?'<a:pPr algn="r"/>':t.align[i]==='center'?'<a:pPr algn="ctr"/>':'')+(textRuns((runs||[]).map(r=>head?{...r,bold:true}:r),size,DARK)||'<a:endParaRPr lang="en-US" sz="'+size+'" dirty="0"/>')+'</a:p></a:txBody><a:tcPr marL="91440" marR="91440" marT="45720" marB="45720">'+line('lnL')+line('lnR')+line('lnT')+line('lnB')+'<a:solidFill><a:srgbClr val="'+(head?'EEF2FF':'FFFFFF')+'"/></a:solidFill></a:tcPr></a:tc>';
    return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="'+(++shapeId)+'" name="Table '+shapeId+'"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+w+'" cy="'+rowH*rows.length+'"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>'
      +widths.map(v=>'<a:gridCol w="'+v+'"/>').join('')+'</a:tblGrid>'+rows.map((r,ri)=>'<a:tr h="'+rowH+'">'+Array.from({length:cols},(_,i)=>cell(r[i],ri===0,i)).join('')+'</a:tr>').join('')+'</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
  };
  const slideXml=(s,index)=>{
    shapeId=1; let shapes='', bg='FFFFFF';
    const W=PPT.W, H=PPT.H, X=PPT.X, CW=W-2*X;
    if(s.cover){
      bg=NAVY;
      shapes+=rect(X,Math.round(H*0.36),914400,54864,'A5B4FC');
      shapes+=box(X,Math.round(H*0.40),CW,1600000,'<a:p>'+textRuns([{text:s.title,bold:true}],s.title.length>60?3600:4400,'FFFFFF')+'</a:p>','t');
      const sub=s.items.map(i=>'<a:p><a:pPr><a:spcBef><a:spcPts val="600"/></a:spcBef></a:pPr>'+textRuns(i.runs,2000,'C7D2FE')+'</a:p>').join('');
      if(sub) shapes+=box(X,Math.round(H*0.66),CW,1100000,sub,'t');
    }else{
      shapes+=rect(0,0,W,91440,ACCENT);
      shapes+=box(X,411480,CW,822960,'<a:p>'+textRuns([{text:s.title||'',bold:true}],(s.title||'').length>70?2400:3000,DARK)+'</a:p>','b');
      shapes+=rect(X,1325880,640080,36576,ACCENT);
      let top=1554480; const bottom=H-640080;
      const chars=docRunsText(s.items.flatMap(i=>i.runs)).length+s.items.length*20;
      const size=s.tables.length?(s.items.length?1600:1800):chars>520?1600:chars>320?1800:chars>160?2000:2400;
      if(s.items.length){
        const lines=s.items.reduce((n,i)=>n+Math.max(1,Math.ceil(docRunsText(i.runs).length*size/100*0.55*PPT.EMU/(CW-i.level*457200))),0);
        const h=s.tables.length?Math.min(bottom-top-900000,Math.round(lines*size/100*PPT.EMU*1.45+80000)):bottom-top;
        const paras=s.items.map(i=>{
          const indent=457200*i.level;
          const bullet=i.plain||i.sub?'<a:buNone/>':i.ordered?'<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"'+(i.number>1?' startAt="'+i.number+'"':'')+'/>':'<a:buClr><a:srgbClr val="'+ACCENT+'"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="'+(i.level?'\u2013':'\u2022')+'"/>';
          const mar=i.plain||i.sub?indent:indent+342900;
          return '<a:p><a:pPr marL="'+mar+'" indent="'+(i.plain||i.sub?0:-342900)+'"><a:spcBef><a:spcPts val="'+(i.code?0:Math.round(size/4))+'"/></a:spcBef>'+bullet+'</a:pPr>'+(textRuns(i.runs,i.code?Math.max(1200,size-400):i.level?Math.max(1200,size-200):size,i.plain&&!i.sub?MUTED:DARK)||'<a:endParaRPr lang="en-US" sz="'+size+'" dirty="0"/>')+'</a:p>';
        }).join('');
        shapes+=box(X,top,CW,Math.max(400000,h),paras,'t');
        top+=Math.max(400000,h)+182880;
      }
      if(s.tables.length) shapes+=table(s.tables[0],X,top,CW,bottom-top,s.tables[0].rows.length>8?1200:1400);
      shapes+=box(W-X-1371600,H-457200,1371600,274320,'<a:p><a:pPr algn="r"/>'+textRuns([{text:String(index+1)}],1100,'9CA3AF')+'</a:p>','t');
    }
    return XML_HEAD+'<p:sld '+NS+'><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="'+bg+'"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
      +shapes+'</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  };
  const emptyTree='<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
  const clr=(n,v)=>'<a:'+n+'><a:srgbClr val="'+v+'"/></a:'+n+'>';
  const font='<a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/>';
  const three=x=>x+x+x;
  const theme=XML_HEAD+'<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Kita"><a:themeElements><a:clrScheme name="Kita">'
    +clr('dk1',DARK)+clr('lt1','FFFFFF')+clr('dk2',NAVY)+clr('lt2','F3F4F6')+clr('accent1',ACCENT)+clr('accent2','0EA5E9')+clr('accent3','10B981')+clr('accent4','F59E0B')+clr('accent5','EF4444')+clr('accent6','8B5CF6')+clr('hlink','2563EB')+clr('folHlink','7C3AED')
    +'</a:clrScheme><a:fontScheme name="Kita"><a:majorFont>'+font+'</a:majorFont><a:minorFont>'+font+'</a:minorFont></a:fontScheme><a:fmtScheme name="Kita"><a:fillStyleLst>'+three('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>')+'</a:fillStyleLst><a:lnStyleLst>'
    +three('<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>')+'</a:lnStyleLst><a:effectStyleLst>'+three('<a:effectStyle><a:effectLst/></a:effectStyle>')+'</a:effectStyleLst><a:bgFillStyleLst>'+three('<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>')+'</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
  const master=XML_HEAD+'<p:sldMaster '+NS+'><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>'+emptyTree+'</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>';
  const layout=XML_HEAD+'<p:sldLayout '+NS+' type="blank" preserve="1"><p:cSld name="Blank">'+emptyTree+'</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  const presentation=XML_HEAD+'<p:presentation '+NS+' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>'
    +slides.map((s,i)=>'<p:sldId id="'+(256+i)+'" r:id="rId'+(10+i)+'"/>').join('')+'</p:sldIdLst><p:sldSz cx="'+PPT.W+'" cy="'+PPT.H+'"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  const PML='application/vnd.openxmlformats-officedocument.presentationml.';
  const files=[
    {path:'[Content_Types].xml',content:docContentTypes([['/ppt/presentation.xml',PML+'presentation.main+xml'],['/ppt/slideMasters/slideMaster1.xml',PML+'slideMaster+xml'],['/ppt/slideLayouts/slideLayout1.xml',PML+'slideLayout+xml'],['/ppt/theme/theme1.xml','application/vnd.openxmlformats-officedocument.theme+xml'],['/ppt/presProps.xml',PML+'presProps+xml'],['/ppt/viewProps.xml',PML+'viewProps+xml'],['/ppt/tableStyles.xml',PML+'tableStyles+xml'],...slides.map((s,i)=>['/ppt/slides/slide'+(i+1)+'.xml',PML+'slide+xml'])])},
    {path:'_rels/.rels',content:docPackageRels('ppt/presentation.xml')},
    {path:'ppt/presentation.xml',content:presentation},
    {path:'ppt/_rels/presentation.xml.rels',content:docRels([{id:'rId1',type:NS_REL+'/slideMaster',target:'slideMasters/slideMaster1.xml'},{id:'rId2',type:NS_REL+'/theme',target:'theme/theme1.xml'},{id:'rId3',type:NS_REL+'/presProps',target:'presProps.xml'},{id:'rId4',type:NS_REL+'/viewProps',target:'viewProps.xml'},{id:'rId5',type:NS_REL+'/tableStyles',target:'tableStyles.xml'},...slides.map((s,i)=>({id:'rId'+(10+i),type:NS_REL+'/slide',target:'slides/slide'+(i+1)+'.xml'}))])},
    {path:'ppt/presProps.xml',content:XML_HEAD+'<p:presentationPr '+NS+'/>'},
    {path:'ppt/viewProps.xml',content:XML_HEAD+'<p:viewPr '+NS+'><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>'},
    {path:'ppt/tableStyles.xml',content:XML_HEAD+'<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>'},
    {path:'ppt/theme/theme1.xml',content:theme},
    {path:'ppt/slideMasters/slideMaster1.xml',content:master},
    {path:'ppt/slideMasters/_rels/slideMaster1.xml.rels',content:docRels([{id:'rId1',type:NS_REL+'/slideLayout',target:'../slideLayouts/slideLayout1.xml'},{id:'rId2',type:NS_REL+'/theme',target:'../theme/theme1.xml'}])},
    {path:'ppt/slideLayouts/slideLayout1.xml',content:layout},
    {path:'ppt/slideLayouts/_rels/slideLayout1.xml.rels',content:docRels([{id:'rId1',type:NS_REL+'/slideMaster',target:'../slideMasters/slideMaster1.xml'}])},
    ...slides.flatMap((s,i)=>[{path:'ppt/slides/slide'+(i+1)+'.xml',content:slideXml(s,i)},{path:'ppt/slides/_rels/slide'+(i+1)+'.xml.rels',content:docRels([{id:'rId1',type:NS_REL+'/slideLayout',target:'../slideLayouts/slideLayout1.xml'}])}]),
    {path:'docProps/core.xml',content:docCoreProps(title)},
    {path:'docProps/app.xml',content:DOC_APP_PROPS}
  ];
  return makeZip(files);
}

/* ---------- PDF ---------- */
/* Helvetica and Helvetica-Bold widths (Adobe core font metrics) for WinAnsi 32-255. */
const PDF_W_REG='278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500'.split(',').map(Number);
const PDF_W_BOLD='278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556'.split(',').map(Number);
const PDF_WIN={0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F};
function pdfCode(ch){ const c=ch.codePointAt(0); if(c>=32&&c<127) return c; if(c>=160&&c<=255) return c; return PDF_WIN[c]||0; }
/* Emoji, joiners and variation selectors are dropped; letters of other scripts need the image PDF. */
function pdfClean(text){ return String(text).replace(/[\u200B-\u200D\uFE0E\uFE0F]|\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]/gu,'').replace(/\u2192/g,'->').replace(/\u2190/g,'<-').replace(/[\u2713\u2714]/g,'v').replace(/[\u00A0\u2009\u202F]/g,' ').replace(/\u2212/g,'-'); }
function pdfNeedsImages(blocks){
  const all=blocks.map(b=>b.type==='table'?[b.header,...b.rows].flat().map(docRunsText).join(' '):b.type==='code'?b.text:docRunsText(b.runs||[])).join(' ');
  return [...pdfClean(all)].some(ch=>!pdfCode(ch)&&!/\s/.test(ch)&&!/[\u2000-\u206F\u2190-\u21FF\u2500-\u25FF]/.test(ch));
}
/* Lays the blocks out on A4 pages as drawing operations (y grows downwards, text at its
   baseline). measure(text, font, size) gives a width in points for the chosen output. */
function pdfLayout(blocks, measure){
  const PW=595.28, PH=841.89, M=56, CW=PW-2*M, BOTTOM=PH-60;
  const TEXT=[0.13,0.16,0.2], HEAD=[0.12,0.16,0.27], ACCENT=[0.31,0.27,0.9], LINE=[0.75,0.77,0.82], SOFT=[0.95,0.96,0.97], LINK=[0.15,0.39,0.92];
  const pages=[]; let ops=null, y=0;
  const newPage=()=>{ ops=[]; pages.push(ops); y=M; };
  newPage();
  const ensure=h=>{ if(y+h>BOTTOM&&y>M) newPage(); };
  const font=r=>({bold:!!r.bold,italic:!!r.italic,mono:!!(r.code||r.mono)});
  /* Breaks runs into lines no wider than width. */
  const wrap=(runs,size,width)=>{
    const lines=[]; let line=[], w=0;
    const push=()=>{ while(line.length&&line[line.length-1].text===' '){ w-=line.pop().w; } lines.push({frags:line,width:w}); line=[]; w=0; };
    for(const r of runs){
      String(r.text).split('\n').forEach((part,pi)=>{
        if(pi) push();
        for(const word of part.split(/(\s+)/)){
          if(!word) continue;
          const f=font(r);
          if(/^\s+$/.test(word)){ if(line.length){ const sw=measure(' ',f,size); line.push({text:' ',f,w:sw,r}); w+=sw; } continue; }
          let rest=word, ww=measure(rest,f,size);
          if(w+ww>width&&line.length) push();
          while(ww>width&&rest.length>1){ let k=rest.length-1; while(k>1&&measure(rest.slice(0,k),f,size)>width) k--; const piece=rest.slice(0,k); const pw=measure(piece,f,size); line.push({text:piece,f,w:pw,r}); w+=pw; push(); rest=rest.slice(k); ww=measure(rest,f,size); }
          if(rest){ line.push({text:rest,f,w:ww,r}); w+=ww; }
        }
      });
    }
    if(line.length||!lines.length) push();
    return lines;
  };
  const drawLine=(l,x,base,size,color,align,width)=>{
    let cx=x+(align==='right'?width-l.width:align==='center'?(width-l.width)/2:0);
    for(const fr of l.frags){
      if(fr.text!==' '){
        if(fr.r.code) ops.push({t:'rect',x:cx-1,y:base-size*0.8,w:fr.w+2,h:size*1.05,c:SOFT});
        ops.push({t:'text',x:cx,y:base,text:fr.text,f:fr.f,size,c:fr.r.link?LINK:color,link:fr.r.link||''});
        if(fr.r.link) ops.push({t:'line',x1:cx,y1:base+1.5,x2:cx+fr.w,y2:base+1.5,c:LINK,w:0.5});
        if(fr.r.strike) ops.push({t:'line',x1:cx,y1:base-size*0.3,x2:cx+fr.w,y2:base-size*0.3,c:color,w:0.6});
      }
      cx+=fr.w;
    }
  };
  const baseOf=(top,lh,size)=>top+(lh-size)/2+size*0.8;
  const paragraph=(runs,o)=>{
    const {size=11,color=TEXT,indent=0,before=0,after=7,lead=1.42,bar=false,marker=''}=o||{};
    const lh=size*lead, lines=wrap(runs,size,CW-indent);
    y+=before;
    lines.forEach((l,i)=>{
      ensure(lh);
      if(bar) ops.push({t:'rect',x:M+indent-12,y,w:2.5,h:lh,c:LINE});
      const base=baseOf(y,lh,size);
      if(i===0&&marker) ops.push({t:'text',x:M+indent-7-measure(marker,{},size),y:base,text:marker,f:{},size,c:ACCENT});
      drawLine(l,M+indent,base,size,color,'left',CW-indent);
      y+=lh;
    });
    y+=after;
  };
  const codeBlock=text=>{
    const size=9.5, lh=size*1.35, cw=measure('M',{mono:true},size)||size*0.6, max=Math.max(10,Math.floor((CW-14)/cw));
    const lines=[];
    for(const l of String(text).replace(/\n+$/,'').split('\n')){ if(!l.length){ lines.push(''); continue; } for(let i=0;i<l.length;i+=max) lines.push(l.slice(i,i+max)); }
    y+=3;
    lines.forEach((l,i)=>{
      ensure(lh);
      const first=i===0||y===M, last=i===lines.length-1;
      ops.push({t:'rect',x:M,y:y-(first?4:0),w:CW,h:lh+(first?4:0)+(last?4:0),c:SOFT});
      if(l) ops.push({t:'text',x:M+7,y:baseOf(y,lh,size),text:l,f:{mono:true},size,c:TEXT});
      y+=lh;
    });
    y+=14;
  };
  const table=b=>{
    const cols=Math.max(b.header.length,...b.rows.map(r=>r.length),1), size=cols>5?8.5:9.5, pad=4, lh=size*1.3;
    const natural=Array.from({length:cols},(_,i)=>Math.max(28,...[b.header,...b.rows].map(r=>measure(docRunsText(r[i]||[]),{bold:true},size)+pad*2)));
    const sum=natural.reduce((a,c)=>a+c,0);
    let widths;
    if(sum<=CW) widths=natural.map(w=>w*CW/sum);
    else{ const fair=CW/cols, small=natural.filter(w=>w<=fair), room=CW-small.reduce((a,c)=>a+c,0), bigSum=natural.filter(w=>w>fair).reduce((a,c)=>a+c,0); widths=natural.map(w=>w<=fair?w:w/bigSum*room); }
    const row=(cells,head)=>{ const lines=Array.from({length:cols},(_,i)=>wrap((cells[i]||[]).map(r=>head?{...r,bold:true}:r),size,widths[i]-pad*2)); return {lines,head,h:Math.max(...lines.map(l=>l.length))*lh+pad*2}; };
    const head=row(b.header,true);
    const draw=r=>{
      if(y+r.h>BOTTOM&&y>M){ newPage(); if(!r.head) draw(head); }
      let x=M;
      r.lines.forEach((ls,i)=>{
        ops.push({t:'rect',x,y,w:widths[i],h:r.h,c:r.head?[0.91,0.93,0.96]:[1,1,1],stroke:LINE});
        ls.forEach((l,k)=>drawLine(l,x+pad,baseOf(y+pad+k*lh,lh,size),size,TEXT,b.align[i],widths[i]-pad*2));
        x+=widths[i];
      });
      y+=r.h;
    };
    y+=2; ensure(head.h*2); draw(head); b.rows.forEach(r=>draw(row(r,false))); y+=12;
  };
  let firstH1=true;
  for(const b of blocks){
    if(b.type==='heading'){
      const cover=b.level===1&&firstH1; if(b.level===1) firstH1=false;
      const size=cover?22:[0,18,15,13,12][b.level];
      ensure(size*4);
      paragraph(b.runs.map(r=>({...r,bold:true})),{size,color:HEAD,before:cover||y===M?0:size*0.7,after:cover?12:5,lead:1.25});
      if(cover){ ops.push({t:'rect',x:M,y:y-6,w:40,h:2.5,c:ACCENT}); y+=8; }
    }
    else if(b.type==='para') paragraph(b.runs,b.quote?{color:[0.3,0.33,0.38],indent:14,bar:true}:{});
    else if(b.type==='item') paragraph(b.runs,{indent:20+b.level*16,after:3,marker:b.ordered?b.number+'.':['•','-','•','-','•','-'][b.level]});
    else if(b.type==='code') codeBlock(b.text);
    else if(b.type==='hr'){ ensure(18); y+=7; ops.push({t:'line',x1:M,y1:y,x2:M+CW,y2:y,c:LINE,w:0.8}); y+=10; }
    else if(b.type==='table') table(b);
  }
  return {pages,PW,PH,M};
}
function pdfFontOf(f){ return f&&f.mono?'mono':f&&f.bold&&f.italic?'bi':f&&f.bold?'b':f&&f.italic?'i':'r'; }
function pdfTextMeasure(text, f, size){
  if(f&&f.mono) return [...text].length*0.6*size;
  const table=f&&f.bold?PDF_W_BOLD:PDF_W_REG; let w=0;
  for(const ch of text){ const c=pdfCode(ch)||63; w+=table[c-32]||556; }
  return w*size/1000;
}
function pdfStr(text){ let s='('; for(const ch of text){ const c=pdfCode(ch)||63; s+=c===40||c===41||c===92?'\\'+String.fromCharCode(c):c<32||c>126?'\\'+c.toString(8).padStart(3,'0'):String.fromCharCode(c); } return s+')'; }
function pdfHexUtf16(text){ let h='FEFF'; for(const ch of String(text)){ const c=ch.codePointAt(0); const units=c>0xFFFF?[0xD800+((c-0x10000)>>10),0xDC00+((c-0x10000)&0x3FF)]:[c]; units.forEach(u=>h+=u.toString(16).padStart(4,'0').toUpperCase()); } return '<'+h+'>'; }
function pdfNum(n){ return (Math.round(n*100)/100).toString(); }
/* Writes PDF objects. Each page is either drawing ops (text PDF) or a JPEG (image PDF). */
function pdfAssemble(pages, layout, title, kind){
  const enc=new TextEncoder(), chunks=[], offsets=[]; let size=0;
  const add=b=>{ const u=typeof b==='string'?enc.encode(b):b; chunks.push(u); size+=u.length; };
  const objs=[];
  const obj=(body)=>{ objs.push(body); return objs.length; };
  const fontIds={r:obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),b:obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),i:obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'),bi:obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>'),mono:obj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>')};
  const pagesId=objs.length+1; objs.push(null);
  const pageIds=[];
  const {PW,PH}=layout;
  pages.forEach((p,pi)=>{
    let content='', annots=[], xobj='';
    if(kind==='image'){
      const img=obj({stream:p.jpeg,dict:'/Type /XObject /Subtype /Image /Width '+p.w+' /Height '+p.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'});
      xobj='/XObject << /Im1 '+img+' 0 R >>';
      content='q '+pdfNum(PW)+' 0 0 '+pdfNum(PH)+' 0 0 cm /Im1 Do Q\n';
    }else{
      for(const o of p){
        const Y=v=>pdfNum(PH-v);
        if(o.t==='rect') content+=(o.stroke?o.stroke.map(pdfNum).join(' ')+' RG 0.6 w ':'')+o.c.map(pdfNum).join(' ')+' rg '+pdfNum(o.x)+' '+Y(o.y+o.h)+' '+pdfNum(o.w)+' '+pdfNum(o.h)+' re '+(o.stroke?'B':'f')+'\n';
        else if(o.t==='line') content+=o.c.map(pdfNum).join(' ')+' RG '+pdfNum(o.w||0.8)+' w '+pdfNum(o.x1)+' '+Y(o.y1)+' m '+pdfNum(o.x2)+' '+Y(o.y2)+' l S\n';
        else if(o.t==='text'){
          content+='BT '+o.c.map(pdfNum).join(' ')+' rg /F'+pdfFontOf(o.f)+' '+pdfNum(o.size)+' Tf '+pdfNum(o.x)+' '+Y(o.y)+' Td '+pdfStr(o.text)+' Tj ET\n';
          if(o.link){ const w=pdfTextMeasure(o.text,o.f,o.size); annots.push(obj('<< /Type /Annot /Subtype /Link /Rect ['+pdfNum(o.x)+' '+Y(o.y+3)+' '+pdfNum(o.x+w)+' '+Y(o.y-o.size)+'] /Border [0 0 0] /A << /S /URI /URI '+pdfStr(o.link)+' >> >>')); }
        }
      }
      const label=(pi+1)+' / '+pages.length;
      content+='BT 0.6 0.62 0.66 rg /Fr 9 Tf '+pdfNum(PW/2-pdfTextMeasure(label,{},9)/2)+' 28 Td '+pdfStr(label)+' Tj ET\n';
    }
    const contentId=obj({stream:enc.encode(content),dict:''});
    const fonts='/Font << '+Object.entries(fontIds).map(([k,v])=>'/F'+k+' '+v+' 0 R').join(' ')+' >>';
    pageIds.push(obj('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 '+pdfNum(PW)+' '+pdfNum(PH)+'] /Resources << '+fonts+' '+xobj+' >> /Contents '+contentId+' 0 R'+(annots.length?' /Annots ['+annots.map(a=>a+' 0 R').join(' ')+']':'')+' >>'));
  });
  objs[pagesId-1]='<< /Type /Pages /Kids ['+pageIds.map(i=>i+' 0 R').join(' ')+'] /Count '+pageIds.length+' >>';
  const catalog=obj('<< /Type /Catalog /Pages '+pagesId+' 0 R >>');
  const d=new Date(), pad=n=>String(n).padStart(2,'0');
  const info=obj('<< /Title '+pdfHexUtf16(title)+' /Producer (Kita Chat) /Creator (Kita Chat) /CreationDate (D:'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds())+') >>');
  add('%PDF-1.4\n'); add(new Uint8Array([37,0xE2,0xE3,0xCF,0xD3,10]));
  objs.forEach((o,i)=>{
    offsets.push(size);
    if(o&&typeof o==='object'){ add((i+1)+' 0 obj\n<< '+o.dict+' /Length '+o.stream.length+' >>\nstream\n'); add(o.stream); add('\nendstream\nendobj\n'); }
    else add((i+1)+' 0 obj\n'+o+'\nendobj\n');
  });
  const xref=size;
  add('xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join(''));
  add('trailer\n<< /Size '+(objs.length+1)+' /Root '+catalog+' 0 R /Info '+info+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  const out=new Uint8Array(size); let at=0; for(const c of chunks){ out.set(c,at); at+=c.length; } return out;
}
/* Text in other scripts (Arabic, Chinese, Tamil…) is drawn by the phone's own fonts onto
   page images, so every language prints correctly (the text is then not selectable). */
async function pdfImagePages(layout){
  const scale=2, canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');
  canvas.width=Math.round(layout.PW*scale); canvas.height=Math.round(layout.PH*scale);
  const out=[];
  for(let i=0;i<layout.pages.length;i++){
    ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.setTransform(scale,0,0,scale,0,0);
    const rgb=c=>'rgb('+c.map(v=>Math.round(v*255)).join(',')+')';
    for(const o of layout.pages[i]){
      if(o.t==='rect'){ ctx.fillStyle=rgb(o.c); ctx.fillRect(o.x,o.y,o.w,o.h); if(o.stroke){ ctx.strokeStyle=rgb(o.stroke); ctx.lineWidth=0.6; ctx.strokeRect(o.x,o.y,o.w,o.h); } }
      else if(o.t==='line'){ ctx.strokeStyle=rgb(o.c); ctx.lineWidth=o.w||0.8; ctx.beginPath(); ctx.moveTo(o.x1,o.y1); ctx.lineTo(o.x2,o.y2); ctx.stroke(); }
      else if(o.t==='text'){ ctx.fillStyle=rgb(o.c); ctx.font=pdfCanvasFont(o.f,o.size); ctx.textBaseline='alphabetic'; ctx.fillText(o.text,o.x,o.y); }
    }
    const label=(i+1)+' / '+layout.pages.length; ctx.fillStyle='#999ea8'; ctx.font=pdfCanvasFont({},9); ctx.fillText(label,layout.PW/2-ctx.measureText(label).width/2,layout.PH-28);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.88));
    out.push({jpeg:new Uint8Array(await blob.arrayBuffer()),w:canvas.width,h:canvas.height});
  }
  return out;
}
function pdfCanvasFont(f,size){ return (f&&f.italic?'italic ':'')+(f&&f.bold?'bold ':'')+size+'px '+(f&&f.mono?'monospace':'sans-serif'); }
async function buildPdf(markdown, title){
  let blocks=docBlocks(markdown); title=title||docTitle(blocks);
  const images=pdfNeedsImages(blocks);
  const cleanRuns=runs=>runs.map(r=>({...r,text:pdfClean(r.text)}));
  if(!images) blocks=blocks.map(b=>b.type==='table'?{...b,header:b.header.map(cleanRuns),rows:b.rows.map(row=>row.map(cleanRuns))}:b.type==='code'?{...b,text:pdfClean(b.text)}:b.runs?{...b,runs:cleanRuns(b.runs)}:b);
  let measure=pdfTextMeasure;
  if(images){ const ctx=document.createElement('canvas').getContext('2d'); measure=(t,f,s)=>{ ctx.font=pdfCanvasFont(f,s); return ctx.measureText(t).width; }; }
  const layout=pdfLayout(blocks,measure);
  return pdfAssemble(images?await pdfImagePages(layout):layout.pages,layout,title,images?'image':'text');
}

/* ---------- making and saving ---------- */
async function buildDocument(format, markdown, title){
  if(format==='docx') return buildDocx(markdown,title);
  if(format==='xlsx') return buildXlsx(markdown,title);
  if(format==='pptx') return buildPptx(markdown,title);
  if(format==='pdf') return buildPdf(markdown,title);
  throw new Error('Unknown format '+format);
}
async function saveDocument(format, markdown, name, button){
  const meta=DOC_FORMATS[format];
  const title=docTitle(docBlocks(markdown),'Document');
  const file=docFileName(name,format,title);
  const label=button?button.textContent:'';
  if(button){ button.disabled=true; button.textContent='Making…'; }
  try{
    const bytes=await buildDocument(format,markdown,title);
    return saveBinaryFile(file,bytes,meta.mime,meta.label+' file saved');
  }catch(e){ toast('Could not make the '+meta.label+' file: '+(e.message||e)); return false; }
  finally{ if(button){ button.disabled=false; button.textContent=label; } }
}
/* Short description for a file card. */
function documentSummary(format, markdown){
  try{
    if(format==='xlsx'){ const s=xlsxSheets(markdown); const rows=s.reduce((n,x)=>n+x.rows.length,0); return s.length+' sheet'+(s.length===1?'':'s')+' · '+rows+' row'+(rows===1?'':'s'); }
    if(format==='pptx'){ const n=pptxSlides(markdown).length; return n+' slide'+(n===1?'':'s'); }
    const words=(String(markdown).match(/[\p{L}\p{N}]+/gu)||[]).length;
    return words.toLocaleString()+' word'+(words===1?'':'s');
  }catch(e){ return ''; }
}

/* ---------- chat UI ---------- */
const DOC_ICON={pdf:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 15h1.5a1.5 1.5 0 0 0 0-3H8v6"/>',
  docx:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13l1.5 5 1.5-4 1.5 4 1.5-5"/>',
  xlsx:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 12h8M8 16h8M12 12v7"/>',
  pptx:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><rect x="8" y="12" width="8" height="5" rx="1"/>'};
/* Fenced blocks named docx / xlsx / pptx / pdf become file cards. Returns the cards made. */
function renderDocumentCards(container){
  let made=0;
  container.querySelectorAll('pre > code').forEach(code=>{
    const info=String(code.className||'').replace(/language-/,'').trim().split(/\s+/).filter(Boolean);
    const format=docFormatOf(info[0]); if(!format) return;
    const pre=code.parentElement; if(pre.closest('.doc-card')) return;
    const markdown=code.textContent||'';
    const meta=DOC_FORMATS[format];
    const named=info.slice(1).find(p=>/\.[a-z0-9]{2,5}$/i.test(p))||'';
    const title=docTitle(docBlocks(markdown),'Document');
    const file=docFileName(named,format,title);
    const card=el('div','doc-card'); card.dataset.format=format;
    const top=el('div','doc-card-top');
    const ico=el('span','doc-card-icon doc-'+format); ico.setAttribute('aria-hidden','true');
    ico.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+DOC_ICON[format]+'</svg>';
    const text=el('div','doc-card-text');
    const nameEl=el('strong','doc-card-name'); nameEl.textContent=file;
    const sub=el('span','doc-card-sub'); sub.textContent=meta.kind+(markdown.trim()?' · '+documentSummary(format,markdown):'');
    text.append(nameEl,sub);
    const dl=el('button','doc-card-download','Download'); dl.type='button'; dl.setAttribute('aria-label','Download '+file);
    dl.onclick=()=>saveDocument(format,markdown,file,dl);
    top.append(ico,text,dl);
    const details=el('details','doc-card-source');
    const summary=el('summary',null,'Show content'); details.appendChild(summary);
    const src=el('pre'); src.textContent=markdown; details.appendChild(src);
    card.append(top,details);
    pre.replaceWith(card); made++;
  });
  return made;
}
/* "Download as…" in an answer's ⋯ menu. */
function documentMenuItems(msg){
  const source=String(msg?.content||'');
  const clean=typeof stripErrorNote==='function'?stripErrorNote(typeof extractThink==='function'?extractThink(source).content:source):source;
  if(!clean.trim()) return [];
  const base=docTitle(docBlocks(clean),(typeof conv!=='undefined'&&conv?.title)||'Kita Chat');
  const items=[['PDF','pdf'],['Word (.docx)','docx']];
  if(/^\s*\|.+\|\s*$/m.test(clean)) items.push(['Excel (.xlsx)','xlsx']);
  items.push(['PowerPoint (.pptx)','pptx']);
  return items.map(([label,format])=>[label,()=>saveDocument(format,clean,base)]);
}
/* Tells the model how to make files, only when the request is about one. */
function documentSystemNote(query){
  if(!/\b(pdf|docx?|word|excel|xlsx?|spreadsheet|sheet|powerpoint|pptx?|slides?|slaid|deck|hamparan|dokumen|document|laporan|report|resume|cv|invois|invoice|sebut\s*harga|quotation|bajet|budget)\b/i.test(String(query||''))) return '';
  return '\n\n[Files]\nKita can turn Markdown into downloadable files on the phone. When the user asks for a PDF, Word, Excel or PowerPoint file (or a document, report, sheet or slides they will download), put the whole file content in one fenced block whose info string is the format and a file name without spaces, for example ```docx Laporan-Jualan.docx, ```xlsx Bajet-2026.xlsx, ```pptx Pitch-Deck.pptx or ```pdf Invois-001.pdf. Kita shows it as a file card with a Download button, so never say you cannot create files and do not give conversion steps. '
    +'Inside the block write normal Markdown: headings, paragraphs, **bold**, lists and tables. Word and PDF: a full document, starting with a # title. Excel: one Markdown table per sheet, each after a ## heading that names the sheet; put plain numbers in cells (1200.50, 15%, RM 300), and formulas start with = using Excel cell references where row 1 is the header and data starts at row 2 (for example =SUM(B2:B6)). PowerPoint: # title and an optional short subtitle line for the cover, then one ## heading per slide with 3 to 6 short bullets, or a small table. '
    +'Outside the block, add at most one or two sentences.';
}
