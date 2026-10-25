const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('./buddy-team-chat'),M=require('./buddy-agent-messages');
test('team chat shows only actual contributions for that team and current members',()=>{
 const group={id:'team',members:['chief','lyra','forge']},s={agents:group.members.map(id=>({id})),groups:[group],runs:{r:{runId:'r',target:'team',createdAt:'2026-10-18T18:00:00Z',updatedAt:'2026-10-18T18:04:00Z',team:{entries:[{agentId:'lyra',task:'Find evidence',startedAt:'2026-10-18T18:00:10Z',finishedAt:'2026-10-18T18:01:00Z',status:'completed',notes:'The verified evidence.',dependsOn:[]},{agentId:'forge',task:'Check the evidence',startedAt:'2026-10-18T18:01:10Z',finishedAt:'2026-10-18T18:02:00Z',status:'failed',error:'Source unavailable.',dependsOn:['lyra']},{agentId:'removed',status:'completed',notes:'REMOVED'}]}},private:{runId:'private',target:'other-team',team:{entries:[{agentId:'chief',status:'completed',notes:'PRIVATE'}]}}},messages:{chief:[{body:'PRIVATE DM'}]}};
 const items=T.items(s,group);assert.equal(items.length,4);assert.deepEqual(items.find(i=>i.variant==='contribution').recipients,['forge']);assert.equal(items.find(i=>i.variant==='error').body,'Source unavailable.');assert.equal(JSON.stringify(items).includes('PRIVATE'),false);assert.equal(JSON.stringify(items).includes('REMOVED'),false);
 const events=items.map(item=>({id:item.id,exchangeId:item.id,fromAgentId:item.agentId,toAgentId:item.agentId,at:item.createdAt,item}));const timeline=M.mergeTimeline(s,'team',[{id:'request',createdAt:'2026-10-18T18:00:00Z'},{id:'answer',createdAt:'2026-10-18T18:04:00Z'}],events);assert.equal(timeline[0].id,'request');assert.equal(timeline.at(-1).id,'answer');assert.deepEqual(timeline.slice(1,-1),items);
 group.members=['chief'];assert.deepEqual(T.items(s,group),[]);
});
test('plans and empty work do not masquerade as messages, and legacy timestamps are marked',()=>{
 const group={id:'g',members:['a']},s={agents:[{id:'a'}],runs:{r:{runId:'r',target:'g',updatedAt:'2026-10-18T18:01:00Z',team:{entries:[{agentId:'a',task:'Not started',status:'queued',notes:'UNFINISHED'},{agentId:'a',status:'completed',notes:'Saved contribution'}]}}}};
 const items=T.items(s,group);assert.equal(items.length,1);assert.equal(items[0].body,'Saved contribution');assert.equal(items[0].approximate,true);
});
test('the group chat shows its agents talking to each other about the plan: Chief hands Forge a task, Forge hands in, Chief sends it back, in order, even with Chief outside the group',()=>{
 const group={id:'g',members:['forge','vera']},s={agents:[{id:'chief'},{id:'forge'},{id:'vera'}],groups:[group],runs:{}};
 const chats=[
  {id:'handoff:j1:request',fromAgentId:'chief',toAgentId:'forge',kind:'handoff',title:'Apply the revision items',body:'Forge, apply items 1 to 12 to version 09564456 and regenerate the DOCX, PDF and DOC.',at:'2026-10-24T17:30:00Z'},
  {id:'plan:d1:request',fromAgentId:'forge',toAgentId:'chief',kind:'result',title:'Apply the revision items',body:'All 12 items are applied.',at:'2026-10-24T18:00:00Z'},
  {id:'plan:d1:reply',fromAgentId:'chief',toAgentId:'forge',kind:'result',title:'Apply the revision items',verdict:'sent back',body:'Item 5 still leaves page 10 half empty: remove that page break.',at:'2026-10-24T18:02:00Z'},
  {id:'bad',fromAgentId:'chief',toAgentId:'chief',kind:'handoff',body:'to itself',at:'2026-10-24T18:03:00Z'},
  {id:'gone',fromAgentId:'removed',toAgentId:'forge',kind:'handoff',body:'from an agent no longer here',at:'2026-10-24T18:04:00Z'}];
 const items=T.items(s,group,chats);
 assert.deepEqual(items.map(i=>[i.agentId,i.toAgentId,i.messageKind,i.reply]),[['chief','forge','handoff',false],['forge','chief','result',false],['chief','forge','result',true]]);
 assert.equal(items[2].verdict,'sent back');assert.ok(items.every(i=>i.variant==='agent-message'&&i.planChat===true));
 const events=items.map(item=>({id:item.id,exchangeId:item.id,fromAgentId:item.agentId,toAgentId:item.agentId,at:item.createdAt,item}));
 const timeline=M.mergeTimeline(s,'g',[{id:'ask',createdAt:'2026-10-24T17:29:00Z'},{id:'later',createdAt:'2026-10-24T19:00:00Z'}],events);
 assert.deepEqual(timeline.map(m=>m.id),['ask','plan:handoff:j1:request','plan:plan:d1:request','plan:plan:d1:reply','later'],'Chief’s messages show though Chief is not a member of the group');
});
