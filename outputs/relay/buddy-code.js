/* The Code view: a coding task's work drawn from its `code` record (BuddyCodeHistory on the Mac): in the chat, a card with a lane graph
   (your folder and the agent's copy, newest at the top) or a five-stop progress bar, what clashes with your folder, the checks, and the
   button to bring the work in; in the chat's Code tab, every copy at work with its progress, history, changed files, one file's change on
   request, and checks. The only things it sends are the person's own taps: compare again, bring in with their choices, ask the agent to
   combine, ask it to send the work to GitHub, and a file's change to read. */
(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const short=(text,n)=>{const t=String(text||'').trim().replace(/\s+/g,' ');return t.length>n?t.slice(0,n-1).trimEnd()+'…':t;};
  const nameOf=(names,id)=>(typeof names==='function'?names(id):names?.[id])||'';
  const base=p=>String(p||'').split('/').pop();
  const plural=(n,one,many=one+'s')=>`${n} ${n===1?one:many}`;
  function ago(at,now=Date.now()){
    const t=Date.parse(at||'');if(!Number.isFinite(t))return '';
    const m=Math.round((now-t)/60000);if(m<1)return 'now';if(m<60)return `${m} min`;
    const h=Math.floor(m/60);if(h<24)return `${h} hr`;
    return new Date(t).toLocaleDateString([],{month:'short',day:'numeric'});
  }
  const running=job=>['queued','starting','running','stopping'].includes(job?.status);
  const codeOf=job=>job&&typeof job.code==='object'&&job.code?job.code:null;
  const stepsOf=code=>Array.isArray(code?.steps)?code.steps:[];
  // The compare still describes the copy as it is: made after the newest step.
  const freshCompare=code=>{const c=code?.compare;return c&&!c.stale&&(!code.head||!c.head||c.head===code.head)?c:null;};
  const broughtIn=code=>{const b=code?.broughtIn,c=freshCompare(code);return b&&(!c||(c.bring||[]).length===0)?b:null;};

  // ---- the lane graph: one lane per side, newest at the top; a copy curves out of your folder where it started and back in when brought in.
  // rows: {lane:'you'|'agent', kind: step|edit|base|next|in, text, meta, from (row of your edit taken in), clash (row it clashes with), clashing}
  function lanes(rows,{rh=44,gap=28,agentColor='var(--info)',agentName='The agent',keyed=true}={}){
    if(!rows.length)return '';
    const X={you:14,agent:14+gap},color=lane=>lane==='you'?'var(--code-you)':agentColor,y=i=>i*rh+rh/2,W=14*2+gap+6,H=rows.length*rh;
    let at=rows.findIndex(r=>r.kind==='base');if(at<0)at=rows.length-1;
    let svg=`<line x1="${X.you}" y1="${y(0)}" x2="${X.you}" y2="${y(at)}" stroke="var(--code-you)" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>`;
    const mine=rows.map((r,i)=>r.lane==='agent'?i:-1).filter(i=>i>=0);
    if(mine.length){
      const top=Math.min(...mine),startY=y(at)-rh*.62,A=X.agent;
      svg+=`<rect x="${A-10}" y="${y(top)-12}" width="20" height="${Math.max(0,startY-y(top)+12)}" rx="10" fill="${agentColor}" opacity=".12"/>`;
      svg+=`<path d="M${X.you} ${y(at)} C ${X.you} ${y(at)-rh*.35}, ${A} ${y(at)-rh*.3}, ${A} ${startY} L ${A} ${y(top)}" fill="none" stroke="${agentColor}" stroke-width="2.5" stroke-linecap="round"/>`;
    }
    rows.forEach((r,i)=>{
      if(r.from!=null)svg+=`<path d="M${X.you} ${y(r.from)} C ${X.you} ${y(r.from)-rh*.5}, ${X.agent} ${y(i)+rh*.5}, ${X.agent} ${y(i)}" fill="none" stroke="var(--warn)" stroke-width="2.5" stroke-linecap="round"/>`;
      if(r.clash!=null)svg+=`<path d="M${X.you} ${y(i)} L ${X.agent} ${y(r.clash)}" fill="none" stroke="var(--warn)" stroke-width="2" stroke-dasharray="4 3"/>`;
      if(r.kind==='in'||r.kind==='next'){const src=rows.findIndex((q,j)=>j>i&&q.lane==='agent');if(src>=0)svg+=`<path d="M${X.agent} ${y(src)} C ${X.agent} ${y(src)-rh*.5}, ${X.you} ${y(i)+rh*.5}, ${X.you} ${y(i)}" fill="none" stroke="${r.kind==='in'?'var(--ok)':'var(--line-strong)'}" stroke-width="2.5" stroke-linecap="round"${r.kind==='next'?' stroke-dasharray="4 4"':''}/>`;}
    });
    rows.forEach((r,i)=>{
      const x=X[r.lane],cy=y(i);
      if(r.kind==='step')svg+=`<circle cx="${x}" cy="${cy}" r="6" fill="${color(r.lane)}" stroke="var(--card)" stroke-width="2.5"/>`;
      else if(r.kind==='edit')svg+=`<rect x="${x-6}" y="${cy-6}" width="12" height="12" rx="2" transform="rotate(45 ${x} ${cy})" fill="${r.clashing?'var(--warn)':'var(--code-you)'}" stroke="var(--card)" stroke-width="2.5"/>`;
      else if(r.kind==='base')svg+=`<circle cx="${x}" cy="${cy}" r="6" fill="var(--card)" stroke="var(--code-you)" stroke-width="2.5"/>`;
      else if(r.kind==='next')svg+=`<circle cx="${x}" cy="${cy}" r="7" fill="var(--card)" stroke="var(--text3)" stroke-width="2" stroke-dasharray="3 3"/>`;
      else if(r.kind==='in')svg+=`<circle cx="${x}" cy="${cy}" r="8" fill="var(--ok)" stroke="var(--card)" stroke-width="2.5"/><path d="M${x-3.5} ${cy} l2.5 2.5 l4.5 -5" fill="none" stroke="var(--card)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    });
    const list=rows.map(r=>`<li class="lg-row ${r.kind}${r.clashing?' clash':''}" title="${esc(r.text)}"><b>${esc(r.text)}</b><small>${r.meta||''}</small></li>`).join('');
    const sw=c=>`<svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`;
    const key=keyed?`<p class="lg-key"><span>${sw('var(--code-you)')}Your folder</span><span>${sw(agentColor)}${esc(agentName)}’s copy</span><span><svg width="12" height="12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5" transform="rotate(45 6 6)" fill="var(--code-you)"/></svg>Your edits</span><span>${sw('var(--warn)')}Your edits meet ${esc(agentName)}’s</span><span>${sw('var(--ok)')}Brought into your folder</span></p>`:'';
    return `<div class="lg" style="--rh:${rh}px"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lane graph of your folder and ${esc(agentName)}’s copy, newest at the top">${svg}</svg><ol class="lg-rows" style="padding-left:${W}px">${list}</ol></div>${key}`;
  }

  // ---- the progress bar: five stops in order, each with what happened there.
  const STOPS=['Copied your files','Made changes','Compared with your folder','Checked','In your folder'];
  function journey(states,details){
    return `<ol class="journey">${STOPS.map((label,i)=>`<li class="stop ${states[i]||'next'}"><span class="dot" aria-hidden="true"></span><b>${esc(label)}</b><small>${esc(details[i]||'')}</small></li>`).join('')}</ol>`;
  }
  function stops(job,now=Date.now()){
    const code=codeOf(job)||{},steps=stepsOf(code),copies=steps.filter(s=>s.kind==='copy'),work=steps.filter(s=>!['copy','in','combine'].includes(s.kind)&&s.author!=='you');
    const compare=freshCompare(code),checks=Array.isArray(code.checks)?code.checks:[],brought=broughtIn(code),busy=running(job);
    const clashes=(compare?.clashes||[]).length,failing=checks.filter(c=>c.ok===false),checking=checks.some(c=>c.ok==null);
    const oldest=copies.at(-1);
    const s=['done',busy?'now':work.length?'done':'next',busy||!compare?'next':clashes?'needs':'done',checking?'now':failing.length?'needs':checks.length?'done':'next',brought?'done':!busy&&compare&&compare.ready?'needs':'next'];
    const d=[oldest?`${short(oldest.message.replace(/^Copied /,''),36)}`:'Started empty',work.length?plural(work.length,'step')+' saved':busy?'Starting':'',
      !compare?'':clashes?plural(clashes,'clash','clashes')+' with your edits':(compare.combined||[]).length?`Your edits combined in ${plural(compare.combined.length,'file')}`:'Nothing clashes',
      checking?'Running':failing.length?`${failing[0].label}: ${failing[0].summary}`:checks.length?(checks.every(c=>c.ok)?`All ${checks.length} pass`:''):'None run',
      brought?`${plural((brought.files||[]).length,'file')}, ${ago(brought.at,now)}`:!busy&&compare?.ready?'Your tap':''];
    return {states:s,details:d};
  }
  // The rows of a copy's lane graph: what comes next or came in, the steps (your edits on your lane, the agent's on its own), and where it began.
  function laneRows(job,{names,now=Date.now(),agentName='The agent'}={}){
    const code=codeOf(job)||{},steps=stepsOf(code),compare=freshCompare(code),brought=broughtIn(code),folder=code.folderName||'your folder',rows=[];
    const who=s=>s.author==='you'?'You':s.author==='buddy'?'Buddy':nameOf(names,s.author)||s.name||agentName;
    const meta=s=>esc([who(s),ago(s.at,now),s.fileCount?plural(s.fileCount,'file'):''].filter(Boolean).join(' · '));
    if(!running(job)&&compare?.ready&&!brought)rows.push({lane:'you',kind:'next',text:`Next: bring into ${folder}`,meta:'Waits for your tap'});
    if(!running(job)&&(compare?.clashes||[]).length)rows.push({lane:'you',kind:'edit',clashing:true,text:`Your folder changed: ${plural(compare.clashes.length,'clash','clashes')}`,meta:esc(compare.clashes.slice(0,3).map(c=>base(c.to||c.path)).join(', '))});
    const oldestCopy=steps.map(s=>s.kind).lastIndexOf('copy');
    steps.forEach((s,i)=>{
      if(s.kind==='in')rows.push({lane:'you',kind:'in',text:s.message,meta:meta(s)});
      else if(i===oldestCopy)rows.push({lane:'you',kind:'base',text:`${agentName} ${s.message.replace(/^Copied/,'copied')}`,meta:esc(ago(s.at,now))});
      else if(s.kind==='combine'&&s.author==='you')rows.push({lane:'you',kind:'edit',text:s.message,meta:meta(s)});
      else rows.push({lane:'agent',kind:'step',text:s.message,meta:meta(s)});
    });
    if(!rows.some(r=>r.kind==='base'))rows.push({lane:'you',kind:'base',text:`${agentName} started a new copy`,meta:''});
    // Your edits taken in reach the agent's next step above them; a clash points at its newest step.
    rows.forEach((r,i)=>{if(r.kind==='edit'&&!r.clashing){const up=rows.slice(0,i).map((q,j)=>q.lane==='agent'?j:-1).filter(j=>j>=0).pop();if(up!=null)rows[up].from=i;}});
    const clash=rows.findIndex(r=>r.clashing),top=rows.findIndex(r=>r.lane==='agent');if(clash>=0&&top>=0)rows[clash].clash=top;
    return rows;
  }
  function status(job){
    const code=codeOf(job)||{},compare=freshCompare(code);
    if(running(job))return job.status==='queued'?['Queued','ready']:['Working','working'];
    if(['waiting_user','waiting_review'].includes(job?.status))return ['Needs you','needs'];
    if((compare?.clashes||[]).length)return ['Needs you','needs'];
    if(broughtIn(code))return ['In your folder','done'];
    if(compare?.ready)return ['Ready for you','review'];
    if(['failed','interrupted'].includes(job?.status))return ['Didn’t finish','needs'];
    if(job?.status==='paused')return ['Paused','idle'];
    return job?.status==='completed'?['Done','done']:['Waiting','idle'];
  }
  const checksHTML=checks=>Array.isArray(checks)&&checks.length?`<ul class="code-checks">${checks.map(c=>`<li class="code-check ${c.ok==null?'run':c.ok?'ok':'bad'}" title="${esc(c.detail||'')}"><i aria-hidden="true"></i><span>${esc(c.label)}: ${esc(c.summary||'')}</span></li>`).join('')}</ul>`:'';
  // What clashes with your folder, side by side, with a choice for each.
  function clashHTML(job,agentName){
    const compare=freshCompare(codeOf(job));const list=compare?.clashes||[];if(!list.length||running(job))return '';
    const picked=choices.get(job.id)||{},id=esc(job.id);
    const why={gone:'You moved or removed this file since the copy.',exists:'Your folder has a different file with this name.',lines:'You and '+agentName+' changed the same lines.'};
    return `<div class="code-clashes"><h4>${plural(list.length,'clash','clashes')} with your folder</h4>${list.map(c=>{
      const hunk=(c.hunks||[])[0],path=esc(c.path),choice=picked[c.path]||'';
      return `<div class="code-clash"><p class="code-clash-where"><b>${esc(base(c.to||c.path))}</b><small>${esc(c.to||c.path)}${hunk?`, line ${Number(hunk.line)||1}`:''}</small></p><p class="code-clash-why">${esc(why[c.kind]||why.lines)}</p>${hunk?`<div class="code-sides"><div><span>Yours</span><pre>${esc(short(hunk.yours,240)||'(empty)')}</pre></div><div><span>${esc(agentName)}’s</span><pre>${esc(short(hunk.agent,240)||'(empty)')}</pre></div></div>`:''}<div class="code-choice" role="radiogroup" aria-label="Which to keep in ${path}"><label><input type="radio" name="code-${id}-${path}" data-code-choice="${id}" data-path="${path}" value="yours"${choice==='yours'?' checked':''}> Keep yours</label><label><input type="radio" name="code-${id}-${path}" data-code-choice="${id}" data-path="${path}" value="agent"${choice==='agent'?' checked':''}> Use ${esc(agentName)}’s</label></div></div>`;}).join('')}</div>`;
  }
  // The buttons, the main one at the bottom right: what the person can do now.
  function actionsHTML(job,{agentName,folder,busy=false,tab=false}={}){
    const code=codeOf(job)||{},compare=freshCompare(code),id=esc(job.id),off=busy?' disabled':'',view=tab?'':`<button type="button" class="border-button" data-worker-task="${id}">View task</button>`;
    if(running(job))return view?`<div class="code-actions">${view}</div>`:'';
    const clashes=compare?.clashes||[];
    if(clashes.length){
      const picked=choices.get(job.id)||{},all=clashes.every(c=>['yours','agent'].includes(picked[c.path]));
      const combine=clashes.some(c=>c.kind==='lines')?`<button type="button" class="border-button" data-code-act="combine" data-task="${id}"${off}>Ask ${esc(agentName)} to combine</button>`:'';
      return `<div class="code-actions"><button type="button" class="primary-button" data-code-act="bring" data-task="${id}"${all&&!busy?'':' disabled'}>Bring in with these choices</button>${combine}${view}</div>`;
    }
    if(compare?.ready&&!broughtIn(code))return `<div class="code-actions"><button type="button" class="primary-button" data-code-act="bring" data-task="${id}"${off}>Bring into ${esc(folder)}</button><button type="button" class="border-button" data-code-act="compare" data-task="${id}"${off}>Compare again</button>${view}</div>`;
    if(broughtIn(code))return `<div class="code-actions"><button type="button" class="border-button" data-code-act="github" data-task="${id}"${off}>Send to GitHub</button>${tab?'':`<button type="button" class="border-button" data-chat-view="code">Open in Code</button>`}${view}</div>`;
    if(stepsOf(code).length&&!compare)return `<div class="code-actions"><button type="button" class="primary-button" data-code-act="compare" data-task="${id}"${off}>Compare with your folder</button>${view}</div>`;
    return view?`<div class="code-actions">${view}</div>`:'';
  }
  // The lane colour of an agent: its figure's ink, in the theme shown.
  function agentColor(agent){
    const F=root.BuddyFigures,ink=F?.INK,id=agent&&F?.normColor?F.normColor(agent.avatarColor):'';
    if(!ink||!ink[id])return 'var(--info)';
    const dark=typeof document!=='undefined'&&(document.documentElement.dataset.theme==='dark'||!document.documentElement.dataset.theme&&root.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
    return ink[id][dark?1:0];
  }
  // The chat's card for a coding task. `ctx`: names, agents (id → agent), busy, now.
  function card(receipt,job,ctx={}){
    const code=codeOf(job);if(!code)return '';
    const agent=ctx.agents?.(job.agentId),agentName=agent?.name||nameOf(ctx.names,job.agentId)||'The agent',folder=code.folderName||'your folder';
    const [label,tone]=status(job),mode=modes.get(job.id)||'lanes',now=ctx.now||Date.now();
    const visual=mode==='bar'?(()=>{const j=stops(job,now);return journey(j.states,j.details);})():lanes(laneRows(job,{names:ctx.names,now,agentName}),{agentColor:agentColor(agent),agentName,keyed:false});
    const toggle=`<div class="code-mode" role="group" aria-label="Show the work as"><button type="button" data-code-mode="lanes" data-task="${esc(job.id)}" aria-pressed="${mode==='lanes'}">Lane graph</button><button type="button" data-code-mode="bar" data-task="${esc(job.id)}" aria-pressed="${mode==='bar'}">Progress bar</button></div>`;
    const sub=[`${agentName}’s copy of ${folder}`,code.fileCount?`${plural(code.fileCount,'file')}, ${Number(code.added)||0} lines added`:''].filter(Boolean).join(' · ');
    const live=running(job)&&String(job.progress||'').trim()?`<p class="wc-live" role="status"><span class="wc-ring" aria-hidden="true"></span><span>${esc(short(job.progress,140))}</span></p>`:'';
    return `<article class="plan-card work-card code-card tone-${tone}" data-code-card="${esc(job.id)}" data-work-task="${esc(job.id)}"><div class="wc-head"><div class="wc-head-text"><h3 class="wc-title">${esc(receipt?.title||job.title||'Coding task')}</h3><span class="wc-sub">${esc(sub)}</span></div><span class="wc-chip ${tone}">${esc(label)}</span></div>${toggle}${visual}${live}${clashHTML(job,agentName)}${checksHTML(code.checks)}${actionsHTML(job,{agentName,folder,busy:ctx.busy})}</article>`;
  }

  // ---- the Code tab
  // The coding tasks of a chat: its agent's, or its group's members', newest first, those with saved steps.
  function tasksFor(state,target,tasks){
    const group=(state?.groups||[]).find(g=>g.id===target),who=new Set(group?group.members:[target]);
    return (Array.isArray(tasks)?tasks:[]).filter(t=>t?.kind==='coding'&&who.has(t.agentId)&&stepsOf(codeOf(t)).length).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  }
  const KIND={new:['New','new'],changed:['Changed','changed'],removed:['Removed','removed']};
  function filesHTML(job,selected){
    const code=codeOf(job)||{},clashed=new Set((freshCompare(code)?.clashes||[]).map(c=>c.path));
    const list=Array.isArray(code.files)?code.files:[];
    if(!list.length)return '<p class="code-empty">No files changed yet.</p>';
    return `<ul class="code-files">${list.map(f=>{const [label,cls]=clashed.has(f.path)?['Clashes','clash']:KIND[f.status]||KIND.changed;const a=Number(f.added)||0,d=Number(f.removed)||0,t=a+d,w=Math.min(42,Math.max(4,Math.round(Math.sqrt(t)*3)));
      return `<li><button type="button" class="code-file" data-code-file="${esc(f.path)}" data-task="${esc(job.id)}" aria-pressed="${f.path===selected}"><span class="code-file-name"><b>${esc(f.note?short(f.note,60):base(f.path))} <span class="tag ${cls}">${label}</span></b><small>${esc(f.path)}</small></span><span class="size">${f.binary?'binary':`<span class="meter" style="width:${w}px"><i style="width:${t?Math.round(100*a/t):0}%"></i><i class="d" style="width:${t?Math.round(100*d/t):0}%"></i></span>${a} added${d?`, ${d} removed`:''}`}</span></button></li>`;}).join('')}</ul>${code.fileCount>list.length?`<p class="code-empty">${code.fileCount-list.length} more files</p>`:''}`;
  }
  function diffHTML(job,path){
    if(!path)return '';
    const found=diffs.get(`${job.id}|${job.code?.head||''}|${path}`);
    if(!found)return `<div class="code-diff"><div class="code-diff-head"><span>${esc(path)}</span><small>Loading the change…</small></div></div>`;
    if(found.error)return `<div class="code-diff"><div class="code-diff-head"><span>${esc(path)}</span><small>${esc(found.error)}</small></div></div>`;
    if(found.binary)return `<div class="code-diff"><div class="code-diff-head"><span>${esc(path)}</span><small>Not a text file</small></div></div>`;
    const rows=Array.isArray(found.rows)?found.rows:[];
    return `<div class="code-diff"><div class="code-diff-head"><span>${esc(path)}</span><small>${found.truncated?'The first lines of the change':'The whole change'}</small></div><div class="code-diff-body"><table><tbody>${rows.map(r=>r.kind==='hunk'?`<tr class="hunk"><td colspan="3">${esc(r.text)}</td></tr>`:`<tr class="${esc(r.kind)}"><td class="n">${Number(r.n)||''}</td><td class="c">${r.kind==='add'?'+':r.kind==='del'?'−':' '}</td><td class="c">${esc(r.text)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function tab(jobs,ctx={}){
    if(!jobs.length)return '<p class="code-empty">No coding work in this chat yet. When an agent works on code, its copy shows here.</p>';
    const job=jobs.find(j=>j.id===picked.copy)||jobs[0],code=codeOf(job)||{},agent=ctx.agents?.(job.agentId),agentName=agent?.name||'The agent',folder=code.folderName||'your folder',now=ctx.now||Date.now();
    const files=Array.isArray(code.files)?code.files:[],selected=files.some(f=>f.path===picked.file)?picked.file:files[0]?.path||'';
    const copies=jobs.map(j=>{const [label,tone]=status(j),a=ctx.agents?.(j.agentId);return `<li><button type="button" class="code-copy" data-code-copy="${esc(j.id)}" aria-pressed="${j===job}"><span class="code-copy-name"><b>${esc(j.title||'Coding task')}</b><small>${esc(a?.name||'An agent')}’s copy · ${plural(stepsOf(codeOf(j)).length,'step')}</small></span><span class="wc-chip ${tone}">${esc(label)}</span></button></li>`;}).join('');
    const j=stops(job,now),note=files.find(f=>f.path===selected);
    return `<div class="code-tab" data-code-tab="${esc(job.id)}"><div class="code-col"><section class="code-sec"><h3 class="code-label">Copies at work</h3><ul class="code-copies">${copies}</ul></section><section class="code-sec"><h3 class="code-label">Where it is <span>${esc(agentName)}’s copy of ${esc(folder)}</span></h3>${journey(j.states,j.details)}</section><section class="code-sec"><h3 class="code-label">History <span>newest at the top</span></h3>${lanes(laneRows(job,{names:ctx.names,now,agentName}),{agentColor:agentColor(agent),agentName,rh:46,gap:30})}</section></div><div class="code-col"><section class="code-sec"><h3 class="code-label">What changed <span>${plural(Number(code.fileCount)||0,'file')} · ${Number(code.added)||0} lines added, ${Number(code.removed)||0} removed</span></h3>${filesHTML(job,selected)}</section>${selected?`<section class="code-sec">${note?.note?`<p class="code-say"><b>${esc(base(selected))}.</b> ${esc(note.note)}</p>`:''}${diffHTML(job,selected)}</section>`:''}${(code.checks||[]).length?`<section class="code-sec"><h3 class="code-label">Checks</h3>${checksHTML(code.checks)}</section>`:''}${clashHTML(job,agentName)?`<section class="code-sec">${clashHTML(job,agentName)}</section>`:''}<div class="code-sec code-foot">${actionsHTML(job,{agentName,folder,busy:ctx.busy,tab:true})}</div></div></div>`;
  }

  // Per task: how the card draws the work, the person's clash choices; in the tab, the copy and file picked; changes read so far.
  const modes=new Map(),choices=new Map(),diffs=new Map(),picked={copy:'',file:''};
  const api={lanes,journey,stops,laneRows,status,card,tab,tasksFor,actionsHTML,clashHTML,modes,choices,diffs,picked};
  root.BuddyCode=api;if(typeof module!=='undefined')module.exports=api;
  if(typeof document==='undefined')return;

  const snapshot=()=>root.BuddyWorkerUI?.snapshot?.()||{};
  const agents=id=>(typeof state!=='undefined'?state.agents||[]:[]).find(a=>a.id===id)||null;
  const names=id=>agents(id)?.name||'';
  let busy=false;const loading=new Set();
  api.context=()=>({agents,names,busy,now:Date.now()});
  api.jobs=()=>(Array.isArray(snapshot().tasks)?snapshot().tasks:[]);
  api.forChat=()=>typeof ui!=='undefined'&&ui.view?.kind==='chat'?tasksFor(typeof state!=='undefined'?state:{},ui.view.target,api.jobs()):[];
  // Draws the card and the tab again after a tap: the chat, and the Code tab's body.
  function redraw(){
    if(typeof ui!=='undefined'&&ui.view?.kind==='chat'&&typeof refreshLiveChat==='function')refreshLiveChat(ui.view.target);
    const body=document.querySelector('[data-code-body]');if(body){const html=tab(api.forChat(),api.context());if(body._html!==html){body.innerHTML=html;body._html=html;}}
  }
  api.redraw=redraw;
  async function loadDiff(job,path){
    const key=`${job.id}|${job.code?.head||''}|${path}`;if(diffs.has(key)||loading.has(key))return;
    loading.add(key);
    try{const r=await root.BuddyWorkerUI.request({operation:'code',requestId:crypto.randomUUID(),arguments:{action:'diff',taskId:job.id,path}});diffs.set(key,r?.error?{error:String(r.error)}:r?.diff||{error:'The change could not be read.'});}
    catch(e){diffs.set(key,{error:String(e?.message||e)});}
    finally{loading.delete(key);}
    redraw();
  }
  api.loadDiff=loadDiff;
  async function act(action,id){
    if(busy)return;busy=true;redraw();
    const args={action,taskId:id};if(action==='bring')args.choices=choices.get(id)||{};
    let outcome;
    try{outcome=await root.BuddyWorkerUI.request({operation:'code',requestId:crypto.randomUUID(),arguments:args});}
    catch(e){outcome={error:String(e?.message||e)};}
    busy=false;
    if(outcome?.error)typeof showToast==='function'&&showToast(String(outcome.error));
    else{
      if(action==='bring'){choices.delete(id);const n=(outcome?.broughtIn?.files||[]).length;typeof showToast==='function'&&showToast(`Brought ${plural(n,'file')} into your folder.`);}
      if(action==='combine'||action==='github')typeof showToast==='function'&&showToast('Sent. The agent picks it up now.');
    }
    await root.BuddyWorkerUI.refresh?.(false);redraw();
  }
  document.addEventListener('click',e=>{
    const mode=e.target.closest?.('[data-code-mode]');
    if(mode){modes.set(mode.dataset.task,mode.dataset.codeMode);redraw();document.querySelector(`[data-code-mode="${mode.dataset.codeMode}"][data-task="${CSS.escape(mode.dataset.task)}"]`)?.focus({preventScroll:true});return;}
    const copy=e.target.closest?.('[data-code-copy]');
    if(copy){picked.copy=copy.dataset.codeCopy;picked.file='';redraw();const job=api.forChat().find(j=>j.id===picked.copy);const first=job?.code?.files?.[0]?.path;if(job&&first)loadDiff(job,first);return;}
    const file=e.target.closest?.('[data-code-file]');
    if(file){picked.file=file.dataset.codeFile;const job=api.forChat().find(j=>j.id===file.dataset.task);redraw();if(job)loadDiff(job,picked.file);document.querySelector(`[data-code-file="${CSS.escape(picked.file)}"]`)?.focus({preventScroll:true});return;}
    const button=e.target.closest?.('[data-code-act]');
    if(button&&!button.disabled&&e.detail<2)act(button.dataset.codeAct,button.dataset.task);
  });
  document.addEventListener('change',e=>{
    const input=e.target.closest?.('[data-code-choice]');if(!input)return;
    const id=input.dataset.codeChoice,now={...(choices.get(id)||{}),[input.dataset.path]:input.value};choices.set(id,now);redraw();
  });
  // Opening the Code tab reads the first file's change.
  document.addEventListener('click',e=>{
    if(!e.target.closest?.('[data-chat-view="code"]'))return;
    setTimeout(()=>{const jobs=api.forChat(),job=jobs.find(j=>j.id===picked.copy)||jobs[0],path=picked.file||job?.code?.files?.[0]?.path;if(job&&path)loadDiff(job,path);},0);
  });
})(typeof globalThis!=='undefined'?globalThis:this);
