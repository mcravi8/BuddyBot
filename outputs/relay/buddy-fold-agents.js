/* Every agent is drawn as a fold figure (the person's design of 27 Oct, "switch current agents to new design, drop old design for now"): a
   flat shape in the agent's colour with one corner folded over and white eyes (buddy-fold-figure.js). buddy-figures.js keeps Buddy's logo and
   the sidebar's dot field. Each agent's and group's picture keeps its place (a canvas, or a slot in a sidebar row) under an id the dot painter
   doesn't know, so it leaves them alone and this file paints them. In the sidebar, a figure near the pointer looks at it, and its body turns
   and nods toward it too.
   The mood follows what the agent is doing, as buddy-figure-modes.js reads it, and the body moves with it (BuddyFold.motion, the moods the
   person chose on 27 Oct): a reply begun with no words yet → thinking, a task running, a setup or its turn in a group → working, writing a
   reply → talking, just finished → done (about two seconds, then idle), anything else → idle, still. An agent that arrives on its own (just
   created) appears: it turns in from the side, grows into place and nods hello. The figure in a chat's floating header is a still picture. */
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
  const MOODS=['idle','thinking','working','talking','done'];
  // The renderer's own mood weights for each mood: thinking and working both have busy eyes and float.
  const WEIGHTS={idle:{thinking:0,talking:0,done:0},thinking:{thinking:1,talking:0,done:0},working:{thinking:1,talking:0,done:0},talking:{thinking:0,talking:1,done:0},done:{thinking:0,talking:0,done:1}};
  // Each agent's figure: t its renderer's clock (slower while it thinks), clock its body's, w how much of each mood it shows (easing from one
  // to the next), since when its mood began, seed so agents move out of step, appearAt when it arrived.
  const sims={};
  const seedOf=id=>{let h=7;for(const ch of String(id))h=(h*31+ch.charCodeAt(0))%9973;return h;};
  const sim=id=>sims[id]||(sims[id]={t:Math.random()*20,clock:Math.random()*40,w:{idle:1,thinking:0,working:0,talking:0,done:0},want:'idle',since:0,seed:seedOf(id),appearAt:null});
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
  // Only what the agent is doing itself moves it: a reply it has begun and not yet put into words (thinking), a task running, a setup or its
  // turn in a group (working), a reply being written (talking). "Planning" also covers work that only waits (queued, retrying later, a result
  // waiting for the supervisor's verdict); those agents rest, so their figures stay still (27 Oct: Chief's and Lyra's peels kept moving while
  // their finished results waited for Chief).
  function mood(id,talking,starting=new Set()){
    const mode=F.getMode?F.getMode(id):'ready';
    if(mode==='done')return 'done';
    if(talking.has(id))return 'talking';
    if(starting.has(id))return 'thinking';
    return mode==='working'?'working':'idle';
  }
  // The agents there when Buddy opened, and every one since. One that arrives on its own afterwards was just created and appears; several at
  // once are a workspace loading, and simply show.
  let seen=null;
  function step(dt){
    const agents=live()?.agents||[],talking=talkers(),starting=starters(),still=calm.matches;
    const fresh=seen?agents.filter(a=>!seen.has(a.id)):[];
    seen=new Set([...(seen||[]),...agents.map(a=>a.id)]);
    for(const a of agents){
      const m=sim(a.id),want=mood(a.id,talking,starting);
      if(fresh.length===1&&fresh[0]===a&&!still)m.appearAt=m.clock;
      if(want!==m.want){m.want=want;m.since=m.clock;}
      if(!still){m.clock+=dt;m.t+=dt*(1-.55*m.w.thinking);}
      for(const q of MOODS){const target=m.want===q?1:0;m.w[q]=still?target:m.w[q]+(target-m.w[q])*Math.min(1,dt*5);}
    }
  }
  // An agent's pose now: each mood's motion, weighed by how much it shows, then the arrival of a new agent over it.
  function posed(m){
    const out={yaw:0,pitch:0,hop:0,zoom:0,alpha:0,peel:0,open:0,look:{x:0,y:0,w:0}},p={thinking:0,talking:0,done:0};
    let total=0;
    for(const q of MOODS){
      const w=m.w[q];if(w<.001)continue;total+=w;
      const mo=Fold.motion(q,q==='done'?m.clock-m.since:m.clock,m.seed);
      for(const k of ['yaw','pitch','hop','zoom','alpha','open'])out[k]+=mo[k]*w;
      out.peel+=(mo.peel!=null?mo.peel:Fold.fold(m.t,WEIGHTS[q]))*w;
      if(mo.look)for(const k of ['x','y','w'])out.look[k]+=mo.look[k]*w;
      for(const k in p)p[k]+=WEIGHTS[q][k]*w;
    }
    if(total>0)for(const k of ['yaw','pitch','hop','zoom','alpha','open','peel'])out[k]/=total;
    if(total>0){for(const k of ['x','y','w'])out.look[k]/=total;for(const k in p)p[k]/=total;}
    if(m.appearAt!=null){
      const age=m.clock-m.appearAt;
      if(age>=Fold.ONCE.appear||calm.matches)m.appearAt=null;
      else{
        // The last moments ease from the arrival into whatever the agent is doing.
        const a=Fold.motion('appear',age,m.seed),k=Math.max(0,Math.min(1,(age-Fold.ONCE.appear+.4)/.4)),e=k*k*(3-2*k);
        for(const q of ['yaw','pitch','hop','zoom','alpha'])out[q]=a[q]+(out[q]-a[q])*e;
        const al=a.look||{x:0,y:0,w:0};for(const q of ['x','y','w'])out.look[q]=al[q]+(out.look[q]-al[q])*e;
      }
    }
    return {pose:out,p};
  }

  // ---- painting -------------------------------------------------------------------------------------------------------------------------
  const REST={thinking:0,talking:0,done:0},TURN=28*Math.PI/180,NOD=16*Math.PI/180,STILL={pose:{yaw:0,pitch:0,hop:0,zoom:1,alpha:1,peel:null,open:1,look:{x:0,y:0,w:0}},p:REST};
  // A group: up to four of its members, side by side or in a square.
  const SPOTS={1:[[.5,.5,1]],2:[[.29,.5,.6],[.71,.5,.6]],3:[[.29,.29,.52],[.71,.29,.52],[.5,.73,.52]],4:[[.27,.27,.5],[.73,.27,.5],[.27,.73,.5],[.73,.73,.5]]};
  function paint(el){
    const size=el.clientWidth||+el.dataset.size||34;if(!size)return;
    const d=Math.min(2,root.devicePixelRatio||1),px=Math.round(size*d);
    if(el.width!==px){el.width=px;el.height=px;}
    const c=el.getContext('2d');c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,size,size);
    // In the sidebar, a figure near the pointer looks at it; one farther away keeps looking ahead (Fold.gaze). Each eases there.
    const box=pointer&&el.closest('.sidebar')?el.getBoundingClientRect():null,eased=el.foldGaze||(el.foldGaze=[]);
    const figure=(agent,x,y,s,k=0)=>{
      const m=agent?.id?sim(agent.id):null,sz=size*s;
      const want=box?Fold.gaze(pointer.x-(box.left+x*box.width),pointer.y-(box.top+y*box.height)):{x:0,y:0,w:0},g=eased[k]||(eased[k]={x:0,y:0,w:0});
      for(const q of ['x','y','w'])g[q]+=(want[q]-g[q])*.25;
      c.save();c.translate(x*size-sz/2,y*size-sz/2);
      // The mood moves the body; near the pointer, the body turns and nods toward it instead (up to 28° and 16°, proposal "Agents that
      // turn", option B), and the eyes follow the pointer over where the mood has them looking.
      const {pose,p}=m&&!el.closest('.island')?posed(m):STILL,ml=pose.look;
      const lw=1-(1-ml.w)*(1-g.w),eyes=lw>0?{x:(ml.x*ml.w*(1-g.w)+g.x*g.w)/lw,y:(ml.y*ml.w*(1-g.w)+g.y*g.w)/lw,w:lw}:{x:0,y:0,w:0};
      const body={...pose,yaw:pose.yaw+(TURN*Math.max(-1,Math.min(1,g.x/.15))-pose.yaw)*g.w,pitch:pose.pitch+(-NOD*Math.max(-1,Math.min(1,g.y/.13))-pose.pitch)*g.w};
      Fold.drawPosed(c,sz,!m||el.closest('.island')?2.1:m.t,p,{...look(agent),look:eyes,peel:pose.peel,open:pose.open,details:{shadow:sz>=32}},body);
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
  root.BuddyFoldAgents={look,mood,paint,current:id=>mood(id,talkers(),starters()),pose:id=>sims[id]?posed(sims[id]).pose:null,appearing:id=>sims[id]?.appearAt!=null};
})(typeof window!=='undefined'?window:globalThis);
