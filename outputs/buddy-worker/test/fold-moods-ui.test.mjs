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

// The sidebar figures near the pointer look at it; those farther away keep looking ahead (27 Oct). What the eyes follow is each figure's gaze;
// reading the sidebar's own canvases back is not used, as Chrome smooths a canvas's edges differently once it has been read.
test('a sidebar figure near the pointer looks at it, and one far away does not',{skip:process.platform!=='darwin'||!existsSync('/Applications/Google Chrome.app'),timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buddy-fold-gaze-'));let context;
 try{
  context=await chromium.launchPersistentContext(dir,{channel:'chrome',headless:true,viewport:{width:1280,height:860}});const page=context.pages()[0];
  await page.goto(new URL('../../relay/index.html',import.meta.url).href);await page.waitForFunction(()=>!!window.BuddyFigures&&!!window.BuddyFoldAgents);
  await page.evaluate(()=>{
   document.getElementById('onboarding-root').innerHTML='';closeModal();
   state.agents=[{id:'chief',name:'Chief',role:'Chief',avatarShape:'diamond',avatarColor:'lilac',setupStatus:'ready',tools:{}},{id:'lyra',name:'Lyra',role:'Writer',avatarShape:'hex',avatarColor:'peach',setupStatus:'ready',tools:{}},{id:'vera',name:'Vera',role:'Reviewer',avatarShape:'pill',avatarColor:'mint',setupStatus:'ready',tools:{}}];
   state.groups=[];state.onboarding={status:'completed',agentId:'chief'};state.runs={};state.tasks=[];state.messages={chief:[],lyra:[],vera:[]};
   BuddyDesktop={saveState:async()=>({saved:true})};ui.view={kind:'chat',target:'chief'};render();
  });
  const pull=id=>page.evaluate(id=>document.querySelector(`.chat-row[data-id="${id}"] .fig-slot canvas.fold-fig`).foldGaze?.[0]||{x:0,y:0,w:0},id);
  await page.mouse.move(1100,700);await page.waitForTimeout(400);
  for(const id of ['chief','lyra','vera'])assert.ok((await pull(id)).w<.01,`${id} looks ahead with the pointer far away`);
  // Just right of Lyra's figure: Lyra looks right at it; Chief, a row up, and Vera, a row down, keep looking ahead.
  const box=await page.locator('.chat-row[data-id="lyra"] .fig-slot canvas.fold-fig').boundingBox();
  await page.mouse.move(box.x+box.width+18,box.y+box.height/2);await page.waitForTimeout(500);
  const lyra=await pull('lyra');
  assert.ok(lyra.w>.3&&lyra.x>.05&&Math.abs(lyra.y)<.02,`Lyra looks toward the pointer on its right: ${JSON.stringify(lyra)}`);
  for(const id of ['chief','vera'])assert.ok((await pull(id)).w<.01,`${id}, a row away, keeps looking ahead`);
  await page.mouse.move(1100,700);await page.waitForTimeout(800);
  assert.ok((await pull('lyra')).w<.01,'with the pointer gone, Lyra looks ahead again');
  // The drawing itself: at rest the same at any moment; a pointer close by moves the eyes; working moves the figure.
  const diffs=await page.evaluate(()=>{
   const shot=(t,p,look)=>{const c=document.createElement('canvas');c.width=c.height=100;const x=c.getContext('2d',{willReadFrequently:true});BuddyFold.draw(x,100,t,p,{shape:'hex',color:'#e07a2c',side:'right',look,details:{shadow:true}});return Array.from(x.getImageData(0,0,100,100).data);};
   const posed=(t,p,look,pose)=>{const c=document.createElement('canvas');c.width=c.height=100;const x=c.getContext('2d',{willReadFrequently:true});BuddyFold.drawPosed(x,100,t,p,{shape:'hex',color:'#e07a2c',side:'right',look,details:{shadow:true}},pose);return Array.from(x.getImageData(0,0,100,100).data);};
   const diff=(a,b)=>a.filter((v,i)=>v!==b[i]).length,rest={thinking:0,talking:0,done:0},none={x:0,y:0,w:0},work={thinking:1,talking:0,done:0};
   return {rest:diff(shot(1,rest,none),shot(13.7,rest,none)),pointer:diff(shot(1,rest,none),shot(1,rest,BuddyFold.gaze(30,0))),working:diff(shot(1,work,none),shot(1.6,work,none)),
     unposed:diff(shot(1,rest,none),posed(1,rest,none,{yaw:0,pitch:0})),turned:diff(shot(1,rest,none),posed(1,rest,none,{yaw:.4,pitch:0})),nodded:diff(shot(1,rest,none),posed(1,rest,none,{yaw:0,pitch:.25}))};
  });
  assert.equal(diffs.rest,0,'a resting figure is still');
  assert.ok(diffs.pointer>100&&diffs.working>100,`the pointer turns the eyes and work moves the figure: ${JSON.stringify(diffs)}`);
  assert.equal(diffs.unposed,0,'a body that is not turned is drawn as it is');
  assert.ok(diffs.turned>200&&diffs.nodded>200,`the body turns and nods (option B): ${JSON.stringify(diffs)}`);
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});
