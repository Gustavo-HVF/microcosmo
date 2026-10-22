/* Microcosmo — motor do site do pitch.
   A rolagem nativa (com encaixe por CSS) vira um "beat" global. A página não
   desce: cada beat troca o conteúdo do palco fixo e dispara os efeitos da cena
   (bola com squash & stretch, grade de pontos, barras 3D, faixas, objetos 3D e
   partículas), seguindo a linguagem do vídeo de referência. */
(() => {
'use strict';

/* ====== EDITE AQUI: nomes da equipe e turma ====== */
const EQUIPE = {
  nomes: ['Gustavo Henrique', 'Pedro Afonso', 'Ryam Bordes', 'João Victor', 'Izabelly Cauane'],
  turma: '2°B tec',
};

// Um item por beat = a cor de fundo daquele momento. '!' no fim esconde o HUD.
const SCENES = [
  { id: 's1', titulo: 'capa e identidade', fala: 'todos', beats: ['ink!', 'ink', 'ink', 'lime', 'ink'] },
  { id: 's2', titulo: 'a origem e o problema', fala: 'integrante 1', beats: ['orange', 'ink', 'paper', 'blue', 'ink', 'ink', 'ink', 'ink', 'blue!'] },
  { id: 's3', titulo: 'como fizemos', fala: 'integrante 2', beats: ['ink', 'ink', 'paper', 'orange', 'blue'] },
  { id: 's4', titulo: 'diagrama de casos de uso', fala: 'integrante 3', beats: ['paper', 'paper', 'paper', 'paper', 'paper'] },
  { id: 's5', titulo: 'a aplicação prática', fala: 'integrante 4', beats: ['ink', 'paper', 'paper', 'lime', 'paper', 'ink', 'ink', 'lime'] },
  { id: 's6', titulo: 'conclusão', fala: 'todos', beats: ['ink', 'ink', 'ink', 'ink'] },
];
const PITCH_MAX = 300; // 5 minutos

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const outCubic = t => 1 - Math.pow(1 - t, 3);
const inOutCubic = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rand = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(20261021);
const hash = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const stage = $('#stage');
const track = $('#track');
const sceneEls = SCENES.map(s => $('#' + s.id));
const BEATS = [];
const sceneStart = [];
SCENES.forEach((s, si) => {
  sceneStart.push(BEATS.length);
  s.beats.forEach((tok, b) => BEATS.push({ s: si, b, bg: tok.replace('!', ''), hud: !tok.endsWith('!') }));
});
const N = BEATS.length;
let W = stage.clientWidth, H = stage.clientHeight;

/* ---------- conteúdo editável ---------- */
$$('[data-nome]').forEach(el => { el.textContent = EQUIPE.nomes[+el.dataset.nome] || ''; });
$$('[data-turma]').forEach(el => { el.textContent = EQUIPE.turma; });

/* ---------- texto quebrado em letras (máscaras e digitação) ---------- */
$$('[data-split]').forEach(el => {
  const txt = el.textContent;
  el.textContent = '';
  [...txt].forEach((c, i) => {
    const s = document.createElement('span');
    s.className = 'ch';
    s.style.setProperty('--i', i);
    s.textContent = c === ' ' ? ' ' : c;
    el.appendChild(s);
  });
});

/* ---------- estados por beat ---------- */
const parseRange = (str, last) => {
  const [a, b] = str.split('-');
  return [+a, b === undefined ? +a : b === '' ? last : +b];
};
let sceneItems = [];
function indexScene(si) {
  const last = SCENES[si].beats.length - 1;
  sceneItems[si] = $$('[data-b]', sceneEls[si]).map(node => ({ node, r: parseRange(node.dataset.b, last) }));
}
SCENES.forEach((_, si) => indexScene(si));

function applyStates(si, b) {
  for (const it of sceneItems[si]) {
    const st = b < it.r[0] ? 'before' : b > it.r[1] ? 'after' : 'on';
    if (it.node._st !== st) {
      it.node.classList.remove('before', 'on', 'after');
      it.node.classList.add(st);
      it.node._st = st;
    }
  }
  sceneEls[si].dataset.lb = b;
}
function reapplyQuiet(si, b) {
  const el = sceneEls[si];
  el.classList.add('no-tr');
  applyStates(si, b);
  void el.offsetWidth;
  el.classList.remove('no-tr');
}
SCENES.forEach((_, si) => applyStates(si, -1));

/* ---------- trilho de rolagem ---------- */
let beatPx = window.innerHeight;
for (let i = 0; i < N; i++) track.appendChild(document.createElement('i'));
function sizeTrack() {
  beatPx = window.innerHeight;
  document.documentElement.style.setProperty('--beat', beatPx + 'px');
}
sizeTrack();

/* ---------- HUD ---------- */
const hudSub = $('#hudSub'), hudFala = $('#hudFala'), hudCount = $('#hudCount'), hudProg = $('#hudProg');
const segs = SCENES.map((s, i) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', `Ir para ${String(i + 1).padStart(2, '0')} — ${s.titulo}`);
  btn.addEventListener('click', () => { btn.blur(); go(sceneStart[i]); });
  $('#hudSegs').appendChild(btn);
  return btn;
});
function updateHud(si) {
  const n = String(si + 1).padStart(2, '0');
  hudSub.textContent = `(${n}) ${SCENES[si].titulo}`;
  hudFala.textContent = `fala → ${SCENES[si].fala}`;
  hudCount.textContent = `${n} — 06`;
  segs.forEach((b, i) => b.classList.toggle('on', i === si));
}

/* ---------- cronômetro do pitch ---------- */
const timer = (() => {
  const btn = $('#timer'), out = $('#timerT');
  let acc = 0, startAt = null, started = false, lastS = -1;
  const elapsed = () => acc + (startAt ? (performance.now() - startAt) / 1000 : 0);
  const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const run = () => { if (!startAt) { startAt = performance.now(); started = true; btn.classList.remove('paused'); } };
  const pause = () => { if (startAt) { acc = elapsed(); startAt = null; btn.classList.add('paused'); } };
  btn.addEventListener('click', () => { btn.blur(); startAt ? pause() : run(); });
  return {
    autostart() { if (!started) run(); },
    reset() { acc = 0; startAt = null; started = false; lastS = -1; btn.classList.add('paused'); },
    tick() {
      const s = Math.floor(elapsed());
      if (s === lastS) return;
      lastS = s;
      out.textContent = fmt(s);
      btn.classList.toggle('warn', s >= PITCH_MAX - 60 && s < PITCH_MAX);
      btn.classList.toggle('over', s >= PITCH_MAX);
    },
  };
})();

/* =====================================================================
   01 · bola com squash & stretch sobre a lâmina
   ===================================================================== */
const Bounce = (() => {
  const el = $('#bounce');
  const svg = $('.bn-svg', el), line = $('.bn-line', el), lead = $('.bn-lead', el);
  const ball = $('.bn-ball', el), shadow = $('.bn-shadow', el);
  const dots = $$('.bn-dot', el), lbls = $$('.bn-lbl', el);
  let w, h, r, gy, x0, x1, bx, peak, t0 = 0, on = false;
  function layout() {
    w = el.clientWidth; h = el.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    r = clamp(Math.min(w, h) * .03, 12, 30);
    gy = h * .6;
    const half = Math.min(w * .3, 440);
    x0 = w / 2 - half; x1 = w / 2 + half;
    bx = w / 2 + half * .12;
    peak = Math.min(h * .3, 300);
    ball.style.width = ball.style.height = 2 * r + 'px';
    shadow.style.width = 2.6 * r + 'px'; shadow.style.height = .5 * r + 'px';
    const d1 = x0 + half * .55, d2 = x0 + half * .78;
    dots[0].style.transform = `translate(${d1}px,${gy}px)`;
    dots[1].style.transform = `translate(${d2}px,${gy}px)`;
    const lx = x0 + half * .66;
    lead.setAttribute('d', `M${lx} ${gy + 4} L${lx - 18} ${gy + 30} L${lx - 70} ${gy + 30}`);
    lbls[0].style.transform = `translate(${lx - 70}px,${gy + 36}px)`;
    frame(performance.now());
  }
  function frame(now) {
    const T = 1.08, t = (now - t0) / 1000;
    const u = ((t % T) + T) % T / T;
    const s = 2 * u - 1;
    const hgt = peak * (1 - s * s);
    const speed = Math.abs(s);
    const c = Math.max(0, 1 - Math.min(u, 1 - u) / .075);
    const sy = 1 + .24 * speed * (1 - c) - .42 * c;
    const sx = 1 / sy;
    const depth = c * r * .55;
    const bottom = gy - hgt + depth;
    ball.style.transform = `translate(${bx - r}px,${bottom - 2 * r}px) scale(${sx},${sy})`;
    ball.style.transformOrigin = '50% 100%';
    const k = 1 - hgt / peak;
    shadow.style.transform = `translate(${bx - 1.3 * r}px,${gy - .1 * r}px) scale(${.45 + .55 * k})`;
    shadow.style.opacity = .25 + .75 * k;
    const sp = r * 2.6;
    line.setAttribute('d', `M${x0} ${gy} L${bx - sp} ${gy} Q${bx} ${gy + 2 * depth} ${bx + sp} ${gy} L${x1} ${gy}`);
    lbls[1].style.transform = `translate(${bx + r + 16}px,${bottom - r * 1.4}px)`;
  }
  return {
    layout, frame,
    start() { on = true; t0 = performance.now() - 260; },
    stop() { on = false; },
    get on() { return on; },
  };
})();

/* anel de texto girando em 3D (TYPE IN MOTION) */
function buildRing() {
  const ring = $('#ring');
  const txt = ring.dataset.text;
  const size = ring.clientWidth || 300;
  const R = size * .34, n = txt.length;
  const cw = 2 * Math.PI * R / n, ch = R * .4;
  ring.innerHTML = '<div class="ring-tilt"><div class="ring-spin"></div></div>';
  const spin = $('.ring-spin', ring);
  [...txt].forEach((c, i) => {
    const s = document.createElement('span');
    s.textContent = c === ' ' ? ' ' : c;
    s.style.cssText = `width:${cw + 1.2}px;height:${ch}px;margin:${-ch / 2}px 0 0 ${-cw / 2}px;font-size:${ch * .6}px;transform:rotateY(${i * 360 / n}deg) translateZ(${R}px)`;
    spin.appendChild(s);
  });
}

/* =====================================================================
   02 · faixas em movimento (MOTION · MOTION)
   ===================================================================== */
const MQ_ROWS = [
  ['r-b', 'surtos', 'intoxicação'],
  ['r-w', 'recall', 'multas'],
  ['r-b', 'interdição', 'parada de linha'],
  ['r-w', 'trabalhador infectado', 'zoonose'],
  ['center'],
  ['r-w', 'lote descartado', 'recall'],
  ['r-b', 'multas', 'interdição'],
  ['r-w', 'parada de linha', 'surtos'],
  ['r-b', 'zoonose', 'trabalhador infectado'],
];
const Marquee = {
  on: false, rows: [], off: 0,
  build() {
    const mq = $('#mq');
    mq.innerHTML = '';
    this.rows = [];
    mq.style.setProperty('--mqf', (H / 9 * .8).toFixed(1) + 'px');
    MQ_ROWS.forEach((r, k) => {
      const row = document.createElement('div');
      row.className = 'mq-row ' + (r[0] === 'center' ? 'r-o' : r[0]);
      row.style.setProperty('--k', k);
      row.style.setProperty('--side', k % 2 ? 1 : -1);
      mq.appendChild(row);
      if (r[0] === 'center') {
        row.innerHTML = '<span class="mq-center">Se nada for feito</span>';
        return;
      }
      const inner = document.createElement('div');
      inner.className = 'mq-in';
      const unit = `<span class="w">${r[1]}</span><span class="s">·</span><span class="c">${r[2]}</span><span class="s">·</span><span class="c">${r[1]}</span><span class="s">·</span><span class="w">${r[2]}</span><span class="s">·</span>`;
      inner.innerHTML = unit;
      row.appendChild(inner);
      const uw = inner.scrollWidth || 600;
      inner.innerHTML = unit.repeat(Math.ceil(W / uw) + 2);
      this.rows.push({ inner, uw, dir: k % 2 ? 1 : -1, sp: 46 + (k % 3) * 24 });
    });
    this.frame(0);
  },
  frame(dt) {
    this.off += dt;
    for (const r of this.rows) {
      const x = (this.off * r.sp) % r.uw;
      r.inner.style.transform = `translate3d(${(r.dir < 0 ? -x : x - r.uw).toFixed(1)}px,0,0)`;
    }
  },
};

/* contadores */
function countUp(el) {
  const to = +el.dataset.count, t0 = performance.now(), run = {};
  el._run = run;
  const step = now => {
    if (el._run !== run) return;
    const k = clamp((now - t0) / 1300, 0, 1);
    el.textContent = Math.round(to * outCubic(k));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function resetCount(el) { el._run = null; el.textContent = '0'; }

/* =====================================================================
   04 · diagrama de casos de uso (desenhado em SVG, beat a beat)
   ===================================================================== */
const UML = {
  land: {
    vb: [1000, 640], sys: [175, 30, 620, 580], rx: 112, ry: 38,
    act: { tec: [78, 232], sup: [78, 500], sif: [915, 430] },
    uc: { reg: [345, 108], ana: [345, 220], iso: [345, 332], lau: [345, 462], apr: [345, 560], ide: [630, 180], cla: [630, 310], not: [630, 470] },
    lbl: { 'ana-ide': [487, 186, 'middle'], 'ide-cla': [642, 250, 'start'], 'iso-ana': [357, 281, 'start'], 'not-lau': [487, 452, 'middle', 520] },
  },
  port: {
    vb: [600, 970], sys: [118, 24, 466, 800], rx: 96, ry: 42,
    act: { tec: [54, 300], sup: [54, 712], sif: [474, 884] },
    uc: { reg: [226, 108], ana: [226, 250], iso: [226, 400], lau: [226, 560], apr: [226, 712], ide: [474, 250], cla: [474, 400], not: [474, 640] },
    lbl: { 'ana-ide': [350, 206, 'middle'], 'ide-cla': [486, 330, 'start'], 'iso-ana': [238, 330, 'start'], 'not-lau': [372, 642, 'end', 662] },
  },
};
const UC_TXT = { reg: ['Registrar', 'lote'], ana: ['Analisar', 'amostra'], iso: ['Isolar', 'em placa'], lau: ['Emitir laudo', 'do lote'], apr: ['Aprovar /', 'reprovar lote'], ide: ['Identificar', 'microrganismo'], cla: ['Classificar', 'risco à saúde'], not: ['Notificar', 'zoonose'] };
const UC_HOT = { ana: 'h3', ide: 'h3', cla: 'h3', iso: 'h4', lau: 'h4', not: 'h4' };
const ACT_TXT = { tec: ['Técnico de', 'laboratório'], sup: ['Supervisor', 'de qualidade'], sif: ['Serviço de', 'inspeção (SIF)'] };
const ASSOC = [['tec', 'reg'], ['tec', 'ana'], ['tec', 'lau'], ['sup', 'apr'], ['sif', 'not']];
const RELS = [['ana', 'ide', 'inc', 3, '«include»'], ['ide', 'cla', 'inc', 3, '«include»'], ['iso', 'ana', 'ext', 4, '«extend»'], ['not', 'lau', 'ext', 4, '«extend»', '[Brucella ou M. bovis]']];
let umlPortrait = null;

function buildUML(force) {
  const svg = $('#uml');
  const wrap = svg.parentElement;
  const portrait = wrap.clientWidth / Math.max(1, wrap.clientHeight) < 1.15;
  if (!force && portrait === umlPortrait) return false;
  umlPortrait = portrait;
  const L = portrait ? UML.port : UML.land;
  const { rx, ry } = L;
  svg.setAttribute('viewBox', `0 0 ${L.vb[0]} ${L.vb[1]}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.toggle('portrait', portrait);
  const f = v => v.toFixed(1);
  const edge = (c, to) => {
    const dx = to[0] - c[0], dy = to[1] - c[1];
    const t = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
    return [c[0] + dx * t, c[1] + dy * t];
  };
  const actAnchor = (k, to) => {
    const a = L.act[k];
    if (portrait && k === 'sif') return [a[0], a[1] - 50];
    return [a[0] + (to[0] > a[0] ? 24 : -24), a[1] - 10];
  };
  const dashes = len => {
    const d = 7 / len, g = 5 / len, n = Math.floor(1 / (d + g));
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(d.toFixed(4), g.toFixed(4));
    arr.push(Math.max(0, 1 - n * (d + g)).toFixed(4), 1);
    return arr.join(' ');
  };
  const fs = portrait ? 20 : 17, fa = portrait ? 16 : 15;
  let s = '';

  // b0 · fronteira do sistema, com alças de seleção
  const [sx, sy, sw, sh] = L.sys;
  s += `<rect class="u-line u-sys" data-b="0-" x="${sx}" y="${sy}" width="${sw}" height="${sh}" pathLength="1"/>`;
  [[0, 0], [.5, 0], [1, 0], [0, .5], [1, .5], [0, 1], [.5, 1], [1, 1]].forEach(([hx, hy], i) => {
    s += `<rect class="u-pop u-hd" data-b="0-" style="--d:${(.55 + i * .04).toFixed(2)}s" x="${f(sx + hx * sw - 5)}" y="${f(sy + hy * sh - 5)}" width="10" height="10"/>`;
  });
  s += `<text class="t-sys u-pop" data-b="0-" style="--d:.7s;fill:var(--sel)" x="${sx + 18}" y="${sy + 28}">SISTEMA MICROCOSMO</text>`;

  // b1 · atores
  Object.keys(L.act).forEach((k, i) => {
    const [x, y] = L.act[k];
    s += `<g class="u-pop" data-b="1-" style="--d:${(i * .1).toFixed(2)}s">`;
    s += `<circle class="u-fig" cx="${x}" cy="${y - 34}" r="11"/>`;
    s += `<path class="u-fig" d="M${x} ${y - 23}V${y + 6}M${x - 18} ${y - 12}H${x + 18}M${x} ${y + 6}L${x - 15} ${y + 32}M${x} ${y + 6}L${x + 15} ${y + 32}"/>`;
    s += `<text class="t-act" text-anchor="middle" x="${x}" y="${y + 56}"><tspan x="${x}">${ACT_TXT[k][0]}</tspan><tspan x="${x}" dy="${fa * 1.15}">${ACT_TXT[k][1]}</tspan></text>`;
    s += '</g>';
  });

  // b2 · casos de uso + associações
  Object.keys(L.uc).forEach((k, i) => {
    const [x, y] = L.uc[k];
    const y1 = y - fs * .15;
    s += `<g class="u-pop ${UC_HOT[k] || ''}" data-b="2-" style="--d:${(i * .06).toFixed(2)}s">`;
    s += `<ellipse class="u-uc" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`;
    s += `<text class="t-uc" text-anchor="middle" x="${x}" y="${f(y1)}"><tspan x="${x}">${UC_TXT[k][0]}</tspan><tspan x="${x}" dy="${f(fs * 1.12)}">${UC_TXT[k][1]}</tspan></text>`;
    s += '</g>';
  });
  ASSOC.forEach(([a, u], i) => {
    const c = L.uc[u];
    const p0 = actAnchor(a, c), p1 = edge(c, p0);
    s += `<path class="u-line" data-b="2-" style="--d:${(.5 + i * .06).toFixed(2)}s" pathLength="1" d="M${f(p0[0])} ${f(p0[1])}L${f(p1[0])} ${f(p1[1])}"/>`;
  });

  // b3/b4 · «include» e «extend»
  RELS.forEach(([a, b, kind, beat, lab, lab2], i) => {
    const A = L.uc[a], B = L.uc[b];
    const p0 = edge(A, B), p1 = edge(B, A);
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const d0 = (.15 + (i % 2) * .25).toFixed(2);
    s += `<path class="u-line u-${kind}" data-b="${beat}-" style="--d:${d0}s;stroke-dasharray:${dashes(len)}" pathLength="1" d="M${f(p0[0])} ${f(p0[1])}L${f(p1[0])} ${f(p1[1])}"/>`;
    const ax = p1[0] - ux * 13, ay = p1[1] - uy * 13;
    s += `<path class="u-pop u-arrow u-${kind}" data-b="${beat}-" style="--d:${(+d0 + .55).toFixed(2)}s" d="M${f(ax - uy * 7)} ${f(ay + ux * 7)}L${f(p1[0])} ${f(p1[1])}L${f(ax + uy * 7)} ${f(ay - ux * 7)}"/>`;
    const [lx, ly, anc, ly2] = L.lbl[`${a}-${b}`];
    const col = kind === 'inc' ? 'var(--blue)' : 'var(--orange)';
    s += `<text class="t-rel u-pop" data-b="${beat}-" style="--d:${(+d0 + .35).toFixed(2)}s;fill:${col}" text-anchor="${anc}" x="${lx}" y="${ly}">${lab}${lab2 ? `<tspan x="${lx}" y="${ly2}">${lab2}</tspan>` : ''}</text>`;
  });
  svg.innerHTML = s;
  return true;
}

/* =====================================================================
   05 · onda de barras (HIT THE BEAT)
   ===================================================================== */
const Wave = {
  bars: [], frac: 0,
  build() {
    const el = $('#wave');
    const n = W < 700 ? 40 : 84;
    if (this.bars.length === n) return;
    el.innerHTML = '';
    this.bars = [];
    for (let i = 0; i < n; i++) {
      const b = document.createElement('i');
      const h = .16 + .84 * Math.pow(Math.abs(Math.sin(i * .37) * Math.sin(i * .113 + 1)), .7) * (.55 + hash(i) * .45);
      b.style.setProperty('--h', h.toFixed(3));
      b.style.setProperty('--k', i);
      el.appendChild(b);
      this.bars.push(b);
    }
    this.light(this.frac);
  },
  light(f) {
    this.frac = f;
    const n = Math.round(this.bars.length * f);
    this.bars.forEach((b, i) => b.classList.toggle('lit', i < n));
  },
};

/* =====================================================================
   Canvas 2D: grade de pontos (02) e partículas (06)
   ===================================================================== */
const FX = (() => {
  const cv = $('#fx');
  const ctx = cv.getContext('2d');
  let DPR = 1, mode = null, dirty = false;
  const COL = ['#f5f3ee', '#d4ff1e', '#ff4b1f', '#6b68ff'];

  /* ---- grade: a gota de leite, o sintoma e a causa-raiz ---- */
  const Grid = {
    cells: [], s: 28, state: 4, t0: 0, cx: 0, cy: 0, R: 120, sym: [],
    build() {
      const s = this.s = clamp(Math.min(W, H) / 22, 20, 36);
      const cols = Math.ceil(W / s) + 2, rows = Math.ceil(H / s) + 2;
      const ox = (W - (cols - 1) * s) / 2, oy = (H - (rows - 1) * s) / 2;
      this.cells = [];
      let i = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const h = hash(i + 7), k = h < .66 ? 0 : h < .8 ? 1 : h < .91 ? 3 : 2;
        this.cells.push({ x: ox + c * s, y: oy + r * s, k, h: hash(i * 3 + 1) });
        i++;
      }
      this.sym = [];
      for (let j = 0; j < this.cells.length && this.sym.length < 9; j++) {
        const c = this.cells[(j * 97) % this.cells.length];
        if (c.k === 2 && c.x > s * 2 && c.x < W - s * 2 && c.y > H * .14 && c.y < H * .86) this.sym.push(c);
      }
      this.slot();
    },
    slotEl: null,
    slot() {
      if (!this.slotEl) return;
      const r = this.slotEl.getBoundingClientRect();
      if (r.width > 4) { this.cx = r.left + r.width / 2; this.cy = r.top + r.height / 2; this.R = Math.min(r.width, r.height) * .46; }
    },
    set(state, now, slotEl) {
      this.state = state; this.t0 = now;
      if (slotEl) { this.slotEl = slotEl; this.slot(); }
    },
    draw(now) {
      const t = (now - this.t0) / 1000, s = this.s;
      const P = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], dim = new Path2D(), hot = new Path2D();
      const diag = Math.hypot(W, H);
      const shape = (p, k, x, y, r) => {
        if (k === 2) p.rect(x - r, y - r, 2 * r, 2 * r);
        else if (k === 3) { const a = r * .38; p.rect(x - r, y - a, 2 * r, 2 * a); p.rect(x - a, y - r, 2 * a, 2 * r); }
        else if (k === 4) { p.moveTo(x, y - r * 1.25); p.lineTo(x + r * 1.25, y); p.lineTo(x, y + r * 1.25); p.lineTo(x - r * 1.25, y); p.closePath(); }
        else if (k === 5) { const a = r * .9; p.rect(x - a, y - a, 2 * a, 2 * a); }
        else { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); }
      };
      ctx.save();
      if (this.state === 4) {
        // flash horizontal e a gota abrindo
        if (t < .55) {
          const k = t / .55, lw = W * .42 * Math.sin(Math.min(1, k * 1.6) * Math.PI / 2) * (1 - k * .6);
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = '#fff';
          ctx.fillRect(this.cx - lw, this.cy - 1, lw * 2, 2);
          ctx.globalAlpha = (1 - k) * .25;
          ctx.fillRect(this.cx - lw * .6, this.cy - 4, lw * 1.2, 8);
        }
        const rr = this.R * outCubic(clamp((t - .25) / .9, 0, 1));
        for (const c of this.cells) {
          const d = Math.hypot(c.x - this.cx, c.y - this.cy);
          if (d > rr) continue;
          const pop = clamp((rr - d) / (s * 1.6), 0, 1);
          const r = s * .16 * (.35 + .65 * pop) * (c.k ? 1.2 : 1);
          shape(P[c.k === 3 ? 3 : c.k], c.k, c.x, c.y, r);
        }
        ctx.globalAlpha = .35 * clamp((t - .9) / .5, 0, 1);
        ctx.strokeStyle = '#f5f3ee';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R + s * .7, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      } else if (this.state === 5) {
        // sintoma: quase nada visível, só os lotes que já deram problema
        const rr = lerp(this.R, diag, outCubic(clamp(t / .9, 0, 1)));
        for (const c of this.cells) {
          if (Math.hypot(c.x - this.cx, c.y - this.cy) > rr) continue;
          shape(dim, 0, c.x, c.y, s * .085);
        }
        this.sym.forEach((c, i) => {
          const k = clamp((t - .5 - i * .12) / .4, 0, 1);
          if (!k) return;
          shape(P[2], 2, c.x, c.y, s * .2 * outCubic(k));
          const pulse = ((t * .9 + i * .21) % 1);
          ctx.globalAlpha = (1 - pulse) * .7 * k;
          ctx.strokeStyle = '#ff4b1f';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(c.x - s * (.3 + pulse * .7), c.y - s * (.3 + pulse * .7), s * (.6 + pulse * 1.4), s * (.6 + pulse * 1.4));
        });
      } else {
        // causa-raiz: uma onda revela tudo o que estava escondido
        const cx = W / 2, cy = H / 2;
        const w = diag * .62 * inOutCubic(clamp(t / 1.5, 0, 1));
        const ph = now * .0016;
        for (const c of this.cells) {
          const d = Math.hypot(c.x - cx, c.y - cy);
          if (d > w) { shape(dim, 0, c.x, c.y, s * .085); continue; }
          const front = w - d;
          if (front < s * 2.2 && t < 1.7) { shape(hot, c.k === 2 ? 2 : 0, c.x, c.y, s * .26); continue; }
          let k = c.k;
          if (k === 0 && t > 1.2) {
            const v = Math.sin(c.x * .011 + c.y * .008 - ph);
            k = v > .72 ? 3 : v > .38 ? 4 : v < -.72 ? 5 : 0;
          }
          const p = c.k === 0 ? P[0] : P[c.k];
          shape(p, k, c.x, c.y, s * (c.k ? .19 : .14));
        }
      }
      ctx.globalAlpha = .15; ctx.fillStyle = COL[0]; ctx.fill(dim);
      ctx.globalAlpha = .9; ctx.fillStyle = COL[0]; ctx.fill(P[0]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COL[1]; ctx.fill(P[1]);
      ctx.fillStyle = COL[3]; ctx.fill(P[3]);
      ctx.fillStyle = COL[2]; ctx.fill(P[2]);
      ctx.fillStyle = '#fff'; ctx.fill(hot);
      ctx.restore();
    },
  };

  /* ---- partículas: texto → nuvem → célula → espiral → ponto final ---- */
  const Parts = {
    n: 0, state: null, t0: 0, cx: 0, cy: 0, R: 100, text: null, pts: null, step: 3,
    alloc() {
      const n = W < 700 ? 1600 : 3400;
      if (n === this.n) return;
      this.n = n;
      const F = () => new Float32Array(n);
      Object.assign(this, { x: F(), y: F(), tx: F(), ty: F(), sz: F(), dl: F(), bx: F(), by: F(), bz: F(), sd: F(), col: new Uint8Array(n) });
      const ga = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const h = hash(i + 101);
        this.col[i] = h < .66 ? 0 : h < .84 ? 1 : 2;
        this.sd[i] = hash(i * 7 + 3);
        this.x[i] = hash(i + 9) * W; this.y[i] = hash(i + 19) * H;
        const yy = 1 - 2 * (i + .5) / n, rr = Math.sqrt(1 - yy * yy), a = i * ga;
        this.bx[i] = Math.cos(a) * rr; this.by[i] = yy; this.bz[i] = Math.sin(a) * rr;
      }
    },
    resize() { this.alloc(); this.pts = null; if (this.state) this.retarget(); },
    samplePts() {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W)); c.height = Math.max(1, Math.round(H));
      const g = c.getContext('2d');
      const word = 'INVISÍVEL';
      let fs = Math.min(H * .3, W * .2);
      g.font = `900 ${fs}px Archivo, "Arial Black", sans-serif`;
      fs *= Math.min(1.2, W * .88 / g.measureText(word).width);
      g.font = `900 ${fs}px Archivo, "Arial Black", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(word, W / 2, H * .47);
      const step = this.step = Math.max(2, Math.round(fs / 36));
      const data = g.getImageData(0, 0, c.width, c.height).data;
      const pts = [];
      for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) {
        if (data[(y * c.width + x) * 4 + 3] > 140) pts.push(x, y);
      }
      // embaralha de forma determinística
      for (let i = pts.length / 2 - 1; i > 0; i--) {
        const j = Math.floor(hash(i + 55) * (i + 1));
        [pts[2 * i], pts[2 * j]] = [pts[2 * j], pts[2 * i]];
        [pts[2 * i + 1], pts[2 * j + 1]] = [pts[2 * j + 1], pts[2 * i + 1]];
      }
      this.pts = pts;
    },
    slotEl: null,
    set(state, now, slotEl) {
      this.alloc();
      if (state === 'text' && !this.state) {
        for (let i = 0; i < this.n; i++) { this.x[i] = hash(i + now % 97) * W; this.y[i] = hash(i * 3 + now % 89) * H; }
      }
      this.state = state; this.t0 = now; this.slotEl = slotEl || null;
      for (let i = 0; i < this.n; i++) this.dl[i] = this.sd[i] * (state === 'dot' ? .45 : .35);
      this.retarget();
    },
    retarget() {
      const st = this.state, n = this.n;
      if (this.slotEl) {
        const r = this.slotEl.getBoundingClientRect();
        this.cx = r.left + r.width / 2; this.cy = r.top + r.height / 2;
        this.R = st === 'dot' ? parseFloat(getComputedStyle(this.slotEl).width) / 2 || 10 : Math.min(r.width, r.height) * .42;
      } else {
        const land = W > H;
        this.cx = W * (land ? .64 : .5); this.cy = H * (land ? .44 : .36);
        this.R = Math.min(W, H) * (land ? .36 : .4);
      }
      if (st === 'text') {
        if (!this.pts) this.samplePts();
        const p = this.pts, m = p.length / 2;
        for (let i = 0; i < n; i++) {
          const j = i % m;
          this.tx[i] = p[2 * j] + (this.sd[i] - .5) * this.step * .8;
          this.ty[i] = p[2 * j + 1] + (hash(i + 3) - .5) * this.step * .8;
        }
      } else if (st === 'cloud') {
        for (let i = 0; i < n; i++) {
          const a = hash(i + 17) * Math.PI * 2, rr = this.R * Math.sqrt(-2 * Math.log(Math.max(1e-4, hash(i + 29)))) * .5;
          this.tx[i] = this.cx + Math.cos(a) * rr; this.ty[i] = this.cy + Math.sin(a) * rr;
        }
      } else if (st === 'dot') {
        for (let i = 0; i < n; i++) {
          const a = hash(i + 41) * Math.PI * 2, rr = this.R * .7 * Math.sqrt(hash(i + 43));
          this.tx[i] = this.cx + Math.cos(a) * rr; this.ty[i] = this.cy + Math.sin(a) * rr;
        }
      }
    },
    draw(now, dt) {
      const st = this.state;
      if (!st) return;
      const t = (now - this.t0) / 1000, n = this.n, T = now / 1000;
      if (st === 'sphere') {
        const ry = T * .55, cy = Math.cos(ry), sy = Math.sin(ry), tl = .38, ct = Math.cos(tl), stl = Math.sin(tl);
        for (let i = 0; i < n; i++) {
          const x = this.bx[i] * cy + this.bz[i] * sy, z0 = -this.bx[i] * sy + this.bz[i] * cy;
          const y = this.by[i] * ct - z0 * stl, z = this.by[i] * stl + z0 * ct;
          this.tx[i] = this.cx + x * this.R; this.ty[i] = this.cy + y * this.R;
          this.sz[i] = 1 + (z + 1) * .7;
        }
      } else if (st === 'swirl') {
        const tilt = 1.05, ct = Math.cos(tilt), stl = Math.sin(tilt);
        for (let i = 0; i < n; i++) {
          const arm = i & 1, u = Math.pow(this.sd[i], .8);
          const r = this.R * (.06 + .94 * u);
          const a = u * 4.4 + arm * Math.PI + T * .45;
          const sp = (hash(i + 61) - .5) * this.R * .16 * (.3 + u), sp2 = (hash(i + 67) - .5) * this.R * .16 * (.3 + u);
          const X = Math.cos(a) * r + sp, Z = Math.sin(a) * r + sp2, Y = (hash(i + 71) - .5) * this.R * .05;
          this.tx[i] = this.cx + X; this.ty[i] = this.cy + Y * ct - Z * stl * .55;
          this.sz[i] = 1.2 + (Z / this.R + 1) * .5;
        }
      }
      // passo de tempo próprio: em máquinas lentas o desenho ainda converge no mesmo tempo
      const pdt = Math.min(.15, this.last ? (now - this.last) / 1000 : dt);
      this.last = now;
      const base = st === 'cloud' ? .045 : st === 'dot' ? .1 : .08;
      const k = 1 - Math.pow(1 - base, pdt * 60);
      for (let i = 0; i < n; i++) {
        if (t < this.dl[i]) continue;
        this.x[i] += (this.tx[i] - this.x[i]) * k + Math.sin(T * 1.7 + this.sd[i] * 40) * .25;
        this.y[i] += (this.ty[i] - this.y[i]) * k + Math.cos(T * 1.3 + this.sd[i] * 30) * .25;
      }
      let alpha = 1;
      if (st === 'dot') alpha = 1 - clamp((t - 1) / .45, 0, 1);
      if (alpha <= 0) return;
      const paths = [new Path2D(), new Path2D(), new Path2D()];
      const fixed = st === 'text' ? 1.7 : st === 'cloud' ? 1.5 : st === 'dot' ? 1.6 : 0;
      for (let i = 0; i < n; i++) {
        const z = fixed || this.sz[i];
        paths[this.col[i]].rect(this.x[i] - z / 2, this.y[i] - z / 2, z, z);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .92 * alpha;
      for (let c = 0; c < 3; c++) { ctx.fillStyle = COL[c]; ctx.fill(paths[c]); }
      ctx.restore();
    },
  };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    Grid.build();
    Parts.resize();
  }
  function use(m) { mode = m; if (m !== 'parts') Parts.state = null; }
  function frame(now, dt) {
    if (!mode) {
      if (dirty) { ctx.clearRect(0, 0, W, H); dirty = false; }
      return;
    }
    ctx.clearRect(0, 0, W, H);
    dirty = true;
    if (mode === 'grid') Grid.draw(now); else Parts.draw(now, dt);
  }
  return { resize, frame, use, grid: Grid, parts: Parts };
})();

/* =====================================================================
   WebGL (three.js): micróbios cromados e o campo de barras 3D
   ===================================================================== */
const GL = (() => {
  const T = window.THREE;
  if (!T) return null;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: $('#gl'), antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  renderer.setClearColor(0x000000, 0);
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  /* matcaps desenhados à mão: cromo com reflexo lima/laranja/azul e gel lima */
  function matcap(stops, rim) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    g.save();
    g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.clip();
    const lg = g.createLinearGradient(0, 0, 0, 256);
    stops.forEach(([o, col]) => lg.addColorStop(o, col));
    g.fillStyle = lg; g.fillRect(0, 0, 256, 256);
    const rg = g.createRadialGradient(128, 128, 70, 128, 128, 128);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(.8, 'rgba(0,0,0,.18)'); rg.addColorStop(1, rim);
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    const hg = g.createRadialGradient(88, 70, 0, 88, 70, 58);
    hg.addColorStop(0, 'rgba(255,255,255,1)'); hg.addColorStop(.3, 'rgba(255,255,255,.8)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hg; g.fillRect(0, 0, 256, 256);
    const h2 = g.createRadialGradient(178, 196, 0, 178, 196, 26);
    h2.addColorStop(0, 'rgba(255,255,255,.7)'); h2.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h2; g.fillRect(0, 0, 256, 256);
    g.restore();
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    return tex;
  }
  const chrome = acc => [[0, '#ffffff'], [.26, '#c9ccd0'], [.44, '#45484e'], [.5, '#0c0d0f'], [.57, '#24272b'], [.72, acc], [.9, '#20230f'], [1, '#050505']];
  const MAT = {
    lime: new T.MeshMatcapMaterial({ matcap: matcap(chrome('#d4ff1e'), 'rgba(212,255,30,.55)') }),
    orange: new T.MeshMatcapMaterial({ matcap: matcap(chrome('#ff5a2a'), 'rgba(255,75,31,.6)') }),
    blue: new T.MeshMatcapMaterial({ matcap: matcap(chrome('#6b68ff'), 'rgba(80,77,255,.6)') }),
    jelly: new T.MeshMatcapMaterial({ matcap: matcap([[0, '#fbffe0'], [.3, '#e4ff5c'], [.55, '#c8f20a'], [.8, '#88ad00'], [1, '#2f3d00']], 'rgba(40,55,0,.85)') }),
  };

  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(30, 1, .1, 100);
  cam.position.set(0, 0, 10);
  const VIS_H = 2 * 10 * Math.tan(T.MathUtils.degToRad(15));

  const tube = (pts, r, m, seg = 90) => new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), seg, r, 10, false), m);
  const rod = (m, r, len) => new T.Mesh(new T.CapsuleGeometry(r, len, 12, 32), m);

  function makeHelix(m) {
    const g = new T.Group();
    class Helix extends T.Curve {
      getPoint(t, tg = new T.Vector3()) { const a = t * Math.PI * 2 * 2.4; return tg.set((t - .5) * 3.4, Math.cos(a) * .48, Math.sin(a) * .48); }
    }
    const curve = new Helix();
    g.add(new T.Mesh(new T.TubeGeometry(curve, 360, .2, 28, false), m));
    const cap = new T.SphereGeometry(.2, 28, 20);
    [0, 1].forEach(t => { const s = new T.Mesh(cap, m); s.position.copy(curve.getPoint(t)); g.add(s); });
    g.rotation.z = .55;
    return g;
  }
  function makeDrop(m) {
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const th = i / 72 * Math.PI;
      const r = Math.sin(th) * Math.pow((1 - Math.cos(th)) / 2, .85);
      pts.push(new T.Vector2(Math.max(r, 1e-4), Math.cos(th) * 1.25));
    }
    const mesh = new T.Mesh(new T.LatheGeometry(pts.reverse(), 72), m);
    mesh.rotation.z = -.22;
    return mesh;
  }
  function makeChain(m) {
    const g = new T.Group();
    for (let i = 0; i < 3; i++) {
      const c = rod(m, .3, .85);
      c.rotation.z = Math.PI / 2 + (i - 1) * .24;
      c.position.set((i - 1) * 1.48, i === 1 ? .14 : -.08, (i - 1) * .1);
      g.add(c);
    }
    return g;
  }
  function makePseudo(m) {
    const g = new T.Group();
    const r = rod(m, .4, 1.5);
    r.rotation.z = Math.PI / 2;
    g.add(r);
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      pts.push(new T.Vector3(1.08 + t * 2.3, Math.sin(t * Math.PI * 3.2) * .24 * (.25 + t), Math.cos(t * Math.PI * 3.2) * .14 * t));
    }
    g.add(tube(pts, .05, m, 140));
    return g;
  }
  function makeEcoli(m) {
    const g = new T.Group();
    const r = .46, len = 1.25;
    const body = rod(m, r, len);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    const pg = new T.CylinderGeometry(.022, .022, .34, 6);
    pg.translate(0, .17, 0);
    const up = new T.Vector3(0, 1, 0);
    for (let i = 0; i < 90; i++) {
      const along = (hash(i + 200) * 2 - 1) * (len / 2 + r * .6), a = hash(i + 300) * Math.PI * 2;
      let n, p;
      if (Math.abs(along) <= len / 2) {
        n = new T.Vector3(0, Math.cos(a), Math.sin(a));
        p = new T.Vector3(along, 0, 0).addScaledVector(n, r);
      } else {
        const sg = Math.sign(along);
        n = new T.Vector3(sg * (.3 + hash(i + 400) * .7), Math.cos(a) * .8, Math.sin(a) * .8).normalize();
        p = new T.Vector3(sg * len / 2, 0, 0).addScaledVector(n, r);
      }
      const pm = new T.Mesh(pg, m);
      pm.position.copy(p);
      pm.quaternion.setFromUnitVectors(up, n);
      g.add(pm);
    }
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1, pts = [];
      const bx = (k - 1) * .45, by = Math.cos(a) * r, bz = Math.sin(a) * r;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        pts.push(new T.Vector3(bx - t * 2.5, by * (1 + t * 1.3) + Math.sin(t * Math.PI * 3 + k) * .2, bz * (1 + t * 1.3) + Math.cos(t * Math.PI * 3 + k) * .14));
      }
      g.add(tube(pts, .035, m, 110));
    }
    return g;
  }
  function makeStaph(m) {
    const g = new T.Group();
    const geo = new T.SphereGeometry(.42, 36, 24);
    [[0, 0, 0], [.78, .1, .1], [-.72, .18, -.12], [.1, .76, -.08], [.12, -.74, .14], [.5, .5, .55], [-.4, -.45, .5], [-.3, .5, .6], [.55, -.45, -.5]]
      .forEach(p => { const s = new T.Mesh(geo, m); s.position.set(p[0], p[1], p[2]); g.add(s); });
    return g;
  }
  function holder(inner) {
    inner.updateMatrixWorld(true);
    const sph = new T.Box3().setFromObject(inner).getBoundingSphere(new T.Sphere());
    inner.position.sub(sph.center);
    const pivot = new T.Group();
    pivot.add(inner);
    const h = new T.Group();
    h.add(pivot);
    h.visible = false;
    h.userData = { k: 1 / sph.radius, pivot, vis: 0, vel: 0, target: 0, size: 1, px: 0, py: 0 };
    scene.add(h);
    return h;
  }
  const OBJ = {
    helix: holder(makeHelix(MAT.lime)),
    drop: holder(makeDrop(MAT.lime)),
    chain: holder(makeChain(MAT.jelly)),
    pseudo: holder(makePseudo(MAT.blue)),
    ecoli: holder(makeEcoli(MAT.orange)),
    staph: holder(makeStaph(MAT.blue)),
  };

  /* ---- campo de barras 3D com a bola laranja (a contagem de colônias) ---- */
  const Field = (() => {
    const sc = new T.Scene();
    sc.fog = new T.Fog(0x0b0b0c, 18, 52);
    const fcam = new T.PerspectiveCamera(36, 1, .1, 200);
    const NX = 44, NZ = 30;
    const geo = new T.BoxGeometry(.84, 1, .84);
    geo.translate(0, .5, 0);
    const mesh = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ roughness: .5, metalness: 0 }), NX * NZ);
    mesh.castShadow = mesh.receiveShadow = true;
    const cols = [0xe9e6de, 0xff4b1f, 0x3633f0, 0xd4ff1e].map(c => new T.Color(c));
    const kind = new Uint8Array(NX * NZ), seed = new Float32Array(NX * NZ);
    for (let i = 0; i < NX * NZ; i++) {
      const r = rand();
      kind[i] = r < .1 ? 1 : r < .17 ? 2 : r < .22 ? 3 : 0;
      seed[i] = rand();
      mesh.setColorAt(i, cols[kind[i]]);
    }
    mesh.instanceColor.needsUpdate = true;
    sc.add(mesh);
    const ground = new T.Mesh(new T.PlaneGeometry(300, 300), new T.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    sc.add(ground);
    sc.add(new T.HemisphereLight(0xffffff, 0x1a1a1e, .55));
    const sun = new T.DirectionalLight(0xffffff, 1.35);
    sun.position.set(-12, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
    sun.shadow.bias = -.0006;
    sc.add(sun);
    const ball = new T.Mesh(new T.SphereGeometry(.46, 48, 32), new T.MeshStandardMaterial({ color: 0xff4b1f, roughness: .22, metalness: .05 }));
    ball.castShadow = true;
    sc.add(ball);
    const dummy = new T.Object3D(), from = new T.Vector3(), to = new T.Vector3(), look = new T.Vector3();
    let t0 = 0, on = false;
    const heightAt = (ix, iz, t) => {
      const i = iz * NX + ix;
      const n = (Math.sin(ix * .38 + t * .9) + Math.sin(iz * .31 - t * .7) + Math.sin((ix + iz) * .19 + t * .5)) / 3;
      let h = Math.pow((n + 1) / 2, 2.2) * 2.6 + seed[i] * .5;
      if (kind[i]) h += .6 + seed[i] * .9;
      return .12 + h;
    };
    return {
      get on() { return on; },
      enter(now) { on = true; t0 = now; },
      leave() { on = false; },
      resize() { fcam.aspect = W / H; fcam.updateProjectionMatrix(); },
      render(now) {
        const t = now / 1000;
        const e = reduced ? 1 : inOutCubic(clamp((now - t0) / 1900, 0, 1));
        const grow = reduced ? 1 : outCubic(clamp((now - t0 - 250) / 1600, 0, 1));
        for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
          const h = .06 + (heightAt(ix, iz, t) - .06) * grow;
          dummy.position.set(ix - NX / 2 + .5, 0, iz - NZ / 2 + .5);
          dummy.scale.set(1, h, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(iz * NX + ix, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        const portrait = W < H;
        from.set(0, 44, .01);
        to.set(portrait ? -5 : -8, portrait ? 10 : 7.5, portrait ? 19 : 13.5);
        fcam.position.lerpVectors(from, to, e);
        fcam.position.x += Math.sin(t * .15) * .8 * e;
        look.set(lerp(0, 2, e), 0, lerp(0, -3, e));
        fcam.lookAt(look);
        sc.fog.near = lerp(60, 15, e); sc.fog.far = lerp(120, 48, e);
        const bxw = Math.sin(t * .42) * 7, bzw = Math.cos(t * .29) * 5 - 1;
        const ix = clamp(Math.round(bxw + NX / 2 - .5), 0, NX - 1), iz = clamp(Math.round(bzw + NZ / 2 - .5), 0, NZ - 1);
        const under = .06 + (heightAt(ix, iz, t) - .06) * grow;
        ball.position.set(bxw, under + .46 + Math.abs(Math.sin(t * 3.1)) * 1.3 * grow, bzw);
        ball.visible = grow > .05;
        renderer.render(sc, fcam);
      },
    };
  })();

  let active = null, slotEl = null, cleared = true;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => { pointer.tx = (e.clientX / W - .5) * 2; pointer.ty = (e.clientY / H - .5) * 2; }, { passive: true });

  function measure(h) {
    if (!slotEl) return false;
    const r = slotEl.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const u = h.userData;
    u.px = (r.left + r.width / 2 - W / 2) / H * VIS_H;
    u.py = -(r.top + r.height / 2 - H / 2) / H * VIS_H;
    u.size = Math.min(r.width, r.height) / H * VIS_H / 2 * .94;
    return true;
  }
  function setSlot(el, now) {
    const key = el ? el.dataset.obj : null;
    if (key === 'field') {
      if (!Field.on) Field.enter(now);
      slotEl = null; active = null;
    } else {
      Field.leave();
      slotEl = el || null;
      active = key && OBJ[key] ? key : null;
      if (active) {
        const h = OBJ[active];
        if (!measure(h)) active = null;
        else if (h.userData.vis < .05) { h.position.set(h.userData.px, h.userData.py, 0); h.userData.vel = reduced ? 0 : h.userData.vel; }
      }
    }
    for (const k in OBJ) {
      OBJ[k].userData.target = k === active ? 1 : 0;
      if (reduced) OBJ[k].userData.vis = OBJ[k].userData.target;
    }
  }
  function resize() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
    Field.resize();
    if (active) measure(OBJ[active]);
  }
  function frame(now, dt) {
    if (Field.on) { Field.render(now); cleared = false; return; }
    pointer.x += (pointer.tx - pointer.x) * .05;
    pointer.y += (pointer.ty - pointer.y) * .05;
    let any = false;
    const t = now / 1000;
    for (const k in OBJ) {
      const h = OBJ[k], u = h.userData;
      if (!reduced) {
        u.vel += ((u.target - u.vis) * 140 - u.vel * 11) * dt;
        u.vis += u.vel * dt;
      }
      if (u.target === 0 && u.vis < .003 && Math.abs(u.vel) < .02) { u.vis = 0; u.vel = 0; h.visible = false; continue; }
      h.visible = true;
      any = true;
      h.scale.setScalar(Math.max(1e-4, u.vis * u.size * u.k));
      h.position.x += (u.px - h.position.x) * .2;
      h.position.y += (u.py - h.position.y) * .2 + Math.sin(t * 1.3) * .002;
      u.pivot.rotation.y += dt * (reduced ? .15 : .6);
      u.pivot.rotation.x = Math.sin(t * .45) * .35 + pointer.y * .3;
      u.pivot.rotation.z = Math.sin(t * .3) * .15 - pointer.x * .25;
    }
    if (any) { renderer.render(scene, cam); cleared = false; }
    else if (!cleared) { renderer.clear(); cleared = true; }
  }
  return { setSlot, resize, frame };
})();

/* =====================================================================
   ganchos de cada cena
   ===================================================================== */
const hooks = [
  { // 01
    beat(b) { if (b === 1) Bounce.start(); else Bounce.stop(); },
    leave() { Bounce.stop(); },
    frame(now) { if (Bounce.on) Bounce.frame(now); },
  },
  { // 02
    beat(b) {
      if (b >= 4 && b <= 6) { FX.use('grid'); FX.grid.set(b, performance.now(), b === 4 ? $('#s2 .g-slot') : null); }
      else FX.use(null);
      $$('#s2 [data-count]').forEach(el => (b === 7 ? countUp(el) : resetCount(el)));
      Marquee.on = b === 8;
    },
    leave() { FX.use(null); Marquee.on = false; $$('#s2 [data-count]').forEach(resetCount); },
    frame(now, dt) { if (Marquee.on && !reduced) Marquee.frame(dt); },
  },
  {}, // 03
  {}, // 04
  { // 05
    beat(b) { Wave.light(b === 1 ? .5 : b >= 2 ? 1 : 0); },
  },
  { // 06
    beat(b) {
      clearTimeout(this.timer);
      FX.use('parts');
      const P = FX.parts, now = performance.now();
      if (b === 0) P.set('text', now);
      else if (b === 1) {
        const slot = $('#s6 .p-slot[data-b="1"]');
        P.set('cloud', now, slot);
        this.timer = setTimeout(() => P.set('sphere', performance.now(), slot), 650);
      } else if (b === 2) P.set('swirl', now);
      else P.set('dot', now, $('#finalDot'));
    },
    leave() { clearTimeout(this.timer); FX.use(null); },
  },
];

/* =====================================================================
   motor: rolagem → beat
   ===================================================================== */
let cur = -1, curScene = -1, smooth = window.scrollY / beatPx, pending = null;

function updateSlot(si) {
  if (!GL) return;
  GL.setSlot($('.obj-slot.on', sceneEls[si]), performance.now());
}

function setBeat(g) {
  const prev = cur;
  cur = g;
  const { s, b, bg, hud } = BEATS[g];
  const dir = prev < 0 || g > prev ? 1 : -1;
  if (s !== curScene) {
    if (curScene >= 0) {
      sceneEls[curScene].classList.remove('is-active');
      hooks[curScene].leave && hooks[curScene].leave();
    }
    const el = sceneEls[s];
    el.classList.add('no-tr');
    applyStates(s, dir > 0 ? -1 : 999);
    el.classList.add('is-active');
    void el.offsetWidth;
    el.classList.remove('no-tr');
    curScene = s;
    updateHud(s);
  }
  stage.dataset.bg = bg;
  stage.classList.toggle('hud-off', !hud);
  applyStates(s, b);
  hooks[s].beat && hooks[s].beat(b, dir);
  updateSlot(s);
  if (g > 0) timer.autostart();
}

function go(i) {
  i = clamp(i, 0, N - 1);
  pending = i;
  const far = Math.abs(i - smooth) > 1.5;
  window.scrollTo({ top: i * beatPx, behavior: reduced || far ? 'auto' : 'smooth' });
}
function stepBy(d) {
  const base = pending !== null ? pending : Math.round(window.scrollY / beatPx);
  go(base + d);
}

addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const onControl = e.target.closest && e.target.closest('a,button,input,textarea,select');
  let to = null;
  switch (e.key) {
    case 'ArrowDown': case 'ArrowRight': case 'PageDown': stepBy(1); break;
    case 'ArrowUp': case 'ArrowLeft': case 'PageUp': stepBy(-1); break;
    case ' ': case 'Enter': if (onControl) return; stepBy(e.shiftKey ? -1 : 1); break;
    case 'Home': to = 0; break;
    case 'End': to = N - 1; break;
    case 'f': case 'F':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
      return;
    case 'r': case 'R': timer.reset(); return;
    default:
      if (/^[1-6]$/.test(e.key)) to = sceneStart[+e.key - 1];
      else return;
  }
  e.preventDefault();
  if (to !== null) go(to);
});

/* roda do mouse / trackpad: um gesto = um beat (o encaixe nativo cuida do toque) */
const wheel = { acc: 0, lastT: 0, lastStep: 0, lastMag: 0, locked: false };
addEventListener('wheel', e => {
  if (e.ctrlKey) return;
  e.preventDefault();
  const now = performance.now();
  const d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * H : e.deltaY;
  const mag = Math.abs(d);
  const gap = now - wheel.lastT;
  wheel.lastT = now;
  // fim do gesto anterior, ou um novo empurrão no meio da inércia do trackpad
  if (gap > 220 || (mag > wheel.lastMag * 1.6 && mag > 24 && now - wheel.lastStep > 380)) { wheel.locked = false; wheel.acc = 0; }
  wheel.lastMag = mag;
  if (wheel.locked) return;
  wheel.acc += d;
  if (Math.abs(wheel.acc) >= 24) {
    stepBy(wheel.acc > 0 ? 1 : -1);
    wheel.locked = true;
    wheel.lastStep = now;
    wheel.acc = 0;
  }
}, { passive: false });

let last = performance.now();
function tick(now) {
  const dt = Math.min(.05, Math.max(0, (now - last) / 1000));
  last = now;
  const y = window.scrollY, target = y / beatPx;
  if (reduced || Math.abs(target - smooth) > 1.5) smooth = target;
  else smooth += (target - smooth) * (1 - Math.pow(.76, dt * 60));
  if (Math.abs(target - smooth) < 5e-4) smooth = target;
  if (pending !== null && Math.abs(y - pending * beatPx) < 2) pending = null;
  const g = clamp(Math.round(smooth), 0, N - 1);
  if (g !== cur) setBeat(g);
  const h = hooks[curScene];
  h && h.frame && h.frame(now, dt);
  GL && GL.frame(now, dt);
  FX.frame(now, dt);
  hudProg.style.width = (smooth / (N - 1) * 100).toFixed(2) + '%';
  timer.tick();
  requestAnimationFrame(tick);
}

/* ---------- layout e redimensionamento ---------- */
let lastW = 0, lastH = 0;
function layout() {
  W = stage.clientWidth; H = stage.clientHeight;
  const big = W !== lastW || Math.abs(H - lastH) > 140;
  lastW = W; lastH = H;
  if (big) {
    sizeTrack();
    if (cur >= 0) { window.scrollTo(0, cur * beatPx); smooth = cur; }
  }
  Bounce.layout();
  buildRing();
  Marquee.build();
  Wave.build();
  if (buildUML(true)) { indexScene(3); reapplyQuiet(3, curScene === 3 ? BEATS[cur].b : -1); }
  FX.resize();
  if (FX.grid.slotEl) FX.grid.slot();
  if (FX.parts.state) FX.parts.retarget();
  if (GL) GL.resize();
  if (cur >= 0) updateSlot(curScene);
}
let rT = 0;
addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(layout, 120); });

layout();
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const m = location.hash.match(/^#(?:s([1-6])|b(\d+))$/);
const startAt = m ? (m[1] ? sceneStart[+m[1] - 1] : clamp(+m[2] - 1, 0, N - 1)) : 0;
window.scrollTo(0, startAt * beatPx);
smooth = startAt;
requestAnimationFrame(tick);

// quando as fontes chegam, as medidas de texto mudam
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    Marquee.build();
    FX.parts.pts = null;
    if (FX.parts.state === 'text') FX.parts.retarget();
  });
}
})();
