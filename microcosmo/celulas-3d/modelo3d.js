/* Microcosmo — modelo 3D de uma célula, aberto camada por camada.
   A página rola (roda do mouse, trackpad, setas ou o dedo arrastando) e
   cada trecho da rolagem destaca uma estrutura: as camadas de fora são
   cortadas em degraus, como nos desenhos de livro, até chegar ao DNA.
   É uma página própria (aberta pelo saguão) e também aparece dentro do
   jogo, num quadro (?embed), quando a ficha de uma espécie pede o 3D. */
(() => {
'use strict';

const $ = id => document.getElementById(id);
const PARAMS = new URLSearchParams(location.search);
const EMBED = PARAMS.has('embed');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const rand = (a, b) => a + Math.random() * (b - a);
const isTouch = () => document.body.classList.contains('touch');

// ---------------------------------------------------------------- the four cells
// Every structure: name, what it is for (shown in the description), and its
// kind: 'shell' = a layer that gets cut open after its turn; 'part' = a piece
// that is highlighted in place. Builders are below. umPerUnit sets the scale
// bar (how many micrometres one unit of the model is).
const MODELS = [
  {
    id: 'bacteria', tab: 'Bactéria', kicker: 'Célula bacteriana', title: 'Escherichia coli', italic: true,
    tags: ['Procarionte', 'Gram-negativa', 'Bastonete · ~2 µm'], umPerUnit: 0.54, scaleUm: 1,
    desc: 'Bactéria em bastonete que vive no intestino e é o modelo clássico de célula bacteriana. Não tem núcleo nem organelas com membrana: o DNA fica solto no citoplasma.',
    build: buildBacterium
  },
  {
    id: 'lactobacillus', tab: 'Lactobacilo', kicker: 'Bactéria láctica', title: 'Lactobacillus acidophilus', italic: true,
    tags: ['Procarionte', 'Gram-positiva', 'Bacilo · 2–6 µm'], umPerUnit: 0.75, scaleUm: 1,
    desc: 'Bacilo do iogurte e dos leites fermentados. Não tem flagelos nem membrana externa; sua parede grossa fica roxa na coloração de Gram. Transforma a lactose em ácido lático.',
    build: buildLactobacillus
  },
  {
    id: 'fungo', tab: 'Levedura', kicker: 'Célula de um fungo', title: 'Levedura', italic: false,
    tags: ['Eucarionte', 'Fungo unicelular', '5–10 µm'], umPerUnit: 2.2, scaleUm: 2,
    desc: 'Fungo de uma só célula (Saccharomyces cerevisiae), usado no pão, na cerveja e no kefir. Diferente das bactérias, é eucarionte: tem núcleo e organelas envoltas por membrana, e se reproduz por brotamento.',
    build: buildYeast
  },
  {
    id: 'planta', tab: 'Planta', kicker: 'Célula de uma planta', title: 'Célula vegetal', italic: false,
    tags: ['Eucarionte', 'Faz fotossíntese', '10–100 µm'], umPerUnit: 15, scaleUm: 10,
    desc: 'Célula eucarionte de planta, para comparar. Além do núcleo e das organelas, tem parede de celulose, cloroplastos que fazem fotossíntese e um grande vacúolo central.',
    build: buildPlant
  }
];

// ---------------------------------------------------------------- state
const V = {
  T: null, renderer: null, scene: null, camera: null, model: null, idx: 0,
  open: false, raf: 0, last: 0, t: 0, p: 0, target: 0, stepPx: 600,
  yaw: 0, pitch: 0, drag: null, loading: null, onClose: null, intro: 1, free: null,
  settled: 0, autoGoal: 0, auto: 0, fingers: 0
};
const els = {};

function cacheEls(){
  ['m3d', 'm3d-scroll', 'm3d-stage', 'm3d-bg', 'm3d-canvas', 'm3d-lines', 'm3d-label', 'm3d-top', 'm3d-kicker', 'm3d-tablist',
   'm3d-prev', 'm3d-next', 'm3d-close', 'm3d-head', 'm3d-count', 'm3d-title', 'm3d-tags', 'm3d-desc', 'm3d-stepno',
   'm3d-progress', 'm3d-box', 'm3d-desc-title', 'm3d-desc-text', 'm3d-hint', 'm3d-steps', 'm3d-scale', 'm3d-scalebar',
   'm3d-scaletxt', 'm3d-loading', 'm3d-spacer']
    .forEach(id => { els[id] = $(id); });
}

function loadThree(){
  if(window.THREE) return Promise.resolve(window.THREE);
  if(V.loading) return V.loading;
  V.loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '../comum/vendor/three.min.js';
    s.onload = () => resolve(window.THREE);
    s.onerror = () => reject(new Error('three.js não carregou'));
    document.head.appendChild(s);
  });
  return V.loading;
}

// ---------------------------------------------------------------- kit: shared pieces
function makeKit(T){
  const kit = { T };
  kit.mat = (color, o) => new T.MeshPhysicalMaterial(Object.assign({
    color, roughness: 0.42, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.35
  }, o || {}));
  kit.glass = (color, opacity, o) => kit.mat(color, Object.assign({ transparent: true, opacity, depthWrite: false, clearcoat: 0.8 }, o || {}));
  // A layer that is cut open in a stepped window: two planes (front-top and
  // "to the right of x") and only where BOTH cut is removed. The planes live
  // in the model's own space and are copied to world space every frame.
  kit.newShell = (name, text, cutX, extra) => {
    const nFront = new T.Vector3(0, -0.29, -0.957).normalize();
    const s = Object.assign({ name, text, kind: 'shell', cutX, cutF: -0.06, meshes: [], mats: [],
      local: [new T.Plane(nFront.clone(), 9), new T.Plane(new T.Vector3(-1, 0, 0), 9)],
      world: [new T.Plane(nFront.clone(), 9), new T.Plane(new T.Vector3(-1, 0, 0), 9)] }, extra || {});
    return s;
  };
  kit.shellMesh = (s, geom, color, o) => {
    const m = kit.mat(color, Object.assign({ side: T.DoubleSide, clippingPlanes: s.world, clipIntersection: true }, o || {}));
    const mesh = new T.Mesh(geom, m);
    s.meshes.push(mesh); s.mats.push(m);
    return mesh;
  };
  kit.part = (name, text, extra) => Object.assign({ name, text, kind: 'part', meshes: [], mats: [] }, extra || {});
  kit.add = (s, mesh) => { s.meshes.push(mesh); if(mesh.material && !s.mats.includes(mesh.material)) s.mats.push(mesh.material); return mesh; };
  kit.rod = (r, halfL, seg) => new T.CapsuleGeometry(r, halfL * 2, seg || 14, 56).rotateZ(Math.PI / 2);
  kit.ellipsoid = (rx, ry, rz, w, h) => new T.SphereGeometry(1, w || 56, h || 36).scale(rx, ry, rz);
  // a closed, tangled loop (chromosome) built from a few sine harmonics
  kit.loopCurve = (ex, ey, ez, wav, center) => {
    const pts = [], N = 260, c = center || new T.Vector3();
    const ph = Array.from({ length: 9 }, () => rand(0, Math.PI * 2));
    for(let i = 0; i < N; i++){
      const u = i / N * Math.PI * 2;
      pts.push(new T.Vector3(
        c.x + ex * (0.62 * Math.sin(u + ph[0]) + 0.28 * Math.sin(3 * u + ph[1]) + 0.12 * Math.sin(wav * u + ph[2])),
        c.y + ey * (0.55 * Math.cos(2 * u + ph[3]) + 0.3 * Math.sin(5 * u + ph[4]) + 0.15 * Math.sin((wav + 2) * u + ph[5])),
        c.z + ez * (0.55 * Math.sin(2 * u + ph[6]) + 0.3 * Math.cos(4 * u + ph[7]) + 0.15 * Math.cos((wav + 1) * u + ph[8]))));
    }
    return new T.CatmullRomCurve3(pts, true);
  };
  kit.tube = (curve, r, color, closed, seg, o) => new T.Mesh(new T.TubeGeometry(curve, seg || 600, r, 6, !!closed), kit.mat(color, o));
  // many small spheres in one draw call
  kit.dots = (positions, r, color, o) => {
    const geo = new T.SphereGeometry(1, 10, 8);
    const m = new T.InstancedMesh(geo, kit.mat(color, Object.assign({ clearcoat: 0.2 }, o || {})), positions.length);
    const d = new T.Object3D();
    positions.forEach((p, i) => { d.position.copy(p); const k = r * (p.s || 1); d.scale.set(k, k, k); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
    m.instanceMatrix.needsUpdate = true;
    return m;
  };
  kit.inRod = (n, rMax, halfL, avoid) => {
    const out = [];
    while(out.length < n){
      const x = rand(-halfL, halfL), r = rMax * Math.sqrt(Math.random()), a = rand(0, Math.PI * 2);
      const p = new T.Vector3(x, r * Math.cos(a), r * Math.sin(a));
      if(avoid && avoid(p)) continue;
      out.push(p);
    }
    return out;
  };
  kit.inEllipsoid = (n, c, rx, ry, rz, avoid) => {
    const out = [];
    while(out.length < n){
      const p = new T.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
      if(p.lengthSq() > 1) continue;
      p.set(c.x + p.x * rx, c.y + p.y * ry, c.z + p.z * rz);
      if(avoid && avoid(p)) continue;
      out.push(p);
    }
    return out;
  };
  // a rounded box (plant cell) as a closed surface
  kit.roundedBox = (w, h, d, r) => {
    const sh = new T.Shape(), x = -w / 2 + r, y = -h / 2 + r, ww = w - 2 * r, hh = h - 2 * r, rr = r * 0.6;
    sh.moveTo(x + rr, y); sh.lineTo(x + ww - rr, y); sh.quadraticCurveTo(x + ww, y, x + ww, y + rr);
    sh.lineTo(x + ww, y + hh - rr); sh.quadraticCurveTo(x + ww, y + hh, x + ww - rr, y + hh);
    sh.lineTo(x + rr, y + hh); sh.quadraticCurveTo(x, y + hh, x, y + hh - rr);
    sh.lineTo(x, y + rr); sh.quadraticCurveTo(x, y, x + rr, y);
    const g = new T.ExtrudeGeometry(sh, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 5, curveSegments: 10 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
  };
  kit.orient = (obj, normal) => { obj.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), normal.clone().normalize()); return obj; };
  return kit;
}

// ---------------------------------------------------------------- E. coli (Gram-negative)
function buildBacterium(kit){
  const T = kit.T, root = new T.Group(), S = [];
  const halfL = 1.25, R0 = 0.62, R1 = 0.55, R2 = 0.51, R3 = 0.47;

  // flagellum: a long helix out of the rear pole; spinning it about its own
  // axis makes the wave run along it, like the real rotary motor
  const flag = kit.part('Flagelo', 'Filamento longo que gira como uma hélice, movido por um motor na base. É o que faz a bactéria nadar.');
  const Lf = 2.4, x0 = -(halfL + R0 * 0.85);
  const fpts = [];
  for(let i = 0; i <= 140; i++){
    const t = i / 140, A = 0.2 * Math.min(1, t * 5);
    fpts.push(new T.Vector3(x0 - t * Lf, A * Math.sin(t * Math.PI * 2 * 2.4), A * Math.cos(t * Math.PI * 2 * 2.4)));
  }
  const flagMesh = kit.tube(new T.CatmullRomCurve3(fpts), 0.03, '#c27a44', false, 300);
  kit.add(flag, flagMesh); root.add(flagMesh);
  flag.anchor = new T.Vector3(x0 - Lf * 0.62, 0.2, 0.05);
  S.push(flag);

  // the layers, outside in
  const caps = kit.newShell('Cápsula', 'Camada viscosa de açúcares por fora de tudo. Protege contra o ressecamento e dificulta que as células de defesa do corpo engulam a bactéria.', -0.75);
  root.add(kit.shellMesh(caps, kit.rod(R0, halfL), '#d4874c', { roughness: 0.6, clearcoat: 0.2 }));
  caps.anchor = new T.Vector3(-1.0, 0.3, 0.54);

  // fimbriae and a sex pilus stick out through the capsule (and are cut with it)
  const fim = kit.part('Fímbrias e pili', 'Pelos curtos e numerosos que prendem a bactéria a superfícies e às células do intestino. O pilus sexual, mais longo, passa DNA para outra bactéria (conjugação).');
  {
    const n = 150, geo = new T.CylinderGeometry(0.009, 0.012, 0.24, 5).translate(0, 0.12, 0);
    const m = new T.InstancedMesh(geo, kit.mat('#a5a24c', { clippingPlanes: caps.world, clipIntersection: true }), n);
    const d = new T.Object3D();
    for(let i = 0; i < n; i++){
      const x = rand(-halfL - R0, halfL + R0); let p, nrm;
      if(Math.abs(x) <= halfL){ const a = rand(0, Math.PI * 2); nrm = new T.Vector3(0, Math.cos(a), Math.sin(a)); p = new T.Vector3(x, 0, 0).addScaledVector(nrm, R0 - 0.03); }
      else { const c = new T.Vector3(Math.sign(x) * halfL, 0, 0); nrm = new T.Vector3(Math.sign(x) * Math.random(), rand(-1, 1), rand(-1, 1)).normalize(); p = c.clone().addScaledVector(nrm, R0 - 0.03); }
      nrm.add(new T.Vector3(rand(-0.25, 0.25), rand(-0.25, 0.25), rand(-0.25, 0.25))).normalize();
      d.position.copy(p); kit.orient(d, nrm); d.scale.setScalar(rand(0.75, 1.25)); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    kit.add(fim, m); root.add(m);
    const pil = [];
    for(let i = 0; i <= 30; i++){ const t = i / 30; pil.push(new T.Vector3(0.35 + t * 0.5, R0 - 0.03 + t * 1.0, 0.1 + Math.sin(t * 3) * 0.15)); }
    const pm = kit.tube(new T.CatmullRomCurve3(pil), 0.016, '#8f8c3c', false, 60, { clippingPlanes: caps.world, clipIntersection: true });
    kit.add(fim, pm); root.add(pm);
    fim.anchor = new T.Vector3(0.62, R0 + 0.6, 0.18);
  }
  S.push(fim, caps);

  const om = kit.newShell('Membrana externa', 'Exclusiva das bactérias Gram-negativas: uma barreira que filtra o que entra. Contém lipopolissacarídeo (LPS), que no corpo humano provoca febre e inflamação.', -0.45);
  root.add(kit.shellMesh(om, kit.rod(R1, halfL), '#eca46c'));
  om.anchor = new T.Vector3(-0.6, 0.16, 0.53);
  const pg = kit.newShell('Parede de peptidoglicano', 'Rede rígida de açúcares e aminoácidos que dá forma à célula e impede que ela estoure com a entrada de água. Nas Gram-negativas ela é fina.', -0.15);
  root.add(kit.shellMesh(pg, kit.rod(R2, halfL), '#9cd6c0'));
  pg.anchor = new T.Vector3(-0.3, 0.148, 0.488);
  const pmb = kit.newShell('Membrana plasmática', 'Controla o que entra e o que sai da célula. Nela ficam as enzimas que produzem energia, porque a bactéria não tem mitocôndrias.', 0.15);
  root.add(kit.shellMesh(pmb, kit.rod(R3, halfL), '#f0d16c'));
  pmb.anchor = new T.Vector3(0.0, 0.136, 0.45);
  S.push(om, pg, pmb);

  const cyto = kit.part('Citoplasma', 'Gel de água, sais e proteínas que enche a célula. É onde acontecem quase todas as reações químicas da bactéria.');
  const cm = new T.Mesh(kit.rod(R3 - 0.015, halfL), kit.glass('#f4c9db', 0.32));
  kit.add(cyto, cm); root.add(cm);
  cyto.anchor = new T.Vector3(0.95, -0.22, 0.18);

  const ribo = kit.part('Ribossomos', 'Pequenas "fábricas" que montam as proteínas seguindo as instruções do DNA. Os da bactéria (70S) são menores que os nossos, e muitos antibióticos agem neles.');
  const rp = kit.inRod(240, R3 - 0.06, halfL - 0.05);
  rp.push(new T.Vector3(0.72, 0.18, 0.24));
  const rm = kit.dots(rp, 0.021, '#3b2f4f');
  kit.add(ribo, rm); root.add(rm);
  ribo.anchor = new T.Vector3(0.72, 0.18, 0.24);

  const nuc = kit.part('Nucleoide (DNA)', 'Região onde fica o cromossomo: uma única molécula de DNA, circular e muito enovelada, sem membrana em volta. Guarda todas as instruções da célula.');
  const curve = kit.loopCurve(0.78, 0.26, 0.26, 9);
  const dm = kit.tube(curve, 0.02, '#a43fd0', true, 900);
  kit.add(nuc, dm); root.add(dm);
  nuc.anchor = bestPoint(curve, p => p.z + 0.5 * p.x);

  const pla = kit.part('Plasmídeos', 'Pequenos anéis extras de DNA, separados do cromossomo. Podem carregar genes de resistência a antibióticos e passar de uma bactéria para outra.');
  [[0.55, 0.13, 0.2], [0.9, -0.14, 0.12], [0.3, -0.2, 0.24]].forEach(([x, y, z], i) => {
    const tm = new T.Mesh(new T.TorusGeometry(0.075, 0.011, 6, 40), kit.mat('#7a4fc0'));
    tm.position.set(x, y, z); tm.rotation.set(rand(0, 3), rand(0, 3), 0);
    kit.add(pla, tm); root.add(tm);
  });
  pla.anchor = new T.Vector3(0.55, 0.13, 0.2);
  S.push(cyto, ribo, nuc, pla);

  return { root, structures: S, deepShift: 0.6, closedX: halfL + R0 + 0.6,
    tick: (t, dt) => { flagMesh.rotation.x += dt * 7; } };
}

// ---------------------------------------------------------------- Lactobacillus (Gram-positive)
function buildLactobacillus(kit){
  const T = kit.T, root = new T.Group(), S = [];
  const halfL = 1.6, R0 = 0.5, Rw = 0.45, Rwi = 0.395, Rm = 0.375;

  const sl = kit.newShell('Camada S (cápsula)', 'Camada mais externa, feita de proteínas encaixadas como azulejos. Ajuda o lactobacilo a se prender à parede do intestino e protege a célula.', -1.0);
  root.add(kit.shellMesh(sl, kit.rod(R0, halfL), '#7fe6bf', { roughness: 0.5 }));
  sl.anchor = new T.Vector3(-1.3, 0.24, 0.43);

  const wall = kit.newShell('Parede celular', 'Camada grossa de peptidoglicano com ácidos teicoicos. É por ser tão grossa que ela segura o corante roxo na coloração de Gram (Gram-positiva) e dá a forma de bastão.', -0.55);
  root.add(kit.shellMesh(wall, kit.rod(Rw, halfL), '#33c58d'));
  root.add(kit.shellMesh(wall, kit.rod(Rwi, halfL), '#2aa877'));
  wall.anchor = new T.Vector3(-0.78, 0.125, 0.41);

  const mem = kit.newShell('Membrana plasmática', 'Controla o que entra e o que sai. Bombeia prótons para fora, o que mantém o interior da célula menos ácido que o iogurte em volta.', -0.1);
  root.add(kit.shellMesh(mem, kit.rod(Rm, halfL), '#1d9a6a'));
  mem.anchor = new T.Vector3(-0.33, 0.11, 0.355);
  S.push(sl, wall, mem);

  const cyto = kit.part('Citoplasma', 'Onde a lactose é quebrada e fermentada em ácido lático. É dessa fermentação que vem a energia do lactobacilo e o azedinho do iogurte.');
  const cm = new T.Mesh(kit.rod(Rm - 0.012, halfL), kit.glass('#4fe0aa', 0.3));
  kit.add(cyto, cm); root.add(cm);
  cyto.anchor = new T.Vector3(1.25, -0.2, 0.18);

  const ribo = kit.part('Ribossomos', 'Montam as proteínas da célula, como as enzimas que fazem a fermentação, seguindo as instruções do DNA.');
  const big = kit.inRod(42, Rm - 0.08, halfL - 0.1);
  big.forEach(p => { p.s = rand(0.8, 1.5); });
  big.push(Object.assign(new T.Vector3(0.75, 0.16, 0.2), { s: 1.4 }));
  const bm = kit.dots(big, 0.036, '#14593f');
  const sm = kit.dots(kit.inRod(160, Rm - 0.04, halfL - 0.05), 0.012, '#1f7a55');
  kit.add(ribo, bm); kit.add(ribo, sm); root.add(bm); root.add(sm);
  ribo.anchor = new T.Vector3(0.75, 0.16, 0.2);

  const dna = kit.part('DNA (nucleoide)', 'Cromossomo circular com todos os genes do lactobacilo, solto no citoplasma, sem núcleo. Inclui os genes das enzimas que digerem a lactose.');
  const pts = [];
  for(let i = 0; i < 220; i++){
    const u = i / 220 * Math.PI * 2;
    pts.push(new T.Vector3(1.05 * Math.cos(u), 0.12 * Math.sin(9 * u) + 0.06 * Math.sin(u), 0.16 * Math.sin(u) + 0.07 * Math.cos(7 * u)));
  }
  const curve = new T.CatmullRomCurve3(pts, true);
  const dm = kit.tube(curve, 0.028, '#3d8bd0', true, 700);
  kit.add(dna, dm); root.add(dm);
  dna.anchor = bestPoint(curve, p => p.z + 0.4 * p.x);
  S.push(cyto, ribo, dna);

  return { root, structures: S, deepShift: 0.7, closedX: halfL + R0 + 0.6 };
}

// ---------------------------------------------------------------- yeast (fungus)
function buildYeast(kit){
  const T = kit.T, root = new T.Group(), S = [];
  const ex = 1.15, ey = 0.95, ez = 0.95;
  const ang = 0.95, neck = new T.Vector3(ex * Math.cos(ang), ey * Math.sin(ang), 0);
  const ndir = new T.Vector3(Math.cos(ang) / ex, Math.sin(ang) / ey, 0).normalize();
  const bc = neck.clone().addScaledVector(ndir, 0.36), br = 0.48;

  const wall = kit.newShell('Parede celular', 'Camada rígida de glucanos e quitina (açúcares resistentes) que protege a célula e mantém a sua forma.', -0.55);
  root.add(kit.shellMesh(wall, kit.ellipsoid(ex, ey, ez), '#2b8fa6'));
  root.add(kit.shellMesh(wall, kit.ellipsoid(ex * 0.94, ey * 0.94, ez * 0.94), '#3fa4b5'));
  wall.anchor = new T.Vector3(-0.85, 0.3, 0.6);

  const mem = kit.newShell('Membrana celular', 'Controla o que entra e o que sai da célula. Contém ergosterol, a substância que muitos remédios contra fungos atacam.', -0.25);
  root.add(kit.shellMesh(mem, kit.ellipsoid(ex * 0.91, ey * 0.91, ez * 0.91), '#e0609c'));
  mem.anchor = new T.Vector3(-0.42, 0.25, 0.8);
  S.push(wall, mem);

  // bud, septum and bud scars: highlighted together; the bud stays whole
  const bud = kit.part('Brotamento e septo', 'O broto é uma nova célula crescendo para fora da célula-mãe. O septo se forma no "pescoço" para separar as duas; quando o broto se solta, deixa uma cicatriz de brotamento na parede.');
  const bw = new T.Mesh(kit.ellipsoid(br, br, br), kit.mat('#2b8fa6'));
  bw.position.copy(bc); root.add(bw);
  kit.add(bud, bw);
  const sep = new T.Mesh(new T.TorusGeometry(0.2, 0.035, 10, 40), kit.mat('#1d6f82'));
  sep.position.copy(neck); sep.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), ndir);
  kit.add(bud, sep); root.add(sep);
  [[3.55, 0.25], [3.95, -0.45]].forEach(([a, z]) => {
    const p = new T.Vector3(ex * Math.cos(a) * Math.sqrt(1 - z * z), ey * Math.sin(a) * Math.sqrt(1 - z * z), ez * z);
    const n = new T.Vector3(p.x / (ex * ex), p.y / (ey * ey), p.z / (ez * ez)).normalize();
    const sc = new T.Mesh(new T.TorusGeometry(0.11, 0.025, 8, 32), kit.mat('#1d6f82'));
    sc.position.copy(p).addScaledVector(n, 0.01); sc.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), n);
    kit.add(bud, sc); root.add(sc);
  });
  bud.anchor = bc.clone().add(new T.Vector3(0.15, 0.35, 0.2));
  S.push(bud);

  const cyto = kit.part('Citoplasma', 'Líquido onde ficam as organelas. Nele acontece a fermentação, que transforma o açúcar em álcool e gás carbônico: é o gás que faz o pão crescer.');
  const cm = new T.Mesh(kit.ellipsoid(ex * 0.88, ey * 0.88, ez * 0.88), kit.glass('#f4a6c8', 0.3));
  kit.add(cyto, cm); root.add(cm);
  cyto.anchor = new T.Vector3(0.75, -0.45, 0.35);
  S.push(cyto);

  const nucleus = kit.part('Núcleo e nucléolo', 'O núcleo guarda o DNA dentro de uma membrana dupla e controla a célula. O nucléolo, a parte mais escura, produz as peças dos ribossomos.');
  const nc = new T.Vector3(-0.08, 0.06, 0.12);
  const nm = new T.Mesh(kit.ellipsoid(0.3, 0.3, 0.3), kit.glass('#9a5bc0', 0.62));
  nm.position.copy(nc);
  const nl = new T.Mesh(kit.ellipsoid(0.11, 0.11, 0.11), kit.mat('#4b2463'));
  nl.position.copy(nc).add(new T.Vector3(0.05, 0.07, 0.1));
  kit.add(nucleus, nm); kit.add(nucleus, nl); root.add(nm); root.add(nl);
  nucleus.anchor = nc.clone().add(new T.Vector3(0, 0.25, 0.15));

  const mito = kit.part('Mitocôndrias', 'Usinas de energia: quando há oxigênio, fazem a respiração celular e produzem ATP, a "moeda" de energia da célula.');
  [[0.42, -0.42, 0.38, 0.6], [0.66, 0.08, 0.42, -0.4], [-0.55, 0.42, 0.32, 1.1]].forEach(([x, y, z, r]) => {
    const m = new T.Mesh(new T.CapsuleGeometry(0.07, 0.22, 8, 16), kit.mat('#e8763c'));
    m.position.set(x, y, z); m.rotation.set(0.4, 0.2, r);
    kit.add(mito, m); root.add(m);
  });
  mito.anchor = new T.Vector3(0.42, -0.42, 0.38);

  const er = kit.part('Retículo endoplasmático', 'Rede de membranas ligada ao núcleo. A parte granular, cheia de ribossomos, produz proteínas; a parte agranular, lisa, produz lipídios.');
  const erPts = [], erRibo = [];
  for(let k = 0; k < 2; k++){
    const pts = [];
    for(let i = 0; i <= 80; i++){
      const u = i / 80 * Math.PI * 1.5 + k * 0.6 - 0.2;
      const r = 0.42 + 0.05 * Math.sin(u * 7 + k);
      pts.push(new T.Vector3(nc.x + r * Math.cos(u), nc.y + r * Math.sin(u) * 0.85, nc.z + 0.1 + 0.08 * Math.sin(u * 5) + k * 0.06));
    }
    erPts.push(pts);
  }
  erPts.forEach((pts, k) => {
    const c = new T.CatmullRomCurve3(pts);
    const m = kit.tube(c, 0.022, k ? '#c27ab0' : '#b0569a', false, 200);
    kit.add(er, m); root.add(m);
    if(!k) for(let i = 0; i < 40; i++) erRibo.push(c.getPoint(i / 40).add(new T.Vector3(rand(-0.03, 0.03), rand(-0.03, 0.03), 0.03)));
  });
  const erd = kit.dots(erRibo, 0.014, '#5a2a52');
  kit.add(er, erd); root.add(erd);
  er.anchor = erPts[0][30].clone();

  const golgi = kit.part('Complexo de Golgi', 'Pilha de bolsas achatadas que modifica, empacota e envia as proteínas, despachadas em vesículas para onde forem necessárias.');
  const gc = new T.Vector3(0.48, 0.38, 0.32);
  for(let i = 0; i < 4; i++){
    const m = new T.Mesh(kit.ellipsoid(0.24 - i * 0.025, 0.028, 0.15 - i * 0.012, 24, 12), kit.mat('#d65a91'));
    m.position.copy(gc).add(new T.Vector3(0, i * 0.055, 0)); m.rotation.set(0.5, 0.3, -0.5 + i * 0.06);
    kit.add(golgi, m); root.add(m);
  }
  golgi.anchor = gc.clone().add(new T.Vector3(0, 0.12, 0));

  const vac = kit.part('Vacúolo', 'Bolsa grande que guarda água, nutrientes e restos, e ajuda a controlar a pressão dentro da célula.');
  const vm = new T.Mesh(kit.ellipsoid(0.36, 0.33, 0.33), kit.glass('#d8d6ff', 0.55));
  vm.position.set(-0.5, -0.36, 0.12);
  kit.add(vac, vm); root.add(vm);
  vac.anchor = new T.Vector3(-0.5, -0.36, 0.45);

  const ves = kit.part('Vesículas', 'Pequenas bolsas de membrana que levam substâncias de um lugar para outro dentro da célula, e também para fora dela.');
  const vp = [];
  while(vp.length < 9){ // around the Golgi, but well inside the membrane
    const q = gc.clone().add(new T.Vector3(rand(-0.3, 0.25), rand(-0.25, 0.3), rand(-0.05, 0.15)));
    if((q.x / ex) ** 2 + (q.y / ey) ** 2 + (q.z / ez) ** 2 < 0.62) vp.push(q);
  }
  const vd = kit.dots(vp, 0.04, '#f7cfe2');
  kit.add(ves, vd); root.add(vd);
  ves.anchor = vp[0].clone();
  S.push(nucleus, mito, er, golgi, vac, ves);

  return { root, structures: S, deepShift: 0.55, closedX: 3 };
}

// ---------------------------------------------------------------- plant cell
function buildPlant(kit){
  const T = kit.T, root = new T.Group(), S = [];

  const wall = kit.newShell('Parede celular', 'Camada rígida de celulose por fora da membrana. Sustenta e protege a célula, e é o que deixa caules e folhas firmes.', -0.8);
  root.add(kit.shellMesh(wall, kit.roundedBox(3.4, 2.2, 1.9, 0.28), '#45a845'));
  root.add(kit.shellMesh(wall, kit.roundedBox(3.2, 2.0, 1.7, 0.22), '#5cbf4a'));
  wall.anchor = new T.Vector3(-1.2, 0.3, 0.95);

  const mem = kit.newShell('Membrana plasmática', 'Fica logo abaixo da parede e controla o que entra e o que sai da célula.', -0.35);
  root.add(kit.shellMesh(mem, kit.roundedBox(3.1, 1.9, 1.6, 0.2), '#a8dc6e'));
  mem.anchor = new T.Vector3(-0.58, 0.25, 0.8);
  S.push(wall, mem);

  const cyto = kit.part('Citoplasma', 'Líquido gelatinoso que preenche a célula e onde ficam as organelas.');
  const cm = new T.Mesh(kit.roundedBox(3.05, 1.85, 1.55, 0.19), kit.glass('#d8f0b8', 0.28));
  kit.add(cyto, cm); root.add(cm);
  cyto.anchor = new T.Vector3(1.25, -0.62, 0.55);

  const vac = kit.part('Vacúolo', 'Grande bolsa central cheia de água e sais. Empurra o citoplasma contra a parede e deixa a célula firme; quando a planta perde água, ela murcha.');
  const vm = new T.Mesh(kit.ellipsoid(0.85, 0.55, 0.5), kit.glass('#8fcdf0', 0.5));
  vm.position.set(0.32, -0.08, 0);
  kit.add(vac, vm); root.add(vm);
  vac.anchor = new T.Vector3(0.32, 0.05, 0.48);
  S.push(cyto, vac);

  const chl = kit.part('Cloroplastos', 'Fazem a fotossíntese: usam a luz para transformar gás carbônico e água em açúcar e oxigênio. A clorofila dentro deles é o que deixa a planta verde.');
  [[1.12, 0.58, 0.42, 0.3], [1.2, -0.48, 0.4, -0.5], [0.2, 0.68, 0.48, 0.1], [-0.3, -0.68, 0.46, -0.2], [-1.15, -0.5, 0.42, 0.8], [0.62, -0.7, -0.2, 0.4], [-0.6, 0.66, -0.3, -0.3]].forEach(([x, y, z, r]) => {
    const g = new T.Group();
    const body = new T.Mesh(kit.ellipsoid(0.26, 0.12, 0.15), kit.mat('#3f9c3a', { transparent: true, opacity: 0.82 }));
    g.add(body); kit.add(chl, body);
    for(let k = -1; k <= 1; k++){
      const gr = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.06, 14), kit.mat('#1d6a22'));
      gr.position.set(k * 0.12, 0, 0); g.add(gr); kit.add(chl, gr);
    }
    g.position.set(x, y, z); g.rotation.set(0.3, 0.2, r);
    root.add(g);
  });
  chl.anchor = new T.Vector3(1.12, 0.58, 0.55);

  const nucleus = kit.part('Núcleo', 'Guarda o DNA da célula e controla tudo o que ela faz. O nucléolo, dentro dele, produz as peças dos ribossomos.');
  const nc = new T.Vector3(-0.95, 0.3, 0.25);
  const nm = new T.Mesh(kit.ellipsoid(0.33, 0.33, 0.33), kit.glass('#6c4fa8', 0.7));
  nm.position.copy(nc);
  const nl = new T.Mesh(kit.ellipsoid(0.12, 0.12, 0.12), kit.mat('#f2c94c'));
  nl.position.copy(nc).add(new T.Vector3(0.05, 0.05, 0.14));
  kit.add(nucleus, nm); kit.add(nucleus, nl); root.add(nm); root.add(nl);
  nucleus.anchor = nc.clone().add(new T.Vector3(0, 0.25, 0.2));

  const mito = kit.part('Mitocôndrias', 'Transformam o açúcar feito na fotossíntese em energia (ATP) pela respiração celular, de dia e de noite.');
  [[-0.38, 0.62, 0.42, 0.4], [0.95, 0.12, 0.55, -0.6], [-1.15, -0.12, 0.5, 1.2]].forEach(([x, y, z, r]) => {
    const m = new T.Mesh(new T.CapsuleGeometry(0.075, 0.24, 8, 16), kit.mat('#e8763c'));
    m.position.set(x, y, z); m.rotation.set(0.3, 0.1, r);
    kit.add(mito, m); root.add(m);
  });
  mito.anchor = new T.Vector3(0.95, 0.12, 0.6);

  const rer = kit.part('Retículo endoplasmático rugoso', 'Rede de membranas coberta de ribossomos, ao lado do núcleo. É onde as proteínas são produzidas.');
  const rr = [];
  for(let k = 0; k < 3; k++){
    const pts = [];
    for(let i = 0; i <= 50; i++){
      const t = i / 50;
      pts.push(new T.Vector3(-0.5 + t * 0.45, 0.62 - k * 0.12 - t * 0.5 + 0.05 * Math.sin(t * 12 + k), 0.42 + k * 0.03));
    }
    const c = new T.CatmullRomCurve3(pts);
    const m = kit.tube(c, 0.022, '#4f6fc2', false, 120);
    kit.add(rer, m); root.add(m);
    for(let i = 0; i < 18; i++) rr.push(c.getPoint(i / 18).add(new T.Vector3(0, 0.03, 0.025)));
  }
  const rd = kit.dots(rr, 0.014, '#273a7c');
  kit.add(rer, rd); root.add(rd);
  rer.anchor = new T.Vector3(-0.3, 0.38, 0.45);

  const golgi = kit.part('Complexo de Golgi', 'Empacota e distribui as proteínas. Nas plantas também produz materiais usados para construir a parede celular.');
  const gc = new T.Vector3(-0.35, -0.42, 0.48);
  for(let i = 0; i < 4; i++){
    const m = new T.Mesh(kit.ellipsoid(0.26 - i * 0.025, 0.026, 0.14, 24, 12), kit.mat('#e0a02c'));
    m.position.copy(gc).add(new T.Vector3(0, i * 0.05, 0)); m.rotation.set(0.6, 0.2, 0.3);
    kit.add(golgi, m); root.add(m);
  }
  golgi.anchor = gc.clone().add(new T.Vector3(0, 0.1, 0.05));

  const per = kit.part('Peroxissomo', 'Pequena bolsa com enzimas que destroem substâncias tóxicas, como a água oxigenada que a própria célula produz.');
  const pm = new T.Mesh(kit.ellipsoid(0.08, 0.08, 0.08), kit.mat('#c9d33a'));
  pm.position.set(0.55, 0.62, 0.52);
  kit.add(per, pm); root.add(pm);
  per.anchor = new T.Vector3(0.55, 0.62, 0.52);

  const ribo = kit.part('Ribossomos', 'Montam as proteínas. Ficam soltos no citoplasma ou presos ao retículo endoplasmático rugoso.');
  const rp = kit.inEllipsoid(160, new T.Vector3(0, 0, 0.1), 1.4, 0.82, 0.65, p => Math.hypot((p.x - 0.32) / 0.85, (p.y + 0.08) / 0.55, p.z / 0.5) < 1);
  rp.push(new T.Vector3(1.0, -0.2, 0.62));
  const rdm = kit.dots(rp, 0.018, '#2f4f9a');
  kit.add(ribo, rdm); root.add(rdm);
  ribo.anchor = new T.Vector3(1.0, -0.2, 0.62);
  S.push(chl, nucleus, mito, rer, golgi, per, ribo);

  return { root, structures: S, deepShift: 0.6, closedX: 3 };
}

function bestPoint(curve, score){
  let best = null, bs = -1e9;
  for(let i = 0; i < 200; i++){ const p = curve.getPoint(i / 200); const s = score(p); if(s > bs){ bs = s; best = p; } }
  return best;
}

// ---------------------------------------------------------------- renderer + scene
function initRenderer(){
  const T = V.T;
  if(T.ColorManagement) T.ColorManagement.legacyMode = false;
  const r = new T.WebGLRenderer({ canvas: els['m3d-canvas'], antialias: true, alpha: true });
  r.setClearColor(0x000000, 0);
  r.localClippingEnabled = true;
  r.outputEncoding = T.sRGBEncoding;
  r.toneMapping = T.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.12;
  V.renderer = r;
  V.scene = new T.Scene();
  V.camera = new T.PerspectiveCamera(30, 1, 0.1, 100);
  // studio light on a dark stage: soft fill, a key from the top right and a
  // cool rim from behind that draws the outline of the cell
  V.scene.add(new T.HemisphereLight(0xffffff, 0x23262c, 0.85));
  const key = new T.DirectionalLight(0xffffff, 1.45); key.position.set(3, 5, 6); V.scene.add(key);
  const rim = new T.DirectionalLight(0xe6ffd2, 1.25); rim.position.set(-4, 3.5, -5); V.scene.add(rim);
  const low = new T.DirectionalLight(0xfff1e0, 0.3); low.position.set(0, -4, 3); V.scene.add(low);
  V.pivot = new T.Group(); V.pivot.rotation.order = 'XYZ'; V.scene.add(V.pivot);
}

function disposeModel(){
  if(!V.model) return;
  V.pivot.remove(V.model.root);
  V.model.root.traverse(o => {
    if(o.geometry) o.geometry.dispose();
    if(o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
  V.model = null;
}

const pad2 = n => String(n).padStart(2, '0');

function buildModel(idx){
  const T = V.T, def = MODELS[idx];
  disposeModel();
  const kit = makeKit(T);
  const m = def.build(kit);
  m.def = def;
  // centre the model on its own middle so it turns about that point
  const box = new T.Box3().setFromObject(m.root);
  const c = box.getCenter(new T.Vector3());
  m.root.position.copy(c).negate();
  m.size = box.getSize(new T.Vector3());
  m.structures.forEach((s, i) => {
    s.step = i + 1;
    s.glow = s.mats.map(mt => mt.color.clone());
  });
  const firstPart = m.structures.findIndex((s, i) => s.kind === 'part' && i > 0 && m.structures.slice(0, i).some(q => q.kind === 'shell') && !m.structures.slice(i).some(q => q.kind === 'shell'));
  m.deepFrom = firstPart > 0 ? firstPart + 1 : m.structures.length + 1;
  V.pivot.add(m.root);
  V.model = m;
  V.idx = idx;
  V.p = V.target = 0;
  V.settled = 0; V.auto = 0;
  V.yaw = 0; V.pitch = 0; V.intro = 0;
  fillHead(def, idx);
  buildStepsUI();
  updateText(true);
  layout();
  els['m3d-scroll'].scrollTop = 0;
}

// name, number and tags of the cell; the name rises out of a mask
function fillHead(def, idx){
  els['m3d-kicker'].textContent = `(${pad2(idx + 1)}) ${def.kicker}`;
  els['m3d-count'].textContent = `${pad2(idx + 1)} — ${pad2(MODELS.length)}`;
  const t = els['m3d-title'];
  t.textContent = '';
  const rv = document.createElement('span'); rv.className = 'rv';
  const name = document.createElement(def.italic ? 'em' : 'span'); name.textContent = def.title;
  const dot = document.createElement('span'); dot.className = 'dot'; dot.textContent = '.';
  rv.append(name, dot); t.appendChild(rv);
  els['m3d-tags'].textContent = '';
  def.tags.forEach(x => { const li = document.createElement('li'); li.textContent = x; els['m3d-tags'].appendChild(li); });
  els['m3d-scaletxt'].textContent = `${def.scaleUm} µm`;
  Array.from(els['m3d-tablist'].children).forEach((b, i) => { b.classList.toggle('on', i === idx); b.setAttribute('aria-pressed', i === idx); });
  const head = els['m3d-head'];
  head.classList.remove('enter'); void head.offsetWidth; head.classList.add('enter');
}

// ---------------------------------------------------------------- layout + scroll
function layout(){
  if(!V.renderer) return;
  const st = els['m3d-stage'], w = st.clientWidth, h = st.clientHeight;
  V.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  V.renderer.setSize(w, h, false);
  V.camera.aspect = w / h;
  V.stepPx = Math.round(h * 0.72);
  const n = V.model ? V.model.structures.length : 1;
  const sp = els['m3d-spacer'];
  sp.innerHTML = '';
  for(let i = 0; i < n; i++){ const d = document.createElement('div'); d.className = 'm3d-step'; d.style.height = V.stepPx + 'px'; sp.appendChild(d); }
  // the model goes in the space the texts leave free (same breakpoints as
  // modelo3d.css): right of the text column on a computer or a phone lying
  // down, between the name and the bottom sheet on a phone standing up
  const sr = st.getBoundingClientRect();
  const box = id => { const r = els[id].getBoundingClientRect(); return { l: r.left - sr.left, r: r.right - sr.left, t: r.top - sr.top, b: r.bottom - sr.top }; };
  const top = box('m3d-top'), head = box('m3d-head'), desc = box('m3d-desc');
  const index = getComputedStyle(els['m3d-steps']).display !== 'none' ? box('m3d-steps') : null;
  let free;
  if(matchMedia('(max-height: 520px)').matches) free = { l: Math.max(head.r, desc.r) + 12, r: w - 14, t: top.b + 6, b: h - 12 };
  else if(matchMedia('(max-width: 820px)').matches) free = { l: 12, r: w - 12, t: head.b + 10, b: desc.t - 12 };
  else free = { l: Math.max(head.r, desc.r) + 20, r: (index ? index.l : w) - 28, t: top.b + 20, b: h - 40 };
  V.free = free;
  const cx = (free.l + free.r) / 2, cy = (free.t + free.b) / 2;
  V.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
  V.camera.updateProjectionMatrix();
  els['m3d-bg'].style.setProperty('--cx', `${cx.toFixed(0)}px`);
  els['m3d-bg'].style.setProperty('--cy', `${cy.toFixed(0)}px`);
  if(V.model){
    // fit the box (turned toward the viewer) into that space, with room for
    // the small zoom-in when the inside is shown
    const sz = V.model.size, tv = Math.tan(V.camera.fov * Math.PI / 360), th = tv * V.camera.aspect;
    const fw = Math.max(0.2, (free.r - free.l) / w) * 0.9, fh = Math.max(0.2, (free.b - free.t) / h) * 0.86;
    const hx = (sz.x * Math.cos(0.32) + sz.z * Math.sin(0.32)) / 2;
    const hy = (sz.y * Math.cos(0.4) + sz.z * Math.sin(0.4)) / 2;
    V.baseDist = Math.max(hx / (th * fw), hy / (tv * fh)) + Math.max(sz.y, sz.z) / 2;
  }
}

// After the wheel, the trackpad or the finger stops, the page glides onto a
// structure: a short swipe (or one notch of the wheel) moves one structure in
// that direction, a long flick lands on the nearest one.
const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
let settleT = 0;
function goStep(i){
  i = clamp(i, 0, V.model ? V.model.structures.length : 0);
  V.settled = V.autoGoal = i;
  V.auto = performance.now();
  els['m3d-scroll'].scrollTo({ top: i * V.stepPx, behavior: reduceMotion() ? 'auto' : 'smooth' });
}
function settle(){
  if(!V.open || !V.model || V.fingers > 0) return;
  const cur = els['m3d-scroll'].scrollTop / V.stepPx;
  // still gliding to where goStep sent it (the user scrolling again cancels that)
  if(V.auto && Math.abs(cur - V.autoGoal) > 0.02 && performance.now() - V.auto < 4000){ scheduleSettle(); return; }
  V.auto = 0;
  let goal = Math.round(cur);
  if(goal === V.settled && Math.abs(cur - V.settled) > 0.1) goal = V.settled + Math.sign(cur - V.settled);
  if(Math.abs(cur - goal) < 0.01){ V.settled = goal; return; }
  goStep(goal);
}
function scheduleSettle(){ clearTimeout(settleT); settleT = setTimeout(settle, 170); }
function onScroll(){
  V.target = els['m3d-scroll'].scrollTop / V.stepPx;
  scheduleSettle();
}

// the numbered list of structures and the progress segments
function buildStepsUI(){
  const list = els['m3d-steps'], bar = els['m3d-progress'];
  list.textContent = ''; bar.textContent = '';
  const n = V.model.structures.length;
  for(let i = 0; i <= n; i++){
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button';
    const num = document.createElement('span'); num.className = 'n'; num.textContent = pad2(i);
    const name = document.createElement('span'); name.textContent = i ? V.model.structures[i - 1].name : 'Célula inteira';
    b.append(num, name);
    b.addEventListener('click', () => goStep(i));
    li.appendChild(b); list.appendChild(li);
    if(i) bar.appendChild(document.createElement('i'));
  }
}

let lastStep = -1;
function updateText(force){
  const n = V.model.structures.length;
  const step = clamp(Math.round(V.p), 0, n);
  if(step === lastStep && !force) return;
  lastStep = step;
  const s = step ? V.model.structures[step - 1] : null;
  els['m3d-desc-title'].textContent = s ? s.name : 'Visão geral';
  els['m3d-desc-text'].textContent = s ? s.text : V.model.def.desc;
  els['m3d-stepno'].textContent = `${pad2(step)} / ${pad2(n)}`;
  const box = els['m3d-box'];
  box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
  els['m3d-desc-text'].scrollTop = 0;
  Array.from(els['m3d-progress'].children).forEach((seg, i) => { seg.classList.toggle('on', i + 1 === step); seg.classList.toggle('done', i + 1 < step); });
  Array.from(els['m3d-steps'].querySelectorAll('button')).forEach((b, i) => {
    b.classList.toggle('on', i === step); b.classList.toggle('done', i < step);
    if(i === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  // what to do next, and what comes next
  const hint = els['m3d-hint'], touch = isTouch();
  const arrow = `<span class="bob">${touch ? '↑' : '↓'}</span>`;
  if(step === 0) hint.innerHTML = `${arrow} ${touch ? 'Arraste para cima para abrir a célula' : 'Role para abrir a célula'}`;
  else if(step < n){ hint.innerHTML = `${arrow} Próxima: `; hint.appendChild(document.createTextNode(V.model.structures[step].name)); }
  else hint.textContent = 'Fim · escolha outra célula lá em cima';
  hint.classList.toggle('quiet', step > 0);
}

// ---------------------------------------------------------------- frame
const easeOut = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
function frame(now){
  if(!V.open) return;
  V.raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - (V.last || now)) / 1000); V.last = now;
  V.t += dt;
  const m = V.model;
  if(!m) return;
  V.p += (V.target - V.p) * Math.min(1, dt * 7);
  const p = V.p, n = m.structures.length;

  // pose: tilted toward the viewer, gently swaying, plus what the user dragged;
  // a new cell comes in turning and growing a little
  const reduce = reduceMotion();
  V.intro = reduce ? 1 : Math.min(1, V.intro + dt / 0.9);
  const e = easeOut(V.intro);
  const sway = reduce ? 0 : Math.sin(V.t * 0.35) * 0.2;
  V.pivot.rotation.set(0.4 + V.pitch, -0.32 + sway + V.yaw - (1 - e) * 0.7, 0);
  V.pivot.scale.setScalar(0.88 + 0.12 * e);
  const deep = smooth((p - (m.deepFrom - 1.1)) / 0.8);
  const dist = V.baseDist * (1 - 0.14 * deep);
  V.camera.position.set(0, 0, dist);
  V.camera.lookAt(0, 0, 0);
  V.pivot.updateMatrixWorld(true);

  // open the layers: each one is cut after its own turn; deep inside, the
  // windows widen so the organelles can be seen
  m.structures.forEach(s => {
    if(s.kind !== 'shell') return;
    const o = smooth((p - s.step - 0.12) / 0.6);
    s.local[0].constant = lerp(9, s.cutF - deep * 0.08, o);
    s.local[1].constant = lerp(m.closedX, s.cutX - deep * m.deepShift, o);
    s.world[0].copy(s.local[0]).applyMatrix4(m.root.matrixWorld);
    s.world[1].copy(s.local[1]).applyMatrix4(m.root.matrixWorld);
  });

  // highlight the structure whose turn it is
  const active = p >= 0.5 ? m.structures[clamp(Math.round(p), 1, n) - 1] : null;
  const pulse = 0.22 + 0.16 * Math.sin(V.t * 4);
  m.structures.forEach(s => {
    const k = s === active ? pulse : 0;
    s.mats.forEach((mt, i) => { mt.emissive.copy(s.glow[i]).multiplyScalar(k); });
  });
  if(m.tick) m.tick(V.t, dt);
  V.renderer.render(V.scene, V.camera);
  placeLabel(active);
  placeScale(dist * (0.88 + 0.12 * e) ** -1);
  updateText(false);
}

// the name of the active structure, with a leader line to it
function placeLabel(s){
  const lab = els['m3d-label'], line = els['m3d-lines'];
  if(!s || !s.anchor){ lab.style.opacity = 0; line.innerHTML = ''; return; }
  const st = els['m3d-stage'], w = st.clientWidth, h = st.clientHeight, f = V.free;
  const v = s.anchor.clone().applyMatrix4(V.model.root.matrixWorld).project(V.camera);
  const ax = (v.x * 0.5 + 0.5) * w, ay = (-v.y * 0.5 + 0.5) * h;
  if(lab.textContent !== s.name){ lab.textContent = s.name; lab.dataset.n = pad2(s.step); }
  const lw = lab.offsetWidth, lh = lab.offsetHeight;
  const right = ax < (f.l + f.r) / 2 + (f.r - f.l) * 0.12;
  let lx = right ? ax + Math.max(44, w * 0.05) : ax - Math.max(44, w * 0.05) - lw;
  let ly = ay - Math.max(34, h * 0.06) - lh / 2;
  lx = clamp(lx, f.l, Math.max(f.l, f.r - lw));
  ly = clamp(ly, f.t, Math.max(f.t, f.b - lh));
  lab.style.transform = `translate(${lx.toFixed(1)}px,${ly.toFixed(1)}px)`;
  lab.style.opacity = 1;
  const ex = right ? lx : lx + lw, ey = ly + lh / 2;
  line.innerHTML = `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="4"/>`;
}

// scale bar at the bottom right of the model's space: the length of
// scaleUm micrometres at the depth of the model's centre
let lastScale = '';
function placeScale(dist){
  const m = V.model, f = V.free, h = els['m3d-stage'].clientHeight;
  const pxPerUnit = h / (2 * dist * Math.tan(V.camera.fov * Math.PI / 360));
  const len = Math.round(m.def.scaleUm / m.def.umPerUnit * pxPerUnit);
  const key = `${len}|${f.r}|${f.b}`;
  if(key === lastScale) return;
  lastScale = key;
  els['m3d-scalebar'].style.width = `${len}px`;
  const sc = els['m3d-scale'];
  sc.style.transform = `translate(${(f.r - sc.offsetWidth).toFixed(0)}px,${(f.b - sc.offsetHeight).toFixed(0)}px)`;
}

// ---------------------------------------------------------------- drag to turn
function bindDrag(){
  const c = els['m3d-canvas'];
  c.addEventListener('pointerdown', e => {
    V.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: V.yaw, pitch: V.pitch, touch: e.pointerType === 'touch' };
    if(!V.drag.touch) c.setPointerCapture(e.pointerId);
    c.classList.add('dragging');
  });
  c.addEventListener('pointermove', e => {
    const d = V.drag; if(!d || d.id !== e.pointerId) return;
    V.yaw = d.yaw + (e.clientX - d.x) * 0.008;
    if(!d.touch) V.pitch = clamp(d.pitch + (e.clientY - d.y) * 0.006, -0.9, 0.9); // a finger moving up/down scrolls instead
  });
  const end = e => { if(V.drag && V.drag.id === e.pointerId){ V.drag = null; c.classList.remove('dragging'); } };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------- open / close
async function open(modelId, onClose){
  if(!els.m3d) cacheEls();
  V.onClose = onClose || null;
  const idx = Math.max(0, MODELS.findIndex(m => m.id === modelId));
  els.m3d.classList.add('open');
  els.m3d.setAttribute('aria-hidden', 'false');
  V.open = true;
  Modelo3D.isOpen = true;
  if(!V.T){
    els['m3d-loading'].classList.add('show');
    try { V.T = await loadThree(); }
    catch(err){ els['m3d-loading'].textContent = 'Não foi possível carregar o 3D (comum/vendor/three.min.js).'; return; }
    els['m3d-loading'].classList.remove('show');
    initRenderer();
    bindDrag();
  }
  if(!V.open) return; // closed while loading
  buildModel(idx);
  els['m3d-scroll'].focus({ preventScroll: true });
  V.last = 0;
  cancelAnimationFrame(V.raf);
  V.raf = requestAnimationFrame(frame);
}

function close(){
  if(!V.open) return;
  V.open = false;
  Modelo3D.isOpen = false;
  cancelAnimationFrame(V.raf);
  els.m3d.classList.remove('open');
  els.m3d.setAttribute('aria-hidden', 'true');
  disposeModel();
  if(V.onClose) V.onClose();
}

function show(idx){
  if(!V.T || idx === V.idx && V.model) return;
  buildModel((idx + MODELS.length) % MODELS.length);
}

function bindUI(){
  cacheEls();
  MODELS.forEach((def, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'm3d-tab';
    const no = document.createElement('span'); no.className = 'no'; no.textContent = pad2(i + 1);
    b.append(no, document.createTextNode(def.tab));
    b.addEventListener('click', () => show(i));
    els['m3d-tablist'].appendChild(b);
  });
  els['m3d-prev'].addEventListener('click', () => show(V.idx - 1));
  els['m3d-next'].addEventListener('click', () => show(V.idx + 1));
  // inside the game the button closes the frame; alone it goes back to the
  // lobby (comum/entrada.js plays the way out for [data-inicio])
  const back = els['m3d-close'];
  if(EMBED){
    back.addEventListener('click', leave);
    back.setAttribute('aria-label', 'Voltar ao jogo');
  } else {
    back.dataset.inicio = '';
    back.querySelector('.m3d-close-txt').textContent = 'Início';
    back.firstChild.before('← ');
    back.lastChild.remove(); // the ✕
    back.setAttribute('aria-label', 'Voltar ao início');
  }
  const sc = els['m3d-scroll'];
  sc.addEventListener('scroll', onScroll, { passive: true });
  // no gliding while a finger is still on the screen
  sc.addEventListener('touchstart', e => { V.fingers = e.touches.length; V.auto = 0; }, { passive: true });
  sc.addEventListener('wheel', () => { V.auto = 0; }, { passive: true });
  const lift = e => { V.fingers = e.touches.length; if(!V.fingers) scheduleSettle(); };
  sc.addEventListener('touchend', lift, { passive: true });
  sc.addEventListener('touchcancel', lift, { passive: true });
  window.addEventListener('resize', () => {
    if(!V.open || !V.model) return;
    layout();
    lastScale = '';
    sc.scrollTop = V.settled * V.stepPx;
    V.target = V.settled;
  });
  window.addEventListener('keydown', e => {
    if(!V.open) return;
    if((e.key === ' ' || e.key === 'Enter') && e.target.closest && e.target.closest('button')) return; // let the button act
    const here = Math.round(V.target);
    if(e.key === 'Escape'){ if(!EMBED) return; leave(); }
    else if(e.key === 'ArrowLeft') show(V.idx - 1);
    else if(e.key === 'ArrowRight') show(V.idx + 1);
    else if(e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) goStep(here + 1);
    else if(e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) goStep(here - 1);
    else if(e.key === 'Home') goStep(0);
    else if(e.key === 'End') goStep(Infinity);
    else return;
    e.preventDefault();
  });
}

// ---------------------------------------------------------------- page modes
// Alone, the page opens on the cell in the address (?modelo=fungo). In the
// game's frame (?embed) the game says which cell to show and is told when
// the visitor wants to go back.
function leave(){
  close();
  parent.postMessage({ microcosmo: 'fechar-3d' }, '*');
}
window.addEventListener('message', e => {
  const d = e.data;
  if(!EMBED || !d || e.source !== parent) return;
  if(d.microcosmo === 'abrir-3d') open(d.modelo);
  else if(d.microcosmo === 'parar-3d') close();
});

const Modelo3D = { open, close, isOpen: false, models: MODELS.map(m => ({ id: m.id, title: m.title })) };
window.Modelo3D = Modelo3D;
function start(){
  bindUI();
  open(PARAMS.get('modelo') || MODELS[0].id);
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
