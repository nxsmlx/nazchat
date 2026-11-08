const assert=require('node:assert/strict');const {launch,appUrl}=require('./browser');
(async()=>{const browser=await launch();try{const page=await browser.newPage();await page.route('https://raw.githubusercontent.com/**',r=>r.abort());await page.goto(appUrl,{waitUntil:'domcontentloaded',timeout:60000});
const result=await page.evaluate(async()=>{
const closed=[];window.NazStream={close:id=>closed.push(id)};
newAbortController();const signal=currentAbortSignal();const iterator=nativeSSE(901,signal);const started=performance.now();
const status=waitStreamStatus(901,signal).then(()=>false,e=>e.name==='AbortError');
window.nazStreamOnLine(901,'queued data');stopGeneration();window.nazStreamOnLine(901,'late data');
let aborted=false;try{await iterator.next();}catch(e){aborted=e.name==='AbortError';}
const waitingAborted=await status;
newAbortController();const ctl=abortCtl;let cancelled=false;const fakeFetch=window.fetch;window.fetch=(url,opts)=>new Promise((resolve,reject)=>{opts.signal.addEventListener('abort',()=>{cancelled=true;reject(cancellationError());},{once:true});});
const search=webSearch('neutral docs',{signal:ctl.signal});stopGeneration();await search;window.fetch=fakeFetch;
return {aborted,waitingAborted,closed,elapsed:performance.now()-started,cancelled};
});assert(result.aborted&&result.waitingAborted);assert(result.closed.includes(901));assert(result.elapsed<1000);assert(result.cancelled);console.log('PASS native pre-header Stop, queued/late-data rejection, search cancellation',result);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
