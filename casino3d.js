// A seat at a 3D casino table (Three.js): the lounge around you, the table, real cards and chip stacks,
// the dealer or the other players, and a bar that will mix you a drink.
// The card games keep all their logic; they hand this module plain descriptions of what is on the table.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
  scene.background = new THREE.Color('#1a0c08');
  scene.fog = new THREE.Fog('#1c0e09', 8, 26);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;
  const camera = new THREE.PerspectiveCamera(46, 16 / 10, 0.02, 60);
  const animated = [];   // things in the room that move on their own: (t, dt) => void

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight('#ffe6c8', '#3a1a10', 0.55));
  const lamp = new THREE.SpotLight('#ffe6c4', 7, 6, 0.62, 0.65, 1.3);
  lamp.position.set(0, 2.3, 0.1); lamp.target.position.set(0, 0, -0.05);
  lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0004; lamp.shadow.radius = 4;
  scene.add(lamp, lamp.target);
  const fill = new THREE.PointLight('#ffc89a', 1.6, 5, 1.4); fill.position.set(0.4, 1.1, 1.4); scene.add(fill);

  // ---------- materials ----------
  const M = {
    gold: new THREE.MeshStandardMaterial({ color: '#d9a843', metalness: 1, roughness: 0.3 }),
    wood: new THREE.MeshStandardMaterial({ color: '#4a2412', roughness: 0.45, metalness: 0.1 }),
    darkwood: new THREE.MeshStandardMaterial({ color: '#2a1209', roughness: 0.5 }),
    leather: new THREE.MeshStandardMaterial({ color: '#1e0c08', roughness: 0.55, metalness: 0.05 }),
    black: new THREE.MeshStandardMaterial({ color: '#0c0507', roughness: 0.7 }),
    silhouette: new THREE.MeshStandardMaterial({ color: '#1a0d10', roughness: 0.9 }),
  };


  // ---------- people ----------
  // Faces: a real 3D head scan ("Infinite" by Lee Perry-Smith, CC BY 3.0, via the three.js examples), shared by
  // everyone and made different with skin tone, hair, glasses and clothes. Until it loads, a plain head stands in.
  const HEAD_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/LeePerrySmith/';
  const headAsset = new Promise(res => {
    try {
      new GLTFLoader().load(HEAD_URL + 'LeePerrySmith.glb', gltf => {
        let mesh = null; gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
        if (!mesh) return res(null);
        let geo = mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld);
        geo.computeBoundingBox();
        const full = new THREE.Vector3(); geo.boundingBox.getSize(full);
        // keep the head and neck only: drop every triangle that reaches into the shoulders of the bust
        const cut = geo.boundingBox.min.y + full.y * 0.34, pos = geo.attributes.position;
        const idx = geo.index ? Array.from(geo.index.array) : [...Array(pos.count).keys()];
        const keep = [];
        for (let i = 0; i < idx.length; i += 3) if (pos.getY(idx[i]) > cut && pos.getY(idx[i + 1]) > cut && pos.getY(idx[i + 2]) > cut) keep.push(idx[i], idx[i + 1], idx[i + 2]);
        geo.setIndex(keep);
        // size it from the crown to the cut, and put the bottom of the neck at the origin
        const box = new THREE.Box3(); for (const i of keep) box.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
        const size = new THREE.Vector3(), c = new THREE.Vector3(); box.getSize(size); box.getCenter(c);
        const k = 0.255 / size.y; geo.translate(-c.x, -box.min.y, -c.z); geo.scale(k, k, k);
        const tl = new THREE.TextureLoader();
        const map = tl.load(HEAD_URL + 'Map-COL.jpg'); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
        const normal = tl.load(HEAD_URL + 'Infinite-Level_02_Tangent_SmoothUV.jpg');
        res({ geo, map, normal, h: size.y * k, d: size.z * k, w: size.x * k });
      }, undefined, () => res(null));
    } catch (e) { res(null); }
  });
  const UP = new THREE.Vector3(0, 1, 0);
  // place a limb (a capsule of known length) between two points
  function limb(mesh, a, b) { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); mesh.position.copy(a).addScaledVector(d, 0.5); mesh.quaternion.setFromUnitVectors(UP, d.normalize()); mesh.scale.set(1, L / mesh.userData.len, 1); }
  function person({ shirt = '#e8e2d6', vest = null, hair = '#2a1a12', hairStyle = 'short', skin = [1, 1, 1], bow = null, glasses = false, trousers = '#15110f', seated = true } = {}) {
    const g = new THREE.Group();
    const sm = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.78 });
    const tint = new THREE.Color(skin[0], skin[1], skin[2]);
    const km = new THREE.MeshStandardMaterial({ color: new THREE.Color('#d8b496').multiply(tint), roughness: 0.6 });
    // torso shaped on a lathe: waist, chest, broad shoulders, narrowing to the neck
    const prof = [[0.135, -0.02], [0.145, 0.06], [0.158, 0.16], [0.168, 0.26], [0.172, 0.33], [0.16, 0.38], [0.11, 0.425], [0.055, 0.45]].map(([r, y]) => new THREE.Vector2(r, y));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), sm); torso.scale.set(1.12, 1, 0.66); g.add(torso);
    if (vest) { // open at the front so the shirt and tie show
      const vp = prof.slice(0, 6).map(v => new THREE.Vector2(v.x + 0.006, v.y));
      const v = new THREE.Mesh(new THREE.LatheGeometry(vp, 28, 0.42, Math.PI * 2 - 0.84), new THREE.MeshStandardMaterial({ color: vest, roughness: 0.55, side: THREE.DoubleSide }));
      v.scale.copy(torso.scale); g.add(v);
      [-1, 1].forEach(sd => { const btn = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), M.gold); btn.position.set(sd * 0.045, 0.12 + (sd > 0 ? 0.06 : 0), 0.112); g.add(btn); });
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20), sm); collar.rotation.x = Math.PI / 2; collar.position.y = 0.445; g.add(collar);
    if (bow) {
      const bm = new THREE.MeshStandardMaterial({ color: bow, roughness: 0.45 });
      [-1, 1].forEach(sd => { const w = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.034, 10), bm); w.rotation.z = sd * Math.PI / 2; w.position.set(sd * 0.017, 0.43, 0.06); g.add(w); });
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), bm); knot.position.set(0, 0.43, 0.062); g.add(knot);
    }
    [-1, 1].forEach(sd => { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 12), sm); sh.scale.set(1, 0.85, 0.95); sh.position.set(sd * 0.18, 0.37, 0); g.add(sh); });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.05, 0.08, 14), km); neck.position.y = 0.47; g.add(neck);
    // head: the plain stand-in, swapped for the scan when it arrives
    const headG = new THREE.Group(); headG.position.y = 0.42; g.add(headG);
    const look = new THREE.Group(); look.rotation.x = 0.2; headG.add(look);   // eyes down to the table
    const stand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 18), km); stand.scale.set(0.88, 1.1, 0.98); stand.position.y = 0.19; look.add(stand);
    headAsset.then(H => {
      if (!H) return;
      look.remove(stand); neck.visible = false;
      const hm = new THREE.MeshStandardMaterial({ map: H.map, normalMap: H.normal, color: tint, roughness: 0.55, normalScale: new THREE.Vector2(0.8, 0.8) });
      const head = new THREE.Mesh(H.geo, hm); head.castShadow = true; look.add(head);
      const hh = H.h, cy = hh * 0.7;   // the centre of the skull
      const hairM = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.85 });
      if (hairStyle !== 'none') {   // hair over the crown and the back of the head, clear of the face
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), hairM);
        cap.scale.set(hh * 0.33, hh * 0.36, hh * 0.39); cap.position.set(0, cy - hh * 0.02, -hh * 0.06); cap.rotation.x = -0.5; look.add(cap);
      }
      if (hairStyle === 'long') { const back = new THREE.Mesh(new THREE.CapsuleGeometry(hh * 0.3, hh * 0.45, 6, 16), hairM); back.scale.z = 0.55; back.position.set(0, cy - hh * 0.3, -hh * 0.2); look.add(back); }
      if (hairStyle === 'bun') { const bun = new THREE.Mesh(new THREE.SphereGeometry(hh * 0.15, 16, 12), hairM); bun.position.set(0, cy + hh * 0.2, -hh * 0.3); look.add(bun); }
      if (glasses) {
        const gm = new THREE.MeshStandardMaterial({ color: '#141414', metalness: 0.6, roughness: 0.3 });
        [-1, 1].forEach(sd => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.0022, 6, 20), gm); r.position.set(sd * hh * 0.12, cy - hh * 0.1, hh * 0.37); look.add(r); });
        const br = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.003, 0.003), gm); br.position.set(0, cy - hh * 0.09, hh * 0.38); look.add(br);
      }
    });
    // arms: placed by a two-bone reach, so hands land exactly where they are put (on the table, not through it)
    const capsule = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat); m.userData.len = len + r * 2; return m; };
    const arms = {};
    [['L', -1], ['R', 1]].forEach(([k, sd]) => {
      const up = capsule(0.04, 0.2, sm), fo = capsule(0.035, 0.19, sm);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.03, 12), new THREE.MeshStandardMaterial({ color: vest ? '#f4f1ea' : shirt, roughness: 0.7 }));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), km); hand.scale.set(1.0, 0.5, 1.4);
      g.add(up, fo, cuff, hand);
      arms[k] = { sd, up, fo, cuff, hand, shoulder: new THREE.Vector3(sd * 0.18, 0.37, 0), L1: 0.27, L2: 0.26 };
    });
    function reach(k, x, y, z) {
      const A = arms[k], S = A.shoulder, T2 = new THREE.Vector3(x, y, z);
      const d = new THREE.Vector3().subVectors(T2, S); let dist = d.length();
      const max = A.L1 + A.L2 - 0.002; if (dist > max) { d.setLength(max); T2.copy(S).add(d); dist = max; }
      const dn = d.clone().normalize();
      const a = (A.L1 * A.L1 - A.L2 * A.L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, A.L1 * A.L1 - a * a));
      const bend = new THREE.Vector3(A.sd * 0.22, -1, -0.2); bend.addScaledVector(dn, -bend.dot(dn)).normalize();
      const E = S.clone().addScaledVector(dn, a).addScaledVector(bend, h);
      limb(A.up, S, E); limb(A.fo, E, T2);
      const fd = new THREE.Vector3().subVectors(T2, E).normalize();
      A.cuff.position.copy(T2).addScaledVector(fd, -0.035); A.cuff.quaternion.setFromUnitVectors(UP, fd);
      A.hand.position.copy(T2).addScaledVector(fd, 0.02); A.hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(fd.x, 0, fd.z).normalize());
    }
    // lower body: hips, thighs forward, shins down to the floor (mostly under the table, but no floating torsos)
    const tm = new THREE.MeshStandardMaterial({ color: trousers, roughness: 0.8 });
    const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.15, 0.1, 20), tm); hips.scale.z = 0.7; hips.position.y = -0.06; g.add(hips);
    if (seated) [-1, 1].forEach(sd => {
      const th = capsule(0.07, 0.3, tm); limb(th, new THREE.Vector3(sd * 0.09, -0.08, 0), new THREE.Vector3(sd * 0.1, -0.1, 0.4)); g.add(th);
      const sh = capsule(0.055, 0.34, tm); limb(sh, new THREE.Vector3(sd * 0.1, -0.1, 0.4), new THREE.Vector3(sd * 0.1, -0.52, 0.44)); g.add(sh);
    });
    g.userData = { head: headG, torso, reach, arms };
    reach('L', -0.16, 0.05, 0.4); reach('R', 0.16, 0.05, 0.4);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  const SKINS = [[1, 1, 1], [0.9, 0.78, 0.68], [1.06, 1.0, 0.94], [0.72, 0.56, 0.44], [0.95, 0.86, 0.74]];

  buildRoom();

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
        if (T.dealer) setTimeout(() => T.dealer.userData.dealTo(d.x, d.z), Math.max(0, -rec.t) * 1000);
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
    o.position.set(p.x, p.y + 0.0016 + Math.sin(Math.abs(p.tilt || 0)) * CH / 2, p.z);
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
      const tl = lerp(a.tilt, b.tilt, e);
      o.position.set(x, y + 0.0016 + Math.sin(Math.abs(tl)) * CH / 2, z);
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
    if (api.debugCam) { camera.position.fromArray(api.debugCam[0]); camera.lookAt(...api.debugCam[1]); return; }
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.5, 1.85);
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

  // a spot on a card plane tilted toward you: du moves up the card, dx across it, layer lifts it off the card below
  function onPlane(x, z, tilt, du = 0, dx = 0, layer = 0) {
    const c = Math.cos(tilt), sn = Math.sin(tilt);
    return { x: x + dx, z: z - c * du + sn * layer * 0.0022, y: sn * du + c * layer * 0.0022, tilt };
  }
  const api = { camera, debugCam: null, onPlane, SKINS, setCards, setStacks, setLabels, setPuck, chair: T.chair, order, sip, T, person, scene, wrap, hasDrink: () => !!drink, onDrink: null };
  return api;

  // =====================================================================
  // the lounge around the table, in the spirit of the Cotai resorts: warm gold, lacquer red, marble,
  // crystal, flowers and soft indirect light (no harsh glare)
  function buildRoom() {
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), Q0 = new THREE.Quaternion(), V1 = new THREE.Vector3(1, 1, 1);
    // carpet: peony rosettes and scrolls on deep red
    const carpet = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#4a0f18'; g.fillRect(0, 0, w, h);
      const rosette = (cx, cy, r) => {
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.fillStyle = k % 2 ? '#7a1a26' : '#8c2430'; g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.5, r * 0.26, a, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#c99a2e'; g.beginPath(); g.arc(cx, cy, r * 0.2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(201,154,46,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r * 1.05, 0, Math.PI * 2); g.stroke();
      };
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) rosette(x * 256 + 128, y * 256 + 128, 70);
      g.strokeStyle = 'rgba(40,90,80,.7)'; g.lineWidth = 6;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(i % 2 ? 0 : 256, i < 2 ? 0 : 256, 60, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(i % 2 ? 512 : 256, i < 2 ? 512 : 256, 60, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = 'rgba(201,154,46,.5)'; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc((i % 4) * 128 + 64, Math.floor(i / 4) * 128, 4, 0, Math.PI * 2); g.fill(); }
      noise(g, w, h, 0.07, 18000);
    });
    carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.repeat.set(14, 14);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR; floor.receiveShadow = true; scene.add(floor);

    // walls: red lacquer with gold lattice (fretwork) panels above a dark wood wainscot
    const wallTex = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#3a0a12'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(214,170,80,.55)'; g.lineWidth = 3;
      g.strokeRect(18, 40, w - 36, 270); g.strokeRect(28, 50, w - 56, 250);
      // fret pattern inside the panel
      g.lineWidth = 2; g.strokeStyle = 'rgba(214,170,80,.35)';
      for (let y = 70; y < 290; y += 36) for (let x = 44; x < w - 44; x += 36) { g.strokeRect(x, y, 24, 24); g.beginPath(); g.moveTo(x + 12, y); g.lineTo(x + 12, y + 12); g.lineTo(x + 24, y + 12); g.stroke(); }
      g.fillStyle = '#c99a2e'; g.fillRect(0, 336, w, 5);
      const wd = g.createLinearGradient(0, 341, 0, h); wd.addColorStop(0, '#3a1c0e'); wd.addColorStop(1, '#22100a'); g.fillStyle = wd; g.fillRect(0, 341, w, h - 341);
      g.strokeStyle = 'rgba(201,154,46,.3)'; g.lineWidth = 2; g.strokeRect(24, 362, w - 48, h - 390);
      noise(g, w, h, 0.04, 5000);
    });
    wallTex.wrapS = THREE.RepeatWrapping; wallTex.repeat.set(9, 1);
    const wallM = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.6, metalness: 0.1 });
    const RAD = 11, WH = 5.2;
    [[0, -RAD, 0], [RAD, 0, -Math.PI / 2], [0, RAD, Math.PI], [-RAD, 0, Math.PI / 2]].forEach(([x, z, ry]) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(RAD * 2, WH), wallM); w.position.set(x, FLOOR + WH / 2, z); w.rotation.y = ry; scene.add(w);
    });

    // coffered ceiling: gold beams, softly lit recesses, warm cove light along the walls
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: '#2a1410', roughness: 0.8 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = FLOOR + WH; scene.add(ceil);
    const beamM = new THREE.MeshStandardMaterial({ color: '#b8862e', metalness: 0.85, roughness: 0.35 });
    const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(22, 0.16, 0.14), beamM, 30); let bn = 0;
    for (let i = -10; i <= 10; i += 2) { m4.compose(new THREE.Vector3(0, FLOOR + WH - 0.08, i), Q0, V1); beams.setMatrixAt(bn++, m4); m4.compose(new THREE.Vector3(i, FLOOR + WH - 0.08, 0), new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2), V1); beams.setMatrixAt(bn++, m4); }
    beams.count = bn; scene.add(beams);
    const recess = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.36, 0.2) }), 121); let rn = 0;
    const qd = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    for (let x = -9; x <= 9; x += 2) for (let z = -9; z <= 9; z += 2) { m4.compose(new THREE.Vector3(x, FLOOR + WH - 0.02, z), qd, V1); recess.setMatrixAt(rn++, m4); }
    recess.count = rn; scene.add(recess);
    const coveM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.72, 0.38) });
    [[0, -RAD + 0.15, 0], [RAD - 0.15, 0, Math.PI / 2], [0, RAD - 0.15, 0], [-RAD + 0.15, 0, Math.PI / 2]].forEach(([x, z, ry]) => { const c = new THREE.Mesh(new THREE.BoxGeometry(21.5, 0.05, 0.05), coveM); c.position.set(x, FLOOR + WH - 0.35, z); c.rotation.y = ry; scene.add(c); });

    // crystal chandeliers: tiers of crystal drops on gold rings, a gentle sparkle (not a glare)
    const crystalM = new THREE.MeshStandardMaterial({ color: '#fff6e8', emissive: '#ffe2b0', emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.05 });
    const sparkleM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.7) });
    const drop = new THREE.OctahedronGeometry(0.03);
    const chandelier = (x, z, big) => {
      const c = new THREE.Group(), S = big ? 1.6 : 1; c.position.set(x, FLOOR + WH - (big ? 1.4 : 1.15), z); scene.add(c);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, big ? 1.4 : 1.15, 6), M.gold); rod.position.y = (big ? 1.4 : 1.15) / 2; c.add(rod);
      const tiers = [[0.62 * S, 0, 22], [0.45 * S, -0.22, 18], [0.28 * S, -0.42, 14], [0.12 * S, -0.58, 8]];
      let total = 0; tiers.forEach(t => (total += t[2] * 3));
      const cr = new THREE.InstancedMesh(drop, crystalM, total); let i = 0;
      tiers.forEach(([r, y, n]) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 8, 48), M.gold); ring.rotation.x = Math.PI / 2; ring.position.y = y; c.add(ring);
        for (let k = 0; k < n; k++) for (let j = 0; j < 3; j++) { const a = (k / n) * Math.PI * 2; m4.compose(new THREE.Vector3(Math.cos(a) * r, y - 0.05 - j * 0.07, Math.sin(a) * r), Q0, new THREE.Vector3(1, 1.7, 1)); cr.setMatrixAt(i++, m4); }
      });
      c.add(cr);
      // a few crystals catch the light at a time
      const sp = new THREE.InstancedMesh(drop, sparkleM, 6); c.add(sp);
      const glow = new THREE.PointLight('#ffd9a0', big ? 2.2 : 1.4, 7, 1.8); glow.position.y = -0.3; c.add(glow);
      let last = 0; animated.push(t => { c.rotation.y = t * 0.03; if (t - last > 0.25) { last = t; for (let k = 0; k < 6; k++) { const m = new THREE.Matrix4(); cr.getMatrixAt((Math.random() * i) | 0, m); sp.setMatrixAt(k, m.multiply(new THREE.Matrix4().makeScale(0.8, 0.8, 0.8))); } sp.instanceMatrix.needsUpdate = true; } });
    };
    chandelier(0, -0.3, true); chandelier(-5.5, -5, false); chandelier(5.5, -5.5, false); chandelier(-5.5, 5, false); chandelier(4.5, 5.5, false);

    // marble columns with gold capitals and bases
    const marble = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#efe6d8'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(${120 + Math.random() * 40},${105 + Math.random() * 30},${90},${0.25 + Math.random() * 0.3})`; g.lineWidth = 1 + Math.random() * 2.5; g.beginPath(); let x = Math.random() * w, y = 0; g.moveTo(x, y); while (y < h) { x += (Math.random() - 0.5) * 40; y += 20 + Math.random() * 30; g.lineTo(x, y); } g.stroke(); }
      noise(g, w, h, 0.03, 4000);
    });
    const marbleM = new THREE.MeshStandardMaterial({ map: marble, roughness: 0.18, metalness: 0.05 });
    const column = (x, z) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, WH - 0.6, 28), marbleM); c.position.set(x, FLOOR + WH / 2, z); scene.add(c);
      [[0.25, 0.46, 0.3], [WH - 0.3, 0.46, 0.25]].forEach(([y, r, hh]) => { const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, hh, 28), M.gold); cap.position.set(x, FLOOR + y, z); scene.add(cap); });
      [0.5, WH - 0.5].forEach(y => { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.02, 8, 32), M.gold); ring.rotation.x = Math.PI / 2; ring.position.set(x, FLOOR + y, z); scene.add(ring); });
    };
    [[-6.5, -7.5], [6.5, -7.5], [-7.5, 6.5], [6.2, 7.5], [-3.2, -8.8], [3.2, -8.8]].forEach(([x, z]) => column(x, z));

    // floral arrangements on gold urns
    const flowerCols = ['#d81b4a', '#f06292', '#ffffff', '#ffb74d', '#c2185b', '#f8bbd0'];
    const urn = (x, z, sc = 1) => {
      const u = new THREE.Group(); u.position.set(x, FLOOR, z); u.scale.setScalar(sc); scene.add(u);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.8, 24), marbleM); ped.position.y = 0.4; u.add(ped);
      const vase = new THREE.Mesh(new THREE.LatheGeometry([[0.05, 0], [0.22, 0.08], [0.26, 0.25], [0.18, 0.42], [0.24, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 24), M.gold); vase.position.y = 0.8; u.add(vase);
      const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), new THREE.MeshStandardMaterial({ roughness: 0.7 }), 70);
      for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 0.42, y = 1.45 + Math.sqrt(Math.max(0, 0.2 - r * r * 0.9)) * 1.1 + (Math.random() - 0.5) * 0.1; m4.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), Q0, new THREE.Vector3(1, 0.8, 1).multiplyScalar(0.8 + Math.random() * 0.6)); fl.setMatrixAt(i, m4); fl.setColorAt(i, col.set(flowerCols[i % flowerCols.length])); }
      u.add(fl);
      const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshStandardMaterial({ color: '#2e6a32', roughness: 0.8 }), 40);
      for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.25; m4.compose(new THREE.Vector3(Math.cos(a) * r, 1.32 + Math.random() * 0.25, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), a, 0)), new THREE.Vector3(1.6, 0.3, 0.8)); leaves.setMatrixAt(i, m4); }
      u.add(leaves);
    };
    urn(-4.6, -6.2); urn(4.6, -6.5); urn(-6.2, 2.2, 0.9); urn(5.6, 2.8, 0.9);

    // gold fretwork screens (like the ones that frame the gaming floors), with the slot rows glowing softly behind
    const fret = canvasTex(256, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = '#ffffff'; g.lineWidth = 7;
      g.strokeRect(6, 6, w - 12, h - 12);
      for (let y = 20; y < h - 20; y += 52) for (let x = 20; x < w - 20; x += 52) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40, y); g.lineTo(x + 40, y + 40); g.lineTo(x + 10, y + 40); g.lineTo(x + 10, y + 14); g.lineTo(x + 28, y + 14); g.lineTo(x + 28, y + 28); g.stroke();
      }
    }, false);
    const screenM = new THREE.MeshStandardMaterial({ color: '#d4a84a', metalness: 0.9, roughness: 0.3, alphaMap: fret, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    const screenPanel = new THREE.PlaneGeometry(1.2, 2.6);
    [[-3.6, -4.6, 0.15], [-2.3, -4.9, 0.08], [2.3, -4.9, -0.08], [3.6, -4.6, -0.15], [-5.2, -1.2, 1.35], [5.2, -1.6, -1.35]].forEach(([x, z, ry]) => {
      const p = new THREE.Mesh(screenPanel, screenM); p.position.set(x, FLOOR + 1.3, z); p.rotation.y = ry; scene.add(p);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.06, 0.06), M.gold); frame.position.set(x, FLOOR + 2.62, z); frame.rotation.y = ry; scene.add(frame);
    });

    // slot machines along the back and left walls: dark cabinets, soft screens, gentle topper lights
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 1.55, 0.6), new THREE.MeshStandardMaterial({ color: '#3a0a18', metalness: 0.5, roughness: 0.35 }), 40);
    const screens = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.52, 0.42), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 40);
    const tops = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 20, 1, false, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 40);
    let n = 0;
    const put = (x, z, ry) => {
      const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
      m4.compose(new THREE.Vector3(x, FLOOR + 0.775, z), qq, V1); bodies.setMatrixAt(n, m4);
      const off = new THREE.Vector3(0, 0.25, 0.301).applyQuaternion(qq);
      m4.compose(new THREE.Vector3(x + off.x, FLOOR + 1.025, z + off.z), qq, V1); screens.setMatrixAt(n, m4);
      const tq = qq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, -Math.PI / 2)));
      m4.compose(new THREE.Vector3(x, FLOOR + 1.6, z), tq, V1); tops.setMatrixAt(n, m4);
      n++;
    };
    for (let i = 0; i < 12; i++) put(-4.6 + i * 0.84, -RAD + 0.5, 0);
    for (let i = 0; i < 10; i++) put(-RAD + 0.5, -6 + i * 0.84, Math.PI / 2);
    for (let i = 0; i < 8; i++) put(-3.1 + i * 0.84, -6.6, 0);
    bodies.count = screens.count = tops.count = n;
    const SC = [[0.9, 0.35, 0.5], [0.3, 0.55, 0.95], [0.95, 0.7, 0.25], [0.5, 0.85, 0.5], [0.85, 0.3, 0.3], [0.6, 0.35, 0.9]];
    const paint = t => { for (let i = 0; i < n; i++) { const c = SC[(i + Math.floor(t * 0.5 + i * 0.37)) % SC.length], f = 0.7 + 0.2 * Math.sin(t * 1.5 + i); screens.setColorAt(i, col.setRGB(c[0] * f, c[1] * f, c[2] * f)); const on = (Math.floor(t * 1.5) + i) % 4 === 0; tops.setColorAt(i, col.setRGB(on ? 1.15 : 0.7, on ? 0.85 : 0.45, on ? 0.45 : 0.22)); } screens.instanceColor.needsUpdate = true; tops.instanceColor.needsUpdate = true; };
    paint(0);
    let lastP = 0; animated.push(t => { if (t - lastP > 0.2) { lastP = t; paint(t); } });
    scene.add(bodies, screens, tops);

    // baccarat tables with silk drum lamps and seated guests
    [[-4.2, -2.6], [4.0, -3.6], [-5.6, 4.0], [2.8, 6.0]].forEach(([x, z], i) => {
      const t = new THREE.Group(); t.position.set(x, 0, z); scene.add(t);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.05, 40), new THREE.MeshStandardMaterial({ color: i % 2 ? '#0f5a3e' : '#1a4a3a', roughness: 0.9 })); t.add(top);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 8, 40), M.leather); rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; t.add(rim);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, -FLOOR, 16), M.darkwood); leg.position.y = FLOOR / 2; t.add(leg);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.32, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#c8963a', emissive: '#7a4a14', emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.7 })); shade.position.y = 1.5; t.add(shade);
      const diff = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.92, 0.7) })); diff.rotation.x = Math.PI / 2; diff.position.y = 1.35; t.add(diff);
      const pool = new THREE.PointLight('#ffd9a0', 2.2, 3, 1.6); pool.position.y = 1.2; t.add(pool);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3.0, 4), M.gold); cord.position.y = 3.1; t.add(cord);
      for (let sN = 0; sN < 3; sN++) {
        const a = (sN / 3) * Math.PI * 2 + i, k = (sN + i) % 5;
        const p = person({ shirt: ['#1e2433', '#5a1a2a', '#22303a', '#3a2a1a', '#2a2a2a'][k], hair: ['#1a1208', '#5a3a1a', '#0a0a0a', '#8a8a8a', '#3a2412'][k], hairStyle: ['short', 'long', 'short', 'none', 'bun'][k], skin: SKINS[k], glasses: k === 3 });
        p.position.set(Math.cos(a) * 1.32, -0.12, Math.sin(a) * 1.32); p.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); t.add(p);
        p.userData.reach('L', -0.15, 0.17, 0.36); p.userData.reach('R', 0.15, 0.17, 0.36);
        const ph = Math.random() * 6; animated.push(tt => { p.userData.head.rotation.y = Math.sin(tt * 0.35 + ph) * 0.35; });
      }
    });

    // the gold sign over the back wall: lettering with a soft halo behind it
    const signTex = canvasTex(1024, 200, (g, w, h) => {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic 700 118px Georgia, serif';
      const gr = g.createLinearGradient(0, 40, 0, 160); gr.addColorStop(0, '#fff1c4'); gr.addColorStop(0.5, '#e0b04a'); gr.addColorStop(1, '#9a6a1c');
      g.shadowColor = 'rgba(255,200,120,.55)'; g.shadowBlur = 26; g.fillStyle = gr; g.fillText('Odds Lounge', w / 2, h / 2);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, color: new THREE.Color(1.15, 1.05, 0.95) }));
    sign.position.set(0, FLOOR + 3.6, -RAD + 0.06); scene.add(sign);

    // the bar along the right wall: dark wood, marble top, softly backlit shelves of bottles
    const bx = 7.6;
    const barG = new THREE.Group(); scene.add(barG);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 7), M.wood); counter.position.set(bx, FLOOR + 0.55, 0); barG.add(counter);
    const ctop = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 7.1), marbleM); ctop.position.set(bx, FLOOR + 1.12, 0); barG.add(ctop);
    const ctrim = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 7), M.gold); ctrim.position.set(bx - 0.47, FLOOR + 1.08, 0); barG.add(ctrim);
    const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.7, 0.35) })); glowStrip.position.set(bx - 0.41, FLOOR + 0.15, 0); barG.add(glowStrip);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.45, 0.2) })); back.position.set(RAD - 0.06, FLOOR + 2.2, 0); back.rotation.y = -Math.PI / 2; barG.add(back);
    for (let sN = 0; sN < 3; sN++) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 6.6), M.gold); sh.position.set(RAD - 0.2, FLOOR + 1.45 + sN * 0.55, 0); barG.add(sh); }
    const bottles = new THREE.InstancedMesh(new THREE.LatheGeometry([[0, 0], [0.042, 0], [0.045, 0.2], [0.02, 0.26], [0.014, 0.34], [0, 0.34]].map(([r, y]) => new THREE.Vector2(r, y)), 12), new THREE.MeshStandardMaterial({ roughness: 0.12, transparent: true, opacity: 0.88 }), 120);
    const BC = ['#2a6a2a', '#a8651a', '#e8e0c8', '#6a1a2a', '#1a3a6a', '#d8a020', '#3a1a0a'];
    let bi = 0;
    for (let sN = 0; sN < 3; sN++) for (let i = 0; i < 40; i++) { m4.compose(new THREE.Vector3(RAD - 0.2, FLOOR + 1.465 + sN * 0.55, -3.1 + i * 0.158), Q0, new THREE.Vector3(1, 0.8 + Math.random() * 0.4, 1)); bottles.setMatrixAt(bi, m4); bottles.setColorAt(bi, col.set(BC[(i * 7 + sN * 3) % BC.length])); bi++; }
    barG.add(bottles);
    for (let i = 0; i < 6; i++) {
      const st = new THREE.Group(); st.position.set(bx - 0.75, FLOOR, -2.6 + i * 1.05); barG.add(st);
      const seatM = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#6a1222', roughness: 0.5 })); seatM.position.y = 0.78; st.add(seatM);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 8), M.gold); leg.position.y = 0.38; st.add(leg);
    }
    const barSign = canvasTex(512, 160, (g, w, h) => { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic 700 100px Georgia, serif'; const gr = g.createLinearGradient(0, 30, 0, 130); gr.addColorStop(0, '#fff1c4'); gr.addColorStop(1, '#b8862e'); g.shadowColor = 'rgba(255,200,120,.5)'; g.shadowBlur = 18; g.fillStyle = gr; g.fillText('The Bar', w / 2, h / 2); });
    const bs = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.56), new THREE.MeshBasicMaterial({ map: barSign, transparent: true }));
    bs.position.set(RAD - 0.08, FLOOR + 3.75, 0); bs.rotation.y = -Math.PI / 2; barG.add(bs);
    // the bartender, with a shaker
    const tender = person({ shirt: '#f2efe8', vest: '#151515', bow: '#a01020', hair: '#1a1008', skin: SKINS[1], seated: false });
    tender.position.set(bx + 0.72, FLOOR + 0.98, 0.2); tender.rotation.y = -Math.PI / 2; barG.add(tender);
    const shaker = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 16), new THREE.MeshStandardMaterial({ color: '#d8d8e0', metalness: 1, roughness: 0.15 }));
    barG.add(shaker);
    const barState = { shaking: 0 };
    const hw = new THREE.Vector3();
    animated.push((t, dt) => {
      barState.shaking = Math.max(0, barState.shaking - dt);
      const on = barState.shaking > 0, sh = on ? Math.sin(t * 26) : 0;
      if (on) { tender.userData.reach('R', 0.06, 0.52 + sh * 0.06, 0.2); tender.userData.reach('L', -0.04, 0.46 + sh * 0.06, 0.22); }
      else { tender.userData.reach('R', 0.16, 0.16, 0.32); tender.userData.reach('L', -0.16, 0.16, 0.3 + Math.sin(t * 0.8) * 0.03); }
      tender.userData.arms.R.hand.getWorldPosition(hw); barG.worldToLocal(hw);
      shaker.position.copy(hw); shaker.position.y += 0.08; shaker.rotation.z = on ? sh * 0.2 : 0;
      tender.userData.head.rotation.y = on ? 0 : Math.sin(t * 0.5) * 0.5;
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
    const dealer = person({ shirt: '#f4f1ea', vest: '#121212', bow: '#9a0f1f', hair: '#1a120a', skin: SKINS[1], seated: false });
    dealer.position.set(0, 0.03, -0.98); scene.add(dealer);
    // hands rest on the table edge; the right one reaches out when a card is dealt
    const rest = { L: [-0.17, -0.01, 0.44], R: [0.17, -0.01, 0.44] };
    const dealHand = { t: 9, x: 0, z: 0 };
    dealer.userData.dealTo = (wx, wz) => { dealHand.t = 0; dealHand.x = wx; dealHand.z = wz + 0.98; };
    animated.push((t, dt) => {
      dealHand.t += dt;
      dealer.userData.head.rotation.y = Math.sin(t * 0.35) * 0.22;
      dealer.userData.reach('L', rest.L[0], rest.L[1], rest.L[2] + Math.sin(t * 0.9) * 0.01);
      const p = Math.min(1, dealHand.t / 0.55), k = Math.sin(p * Math.PI);
      dealer.userData.reach('R', lerp(rest.R[0], dealHand.x, k * 0.8), rest.R[1] + k * 0.06, lerp(rest.R[2], dealHand.z, k * 0.75));
    });
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
