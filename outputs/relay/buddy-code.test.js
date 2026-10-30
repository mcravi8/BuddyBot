const {test}=require('node:test');const assert=require('node:assert/strict');
const Code=require('./buddy-code');
const NOW=Date.parse('2026-10-29T16:10:00Z'),ago=min=>new Date(NOW-min*60000).toISOString();
const evil='<img src=x onerror=alert(1)>';
const agents=id=>({forge:{id:'forge',name:'Forge'}})[id]||null,names=id=>agents(id)?.name||'';
// A coding task's record as the Mac keeps it (BuddyWorkerHost.codeRefresh): newest steps first, the changed files, checks and the compare.
function job(over={},code={}){
  return {id:'w1',kind:'coding',agentId:'forge',title:'Projects page',status:'completed',updatedAt:ago(1),progress:'Finished',...over,
    code:{head:'c5',folderId:'f1',folderName:'portfolio-site',fileCount:3,added:150,removed:3,
      steps:[{hash:'c5',author:'forge',name:'Forge',kind:'step',message:'Tests for the Projects page',at:ago(3),fileCount:1},
        {hash:'c4',author:'forge',name:'Forge',kind:'step',message:'Projects grid with filters',at:ago(30),fileCount:2},
        {hash:'c1',author:'buddy',name:'Buddy',kind:'copy',message:'Copied 3 files from portfolio-site',at:ago(41),fileCount:3}],
      files:[{path:'src/pages/projects.astro',status:'new',added:138,removed:0,note:'The new Projects page'},{path:'index.html',status:'changed',added:6,removed:3,from:{folderId:'f1',path:'index.html'}},{path:'tests/projects.test.ts',status:'new',added:6,removed:0}],
      checks:[{kind:'test',label:'Tests',ok:true,summary:'all 18 pass',detail:'npm test · 6.2 s'},{kind:'lint',label:'Code style',ok:true,summary:'no problems',detail:'npx eslint .'}],
      compare:{head:'c5',folderId:'f1',bring:[{path:'index.html'},{path:'src/pages/projects.astro'},{path:'tests/projects.test.ts'}],clashes:[],combined:[],ready:true},...code}};
}
const ctx={agents,names,now:NOW};

test('the progress bar says where the work is, stop by stop',()=>{
  let s=Code.stops(job({status:'running'},{compare:null}),NOW);
  assert.deepEqual(s.states,['done','now','next','done','next']);assert.equal(s.details[0],'3 files from portfolio-site');assert.equal(s.details[1],'2 steps saved');
  s=Code.stops(job(),NOW);
  assert.deepEqual(s.states,['done','done','done','done','needs'],'compared, checked and waiting for the person\'s tap');
  assert.equal(s.details[2],'Nothing clashes');assert.equal(s.details[3],'All 2 pass');assert.equal(s.details[4],'Your tap');
  s=Code.stops(job({},{compare:{head:'c5',clashes:[{path:'index.html',kind:'lines'}],bring:[],ready:false},checks:[{kind:'test',label:'Tests',ok:false,summary:'2 of 18 failing'}]}),NOW);
  assert.deepEqual(s.states.slice(2),['needs','needs','next']);assert.equal(s.details[2],'1 clash with your edits');assert.equal(s.details[3],'Tests: 2 of 18 failing');
  s=Code.stops(job({},{broughtIn:{at:ago(1),files:['a','b','c']},compare:{head:'c5',bring:[],clashes:[],ready:false}}),NOW);
  assert.equal(s.states[4],'done');assert.equal(s.details[4],'3 files, 1 min');
  s=Code.stops(job({},{compare:{head:'old',bring:[{path:'a'}],clashes:[],ready:true}}),NOW);
  assert.equal(s.states[2],'next','a compare made before the newest step no longer counts');
});

test('the lane graph puts your folder and the agent\'s copy each on its lane, newest at the top',()=>{
  let rows=Code.laneRows(job(),{names,now:NOW,agentName:'Forge'});
  assert.deepEqual(rows.map(r=>`${r.lane}/${r.kind}`),['you/next','agent/step','agent/step','you/base']);
  assert.equal(rows[0].text,'Next: bring into portfolio-site');assert.equal(rows[3].text,'Forge copied 3 files from portfolio-site');
  assert.match(rows[1].meta,/^Forge · 3 min · 1 file$/);
  const clashing=job({},{compare:{head:'c5',clashes:[{path:'index.html',to:'index.html',kind:'lines'}],bring:[],ready:false}});
  rows=Code.laneRows(clashing,{names,now:NOW,agentName:'Forge'});
  assert.equal(rows[0].kind,'edit');assert.equal(rows[0].clashing,true);assert.equal(rows[0].text,'Your folder changed: 1 clash');assert.equal(rows[0].clash,1,'the clash points at the newest step');
  const combined=job({},{steps:[{hash:'c6',author:'forge',kind:'step',message:'Kept your labels',at:ago(1)},{hash:'c5b',author:'you',kind:'combine',message:'Your edits taken in: index.html',at:ago(2)},...job().code.steps],compare:null});
  rows=Code.laneRows(combined,{names,now:NOW,agentName:'Forge'});
  assert.equal(rows[1].kind,'edit');assert.equal(rows[0].from,1,'your edits taken in reach the agent\'s next step');
  const html=Code.lanes(rows,{agentColor:'#c2611f',agentName:'Forge'});
  assert.match(html,/stroke="var\(--warn\)"/);assert.match(html,/Your edits meet Forge’s/);assert.equal((html.match(/<li class="lg-row/g)||[]).length,rows.length);
  const fresh=Code.laneRows(job({},{steps:[{hash:'a',author:'forge',kind:'step',message:'First page',at:ago(2)}]}),{names,now:NOW,agentName:'Forge'});
  assert.equal(fresh.at(-1).text,'Forge started a new copy','a copy with nothing copied in still starts somewhere');
});

test('the card says what to do now, with the main button at the bottom right',()=>{
  let html=Code.card({id:'w1',title:'Projects page'},job(),ctx);
  assert.match(html,/data-code-card="w1"/);assert.match(html,/class="wc-chip review">Ready for you</);
  assert.match(html,/Forge’s copy of portfolio-site · 3 files, 150 lines added/);
  assert.match(html,/data-code-mode="lanes" data-task="w1" aria-pressed="true"/,'the lane graph by default');
  assert.match(html,/<div class="code-actions"><button type="button" class="primary-button" data-code-act="bring" data-task="w1">Bring into portfolio-site<\/button><button type="button" class="border-button" data-code-act="compare"/);
  assert.match(html,/Tests: all 18 pass/);
  Code.modes.set('w1','bar');html=Code.card({id:'w1'},job(),ctx);Code.modes.delete('w1');
  assert.match(html,/<ol class="journey">/);assert.doesNotMatch(html,/class="lg"/);
  html=Code.card({id:'w1'},job({status:'running',progress:'Running 12 of 18 tests'},{compare:null}),ctx);
  assert.match(html,/>Working</);assert.match(html,/Running 12 of 18 tests/);assert.doesNotMatch(html,/data-code-act/,'nothing to tap while it works');
  html=Code.card({id:'w1'},job({},{compare:null}),ctx);
  assert.match(html,/data-code-act="compare" data-task="w1">Compare with your folder</);
  html=Code.card({id:'w1'},job({},{broughtIn:{at:ago(1),files:['index.html']},compare:{head:'c5',bring:[],clashes:[],ready:false}}),ctx);
  assert.match(html,/>In your folder</);assert.match(html,/data-code-act="github"[^>]*>Send to GitHub/);
});

test('a clash shows both sides and waits for a choice on each before anything comes in',()=>{
  const clash=job({},{compare:{head:'c5',bring:[{path:'tests/projects.test.ts'}],clashes:[{path:'index.html',to:'index.html',kind:'lines',hunks:[{line:3,yours:'<a href="/about">About</a>',agent:'<a href="/projects">Projects</a>'}]},{path:'src/pages/projects.astro',to:'src/pages/projects.astro',kind:'exists'}],ready:false}});
  let html=Code.card({id:'w1'},clash,ctx);
  assert.match(html,/>Needs you</);assert.match(html,/2 clashes with your folder/);
  assert.match(html,/<span>Yours<\/span><pre>&lt;a href=&quot;\/about&quot;&gt;About&lt;\/a&gt;<\/pre>/);assert.match(html,/Your folder has a different file with this name\./);
  assert.match(html,/data-code-act="bring" data-task="w1" disabled>Bring in with these choices/);assert.match(html,/data-code-act="combine"[^>]*>Ask Forge to combine/);
  Code.choices.set('w1',{'index.html':'yours','src/pages/projects.astro':'agent'});html=Code.card({id:'w1'},clash,ctx);Code.choices.delete('w1');
  assert.match(html,/data-code-act="bring" data-task="w1">Bring in with these choices/,'chosen for each: the button is on');
  assert.match(html,/value="yours" checked/);assert.match(html,/value="agent" checked/);
});

test('the Code tab lists the copies, their progress and history, what changed, one file\'s change and the checks',()=>{
  const other=job({id:'w2',title:'Text contrast',status:'running',updatedAt:ago(5)},{compare:null});
  const state={groups:[{id:'team',members:['forge','vera']}]},jobs=Code.tasksFor(state,'team',[other,job(),{id:'w3',kind:'general',agentId:'forge'},{...job({id:'w4',agentId:'nova'})}]);
  assert.deepEqual(jobs.map(j=>j.id),['w1','w2'],'the group\'s coding copies with steps, newest first');
  Code.picked.copy='';Code.picked.file='';
  let html=Code.tab(jobs,ctx);
  assert.match(html,/data-code-copy="w1" aria-pressed="true"/);assert.match(html,/Where it is <span>Forge’s copy of portfolio-site<\/span>/);
  assert.match(html,/<b>The new Projects page <span class="tag new">New<\/span><\/b><small>src\/pages\/projects.astro<\/small>/,'a file reads by the agent\'s note, its path under it');
  assert.match(html,/Loading the change…/,'the first file\'s change loads when asked');
  Code.diffs.set('w1|c5|src/pages/projects.astro',{rows:[{kind:'hunk',text:'@@ -0,0 +1,2 @@'},{kind:'add',n:1,text:evil}]});
  html=Code.tab(jobs,ctx);
  assert.match(html,/<tr class="add"><td class="n">1<\/td><td class="c">\+<\/td><td class="c">&lt;img src=x onerror=alert\(1\)&gt;<\/td><\/tr>/);
  assert.match(html,/Tests: all 18 pass/);assert.match(html,/data-code-act="bring" data-task="w1">Bring into portfolio-site/);assert.doesNotMatch(html,/View task/,'the tab is already the task\'s view');
  assert.match(Code.tab([],ctx),/No coding work in this chat yet/);
});

test('every word from the task is drawn as text',()=>{
  const bad=job({title:evil},{folderName:evil,steps:[{hash:'a',author:'forge',kind:'step',message:evil,at:ago(1),fileCount:1},{hash:'b',author:'buddy',kind:'copy',message:'Copied 1 file from '+evil,at:ago(2)}],files:[{path:evil,status:'new',added:1,removed:0,note:evil}],checks:[{kind:'test',label:evil,ok:true,summary:evil}]});
  const html=Code.card({id:'w1',title:evil},bad,ctx)+Code.tab([bad],ctx);
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
});
