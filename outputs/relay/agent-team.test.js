'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Team=require('./agent-team.js');

const settings={name:'Sage',role:'Writing partner',description:'Draft clear copy and bring it back for review.',avatarShape:'diamond',avatarColor:'red',tools:{web:false,projectFiles:true},groupIds:['launch']};
function workspace(){return Team.migrate({agents:[{id:'morgan',name:'Morgan',role:'Coordinator',description:'Coordinate the team.',color:'morgan'}],groups:[{id:'launch',members:['morgan']}],messages:{morgan:[]},tasks:[]});}
function propose(state){return Team.proposeAgent(state,{proposedBy:'morgan',chat:'morgan',suggestion:settings,reason:'The project needs writing support.'});}

test('migration preserves the existing agent and separates appearance from identity',()=>{
  const state=workspace();
  assert.equal(state.agents[0].name,'Morgan');
  assert.equal(state.agents[0].avatarShape,'diamond');
  assert.equal(state.agents[0].avatarColor,'lilac');
  assert.deepEqual(state.proposals,[]);
});

test('an agent suggestion cannot create teammates, memberships, chats, or tasks',()=>{
  const state=workspace(),before=Team.copy(state);
  const proposal=propose(state);
  assert.equal(proposal.status,'pending');
  assert.deepEqual(state.agents,before.agents);
  assert.deepEqual(state.groups,before.groups);
  assert.deepEqual(state.messages,before.messages);
  assert.deepEqual(state.tasks,before.tasks);
  assert.throws(()=>Team.approveProposal(state,proposal.id,settings,{actor:'agent'}),/Only you/);
  assert.throws(()=>Team.createAgent(state,settings,{actor:'agent'}),/Only you/);
  assert.equal(state.agents.length,1);
  assert.equal(proposal.status,'pending');
});

test('saved edits survive persistence and retain the original suggestion',()=>{
  const state=workspace(),proposal=propose(state);
  Team.saveProposal(state,proposal.id,{...settings,name:'Cleo',avatarColor:'mint'});
  const restored=Team.migrate(Team.copy(state));
  assert.equal(restored.proposals[0].draft.name,'Cleo');
  assert.equal(restored.proposals[0].draft.avatarColor,'mint');
  assert.equal(restored.proposals[0].suggested.name,'Sage');
  assert.equal(restored.proposals[0].status,'pending');
  assert.equal(restored.agents.length,1);
});

test('approval adds the reviewed configuration exactly once to its chosen groups',()=>{
  const state=workspace(),proposal=propose(state);
  Team.saveProposal(state,proposal.id,{...settings,name:'Cleo'});
  const agent=Team.approveProposal(state,proposal.id,undefined,{actor:'user'});
  assert.equal(agent.name,'Cleo');
  assert.equal(agent.sourceProposalId,proposal.id);
  assert.deepEqual(state.messages[agent.id],[]);
  assert.equal(proposal.status,'approved');
  assert.equal(proposal.decidedBy,'you');
  assert.deepEqual(state.groups[0].members,['morgan',agent.id]);
  assert.equal(Team.approveProposal(state,proposal.id,undefined,{actor:'user'}),agent);
  assert.equal(state.agents.length,2);
  assert.equal(state.groups[0].members.length,2);
});

test('matching shapes remain independent and settings do not alias proposal snapshots',()=>{
  const state=workspace(),original=Team.copy(state.agents[0]),proposal=propose(state);
  const agent=Team.approveProposal(state,proposal.id,settings,{actor:'user'});
  Team.updateAgent(state,agent.id,{...settings,name:'Sage',avatarColor:'blue',tools:{web:true,projectFiles:false},description:'Plan the next project.'});
  assert.equal(agent.avatarShape,state.agents[0].avatarShape);
  assert.equal(agent.avatarColor,'blue');
  assert.deepEqual(state.agents[0],original);
  assert.equal(proposal.approved.avatarColor,'red');
  assert.equal(proposal.approved.tools.web,false);
  assert.equal(proposal.suggested.description,settings.description);
});

test('invalid approval is atomic and can be corrected without losing the proposal',()=>{
  const state=workspace(),proposal=propose(state),before=Team.copy(state);
  assert.throws(()=>Team.approveProposal(state,proposal.id,{...settings,name:'MORGAN'}),/already has this name/);
  assert.deepEqual(state,before);
  assert.throws(()=>Team.approveProposal(state,proposal.id,{...settings,groupIds:['missing']}),/no longer available/);
  assert.deepEqual(state,before);
  assert.equal(Team.approveProposal(state,proposal.id,settings).name,'Sage');
});

test('declining a proposal adds nothing and cannot later become an approval',()=>{
  const state=workspace(),proposal=propose(state),before=Team.copy(state);
  Team.declineProposal(state,proposal.id,{actor:'user'});
  assert.equal(proposal.status,'declined');
  assert.deepEqual(state.agents,before.agents);
  assert.deepEqual(state.groups,before.groups);
  assert.deepEqual(state.messages,before.messages);
  assert.throws(()=>Team.approveProposal(state,proposal.id,settings),/declined/);
});


test('old pink agents and proposal snapshots migrate to red without losing configuration or decisions',()=>{
  const state=workspace();
  state.agents[0].avatarColor='rose';
  const proposal=propose(state);
  proposal.suggested.avatarColor='rose';
  proposal.draft.avatarColor='rose';
  proposal.approved={...Team.copy(settings),avatarColor:'rose'};
  const before=Team.copy(state);
  Team.migrate(state);
  assert.equal(state.agents[0].avatarColor,'red');
  for(const key of ['suggested','draft','approved']){
    assert.deepEqual(state.proposals[0][key],{...before.proposals[0][key],avatarColor:'red'});
  }
  assert.equal(state.proposals[0].status,'pending');
  assert.deepEqual(state.messages,before.messages);
  assert.deepEqual(state.groups,before.groups);
  assert.deepEqual(Team.migrate(Team.copy(state)),state);
});

test('removed grey migrates to the new blue while existing light blue and green identities stay stable',()=>{
  const state=workspace();
  state.agents[0].avatarColor='stone';
  const proposal=propose(state);
  proposal.suggested.avatarColor='stone';
  proposal.draft.avatarColor='stone';
  proposal.approved={...Team.copy(settings),avatarColor:'stone'};
  const before=Team.copy(state);
  Team.migrate(state);
  assert.equal(state.agents[0].avatarColor,'cobalt');
  for(const key of ['suggested','draft','approved'])assert.deepEqual(state.proposals[0][key],{...before.proposals[0][key],avatarColor:'cobalt'});
  assert.equal(state.proposals[0].status,'pending');
  assert.deepEqual(state.messages,before.messages);
  assert.deepEqual(state.groups,before.groups);
  assert.deepEqual(Team.migrate(Team.copy(state)),state);
  assert.equal(Team.appearance({avatarColor:'blue'}).avatarColor,'blue');
  assert.equal(Team.appearance({avatarColor:'mint'}).avatarColor,'mint');
  assert.equal(Team.colorOptions.find(c=>c.id==='blue').name,'Light blue');
  assert.equal(Team.colorOptions.find(c=>c.id==='cobalt').name,'Blue');
  assert.equal(Team.colorOptions.find(c=>c.id==='mint').name,'Green');
});

test('four shapes from the 29 Oct figures, and every earlier shape name, saved or suggested, becomes one of them',()=>{
  assert.deepEqual(Team.shapeOptions.map(s=>s.id),['square','sphere','hex','diamond']);
  assert.deepEqual(Team.shapeOptions.map(s=>s.name),['Square','Circle','Hex','Diamond']);
  assert.deepEqual(Team.legacyShape,{star:'diamond',pebble:'sphere',cube:'hex',clover:'sphere',pill:'sphere',capsule:'sphere',arch:'square'});
  for(const [old,now] of Object.entries(Team.legacyShape))assert.equal(Team.appearance({avatarShape:old,avatarColor:'mint'}).avatarShape,now);
  assert.equal(Team.appearance({avatarShape:'hexagon'}).avatarShape,'diamond','an unknown shape falls back instead of breaking the avatar');
  assert.equal(Team.appearance({color:'scout'}).avatarShape,'sphere');
  const state=Team.migrate({agents:[{id:'a',name:'A',avatarShape:'cube',avatarColor:'rose'},{id:'b',name:'B',avatarShape:'arch',avatarColor:'gold'}],groups:[],proposals:[{suggested:{avatarShape:'clover'},draft:{avatarShape:'capsule'},approved:{avatarShape:'star'}}]});
  assert.equal(state.agents[0].avatarShape,'hex');assert.equal(state.agents[0].avatarColor,'red');assert.equal(state.agents[1].avatarShape,'square');
  assert.deepEqual(['suggested','draft','approved'].map(k=>state.proposals[0][k].avatarShape),['sphere','sphere','diamond']);
  assert.ok(!('avatarEyes' in state.agents[0]),'loading adds no eyes: they come from the role');
  assert.deepEqual(Team.migrate(Team.copy(state)),state,'migrating twice changes nothing');
});

test('eyes come from the first role word Buddy recognises, unless the person picked them',()=>{
  assert.equal(Team.eyeOptions.length,14);assert.equal(Team.eyeOptions[0].id,'default');
  const roles={'Chief of Staff & Agent Operations Lead':'chief','Inbox Monitor (AgentMail + Gmail)':'scout','Research Lead (question, literature, framing)':'research',
    'Quant Engineer (pipeline & reproducibility)':'math','Validator (skeptic & findings log)':'reviewer','Team lead':'chief','UX designer':'designer','Writing partner':'writer',
    'Customer support':'support','Sales outreach':'networker','Math tutor':'math','Data analyst':'analyst','Brainstorm buddy':'creative','Developer':'dev','Getting started':'default','':'default'};
  for(const [role,eyes] of Object.entries(roles))assert.equal(Team.eyesForRole(role),eyes,role);
  assert.equal(Team.eyesOf({role:'Developer'}),'dev');assert.equal(Team.eyesOf({role:'Developer',avatarEyes:'coach'}),'coach','a pick wins over the role');
  assert.equal(Team.eyesOf({role:'Developer',avatarEyes:'laser'}),'dev','an unknown pick falls back to the role');
  const state=workspace(),made=Team.createAgent(state,{...settings,name:'Eyes',avatarEyes:'scout'});
  assert.equal(made.avatarEyes,'scout');
  Team.updateAgent(state,made.id,{...settings,name:'Eyes',avatarEyes:''});
  assert.ok(!('avatarEyes' in made),'choosing eyes from the role again forgets the pick');
  assert.ok(!('avatarEyes' in Team.createAgent(state,{...settings,name:'Plain'})),'no pick, nothing saved');
});

test('seven colours carry a light ink, a dark ink and an author-name colour, and the figures draw the same inks',()=>{
  const Figures=require('./buddy-figures.js'),hex=/^#[0-9a-f]{6}$/;
  assert.equal(Team.colorOptions.length,7);
  assert.ok(!Team.colorOptions.some(c=>c.id==='rose'||c.id==='stone'));
  for(const color of Team.colorOptions){
    for(const key of ['ink','inkDark','text'])assert.match(color[key],hex,`${color.id}.${key}`);
    assert.deepEqual([color.ink,color.inkDark],Figures.INK[color.id],`${color.id} matches the figure engine`);
  }
  assert.deepEqual(Object.keys(Figures.INK),Team.colorOptions.map(c=>c.id));
  assert.equal(Team.avatarFilter,undefined,'the SVG recolouring filters are gone');
});

test('Mac app access defaults on, can be removed, and survives agent configuration and migration',()=>{
 const initial=Team.config({name:'Chief',role:'Chief of Staff',description:'Help with work.'});assert.equal(initial.tools.desktop,true);
 const configured=Team.config({...initial,tools:{...initial.tools,desktop:false}});assert.equal(configured.tools.desktop,false);
 const workspace={agents:[{...configured,id:'chief'}],groups:[],proposals:[]};Team.migrate(workspace);assert.equal(workspace.agents[0].tools.desktop,false);
});
