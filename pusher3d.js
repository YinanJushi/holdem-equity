// A 3D coin pusher (three.js + Rapier physics).
// Two decks: coins drop onto the upper deck, its pusher shoves them down onto the big lower pusher and the
// deck in front of it; the lower pusher shoves the pile toward the front edge. Coins that fall over the
// middle of the front edge pay out; the two corners go to the house. Every 20th coin is gold (worth 5).
// Drop a coin through the moving Lucky Gate to roll the bonus lamp: coin shower, gold rush, funnel walls
// (guide corner coins to the middle for a while) or the jackpot. The pile is kept between visits.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { headerChrome, onQuality } from './chrome3d.js?v=108';
import { createExtras } from './pusher-extras.js?v=108';


// ---------- themes: each one dresses the whole machine and has its own way of celebrating the big wins ----------
const THEMES = {
  retro: {
    id: 'retro', name: 'Retro 2000', sign: 'PUSHER 2000', signFont: 'italic 900 100px "Arial Black", Arial, sans-serif', signCols: ['#ffe14d', '#ff4fd8'], signGlow: 'rgba(255,80,220,.9)',
    bg: '#0a0620', room: '#120a2a', side: '#e9dcc0', slab: '#1c1f4a', deck: ['#121648', '#1e2468'], deckLine: 'rgba(53,224,255,.22)', deckText: 'PUSHER 2000',
    neon: [[2.2, 0.3, 1.8], [0.3, 1.8, 2.2]], led: [0.4, 1.8, 2.4], bulbHue: 0.85, lip: [0.4, 2, 2.4],
    screen: ['#140a2a', '#07040f'], frame: '#e9dcc0',
    silver: ['#c8902a', '#ffe08a', '#8a5a12', '★', 1], gold: ['#d8d8e6', '#ffffff', '#7a7a92', '✦', 1, '#5a5a70'],
    collect: { coin: ['#18c8e8', '#d0f8ff', '#05506a', '✦', 0.8, '#20e0ff'], glyph: '✦', name: 'neon coin', col: [0.4, 1.8, 2.4] },
    superName: 'HYPER DRIVE', superFx: 'laser', jpFx: 'neon',
    wheel: { a: '#1c1f4a', b: '#3a1f6a', jp: '#ffe14d', jpText: '#3a1f6a', star: '#18c8e8', tower: '#ff4fd8', text: '#f0f4ff', hub: '#120a2a', rim: '#35e0ff' },
    fx: [[2, 0.4, 1.8], [0.4, 1.8, 2.2]], accent: '#ff4fd8', ledA: '#35e0ff', ledB: '#ff4fd8',
    voice: { super: ['Hyper drive jackpot!', '超光速大奖！'], jp: ['Jackpot!', '中大奖啦！'], tower: ['Tower down!', '推倒硬币塔！'], chance: ['Jackpot chance!', '大奖机会！'] },
  },
  macau: {
    id: 'macau', name: 'Macau Night', sign: 'Macau Nights', signFont: 'italic 700 104px Georgia, serif', signCols: ['#fff1c4', '#e0a23a'], signGlow: 'rgba(255,120,60,.85)',
    bg: '#0b0410', room: '#12060a', side: '#7a0f1e', slab: '#2a0a12', deck: ['#3a0610', '#5c0a18'], deckLine: 'rgba(255,200,90,.18)', deckText: 'Odds Lounge · 澳门',
    neon: [[2.2, 0.25, 0.3], [2.2, 1.5, 0.3]], led: [2.6, 1.3, 0.4], bulbHue: 0.06, lip: [2.4, 1.4, 0.4],
    screen: ['#1a0614', '#0b0208'], frame: '#c8963a',
    silver: ['#9a9ca8', '#eef0f6', '#6a6c78', '♠', 0.95], gold: ['#c8902a', '#ffe08a', '#8a5a12', '★', 1, '#8a5a10'],
    collect: { coin: ['#b8102a', '#ffd0c8', '#6a0612', '福', 0.7, '#c0102a'], glyph: '福', name: 'lucky coin', col: [1.6, 0.35, 0.3] },
    superName: 'GOLDEN DRAGON', superFx: 'dragon', jpFx: 'firecrackers',
    wheel: { a: '#9c0f1f', b: '#6a0a16', jp: '#ffd24a', jpText: '#9c0f1f', star: '#e3263a', tower: '#7a4a12', text: '#ffe9b0', hub: '#7a0f1e', rim: '#f2c14e' },
    fx: [[1.6, 0.35, 0.25], [1.4, 1.0, 0.3]], accent: '#e3263a', ledA: '#ffd24a', ledB: '#ff4b4b',
    voice: { super: ['Golden dragon jackpot!', '金龙大奖！恭喜发财！'], jp: ['Jackpot!', '恭喜发财，中大奖啦！'], tower: ['Tower down!', '推倒硬币塔！'], chance: ['Jackpot chance!', '大奖机会！'] },
  },
  choco: {
    id: 'choco', name: 'Chocolate Factory', sign: 'Choco Factory', signFont: '800 100px "Libre Franklin", Arial, sans-serif', signCols: ['#8a4a26', '#4a2414'], signGlow: 'rgba(255,255,255,.95)',
    bg: '#1a0d08', room: '#22130b', side: '#5a2e17', slab: '#3b1d0e', deck: ['#4a2414', '#6b3a22'], deckLine: 'rgba(255,170,210,.18)', deckText: 'Choco Factory',
    neon: [[2.2, 0.4, 1.2], [0.4, 2.0, 1.3]], led: [2.4, 0.8, 1.6], bulbHue: 0.92, lip: [2.4, 0.9, 1.6],
    screen: ['#2a1208', '#140804'], frame: '#ff8fc4',
    silver: ['#6b3a22', '#d9a074', '#3b1d0e', '♥', 0.85], gold: ['#c8902a', '#ffe08a', '#8a5a12', '♥', 1, '#8a5a10'],
    collect: { coin: ['#ff4f9a', '#ffe0f0', '#9a0f4e', '✿', 0.4, '#ff2f8a'], glyph: '♥', name: 'candy coin', col: [1.8, 0.5, 1.2] },
    superName: 'CHOCOLATE FOUNTAIN', superFx: 'waterfall', jpFx: 'sprinkles',
    wheel: { a: '#6b3a22', b: '#ff8fc4', jp: '#ffe14d', jpText: '#6b3a22', star: '#ff4f9a', tower: '#4cc2a0', text: '#fff6e0', hub: '#5a2e17', rim: '#ffd0e6' },
    fx: [[1.8, 0.5, 1.2], [0.5, 1.8, 1.4]], accent: '#ff4f9a', ledA: '#7cf0c8', ledB: '#ff8fc4',
    voice: { super: ['Chocolate fountain jackpot!', '巧克力瀑布大奖！'], jp: ['Sweet jackpot!', '甜蜜大奖！'], tower: ['Cake tower down!', '蛋糕塔倒啦！'], chance: ['Sweet chance!', '甜蜜大奖机会！'] },
  },
};
const THEME_KEY = 'ol-pz-theme';
let THEME = THEMES.retro;
try { THEME = THEMES[localStorage.getItem(THEME_KEY)] || THEMES.retro; } catch (e) { /* default */ }

const COIN = 5, GOLD = 5, $ = s => document.querySelector(s), tr = x => (window.I18N ? I18N.t(x) : x);
const host = $('#pzHost');
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); if (!renderer.getContext()) renderer = null; } catch (e) { renderer = null; }
if (renderer && host) RAPIER.init().then(start).catch(e => { console.error(e); document.documentElement.classList.remove('t3d-wait'); });
else document.documentElement.classList.remove('t3d-wait');

function start() {
  document.body.classList.add('pz-on');
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'pz-canvas'; host.appendChild(renderer.domElement);
  headerChrome(host, 'pz-on');
  const scene = new THREE.Scene(); scene.background = new THREE.Color(THEME.bg); document.body.classList.add('pz-theme-' + THEME.id);
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
  scene.add(new THREE.HemisphereLight('#ffe6c8', '#2a0a10', 0.7));
  const key = new THREE.SpotLight('#fff1dc', 1.9, 3, 0.9, 1, 1.2); key.position.set(0.1, 1.0, 0.25); key.target.position.set(0, 0, -0.15); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; scene.add(key, key.target);

  // ---------- the machine's layout (metres; z points toward you) ----------
  const W = 0.36, FRONT = 0.3, BACK = -0.72, WIN = 0.16;
  const R = 0.028, TH = 0.009;                                   // coin radius and thickness
  const P1 = { h: 0.06, d: 0.4 }, SLAB = { y0: 0.064, y1: 0.15, z1: -0.3 };   // lower pusher; the upper deck slab above its back half
  const P2 = { h: 0.04, d: 0.22 }, SCRAPER = { y0: 0.194, z1: -0.5 };        // upper pusher; the scraper above its back half
  const DROP = { y: 0.44, z: -0.4 }, GATE_Y = 0.37;
  const fz1 = t => -0.11 + Math.sin(t * 1.2) * 0.11;                 // front face of the lower pusher
  const fz2 = t => -0.42 + Math.sin(t * 1.2 + Math.PI) * 0.07;       // front face of the upper pusher (opposite phase)
  const gateX = t => Math.sin(t * 1.9) * 0.25;

  // ---------- physics ----------
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.lengthUnit = 0.05; world.timestep = 1 / 60; world.numSolverIterations = 6;
  const fixed = (hx, hy, hz, x, y, z, fr = 0.3) => world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(fr).setRestitution(0.05));
  fixed(W, 0.05, (FRONT - BACK) / 2, 0, -0.05, (FRONT + BACK) / 2);                                    // lower deck
  [-1, 1].forEach(sd => fixed(0.02, 0.4, (FRONT - BACK) / 2 + 0.05, sd * (W + 0.02), 0.35, (FRONT + BACK) / 2, 0.1));   // side walls
  fixed(W, 0.4, 0.02, 0, 0.35, BACK - 0.02);                                                           // back wall
  fixed(W, (SLAB.y1 - SLAB.y0) / 2, (SLAB.z1 - BACK) / 2, 0, (SLAB.y0 + SLAB.y1) / 2, (SLAB.z1 + BACK) / 2);   // upper deck
  fixed(W, 0.06, (SCRAPER.z1 - BACK) / 2, 0, SCRAPER.y0 + 0.06, (SCRAPER.z1 + BACK) / 2);              // scraper over the upper pusher
  const kin = (hx, hy, hz, rot) => { const d = RAPIER.RigidBodyDesc.kinematicPositionBased(); if (rot) d.setRotation(rot); const b = world.createRigidBody(d); world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.3), b); return b; };
  const pusher1 = kin(W - 0.003, P1.h / 2, P1.d / 2), pusher2 = kin(W - 0.003, P2.h / 2, P2.d / 2);
  const pos1 = t => ({ x: 0, y: P1.h / 2, z: fz1(t) - P1.d / 2 }), pos2 = t => ({ x: 0, y: SLAB.y1 + P2.h / 2, z: fz2(t) - P2.d / 2 });
  pusher1.setTranslation(pos1(0), true); pusher2.setTranslation(pos2(0), true);
  // funnel walls: rise out of the deck at the front corners and steer corner coins toward the paying middle
  const FW = (() => { const dx = W - WIN, dz = 0.14, len = Math.hypot(dx, dz); return { len, dz, list: [-1, 1].map(sd => { const th = Math.atan2(-dx * sd, dz), q = { x: 0, y: Math.sin(th / 2), z: 0, w: Math.cos(th / 2) }; const b = kin(0.006, 0.03, len / 2, q); const x = sd * (W + WIN) / 2, z = FRONT - dz / 2; b.setTranslation({ x, y: -0.04, z }, true); return { b, x, z, th, sd }; }) }; })();
  let wallUp = 0, wallH = 0;   // seconds left; current height 0..1

  // ---------- coins ----------
  const coins = [];   // { body, gold, gate, vy, paid }
  const MAXC = 680, INST = 1300;   // coins in play normally; drawing room for a coin flood
  let capNow = MAXC;
  function addCoin(x, y, z, gold, opts = {}) {
    if (coins.length >= capNow) return null;
    const q = opts.q || new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * (opts.tumble || 0.3), Math.random() * 6, (Math.random() - 0.5) * (opts.tumble || 0.3)));
    const d = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.4).setAngularDamping(0.9);
    const falling = !opts.q && !opts.sleep;
    if (falling) d.setCcdEnabled(true);
    if (opts.sleep) d.setSleeping(true);
    if (opts.vy) d.setLinvel(opts.vx || 0, opts.vy, opts.vz || 0);
    const body = world.createRigidBody(d);
    world.createCollider(RAPIER.ColliderDesc.roundCylinder(TH / 2 - 0.002, R - 0.002, 0.002).setDensity(gold ? 9 : 8).setFriction(0.32).setRestitution(0.08), body);
    const c = { body, gold, star: !!opts.star, gate: !!opts.gate, vy: 0, paid: false, ccd: falling };
    coins.push(c); return c;
  }
  // coins you win pile up in the tray (just for show; the newest 70 stay)
  const trayVis = [];
  function toTray(x, gold) {
    const tx = Math.max(-WIN + 0.02, Math.min(WIN - 0.02, x + (Math.random() - 0.5) * 0.03)), tz = FRONT + 0.04 + Math.random() * 0.1;
    let h = 0; for (const c of trayVis) if ((c.x - tx) ** 2 + (c.z - tz) ** 2 < (R * 1.5) ** 2) h = Math.max(h, c.y + TH);
    const y = Math.max(-0.145 + TH / 2, h || -0.145 + TH / 2);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.4, Math.random() * 6, (Math.random() - 0.5) * 0.4));
    trayVis.push({ x: tx, y: Math.min(y, -0.145 + TH * 6), z: tz, q, gold }); if (trayVis.length > 70) trayVis.shift();
  }
  // the flood's extra coins: they pour in from above, slide over the pile and the front edge into the tray
  // without taking part in the physics (a thousand real coins at once would stall the machine)
  const ghosts = []; let ghostLeft = 0;
  function stepGhosts(dt) {
    for (let k = 0; k < 3 && ghostLeft > 0; k++) {
      ghostLeft--;
      ghosts.push({ x: (Math.random() - 0.5) * WIN * 1.8, y: 0.65 + Math.random() * 0.2, z: -0.15 + Math.random() * 0.3, vy: -0.4 - Math.random() * 0.4, vz: 0.2 + Math.random() * 0.25, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0)), w: (Math.random() - 0.5) * 12, gold: ghostLeft % 40 === 0 });
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.vy -= 6 * dt; g.y += g.vy * dt; g.z += g.vz * dt;
      if (g.z < FRONT && g.y < 0.055) { g.y = 0.055; g.vy = 0; g.vz = Math.max(g.vz, 0.35); }   // slide over the pile
      g.q.multiply(tq.setFromEuler(e3.set(g.w * dt, 0, 0)));
      if (g.y < -0.13) {
        ghosts.splice(i, 1);
        const v = COIN * (g.gold ? GOLD : 1);
        if (sim) sim.won += v; else { pending += v; won += v; toTray(g.x, g.gold); if (Math.random() < 0.15) clink(0.6, true); }
      }
    }
  }
  const e3 = new THREE.Euler();
  const removeCoin = i => { world.removeRigidBody(coins[i].body); coins.splice(i, 1); };


  // ---------- theme art: the back wall and the decorations around the cabinet ----------
  function backdropTex() {
    const c = document.createElement('canvas'); c.width = 720; c.height = 800; const g = c.getContext('2d');
    const w = c.width, h = c.height, rnd = (a, b) => a + Math.random() * (b - a);
    if (THEME.id === 'retro') {
      // a synthwave evening: striped sun, mountains, a city skyline and a neon grid running to the horizon
      const sky = g.createLinearGradient(0, 0, 0, h * 0.62); sky.addColorStop(0, '#0b0626'); sky.addColorStop(0.6, '#3a1462'); sky.addColorStop(1, '#ff4f9a'); g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.62);
      for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.2, 0.9)})`; g.fillRect(rnd(0, w), rnd(0, h * 0.4), 2, 2); }
      const cx = w / 2, cy = h * 0.5, sr = 150;
      const sun = g.createLinearGradient(0, cy - sr, 0, cy + sr); sun.addColorStop(0, '#ffe14d'); sun.addColorStop(0.6, '#ff7a3d'); sun.addColorStop(1, '#ff2f8a'); g.fillStyle = sun; g.beginPath(); g.arc(cx, cy, sr, 0, 7); g.fill();
      g.fillStyle = '#3a1462'; for (let k = 0; k < 7; k++) { const y = cy + 10 + k * 20; g.fillRect(cx - sr, y, sr * 2, 3 + k * 1.6); }
      g.fillStyle = '#1a0a3a'; g.beginPath(); g.moveTo(0, h * 0.62); [[0.08, 0.48], [0.2, 0.55], [0.32, 0.44], [0.46, 0.58], [0.58, 0.5], [0.72, 0.43], [0.86, 0.54], [1, 0.47]].forEach(([x, y]) => g.lineTo(x * w, y * h)); g.lineTo(w, h * 0.62); g.fill();
      g.fillStyle = '#0d0624'; for (let x = cx - 150; x < cx + 150; x += rnd(18, 30)) { const bh = rnd(30, 120); g.fillRect(x, h * 0.62 - bh, rnd(14, 24), bh); }
      const ground = g.createLinearGradient(0, h * 0.62, 0, h); ground.addColorStop(0, '#1a0640'); ground.addColorStop(1, '#05020f'); g.fillStyle = ground; g.fillRect(0, h * 0.62, w, h * 0.38);
      g.strokeStyle = 'rgba(255,79,216,.85)'; g.lineWidth = 2; g.shadowColor = '#ff4fd8'; g.shadowBlur = 10;
      for (let k = -14; k <= 14; k++) { g.beginPath(); g.moveTo(cx + k * 12, h * 0.62); g.lineTo(cx + k * 90, h); g.stroke(); }
      for (let k = 0; k < 9; k++) { const y = h * 0.62 + Math.pow(k / 8, 2) * h * 0.38; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.shadowBlur = 0;
    } else if (THEME.id === 'macau') {
      // night sky over a skyline of towers with lit windows, a lotus-shaped tower in the middle, neon signs
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#12052a'); sky.addColorStop(0.55, '#3a0a2a'); sky.addColorStop(1, '#5a0f1c'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${rnd(0.2, 0.8)})`; g.fillRect(rnd(0, w), rnd(0, h * 0.45), 2, 2); }
      g.fillStyle = '#ffe9b0'; g.beginPath(); g.arc(w * 0.82, h * 0.12, 26, 0, 7); g.fill();
      const tower = (x, tw, th, col) => { g.fillStyle = col; g.fillRect(x, h - th, tw, th); for (let yy = h - th + 10; yy < h - 8; yy += 14) for (let xx = x + 5; xx < x + tw - 6; xx += 10) if (Math.random() < 0.55) { g.fillStyle = Math.random() < 0.8 ? 'rgba(255,214,120,.9)' : 'rgba(255,90,90,.9)'; g.fillRect(xx, yy, 5, 7); } };
      for (let x = -20; x < w; x += rnd(45, 80)) tower(x, rnd(40, 70), rnd(180, 380), '#1c0816');
      // the lotus tower
      const cx = w / 2; g.fillStyle = '#2a0a1a'; g.fillRect(cx - 30, h - 520, 60, 520);
      for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.32; g.save(); g.translate(cx, h - 520); g.rotate(a + Math.PI / 2); g.fillStyle = k % 2 ? '#f2c14e' : '#ffd86a'; g.beginPath(); g.ellipse(0, -60, 22, 70, 0, 0, 7); g.fill(); g.restore(); }
      g.shadowColor = '#ffcc66'; g.shadowBlur = 30; g.fillStyle = '#fff1c4'; g.beginPath(); g.arc(cx, h - 560, 16, 0, 7); g.fill(); g.shadowBlur = 0;
      g.font = '900 54px "PingFang SC", "Microsoft YaHei", serif'; g.textAlign = 'center'; g.shadowBlur = 20;
      g.shadowColor = '#ff3355'; g.fillStyle = '#ff6b7f'; g.fillText('澳門', w * 0.18, h * 0.62); g.shadowColor = '#ffd24a'; g.fillStyle = '#ffe08a'; g.fillText('發', w * 0.83, h * 0.58); g.shadowBlur = 0;
    } else {
      // a factory: pastel wall, pipes, a chocolate vat, candy jars on shelves
      const wall = g.createLinearGradient(0, 0, 0, h); wall.addColorStop(0, '#ffd8e8'); wall.addColorStop(1, '#f7b5d2'); g.fillStyle = wall; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 0; x < w; x += 60) g.fillRect(x, 0, 28, h);
      // pipes
      g.lineCap = 'round'; [['#c9a0dc', 90], ['#8fd8c8', 150], ['#ffd27a', 210]].forEach(([col, y]) => { g.strokeStyle = col; g.lineWidth = 26; g.beginPath(); g.moveTo(-20, y); g.lineTo(w * 0.3, y); g.quadraticCurveTo(w * 0.42, y, w * 0.42, y + 120); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 6; g.beginPath(); g.moveTo(-20, y - 6); g.lineTo(w * 0.3, y - 6); g.stroke(); });
      // the vat of melted chocolate
      g.fillStyle = '#b8b8c8'; g.beginPath(); g.roundRect(w * 0.55, h * 0.18, w * 0.36, h * 0.26, 30); g.fill();
      g.fillStyle = '#5a2e17'; g.beginPath(); g.ellipse(w * 0.73, h * 0.2, w * 0.17, 26, 0, 0, 7); g.fill();
      for (let i = 0; i < 7; i++) { const x = w * 0.58 + i * 34; g.fillStyle = '#5a2e17'; g.beginPath(); g.roundRect(x, h * 0.2, 16, 40 + Math.random() * 60, 8); g.fill(); }
      // candy jars
      for (let i = 0; i < 5; i++) { const x = 40 + i * 130, y = h - 190; g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.roundRect(x, y, 90, 120, 20); g.fill(); for (let k = 0; k < 14; k++) { g.fillStyle = ['#ff4f9a', '#4cc2a0', '#ffd24a', '#7a5cff', '#ff8a3d'][k % 5]; g.beginPath(); g.arc(x + 15 + (k % 4) * 20, y + 30 + Math.floor(k / 4) * 22, 9, 0, 7); g.fill(); } g.fillStyle = '#ff8fc4'; g.fillRect(x - 4, y - 10, 98, 16); }
      g.fillStyle = '#9a4a2a'; g.fillRect(0, h - 60, w, 60);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function buildDecor() {
    if (THEME.id === 'retro') {
      // chrome trim along the top of the side panels and glowing neon tubes at the front corners
      const chrome = new THREE.MeshStandardMaterial({ color: '#e6e9f2', metalness: 1, roughness: 0.15 });
      [-1, 1].forEach(sd => {
        const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, FRONT - BACK + 0.1, 16), chrome); trim.rotation.x = Math.PI / 2; trim.position.set(sd * (W + 0.03), 0.672, (FRONT + BACK) / 2); scene.add(trim);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.5, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(...THEME.neon[sd < 0 ? 0 : 1]) })); tube.position.set(sd * (W + 0.065), 0.22, FRONT + 0.05); scene.add(tube);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 10), chrome); cap.position.set(sd * (W + 0.065), 0.475, FRONT + 0.05); scene.add(cap);
      });
      return;
    }
    if (THEME.id === 'macau') {
      // red lanterns on the side panels, glowing
      const lanternM = new THREE.MeshStandardMaterial({ color: '#c8102a', emissive: '#ff1a2e', emissiveIntensity: 0.9, roughness: 0.5 });
      const capM = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 1, roughness: 0.3 });
      [-1, 1].forEach(sd => [0.62, 0.36, 0.1].forEach((z, k) => {
        const g = new THREE.Group(); g.position.set(sd * (W + 0.03), 0.72 - k * 0.02, z - 0.55); scene.add(g);
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), lanternM); l.scale.set(1, 0.85, 1); g.add(l);
        [-1, 1].forEach(e => { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 16), capM); cap.position.y = e * 0.027; g.add(cap); });
        const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.006, 0.04, 6), new THREE.MeshBasicMaterial({ color: '#ffcc55' })); tassel.position.y = -0.05; g.add(tassel);
        decorAnim.push(t => { g.rotation.z = Math.sin(t * 1.3 + k + sd) * 0.08; });
      }));
      // golden pillars at the front corners
      [-1, 1].forEach(sd => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 20), capM); p.position.set(sd * (W + 0.06), 0.22, FRONT + 0.05); scene.add(p); const top = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), lanternM); top.position.set(sd * (W + 0.06), 0.49, FRONT + 0.05); scene.add(top); });
    } else {
      // candy-cane pillars and lollipops
      const stripe = canvasTex(64, 256, g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 256); g.fillStyle = '#ff3b7a'; for (let y = -64; y < 256; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 32); g.lineTo(64, y + 52); g.lineTo(0, y + 20); g.fill(); } }).t;
      stripe.wrapS = stripe.wrapT = THREE.RepeatWrapping; stripe.repeat.set(1, 3);
      const caneM = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.3 });
      [-1, 1].forEach(sd => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 20), caneM); p.position.set(sd * (W + 0.06), 0.25, FRONT + 0.05); scene.add(p);
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.02, 12, 24, Math.PI), caneM); hook.position.set(sd * (W + 0.06) - sd * 0.04, 0.52, FRONT + 0.05); hook.rotation.z = sd > 0 ? 0 : 0; scene.add(hook);
      });
      const popCols = ['#ff4f9a', '#4cc2a0', '#ffd24a', '#7a5cff'];
      [-1, 1].forEach(sd => [0.6, 0.3, 0.0].forEach((z, k) => {
        const g = new THREE.Group(); g.position.set(sd * (W + 0.03), 0.7, z - 0.5); scene.add(g);
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 8), new THREE.MeshStandardMaterial({ color: '#ffffff' })); stick.position.y = -0.04; g.add(stick);
        const sw = canvasTex(128, 128, gg => { gg.fillStyle = '#fff'; gg.fillRect(0, 0, 128, 128); gg.strokeStyle = popCols[(k + (sd > 0 ? 1 : 0)) % 4]; gg.lineWidth = 14; gg.beginPath(); for (let a = 0; a < 14; a += 0.1) { const r = a * 4.2; gg.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } gg.stroke(); }).t;
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 28), [new THREE.MeshStandardMaterial({ color: popCols[k % 4] }), new THREE.MeshStandardMaterial({ map: sw }), new THREE.MeshStandardMaterial({ map: sw })]);
        disc.rotation.x = Math.PI / 2; disc.rotation.z = Math.PI / 2 * sd; g.add(disc);
        decorAnim.push(t => { disc.rotation.y = t * 0.8 * sd; });
      }));
    }
  }
  const decorAnim = [];
  // ---------- the cabinet (looks) ----------
  const goldM = new THREE.MeshStandardMaterial({ color: '#c8963a', metalness: 1, roughness: 0.3, envMapIntensity: 0.8 });
  const chromeM = new THREE.MeshPhysicalMaterial({ color: '#d8dbe6', metalness: 1, roughness: 0.18, clearcoat: 1, envMapIntensity: 0.9 });
  const deckTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 768; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 768); gr.addColorStop(0, THEME.deck[0]); gr.addColorStop(1, THEME.deck[1]); g.fillStyle = gr; g.fillRect(0, 0, 512, 768);
    if (THEME.id === 'choco') { g.fillStyle = 'rgba(255,255,255,.05)'; for (let y = 0; y < 768; y += 96) for (let x = 0; x < 512; x += 128) { g.fillRect(x + 6, y + 6, 116, 84); } }
    g.strokeStyle = THEME.deckLine; g.lineWidth = 2;
    for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(256, -200); g.lineTo(256 + i * 70, 800); g.stroke(); }
    g.fillStyle = 'rgba(255,214,120,.55)'; g.font = 'italic 700 46px Georgia, "PingFang SC", serif'; g.textAlign = 'center'; g.fillText(THEME.deckText, 256, 560);
    g.fillStyle = 'rgba(255,214,120,.35)';
    for (let k = 0; k < 3; k++) { const y = 640 + k * 34; g.beginPath(); g.moveTo(226, y); g.lineTo(256, y + 22); g.lineTo(286, y); g.lineTo(276, y); g.lineTo(256, y + 12); g.lineTo(236, y); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const deckM = new THREE.MeshPhysicalMaterial({ map: deckTex, roughness: 0.25, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.04, FRONT - BACK), deckM); deck.position.set(0, -0.02, (FRONT + BACK) / 2); deck.receiveShadow = true; scene.add(deck);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(WIN * 2, 0.006, 0.012), new THREE.MeshBasicMaterial({ color: new THREE.Color(...THEME.lip) })); lip.position.set(0, 0.001, FRONT - 0.006); scene.add(lip);
  [-1, 1].forEach(sd => { const c = new THREE.Mesh(new THREE.BoxGeometry(W - WIN, 0.006, 0.012), new THREE.MeshBasicMaterial({ color: '#6a0a1a' })); c.position.set(sd * (WIN + (W - WIN) / 2), 0.001, FRONT - 0.006); scene.add(c); });
  const sideM = new THREE.MeshPhysicalMaterial({ color: THEME.side, metalness: 0.4, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  [-1, 1].forEach(sd => {
    const s = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.78, FRONT - BACK + 0.12, 3, 0.02), sideM); s.position.set(sd * (W + 0.03), 0.28, (FRONT + BACK) / 2); s.castShadow = true; scene.add(s);
    const neon = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, FRONT - BACK), new THREE.MeshBasicMaterial({ color: new THREE.Color(...THEME.neon[sd < 0 ? 0 : 1]) }));
    neon.position.set(sd * (W + 0.001), 0.1, (FRONT + BACK) / 2); scene.add(neon);
  });
  const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 0.8), new THREE.MeshBasicMaterial({ map: backdropTex(), toneMapped: true })); backPanel.position.set(0, 0.38, BACK - 0.001); scene.add(backPanel);
  const slabM = new THREE.MeshPhysicalMaterial({ color: THEME.slab, roughness: 0.3, metalness: 0.4, clearcoat: 1 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W * 2, SLAB.y1 - SLAB.y0, SLAB.z1 - BACK), slabM); slab.position.set(0, (SLAB.y0 + SLAB.y1) / 2, (SLAB.z1 + BACK) / 2); slab.castShadow = slab.receiveShadow = true; scene.add(slab);
  const slabTop = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, SLAB.z1 - BACK), deckM); slabTop.rotation.x = -Math.PI / 2; slabTop.position.set(0, SLAB.y1 + 0.0005, (SLAB.z1 + BACK) / 2); slabTop.receiveShadow = true; scene.add(slabTop);
  const ledM = new THREE.MeshBasicMaterial({ color: new THREE.Color(...THEME.led) });
  const led = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.008, 0.004), ledM); led.position.set(0, SLAB.y0 + 0.03, SLAB.z1 + 0.002); scene.add(led);
  const scraper = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.12, SCRAPER.z1 - BACK), slabM); scraper.position.set(0, SCRAPER.y0 + 0.06, (SCRAPER.z1 + BACK) / 2); scraper.castShadow = true; scene.add(scraper);
  const led2 = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.008, 0.004), ledM); led2.position.set(0, SCRAPER.y0 + 0.02, SCRAPER.z1 + 0.002); scene.add(led2);
  const p1Mesh = new THREE.Mesh(new RoundedBoxGeometry((W - 0.003) * 2, P1.h, P1.d, 3, 0.008), chromeM); p1Mesh.castShadow = p1Mesh.receiveShadow = true; scene.add(p1Mesh);
  const p2Mesh = new THREE.Mesh(new RoundedBoxGeometry((W - 0.003) * 2, P2.h, P2.d, 3, 0.008), chromeM); p2Mesh.castShadow = p2Mesh.receiveShadow = true; scene.add(p2Mesh);
  const fwMeshes = FW.list.map(f => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, FW.len), new THREE.MeshPhysicalMaterial({ color: '#7fe8ff', emissive: '#1aa8ff', emissiveIntensity: 1.2, transparent: true, opacity: 0.75, roughness: 0.1 })); m.rotation.y = f.th; scene.add(m); return m; });
  // the tray in front catches the winnings
  const tray = new THREE.Mesh(new RoundedBoxGeometry(WIN * 2 + 0.04, 0.05, 0.16, 3, 0.02), goldM); tray.position.set(0, -0.17, FRONT + 0.09); tray.receiveShadow = true; scene.add(tray);
  const room = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshStandardMaterial({ color: THEME.room, side: THREE.BackSide })); room.position.y = 1; scene.add(room);
  // sign, marquee bulbs and the bonus lamp
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const redraw = (...a) => { g.clearRect(0, 0, w, h); draw(g, w, h, ...a); t.needsUpdate = true; }; redraw(); return { t, redraw }; };
  const sign = canvasTex(1024, 200, (g, w, h) => { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = THEME.signFont; const gr = g.createLinearGradient(0, 40, 0, 160); gr.addColorStop(0, THEME.signCols[0]); gr.addColorStop(1, THEME.signCols[1]); g.fillStyle = gr; g.shadowColor = THEME.signGlow; g.shadowBlur = 26; g.fillText(THEME.sign, w / 2, h / 2); });
  buildDecor();
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.12), new THREE.MeshBasicMaterial({ map: sign.t, transparent: true })); signM.position.set(0, 0.73, BACK + 0.005); scene.add(signM);
  const bulbs = []; for (let i = 0; i < 22; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })); b.position.set(-W + 0.02 + i * ((W * 2 - 0.04) / 21), 0.8, BACK + 0.01); scene.add(b); bulbs.push(b); }
  // ---------- the slot screen on the back wall: three reels, spun by the Lucky Gate ----------
  const SYM = ['COIN', 'GOLD', 'WALL', 'TOWER', 'STAR', 'JP', 'SEVEN', 'CLAW'];
  const STRIP = ['COIN', 'SEVEN', 'CLAW', 'WALL', 'COIN', 'TOWER', 'JP', 'GOLD', 'STAR', 'WALL', 'SEVEN', 'CLAW', 'TOWER', 'COIN'];
  function drawSym(g, sym, cx, cy, s) {
    g.save(); g.translate(cx, cy);
    const coin = (c1, c2, mark, mc) => { const gr = g.createRadialGradient(-s * 0.15, -s * 0.15, 2, 0, 0, s * 0.42); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s * 0.38, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, s * 0.31, 0, 7); g.stroke(); g.fillStyle = mc; g.font = `800 ${s * 0.36}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mark, 0, s * 0.03); };
    const choco = THEME.id === 'choco';
    if (sym === 'COIN' && THEME.id === 'retro') coin('#fff1b0', '#c8902a', '★', '#7a4a10');
    else if (sym === 'COIN') choco ? coin('#e8b48a', '#6b3a22', '♥', '#3b1d0e') : coin('#ffffff', '#8c8f9c', '♠', '#4a4c58');
    else if (sym === 'GOLD' && !choco) { g.fillStyle = '#f2c14e'; g.strokeStyle = '#8a5a12'; g.lineWidth = 4; g.beginPath(); g.moveTo(-s * 0.36, -s * 0.02); g.quadraticCurveTo(-s * 0.3, s * 0.22, 0, s * 0.24); g.quadraticCurveTo(s * 0.3, s * 0.22, s * 0.36, -s * 0.02); g.quadraticCurveTo(s * 0.18, s * 0.06, s * 0.12, -s * 0.06); g.quadraticCurveTo(0, -s * 0.3, -s * 0.12, -s * 0.06); g.quadraticCurveTo(-s * 0.18, s * 0.06, -s * 0.36, -s * 0.02); g.fill(); g.stroke(); }
    else if (sym === 'GOLD') coin('#fff1b0', '#c8902a', '♥', '#7a4a10');
    else if (sym === 'STAR' && !choco) coin('#ff8a8a', '#b8102a', '福', '#ffe08a');
    else if (sym === 'STAR') { g.fillStyle = '#ff4f9a'; g.beginPath(); g.ellipse(0, 0, s * 0.24, s * 0.2, 0, 0, 7); g.fill(); [-1, 1].forEach(e => { g.beginPath(); g.moveTo(e * s * 0.22, 0); g.lineTo(e * s * 0.42, -s * 0.16); g.lineTo(e * s * 0.42, s * 0.16); g.closePath(); g.fill(); }); g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, s * 0.1, 0, 5); g.stroke(); }
    else if (sym === 'WALL' && choco) { g.fillStyle = '#e8c08a'; [-1, 1].forEach(k => { g.save(); g.rotate(k * 0.4); g.fillRect(k * s * 0.15 - s * 0.06, -s * 0.34, s * 0.12, s * 0.68); g.strokeStyle = '#a0703a'; g.lineWidth = 2; for (let y = -0.3; y < 0.34; y += 0.08) { g.beginPath(); g.moveTo(k * s * 0.15 - s * 0.06, y * s); g.lineTo(k * s * 0.15 + s * 0.06, y * s); g.stroke(); } g.restore(); }); }
    else if (sym === 'TOWER' && choco) { [['#6b3a22', 0.22], ['#ffd0e6', 0.08], ['#6b3a22', -0.06], ['#ffd0e6', -0.2]].forEach(([c, y]) => { g.fillStyle = c; g.fillRect(-s * 0.3, y * s - s * 0.07, s * 0.6, s * 0.14); }); g.fillStyle = '#e3263a'; g.beginPath(); g.arc(0, -s * 0.32, s * 0.07, 0, 7); g.fill(); }
    else if (sym === 'STAR') { g.shadowColor = '#b26bff'; g.shadowBlur = 24; g.fillStyle = '#d9a8ff'; g.font = `800 ${s * 0.8}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', 0, s * 0.04); }
    else if (sym === 'JP') { g.fillStyle = THEME.id === 'choco' ? '#ff4f9a' : '#c8102e'; g.beginPath(); g.roundRect(-s * 0.4, -s * 0.3, s * 0.8, s * 0.6, s * 0.12); g.fill(); g.strokeStyle = '#ffd86a'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#ffe08a'; g.font = `900 ${s * 0.4}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('JP', 0, s * 0.02); }
    else if (sym === 'WALL') { g.fillStyle = '#4fc8ff'; g.shadowColor = '#4fc8ff'; g.shadowBlur = 12; [-1, 1].forEach(k => { g.save(); g.rotate(k * 0.5); g.fillRect(k * s * 0.16 - s * 0.05, -s * 0.34, s * 0.1, s * 0.68); g.restore(); }); }
    else if (sym === 'TOWER') { for (let i = 0; i < 6; i++) { const y = s * 0.3 - i * s * 0.11; g.fillStyle = i === 5 ? '#f2c14e' : '#d8dbe6'; g.beginPath(); g.ellipse(0, y, s * 0.24, s * 0.07, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.stroke(); } }
    else if (sym === 'CLAW') { g.strokeStyle = '#c9ced8'; g.lineWidth = s * 0.05; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -s * 0.4); g.lineTo(0, -s * 0.12); g.stroke(); g.fillStyle = THEME.accent || '#ff4fa0'; g.beginPath(); g.roundRect(-s * 0.12, -s * 0.16, s * 0.24, s * 0.12, 4); g.fill(); [-1, 0, 1].forEach(k => { g.beginPath(); g.moveTo(k * s * 0.06, -s * 0.04); g.quadraticCurveTo(k * s * 0.28, s * 0.12, k * s * 0.12, s * 0.3); g.stroke(); }); }
    else if (sym === 'SEVEN') { g.fillStyle = '#ff3b4e'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.font = `900 ${s * 0.7}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText('7', 0, s * 0.04); g.fillText('7', 0, s * 0.04); }
    g.restore();
  }
  const reels = [0, 1, 2].map(i => ({ p: i * 4 + 1, v: 0, state: 'idle', target: 0, from: 0, to: 0, t: 0, stopAt: 0, dur: 0.4 }));
  const slot = { active: false, t: 0, out: null, reach: false, flash: 0, msg: null };
  const lamp = canvasTex(768, 300, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, THEME.screen[0]); bg.addColorStop(1, THEME.screen[1]); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const RW = 220, RH = 200, gap = 16, x0 = (w - RW * 3 - gap * 2) / 2, y0 = 16;
    reels.forEach((r, i) => {
      const x = x0 + i * (RW + gap);
      g.save(); g.beginPath(); g.roundRect(x, y0, RW, RH, 14); g.clip();
      g.fillStyle = '#fdf8ee'; g.fillRect(x, y0, RW, RH);
      const base = Math.floor(r.p), frac = r.p - base;
      for (let k = -1; k <= 2; k++) { const sym = STRIP[((base + k) % STRIP.length + STRIP.length) % STRIP.length]; drawSym(g, sym, x + RW / 2, y0 + RH / 2 + (k - frac) * 150, 150); }
      const sh = g.createLinearGradient(0, y0, 0, y0 + RH); sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(0.25, 'rgba(0,0,0,0)'); sh.addColorStop(0.75, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = sh; g.fillRect(x, y0, RW, RH);
      g.restore();
      const hot = slot.reach && i === 2 && r.state !== 'idle' && Math.floor(slot.flash * 8) % 2 === 0;
      g.strokeStyle = hot ? '#ff4d6d' : '#c99a2e'; g.lineWidth = hot ? 9 : 6; g.beginPath(); g.roundRect(x, y0, RW, RH, 14); g.stroke();
    });
    g.strokeStyle = 'rgba(255,60,80,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 - 8, y0 + RH / 2); g.lineTo(w - x0 + 8, y0 + RH / 2); g.stroke();
    // caption, or a full-screen message
    const m = slot.msg;
    if (m) {
      g.fillStyle = 'rgba(10,2,8,.78)'; g.fillRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = m.col; g.shadowColor = m.col; g.shadowBlur = 24;
      g.font = /[一-鿿]/.test(m.big) ? '900 92px "PingFang SC", "Microsoft YaHei", sans-serif' : '800 92px "Share Tech Mono", ui-monospace, monospace'; g.fillText(m.big, w / 2, h * 0.42);
      g.shadowBlur = 0; g.fillStyle = '#ffe9c4'; g.font = '700 36px "Libre Franklin", "PingFang SC", sans-serif'; g.fillText(m.small || '', w / 2, h * 0.78);
    } else {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = slot.reach ? '#ff8095' : '#ffd36a'; g.font = '700 30px "Libre Franklin", "PingFang SC", sans-serif';
      g.fillText(slot.active ? tr(slot.reach ? 'REACH!' : 'Good luck…') : `${tr('LUCKY GATE')} · ${tr('drop a coin through the ring')}`, w / 2, 255);
    }
  });
  // lamp.redraw(big, small, colour) shows a message on the screen; lamp.redraw() goes back to the reels
  const lampRedraw = lamp.redraw;
  lamp.redraw = (big, small, col = '#ffd36a') => { slot.msg = big ? { big, small, col } : null; lampRedraw(); };
  const lampM = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.18), new THREE.MeshBasicMaterial({ map: lamp.t, toneMapped: false })); lampM.position.set(0, 0.555, BACK + 0.005); scene.add(lampM);
  const lampFrame = new THREE.Mesh(new RoundedBoxGeometry(0.49, 0.21, 0.01, 3, 0.008), new THREE.MeshStandardMaterial({ color: THEME.frame, metalness: THEME.id === 'choco' ? 0.3 : 1, roughness: 0.3 })); lampFrame.position.set(0, 0.555, BACK - 0.002); scene.add(lampFrame);
  // the lucky gate: a glowing ring that slides across under the coin chute
  const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.4) });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.005, 10, 40), ringM); ring.rotation.x = -Math.PI / 2; ring.position.set(0, GATE_Y, DROP.z); scene.add(ring);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.62, 8), goldM); rail.rotation.z = Math.PI / 2; rail.position.set(0, GATE_Y, DROP.z - 0.04); scene.add(rail);
  const chute = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.05, 28, 1, true), goldM); chute.add(tube);
  const tubeRim = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.004, 8, 28), goldM); tubeRim.rotation.x = Math.PI / 2; tubeRim.position.y = -0.025; chute.add(tubeRim);
  chute.position.set(0, DROP.y + 0.03, DROP.z); scene.add(chute);
  const aimDot = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 32), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.6, depthWrite: false })); aimDot.rotation.x = -Math.PI / 2; scene.add(aimDot);
  let aimX = 0;

  // ---------- coin looks: reeded edge, embossed faces ----------
  const faceTex = (base, hi, lo, mark) => canvasTex(256, 256, g => {
    const gr = g.createRadialGradient(110, 100, 10, 128, 128, 130); gr.addColorStop(0, hi); gr.addColorStop(1, base); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = lo; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
    g.strokeStyle = hi; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 96, 0, 7); g.stroke();
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; g.fillStyle = lo; g.beginPath(); g.arc(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104, 2.5, 0, 7); g.fill(); }
    g.fillStyle = lo; g.font = '700 120px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mark, 130, 136);
    g.fillStyle = hi; g.fillText(mark, 126, 130);
  }).t;
  const edgeTex = canvasTex(256, 8, g => { for (let i = 0; i < 64; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#555555'; g.fillRect(i * 4, 0, 4, 8); } }).t; edgeTex.colorSpace = THREE.NoColorSpace;
  const coinMats = (base, hi, lo, mark, metal, emis) => {
    const f = faceTex(base, hi, lo, mark);
    const face = new THREE.MeshStandardMaterial({ map: f, bumpMap: f, bumpScale: 2, metalness: metal, roughness: 0.32, envMapIntensity: 0.55, emissive: emis || '#000000', emissiveIntensity: emis ? 0.25 : 0 });
    const edge = new THREE.MeshStandardMaterial({ color: hi, bumpMap: edgeTex, bumpScale: 1.5, metalness: metal, roughness: 0.36, envMapIntensity: 0.55, emissive: emis || '#000000', emissiveIntensity: emis ? 0.25 : 0 });
    return [edge, face, face];
  };
  const coinGeo = new THREE.CylinderGeometry(R, R, TH, 32);
  const silverI = new THREE.InstancedMesh(coinGeo, coinMats(...THEME.silver), INST);
  const goldI = new THREE.InstancedMesh(coinGeo, coinMats(...THEME.gold), INST);
  const starI = new THREE.InstancedMesh(coinGeo, coinMats(...THEME.collect.coin), 40);
  [silverI, goldI, starI].forEach(m => { m.castShadow = true; m.receiveShadow = true; m.count = 0; m.frustumCulled = false; scene.add(m); });

  // ---------- sparkles ----------
  const NP = 600, pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), parts = [];
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const sparkTex = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,230,160,.8)'); gr.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }).t;
  const sparks = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.018, map: sparkTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sparks.frustumCulled = false; scene.add(sparks);
  function burst(x, y, z, n, spread = 0.6, color = [1, 0.8, 0.35]) {
    for (let i = 0; i < n && parts.length < NP; i++) {
      const a = Math.random() * Math.PI * 2, s = spread * (0.3 + Math.random());
      parts.push({ x, y, z, vx: Math.cos(a) * s * 0.5, vy: Math.random() * s + 0.2, vz: Math.sin(a) * s * 0.5, life: 0.6 + Math.random() * 0.6, c: color });
    }
  }
  function stepSparks(dt) {
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.vy -= 2.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
    for (let i = 0; i < NP; i++) {
      const p = parts[i];
      if (p) { pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z; const f = Math.min(1, p.life / 0.5) * (0.7 + Math.random() * 0.6); pCol[i * 3] = p.c[0] * f; pCol[i * 3 + 1] = p.c[1] * f; pCol[i * 3 + 2] = p.c[2] * f; }
      else { pPos[i * 3 + 1] = -9; }
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }

  // ---------- sound: coin clinks by how hard they land ----------
  let actx = null, clinkBudget = 0;
  const audio = () => { if (!UI.soundOn()) return null; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { return null; } return actx; };
  function clink(strength, low) {
    const a = audio(); if (!a || clinkBudget < 1) return; clinkBudget--;
    const t = a.currentTime, vol = Math.min(0.12, 0.02 + strength * 0.04), f0 = (low ? 1500 : 2600) + Math.random() * 1600;
    [1, 1.47, 2.09].forEach((m, i) => { const o = a.createOscillator(), gn = a.createGain(); o.type = 'sine'; o.frequency.value = f0 * m; gn.gain.setValueAtTime(vol / (i + 1), t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + Math.random() * 0.08 + (low ? 0.15 : 0)); o.connect(gn).connect(a.destination); o.start(t); o.stop(t + 0.35); });
  }
  function fanfare(big) {
    const a = audio(); if (!a) return; const t = a.currentTime;
    (big ? [523, 659, 784, 1047, 1319, 1568] : [659, 784, 1047]).forEach((f, i) => { const o = a.createOscillator(), gn = a.createGain(); o.type = 'triangle'; o.frequency.value = f; gn.gain.setValueAtTime(0.0001, t + i * 0.08); gn.gain.exponentialRampToValueAtTime(0.09, t + i * 0.08 + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.4); o.connect(gn).connect(a.destination); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.45); });
  }
  function beep(f) { const a = audio(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), gn = a.createGain(); o.type = 'square'; o.frequency.value = f; gn.gain.setValueAtTime(0.03, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o.connect(gn).connect(a.destination); o.start(t); o.stop(t + 0.06); }

  // ---------- money and the on-screen counters ----------
  let pending = 0, dropped = 0, won = 0, drops = 0, shown = 0, sim = null;
  const flush = () => { if (pending) { UI.wallet.add(pending); pending = 0; } };
  setInterval(flush, 1500); window.addEventListener('pagehide', flush);
  const info = () => { $('#pzInfo').innerHTML = `Dropped <b>${dropped}</b> · Won <b>${Math.round(shown)}</b>`; };
  const popWrap = document.createElement('div'); popWrap.className = 'pz-pops'; host.appendChild(popWrap);
  function pop(text, cls = '') { const p = document.createElement('div'); p.className = 'pz-pop ' + cls; p.textContent = text; popWrap.appendChild(p); setTimeout(() => p.remove(), 1600); }
  const banner = document.createElement('div'); banner.className = 'pz-banner'; banner.hidden = true; banner.setAttribute('role', 'status'); host.appendChild(banner);
  let bannerT = 0;
  function showBanner(big, small) { banner.innerHTML = `<b>${big}</b>${small ? `<span>${small}</span>` : ''}`; banner.hidden = false; banner.classList.remove('go', 'hold'); void banner.offsetWidth; banner.classList.add('go'); clearTimeout(bannerT); bannerT = setTimeout(() => { banner.hidden = true; }, 2200); }
  function bannerHold(ms) { banner.classList.add('hold'); clearTimeout(bannerT); bannerT = setTimeout(() => { banner.hidden = true; banner.classList.remove('hold'); }, ms); }
  let shake = 0;
  // ---------- the super jackpot: three star coins in the tray release a flood of coins ----------
  // About one coin in 220 is a purple star coin. Each one pushed into the paying tray lights a star; the third
  // star releases the jackpot. The jackpot starts at 40 coins and grows by one for every 12 coins dropped (up to 180).
  const JKEY = 'ol-pz-jp', STAR_P = 1 / 220, JP_BASE = 25, JP_EVERY = 16, JP_MAX = 160;
  let JP = (() => { try { const v = JSON.parse(localStorage.getItem(JKEY) || 'null'); if (v && Number.isFinite(v.stars) && Number.isFinite(v.since)) return v; } catch (e) { /* default */ } return { stars: 0, since: 0 }; })();
  const jpSize = () => Math.min(JP_MAX, JP_BASE + Math.floor(JP.since / JP_EVERY));
  const saveJP = () => { if (!sim) try { localStorage.setItem(JKEY, JSON.stringify(JP)); } catch (e) { /* ignore */ } };
  const meter = document.createElement('div'); meter.className = 'pz-jp'; meter.setAttribute('role', 'status'); host.appendChild(meter);
  function paintMeter(flash) {
    meter.innerHTML = `<small>JP</small><b class="pz-pot">${Math.round(JP.pot || 500).toLocaleString('en-US')}</b><i class="pz-sep"></i><small>${tr(THEME.superName)}</small><span class="pz-stars">${[0, 1, 2].map(i => `<i class="${i < JP.stars ? 'on' : ''}">${THEME.collect.glyph}</i>`).join('')}</span><b>${jpSize()}</b><small>${tr('coins')}</small>`;
    meter.title = tr({ macau: 'Push 3 red lucky coins into the tray to win the golden dragon jackpot.', choco: 'Push 3 pink candy coins into the tray to win the chocolate fountain jackpot.', retro: 'Push 3 cyan neon coins into the tray to win the hyper drive jackpot.' }[THEME.id]);
    if (flash) { meter.classList.remove('flash'); void meter.offsetWidth; meter.classList.add('flash'); }
  }
  let lastPot = -1;
  function paintMeterPot() { const p = Math.round(JP.pot || 500); if (p !== lastPot) { lastPot = p; const el = meter.querySelector('.pz-pot'); if (el) el.textContent = p.toLocaleString('en-US'); } }
  function starIn(x, z) {
    JP.stars++;
    if (sim) { sim.stars = (sim.stars || 0) + 1; if (JP.stars >= 3) superJackpot(); return; }
    burst(x, 0, z, 60, 1.1, THEME.collect.col); fanfare(false); pop(`${THEME.collect.glyph} ${JP.stars} / 3`, 'star');
    if (JP.stars >= 3) setTimeout(superJackpot, 900); else { saveJP(); paintMeter(true); }
  }
  let superT = 0;
  function superJackpot() {
    const n = jpSize();
    JP = { stars: 0, since: 0 }; saveJP();
    wallUp = Math.max(wallUp, 25);
    setTimeout(() => toppleTower(), sim ? 0 : 1500);
    // the flood: waves of silver coins across both decks, with a gold coin now and then
    const base = rainQ.length ? rainQ[rainQ.length - 1].at : 0;
    for (let i = 0; i < n; i++) rainQ.push({ at: base + 0.4 + i * 0.03 + Math.floor(i / 30) * 0.5, gold: i % 25 === 24, wide: true });
    if (sim) { sim.super = (sim.super || 0) + 1; sim.superCoins = (sim.superCoins || 0) + n; return; }
    superT = 4 + n * 0.03 + Math.floor(n / 30) * 0.5;
    showBanner(tr(THEME.superName) + '!', `${n} ${tr('coins')}`); bannerHold(5000);
    lamp.redraw(tr(THEME.superName) + '!', `${n} ${tr('coins')}`, THEME.id === 'macau' ? '#ffd24a' : '#ff8fc4');
    fanfare(true); setTimeout(() => fanfare(true), 700); shake = 2; voice(...THEME.voice.super);
    if (extras) extras.beaconOn(8);
    if (THEME.superFx === 'dragon') fxDragon(); else if (THEME.superFx === 'laser') fxLaser(); else fxWaterfall();
    window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'pusher-bonus', k: 'super', n } }));
    paintMeter(true);
    setTimeout(() => { if (!slot.active && !wheel.active) lamp.redraw(); }, 9000);
  }
  function payout(c, x, z) {
    if (c.star) starIn(x, z);
    const v = COIN * (c.gold ? GOLD : 1);
    if (sim) { sim.won += v; sim.mid = (sim.mid || 0) + 1; if (c.gold) sim.goldOut = (sim.goldOut || 0) + 1; return; }
    pending += v; won += v;
    window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'pusher-win', v, gold: c.gold } }));
    burst(x, -0.02, z, c.gold ? 40 : 10, c.gold ? 0.9 : 0.5, c.gold ? [1.2, 0.85, 0.3] : [0.9, 0.9, 1]);
    clink(1, true);
    if (c.gold) { pop('+' + v, 'gold'); fanfare(false); shake = Math.max(shake, 0.6); } else pop('+' + v);
  }

  let last = 0;
  function drop(free) {
    if (!free) {
      if (UI.wallet.chips + pending < COIN) { $('#pzInfo').textContent = 'Not enough chips. Claim your daily chips at the top.'; auto = false; paintAuto(); return; }
      if (performance.now() - last < 220 || coins.length >= MAXC) return;
      last = performance.now();
      pending -= COIN; dropped += COIN; drops++;
    }
    const gold = drops % 20 === 0, star = !gold && Math.random() < STAR_P;
    if (!free || sim) { JP.since++; JP.pot = Math.min(5000, (JP.pot || JP_POT0) + 0.1); if (!sim && JP.since % JP_EVERY === 0) { saveJP(); paintMeter(); } towerDrops++; if (towerDrops % TOWER_EVERY === 0) growTower();
      prizeDrops++; if (extras && prizeDrops % PRIZE_EVERY === 0) extras.dropPrize(aimX + (Math.random() - 0.5) * 0.1);
      if (prizeDrops % 90 === 0 && towers.filter(t => !t.main).length < 2) buildTower((Math.random() - 0.5) * 0.4, 0.14 + Math.random() * 0.1, 0, false); }
    const c = addCoin(aimX + (Math.random() - 0.5) * 0.006, DROP.y, DROP.z + (Math.random() - 0.5) * 0.01, gold, { gate: true, vy: -0.4, star });
    if (c && star && !sim) { burst(c.body.translation().x, DROP.y, DROP.z, 25, 0.5, THEME.collect.col); pop(tr({ macau: 'LUCKY COIN!', choco: 'CANDY COIN!', retro: 'NEON COIN!' }[THEME.id]), 'star'); }
    if (c && !sim) { beep(1800); info(); document.body.classList.add('pz-played'); window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'pusher-drop' } })); }
  }

  // ---------- the bonus lamp ----------
  const BONUS = [
    { k: 'shower', sym: 'COIN', p: 0.13, big: 'COIN SHOWER', small: '6 free coins' },
    { k: 'claw', sym: 'CLAW', p: 0.12, big: 'CLAW GRAB', small: 'the claw picks up a prize' },
    { k: 'topple', sym: 'TOWER', p: 0.07, big: 'TOWER FALL', small: 'the coin tower comes down' },
    { k: 'walls', sym: 'WALL', p: 0.14, big: 'FUNNEL WALLS', small: 'walls guide the corners in for 15 seconds' },
    { k: 'star', sym: 'STAR', p: 0.015, big: 'STAR!', small: 'a star toward the super jackpot' },
    { k: 'jp', sym: 'JP', p: 0.03, big: 'JP CHANCE', small: 'the ball decides' },
    { k: 'none', sym: null, p: 1, big: 'SO CLOSE', small: 'try the gate again' },
  ];
  let gateReady = 0;
  const GATE_CD = 14;   // seconds the gate needs to recharge after a bonus
  const rainQ = [], towers = [];
  // a coin tower: coins stacked flat, one on top of the other, on the deck just in front of the lower pusher.
  // Each coin is placed exactly level with a hair of space under it and starts asleep, so the stack stands still
  // until the pusher (or a falling coin) touches it; then it wakes and topples.
  // ---------- coin towers ----------
  // A tall stack of thin discs is hard for any physics engine to keep standing coin by coin, so a tower is one
  // rigid column (it slides, wobbles and tips as a whole, like a real stacked tower) that bursts into its separate
  // coins once it leans past about 25 degrees or goes over the edge. It is drawn coin by coin all along.
  // It stands on the bare deck: the coins lying where it goes are taken into the tower (none are lost).
  const UPV = new THREE.Vector3(0, 1, 0);
  const tRing = new THREE.Mesh(new THREE.RingGeometry(R * 1.25, R * 1.6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.5), transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  tRing.rotation.x = -Math.PI / 2; tRing.visible = false; scene.add(tRing);
  const tLabel = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); sp.scale.set(0.15, 0.056, 1); sp.visible = false; scene.add(sp); let last = -1; sp.userData.set = n => { if (n === last) return; last = n; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 96); g.fillStyle = 'rgba(20,6,10,.85)'; g.beginPath(); g.roundRect(6, 6, 244, 84, 42); g.fill(); g.strokeStyle = '#f2c14e'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#ffe08a'; g.font = '800 50px "Libre Franklin", "PingFang SC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${n} ${tr('high')}`, 128, 50); t.needsUpdate = true; }; return sp; })();
  function buildTower(x0, z0, h, main = true) {
    const near = (p, x, z) => p.y < 0.08 && p.y > -0.01 && (p.x - x) ** 2 + (p.z - z) ** 2 < (R * 2.2) ** 2;
    let best = null;
    for (let k = 0; k < 12; k++) {
      const x = Math.max(-W + 0.06, Math.min(W - 0.06, x0 + (k ? (Math.random() - 0.5) * 0.14 : 0))), z = Math.max(0.05, Math.min(FRONT - 0.09, z0 + (k ? (Math.random() - 0.5) * 0.08 : 0)));
      if (towers.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (R * 3) ** 2)) continue;
      let n = 0; for (const c of coins) if (near(c.body.translation(), x, z)) n++;
      if (!best || n < best.n) best = { x, z, n };
    }
    if (!best) return;
    const { x, z } = best;
    let taken = 0, gold = 0, spill = 0;
    for (let i = coins.length - 1; i >= 0; i--) { const c = coins[i]; if (!c.star && !c.held && near(c.body.translation(), x, z)) { if (taken < (main ? 6 : 9)) { taken++; if (c.gold) gold++; } else spill++; removeCoin(i); } }
    // coins beyond the first few drop back onto the pile around the tower (none are lost)
    for (let i = 0; i < spill; i++) { const a = Math.random() * Math.PI * 2, r = R * (2.6 + Math.random() * 1.5); addCoin(Math.max(-W + R, Math.min(W - R, x + Math.cos(a) * r)), 0.08 + i * 0.012, Math.min(FRONT - 0.02, z + Math.sin(a) * r), false, { tumble: 1 }); }
    const n = Math.min(TOWER_MAX, h + taken);
    if (n < 4) { return; }
    const golds = new Set([n - 1]); for (let i = 0; i < gold; i++) golds.add(i);
    towers.push({ x, z, n, shown: 0, t: 0, body: null, golds: main ? golds : new Set(gold ? [n - 1] : []), yaws: Array.from({ length: n }, () => Math.random() * 6), born: tp, main });
  }
  // the column goes into the physics once it is fully built
  const PRIZE_EVERY = 40;
  const TOWER_EVERY = 18, TOWER_START = 10, TOWER_MAX = 40;
  let towerDrops = 0, rebuildAt = 0;
  const mainTower = () => towers.find(T => T.main && T.body && !T.free) || null;
  function setColumn(T) {
    // (re)make the column's collider for its current height, keeping its foot on the deck
    if (T.col) world.removeCollider(T.col, false);
    const hh = T.n * TH / 2, p = T.body.translation(), dy = hh - (T.hh || hh);
    T.col = world.createCollider(RAPIER.ColliderDesc.roundCylinder(hh - 0.002, R - 0.002, 0.002).setDensity(8).setFriction(0.18).setRestitution(0.02), T.body);
    if (dy) T.body.setTranslation({ x: p.x, y: p.y + dy, z: p.z }, true);
    T.hh = hh;
  }
  // one more coin lands on top of the tower; at the top height it comes down by itself
  function growTower() {
    const T = mainTower(); if (!T) return;
    if (T.n >= TOWER_MAX) { toppleTower(); return; }
    T.n++; T.yaws.push(Math.random() * 6); T.golds.delete(T.n - 2); if (T.n % 10 === 0) T.golds.add(T.n - 1);
    setColumn(T); saveTower();
    if (!sim) { const p = T.body.translation(); burst(p.x, p.y + T.hh, p.z, 8, 0.3); clink(0.8); }
  }
  // push the tower over: it tips toward the front edge and bursts into its coins
  function toppleTower() {
    const T = mainTower(); if (!T) return false;
    T.free = true; T.body.setEnabledRotations(true, true, true, true);
    T.body.setAngvel({ x: 3.2, y: 0, z: (Math.random() - 0.5) * 1.2 }, true);
    T.body.setLinvel({ x: 0, y: 0.05, z: 0.15 }, true);
    if (!sim) { showBanner(tr('TOWER FALL'), `${T.n} ${tr('coins')}`); fanfare(true); shake = Math.max(shake, 0.8); voice(...THEME.voice.tower); }
    return true;
  }
  const saveTower = () => { const T = mainTower(); JP.tower = T ? { n: T.n, x: +T.body.translation().x.toFixed(3), z: +T.body.translation().z.toFixed(3) } : null; saveJP(); };
  function raiseTower(T) {
    const hh = T.n * TH / 2;
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(T.x, hh + 0.0005, T.z).setLinearDamping(0.5).setAngularDamping(1.5).setCcdEnabled(true));
    b.setEnabledRotations(false, true, false, true);   // it stays upright while it slides across the deck
    T.body = b; T.hh = hh; setColumn(T); saveTower();
  }
  const tq = new THREE.Quaternion(), tv = new THREE.Vector3(), tl = new THREE.Vector3();
  function towerCoinPose(T, i, outP, outQ) {
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UPV, T.yaws[i]);
    if (!T.body) { outP.set(T.x, TH / 2 + i * TH, T.z); outQ.copy(yawQ); return; }
    const p = T.body.translation(), q = T.body.rotation();
    tq.set(q.x, q.y, q.z, q.w);
    tl.set(0, -T.hh + TH / 2 + i * TH, 0).applyQuaternion(tq);
    outP.set(p.x + tl.x, p.y + tl.y, p.z + tl.z); outQ.copy(tq).multiply(yawQ);
  }
  // the tower bursts into its coins, each moving the way the tower was moving
  function breakTower(k) {
    const T = towers[k], v = T.body.linvel(), w = T.body.angvel(), p0 = T.body.translation();
    const P = new THREE.Vector3(), Q = new THREE.Quaternion();
    const parts = [];
    for (let i = 0; i < T.n; i++) { towerCoinPose(T, i, P, Q); parts.push([P.clone(), Q.clone()]); }
    world.removeRigidBody(T.body); towers.splice(k, 1);
    if (T.main && !towers.some(t => t.main && !t.free)) { rebuildAt = tp + 6; JP.tower = null; saveJP(); }
    parts.forEach(([pp, qq], i) => {
      // velocity of this point of the spinning column, plus a little scatter
      const rx = pp.x - p0.x, ry = pp.y - p0.y, rz = pp.z - p0.z;
      const c = addCoin(pp.x, pp.y, pp.z, T.golds.has(i), { q: qq, vx: v.x + (w.y * rz - w.z * ry) + (Math.random() - 0.5) * 0.08, vy: v.y + (w.z * rx - w.x * rz) + 0.02, vz: v.z + (w.x * ry - w.y * rx) + (Math.random() - 0.5) * 0.08 });
      if (c) c.body.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 }, true);
    });
    if (!sim) { burst(p0.x, p0.y, p0.z, 40, 0.8, [1.2, 0.9, 0.4]); clink(2, true); clink(1.5); shake = Math.max(shake, 0.5); pop(tr('TOWER DOWN!'), 'gold'); }
  }
  // ---------- spinning the slot: the result is picked first, then the reels are steered onto it ----------
  function spinSlot(out) {
    let syms;
    if (out.sym) syms = [out.sym, out.sym, out.sym];
    else {
      // a miss: sometimes the first two match and the last reel keeps you waiting ("reach")
      const pick = () => SYM[Math.floor(Math.random() * SYM.length)];
      if (Math.random() < 0.35) { const a = SYM[Math.floor(Math.random() * 6)]; let c; do c = pick(); while (c === a); syms = [a, a, c]; }
      else { do syms = [pick(), pick(), pick()]; while (syms[0] === syms[1] && syms[1] === syms[2]); }
    }
    slot.active = true; slot.t = 0; slot.out = out; slot.msg = null; slot.reach = syms[0] === syms[1];
    reels.forEach((r, i) => { r.state = 'spin'; r.v = 16 + i * 2; r.target = syms[i]; r.stopAt = slot.reach && i === 2 ? 3.8 : 0.9 + i * 0.5; r.dur = slot.reach && i === 2 ? 1.1 : 0.45; });
  }
  function stepSlot(dt) {
    if (!slot.active) return;
    slot.t += dt; slot.flash += dt;
    let moving = false;
    reels.forEach((r, i) => {
      if (r.state === 'spin') {
        r.p += r.v * dt * (slot.reach && i === 2 && slot.t > 2.3 ? 0.45 : 1);
        if (slot.t >= r.stopAt) {
          // stop on the next copy of the target symbol a little ahead
          let k = Math.ceil(r.p) + 2; while (STRIP[k % STRIP.length] !== r.target) k++;
          r.from = r.p; r.to = k; r.t = 0; r.state = 'stop';
        }
        moving = true;
      } else if (r.state === 'stop') {
        r.t += dt; const q = Math.min(1, r.t / r.dur), e = 1 + 2.2 * Math.pow(q - 1, 3) + 1.2 * Math.pow(q - 1, 2);   // ease out, a little overshoot
        r.p = r.from + (r.to - r.from) * e;
        if (q >= 1) { r.p = r.to % STRIP.length; r.state = 'idle'; clink(0.8, true); if (i === 1 && slot.reach) { beep(700); beep(1400); } }
        moving = true;
      }
    });
    if (slot.reach && reels[2].state === 'spin' && Math.floor(slot.t * 4) !== Math.floor((slot.t - dt) * 4)) beep(500 + (slot.t % 1) * 600);
    if (!moving && slot.out) { const out = slot.out; slot.out = null; setTimeout(() => { slot.active = false; slot.reach = false; applyBonus(out); }, 350); }
    lampRedraw();
  }

  // ---------- the JP wheel: drops in front of the back wall, a ball runs round and settles in a pocket ----------
  const POCKETS = ['JP', '15', '30', 'STAR', '15', 'TOWER', '30', '15', 'STAR', '30', '15', 'TOWER'];
  const SEC = Math.PI * 2 / POCKETS.length;
  const wheelTex = canvasTex(512, 512, g => {
    const c = 256;
    POCKETS.forEach((pk, k) => {
      const a0 = k * SEC, a1 = a0 + SEC;
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, 250, -a1, -a0); g.closePath();
      const WC = THEME.wheel; g.fillStyle = pk === 'JP' ? WC.jp : pk === 'STAR' ? WC.star : pk === 'TOWER' ? WC.tower : k % 2 ? WC.a : WC.b; g.fill();
      g.strokeStyle = WC.rim; g.lineWidth = 3; g.stroke();
      g.save(); g.translate(c, c); g.rotate(-(a0 + SEC / 2)); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = pk === 'JP' ? THEME.wheel.jpText : THEME.wheel.text; g.font = pk === 'JP' ? '900 54px Arial' : pk === 'STAR' ? '900 46px "PingFang SC", Arial' : '800 40px Arial';
      g.fillText(pk === 'STAR' ? THEME.collect.glyph : pk === 'TOWER' ? 'T+10' : pk, 175, 0); g.restore();
    });
    g.beginPath(); g.arc(c, c, 92, 0, 7); g.fillStyle = THEME.wheel.hub; g.fill(); g.strokeStyle = THEME.wheel.rim; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#ffd86a'; g.font = '900 52px "PingFang SC", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(THEME.id === 'macau' ? '發' : 'JP', c, c);
  });
  const wheel = { active: false, t: 0, T: 5.2, g: new THREE.Group(), disc: null, ball: null, th0: 0, th1: 0, ph0: 0, ph1: 0, k: 0, y: 1.3 };
  wheel.disc = new THREE.Mesh(new THREE.CircleGeometry(0.15, 64), new THREE.MeshBasicMaterial({ map: wheelTex.t, toneMapped: false }));
  const wrim = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.008, 12, 80), goldM);
  wheel.ball = new THREE.Mesh(new THREE.SphereGeometry(0.011, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.2, 1.6) }));
  const wback = new THREE.Mesh(new THREE.CircleGeometry(0.17, 64), new THREE.MeshStandardMaterial({ color: '#12040a', roughness: 0.4, metalness: 0.5 })); wback.position.z = -0.004;
  wheel.g.add(wback, wheel.disc, wrim, wheel.ball); wheel.g.position.set(0, wheel.y, -0.47); wheel.g.visible = false; scene.add(wheel.g);
  wheel.ball.position.z = 0.012;
  // the JP pot, in chips: starts at 500 and grows a little with every coin
  const JP_POT0 = 500;
  if (!Number.isFinite(JP.pot)) JP.pot = JP_POT0;
  function jpChance() {
    const k = Math.floor(Math.random() * POCKETS.length);
    if (sim) { jpResult(POCKETS[k]); return; }
    wheel.active = true; wheel.t = 0; wheel.k = k; wheel.g.visible = true;
    wheel.th0 = wheel.disc.rotation.z; wheel.th1 = wheel.th0 + Math.PI * 2 * (3 + Math.random());
    // the ball ends in pocket k, running the other way round a few times on the way
    const pocket = wheel.th1 + (k + 0.5) * SEC;
    wheel.ph0 = Math.PI / 2; let ph1 = pocket; while (ph1 > wheel.ph0 - Math.PI * 2 * 5) ph1 -= Math.PI * 2; wheel.ph1 = ph1;
    wheel.last = -1;
  }
  function stepWheel(dt) {
    if (!wheel.g.visible) return;
    const W2 = wheel;
    if (W2.active) {
      W2.t += dt;
      const q = Math.min(1, W2.t / W2.T), e = 1 - Math.pow(1 - q, 3);
      W2.y += (0.5 - W2.y) * Math.min(1, dt * 5);
      W2.disc.rotation.z = W2.th0 + (W2.th1 - W2.th0) * e;
      const eb = 1 - Math.pow(1 - q, 2.4), ph = W2.ph0 + (W2.ph1 - W2.ph0) * eb;
      const r = q < 0.72 ? 0.138 : 0.138 - (q - 0.72) / 0.28 * 0.03 + Math.abs(Math.sin(q * 40)) * 0.006 * (1 - q);
      W2.ball.position.set(Math.cos(ph) * r, Math.sin(ph) * r, 0.012);
      const sector = Math.floor(((ph - W2.disc.rotation.z) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / SEC);
      if (sector !== W2.last) { W2.last = sector; if (q < 0.97) beep(1600 + q * 900); }
      if (q >= 1) { W2.active = false; W2.hold = 2.2; const pk = POCKETS[W2.k]; jpResult(pk); }
    } else {
      // keep the ball in its pocket while the wheel shows the result, then lift the wheel away
      const ph = W2.disc.rotation.z + (W2.k + 0.5) * SEC; W2.ball.position.set(Math.cos(ph) * 0.108, Math.sin(ph) * 0.108, 0.012);
      W2.hold -= dt; if (W2.hold < 0) { W2.y += (1.3 - W2.y) * Math.min(1, dt * 4); if (W2.y > 1.25) W2.g.visible = false; }
    }
    W2.g.position.y = W2.y;
  }
  function jpResult(pk) {
    const rain = (n, gold) => { const base = rainQ.length ? rainQ[rainQ.length - 1].at : 0; for (let i = 0; i < n; i++) rainQ.push({ at: base + (i + 1) * 0.06, gold, wide: n > 20 }); };
    if (sim) sim['jp_' + pk] = (sim['jp_' + pk] || 0) + 1;
    if (pk === 'JP') {
      const pot = Math.round(JP.pot);
      JP.pot = JP_POT0; saveJP();
      if (sim) { sim.won += pot; rain(30, false); return; }
      pending += pot; won += pot; rain(30, false); rain(3, true);
      showBanner(`${tr('JACKPOT!')} +${pot}`, tr('the whole pot is yours')); bannerHold(4500);
      lamp.redraw(tr('JACKPOT!'), `+${pot} ${tr('chips')}`, '#ff5a7a');
      fanfare(true); setTimeout(() => fanfare(true), 600); shake = 1.8; voice(...THEME.voice.jp);
      if (extras) extras.beaconOn(6);
      if (THEME.jpFx === 'firecrackers') fxFirecrackers(); else if (THEME.jpFx === 'neon') fxNeon(); else fxSprinkles();
      window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'pusher-bonus', k: 'jackpot', pot } }));
      paintMeter(true);
    } else if (pk === 'STAR') {
      JP.stars++; if (JP.stars >= 3) { if (sim) superJackpot(); else setTimeout(superJackpot, 1500); } else { saveJP(); if (!sim) paintMeter(true); }
      if (!sim) { showBanner(THEME.collect.glyph, tr('a star toward the super jackpot')); lamp.redraw(THEME.collect.glyph + ' +1', tr('a star toward the super jackpot'), '#ff8fc4'); fanfare(false); }
    } else if (pk === 'TOWER') {
      for (let i = 0; i < 10; i++) growTower();
      if (!mainTower()) rain(10, false);
      if (!sim) { showBanner(tr('TOWER +10'), tr('ten coins on the tower')); lamp.redraw(tr('TOWER +10'), '', '#4fc8ff'); fanfare(false); }
    } else {
      const n = +pk; rain(n, false);
      if (!sim) { showBanner(`${n} ${tr('coins')}`, tr('coin shower')); lamp.redraw(`${n} ${tr('coins')}`, tr('coin shower'), '#ffd36a'); fanfare(n >= 30); }
    }
    if (!sim) setTimeout(() => { if (!slot.active && !wheel.active) lamp.redraw(); }, 3500);
  }
  // ---------- themed celebrations ----------
  const fxTasks = [];
  function stepFx(dt, t) { decorAnim.forEach(f => f(t)); for (let i = fxTasks.length - 1; i >= 0; i--) if (fxTasks[i](dt) === false) fxTasks.splice(i, 1); }
  function noiseBurst(d, v, hp = 2000) { const a = audio(); if (!a) return; const t = a.currentTime, b = a.createBuffer(1, Math.floor(a.sampleRate * d), a.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3); const src = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain(); f.type = 'highpass'; f.frequency.value = hp; gn.gain.value = v; src.buffer = b; src.connect(f).connect(gn).connect(a.destination); src.start(t); }
  function gong() { const a = audio(); if (!a) return; const t = a.currentTime; [110, 164, 223, 291].forEach((f, i) => { const o = a.createOscillator(), gn = a.createGain(); o.type = 'sine'; o.frequency.value = f; gn.gain.setValueAtTime(0.12 / (i + 1), t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 3.5); o.connect(gn).connect(a.destination); o.start(t); o.stop(t + 3.6); }); }
  function bloop(n = 6) { const a = audio(); if (!a) return; for (let i = 0; i < n; i++) { const t = a.currentTime + i * 0.09, o = a.createOscillator(), gn = a.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(300 + Math.random() * 300, t); o.frequency.exponentialRampToValueAtTime(900 + Math.random() * 600, t + 0.12); gn.gain.setValueAtTime(0.06, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); o.connect(gn).connect(a.destination); o.start(t); o.stop(t + 0.16); } }
  // Macau: a golden dragon of light snakes across the machine, with firecrackers and a gong
  function fxDragon() {
    gong(); let tt = 0;
    fxTasks.push(dt => {
      tt += dt; const q = tt / 3.2; if (q > 1) return false;
      for (let seg = 0; seg < 6; seg++) {
        const u = q * 3.2 - seg * 0.06, x = Math.sin(u * 2.2) * 0.3, y = 0.42 + Math.sin(u * 4) * 0.08, z = -0.45 + u * 0.12;
        burst(x, y, z, seg === 0 ? 12 : 5, seg === 0 ? 0.1 : 0.05, seg === 0 ? [2, 1.4, 0.4] : seg % 2 ? [1.8, 0.3, 0.2] : [1.6, 1.1, 0.3]);
      }
    });
    fxFirecrackers();
  }
  function fxFirecrackers() {
    for (let k = 0; k < 14; k++) setTimeout(() => { const x = (Math.random() - 0.5) * 0.6, y = 0.3 + Math.random() * 0.35; burst(x, y, -0.3 + Math.random() * 0.4, 40, 1.1, Math.random() < 0.5 ? [2, 0.3, 0.25] : [2, 1.5, 0.4]); noiseBurst(0.08, 0.25); }, k * 160 + Math.random() * 80);
  }
  // Chocolate factory: melted chocolate pours down the back wall, then sprinkles everywhere
  const pourTex = canvasTex(256, 512, g => { const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#7a3f1d'); gr.addColorStop(1, '#4a2414'); g.fillStyle = gr; g.fillRect(0, 0, 256, 512); g.fillStyle = 'rgba(255,230,200,.18)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 256, Math.random() * 512, 3, 40 + Math.random() * 80); });
  pourTex.t.wrapT = THREE.RepeatWrapping;
  const pour = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.6, 0.6), new THREE.MeshBasicMaterial({ map: pourTex.t, transparent: true, opacity: 0.95 })); pour.position.set(0, 1.2, BACK + 0.012); pour.visible = false; scene.add(pour);
  function fxWaterfall() {
    bloop(10); let tt = 0; pour.visible = true; pour.material.opacity = 0.95;
    fxTasks.push(dt => {
      tt += dt; pourTex.t.offset.y -= dt * 1.6;
      pour.position.y = Math.max(0.47, 1.2 - tt * 0.5);
      if (tt > 1.4 && Math.random() < 0.6) burst((Math.random() - 0.5) * W * 1.4, 0.18, BACK + 0.05, 3, 0.25, [0.9, 0.45, 0.2]);
      if (tt > 3.6) { pour.material.opacity = Math.max(0, 0.95 - (tt - 3.6)); if (pour.material.opacity <= 0) { pour.visible = false; return false; } }
    });
    setTimeout(fxSprinkles, 1200);
  }
  // Retro 2000: laser lines sweep the machine, then neon rings ripple out
  function neonRing(x, y, z, n, sp, col) { for (let i = 0; i < n && parts.length < NP; i++) { const a = i / n * Math.PI * 2; parts.push({ x, y, z, vx: Math.cos(a) * sp, vy: 0.15, vz: Math.sin(a) * sp, life: 0.9, c: col }); } }
  function fxLaser() {
    let tt = 0; const cols = THEME.fx;
    fxTasks.push(dt => {
      tt += dt; if (tt > 3) return false;
      for (let k = 0; k < 3; k++) { const y = 0.1 + k * 0.15, z = -0.5 + ((tt * 0.6 + k * 0.3) % 1) * 0.8; for (let i = 0; i < 6 && parts.length < NP; i++) parts.push({ x: (Math.random() - 0.5) * W * 2, y, z, vx: 0, vy: 0, vz: 0, life: 0.25, c: cols[k % 2] }); }
    });
    for (let k = 0; k < 5; k++) setTimeout(() => neonRing(0, 0.3, -0.1, 60, 0.7, THEME.fx[k % 2]), 600 + k * 450);
    bloop(6);
  }
  function fxNeon() { for (let k = 0; k < 6; k++) setTimeout(() => { neonRing((Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.25, -0.2 + Math.random() * 0.3, 50, 0.6, THEME.fx[k % 2]); beep(800 + k * 150); }, k * 220); }
  function fxSprinkles() {
    const cols = [[2, 0.5, 1.2], [0.4, 1.8, 1.4], [2, 1.7, 0.3], [0.9, 0.6, 2], [2, 0.8, 0.3]];
    bloop(8);
    for (let k = 0; k < 10; k++) setTimeout(() => burst((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.3, -0.3 + Math.random() * 0.4, 45, 1.2, cols[k % cols.length]), k * 140);
  }
  // an announcer, using the browser's own speech (no audio files)
  function voice(en, zh) {
    try {
      if (!UI.soundOn() || !window.speechSynthesis) return;
      const zhOn = window.I18N && I18N.lang === 'zh', u = new SpeechSynthesisUtterance(zhOn ? zh : en);
      u.lang = zhOn ? 'zh-CN' : 'en-US'; u.rate = 1.05; u.pitch = 1.25; u.volume = 0.9;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* no voice */ }
  }
  function pickBonus() { let r = Math.random(); for (const b of BONUS) { if (r < b.p) return b; r -= b.p; } return BONUS[BONUS.length - 1]; }
  function applyBonus(b) {
    const rain = (n, gold) => { const base = rainQ.length ? rainQ[rainQ.length - 1].at : 0; for (let i = 0; i < n; i++) rainQ.push({ at: base + (i + 1) * 0.09, gold }); };
    if (b.k === 'shower') rain(6, false);
    else if (b.k === 'claw') { if (!extras || !extras.clawGrab()) rain(4, false); }
    else if (b.k === 'walls') wallUp = 15;
    else if (b.k === 'topple') { if (!toppleTower()) rain(6, false); }
    else if (b.k === 'star') { JP.stars++; if (JP.stars >= 3) { if (sim) superJackpot(); else setTimeout(superJackpot, 1200); } else { saveJP(); if (!sim) paintMeter(true); } }
    else if (b.k === 'jp') { jpChance(); if (!sim) { lamp.redraw(tr('JP CHANCE'), tr('the ball decides'), '#ff5a7a'); voice(...THEME.voice.chance); } return; }
    if (sim) return;
    window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'pusher-bonus', k: b.k } }));
    lamp.redraw(tr(b.big), tr(b.small), b.k === 'none' ? '#9a8a7a' : b.k === 'star' ? '#d9a8ff' : '#ffd36a');
    if (b.k !== 'none') { if (extras) extras.beaconOn(3); showBanner(tr(b.big), tr(b.small)); fanfare(b.k === 'shower' || b.k === 'star'); shake = 0.8; burst(0, 0.56, BACK + 0.05, 50, 1.2); }
    setTimeout(() => { if (!slot.active && !wheel.active) lamp.redraw(); }, 3000);
  }
  function gateHit(x) {
    if (tp < gateReady) return;
    if (sim) { const o = pickBonus(); sim.hits = (sim.hits || 0) + 1; sim[o.k] = (sim[o.k] || 0) + 1; applyBonus(o); gateReady = tp + GATE_CD; return; }
    if (slot.active || wheel.active) return;
    gateReady = tp + 4 + GATE_CD;
    spinSlot(pickBonus());
    burst(x, GATE_Y, DROP.z, 30, 0.7); fanfare(false); pop(tr('LUCKY GATE!'), 'gate');
  }

  // ---------- one physics step (also used by the fast test run) ----------
  let tp = 0, rainT = 0, floodLeft = 0, extras = null, prizeDrops = 0;
  function physStep() {
    const dt = world.timestep; tp += dt;
    pusher1.setNextKinematicTranslation(pos1(tp)); pusher2.setNextKinematicTranslation(pos2(tp));
    // funnel walls rise and sink
    if (wallUp > 0) wallUp -= dt;
    wallH += ((wallUp > 0 ? 1 : 0) - wallH) * Math.min(1, dt * 6);
    FW.list.forEach(f => f.b.setNextKinematicTranslation({ x: f.x, y: -0.04 + wallH * 0.07, z: f.z }));
    // coin rain from a bonus
    if (rainQ.length) {
      rainT += dt;
      while (rainQ.length && rainQ[0].at <= rainT) { const r = rainQ.shift(); const zz = r.wide ? -0.25 + Math.random() * 0.5 : -0.2 + Math.random() * 0.4; addCoin((Math.random() - 0.5) * (W * 2 - 0.1), (r.wide ? 0.5 : 0.42) + Math.random() * 0.08, zz, r.gold, { tumble: 3, vy: r.wide ? -0.6 : -0.2 }); if (!sim) burst(0, 0.4, 0, r.wide ? 1 : 3, 0.3); }
      if (!rainQ.length) rainT = 0;
    }
    if (rebuildAt && tp > rebuildAt) { rebuildAt = 0; if (!towers.some(t => t.main && !t.free)) buildTower(0, 0.17, TOWER_START); }
    for (const T of towers) {
      if (T.body) continue;
      T.t += dt;
      const want = Math.min(T.n, Math.floor(T.t / 0.05));
      while (T.shown < want) { T.shown++; if (!sim) { const y = T.shown * TH; burst(T.x, y, T.z, T.shown === T.n ? 25 : 3, 0.25, T.golds.has(T.shown - 1) ? [1.2, 0.85, 0.3] : [1, 1, 1]); beep(900 + (T.shown / T.n) * 1500); } }
      if (T.shown >= T.n) raiseTower(T);
    }
    if (ghosts.length || ghostLeft) stepGhosts(dt);
    if (floodLeft > 0) {
      capNow = 900;
      for (let k = 0; k < 4 && floodLeft > 0 && coins.length < capNow; k++) {
        floodLeft--;
        addCoin((Math.random() - 0.5) * (W * 2 - 0.08), 0.5 + Math.random() * 0.25, -0.25 + Math.random() * 0.5, floodLeft % 40 === 0, { tumble: 3, vy: -0.5 - Math.random() * 0.5 });
      }
      if (!sim && Math.random() < 0.3) burst((Math.random() - 0.5) * 0.6, 0.55, -0.1, 2, 0.3, THEME.fx[0]);
    } else if (capNow > MAXC && coins.length <= MAXC) capNow = MAXC;
    if (extras) extras.step(dt);
    world.step();
    // a tower that leans too far, or slides off the edge, bursts into its coins
    for (let k = towers.length - 1; k >= 0; k--) {
      const T = towers[k]; if (!T.body) continue;
      const q = T.body.rotation(), p = T.body.translation();
      tv.set(0, 1, 0).applyQuaternion(tq.set(q.x, q.y, q.z, q.w));
      if (!T.free && p.z > FRONT - 0.07) { T.free = true; T.body.setEnabledRotations(true, true, true, true); }   // near the edge it may tip
      if (tv.y < Math.cos(0.45) || p.z > FRONT - 0.005 || p.y < T.hh - 0.02) breakTower(k);
    }
    const gx = gateX(tp);
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i], p = c.body.translation();
      if (c.gate && p.y < GATE_Y) { c.gate = false; if (Math.abs(p.x - gx) < 0.018) gateHit(p.x); }
      if (c.ccd && p.y < 0.24 && p.y > -0.02) { const v = c.body.linvel(); if (Math.abs(v.y) < 0.15) { c.body.enableCcd(false); c.ccd = false; } }
      if (!sim && !c.body.isSleeping()) {
        const vy = c.body.linvel().y;
        if (c.vy < -0.35 && vy > c.vy * 0.4) clink(Math.min(2, -c.vy));
        c.vy = vy;
      }
      if (!c.paid && p.y < -0.03 && p.z > FRONT - 0.02) { c.paid = true; if (Math.abs(p.x) < WIN) payout(c, p.x, p.z); else if (sim) sim.house = (sim.house || 0) + 1; else clink(0.3, true); }
      if (p.y < -0.14 || Math.abs(p.x) > W + 0.2 || p.z > FRONT + 0.5) { if (!sim && c.paid && Math.abs(p.x) < WIN && p.y < -0.1) toTray(p.x, c.gold); removeCoin(i); }
    }
  }

  // ---------- the pile: kept between visits, or built fresh ----------
  const BOARD = 'ol-pz-board'; let jammed = false;
  function savePile() {
    if (jammed) return;
    if (extras) extras.save();
    try {
      const list = coins.filter(c => !c.paid).map(c => { const p = c.body.translation(), q = c.body.rotation(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, c.star ? 2 : c.gold ? 1 : 0].map(v => Math.round(v * 1e4) / 1e4); });
      const P = new THREE.Vector3(), Q = new THREE.Quaternion();
      towers.forEach(T => { if (!T.main || T.free || !T.body) for (let i = 0; i < (T.body ? T.n : T.shown); i++) { towerCoinPose(T, i, P, Q); list.push([P.x, P.y, P.z, Q.x, Q.y, Q.z, Q.w, T.golds.has(i) ? 1 : 0].map(v => Math.round(v * 1e4) / 1e4)); } });
      saveTower();
      localStorage.setItem(BOARD, JSON.stringify({ t: tp, list }));
    } catch (e) { /* private mode: the pile just won't be kept */ }
  }
  let saved = null; try { saved = JSON.parse(localStorage.getItem(BOARD) || 'null'); } catch (e) { saved = null; }
  sim = { won: 0 };   // set up quietly
  if (saved && Array.isArray(saved.list) && saved.list.length > 30) {
    tp = saved.t || 0;
    pusher1.setTranslation(pos1(tp), true); pusher2.setTranslation(pos2(tp), true);
    saved.list.forEach(a => { if (Array.isArray(a) && a.length === 8 && a.every(Number.isFinite)) addCoin(a[0], a[1] + 0.0005, a[2], a[7] === 1, { q: new THREE.Quaternion(a[3], a[4], a[5], a[6]), star: a[7] === 2 }); });
    for (let i = 0; i < 20; i++) physStep();
  } else {
    for (let i = 0; i < 160; i++) addCoin((Math.random() - 0.5) * (W * 2 - 0.08), 0.01 + (i % 5) * 0.011, 0.02 + Math.random() * (FRONT - 0.08), Math.random() < 0.05);
    for (let i = 0; i < 22; i++) addCoin((Math.random() - 0.5) * (W * 2 - 0.08), 0.075, -0.28 + Math.random() * 0.05, false);
    for (let i = 0; i < 36; i++) addCoin((Math.random() - 0.5) * (W * 2 - 0.08), 0.165 + (i % 2) * 0.012, -0.33 - Math.random() * 0.07, Math.random() < 0.05);
    for (let i = 0; i < 240; i++) physStep();
  }
  { const st = JP.tower; buildTower(st ? st.x : 0, st ? st.z : 0.17, st ? Math.max(TOWER_START, Math.min(TOWER_MAX, st.n | 0)) : TOWER_START); const T = towers[towers.length - 1]; if (T && st) { T.n = Math.max(TOWER_START, Math.min(TOWER_MAX, st.n | 0)); T.yaws = Array.from({ length: T.n }, () => Math.random() * 6); T.golds = new Set([T.n - 1]); } }
  if (!saved || !(saved.list && saved.list.length > 30)) [[-0.2, 0.2], [0.21, 0.15], [-0.05, 0.24]].forEach(([x, z]) => buildTower(x, z, 0, false));
  extras = createExtras({ THREE, RAPIER, scene, world, W, FRONT, BACK, WIN, tr, host,
    accent: THEME.accent, ledA: THEME.ledA, ledB: THEME.ledB,
    isSim: () => !!sim, simCount: k => { if (sim) sim[k] = (sim[k] || 0) + 1; },
    pay: v => { if (sim) { sim.won += v; return; } pending += v; won += v; },
    coins: () => coins, burst, pop,
    celebrate: (big, small, huge) => { showBanner(big, small); if (huge) bannerHold(4000); fanfare(true); shake = huge ? 1.5 : 0.8; extras.beaconOn(4); voice(big, big); },
    sound: k => { if (k === 'card') clink(0.6); else if (k === 'bar') { clink(2, true); fanfare(false); } else if (k === 'chip') clink(1.2); else if (k === 'claw') beep(600); else if (k === 'grab') { beep(400); clink(1, true); } else if (k === 'release') clink(1.5, true); },
  });
  sim = null;
  setInterval(savePile, 8000); window.addEventListener('pagehide', savePile);
  document.documentElement.classList.remove('t3d-wait');

  // ---------- aim and drop ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SLAB.y1), hit = new THREE.Vector3();
  const cv = renderer.domElement;
  const aim = e => { const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); if (ray.ray.intersectPlane(aimPlane, hit)) aimX = Math.max(-W + 0.04, Math.min(W - 0.04, hit.x)); };
  cv.addEventListener('pointermove', aim);
  cv.addEventListener('pointerdown', e => { aim(e); audio(); drop(); });
  document.querySelectorAll('[data-chute]').forEach(b => { b.onclick = () => { audio(); aimX = +b.dataset.chute; drop(); }; });
  $('#pzDrop').onclick = () => { audio(); drop(); };
  let auto = false, autoT = 0;
  const paintAuto = () => { $('#pzAuto').setAttribute('aria-pressed', String(auto)); $('#pzAuto').classList.toggle('on', auto); $('#pzAuto').textContent = auto ? 'Auto on' : 'Auto'; };
  // ---------- the owner's code: a hidden box (long-press or double-click the jackpot bar) that, with the right
  // code, drops 1,000 coins. Only a SHA-256 hash of the code is in the site (OL_CONFIG.pusherCodeHash), never the code.
  const codeHash = ((window.OL_CONFIG || {}).pusherCodeHash || '').trim().toLowerCase();
  let codeTries = 0, codeLockUntil = 0, pressT = 0;
  async function sha256(text) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  function openCodeBox() {
    let d = document.getElementById('pzCode');
    if (!d) { d = document.createElement('dialog'); d.id = 'pzCode'; d.className = 'rules'; document.body.appendChild(d); }
    d.innerHTML = `<h2>${tr('Enter code')}</h2><form method="dialog" class="pz-codeform"><input type="password" id="pzCodeIn" autocomplete="off" aria-label="${tr('Code')}"><p class="sub" id="pzCodeMsg" role="status"></p>
      <div class="rule-actions"><button type="button" class="ghostbtn" data-close>${tr('Cancel')}</button><button type="submit" class="primary">${tr('OK')}</button></div></form>`;
    const msgEl = d.querySelector('#pzCodeMsg'), input = d.querySelector('#pzCodeIn');
    d.querySelector('[data-close]').onclick = () => d.close();
    d.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      if (!codeHash) { msgEl.textContent = tr('No code has been set up for this machine yet.'); return; }
      if (Date.now() < codeLockUntil) { msgEl.textContent = tr('Too many tries. Wait a minute.'); return; }
      const ok = (await sha256(input.value.trim())) === codeHash;
      if (!ok) { codeTries++; if (codeTries >= 5) { codeTries = 0; codeLockUntil = Date.now() + 60000; } msgEl.textContent = tr('That code is not right.'); input.select(); return; }
      d.close(); startFlood();
    };
    d.showModal(); setTimeout(() => input.focus(), 50);
  }
  function startFlood() {
    floodLeft += 200; ghostLeft += 800; wallUp = Math.max(wallUp, 30);
    showBanner(tr('COIN AVALANCHE!'), `1,000 ${tr('coins')}`); bannerHold(5000);
    lamp.redraw(tr('COIN AVALANCHE!'), `1,000 ${tr('coins')}`, '#ffd24a');
    fanfare(true); shake = 1.5; voice(...(THEME.voice.flood || ['Coin avalanche!', '金币雪崩！']));
    if (extras) extras.beaconOn(8);
    if (THEME.superFx === 'dragon') fxDragon(); else if (THEME.superFx === 'laser') fxLaser(); else fxWaterfall();
    setTimeout(() => { if (!slot.active && !wheel.active) lamp.redraw(); }, 9000);
  }
  meter.addEventListener('dblclick', openCodeBox);
  meter.addEventListener('pointerdown', () => { clearTimeout(pressT); pressT = setTimeout(openCodeBox, 1200); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => meter.addEventListener(ev, () => clearTimeout(pressT)));
  // switching theme reloads the page with the other theme (the pile and the jackpots are kept)
  const themeIds = Object.keys(THEMES);
  $('#pzTheme').textContent = `${tr('Theme')}: ${tr(THEME.name)}`;
  $('#pzTheme').onclick = () => { savePile(); flush(); const next = themeIds[(themeIds.indexOf(THEME.id) + 1) % themeIds.length]; try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ } location.reload(); };
  $('#pzAuto').onclick = () => { audio(); auto = !auto; paintAuto(); };
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); drop(); }
    if (e.code === 'ArrowLeft') aimX = Math.max(-W + 0.04, aimX - 0.03);
    if (e.code === 'ArrowRight') aimX = Math.min(W - 0.04, aimX + 0.03);
  });

  // ---------- drawing ----------
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  function drawCoins() {
    let ns = 0, ng = 0, nst = 0;
    for (const c of coins) {
      const p = c.body.translation(), q = c.body.rotation();
      m4.compose(v3.set(p.x, p.y, p.z), qt.set(q.x, q.y, q.z, q.w), one);
      if (c.star && nst < 40) starI.setMatrixAt(nst++, m4); else if (c.gold) { if (ng < INST) goldI.setMatrixAt(ng++, m4); } else if (ns < INST) silverI.setMatrixAt(ns++, m4);
    }
    for (const g of ghosts) { m4.compose(v3.set(g.x, g.y, g.z), g.q, one); if (g.gold) { if (ng < INST) goldI.setMatrixAt(ng++, m4); } else if (ns < INST) silverI.setMatrixAt(ns++, m4); }
    for (const c of trayVis) { m4.compose(v3.set(c.x, c.y, c.z), c.q, one); if (c.gold) { if (ng < INST) goldI.setMatrixAt(ng++, m4); } else if (ns < INST) silverI.setMatrixAt(ns++, m4); }
    for (const T of towers) {
      const shown = T.body ? T.n : T.shown;
      for (let i = 0; i < shown; i++) {
        towerCoinPose(T, i, v3, qt); m4.compose(v3, qt, one);
        if (T.golds.has(i)) { if (ng < INST) goldI.setMatrixAt(ng++, m4); } else if (ns < INST) silverI.setMatrixAt(ns++, m4);
      }
    }
    silverI.count = ns; goldI.count = ng; starI.count = nst;
    silverI.instanceMatrix.needsUpdate = true; goldI.instanceMatrix.needsUpdate = true; starI.instanceMatrix.needsUpdate = true;
  }
  function drawTowerMarks(t) {
    const T = towers.find(x => x.main && !x.free) || null;
    tRing.visible = tLabel.visible = !!T;
    if (!T) return;
    const p = T.body ? T.body.translation() : { x: T.x, y: 0, z: T.z }, top = T.body ? p.y + T.hh : T.shown * TH;
    tRing.position.set(p.x, 0.002, p.z); tRing.material.opacity = 0.45 + Math.sin(t * 4) * 0.25;
    tLabel.position.set(p.x, top + 0.04, p.z); tLabel.userData.set(T.body ? T.n : T.shown);
  }
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.2, 1.45); composer.addPass(bloom); composer.addPass(new OutputPass());
  // camera: back away until the whole machine (sign at the top, payout tray at the bottom) fits between the
  // header icons and the buttons, then slide the picture so it sits centred in that space
  const camBase = new THREE.Vector3(), camLook = new THREE.Vector3(0, 0.22, -0.18);
  const FIT = [[-W - 0.06, 0.64, BACK], [W + 0.06, 0.64, BACK], [-W - 0.06, 0, FRONT], [W + 0.06, 0, FRONT], [-WIN - 0.02, -0.2, FRONT + 0.17], [WIN + 0.02, -0.2, FRONT + 0.17]].map(a => new THREE.Vector3(...a));
  const pv = new THREE.Vector3();
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h;
    const tall = w / h < 1;
    camera.fov = tall ? 55 : 38; camera.clearViewOffset(); camera.updateProjectionMatrix();
    const bar = $('#pzBar').getBoundingClientRect(), hr = host.getBoundingClientRect();
    const botN = 1 - 2 * Math.min(h - 10, Math.max(h * 0.55, bar.top - hr.top - 8)) / h, topN = 1 - 2 * Math.min(h * 0.12, 58) / h;
    const el = THREE.MathUtils.degToRad(tall ? 50 : 40), dir = new THREE.Vector3(0, Math.sin(el), Math.cos(el));
    let ymin = 0, ymax = 0;
    for (let d = 0.6; d < 6; d += 0.02) {
      camera.position.copy(camLook).addScaledVector(dir, d); camera.lookAt(camLook); camera.updateMatrixWorld();
      let xr = 0; ymin = 9; ymax = -9;
      FIT.forEach(p => { pv.copy(p).project(camera); xr = Math.max(xr, Math.abs(pv.x)); ymin = Math.min(ymin, pv.y); ymax = Math.max(ymax, pv.y); });
      if (xr < 0.95 && ymax - ymin < (topN - botN) * 0.96) break;
    }
    camBase.copy(camera.position);
    const shift = ((topN + botN) - (ymax + ymin)) / 2;   // in NDC: how far the picture should move up
    camera.setViewOffset(w, h, 0, -shift * h / 2, w, h); camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();
  new ResizeObserver(resize).observe($('#pzBar'));
  onQuality(q => { const hi = q === 'high'; world.numSolverIterations = hi ? 6 : 4; renderer.setPixelRatio(hi ? Math.min(2, devicePixelRatio || 1) : 1); bloom.enabled = hi; renderer.shadowMap.enabled = hi; key.castShadow = hi; resize(); });
  const clock = new THREE.Clock(); let acc = 0, t = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.1, clock.getDelta()); t += dt; acc += dt;
    clinkBudget = Math.min(4, clinkBudget + dt * 25);
    if (!jammed) {
      try { let n = 0; while (acc >= world.timestep && n < 4) { physStep(); acc -= world.timestep; n++; } if (n === 4) acc = 0; }
      catch (e) { jammed = true; auto = false; paintAuto(); console.error(e); try { localStorage.removeItem(BOARD); } catch (e2) { /* ignore */ } $('#pzInfo').textContent = 'The machine jammed. Reload the page to reset it.'; }
    }
    if (jammed) { composer.render(); return; }
    p1Mesh.position.copy(pusher1.translation()); p2Mesh.position.copy(pusher2.translation());
    FW.list.forEach((f, i) => { fwMeshes[i].position.copy(f.b.translation()); fwMeshes[i].visible = wallH > 0.02; fwMeshes[i].material.opacity = 0.35 + 0.45 * wallH; });
    drawCoins(); drawTowerMarks(t); if (extras) extras.draw(dt, t, UI.wallet.chips + pending, won);
    // the gate, the chute and the aim marker
    ring.position.x = gateX(tp);
    if (tp >= gateReady) ringM.color.setRGB(2.2 + Math.sin(t * 12) * 0.6, 1.6, 0.4); else { const k = 1 - (gateReady - tp) / (GATE_CD + 1.6); ringM.color.setRGB(0.25 + k * 0.5, 0.18 + k * 0.35, 0.1); }
    chute.position.x += (aimX - chute.position.x) * Math.min(1, dt * 14);
    aimDot.position.set(chute.position.x, SLAB.y1 + 0.002, DROP.z); aimDot.material.opacity = 0.35 + Math.sin(t * 5) * 0.2;
    // the bonus lamp rolling
    stepSlot(dt); stepWheel(dt);
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2) && !slot.active) paintMeterPot();
    // lights: chase normally, flash during a bonus
    if (superT > 0) superT -= dt;
    const party = slot.active || wheel.active || rainQ.length > 0 || shake > 0.3 || superT > 0;
    bulbs.forEach((b, i) => { const on = party ? (Math.floor(t * 14) + i) % 2 === 0 : (i + Math.floor(t * 6)) % 3 === 0; const hue = party ? ((i * 0.09 + t) % 1) : THEME.bulbHue; if (on) b.material.color.setHSL(hue, 1, 0.75).multiplyScalar(2.6); else b.material.color.setRGB(0.5, 0.35, 0.12); });
    ledM.color.setRGB(THEME.led[0] + Math.sin(t * 3) * 0.4, THEME.led[1], THEME.led[2]);
    stepFx(dt, t);
    // the win counter rolls up
    if (shown < won) { shown = Math.min(won, shown + Math.max(1, (won - shown) * dt * 6)); info(); }
    if (auto) { autoT += dt; if (autoT > 0.65) { autoT = 0; drop(); } }
    stepSparks(dt);
    // camera, with a little shake on wins
    shake = Math.max(0, shake - dt * 1.6);
    const s = shake * shake * 0.006;
    camera.position.set(camBase.x + (Math.random() - 0.5) * s, camBase.y + (Math.random() - 0.5) * s, camBase.z);
    camera.lookAt(camLook);
    composer.render();
  });
  info(); paintMeter();

  // for testing: run the machine fast without drawing; returns cost and winnings in chips
  window.OL_PUSHER = {
    sim(seconds, every = 0.65, mode = 'random') {
      sim = { won: 0 }; let cost = 0, at = 0;
      const steps = Math.round(seconds / world.timestep), gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
      for (let i = 0; i < steps; i++) {
        at += world.timestep;
        if (at > every) {
          at = 0; cost += COIN; drops++;
          if (mode === 'random') aimX = (Math.random() - 0.5) * 0.6;
          else if (mode === 'center') aimX = gauss() * 0.05;
          else aimX = tp >= gateReady ? Math.max(-0.3, Math.min(0.3, gateX(tp + 0.09) + gauss() * 0.02)) : gauss() * 0.05;   // 'skill': aims where the ring will be
          drop(true);
        }
        physStep();
      }
      const r = { ...sim, cost, onDeck: coins.length }; sim = null; return r;
    },
    coins: () => coins.length,
    superJackpot() { JP.stars = 2; starIn(0, FRONT); },
    jp: () => ({ ...JP, size: jpSize() }),
    topple() { return toppleTower(); },
    grow(n = 1) { for (let i = 0; i < n; i++) growTower(); },
    shape() { const col = coins[0].body.collider(0); return { hh: col.halfHeight(), r: col.radius(), round: col.roundRadius(), lu: world.lengthUnit, nf: world.integrationParameters.contact_natural_frequency, err: world.integrationParameters.normalizedAllowedLinearError, pred: world.integrationParameters.normalizedPredictionDistance }; },
    towerInfo() { return towers.map(T => { if (!T.body) return { building: T.shown + '/' + T.n }; const p = T.body.translation(), q = T.body.rotation(); tv.set(0, 1, 0).applyQuaternion(tq.set(q.x, q.y, q.z, q.w)); return { n: T.n, x: +p.x.toFixed(3), z: +p.z.toFixed(3), tilt: +(Math.acos(Math.min(1, tv.y)) * 57.3).toFixed(1) }; }); },
    column(x = 0, z = 0.08) { return coins.map(c => c.body.translation()).filter(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 0.0004).map(p => +p.y.toFixed(3)).sort((a, b) => a - b); },
    bonus(k) { if (slot.active || wheel.active) return; spinSlot(BONUS.find(b => b.k === k) || BONUS[0]); },
    jp() { jpChance(); },
    claw() { return extras.clawGrab(); },
    prizes: () => extras.prizes.map(p => p.kind + (p.held ? '*' : '')),
    prizePos: () => extras.prizes.map(p => { const t = p.body.translation(); return `${p.kind}@${t.x.toFixed(2)},${t.y.toFixed(3)},${t.z.toFixed(2)}`; }),
    stacks: () => towers.map(T => ({ main: !!T.main, n: T.n, built: !!T.body, z: T.body ? +T.body.translation().z.toFixed(2) : T.z })),
    flood: () => ({ real: floodLeft, ghost: ghostLeft, flying: ghosts.length }),
    fx(kind, sec = 1.6) { if (kind === 'waterfall') fxWaterfall(); else if (kind === 'dragon') fxDragon(); else if (kind === 'sprinkles') fxSprinkles(); else fxFirecrackers(); for (let i = 0; i < Math.round(sec * 60); i++) { stepFx(1 / 60, i / 60); stepSparks(1 / 60); } },
    jpPocket(pk) { jpResult(pk); },
    advance(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { stepSlot(1 / 60); stepWheel(1 / 60); physStep(); } return this.slotState(); },
    slotState() { return { active: slot.active, reach: slot.reach, t: +slot.t.toFixed(2), reels: reels.map(r => ({ state: r.state, p: +r.p.toFixed(2), target: r.target, show: STRIP[((Math.round(r.p)) % STRIP.length + STRIP.length) % STRIP.length] })), wheel: { active: wheel.active, vis: wheel.g.visible, k: POCKETS[wheel.k] } }; },
    where: () => { const r = { upper: 0, p2top: 0, p1top: 0, deck: 0, deckLayers: [0, 0, 0, 0, 0] }; coins.forEach(c => { const p = c.body.translation(); if (p.y > 0.19) r.p2top++; else if (p.y > 0.145) r.upper++; else if (p.z < fz1(tp) - 0.005 && p.y > 0.055) r.p1top++; else { r.deck++; r.deckLayers[Math.min(4, Math.floor(p.y / TH))]++; } }); return r; },
  };
}
