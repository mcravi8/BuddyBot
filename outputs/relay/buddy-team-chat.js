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
  const api={items};root.BuddyTeamChat=api;if(typeof module!=='undefined')module.exports=api;if(typeof document==='undefined')return;
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
  // One agent's message to another, as in a team's own chat: “Chief → Forge”, what it is (a new task, a question, work handed in, an answer, a
  // verdict), and the words. A long brief shows its start, with the rest a click away.
  const what={handoff:'New task',question:'Question',result:'Handed in',checkin:'Check-in'};
  function agentMessage(m,time){
    const agent=findAgent(m.agentId),to=agentName(m.toAgentId);
    const author=agent&&typeof authorColor==='function'?`<button type="button" class="message-author" style="${authorColor(agent)}" data-action="agent-info" data-id="${esc(agent.id)}">${esc(agent.name)}</button>`:`<strong>${esc(agentName(m.agentId))}</strong>`;
    const label=m.reply?(m.verdict==='accepted'?'Accepted':m.verdict==='sent back'?'Sent back':m.messageKind==='question'?'Answer':'Reply'):(what[m.messageKind]||'Message');
    const about=m.title&&['handoff','result'].includes(m.messageKind)?` · ${esc(m.title)}`:'';
    const body=m.body.length>700?`<div class="reply-markdown">${BuddyMarkdown.render(m.body.slice(0,400).replace(/\s+\S*$/,'')+'…')}</div><details class="team-chat-more"><summary>Show all</summary><div class="reply-markdown">${BuddyMarkdown.render(m.body)}</div></details>`:`<div class="reply-markdown">${BuddyMarkdown.render(m.body)}</div>`;
    return `<div class="message bot-message team-chat-contribution team-chat-agent-message ${m.verdict==='sent back'?'is-sent-back':''}">${avatar(m.agentId,true)}<div class="bot-bubble"><div class="team-chat-author">${author}<span>→ ${esc(to)} · ${label}${about}</span></div>${body}<time title="${esc(new Date(m.createdAt).toLocaleString())}">${esc(time)}</time></div></div>`;
  }
  // The overview above the work says who was chosen to bring the reply together; with agents answering for themselves nobody does.
  if(typeof window.teamworkBody==='function'){
    const original=window.teamworkBody;
    window.teamworkBody=function(run){const html=original.call(this,run);return run?.team&&run.team.direct!==true?html.replace(/<p>[^<]*(?:brought the reply together|is bringing the reply together|will bring the reply together|was chosen to reply)\.<\/p>/,''):html;};
  }
})(typeof globalThis!=='undefined'?globalThis:this);
