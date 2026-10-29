const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const Chat=require('./buddy-chat');
// The renderer runs as the page runs it: with the page's `state` beside it, and no document.
function blocks(state={agents:[{id:'lyra',name:'Lyra'}],messages:{}}){const context={state,URL,JSON,Number,Math,Date,Object,Array,Set,Map,String};vm.createContext(context);vm.runInContext(fs.readFileSync(`${__dirname}/buddy-blocks.js`,'utf8'),context);return context.BuddyBlocks;}
const evil='<img src=x onerror=alert(1)>"\'&';

test('every string an agent wrote is drawn as text, never as markup',()=>{
  const B=blocks(),html=B.html({id:'m1',blocks:[
    {type:'table',id:'t',title:evil,source:evil,columns:[{label:evil,kind:'text'},{label:'Link',kind:'link'}],rows:[[evil,'javascript:alert(1)'],['x','https://example.com/a?b=<c>']]},
    {type:'compare',id:'c',title:'Two',from:'lyra',pick:'a',why:evil,options:[{id:'a',label:evil,facts:[{label:evil,value:evil}]},{id:'b',label:'B',facts:[]}]},
    {type:'choice',id:'q',question:evil,from:'lyra',options:[{id:'a',label:evil,detail:evil},{id:'b',label:'B'}],recommend:['a']},
    {type:'form',id:'f',title:'Form',fields:[{id:'n',label:evil,kind:'text',placeholder:evil,value:evil}]},
    {type:'files',id:'fl',files:[{path:`dir/${evil}`,folderId:'f1',bytes:2048,note:evil}]},
    {type:'timeline',id:'tl',events:[{date:'2026-11-02',title:evil,detail:evil,state:'next'}]},
    {type:'stats',id:'s',numbers:[{label:evil,value:evil,note:evil}]},
    {type:'chart',id:'ch',title:evil,labels:[evil],series:[{name:evil,values:[3]}]}]});
  assert.doesNotMatch(html,/<img|href="javascript/,'no tag and no script link, only text');
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;&quot;&#39;&amp;/);
  assert.match(html,/<a href="https:\/\/example.com\/a\?b=%3Cc%3E" target="_blank" rel="noopener noreferrer">/,'only an https link becomes a link');
  assert.equal((html.match(/<section class="reply-block/g)||[]).length,8);
});

test('tables format by kind, sort as numbers, and point to the whole table when it was cut',()=>{
  const B=blocks(),html=B.html({id:'m',blocks:[{type:'table',id:'t',columns:[{label:'File',kind:'file'},{label:'Rows',kind:'number'},{label:'Rent',kind:'money'},{label:'Missing',kind:'percent'},{label:'Due',kind:'date'}],
    rows:[[{file:'data/a.csv',folderId:'f1'},51204,2180,0.004,'2026-11-02'],['b.csv',9,1960.5,null,'soon']],total:250,savedAs:{path:'Buddy tables/Files.xlsx',folderId:'f1'}}]});
  assert.match(html,/data-action="project-file" data-path="data\/a.csv" data-folder-id="f1"/);
  assert.match(html,/>51,204</);assert.match(html,/>\$2,180</);assert.match(html,/>\$1,960.5</);assert.match(html,/>0.4%</);assert.match(html,/>Mon 2 Nov</);assert.match(html,/>soon</);
  assert.match(html,/data-sort="51204" data-sort-kind="n"/);
  assert.match(html,/Showing 2 of 250 rows\. The whole table is in <button[^>]*data-path="Buddy tables\/Files.xlsx"/);
  assert.equal(B.html({id:'m',blocks:[{type:'carousel',id:'x'},{type:'table'}]}),'','unknown or unnamed blocks are left out');
});

test('a chart is drawn to one scale from its numbers, and says them aloud',()=>{
  const B=blocks(),html=B.html({id:'m',blocks:[{type:'chart',id:'w',kind:'bar',title:'Tasks finished',labels:['Mon','Tue','Wed'],series:[{name:'Tasks',values:[3,null,6]}]}]});
  assert.equal((html.match(/<rect /g)||[]).length,2,'a gap draws no bar');
  assert.match(html,/aria-label="Tasks finished\. Tasks: Mon 3, Tue no value, Wed 6"/);
  assert.match(html,/>0<\/text>/);assert.match(html,/>6<\/text>/);
  const line=B.html({id:'m',blocks:[{type:'chart',id:'l',kind:'line',labels:['a','b','c','d'],series:[{name:'A',values:[1,2,null,4]},{name:'B',values:[2,1,1,3]}]}]});
  assert.equal((line.match(/<polyline /g)||[]).length,2,'a gap splits a line, and a lone point draws no line');
  assert.match(line,/class="rb-legend"/);
});

test('ask blocks name the agent\'s suggestion, keep a draft, and lock once answered',()=>{
  const B=blocks(),choice={type:'choice',id:'viewing',from:'lyra',question:'Which should I ask about?',multiple:true,recommend:['hoover'],submit:'Ask about these',options:[{id:'hoover',label:'Hoover St.'},{id:'adams',label:'Adams Court'}]};
  let html=B.html({id:'m',blocks:[choice]});
  assert.match(html,/Lyra suggests/);assert.match(html,/type="checkbox"/);assert.match(html,/class="rb-actions"><button type="submit" class="primary-button rb-send" disabled>Ask about these</);
  html=B.html({id:'m',blocks:[choice],blockAnswers:{viewing:{values:{picked:['adams']},text:'Adams Court'}}});
  assert.match(html,/value="adams" checked disabled/);assert.match(html,/rb-actions done"><p class="rb-answered">Answered · Adams Court</);assert.doesNotMatch(html,/rb-send/);
  const compare=B.html({id:'m',blocks:[{type:'compare',id:'c',from:'lyra',pick:'b',why:'more room',options:[{id:'a',label:'A'},{id:'b',label:'B'}]}]});
  assert.match(compare,/Lyra’s pick/);assert.match(compare,/<strong>Why B:<\/strong> more room/);assert.match(compare,/rb-cols-2/);
  const checklist=B.html({id:'m',blocks:[{type:'checklist',id:'k',checks:[{id:'x',label:'x.xlsx',checked:true},{id:'y',label:'y.md'}]}]});
  assert.match(checklist,/value="x" checked/);assert.doesNotMatch(checklist,/value="y" checked/);
});

test('an answer says what was chosen, and only what the person typed counts as their words',()=>{
  const B=blocks();
  const choice={type:'choice',id:'viewing',question:'Which should I ask about?',options:[{id:'hoover',label:'Hoover St. — spend $500 now'},{id:'adams',label:'Adams Court'}]};
  let a=B.answer(choice,{picked:['hoover'],other:'after 5pm only'});
  assert.equal(a.body,'Answer to “Which should I ask about?”: Hoover St. — spend $500 now, after 5pm only');
  assert.equal(a.typed,'after 5pm only','the agent\'s option label is never the person\'s own words');
  assert.equal(a.model,'The person answered your block "viewing" (Which should I ask about?): Hoover St. — spend $500 now, after 5pm only\n{"block":"viewing","answer":{"picked":["hoover"],"other":"after 5pm only"}}');
  const form={type:'form',id:'times',title:'When can you go?',fields:[{id:'from',label:'Earliest day',kind:'date'},{id:'slot',label:'Time of day',kind:'select',options:['Mornings','Afternoons']},{id:'notes',label:'Anything to mention',kind:'longtext'},{id:'pet',label:'Bringing a pet',kind:'toggle'}]};
  a=B.answer(form,{from:'2026-11-02',slot:'Afternoons',notes:'',pet:true});
  assert.equal(a.text,'Earliest day: Mon 2 Nov · Time of day: Afternoons · Bringing a pet: yes');assert.equal(a.typed,'2026-11-02');
  a=B.answer({type:'checklist',id:'k',title:'Which files?',checks:[{id:'x',label:'x.xlsx'}]},{checked:[]});
  assert.equal(a.text,'None of them');assert.equal(a.typed,'');
});

test('the chat keeps a reply\'s blocks, and a reply of blocks alone is not an empty answer',()=>{
  const s={agents:[{id:'lyra',name:'Lyra',role:'Research',description:''}],messages:{},drafts:{lyra:'Find places'},attachments:{}},r=Chat.begin(s,'lyra');
  Chat.apply(s,{runId:r.run.runId,status:'answering',text:'',blocks:[{type:'choice',id:'viewing',question:'Which?'},{type:'bogus'},'nope']});
  Chat.apply(s,{runId:r.run.runId,status:'completed',text:'',blocks:[{type:'choice',id:'viewing',question:'Which?'}]});
  const reply=s.messages.lyra[1];
  assert.equal(reply.status,'completed');assert.deepEqual(reply.blocks.map(b=>b.id),['viewing']);
});

test('an answer goes as the person\'s message, carries its typed words, and keeps them on a retry',()=>{
  const s={agents:[{id:'lyra',name:'Lyra',role:'Research',description:''}],messages:{},drafts:{lyra:'draft stays'},attachments:{}};
  const answer={block:'viewing',question:'Which?',text:'Adams Court',typed:'',body:'Answer to “Which?”: Adams Court',model:'The person answered your block "viewing" (Which?): Adams Court\n{}'};
  const r=Chat.begin(s,'lyra',{text:answer.model,answer});
  assert.equal(r.payload.text,answer.model);assert.deepEqual(r.payload.answer,{block:'viewing',typed:''});
  assert.equal(s.messages.lyra[0].body,'Answer to “Which?”: Adams Court');assert.deepEqual(s.messages.lyra[0].answer,{block:'viewing',question:'Which?',text:'Adams Court'});
  assert.equal(s.drafts.lyra,'draft stays','answering a block leaves the typed draft alone');
  Chat.apply(s,{runId:r.run.runId,status:'failed',error:'offline'});
  const again=Chat.begin(s,'lyra',{retryOf:r.run.runId});
  assert.equal(again.payload.text,answer.model);assert.deepEqual(again.payload.answer,{block:'viewing',typed:''},'a retried answer is still an answer');
  const plain=Chat.begin({...s,runs:{},messages:{}},'lyra',{text:'hello'});assert.equal(plain.payload.answer,undefined);
});
