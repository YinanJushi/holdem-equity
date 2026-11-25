// Prizes for the takoyaki machine (claw.html?m=tako): the "Tako-chan" octopus-dumpling series, our own original
// characters built from simple shapes. Each one is a little figure on the machine's prize shelf; dropping balls in
// the gold hole earns stars toward the one you picked, and when it has enough stars it's pushed off the shelf.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// rarity: how many gold-hole stars it takes. value: play chips paid out with the prize.
export const TAKO_PRIZES = {
  red: { name: 'Tako-chan Red', zh: '章鱼丸子·红', col: '#e8503a', rarity: 'Common', need: 1, value: 40 },
  pink: { name: 'Tako-chan Pink', zh: '章鱼丸子·粉', col: '#ff8fb1', rarity: 'Common', need: 1, value: 40 },
  purple: { name: 'Tako-chan Purple', zh: '章鱼丸子·紫', col: '#9b6bd6', rarity: 'Common', need: 1, value: 40 },
  orange: { name: 'Tako-chan Orange', zh: '章鱼丸子·橙', col: '#ff9a2e', rarity: 'Common', need: 1, value: 40 },
  chef: { name: 'Chef Tako', zh: '章鱼丸子厨师', col: '#e8503a', rarity: 'Rare', need: 2, value: 100 },
  fan: { name: 'Festival Fan Tako', zh: '团扇章鱼', col: '#ff8fb1', rarity: 'Rare', need: 2, value: 100 },
  box: { name: 'Takoyaki Six-Pack', zh: '一盒六颗章鱼烧', col: '#c9772e', rarity: 'Rare', need: 2, value: 100 },
  king: { name: 'Golden Tako King', zh: '金色章鱼丸子王', col: '#f2c14e', rarity: 'Limited', need: 3, value: 250 },
};

const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.2, ...o });
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

// one octopus: a round head-body, eight curled legs, big shiny eyes, a pouty "o" mouth and blush. About 6 cm tall.
function octopus(col, gold = false) {
  const g = new THREE.Group();
  const skin = gold ? mat(col, { metalness: 0.85, roughness: 0.22, emissive: '#5a3a08', emissiveIntensity: 0.25 }) : mat(col);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.024, 32, 24), skin); head.scale.set(1, 1.05, 0.95); head.position.y = 0.036; head.castShadow = true; g.add(head);
  // spots on the head
  const spotM = mat(new THREE.Color(col).multiplyScalar(gold ? 1.15 : 0.82).getStyle());
  [[0.6, 0.55], [-0.7, 0.4], [0.2, 0.85], [-0.25, 0.7]].forEach(([a, e]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 10, 8), spotM); s.scale.set(1, 1, 0.35); const r = 0.0242; s.position.set(Math.sin(a) * Math.cos(e) * r * -1, 0.036 + Math.sin(e) * r, -Math.cos(a) * Math.cos(e) * r); s.lookAt(0, 0.036, 0); g.add(s); });
  // legs: eight short curls around the bottom, the tips turned up
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    const leg = new THREE.Group(); leg.rotation.y = -a; leg.position.y = 0.012; g.add(leg);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.008, 0.006, 0), new THREE.Vector3(0.017, -0.004, 0), new THREE.Vector3(0.026, -0.008, 0), new THREE.Vector3(0.031, -0.002, 0), new THREE.Vector3(0.028, 0.003, 0)]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.0048, 8), skin); tube.castShadow = true; leg.add(tube);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0046, 10, 8), skin); tip.position.set(0.028, 0.003, 0); leg.add(tip);
  }
  // face (on the front, +z)
  const white = mat('#ffffff', { clearcoat: 1 }), black = mat('#141414', { clearcoat: 1, roughness: 0.1 });
  [-1, 1].forEach(sx => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 16, 12), white); eye.scale.set(1, 1.15, 0.5); eye.position.set(sx * 0.0095, 0.04, 0.0215); g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 14, 10), black); pupil.scale.set(1, 1.15, 0.5); pupil.position.set(sx * 0.0092, 0.0395, 0.0237); g.add(pupil);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.0014, 8, 6), white); hi.position.set(sx * 0.0092 + 0.0016, 0.0418, 0.0255); g.add(hi);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.004, 16), new THREE.MeshBasicMaterial({ color: '#ff6f8a', transparent: true, opacity: 0.7 })); blush.position.set(sx * 0.0165, 0.0318, 0.0195); blush.rotation.y = sx * 0.6; g.add(blush);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.0034, 0.0016, 8, 16), mat(new THREE.Color(col).multiplyScalar(0.7).getStyle())); mouth.position.set(0, 0.0285, 0.0245); g.add(mouth);
  return g;
}

// a single takoyaki: a golden-brown ball with sauce, mayo zigzag and green nori flakes on top
function takoyakiBall(r) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat('#c9772e', { roughness: 0.75, clearcoat: 0.2 })); ball.castShadow = true; g.add(ball);
  const sauce = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), mat('#4a1e0c', { roughness: 0.25, clearcoat: 1 })); g.add(sauce);
  const mayo = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, r * 0.07, 6, 18), mat('#fff6dc')); mayo.rotation.x = Math.PI / 2; mayo.position.y = r * 0.86; g.add(mayo);
  for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(r * 0.16, r * 0.03, r * 0.12), mat('#3f8a2a')); const a = i * 1.3; f.position.set(Math.cos(a) * r * 0.35, r * 1.0, Math.sin(a) * r * 0.35); f.rotation.y = a; g.add(f); }
  return g;
}

export function buildTako(id) {
  const P = TAKO_PRIZES[id];
  if (id === 'box') {
    // a paper boat tray with six takoyaki and a toothpick, plus a little red Tako-chan peeking from the corner
    const g = new THREE.Group();
    const tray = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.014, 0.05, 2, 0.003), mat('#e9d6b0', { roughness: 0.8, clearcoat: 0 })); tray.position.y = 0.007; tray.castShadow = true; g.add(tray);
    for (let i = 0; i < 6; i++) { const b = takoyakiBall(0.0105); b.position.set(-0.023 + (i % 3) * 0.023, 0.022, i < 3 ? -0.011 : 0.011); g.add(b); }
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.045, 6), mat('#e0c08a')); pick.position.set(0.012, 0.04, 0.01); pick.rotation.z = 0.6; g.add(pick);
    const t = octopus('#e8503a'); t.scale.setScalar(0.55); t.position.set(-0.03, 0.012, 0.02); t.rotation.y = 0.5; g.add(t);
    return g;
  }
  const g = octopus(P.col, id === 'king');
  if (id === 'chef') {
    // a twisted white headband with its knot at the side, and a skewer held in one leg
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0235, 0.0032, 8, 32), mat('#ffffff')); band.rotation.x = Math.PI / 2 - 0.12; band.position.y = 0.05; g.add(band);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), mat('#ffffff')); knot.position.set(0.022, 0.052, 0.004); g.add(knot);
    [0.5, -0.3].forEach(r => { const tail = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.006), mat('#ffffff')); tail.position.set(0.027, 0.046, 0.004); tail.rotation.z = r; g.add(tail); });
    const skewer = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.05, 6), mat('#e0c08a')); skewer.position.set(0.034, 0.03, 0.012); skewer.rotation.z = -0.4; g.add(skewer);
    const ball = takoyakiBall(0.007); ball.position.set(0.042, 0.048, 0.012); g.add(ball);
  } else if (id === 'fan') {
    // a round festival fan (uchiwa) with a wave print, held up beside the head
    const art = canvasTex(128, 128, c => { c.fillStyle = '#fff7ee'; c.beginPath(); c.arc(64, 64, 64, 0, 7); c.fill(); c.strokeStyle = '#3a6fd8'; c.lineWidth = 5; for (let y = 40; y < 128; y += 18) { c.beginPath(); for (let x = 0; x <= 128; x += 16) c.arc(x, y, 8, Math.PI, 0); c.stroke(); } c.fillStyle = '#e8503a'; c.beginPath(); c.arc(64, 34, 14, 0, 7); c.fill(); });
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.019, 28), new THREE.MeshStandardMaterial({ map: art, side: THREE.DoubleSide, roughness: 0.7 })); fan.position.set(-0.033, 0.05, 0.008); fan.rotation.set(0, 0.5, 0.25); g.add(fan);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.028, 6), mat('#e0c08a')); handle.position.set(-0.028, 0.028, 0.01); handle.rotation.z = 0.25; g.add(handle);
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), mat('#ffffff')); flower.position.set(0.016, 0.056, 0.008); g.add(flower);
  } else if (id === 'king') {
    // a jewelled crown
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.011, 0.01, 10, 1, true), mat('#fff1a8', { metalness: 1, roughness: 0.15, side: THREE.DoubleSide })); crown.position.y = 0.064; g.add(crown);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const pt = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.008, 6), mat('#fff1a8', { metalness: 1, roughness: 0.15 })); pt.position.set(Math.cos(a) * 0.0115, 0.073, Math.sin(a) * 0.0115); g.add(pt); }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.003), mat('#e0115f', { roughness: 0.05 })); gem.position.set(0, 0.065, 0.0122); g.add(gem);
  }
  return g;
}

// flat art for the collection book: the same octopus drawn on a canvas
export function takoArt(id) {
  const P = TAKO_PRIZES[id], c = document.createElement('canvas'); c.width = 160; c.height = 160; const g = c.getContext('2d');
  const bg = { Common: ['#3a1a10', '#6a2e14'], Rare: ['#1a2a4a', '#2e4e8a'], Limited: ['#4a3208', '#a8761a'] }[P.rarity];
  const gr = g.createLinearGradient(0, 0, 160, 160); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]); g.fillStyle = gr; g.fillRect(0, 0, 160, 160);
  if (id === 'box') {
    g.fillStyle = '#e9d6b0'; g.fillRect(28, 92, 104, 30);
    for (let i = 0; i < 6; i++) { const x = 46 + (i % 3) * 34, y = i < 3 ? 86 : 100; g.fillStyle = '#c9772e'; g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill(); g.fillStyle = '#4a1e0c'; g.beginPath(); g.arc(x, y - 3, 12, Math.PI, 0); g.fill(); g.strokeStyle = '#fff6dc'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 8, y - 6); g.lineTo(x - 2, y - 10); g.lineTo(x + 4, y - 6); g.lineTo(x + 9, y - 10); g.stroke(); }
    return c;
  }
  const col = P.col;
  g.fillStyle = col;
  for (let i = 0; i < 8; i++) { const x = 34 + i * 13; g.beginPath(); g.ellipse(x, 120, 8, 14, (i - 3.5) * 0.15, 0, 7); g.fill(); }
  g.beginPath(); g.ellipse(80, 78, 44, 46, 0, 0, 7); g.fill();
  [[-17, 1], [17, -1]].forEach(([dx]) => { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(80 + dx, 78, 10, 12, 0, 0, 7); g.fill(); g.fillStyle = '#141414'; g.beginPath(); g.ellipse(80 + dx, 80, 7, 9, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(83 + dx, 76, 2.5, 0, 7); g.fill(); g.fillStyle = 'rgba(255,111,138,.75)'; g.beginPath(); g.ellipse(80 + dx * 1.75, 96, 7, 4, 0, 0, 7); g.fill(); });
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4; g.beginPath(); g.arc(80, 100, 5, 0, 7); g.stroke();
  if (id === 'chef') { g.fillStyle = '#fff'; g.fillRect(36, 46, 88, 12); g.beginPath(); g.arc(126, 52, 7, 0, 7); g.fill(); }
  if (id === 'fan') { g.fillStyle = '#fff7ee'; g.beginPath(); g.arc(30, 60, 22, 0, 7); g.fill(); g.strokeStyle = '#3a6fd8'; g.lineWidth = 3; g.beginPath(); g.arc(30, 66, 12, Math.PI, 0); g.stroke(); g.fillStyle = '#e0c08a'; g.fillRect(28, 80, 4, 26); }
  if (id === 'king') { g.fillStyle = '#fff1a8'; g.beginPath(); g.moveTo(58, 40); g.lineTo(62, 18); g.lineTo(72, 32); g.lineTo(80, 14); g.lineTo(88, 32); g.lineTo(98, 18); g.lineTo(102, 40); g.closePath(); g.fill(); g.fillStyle = '#e0115f'; g.beginPath(); g.arc(80, 34, 4, 0, 7); g.fill(); }
  return c;
}
