import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';import {mkdtemp,rm} from 'node:fs/promises';import {existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
// A fold figure moves only while its agent does something itself (27 Oct: Chief's and Lyra's peels kept moving while their finished results
// only waited for Chief). Waiting for the supervisor, queued or retrying later, it rests; a task running, a reply starting or being written
// moves it; a finished reply shows done.
test('a figure moves only while its agent works: waiting rests it, a task running or a reply starting moves it',{skip:process.platform!=='darwin'||!existsSync('/Applications/Google Chrome.app'),timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buddy-fold-moods-'));let context;
 try{
  context=await chromium.launchPersistentContext(dir,{channel:'chrome',headless:true,viewport:{width:1280,height:860}});const page=context.pages()[0];
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(new URL('../../relay/index.html',import.meta.url).href);await page.waitForFunction(()=>!!window.BuddyFigures&&!!window.BuddyFoldAgents);
  await page.evaluate(()=>{
   document.getElementById('onboarding-root').innerHTML='';closeModal();
   state.agents=[{id:'chief',name:'Chief',role:'Chief',avatarShape:'diamond',avatarColor:'lilac',setupStatus:'ready',tools:{}},{id:'lyra',name:'Lyra',role:'Writer',avatarShape:'hex',avatarColor:'peach',setupStatus:'ready',tools:{}}];
   state.groups=[];state.onboarding={status:'completed',agentId:'chief'};state.runs={};state.tasks=[];state.messages={chief:[],lyra:[]};
   BuddyDesktop={saveState:async()=>({saved:true})};ui.view={kind:'chat',target:'chief'};render();
  });
  const mood=()=>page.evaluate(()=>BuddyFoldAgents.current('lyra'));
  assert.equal(await mood(),'idle');
  // Queued, retrying or a result waiting for the supervisor's verdict: the worker's pulse says "planning", and the agent rests.
  await page.evaluate(()=>BuddyFigures.setMode('lyra','planning'));
  assert.equal(await mood(),'idle','work that only waits keeps the figure still');
  // A reply starting in Lyra's chat is Lyra getting to work.
  await page.evaluate(()=>{state.runs={r1:{runId:'r1',target:'lyra',status:'starting'}};});
  assert.equal(await mood(),'thinking','a reply starting moves the figure');
  await page.evaluate(()=>{state.runs={};BuddyFigures.setMode('lyra','working');});
  assert.equal(await mood(),'thinking','a task running moves the figure');
  await page.evaluate(()=>{state.runs={r2:{runId:'r2',target:'lyra',status:'answering'}};state.messages.lyra=[{id:'m',who:'lyra',runId:'r2',body:'Here is',status:'answering'}];});
  assert.equal(await mood(),'talking','writing a reply');
  await page.evaluate(()=>{state.runs={};BuddyFigures.setMode('lyra','done');});
  assert.equal(await mood(),'done');
  assert.deepEqual(errors,[]);
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});
