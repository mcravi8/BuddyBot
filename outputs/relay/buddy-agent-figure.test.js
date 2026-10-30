const {test}=require('node:test');const assert=require('node:assert/strict');
const A=require('./buddy-agent-figure.js');
// A 2D context that records what is drawn, so a figure's parts can be checked without a browser.
function recorder(){
  const calls=[],ctx={calls,globalAlpha:1,fillStyle:'',strokeStyle:'',lineWidth:1,lineCap:'',lineJoin:''};
  for(const name of ['save','restore','translate','rotate','scale','beginPath','moveTo','lineTo','closePath','fill','stroke','arc','ellipse','roundRect'])ctx[name]=(...args)=>calls.push([name,...args]);
  return ctx;
}
const drawn=f=>{const c=recorder();A.draw(c,100,{shape:'hex',color:'#3561d8',eyes:'default',t:1,p:{},...f});return c.calls;};
const arcs=calls=>calls.filter(c=>c[0]==='arc');

test('the four shapes: thick tokens and a sphere, with the 14 eye styles and the states Buddy shows',()=>{
  assert.deepEqual(A.SHAPES,['square','sphere','hex','diamond']);
  assert.equal(A.EYES.length,14);
  assert.deepEqual(A.STATES,['thinking','talking','working','needs','done','stuck','asleep']);
  // A token is its back face, a side strip per edge, and its front face; a sphere is one disc.
  const hex=drawn({shape:'hex'}).filter(c=>c[0]==='fill').length,sphere=drawn({shape:'sphere'}).filter(c=>c[0]==='fill').length;
  assert.ok(hex>40,`the hex has its side between two faces: ${hex} fills`);
  assert.ok(sphere<6,`the sphere is one disc and its eyes: ${sphere} fills`);
  for(const eyes of A.EYES)assert.doesNotThrow(()=>drawn({eyes,p:{thinking:1}}),eyes);
});

test('turning shows the side: the body turns with its eyes, and a turn asked for swings it out and back',()=>{
  // At .5 s the glance has settled on its first spot, straight ahead.
  const rest=A.pose({t:.5,p:{}}),looking=A.pose({t:.5,p:{},look:{x:.13,y:0,w:1}});
  assert.equal(rest.yaw,0,'at the first glance spot it looks ahead');
  assert.ok(Math.abs(looking.yaw-.6)<1e-9,'looking all the way to one side turns it 0.6 radians');
  assert.ok(A.pose({t:.5,p:{},sT:A.ONCE.spin/2}).yaw>.8,'half way through a turn it shows its side');
  assert.ok(Math.abs(A.pose({t:.5,p:{},sT:A.ONCE.spin}).yaw)<1e-9,'and it ends facing ahead');
  assert.ok(A.pose({t:.5,p:{},sT:A.ONCE.spin/2,side:-1}).yaw<-.8,'agents turn their own way');
});

test('each state moves the figure its own way',()=>{
  // Waiting for you: a hop every 1.9 s; didn't finish: a lean; asleep: a breath; a hop asked for lifts it once.
  assert.ok(A.pose({t:.18,p:{needs:1}}).lift>.09&&A.pose({t:1,p:{needs:1}}).lift===0,'waiting for you hops, then rests');
  assert.ok(Math.abs(A.pose({t:1,p:{stuck:1},side:-1}).tilt+.17)<1e-9,'didn’t finish leans to its side');
  assert.notEqual(A.pose({t:.3,p:{asleep:1}}).breath,A.pose({t:1.5,p:{asleep:1}}).breath,'asleep breathes');
  assert.ok(A.pose({t:1,p:{},hT:A.ONCE.hop/2}).lift>.12,'a hop lifts it');
  // Working reads: the eyes go left to right along a line and look down at it.
  const along=[0,.5,1,1.5,1.9].map(t=>A.pose({t,p:{working:1}}).yaw);
  assert.ok(along.every((y,i)=>i===0||y>=along[i-1]-1e-9)&&along[4]-along[0]>.6,`reading moves along the line: ${along.map(y=>y.toFixed(2))}`);
  assert.ok(A.pose({t:.5,p:{working:1}}).pitch>0,'reading looks down');
  // A new agent grows into place from nothing, turning in from the side.
  const born=A.pose({t:.5,p:{},aT:0}),grown=A.pose({t:.5,p:{},aT:A.ONCE.appear});
  assert.ok(born.zoom<.01&&born.alpha===0&&born.yaw>1,'it starts small, unseen and turned away');
  assert.ok(Math.abs(grown.zoom-1)<1e-9&&grown.alpha===1&&grown.yaw===0,'and arrives full size facing you');
});

test('the eyes say the state: closed asleep, happy arcs after the finish, the developer’s > < instead',()=>{
  const closed=arcs(drawn({p:{asleep:1}}));
  assert.equal(closed.length,2);assert.ok(closed.every(a=>Math.abs(a[4]-Math.PI*.18)<1e-9),'asleep, both eyes are curves that dip');
  const happy=arcs(drawn({p:{done:1},dT:A.ONCE.done+1}));
  assert.ok(happy.length===2&&happy.every(a=>Math.abs(a[4]-Math.PI*1.15)<1e-9),'after the finish, happy arcs');
  const popping=arcs(drawn({p:{done:1},dT:.5}));
  assert.equal(popping.filter(a=>Math.abs(a[4]-Math.PI*1.15)<1e-9).length,0,'during the finish the eyes are still its own');
  const dev=drawn({eyes:'dev',p:{done:1},dT:A.ONCE.done+1});
  assert.equal(arcs(dev).length,0,'the developer has no arcs');assert.ok(dev.filter(c=>c[0]==='lineTo').length>=4,'it shows > <');
  // Grown at the finish: the eyes are scaled up 2.1 times in the hold.
  const scales=c=>c.filter(x=>x[0]==='scale').map(x=>x[1]);
  assert.ok(Math.max(...scales(drawn({p:{done:1},dT:.5})))>2,'the eyes grow to twice their size');
  assert.ok(Math.max(...scales(drawn({p:{needs:1}})))>1.2,'waiting for you, they open wide');
});

test('an unknown shape or eye style still draws a figure',()=>{
  assert.doesNotThrow(()=>drawn({shape:'pill',eyes:'laser'}));
  assert.ok(drawn({shape:'pill',eyes:'laser'}).some(c=>c[0]==='roundRect'),'the default eyes');
});
