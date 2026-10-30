/* Unread replies in the sidebar (29 Oct, proposal "Buddy Agent Figures": the dot field and its dot-digit counts are gone). Each agent's and
   team's row carries a count of the replies that arrived while its chat was not open, beside the name, or on the figure when the sidebar is
   folded. Opening the chat clears it. Counting starts when Buddy opens: replies already there are not new. */
(function(root){
  'use strict';
  if(typeof document==='undefined')return;
  const seen={},unread={};
  const live=()=>{try{return typeof state!=='undefined'?state:null;}catch{return null;}};
  // A reply that has finished arriving, as the sidebar's last message shows it.
  const replies=(s,id)=>(s.messages?.[id]||[]).filter(m=>m.who&&m.who!=='you'&&(!m.live||m.status==='completed')).length;
  function count(){
    const s=live();if(!s)return;
    const viewing=document.querySelector('.sidebar .chat-row.selected')?.dataset.id||null;
    for(const id of [...(s.agents||[]).map(a=>a.id),...(s.groups||[]).map(g=>g.id)]){
      const n=replies(s,id),was=seen[id];
      if(id===viewing){delete unread[id];seen[id]=n;continue;}
      if(was===undefined||n<was){seen[id]=n;continue;}
      if(n>was){seen[id]=n;unread[id]=(unread[id]||0)+(n-was);}
    }
  }
  function decorate(){
    for(const row of document.querySelectorAll('.sidebar .chat-row[data-id]')){
      const n=unread[row.dataset.id]||0;let badge=row.querySelector(':scope>.row-unread');
      row.classList.toggle('has-unread',n>0);
      // Said after the row's name, which stays the same.
      if(n){if(row.getAttribute('aria-description')!==`${n} unread`)row.setAttribute('aria-description',`${n} unread`);}else row.removeAttribute('aria-description');
      if(!n){badge?.remove();continue;}
      const text=n>9?'9+':String(n);
      if(!badge){badge=document.createElement('span');badge.className='row-unread';badge.setAttribute('aria-hidden','true');row.append(badge);}
      if(badge.textContent!==text)badge.textContent=text;
    }
  }
  const tick=()=>{try{count();decorate();}catch(error){console.error('Buddy unread counts failed',error);}};
  let pending=0;
  // Rows are rebuilt whenever the sidebar renders: the counts go back on at once.
  new MutationObserver(()=>{if(!pending)pending=requestAnimationFrame(()=>{pending=0;tick();});}).observe(document.documentElement,{childList:true,subtree:true});
  setInterval(tick,500);
  root.BuddyUnread={of:id=>unread[id]||0,tick};
})(typeof window!=='undefined'?window:globalThis);
