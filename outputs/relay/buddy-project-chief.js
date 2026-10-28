(function(root){
  'use strict';
  // A project's own Chief: the agent the user chose to supervise one group's plan, check its results and handle its approvals, as the team's
  // Chief does for every other group. None chosen means the team's Chief. The worker reads it from the group (`chiefId`).
  function choice(state,value){const id=String(value||'');return (state.agents||[]).some(a=>a.id===id)?id:'';}
  function apply(group,id){if(!group)return;if(id)group.chiefId=id;else delete group.chiefId;}
  const api={choice,apply};root.BuddyProjectChief=api;if(typeof module!=='undefined')module.exports=api;
  if(typeof document==='undefined'||typeof window.groupForm!=='function')return;
  // The group form gets a “Chief for this project” choice; saving the form saves it with the group (new or existing).
  const original=window.groupForm;
  window.groupForm=function(groupId){
    original.apply(this,arguments);
    const form=document.getElementById('group-form');if(!form||form.querySelector('#group-chief'))return;
    const group=findGroup(groupId),team=window.BuddyTeamMonitorUI?.teamChief?.(),known=new Set(state.groups.map(g=>g.id));
    const field=document.createElement('div');field.className='field';
    field.innerHTML=`<label for="group-chief">Chief for this project</label><select id="group-chief"><option value="">${team?.name?`${esc(team.name)}, the team’s Chief`:'The team’s Chief'}</option>${state.agents.filter(a=>a.id!==team?.id).map(a=>`<option value="${esc(a.id)}" ${group?.chiefId===a.id?'selected':''}>${esc(a.name)}${a.role?` · ${esc(a.role)}`:''}</option>`).join('')}</select><p class="team-caption">Plans this project’s work, checks its results and handles its approvals. Other projects keep their own Chief.</p>`;
    (form.querySelector('#group-error')||form.lastElementChild).before(field);
    // Read before the form's own save runs (a capture listener on the form runs first).
    form.addEventListener('submit',()=>{
      const id=choice(state,document.getElementById('group-chief')?.value);
      if(group){apply(group,id);return;}
      setTimeout(()=>{const made=state.groups.find(g=>!known.has(g.id));if(made&&id){apply(made,id);save();render();}},0);
    },{capture:true});
  };
})(typeof globalThis!=='undefined'?globalThis:this);
