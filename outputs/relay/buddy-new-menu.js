/* The + button (27 Oct, design canvas "Buddy notifications and + menu"): a small menu under it, Create agent first, then Create group, New
   task, and Agent suggestions while some wait. It replaces the New chat window, which listed the agents again (the sidebar already does).
   New task leaves work with an agent once, now, or on repeat: a repeating task is a routine, saved and run like one made in Background work. */
(function(root){
  'use strict';
  // A task's name: its first sentence or line, short.
  function titleOf(goal){
    const first=String(goal||'').trim().split(/\n/)[0].replace(/\s+/g,' '),end=first.search(/[.!?](\s|$)/),line=end>0?first.slice(0,end):first;
    return line.length>80?line.slice(0,79).replace(/\s+\S*$/,'')+'…':line||'Task';
  }
  // When it runs: hour and minute from "HH:MM", and the days (1 = Sunday … 7 = Saturday, as routines count them).
  function schedule(when,time,day){
    const [hour,minute]=String(time||'09:00').split(':').map(Number);
    return {hour:Number.isFinite(hour)?hour:9,minute:Number.isFinite(minute)?minute:0,weekdays:when==='daily'?[1,2,3,4,5,6,7]:[Math.min(7,Math.max(1,Number(day)||1))]};
  }
  const api={titleOf,schedule};root.BuddyNewMenu=api;if(typeof module!=='undefined')module.exports=api;
  if(typeof document==='undefined'||typeof startChat!=='function')return;

  let menu=null,anchor=null;
  function close(){menu?.remove();menu=null;anchor?.setAttribute('aria-expanded','false');anchor=null;}
  function open(button){
    close();anchor=button;
    const waiting=typeof pendingSuggestionCount==='function'?pendingSuggestionCount():0;
    const row=(attrs,figure,title,sub,extra='')=>`<button type="button" class="plus-row" role="menuitem" ${attrs}><span class="plus-icon" aria-hidden="true">${figure}</span><span class="plus-copy"><strong>${title}</strong><small>${sub}</small></span>${extra}</button>`;
    menu=document.createElement('div');menu.className='plus-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','New');
    menu.innerHTML=row('data-action="new-agent"',BuddyFigures.avatarHTML({avatarShape:'square',avatarColor:'cobalt'},30),'Create agent','A new name, a new point of view.')
      +row('data-action="new-group"',icon('people'),'Create group','Bring a few agents together.')
      +'<div class="plus-divider" role="separator"></div>'
      +row('data-new-task',icon('clock'),'New task','Leave work with an agent, once or on repeat.')
      +(waiting?row('data-action="proposals"',icon('people'),'Agent suggestions','Agents Buddy thinks would help.',`<span class="plus-count">${waiting} waiting</span>`):'');
    document.body.appendChild(menu);
    const r=button.getBoundingClientRect();
    menu.style.top=`${Math.round(r.bottom+8)}px`;menu.style.left=`${Math.round(Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,r.left-12)))}px`;
    button.setAttribute('aria-expanded','true');
    menu.querySelector('button')?.focus();
  }
  // startChat is app.js's action for the + button: it now opens this menu under the button, and closes it if it is open.
  root.startChat=()=>{const b=document.querySelector('.sidebar [data-action="new-chat"]');if(!b)return;if(menu)close();else open(b);};

  function taskForm(){
    const agents=(state.agents||[]).filter(a=>a.setupStatus!=='pending');
    if(!agents.length){showToast('Create an agent first.');return;}
    const current=ui.view?.kind==='chat'&&agents.some(a=>a.id===ui.view.target)?ui.view.target:agents[0].id,today=new Date().getDay()+1;
    openModal('New task',`<form id="new-task-form" class="new-task-form">
      <fieldset class="new-task-group"><legend>Who</legend><div class="new-task-agents">${agents.map(a=>`<label class="new-task-agent"><input type="radio" name="agentId" value="${esc(a.id)}" ${a.id===current?'checked':''}>${avatar(a.id,true)}<span>${esc(a.name)}</span></label>`).join('')}</div></fieldset>
      <label class="field"><span>What to do</span><textarea name="goal" rows="4" maxlength="30000" required placeholder="What should they do? Include links, files, and what a good result looks like."></textarea></label>
      <fieldset class="new-task-group"><legend>When</legend><div class="new-task-when">${[['now','Now'],['daily','Every day'],['weekly','Every week']].map(([v,l],k)=>`<label><input type="radio" name="when" value="${v}" ${k===0?'checked':''}><span>${l}</span></label>`).join('')}</div>
      <div class="new-task-repeat" data-repeat hidden><label class="field"><span>Time</span><input type="time" name="time" value="09:00"></label><label class="field" data-weekly hidden><span>Day</span><select name="day">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>`<option value="${i+1}" ${i+1===today?'selected':''}>${d}</option>`).join('')}</select></label></div>
      <p class="new-task-note" data-repeat-note hidden>Repeating makes it a routine. It shows in Background work.</p></fieldset>
      <p class="field-error" data-new-task-error role="alert" hidden></p>
      <div class="modal-actions"><button type="button" class="border-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Start task</button></div>
    </form>`);
    document.querySelector('#new-task-form textarea')?.focus();
  }
  api.taskForm=taskForm;

  document.addEventListener('click',e=>{
    if(e.target.closest('[data-new-task]')){close();taskForm();return;}
    if(!menu)return;
    // Choosing a row lets app.js act on it (Create agent, Create group, Agent suggestions), then the menu goes; a click elsewhere closes it.
    if(menu.contains(e.target)){if(e.target.closest('.plus-row'))setTimeout(close,0);return;}
    if(!e.target.closest('[data-action="new-chat"]'))close();
  });
  document.addEventListener('keydown',e=>{
    if(!menu)return;
    if(e.key==='Escape'){const b=anchor;close();b?.focus();e.preventDefault();return;}
    if(!['ArrowDown','ArrowUp'].includes(e.key)||!menu.contains(document.activeElement))return;
    const rows=[...menu.querySelectorAll('.plus-row')],at=rows.indexOf(document.activeElement);
    rows[(at+(e.key==='ArrowDown'?1:rows.length-1))%rows.length]?.focus();e.preventDefault();
  });
  root.addEventListener('resize',close);
  document.addEventListener('change',e=>{
    const form=e.target.closest?.('#new-task-form');if(!form||e.target.name!=='when')return;
    const when=e.target.value;
    form.querySelector('[data-repeat]').hidden=when==='now';form.querySelector('[data-repeat-note]').hidden=when==='now';form.querySelector('[data-weekly]').hidden=when!=='weekly';
    form.querySelector('[type=submit]').textContent=when==='now'?'Start task':'Save routine';
  });
  document.addEventListener('submit',async e=>{
    const form=e.target.closest?.('#new-task-form');if(!form)return;e.preventDefault();
    const v=Object.fromEntries(new FormData(form)),goal=String(v.goal||'').trim(),submit=form.querySelector('[type=submit]'),error=form.querySelector('[data-new-task-error]');
    if(!goal||!v.agentId||submit.disabled)return;
    const title=titleOf(goal),requestId=crypto.randomUUID(),request=root.BuddyWorkerUI?.request;
    submit.disabled=true;error.hidden=true;
    try{
      if(!request)throw Error('Open Buddy’s Mac app to use background work.');
      if(v.when==='now'){
        await request({operation:'create',agentId:v.agentId,title,goal,kind:'general',requestId});
        closeModal();showToast(`${agentName(v.agentId)} is on it: ${title}`);
      }else{
        const s=schedule(v.when,v.time,v.day);
        await request({operation:'routine',agentId:v.agentId,requestId,arguments:{action:'create',title,goal,kind:'general',query:'',...s,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}});
        closeModal();showToast(`Saved: ${title}, ${v.when==='daily'?'every day':'every week'} at ${v.time||'09:00'}.`);
      }
      root.BuddyWorkerUI?.refresh?.();
    }catch(err){error.textContent=String(err?.message||err);error.hidden=false;submit.disabled=false;}
  });
})(typeof globalThis!=='undefined'?globalThis:this);
