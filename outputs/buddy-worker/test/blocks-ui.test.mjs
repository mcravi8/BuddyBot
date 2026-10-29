import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';import {mkdtemp,rm} from 'node:fs/promises';import {existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
// Reply blocks (29 Oct): the nine blocks an agent can show are drawn by the page in the agent's bubble, in light and dark and on a phone, with
// nothing touching and every answer button at the bottom right; an Ask block is answered once, as the person's message, with its values.
const skip=process.platform!=='darwin'||!existsSync('/Applications/Google Chrome.app');
const BLOCKS=[
 {type:'compare',id:'places',from:'lyra',title:'Four places under $2,400',pick:'hoover',why:'the most room for the money.',source:'Listings Lyra read on 29 Oct',options:[
  {id:'hoover',label:'Hoover St. duplex',facts:[{label:'Rent',value:'$2,180'},{label:'Walk',value:'9 min'}],note:'Most room'},{id:'fig',label:'Figueroa Lofts 4B',facts:[{label:'Rent',value:'$2,390'},{label:'Walk',value:'6 min'}]},
  {id:'adams',label:'Adams Court 12',facts:[{label:'Rent',value:'$2,250'},{label:'Walk',value:'12 min'}]},{id:'vermont',label:'Vermont Ave. studio',facts:[{label:'Rent',value:'$1,960'},{label:'Walk',value:'15 min'}]}]},
 {type:'choice',id:'viewing',from:'lyra',question:'Which should I ask about a viewing?',multiple:true,recommend:['hoover'],submit:'Ask about these',options:[{id:'hoover',label:'Hoover St. duplex',detail:'$2,180 · 9 min walk'},{id:'adams',label:'Adams Court 12',detail:'$2,250 · 12 min walk'},{id:'vermont',label:'Vermont Ave. studio'}]},
 {type:'table',id:'pull',from:'lyra',title:'Monthly files',columns:[{label:'File',kind:'file'},{label:'Rows',kind:'number'},{label:'Missing',kind:'percent'}],rows:[[{file:'data/crsp_2023.csv',folderId:'f1'},53911,0.011],['crsp_2021.csv',51204,0.003],['crsp_2025.csv',55019,0.006]],source:'Thesis/data'},
 {type:'chart',id:'week',from:'lyra',kind:'bar',title:'Tasks finished this week',labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],series:[{name:'Tasks',values:[3,5,2,6,4,1,0]}]},
 {type:'stats',id:'summary',from:'lyra',title:'This week',numbers:[{label:'Tasks finished',value:21,note:'6 more than last week'},{label:'Background work',value:9.5,unit:'h'},{label:'Waiting on you',value:2,tone:'warn'}]},
 {type:'timeline',id:'deadlines',from:'lyra',title:'Application deadlines',events:[{date:'2026-10-27',title:'Online test',state:'done'},{date:'2026-10-31',title:'Cover letter',detail:'Draft is in Applications',state:'next'},{date:'2026-11-04',title:'First interview',state:'later'}]},
 {type:'files',id:'saved',from:'lyra',title:'What I saved',files:[{path:'results/drawdowns.xlsx',folderId:'f1',bytes:86016,note:'One sheet per mix'},{path:'results/old-run.csv',missing:true}]},
 {type:'form',id:'times',from:'lyra',title:'When can you go?',submit:'Send times',fields:[{id:'from',label:'Earliest day',kind:'date',value:'2026-11-02',required:true},{id:'slot',label:'Time of day',kind:'select',options:['Mornings','Afternoons','Evenings'],value:'Afternoons',required:true},{id:'notes',label:'Anything to mention',kind:'longtext'},{id:'pet',label:'Bringing a pet',kind:'toggle'}]},
 {type:'checklist',id:'include',from:'lyra',title:'Which files go into the summary?',submit:'Use these',checks:[{id:'xlsx',label:'drawdowns.xlsx',checked:true},{id:'md',label:'summary.md',checked:true},{id:'raw',label:'The CRSP files'}]},
];
async function open(context){
 const page=context.pages()[0],errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(new URL('../../relay/index.html',import.meta.url).href);await page.waitForFunction(()=>!!window.BuddyBlocks&&!!window.BuddyChat);
 await page.evaluate(blocks=>{
  document.getElementById('onboarding-root').innerHTML='';closeModal();
  state.agents=[{id:'lyra',name:'Lyra',role:'Research',avatarShape:'hex',avatarColor:'cobalt',setupStatus:'ready',tools:{}}];
  state.groups=[];state.onboarding={status:'completed',agentId:'lyra'};state.tasks=[];state.conversationWorkspace='11111111-1111-4111-8111-111111111111';
  state.runs={r1:{runId:'r1',target:'lyra',key:state.conversationWorkspace+':lyra',status:'completed',userId:'u1',replyId:'reply-1',text:'Find places'}};
  state.messages={lyra:[{id:'u1',who:'you',body:'Find places near campus under $2,400.',time:'10:02',live:true},{id:'reply-1',who:'lyra',runId:'r1',live:true,status:'completed',time:'10:03',body:'I found four that fit. Hoover St. is the best value.',blocks}]};
  window.sent=[];BuddyDesktop={saveState:async()=>({saved:true}),sendMessage:async payload=>{window.sent.push(payload);return {runId:payload.runId};}};
  ui.view={kind:'chat',target:'lyra'};render();
 },BLOCKS);
 return {page,errors};
}
// Boxes inside each block that touch or overlap their neighbour, answer buttons not at the bottom right, and anything wider than its bubble.
const layout=page=>page.evaluate(()=>{
 const issues=[];
 for(const block of document.querySelectorAll('.reply-block')){
  const box=block.getBoundingClientRect(),bubble=block.closest('.bot-bubble').getBoundingClientRect(),name=block.dataset.block;
  if(box.right>bubble.right+1||box.left<bubble.left-1)issues.push(`${name} is wider than its bubble`);
  if(block.scrollWidth>block.clientWidth+1)issues.push(`${name} overflows sideways`);
  for(const parent of [block,...block.querySelectorAll('.rb-ask,.rb-opts')]){
   const kids=[...parent.children].filter(k=>k.getBoundingClientRect().height>0);
   for(let i=1;i<kids.length;i++){const a=kids[i-1].getBoundingClientRect(),b=kids[i].getBoundingClientRect();if(b.top>=a.top+2&&b.top-a.bottom<4)issues.push(`${name}: ${kids[i-1].className} touches ${kids[i].className}`);}
  }
  const send=block.querySelector('.rb-send');
  if(send){const s=send.getBoundingClientRect(),row=send.closest('.rb-actions').getBoundingClientRect();if(row.right-s.right>1)issues.push(`${name}: its button is not at the right`);if(box.bottom-s.bottom>20)issues.push(`${name}: its button is not at the bottom`);}
 }
 return {issues,overflow:document.documentElement.scrollWidth-innerWidth,count:document.querySelectorAll('.reply-block').length};
});

test('the nine blocks are drawn in the reply in light, dark and on a phone, nothing touching, buttons at the bottom right',{skip,timeout:90000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buddy-blocks-'));let context;
 try{
  context=await chromium.launchPersistentContext(dir,{channel:'chrome',headless:true,viewport:{width:1280,height:900}});
  const {page,errors}=await open(context);
  for(const [width,theme] of [[1280,'light'],[1280,'dark'],[390,'light']]){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>{BuddyTheme.choose(t);render();},theme);
   const result=await layout(page);
   assert.equal(result.count,9,`all nine blocks are drawn at ${width}px in ${theme}`);
   assert.deepEqual(result.issues,[],`nothing touches or spills at ${width}px in ${theme}`);
   assert.ok(result.overflow<=0,`the page never scrolls sideways at ${width}px`);
  }
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{BuddyTheme.choose('dark');render();});
  const dark=await page.evaluate(()=>{const b=document.querySelector('.reply-block');return {bg:getComputedStyle(b).backgroundColor,fg:getComputedStyle(b).color};});
  assert.notEqual(dark.bg,'rgb(255, 255, 255)','dark mode draws blocks on its own card colour');assert.notEqual(dark.bg,dark.fg);
  await page.evaluate(()=>{BuddyTheme.choose('light');render();});
  // The pick, the suggestion, the missing file and the chart read as they should.
  assert.match(await page.locator('[data-block=places]').innerText(),/Lyra’s pick\s*Hoover St\. duplex/);
  assert.match(await page.locator('[data-block=viewing]').innerText(),/Lyra suggests/);
  assert.equal(await page.locator('[data-block=saved] .rb-missing').innerText(),'Not found');
  assert.equal(await page.locator('[data-block=week] rect').count(),6,'a zero draws no bar');
  // A table sorts by a number column as numbers.
  const firstFile=()=>page.locator('[data-block=pull] tbody tr').first().locator('td').first().innerText();
  await page.locator('[data-block=pull] [data-block-sort="1"]').click();
  assert.equal(await firstFile(),'crsp_2021.csv');
  await page.locator('[data-block=pull] [data-block-sort="1"]').click();
  assert.equal(await firstFile(),'crsp_2025.csv');
  assert.deepEqual(errors,[]);
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});

test('an Ask block is answered once, as the person\'s message, with its values and only their typed words',{skip,timeout:90000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buddy-block-answers-'));let context;
 try{
  context=await chromium.launchPersistentContext(dir,{channel:'chrome',headless:true,viewport:{width:1280,height:900}});
  const {page,errors}=await open(context);
  const send=page.locator('[data-block=viewing] .rb-send');
  assert.equal(await send.isDisabled(),true,'nothing picked, nothing to send');
  await page.locator('[data-block=viewing] .rb-opt',{hasText:'Hoover'}).click();await page.locator('[data-block=viewing] .rb-opt',{hasText:'Adams'}).click();
  // A draft survives the chat being drawn again.
  await page.evaluate(()=>render());
  assert.equal(await page.locator('[data-block=viewing] input[value=adams]').isChecked(),true,'what was picked survives a redraw');
  await page.locator('[data-block=viewing] .rb-send').dblclick();
  await page.waitForFunction(()=>window.sent.length>0);await page.waitForTimeout(200);
  const sent=await page.evaluate(()=>window.sent);
  assert.equal(sent.length,1,'a double-click sends one answer');
  assert.equal(sent[0].text,'The person answered your block "viewing" (Which should I ask about a viewing?): Hoover St. duplex, Adams Court 12\n{"block":"viewing","answer":{"picked":["hoover","adams"]}}');
  assert.deepEqual(sent[0].answer,{block:'viewing',typed:''},'an option the agent wrote is not the person\'s own words');
  assert.match(await page.locator('.user-message').last().innerText(),/Answer to “Which should I ask about a viewing\?”\s*Hoover St\. duplex, Adams Court 12/);
  assert.equal(await page.locator('[data-block=viewing] .rb-answered').innerText(),'Answered · Hoover St. duplex, Adams Court 12');
  assert.equal(await page.locator('[data-block=viewing] input:not(:disabled)').count(),0,'an answered block is locked');
  // The reply to that answer finishes; then the form is answered: what was typed is the person's own words, the list choice is not.
  await page.evaluate(()=>{const run=Object.values(state.runs).find(r=>r.answer);BuddyChat.apply(state,{runId:run.runId,status:'completed',text:'I will ask both.'});render();});
  await page.locator('[data-block=times] textarea').fill('A small dog');
  await page.locator('[data-block=times] input[type=date]').fill('');
  await page.locator('[data-block=times] .rb-send').click();await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.sent.length),1,'a required field left empty sends nothing');
  await page.locator('[data-block=times] input[type=date]').fill('2026-11-03');await page.locator('[data-block=times] .rb-toggle').click();
  await page.locator('[data-block=times] .rb-send').click();await page.waitForFunction(()=>window.sent.length===2);
  const form=await page.evaluate(()=>window.sent[1]);
  assert.match(form.text,/^The person answered your block "times" \(When can you go\?\): Earliest day: Tue 3 Nov · Time of day: Afternoons · Anything to mention: A small dog · Bringing a pet: yes\n/);
  assert.deepEqual(JSON.parse(form.text.split('\n')[1]),{block:'times',answer:{from:'2026-11-03',slot:'Afternoons',notes:'A small dog',pet:true}});
  assert.equal(form.answer.typed,'2026-11-03\nA small dog','typed words only, never the agent\'s labels or list options');
  // Answers are kept with the message: drawn again after a reload of the state, still answered.
  await page.evaluate(()=>{BuddyChat.apply(state,{runId:Object.values(state.runs).filter(r=>r.answer).at(-1).runId,status:'completed',text:'Got it.'});render();});
  assert.match(await page.locator('[data-block=times] .rb-answered').innerText(),/^Answered · Earliest day: Tue 3 Nov/);
  assert.equal(await page.evaluate(()=>Object.keys(state.messages.lyra.find(m=>m.id==='reply-1').blockAnswers).sort().join()),'times,viewing');
  assert.deepEqual(errors,[]);
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});

test('Buddy\'s existing cards put their answer buttons at the bottom right, the main one rightmost',{skip,timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buddy-card-buttons-'));let context;
 try{
  context=await chromium.launchPersistentContext(dir,{channel:'chrome',headless:true,viewport:{width:1100,height:800}});
  const {page,errors}=await open(context);
  const rows=await page.evaluate(()=>{
   const holder=document.createElement('div');holder.style.width='520px';holder.innerHTML=[
    '<div class="plan-card-row"><details class="plan-card-more"><summary>Details</summary></details><span class="plan-card-actions"><button class="primary-button">Approve</button><button class="border-button">Disapprove</button><button class="small-link">Reply</button></span></div>',
    '<div class="access-actions"><button class="primary-button">Allow</button><button class="border-button">Don’t allow</button></div>',
    '<div class="signin-actions"><button class="primary-button">Done</button><button class="border-button">Open the page</button></div>',
    '<section class="action-review"><form><fieldset><div class="action-choices"><button class="primary-button">Send email</button><button class="border-button">Decline</button></div></fieldset></form></section>'].join('');
   document.getElementById('chat-body').appendChild(holder);
   return [...holder.children].map(row=>{const box=row.getBoundingClientRect(),main=row.querySelector('.primary-button').getBoundingClientRect(),all=[...row.querySelectorAll('button')].map(b=>b.getBoundingClientRect().right);
    return {main:main.right,rightmost:Math.max(...all),edge:box.right};});
  });
  for(const [i,row] of rows.entries()){assert.equal(row.main,row.rightmost,`card ${i}: the main button is rightmost`);assert.ok(row.edge-row.rightmost<=20,`card ${i}: the buttons sit at the right`);}
  assert.deepEqual(errors,[]);
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});
