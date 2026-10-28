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
  assert.equal(await mood(),'thinking','a reply begun with no words yet is the agent thinking');
  await page.evaluate(()=>{state.runs={r1:{runId:'r1',target:'lyra',status:'answering'}};state.messages.lyra=[{id:'m0',who:'lyra',runId:'r1',body:'',status:'answering'}];});
  assert.equal(await mood(),'thinking','still no words: still thinking');
  await page.evaluate(()=>{state.runs={};state.messages.lyra=[];BuddyFigures.setMode('lyra','working');});
  assert.equal(await mood(),'working','a task running is the agent working');
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

// The moods the person chose on 27 Oct (proposal "Agents that turn"): idle still; thinking squints and its corner holds at uneven heights,
// moving at uneven moments; working reads left to right in small jumps and sweeps back to the line below; writing a reply nods; done hops
// and nods once, with no lean; a new agent turns in, grows into place and nods hello. Agents move out of step.
test('each mood moves the body as chosen, and an agent created on its own appears',{skip:process.platform!=='darwin'||!existsSync('/Applications/Google Chrome.app'),timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buddy-fold-motion-'));let context;
 try{
  context=await chromium.launchPersistentContext(dir,{channel:'chrome',headless:true,viewport:{width:1280,height:860}});const page=context.pages()[0];
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(new URL('../../relay/index.html',import.meta.url).href);await page.waitForFunction(()=>!!window.BuddyFigures&&!!window.BuddyFoldAgents);
  const m=await page.evaluate(()=>{
   const at=(mood,from,to,step,seed=3)=>{const out=[];for(let t=from;t<=to+1e-9;t+=step)out.push(BuddyFold.motion(mood,t,seed));return out;};
   const idle=at('idle',0,10,.5);
   const think=at('thinking',0,30,.1),work=at('working',0,40,.05),other=at('working',0,40,.05,8);
   const peels=think.map(x=>x.peel),steps=peels.slice(1).map((v,i)=>Math.abs(v-peels[i]));
   // Working's turn along the first line: rises in small jumps with stops between, then drops back fast to start the next line.
   const yaw=work.map(x=>x.yaw);let rises=0,holds=0,sweep=0;
   for(let i=1;i<yaw.length;i++){const d=yaw[i]-yaw[i-1];if(d>.004)rises++;else if(Math.abs(d)<.0005)holds++;if(d<-.08)sweep++;}
   const done=at('done',0,2,.05),appear=at('appear',0,1.8,.05);
   return {
    idle:idle.every(x=>!x.yaw&&!x.pitch&&!x.hop&&x.zoom===1&&x.peel==null&&x.open===1),
    thinkOpen:Math.max(...think.map(x=>x.open)),thinkRange:Math.max(...peels)-Math.min(...peels),thinkHolds:steps.filter(d=>d<.002).length/steps.length,thinkUp:think.filter(x=>x.pitch>0).length/think.length,
    rises,holds,sweep,readDown:work.filter(x=>x.pitch<0).length/work.length,workPeelRange:Math.max(...work.map(x=>x.peel))-Math.min(...work.map(x=>x.peel)),
    apart:yaw.filter((v,i)=>Math.abs(v-other[i].yaw)>.05).length/yaw.length,
    doneHop:Math.min(...done.map(x=>x.hop)),doneNod:Math.min(...done.map(x=>x.pitch)),doneRest:BuddyFold.motion('done',BuddyFold.ONCE.done+.1,3),doneKeys:Object.keys(done[0]),
    appearStart:appear[0],appearEnd:BuddyFold.motion('appear',BuddyFold.ONCE.appear,3),appearTurn:appear[3].yaw
   };
  });
  assert.ok(m.idle,'idle is still');
  assert.ok(m.thinkOpen<=.5,`thinking squints: ${m.thinkOpen}`);
  assert.ok(m.thinkRange>.15&&m.thinkHolds>.25,`thinking's corner holds at uneven heights and moves between them: ${m.thinkRange} ${m.thinkHolds}`);
  assert.ok(m.thinkUp>.6,`thinking looks up: ${m.thinkUp}`);
  assert.ok(m.rises>40&&m.holds>100&&m.sweep>=3,`working reads in jumps with stops, and sweeps back line by line: ${m.rises} ${m.holds} ${m.sweep}`);
  assert.ok(m.readDown>.7,`working keeps its head down over the work: ${m.readDown}`);
  assert.ok(m.workPeelRange>.2,`working's corner jumps: ${m.workPeelRange}`);
  assert.ok(m.apart>.5,`two agents do not read in step: ${m.apart}`);
  assert.ok(m.doneHop<-.05&&m.doneNod<-.05,`done hops and nods: ${m.doneHop} ${m.doneNod}`);
  assert.ok(!m.doneKeys.includes('roll'),'done has no lean');
  assert.ok(!m.doneRest.hop&&!m.doneRest.pitch&&m.doneRest.zoom===1,'then rests');
  assert.ok(m.appearStart.zoom<.05&&m.appearStart.alpha<.05,'a new agent starts small and clear');
  assert.ok(m.appearTurn>.5,`and turns in from the side: ${m.appearTurn}`);
  assert.ok(!m.appearEnd.yaw&&!m.appearEnd.pitch&&m.appearEnd.zoom===1&&m.appearEnd.alpha===1,'ending in place, facing you');

  // In the app: the agents Buddy opens with simply show; one agent created on its own appears, then rests; several at once simply show.
  await page.evaluate(()=>{
   document.getElementById('onboarding-root').innerHTML='';closeModal();
   state.agents=[{id:'chief',name:'Chief',role:'Chief',avatarShape:'diamond',avatarColor:'lilac',setupStatus:'ready',tools:{}},{id:'lyra',name:'Lyra',role:'Writer',avatarShape:'hex',avatarColor:'peach',setupStatus:'ready',tools:{}}];
   state.groups=[];state.onboarding={status:'completed',agentId:'chief'};state.runs={};state.tasks=[];state.messages={chief:[],lyra:[]};
   BuddyDesktop={saveState:async()=>({saved:true})};ui.view={kind:'chat',target:'chief'};render();
  });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>BuddyFoldAgents.appearing('chief')||BuddyFoldAgents.appearing('lyra')),false,'agents that arrive together simply show');
  await page.evaluate(()=>{state.agents.push({id:'vera',name:'Vera',role:'Reviewer',avatarShape:'pill',avatarColor:'mint',setupStatus:'ready',tools:{}});state.messages.vera=[];render();});
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>BuddyFoldAgents.appearing('vera')),true,'an agent created on its own appears');
  await page.waitForTimeout(2300);
  assert.equal(await page.evaluate(()=>BuddyFoldAgents.appearing('vera')),false,'and then is simply there');
  const vera=await page.evaluate(()=>BuddyFoldAgents.pose('vera'));
  assert.ok(Math.abs(vera.yaw)<.01&&Math.abs(vera.zoom-1)<.01&&Math.abs(vera.alpha-1)<.01,`at rest, in place: ${JSON.stringify(vera)}`);
  // Working moves Lyra's body; Chief, idle, stays still.
  await page.evaluate(()=>BuddyFigures.setMode('lyra','working'));
  await page.waitForTimeout(900);
  const a=await page.evaluate(()=>BuddyFoldAgents.pose('lyra'));await page.waitForTimeout(1200);const b=await page.evaluate(()=>BuddyFoldAgents.pose('lyra'));
  assert.ok(a.pitch<0&&(Math.abs(a.yaw-b.yaw)>.02||Math.abs(a.peel-b.peel)>.02),`working reads with its head down: ${JSON.stringify([a,b])}`);
  const chief=await page.evaluate(()=>BuddyFoldAgents.pose('chief'));
  assert.ok(!chief.yaw&&!chief.pitch&&!chief.hop,'idle Chief stays still');
  assert.deepEqual(errors,[]);
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});
