/* The work card: each stage of a team plan as one card in the chat, at the place the stage started, kept up to date as the team works. It shows
   the stage's tasks with who has each and when, what is happening now, what Chief decided without asking, Chief's question for the person, the
   stage's checks and its result with its files. A background task an agent started in its own chat gets a card of the same look from its steps.
   Everything is drawn from Buddy's records (the plan in the worker's status reply, each task's steps); the only things it sends are the
   person's own taps, through the buttons the plan's cards already use (buddy-plan.js). */
(function(root){
  'use strict';
  const Plan=root.BuddyPlan||(typeof require==='function'?require('./buddy-plan'):null);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stagesOf=plan=>Array.isArray(plan?.stages)?plan.stages:[];
  const tasksOf=stage=>Array.isArray(stage?.tasks)?stage.tasks:[];
  const noticesOf=plan=>Array.isArray(plan?.notices)?plan.notices:[];
  const short=(text,n)=>{const t=String(text||'').trim().replace(/\s+/g,' ');return t.length>n?t.slice(0,n-1).trimEnd()+'…':t;};
  const nameOf=(names,id)=>(typeof names==='function'?names(id):names?.[id])||'';
  const clock=at=>{const t=Date.parse(at||'');return Number.isFinite(t)?new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';};
  const finished=t=>['done','waived'].includes(t?.status);
  const safeId=v=>String(v||'').replace(/[^A-Za-z0-9_-]/g,'');
  // How long a teammate has been at it: "now" for under a minute, then minutes, then hours.
  function since(at,now=Date.now()){
    const ms=now-Date.parse(at||'');if(!Number.isFinite(ms)||ms<60000)return 'now';
    const m=Math.floor(ms/60000);if(m<60)return `for ${m} min`;
    const h=Math.floor(m/60);return `for ${h} hr${m%60?` ${m%60} min`:''}`;
  }

  // The stage a notice is about: its stage or task reference, an item key that names either, or the words it opens with ("Stage 2 is done",
  // "… The team is working on Stage 2 — …", "The team is stuck on Stage 2 — …").
  function stageOf(plan,notice){
    if(!notice||notice.kind==='proposal')return null;
    const stages=stagesOf(plan),refs=notice.refs&&typeof notice.refs==='object'?notice.refs:{};
    const byTask=id=>id?stages.find(s=>tasksOf(s).some(t=>t?.id===id)):null;
    let found=(refs.stageId&&stages.find(s=>s.id===refs.stageId))||byTask(refs.taskId);
    if(found)return found;
    for(const key of [refs.itemKey,...(Array.isArray(refs.itemKeys)?refs.itemKeys:[])].filter(k=>typeof k==='string'&&k)){
      found=stages.find(s=>s.id&&key.includes(s.id))||stages.find(s=>tasksOf(s).some(t=>t?.id&&key.includes(t.id)));
      if(found)return found;
    }
    const text=String(notice.text||''),n=Number(text.match(/working on Stage (\d+)\b/i)?.[1]||text.match(/stuck on Stage (\d+)\b/i)?.[1]||text.match(/^\s*Stage\s+(\d+)\b/i)?.[1]);
    return n?stages.find(s=>Number(s.n)===n)||null:null;
  }

  // Where each stage's card goes: the first of the chat's plan messages about that stage (its authorization, the line said when it started,
  // or for older chats whichever came first). Its later messages are shown in the card, not again on their own.
  const placed=new WeakMap();
  function place(messages,plans){
    const list=Array.isArray(messages)?messages:[],known=Array.isArray(plans)?plans:[];
    const hit=placed.get(list);if(hit&&hit.length===list.length&&hit.plans===known)return hit.map;
    const map=new Map(),seen=new Set();
    for(const m of list){
      if(!m?.planNotice||m.noticeKind==='proposal')continue;
      const plan=known.find(p=>p?.id===m.planId);if(!plan)continue;
      const notice=noticesOf(plan).find(n=>'plan-notice-'+n?.id===m.id)||{kind:m.noticeKind,text:m.body,refs:{}};
      const stage=stageOf(plan,notice);if(!stage||stage.status==='proposed')continue;
      const key=plan.id+':'+stage.id;map.set(m.id,{plan,stage,anchor:!seen.has(key)});seen.add(key);
    }
    placed.set(list,{length:list.length,plans:known,map});
    return map;
  }

  const questionsOf=(plan,stage)=>noticesOf(plan).filter(n=>n?.kind==='escalation'&&(n.status||'open')==='open'&&n.chat!==false&&stageOf(plan,n)?.id===stage.id);
  const stuckOf=(plan,stage)=>noticesOf(plan).filter(n=>n?.kind==='stuck'&&(n.status||'open')==='open'&&stageOf(plan,n)?.id===stage.id).at(-1)||null;
  const reportOf=(plan,stage)=>noticesOf(plan).filter(n=>n?.kind==='stage_report'&&stageOf(plan,n)?.id===stage.id).at(-1)||null;

  // The stage's state, from the plan alone: [key, chip label, tone].
  function stateOf(plan,stage){
    const tasks=tasksOf(stage);
    if(stage.status==='done')return ['done','Done','done'];
    if(stage.status==='superseded')return ['replaced','Replaced','idle'];
    if(plan.status!=='active')return ['stopped','Stopped','idle'];
    if(questionsOf(plan,stage).length||tasks.some(t=>!finished(t)&&t.blockedOn==='user'))return ['needs','Needs you','needs'];
    if(stuckOf(plan,stage))return ['stuck','Stuck','needs'];
    if(!tasks.length)return ['planning','Planning','review'];
    if(stage.status==='review')return ['review','Being checked','review'];
    if(stage.status==='approved')return ['ready','Up next','ready'];
    if(!tasks.some(t=>t.status==='dispatched')&&tasks.some(t=>t.status==='blocked'&&t.blockedOn==='paused'))return ['paused','Paused by you','idle'];
    return ['working','Working','working'];
  }

  const jobOf=(ctx,id)=>id&&typeof ctx.jobs==='function'?ctx.jobs(id)||null:null;
  const avatarOf=(ctx,id)=>typeof ctx.avatar==='function'?String(ctx.avatar(id)||''):'';
  const DOT={done:'done',working:'working',needs:'needs',retry:'retry',review:'review',ready:'waiting',idle:'waiting'};
  const workingSince=(plan,t)=>(Array.isArray(plan?.run?.working)?plan.run.working:[]).find(w=>w.agentId===t.assignee&&w.title===t.title)?.since||t.updatedAt;

  // What the supervisor (or Buddy) decided about a task without asking, with a way to say otherwise.
  function decisionLine(d,task,ctx){
    const who=d.by==='buddy'?'Buddy':nameOf(ctx.names,d.by)||ctx.sup;
    const said={answer:`${who} answered`,rework:`${who} sent it back`,waive:`${who} skipped it`,reassign:`${who} gave it to ${nameOf(ctx.names,d.choice)||'another teammate'}`}[d.kind];
    if(!said)return '';
    const what=['answer','rework'].includes(d.kind)?d.choice:d.rationale,why=['answer','rework'].includes(d.kind)?d.rationale:'';
    const asked=d.kind==='answer'&&String(d.question||'').trim()?` title="${esc(`Asked: ${short(d.question,300)}`)}"`:'';
    const choice=short(what,220),ended=why&&choice&&!/[.!?…]$/.test(choice)?choice+'.':choice;
    return `<p class="wc-decision"${asked}><b>${esc(said)}${what?':':''}</b>${what?` ${esc(ended)}`:''}${why?` <span class="wc-why">${esc(short(why,160))}</span>`:''} <button type="button" class="wc-link" data-work-change="${esc(short(task.title,80))}" data-work-who="${esc(who)}">Change</button></p>`;
  }
  // One task: its state, its title (with the steps it took on hover, focus or tap), what was decided about it, and who has it, when.
  function taskRow(plan,stage,t,ctx){
    const chip=Plan.taskChip(t,ctx.pulse,ctx.sup),dot=t.status==='waived'?'skipped':DOT[chip.tone]||'waiting';
    const name=nameOf(ctx.names,t.assignee)||'A teammate';
    const when=dot==='done'?clock(t.updatedAt):dot==='working'?since(workingSince(plan,t),ctx.now):['Waiting','Ready'].includes(chip.label)?'':chip.label;
    const job=jobOf(ctx,t.workerTaskId),steps=(Array.isArray(job?.trail)?job.trail:[]).filter(s=>String(s?.text||'').trim()).slice(-8);
    const result=finished(t)?String(t.resultSummary||'').trim():'',pop=`wc-pop-${safeId(t.id)}`,pinned=pins.has(t.id);
    const popHTML=steps.length||result?`<div class="wc-pop" role="tooltip" id="${pop}">${steps.length?`<p class="wc-pop-title">${esc(name)}’s steps</p><ol>${steps.map(s=>`<li><time>${esc(clock(s.at))}</time><span>${esc(short(s.text,200))}</span></li>`).join('')}</ol>`:''}${result?`<p class="wc-pop-title">Result</p><p class="wc-pop-result">${esc(short(result,400))}</p>`:''}</div>`:'';
    const title=popHTML?`<button type="button" class="wc-task" data-work-step="${esc(t.id)}" aria-expanded="${pinned}" aria-describedby="${pop}">${esc(t.title)}</button>`:`<span class="wc-task">${esc(t.title)}</span>`;
    const d=(Array.isArray(stage.decisions)?stage.decisions:[]).filter(x=>x?.taskId===t.id).at(-1);
    const code=job?.kind==='coding'&&job.code?.fileCount?`<p class="wc-code">${Number(job.code.fileCount)} ${Number(job.code.fileCount)===1?'file':'files'}, ${Number(job.code.added)||0} lines added · <button type="button" class="wc-link" data-chat-view="code">Open in Code</button></p>`:'';
    return `<li class="wc-row ${dot}${pinned?' pinned':''}" data-task="${esc(t.id)}"><span class="wc-dot" aria-hidden="true"></span><div class="wc-main">${title}<span class="sr-only">, ${esc(chip.label)}</span>${d?decisionLine(d,t,ctx):''}${code}</div><span class="wc-who">${esc(name)}${when?` · ${esc(when)}`:''}${avatarOf(ctx,t.assignee)}</span>${popHTML}</li>`;
  }
  // What is happening now, in one line, while the stage is planned, worked on or checked.
  function liveLine(stage,state,ctx){
    if(state==='planning')return `${ctx.sup} is planning this stage`;
    if(state==='review')return `${ctx.sup} is checking the stage against what done means`;
    if(state!=='working')return '';
    const live=tasksOf(stage).filter(t=>t.status==='dispatched'),retrying=live.filter(t=>Plan.taskChip(t,ctx.pulse,ctx.sup).tone==='retry'),busy=live.filter(t=>!retrying.includes(t));
    if(!busy.length)return retrying.length?`Retrying “${short(retrying[0].title,70)}”`:'';
    const t=busy[0],who=nameOf(ctx.names,t.assignee)||'A teammate',progress=String(jobOf(ctx,t.workerTaskId)?.progress||'').trim();
    return (progress?`${who}: ${short(progress,110)}`:`${who} is working on “${short(t.title,70)}”`)+(busy.length>1?` · ${busy.length-1} more at once`:'');
  }

  // The card for one stage. `ctx`: pulse, names, sup (the supervisor's name), jobs(id) → worker task, busy, replies (a question's reply form),
  // markdown(text), files(plan, stage) → saved files, filesHTML(files), avatar(id), now.
  function stageCard(plan,stage,ctx={}){
    ctx={sup:'Chief',now:Date.now(),...ctx};
    const [state,label,tone]=stateOf(plan,stage),tasks=tasksOf(stage),total=stagesOf(plan).length,key=`${plan.id}:${stage.id}`;
    const head=`<div class="wc-head"><div class="wc-head-text"><h3 class="wc-title">${esc(stage.title)}</h3><span class="wc-sub">Stage ${Number(stage.n)||1}${total?` of ${total}`:''} · <button type="button" class="wc-link" data-chat-view="plan">Whole plan</button></span></div><span class="wc-chip ${tone}">${esc(label)}</span></div>`;
    const folded=state==='done'&&!unfolded.has(key);
    const rows=tasks.length?`<ol class="wc-rows"${folded?' hidden':''} id="wc-rows-${safeId(key)}">${tasks.map(t=>taskRow(plan,stage,t,ctx)).join('')}</ol>`:'';
    const live=liveLine(stage,state,ctx);
    const acceptance=(Array.isArray(stage.acceptance)?stage.acceptance:[]).filter(a=>String(a||'').trim());
    const checks=['review','done'].includes(state)&&acceptance.length?`<ul class="wc-checks" aria-label="Done when">${acceptance.map(a=>`<li class="wc-check ${state==='done'?'ok':'run'}" title="${esc(a)}"><i aria-hidden="true"></i><span>${esc(short(a,80))}</span></li>`).join('')}</ul>`:'';
    // Chief's questions are the plan's own question cards, with their buttons and send path; a task held for the person points to where it waits.
    const questions=questionsOf(plan,stage),asked=new Set(questions.map(n=>n.refs?.taskId).filter(Boolean));
    const questionHTML=questions.map(n=>Plan.noticeCard(plan,{planNotice:true,noticeKind:'escalation',id:'plan-notice-'+n.id,body:n.text,whoName:ctx.sup},{busy:!!ctx.busy,reply:ctx.replies?.get?.(n.id)||null,markdown:ctx.markdown})?.html||'').join('');
    const held=tasks.filter(t=>!finished(t)&&t.blockedOn==='user'&&!asked.has(t.id));
    const heldHTML=held.length?`<div class="wc-ask"><p>${held.map(t=>`<strong>“${esc(short(t.title,80))}”</strong>`).join(', ')} ${held.length===1?'needs':'need'} you.</p><div class="wc-actions"><button type="button" class="primary-button" data-activity-open>See what needs you</button></div></div>`:'';
    const stuck=state==='stuck'?stuckOf(plan,stage):null;
    const stuckHTML=stuck?`<div class="wc-ask wc-stuck"><p>${esc(short(String(stuck.text||'').replace(/\s*(?:Tell me how to proceed|Say how to go on)\.?\s*$/,''),320))}</p><div class="wc-actions"><button type="button" class="border-button" data-plan-answer="chat">Tell ${esc(ctx.sup)}</button></div></div>`:'';
    let done='';
    if(state==='done'){
      const report=reportOf(plan,stage),parts=report?Plan.splitReport(report.text):null;
      const lead=parts?Plan.firstLine(parts.summary||parts.rows[0]?.text||parts.prose).first:'';
      const files=typeof ctx.files==='function'?ctx.files(plan,stage)||[]:[],filesHTML=files.length&&typeof ctx.filesHTML==='function'?ctx.filesHTML(files):'';
      const body=parts?(parts.rows.length?`<dl class="plan-card-rows">${parts.rows.map(r=>`<dt>${esc(r.label)}</dt><dd>${esc(r.text)}</dd>`).join('')}</dl>`:parts.prose?`<div class="reply-markdown">${typeof ctx.markdown==='function'?ctx.markdown(parts.prose):`<p>${esc(parts.prose)}</p>`}</div>`:''):'';
      done=`${lead?`<p class="wc-summary">${esc(lead)}</p>`:''}${filesHTML?`<div class="wc-files">${filesHTML}</div>`:''}${body?`<details class="plan-card-more"><summary>Report</summary><div class="plan-card-more-body">${body}</div></details>`:''}`;
    }
    const fold=state==='done'&&tasks.length?`<button type="button" class="wc-fold" data-work-fold="${esc(key)}" aria-expanded="${!folded}" aria-controls="wc-rows-${safeId(key)}">${tasks.length} ${tasks.length===1?'task':'tasks'}</button>`:'';
    const foot=state==='done'&&Plan.aheadLine?`<div class="wc-foot">${Plan.aheadLine(plan,stage,{busy:!!ctx.busy})}</div>`:'';
    return `<article class="plan-card work-card tone-${tone}" data-work-card="${esc(key)}" data-work-state="${state}" data-plan-card="${esc(plan.id)}">${head}${done}${checks}${fold}${rows}${live?`<p class="wc-live" role="status"><span class="wc-ring" aria-hidden="true"></span><span>${esc(live)}</span></p>`:''}${questionHTML}${heldHTML}${stuckHTML}${foot}</article>`;
  }

  // A plan message in the chat: the card of its stage when it is that stage's place, nothing when its stage's card is elsewhere in the chat,
  // and null (drawn as before) for anything else.
  function forMessage(m,messages,plans,ctx={}){
    if(!m?.planNotice)return null;
    const at=place(messages,plans).get(m.id);if(!at)return null;
    if(!at.anchor)return {hidden:true};
    return {label:`Stage ${Number(at.stage.n)||1}`,html:stageCard(at.plan,at.stage,ctx)};
  }

  // A background task an agent started from its own chat: its steps as rows, the newest live while it works, and the way to the whole task.
  const TASK={queued:['Queued','ready'],starting:['Working','working'],running:['Working','working'],stopping:['Stopping','working'],waiting_user:['Needs you','needs'],waiting_review:['Needs you','needs'],paused:['Paused','idle'],failed:['Didn’t finish','needs'],interrupted:['Didn’t finish','needs'],completed:['Done','done'],cancelled:['Cancelled','idle']};
  function taskCard(receipt,job,ctx={}){
    // A coding task with saved steps is drawn by the Code view (buddy-code.js): its lane graph, clashes, checks and the way in.
    if(job?.kind==='coding'&&job.code&&root.BuddyCode)return root.BuddyCode.card(receipt,job,{...root.BuddyCode.context?.(),names:ctx.names||root.BuddyCode.context?.().names});
    const [label,tone]=TASK[job?.status]||['Waiting','idle'],id=String(receipt?.id||job?.id||'');
    const steps=(Array.isArray(job?.trail)?job.trail:[]).filter(s=>String(s?.text||'').trim()).slice(-8);
    const last=tone==='working'?'working':tone==='needs'?'needs':'done';
    const rows=steps.length?`<ol class="wc-rows">${steps.map((s,i)=>`<li class="wc-row ${i===steps.length-1?last:'done'}"><span class="wc-dot" aria-hidden="true"></span><div class="wc-main"><span class="wc-task">${esc(short(s.text,200))}</span></div><span class="wc-who">${esc(clock(s.at))}</span></li>`).join('')}</ol>`:'';
    const progress=!steps.length?String(job?.progress||'').trim():'';
    const who=nameOf(ctx.names,job?.agentId),account=typeof receipt?.account==='string'&&receipt.account?`Uses ${receipt.account}`:'';
    const sub=[who,account].filter(Boolean).map(esc).join(' · ');
    return `<article class="plan-card work-card task-work-card tone-${tone}" data-work-task="${esc(id)}" data-work-state="${esc(job?.status||'')}"><div class="wc-head"><div class="wc-head-text"><h3 class="wc-title">${esc(receipt?.title||job?.title||'Background task')}</h3>${sub?`<span class="wc-sub">${sub}</span>`:''}</div><span class="wc-chip ${tone}">${esc(label)}</span></div>${rows}${progress?`<p class="wc-live" role="status">${tone==='working'?'<span class="wc-ring" aria-hidden="true"></span>':''}<span>${esc(short(progress,160))}</span></p>`:''}<div class="wc-actions"><button type="button" class="border-button" data-worker-task="${esc(id)}" aria-label="View task ${esc(receipt?.title||job?.title||'')}">View task</button></div></article>`;
  }
  // The tasks a reply started: a card for each one Buddy knows; one it no longer has keeps the plain receipt (`fallback`).
  function taskCards(tasks,ctx={},fallback=()=>''){
    return (Array.isArray(tasks)?tasks:[]).filter(t=>t&&typeof t.id==='string').map(t=>{const job=jobOf(ctx,t.id);return job?taskCard(t,job,ctx):fallback([t]);}).join('');
  }

  // What the cards in the chat show, in one value: a change in it draws the chat again. Elapsed times move on once a minute while work runs.
  function signature(plans,jobs){
    const parts=[];let working=false;
    for(const p of Array.isArray(plans)?plans:[]){
      if(!p)continue;
      parts.push([p.id,p.status,p.run?.state,p.run?.working,stagesOf(p).map(s=>[s.id,s.status,(s.decisions||[]).length,tasksOf(s).map(t=>{
        if(t.status==='dispatched')working=true;
        const job=typeof jobs==='function'?jobs(t.workerTaskId):null;
        return [t.id,t.status,t.blockedOn,t.workerStatus,t.updatedAt,job?.progress||'',(job?.trail||[]).length,job?.code?.updatedAt||''];
      })]),noticesOf(p).map(n=>[n.id,n.status])]);
    }
    return JSON.stringify([parts,working?Math.floor(Date.now()/60000):0]);
  }

  // Open steps (tapped) and unfolded finished stages, kept while the chat is drawn again.
  const pins=new Set(),unfolded=new Set();
  const api={stageOf,place,stateOf,stageCard,forMessage,taskCard,taskCards,signature,since};
  root.BuddyWorkCard=api;if(typeof module!=='undefined')module.exports=api;
  if(typeof document==='undefined')return;

  const snapshot=()=>root.BuddyWorkerUI?.snapshot?.()||{};
  const byId=new WeakMap();
  function jobs(){
    const list=Array.isArray(snapshot().tasks)?snapshot().tasks:[];
    let map=byId.get(list);if(!map){map=new Map(list.filter(t=>t?.id).map(t=>[t.id,t]));byId.set(list,map);}
    return id=>map.get(id)||null;
  }
  api.jobs=jobs;
  // A reply's background tasks are cards; the plain receipt stays for a task Buddy no longer has. What each card showed is kept, so a
  // status reply that brings a new step or state draws the chat again.
  const worker=root.BuddyWorkerUI,shown=new Map(),look=job=>job?JSON.stringify([job.status,job.progress||'',(job.trail||[]).length,job.code?.updatedAt||'']):'';
  if(worker&&typeof worker.taskReceipts==='function'){
    const receipts=worker.taskReceipts;
    worker.taskReceipts=tasks=>{
      const find=jobs();for(const t of Array.isArray(tasks)?tasks:[])if(t?.id)shown.set(t.id,look(find(t.id)));
      return taskCards(tasks,{jobs:find,names:id=>(typeof findAgent==='function'&&findAgent(id)?.name)||''},list=>receipts(list));
    };
  }
  root.addEventListener('buddy-worker-snapshot',()=>{
    if(typeof ui==='undefined'||ui.view?.kind!=='chat'||typeof refreshLiveChat!=='function')return;
    const target=ui.view.target,find=jobs();
    const moved=(state.messages?.[target]||[]).some(m=>Array.isArray(m?.tasks)&&m.tasks.some(t=>t?.id&&shown.has(t.id)&&shown.get(t.id)!==look(find(t.id))));
    if(moved)refreshLiveChat(target);
  });
  const reduce=()=>root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  document.addEventListener('click',e=>{
    // The plan's line above the composer brings its stage's card into view when the chat has it out of sight; otherwise (no card, or the
    // card already in view) it opens the plan view as before.
    const strip=e.target.closest?.('[data-stage-strip]');
    if(strip){
      const plan=(snapshot().plans||[]).find(p=>p?.id===strip.dataset.stageStrip),stage=plan&&Plan.currentStage(plan);
      const card=stage&&document.querySelector(`#chat-body [data-work-card="${CSS.escape(plan.id+':'+stage.id)}"]`),body=document.getElementById('chat-body');
      if(!card||!body)return;
      const box=card.getBoundingClientRect(),view=body.getBoundingClientRect();
      if(box.top>=view.top-1&&box.bottom<=view.bottom+1)return;
      e.preventDefault();e.stopImmediatePropagation();
      card.scrollIntoView({block:'nearest',behavior:reduce()?'auto':'smooth'});
      card.classList.remove('flash');void card.offsetWidth;card.classList.add('flash');
      return;
    }
    const step=e.target.closest?.('[data-work-step]');
    if(step){
      const id=step.dataset.workStep,on=!pins.has(id);if(on)pins.add(id);else pins.delete(id);
      step.setAttribute('aria-expanded',String(on));step.closest('.wc-row')?.classList.toggle('pinned',on);
      return;
    }
    const fold=e.target.closest?.('[data-work-fold]');
    if(fold){
      const key=fold.dataset.workFold,open=!unfolded.has(key);if(open)unfolded.add(key);else unfolded.delete(key);
      fold.setAttribute('aria-expanded',String(open));const rows=document.getElementById(fold.getAttribute('aria-controls'));if(rows)rows.hidden=!open;
      return;
    }
    // Change: a message to Chief that names the decision, in the person's own words.
    const change=e.target.closest?.('[data-work-change]');
    if(change){
      root.BuddyProjectDock?.show?.('chat');
      const input=document.getElementById('message-input');if(!input)return;
      const lead=`About ${change.dataset.workWho||'Chief'}’s decision on “${change.dataset.workChange}”: `;
      if(!input.value.startsWith(lead))input.value=lead+input.value;
      input.dispatchEvent(new Event('input'));input.focus();input.setSelectionRange(input.value.length,input.value.length);
    }
  },true);
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||!pins.size)return;
    pins.clear();for(const row of document.querySelectorAll('.wc-row.pinned')){row.classList.remove('pinned');row.querySelector('[data-work-step]')?.setAttribute('aria-expanded','false');}
  });
})(typeof globalThis!=='undefined'?globalThis:this);
