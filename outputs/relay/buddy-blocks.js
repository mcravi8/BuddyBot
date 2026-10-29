/* Reply blocks (29 Oct, proposal "Buddy Reply Blocks"): an agent's reply can carry blocks the Mac app checked (BuddyBlocks.swift) and this page
   draws with its own code: a table, chart, key numbers, comparison, timeline or files to read, and a choice, form or checklist to answer. Every
   string is drawn as text. An Ask block is answered once: the chat shows the answer as the person's message and the agent gets it with its
   values (sendBlockAnswer in app.js). Only what the person typed counts as their own words; the options are the agent's. */
(function(root){
  'use strict';
  const TYPES=['table','chart','stats','compare','timeline','files','choice','form','checklist'],ASK=new Set(['choice','form','checklist']);
  const NAMES={table:'Table',chart:'Chart',stats:'Key numbers',compare:'Comparison',timeline:'Timeline',files:'Files',choice:'Choice',form:'Form',checklist:'Checklist'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const NUMERIC=new Set(['number','money','percent']);

  // "2026-11-02" as "Mon 2 Nov"; anything else as written.
  function day(value){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value??''));if(!m)return String(value??'');
    const d=new Date(+m[1],+m[2]-1,+m[3]);return Number.isNaN(d.getTime())||d.getMonth()!==+m[2]-1?String(value):`${DAYS[d.getDay()]} ${+m[3]} ${MONTHS[+m[2]-1]}`;
  }
  function number(v,kind='number'){
    if(typeof v!=='number'||!Number.isFinite(v))return v==null?'':String(v);
    if(kind==='money')return `${v<0?'−':''}$${Math.abs(v).toLocaleString('en-US',{maximumFractionDigits:2})}`;
    if(kind==='percent')return `${(v*100).toLocaleString('en-US',{maximumFractionDigits:1})}%`;
    return v.toLocaleString('en-US',{maximumFractionDigits:2});
  }
  const size=n=>n<1024?`${n} B`:n<1048576?`${Math.round(n/1024)} KB`:`${(n/1048576).toFixed(1)} MB`;
  const nameOf=id=>(typeof state!=='undefined'&&state.agents?.find(a=>a.id===id)?.name)||'The agent';
  // What the Mac app sent: known blocks only, a bounded number, copied so the chat keeps its own.
  function sanitize(list){return (Array.isArray(list)?list:[]).filter(b=>b&&typeof b==='object'&&TYPES.includes(b.type)&&typeof b.id==='string'&&b.id).slice(0,24).map(b=>JSON.parse(JSON.stringify(b)));}

  // ---- drawing ----
  function frame(m,b,inner){
    const heading=b.title&&!(b.type==='choice'&&b.title===b.question)?`<h4 class="rb-title">${esc(b.title)}</h4>`:'';
    return `<section class="reply-block" data-block-type="${esc(b.type)}" data-block="${esc(b.id)}" data-message="${esc(m.id)}" aria-label="${esc(b.title||b.question||NAMES[b.type])}">${heading}${inner}${b.source?`<p class="rb-source">Source: ${esc(b.source)}</p>`:''}</section>`;
  }
  const fileButton=(path,folderId,label)=>folderId
    ?`<button type="button" class="rb-file" data-action="project-file" data-path="${esc(path)}" data-folder-id="${esc(folderId)}"><span class="rb-file-ico" aria-hidden="true"></span>${esc(label||String(path).split('/').pop())}</button>`
    :`<span class="rb-file-name"><span class="rb-file-ico" aria-hidden="true"></span>${esc(label||String(path).split('/').pop())}</span>`;
  function cell(v,kind){
    if(v&&typeof v==='object'&&typeof v.file==='string')return fileButton(v.file,v.folderId);
    if(kind==='link'&&typeof v==='string'){let url=null;try{url=new URL(v);}catch{}if(url?.protocol==='https:')return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(url.hostname+(url.pathname.length>1?url.pathname:''))}</a>`;}
    if(kind==='file'&&typeof v==='string'&&v)return `<span class="rb-file-name"><span class="rb-file-ico" aria-hidden="true"></span>${esc(v)}</span>`;
    if(typeof v==='number')return esc(number(v,NUMERIC.has(kind)?kind:'number'));
    return esc(kind==='date'?day(v):v??'');
  }
  function table(m,b){
    const columns=Array.isArray(b.columns)?b.columns:[],rows=Array.isArray(b.rows)?b.rows:[];
    const head=columns.map((c,i)=>`<th scope="col" class="${NUMERIC.has(c.kind)?'rb-num':''}"><button type="button" data-block-sort="${i}" aria-sort="none">${esc(c.label)}</button></th>`).join('');
    const body=rows.map(r=>`<tr>${columns.map((c,i)=>{const v=Array.isArray(r)?r[i]:null,key=typeof v==='number'?v:String(v&&typeof v==='object'?v.file:v??'').toLowerCase();
      return `<td class="${NUMERIC.has(c.kind)?'rb-num':''}" data-sort="${esc(key)}" data-sort-kind="${typeof v==='number'?'n':'s'}">${cell(v,c.kind)}</td>`;}).join('')}</tr>`).join('');
    const total=Number(b.total)||0;
    const more=total>rows.length?`<p class="rb-note">Showing ${number(rows.length)} of ${number(total)} rows.${b.savedAs?.path?` The whole table is in ${fileButton(b.savedAs.path,b.savedAs.folderId)}.`:''}</p>`:'';
    return frame(m,b,`<div class="rb-scroll"><table class="rb-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}`);
  }
  function chart(m,b){
    const W=520,H=210,L=42,R=8,T=18,B=26,labels=Array.isArray(b.labels)?b.labels:[],series=(Array.isArray(b.series)?b.series:[]).slice(0,4);
    const values=series.flatMap(s=>Array.isArray(s.values)?s.values:[]).filter(v=>typeof v==='number'&&Number.isFinite(v));
    const max=Math.max(0,...values),min=Math.min(0,...values),span=max-min||1,raw=span/4,mag=10**Math.floor(Math.log10(raw));
    const step=[1,2,2.5,5,10].map(f=>f*mag).find(s=>s>=raw-1e-12)||raw,top=Math.ceil(max/step-1e-9)*step||step,bottom=Math.floor(min/step+1e-9)*step;
    const y=v=>T+(H-T-B)*(top-v)/((top-bottom)||1),band=(W-L-R)/Math.max(1,labels.length),f=n=>n.toFixed(1);
    let grid='';
    for(let k=0,v=bottom;v<=top+step/2&&k<12;k++,v=bottom+k*step){const at=f(y(v));grid+=`<line x1="${L}" x2="${W-R}" y1="${at}" y2="${at}" class="${Math.abs(v)<step*1e-6?'rb-axis':'rb-grid'}"/><text x="${L-6}" y="${f(y(v)+4)}" text-anchor="end" class="rb-tick">${esc(number(+v.toPrecision(12)))}</text>`;}
    let marks='';
    if(b.kind==='line'){
      series.forEach((s,k)=>{let run=[];const flush=()=>{if(run.length>1)marks+=`<polyline points="${run.join(' ')}" class="rb-line rb-s${k}"/>`;run=[];};
        (s.values||[]).forEach((v,i)=>{if(typeof v!=='number'){flush();return;}const p=`${f(L+band*(i+.5))},${f(y(v))}`;run.push(p);marks+=`<circle cx="${f(L+band*(i+.5))}" cy="${f(y(v))}" r="2.6" class="rb-point rb-s${k}"><title>${esc(`${s.name} · ${labels[i]??''}: ${number(v)}${b.unit?' '+b.unit:''}`)}</title></circle>`;});flush();});
    }else{
      const w=band*.7/Math.max(1,series.length);
      // A zero draws no bar; its value still shows above the axis.
      series.forEach((s,k)=>(s.values||[]).forEach((v,i)=>{if(typeof v!=='number'||v===0)return;const x=L+band*i+band*.15+w*k,a=y(0),c=y(v);
        marks+=`<rect x="${f(x)}" y="${f(Math.min(a,c))}" width="${f(Math.max(1,w-2))}" height="${f(Math.max(1,Math.abs(a-c)))}" rx="3" class="rb-bar rb-s${k}"><title>${esc(`${s.name} · ${labels[i]??''}: ${number(v)}${b.unit?' '+b.unit:''}`)}</title></rect>`;}));
      if(series.length===1&&labels.length<=14)(series[0].values||[]).forEach((v,i)=>{if(typeof v==='number')marks+=`<text x="${f(L+band*(i+.5))}" y="${f(v>=0?y(v)-5:y(v)+13)}" text-anchor="middle" class="rb-val">${esc(number(v))}</text>`;});
    }
    const every=Math.max(1,Math.ceil(labels.length/12));
    const ticks=labels.map((l,i)=>i%every?'':`<text x="${f(L+band*(i+.5))}" y="${H-8}" text-anchor="middle" class="rb-tick">${esc(l)}</text>`).join('');
    const legend=series.length>1?`<div class="rb-legend">${series.map((s,k)=>`<span><i class="rb-s${k}" aria-hidden="true"></i>${esc(s.name)}</span>`).join('')}</div>`:'';
    const said=`${b.title?b.title+'. ':''}${series.map(s=>`${s.name}: ${labels.map((l,i)=>`${l} ${typeof s.values?.[i]==='number'?number(s.values[i]):'no value'}`).join(', ')}`).join('; ')}`.slice(0,900);
    return frame(m,b,`${legend}<svg viewBox="0 0 ${W} ${H}" class="rb-chart" role="img" aria-label="${esc(said)}">${grid}${marks}${ticks}</svg>${b.unit?`<p class="rb-note">In ${esc(b.unit)}</p>`:''}`);
  }
  function stats(m,b){
    return frame(m,b,`<div class="rb-stats">${(b.numbers||[]).map(n=>`<div class="rb-stat${n.tone==='warn'?' warn':n.tone==='good'?' good':''}"><small>${esc(n.label)}</small><b>${esc(typeof n.value==='number'?number(n.value):n.value??'')}${n.unit?`<span>${esc(n.unit)}</span>`:''}</b>${n.note?`<em>${esc(n.note)}</em>`:''}</div>`).join('')}</div>`);
  }
  function compare(m,b){
    const options=(b.options||[]).slice(0,4),labels=[...new Set(options.flatMap(o=>(o.facts||[]).map(f=>f.label)))],pick=options.find(o=>o.id===b.pick),mark=o=>o.id===b.pick?' rb-picked':'';
    const head=`<tr><td></td>${options.map(o=>`<th scope="col" class="${mark(o).trim()}">${o.id===b.pick?`<span class="rb-pick">${esc(nameOf(b.from))}’s pick</span>`:''}${esc(o.label)}${o.detail?`<small>${esc(o.detail)}</small>`:''}</th>`).join('')}</tr>`;
    const rows=labels.map(l=>`<tr><th scope="row">${esc(l)}</th>${options.map(o=>{const fact=(o.facts||[]).find(x=>x.label===l);return `<td class="${mark(o).trim()}">${fact?esc(typeof fact.value==='number'?number(fact.value):fact.value??''):'—'}</td>`;}).join('')}</tr>`).join('');
    const notes=options.some(o=>o.note)?`<tr><th scope="row">In short</th>${options.map(o=>`<td class="${mark(o).trim()}">${esc(o.note||'')}</td>`).join('')}</tr>`:'';
    const why=b.why?`<p class="rb-why">${pick?`<strong>Why ${esc(pick.label)}:</strong> `:''}${esc(b.why)}</p>`:'';
    return frame(m,b,`<div class="rb-scroll"><table class="rb-table rb-compare rb-cols-${options.length}"><thead>${head}</thead><tbody>${rows}${notes}</tbody></table></div>${why}`);
  }
  function timeline(m,b){
    return frame(m,b,`<ol class="rb-timeline">${(b.events||[]).map(e=>{const state=['done','next'].includes(e.state)?e.state:'later';
      return `<li class="${state}"><time${/^\d{4}-\d{2}-\d{2}$/.test(e.date||'')?` datetime="${esc(e.date)}"`:''}>${esc(day(e.date))}</time><span class="rb-dot" aria-hidden="true"></span><div><b>${esc(e.title)}</b>${e.detail?`<span>${esc(e.detail)}</span>`:''}${state==='later'?'':`<span class="sr-only"> (${state})</span>`}</div></li>`;}).join('')}</ol>`);
  }
  function files(m,b){
    return frame(m,b,`<div class="rb-files">${(b.files||[]).map(f=>{const parts=String(f.path||'').split('/'),name=parts.pop(),meta=[parts.join('/'),!f.missing&&Number.isFinite(f.bytes)?size(f.bytes):'',f.note].filter(Boolean).join(' · ');
      return `<div class="rb-file-row"><div class="rb-file-meta"><b><span class="rb-file-ico" aria-hidden="true"></span>${esc(name)}</b>${meta?`<small>${esc(meta)}</small>`:''}</div>${f.missing||!f.folderId?'<span class="rb-missing">Not found</span>':`<button type="button" class="rb-mini" data-action="project-file" data-path="${esc(f.path)}" data-folder-id="${esc(f.folderId)}">Open</button>`}</div>`;}).join('')}</div>`);
  }

  // ---- asking ----
  const drafts=new Map(),key=(m,b)=>`${m.id}:${b.id}`;
  const answerOf=(m,b)=>m.blockAnswers?.[b.id]||null;
  // Once answered, the button row becomes the answer, in the same place; the main button sits at the bottom right.
  function actions(b,a,disabled){
    return a?`<div class="rb-actions done"><p class="rb-answered">Answered · ${esc(a.text)}</p></div>`:`<div class="rb-actions"><button type="submit" class="primary-button rb-send"${disabled?' disabled':''}>${esc(b.submit||'Send')}</button></div>`;
  }
  function choice(m,b){
    const a=answerOf(m,b),d=a?.values||drafts.get(key(m,b))||{},picked=new Set(d.picked||[]),group=`rb-${m.id}-${b.id}`,suggested=new Set(b.recommend||[]),off=a?' disabled':'';
    const options=(b.options||[]).map(o=>`<label class="rb-opt"><input type="${b.multiple?'checkbox':'radio'}" name="${esc(group)}" value="${esc(o.id)}"${picked.has(o.id)?' checked':''}${off}><span><b>${esc(o.label)}</b>${o.detail?`<small>${esc(o.detail)}</small>`:''}</span>${suggested.has(o.id)?`<span class="rb-suggest">${esc(nameOf(b.from))} suggests</span>`:'<span></span>'}</label>`).join('');
    const other=b.other?`<input class="rb-other" type="text" name="other" maxlength="500" placeholder="Something else" aria-label="Something else" value="${esc(d.other||'')}"${off}>`:'';
    return frame(m,b,`<form class="rb-ask" data-block-form novalidate><p class="rb-q" id="${esc(group)}-q">${esc(b.question)}</p><div class="rb-opts" role="${b.multiple?'group':'radiogroup'}" aria-labelledby="${esc(group)}-q">${options}</div>${other}${b.why?`<p class="rb-why">${esc(b.why)}</p>`:''}${actions(b,a,!picked.size&&!d.other)}</form>`);
  }
  function form(m,b){
    const a=answerOf(m,b),d=a?.values||drafts.get(key(m,b))||{},base=`rb-${m.id}-${b.id}`,off=a?' disabled':'';
    const fields=(b.fields||[]).map(f=>{
      const id=`${base}-${f.id}`,v=d[f.id]!==undefined?d[f.id]:f.value,need=f.required?' required':'',hint=f.placeholder?` placeholder="${esc(f.placeholder)}"`:'';
      if(f.kind==='toggle')return `<label class="rb-field rb-toggle"><input type="checkbox" id="${esc(id)}" name="${esc(f.id)}"${v===true||v==='true'?' checked':''}${off}><span>${esc(f.label)}</span></label>`;
      let input;
      if(f.kind==='select')input=`<select id="${esc(id)}" name="${esc(f.id)}"${off}${need}>${(f.options||[]).map(o=>`<option${String(v)===o?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
      else if(f.kind==='longtext')input=`<textarea id="${esc(id)}" name="${esc(f.id)}" rows="2" maxlength="4000"${hint}${off}${need}>${esc(v??'')}</textarea>`;
      else input=`<input id="${esc(id)}" name="${esc(f.id)}" type="${({date:'date',time:'time',number:'number',money:'number'})[f.kind]||'text'}"${f.kind==='money'?' step="0.01" inputmode="decimal"':f.kind==='number'?' step="any"':' maxlength="500"'} value="${esc(v??'')}"${hint}${off}${need}>`;
      return `<div class="rb-field${f.kind==='longtext'?' wide':''}"><label for="${esc(id)}">${esc(f.label)}${f.required?'':' <span class="rb-optional">(optional)</span>'}</label>${input}</div>`;
    }).join('');
    return frame(m,b,`<form class="rb-ask" data-block-form><div class="rb-fields">${fields}</div>${actions(b,a,false)}</form>`);
  }
  function checklist(m,b){
    const a=answerOf(m,b),d=a?.values||drafts.get(key(m,b)),ticked=new Set(d?d.checked||[]:(b.checks||[]).filter(c=>c.checked).map(c=>c.id)),off=a?' disabled':'';
    return frame(m,b,`<form class="rb-ask" data-block-form><div class="rb-opts">${(b.checks||[]).map(c=>`<label class="rb-opt"><input type="checkbox" name="checked" value="${esc(c.id)}"${ticked.has(c.id)?' checked':''}${off}><span><b>${esc(c.label)}</b>${c.detail?`<small>${esc(c.detail)}</small>`:''}</span><span></span></label>`).join('')}</div>${actions(b,a,false)}</form>`);
  }
  const DRAW={table,chart,stats,compare,timeline,files,choice,form,checklist};
  function html(m){
    const blocks=sanitize(m?.blocks);if(!blocks.length)return '';
    return `<div class="reply-blocks">${blocks.map(b=>{try{return DRAW[b.type](m,b);}catch{return '';}}).join('')}</div>`;
  }

  // ---- answers ----
  // What the person chose or wrote, read from the block's form.
  function read(formEl,b){
    if(b.type==='choice'){const picked=[...formEl.querySelectorAll('.rb-opts input:checked')].map(i=>i.value),other=formEl.querySelector('.rb-other')?.value.trim()||'';return other?{picked,other}:{picked};}
    if(b.type==='checklist')return {checked:[...formEl.querySelectorAll('input[name=checked]:checked')].map(i=>i.value)};
    const values={};for(const f of b.fields||[]){const el=formEl.elements.namedItem(f.id);if(el)values[f.id]=f.kind==='toggle'?!!el.checked:String(el.value||'').trim();}return values;
  }
  // The answer in words for the chat, and the words that are the person's own: what they typed, never the agent's labels or options.
  function compose(b,values){
    if(b.type==='choice'){const said=(values.picked||[]).map(id=>(b.options||[]).find(o=>o.id===id)?.label).filter(Boolean);if(values.other)said.push(values.other);return {text:said.join(', ')||'Nothing',typed:values.other||''};}
    if(b.type==='checklist'){const said=(values.checked||[]).map(id=>(b.checks||[]).find(c=>c.id===id)?.label).filter(Boolean);return {text:said.length?said.join(', '):'None of them',typed:''};}
    const said=[],typed=[];
    for(const f of b.fields||[]){const v=values[f.id];if(v===''||v==null)continue;said.push(`${f.label}: ${f.kind==='toggle'?(v?'yes':'no'):f.kind==='date'?day(v):v}`);if(!['toggle','select'].includes(f.kind))typed.push(String(v));}
    return {text:said.join(' · ')||'Nothing filled in',typed:typed.join('\n')};
  }
  // The person's message (what the chat and the history show) and what the agent receives: a plain line, then the values as JSON.
  function answer(b,values){
    const question=b.question||b.title||NAMES[b.type],{text,typed}=compose(b,values);
    return {block:b.id,question,text,typed,body:`Answer to “${question}”: ${text}`,model:`The person answered your block "${b.id}" (${question}): ${text}\n${JSON.stringify({block:b.id,answer:values})}`};
  }
  function locate(messageId,blockId){
    if(typeof state==='undefined')return null;
    for(const [target,list] of Object.entries(state.messages||{})){const m=(list||[]).find(x=>x.id===messageId);if(m){const b=sanitize(m.blocks).find(x=>x.id===blockId);return b?{target,m,b}:null;}}
    return null;
  }
  const api={html,sanitize,read,compose,answer,day,number,TYPES};
  root.BuddyBlocks=api;if(typeof module!=='undefined')module.exports=api;
  if(typeof document==='undefined')return;

  // A table sorts by the column chosen, numbers as numbers, on the page only.
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-block-sort]');if(!button)return;
    const table=button.closest('table'),body=table?.tBodies[0],at=+button.dataset.blockSort,dir=button.getAttribute('aria-sort')==='ascending'?-1:1;if(!body)return;
    table.querySelectorAll('[data-block-sort]').forEach(x=>x.setAttribute('aria-sort','none'));button.setAttribute('aria-sort',dir>0?'ascending':'descending');
    [...body.rows].sort((x,y)=>{const a=x.cells[at],c=y.cells[at];if(!a||!c)return 0;return (a.dataset.sortKind==='n'&&c.dataset.sortKind==='n'?Number(a.dataset.sort)-Number(c.dataset.sort):a.dataset.sort.localeCompare(c.dataset.sort))*dir;}).forEach(r=>body.appendChild(r));
  });
  // What is being filled in survives the chat being drawn again; a choice can be sent once something is picked.
  const track=event=>{
    const formEl=event.target.closest?.('[data-block-form]'),section=formEl?.closest('.reply-block');if(!section)return;
    const found=locate(section.dataset.message,section.dataset.block);if(!found||answerOf(found.m,found.b))return;
    const values=read(formEl,found.b);drafts.set(key(found.m,found.b),values);
    if(found.b.type==='choice'){const send=formEl.querySelector('.rb-send');if(send)send.disabled=!values.picked.length&&!values.other;}
  };
  document.addEventListener('input',track);document.addEventListener('change',track);
  document.addEventListener('submit',async event=>{
    const formEl=event.target.closest?.('[data-block-form]');if(!formEl)return;event.preventDefault();
    const section=formEl.closest('.reply-block'),found=section&&locate(section.dataset.message,section.dataset.block);if(!found)return;
    const {target,m,b}=found;if(answerOf(m,b)||formEl.dataset.sending)return;
    if(b.type==='form'&&!formEl.reportValidity())return;
    const values=read(formEl,b);if(b.type==='choice'&&!values.picked.length&&!values.other)return;
    formEl.dataset.sending='1';
    const reply=answer(b,values);
    m.blockAnswers={...(m.blockAnswers||{}),[b.id]:{values,text:reply.text,at:new Date().toISOString()}};
    const sent=typeof sendBlockAnswer==='function'&&await sendBlockAnswer(target,reply);
    if(sent){drafts.delete(key(m,b));return;}
    delete m.blockAnswers[b.id];delete formEl.dataset.sending;
    if(typeof refreshLiveChat==='function')refreshLiveChat(target);
  });
})(typeof globalThis!=='undefined'?globalThis:this);
