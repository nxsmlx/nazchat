/* Kita agent team (4.12.0). A long build in Code is done by agents with roles:
   Orchestrator (plan + shared contract), Designer (design system), Database (Supabase
   tables + RLS, only with approval), Coders (parts, in parallel), Tester (runs the
   page), Reviewer (finds real problems, part by part) and Fixer (rewrites only the
   parts with problems). Each role can use its own model. */
'use strict';

const AGENT_ROLES=[
  {id:'orchestrator',name:'Orchestrator',does:'Plans the build and fixes the shared contract'},
  {id:'designer',name:'Designer',does:'Sets colours, type, spacing and components'},
  {id:'database',name:'Database',does:'Designs Supabase tables and security rules'},
  {id:'coder',name:'Coders',does:'Write the parts at the same time'},
  {id:'reviewer',name:'Reviewer',does:'Reads the whole build and finds real problems'},
  {id:'fixer',name:'Fixer',does:'Rewrites only the parts with problems'},
];
function agentTeam(){
  const t=db.agentTeam&&typeof db.agentTeam==='object'?db.agentTeam:{};
  return {designer:t.designer!==false,review:t.review!==false,database:t.database!==false,models:t.models&&typeof t.models==='object'?t.models:{}};
}
function setAgentTeam(patch){const cur=db.agentTeam&&typeof db.agentTeam==='object'?db.agentTeam:{};db.agentTeam={...cur,...patch,models:{...(cur.models||{}),...(patch.models||{})}};save();}
/* Model for a role: the chosen provider/model, or the conversation's model. Only
   chat-completions providers can run agents (the build calls use that format). */
function agentModelChoices(){
  const out=[];
  for(const p of db.providers||[]){ if(p.apiType==='responses') continue; for(const m of p.selectedModels||[]) out.push({key:p.id+'::'+m,provider:p,modelId:m,label:p.name+' · '+prettyModel(m)}); }
  return out;
}
function agentModel(role,fallback){
  const key=agentTeam().models[role];
  if(key){const hit=agentModelChoices().find(c=>c.key===key);if(hit)return {provider:hit.provider,modelId:hit.modelId};}
  return fallback;
}
function agentUrl(model){const p=model.provider;return p.endpointMode==='full'?p.baseUrl:(p.baseUrl.replace(/\/+$/,'')+'/chat/completions');}
function agentLabel(model){return model?prettyModel(model.modelId):'';}
/* Team rows shown above the coders in the build status. */
function teamStep(msg,role,patch){
  msg.phases.team=Array.isArray(msg.phases.team)?msg.phases.team:[];
  let row=msg.phases.team.find(r=>r.role===role);
  if(!row){row={role,status:'pending',note:''};msg.phases.team.push(row);}
  Object.assign(row,patch);
  return row;
}
/* One non-tool agent call (streamed, with the per-part retry rules). */
async function agentCall(model,messages,opts={}){
  const body={model:model.modelId,messages,stream:true,temperature:opts.temperature??.4,top_p:1,max_tokens:opts.maxTokens||modelParameters(model).max_tokens};
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
    try{return String(await collectStream(model,agentUrl(model),body,{requireEnd:true,onDelta:opts.onDelta})).trim();}
    catch(e){
      if(e.name==='AbortError'||!generating||currentAbortSignal()?.aborted) throw e;
      last=e;const m=String(e.message||e);
      if(/\bHTTP 429\b/.test(m)){await abortableDelay(5000*(attempt+1));continue;}
      if(isInterruption(m)){if(navigator.onLine===false)await waitForOnline(OFFLINE_WAIT_MS);await abortableDelay(RECONNECT_DELAYS[attempt]||4000);continue;}
      throw e;
    }
  }
  throw last||new Error('Agent call failed');
}
function firstFence(text,langs){
  const re=new RegExp('```[ \\t]*(?:'+langs+')[^\\n]*\\n([\\s\\S]*?)```','i');const m=String(text||'').match(re);return m?m[1].trim():'';
}
/* Plan reply can name the data the app needs: "DATABASE: bookings, reviews" or "none". */
function planDatabaseNeed(planText){
  const m=String(planText||'').match(/^\s*(?:\*\*)?DATABASE(?:\*\*)?\s*:\s*(.+)$/im);
  if(!m) return '';
  const v=m[1].trim();
  return /^(none|tiada|no|n\/a|-)\b/i.test(v)?'':v.slice(0,300);
}

/* ---------- Designer ---------- */
async function runDesigner(msg,{model,task,contract,paint}){
  teamStep(msg,'designer',{status:'running',note:'Designing · '+agentLabel(model)});paint(msg);
  const out=await agentCall(model,[
    {role:'system',content:'You are the designer on a team of agents building one web page. Write a compact design system that every coder will share: CSS custom properties on :root (colours with good contrast, fonts, type scale, spacing, radius, shadows), base element styles, and reusable component classes (container, section, buttons, cards, form fields, navigation). Mobile first, accessible focus styles. Reply with one ```css block (at most 150 lines), then up to 8 short lines listing the class names and when to use them. No HTML.'},
    {role:'user',content:'Task: '+String(task).slice(0,1500)+(typeof codeStyleNote==='function'?codeStyleNote():'')+'\n\n[Shared contract]\n'+contract+'\n[End contract]'}],{temperature:.5});
  const css=firstFence(out,'css');
  const guide=out.replace(/```[\s\S]*?```/g,'').trim().slice(0,1200);
  if(!css){teamStep(msg,'designer',{status:'skipped',note:'No design system returned'});return null;}
  teamStep(msg,'designer',{status:'done',note:css.split('\n').length+' lines of shared styles'});
  return {css,guide};
}
function withDesignSystem(html,css){
  if(!css) return html;
  const tag='<style id="kita-design-system">\n'+css+'\n</style>';
  if(/<style id="kita-design-system">/.test(html)) return html;
  return /<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,m=>m+'\n'+tag):tag+'\n'+html;
}

/* ---------- Database ---------- */
async function runDatabaseAgent(msg,{model,task,need,contract,paint}){
  const st=supabaseProject();
  teamStep(msg,'database',{status:'running',note:'Designing tables for '+need});paint(msg);
  const out=await agentCall(model,[
    {role:'system',content:'You are the database agent for a Supabase (Postgres) project. Write the SQL the app needs: tables in the public schema with sensible types and timestamps, Row Level Security enabled on every table, and policies for the anon and authenticated roles that fit the app (public read only where the data is meant to be public; writes limited to what the page needs; per-user data tied to auth.uid()). Reuse existing tables when they fit. Use "create table if not exists". Never drop or delete anything. Reply with one ```sql block, then one line per table saying what it is for.'},
    {role:'user',content:'Task: '+String(task).slice(0,1500)+'\nData the plan needs: '+need+'\nExisting tables:\n'+(st?.schema||'(none)')+'\n\n[Shared contract]\n'+contract+'\n[End contract]'}],{temperature:.2});
  const sql=firstFence(out,'sql|pgsql|postgres|postgresql');
  if(!sql){teamStep(msg,'database',{status:'skipped',note:'No SQL returned'});return '';}
  if(sqlRisk(sql)==='destructive'){teamStep(msg,'database',{status:'skipped',note:'Refused: the SQL would delete data'});return '';}
  teamStep(msg,'database',{status:'waiting',note:'Waiting for your approval'});paint(msg);
  if(!await confirmSupabaseSql(sql,'The Database agent wants to set up these tables for the app.')){teamStep(msg,'database',{status:'skipped',note:'You declined; the app is built without new tables'});return '';}
  try{await supabaseQuery(sql);await supabaseRefreshSchema();}
  catch(e){teamStep(msg,'database',{status:'failed',note:String(e.message||e).slice(0,200)});return '';}
  const tables=(sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)||[]).length;
  teamStep(msg,'database',{status:'done',note:tables+' table'+(tables===1?'':'s')+' ready in '+st.projectName});
  return supabaseProject()?.schema||'';
}

/* ---------- Reviewer + Fixer ---------- */
function parseReview(text,n){
  const src=String(text||'');
  const raw=(src.match(/```(?:json)?\s*([\s\S]*?)```/)||[])[1]||(src.match(/\{[\s\S]*\}/)||[])[0]||'';
  let data=null;try{data=JSON.parse(raw);}catch(e){return [];}
  const list=Array.isArray(data)?data:Array.isArray(data?.issues)?data.issues:[];
  return list.map(x=>({part:Math.round(Number(x.part)),severity:/high/i.test(x.severity)?'high':/low/i.test(x.severity)?'low':'medium',problem:String(x.problem||x.issue||'').slice(0,400),fix:String(x.fix||'').slice(0,400)}))
    .filter(x=>x.part>=1&&x.part<=n&&x.problem).slice(0,10);
}
async function runReviewer(msg,{model,task,contract,errors,paint}){
  const parts=msg.phases.parts;
  teamStep(msg,'reviewer',{status:'running',note:'Reviewing '+parts.length+' parts · '+agentLabel(model)});paint(msg);
  const listing=parts.map((p,i)=>'### Part '+(i+1)+': '+p.title+'\n```\n'+String(p.text||'').slice(0,24000)+'\n```').join('\n\n');
  const out=await agentCall(model,[
    {role:'system',content:'You are the reviewer on a team of agents. The parts below were written by different coders at the same time and are assembled in order into one '+(msg.phases.kind==='html'?'HTML page':'document')+'. Find REAL problems only: JavaScript errors, ids or classes used but never defined, parts that break the shared contract, broken or duplicated layout, missing content the task asked for, forms or buttons that do nothing, and serious accessibility blockers. Do not report style preferences. Reply with JSON only: {"issues":[{"part":<number>,"severity":"high|medium|low","problem":"...","fix":"..."}]} with at most 8 issues, or {"issues":[]} when the build is sound.'},
    {role:'user',content:'Task: '+String(task).slice(0,1500)+'\n\n[Shared contract]\n'+contract+'\n[End contract]\n\n'+(errors.length?'[Errors when the page ran]\n'+errors.slice(0,10).join('\n')+'\n\n':'')+listing}],{temperature:.1,maxTokens:2048});
  const issues=parseReview(out,parts.length);
  const real=issues.filter(x=>x.severity!=='low');
  teamStep(msg,'reviewer',{status:'done',note:real.length?real.length+' issue'+(real.length===1?'':'s')+' to fix'+(issues.length>real.length?' · '+(issues.length-real.length)+' minor':''):'No problems found'});
  return issues;
}
async function runFixer(msg,{model,task,contract,issues,paint,save:saveNow}){
  const parts=msg.phases.parts,kind=msg.phases.kind;
  const byPart={};issues.filter(x=>x.severity!=='low').forEach(x=>{(byPart[x.part]=byPart[x.part]||[]).push(x);});
  const targets=Object.keys(byPart).map(Number).sort((a,b)=>a-b);
  if(!targets.length) return [];
  teamStep(msg,'fixer',{status:'running',note:'Fixing '+targets.map(i=>parts[i-1].title.split(/\s+[—–]\s+/)[0]).join(', ')});paint(msg);
  const fixed=[];
  await Promise.all(targets.map(async idx=>{
    const part=parts[idx-1];
    part.status='running';part.fixing=true;paint(msg);
    try{
      const out=await agentCall(model,[
        {role:'system',content:'You are the fixer on a team of agents. Rewrite ONE part of a larger build so the listed problems are gone, keeping everything that works and following the shared contract. '+(PHASE_KINDS[kind]||PHASE_KINDS.text).hint},
        {role:'user',content:'Task: '+String(task).slice(0,1200)+'\n\n[Shared contract]\n'+contract+'\n[End contract]\n\nPart '+idx+' of '+parts.length+': '+part.title+'\nOther parts: '+parts.map((p,i)=>(i+1)+'. '+p.title).join('; ')+'\n\n[Current part]\n```\n'+String(part.text||'')+'\n```\n\n[Problems to fix]\n'+byPart[idx].map(x=>'- ('+x.severity+') '+x.problem+(x.fix?' → '+x.fix:'')).join('\n')+'\n\nReturn the whole corrected part.'}],{temperature:.3});
      if(out&&out.length>Math.min(40,String(part.text||'').length/4)){part.text=out;part.lines=out.split('\n').length;part.fixed=(part.fixed||0)+1;fixed.push(idx);}
    }catch(e){ if(e.name==='AbortError'||!generating) throw e; }
    finally{part.status='done';delete part.fixing;paint(msg);}
  }));
  teamStep(msg,'fixer',{status:fixed.length?'done':'skipped',note:fixed.length?'Fixed '+fixed.length+' part'+(fixed.length===1?'':'s')+': '+fixed.map(i=>parts[i-1].title.split(/\s+[—–]\s+/)[0]).join(', '):'Could not fix the parts'});
  saveNow?.();
  return fixed;
}

/* ---------- Tester → Reviewer → Fixer → Tester ---------- */
async function runQualityLoop(msg,{model,task,kind,paint}){
  const team=agentTeam(),parts=msg.phases.parts;
  if(parts.some(p=>p.status!=='done')) return;
  msg.codeChecks=[];msg.phases.tested=false;
  const test=async label=>{
    if(kind!=='html'||db.autoCheckCode===false) return null;
    const doc=runnableHtml(msg.content);if(!doc) return null;
    teamStep(msg,'tester',{status:'running',note:label||'Running the page'});paint(msg);
    const errors=await checkHtmlRuns(doc);
    msg.codeChecks.push({round:msg.codeChecks.length+1,errors});msg.phases.tested=true;
    teamStep(msg,'tester',{status:errors.length?'failed':'done',note:(label?label+': ':'')+(errors.length?errors.length+' error'+(errors.length===1?'':'s')+' · '+errors[0]:'page runs without errors')});
    paint(msg);return errors;
  };
  try{
    const errors=await test()||[];
    if(!team.review||!generating) return;
    const contract=msg.phases.contract||'';
    let issues=[];
    try{issues=await runReviewer(msg,{model:agentModel('reviewer',model),task,contract,errors,paint});}
    catch(e){if(e.name==='AbortError'||!generating)throw e;teamStep(msg,'reviewer',{status:'failed',note:String(e.message||e).slice(0,160)});return;}
    msg.phases.review={issues,fixed:[]};
    if(!issues.some(x=>x.severity!=='low')||!generating) return;
    const fixed=await runFixer(msg,{model:agentModel('fixer',model),task,contract,issues,paint,save});
    msg.phases.review.fixed=fixed;
    if(fixed.length){assembleBuild(msg);save();paint(msg);await test('After fixes');}
  }catch(e){
    if(e.name!=='AbortError'&&generating) teamStep(msg,'reviewer',{status:'failed',note:String(e.message||e).slice(0,160)});
  }
}

/* ---------- Settings → Agent team ---------- */
function renderAgentTeamSettings(){
  renderSettingsPage('Agent team','',null,list=>{
    const team=agentTeam(),choices=agentModelChoices();
    list.appendChild(el('div','hint','Long builds in Code are done by a team. Give demanding roles (Orchestrator, Reviewer) a strong model and Coders a fast one to save cost. "Same as chat" uses the model of the conversation.'));
    const sw=(label,sub,on,set)=>{const row=el('div','tools-row');row.innerHTML='<span><strong>'+esc(label)+'</strong><small>'+esc(sub)+'</small></span>';const b=el('button','switch'+(on?' on':''));b.type='button';b.setAttribute('role','switch');b.setAttribute('aria-checked',String(on));b.setAttribute('aria-label',label);b.onclick=()=>{set(!on);renderAgentTeamSettings();};row.appendChild(b);return row;};
    const box=el('div','agent-team');
    box.appendChild(sw('Designer','Shared colours, type and components before the coders start',team.designer,v=>setAgentTeam({designer:v})));
    box.appendChild(sw('Reviewer and Fixer','Read the whole build, then rewrite only the parts with problems',team.review,v=>setAgentTeam({review:v})));
    box.appendChild(sw('Database','Set up Supabase tables and security when the app stores data (always asks first)',team.database,v=>setAgentTeam({database:v})));
    const coders=el('div','tools-row');coders.innerHTML='<span><strong>Coders at once</strong><small>More is faster but uses more tokens at the same time</small></span><span class="tools-row-actions"></span>';
    const cs=el('select');cs.setAttribute('aria-label','Coders at once');cs.innerHTML=[1,2,3,4].map(n=>'<option value="'+n+'"'+(n===agentConcurrency()?' selected':'')+'>'+n+'</option>').join('');cs.onchange=()=>{db.agentConcurrency=Number(cs.value);save();};
    coders.querySelector('.tools-row-actions').appendChild(cs);box.appendChild(coders);
    list.appendChild(box);
    list.appendChild(el('p','studio-section-title','Model for each role'));
    for(const r of AGENT_ROLES){
      const row=el('label','agent-role');row.dataset.role=r.id;
      row.innerHTML='<span><strong>'+esc(r.name)+'</strong><small>'+esc(r.does)+'</small></span>';
      const sel=el('select');sel.setAttribute('aria-label','Model for '+r.name);
      const cur=team.models[r.id]||'';
      sel.innerHTML='<option value="">Same as chat</option>'+choices.map(c=>'<option value="'+esc(c.key)+'"'+(c.key===cur?' selected':'')+'>'+esc(c.label)+'</option>').join('')+(cur&&!choices.some(c=>c.key===cur)?'<option value="'+esc(cur)+'" selected>Unavailable model (uses chat model)</option>':'');
      sel.onchange=()=>setAgentTeam({models:{[r.id]:sel.value}});
      row.appendChild(sel);list.appendChild(row);
    }
  });
}
