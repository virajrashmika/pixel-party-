// Pixel Party - shared "neon arcade" graphics helpers for the menu and every game.
// Plain <script src> (not a module), so pages still work when opened by double-clicking.
//
//   const st = FX.stage(canvas, { width: 320, height: 180 });  // sharp, 16:9, fills its box
//   each frame:  FX.update(dt); st.begin(); ...draw in 320x180 units...; FX.draw(st.ctx); st.end();
//
// Games keep drawing in their own logical units (320 x 180); the stage scales that up to the
// real screen resolution (devicePixelRatio), so gameplay maths never has to change.
const FX = (() => {
  // ===================================================================
  // LOW EFFECTS: no particles, no glow, 1x resolution. Remembered between visits.
  // ===================================================================
  const STORE_KEY = 'pixelParty.lowFx';
  let low = false;
  try { low = localStorage.getItem(STORE_KEY) === '1'; } catch (e) { /* storage blocked */ }
  const lowListeners = [];

  function applyLow(v) {
    low = !!v;
    shapeCache.clear();
    if (low) particles.clear();
    stages.forEach(s => s.resize());
    lowListeners.forEach(f => f(low));
  }
  function setLow(v) {
    try { localStorage.setItem(STORE_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ }
    applyLow(v);
  }
  // another open tab changed the setting
  addEventListener('storage', e => { if (e.key === STORE_KEY) applyLow(e.newValue === '1'); });

  // ===================================================================
  // MATHS AND EASING (t goes from 0 to 1)
  // ===================================================================
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = n => Math.floor(Math.random() * n);
  const pick = list => list[randInt(list.length)];
  const ease = {
    linear: t => t,
    inQuad: t => t * t,
    outQuad: t => 1 - (1 - t) * (1 - t),
    inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
    outCubic: t => 1 - (1 - t) ** 3,
    inOutCubic: t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
    outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
    inBack: t => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t ** 3 - c1 * t * t; },
    outElastic: t => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
    outBounce: t => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    }
  };

  // ===================================================================
  // COLORS
  // ===================================================================
  const rgbCache = new Map();
  function rgb(hex) {
    let c = rgbCache.get(hex);
    if (!c) {
      let h = hex.replace('#', '');
      if (h.length === 3) h = [...h].map(x => x + x).join('');
      const n = parseInt(h, 16);
      c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      rgbCache.set(hex, c);
    }
    return c;
  }
  const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
  function mix(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return '#' + x.map((v, i) => Math.round(lerp(v, y[i], t)).toString(16).padStart(2, '0')).join('');
  }

  // ===================================================================
  // FONTS
  // ===================================================================
  const FONT_DISPLAY = '"Russo One", "Orbitron", "Segoe UI", system-ui, sans-serif';
  const FONT_BODY = '"Rajdhani", "Segoe UI", system-ui, sans-serif';
  const font = (size, family = FONT_DISPLAY, weight = '') => `${weight ? weight + ' ' : ''}${size}px ${family}`;

  // ===================================================================
  // STAGE: a sharp canvas that keeps its shape (16:9) at any window size
  //   fit: 'container' = as wide as its parent, but never taller than the window
  //        'window'    = as big as the whole window
  //   margin: window height to leave free (a number, or a function that returns one)
  // ===================================================================
  const stages = [];
  let pxRatio = 1;                               // real screen pixels per logical unit (for sprite sharpness)

  function stage(canvas, opts = {}) {
    const o = Object.assign({ width: 320, height: 180, fit: 'container', maxDpr: 2, maxPixels: 2560 * 1440, margin: 0 }, opts);
    const ctx = canvas.getContext('2d');
    const s = { canvas, ctx, width: o.width, height: o.height, k: 1, dpr: 1, cssW: 0, cssH: 0, onResize: null };

    s.resize = () => {
      const aspect = o.width / o.height;
      let w = o.fit === 'window' ? innerWidth : (canvas.parentElement || document.body).clientWidth;
      const maxH = Math.max(90, innerHeight - (typeof o.margin === 'function' ? o.margin() : o.margin));
      if (w / maxH > aspect) w = maxH * aspect;   // too wide: the height decides
      w = Math.max(16, Math.floor(w));
      const h = Math.max(9, Math.min(Math.round(w / aspect), Math.floor(maxH)));
      // draw at the screen's real resolution, but cap it so big/high-DPI screens stay fast
      let dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : o.maxDpr);
      if (w * h * dpr * dpr > o.maxPixels) dpr = Math.sqrt(o.maxPixels / (w * h));
      const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      s.cssW = w; s.cssH = h; s.dpr = dpr; s.k = bw / o.width;
      s.seenDpr = window.devicePixelRatio || 1;
      const newRatio = Math.max(...stages.map(x => x.k), s.k);
      if (Math.abs(newRatio - pxRatio) > 0.01) { pxRatio = newRatio; shapeCache.clear(); }
      if (s.onResize) s.onResize(s);
    };

    // Call at the start of each frame: clears, then sets up logical units + screen shake
    s.begin = (clear = true) => {
      if ((window.devicePixelRatio || 1) !== s.seenDpr) s.resize();   // browser zoom / moved to another screen
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (clear) ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;
      const u = o.width / 320;                   // shake is measured in "320-wide" units
      ctx.setTransform(s.k, 0, 0, s.k, shakeX * u * s.k, shakeY * u * s.k);
      if (shakeRot) {
        ctx.translate(o.width / 2, o.height / 2); ctx.rotate(shakeRot); ctx.translate(-o.width / 2, -o.height / 2);
      }
    };
    // Same units, but without shake (for score boards / HUD)
    s.steady = () => ctx.setTransform(s.k, 0, 0, s.k, 0, 0);
    // Call at the end of each frame: draws the screen flash on top
    s.end = () => {
      if (flashA > 0.001) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = Math.min(1, flashA);
        ctx.fillStyle = flashColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      }
    };
    // Mouse / touch position -> logical units
    s.toLogical = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      return { x: (clientX - r.left) / r.width * o.width, y: (clientY - r.top) / r.height * o.height };
    };

    stages.push(s);
    let queued = false;
    const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; s.resize(); }); } };
    addEventListener('resize', later);
    if (window.ResizeObserver && canvas.parentElement) new ResizeObserver(later).observe(canvas.parentElement);
    // moving the window to a screen with a different pixel density
    (function watchDpr() {
      if (!window.matchMedia) return;
      const mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      const fn = () => { later(); mq.removeEventListener ? mq.removeEventListener('change', fn) : mq.removeListener(fn); watchDpr(); };
      mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn);
    })();
    s.resize();
    return s;
  }

  // ===================================================================
  // GLOW: shapes are drawn ONCE with a blur onto a small offscreen canvas,
  // then that picture is reused every frame (shadowBlur every frame is slow).
  // ===================================================================
  const dotCache = new Map();                    // soft round dots (resolution independent)
  const shapeCache = new Map();                  // glowing shapes and texts (made at screen resolution)

  // A soft round glow with a white-hot middle. Draw it with 'lighter' blending for neon sparks.
  function glowDot(color) {
    let c = dotCache.get('g' + color);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.15, rgba(color, 0.95));
    grd.addColorStop(0.45, rgba(color, 0.32));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    dotCache.set('g' + color, c);
    return c;
  }
  // A soft puff (for smoke) - no white middle
  function softDot(color) {
    let c = dotCache.get('s' + color);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, rgba(color, 1));
    grd.addColorStop(0.5, rgba(color, 0.5));
    grd.addColorStop(1, rgba(color, 0));
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    dotCache.set('s' + color, c);
    return c;
  }

  // Pre-draws a glowing shape. key = a unique name; w, h = size in logical units;
  // draw(g) draws the shape with its top-left at (0, 0). opts: { color, glow (radius), strong }
  function shape(key, w, h, draw, opts = {}) {
    const glow = low ? 0 : (opts.glow == null ? 6 : opts.glow);
    const res = clamp(pxRatio, 1, 8);
    const ck = key + '|' + glow + '|' + res.toFixed(2);
    let s = shapeCache.get(ck);
    if (s) return s;
    const pad = Math.ceil(glow * 2) + 1;         // room around the shape for the glow
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((w + pad * 2) * res));
    c.height = Math.max(1, Math.ceil((h + pad * 2) * res));
    const g = c.getContext('2d');
    g.scale(res, res); g.translate(pad, pad);
    if (glow) {
      g.save();
      g.shadowColor = opts.color || '#ffffff';
      g.shadowBlur = glow * res;
      draw(g);
      if (opts.strong) draw(g);
      g.restore();
    }
    draw(g);                                     // a crisp copy on top of the glow
    s = { img: c, w, h, pad };
    shapeCache.set(ck, s);
    if (shapeCache.size > 400) shapeCache.delete(shapeCache.keys().next().value);   // forget the oldest
    return s;
  }

  // Draws a pre-made shape. (x, y) is where its anchor goes (default: the middle).
  // opts: { scale, alpha, rot, ax, ay (0..1 anchor), add (lighter blending) }
  function drawShape(ctx, s, x, y, o = {}) {
    const ax = o.ax == null ? 0.5 : o.ax, ay = o.ay == null ? 0.5 : o.ay;
    const sc = o.scale == null ? 1 : o.scale;
    const rot = o.rot || 0;
    const oldA = ctx.globalAlpha, oldOp = ctx.globalCompositeOperation;
    if (o.alpha != null) ctx.globalAlpha = oldA * o.alpha;
    if (o.add) ctx.globalCompositeOperation = 'lighter';
    const fw = (s.w + s.pad * 2) * sc, fh = (s.h + s.pad * 2) * sc;
    const dx = -(s.pad + s.w * ax) * sc, dy = -(s.pad + s.h * ay) * sc;
    if (rot) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.drawImage(s.img, dx, dy, fw, fh);
      ctx.restore();
    } else ctx.drawImage(s.img, x + dx, y + dy, fw, fh);
    ctx.globalAlpha = oldA; ctx.globalCompositeOperation = oldOp;
  }

  // Glowing text, pre-drawn once per (text, size, color). Use it for text that doesn't change
  // every frame; for fast-changing numbers (timers, speed) use plain ctx.fillText instead.
  const measureCtx = document.createElement('canvas').getContext('2d');
  function textSprite(str, o = {}) {
    const size = o.size || 12, color = o.color || '#ffffff', family = o.font || FONT_DISPLAY;
    const f = font(size, family, o.weight || '');
    measureCtx.font = f;
    const w = Math.max(1, measureCtx.measureText(str).width), h = size * 1.25;
    return shape('t|' + str + '|' + f + '|' + color, w, h, g => {
      g.font = f; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillStyle = color; g.fillText(str, 0, h / 2);
    }, { color, glow: o.glow == null ? size * 0.35 : o.glow });
  }
  // align: 'left' | 'center' | 'right'; y is the middle of the text
  function drawText(ctx, str, x, y, o = {}) {
    const ax = o.align === 'left' ? 0 : o.align === 'right' ? 1 : 0.5;
    drawShape(ctx, textSprite(str, o), x, y, { ax, ay: 0.5, scale: o.scale, alpha: o.alpha, rot: o.rot });
  }
  // texts drawn before the web fonts arrived used a fallback font: redraw them
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => shapeCache.clear());

  // A rounded rectangle path (ctx.roundRect is missing in older browsers)
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ===================================================================
  // PARTICLES: sparks, smoke, explosions, confetti, trail dots
  // All sizes and speeds are in logical units (and per second).
  // ===================================================================
  class Particles {
    constructor(max = 700) { this.max = max; this.list = []; }
    get count() { return this.list.length; }
    clear() { this.list.length = 0; }
    add(p) {
      if (low) return null;                      // "Low effects": no particles at all
      if (this.list.length >= this.max) this.list.shift();
      p.age = 0;
      this.list.push(p);
      return p;
    }
    // Bright streaks flying out. angle + spread = direction (default: all around)
    sparks(x, y, o = {}) {
      const n = o.count == null ? 16 : o.count, speed = o.speed || 120;
      const angle = o.angle || 0, spread = o.spread == null ? Math.PI * 2 : o.spread;
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - 0.5) * spread, v = speed * rand(0.35, 1);
        this.add({
          kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: rand(0.25, 0.6) * (o.life || 1), size: o.size || 1.2, color: o.color || '#ffffff',
          drag: o.drag == null ? 3 : o.drag, gravity: o.gravity == null ? 120 : o.gravity
        });
      }
    }
    // Soft puffs that grow and fade
    smoke(x, y, o = {}) {
      const n = o.count == null ? 6 : o.count;
      for (let i = 0; i < n; i++) {
        this.add({
          kind: 'smoke', x: x + rand(-2, 2), y: y + rand(-2, 2),
          vx: rand(-15, 15) + (o.vx || 0), vy: rand(-25, -8) + (o.vy || 0),
          life: rand(0.6, 1.2) * (o.life || 1), size: o.size || 5, grow: o.grow == null ? 10 : o.grow,
          color: o.color || '#8a84b8', alpha: o.alpha == null ? 0.35 : o.alpha, drag: 1.5, gravity: -6
        });
      }
    }
    // Flash + shock ring + sparks + smoke. size 1 = normal, 2 = big
    explosion(x, y, o = {}) {
      const size = o.size || 1, color = o.color || '#ffb347';
      this.add({ kind: 'flare', x, y, vx: 0, vy: 0, life: 0.35, size: 26 * size, color, drag: 0, gravity: 0 });
      this.add({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.45, size: 4 * size, grow: 60 * size, width: 2.5 * size, color, drag: 0, gravity: 0 });
      this.sparks(x, y, { count: Math.round(26 * size), color, speed: 190 * size, gravity: 80 });
      this.sparks(x, y, { count: Math.round(10 * size), color: '#ffffff', speed: 130 * size });
      this.smoke(x, y, { count: Math.round(7 * size), size: 6 * size, grow: 20 * size, color: o.smoke || '#5a547e' });
    }
    // Paper pieces that flutter down. Bursts upwards from (x, y)
    confetti(x, y, o = {}) {
      const colors = o.colors || ['#ff7a59', '#4fd1e8', '#f4c542', '#f1ecff'];
      const n = o.count == null ? 60 : o.count, spread = o.spread == null ? Math.PI * 0.8 : o.spread;
      const angle = o.angle == null ? -Math.PI / 2 : o.angle, speed = o.speed || 200;
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - 0.5) * spread, v = speed * rand(0.4, 1);
        this.add({
          kind: 'confetti', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: rand(1.6, 2.8), size: rand(2, 3.5), color: pick(colors),
          rot: rand(0, 6.28), vr: rand(-10, 10), flutter: rand(0, 6.28), drag: 1.6, gravity: 140
        });
      }
    }
    // Confetti falling from the top edge between x0 and x1
    confettiRain(x0, x1, y, o = {}) {
      const n = o.count == null ? 50 : o.count;
      for (let i = 0; i < n; i++) this.confetti(rand(x0, x1), y - rand(0, 30), Object.assign({}, o, { count: 1, angle: Math.PI / 2, spread: 0.6, speed: 40 }));
    }
    // One glowing dot that fades where it is (ball trails, dodge ghosts)
    dot(x, y, o = {}) {
      this.add({ kind: 'dot', x, y, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 0.3, size: o.size || 4, color: o.color || '#ffffff', drag: 0, gravity: 0 });
    }

    update(dt) {
      const list = this.list;
      let j = 0;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) continue;           // dead: don't keep it
        if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
        list[j++] = p;
      }
      list.length = j;
    }

    draw(ctx) {
      const list = this.list;
      if (!list.length) return;
      const oldA = ctx.globalAlpha, oldOp = ctx.globalCompositeOperation;
      // 1) smoke behind everything (normal blending)
      for (const p of list) {
        if (p.kind !== 'smoke') continue;
        const t = p.age / p.life, r = p.size + p.grow * t;
        ctx.globalAlpha = p.alpha * (1 - t);
        ctx.drawImage(softDot(p.color), p.x - r, p.y - r, r * 2, r * 2);
      }
      // 2) glowing things, added on top of each other ('lighter' = neon)
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of list) {
        const t = p.age / p.life;
        if (p.kind === 'spark') {
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * (1 - t * 0.6);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
          const r = p.size * 2.5;
          ctx.drawImage(glowDot(p.color), p.x - r, p.y - r, r * 2, r * 2);
        } else if (p.kind === 'flare' || p.kind === 'dot') {
          const r = p.kind === 'flare' ? p.size * (0.6 + t * 0.6) : p.size * (1 - t * 0.5);
          ctx.globalAlpha = 1 - t;
          ctx.drawImage(glowDot(p.color), p.x - r, p.y - r, r * 2, r * 2);
        } else if (p.kind === 'ring') {
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * (1 - t);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size + p.grow * ease.outCubic(t), 0, Math.PI * 2); ctx.stroke();
        }
      }
      // 3) confetti on top (normal blending)
      ctx.globalCompositeOperation = 'source-over';
      for (const p of list) {
        if (p.kind !== 'confetti') continue;
        const t = p.age / p.life;
        ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
        const w = p.size * Math.abs(Math.cos(p.flutter + p.age * 8)) + 0.3, h = p.size * 0.6;
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();                         // a small rotated rectangle
        ctx.moveTo(p.x + (-w * c + h * s), p.y + (-w * s - h * c));
        ctx.lineTo(p.x + (w * c + h * s), p.y + (w * s - h * c));
        ctx.lineTo(p.x + (w * c - h * s), p.y + (w * s + h * c));
        ctx.lineTo(p.x + (-w * c - h * s), p.y + (-w * s + h * c));
        ctx.fill();
      }
      ctx.globalAlpha = oldA; ctx.globalCompositeOperation = oldOp;
    }
  }
  const particles = new Particles();

  // ===================================================================
  // SCREEN SHAKE ("trauma": hits add to it, it calms down by itself)
  // ===================================================================
  let trauma = 0, shakeX = 0, shakeY = 0, shakeRot = 0, time = 0;
  const SHAKE_MAX = 7, SHAKE_ROT = 0.015;        // in 320-wide units / radians
  function shake(amount = 0.3) {
    if (amount === 'small') amount = 0.25;
    if (amount === 'big') amount = 0.7;
    trauma = Math.min(1, trauma + amount);
  }

  // ===================================================================
  // SCREEN FLASH
  // ===================================================================
  let flashA = 0, flashRate = 0, flashColor = '#ffffff';
  function flash(color = '#ffffff', duration = 0.15, strength = 0.6) {
    flashColor = color;
    flashA = Math.max(flashA, strength);
    flashRate = flashA / Math.max(0.01, duration);
  }

  // ===================================================================
  // FLOATING TEXT: pops in, rises and fades ("+1", "CRITICAL!", "NITRO!")
  // ===================================================================
  const texts = [];
  function floatText(str, x, y, o = {}) {
    if (texts.length > 40) texts.shift();
    texts.push({
      str, x, y, age: 0, color: o.color || '#ffffff', size: o.size || 12, life: o.life || 0.9,
      rise: o.rise == null ? 16 : o.rise, pop: o.pop !== false, jitter: o.shake || 0, font: o.font
    });
  }
  function drawTexts(ctx) {
    for (const t of texts) {
      const k = t.age / t.life;
      const scale = t.pop && k < 0.25 ? Math.max(0.01, ease.outBack(k / 0.25)) : 1;
      const alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      const j = t.jitter ? (Math.random() - 0.5) * t.jitter * (1 - k) : 0;
      drawText(ctx, t.str, t.x + j, t.y - t.rise * ease.outCubic(k), { size: t.size, color: t.color, font: t.font, scale, alpha });
    }
  }

  // ===================================================================
  // ONE CALL PER FRAME
  // ===================================================================
  let fps = 60;
  function update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    time += dt;
    if (dt > 0) fps = lerp(fps, 1 / dt, 0.05);
    particles.update(dt);
    for (let i = texts.length - 1; i >= 0; i--) {
      texts[i].age += dt;
      if (texts[i].age >= texts[i].life) texts.splice(i, 1);
    }
    trauma = Math.max(0, trauma - dt * 1.5);
    const s = trauma * trauma;                   // squared: small hits = tiny shake, big hits = big shake
    shakeX = SHAKE_MAX * s * (Math.sin(time * 47.3) * 0.6 + Math.sin(time * 91.7 + 1.7) * 0.4);
    shakeY = SHAKE_MAX * s * (Math.sin(time * 53.9 + 0.5) * 0.6 + Math.sin(time * 83.1 + 2.9) * 0.4);
    shakeRot = SHAKE_ROT * s * Math.sin(time * 37.1 + 4.2);
    if (flashA > 0) flashA = Math.max(0, flashA - flashRate * dt);
  }
  // draws the shared particles and floating texts (call inside stage.begin()/end())
  function draw(ctx) {
    particles.draw(ctx);
    drawTexts(ctx);
  }

  return {
    get low() { return low; }, setLow, onLowChange: f => lowListeners.push(f),
    stage, update, draw,
    get fps() { return fps; }, get time() { return time; },
    clamp, lerp, rand, randInt, pick, ease,
    rgba, mix, FONT_DISPLAY, FONT_BODY, font,
    glowDot, softDot, shape, drawShape, textSprite, drawText, roundRect,
    Particles, particles,
    sparks: (x, y, o) => particles.sparks(x, y, o),
    smoke: (x, y, o) => particles.smoke(x, y, o),
    explosion: (x, y, o) => particles.explosion(x, y, o),
    confetti: (x, y, o) => particles.confetti(x, y, o),
    confettiRain: (x0, x1, y, o) => particles.confettiRain(x0, x1, y, o),
    dot: (x, y, o) => particles.dot(x, y, o),
    shake, flash, text: floatText
  };
})();
