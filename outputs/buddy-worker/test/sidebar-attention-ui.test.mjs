import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';import {mkdtemp,rm} from 'node:fs/promises';import {existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
// The design canvas "Buddy notifications and + menu", option C (27 Oct): each chat row says its state (needs you, working, done), the bell
// shows only what needs the person in the sidebar, the + button opens a small menu with Create agent first, and New task leaves work once or
// on repeat (a routine).
test('rows say their state, the bell lists what needs you, and + offers Create agent first and a New task once or on repeat',{skip:process.platform!=='darwin'||!existsSync('/Applications/Google Chrome.app'),timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buddy-attention-'));let context;
 try{
  context=await chromium.launchPersistentContext(dir,{channel:'chrome',headless:true,viewport:{width:1100,height:760}});const page=context.pages()[0];
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(new URL('../../relay/index.html',import.meta.url).href);await page.waitForFunction(()=>!!window.BuddyActivity&&!!window.BuddyNewMenu);
  await page.evaluate(()=>{
   document.getElementById('onboarding-root').innerHTML='';closeModal();
   state.agents=[{id:'chief',name:'Chief',role:'Chief of staff',avatarShape:'diamond',avatarColor:'lilac',setupStatus:'ready',tools:{}},{id:'inbox',name:'Inbox',role:'Email',avatarShape:'sphere',avatarColor:'blue',setupStatus:'ready',tools:{}},{id:'lyra',name:'Lyra',role:'Writer',avatarShape:'hex',avatarColor:'peach',setupStatus:'ready',tools:{}},{id:'forge',name:'Forge',role:'Engineer',avatarShape:'capsule',avatarColor:'cobalt',setupStatus:'ready',tools:{}}];
   state.groups=[];state.onboarding={status:'completed',agentId:'chief'};state.runs={};state.tasks=[];state.proposals=[];
   state.messages={chief:[{id:'1',who:'chief',body:'I’ve reassigned the export.',time:'14:56'}],inbox:[],lyra:[],forge:[]};
   window.calls=[];BuddyDesktop={saveState:async()=>({saved:true}),worker:async p=>{calls.push(p);return p.operation==='routine'?{routine:{id:'r1',title:p.arguments.title,status:'active'}}:p.operation==='create'?{task:{id:'new',status:'queued'}}:{workspace:state.conversationWorkspace,tasks:[],routines:[],decisions:[],notifications:{}};}};
   ui.view={kind:'chat',target:'chief'};render();
   BuddyActivity.acceptWorker({workspace:state.conversationWorkspace,routines:[],notifications:{},
    decisions:[{id:'stopped:t1',kind:'stopped',agentId:'inbox',taskId:'t1',title:'Check AgentMail and Gmail',question:'The selected AI connection needs reconnecting',actionLabel:'Open task',audience:'user',createdAt:'2026-10-27T20:00:00Z'}],
    tasks:[{id:'t1',agentId:'inbox',title:'Check AgentMail and Gmail',status:'failed',workspace:state.conversationWorkspace,updatedAt:'2026-10-27T20:00:00Z'},
           {id:'t2',agentId:'lyra',title:'Draft the new caption wording',status:'running',workspace:state.conversationWorkspace,updatedAt:'2026-10-27T20:05:00Z'},
           {id:'t3',agentId:'forge',title:'Clean the report',status:'completed',workspace:state.conversationWorkspace,updatedAt:'2026-10-27T18:16:00Z'}]});
  });
  const line=id=>page.locator(`.chat-row[data-id="${id}"] .chat-snippet`).innerText();
  // Rows: what needs you, what is working, what is done; a quiet chat keeps its last message.
  assert.equal(await line('inbox'),'Needs you · Check AgentMail and Gmail');
  assert.equal(await line('lyra'),'Working · Draft the new caption wording');
  assert.equal(await line('forge'),'Done · Clean the report');
  assert.equal(await line('chief'),'I’ve reassigned the export.');
  // A redraw of the list keeps the state lines.
  await page.evaluate(()=>repaintChatList());
  assert.equal(await line('inbox'),'Needs you · Check AgentMail and Gmail');
  // The bell: only what needs you, in the sidebar; the chats come back with Show all, or the bell again.
  const bell=page.locator('.sidebar .activity-nav');
  await bell.click();
  assert.equal(await bell.getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.chat-list').isVisible(),false,'the chat list steps aside');
  const entries=page.locator('.needs-filter .needs-entry');
  assert.equal(await entries.count(),1);
  assert.match(await entries.first().innerText(),/Check AgentMail and Gmail[\s\S]*Open task/);
  assert.equal(await entries.first().getAttribute('data-worker-task'),'t1','the alert opens its task');
  assert.equal(await page.locator('.modal-overlay').count(),0,'no drawer opens');
  await page.getByRole('button',{name:'Show all',exact:true}).click();
  assert.equal(await page.locator('.chat-list').isVisible(),true);
  assert.equal(await page.locator('.needs-filter').count(),0);
  await bell.click();await bell.click();
  assert.equal(await page.locator('.needs-filter').count(),0,'the bell again brings the chats back');
  // +: a menu under the button, Create agent first; no list of agents; Agent suggestions only while some wait.
  await page.locator('.sidebar [data-action="new-chat"]').click();
  const rows=page.locator('.plus-menu .plus-row');
  assert.deepEqual((await rows.allInnerTexts()).map(t=>t.split('\n')[0]),['Create agent','Create group','New task']);
  assert.equal(await page.locator('.modal-overlay').count(),0,'no New chat window');
  await page.keyboard.press('Escape');assert.equal(await page.locator('.plus-menu').count(),0,'Escape closes it');
  // New task, now: a background task for the chosen agent.
  await page.locator('.sidebar [data-action="new-chat"]').click();await page.locator('[data-new-task]').click();
  await page.locator('#new-task-form .new-task-agent',{hasText:'Lyra'}).click();
  await page.locator('#new-task-form textarea').fill('Draft the new caption wording. Use the change sheet.');
  await page.getByRole('button',{name:'Start task',exact:true}).click();
  await page.waitForFunction(()=>calls.some(c=>c.operation==='create'));
  const made=await page.evaluate(()=>calls.find(c=>c.operation==='create'));
  assert.equal(made.agentId,'lyra');assert.equal(made.title,'Draft the new caption wording');assert.equal(made.goal,'Draft the new caption wording. Use the change sheet.');assert.equal(made.kind,'general');
  // New task, every week: a routine at the chosen time and day.
  await page.locator('.sidebar [data-action="new-chat"]').click();await page.locator('[data-new-task]').click();
  await page.locator('#new-task-form .new-task-agent',{hasText:'Inbox'}).click();
  await page.locator('#new-task-form textarea').fill('Check AgentMail and Gmail and tell me only what needs me.');
  await page.locator('#new-task-form .new-task-when label',{hasText:'Every week'}).click();
  await page.locator('#new-task-form [name=time]').fill('20:00');await page.locator('#new-task-form [name=day]').selectOption('2');
  await page.getByRole('button',{name:'Save routine',exact:true}).click();
  await page.waitForFunction(()=>calls.some(c=>c.operation==='routine'));
  const routine=await page.evaluate(()=>calls.find(c=>c.operation==='routine'));
  assert.equal(routine.agentId,'inbox');
  assert.deepEqual({action:routine.arguments.action,hour:routine.arguments.hour,minute:routine.arguments.minute,weekdays:routine.arguments.weekdays,kind:routine.arguments.kind},{action:'create',hour:20,minute:0,weekdays:[2],kind:'general'});
  assert.ok(routine.arguments.timeZone,'with this Mac’s time zone');
  assert.deepEqual(errors,[]);
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});
