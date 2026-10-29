/* Microcosmo — a passagem entre o saguão (index.html) e cada parte do projeto.

   Chegada: quem escolhe um cartão no saguão chega com ?entrada e encontra a
   tela na cor daquele cartão, com o nome dele (o mesmo véu em que o cartão
   terminou). Quando a página carrega, o véu cresce e some: é como atravessar
   o cartão para dentro da página.
   Volta: links com [data-inicio] fecham a página num círculo da mesma cor que
   nasce no ponto do clique e voltam ao saguão com ?volta=<id>, onde o cartão
   encolhe de volta ao seu lugar.

   Cada página configura no próprio <script>: data-id, data-cor, data-tinta
   (cor do texto) e data-titulo. O saguão usa data-id="saguao" e só pega as
   funções (window.MicrocosmoVeu). Vai no começo do <body>, para o véu cobrir
   a página antes do primeiro desenho. */
(() => {
  'use strict';
  const me = document.currentScript;
  if(!me) return;
  const cfg = { id: me.dataset.id || '', cor: me.dataset.cor || '#0b0b0c', tinta: me.dataset.tinta || '#f5f3ee', titulo: me.dataset.titulo || '' };
  const SAGUAO = new URL('../index.html', me.src).href;
  const FONTE = new URL('fonts/archivo.woff2', me.src).href;
  const MONO = new URL('fonts/jetbrains-mono-700.woff2', me.src).href;
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  const css = document.createElement('style');
  css.textContent = `
@font-face{font-family:'MC Archivo';src:url('${FONTE}') format('woff2');font-weight:100 900;font-stretch:62% 125%;font-display:block}
@font-face{font-family:'MC Mono';src:url('${MONO}') format('woff2');font-weight:700;font-display:block}
.mc-veu{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,2vh,18px);
  background:var(--mc-cor);color:var(--mc-tinta);pointer-events:none;contain:strict;will-change:transform,opacity}
.mc-veu .mc-k{font:700 12px/1 'MC Mono',ui-monospace,monospace;letter-spacing:.28em;text-transform:uppercase;opacity:.62}
.mc-veu .mc-t{font:900 clamp(2.6rem,9.5vw,7.4rem)/.9 'MC Archivo','Arial Black',Arial,sans-serif;font-stretch:112%;text-transform:uppercase;letter-spacing:-.01em;text-align:center;padding:0 4vw}
.mc-veu .mc-bar{width:clamp(90px,14vw,160px);height:2px;background:currentColor;opacity:.25;position:relative;overflow:hidden}
.mc-veu .mc-bar::after{content:'';position:absolute;inset:0;width:40%;background:currentColor;opacity:1;animation:mc-load 1.1s cubic-bezier(.6,0,.4,1) infinite}
@keyframes mc-load{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){.mc-veu .mc-bar::after{animation:none;width:100%}}`;
  (document.head || document.documentElement).appendChild(css);

  // the veil: the card's colour with its name, full screen
  function veu(c){
    const v = document.createElement('div');
    v.className = 'mc-veu';
    v.setAttribute('aria-hidden', 'true');
    v.style.setProperty('--mc-cor', c.cor);
    v.style.setProperty('--mc-tinta', c.tinta);
    const k = document.createElement('span'); k.className = 'mc-k'; k.textContent = 'Microcosmo';
    const t = document.createElement('span'); t.className = 'mc-t'; t.textContent = c.titulo;
    const b = document.createElement('span'); b.className = 'mc-bar';
    v.append(k, t, b);
    (document.body || document.documentElement).appendChild(v);
    return v;
  }

  // through the veil: it grows and fades, the name flies past faster
  function atravessar(v){
    if(!v || !v.isConnected) return Promise.resolve();
    if(reduce() || !v.animate){
      return new Promise(r => { v.style.transition = 'opacity .3s'; v.style.opacity = 0; setTimeout(() => { v.remove(); r(); }, 320); });
    }
    const t = v.querySelector('.mc-t');
    v.querySelector('.mc-bar').style.opacity = 0;
    t.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' });
    const a = v.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.35)', opacity: 0 }], { duration: 720, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' });
    return a.finished.then(() => v.remove(), () => v.remove());
  }

  // leaving: a circle of the veil grows from (x, y), then the next page
  function sair(c, x, y, href){
    const v = veu(c);
    v.querySelector('.mc-bar').style.opacity = 0;
    if(reduce() || !v.animate){ location.href = href; return; }
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 20;
    v.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${r}px at ${x}px ${y}px)` }], { duration: 520, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' });
    v.querySelector('.mc-t').animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520, delay: 120, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    setTimeout(() => { location.href = href; }, 600);
  }

  window.MicrocosmoVeu = { veu, atravessar, sair, saguao: SAGUAO };
  if(!cfg.id || cfg.id === 'saguao') return;

  // ---- arrival from a card of the lobby ----
  const url = new URL(location.href);
  if(url.searchParams.has('entrada')){
    const v = veu(cfg);
    url.searchParams.delete('entrada');
    try { history.replaceState(history.state, '', url.href); } catch(e){ /* file:// may refuse; harmless */ }
    let gone = false;
    const go = () => { if(gone) return; gone = true; setTimeout(() => atravessar(v), 120); };
    if(document.readyState === 'complete') go(); else window.addEventListener('load', go);
    setTimeout(go, 4000); // never keep the page hidden for long
  }

  // ---- back to the lobby ----
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-inicio]');
    if(!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const r = a.getBoundingClientRect();
    const x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
    sair(cfg, x, y, `${SAGUAO}?volta=${encodeURIComponent(cfg.id)}`);
  });
  // coming back with the browser's back button: no veil left over
  window.addEventListener('pageshow', e => { if(e.persisted) document.querySelectorAll('.mc-veu').forEach(v => v.remove()); });
})();
