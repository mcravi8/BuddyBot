/* Every agent is drawn as an agent figure (buddy-agent-figure.js, the person's design of 29 Oct): a thick token in its colour with eyes
   from its role. buddy-figures.js keeps Buddy's logo. Each agent's and team's picture keeps its place (a canvas, or a slot in a sidebar row)
   under an id the logo painter doesn't know, so it leaves them alone and this file paints them. In the sidebar a resting figure looks at the
   pointer when it comes near, and its body turns with its eyes.
   The state follows what the agent is doing, as buddy-figure-modes.js reads it: a reply begun with no words yet → thinking, writing a reply
   → talking, a task running, a setup or its turn in a team → working, a question or approval waiting for the person → needs, just finished
   → done (the finish, then happy arcs for a few seconds), stopped with an error → stuck, anything else → idle. An agent idle for a while
   falls asleep, and wakes when the pointer comes near or its chat opens. One that arrives on its own (just created) turns in from the side.
   The figure in a chat's floating header is a still picture. One colour in both themes: white eyes stay readable on every ink. */
(function(root){
  'use strict';
  const F=root.BuddyFigures,A=root.BuddyAgentFigure;
  if(!F||!A||typeof document==='undefined')return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // The app's state is a global of app.js, which loads after this file: read it only when drawing.
  const live=()=>{try{return typeof state!=='undefined'?state:null;}catch{return null;}};
  const agentOf=id=>live()?.agents?.find(a=>a.id===id)||null;
  const groupOf=id=>live()?.groups?.find(g=>g.id===id)||null;
  // agent-team.js declares RelayTeam with const, which a script sees by name but not on window.
  const team=()=>{try{return typeof RelayTeam!=='undefined'?RelayTeam:root.RelayTeam;}catch{return root.RelayTeam;}};
  // The agent's saved shape and colour (agent-team.js decides what a saved value means), its eyes (picked, or from its role), and which way
  // it turns: the same for an agent everywhere, mixed across a team.
  function look(agent){
    const T=team(),a=T?.appearance?T.appearance(agent||{}):{avatarShape:agent?.avatarShape,avatarColor:agent?.avatarColor};
    const swatch=T?.colorOptions?.find(c=>c.id===a.avatarColor);
    let h=0;for(const ch of String(agent?.id||''))h=(h*31+ch.charCodeAt(0))|0;
    return {shape:A.SHAPES.includes(a.avatarShape)?a.avatarShape:'hex',color:swatch?swatch.ink:'#3561d8',eyes:T?.eyesOf?T.eyesOf(agent):'default',side:agent?.id&&(h&1)?-1:1};
  }

  // ---- markup: the same places as before, painted here -------------------------------------------------------------------------------
  const canvas=(kind,attrs,px)=>`<canvas class="fig fig-${kind} agent-fig" data-fig="${kind}" ${attrs} data-size="${px}" width="${px}" height="${px}" style="width:${px}px;height:${px}px" aria-hidden="true"></canvas>`;
  const inSlot=attrs=>`<canvas class="agent-fig agent-fig-in-slot" ${attrs} style="display:block;width:100%;height:100%" aria-hidden="true"></canvas>`;
  const baseAvatar=F.avatarHTML,baseSlot=F.slotAvatarHTML;
  const known=value=>Array.isArray(value?.members)?value.members.some(id=>agentOf(id)):!!(value?.id&&agentOf(value.id));
  F.avatarHTML=(value,size=34)=>{
    const px=Math.round(size);
    if(Array.isArray(value?.members))return known(value)?canvas('group',`data-fig-id="fig:${esc(value.id)}" data-agent-group="${esc(value.id)}"`,px):baseAvatar(value,size);
    if(known(value))return canvas('agent',`data-fig-id="fig:${esc(value.id)}" data-agent-id="${esc(value.id)}"`,px);
    // A preview (the Create an agent dialog, an agent's settings, a suggestion): no agent yet, or one being changed.
    const eyes=value?.avatarEyes||team()?.eyesForRole?.(value?.role)||'default';
    return canvas('agent',`data-fig-id="fig:preview" data-agent-shape="${esc(value?.avatarShape||'')}" data-agent-color="${esc(value?.avatarColor||'')}" data-agent-eyes="${esc(eyes)}"`,px);
  };
  F.slotAvatarHTML=(value,size)=>{
    if(!value?.id||!known(value))return baseSlot(value,size);
    const group=Array.isArray(value.members);
    return F.slotHTML(group?'group':'agent','fig:'+value.id,size,'row:'+value.id).replace(/<\/span>$/,inSlot(group?`data-agent-group="${esc(value.id)}"`:`data-agent-id="${esc(value.id)}"`)+'</span>');
  };

  // ---- states ---------------------------------------------------------------------------------------------------------------------------
  const calm=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  const MOODS=['idle',...A.STATES];
  // How long the happy arcs stay after a finish, and how long an agent rests before it falls asleep.
  const DONE_HOLD=5;let sleepAfter=30;
  // Each figure: t the clock it moves by (still with reduced motion), clock the time since Buddy opened, w how much of each state it shows
  // (easing from one to the next), want the state it is heading to, doneAt when it finished, idleSince when it last rested from something,
  // appearAt when it arrived, spinAt / hopAt a turn or hop asked for and lookUntil a look at the name being typed (previews).
  const sims={};
  const sim=id=>sims[id]||(sims[id]={t:Math.random()*20,clock:0,w:Object.fromEntries(MOODS.map(q=>[q,q==='idle'?1:0])),want:'idle',doneAt:-99,idleSince:0,appearAt:null,spinAt:null,hopAt:null,lookUntil:-1,force:null,forceUntil:-1});
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
  // What the agent is doing itself, from what Buddy knows. "Planning" also covers work that only waits (queued, retrying later, a result
  // waiting for the supervisor's verdict); those agents rest.
  function mood(id,talking,starting=new Set()){
    const mode=F.getMode?F.getMode(id):'ready';
    if(mode==='done')return 'done';
    if(talking.has(id))return 'talking';
    if(starting.has(id))return 'thinking';
    if(mode==='working')return 'working';
    if(mode==='needs')return 'needs';
    if(mode==='stuck')return 'stuck';
    return 'idle';
  }
  const openChat=()=>document.querySelector('.sidebar .chat-row.selected')?.dataset.id||null;
  // The agents there when Buddy opened, and every one since. One that arrives on its own afterwards was just created and appears; several at
  // once are a workspace loading, and simply show.
  let seen=null;
  function settle(m,want,id,open){
    // The happy arcs stay a few seconds after the finish, unless the agent starts something else.
    if(want==='done'){if(m.want!=='done')m.doneAt=m.clock;}
    else if(m.want==='done'&&want==='idle'&&m.clock-m.doneAt<DONE_HOLD)want='done';
    // Resting: since when, and asleep after a while, unless its chat is open.
    if(want==='idle'){
      if(m.want!=='idle'&&m.want!=='asleep')m.idleSince=m.clock;
      if(id&&id===open)m.idleSince=m.clock;
      if(m.clock-m.idleSince>=sleepAfter)want='asleep';
    }
    if(m.force&&m.clock<m.forceUntil)want=m.force;else m.force=null;
    m.want=want;
  }
  function advance(m,dt,still){
    m.clock+=dt;if(!still)m.t+=dt;
    for(const q of MOODS){const target=m.want===q?1:0;m.w[q]=still?target:m.w[q]+(target-m.w[q])*Math.min(1,dt*5);}
  }
  function step(dt){
    const agents=live()?.agents||[],talking=talkers(),starting=starters(),still=calm.matches,open=openChat();
    const fresh=seen?agents.filter(a=>!seen.has(a.id)):[];
    seen=new Set([...(seen||[]),...agents.map(a=>a.id)]);
    for(const a of agents){
      const m=sim(a.id);
      if(fresh.length===1&&fresh[0]===a&&!still)m.appearAt=m.clock;
      settle(m,mood(a.id,talking,starting),a.id,open);advance(m,dt,still);
    }
    const p=sim('preview');settle(p,'idle',null,null);p.idleSince=p.clock;advance(p,dt,still);
  }
  // The frame for one figure now. A still one (a chat's header) rests with its eyes ahead.
  function frameOf(m,lk,still,gaze){
    if(!m||still)return {...lk,t:2.1,p:{},dT:0,aT:null,look:null};
    const quiet=calm.matches,since=(at,len)=>at!=null&&!quiet&&m.clock-at<len?m.clock-at:null;
    const own=m.clock<m.lookUntil?{x:-0.08,y:0.12,w:1}:null;
    return {...lk,t:m.t,p:m.w,dT:m.want==='done'?(quiet?99:m.clock-m.doneAt):0,aT:since(m.appearAt,A.ONCE.appear+.4),sT:since(m.spinAt,A.ONCE.spin),hT:since(m.hopAt,A.ONCE.hop),look:gaze&&gaze.w>.01?gaze:own};
  }

  // ---- painting -------------------------------------------------------------------------------------------------------------------------
  // A team: up to four of its members, side by side or in a square.
  const SPOTS={1:[[.5,.5,1]],2:[[.29,.5,.6],[.71,.5,.6]],3:[[.29,.29,.52],[.71,.29,.52],[.5,.73,.52]],4:[[.27,.27,.5],[.73,.27,.5],[.27,.73,.5],[.73,.73,.5]]};
  // Where a figure looks for a pointer dx, dy CSS pixels away: toward it within 60 px, fully within 34 (so a figure a row away keeps looking
  // ahead), as far as its eyes look on their own.
  function gaze(dx,dy,reach=60,near=34){
    const d=Math.hypot(dx,dy);if(!(d<reach))return {x:0,y:0,w:0};
    const k=Math.min(1,(reach-d)/(reach-near)),w=k*k*(3-2*k),toward=Math.min(1,d/14);
    return d?{x:dx/d*.13*toward,y:dy/d*.13*toward,w}:{x:0,y:0,w};
  }
  function paint(el){
    const size=el.clientWidth||+el.dataset.size||34;if(!size)return;
    const d=Math.min(2,root.devicePixelRatio||1),px=Math.round(size*d);
    if(el.width!==px){el.width=px;el.height=px;}
    const c=el.getContext('2d');c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,size,size);
    const box=pointer&&el.closest('.sidebar')?el.getBoundingClientRect():null,eased=el.figGaze||(el.figGaze=[]),still=!!el.closest('.island');
    const figure=(agent,id,x,y,s,k=0)=>{
      const m=id?sim(id):null,sz=size*s;
      const want=box?gaze(pointer.x-(box.left+x*box.width),pointer.y-(box.top+y*box.height)):{x:0,y:0,w:0},g=eased[k]||(eased[k]={x:0,y:0,w:0});
      for(const q of ['x','y','w'])g[q]+=(want[q]-g[q])*.25;
      // The pointer close by wakes a sleeping agent.
      if(m&&g.w>.5&&m.want==='asleep')m.idleSince=m.clock;
      const lk=look(agent);if(m&&!still)lk.eyes=eyesShown(m,lk.eyes);
      c.save();c.translate(x*size-sz/2,y*size-sz/2);
      A.draw(c,sz,frameOf(m,lk,still,g));
      c.restore();
    };
    if(el.dataset.agentGroup!==undefined){
      const members=(groupOf(el.dataset.agentGroup)?.members||[]).map(agentOf).filter(Boolean).slice(0,4);
      for(const [k,[x,y,s]] of (SPOTS[members.length]||[]).entries())figure(members[k],members[k].id,x,y,s,k);
    }else if(el.dataset.agentId!==undefined){
      const agent=agentOf(el.dataset.agentId);if(agent)figure(agent,agent.id,.5,.5,1);
    }else figure({avatarShape:el.dataset.agentShape,avatarColor:el.dataset.agentColor,avatarEyes:el.dataset.agentEyes},el.dataset.agentSim||null,.5,.5,1);
  }
  // New eyes (a role learned, eyes picked) arrive with the finish: the old eyes grow, the new ones take their place at full size, and settle.
  function eyesShown(m,eyes){
    if(m.eyes==null){m.eyes=eyes;return eyes;}
    if(eyes!==m.eyes&&eyes!==m.nextEyes){
      m.nextEyes=eyes;
      if(!calm.matches){m.force='done';m.forceUntil=m.clock+3;m.doneAt=m.clock;m.want='done';}
    }
    if(m.nextEyes&&(calm.matches||m.clock-m.doneAt>=.48)){m.eyes=m.nextEyes;m.nextEyes=null;}
    return m.eyes;
  }
  // Where the pointer is, for the sidebar figures' eyes; nowhere once it leaves the window.
  let pointer=null;
  document.addEventListener('pointermove',e=>{pointer={x:e.clientX,y:e.clientY};},{passive:true,capture:true});
  document.documentElement.addEventListener('mouseleave',()=>{pointer=null;});
  root.addEventListener?.('blur',()=>{pointer=null;});
  const shown=el=>el.isConnected&&el.getClientRects().length>0&&!el.closest('details:not([open])>:not(summary)');
  const paintAll=scope=>{for(const el of scope.querySelectorAll('canvas.agent-fig'))if(shown(el)){try{paint(el);el.dataset.figPainted='1';}catch(error){console.error('Buddy agent figure failed',error);}}};
  let raf=0,last=0;
  function frame(now){
    raf=0;
    const dt=Math.min(.05,last?(now-last)/1000:0);last=now;
    step(dt);
    for(const el of document.querySelectorAll('canvas.agent-fig'))if(shown(el)&&(!el.closest('.island')||!el.dataset.figPainted)){paint(el);el.dataset.figPainted='1';}
    raf=requestAnimationFrame(frame);
  }
  // A canvas that was just inserted is painted at once, so a re-render never flashes an empty figure (and a window in the background,
  // where WebKit holds animation frames back, still shows them).
  new MutationObserver(records=>{
    for(const r of records)for(const n of r.addedNodes){
      if(n.nodeType!==1)continue;
      const found=n.matches?.('canvas.agent-fig')?[n]:[...n.querySelectorAll?.('canvas.agent-fig')||[]];
      for(const el of found){try{paint(el);el.dataset.figPainted='1';}catch(error){console.error('Buddy agent figure failed',error);}}
    }
    if(!raf)raf=requestAnimationFrame(frame);
  }).observe(document.documentElement,{childList:true,subtree:true});
  // A section that opens (Hidden agents) or a window that resizes shows figures at a new size: paint them now, animation frames or not.
  document.addEventListener('toggle',e=>{if(e.target?.querySelectorAll)paintAll(e.target);},true);
  root.addEventListener?.('resize',()=>paintAll(document));
  raf=requestAnimationFrame(frame);
  // The preview in the Create an agent dialog and in an agent's settings answers what the person does there: it turns to show its side for a
  // new shape, hops for a new colour and looks down at the name being typed (new eyes bring the finish on their own, eyesShown).
  function poke(kind){
    const m=sim('preview');
    // A dialog that opens starts from the figure it shows.
    if(kind==='open'){m.eyes=null;m.nextEyes=null;m.force=null;m.want='idle';return;}
    if(calm.matches)return;
    if(kind==='shape')m.spinAt=m.clock;
    else if(kind==='color')m.hopAt=m.clock;
    else if(kind==='name')m.lookUntil=m.clock+.9;
  }
  root.BuddyAgentFigures={look,mood,paint,poke,sim:id=>sims[id]||null,eyes:id=>sims[id]?.eyes||null,current:id=>{const m=sims[id];return m?m.want:mood(id,talkers(),starters());},appearing:id=>sims[id]?.appearAt!=null&&sims[id].clock-sims[id].appearAt<A.ONCE.appear,
    sleepAfter:s=>{if(Number.isFinite(s))sleepAfter=s;return sleepAfter;},frame:id=>sims[id]?frameOf(sims[id],look(agentOf(id)),false,null):null};
})(typeof window!=='undefined'?window:globalThis);
