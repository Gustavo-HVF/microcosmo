/* Microcosmo — saguão.
   Ao fundo, microrganismos passam devagar (com um pouco de profundidade
   atrás do ponteiro). Os cartões inclinam na direção do ponteiro sem sair do
   lugar. Escolher um cartão: os outros caem, ele dá um impulso, vira e voa
   até cobrir a tela com a sua cor; a página daquela parte começa nesse mesmo
   véu e o atravessa (comum/entrada.js). Voltando (?volta=id), o véu vira o
   cartão de novo e ele encolhe até o seu lugar. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const media = q => !!(window.matchMedia && matchMedia(q).matches);
const reduce = () => media('(prefers-reduced-motion: reduce)');
const EASE = 'cubic-bezier(.16,.9,.12,1)';
const CFG = window.MC_CARTOES || {};
const VEU = window.MicrocosmoVeu;
const nav = $('#cartoes'), cards = $$('.cartao'), topo = $('.topo'), rodape = $('.rodape'), pontos = $('#pontos');
let busy = false;
const carousel = () => getComputedStyle(nav).overflowX === 'auto';

// the name, letter by letter (for the rise out of the mask)
const logo = $('[data-letras]');
const word = logo.textContent;
logo.textContent = '';
[...word].forEach(c => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = c; logo.appendChild(s); });

// ---------------------------------------------------------------- background
// outlines of bacteria, chains, spirals, diatoms and cells drifting by; the
// near ones are bigger, brighter and move more with the pointer. When a card
// is chosen they rush outward, as if the camera dived in.
const fundo = (() => {
  const cv = $('#fundo'), ctx = cv.getContext('2d');
  const COLORS = ['245,243,238', '255,107,94', '140,180,255', '244,233,218'];
  const KINDS = ['rod', 'coccus', 'chain', 'spiral', 'diatom', 'cell', 'rod', 'coccus'];
  let w = 0, h = 0, items = [], warp = 0, mx = 0, my = 0, smx = 0, smy = 0, last = 0, raf = 0;
  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(clamp(w * h / 36000, 14, 40));
    while(items.length < n) items.push(spawn());
    items.length = n;
  }
  function spawn(){
    const z = Math.random() ** 1.6;
    return {
      kind: KINDS[Math.floor(Math.random() * KINDS.length)], x: Math.random() * w, y: Math.random() * h, z,
      s: 9 + z * 40, a: Math.random() * 6.28, va: (Math.random() - .5) * .22,
      vx: (Math.random() - .5) * 10 * (.4 + z), vy: (Math.random() - .5) * 10 * (.4 + z),
      c: COLORS[Math.random() < .7 ? 0 : 1 + Math.floor(Math.random() * 3)], al: .035 + z * .075, ph: Math.random() * 6.28
    };
  }
  function path(o){
    const s = o.s;
    ctx.beginPath();
    switch(o.kind){
      case 'rod': {
        const r = s * .32;
        ctx.moveTo(-s + r, -r); ctx.lineTo(s - r, -r); ctx.arc(s - r, 0, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-s + r, r); ctx.arc(-s + r, 0, r, Math.PI / 2, Math.PI * 1.5); break;
      }
      case 'coccus': ctx.arc(0, 0, s * .42, 0, 6.283); break;
      case 'chain': for(let i = -2; i <= 2; i++){ ctx.moveTo(i * s * .46 + s * .2, 0); ctx.arc(i * s * .46, 0, s * .2, 0, 6.283); } break;
      case 'spiral': for(let i = 0; i <= 44; i++){ const t = i / 44, x = (t - .5) * 2.4 * s, y = Math.sin(t * Math.PI * 5 + o.ph) * s * .2; if(i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } break;
      case 'diatom': ctx.ellipse(0, 0, s * 1.05, s * .3, 0, 0, 6.283); ctx.moveTo(-s * .9, 0); ctx.lineTo(s * .9, 0); break;
      default: ctx.ellipse(0, 0, s * .8, s * .55, 0, 0, 6.283); ctx.moveTo(s * .2, 0); ctx.arc(0, 0, s * .2, 0, 6.283);
    }
    ctx.stroke();
  }
  function frame(t){
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (t - (last || t)) / 1000); last = t;
    const still = reduce();
    smx += (mx - smx) * Math.min(1, dt * 2.5); smy += (my - smy) * Math.min(1, dt * 2.5);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    for(const o of items){
      if(!still){ o.x += o.vx * dt; o.y += o.vy * dt; o.a += o.va * dt; }
      if(warp > 0){
        const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy) || 1, sp = warp * warp * (500 + o.z * 2200) * dt;
        o.x += dx / d * sp; o.y += dy / d * sp; o.s *= 1 + warp * dt * 1.4;
      }
      const m = o.s * 2.6;
      if(warp === 0){
        if(o.x < -m) o.x = w + m; else if(o.x > w + m) o.x = -m;
        if(o.y < -m) o.y = h + m; else if(o.y > h + m) o.y = -m;
      }
      const k = 8 + o.z * 26;
      ctx.save();
      ctx.translate(o.x - smx * k, o.y - smy * k);
      ctx.rotate(o.a);
      ctx.strokeStyle = `rgba(${o.c},${Math.min(.5, o.al * (1 + warp * 2.5)).toFixed(3)})`;
      ctx.lineWidth = 1 + o.z * .7;
      path(o);
      ctx.restore();
    }
  }
  resize();
  addEventListener('resize', resize);
  addEventListener('pointermove', e => { mx = e.clientX / w - .5; my = e.clientY / h - .5; }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if(document.hidden){ cancelAnimationFrame(raf); raf = 0; } else if(!raf){ last = 0; raf = requestAnimationFrame(frame); }
  });
  raf = requestAnimationFrame(frame);
  return {
    dive(ms){ const t0 = performance.now(); const tick = now => { warp = clamp((now - t0) / ms, 0, 1); if(warp < 1 && busy) requestAnimationFrame(tick); }; requestAnimationFrame(tick); },
    reset(){ warp = 0; items = []; resize(); }
  };
})();

// ---------------------------------------------------------------- where a card really is
// (its box without the tilt; offset* ignore transforms)
function baseRect(card){
  const nr = nav.getBoundingClientRect();
  return { left: nr.left + nav.clientLeft + card.offsetLeft - nav.scrollLeft, top: nr.top + nav.clientTop + card.offsetTop - nav.scrollTop, width: card.offsetWidth, height: card.offsetHeight };
}

// ---------------------------------------------------------------- tilt toward the pointer
const tilt = new Map();
let tiltRaf = 0;
cards.forEach(card => {
  const st = { rx: 0, ry: 0, lz: 0, mx: 50, my: 0, px: 0, py: 0, t: { rx: 0, ry: 0, lz: 0, mx: 50, my: 0, px: 0, py: 0 } };
  tilt.set(card, st);
  card.addEventListener('pointermove', e => {
    if(busy || e.pointerType === 'touch') return;
    const r = baseRect(card);
    const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
    const k = reduce() ? .35 : 1;
    Object.assign(st.t, { ry: (x - .5) * 18 * k, rx: (.5 - y) * 14 * k, lz: 24, mx: x * 100, my: y * 100, px: x - .5, py: y - .5 });
    card.classList.add('sobre');
    kick();
  });
  card.addEventListener('pointerleave', () => {
    Object.assign(st.t, { rx: 0, ry: 0, lz: 0, mx: 50, my: 0, px: 0, py: 0 });
    card.classList.remove('sobre');
    kick();
  });
});
function kick(){ if(!tiltRaf) tiltRaf = requestAnimationFrame(stepTilt); }
function stepTilt(){
  tiltRaf = 0;
  let moving = false;
  tilt.forEach((st, card) => {
    for(const key of ['rx', 'ry', 'lz', 'mx', 'my', 'px', 'py']){
      const d = st.t[key] - st[key];
      st[key] += d * (key === 'mx' || key === 'my' ? .3 : .14);
      if(Math.abs(d) > .02) moving = true;
    }
    const s = card.style;
    s.setProperty('--rx', `${st.rx.toFixed(2)}deg`); s.setProperty('--ry', `${st.ry.toFixed(2)}deg`);
    s.setProperty('--lz', `${st.lz.toFixed(1)}px`);
    s.setProperty('--mx', `${st.mx.toFixed(1)}%`); s.setProperty('--my', `${st.my.toFixed(1)}%`);
    s.setProperty('--px', st.px.toFixed(3)); s.setProperty('--py', st.py.toFixed(3));
    s.setProperty('--sx', `${(-st.ry * 1.4).toFixed(1)}px`); s.setProperty('--sy', `${(st.rx * 1.4).toFixed(1)}px`);
  });
  if(moving) kick();
}

// ---------------------------------------------------------------- arriving
function intro(skip){
  if(reduce() || !document.body.animate) return;
  $$('.logo .ch').forEach((s, i) => s.animate([{ transform: 'translateY(108%)' }, { transform: 'none' }], { duration: 950, delay: 80 + i * 42, easing: EASE, fill: 'backwards' }));
  $('.lead').animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 560, easing: EASE, fill: 'backwards' });
  cards.forEach((c, i) => {
    if(c === skip) return;
    c.animate([
      { opacity: 0, transform: 'perspective(1100px) translate3d(0,80px,0) rotateX(-30deg) scale(.94)' },
      { opacity: 1, transform: 'perspective(1100px) translate3d(0,0,0) rotateX(0deg) scale(1)' }
    ], { duration: 1150, delay: 320 + i * 120, easing: EASE, fill: 'backwards' });
  });
  [rodape, pontos].forEach(el => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 900, fill: 'backwards' }));
}

// ---------------------------------------------------------------- the portal
// a copy of the card with two faces: the front (the card) and the back (its
// colour and name, sized so that at full screen it is the same as the veil
// of comum/entrada.js, so the swap is invisible)
function makePortal(card, r, S){
  const cfg = CFG[card.dataset.id];
  const scene = document.createElement('div'); scene.className = 'portal-cena';
  const portal = document.createElement('div'); portal.className = 'portal';
  portal.setAttribute('style', card.getAttribute('style'));
  Object.assign(portal.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  const front = document.createElement('div');
  front.className = 'cartao pf';
  front.setAttribute('style', card.getAttribute('style'));
  front.innerHTML = card.innerHTML;
  const back = document.createElement('div'); back.className = 'pf verso';
  const vk = document.createElement('span'); vk.className = 'vk'; vk.textContent = 'Microcosmo';
  const vt = document.createElement('span'); vt.className = 'vt'; vt.textContent = cfg.titulo;
  const vb = document.createElement('span'); vb.className = 'vb';
  const vw = innerWidth, vh = innerHeight;
  vk.style.fontSize = `${12 / S}px`;
  vt.style.fontSize = `${clamp(vw * .095, 41.6, 118.4) / S}px`;
  vt.style.padding = `0 ${vw * .04 / S}px`;
  vb.style.width = `${clamp(vw * .14, 90, 160) / S}px`;
  vb.style.height = `${2 / S}px`;
  back.style.gap = `${clamp(vh * .02, 10, 18) / S}px`;
  back.append(vk, vt, vb);
  portal.append(front, back);
  scene.appendChild(portal);
  document.body.appendChild(scene);
  return { scene, portal, faces: [front, back] };
}
function coverOf(r){
  const vw = innerWidth, vh = innerHeight;
  return {
    dx: vw / 2 - (r.left + r.width / 2), dy: vh / 2 - (r.top + r.height / 2),
    S: Math.max(vw / r.width, vh / r.height) * 1.08
  };
}
const T3 = (x, y, rx, ry, s) => `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(3)})`;

function prefetch(href){
  if(document.querySelector(`link[rel=prefetch][href="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'prefetch'; l.href = href;
  document.head.appendChild(l);
}

// ---------------------------------------------------------------- choosing a card
function choose(card){
  if(busy) return;
  busy = true;
  const id = card.dataset.id, cfg = CFG[id], href = card.getAttribute('href');
  const dest = `${href}${href.includes('?') ? '&' : '?'}entrada`;
  document.body.classList.add('saindo');
  card.classList.remove('sobre');
  if(reduce() || !card.animate){ VEU.veu(cfg); setTimeout(() => { location.href = dest; }, 260); return; }

  const st = tilt.get(card);
  const r = baseRect(card), { dx, dy, S } = coverOf(r);
  const { portal, faces } = makePortal(card, r, S);
  card.classList.add('escolhido');
  const T = 1250;
  portal.animate([
    { offset: 0, transform: T3(0, 0, st.rx, st.ry, 1 + st.lz / 1100) },
    { offset: .14, transform: T3(0, -18, 6, -16, 1.05), easing: 'cubic-bezier(.45,0,.2,1)' },
    { offset: .56, transform: T3(dx * .8, dy * .8, 0, 130, 1.5), easing: 'cubic-bezier(.3,0,.25,1)' },
    { offset: .8, transform: T3(dx, dy, 0, 180, S * .42), easing: 'cubic-bezier(.6,0,.2,1)' },
    { offset: 1, transform: T3(dx, dy, 0, 180, S) }
  ], { duration: T, fill: 'forwards' }).finished.then(() => {
    // at full screen the back face becomes the real veil, which the next page keeps
    VEU.veu(cfg);
    requestAnimationFrame(() => requestAnimationFrame(() => { location.href = dest; }));
  });
  faces.forEach(f => f.animate([{ borderRadius: '30px' }, { borderRadius: '30px', offset: .74 }, { borderRadius: '0px' }], { duration: T, fill: 'forwards' }));

  // everything else falls away
  cards.forEach(c => {
    if(c === card) return;
    const side = baseRect(c).left < r.left ? -1 : 1;
    c.animate([
      { opacity: 1, transform: getComputedStyle(c).transform },
      { opacity: 0, transform: `perspective(1100px) translate3d(${side * 70}px,60px,-240px) rotateY(${side * -28}deg) rotateX(12deg)` }
    ], { duration: 620, easing: 'cubic-bezier(.6,0,.35,1)', fill: 'forwards' });
  });
  [topo, rodape, pontos].forEach(el => el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-16px)' }], { duration: 480, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'forwards' }));
  fundo.dive(T * .9);
}

// ---------------------------------------------------------------- coming back
function comeBack(){
  const back = window.MC_VOLTA;
  if(!back) return null;
  try { const u = new URL(location.href); u.searchParams.delete('volta'); history.replaceState(history.state, '', u.href); } catch(e){ /* file:// may refuse */ }
  const card = cards.find(c => c.dataset.id === back.id);
  if(!card || reduce() || !card.animate){ VEU.atravessar(back.veu); return null; }
  if(carousel()) nav.scrollLeft = card.offsetLeft - (nav.clientWidth - card.offsetWidth) / 2;
  const r = baseRect(card), { dx, dy, S } = coverOf(r);
  const { scene, portal, faces } = makePortal(card, r, S);
  card.classList.add('escolhido');
  back.veu.remove();
  const T = 1100;
  portal.animate([
    { offset: 0, transform: T3(dx, dy, 0, 180, S) },
    { offset: .3, transform: T3(dx, dy, 0, 180, S * .4), easing: 'cubic-bezier(.4,0,.2,1)' },
    { offset: .72, transform: T3(dx * .25, dy * .25 - 10, 4, 24, 1.12), easing: EASE },
    { offset: 1, transform: T3(0, 0, 0, 0, 1) }
  ], { duration: T, easing: 'linear', fill: 'forwards' }).finished.then(() => { card.classList.remove('escolhido'); scene.remove(); });
  faces.forEach(f => f.animate([{ borderRadius: '0px' }, { borderRadius: '30px', offset: .3 }, { borderRadius: '30px' }], { duration: T, fill: 'forwards' }));
  return card;
}

// ---------------------------------------------------------------- input
cards.forEach(card => {
  const href = card.getAttribute('href');
  card.addEventListener('pointerenter', () => prefetch(href));
  card.addEventListener('click', e => {
    if(e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab: let the browser do it
    e.preventDefault();
    if(busy) return;
    // in the phone carousel, a tap on a card at the side first brings it to the middle
    if(carousel()){
      const r = baseRect(card), mid = innerWidth / 2;
      if(Math.abs(r.left + r.width / 2 - mid) > r.width * .3){ card.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' }); return; }
    }
    choose(card);
  });
  card.addEventListener('keydown', e => {
    const i = cards.indexOf(card);
    if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){ e.preventDefault(); cards[(i + 1) % cards.length].focus(); }
    else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){ e.preventDefault(); cards[(i + cards.length - 1) % cards.length].focus(); }
  });
});
// number keys choose straight away (handy with a presenter remote or a keyboard at the stand)
addEventListener('keydown', e => {
  if(busy || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = parseInt(e.key, 10);
  if(n >= 1 && n <= cards.length) choose(cards[n - 1]);
});
// carousel dots follow the scroll
const dots = Array.from(pontos.children);
function updateDots(){
  const mid = nav.scrollLeft + nav.clientWidth / 2;
  let best = 0, bd = Infinity;
  cards.forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if(d < bd){ bd = d; best = i; } });
  dots.forEach((d, i) => d.classList.toggle('on', i === best));
}
nav.addEventListener('scroll', updateDots, { passive: true });
addEventListener('resize', updateDots);

// coming back with the browser's back button: the page may be restored as it
// was left (portal at full screen), so put everything back
addEventListener('pageshow', e => {
  if(!e.persisted) return;
  busy = false;
  document.body.classList.remove('saindo');
  $$('.portal-cena, .mc-veu').forEach(n => n.remove());
  [...cards, topo, rodape, pontos].forEach(el => { el.classList.remove('escolhido', 'sobre'); el.getAnimations().forEach(a => a.cancel()); });
  fundo.reset();
  intro(null);
});

updateDots();
intro(comeBack());
})();
