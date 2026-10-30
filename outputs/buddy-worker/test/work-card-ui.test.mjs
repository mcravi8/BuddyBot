import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';import {mkdtemp,rm} from 'node:fs/promises';import {existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
// The work card (29 Oct): a stage is one card in the group chat, where it started, that follows the work: its tasks with who has each at the
// right (their figures in one column), the steps a task took on hover or tap, what Chief decided with a way to change it, Chief's question
// answered from the card, and the line above the composer bringing the card back into view. A background task in an agent's own chat is a
// card of its steps. Light, dark and a phone.
const skip=process.platform!=='darwin'||!existsSync('/Applications/Google Chrome.app');
async function open(context){
 const page=context.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('../../relay/index.html',import.meta.url).href);await page.waitForFunction(()=>!!window.BuddyWorkerUI&&!!window.BuddyPlan&&!!window.BuddyWorkCard);
 await page.evaluate(()=>{
  document.getElementById('onboarding-root').innerHTML='';closeModal();
  state.agents=[{id:'chief',name:'Chief',role:'Chief of staff',avatarShape:'star',avatarColor:'lilac',setupStatus:'ready',tools:{}},{id:'lyra',name:'Lyra',role:'Research',avatarShape:'cube',avatarColor:'cobalt',setupStatus:'ready',tools:{}},{id:'scout',name:'Scout',role:'Errands',avatarShape:'pebble',avatarColor:'green',setupStatus:'ready',tools:{}}];
  state.groups=[{id:'team',name:'Apartment hunt',members:['chief','lyra','scout'],objective:'Move near campus',managedBy:'chief',createdAt:'2026-10-19T09:00:00Z'}];
  state.onboarding={status:'completed',agentId:'chief'};state.proposals=[];state.teamPlans=[];state.tasks=[];
  state.runs={r5:{runId:'r5',target:'lyra',key:state.conversationWorkspace+':lyra',status:'completed',userId:'u5',replyId:'reply-5',text:'Find movers'}};
  state.messages={team:[{id:'ask',who:'you',body:'Find me a place near campus under $2,200 and set up viewings. Decide the small stuff yourselves.',time:'16:00',createdAt:'2026-10-29T16:00:00Z'}],chief:[],scout:[],
   lyra:[{id:'u5',who:'you',body:'Find two movers for December.',time:'15:00',live:true},{id:'reply-5',who:'lyra',runId:'r5',live:true,status:'completed',time:'15:01',body:'I started a background task for it.',tasks:[{id:'w5',title:'Find two movers'}]}]};
  state.drafts={team:''};state.attachments={};ui.view={kind:'chat',target:'team'};ui.lastChat='team';
  const ago=min=>new Date(Date.now()-min*60000).toISOString();
  const task=(id,title,assignee,status,extra={})=>({id,title,assignee,kind:'research',status,workerTaskId:'',workerStatus:'',blockedOn:'none',resultSummary:'',updatedAt:ago(4),...extra});
  window.plan={id:'p1',groupId:'team',objective:'Move near campus',supervisorId:'chief',status:'active',revision:2,scope:{through:2,quote:'Get stages 1–2 done',at:ago(60),status:'active'},
   stages:[{id:'s1',n:1,title:'Set the budget',goal:'Agree a budget',acceptance:['A budget'],status:'done',tasks:[task('a1','Set the budget','lyra','done')]},
    {id:'s2',n:2,title:'Shortlist and book viewings',goal:'Three viewings',acceptance:['3 viewings on your calendar','Each under $2,200'],status:'working',tasks:[
     task('t1','Pull listings under $2,200 within 15 minutes of campus','lyra','dispatched',{workerTaskId:'w1',workerStatus:'running'}),
     task('t2','Check the walk and street noise for each','scout','dispatched',{workerTaskId:'w2',workerStatus:'running'}),
     task('t3','Put the viewings on your calendar','lyra','pending')],
     decisions:[{kind:'answer',by:'chief',question:'Walk or bike times?',choice:'Walking times only',rationale:'You said you walk to campus.',taskId:'t2',at:ago(2)}]},
    {id:'s3',n:3,title:'Apply',goal:'Apply',acceptance:['An application sent'],status:'proposed',tasks:[]}],
   notices:[{id:'n2',kind:'authorized',text:'Stage 2 started: Shortlist and book viewings.',chat:true,status:'open',at:ago(30),refs:{stageId:'s2',started:true}}],
   run:{state:'working',working:[{agentId:'lyra',title:'Pull listings under $2,200 within 15 minutes of campus',since:ago(12)},{agentId:'scout',title:'Check the walk and street noise for each',since:ago(3)}],needsYou:0,idleSince:null}};
  window.jobs=[{id:'w1',agentId:'lyra',workspace:state.conversationWorkspace,title:'Pull listings',status:'running',progress:'Reading listings on 4 sites',trail:[{at:ago(11),text:'Opened Zillow, Apartments.com and USC Housing'},{at:ago(5),text:'41 listings under $2,200'}],updatedAt:ago(1)},
   {id:'w2',agentId:'scout',workspace:state.conversationWorkspace,title:'Check the walk',status:'running',progress:'Walking times from each address',trail:[{at:ago(3),text:'Walking times from each address'}],updatedAt:ago(1)},
   {id:'w5',agentId:'lyra',workspace:state.conversationWorkspace,title:'Find two movers',status:'running',progress:'Reading reviews',trail:[{at:ago(8),text:'Searched movers near campus'},{at:ago(2),text:'Reading reviews'}],updatedAt:ago(1)}];
  window.operations=[];
  const status=()=>({workspace:state.conversationWorkspace,online:true,paused:false,tasks:structuredClone(jobs),routines:[],decisions:[],notifications:{},plans:[structuredClone(plan)],pulse:{agents:{lyra:{state:'working',taskId:'w1'},scout:{state:'working',taskId:'w2'}}},supervisorLane:{online:true,busy:false}});
  window.BuddyDesktop={saveState:async()=>({saved:true}),worker:async p=>{operations.push(JSON.parse(JSON.stringify(p)));
   if(['status','start'].includes(p.operation))return status();
   if(p.operation==='plan'&&p.arguments?.action==='answer'){plan.notices=plan.notices.map(n=>n.id===p.arguments.escalationId?{...n,status:'answered',refs:{...n.refs,answer:p.arguments.answer}}:n);return {plan:structuredClone(plan)};}
   if(p.operation==='notify')return {notifications:{}};if(p.operation==='detail')return {task:null};
   throw Error('Unexpected fixture operation '+p.operation);}};
  render();
 });
 await page.evaluate(()=>BuddyWorkerUI.refresh(false));
 return {page,errors};
}
// Where the card sits, and whether anything in it spills or crowds: names before figures, figures in one column, buttons at the bottom right.
const measure=page=>page.evaluate(()=>{
 const card=document.querySelector('#messages .work-card[data-work-card="p1:s2"]');if(!card)return null;
 const c=card.getBoundingClientRect(),bubble=card.closest('.bot-bubble').getBoundingClientRect(),issues=[];
 if(c.right>bubble.right+1||c.left<bubble.left-1)issues.push('the card is wider than its bubble');
 if(card.scrollWidth>card.clientWidth+1)issues.push('the card overflows sideways');
 const figures=[...card.querySelectorAll('.wc-who')].map(w=>({last:w.lastElementChild?.tagName,right:w.lastElementChild?.getBoundingClientRect().right}));
 if(figures.some(f=>f.last!=='CANVAS'))issues.push('a figure is not after its name');
 const rights=figures.map(f=>Math.round(f.right));if(Math.max(...rights)-Math.min(...rights)>1)issues.push(`the figures are not in one column: ${rights}`);
 const rows=[...card.querySelectorAll('.wc-row')].map(r=>r.getBoundingClientRect());
 for(let i=1;i<rows.length;i++)if(rows[i].top<rows[i-1].bottom-1)issues.push('two rows overlap');
 const main=card.querySelector('.wc-ask .primary-button,.plan-card-actions .primary-button');
 if(main){const b=main.getBoundingClientRect();if(c.right-b.right>40)issues.push('the main button is not at the right');if(c.bottom-b.bottom>40)issues.push('the main button is not at the bottom');}
 return {issues,figures:figures.length,overflow:document.documentElement.scrollWidth-innerWidth};
});

test('a stage is one card that follows the work: who has what, the steps on hover or tap, what Chief decided, and the line above the composer brings it back',{skip,timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buddy-work-card-'));let context;
 try{
  context=await chromium.launchPersistentContext(join(dir,'browser.noindex'),{channel:'chrome',headless:true,viewport:{width:1280,height:900},reducedMotion:'reduce'});
  await context.route('**/*',r=>/^https?:/.test(r.request().url())?r.abort():r.continue());
  const {page,errors}=await open(context);
  const card=page.locator('#messages .work-card[data-work-card="p1:s2"]');await card.waitFor({timeout:8000});
  assert.equal(await card.getAttribute('data-work-state'),'working');
  assert.equal(await card.locator('.wc-row').count(),3);
  assert.deepEqual(await card.locator('.wc-who').allInnerTexts(),['Lyra · for 12 min','Scout · for 3 min','Lyra']);
  assert.equal(await card.locator('.wc-live').innerText(),'Lyra: Reading listings on 4 sites · 1 more at once');
  assert.match(await page.locator('#messages [data-chat-item="plan-notice-n2"] .team-chat-author').innerText(),/Chief\s+Stage 2/,'under Chief’s name');
  for(const [width,theme] of [[1280,'light'],[1280,'dark'],[390,'light']]){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>{BuddyTheme.choose(t);render();},theme);await card.waitFor();
   const m=await measure(page);
   assert.equal(m.figures,3,`every task shows its agent's figure at ${width}px in ${theme}`);
   assert.deepEqual(m.issues,[],`nothing spills or crowds at ${width}px in ${theme}`);assert.ok(m.overflow<=0,`the page never scrolls sideways at ${width}px`);
  }
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{BuddyTheme.choose('light');render();});
  // The steps a task took: on hover, kept open with a tap through a redraw, closed with Escape.
  const first=card.locator('.wc-row').first(),pop=first.locator('.wc-pop');
  assert.equal(await pop.isVisible(),false);
  await first.locator('.wc-task').hover();await pop.waitFor();
  assert.match(await pop.innerText(),/Lyra’s steps\s+[\d:]+\s*[AP]?M?\s*Opened Zillow, Apartments.com and USC Housing\s+[\d:]+\s*[AP]?M?\s*41 listings under \$2,200/);
  await page.mouse.move(5,5);await pop.waitFor({state:'hidden'});
  await first.locator('.wc-task').click();await page.mouse.move(5,5);
  await page.evaluate(()=>refreshLiveChat('team'));
  assert.equal(await card.locator('.wc-row').first().locator('.wc-pop').isVisible(),true,'a tapped task keeps its steps open through a redraw');
  assert.equal(await card.locator('.wc-row').first().locator('.wc-task').getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');await card.locator('.wc-row').first().locator('.wc-pop').waitFor({state:'hidden'});
  // What Chief decided without asking, and a way to say otherwise, in the person's own words.
  const decision=card.locator('.wc-decision');
  assert.equal(await decision.innerText(),'Chief answered: Walking times only. You said you walk to campus. Change');
  await decision.getByRole('button',{name:'Change',exact:true}).click();
  assert.equal(await page.locator('#message-input').inputValue(),'About Chief’s decision on “Check the walk and street noise for each”: ');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'message-input');
  await page.locator('#message-input').fill('');
  // A new step redraws the card.
  await page.evaluate(()=>{jobs[0].trail.push({at:new Date().toISOString(),text:'Saved Shortlist.xlsx'});jobs[0].progress='Saving Shortlist.xlsx';});
  await page.evaluate(()=>BuddyWorkerUI.refresh(false));
  await card.locator('.wc-live').filter({hasText:'Lyra: Saving Shortlist.xlsx'}).waitFor({timeout:8000});
  // Out of sight, the line above the composer brings the card back; in sight, it opens the plan view as before.
  await page.evaluate(()=>{for(let i=0;i<30;i++)state.messages.team.push({id:'later-'+i,who:i%2?'chief':'you',body:'Another message about the move, number '+i+'.',time:'16:30'});render();const b=document.getElementById('chat-body');b.scrollTop=b.scrollHeight;});
  const inView=()=>page.evaluate(()=>{const c=document.querySelector('#messages .work-card[data-work-card="p1:s2"]').getBoundingClientRect(),b=document.getElementById('chat-body').getBoundingClientRect();return c.top>=b.top-1&&c.bottom<=b.bottom+1;});
  assert.equal(await inView(),false);
  await page.locator('.composer-wrap > .stage-strip').click();
  await page.waitForFunction(()=>{const c=document.querySelector('#messages .work-card[data-work-card="p1:s2"]').getBoundingClientRect(),b=document.getElementById('chat-body').getBoundingClientRect();return c.top>=b.top-1&&c.bottom<=b.bottom+1;},null,{timeout:5000});
  assert.equal(await page.locator('#chat-body').isVisible(),true,'the chat stays: the card came into view');
  await page.locator('.composer-wrap > .stage-strip').click();
  await page.locator('[data-chat-pane="plan"] .plan-strip').waitFor({timeout:5000});
  await page.keyboard.press('Escape');await page.locator('#chat-body').waitFor();
  // Chief's question for the person is in the card, with its buttons; its own message is not shown again; the answer is sent once.
  await page.evaluate(()=>{plan.notices.push({id:'e1',kind:'escalation',chat:true,status:'open',at:new Date().toISOString(),text:'Send three viewing requests from your Gmail? Scout wrote them. My recommendation: Send them. The team keeps working on the rest meanwhile.',refs:{stageId:'s2',taskId:'t2',category:'third_party',question:'Send three viewing requests from your Gmail? Scout wrote them.',recommendation:'Send them'}});plan.run.state='needs_you';});
  await page.evaluate(()=>BuddyWorkerUI.refresh(false));
  await page.waitForFunction(()=>document.querySelector('#messages .work-card[data-work-card="p1:s2"]')?.dataset.workState==='needs',null,{timeout:8000});
  assert.equal(await page.locator('#messages [data-chat-item="plan-notice-e1"]').count(),0,'the question is in the card, not again on its own');
  assert.match(await card.locator('.plan-card-decision').innerText(),/Needs you · something sent in your name\s+Send three viewing requests from your Gmail\?/);
  for(const [width,theme] of [[1280,'dark'],[390,'light']]){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>{BuddyTheme.choose(t);render();},theme);
   assert.deepEqual((await measure(page)).issues,[],`the question fits the card at ${width}px in ${theme}`);
  }
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{BuddyTheme.choose('light');render();});
  await card.getByRole('button',{name:'Approve',exact:true}).dblclick();
  await page.locator('#toast').filter({hasText:'Sent to Chief.'}).waitFor({timeout:8000});
  const answers=await page.evaluate(()=>operations.filter(o=>o.operation==='plan'&&o.arguments.action==='answer').map(o=>o.arguments));
  assert.deepEqual(answers,[{action:'answer',planId:'p1',escalationId:'e1',answer:'Approved. Go ahead with your recommendation: Send them',quote:'Approved. Go ahead with your recommendation: Send them'}],'one answer, the person’s own');
  await card.locator('.plan-card-decision').waitFor({state:'detached',timeout:8000});
  // A background task in an agent's own chat: a card of its steps, live while it works, done when it is.
  await page.evaluate(()=>navigate('chat','lyra'));
  const task=page.locator('#messages .task-work-card[data-work-task="w5"]');await task.waitFor({timeout:8000});
  assert.deepEqual(await task.locator('.wc-row').evaluateAll(rows=>rows.map(r=>r.className)),['wc-row done','wc-row working']);
  assert.equal(await task.locator('.wc-chip').innerText(),'Working');
  await task.getByRole('button',{name:/View task/}).waitFor();
  await page.evaluate(()=>{const j=jobs[2];j.trail.push({at:new Date().toISOString(),text:'Two movers saved to Movers.md'});j.status='completed';});
  await page.evaluate(()=>BuddyWorkerUI.refresh(false));
  await task.locator('.wc-chip').filter({hasText:'Done'}).waitFor({timeout:8000});
  assert.deepEqual(await task.locator('.wc-row').evaluateAll(rows=>rows.map(r=>r.className)),['wc-row done','wc-row done','wc-row done']);
  assert.deepEqual(errors,[]);
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});
