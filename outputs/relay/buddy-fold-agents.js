/* Every agent is drawn as a fold figure (the person's design of 27 Oct, "switch current agents to new design, drop old design for now"): a
   flat shape in the agent's colour with one corner folded over and white eyes (buddy-fold-figure.js). buddy-figures.js keeps Buddy's logo and
   the sidebar's dot field. Each agent's and group's picture keeps its place (a canvas, or a slot in a sidebar row) under an id the dot painter
   doesn't know, so it leaves them alone and this file paints them.
   The mood follows what the agent is doing, as buddy-figure-modes.js reads it: ready → idle, planning or working → thinking, writing a reply
   → talking, just finished → done (about two seconds, then idle). The figure in a chat's floating header is a still picture, as before. */
(function(root){
  'use strict';
  const F=root.BuddyFigures,Fold=root.BuddyFold;
  if(!F||!Fold||typeof document==='undefined')return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // The app's state is a global of app.js, which loads after this file: read it only when drawing.
  const live=()=>{try{return typeof state!=='undefined'?state:null;}catch{return null;}};
  const agentOf=id=>live()?.agents?.find(a=>a.id===id)||null;
  const groupOf=id=>live()?.groups?.find(g=>g.id===id)||null;
  const dark=()=>document.documentElement.dataset.theme==='dark';
  // The agent's saved shape and colour (agent-team.js decides what a saved value means), and which corner folds: the same for an agent
  // everywhere, mixed across a team.
  function look(agent){
    const a=root.RelayTeam?.appearance?root.RelayTeam.appearance(agent||{}):{avatarShape:agent?.avatarShape,avatarColor:agent?.avatarColor};
    const swatch=root.RelayTeam?.colorOptions?.find(c=>c.id===a.avatarColor);
    let h=0;for(const ch of String(agent?.id||''))h=(h*31+ch.charCodeAt(0))|0;
    return {shape:Fold.SHAPES[a.avatarShape]?a.avatarShape:'hex',color:swatch?(dark()?swatch.inkDark:swatch.ink):a.avatarColor||'cobalt',side:agent?.id&&(h&1)?'left':'right'};
  }

  // ---- markup: the same places as before, painted here -------------------------------------------------------------------------------
  const canvas=(kind,attrs,px)=>`<canvas class="fig fig-${kind} fold-fig" data-fig="${kind}" ${attrs} data-size="${px}" width="${px}" height="${px}" style="width:${px}px;height:${px}px" aria-hidden="true"></canvas>`;
  const inSlot=(attrs)=>`<canvas class="fold-fig fold-in-slot" ${attrs} style="display:block;width:100%;height:100%" aria-hidden="true"></canvas>`;
  const baseAvatar=F.avatarHTML,baseSlot=F.slotAvatarHTML;
  const known=value=>Array.isArray(value?.members)?value.members.some(id=>agentOf(id)):!!(value?.id&&agentOf(value.id));
  F.avatarHTML=(value,size=34)=>{
    const px=Math.round(size);
    if(Array.isArray(value?.members))return known(value)?canvas('group',`data-fig-id="fold:${esc(value.id)}" data-fold-group="${esc(value.id)}"`,px):baseAvatar(value,size);
    if(known(value))return canvas('agent',`data-fig-id="fold:${esc(value.id)}" data-fold-id="${esc(value.id)}"`,px);
    // A preview (the shape and colour pickers): no agent yet.
    return canvas('agent',`data-fig-id="fold:preview" data-fold-shape="${esc(value?.avatarShape||'')}" data-fold-color="${esc(value?.avatarColor||'')}"`,px);
  };
  F.slotAvatarHTML=(value,size)=>{
    if(!value?.id||!known(value))return baseSlot(value,size);
    const group=Array.isArray(value.members);
    return F.slotHTML(group?'group':'agent','fold:'+value.id,size,'row:'+value.id).replace(/<\/span>$/,inSlot(group?`data-fold-group="${esc(value.id)}"`:`data-fold-id="${esc(value.id)}"`)+'</span>');
  };

  // ---- moods ----------------------------------------------------------------------------------------------------------------------------
  const calm=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  const sims={};
  const sim=id=>sims[id]||(sims[id]={t:Math.random()*20,p:{thinking:0,talking:0,done:0},want:'idle'});
  // Who is writing a reply right now: a direct chat streaming its answer, or the lead of a group bringing the answers together.
  function talkers(){
    const s=live(),out=new Set();if(!s)return out;
    for(const run of Object.values(s.runs||{})){
      if(run?.status!=='answering')continue;
      const group=(s.groups||[]).find(g=>g.id===run.target);
      if(group){if(run.team?.phase==='replying'&&run.team.leadId)out.add(run.team.leadId);continue;}
      const message=(s.messages?.[run.target]||[]).find(m=>m.runId===run.runId);
      if(String(message?.body||'').trim())out.add(run.target);
    }
    return out;
  }
  // Who is starting a reply: a direct chat whose run has begun, or the lead of a group run.
  function starters(){
    const s=live(),out=new Set();if(!s)return out;
    for(const run of Object.values(s.runs||{})){
      if(!['starting','answering'].includes(run?.status))continue;
      const group=(s.groups||[]).find(g=>g.id===run.target);
      out.add(group?run.team?.leadId||(run.memberIds||group.members||[])[0]:run.target);
    }
    return out;
  }
  // Only what the agent is doing itself moves it: a task running, a reply being started or written. "Planning" also covers work that only
  // waits (queued, retrying later, a result waiting for the supervisor's verdict); those agents rest, so their figures stay still (27 Oct:
  // Chief's and Lyra's peels kept moving while their finished results waited for Chief).
  function mood(id,talking,starting=new Set()){
    const mode=F.getMode?F.getMode(id):'ready';
    if(mode==='done')return 'done';
    if(talking.has(id))return 'talking';
    return mode==='working'||(mode==='planning'&&starting.has(id))?'thinking':'idle';
  }
  function step(dt){
    const talking=talkers(),starting=starters(),still=calm.matches;
    for(const a of live()?.agents||[]){
      const m=sim(a.id);m.want=mood(a.id,talking,starting);
      m.t+=still?0:dt;
      for(const q of ['thinking','talking','done']){const target=m.want===q?1:0;m.p[q]=still?target:m.p[q]+(target-m.p[q])*Math.min(1,dt*5);}
    }
  }

  // ---- painting -------------------------------------------------------------------------------------------------------------------------
  const REST={thinking:0,talking:0,done:0};
  // A group: up to four of its members, side by side or in a square.
  const SPOTS={1:[[.5,.5,1]],2:[[.29,.5,.6],[.71,.5,.6]],3:[[.29,.29,.52],[.71,.29,.52],[.5,.73,.52]],4:[[.27,.27,.5],[.73,.27,.5],[.27,.73,.5],[.73,.73,.5]]};
  function paint(el){
    const size=el.clientWidth||+el.dataset.size||34;if(!size)return;
    const d=Math.min(2,root.devicePixelRatio||1),px=Math.round(size*d);
    if(el.width!==px){el.width=px;el.height=px;}
    const c=el.getContext('2d');c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,size,size);
    const still=!!el.closest('.island')||calm.matches;
    // In the sidebar, a figure near the pointer looks at it; one farther away keeps looking ahead (Fold.gaze). Each eases there.
    const box=pointer&&el.closest('.sidebar')?el.getBoundingClientRect():null,eased=el.foldGaze||(el.foldGaze=[]);
    const figure=(agent,x,y,s,k=0)=>{
      const m=agent?sim(agent.id):null,sz=size*s;
      const want=box?Fold.gaze(pointer.x-(box.left+x*box.width),pointer.y-(box.top+y*box.height)):{x:0,y:0,w:0},g=eased[k]||(eased[k]={x:0,y:0,w:0});
      for(const q of ['x','y','w'])g[q]+=(want[q]-g[q])*.25;
      c.save();c.translate(x*size-sz/2,y*size-sz/2);
      Fold.draw(c,sz,still||!m?2.1:m.t,el.closest('.island')||!m?REST:m.p,{...look(agent),look:g,details:{shadow:sz>=32}});
      c.restore();
    };
    if(el.dataset.foldGroup!==undefined){
      const members=(groupOf(el.dataset.foldGroup)?.members||[]).map(agentOf).filter(Boolean).slice(0,4);
      for(const [k,[x,y,s]] of (SPOTS[members.length]||[]).entries())figure(members[k],x,y,s,k);
    }else if(el.dataset.foldId!==undefined){
      const agent=agentOf(el.dataset.foldId);if(agent)figure(agent,.5,.5,1);
    }else figure({avatarShape:el.dataset.foldShape,avatarColor:el.dataset.foldColor},.5,.5,1);
  }
  // Where the pointer is, for the sidebar figures' eyes; nowhere once it leaves the window.
  let pointer=null;
  document.addEventListener('pointermove',e=>{pointer={x:e.clientX,y:e.clientY};},{passive:true,capture:true});
  document.documentElement.addEventListener('mouseleave',()=>{pointer=null;});
  root.addEventListener?.('blur',()=>{pointer=null;});
  const shown=el=>el.isConnected&&el.getClientRects().length>0&&!el.closest('details:not([open])>:not(summary)');
  let raf=0,last=0;
  function frame(now){
    raf=0;
    const dt=Math.min(.05,last?(now-last)/1000:0);last=now;
    step(dt);
    for(const el of document.querySelectorAll('canvas.fold-fig'))if(shown(el)&&(!el.closest('.island')||!el.dataset.foldPainted)){paint(el);el.dataset.foldPainted='1';}
    raf=requestAnimationFrame(frame);
  }
  // A canvas that was just inserted is painted at once, so a re-render never flashes an empty figure (and a window in the background,
  // where WebKit holds animation frames back, still shows them).
  new MutationObserver(records=>{
    for(const r of records)for(const n of r.addedNodes){
      if(n.nodeType!==1)continue;
      const found=n.matches?.('canvas.fold-fig')?[n]:[...n.querySelectorAll?.('canvas.fold-fig')||[]];
      for(const el of found){try{paint(el);el.dataset.foldPainted='1';}catch(error){console.error('Buddy fold figure failed',error);}}
    }
    if(!raf)raf=requestAnimationFrame(frame);
  }).observe(document.documentElement,{childList:true,subtree:true});
  // A section that opens (Hidden agents) or a window that resizes shows figures at a new size: paint them now, animation frames or not.
  const repaintIn=scope=>{for(const el of scope.querySelectorAll('canvas.fold-fig'))if(shown(el)){try{paint(el);el.dataset.foldPainted='1';}catch(error){console.error('Buddy fold figure failed',error);}}};
  document.addEventListener('toggle',e=>{if(e.target?.querySelectorAll)repaintIn(e.target);},true);
  root.addEventListener?.('resize',()=>repaintIn(document));
  // The theme changes the inks: repaint everything, the still pictures too.
  new MutationObserver(()=>{for(const el of document.querySelectorAll('canvas.fold-fig')){delete el.dataset.foldPainted;paint(el);}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  raf=requestAnimationFrame(frame);
  root.BuddyFoldAgents={look,mood,paint,current:id=>mood(id,talkers(),starters())};
})(typeof window!=='undefined'?window:globalThis);
