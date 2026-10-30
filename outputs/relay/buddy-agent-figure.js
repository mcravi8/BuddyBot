/* Buddy agent figure (the person's design of 29 Oct, "Agent figure animation directions", proposal "Buddy Agent Figures"): a thick token
   in one colour with white eyes that show its personality. The square, hex and diamond are tokens with depth, so when one turns its side
   edge comes into view; the circle is a sphere whose eyes roll across its surface. Shapes, eyes and the idle, thinking, talking and done
   motions are drawn exactly as the design's own buddy-agents.js draws them; working, waiting for you, didn't finish, asleep, a new agent
   arriving, a turn and a hop follow the same rules.
   draw(c, size, f) paints one figure into a 2D context at the origin, size × size CSS pixels. f:
     shape    square | sphere (circle) | hex | diamond
     color    the ink, a #hex
     eyes     one of EYES
     t        the figure's clock in seconds (it moves only while it advances)
     p        how much of each state it shows, 0–1: thinking, talking, working, needs, done, stuck, asleep (the rest is idle)
     dT       seconds since it finished (0 when it hasn't): the eyes grow, shrink back, then become happy arcs
     aT       seconds since it arrived (null when it didn't): it turns in from the side and grows into place
     sT, hT   seconds into a turn to show its side, or a hop (null when neither)
     look     {x, y, w}: where its eyes look instead (the pointer), and how much (null looks where its state has it look)
     side     1 or -1: which way it turns in, leans and spins, so agents next to each other differ */
(function (root) {
  'use strict';
  const SHAPES = ['square', 'sphere', 'hex', 'diamond'];
  const EYES = ['default', 'chief', 'creative', 'math', 'dev', 'research', 'writer', 'support', 'analyst', 'designer', 'scout', 'reviewer', 'networker', 'coach'];
  const STATES = ['thinking', 'talking', 'working', 'needs', 'done', 'stuck', 'asleep'];
  // How long the moments that play once last: the finish before the happy arcs, a new agent's arrival, a turn and a hop.
  const ONCE = { done: 2.2, appear: 1.3, spin: 0.95, hop: 0.42 };
  const TAU = Math.PI * 2;
  const lerp = (a, b, k) => a + (b - a) * k, ease = x => x * x * (3 - 2 * x), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const outBack = k => { const c = 1.70158; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
  const poly = (n, r, a0) => Array.from({ length: n }, (_, i) => { const a = a0 + i * TAU / n; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const blinkAt = t => { const x = t % 4.3; return x < 0.16 ? Math.abs(1 - x / 0.08) : 1; };
  // Where the eyes look while resting: hold about a second, then a quick glance to the next spot.
  const GL = [[0, 0], [0.12, -0.06], [0.12, -0.06], [-0.11, -0.04], [0, -0.13], [0, -0.13], [-0.12, 0.03], [0.08, -0.11], [0, 0], [0.13, 0.02], [-0.06, -0.12], [-0.06, -0.12]];
  const glance = t => { const D = 1.05, i = Math.floor(t / D), fr = Math.min(1, (t % D) / 0.2), e = ease(fr), A = GL[(i + GL.length - 1) % GL.length], B = GL[i % GL.length]; return [lerp(A[0], B[0], e), lerp(A[1], B[1], e)]; };
  // Working reads: five words along a line in quick jumps, a sweep back, one line lower; three lines, then again.
  const read = t => {
    const L = 2.3, i = Math.floor(t / L), k = (t % L) / L, W = 5;
    let x;
    if (k < 0.86) { const s = k / 0.86 * W, w = Math.floor(s), fr = Math.min(1, (s % 1) / 0.28); x = -0.11 + 0.22 * (w + ease(fr)) / W; }
    else x = 0.11 - 0.22 * ease((k - 0.86) / 0.14);
    return [x, 0.07 + 0.022 * (i % 3)];
  };
  // Waiting for you: a small hop every 1.9 s.
  const hopAt = t => { const k = (t % 1.9) / 0.36; return k < 1 ? Math.sin(Math.PI * k) : 0; };
  const roundPoly = (pts, r, n = 6) => {
    const out = [];
    pts.forEach((v, i) => {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
      const la = Math.hypot(a[0] - v[0], a[1] - v[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
      const A = [v[0] + (a[0] - v[0]) / la * r, v[1] + (a[1] - v[1]) / la * r], B = [v[0] + (b[0] - v[0]) / lb * r, v[1] + (b[1] - v[1]) / lb * r];
      for (let k = 0; k <= n; k++) { const q = k / n, m = 1 - q; out.push([m * m * A[0] + 2 * m * q * v[0] + q * q * B[0], m * m * A[1] + 2 * m * q * v[1] + q * q * B[1]]); }
    });
    return out;
  };
  const NONE = { thinking: 0, talking: 0, working: 0, needs: 0, done: 0, stuck: 0, asleep: 0 };

  // The pose a frame puts the figure in: where it looks and turns, and how it moves.
  function pose(f) {
    const p = Object.assign({}, NONE, f.p), t = f.t || 0, side = f.side || 1;
    const busy = STATES.reduce((s, k) => s + p[k], 0), free = clamp(1 - busy, 0, 1);
    const g = glance(t * (1 + 0.15 * p.thinking)), r = read(t), amt = 0.65 * free + p.thinking;
    let gx = g[0] * amt + r[0] * p.working + 0.07 * p.stuck * side, gy = g[1] * amt + r[1] * p.working + 0.09 * p.stuck + 0.11 * p.asleep - 0.03 * p.needs;
    if (f.look) { const w = clamp(f.look.w, 0, 1) * free; gx = lerp(gx, f.look.x, w); gy = lerp(gy, f.look.y, w); }
    let yaw = gx / 0.13 * 0.6, pitch = gy / 0.13 * 0.4, zoom = 1, alpha = 1;
    if (f.sT != null) yaw += Math.sin(Math.min(1, f.sT / ONCE.spin) * Math.PI) * 0.85 * side;
    if (f.aT != null && f.aT < ONCE.appear) { const k = Math.max(0, f.aT) / ONCE.appear; yaw += 1.25 * (1 - ease(Math.min(1, k * 1.25))) * side; zoom = outBack(Math.min(1, k)); alpha = Math.min(1, k * 3); }
    const lift = p.needs * hopAt(t) * 0.1 + (f.hT != null ? Math.sin(Math.min(1, f.hT / ONCE.hop) * Math.PI) * 0.13 : 0);
    return { p, t, yaw, pitch, zoom, alpha, lift, tilt: 0.17 * p.stuck * side, breath: 1 + 0.035 * p.asleep * Math.sin(t * 1.25) };
  }

  function draw(c, size, f) {
    const P = pose(f), { p, t, yaw, pitch } = P, u = size / 2 * 0.84, col = f.color || '#3561d8';
    c.save(); c.translate(size / 2, size / 2);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const proj = (x, y, z) => { const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; return [x1, y * cp + z1 * sp]; };
    const path = pts => { c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); };
    c.globalAlpha *= P.alpha;
    c.translate(0, -P.lift * u);
    c.rotate(P.tilt);
    c.scale(0.86 * P.zoom, 0.86 * P.zoom * P.breath);
    c.translate(sy * u * 0.05, sp * u * 0.04);
    const E = [];
    if (f.shape === 'sphere' || f.shape === 'circle') {
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, 0.78 * u, 0, TAU); c.fill();
      const Rs = 0.7 * u;
      for (const s of [-1, 1]) { const a = s * 0.36 + yaw, b = -0.08 + pitch; E.push({ s, x: Rs * Math.sin(a), y: Rs * Math.sin(b), cw: Math.max(0.12, Math.cos(a)), ch: Math.max(0.2, Math.cos(b)) }); }
    } else {
      // A token: its back face, the side between, its front face. D is how thick it is.
      const base = f.shape === 'square' ? roundPoly([[-0.64, -0.64], [0.64, -0.64], [0.64, 0.64], [-0.64, 0.64]].map(q => [q[0] * u, q[1] * u]), 0.26 * u)
        : f.shape === 'diamond' || f.shape === 'rhombus' ? roundPoly([[0, -0.86 * u], [0.86 * u, 0], [0, 0.86 * u], [-0.86 * u, 0]], 0.16 * u)
        : roundPoly(poly(6, 0.8 * u, -Math.PI / 2), 0.16 * u);
      const D = 0.3 * u, back = base.map(q => proj(q[0], q[1], -D / 2)), front = base.map(q => proj(q[0], q[1], D / 2));
      c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 0.6; c.lineJoin = 'round';
      path(back); c.fill();
      for (let i = 0; i < base.length; i++) { const j = (i + 1) % base.length; path([front[i], front[j], back[j], back[i]]); c.fill(); c.stroke(); }
      path(front); c.fill();
      for (const s of [-1, 1]) { const q = proj(s * 0.25 * u, -0.06 * u, D / 2); E.push({ s, x: q[0], y: q[1], cw: Math.max(0.12, cy), ch: Math.max(0.2, cp) }); }
    }
    const squint = pitch < -0.2 ? 1 - 0.15 * p.thinking : 1;
    eyes(c, u, t, p, EYES.includes(f.eyes) ? f.eyes : 'default', E, squint, Math.max(0.1, p.stuck > 0.5 ? blinkAt(t * 0.55) : blinkAt(t)), f.dT || 0);
    c.restore();
    return P;
  }

  function eyes(c, u, t, p, k, E, squint, B, dT) {
    // The finish: grow 0.25 s, hold 0.5 s, shrink 0.45 s, its own eyes 1 s, then happy arcs.
    const popping = dT > 0 && dT < ONCE.done;
    const pop = !popping ? 1 : dT < 0.25 ? 1 + 1.1 * ease(dT / 0.25) : dT < 0.75 ? 2.1 : 1 + 1.1 * (1 - ease(Math.min(1, (dT - 0.75) / 0.45)));
    const done = p.done > 0.5 && !popping, asleep = p.asleep > 0.5;
    const grow = (1 + p.thinking * (0.13 + 0.04 * Math.sin(t * 2.4))) * (1 + 0.22 * p.needs) * pop;
    const tall = (1 - 0.12 * p.working) * (1 - 0.48 * p.stuck);
    if (popping && dT < 1.2) B = 1;
    c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff'; c.lineCap = 'round'; c.lineJoin = 'round';
    if ((k === 'math' || k === 'research') && !done && !asleep) {
      c.lineWidth = 0.045 * u * Math.min(E[0].ch, E[1].ch) * squint * Math.sqrt(pop); c.lineCap = 'butt';
      c.beginPath(); c.moveTo(E[0].x, E[0].y); c.lineTo(E[1].x, E[1].y); c.stroke(); c.lineCap = 'round';
    }
    for (const e of E) {
      const L = e.s < 0;
      c.save(); c.translate(e.x, e.y); c.scale(e.cw * grow, e.ch * squint * grow * tall);
      // Asleep: closed, a curve that dips. Done: happy arcs (the developer keeps its > <).
      if (asleep) { c.lineWidth = 0.075 * u; c.beginPath(); c.arc(0, -0.05 * u, 0.1 * u, Math.PI * 0.18, Math.PI * 0.82); c.stroke(); c.restore(); continue; }
      if (done && k !== 'dev') { c.lineWidth = 0.085 * u; c.beginPath(); c.arc(0, 0.05 * u, 0.11 * u, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); c.restore(); continue; }
      c.beginPath();
      switch (k) {
        case 'chief': { const hw = 0.095 * u, hh = 0.13 * u * B, top = -hh * 0.4; c.roundRect(-hw, top, 2 * hw, hh - top, [hw * 0.2, hw * 0.2, hw, hw]); c.fill(); break; }
        case 'creative': { const r = (L ? 0.165 : 0.1) * u; c.ellipse(0, L ? 0 : 0.04 * u, r, r * B, 0, 0, TAU); c.fill(); break; }
        case 'math': { const s = 0.12 * u; c.roundRect(-s, -s * B, 2 * s, 2 * s * B, 0.025 * u); c.fill(); break; }
        case 'research': { const r = 0.125 * u; c.ellipse(0, 0, r, r * B, 0, 0, TAU); c.fill(); break; }
        case 'dev': {
          c.lineWidth = 0.085 * u;
          const chev = dir => { const hg = 0.11 * u * Math.max(0.3, B); c.beginPath(); c.moveTo(-0.07 * u * dir, -hg); c.lineTo(0.07 * u * dir, 0); c.lineTo(-0.07 * u * dir, hg); c.stroke(); };
          if (L) chev(1);
          else if (done) chev(-1);
          else if ((t % 1.1) < 0.7) { c.beginPath(); if (p.thinking > 0.5 || p.working > 0.5) c.roundRect(-0.09 * u, 0.06 * u, 0.18 * u, 0.06 * u, 0.03 * u); else c.arc(0, 0.07 * u, 0.065 * u, 0, TAU); c.fill(); }
          break;
        }
        case 'writer': c.rotate(e.s * 0.3); c.ellipse(0, 0, 0.135 * u, 0.075 * u * B, 0, 0, TAU); c.fill(); break;
        case 'support': c.scale(1, B); c.lineWidth = 0.085 * u; c.arc(0, 0.06 * u, 0.11 * u, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); break;
        case 'analyst': {
          const hw = 0.07 * u, base = 0.13 * u, w = 0.5 + 0.5 * Math.sin(t * 3.2), busy = Math.max(p.thinking, p.working);
          const hg = (L ? lerp(0.3, 0.12 + 0.18 * w, busy) : lerp(0.18, 0.12 + 0.18 * (1 - w), busy)) * u * B;
          c.roundRect(-hw, base - hg, 2 * hw, hg, Math.min(hw, hg / 2)); c.fill(); break;
        }
        case 'designer': if (L) c.ellipse(0, 0, 0.13 * u, 0.13 * u * B, 0, 0, TAU); else c.roundRect(-0.12 * u, -0.12 * u * B, 0.24 * u, 0.24 * u * B, 0.03 * u); c.fill(); break;
        case 'scout':
          if (L) { const hw = 0.075 * u, hh = 0.16 * u * B; c.roundRect(-hw, -hh, 2 * hw, 2 * hh, Math.min(hw, hh)); c.fill(); }
          else { c.lineWidth = 0.07 * u; c.moveTo(-0.1 * u, 0.02 * u); c.lineTo(0.1 * u, 0.02 * u); c.stroke(); }
          break;
        case 'reviewer': { c.rotate(-e.s * 0.16); const hh = 0.045 * u * B; c.roundRect(-0.13 * u, -hh, 0.26 * u, 2 * hh, hh); c.fill(); break; }
        case 'networker':
          c.scale(1, B); c.rotate(Math.max(p.thinking, p.working) * t * 0.8);
          for (let i = 0; i < 8; i++) { const r = i % 2 ? 0.05 * u : 0.17 * u, a = -Math.PI / 2 + i * Math.PI / 4; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
          c.closePath(); c.lineWidth = 0.025 * u; c.fill(); c.stroke(); break;
        case 'coach': {
          c.scale(-e.s, B); const hw = 0.1 * u, hh = 0.13 * u;
          c.moveTo(-hw, -hh); c.lineTo(hw, -hh * 0.15); c.lineTo(hw, hh); c.lineTo(-hw, hh); c.closePath();
          c.lineWidth = 0.05 * u; c.fill(); c.stroke(); break;
        }
        default: { const hw = 0.075 * u, hh = 0.17 * u * B; c.roundRect(-hw, -hh, 2 * hw, 2 * hh, Math.min(hw, hh)); c.fill(); }
      }
      c.restore();
    }
  }

  const api = { draw, pose, SHAPES, EYES, STATES, ONCE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BuddyAgentFigure = api;
})(typeof window !== 'undefined' ? window : globalThis);
