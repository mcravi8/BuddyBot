'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Fold=require('./buddy-fold-figure.js');

const at=(p,times)=>times.map(t=>Fold.fold(t,{thinking:0,talking:0,done:0,...p}));
const times=[0,.4,1.3,2.7,5,9.1,17];

test('the fold stays still while the agent rests, talks or is done, and moves only while it works',()=>{
  for(const [mood,p] of [['idle',{}],['talking',{talking:1}],['done',{done:1}]]){
    const depths=at(p,times);
    assert.ok(depths.every(d=>d===depths[0]),`${mood}: the fold does not move (${depths})`);
  }
  const working=at({thinking:1},times);
  assert.ok(Math.max(...working)-Math.min(...working)>.1,`working: the fold lifts and lowers (${working})`);
  assert.equal(at({},[0])[0],at({done:1},[0])[0],'resting, the fold lies as low as when a job is done');
  assert.ok(at({},[0])[0]<Math.min(...working)&&at({},[0])[0]<at({talking:1},[0])[0],'that is its lowest: working and talking raise it');
});

test('a resting figure does not bob either (its peel looked as if it moved); a working one does',()=>{
  const lifts=p=>times.map(t=>Fold.bob(t,{thinking:0,talking:0,done:0,...p}));
  for(const p of [{},{talking:1},{done:1}])assert.ok(lifts(p).every(v=>v===0),`no bob: ${JSON.stringify(p)}`);
  const working=lifts({thinking:1});
  assert.ok(Math.max(...working)>.03&&Math.min(...working)<.01,`working: it lifts and settles (${working})`);
});

test('a resting figure keeps its eyes open and looking ahead; working, they look around and blink',()=>{
  const many=Array.from({length:200},(_,i)=>i*.05),look=p=>many.map(t=>Fold.eyes(t,{thinking:0,talking:0,done:0,...p}));
  for(const e of [...look({}),...look({done:1})])assert.deepEqual(e,{x:0,y:0,open:1});
  const working=look({thinking:1});
  assert.ok(working.some(e=>e.x!==0||e.y!==0),'working: the eyes look around');
  assert.ok(working.some(e=>e.open<.5),'working: it blinks');
});

test('Buddy saves the round figure as "sphere": it is the circle',()=>{
  assert.equal(Fold.SHAPES.sphere,Fold.SHAPES.circle);
  for(const id of ['square','sphere','hex','pill','arch','diamond'])assert.ok(Fold.SHAPES[id],id);
});

test('the eyes turn toward a pointer close by, most when it is near, and ignore one far away',()=>{
  assert.deepEqual(Fold.gaze(200,0),{x:0,y:0,w:0},'far: no pull');
  assert.deepEqual(Fold.gaze(0,80),{x:0,y:0,w:0},'at the edge of its reach: no pull');
  const right=Fold.gaze(30,0),up=Fold.gaze(0,-30),near=Fold.gaze(30,0),less=Fold.gaze(50,0);
  assert.equal(Fold.gaze(66,0).w,0,'a figure a sidebar row away does not look');
  assert.ok(right.x>0&&right.y===0&&right.w>0,'a pointer to the right: the eyes look right');
  assert.ok(up.y<0&&up.x===0,'a pointer above: the eyes look up');
  assert.ok(near.w>less.w,'closer holds the eyes more');
  assert.equal(Fold.gaze(0,0).x,0,'a pointer right on the figure: the eyes stay centred');
});
