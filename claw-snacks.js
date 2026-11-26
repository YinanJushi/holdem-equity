// Looks for the snack machines on claw.html: the ring machine (snack boxes with a plastic ring on top), the S-hook
// machine (snack bags hanging from S-hooks on rods) and the capsule spinner (two-tone toy capsules). All original
// designs drawn on canvases here, with made-up names; no real brands.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// value: play chips; the size is in metres
export const RING_BOXES = {
  ring_candy: { name: 'Fruit Candy Box', value: 30, col: '#ff7fae', ink: '#ffffff', label: 'FRUIT\nCANDY', size: [0.075, 0.045, 0.05] },
  ring_choco: { name: 'Choco Bar Box', value: 40, col: '#5a2e1a', ink: '#f2c14e', label: 'CHOCO\nBAR', size: [0.08, 0.045, 0.05] },
  ring_matcha: { name: 'Matcha Wafer Box', value: 40, col: '#4f8a3a', ink: '#f4f1d8', label: 'MATCHA\nWAFER', size: [0.08, 0.045, 0.05] },
  ring_cookie: { name: 'Butter Cookie Tin', value: 50, col: '#2a5aa8', ink: '#ffe9b0', label: 'BUTTER\nCOOKIES', size: [0.085, 0.05, 0.055] },
  ring_gold: { name: 'Golden Gift Box', value: 150, col: '#e0a628', ink: '#7a3a06', label: 'LUCKY\nGIFT', size: [0.085, 0.05, 0.055], gold: true },
};
export const SNACK_BAGS = {
  bag_gummy: { name: 'Gummy Bears', value: 30, col: '#ff5a8a', col2: '#ffd23f', label: 'GUMMY\nBEARS' },
  bag_pretzel: { name: 'Pretzel Sticks', value: 30, col: '#c9772e', col2: '#fff1c4', label: 'PRETZEL\nSTICKS' },
  bag_chips: { name: 'Potato Chips', value: 40, col: '#f2c12e', col2: '#d8301a', label: 'POTATO\nCHIPS' },
  bag_shrimp: { name: 'Shrimp Crackers', value: 40, col: '#ff8a5a', col2: '#2a6ad8', label: 'SHRIMP\nCRACKERS' },
  bag_gold: { name: 'Lucky Gold Bag', value: 120, col: '#e0a628', col2: '#7a3a06', label: 'LUCKY\nSNACK', gold: true },
};
export const CAPSULES = {
  caps_red: { name: 'Candy capsule', value: 40, col: '#e8303a' },
  caps_blue: { name: 'Sticker capsule', value: 40, col: '#2a7ad8' },
  caps_green: { name: 'Gummy capsule', value: 50, col: '#3aa84a' },
  caps_purple: { name: 'Keychain capsule', value: 60, col: '#8a4ad8' },
  caps_silver: { name: 'Silver capsule', value: 120, col: '#c8ccd4', metal: true },
  caps_gold: { name: 'Gold capsule', value: 300, col: '#f2c14e', metal: true },
};
export const BAG = [0.06, 0.085, 0.022], CAP_R = 0.024, RING = { r: 0.026, tube: 0.003 };

const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.6, ...o });
const lines = (g, text, x, y, size, col) => { g.fillStyle = col; g.font = `900 ${size}px "Libre Franklin", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; text.split('\n').forEach((l, i, a) => g.fillText(l, x, y + (i - (a.length - 1) / 2) * size * 1.05)); };

// a snack box with a printed front and a white plastic ring standing on its lid (the ring's hole faces left-right)
export function buildRingBox(kind) {
  const B = RING_BOXES[kind], [w, h, d] = B.size;
  const front = tex(256, 160, (g, W, H) => {
    g.fillStyle = B.col; g.fillRect(0, 0, W, H);
    if (kind === 'ring_candy') { for (let i = 0; i < 26; i++) { g.fillStyle = ['#ffd23f', '#7fe0ff', '#ffffff', '#b6ff3a'][i % 4]; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 6 + Math.random() * 8, 0, 7); g.fill(); } }
    if (kind === 'ring_choco') { g.fillStyle = '#3a1a0c'; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.fillRect(150 + i * 24, 30 + j * 50, 20, 44); }
    if (kind === 'ring_matcha') { g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 3; for (let k = -160; k < 256; k += 18) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 160, 160); g.stroke(); } }
    if (kind === 'ring_cookie') { g.fillStyle = '#e8c070'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(170 + i * 26, 110 - i * 14, 22, 0, 7); g.fill(); g.strokeStyle = '#b8863a'; g.lineWidth = 3; g.stroke(); } }
    if (B.gold) { g.fillStyle = '#c8102e'; g.fillRect(W / 2 - 14, 0, 28, H); g.fillRect(0, H / 2 - 14, W, 28); }
    g.strokeStyle = B.ink; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, H - 16);
    lines(g, B.label, kind === 'ring_cookie' || kind === 'ring_choco' ? 80 : W / 2, H / 2, 34, B.ink);
  });
  const side = mat(B.col, B.gold ? { metalness: 0.8, roughness: 0.25 } : {}), face = new THREE.MeshStandardMaterial({ map: front, roughness: 0.5, metalness: B.gold ? 0.5 : 0 });
  const g = new THREE.Group();
  const box = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.003), [side, side, side, side, face, face]); box.castShadow = box.receiveShadow = true; g.add(box);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING.r, RING.tube, 8, 28), mat('#f4f4f2', { roughness: 0.3, transmission: 0.2 })); ring.rotation.y = Math.PI / 2; ring.position.y = h / 2 + RING.r + 0.001; ring.castShadow = true; g.add(ring);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.012), mat('#f4f4f2')); tab.position.y = h / 2 + 0.002; g.add(tab);
  return g;
}

// a pillow-shaped snack bag: printed front and back, crimped top and bottom
export function buildBag(kind) {
  const B = SNACK_BAGS[kind], [w, h, d] = BAG;
  const art = tex(160, 224, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, B.col); gr.addColorStop(1, B.col2); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(W / 2, H * 0.62, 56, 40, 0, 0, 7); g.fill();
    if (kind === 'bag_chips') { g.fillStyle = '#f7d36a'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(52 + i * 14, 140 - (i % 2) * 10, 16, 11, i, 0, 7); g.fill(); g.strokeStyle = '#d89a2a'; g.stroke(); } }
    if (kind === 'bag_gummy') { ['#ff3a5a', '#3ad85a', '#ffd23f', '#3a8aff'].forEach((c, i) => { g.fillStyle = c; const x = 50 + i * 20, y = 140; g.beginPath(); g.arc(x, y, 9, 0, 7); g.arc(x - 6, y - 9, 4, 0, 7); g.arc(x + 6, y - 9, 4, 0, 7); g.fill(); }); }
    if (kind === 'bag_pretzel') { g.strokeStyle = '#a85a1e'; g.lineWidth = 7; g.lineCap = 'round'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(40 + i * 14, 112); g.lineTo(56 + i * 12, 168); g.stroke(); } }
    if (kind === 'bag_shrimp') { g.fillStyle = '#ffb08a'; for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(48 + i * 22, 140, 12, 7, 0.4, 0, 7); g.fill(); } }
    if (B.gold) { g.fillStyle = '#fff1c4'; g.font = '900 44px Georgia, serif'; g.textAlign = 'center'; g.fillText('★', W / 2, 150); }
    lines(g, B.label, W / 2, 56, 26, '#ffffff'); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 4; g.strokeRect(4, 4, W - 8, H - 8);
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h * 0.86, d, 4, d * 0.48), [mat(B.col), mat(B.col), mat(B.col), mat(B.col), new THREE.MeshStandardMaterial({ map: art, roughness: 0.35, metalness: B.gold ? 0.6 : 0.15 }), new THREE.MeshStandardMaterial({ map: art, roughness: 0.35, metalness: B.gold ? 0.6 : 0.15 })]);
  body.castShadow = true; g.add(body);
  [1, -1].forEach(s => { const crimp = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.07, 0.004), mat(B.col2)); crimp.position.y = s * h * 0.465; g.add(crimp); });
  const hole = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0012, 6, 14), mat('#ffffff')); hole.position.y = h * 0.47; g.add(hole);
  return g;
}

// an S-hook: two half-loops of chrome wire, the upper one sits over the rod
export function buildHook() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#d8dce4', metalness: 1, roughness: 0.2 });
  const top = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0016, 6, 16, Math.PI * 1.25), m); top.rotation.z = -Math.PI * 0.12; top.position.y = 0; g.add(top);
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.018, 6), m); mid.position.set(-0.008, -0.009, 0); g.add(mid);
  const bot = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0016, 6, 16, Math.PI * 1.2), m); bot.rotation.z = Math.PI * 0.9; bot.position.set(-0.001, -0.018, 0); g.add(bot);
  g.rotation.y = Math.PI / 2;   // the loops face the camera side-on, so the hook reads as an "S" from the front-left
  const w = new THREE.Group(); w.add(g); return w;
}

// a two-tone toy capsule: clear coloured top, white bottom, a little prize inside
export function buildCapsule(kind) {
  const C = CAPSULES[kind], g = new THREE.Group();
  const topM = C.metal ? mat(C.col, { metalness: 1, roughness: 0.18 }) : new THREE.MeshPhysicalMaterial({ color: C.col, roughness: 0.08, transmission: 0.55, thickness: 0.01, transparent: true, opacity: 0.85, clearcoat: 1 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(CAP_R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), topM); g.add(top);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(CAP_R, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), C.metal ? mat(C.col, { metalness: 1, roughness: 0.25 }) : mat('#f4f4f2')); bot.castShadow = true; g.add(bot);
  const band = new THREE.Mesh(new THREE.TorusGeometry(CAP_R, 0.0015, 6, 28), mat('#ffffff')); band.rotation.x = Math.PI / 2; g.add(band);
  if (!C.metal) { const toy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.009, 0), mat(['#ffd23f', '#ff5a8a', '#3ad8c8'][Math.floor(Math.random() * 3)])); toy.position.y = 0.006; g.add(toy); }
  return g;
}

// a snack bag lying face-up on the pile with a D-ring standing on it (the ring's hole faces left-right): the prize for
// the S-hook machine, where the claw's S-hook threads the D-ring and lifts the bag
export const DRING = { r: 0.026, tube: 0.0032 };
export function buildDRingBag(kind) {
  const g = new THREE.Group();
  const bag = buildBag(kind); bag.rotation.x = -Math.PI / 2; g.add(bag);
  const m = new THREE.MeshStandardMaterial({ color: '#e8eaee', metalness: 1, roughness: 0.2 });
  // the D: a half-circle on top, straight across the bottom, clipped to the bag by a little tab
  const arc = new THREE.Mesh(new THREE.TorusGeometry(DRING.r, DRING.tube, 8, 24, Math.PI), m); arc.rotation.y = Math.PI / 2; arc.position.y = BAG[2] / 2 + 0.002; g.add(arc);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(DRING.tube, DRING.tube, DRING.r * 2, 8), m); bar.rotation.x = Math.PI / 2; bar.position.y = BAG[2] / 2 + 0.002; g.add(bar);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.02), new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.5 })); tab.position.y = BAG[2] / 2 + 0.001; g.add(tab);
  return g;
}
