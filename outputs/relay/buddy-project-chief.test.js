const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('./buddy-project-chief');
test('a project’s own Chief is one of the workspace’s agents, saved on the group; choosing the team’s Chief clears it',()=>{
 const state={agents:[{id:'chief'},{id:'lyra'}]},group={id:'g',members:['lyra']};
 assert.equal(P.choice(state,'lyra'),'lyra');assert.equal(P.choice(state,'removed'),'');assert.equal(P.choice(state,''),'');
 P.apply(group,'lyra');assert.equal(group.chiefId,'lyra');
 P.apply(group,'');assert.equal('chiefId' in group,false,'the team’s Chief again: nothing saved on the group');
});
