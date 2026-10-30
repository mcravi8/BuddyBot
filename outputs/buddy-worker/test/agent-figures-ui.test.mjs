import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright-core';import {mkdtemp,rm} from 'node:fs/promises';import {existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
// The agent figures (29 Oct, proposal "Buddy Agent Figures"): the person's own design, its four thick shapes and 14 eye styles, drawn
// exactly as its buddy-agents.js draws them (kept in fixtures/buddy-agents-design.js), with every state Buddy knows, eyes from the role,
// the Create an agent dialog, and a sidebar without its dot field.
const skip=process.platform!=='darwin'||!existsSync('/Applications/Google Chrome.app');
async function open(context,agents){
  const page=context.pages()[0],errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(new URL('../../relay/index.html',import.meta.url).href);await page.waitForFunction(()=>!!window.BuddyAgentFigures&&!!window.BuddyUnread);
  await page.evaluate(agents=>{
    document.getElementById('onboarding-root').innerHTML='';closeModal();
    state.agents=agents.map(([id,name,role,avatarShape,avatarColor])=>({id,name,role,description:'Work.',avatarShape,avatarColor,setupStatus:'ready',tools:{}}));
    state.groups=[{id:'team',name:'Research team',members:agents.map(a=>a[0]).slice(0,3),objective:'x'}];state.onboarding={status:'completed',agentId:agents[0][0]};
    state.runs={};state.tasks=[];state.files=[];state.messages=Object.fromEntries([...agents.map(a=>[a[0],[]]),['team',[]]]);state.drafts={};state.attachments={};
    window.saved=[];BuddyDesktop={saveState:async json=>{saved.push(JSON.parse(json));return {saved:true};},sendMessage:async()=>{},agentSetup:async()=>({})};
    ui.view={kind:'chat',target:agents[0][0]};render();
  },agents);
  return {page,errors};
}
const AGENTS=[['chief','Chief','Chief of Staff','diamond','lilac'],['lyra','Lyra','Writer','hex','peach'],['vera','Vera','Validator','sphere','mint']];

test('each state follows the work: thinking, talking, working, waiting for you, done, didn’t finish, asleep; the pointer turns and wakes it; new eyes arrive with the finish',{skip,timeout:90000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'buddy-agent-figures-'));let context;
  try{
    context=await chromium.launchPersistentContext(join(dir,'browser.noindex'),{channel:'chrome',headless:true,viewport:{width:1280,height:860},reducedMotion:'no-preference'});
    const {page,errors}=await open(context,AGENTS);
    const mood=id=>page.evaluate(id=>BuddyAgentFigures.current(id),id);
    assert.equal(await mood('lyra'),'idle');
    // Work that only waits (queued, retrying, a result waiting for the supervisor) rests the figure.
    await page.evaluate(()=>BuddyFigures.setMode('lyra','planning'));await page.waitForTimeout(60);
    assert.equal(await mood('lyra'),'idle','work that only waits keeps the figure resting');
    await page.evaluate(()=>{state.runs={r1:{runId:'r1',target:'lyra',status:'starting'}};});await page.waitForTimeout(60);
    assert.equal(await mood('lyra'),'thinking','a reply begun with no words yet');
    await page.evaluate(()=>{state.runs={r1:{runId:'r1',target:'lyra',status:'answering'}};state.messages.lyra=[{id:'m',who:'lyra',runId:'r1',body:'Here is',status:'answering'}];});await page.waitForTimeout(60);
    assert.equal(await mood('lyra'),'talking','writing a reply');
    await page.evaluate(()=>{state.runs={};state.messages.lyra=[];BuddyFigures.setMode('lyra','working');});await page.waitForTimeout(60);
    assert.equal(await mood('lyra'),'working','a task running');
    await page.evaluate(()=>BuddyFigures.setMode('lyra','needs'));await page.waitForTimeout(60);
    assert.equal(await mood('lyra'),'needs','a question or approval waiting for the person');
    await page.evaluate(()=>BuddyFigures.setMode('lyra','stuck'));await page.waitForTimeout(60);
    assert.equal(await mood('lyra'),'stuck','stopped with an error');
    // Done: the finish, then happy arcs that stay a few seconds after Buddy's own "done" has passed (1.7 s).
    await page.evaluate(()=>BuddyFigures.setMode('lyra','done'));await page.waitForTimeout(2200);
    assert.equal(await page.evaluate(()=>BuddyFigures.getMode('lyra')),'ready');
    assert.equal(await mood('lyra'),'done','the happy arcs stay after the finish');
    await page.waitForTimeout(3300);assert.equal(await mood('lyra'),'idle','and then it rests');

    // Asleep after resting a while (shortened here); the agent whose chat is open stays awake; the pointer close by wakes one.
    await page.evaluate(()=>BuddyAgentFigures.sleepAfter(1.2));await page.waitForTimeout(1800);
    assert.equal(await mood('vera'),'asleep');assert.equal(await mood('chief'),'idle','the open chat’s agent does not sleep');
    const vera=await page.locator('.chat-row[data-id="vera"] .fig-slot canvas.agent-fig').boundingBox();
    await page.mouse.move(vera.x+vera.width+12,vera.y+vera.height/2);await page.waitForTimeout(300);
    assert.equal(await mood('vera'),'idle','the pointer close by wakes it');
    await page.evaluate(()=>BuddyAgentFigures.sleepAfter(30));
    // Near the pointer it looks at it; a row away, it keeps looking ahead.
    const gaze=id=>page.evaluate(id=>document.querySelector(`.chat-row[data-id="${id}"] .fig-slot canvas.agent-fig`).figGaze?.[0]||{x:0,y:0,w:0},id);
    const g=await gaze('vera');assert.ok(g.w>.3&&g.x>.05,`Vera looks toward the pointer on its right: ${JSON.stringify(g)}`);
    assert.ok((await gaze('chief')).w<.01,'Chief, two rows up, keeps looking ahead');
    await page.mouse.move(1100,700);await page.waitForTimeout(700);assert.ok((await gaze('vera')).w<.01);

    // Eyes from the role; a new role brings new eyes with the finish: the old ones grow, the new ones take their place.
    assert.deepEqual(await page.evaluate(()=>['chief','lyra','vera'].map(id=>BuddyAgentFigures.look(state.agents.find(a=>a.id===id)).eyes)),['chief','writer','reviewer']);
    assert.equal(await page.evaluate(()=>BuddyAgentFigures.eyes('lyra')),'writer');
    await page.evaluate(()=>{state.agents.find(a=>a.id==='lyra').role='Research lead';});await page.waitForTimeout(150);
    assert.equal(await mood('lyra'),'done','new eyes arrive with the finish');assert.equal(await page.evaluate(()=>BuddyAgentFigures.eyes('lyra')),'writer','the old eyes grow first');
    await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>BuddyAgentFigures.eyes('lyra')),'research');

    // One colour in both themes: white eyes stay readable on every ink.
    await page.evaluate(()=>BuddyTheme.choose('dark'));
    assert.equal(await page.evaluate(()=>BuddyAgentFigures.look(state.agents.find(a=>a.id==='lyra')).color),'#e07a2c');
    await page.evaluate(()=>BuddyTheme.choose('light'));
    // A team's figure holds its members; an agent created afterwards arrives.
    const lit=sel=>page.evaluate(sel=>{const c=document.querySelector(sel);const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>140)n++;return n;},sel);
    assert.ok(await lit('.chat-row[data-id="team"] canvas.agent-fig')>100,'the team figure is painted');
    await page.evaluate(()=>{state.agents.push({id:'nova',name:'Nova',role:'Designer',avatarShape:'square',avatarColor:'blue',setupStatus:'ready',tools:{}});state.messages.nova=[];render();});
    await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>BuddyAgentFigures.appearing('nova')),true,'a new agent turns in from the side');
    assert.equal(await page.locator('canvas.sidebar-field').count(),0,'no dot field');
    assert.deepEqual(errors,[]);
  }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});

test('the figures are drawn exactly as the design’s own buddy-agents.js draws them',{skip,timeout:60000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'buddy-agent-design-'));let context;
  try{
    context=await chromium.launchPersistentContext(join(dir,'browser.noindex'),{channel:'chrome',headless:true,viewport:{width:900,height:700},reducedMotion:'no-preference'});
    const page=context.pages()[0];
    await page.goto(new URL('../../relay/index.html',import.meta.url).href);await page.waitForFunction(()=>!!window.BuddyAgentFigure);
    await page.addScriptTag({path:new URL('./fixtures/buddy-agents-design.js',import.meta.url).pathname});
    const out=await page.evaluate(()=>{
      const res=[],size=104,ink={red:'#b8432e',cobalt:'#3561d8'};
      for(const [design,ours] of [['hex','hex'],['circle','sphere'],['square','square'],['rhombus','diamond']])
        for(const eyes of ['default','chief','dev','writer','analyst','networker'])
          for(const [st,t] of [['idle',1.3],['idle',7.9],['thinking',4.4],['talking',2.2],['done',3.1]]){
            const zc=document.createElement('canvas');zc.style.cssText=`width:${size}px;height:${size}px`;document.body.append(zc);
            const z=BuddyAgent.mount(zc,{shape:design,color:'red',eyes,state:st,size});z.t=t;Object.keys(z.p).forEach(k=>z.p[k]=st===k?1:0);if(st==='done')z.doneT=9;
            z.frame(0);z.destroy();
            const a=zc.getContext('2d').getImageData(0,0,zc.width,zc.height).data,dpr=zc.width/size;
            const mc=document.createElement('canvas');mc.width=mc.height=zc.width;const mx=mc.getContext('2d');mx.setTransform(dpr,0,0,dpr,0,0);
            BuddyAgentFigure.draw(mx,size,{shape:ours,color:ink.red,eyes,t,p:st==='idle'?{}:{[st]:1},dT:st==='done'?9:0});
            const b=mx.getImageData(0,0,mc.width,mc.height).data;
            let diff=0,lit=0;for(let i=3;i<a.length;i+=4){if(a[i]>0)lit++;if(Math.abs(a[i]-b[i])>8||Math.abs(a[i-3]-b[i-3])>8)diff++;}
            res.push({c:`${design}/${eyes}/${st}@${t}`,diff,lit});zc.remove();
          }
      return res;});
    assert.equal(out.length,120);
    for(const r of out){assert.ok(r.lit>400,`${r.c} is drawn`);assert.equal(r.diff,0,`${r.c}: ${r.diff} of ${r.lit} pixels differ from the design`);}
  }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});

test('Create an agent: four shapes, eyes from the job or chosen now, a preview that answers each choice; settings keep the role’s eyes; unread replies are counted',{skip,timeout:90000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'buddy-agent-create-'));let context;
  try{
    context=await chromium.launchPersistentContext(join(dir,'browser.noindex'),{channel:'chrome',headless:true,viewport:{width:1280,height:900},reducedMotion:'no-preference'});
    const {page,errors}=await open(context,AGENTS);
    await page.evaluate(()=>newAgent());
    const form=page.locator('#agent-form');await form.waitFor();
    assert.deepEqual(await form.locator('.shape-choice small').allInnerTexts(),['Square','Circle','Hex','Diamond']);
    assert.equal(await form.locator('.eye-picker').isVisible(),false,'eyes come from the job unless you choose now');
    assert.equal(await page.locator('#config-preview-eyes').innerText(),'Default eyes until they learn the job');
    const preview=()=>page.evaluate(()=>{const m=BuddyAgentFigures.sim('preview');return {spin:m.spinAt,hop:m.hopAt,look:m.lookUntil>m.clock};});
    await page.locator('#agent-name').pressSequentially('Sage',{delay:20});
    assert.equal((await preview()).look,true,'it looks at the name being typed');
    assert.equal(await page.locator('#config-preview-eyes').innerText(),'Default eyes until Sage learns the job');
    await form.locator('.shape-choice').filter({hasText:'Hex'}).click();assert.notEqual((await preview()).spin,null,'a new shape turns it to show its side');
    await form.locator('.color-choice[title="Green"]').click();assert.notEqual((await preview()).hop,null,'a new colour makes it hop');
    assert.equal(await page.locator('#config-avatar-preview canvas').getAttribute('data-agent-shape'),'hex');
    // Choose now: from the job, or one of 14; picking one shows it at once on the preview.
    await form.getByRole('button',{name:'Choose now',exact:true}).click();
    assert.equal(await form.locator('[name=avatar-eyes]').count(),15);
    await form.getByLabel('Coach eyes').check();
    assert.equal(await page.locator('#config-avatar-preview canvas').getAttribute('data-agent-eyes'),'coach');
    assert.equal(await page.locator('#config-preview-eyes').innerText(),'Coach eyes, your choice');
    await form.getByRole('button',{name:'Hide',exact:true}).click();
    assert.equal(await form.locator('[name=avatar-eyes]:checked').getAttribute('value'),'','hiding the eyes goes back to eyes from the job');
    await form.getByRole('button',{name:'Choose now',exact:true}).click();await form.getByLabel('Scout eyes').check();
    await page.evaluate(()=>document.getElementById('agent-form').requestSubmit());
    await page.waitForFunction(()=>state.agents.some(a=>a.name==='Sage'));
    const sage=await page.evaluate(()=>state.agents.find(a=>a.name==='Sage'));
    assert.deepEqual([sage.avatarShape,sage.avatarColor,sage.avatarEyes],['hex','mint','scout']);
    // Settings: eyes from the role, shown and changeable; a pick is saved, and from the role again forgets it.
    await page.evaluate(()=>agentInfo('lyra'));const settings=page.locator('#bot-settings');await settings.waitFor();
    assert.equal(await settings.locator('.eye-picker').isVisible(),true);
    assert.equal(await page.locator('#config-eyes-from').innerText(),'From the role: Writer.');
    await page.locator('#edit-role').fill('Math tutor');assert.equal(await page.locator('#config-eyes-from').innerText(),'From the role: Math.');
    assert.equal(await page.locator('#config-avatar-preview canvas').getAttribute('data-agent-eyes'),'math','the preview follows the role');
    await page.evaluate(()=>closeModal());
    // Unread: a reply that arrives while its chat is not open is counted on its row, and opening the chat clears it.
    await page.evaluate(()=>{state.messages.vera.push({id:'v1',who:'vera',body:'Checked table 3.',time:'10:00'});render();});
    const badge=page.locator('.chat-row[data-id="vera"] .row-unread');await badge.waitFor({timeout:3000});
    assert.equal(await badge.innerText(),'1');assert.equal(await page.locator('.chat-row[data-id="vera"]').getAttribute('aria-description'),'1 unread');
    await page.evaluate(()=>{state.messages.vera.push({id:'v2',who:'vera',body:'And table 4.',time:'10:01'});render();});
    await page.waitForFunction(()=>document.querySelector('.chat-row[data-id="vera"] .row-unread')?.textContent==='2');
    await page.locator('.chat-row[data-id="vera"]').click();
    await page.waitForFunction(()=>!document.querySelector('.chat-row[data-id="vera"] .row-unread'));
    assert.equal(await page.locator('.chat-row[data-id="vera"]').evaluate(e=>getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)'),true,'the open chat’s row is highlighted');
    assert.deepEqual(errors,[]);
  }finally{await context?.close();await rm(dir,{recursive:true,force:true});}
});
