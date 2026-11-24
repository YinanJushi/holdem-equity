// The whole slot machine in 3D (Three.js): cabinet, topper with chasing bulbs, jackpot meters, reels that really turn,
// LED read-outs, a sloped button deck with push buttons and chips, a side lever and a coin tray.
// slots.js keeps all the game logic and its plain HTML controls (hidden but still there for keyboards and screen readers).
// The 3D buttons just press those HTML buttons, and the 3D displays copy what the HTML shows.
// When WebGL is missing, slots.js keeps the flat machine.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const REELS = 5, N = 12, ALPHA = (Math.PI * 2) / N;                 // faces per drum, angle per face
const FACE = 1, GAP = 0.09, AP = FACE / (2 * Math.tan(ALPHA / 2));   // face height, gap between reels, drum apothem
const REEL_X = r => (r - 2) * (FACE + GAP);
const REEL_Y = 0.2, REEL_FRONT = -0.3;                                // reel window centre; drums sit a little behind the glass
const TEX = 256;
const THEME_BG = { fruit: ['#fffdf6', '#efe6cf'], safari: ['#fff4d6', '#e8d29e'], ocean: ['#e9fbff', '#bfe6f2'] };
const PALETTE = {
  fruit: { body: '#9d1442', deck: '#5c0a26', marquee: ['#3c0518', '#9d1442'], strip: [1.0, 0.25, 0.55] },
  safari: { body: '#7a4a16', deck: '#3e2208', marquee: ['#2a1604', '#8a5a1c'], strip: [1.0, 0.62, 0.2] },
  ocean: { body: '#0d5470', deck: '#062a3a', marquee: ['#03202c', '#0f6a8a'], strip: [0.25, 0.85, 1.0] },
};
const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
const easeOutQuint = p => 1 - Math.pow(1 - p, 5);
const $ = s => document.querySelector(s);
const txt = s => { const e = $(s); return e ? e.textContent.trim() : ''; };

function canvasTex(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { c, g: c.getContext('2d'), t };
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function rectShape(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
const goldText = (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.45, '#f2c14e'); gr.addColorStop(1, '#a8761c'); return gr; };

function create(host) {
  // ---------- renderer, scene, camera ----------
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.className = 'cab3d-canvas';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  // backdrop: a dark lounge with a soft warm glow behind the machine
  const bg = canvasTex(64, 512);
  { const g = bg.g, gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#1a0610'); gr.addColorStop(0.55, '#2b0c18'); gr.addColorStop(1, '#0e0306'); g.fillStyle = gr; g.fillRect(0, 0, 64, 512); }
  scene.background = bg.t;

  const camera = new THREE.PerspectiveCamera(30, 0.8, 0.1, 200);
  const cam = { dist: 22, yaw: 0.2, pitch: 0.08, px: 0, py: 0, punch: 0, shake: 0, focus: 0, tease: 0, lookX: 0 };

  scene.add(new THREE.HemisphereLight('#fff2dc', '#2a0610', 0.6));
  const key = new THREE.DirectionalLight('#ffffff', 1.5); key.position.set(-6, 9, 10); scene.add(key);
  const rim = new THREE.DirectionalLight('#ffcf8a', 1.2); rim.position.set(8, 4, -6); scene.add(rim);

  // ---------- materials ----------
  const gold = new THREE.MeshStandardMaterial({ color: "#d9a843", metalness: 1, roughness: 0.34 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#a9a9b2', metalness: 1, roughness: 0.22 });
  const black = new THREE.MeshStandardMaterial({ color: '#0b0204', roughness: 0.6 });
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#9d1442', metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const deckMat = new THREE.MeshPhysicalMaterial({ color: '#5c0a26', metalness: 0.3, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.25, 0.55) });

  const machine = new THREE.Group(); scene.add(machine);

  // ---------- cabinet body with a hole for the reels ----------
  const bodyShape = rectShape(-3.3, -5.3, 3.3, 2.3, 0.35);
  bodyShape.holes.push(rectShape(-2.9, REEL_Y - 1.65, 2.9, REEL_Y + 1.65, 0.18));
  const extr = { depth: 2.4, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 4, curveSegments: 10 };
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(bodyShape, extr), bodyMat);
  body.position.z = -2.4; machine.add(body);
  // inside of the reel window
  const inner = new THREE.Mesh(new THREE.BoxGeometry(5.9, 3.4, 3.2), new THREE.MeshStandardMaterial({ color: '#160307', roughness: 1, side: THREE.BackSide }));
  inner.position.set(0, REEL_Y, -2.3); machine.add(inner);
  // gold bezel round the window
  const bezShape = rectShape(-3.08, REEL_Y - 1.83, 3.08, REEL_Y + 1.83, 0.3);
  bezShape.holes.push(rectShape(-2.9, REEL_Y - 1.65, 2.9, REEL_Y + 1.65, 0.18));
  const bezel = new THREE.Mesh(new THREE.ExtrudeGeometry(bezShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 }), gold);
  bezel.position.z = 0.1; machine.add(bezel);
  // neon strips down both front edges
  [-1, 1].forEach(s => { const st = new THREE.Mesh(new THREE.BoxGeometry(0.07, 7.2, 0.07), stripMat); st.position.set(s * 3.36, -1.5, 0.05); machine.add(st); });

  // ---------- topper: arch with marquee and bulbs ----------
  const arch = new THREE.Shape();
  arch.moveTo(-3.15, 0); arch.lineTo(-3.15, 1.7); arch.quadraticCurveTo(-3.15, 3.15, 0, 3.15); arch.quadraticCurveTo(3.15, 3.15, 3.15, 1.7); arch.lineTo(3.15, 0); arch.lineTo(-3.15, 0);
  const topper = new THREE.Mesh(new THREE.ExtrudeGeometry(arch, { depth: 2.0, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 4, curveSegments: 24 }), bodyMat);
  topper.position.set(0, 2.3, -2.1); machine.add(topper);
  const marq = canvasTex(1024, 512);
  const marqMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 2.95), new THREE.MeshStandardMaterial({ map: marq.t, transparent: true, roughness: 0.35, emissive: '#ffffff', emissiveMap: marq.t, emissiveIntensity: 0.35 }));
  marqMesh.position.set(0, 2.3 + 1.5, 0.04); machine.add(marqMesh);
  const bulbs = [];
  const bulbGeo = new THREE.SphereGeometry(0.075, 12, 8);
  const addBulb = (x, y, z) => { const m = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.5) })); m.position.set(x, y, z); machine.add(m); bulbs.push(m); };
  { // along the arch
    const inset = new THREE.Shape();
    inset.moveTo(-2.98, 0.12); inset.lineTo(-2.98, 1.7); inset.quadraticCurveTo(-2.98, 2.98, 0, 2.98); inset.quadraticCurveTo(2.98, 2.98, 2.98, 1.7); inset.lineTo(2.98, 0.12);
    inset.getSpacedPoints(34).forEach(p => addBulb(p.x, 2.3 + p.y, 0.14));
    for (let i = 0; i <= 22; i++) addBulb(-3.0 + i * (6 / 22), 2.3 - 0.02, 0.16);   // row along the seam
  }

  // ---------- reels ----------
  const reelRoot = new THREE.Group(); reelRoot.position.set(0, REEL_Y, REEL_FRONT - AP); machine.add(reelRoot);
  const sweep = new THREE.PointLight('#ffd27a', 0, 7, 1.6); sweep.position.set(-4, 0, AP + 1.4); reelRoot.add(sweep);
  const teaseLight = new THREE.PointLight('#ffb020', 0, 4, 1.4); teaseLight.position.set(0, 0, AP + 1); reelRoot.add(teaseLight);
  const reelLight = new THREE.PointLight('#fff4dc', 0.5, 9, 1.2); reelLight.position.set(0, 1.2, AP + 2.2); reelRoot.add(reelLight);

  let sharp = [], blurred = [], themeId = 'fruit';
  function svgImage(svg) {
    const s = svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${TEX}" height="${TEX}" `);
    return new Promise(res => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); });
  }
  function faceCanvas(img, blur) {
    const { g, t } = canvasTex(TEX, TEX), [a, b] = THEME_BG[themeId] || THEME_BG.fruit;
    const grd = g.createLinearGradient(0, 0, 0, TEX); grd.addColorStop(0, b); grd.addColorStop(0.12, a); grd.addColorStop(0.88, a); grd.addColorStop(1, b);
    g.fillStyle = grd; g.fillRect(0, 0, TEX, TEX);
    if (img) {
      const s = TEX * 0.76, o = (TEX - s) / 2;
      if (blur) { for (let i = -9; i <= 9; i++) { g.globalAlpha = 0.11 * (1 - Math.abs(i) / 10); g.drawImage(img, o, o + i * 9, s, s); } g.globalAlpha = 1; }
      else { g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowOffsetY = 5; g.shadowBlur = 6; g.drawImage(img, o, o, s, s); }
    }
    t.needsUpdate = true;
    return t;
  }

  const faceGeo = new THREE.PlaneGeometry(FACE, FACE * 1.0005);
  const haloTex = (() => { const { g, t } = canvasTex(128, 128); g.strokeStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 14; g.lineWidth = 9; g.strokeRect(14, 14, 100, 100); t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t; })();
  const haloGeo = new THREE.PlaneGeometry(FACE * 1.22, FACE * 1.22);
  const drumRimGeo = new THREE.CylinderGeometry(AP * 1.07, AP * 1.07, 0.035, 48);
  const hubGeo = new THREE.CylinderGeometry(AP * 0.98, AP * 0.98, FACE * 0.995, N, 1, true);
  const hubMat = new THREE.MeshStandardMaterial({ color: '#2a0810', roughness: 0.9, side: THREE.BackSide });
  const reels = [];
  for (let r = 0; r < REELS; r++) {
    const group = new THREE.Group(); group.position.x = REEL_X(r); reelRoot.add(group);
    const drum = new THREE.Group(); group.add(drum);
    const faces = [];
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, emissive: '#ffb020', emissiveIntensity: 0, envMapIntensity: 0.15 });
      const m = new THREE.Mesh(faceGeo, mat);
      const holder = new THREE.Group(); holder.rotation.x = -i * ALPHA;
      m.position.z = AP;
      const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ map: haloTex, color: new THREE.Color(2.8, 1.9, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.z = -0.02; m.add(halo);
      holder.add(m); drum.add(holder);
      faces.push({ mesh: m, mat, halo, sym: 0, i, lift: 0, dim: 1, hit: false });
    }
    const hub = new THREE.Mesh(hubGeo, hubMat); hub.rotation.z = Math.PI / 2; drum.add(hub);
    [-1, 1].forEach(s => { const rm = new THREE.Mesh(drumRimGeo, gold); rm.rotation.z = Math.PI / 2; rm.position.x = s * (FACE / 2 + 0.02); group.add(rm); });
    reels.push({ r, group, drum, faces, theta: 0, anim: null, speed: 0, blur: false, tease: 0, bounce: 0 });
  }
  function setFace(f, sym, blur) {
    f.sym = sym;
    const t = (blur ? blurred : sharp)[sym];
    if (t) { const first = !f.mat.map; f.mat.map = t; if (first) f.mat.needsUpdate = true; }
  }
  const frontIndex = theta => ((Math.round(theta / ALPHA) % N) + N) % N;
  const faceAt = (R, row) => R.faces[(frontIndex(R.theta) + (1 - row) + N) % N];
  function setGrid(grid) { reels.forEach((R, r) => { R.theta = Math.round(R.theta / ALPHA) * ALPHA; for (let row = 0; row < 3; row++) setFace(faceAt(R, row), grid[r][row], false); }); }

  // glass over the reels: a faint reflective pane, a diagonal glint, and shade at the top and bottom
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.3), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.025, depthWrite: false }));
  glass.position.set(0, REEL_Y, 0.06); machine.add(glass);
  const glint = canvasTex(256, 128);
  { const g = glint.g, gr = g.createLinearGradient(0, 0, 256, 128); gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(0.42, 'rgba(255,255,255,.16)'); gr.addColorStop(0.47, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,.08)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128); }
  const glintMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.3), new THREE.MeshBasicMaterial({ map: glint.t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glintMesh.position.set(0, REEL_Y, 0.07); machine.add(glintMesh);
  const vig = canvasTex(8, 256);
  { const g = vig.g, gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.17, 'rgba(0,0,0,0)'); gr.addColorStop(0.83, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.85)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 256); }
  const vigMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.3), new THREE.MeshBasicMaterial({ map: vig.t, transparent: true, depthWrite: false }));
  vigMesh.position.set(0, REEL_Y, -0.1); machine.add(vigMesh);

  // ---------- LED read-outs ----------
  const led = canvasTex(1024, 180);
  const ledFrame = new THREE.Mesh(new RoundedBoxGeometry(6.1, 1.16, 0.08, 2, 0.04), gold); ledFrame.position.set(0, -2.2, 0.1); machine.add(ledFrame);
  const ledMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.94, 1.04), new THREE.MeshBasicMaterial({ map: led.t }));
  ledMesh.position.set(0, -2.2, 0.15); machine.add(ledMesh);

  // ---------- button deck ----------
  const deck = new THREE.Group(); deck.position.set(0, -3.15, 0.95); deck.rotation.x = 0.3; machine.add(deck);
  const deckBox = new THREE.Mesh(new RoundedBoxGeometry(6.5, 0.34, 2.0, 3, 0.1), deckMat); deck.add(deckBox);
  const deckTop = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.76), new THREE.MeshStandardMaterial({ color: '#140306', roughness: 0.55, metalness: 0.2 }));
  deckTop.rotation.x = -Math.PI / 2; deckTop.position.y = 0.171; deck.add(deckTop);
  const deckTrim = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.05, 0.05), gold); deckTrim.position.set(0, 0.17, 0.98); deck.add(deckTrim);

  const clickables = [], buttons = {};
  function labelTex(lines, { bg = null, color = '#fff', size = 64, w = 256, h = 256, font = 'Libre Franklin', weight = 800 } = {}) {
    const T = canvasTex(w, h), g = T.g;
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const L = [].concat(lines);
    L.forEach((s, i) => { g.font = `${weight} ${i ? size * 0.55 : size}px "${font}", Arial, sans-serif`; g.fillText(s, w / 2, h / 2 + (i - (L.length - 1) / 2) * size * 0.85); });
    T.t.needsUpdate = true;
    return T;
  }
  // round push button: gold collar, glossy cap, printed label
  function pushButton(id, { x, z, r, color, label, act, dome = false }) {
    const g = new THREE.Group(); g.position.set(x, 0.17, z); deck.add(g);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.06, r + 0.08, 0.07, 40), gold); collar.position.y = 0.035; g.add(collar);
    const capMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, emissive: color, emissiveIntensity: 0.15 });
    const cap = new THREE.Group(); g.add(cap);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.14, 40), capMat); cyl.position.y = 0.1; cap.add(cyl);
    let topY = 0.171;
    if (dome) { const d = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), capMat); d.scale.y = 0.38; d.position.y = 0.17; cap.add(d); topY = 0.17 + r * 0.38 + 0.002; }
    const lt = labelTex(label);
    const lab = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 40), new THREE.MeshBasicMaterial({ map: lt.t, transparent: true, depthWrite: false }));
    lab.rotation.x = -Math.PI / 2; lab.position.y = topY + 0.004; cap.add(lab);
    const b = { id, g, cap, capMat, lab, lt, act, press: 0, baseEm: 0.15, r };
    [cyl, lab].concat(dome ? cap.children[1] : []).forEach(m => { m.userData.btn = b; clickables.push(m); });
    buttons[id] = b;
    return b;
  }
  function pillButton(id, { x, z, w, d, color, label, act }) {
    const g = new THREE.Group(); g.position.set(x, 0.17, z); deck.add(g);
    const collar = new THREE.Mesh(new RoundedBoxGeometry(w + 0.12, 0.07, d + 0.12, 2, 0.05), gold); collar.position.y = 0.035; g.add(collar);
    const capMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, emissive: color, emissiveIntensity: 0.15 });
    const cap = new THREE.Group(); g.add(cap);
    const box = new THREE.Mesh(new RoundedBoxGeometry(w, 0.16, d, 3, 0.06), capMat); box.position.y = 0.1; cap.add(box);
    const lt = labelTex(label, { w: 512, h: 160, size: 74 });
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, d * 0.86), new THREE.MeshBasicMaterial({ map: lt.t, transparent: true, depthWrite: false }));
    lab.rotation.x = -Math.PI / 2; lab.position.y = 0.185; cap.add(lab);
    const b = { id, g, cap, capMat, lab, lt, act, press: 0, baseEm: 0.15 };
    [box, lab].forEach(m => { m.userData.btn = b; clickables.push(m); });
    buttons[id] = b;
    return b;
  }
  // casino chips to insert
  const CHIP = { 10: ['#f4f1ea', '#1f5fa8'], 50: ['#c8202f', '#ffffff'], 100: ['#1a1a1a', '#f2c14e'], 500: ['#6a2fa8', '#ffffff'] };
  function chipButton(n, x, z) {
    const [base, edge] = CHIP[n];
    const g = new THREE.Group(); g.position.set(x, 0.17, z); deck.add(g);
    const T = canvasTex(256, 256), c = T.g;
    c.fillStyle = base; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill();
    c.fillStyle = edge; for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(128, 128, 128, (i / 8) * Math.PI * 2, (i / 8) * Math.PI * 2 + 0.28); c.arc(128, 128, 100, (i / 8) * Math.PI * 2 + 0.28, (i / 8) * Math.PI * 2, true); c.fill(); }
    c.strokeStyle = edge; c.lineWidth = 5; c.setLineDash([10, 8]); c.beginPath(); c.arc(128, 128, 82, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    c.fillStyle = edge; c.font = '800 84px "Libre Franklin", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), 128, 134);
    T.t.needsUpdate = true;
    const side = new THREE.MeshStandardMaterial({ color: base, roughness: 0.4 });
    const faceM = new THREE.MeshStandardMaterial({ map: T.t, roughness: 0.4 });
    const cap = new THREE.Group(); g.add(cap);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 40), [side, faceM, side]); m.position.y = 0.06; cap.add(m);
    const b = { id: 'coin' + n, g, cap, act: 'coin:' + n, press: 0, chip: { base, edge, tex: T.t } };
    m.userData.btn = b; clickables.push(m);
    buttons[b.id] = b;
  }
  pushButton('down', { x: -2.6, z: 0.42, r: 0.25, color: '#b07a1a', label: '−', act: 'betDown' });
  pushButton('up', { x: -1.92, z: 0.42, r: 0.25, color: '#b07a1a', label: '+', act: 'betUp' });
  pushButton('spin', { x: 0.05, z: 0.32, r: 0.6, color: '#d8202c', label: ['SPIN'], act: 'spin', dome: true });
  pushButton('auto', { x: 1.62, z: 0.42, r: 0.29, color: '#1f5fa8', label: ['AUTO'], act: 'auto' });
  pushButton('pays', { x: 2.42, z: 0.42, r: 0.29, color: '#2e7d4a', label: ['PAYS'], act: 'pays' });
  [10, 50, 100, 500].forEach((n, i) => chipButton(n, -1.85 + i * 0.62, -0.55));
  pillButton('cash', { x: 1.95, z: -0.55, w: 1.25, d: 0.42, color: '#c99a2e', label: 'CASH OUT', act: 'cash' });
  // bet-per-line plate and the coin slot
  const betPlate = canvasTex(512, 96);
  const betMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.24), new THREE.MeshBasicMaterial({ map: betPlate.t, transparent: true }));
  betMesh.rotation.x = -Math.PI / 2; betMesh.position.set(-2.26, 0.175, 0.86); deck.add(betMesh);
  const slotG = new THREE.Group(); slotG.position.set(-2.75, 0.17, -0.55); deck.add(slotG);
  const slotPlate = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.06, 0.5, 2, 0.05), gold); slotPlate.position.y = 0.03; slotG.add(slotPlate);
  const slotHole = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.08), black); slotHole.position.y = 0.065; slotG.add(slotHole);
  const slotGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 0.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  slotGlow.rotation.x = -Math.PI / 2; slotGlow.position.y = 0.08; slotG.add(slotGlow);

  // ---------- lever ----------
  const leverG = new THREE.Group(); leverG.position.set(3.55, -0.4, -1.0); machine.add(leverG);
  const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.4, 32), new THREE.MeshStandardMaterial({ color: '#7a7a84', metalness: 1, roughness: 0.35, envMapIntensity: 0.6 })); lBase.rotation.z = Math.PI / 2; leverG.add(lBase);
  const lPlate = new THREE.Mesh(new RoundedBoxGeometry(0.12, 1.4, 1.0, 2, 0.05), gold); lPlate.position.set(-0.2, 0, 0); leverG.add(lPlate);
  const pivot = new THREE.Group(); pivot.position.x = 0.12; leverG.add(pivot);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 2.5, 20), chrome); rod.position.y = 1.25; pivot.add(rod);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 20), new THREE.MeshPhysicalMaterial({ color: '#d41824', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }));
  ball.position.y = 2.55; pivot.add(ball);
  const leverBtn = { id: 'lever', act: 'lever', press: 0 };
  [rod, ball, lBase].forEach(m => { m.userData.btn = leverBtn; clickables.push(m); });
  let leverT = -1;

  // ---------- coin tray ----------
  const trayBack = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.75, 0.1, 2, 0.05), black); trayBack.position.set(0, -4.55, 0.1); machine.add(trayBack);
  const trayRim = new THREE.Mesh(new RoundedBoxGeometry(2.8, 0.1, 0.8, 2, 0.04), gold); trayRim.position.set(0, -4.95, 0.45); machine.add(trayRim);
  const trayFloor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.7), black); trayFloor.position.set(0, -4.9, 0.42); machine.add(trayFloor);
  const chute = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.3, 0.3, 2, 0.06), chrome); chute.position.set(0, -4.25, 0.2); machine.add(chute);

  // ---------- sparks (additive points, picked up by the bloom) ----------
  const MAXP = 1100;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const dot = (() => { const { g, t } = canvasTex(64, 64); const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,230,160,.85)'); rg.addColorStop(1, 'rgba(255,160,40,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); t.needsUpdate = true; return t; })();
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.16, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  points.frustumCulled = false; machine.add(points);
  const parts = [];
  const PCOL = [[1, 0.85, 0.35], [1, 0.55, 0.2], [1, 1, 0.85], [1, 0.35, 0.45]];
  // x, y, z in machine space
  function burst(x, y, z, n, { speed = 3, up = 0, spread = 1, life = 0.7, col, grav = 5 } = {}) {
    for (let k = 0; k < n && parts.length < MAXP; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      parts.push({ x, y, z, vx: Math.cos(a) * s * spread, vy: Math.sin(a) * s + up, vz: Math.random() * s * 0.8, life, max: life, grav, c: col || PCOL[(Math.random() * PCOL.length) | 0] });
    }
  }
  const atReel = (x, y, n, o) => burst(x, REEL_Y + y, REEL_FRONT + 0.3, n, o);   // just in front of the reel faces
  function stepParts(dt) {
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k]; p.life -= dt;
      if (p.life <= 0) { parts.splice(k, 1); continue; }
      p.vy -= p.grav * dt; p.vx *= 0.97; p.vz *= 0.97;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (let k = 0; k < MAXP; k++) {
      const p = parts[k];
      if (p) { const f = p.life / p.max; pPos[k * 3] = p.x; pPos[k * 3 + 1] = p.y; pPos[k * 3 + 2] = p.z; pCol[k * 3] = p.c[0] * f; pCol[k * 3 + 1] = p.c[1] * f; pCol[k * 3 + 2] = p.c[2] * f; }
      else { pPos[k * 3 + 2] = -80; }
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }

  // ---------- flying coins (insert and cash out) ----------
  const coinGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 28);
  const coinGold = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 1, roughness: 0.22 });
  const flyers = [];
  const wp = new THREE.Vector3();
  function coinIn(n) {
    const b = buttons['coin' + n]; if (!b) return;
    b.press = 1;
    const from = b.g.getWorldPosition(new THREE.Vector3()), to = slotG.getWorldPosition(new THREE.Vector3());
    machine.worldToLocal(from); machine.worldToLocal(to);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 32), [new THREE.MeshStandardMaterial({ color: b.chip.base }), new THREE.MeshStandardMaterial({ map: b.chip.tex }), new THREE.MeshStandardMaterial({ color: b.chip.base })]);
    machine.add(m);
    flyers.push({ m, t: 0, dur: 0.5, kind: 'in', from, to, done: () => {
      slotFlash = 1;
      burst(to.x, to.y + 0.1, to.z, 22, { speed: 1.6, up: 1.5, life: 0.5 });
      m.geometry.dispose(); m.material.forEach(x => x.dispose());
    } });
  }
  let slotFlash = 0;
  function cashOut(n) {
    const count = Math.min(40, 8 + Math.round(n / 40));
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(coinGeo, coinGold); machine.add(m);
      m.position.set((Math.random() - 0.5) * 0.5, -4.25, 0.35);
      flyers.push({ m, t: -i * 0.045, kind: 'out', vx: (Math.random() - 0.5) * 2.4, vy: 0.5 + Math.random(), vz: 0.6 + Math.random() * 0.6, spin: (Math.random() - 0.5) * 18, life: 2.6 });
    }
    cam.shake = Math.min(1, cam.shake + 0.4);
  }
  function stepFlyers(dt) {
    for (let k = flyers.length - 1; k >= 0; k--) {
      const f = flyers[k]; f.t += dt;
      if (f.kind === 'in') {
        const p = Math.min(1, f.t / f.dur), e = easeOutCubic(p);
        f.m.position.lerpVectors(f.from, f.to, e); f.m.position.y += Math.sin(p * Math.PI) * 0.9;
        f.m.rotation.x = p * Math.PI * 3; f.m.rotation.z = p * Math.PI * 0.5;
        f.m.scale.setScalar(p > 0.85 ? 1 - (p - 0.85) / 0.15 * 0.9 : 1);
        if (p >= 1) { machine.remove(f.m); f.done(); flyers.splice(k, 1); }
      } else {
        if (f.t < 0) { f.m.visible = false; continue; }
        f.m.visible = true;
        f.vy -= 9 * dt;
        f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt;
        f.m.rotation.x += f.spin * dt; f.m.rotation.z += f.spin * 0.5 * dt;
        if (f.m.position.y < -4.83) { f.m.position.y = -4.83; f.vy = Math.abs(f.vy) * 0.35; f.vx *= 0.6; f.vz *= 0.4; f.spin *= 0.5; if (Math.abs(f.vy) < 0.4) { f.vy = 0; f.m.rotation.x = Math.PI / 2 * 0; } }
        f.m.position.z = Math.min(0.7, f.m.position.z); f.m.position.x = Math.max(-1.2, Math.min(1.2, f.m.position.x));
        f.life -= dt;
        if (f.life < 0.4) f.m.scale.setScalar(Math.max(0.01, f.life / 0.4));
        if (f.life <= 0) { machine.remove(f.m); flyers.splice(k, 1); }
      }
    }
  }

  // ---------- paylines drawn in 3D across the reels ----------
  const LINE_COL = [[2.4, 1.6, 0.35], [2.4, 0.5, 1.2], [0.5, 1.8, 2.4], [0.8, 2.4, 0.8], [2.4, 0.9, 0.3]];
  let lineMeshes = [];
  function lines(rowSets) {
    lineMeshes.forEach(l => { machine.remove(l.m); l.m.geometry.dispose(); l.m.material.dispose(); });
    lineMeshes = [];
    rowSets.forEach((rows, k) => {
      const pts = rows.map((row, r) => { const a = (1 - row) * ALPHA; return new THREE.Vector3(REEL_X(r), REEL_Y + Math.sin(a) * AP, REEL_FRONT - AP + Math.cos(a) * AP + 0.42); });
      pts.unshift(new THREE.Vector3(-2.85, pts[0].y, pts[0].z)); pts.push(new THREE.Vector3(2.85, pts[pts.length - 1].y, pts[pts.length - 1].z));
      const path = new THREE.CurvePath(); for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      const geo = new THREE.TubeGeometry(path, 120, 0.035, 8, false);
      const c = LINE_COL[k % LINE_COL.length];
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), transparent: true, opacity: 0.95 }));
      geo.setDrawRange(0, 0); machine.add(m);
      lineMeshes.push({ m, t: -k * 0.12, total: geo.index.count });
    });
  }
  function stepLines(dt) { lineMeshes.forEach(l => { l.t += dt; const p = Math.max(0, Math.min(1, l.t / 0.45)); l.m.geometry.setDrawRange(0, Math.floor(l.total * p / 6) * 6); }); }

  // ---------- displays: copy what the HTML machine shows ----------
  let dirty = true, theme = { title: ['Fruit', 'Party'] };
  const cabEl = $('#cabinet');
  if (cabEl) new MutationObserver(() => (dirty = true)).observe(cabEl, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'class'] });
  if (document.fonts) document.fonts.ready.then(() => (dirty = true));
  function drawMarquee() {
    const g = marq.g, W = 1024, H = 512, P = PALETTE[themeId] || PALETTE.fruit;
    g.clearRect(0, 0, W, H);
    const archPath = (inset) => { g.beginPath(); const x0 = inset, x1 = W - inset, yb = H, ym = H * 0.42, yt = inset * 0.9; g.moveTo(x0, yb); g.lineTo(x0, ym); g.quadraticCurveTo(x0, yt, W / 2, yt); g.quadraticCurveTo(x1, yt, x1, ym); g.lineTo(x1, yb); g.closePath(); };
    archPath(4); const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, P.marquee[0]); gr.addColorStop(0.6, P.marquee[1]); gr.addColorStop(1, P.marquee[0]); g.fillStyle = gr; g.fill();
    // sunburst rays
    g.save(); archPath(4); g.clip(); g.globalAlpha = 0.12; g.fillStyle = '#ffe9b0';
    for (let i = 0; i < 24; i++) { const a0 = (i / 24) * Math.PI, a1 = a0 + Math.PI / 48; g.beginPath(); g.moveTo(W / 2, H * 0.62); g.lineTo(W / 2 + Math.cos(Math.PI + a0) * 900, H * 0.62 + Math.sin(Math.PI + a0) * 900); g.lineTo(W / 2 + Math.cos(Math.PI + a1) * 900, H * 0.62 + Math.sin(Math.PI + a1) * 900); g.fill(); }
    g.restore(); g.globalAlpha = 1;
    archPath(26); g.strokeStyle = '#f2c14e'; g.lineWidth = 5; g.stroke();
    // title
    const [a, b] = theme.title || ['Lucky', 'Slots'];
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = '700 118px "Bodoni Moda", Georgia, serif';
    const wa = g.measureText(a + ' ').width; g.font = 'italic 600 118px "Bodoni Moda", Georgia, serif'; const wb = g.measureText(b).width;
    const x0 = W / 2 - (wa + wb) / 2, ty = 258;
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
    g.textAlign = 'left';
    g.font = '700 118px "Bodoni Moda", Georgia, serif'; g.fillStyle = goldText(g, 150, 270); g.fillText(a, x0, ty);
    g.font = 'italic 600 118px "Bodoni Moda", Georgia, serif'; g.fillStyle = '#fff6dc'; g.fillText(b, x0 + wa, ty);
    g.shadowColor = 'transparent';
    // jackpot meters
    const J = [['GRAND', '#jpGrand', '#ffd86a'], ['MAJOR', '#jpMajor', '#ff6a7a'], ['MINOR', '#jpMinor', '#7ab8ff'], ['MINI', '#jpMini', '#8affa0']];
    const bw = 214, gap = 14, bx = (W - (bw * 4 + gap * 3)) / 2;
    J.forEach(([name, sel, col], i) => {
      const x = bx + i * (bw + gap), y = 318;
      roundRect(g, x, y, bw, 118, 14); g.fillStyle = '#0d0204'; g.fill(); g.lineWidth = 4; g.strokeStyle = i ? 'rgba(242,193,78,.55)' : '#f2c14e'; g.stroke();
      g.textAlign = 'center'; g.fillStyle = col; g.font = '800 26px "Libre Franklin", Arial'; g.fillText(name, x + bw / 2, y + 38);
      g.font = '400 52px "Share Tech Mono", monospace'; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 12; g.fillText(txt(sel), x + bw / 2, y + 96); g.shadowBlur = 0; g.shadowColor = 'transparent';
    });
    marq.t.needsUpdate = true;
  }
  function drawLED() {
    const g = led.g, W = 1024, H = 180;
    g.fillStyle = '#070102'; g.fillRect(0, 0, W, H);
    const cells = [['CREDITS', '#credits', '#ff4a5a'], ['BET', '#betAmt', '#ff4a5a'], ['WIN', '#winAmt', '#5aff7a']];
    cells.forEach(([name, sel, col], i) => {
      const x = 14 + i * 336, w = 324;
      roundRect(g, x, 10, w, 104, 12); g.fillStyle = '#120305'; g.fill(); g.strokeStyle = 'rgba(201,154,46,.5)'; g.lineWidth = 3; g.stroke();
      g.textAlign = 'center'; g.fillStyle = 'rgba(255,230,200,.75)'; g.font = '700 22px "Libre Franklin", Arial'; g.fillText(name, x + w / 2, 38);
      g.font = '400 58px "Share Tech Mono", monospace'; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 14; g.fillText(txt(sel), x + w / 2, 98); g.shadowBlur = 0;
    });
    const fs = $('#fsBanner') && !$('#fsBanner').hidden;
    g.textAlign = 'center'; g.font = '600 30px "Libre Franklin", Arial';
    if (fs) {
      roundRect(g, W / 2 - 230, 124, 460, 46, 23); g.fillStyle = '#8b4bd6'; g.fill(); g.strokeStyle = '#f2c14e'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#fff'; g.fillText(`FREE SPINS ${txt('#fsLeft')} · WINS ×2`, W / 2, 158);
    } else { g.fillStyle = '#ffe6b0'; let s = txt('#ticker'); if (s.length > 62) s = s.slice(0, 60) + '…'; g.fillText(s, W / 2, 158); }
    led.t.needsUpdate = true;
  }
  function drawLabels() {
    const g = betPlate.g; g.clearRect(0, 0, 512, 96);
    g.fillStyle = 'rgba(255,230,190,.85)'; g.font = '700 34px "Libre Franklin", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`BET / LINE  ${txt('#lineBet')}`, 256, 48); betPlate.t.needsUpdate = true;
    const spinTxt = /free/i.test(txt('#spinBtn')) ? ['FREE', 'SPIN'] : ['SPIN'];
    const autoTxt = txt('#autoBtn').toUpperCase().split(' ');
    redrawLabel(buttons.spin, spinTxt); redrawLabel(buttons.auto, autoTxt);
  }
  function redrawLabel(b, lines) {
    const key = lines.join('|'); if (b._lab === key) return; b._lab = key;
    const T = b.lt, g = T.g; g.clearRect(0, 0, 256, 256); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((s, i) => { g.font = `800 ${i ? 46 : 64}px "Libre Franklin", Arial`; g.fillText(s, 128, 128 + (i - (lines.length - 1) / 2) * 56); });
    T.t.needsUpdate = true;
  }

  // ---------- theme ----------
  async function setTheme(id, svgs, title) {
    themeId = id; theme.title = title || theme.title;
    const P = PALETTE[id] || PALETTE.fruit;
    bodyMat.color.set(P.body); deckMat.color.set(P.deck); stripMat.color.setRGB(...P.strip);
    dirty = true;
    const imgs = await Promise.all(svgs.map(svgImage));
    const old = [...sharp, ...blurred];
    sharp = imgs.map(i => faceCanvas(i, false));
    blurred = imgs.map(i => faceCanvas(i, true));
    reels.forEach(R => R.faces.forEach(f => setFace(f, f.sym, false)));
    old.forEach(t => t.dispose());
  }

  // ---------- bloom ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.3, 1.45);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let bloomBoost = 0;

  // ---------- size: fit the whole machine, lever and all ----------
  let fitDist = 22;
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    fitDist = Math.max(5.95 / t, 4.1 / (t * camera.aspect)) + 1.2;
  }
  new ResizeObserver(resize).observe(host);
  resize();

  // ---------- pointer: tilt the view, hover and press the buttons ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hover = null;
  const pick = e => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(clickables, false)[0];
    return hit ? hit.object.userData.btn : null;
  };
  renderer.domElement.addEventListener('pointermove', e => {
    const r = renderer.domElement.getBoundingClientRect();
    cam.px = ((e.clientX - r.left) / r.width) * 2 - 1; cam.py = ((e.clientY - r.top) / r.height) * 2 - 1;
    hover = pick(e); renderer.domElement.style.cursor = hover ? 'pointer' : '';
  });
  renderer.domElement.addEventListener('pointerleave', () => { cam.px = cam.py = 0; hover = null; });
  renderer.domElement.addEventListener('pointerdown', e => {
    const b = pick(e); if (!b) return;
    e.preventDefault();
    if (b !== leverBtn && !b.id.startsWith('coin')) b.press = 1;
    const act = b.act;
    if (act.startsWith('coin:')) { const el = document.querySelector(`[data-coin="${act.slice(5)}"]`); if (el) el.click(); return; }
    const ids = { spin: '#spinBtn', betUp: '#betUp', betDown: '#betDown', auto: '#autoBtn', pays: '#payBtn', cash: '#cashBtn', lever: '#lever' };
    const el = $(ids[act]); if (el && !el.disabled) el.click();
  });

  // ---------- spinning ----------
  function spin(grid, { tease = 0, onStop, onTease } = {}) {
    lines([]);
    return new Promise(done => {
      let left = REELS;
      cam.punch = 1; sweep.intensity = 0;
      reels.forEach((R, r) => {
        const slow = tease && r >= tease;
        const c0 = frontIndex(R.theta);
        const turns = 3 + r + (slow ? 3 + (r - tease) * 2 : 0);
        const step = turns * N + 6;
        const c1 = (c0 + step) % N;
        for (let i = 0; i < N; i++) { const d = (i - c0 + N) % N; if (d <= 1 || d === N - 1) continue; setFace(R.faces[i], Math.floor(Math.random() * 8), false); }
        for (let row = 0; row < 3; row++) setFace(R.faces[(c1 + (1 - row) + N) % N], grid[r][row], false);
        const start = Math.round(R.theta / ALPHA) * ALPHA;
        R.anim = { t: -r * 0.07, start, target: start + step * ALPHA, dur: 0.9 + r * 0.28 + (slow ? 1.8 + (r - tease) * 1.1 : 0), slow, wind: 0.16, over: slow ? 0.1 : 0.2 + r * 0.01,
          onTeaseStart: () => onTease && onTease(r),
          onStop: () => { left--; onStop && onStop(r); if (left === 0) done(); } };
      });
    });
  }
  function stepReel(R, dt) {
    const A = R.anim; if (!A) return;
    const prev = R.theta, WIND = 0.17, SETTLE = 0.42;
    A.t += dt;
    if (A.t < 0) return;
    if (A.t < WIND) R.theta = A.start - A.wind * Math.sin((A.t / WIND) * Math.PI * 0.5);
    else if (A.t < WIND + A.dur) {
      const p = (A.t - WIND) / A.dur, e = A.slow ? easeOutQuint(p) : easeOutCubic(p);
      R.theta = A.start - A.wind + (A.target + A.over - (A.start - A.wind)) * e;
      if (A.slow && !A.teased && p > 0.05) { A.teased = true; A.onTeaseStart(); R.tease = 1; }
    } else if (A.t < WIND + A.dur + SETTLE) {
      if (!A.landed) { A.landed = true; land(R); }
      const p = (A.t - WIND - A.dur) / SETTLE;
      R.theta = A.target + A.over * Math.exp(-6 * p) * Math.cos(p * Math.PI * 2.5);
    } else { R.theta = A.target; R.anim = null; R.tease = 0; A.onStop(); }
    R.speed = Math.abs(R.theta - prev) / Math.max(dt, 1e-3);
    const blur = R.speed > 9;
    if (blur !== R.blur) { R.blur = blur; R.faces.forEach(f => setFace(f, f.sym, blur)); }
  }
  function land(R) {
    R.bounce = 1;
    cam.shake = Math.min(1, cam.shake + 0.3 + (R.r === REELS - 1 ? 0.25 : 0));
    const x = REEL_X(R.r);
    atReel(x, -1.45, 26, { speed: 2.6, up: 1.4, life: 0.55 });
    atReel(x, 1.45, 14, { speed: 2, up: -0.5, life: 0.45 });
    if (R.tease) { atReel(x, 0, 80, { speed: 5, up: 1, life: 0.9 }); bloomBoost = 1; }
  }

  // ---------- wins ----------
  let hitSet = new Set(), winPulse = 0, celebrateT = 0, celebrateLvl = 0;
  function highlight(cells) {
    reels.forEach(R => R.faces.forEach(f => (f.hit = false)));
    hitSet = new Set(cells.map(([r, row]) => r + ':' + row));
    cells.forEach(([r, row]) => (faceAt(reels[r], row).hit = true));
    winPulse = cells.length ? 0.0001 : 0;
    if (cells.length) {
      cells.forEach(([r, row]) => atReel(REEL_X(r), (1 - row) * FACE * 0.93, 18, { speed: 3.2, up: 1.2, life: 0.7 }));
      bloomBoost = Math.max(bloomBoost, 0.6);
    } else lines([]);
  }
  function celebrate(level) {
    celebrateT = 1.8 + level * 0.6; celebrateLvl = level; cam.punch = 1.4; bloomBoost = 1.4;
    for (let r = 0; r < REELS; r++) atReel(REEL_X(r), -1.6, 40 + level * 15, { speed: 4 + level, up: 4 + level, life: 1.2 });
    // fountains from the topper corners
    [-1, 1].forEach(s => burst(s * 2.9, 4.6, 0.3, 50 + level * 20, { speed: 3 + level, up: 3, life: 1.4 }));
  }
  function pullLever() { leverT = 0; }

  // ---------- frame loop ----------
  const clock = new THREE.Clock();
  let tAll = 0;
  const tgt = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.2, clock.getDelta()); tAll += dt;
    if (dirty) { dirty = false; drawMarquee(); drawLED(); drawLabels(); }

    let anySpin = false, teaseR = -1;
    reels.forEach(R => { stepReel(R, dt); if (R.anim) anySpin = true; if (R.tease && teaseR < 0) teaseR = R.r; R.drum.rotation.x = R.theta; });

    sweep.intensity += ((anySpin ? 2.2 : 0) - sweep.intensity) * Math.min(1, dt * 6);
    sweep.position.x = Math.sin(tAll * 3.2) * 3.4;
    teaseLight.intensity += ((teaseR >= 0 ? 2.5 + Math.sin(tAll * 18) : 0) - teaseLight.intensity) * Math.min(1, dt * 8);
    if (teaseR >= 0) { teaseLight.position.x = REEL_X(teaseR); if (Math.random() < 0.7) atReel(REEL_X(teaseR) + (Math.random() - 0.5) * 0.9, -1.6, 2, { speed: 0.6, up: 3.2, spread: 0.3, life: 0.9 }); }

    if (winPulse) winPulse += dt;
    const anyHit = hitSet.size > 0;
    reels.forEach(R => {
      const reelTease = R.r === teaseR ? 0.5 + 0.5 * Math.sin(tAll * 14) : 0;
      R.bounce = Math.max(0, R.bounce - dt * 3);
      R.group.scale.setScalar(1 + R.bounce * R.bounce * 0.035);
      R.faces.forEach(f => {
        f.lift += ((f.hit ? 1 : 0) - f.lift) * Math.min(1, dt * 9);
        const beat = f.hit ? 0.5 + 0.5 * Math.sin(winPulse * 9) : 0;
        f.mesh.position.z = AP + f.lift * (0.22 + beat * 0.08);
        f.mesh.scale.setScalar(1 + f.lift * (0.06 + beat * 0.07));
        f.mesh.rotation.y = f.hit ? Math.sin(winPulse * 4 + R.r) * 0.18 * f.lift : 0;
        f.mat.emissiveIntensity = f.hit ? 0.03 + beat * 0.06 : reelTease * 0.12;
        f.halo.material.opacity = Math.max(f.lift * (0.55 + beat * 0.45), reelTease * 0.22);
        f.halo.visible = f.halo.material.opacity > 0.01;
        f.dim += ((anyHit && !f.hit && !anySpin ? 0.55 : 1) - f.dim) * Math.min(1, dt * 6);
        f.mat.color.setScalar(f.dim * 0.86);
      });
    });

    // bulbs: slow chase when idle, fast while spinning, all flashing on a big win
    const rate = celebrateT > 0 ? 0 : anySpin ? 14 : 4;
    bulbs.forEach((m, i) => {
      let on;
      if (celebrateT > 0) on = Math.sin(tAll * 16) > 0 ? 1 : 0.15;
      else on = ((i + Math.floor(tAll * rate)) % 4 === 0) ? 1 : 0.22;
      const k = on * (celebrateT > 0 ? 2.6 : 1.9);
      m.material.color.setRGB(k, k * 0.82, k * 0.45);
    });
    const P = PALETTE[themeId] || PALETTE.fruit, pulse = 1 + 0.6 * Math.sin(tAll * (anySpin ? 9 : 2)) + (celebrateT > 0 ? 1.2 : 0);
    stripMat.color.setRGB(P.strip[0] * pulse, P.strip[1] * pulse, P.strip[2] * pulse);
    marqMesh.material.emissiveIntensity = 0.32 + (celebrateT > 0 ? 0.25 * (0.5 + 0.5 * Math.sin(tAll * 12)) : 0);

    // buttons: press travel, hover glow, the spin button breathes when it is ready
    const spinReady = !($('#spinBtn') || {}).disabled;
    Object.values(buttons).forEach(b => {
      b.press = Math.max(0, b.press - dt * 5);
      b.cap.position.y = -Math.sin(Math.min(1, b.press) * Math.PI) * 0.07;
      if (b.capMat) {
        let em = b.baseEm + (hover === b ? 0.25 : 0);
        if (b.id === 'spin') em += spinReady ? 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(tAll * 3)) : -0.1;
        if (b.id === 'auto' && ($('#autoBtn') || { classList: { contains: () => false } }).classList.contains('on')) em += 0.4 + 0.3 * Math.sin(tAll * 8);
        if (b.id === 'cash' && ($('#cashBtn') || {}).disabled) em = 0.02;
        b.capMat.emissiveIntensity = em;
      } else b.g.position.y = 0.17 + (hover === b ? 0.04 : 0);
    });
    slotFlash = Math.max(0, slotFlash - dt * 2.5); slotGlow.material.opacity = slotFlash;

    // lever: yank down, hold, spring back with a wobble
    if (leverT >= 0) {
      leverT += dt;
      const t = leverT;
      let a;
      if (t < 0.16) a = easeOutCubic(t / 0.16) * 1.05;
      else if (t < 0.24) a = 1.05;
      else { const p = t - 0.24; a = 1.05 * Math.exp(-5 * p) * Math.cos(p * 9); if (p > 1.2) { a = 0; leverT = -1; } }
      pivot.rotation.x = a;
    }

    stepFlyers(dt);
    stepLines(dt);

    // camera: hover tilt, zoom toward the reels while they spin, push in on a tease, punch and sway on big wins
    cam.punch = Math.max(0, cam.punch - dt * 2.2);
    cam.shake = Math.max(0, cam.shake - dt * 3.2);
    cam.focus += ((anySpin || celebrateT > 0 ? 1 : 0) - cam.focus) * Math.min(1, dt * 2.5);
    cam.tease += ((teaseR >= 0 ? 1 : 0) - cam.tease) * Math.min(1, dt * 2);
    cam.lookX += ((teaseR >= 0 ? REEL_X(teaseR) * 0.2 : 0) - cam.lookX) * Math.min(1, dt * 2);
    celebrateT = Math.max(0, celebrateT - dt);
    const yaw = 0.22 + cam.px * 0.22 + Math.sin(tAll * 0.3) * 0.03 - cam.focus * 0.12;
    const pitch = 0.1 - cam.py * 0.08 + cam.focus * 0.02;
    const dist = fitDist * (1 - cam.focus * 0.1 - cam.tease * 0.16) - Math.sin(Math.min(1, cam.punch) * Math.PI) * 0.9;
    tgt.set(cam.lookX, -0.35 + (cam.focus * 0.45), 0.3);
    const sh = cam.shake * cam.shake * 0.16;
    camera.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist + (Math.random() - 0.5) * sh, tgt.y + Math.sin(pitch) * dist + (Math.random() - 0.5) * sh, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(tgt);
    if (celebrateT > 0) { camera.rotation.z += Math.sin(tAll * 5) * 0.015 * Math.min(1, celebrateLvl / 2); machine.position.y = Math.abs(Math.sin(tAll * 10)) * 0.04 * Math.min(1, celebrateLvl / 3); }
    else machine.position.y = 0;

    bloomBoost = Math.max(0, bloomBoost - dt * 0.9);
    bloom.strength = 0.5 + Math.min(1, bloomBoost) * 0.55 + (teaseR >= 0 ? 0.15 : 0);

    stepParts(dt);
    composer.render();
  });

  return { setTheme, setGrid, spin, highlight, celebrate, lines, coinIn, cashOut, pullLever, el: renderer.domElement };
}

window.Reels3D = { create };
window.dispatchEvent(new Event('reels3d-ready'));
