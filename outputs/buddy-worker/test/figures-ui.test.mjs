import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('figures are painted in rows, messages, previews and inline names; search, files and settings show them; appearance saves and reaches the app',{timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'buddy-figures-ui-'));let context;
 try{
  context=await chromium.launchPersistentContext(dir,{channel:'chrome',headless:true,viewport:{width:1280,height:860}});const page=context.pages()[0];
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(new URL('../../relay/index.html',import.meta.url).href);await page.waitForFunction(()=>!!window.BuddyFigures&&!!window.BuddyTheme&&!!window.BuddyFigureModes);
  await page.evaluate(()=>{
   document.getElementById('onboarding-root').innerHTML='';closeModal();
   // The original 3D shape names, as an older saved workspace would hold them.
   state.agents=[{id:'chief',name:'Chief',role:'Chief of staff',avatarShape:'star',avatarColor:'lilac',setupStatus:'ready',tools:{}},{id:'scout',name:'Scout',role:'Reviewer',avatarShape:'clover',avatarColor:'mint',setupStatus:'ready',tools:{}}];
   state.groups=[{id:'team',name:'Launch team',members:['chief','scout'],objective:'Ship it.'}];state.onboarding={status:'completed',agentId:'chief'};state.runs={};state.tasks=[];
   state.files=[{id:'f1',name:'plan.md',type:'Markdown',owner:'scout',revision:2,content:'# Plan'}];
   state.messages={chief:[{id:'m1',who:'you',body:'Hello',time:'10:00'},{id:'m2',who:'chief',body:'Hi there.',time:'10:01'}],scout:[],team:[{id:'t1',who:'chief',body:'Group reply.',time:'10:02'}]};state.drafts={};state.attachments={};
   window.appearance=[];BuddyDesktop={saveState:async()=>({saved:true}),setAppearance:c=>{appearance.push(c);}};ui.view={kind:'chat',target:'chief'};render();
  });
  await page.waitForTimeout(600);
  // Rows hold slots, each with its agent's fold figure (buddy-fold-agents.js); the one dot field behind them is painted.
  assert.equal(await page.locator('.sidebar canvas.sidebar-field').count(),1);
  assert.equal(await page.locator('.chat-row .fig-slot').count(),3);
  assert.equal(await page.locator('.chat-row .fig-slot canvas.fold-fig').count(),3);
  assert.equal(await page.locator('img.avatar,.avatar img').count(),0,'no image avatars remain');
  const litPixels=sel=>page.evaluate(selector=>{const c=document.querySelector(selector);if(!c)return -1;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>140)n++;return n;},sel);
  // Pixel check: each row's figure is painted, and the dot field draws no old head behind it (the control spot is empty space).
  const field=await page.evaluate(()=>{const f=document.querySelector('canvas.sidebar-field'),fr=f.getBoundingClientRect(),dpr=f.width/fr.width,ctx=f.getContext('2d');
   const count=d=>{let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>140)n++;return n;};
   const heavy=(cx,cy,r)=>count(ctx.getImageData(Math.max(0,(cx-r)*dpr),Math.max(0,(cy-r)*dpr),2*r*dpr,2*r*dpr).data);
   const rows=[...document.querySelectorAll('.chat-row .fig-slot')];
   const slots=rows.map(s=>{const c=s.querySelector('canvas.fold-fig');return c?count(c.getContext('2d').getImageData(0,0,c.width,c.height).data):-1;});
   const behind=rows.map(s=>{const r=s.getBoundingClientRect();return heavy(r.left-fr.left+r.width/2,r.top-fr.top+r.height/2,22);});
   return {slots,behind,empty:heavy(fr.width-30,fr.height-200,22)};});
  for(const n of field.slots)assert.ok(n>60,`a figure is painted at each row (${field.slots})`);
  for(const n of field.behind)assert.ok(n<5,`the dot field draws no old head behind a row's figure (${field.behind})`);
  assert.ok(field.empty<5,'empty sidebar space carries no figure (control)');
  assert.ok(await litPixels('.conversation-title canvas.fig')>60,'the header figure is painted');
  // The old names draw as the new figures before any migration runs, and loading a saved workspace rewrites them.
  assert.deepEqual(await page.evaluate(()=>RelayTeam.migrate(state).agents.map(a=>a.avatarShape)),['diamond','pill']);
  // Control: a canvas for an agent that does not exist stays blank.
  await page.evaluate(()=>{const c=document.createElement('canvas');c.className='fig';c.dataset.fig='agent';c.dataset.figId='nobody';c.dataset.size='40';c.width=40;c.height=40;c.id='ghost';document.getElementById('app').appendChild(c);});
  await page.waitForTimeout(400);assert.equal(await litPixels('#ghost'),0,'an unknown agent is not drawn');
  // Group messages show the author's figure; previews recolour live.
  await page.evaluate(()=>{ui.view={kind:'chat',target:'team'};render();});await page.waitForTimeout(500);
  assert.ok(await page.locator('.bot-message > .avatar canvas[data-fig]').count()>=1,'a group message has its author’s figure');
  // Search shows a figure for agents and groups, an icon for files.
  await page.evaluate(()=>searchModal());await page.locator('#workspace-search').fill('');await page.waitForTimeout(300);
  const results=await page.locator('#search-results .group-card').evaluateAll(cards=>cards.map(c=>({name:c.querySelector('strong').textContent,figure:!!c.querySelector('canvas[data-fig]'),icon:!!c.querySelector(':scope > svg')})));
  assert.deepEqual(results.map(r=>[r.name,r.figure]),[['Chief',true],['Scout',true],['Launch team',true],['plan.md',false]]);
  assert.ok(results[3].icon,'a file keeps its file icon');
  await page.evaluate(()=>closeModal());
  // Files: the owner is shown with a figure on the page and in the drawer.
  await page.evaluate(()=>{ui.view={kind:'files'};render();});await page.waitForTimeout(300);
  assert.ok(await page.locator('.files-table td .who canvas[data-fig]').count()===1&&/Scout/.test(await page.locator('.files-table td .who').innerText()));
  // Settings: the appearance block, and the first Buddy with its figure.
  await page.evaluate(()=>settings());await page.waitForTimeout(300);
  assert.ok(await page.locator('.settings-option .who canvas[data-fig]').count()===1);
  assert.deepEqual(await page.locator('.theme-card').evaluateAll(b=>b.map(x=>[x.dataset.themeChoice,x.getAttribute('aria-pressed')])),[['light','true'],['dark','false'],['system','false']]);
  await page.locator('.theme-card[data-theme-choice=dark]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');assert.equal(await page.evaluate(()=>state.theme),'dark');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(18, 18, 17)');
  assert.equal((await page.evaluate(()=>appearance)).at(-1),'dark','the app is told, so the window follows');
  await page.locator('.theme-card[data-theme-choice=system]').click();
  assert.equal(await page.evaluate(()=>state.theme),'system');assert.equal((await page.evaluate(()=>appearance)).at(-1),'system');
  await page.locator('.theme-card[data-theme-choice=light]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
  await page.evaluate(()=>{closeModal();state.hiddenAgents=['scout'];state.hiddenAgentsOpen=true;ui.view={kind:'chat',target:'scout'};render();});
  await page.waitForTimeout(400);
  const hiddenSpot=await page.locator('.hidden-agents [data-slot="row:scout"]').evaluate(el=>{const r=el.getBoundingClientRect(),f=document.querySelector('canvas.sidebar-field').getBoundingClientRect();return {x:r.left-f.left+r.width/2,y:r.top-f.top+r.height/2};});
  const atHiddenSpot=()=>page.evaluate(({x,y})=>{const f=document.querySelector('canvas.sidebar-field'),r=f.getBoundingClientRect(),d=f.width/r.width,data=f.getContext('2d').getImageData((x-22)*d,(y-22)*d,44*d,44*d).data;let n=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>140)n++;return n;},hiddenSpot);
  assert.ok(await atHiddenSpot()>60,'expanded Hidden agents are painted');
  await page.locator('.hidden-agents > summary').click();await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>state.hiddenAgentsOpen),false);
  assert.ok(await atHiddenSpot()<5,'collapsing Hidden removes its figures and selected-row paint from the shared canvas');
  await page.locator('.hidden-agents > summary').focus();await page.keyboard.press('Space');await page.waitForTimeout(400);
  assert.ok(await atHiddenSpot()>60,'keyboard expansion paints the figures again');
  await page.locator('.hidden-agents > summary').click();
  await page.evaluate(()=>{BuddyDesktop.saveState=async value=>{window.savedWorkspace=JSON.parse(value);return {saved:true};};window.keptConversation=document.getElementById('messages');});
  await page.locator('#message-input').fill('Keep this draft while changing the sidebar');
  await page.getByRole('button',{name:'Compact sidebar',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().width===78,null,{timeout:3000});
  assert.equal(await page.locator('.sidebar').evaluate(e=>e.getBoundingClientRect().width),78,'the sidebar finishes sliding to its icon width');
  assert.equal(await page.locator('.chat-row-copy').first().isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'Open Launch team chat',exact:true}).getAttribute('title'),'Launch team');
  assert.equal(await page.locator('#message-input').inputValue(),'Keep this draft while changing the sidebar');
  assert.equal(await page.evaluate(()=>keptConversation===document.getElementById('messages')),true,'layout changes preserve the conversation DOM and scroll position');
  await page.evaluate(()=>BuddyActivity.acceptWorker({workspace:state.conversationWorkspace,tasks:[{id:'attention',agentId:'chief',status:'waiting_user',title:'Needs a decision',progress:'Choose a source.'}],routines:[]}));
  assert.equal(await page.locator('.chat-row[data-id="chief"] .compact-chat-badge .activity-dot.needs').isVisible(),true,'compact figures retain their notification badges');
  await page.getByRole('button',{name:'Open Chief chat',exact:true}).click();
  assert.equal(await page.locator('.chat-row[data-id="chief"]').getAttribute('aria-current'),'page');
  assert.equal(await page.locator('.sidebar').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().width>200,null,{timeout:3000});
  assert.ok(await page.locator('.sidebar').evaluate(e=>e.getBoundingClientRect().width)>200);
  await page.getByRole('button',{name:'Compact sidebar',exact:true}).click();
  await page.getByRole('button',{name:'Search chats',exact:true}).click();
  assert.equal(await page.locator('#chat-search').evaluate(e=>e===document.activeElement),true,'compact search expands directly into the search field');
  await page.locator('#chat-search').fill('Scout');
  assert.equal(await page.locator('.hidden-agents [data-id="scout"]').isVisible(),true);
  await page.locator('#chat-search').fill('');
  await page.getByRole('button',{name:'Compact sidebar',exact:true}).click();
  await page.waitForFunction(()=>savedWorkspace?.sidebarCompact===true&&savedWorkspace.hiddenAgentsOpen===false);
  const saved=await page.evaluate(()=>savedWorkspace);
  await page.addInitScript(data=>{window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};window.BuddyDesktop={initialState:JSON.stringify(data),saveState:async value=>{window.savedWorkspace=JSON.parse(value);return {saved:true};}};},saved);
  await page.reload();await page.waitForFunction(()=>!!window.BuddyActivity);
  assert.equal(await page.evaluate(()=>state.sidebarCompact),true,'compact layout survives reopening');
  assert.equal(await page.locator('.hidden-agents').getAttribute('open'),null);
  await page.waitForTimeout(150);
  assert.ok(await litPixels('.conversation-title canvas.fig')>60,'figures paint when background WebKit suspends animation callbacks');
  await page.locator('.hidden-agents > summary').click();await page.waitForTimeout(150);
  // The hidden agent's fold figure (its own canvas in the row's slot) is painted at its open size.
  // A closed section shows none of its contents, whatever layout box the browser keeps for them.
  const suspendedPixels=()=>page.locator('.hidden-agents .fig-slot canvas.fold-fig').evaluate(c=>!c.closest('details:not([open])')&&c.clientWidth>0&&c.width>=Math.round(c.clientWidth)?c.getContext('2d').getImageData(0,0,c.width,c.height).data.filter((v,i)=>i%4===3&&v>140).length:0);
  assert.ok(await suspendedPixels()>60,'Hidden expands without animation callbacks');
  await page.locator('.hidden-agents > summary').click();await page.waitForTimeout(150);
  assert.ok(await suspendedPixels()<5,'Hidden collapses without leaving canvas ghosts when animations are suspended');
  await page.setViewportSize({width:900,height:760});
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().width===78,null,{timeout:3000});
  assert.equal(await page.locator('.sidebar').evaluate(e=>e.getBoundingClientRect().width),78,'the sidebar finishes sliding to its icon width');
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>BuddyTheme.choose('dark'));
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open chats',exact:true}).click();
  assert.equal(await page.locator('.sidebar').evaluate(e=>e.getBoundingClientRect().width),390,'mobile navigation keeps its full labels');
  assert.equal(await page.locator('#chat-search').isVisible(),true);
  assert.equal(await page.locator('.sidebar-layout-toggle').isVisible(),false);
  assert.deepEqual(errors,[]);
 }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});
