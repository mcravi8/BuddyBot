/* Buddy fold figure — framework-free canvas renderer.
   Usage: const fig = BuddyFold.mount(canvas, { shape: 'hex', side: 'right', color: 'cobalt' });
          fig.setState('thinking'); fig.set({ color: 'peach' }); fig.destroy(); */
(function (root) {
  const COLORS = {
    lilac: '#8a63d2', blue: '#1f9bd6', peach: '#e07a2c', mint: '#2e9a48',
    red: '#b8432e', gold: '#d4a300', cobalt: '#3561d8', graphite: '#2b2a27'
  };
  const STATES = ['idle', 'thinking', 'talking', 'done'];
  const Q = Math.PI / 4;
  const poly = (n, r, a0) => Array.from({ length: n }, (_, i) => { const a = a0 + i * 2 * Math.PI / n; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const arcP = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  // pts in unit space; ang = fold direction [right, left]; ey/ex = eye placement; rs = eye scale
  const SHAPES = {
    square:  { name: 'Square',  ang: [-Q, -3 * Q], ey: 0.16, ex: 0.22, pts: [[-0.64, -0.64], [0.64, -0.64], [0.64, 0.64], [-0.64, 0.64]] },
    circle:  { name: 'Circle',  ang: [-Q, -3 * Q], ey: 0.14, ex: 0.23, pts: poly(72, 0.74, 0) },
    hex:     { name: 'Hex',     ang: [-Math.PI / 6, -5 * Math.PI / 6], ey: 0.14, ex: 0.22, pts: poly(6, 0.78, -Math.PI / 2) },
    pill:    { name: 'Pill',    ang: [-Q, -3 * Q], ey: 0.18, ex: 0.18, rs: 0.82, pts: [...arcP(0, -0.26, 0.5, Math.PI, 2 * Math.PI, 24), ...arcP(0, 0.26, 0.5, 0, Math.PI, 24)] },
    // A pill on its side, wide and low like Buddy's logo (asked for on 27 Oct).
    capsule: { name: 'Sideways pill', ang: [-Q, -3 * Q], ey: 0.1, ex: 0.22, rs: 0.8, pts: [...arcP(0.3, 0, 0.46, -Math.PI / 2, Math.PI / 2, 24), ...arcP(-0.3, 0, 0.46, Math.PI / 2, 3 * Math.PI / 2, 24)] },
    arch:    { name: 'Arch',    ang: [-Q, -3 * Q], ey: 0.2, ex: 0.21, pts: [...arcP(0, -0.06, 0.62, Math.PI, 2 * Math.PI, 30), [0.62, 0.7], [-0.62, 0.7]] },
    diamond: { name: 'Diamond', ang: [0, Math.PI], ey: 0.1, ex: 0.2, pts: [[0, -0.84], [0.84, 0], [0, 0.84], [-0.84, 0]] }
  };
  // Buddy saves the round figure as "sphere" (its name before the fold figures).
  SHAPES.sphere = SHAPES.circle;

  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const tint = (h, w) => `rgb(${hexRgb(h).map(v => Math.round(v + (255 - v) * w))})`;
  const alpha = (h, a) => `rgba(${hexRgb(h)},${a})`;
  const lerp = (a, b, k) => a + (b - a) * k;
  const inkOf = c => COLORS[c] || (typeof c === 'string' && c[0] === '#' ? c : COLORS.cobalt);
  const blinkAt = t => { const x = t % 4.3; return x < 0.16 ? Math.abs(1 - x / 0.08) : 1; };
  const talkEnv = t => Math.abs(Math.sin(t * 10)) * (0.6 + 0.4 * Math.sin(t * 2.7));
  const GL = [[0, 0], [0.12, -0.06], [0.12, -0.06], [-0.11, -0.04], [0, -0.13], [0, -0.13], [-0.12, 0.03], [0.08, -0.11], [0, 0], [0.13, 0.02], [-0.06, -0.12], [-0.06, -0.12]];
  const glance = t => { const D = 1.05, i = Math.floor(t / D), fr = Math.min(1, (t % D) / 0.2), e = fr * fr * (3 - 2 * fr), A = GL[(i + GL.length - 1) % GL.length], B = GL[i % GL.length]; return [lerp(A[0], B[0], e), lerp(A[1], B[1], e)]; };

  function ringEyes(c, dx, y, u, sc, open, done, lx, ly) {
    const w = 0.15 * u * sc, hh = 0.23 * u * sc * Math.max(0.1, open);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff';
    y += ly;
    for (const s of [-1, 1]) {
      const x = s * dx + lx;
      if (done > 0.5) { c.lineWidth = 0.11 * u * sc; c.lineCap = 'round'; c.beginPath(); c.arc(x, y + 0.1 * u * sc, 0.14 * u * sc, Math.PI * 1.12, Math.PI * 1.88); c.stroke(); continue; }
      c.beginPath(); c.roundRect(x - w, y - hh, 2 * w, 2 * hh, Math.min(w, hh) * 0.78); c.fill();
    }
  }
  function mouth(c, y, u, t, p) {
    if (p.talking < 0.02) return;
    const e = talkEnv(t), k = p.talking;
    c.fillStyle = '#ffffff'; c.globalAlpha = Math.min(1, k * 1.5);
    c.beginPath(); c.ellipse(0, y, u * 0.13 * (1 - 0.25 * e), u * (0.022 + 0.1 * e) * k, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }

  // How far the corner is folded over (in head radii): at its lowest and still while the agent rests, as when it has just finished (the
  // person asked on 27 Oct for the peel to rest low and move only while the agent works), lifting and lowering while it works, held up while
  // it talks. Resting keeps the eyes open; only a job just done shows the happy eyes.
  function fold(t, p) {
    let k = 0.12;
    k = lerp(k, 0.22 + 0.34 * (0.5 + 0.5 * Math.sin(t * 2.2)), p.thinking);
    k = lerp(k, 0.4, p.talking);
    return lerp(k, 0.12, p.done);
  }
  // How high the figure floats over its shadow (in head radii). It bobs only while the agent works: a resting figure bobbing made its
  // peel look as if it moved (27 Oct), so at rest only the eyes blink and glance.
  function bob(t, p) {
    return (0.5 + 0.5 * Math.sin(t * 1.3)) * 0.06 * p.thinking;
  }
  // Where the eyes look (in head radii) and how open they are. A resting figure keeps them open and looking ahead: its glancing and blinking
  // still read as an agent at work (27 Oct). Working, they look around and blink; talking, they blink.
  function eyes(t, p) {
    const k = p.thinking, g = glance(t * (1 + 0.15 * k)), x = k ? g[0] * k : 0, y = k ? g[1] * k : 0, squint = y < -0.09 ? 0.85 : 1;
    return { x, y, open: lerp(1, blinkAt(t), Math.min(1, p.thinking + p.talking)) * lerp(1, squint, p.thinking) };
  }
  // Where the eyes turn for a pointer at (dx, dy) CSS px from the figure's centre: fully toward it within `near` px (the figure and a margin),
  // less and less beyond, and not at all from `reach` px (less than a sidebar row, so only the figure by the pointer looks). x and y are in
  // head radii, as the eyes' glance; w is how strongly the pointer holds them.
  function gaze(dx, dy, reach = 60, near = 34) {
    const d = Math.hypot(dx, dy);
    if (!(d < reach)) return { x: 0, y: 0, w: 0 };
    const k = Math.min(1, (reach - d) / (reach - near)), w = k * k * (3 - 2 * k), toward = Math.min(1, d / 14);
    return d ? { x: dx / d * 0.15 * toward, y: dy / d * 0.13 * toward, w } : { x: 0, y: 0, w };
  }
  function body(c, u, t, p, o, col, size) {
    const S = SHAPES[o.shape] || SHAPES.hex, rw = u * 0.2, B = u * 4;
    const ang = S.ang[o.side === 'left' ? 1 : 0], nx = Math.cos(ang), ny = Math.sin(ang);
    const pts = S.pts.map(q => [q[0] * u, q[1] * u]);
    let hs = -1e9; for (const q of pts) hs = Math.max(hs, q[0] * nx + q[1] * ny); hs += rw / 2;
    const d = hs - fold(t, p) * u;
    const path = new Path2D(); pts.forEach((q, i) => i ? path.lineTo(q[0], q[1]) : path.moveTo(q[0], q[1])); path.closePath();
    const paint = (fill, lw) => { c.fillStyle = fill; c.strokeStyle = fill; c.lineWidth = lw; c.lineJoin = 'round'; c.fill(path); c.stroke(path); };
    const half = beyond => { c.rotate(ang); c.beginPath(); if (beyond) c.rect(d, -B, B, 2 * B); else c.rect(-B, -B, B + d, 2 * B); c.rotate(-ang); c.clip(); };
    const reflect = () => { c.rotate(ang); c.translate(2 * d, 0); c.scale(-1, 1); c.rotate(-ang); };
    // body with the corner cut off, then the flap's shadow, then the flap (the corner reflected across the crease)
    c.save(); half(false); paint(col, rw);
    c.save(); c.translate(-nx * u * 0.04, -ny * u * 0.04 + u * 0.025); reflect(); half(true); paint('rgba(0,0,0,.18)', rw); c.restore();
    c.restore();
    c.save(); reflect(); half(true); paint(tint(col, 0.55), rw);
    if (o.details.halftone && size >= 32) {
      c.clip(path); c.fillStyle = alpha(col, 0.5);
      const sp = u * 0.075, r = u * 0.022;
      c.beginPath(); for (let x = -u; x <= u; x += sp) for (let y = -u; y <= u; y += sp) { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); } c.fill();
    }
    c.restore();
    const sc = S.rs || 1, ey = u * (S.ey - 0.03) - u * 0.05 * p.talking;
    // opts.look: where something near catches the eyes ({x, y} in head radii, w how strongly), over where they would look anyway.
    const e = eyes(t, p), lk = o.look || { x: 0, y: 0, w: 0 }, w = Math.max(0, Math.min(1, lk.w || 0));
    ringEyes(c, u * 0.24 * sc, ey, u, sc, e.open, p.done, lerp(e.x, lk.x || 0, w) * u, lerp(e.y, lk.y || 0, w) * u);
    mouth(c, u * (S.ey + 0.3), u, t, p);
    if (o.details.blush && p.done > 0.01) {
      c.fillStyle = `rgba(255,255,255,${0.3 * p.done})`;
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * u * 0.4 * sc, ey + u * 0.2, u * 0.075, u * 0.042, 0, 0, Math.PI * 2); c.fill(); }
    }
  }

  function paint(c, size, t, p, o) {
    const u = size / 2 * 0.84, col = inkOf(o.color);
    c.translate(size / 2, size / 2);
    if (!o.details.shadow) return body(c, u, t, p, o, col, size);
    const lift = bob(t, p) * u, k = lift / u;
    c.fillStyle = `rgba(20,20,20,${0.15 - k * 0.9})`;
    c.beginPath(); c.ellipse(0, u * 0.9, u * 0.5 * (1 - k * 1.6), u * 0.07 * (1 - k), 0, 0, Math.PI * 2); c.fill();
    c.translate(0, -u * 0.08 - lift); c.scale(0.88, 0.88);
    body(c, u, t, p, o, col, size);
  }

  const live = new Set();
  const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let raf = 0, last = 0;
  function loop(now) {
    raf = live.size ? requestAnimationFrame(loop) : 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    live.forEach(f => f.frame(dt));
  }

  class Figure {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.o = Object.assign({ shape: 'hex', side: 'right', color: 'cobalt', state: 'idle', speed: 1, size: 0 }, opts);
      this.o.details = Object.assign({ shadow: true, halftone: false, blush: false }, opts && opts.details);
      this.p = { thinking: 0, talking: 0, done: 0 };
      this.p[this.o.state] = 1;
      this.t = Math.random() * 20;
      live.add(this);
      if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
    }
    set(opts) { const det = opts.details; Object.assign(this.o, opts); if (det) this.o.details = Object.assign({}, this.o.details, det); return this; }
    setState(s) { if (STATES.includes(s)) this.o.state = s; return this; }
    frame(dt) {
      const still = reduce.matches;
      this.t += still ? 0 : dt * this.o.speed;
      for (const q of ['thinking', 'talking', 'done']) {
        const target = this.o.state === q ? 1 : 0;
        this.p[q] = still ? target : this.p[q] + (target - this.p[q]) * Math.min(1, dt * 5 * this.o.speed);
      }
      const size = this.o.size || this.canvas.clientWidth || 48;
      const d = Math.min(2, window.devicePixelRatio || 1), px = Math.round(size * d);
      if (this.canvas.width !== px) { this.canvas.width = px; this.canvas.height = px; }
      const c = this.canvas.getContext('2d');
      c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, size, size);
      paint(c, size, still ? 2.1 : this.t, this.p, this.o);
    }
    destroy() { live.delete(this); }
  }

  // One figure into a context already placed at its top-left corner: size in CSS px, t its clock, p its mood weights {thinking, talking, done}.
  // Buddy paints its own canvases with this (buddy-fold-agents.js), several figures to a canvas for a group.
  const draw = (c, size, t, p, opts) => {
    const o = Object.assign({ shape: 'hex', side: 'right', color: 'cobalt' }, opts);
    o.details = Object.assign({ shadow: true, halftone: false, blush: false }, opts && opts.details);
    c.save(); paint(c, size, t, Object.assign({ thinking: 0, talking: 0, done: 0 }, p), o); c.restore();
  };
  const api = { mount: (canvas, opts) => new Figure(canvas, opts || {}), draw, fold, bob, eyes, gaze, SHAPES, COLORS, STATES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BuddyFold = api;
})(typeof window !== 'undefined' ? window : globalThis);
