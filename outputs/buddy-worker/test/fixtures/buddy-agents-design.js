/* Buddy agents — thick shapes, one colour, personality eyes. No dependencies.
   const fig = BuddyAgent.mount(canvas, { shape: 'hex', color: 'cobalt', eyes: 'chief', state: 'idle' });
   fig.setState('thinking'); fig.set({ eyes: 'dev' }); fig.destroy(); */
(function (root) {
  const COLORS = { cobalt: '#3561d8', blue: '#1f9bd6', lilac: '#8a63d2', mint: '#2e9a48', gold: '#d4a300', peach: '#e07a2c', red: '#b8432e' };
  const SHAPES = ['hex', 'circle', 'square', 'rhombus'];
  const EYES = ['default', 'chief', 'creative', 'math', 'dev', 'research', 'writer', 'support', 'analyst', 'designer', 'scout', 'reviewer', 'networker', 'coach'];
  const STATES = ['idle', 'thinking', 'talking', 'done'];
  const TAU = Math.PI * 2;

  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = x => x * x * (3 - 2 * x);
  const inkOf = c => COLORS[c] || (typeof c === 'string' && c[0] === '#' ? c : COLORS.cobalt);
  const poly = (n, r, a0) => Array.from({ length: n }, (_, i) => { const a = a0 + i * TAU / n; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const blinkAt = t => { const x = t % 4.3; return x < 0.16 ? Math.abs(1 - x / 0.08) : 1; };
  // where the eyes look: hold ~1 s, then a quick glance to the next spot
  const GL = [[0, 0], [0.12, -0.06], [0.12, -0.06], [-0.11, -0.04], [0, -0.13], [0, -0.13], [-0.12, 0.03], [0.08, -0.11], [0, 0], [0.13, 0.02], [-0.06, -0.12], [-0.06, -0.12]];
  const glance = t => { const D = 1.05, i = Math.floor(t / D), fr = Math.min(1, (t % D) / 0.2), e = ease(fr), A = GL[(i + GL.length - 1) % GL.length], B = GL[i % GL.length]; return [lerp(A[0], B[0], e), lerp(A[1], B[1], e)]; };
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

  function paint(c, size, t, p, o, dT) {
    const u = size / 2 * 0.84, col = inkOf(o.color);
    c.translate(size / 2, size / 2);
    // head turn: the circle is a sphere (eyes roll on its surface), the rest are thick tokens
    const g = glance(t * (1 + 0.15 * p.thinking)), amt = Math.max(0, 0.65 * (1 - p.thinking - p.talking - p.done)) + p.thinking;
    const yaw = g[0] / 0.13 * 0.6 * amt, pitch = g[1] / 0.13 * 0.4 * amt;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const proj = (x, y, z) => { const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; return [x1, y * cp + z1 * sp]; };
    const path = pts => { c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); };
    c.scale(0.86, 0.86);
    c.translate(sy * u * 0.05, sp * u * 0.04);
    const E = [];
    if (o.shape === 'circle') {
      c.fillStyle = col; c.beginPath(); c.arc(0, 0, 0.78 * u, 0, TAU); c.fill();
      const Rs = 0.7 * u;
      for (const s of [-1, 1]) { const a = s * 0.36 + yaw, b = -0.08 + pitch; E.push({ s, x: Rs * Math.sin(a), y: Rs * Math.sin(b), cw: Math.max(0.12, Math.cos(a)), ch: Math.max(0.2, Math.cos(b)) }); }
    } else {
      const base = o.shape === 'square' ? roundPoly([[-0.64, -0.64], [0.64, -0.64], [0.64, 0.64], [-0.64, 0.64]].map(q => [q[0] * u, q[1] * u]), 0.26 * u)
        : o.shape === 'rhombus' ? roundPoly([[0, -0.86 * u], [0.86 * u, 0], [0, 0.86 * u], [-0.86 * u, 0]], 0.16 * u)
        : roundPoly(poly(6, 0.8 * u, -Math.PI / 2), 0.16 * u);
      const D = 0.3 * u, back = base.map(q => proj(q[0], q[1], -D / 2)), front = base.map(q => proj(q[0], q[1], D / 2));
      c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 0.6; c.lineJoin = 'round';
      path(back); c.fill();
      for (let i = 0; i < base.length; i++) { const j = (i + 1) % base.length; path([front[i], front[j], back[j], back[i]]); c.fill(); c.stroke(); }
      path(front); c.fill();
      for (const s of [-1, 1]) { const q = proj(s * 0.25 * u, -0.06 * u, D / 2); E.push({ s, x: q[0], y: q[1], cw: Math.max(0.12, cy), ch: Math.max(0.2, cp) }); }
    }
    const squint = pitch < -0.2 ? 1 - 0.15 * p.thinking : 1;
    eyes(c, u, t, p, o.eyes, E, squint, Math.max(0.1, blinkAt(t)), dT);
  }

  function eyes(c, u, t, p, k, E, squint, B, dT) {
    // finish: grow 0.25 s → hold 0.5 s → shrink 0.45 s → own eyes 1 s → happy arcs
    const popping = dT > 0 && dT < 2.2;
    const pop = !popping ? 1 : dT < 0.25 ? 1 + 1.1 * ease(dT / 0.25) : dT < 0.75 ? 2.1 : 1 + 1.1 * (1 - ease(Math.min(1, (dT - 0.75) / 0.45)));
    const done = p.done > 0.5 && !popping;
    const grow = (1 + p.thinking * (0.13 + 0.04 * Math.sin(t * 2.4))) * pop;  // eyes widen while thinking
    if (popping && dT < 1.2) B = 1;
    c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff'; c.lineCap = 'round'; c.lineJoin = 'round';
    if ((k === 'math' || k === 'research') && !done) {
      c.lineWidth = 0.045 * u * Math.min(E[0].ch, E[1].ch) * squint * Math.sqrt(pop); c.lineCap = 'butt';
      c.beginPath(); c.moveTo(E[0].x, E[0].y); c.lineTo(E[1].x, E[1].y); c.stroke(); c.lineCap = 'round';
    }
    for (const e of E) {
      const L = e.s < 0;
      c.save(); c.translate(e.x, e.y); c.scale(e.cw * grow, e.ch * squint * grow);
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
          else if ((t % 1.1) < 0.7) { c.beginPath(); if (p.thinking > 0.5) c.roundRect(-0.09 * u, 0.06 * u, 0.18 * u, 0.06 * u, 0.03 * u); else c.arc(0, 0.07 * u, 0.065 * u, 0, TAU); c.fill(); }
          break;
        }
        case 'writer': c.rotate(e.s * 0.3); c.ellipse(0, 0, 0.135 * u, 0.075 * u * B, 0, 0, TAU); c.fill(); break;
        case 'support': c.scale(1, B); c.lineWidth = 0.085 * u; c.arc(0, 0.06 * u, 0.11 * u, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); break;
        case 'analyst': {
          const hw = 0.07 * u, base = 0.13 * u, w = 0.5 + 0.5 * Math.sin(t * 3.2);
          const hg = (L ? lerp(0.3, 0.12 + 0.18 * w, p.thinking) : lerp(0.18, 0.12 + 0.18 * (1 - w), p.thinking)) * u * B;
          c.roundRect(-hw, base - hg, 2 * hw, hg, Math.min(hw, hg / 2)); c.fill(); break;
        }
        case 'designer': if (L) c.ellipse(0, 0, 0.13 * u, 0.13 * u * B, 0, 0, TAU); else c.roundRect(-0.12 * u, -0.12 * u * B, 0.24 * u, 0.24 * u * B, 0.03 * u); c.fill(); break;
        case 'scout':
          if (L) { const hw = 0.075 * u, hh = 0.16 * u * B; c.roundRect(-hw, -hh, 2 * hw, 2 * hh, Math.min(hw, hh)); c.fill(); }
          else { c.lineWidth = 0.07 * u; c.moveTo(-0.1 * u, 0.02 * u); c.lineTo(0.1 * u, 0.02 * u); c.stroke(); }
          break;
        case 'reviewer': { c.rotate(-e.s * 0.16); const hh = 0.045 * u * B; c.roundRect(-0.13 * u, -hh, 0.26 * u, 2 * hh, hh); c.fill(); break; }
        case 'networker':
          c.scale(1, B); c.rotate(p.thinking * t * 0.8);
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

  const live = new Set();
  const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let raf = 0, last = 0;
  function loop(now) {
    raf = live.size ? requestAnimationFrame(loop) : 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    live.forEach(f => f.frame(dt));
  }

  class Agent {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.o = Object.assign({ shape: 'hex', color: 'cobalt', eyes: 'default', state: 'idle', speed: 1, size: 0 }, opts);
      this.p = { thinking: 0, talking: 0, done: 0 };
      if (this.o.state !== 'idle') this.p[this.o.state] = 1;
      this.t = Math.random() * 20; this.doneT = this.o.state === 'done' ? 99 : 0;
      live.add(this);
      if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
    }
    set(opts) { Object.assign(this.o, opts); return this; }
    setState(s) { if (STATES.includes(s)) this.o.state = s; return this; }
    frame(dt) {
      const still = reduce.matches, step = dt * this.o.speed;
      this.t += still ? 0 : step;
      this.doneT = this.o.state === 'done' ? (still ? 99 : this.doneT + step) : 0;
      for (const q of ['thinking', 'talking', 'done']) {
        const target = this.o.state === q ? 1 : 0;
        this.p[q] = still ? target : this.p[q] + (target - this.p[q]) * Math.min(1, step * 5);
      }
      const size = this.o.size || this.canvas.clientWidth || 48;
      const d = Math.min(2, window.devicePixelRatio || 1), px = Math.round(size * d);
      if (this.canvas.width !== px) { this.canvas.width = px; this.canvas.height = px; }
      const c = this.canvas.getContext('2d');
      c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, size, size);
      paint(c, size, still ? 2.1 : this.t, this.p, this.o, this.doneT);
    }
    destroy() { live.delete(this); }
  }

  const api = { mount: (canvas, opts) => new Agent(canvas, opts || {}), COLORS, SHAPES, EYES, STATES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BuddyAgent = api;
})(typeof window !== 'undefined' ? window : globalThis);
