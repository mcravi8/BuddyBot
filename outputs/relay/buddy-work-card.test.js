const {test}=require('node:test');const assert=require('node:assert/strict');
const Card=require('./buddy-work-card');
const NOW=Date.parse('2026-10-29T16:10:00Z'),ago=min=>new Date(NOW-min*60000).toISOString();
const names={chief:'Chief',lyra:'Lyra',scout:'Scout'};
const evil='<img src=x onerror=alert(1)>';
function fixture(){
  return {id:'p1',groupId:'g1',supervisorId:'chief',objective:'Move near campus',status:'active',scope:{through:2,status:'active'},
    run:{state:'working',working:[{agentId:'lyra',title:'Pull listings',since:ago(3)}]},
    stages:[
      {id:'s1',n:1,title:'Pick a budget',status:'done',acceptance:['A budget the person agreed'],tasks:[{id:'a1',title:'Set the budget',assignee:'lyra',status:'done',updatedAt:ago(40),resultSummary:'$2,200 a month',workerTaskId:'w0'}]},
      {id:'s2',n:2,title:'Shortlist and book viewings',status:'working',acceptance:['3 viewings on your calendar','Each under $2,200'],tasks:[
        {id:'t1',title:'Pull listings',assignee:'lyra',status:'dispatched',workerTaskId:'w1',workerStatus:'running',blockedOn:'none',updatedAt:ago(3)},
        {id:'t2',title:'Check the walk',assignee:'scout',status:'pending',blockedOn:'none'},
        {id:'t3',title:'Ask the landlords',assignee:'scout',status:'pending',blockedOn:'none'}],
        decisions:[{kind:'answer',by:'chief',question:'Which sites?',choice:'Zillow and USC Housing only',rationale:'They list the most places near campus.',taskId:'t1',at:ago(2)}]},
      {id:'s3',n:3,title:'Apply',status:'proposed',acceptance:[],tasks:[]}],
    notices:[
      {id:'n1',kind:'authorized',chat:true,status:'open',text:'Stages 1 and 2 authorized. The team is working on Stage 1 — Pick a budget. I\'ll report when it\'s done.',refs:{through:2,stageId:'s1'}},
      {id:'n2',kind:'stage_report',chat:true,status:'open',text:'Stage 1 is done: the budget is $2,200 a month.\n\nNext is Stage 2 — Shortlist and book viewings.',refs:{stageId:'s1'}},
      {id:'n3',kind:'authorized',chat:true,status:'open',text:'Stage 2 started: Shortlist and book viewings.',refs:{stageId:'s2',started:true}}]};
}
const jobs={w0:{id:'w0',status:'completed'},w1:{id:'w1',status:'running',progress:'Reading listings on 4 sites',trail:[{at:ago(9),text:'Opened Zillow'},{at:ago(4),text:'41 listings under $2,200'}]}};
const ctx=(over={})=>({names,sup:'Chief',now:NOW,jobs:id=>jobs[id]||null,avatar:id=>`<i class="fig" data-id="${id}"></i>`,...over});
const message=n=>({id:'plan-notice-'+n.id,planNotice:true,planId:'p1',noticeKind:n.kind,body:n.text});
const stage=(plan,n)=>plan.stages.find(s=>s.n===n);

test('a notice belongs to the stage it names, by reference, task, item key or its opening words',()=>{
  const plan=fixture(),at=n=>Card.stageOf(plan,n)?.id;
  assert.equal(at(plan.notices[0]),'s1');
  assert.equal(at({kind:'authorized',text:'Stages 2 and 3 authorized. The team is working on Stage 2 — Shortlist.'}),'s2');
  assert.equal(at({kind:'stuck',text:'The team is stuck on Stage 2 — Shortlist: no replies.'}),'s2');
  assert.equal(at({kind:'stuck',text:'Chief is stuck.',refs:{itemKeys:['stage_plan:s2']}}),'s2');
  assert.equal(at({kind:'escalation',text:'Send them?',refs:{taskId:'t3'}}),'s2');
  assert.equal(at({kind:'proposal',text:'Stage 2 is next',refs:{stageId:'s2'}}),undefined);
});

test('each stage\'s card goes where the stage started, and its later messages are shown in it',()=>{
  const plan=fixture();plan.notices.push({id:'n4',kind:'escalation',chat:true,status:'open',text:'Send three viewing requests from your Gmail?',refs:{stageId:'s2',taskId:'t3',category:'third_party',question:'Send three viewing requests from your Gmail?',recommendation:'Send them'}});
  const messages=[{id:'u1',who:'you',body:'Get stages 1 and 2 done'},...plan.notices.map(message),{id:'old',planNotice:true,planId:'p1',noticeKind:'stage_report',body:'Stage 2 is done: older words.'}];
  const shown=messages.map(m=>Card.forMessage(m,messages,[plan],ctx()));
  assert.equal(shown[0],null,'the person\'s message is not a plan message');
  assert.match(shown[1].html,/data-work-card="p1:s1"/);assert.equal(shown[1].label,'Stage 1');
  assert.deepEqual(shown[2],{hidden:true},'stage 1\'s report is in stage 1\'s card');
  assert.match(shown[3].html,/data-work-card="p1:s2"/);
  assert.deepEqual(shown[4],{hidden:true},'the question is in stage 2\'s card');
  assert.deepEqual(shown[5],{hidden:true},'a notice the plan no longer lists still finds its stage by its words');
  assert.equal(Card.forMessage({id:'x',planNotice:true,planId:'gone',body:'Stage 1 is done'},messages,[plan],ctx()),null,'an unknown plan is drawn as before');
});

test('a working stage shows each task with who has it and since when, what is happening now, and what Chief decided',()=>{
  const plan=fixture(),html=Card.stageCard(plan,stage(plan,2),ctx());
  assert.match(html,/data-work-state="working"/);assert.match(html,/class="wc-chip working">Working</);
  assert.match(html,/Stage 2 of 3 · <button type="button" class="wc-link" data-chat-view="plan">Whole plan<\/button>/);
  assert.equal((html.match(/<li class="wc-row /g)||[]).length,3);
  assert.match(html,/<span class="wc-who">Lyra · for 3 min<i class="fig" data-id="lyra"><\/i><\/span>/,'the figure comes after the name, so the figures line up at the right');
  assert.match(html,/<span class="wc-who">Scout<i class="fig" data-id="scout"><\/i><\/span>/,'a task not started yet shows only who has it');
  assert.match(html,/<p class="wc-live" role="status">.*Lyra: Reading listings on 4 sites<\/span><\/p>/);
  assert.match(html,/data-work-step="t1" aria-expanded="false" aria-describedby="wc-pop-t1">Pull listings/);
  assert.match(html,/Lyra’s steps<\/p><ol><li><time>[^<]*<\/time><span>Opened Zillow<\/span><\/li><li><time>[^<]*<\/time><span>41 listings under \$2,200/);
  assert.match(html,/<p class="wc-decision" title="Asked: Which sites\?"><b>Chief answered:<\/b> Zillow and USC Housing only. <span class="wc-why">They list the most places near campus.<\/span> <button type="button" class="wc-link" data-work-change="Pull listings" data-work-who="Chief">Change<\/button><\/p>/);
  assert.doesNotMatch(html,/wc-checks|wc-ask/,'no checks and nothing for the person while the work runs');
  const many=fixture();stage(many,2).tasks[1]={...stage(many,2).tasks[1],status:'dispatched',workerTaskId:'w9'};
  assert.match(Card.stageCard(many,stage(many,2),ctx()),/Lyra: Reading listings on 4 sites · 1 more at once/);
});

test('every word an agent wrote is drawn as text',()=>{
  const plan=fixture();stage(plan,2).title=evil;stage(plan,2).tasks[0].title=evil;stage(plan,2).decisions[0].choice=evil;jobs.w1.trail.push({at:ago(1),text:evil});
  const html=Card.stageCard(plan,stage(plan,2),ctx());jobs.w1.trail.pop();
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('a stage being planned, checked, stopped or replaced says so',()=>{
  let plan=fixture();stage(plan,2).tasks=[];
  let html=Card.stageCard(plan,stage(plan,2),ctx());
  assert.match(html,/>Planning</);assert.match(html,/Chief is planning this stage/);assert.doesNotMatch(html,/wc-rows/);
  plan=fixture();Object.assign(stage(plan,2),{status:'review'});for(const t of stage(plan,2).tasks)Object.assign(t,{status:'done',updatedAt:ago(1)});
  html=Card.stageCard(plan,stage(plan,2),ctx());
  assert.match(html,/>Being checked</);assert.match(html,/Chief is checking the stage against what done means/);
  assert.equal((html.match(/class="wc-check run"/g)||[]).length,2,'each "done when" is being checked');
  plan=fixture();plan.status='holding';
  assert.match(Card.stageCard(plan,stage(plan,2),ctx()),/data-work-state="stopped"[\s\S]*>Stopped</);
  plan=fixture();stage(plan,2).status='superseded';
  assert.match(Card.stageCard(plan,stage(plan,2),ctx()),/>Replaced</);
});

test('a question for the person is in the card with its own buttons, and a held task points to where it waits',()=>{
  let plan=fixture();plan.notices.push({id:'n4',kind:'escalation',chat:true,status:'open',text:'Send three viewing requests from your Gmail? Scout wrote them. My recommendation: Send them. The team keeps working on the rest meanwhile.',refs:{stageId:'s2',taskId:'t3',category:'third_party',question:'Send three viewing requests from your Gmail? Scout wrote them.',recommendation:'Send them'}});
  let html=Card.stageCard(plan,stage(plan,2),ctx());
  assert.match(html,/data-work-state="needs"/);assert.match(html,/class="wc-chip needs">Needs you</);
  assert.match(html,/data-plan-card="p1"/,'the plan\'s buttons find their plan');
  assert.match(html,/data-plan-answer="approve" data-notice="n4"/);assert.match(html,/Needs you · something sent in your name/);
  plan.notices[3].status='answered';
  assert.doesNotMatch(Card.stageCard(plan,stage(plan,2),ctx()),/data-plan-answer="approve"/,'an answered question leaves the card');
  plan=fixture();Object.assign(stage(plan,2).tasks[0],{status:'blocked',blockedOn:'user',workerStatus:'waiting_review'});
  html=Card.stageCard(plan,stage(plan,2),ctx());
  assert.match(html,/<li class="wc-row needs/);assert.match(html,/<strong>“Pull listings”<\/strong> needs you\./);
  assert.match(html,/<div class="wc-actions"><button type="button" class="primary-button" data-activity-open>See what needs you<\/button><\/div>/);
  plan=fixture();plan.notices.push({id:'n5',kind:'stuck',chat:true,status:'open',text:'The team is stuck on Stage 2 — Shortlist and book viewings: no landlord answers by email. Say how to go on.',refs:{itemKeys:['stage_plan:s2']}});
  html=Card.stageCard(plan,stage(plan,2),ctx());
  assert.match(html,/>Stuck</);assert.match(html,/no landlord answers by email\.<\/p>/);assert.doesNotMatch(html,/Say how to go on/);
  assert.match(html,/data-plan-answer="chat">Tell Chief</);
});

test('a finished stage leads with its result and files, folds its tasks, checks off what done means, and says what comes next',()=>{
  const plan=fixture(),files=[{path:'Shortlist.xlsx'}];
  let html=Card.stageCard(plan,stage(plan,1),ctx({files:(p,s)=>s.id==='s1'?files:[],filesHTML:list=>`<div class="saved-file-cards">${list.map(f=>f.path).join()}</div>`}));
  assert.match(html,/class="wc-chip done">Done</);
  assert.match(html,/<p class="wc-summary">Stage 1 is done: the budget is \$2,200 a month\.<\/p><div class="wc-files"><div class="saved-file-cards">Shortlist.xlsx<\/div><\/div>/);
  assert.match(html,/class="wc-check ok"/);
  assert.match(html,/data-work-fold="p1:s1" aria-expanded="false" aria-controls="wc-rows-p1s1">1 task<\/button><ol class="wc-rows" hidden id="wc-rows-p1s1">/);
  assert.match(html,/Result<\/p><p class="wc-pop-result">\$2,200 a month/);
  assert.match(html,/<div class="wc-foot">.*Stage 2 started/);
  const holding=fixture();Object.assign(holding,{status:'holding',scope:{through:1,status:'achieved'}});stage(holding,2).status='proposed';
  assert.match(Card.stageCard(holding,stage(holding,1),ctx()),/data-plan-authorize="2"[^>]*>Get stage 2 done</,'the next stage is the person\'s to start');
});

test('a background task is a card of its steps, live while it works, with the way to the whole task',()=>{
  const job={id:'w1',agentId:'lyra',status:'running',trail:[{at:ago(9),text:'Opened Zillow'},{at:ago(4),text:'Comparing six'}]};
  let html=Card.taskCard({id:'w1',title:'Find places',account:'you@example.com'},job,{names});
  assert.match(html,/data-work-task="w1"/);assert.match(html,/<span class="wc-sub">Lyra · Uses you@example.com<\/span>/);
  assert.match(html,/<li class="wc-row done">.*Opened Zillow.*<li class="wc-row working">.*Comparing six/);
  assert.match(html,/<div class="wc-actions"><button type="button" class="border-button" data-worker-task="w1"/);
  html=Card.taskCard({id:'w1',title:'Find places'},{...job,status:'waiting_review'},{names});
  assert.match(html,/>Needs you</);assert.match(html,/<li class="wc-row needs">.*Comparing six/);
  html=Card.taskCard({id:'w2',title:'Start'},{id:'w2',status:'queued',progress:'Starting Claude'},{});
  assert.match(html,/>Queued</);assert.match(html,/<p class="wc-live" role="status"><span>Starting Claude<\/span><\/p>/);
  const out=Card.taskCards([{id:'w1',title:'Find places'},{id:'gone',title:'Old',account:'a@b.c'}],{jobs:id=>id==='w1'?job:null},list=>`<receipt ${list[0].id}>`);
  assert.match(out,/data-work-task="w1"[\s\S]*<receipt gone>$/,'a task Buddy no longer has keeps its plain receipt');
});

test('the chat is drawn again when a task moves on, takes a step, or a decision is made, and not otherwise',()=>{
  const plan=fixture(),find=id=>jobs[id]||null,before=Card.signature([plan],find);
  assert.equal(Card.signature([fixture()],find),before);
  jobs.w1.trail.push({at:ago(0),text:'Saved Shortlist.xlsx'});const stepped=Card.signature([plan],find);jobs.w1.trail.pop();
  assert.notEqual(stepped,before);
  const decided=fixture();stage(decided,2).decisions.push({kind:'rework',by:'chief',choice:'Only one-bedrooms',taskId:'t1'});
  assert.notEqual(Card.signature([decided],find),before);
  const moved=fixture();stage(moved,2).tasks[1].status='dispatched';
  assert.notEqual(Card.signature([moved],find),before);
});
