import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';import {mkdtemp,rm} from 'node:fs/promises';import {existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
// The Code view (29 Oct): a coding task's card in the agent's chat draws its work as a lane graph (or a progress bar), shows what clashes with
// the person's folder with a choice for each, and brings the work in only on their tap, with those choices; the chat's Code tab lists the
// copy, its history and changed files, and reads one file's change when picked. Light, dark and a phone.
const skip=process.platform!=='darwin'||!existsSync('/Applications/Google Chrome.app');
async function open(context){
 const page=context.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('../../relay/index.html',import.meta.url).href);await page.waitForFunction(()=>!!window.BuddyWorkerUI&&!!window.BuddyCode&&!!window.BuddyProjectDock);
 await page.evaluate(()=>{
  document.getElementById('onboarding-root').innerHTML='';closeModal();
  state.agents=[{id:'forge',name:'Forge',role:'Builder',avatarShape:'pebble',avatarColor:'peach',setupStatus:'ready',tools:{}}];
  state.groups=[];state.onboarding={status:'completed',agentId:'forge'};state.proposals=[];state.teamPlans=[];state.tasks=[];
  state.runs={r1:{runId:'r1',target:'forge',key:state.conversationWorkspace+':forge',status:'completed',userId:'u1',replyId:'reply-1',text:'Add a Projects page'}};
  state.messages={forge:[{id:'u1',who:'you',body:'Add a Projects page with the six projects from my CV.',time:'15:00',live:true},{id:'reply-1',who:'forge',runId:'r1',live:true,status:'completed',time:'15:01',body:'I started a coding task for it.',tasks:[{id:'w1',title:'Projects page'}]}]};
  state.drafts={forge:''};state.attachments={};ui.view={kind:'chat',target:'forge'};ui.lastChat='forge';
  const ago=min=>new Date(Date.now()-min*60000).toISOString();
  window.job={id:'w1',kind:'coding',agentId:'forge',workspace:state.conversationWorkspace,title:'Projects page',status:'completed',progress:'Finished',updatedAt:ago(1),
   code:{head:'c5',folderId:'f1',folderName:'portfolio-site',fileCount:3,added:150,removed:3,updatedAt:ago(1),
    steps:[{hash:'c5',author:'forge',name:'Forge',kind:'step',message:'Tests for the Projects page',at:ago(3),fileCount:1},{hash:'c4',author:'forge',name:'Forge',kind:'step',message:'Projects grid with filters',at:ago(30),fileCount:2},{hash:'c1',author:'buddy',name:'Buddy',kind:'copy',message:'Copied 3 files from portfolio-site',at:ago(41),fileCount:3}],
    files:[{path:'src/pages/projects.astro',status:'new',added:138,removed:0,note:'The new Projects page'},{path:'index.html',status:'changed',added:6,removed:3},{path:'tests/projects.test.ts',status:'new',added:6,removed:0}],
    checks:[{kind:'test',label:'Tests',ok:true,summary:'all 18 pass',detail:'npm test · 6.2 s'},{kind:'lint',label:'Code style',ok:true,summary:'no problems',detail:'npx eslint .'}],
    compare:{head:'c5',folderId:'f1',bring:[{path:'src/pages/projects.astro'},{path:'tests/projects.test.ts'}],combined:[],ready:false,
     clashes:[{path:'index.html',to:'index.html',kind:'lines',hunks:[{line:3,yours:'<a href="/about">About</a>',agent:'<a href="/about">About me</a>\n<a href="/projects">Projects</a>'}]}]}}};
  window.operations=[];
  const status=()=>({workspace:state.conversationWorkspace,online:true,paused:false,tasks:[structuredClone(job)],routines:[],decisions:[],notifications:{},plans:[],pulse:{agents:{}},supervisorLane:{online:true,busy:false}});
  window.BuddyDesktop={saveState:async()=>({saved:true}),worker:async p=>{operations.push(JSON.parse(JSON.stringify(p)));
   if(['status','start'].includes(p.operation))return status();
   if(p.operation==='code'&&p.arguments.action==='diff')return {diff:{path:p.arguments.path,rows:[{kind:'hunk',text:'@@ -1,4 +1,5 @@'},{kind:'ctx',n:1,text:'<nav>'},{kind:'add',n:2,text:'<a href="/projects">Projects</a>'},{kind:'del',n:2,text:'<a href="/about">About me</a>'}]}};
   if(p.operation==='code'&&p.arguments.action==='bring'){job.code.broughtIn={at:new Date().toISOString(),files:['src/pages/projects.astro','tests/projects.test.ts'],left:['index.html']};job.code.compare={...job.code.compare,bring:[],clashes:[],ready:false};job.code.updatedAt=new Date().toISOString();return {task:structuredClone(job),broughtIn:job.code.broughtIn};}
   if(p.operation==='notify')return {notifications:{}};if(p.operation==='detail')return {task:null};
   throw Error('Unexpected fixture operation '+p.operation);}};
  render();
 });
 await page.evaluate(()=>BuddyWorkerUI.refresh(false));
 return {page,errors};
}
const fits=page=>page.evaluate(()=>{
 const card=document.querySelector('#messages .code-card');if(!card)return {issues:['no card']};
 const c=card.getBoundingClientRect(),bubble=card.closest('.bot-bubble,.message')?.getBoundingClientRect(),issues=[];
 if(bubble&&(c.right>bubble.right+1||c.left<bubble.left-1))issues.push('the card is wider than its message');
 if(card.scrollWidth>card.clientWidth+1)issues.push('the card overflows sideways');
 const main=card.querySelector('.code-actions .primary-button');if(main){const b=main.getBoundingClientRect();if(c.right-b.right>40)issues.push('the main button is not at the right');}
 return {issues,overflow:document.documentElement.scrollWidth-innerWidth};
});

test('a coding task is a card of its work: lane graph or progress bar, its clash chosen, brought in on the person\'s tap, and a Code tab with each file\'s change',{skip,timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buddy-code-ui-'));let context;
 try{
  context=await chromium.launchPersistentContext(join(dir,'browser.noindex'),{channel:'chrome',headless:true,viewport:{width:1280,height:900},reducedMotion:'reduce'});
  await context.route('**/*',r=>/^https?:/.test(r.request().url())?r.abort():r.continue());
  const {page,errors}=await open(context);
  const card=page.locator('#messages .code-card[data-code-card="w1"]');await card.waitFor({timeout:8000});
  assert.equal(await card.locator('.wc-chip').innerText(),'Needs you');
  assert.deepEqual(await card.locator('.lg-row b').allInnerTexts(),['Your folder changed: 1 clash','Tests for the Projects page','Projects grid with filters','Forge copied 3 files from portfolio-site'],'the lane graph, newest at the top');
  for(const [width,theme] of [[1280,'light'],[1280,'dark'],[390,'light']]){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>{BuddyTheme.choose(t);render();},theme);await card.waitFor();
   const f=await fits(page);assert.deepEqual(f.issues,[],`nothing spills at ${width}px in ${theme}`);assert.ok(f.overflow<=0,`no sideways scroll at ${width}px`);
  }
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{BuddyTheme.choose('light');render();});
  // The progress bar is one tap away, and back.
  await card.getByRole('button',{name:'Progress bar',exact:true}).click();
  assert.deepEqual(await card.locator('.stop b').allInnerTexts(),['Copied your files','Made changes','Compared with your folder','Checked','In your folder']);
  assert.equal(await card.locator('.stop.needs small').first().innerText(),'1 clash with your edits');
  await card.getByRole('button',{name:'Lane graph',exact:true}).click();await card.locator('.lg').waitFor();
  // A clash: both sides shown; nothing comes in until a choice is made for it; then exactly those choices are sent, once.
  assert.match(await card.locator('.code-sides').innerText(),/Yours\s+<a href="\/about">About<\/a>\s+Forge’s\s+<a href="\/about">About me<\/a>/);
  const bring=card.getByRole('button',{name:'Bring in with these choices',exact:true});
  assert.equal(await bring.isDisabled(),true);
  await card.getByLabel('Keep yours').check();await bring.waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#messages .code-card [data-code-act="bring"]').disabled);
  await card.getByRole('button',{name:'Bring in with these choices',exact:true}).dblclick();
  await page.locator('#toast').filter({hasText:'Brought 2 files into your folder.'}).waitFor({timeout:8000});
  const sent=await page.evaluate(()=>operations.filter(o=>o.operation==='code'&&o.arguments.action==='bring').map(o=>o.arguments));
  assert.deepEqual(sent,[{action:'bring',taskId:'w1',choices:{'index.html':'yours'}}],'one bring-in, with the person\'s choice');
  assert.equal(await page.evaluate(()=>operations.find(o=>o.operation==='code'&&o.arguments.action==='bring').actorId),undefined,'the tap is the person\'s');
  await card.locator('.wc-chip').filter({hasText:'In your folder'}).waitFor({timeout:8000});
  await card.getByRole('button',{name:'Send to GitHub',exact:true}).waitFor();
  // The Code tab: the copy, where it is, its history, what changed by the agent's note, and one file's change read when picked.
  await page.locator('[data-chat-views] [data-chat-view="code"]').click();
  const tab=page.locator('[data-chat-pane="code"] .code-tab');await tab.waitFor({timeout:5000});
  assert.match(await tab.locator('.code-copy').first().innerText(),/Projects page\s+Forge’s copy · 3 steps\s+In your folder/);
  assert.equal(await tab.locator('.stop.done').count(),5,'every stop done once the work is in');
  await tab.locator('.code-diff tr.add').first().waitFor({timeout:5000});
  assert.equal(await tab.locator('.code-file[aria-pressed="true"] .code-file-name b').innerText(),'The new Projects page New');
  await tab.locator('[data-code-file="index.html"]').click();
  await page.waitForFunction(()=>operations.filter(o=>o.operation==='code'&&o.arguments.action==='diff').some(o=>o.arguments.path==='index.html'));
  await tab.locator('.code-diff-head').filter({hasText:'index.html'}).waitFor();
  assert.deepEqual(await tab.locator('.code-diff tr').evaluateAll(rows=>rows.map(r=>r.className)),['hunk','ctx','add','del']);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});
