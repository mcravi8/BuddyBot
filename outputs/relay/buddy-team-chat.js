(function(root){
  'use strict';
  // `chats` are what the team's agents said to each other about this group's plan (the app's groupMessages): a task the supervisor handed out,
  // a teammate's question or result, and the supervisor's answer or verdict, each shown as that agent's own message to the other.
  function items(state,group,chats=[]){
    const known=new Set((state.agents||[]).map(a=>a.id)),members=new Set(group.members.filter(id=>known.has(id))),out=[];
    for(const m of Array.isArray(chats)?chats:[]){
      if(typeof m?.id!=='string'||!known.has(m.fromAgentId)||!known.has(m.toAgentId)||m.fromAgentId===m.toAgentId||!String(m.body||'').trim())continue;
      out.push({id:'plan:'+m.id,kind:'team-chat-item',variant:'agent-message',agentId:m.fromAgentId,toAgentId:m.toAgentId,messageKind:String(m.kind||''),title:String(m.title||''),verdict:String(m.verdict||''),body:String(m.body),createdAt:String(m.at||''),planChat:true,reply:String(m.id).endsWith(':reply')});
    }
    for(const run of Object.values(state.runs||{})){
      if(run.target!==group.id||!run.team)continue;
      const entries=(run.team.entries||[]).filter(e=>members.has(e.agentId));
      for(const e of entries){
        const base=`team:${run.runId}:${e.agentId}`;
        if(e.startedAt&&e.task)out.push({id:base+':assignment',kind:'team-chat-item',variant:'assignment',agentId:e.agentId,body:e.task,createdAt:e.startedAt});
        const finished=['completed','failed','blocked','stopped'].includes(e.status),body=e.status==='completed'?e.notes:e.error;
        if(!finished||!String(body||'').trim())continue;
        const recipients=entries.filter(other=>(other.dependsOn||[]).includes(e.agentId)&&other.startedAt&&['working','completed','failed'].includes(other.status)).map(other=>other.agentId);
        out.push({id:base+':result',kind:'team-chat-item',variant:e.status==='completed'?'contribution':'error',agentId:e.agentId,body:String(body),createdAt:e.finishedAt||run.updatedAt||'',approximate:!e.finishedAt,recipients});
      }
    }
    return out.filter(i=>Number.isFinite(Date.parse(i.createdAt))).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id));
  }
  const VERBS=new Set(['add','analyse','analyze','apply','assemble','audit','build','calibrate','check','clean','collect','compare','compile','compute','confirm','convert','create','draft','edit','estimate','execute','export','extract','fetch','finalise','finalize','find','finish','fit','fix','format','gather','generate','implement','list','load','make','map','merge','move','package','plot','prepare','produce','proofread','reconcile','record','redo','render','repair','replace','reproduce','rerun','research','review','revise','rewrite','run','save','scan','search','send','set','simulate','sketch','split','summarise','summarize','test','tidy','trace','update','validate','verify','write']);
  function askLine(name,title){
    const t=String(title||'').trim().replace(/[.?!:;]+$/,''),word=t.split(/\s+/)[0]||'',lower=word.toLowerCase();
    if(!t)return `**@${name}** there's a new task for you.`;
    return VERBS.has(lower)?`**@${name}** can you ${lower}${t.slice(word.length)}?`:`**@${name}** ${t}`;
  }
  // A short message whole; a longer one's first sentence (or its first 220 characters), and whether anything is left after it.
  function opening(text){
    const all=String(text||'').trim(),para=all.split(/\n\s*\n/)[0].replace(/\s+/g,' '),end=para.search(/[.!?](?=\s|$)/);
    if(para===all.replace(/\s+/g,' ')&&para.length<=200)return {first:para,more:false};
    let first=end>=0&&end<220?para.slice(0,end+1):para.length<=220?para:para.slice(0,200).replace(/\s+\S*$/,'')+'…';
    return {first,more:all.replace(/\s+/g,' ').length>first.length+1};
  }
  const api={items,askLine,opening};root.BuddyTeamChat=api;if(typeof module!=='undefined')module.exports=api;if(typeof document==='undefined')return;
  const chats=id=>root.BuddyAgentMessages?.groupMessages?.(id)||[];
  api.hasTimeline=id=>{const g=findGroup(id);return !!g&&items(state,g,chats(id)).length>0;};
  api.timeline=(id,messages)=>{
    const g=findGroup(id);if(!g)return messages;
    const activity=items(state,g,chats(id)).map(item=>({id:item.id,exchangeId:item.id,fromAgentId:item.agentId,toAgentId:item.agentId,at:item.createdAt,item}));
    const chat=messages.map(m=>{const run=state.runs?.[m.runId];return run?.target===id&&run.replyId===m.id?{...m,createdAt:run.updatedAt||run.createdAt}:m;});
    return BuddyAgentMessages.mergeTimeline(state,id,chat,activity);
  };
  api.render=m=>{
    const time=new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    if(m.variant==='agent-message')return agentMessage(m,time);
    if(m.variant==='assignment')return `<div class="team-chat-assignment"><details><summary>${avatar(m.agentId,true)}<span>Assigned to ${esc(agentName(m.agentId))}</span><time>${esc(time)}</time></summary><div class="reply-markdown">${BuddyMarkdown.render(m.body)}</div></details></div>`;
    // An agent's contribution is that agent's own message in the group: its name and picture, its full reply.
    const agent=findAgent(m.agentId),error=m.variant==='error';
    const author=agent&&typeof authorColor==='function'?`<button type="button" class="message-author" style="${authorColor(agent)}" data-action="agent-info" data-id="${esc(agent.id)}">${esc(agent.name)}</button>`:`<strong>${esc(agentName(m.agentId))}</strong>`;
    const note=error?'Couldn’t finish':m.recipients.length?`For ${m.recipients.map(id=>esc(agentName(id))).join(', ')}`:'';
    return `<div class="message bot-message team-chat-contribution ${error?'is-error':''}">${avatar(m.agentId,true)}<div class="bot-bubble"><div class="team-chat-author">${author}${note?`<span>${note}</span>`:''}</div><div class="reply-markdown">${BuddyMarkdown.render(m.body)}</div><time title="${m.approximate?'Recorded with the saved team reply':esc(new Date(m.createdAt).toLocaleString())}">${esc(time)}</time></div></div>`;
  };
  // One agent's message to another, as in a Slack channel: who wrote it, then "@Lyra" and the point in one line, the rest a click away. A task
  // handed out reads "@Lyra can you draft the new caption wording?" with its brief folded; it used to show "Chief → Lyra · New task" and the whole
  // brief. A question, work handed in or an answer shows its first sentence; the person asked for details at request, not by default.
  function agentMessage(m,time){
    const agent=findAgent(m.agentId),to=agentName(m.toAgentId);
    const author=agent&&typeof authorColor==='function'?`<button type="button" class="message-author" style="${authorColor(agent)}" data-action="agent-info" data-id="${esc(agent.id)}">${esc(agent.name)}</button>`:`<strong>${esc(agentName(m.agentId))}</strong>`;
    let line,fold='',more=false;
    if(!m.reply&&m.messageKind==='handoff'){line=askLine(to,m.title);fold='Brief';more=true;}
    else{
      const {first,more:rest}=opening(m.body);
      line=`**@${to}** ${first}`;more=rest;fold='More';
    }
    // Whether Chief accepted the work or sent it back is a small word beside the name; the message itself reads as Chief wrote it.
    const tag=m.verdict==='accepted'?'<span class="team-chat-tag">accepted</span>':m.verdict==='sent back'?'<span class="team-chat-tag is-back">sent back</span>':'';
    const body=`<div class="reply-markdown team-chat-line">${BuddyMarkdown.render(line)}</div>${more?`<details class="team-chat-more"><summary>${fold}</summary><div class="reply-markdown">${BuddyMarkdown.render(m.body)}</div></details>`:''}`;
    return `<div class="message bot-message team-chat-contribution team-chat-agent-message ${m.verdict==='sent back'?'is-sent-back':''}">${avatar(m.agentId,true)}<div class="bot-bubble"><div class="team-chat-author">${author}${tag}</div>${body}<time title="${esc(new Date(m.createdAt).toLocaleString())}">${esc(time)}</time></div></div>`;
  }
  // The overview above the work says who was chosen to bring the reply together; with agents answering for themselves nobody does.
  if(typeof window.teamworkBody==='function'){
    const original=window.teamworkBody;
    window.teamworkBody=function(run){const html=original.call(this,run);return run?.team&&run.team.direct!==true?html.replace(/<p>[^<]*(?:brought the reply together|is bringing the reply together|will bring the reply together|was chosen to reply)\.<\/p>/,''):html;};
  }
})(typeof globalThis!=='undefined'?globalThis:this);
