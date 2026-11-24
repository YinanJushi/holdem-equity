// A seat at a 3D casino table (Three.js): the lounge around you, the table, real cards and chip stacks,
// the dealer or the other players, and a bar that will mix you a drink.
// The card games keep all their logic; they hand this module plain descriptions of what is on the table.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const FLOOR = -0.76;                       // the floor, with the table top at y = 0 (metres)
const CW = 0.102, CH = 0.143;              // card size (a little larger than life so it reads on screen)
const RANKS = '23456789TJQKA', SUITS = ['♠', '♥', '♦', '♣'], SUIT_COL = ['#1b1a1f', '#b8222f', '#2a5bb5', '#19703f'];
const DECK_COL = { sky: '#7fb6cc', ink: '#34496e', mint: '#5aa891', apricot: '#e3a083', brick: '#9e3530', stone: '#979c9d', pine: '#23402f', pumpkin: '#e07b2e', pink: '#e58aab', lime: '#8cc63f', charcoal: '#2b2b2e' };
const DENOMS = [[500, 'gold'], [100, 'black'], [25, 'green'], [5, 'red'], [1, 'white']];
const CHIP_COL = { gold: ['#d4a12a', '#fff4d0'], black: ['#1e1e22', '#f2c14e'], green: ['#2a7a4a', '#ffffff'], red: ['#b52f3a', '#ffffff'], white: ['#eeeae0', '#2a5bb5'] };
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = p => 1 - Math.pow(1 - p, 3);
const lerp = (a, b, t) => a + (b - a) * t;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const noise = (g, w, h, a = 0.06, n = 9000) => { for (let i = 0; i < n; i++) { g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } };

// ---------- tiny synthesized sounds (follow the site's sound switch) ----------
let actx = null;
const ac = () => { if (!window.UI || !UI.soundOn()) return null; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; } catch (e) { return null; } };
function tone(f, d, v = 0.04, type = 'sine', at = 0, slide = 0) { const a = ac(); if (!a) return; const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.02); }
function hiss(d, v, at = 0, hp = 1500) { const a = ac(); if (!a) return; const t = a.currentTime + at, b = a.createBuffer(1, Math.max(1, a.sampleRate * d), a.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / x.length); const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); f.type = 'highpass'; f.frequency.value = hp; g.gain.value = v; s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(t); }
const snd = {
  shake: () => { for (let i = 0; i < 10; i++) hiss(0.07, 0.05, i * 0.13, 2500 + (i % 2) * 1500); },
  pour: () => hiss(0.9, 0.035, 0, 600),
  clink: () => { tone(2600, 0.25, 0.03, 'sine'); tone(3900, 0.18, 0.015, 'sine', 0.01); },
  sip: () => { hiss(0.25, 0.03, 0, 900); tone(220, 0.12, 0.02, 'sine', 0.22, 0.7); },
  chips: () => { for (let i = 0; i < 4; i++) tone(2400 + Math.random() * 900, 0.04, 0.02, 'square', i * 0.035); },
};

// ---------- the drinks menu ----------
export const DRINKS = [
  { id: 'oldfashioned', name: 'Old Fashioned', note: 'Bourbon, bitters, orange peel', glass: 'rocks', col: '#b8651b', garnish: ['peel', 'cherry'], ice: 'cube' },
  { id: 'martini', name: 'Dry Martini', note: 'Gin, dry vermouth, olive', glass: 'martini', col: '#e9efd6', garnish: ['olive'] },
  { id: 'mojito', name: 'Mojito', note: 'Rum, lime, mint, soda', glass: 'highball', col: '#cfe8a8', garnish: ['mint', 'lime'], ice: 'cubes', straw: true },
  { id: 'cosmo', name: 'Cosmopolitan', note: 'Vodka, cranberry, lime', glass: 'martini', col: '#e0446a', garnish: ['twist'] },
  { id: 'margarita', name: 'Margarita', note: 'Tequila, lime, salted rim', glass: 'coupe', col: '#e6ee9c', garnish: ['lime', 'salt'] },
  { id: 'espresso', name: 'Espresso Martini', note: 'Vodka, coffee, crema', glass: 'martini', col: '#3a2418', garnish: ['beans'], foam: '#d9b98a' },
  { id: 'sunrise', name: 'Virgin Sunrise', note: 'Orange, grenadine, no alcohol', glass: 'highball', col: '#ff9a2e', col2: '#d81b3c', garnish: ['orange', 'cherry'], ice: 'cubes', straw: true, na: true },
  { id: 'spritz', name: 'Lemon Sparkler', note: 'Sparkling water, lemon, no alcohol', glass: 'highball', col: '#eef6f2', garnish: ['lemon'], ice: 'cubes', na: true, bubbles: true },
];

export function createCasino(host, kind) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const wrap = document.createElement('div'); wrap.className = 't3-host';
  wrap.appendChild(renderer.domElement); renderer.domElement.className = 't3-canvas';
  const labelLayer = document.createElement('div'); labelLayer.className = 't3-labels'; wrap.appendChild(labelLayer);
  host.appendChild(wrap);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0407');
  scene.fog = new THREE.Fog('#140609', 7, 24);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;
  const camera = new THREE.PerspectiveCamera(46, 16 / 10, 0.02, 60);
  const animated = [];   // things in the room that move on their own: (t, dt) => void

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight('#ffe2c0', '#2a0a10', 0.35));
  const lamp = new THREE.SpotLight('#ffe6c4', 7, 6, 0.62, 0.65, 1.3);
  lamp.position.set(0, 2.3, 0.1); lamp.target.position.set(0, 0, -0.05);
  lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0004; lamp.shadow.radius = 4;
  scene.add(lamp, lamp.target);
  const fill = new THREE.PointLight('#ff9a6a', 0.8, 5, 1.6); fill.position.set(0, 0.9, 1.6); scene.add(fill);

  // ---------- materials ----------
  const M = {
    gold: new THREE.MeshStandardMaterial({ color: '#d9a843', metalness: 1, roughness: 0.3 }),
    wood: new THREE.MeshStandardMaterial({ color: '#4a2412', roughness: 0.45, metalness: 0.1 }),
    darkwood: new THREE.MeshStandardMaterial({ color: '#2a1209', roughness: 0.5 }),
    leather: new THREE.MeshStandardMaterial({ color: '#1e0c08', roughness: 0.55, metalness: 0.05 }),
    black: new THREE.MeshStandardMaterial({ color: '#0c0507', roughness: 0.7 }),
    silhouette: new THREE.MeshStandardMaterial({ color: '#1a0d10', roughness: 0.9 }),
  };

  buildRoom();


  // ---------- people ----------
  function person({ shirt = '#e8e2d6', vest = null, hair = '#2a1a12', skin = '#d9b896', bow = null, arms = 'rest', scale = 1 } = {}) {
    const g = new THREE.Group();
    const sm = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.75 });
    const km = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.65 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.32, 6, 16), sm); torso.scale.set(1.15, 1, 0.72); torso.position.y = 0.22; g.add(torso);
    if (vest) { const v = new THREE.Mesh(new THREE.CapsuleGeometry(0.172, 0.26, 6, 16, 1), new THREE.MeshStandardMaterial({ color: vest, roughness: 0.6 })); v.scale.set(1.16, 1, 0.74); v.position.set(0, 0.19, 0.005); g.add(v); }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 12), km); neck.position.y = 0.5; g.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), km); head.scale.set(0.9, 1.08, 0.95); head.position.y = 0.62; g.add(head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: hair, roughness: 0.8 }));
    hairM.scale.set(0.93, 1.05, 1.0); hairM.position.set(0, 0.645, -0.01); hairM.rotation.x = -0.25; g.add(hairM);
    if (bow) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.02), new THREE.MeshStandardMaterial({ color: bow, roughness: 0.4 })); b.position.set(0, 0.44, 0.12); g.add(b); }
    const armL = new THREE.Group(), armR = new THREE.Group();
    [[armL, -1], [armR, 1]].forEach(([a, s]) => {
      a.position.set(s * 0.2, 0.38, 0); g.add(a);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 10), sm); upper.position.y = -0.13; a.add(upper);
      const fore = new THREE.Group(); fore.position.y = -0.26; a.add(fore);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 4, 10), sm); lower.position.y = -0.12; fore.add(lower);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), km); hand.scale.set(1, 1.2, 0.6); hand.position.y = -0.26; fore.add(hand);
      a.userData.fore = fore;
      if (arms === 'rest') { a.rotation.x = -0.5; a.rotation.z = s * 0.15; fore.rotation.x = -1.0; }
      else { a.rotation.x = -0.35; a.rotation.z = s * 0.12; fore.rotation.x = -1.15; }
    });
    g.userData = { head, armL, armR, torso };
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    g.scale.setScalar(scale);
    return g;
  }

  // ---------- cards ----------
  const faceCache = new Map();
  function faceTex(c) {
    if (faceCache.has(c)) return faceCache.get(c);
    const r = RANKS[c >> 2], s = c & 3, label = r === 'T' ? '10' : r, col = SUIT_COL[s], face = 'JQK'.includes(r);
    const t = canvasTex(256, 360, (g, w, h) => {
      rr(g, 2, 2, w - 4, h - 4, 22); g.fillStyle = '#fbf8f1'; g.fill(); g.strokeStyle = '#d6cfbf'; g.lineWidth = 3; g.stroke();
      g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
      const corner = () => { g.font = `700 ${label.length > 1 ? 50 : 58}px Georgia, serif`; g.fillText(label, 38, 46); g.font = '44px Arial'; g.fillText(SUITS[s], 38, 96); };
      corner(); g.save(); g.translate(w, h); g.rotate(Math.PI); corner(); g.restore();
      if (face) {
        g.strokeStyle = col; g.globalAlpha = 0.3; g.lineWidth = 3; rr(g, 66, 70, w - 132, h - 140, 10); g.stroke(); g.globalAlpha = 1;
        g.font = 'italic 700 132px Georgia, serif'; g.fillText(label, w / 2, h / 2 + 6);
      } else if (r === 'A') { g.font = '150px Arial'; g.fillText(SUITS[s], w / 2, h / 2 + 8); }
      else {
        g.font = '120px Arial'; g.fillText(SUITS[s], w / 2, h / 2 + 8);
      }
    });
    faceCache.set(c, t); return t;
  }
  const backTex = (() => {
    let id = 'classic'; try { id = (JSON.parse(localStorage.getItem('ol-deck') || '{}').back) || 'classic'; } catch (e) { }
    const base = DECK_COL[id] || '#6e1824';
    return canvasTex(256, 360, (g, w, h) => {
      rr(g, 2, 2, w - 4, h - 4, 22); g.fillStyle = '#f6f1e5'; g.fill();
      rr(g, 16, 16, w - 32, h - 32, 14); g.fillStyle = base; g.fill();
      if (id === 'classic') { g.save(); rr(g, 16, 16, w - 32, h - 32, 14); g.clip(); g.strokeStyle = 'rgba(244,226,200,.22)'; g.lineWidth = 6; for (let i = -h; i < w + h; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); } g.restore(); g.strokeStyle = 'rgba(210,178,116,.9)'; g.lineWidth = 3; rr(g, 24, 24, w - 48, h - 48, 10); g.stroke(); }
    });
  })();
  const cardGeo = new THREE.PlaneGeometry(CW, CH);
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.5 });
  const edgeGeo = new THREE.BoxGeometry(CW * 0.985, CH * 0.985, 0.0012);
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.6 });
  function makeCard() {
    const g = new THREE.Group();            // positioned on the table
    const flip = new THREE.Group(); g.add(flip); // turns the card over
    const front = new THREE.Mesh(cardGeo, new THREE.MeshStandardMaterial({ roughness: 0.42 })); front.position.z = 0.0007;
    const back = new THREE.Mesh(cardGeo, backMat); back.rotation.y = Math.PI; back.position.z = -0.0007;
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    [front, back, edge].forEach(m => { m.castShadow = true; flip.add(m); });
    g.userData = { flip, front };
    scene.add(g);
    return g;
  }
  const cards = new Map();   // key -> { obj, c, pos, ... }
  const DEAL_FROM = { get x() { return T.dealFrom.x; }, get z() { return T.dealFrom.z; } }, MUCK = { get x() { return T.muck.x; }, get z() { return T.muck.z; } };
  function setCardFace(rec, c) { if (c >= 0) { rec.obj.userData.front.material.map = faceTex(c); rec.obj.userData.front.material.needsUpdate = true; } rec.c = c; }
  // desc: [{ key, c (-1 = face down), x, z, yaw, tilt, y }]
  function setCards(list) {
    const seen = new Set(); let stagger = 0;
    list.forEach(d => {
      seen.add(d.key);
      let rec = cards.get(d.key);
      const target = { x: d.x, z: d.z, y: d.y || 0, yaw: d.yaw || 0, tilt: d.tilt || 0, up: d.c >= 0 };
      if (!rec) {
        rec = { obj: makeCard(), c: null, t: -stagger * 0.13, dur: 0.42, from: { x: DEAL_FROM.x, z: DEAL_FROM.z, y: 0.05, yaw: 0.6, tilt: 0, up: false }, to: target, flipT: 1 };
        stagger++;
        cards.set(d.key, rec);
        setCardFace(rec, d.c);
        place(rec, rec.from);
      } else {
        const moved = Math.abs(rec.to.x - target.x) + Math.abs(rec.to.z - target.z) > 0.002 || Math.abs(rec.to.tilt - target.tilt) > 0.01;
        const turned = (rec.c >= 0) !== (d.c >= 0) || (d.c >= 0 && rec.c !== d.c);
        if (moved || turned) { rec.from = cur(rec); rec.t = 0; rec.dur = turned ? 0.5 : 0.35; rec.to = target; }
        if (turned && d.c >= 0) setCardFace(rec, d.c);
        else if (!turned) rec.to = target;
      }
      rec.gone = false;
    });
    cards.forEach((rec, key) => {
      if (seen.has(key) || rec.gone) return;
      rec.gone = true; rec.from = cur(rec); rec.t = 0; rec.dur = 0.45;
      rec.to = { x: MUCK.x, z: MUCK.z, y: 0.02, yaw: 0.3, tilt: 0, up: rec.to.up };
    });
  }
  const cur = rec => ({ ...rec.now });
  function place(rec, p) {
    const o = rec.obj; rec.now = { ...p };
    o.position.set(p.x, p.y + 0.0016, p.z);
    o.rotation.set(-Math.PI / 2 + p.tilt, 0, 0); o.rotateZ(p.yaw || 0);
    o.userData.flip.rotation.y = p.up ? 0 : Math.PI;
  }
  function stepCards(dt) {
    cards.forEach((rec, key) => {
      if (rec.t >= rec.dur && !rec.gone) return;
      rec.t += dt;
      if (rec.t < 0) return;
      const p = Math.min(1, rec.t / rec.dur), e = ease(p), a = rec.from, b = rec.to;
      const flipNow = a.up !== b.up;
      const o = rec.obj;
      const x = lerp(a.x, b.x, e), z = lerp(a.z, b.z, e), y = lerp(a.y, b.y, e) + Math.sin(p * Math.PI) * (flipNow ? 0.07 : 0.04);
      o.position.set(x, y + 0.0016, z);
      o.rotation.set(-Math.PI / 2 + lerp(a.tilt, b.tilt, e), 0, 0); o.rotateZ(lerp(a.yaw, b.yaw, e));
      o.userData.flip.rotation.y = flipNow ? (a.up ? 0 : Math.PI) + (a.up ? 1 : -1) * Math.PI * e : (b.up ? 0 : Math.PI);
      rec.now = { x, z, y: lerp(a.y, b.y, e), yaw: lerp(a.yaw, b.yaw, e), tilt: lerp(a.tilt, b.tilt, e), up: p >= 0.5 ? b.up : a.up };
      if (p >= 1) {
        rec.now.up = b.up;
        if (rec.gone) { scene.remove(o); o.userData.front.material.dispose(); cards.delete(key); }
      }
    });
  }

  // ---------- chips ----------
  const chipGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.0052, 28);
  const chipMats = {};
  Object.entries(CHIP_COL).forEach(([k, [base, stripe]]) => {
    const side = canvasTex(128, 16, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = stripe; for (let i = 0; i < 8; i++) g.fillRect(i * 16 + 3, 0, 6, h); });
    const top = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = base; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
      g.fillStyle = stripe; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(64, 64, 64, i * Math.PI / 4, i * Math.PI / 4 + 0.26); g.arc(64, 64, 50, i * Math.PI / 4 + 0.26, i * Math.PI / 4, true); g.fill(); }
      g.strokeStyle = stripe; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 38, 0, Math.PI * 2); g.stroke();
    });
    chipMats[k] = [new THREE.MeshStandardMaterial({ map: side, roughness: 0.45 }), new THREE.MeshStandardMaterial({ map: top, roughness: 0.45 }), new THREE.MeshStandardMaterial({ map: top, roughness: 0.45 })];
  });
  function chipColors(n, max = 24) {
    const out = []; let r = Math.round(n);
    for (const [v, c] of DENOMS) while (r >= v && out.length < max) { out.push(c); r -= v; }
    if (!out.length && n > 0) out.push('white');
    return out;
  }
  function buildStack(n) {
    const g = new THREE.Group(), cols = chipColors(n), per = 12;
    cols.forEach((c, i) => {
      const s = Math.floor(i / per), k = i % per;
      const m = new THREE.Mesh(chipGeo, chipMats[c]);
      m.position.set(s * 0.064 - (Math.ceil(cols.length / per) - 1) * 0.032, 0.0026 + k * 0.0053, 0);
      m.rotation.y = Math.random() * 6; m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    });
    scene.add(g);
    return g;
  }
  const stacks = new Map();
  // desc: [{ key, n, x, z, fromX, fromZ, toX, toZ }]
  function setStacks(list) {
    const seen = new Set();
    list.forEach(d => {
      if (!(d.n > 0)) return;
      seen.add(d.key);
      let s = stacks.get(d.key);
      if (!s) {
        const obj = buildStack(d.n);
        const fx = d.fromX != null ? d.fromX : d.x, fz = d.fromZ != null ? d.fromZ : d.z;
        s = { obj, n: d.n, a: { x: fx, z: fz }, b: { x: d.x, z: d.z }, t: 0, dur: d.fromX != null ? 0.45 : 0.25, drop: d.fromX == null, d };
        obj.position.set(fx, s.drop ? 0.06 : 0, fz);
        stacks.set(d.key, s);
        snd.chips();
      } else {
        if (s.n !== d.n) { scene.remove(s.obj); const o = buildStack(d.n); o.position.copy(s.obj.position); s.obj = o; s.n = d.n; s.bump = 1; snd.chips(); }
        if (Math.abs(s.b.x - d.x) + Math.abs(s.b.z - d.z) > 0.002) { s.a = { x: s.obj.position.x, z: s.obj.position.z }; s.b = { x: d.x, z: d.z }; s.t = 0; s.dur = 0.5; s.drop = false; }
      }
      s.d = d; s.gone = false;
    });
    stacks.forEach((s, key) => {
      if (seen.has(key) || s.gone) return;
      s.gone = true; s.a = { x: s.obj.position.x, z: s.obj.position.z };
      s.b = { x: s.d.toX != null ? s.d.toX : s.obj.position.x, z: s.d.toZ != null ? s.d.toZ : s.obj.position.z };
      s.t = 0; s.dur = 0.45; s.drop = false;
    });
  }
  function stepStacks(dt) {
    stacks.forEach((s, key) => {
      if (s.bump) { s.bump = Math.max(0, s.bump - dt * 4); s.obj.scale.setScalar(1 + s.bump * 0.08); }
      if (s.t >= s.dur && !s.gone) return;
      s.t += dt;
      const p = Math.min(1, s.t / s.dur), e = easeOut(p);
      s.obj.position.x = lerp(s.a.x, s.b.x, e); s.obj.position.z = lerp(s.a.z, s.b.z, e);
      s.obj.position.y = s.drop ? 0.06 * (1 - e) : Math.sin(p * Math.PI) * 0.02;
      if (s.gone) s.obj.scale.setScalar(1 - Math.max(0, p - 0.7) / 0.3 * 0.95);
      if (p >= 1 && s.gone) { scene.remove(s.obj); stacks.delete(key); }
    });
  }

  // ---------- the table ----------
  const T = kind === 'bj' ? buildBJTable() : buildHoldemTable();
  const bar = scene.userData.bar;

  // ---------- dealer button ----------
  let puck = null;
  function setPuck(x, z) {
    if (x == null) { if (puck) puck.visible = false; return; }
    if (!puck) {
      const top = canvasTex(128, 128, (g) => { g.fillStyle = '#f7f3ea'; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#1b1a1f'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#1b1a1f'; g.font = '700 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('D', 64, 68); });
      const side = new THREE.MeshStandardMaterial({ color: '#f7f3ea', roughness: 0.4 }), tm = new THREE.MeshStandardMaterial({ map: top, roughness: 0.4 });
      puck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.009, 32), [side, tm, side]); puck.castShadow = true;
      puck.position.set(x, 0.0045, z); scene.add(puck);
      animated.push((t, dt) => { const to = puck.userData.to; if (to) { puck.position.x = lerp(puck.position.x, to.x, Math.min(1, dt * 5)); puck.position.z = lerp(puck.position.z, to.z, Math.min(1, dt * 5)); } });
    }
    puck.visible = true; puck.userData.to = { x, z };
  }

  // ---------- labels (HTML, placed over the 3D view) ----------
  const labels = new Map();
  const v3 = new THREE.Vector3();
  // desc: [{ key, x, y, z, html, cls }]
  function setLabels(list) {
    const seen = new Set();
    list.forEach(d => {
      seen.add(d.key);
      let L = labels.get(d.key);
      if (!L) { const el = document.createElement('div'); labelLayer.appendChild(el); L = { el }; labels.set(d.key, L); }
      if (L.html !== d.html) { L.el.innerHTML = d.html; L.html = d.html; }
      const cls = 't3-label ' + (d.cls || '');
      if (L.cls !== cls) { L.el.className = cls; L.cls = cls; }
      L.p = [d.x, d.y || 0, d.z];
    });
    labels.forEach((L, k) => { if (!seen.has(k)) { L.el.remove(); labels.delete(k); } });
  }
  function stepLabels() {
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    labels.forEach(L => {
      v3.set(L.p[0], L.p[1], L.p[2]).project(camera);
      const vis = v3.z < 1 && Math.abs(v3.x) < 1.3 && Math.abs(v3.y) < 1.3;
      L.el.style.display = vis ? '' : 'none';
      if (vis) L.el.style.transform = `translate(${((v3.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v3.y) / 2 * h).toFixed(1)}px) translate(-50%, -50%)`;
    });
  }

  // ---------- camera: seated, free to look around ----------
  const view = { yaw: 0, pitch: 0, dYaw: 0, dPitch: 0, idle: 0, cine: null, sway: 0 };
  const seat = { pos: T.seat.pos.clone(), target: T.seat.target.clone() };
  function aim() {
    const yaw = view.yaw + Math.sin(view.sway * 0.35) * 0.012, pitch = view.pitch + Math.sin(view.sway * 0.5) * 0.006;
    const base = new THREE.Vector3().subVectors(seat.target, seat.pos);
    const len = base.length(), baseYaw = Math.atan2(base.x, -base.z), basePitch = Math.asin(base.y / len);
    const Y = baseYaw + yaw, P = basePitch + pitch;
    camera.position.copy(seat.pos); camera.position.y += Math.sin(view.sway * 0.5) * 0.004;
    camera.lookAt(seat.pos.x + Math.sin(Y) * Math.cos(P), seat.pos.y + Math.sin(P), seat.pos.z - Math.cos(Y) * Math.cos(P));
  }
  let drag = null;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!drag) { cv.style.cursor = hitDrink(e) ? 'pointer' : 'grab'; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved || view.cine) return;
    view.yaw = Math.max(-1.5, Math.min(1.5, drag.yaw - dx * 0.005));
    view.pitch = Math.max(-0.45, Math.min(0.35, drag.pitch + dy * 0.004));
    view.idle = 0; cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointerup', e => {
    const d = drag; drag = null; cv.style.cursor = 'grab';
    if (d && !d.moved && hitDrink(e)) sip();
  });
  cv.addEventListener('dblclick', () => { view.idle = 99; });
  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h;
    // tall screens: sit back a little and look up so the dealer and the other players stay in view
    const tall = w / h < 1;
    seat.pos.copy(T.seat.pos); seat.target.copy(T.seat.target);
    if (tall) { seat.pos.y += 0.08; seat.pos.z += 0.14; }
    // keep the table across the view on tall phone screens too
    camera.fov = w / h < 1 ? Math.min(78, 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(46) / 2) * 1.25 / (w / h)) * 180 / Math.PI) : 50;
    camera.updateProjectionMatrix();
  }

  // ---------- the bar and your drink ----------
  const drinkSpot = T.drinkSpot;
  let drink = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hitDrink(e) {
    if (!drink || drink.state !== 'ready') return false;
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(drink.obj, true).length > 0;
  }
  function buildGlass(D) {
    const g = new THREE.Group();
    const glassM = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    const liqM = new THREE.MeshStandardMaterial({ color: D.col, roughness: 0.15, transparent: true, opacity: 0.88, emissive: D.col, emissiveIntensity: 0.12 });
    const liquid = new THREE.Group(); g.add(liquid);
    let H = 0.1, top = 0.1, R = 0.035, cone = false;
    if (D.glass === 'rocks') {
      R = 0.042; H = 0.085;
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.95, H, 28, 1, true), glassM));
      const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.95, 0.012, 28), glassM); base.position.y = -H / 2 + 0.006; g.add(base);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.93, R * 0.9, H * 0.55, 28), liqM); l.position.y = 0; liquid.add(l); l.geometry.translate(0, H * 0.275, 0); liquid.position.y = -H / 2 + 0.012;
      top = H * 0.55 - H / 2 + 0.012;
      g.position.y = H / 2;
    } else if (D.glass === 'highball') {
      R = 0.034; H = 0.15;
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 28, 1, true), glassM));
      const base = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.014, 28), glassM); base.position.y = -H / 2 + 0.007; g.add(base);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.94, R * 0.94, H * 0.78, 28), liqM); l.geometry.translate(0, H * 0.39, 0); liquid.add(l); liquid.position.y = -H / 2 + 0.014;
      if (D.col2) { const l2 = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.945, R * 0.945, H * 0.22, 28), new THREE.MeshStandardMaterial({ color: D.col2, roughness: 0.2, transparent: true, opacity: 0.92 })); l2.geometry.translate(0, H * 0.11, 0); liquid.add(l2); }
      top = H * 0.78 - H / 2 + 0.014;
      g.position.y = H / 2;
    } else { // martini / coupe: a bowl on a stem
      cone = D.glass === 'martini';
      const bowlH = cone ? 0.07 : 0.045, bowlR = cone ? 0.058 : 0.05, stemH = 0.075;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, stemH, 10), glassM); stem.position.y = stemH / 2; g.add(stem);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.004, 28), glassM); foot.position.y = 0.002; g.add(foot);
      const bowl = cone ? new THREE.Mesh(new THREE.ConeGeometry(bowlR, bowlH, 32, 1, true), glassM) : new THREE.Mesh(new THREE.SphereGeometry(bowlR, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassM);
      if (cone) { bowl.rotation.x = Math.PI; bowl.position.y = stemH + bowlH / 2; } else { bowl.position.y = stemH + bowlR * 0.98; bowl.scale.y = bowlH / bowlR; }
      g.add(bowl);
      const lg = cone ? new THREE.ConeGeometry(bowlR * 0.8, bowlH * 0.8, 32) : new THREE.SphereGeometry(bowlR * 0.94, 32, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      if (cone) { lg.rotateX(Math.PI); lg.translate(0, bowlH * 0.4, 0); }
      else lg.scale(1, bowlH / bowlR, 1).translate(0, bowlH * 0.94, 0);
      const l = new THREE.Mesh(lg, liqM); liquid.add(l); liquid.position.y = stemH + (cone ? 0 : bowlR * 0.98 - bowlH * 0.94);
      if (D.foam) { const f = new THREE.Mesh(new THREE.CylinderGeometry(bowlR * 0.8, bowlR * 0.8, 0.006, 28), new THREE.MeshStandardMaterial({ color: D.foam, roughness: 0.9 })); f.position.y = bowlH * 0.8; liquid.add(f); }
      top = stemH + bowlH * (cone ? 0.82 : 0.9); R = bowlR * 0.8; H = top;
      if (D.garnish.includes('salt')) { const rim = new THREE.Mesh(new THREE.TorusGeometry(bowlR * 0.99, 0.004, 6, 40), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 })); rim.rotation.x = Math.PI / 2; rim.position.y = stemH + (cone ? bowlH : bowlH * 0.98 + bowlR * 0.0); g.add(rim); }
    }
    const lvl = () => liquid.scale.y;
    // ice, garnish, straw
    const iceM = new THREE.MeshPhysicalMaterial({ color: '#eaf6ff', transparent: true, opacity: 0.55, roughness: 0.1 });
    const yTop = top;   // already in the glass's own coordinates
    if (D.ice === 'cube') { const ic = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), iceM); ic.position.y = yTop - 0.022; ic.rotation.set(0.2, 0.5, 0.1); g.add(ic); }
    if (D.ice === 'cubes') for (let i = 0; i < 3; i++) { const ic = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.024), iceM); ic.position.set((Math.random() - 0.5) * 0.026, yTop - 0.014 - i * 0.026, (Math.random() - 0.5) * 0.03); ic.rotation.set(Math.random(), Math.random(), Math.random()); g.add(ic); }
    const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
    D.garnish.forEach(k => {
      if (k === 'cherry') { add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 14, 10), new THREE.MeshStandardMaterial({ color: '#b0101e', roughness: 0.25 })), 0.008, yTop + 0.004, 0.006); }
      if (k === 'olive') { const pick = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.1, 6), M.gold), 0.01, yTop + 0.01, 0); pick.rotation.z = 0.5; add(new THREE.Mesh(new THREE.SphereGeometry(0.01, 12, 10), new THREE.MeshStandardMaterial({ color: '#7a8a2a', roughness: 0.4 })), 0.004, yTop - 0.006, 0).scale.set(1, 1.3, 1); }
      if (k === 'lime' || k === 'lemon' || k === 'orange') {
        const c = k === 'lime' ? '#7cc242' : k === 'lemon' ? '#f4d23a' : '#f28a1a';
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.005, 24), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: c, emissiveIntensity: 0.08 }));
        wheel.rotation.z = Math.PI / 2; wheel.rotation.y = 0.4; add(wheel, R * 0.9, yTop + 0.012, 0);
      }
      if (k === 'peel' || k === 'twist') { const p = add(new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 16, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: k === 'peel' ? '#f28a1a' : '#7cc242', roughness: 0.5 })), R * 0.6, yTop + 0.008, 0); p.rotation.x = 1.2; }
      if (k === 'mint') for (let i = 0; i < 4; i++) { const lf = add(new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshStandardMaterial({ color: '#3a9a3a', roughness: 0.6 })), (Math.random() - 0.5) * 0.03, yTop + 0.006, (Math.random() - 0.5) * 0.03); lf.scale.set(1.4, 0.3, 0.8); lf.rotation.y = Math.random() * 3; }
      if (k === 'beans') for (let i = 0; i < 3; i++) { const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), new THREE.MeshStandardMaterial({ color: '#2a160c', roughness: 0.4 })), (i - 1) * 0.011, yTop + 0.003, 0); b.scale.set(1, 0.6, 1.4); }
    });
    if (D.straw) { const s = add(new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, H * 1.15, 8), new THREE.MeshStandardMaterial({ color: D.na ? '#ff5a8a' : '#111', roughness: 0.4 })), R * 0.4, 0.03, 0); s.rotation.z = -0.18; }
    const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.003, 32), new THREE.MeshStandardMaterial({ color: '#1a0a06', roughness: 0.9 }));
    const holder = new THREE.Group(); holder.add(coaster); holder.add(g); coaster.position.y = 0.0015; g.position.y += 0.003;
    holder.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { obj: holder, glass: g, liquid, lvl, D };
  }

  // bartender mixing: turn to look at the bar, shaker going, then the drink arrives at your elbow
  function order(D) {
    if (drink && drink.state !== 'ready') return false;
    if (drink) { scene.remove(drink.obj); drink = null; }
    const G = buildGlass(D);
    drink = { ...G, state: 'mixing', t: 0, sips: 0 };
    const quick = reduced();
    if (!quick) view.cine = { t: 0, dur: 4.6, from: view.yaw, fromP: view.pitch };
    bar.shaking = quick ? 0.01 : 2.6;
    snd.shake();
    setTimeout(() => snd.pour(), quick ? 0 : 2600);
    drink.arriveAt = quick ? 0.2 : 3.4;
    return true;
  }
  function sip() {
    if (!drink || drink.state !== 'ready') return;
    drink.state = 'sip'; drink.t = 0; snd.sip();
  }
  function stepDrink(dt) {
    if (!drink) return;
    const d = drink; d.t += dt;
    if (d.state === 'mixing' && d.t >= d.arriveAt) {
      d.state = 'arrive'; d.t = 0;
      scene.add(d.obj);
    }
    if (d.state === 'arrive') {
      const p = Math.min(1, d.t / 0.9), e = easeOut(p);
      d.obj.position.set(lerp(drinkSpot.x + 0.6, drinkSpot.x, e), 0, lerp(drinkSpot.z - 0.1, drinkSpot.z, e));
      d.obj.rotation.y = (1 - e) * 1.2;
      if (p >= 1) { d.state = 'ready'; snd.clink(); api.onDrink && api.onDrink('ready', d.D); }
    }
    if (d.state === 'sip') {
      // lift it toward you, tip, put it back
      const p = Math.min(1, d.t / 1.8), up = Math.sin(Math.min(1, p / 0.5) * Math.PI / 2) * (p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3);
      const eye = camera.position, fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
      const hold = new THREE.Vector3().copy(eye).addScaledVector(fwd, 0.32); hold.y -= 0.12;
      d.obj.position.set(lerp(drinkSpot.x, hold.x, up), lerp(0, hold.y, up), lerp(drinkSpot.z, hold.z, up));
      d.glass.rotation.x = -up * 0.55;
      if (p > 0.35 && !d.drank) { d.drank = true; d.sips++; }
      const target = Math.max(0.02, 1 - d.sips * 0.25);
      d.liquid.scale.y = lerp(d.liquid.scale.y, target, Math.min(1, dt * 3));
      if (p >= 1) { d.drank = false; d.state = d.sips >= 4 ? 'done' : 'ready'; d.t = 0; d.glass.rotation.x = 0; if (d.sips >= 4) api.onDrink && api.onDrink('empty', d.D); }
    }
    if (d.state === 'done') {
      const p = Math.min(1, d.t / 1.2);
      d.obj.position.x = drinkSpot.x + easeOut(p) * 0.7; d.obj.traverse(o => { if (o.material && 'opacity' in o.material) { o.material.transparent = true; } });
      d.obj.scale.setScalar(1 - p * 0.5);
      if (p >= 1) { scene.remove(d.obj); drink = null; }
    }
    if (d.state === 'ready' && d.D.bubbles && Math.random() < 0.3) { /* fizz is implied by the glass sparkle */ }
  }

  // ---------- bloom and the frame loop ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 1.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  new ResizeObserver(resize).observe(wrap);
  resize();

  const clock = new THREE.Clock();
  let tAll = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.1, clock.getDelta()); tAll += dt;
    if (!reduced()) view.sway += dt;
    // camera: a cinematic turn to the bar while your drink is mixed; otherwise drift back to the table when idle
    if (view.cine) {
      const c = view.cine; c.t += dt;
      const p = c.t / c.dur;
      const look = p < 0.25 ? ease(p / 0.25) : p < 0.72 ? 1 : 1 - ease((p - 0.72) / 0.28);
      view.yaw = lerp(c.from * (1 - Math.min(1, p * 4)), T.barYaw, look);
      view.pitch = lerp(0, T.barPitch, look);
      if (p >= 1) { view.cine = null; view.yaw = 0; view.pitch = 0; }
    } else if (!drag) {
      view.idle += dt;
      if (view.idle > 7) { view.yaw *= 1 - Math.min(1, dt * 1.5); view.pitch *= 1 - Math.min(1, dt * 1.5); }
    }
    aim();
    animated.forEach(f => f(tAll, dt));
    stepCards(dt); stepStacks(dt); stepDrink(dt);
    composer.render();
    stepLabels();
  });

  const api = { setCards, setStacks, setLabels, setPuck, chair: T.chair, order, sip, T, person, scene, wrap, hasDrink: () => !!drink, onDrink: null };
  return api;

  // =====================================================================
  // the lounge around the table
  function buildRoom() {
    // carpet
    const carpet = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#3a0c16'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * 128 + 64, cy = y * 128 + 64;
        g.strokeStyle = '#c99a2e'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#5a1424'; g.beginPath(); g.moveTo(cx, cy - 30); g.lineTo(cx + 30, cy); g.lineTo(cx, cy + 30); g.lineTo(cx - 30, cy); g.fill();
        g.fillStyle = '#1f6a5a'; g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#c99a2e'; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.arc(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64, 6, 0, Math.PI * 2); g.fill(); }
      }
      noise(g, w, h, 0.08, 20000);
    });
    carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(16, 16);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR; floor.receiveShadow = true; scene.add(floor);

    // walls: damask above, wood panels below, gold rail between
    const wallTex = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#2a0a12'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(201,154,46,.14)';
      for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) { const cx = x * 128 + 64 + (y % 2) * 64, cy = y * 110 + 60; g.beginPath(); g.ellipse(cx, cy, 26, 44, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(cx, cy, 44, 18, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#c99a2e'; g.fillRect(0, 340, w, 6);
      g.fillStyle = '#3a1a0c'; g.fillRect(0, 346, w, h - 346);
      g.strokeStyle = 'rgba(201,154,46,.35)'; g.lineWidth = 3; g.strokeRect(20, 370, w - 40, h - 400);
      noise(g, w, h, 0.05, 6000);
    });
    wallTex.wrapS = THREE.RepeatWrapping; wallTex.repeat.set(10, 1);
    const wallM = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85 });
    const RAD = 11, WH = 5;
    [[0, -RAD, 0], [RAD, 0, -Math.PI / 2], [0, RAD, Math.PI], [-RAD, 0, Math.PI / 2]].forEach(([x, z, ry]) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(RAD * 2, WH), wallM); w.position.set(x, FLOOR + WH / 2, z); w.rotation.y = ry; scene.add(w);
    });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: '#140508', roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = FLOOR + WH; scene.add(ceil);
    // recessed ceiling lights
    const dotGeo = new THREE.CircleGeometry(0.09, 16);
    const dotM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6) });
    const dots = new THREE.InstancedMesh(dotGeo, dotM, 64); let k = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    for (let x = -9; x <= 9; x += 2.6) for (let z = -9; z <= 9; z += 2.6) if (k < 64) { m4.compose(new THREE.Vector3(x, FLOOR + WH - 0.01, z), q, new THREE.Vector3(1, 1, 1)); dots.setMatrixAt(k++, m4); }
    dots.count = k; scene.add(dots);

    // chandeliers
    [[0, -5.5], [-5.5, 1.5], [5.5, 4.5], [-3, 6]].forEach(([x, z]) => {
      const c = new THREE.Group(); c.position.set(x, FLOOR + WH - 1.1, z); scene.add(c);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 40), M.gold); ring.rotation.x = Math.PI / 2; c.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 8, 32), M.gold); ring2.rotation.x = Math.PI / 2; ring2.position.y = -0.25; c.add(ring2);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6), M.gold); rod.position.y = 0.55; c.add(rod);
      const cr = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.035), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.7, 1.9) }), 36);
      for (let i = 0; i < 36; i++) { const a = (i / 18) * Math.PI * 2, r = i < 18 ? 0.55 : 0.32, y = i < 18 ? -0.08 : -0.33; m4.compose(new THREE.Vector3(Math.cos(a) * r, y - (i % 3) * 0.05, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(1, 1.8, 1)); cr.setMatrixAt(i, m4); }
      c.add(cr);
      const glow = new THREE.PointLight('#ffcf8a', 4, 6, 1.6); glow.position.y = -0.2; c.add(glow);
      animated.push(t => { cr.rotation.y = t * 0.05; });
    });

    // banks of slot machines along the back and left walls, screens flickering
    const slotBody = new THREE.BoxGeometry(0.7, 1.55, 0.6);
    const slotScreen = new THREE.PlaneGeometry(0.52, 0.42);
    const slotTop = new THREE.BoxGeometry(0.66, 0.22, 0.5);
    const bodies = new THREE.InstancedMesh(slotBody, new THREE.MeshStandardMaterial({ color: '#5a0f24', metalness: 0.4, roughness: 0.4 }), 40);
    const screens = new THREE.InstancedMesh(slotScreen, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 40);
    const tops = new THREE.InstancedMesh(slotTop, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 40);
    let n = 0;
    const put = (x, z, ry) => {
      const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
      m4.compose(new THREE.Vector3(x, FLOOR + 0.775, z), qq, new THREE.Vector3(1, 1, 1)); bodies.setMatrixAt(n, m4);
      const off = new THREE.Vector3(0, 0.25, 0.301).applyQuaternion(qq);
      m4.compose(new THREE.Vector3(x + off.x, FLOOR + 0.775 + 0.25, z + off.z), qq, new THREE.Vector3(1, 1, 1)); screens.setMatrixAt(n, m4);
      m4.compose(new THREE.Vector3(x, FLOOR + 1.66, z), qq, new THREE.Vector3(1, 1, 1)); tops.setMatrixAt(n, m4);
      n++;
    };
    for (let i = 0; i < 12; i++) put(-4.6 + i * 0.8, -RAD + 0.5, 0);
    for (let i = 0; i < 10; i++) put(-RAD + 0.5, -6 + i * 0.8, Math.PI / 2);
    for (let i = 0; i < 8; i++) put(-4.6 + i * 0.8, -6.2, Math.PI);
    for (let i = 0; i < 8; i++) put(-4.6 + i * 0.8, -6.9, 0);
    bodies.count = screens.count = tops.count = n;
    const SC = [[2.2, 0.6, 1.4], [0.5, 1.6, 2.4], [2.4, 1.8, 0.4], [1.2, 2.2, 0.8], [2.4, 0.5, 0.6], [1.6, 0.6, 2.4]];
    const col = new THREE.Color();
    const paint = t => { for (let i = 0; i < n; i++) { const c = SC[(i + Math.floor(t * 1.5 + i * 0.37)) % SC.length], f = 0.55 + 0.45 * Math.sin(t * 3 + i); screens.setColorAt(i, col.setRGB(c[0] * f, c[1] * f, c[2] * f)); const on = (Math.floor(t * 4) + i) % 3 === 0; tops.setColorAt(i, col.setRGB(on ? 2.6 : 1.2, on ? 1.9 : 0.6, on ? 0.6 : 0.3)); } screens.instanceColor.needsUpdate = true; tops.instanceColor.needsUpdate = true; };
    paint(0);
    let last = 0; animated.push(t => { if (t - last > 0.12) { last = t; paint(t); } });
    scene.add(bodies, screens, tops);

    // other tables with a lamp each and a few guests
    [[-4.2, -2.8], [4.0, -4.2], [-5.6, 4.2], [2.8, 6.4]].forEach(([x, z], i) => {
      const t = new THREE.Group(); t.position.set(x, 0, z); scene.add(t);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.05, 40), new THREE.MeshStandardMaterial({ color: i % 2 ? '#0f5a3e' : '#7a1626', roughness: 0.9 })); t.add(top);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 8, 40), M.leather); rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; t.add(rim);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, -FLOOR, 16), M.darkwood); leg.position.y = FLOOR / 2; t.add(leg);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#1a3a2a', side: THREE.DoubleSide, roughness: 0.5 })); shade.position.y = 1.5; t.add(shade);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 1.5) })); bulb.rotation.x = Math.PI / 2; bulb.position.y = 1.36; t.add(bulb);
      const pool = new THREE.PointLight('#ffd9a0', 5, 3, 1.6); pool.position.y = 1.2; t.add(pool);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.5, 4), M.black); cord.position.y = 2.9; t.add(cord);
      for (let s = 0; s < 3; s++) {
        const a = (s / 3) * Math.PI * 2 + i, p = person({ shirt: ['#2a2a3a', '#5a1a2a', '#1a3a4a', '#3a2a1a'][(s + i) % 4], hair: ['#1a1208', '#5a3a1a', '#0a0a0a'][s % 3], skin: ['#d9b896', '#a87a5a', '#e8c8a8'][(s + i) % 3] });
        p.position.set(Math.cos(a) * 1.35, -0.38, Math.sin(a) * 1.35); p.lookAt(x, -0.38, z); p.position.x += 0; t.add(p);
        p.lookAt(new THREE.Vector3(x, p.position.y - 0.38, z)); p.rotation.set(0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0);
        const ph = Math.random() * 6; animated.push(tt => { p.userData.head.rotation.y = Math.sin(tt * 0.4 + ph) * 0.4; });
      }
    });

    // columns
    [[-7, -7.5], [7, -7.5], [-7.5, 7], [7.5, 7.5]].forEach(([x, z]) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, WH, 20), new THREE.MeshStandardMaterial({ color: '#2a0e12', roughness: 0.5 })); c.position.set(x, FLOOR + WH / 2, z); scene.add(c);
      [0.2, WH - 0.25].forEach(y => { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.18, 20), M.gold); cap.position.set(x, FLOOR + y, z); scene.add(cap); });
    });

    // neon sign on the back wall
    const neon = canvasTex(1024, 200, (g, w, h) => {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic 700 120px Georgia, serif';
      g.shadowColor = '#ff3d7f'; g.shadowBlur = 30; g.fillStyle = '#ffd0e0'; g.fillText('Odds Lounge', w / 2, h / 2);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1), new THREE.MeshBasicMaterial({ map: neon, transparent: true, color: new THREE.Color(2.2, 1.6, 1.8) }));
    sign.position.set(0, FLOOR + 3.4, -RAD + 0.05); scene.add(sign);
    animated.push(t => { const f = 1.6 + 0.6 * Math.sin(t * 2) + (Math.random() < 0.01 ? -1 : 0); sign.material.color.setRGB(f * 1.2, f * 0.85, f); });

    // the bar along the right wall
    const bx = 7.6;
    const barG = new THREE.Group(); scene.add(barG);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 7), M.wood); counter.position.set(bx, FLOOR + 0.55, 0); barG.add(counter);
    const ctop = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 7.1), new THREE.MeshStandardMaterial({ color: '#160806', roughness: 0.2, metalness: 0.3 })); ctop.position.set(bx, FLOOR + 1.12, 0); barG.add(ctop);
    const ctrim = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 7), M.gold); ctrim.position.set(bx - 0.47, FLOOR + 1.1, 0); barG.add(ctrim);
    const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 0.4) })); glowStrip.position.set(bx - 0.41, FLOOR + 0.15, 0); barG.add(glowStrip);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.65, 0.25) })); back.position.set(RAD - 0.06, FLOOR + 2.2, 0); back.rotation.y = -Math.PI / 2; barG.add(back);
    for (let s = 0; s < 3; s++) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 6.6), new THREE.MeshStandardMaterial({ color: '#2a1408', roughness: 0.3 })); sh.position.set(RAD - 0.2, FLOOR + 1.45 + s * 0.55, 0); barG.add(sh); }
    const bottle = new THREE.CylinderGeometry(0.04, 0.045, 0.3, 10);
    const bottles = new THREE.InstancedMesh(bottle, new THREE.MeshStandardMaterial({ roughness: 0.15, transparent: true, opacity: 0.85 }), 120);
    const BC = ['#2a6a2a', '#a8651a', '#e8e0c8', '#6a1a2a', '#1a3a6a', '#d8a020', '#3a1a0a'];
    let bi = 0;
    for (let s = 0; s < 3; s++) for (let i = 0; i < 40; i++) { m4.compose(new THREE.Vector3(RAD - 0.2, FLOOR + 1.62 + s * 0.55, -3.1 + i * 0.158), new THREE.Quaternion(), new THREE.Vector3(1, 0.8 + Math.random() * 0.5, 1)); bottles.setMatrixAt(bi, m4); bottles.setColorAt(bi, col.set(BC[(i * 7 + s * 3) % BC.length])); bi++; }
    barG.add(bottles);
    for (let i = 0; i < 6; i++) { // stools
      const st = new THREE.Group(); st.position.set(bx - 0.75, FLOOR, -2.6 + i * 1.05); barG.add(st);
      const seatM = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#6a1222', roughness: 0.5 })); seatM.position.y = 0.78; st.add(seatM);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 8), M.gold); leg.position.y = 0.38; st.add(leg);
    }
    const barSign = canvasTex(512, 160, (g, w, h) => { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 110px Georgia, serif'; g.shadowColor = '#3de0ff'; g.shadowBlur = 24; g.fillStyle = '#d8faff'; g.fillText('BAR', w / 2, h / 2); });
    const bs = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.56), new THREE.MeshBasicMaterial({ map: barSign, transparent: true, color: new THREE.Color(2.2, 2.4, 2.6) }));
    bs.position.set(RAD - 0.08, FLOOR + 3.75, 0); bs.rotation.y = -Math.PI / 2; barG.add(bs);
    // the bartender, with a shaker
    const tender = person({ shirt: '#f2efe8', vest: '#151515', bow: '#a01020', hair: '#1a1008', skin: '#c89a78', arms: 'up' });
    tender.position.set(bx + 0.75, FLOOR + 0.92, 0.2); tender.rotation.y = -Math.PI / 2; barG.add(tender);
    const shaker = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 16), new THREE.MeshStandardMaterial({ color: '#d8d8e0', metalness: 1, roughness: 0.15 }));
    tender.userData.armR.userData.fore.add(shaker); shaker.position.set(0, -0.3, 0.04);
    const barState = { shaking: 0 };
    animated.push((t, dt) => {
      barState.shaking = Math.max(0, barState.shaking - dt);
      const on = barState.shaking > 0, s = on ? Math.sin(t * 28) : 0;
      tender.userData.armR.rotation.x = -0.9 - s * 0.35 - (on ? 0.6 : 0);
      tender.userData.armL.rotation.x = -0.6 - s * 0.25 - (on ? 0.5 : 0);
      tender.userData.head.rotation.y = on ? 0 : Math.sin(t * 0.5) * 0.5;
      tender.position.y = FLOOR + 0.92 + (on ? Math.abs(s) * 0.01 : 0);
    });
    scene.userData.bar = barState;
  }

  // =====================================================================
  function feltTexture(W, H, draw) {
    return canvasTex(Math.round(W * 700), Math.round(H * 700), (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, w * 0.7);
      gr.addColorStop(0, '#24704f'); gr.addColorStop(0.6, '#17553b'); gr.addColorStop(1, '#0d3a27');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      noise(g, w, h, 0.05, w * h / 30);
      draw(g, w, h);
    });
  }
  function arcText(g, text, cx, cy, r, a0, size, color, font = 'Georgia, serif', weight = '700') {
    g.save(); g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const widths = [...text].map(ch => g.measureText(ch).width), total = widths.reduce((a, b) => a + b, 0);
    let a = a0 + total / r / 2;
    [...text].forEach((ch, i) => { const aa = a - widths[i] / r / 2; g.save(); g.translate(cx + Math.cos(aa) * r, cy + Math.sin(aa) * r); g.rotate(aa - Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); a -= widths[i] / r; });
    g.restore();
  }
  function tableFrom(shape, railCurve, minX, minY, W, H, tex, legR) {
    // felt
    tex.repeat.set(1 / W, 1 / H); tex.offset.set(-minX / W, -minY / H);
    const top = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    top.rotation.x = -Math.PI / 2; top.receiveShadow = true; scene.add(top);
    // wooden apron under the felt
    const apron = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.06, bevelSegments: 3, curveSegments: 48 }), M.wood);
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.125; scene.add(apron);
    // padded rail
    const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve, 200, 0.055, 14, railCurve.closed), M.leather);
    rail.position.y = 0.025; rail.castShadow = true; rail.receiveShadow = true; scene.add(rail);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(legR * 0.5, legR, -FLOOR - 0.1, 24), M.darkwood); leg.position.y = (FLOOR - 0.1) / 2; scene.add(leg);
  }
  function chair(x, z, face) {
    const c = new THREE.Group(); c.position.set(x, FLOOR, z); c.rotation.y = face; scene.add(c);
    const seatM = new THREE.MeshStandardMaterial({ color: '#5a0f1e', roughness: 0.6 });
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.44), seatM); s.position.y = 0.48; c.add(s);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.08), seatM); b.position.set(0, 0.78, 0.22); c.add(b);
    [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]].forEach(([lx, lz]) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6), M.gold); l.position.set(lx, 0.23, lz); c.add(l); });
    return c;
  }

  function buildBJTable() {
    // straight edge on the dealer's side (far), an arc toward you
    const R = 1.25, D = 0.6;
    const shape = new THREE.Shape(); shape.moveTo(-R, D); shape.lineTo(R, D); shape.absellipse(0, D, R, R + 0.45, 0, Math.PI, true);
    const pts = []; for (let i = 0; i <= 80; i++) { const a = -Math.PI * (i / 80); pts.push(new THREE.Vector3(Math.cos(a) * (R + 0.04), 0, -(D + Math.sin(a) * (R + 0.49)))); }
    const railCurve = new THREE.CatmullRomCurve3(pts);
    const W = 2 * R, H = R + 0.45 + D, minY = D - (R + 0.45);
    const rulesTxt = (document.getElementById('rulesText') || {}).textContent || '';
    const pays = /6:5/.test(rulesTxt) ? 'BLACKJACK PAYS 6 TO 5' : 'BLACKJACK PAYS 3 TO 2';
    const h17 = /H17|hits soft/i.test(rulesTxt) ? 'DEALER HITS SOFT 17' : 'DEALER STANDS ON ALL 17s';
    const tex = feltTexture(W, H, (g, w, h) => {
      const sx = w / W, sy = h / H, cx = w / 2, cy = (D - minY) * sy * 0 + (h - (D - minY) * sy); // centre of the straight edge, in canvas pixels
      const ycen = h - (D - minY) * sy; // canvas y of shape y = D (top edge sits at canvas top)
      const toC = (x, y) => [cx + x * sx, h - (y - minY) * sy];
      const [ox, oy] = toC(0, D);
      g.strokeStyle = 'rgba(242,210,140,.7)'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(ox, oy, 0.9 * sx, 1.3 * sy, 0, 0, Math.PI); g.stroke();
      g.beginPath(); g.ellipse(ox, oy, 0.62 * sx, 0.92 * sy, 0, 0, Math.PI); g.stroke();
      arcText(g, pays, ox, oy, 0.76 * sx, Math.PI / 2, 44, 'rgba(255,228,170,.92)');
      arcText(g, h17 + ' · INSURANCE PAYS 2 TO 1', ox, oy, 1.08 * sx, Math.PI / 2, 30, 'rgba(255,228,170,.75)', 'Arial, sans-serif', '700');
      // your betting circle
      const [bx, by] = toC(0, -0.62);
      g.strokeStyle = 'rgba(255,236,190,.85)'; g.lineWidth = 5; g.beginPath(); g.arc(bx, by, 0.1 * sx, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.arc(bx, by, 0.085 * sx, 0, Math.PI * 2); g.stroke();
      g.font = 'italic 600 54px Georgia, serif'; g.fillStyle = 'rgba(255,228,170,.4)'; g.textAlign = 'center'; g.fillText('Odds Lounge', ox, oy + 0.26 * sy);
      void ycen;
    });
    tableFrom(shape, railCurve, -R, minY, W, H, tex, 0.5);
    // chip rack in front of the dealer, discard tray, shoe
    const rack = new THREE.Group(); rack.position.set(0, 0.012, -0.5); scene.add(rack);
    const rb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.025, 0.12), M.darkwood); rack.add(rb);
    ['gold', 'black', 'green', 'red', 'white', 'green', 'red', 'black'].forEach((c, i) => {
      for (let k = 0; k < 9; k++) { const m = new THREE.Mesh(chipGeoRack, chipMatsRack(c)); m.rotation.z = Math.PI / 2; m.position.set(-0.27 + i * 0.077 + k * 0.0043 - 0.02, 0.025, 0); rack.add(m); }
    });
    const shoe = new THREE.Group(); shoe.position.set(0.85, 0, -0.32); shoe.rotation.y = -0.5; scene.add(shoe);
    const sb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.22), new THREE.MeshStandardMaterial({ color: '#1a0a08', roughness: 0.3, metalness: 0.2 })); sb.position.y = 0.05; sb.castShadow = true; shoe.add(sb);
    const sd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.18), backMat); sd.position.set(0, 0.07, -0.01); sd.rotation.x = 0.3; shoe.add(sd);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.18), new THREE.MeshStandardMaterial({ color: '#c8c8d0', metalness: 0.9, roughness: 0.3, transparent: true, opacity: 0.6 })); tray.position.set(-0.85, 0.03, -0.32); tray.rotation.y = 0.5; scene.add(tray);
    // the dealer
    const dealer = person({ shirt: '#f4f1ea', vest: '#121212', bow: '#9a0f1f', hair: '#2a1a0e', skin: '#d4ad8c', arms: 'up' });
    dealer.position.set(0, 0.02, -0.98); scene.add(dealer);
    animated.push(t => { dealer.userData.head.rotation.y = Math.sin(t * 0.35) * 0.25; dealer.userData.torso.position.y = 0.22 + Math.sin(t * 1.3) * 0.003; });
    // the empty seats beside you, and yours
    [-1.05, -0.55, 0.55, 1.05].forEach(x => chair(x * 1.05, Math.sqrt(Math.max(0, 1 - (x / 1.4) ** 2)) * 1.3 + 0.15, Math.atan2(x, 1) ));
    return {
      seat: { pos: new THREE.Vector3(0, 0.43, 0.98), target: new THREE.Vector3(0, 0.07, -0.42) },
      dealFrom: { x: 0.8, z: -0.3 }, muck: { x: -0.85, z: -0.32 },
      drinkSpot: { x: 0.27, z: 0.6 }, barYaw: 1.38, barPitch: 0.06, dealer,
    };
  }

  function buildHoldemTable() {
    const A = 1.35, B = 0.75;
    const shape = new THREE.Shape();
    shape.moveTo(-A + B, -B); shape.lineTo(A - B, -B); shape.absarc(A - B, 0, B, -Math.PI / 2, Math.PI / 2, false); shape.lineTo(-A + B, B); shape.absarc(-A + B, 0, B, Math.PI / 2, Math.PI * 1.5, false);
    const rp = shape.getSpacedPoints(160).map(p => { const cx = Math.max(-A + B, Math.min(A - B, p.x)), d = new THREE.Vector2(p.x - cx, p.y).normalize(); return new THREE.Vector3(p.x + d.x * 0.045, 0, -(p.y + d.y * 0.045)); });
    const railCurve = new THREE.CatmullRomCurve3(rp, true);
    const tex = feltTexture(2 * A, 2 * B, (g, w, h) => {
      const sx = w / (2 * A), sy = h / (2 * B);
      g.strokeStyle = 'rgba(242,210,140,.45)'; g.lineWidth = 4;
      rrStadium(g, w / 2, h / 2, (A - 0.22) * sx, (B - 0.22) * sy);
      g.font = 'italic 600 70px Georgia, serif'; g.fillStyle = 'rgba(255,228,170,.33)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Odds Lounge', w / 2, h / 2 + 0.3 * sy);
      g.font = '700 26px Arial'; g.fillStyle = 'rgba(255,228,170,.3)'; g.fillText("TEXAS HOLD'EM · NO LIMIT", w / 2, h / 2 - 0.34 * sy);
    });
    tableFrom(shape, railCurve, -A, -B, 2 * A, 2 * B, tex, 0.45);
    return {
      seat: { pos: new THREE.Vector3(0, 0.46, 1.02), target: new THREE.Vector3(0, 0.05, -0.38) },
      dealFrom: { x: 0, z: -0.45 }, muck: { x: 0.35, z: -0.42 },
      drinkSpot: { x: 0.28, z: 0.58 }, barYaw: 1.4, barPitch: 0.06, A, B, chair,
    };
  }
  function rrStadium(g, cx, cy, a, b) { g.beginPath(); g.moveTo(cx - a + b, cy - b); g.lineTo(cx + a - b, cy - b); g.arc(cx + a - b, cy, b, -Math.PI / 2, Math.PI / 2); g.lineTo(cx - a + b, cy + b); g.arc(cx - a + b, cy, b, Math.PI / 2, Math.PI * 1.5); g.stroke(); }
}
// rack chips are just coloured discs (shared)
const chipGeoRack = new THREE.CylinderGeometry(0.019, 0.019, 0.0042, 20);
const rackMats = {};
const chipMatsRack = c => rackMats[c] || (rackMats[c] = new THREE.MeshStandardMaterial({ color: CHIP_COL[c][0], roughness: 0.45 }));

// ---------- the drinks menu dialog (shared by both tables) ----------
export function barButton(host, casino) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 't3-barbtn';
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16l-7 8v6h3v2H8v-2h3v-6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="17" cy="6" r="2.2" fill="currentColor"/></svg>Order a drink';
  host.appendChild(btn);
  const toast = document.createElement('div'); toast.className = 't3-toast'; toast.setAttribute('role', 'status'); host.appendChild(toast);
  let tt = null;
  const say = (s, ms = 3800) => { toast.innerHTML = s; toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => toast.classList.remove('on'), ms); };
  casino.onDrink = (st, D) => {
    if (st === 'ready') say(`Your <b>${D.name}</b> is here. On the house. Click the glass to take a sip.`, 5200);
    if (st === 'empty') say('All gone. Another round? The bar is always open.');
  };
  btn.onclick = () => {
    let dlg = document.getElementById('barDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'barDlg'; dlg.className = 'rules bar-dlg'; document.body.appendChild(dlg); }
    dlg.innerHTML = `<h2>The bar</h2><p class="sub">Drinks are on the house while you play. Pick one and the bartender will mix it.</p>
      <div class="drinks">${DRINKS.map(d => `<button type="button" class="drink" data-id="${d.id}"><span class="sw" style="--c:${d.col};--c2:${d.col2 || d.col}"></span><span><b>${d.name}</b>${d.na ? '<em>No alcohol</em>' : ''}<br><small>${d.note}</small></span></button>`).join('')}</div>
      <div class="rule-actions"><button type="button" class="ghostbtn" data-close>Not now</button></div>`;
    dlg.onclick = e => {
      if (e.target.closest('[data-close]')) return dlg.close();
      const b = e.target.closest('[data-id]'); if (!b) return;
      const D = DRINKS.find(x => x.id === b.dataset.id);
      dlg.close();
      if (casino.order(D)) say(`One <b>${D.name}</b> coming up…`, 3200);
      else say('Your last drink is still on its way.');
    };
    dlg.showModal();
  };
  return btn;
}
