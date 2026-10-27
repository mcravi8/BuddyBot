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
  assert.ok(at({done:1},[0])[0]<at({},[0])[0],'done lays the fold almost flat');
});

test('Buddy saves the round figure as "sphere": it is the circle',()=>{
  assert.equal(Fold.SHAPES.sphere,Fold.SHAPES.circle);
  for(const id of ['square','sphere','hex','pill','arch','diamond'])assert.ok(Fold.SHAPES[id],id);
});
