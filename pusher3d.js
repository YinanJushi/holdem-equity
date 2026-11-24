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
import { headerChrome, onQuality } from './chrome3d.js?v=92';

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
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d0508');
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
  scene.add(new THREE.HemisphereLight('#ffe6c8', '#2a0a10', 0.7));
  const key = new THREE.SpotLight('#fff1dc', 1.9, 3, 0.9, 1, 1.2); key.position.set(0.1, 1.0, 0.25); key.target.position.set(0, 0, -0.15); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; scene.add(key, key.target);

  // ---------- the machine's layout (metres; z points toward you) ----------
  const W = 0.36, FRONT = 0.3, BACK = -0.72, WIN = 0.15;
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
  const MAXC = 680;
  function addCoin(x, y, z, gold, opts = {}) {
    if (coins.length >= MAXC) return null;
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
  const removeCoin = i => { world.removeRigidBody(coins[i].body); coins.splice(i, 1); };

  // ---------- the cabinet (looks) ----------
  const goldM = new THREE.MeshStandardMaterial({ color: '#c8963a', metalness: 1, roughness: 0.3, envMapIntensity: 0.8 });
  const chromeM = new THREE.MeshPhysicalMaterial({ color: '#d8dbe6', metalness: 1, roughness: 0.18, clearcoat: 1, envMapIntensity: 0.9 });
  const deckTex = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 768; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 768); gr.addColorStop(0, '#2a0618'); gr.addColorStop(1, '#4a0a28'); g.fillStyle = gr; g.fillRect(0, 0, 512, 768);
    g.strokeStyle = 'rgba(255,200,90,.16)'; g.lineWidth = 2;
    for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(256, -200); g.lineTo(256 + i * 70, 800); g.stroke(); }
    g.fillStyle = 'rgba(255,214,120,.55)'; g.font = 'italic 700 46px Georgia, serif'; g.textAlign = 'center'; g.fillText('Odds Lounge', 256, 560);
    g.fillStyle = 'rgba(255,214,120,.35)';
    for (let k = 0; k < 3; k++) { const y = 640 + k * 34; g.beginPath(); g.moveTo(226, y); g.lineTo(256, y + 22); g.lineTo(286, y); g.lineTo(276, y); g.lineTo(256, y + 12); g.lineTo(236, y); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const deckM = new THREE.MeshPhysicalMaterial({ map: deckTex, roughness: 0.25, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.04, FRONT - BACK), deckM); deck.position.set(0, -0.02, (FRONT + BACK) / 2); deck.receiveShadow = true; scene.add(deck);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(WIN * 2, 0.006, 0.012), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.5) })); lip.position.set(0, 0.001, FRONT - 0.006); scene.add(lip);
  [-1, 1].forEach(sd => { const c = new THREE.Mesh(new THREE.BoxGeometry(W - WIN, 0.006, 0.012), new THREE.MeshBasicMaterial({ color: '#6a0a1a' })); c.position.set(sd * (WIN + (W - WIN) / 2), 0.001, FRONT - 0.006); scene.add(c); });
  const sideM = new THREE.MeshPhysicalMaterial({ color: '#5a0a26', metalness: 0.4, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  [-1, 1].forEach(sd => {
    const s = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.78, FRONT - BACK + 0.12, 3, 0.02), sideM); s.position.set(sd * (W + 0.03), 0.28, (FRONT + BACK) / 2); s.castShadow = true; scene.add(s);
    const neon = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, FRONT - BACK), new THREE.MeshBasicMaterial({ color: sd < 0 ? new THREE.Color(1.6, 0.25, 0.8) : new THREE.Color(0.25, 1, 1.6) }));
    neon.position.set(sd * (W + 0.001), 0.1, (FRONT + BACK) / 2); scene.add(neon);
  });
  const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 0.8), new THREE.MeshStandardMaterial({ color: '#25060f', roughness: 0.55, metalness: 0.3 })); backPanel.position.set(0, 0.38, BACK - 0.001); scene.add(backPanel);
  const slabM = new THREE.MeshPhysicalMaterial({ color: '#3a0a1c', roughness: 0.3, metalness: 0.4, clearcoat: 1 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W * 2, SLAB.y1 - SLAB.y0, SLAB.z1 - BACK), slabM); slab.position.set(0, (SLAB.y0 + SLAB.y1) / 2, (SLAB.z1 + BACK) / 2); slab.castShadow = slab.receiveShadow = true; scene.add(slab);
  const slabTop = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, SLAB.z1 - BACK), deckM); slabTop.rotation.x = -Math.PI / 2; slabTop.position.set(0, SLAB.y1 + 0.0005, (SLAB.z1 + BACK) / 2); slabTop.receiveShadow = true; scene.add(slabTop);
  const ledM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.7, 0.6) });
  const led = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.008, 0.004), ledM); led.position.set(0, SLAB.y0 + 0.03, SLAB.z1 + 0.002); scene.add(led);
  const scraper = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.12, SCRAPER.z1 - BACK), slabM); scraper.position.set(0, SCRAPER.y0 + 0.06, (SCRAPER.z1 + BACK) / 2); scraper.castShadow = true; scene.add(scraper);
  const led2 = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.008, 0.004), ledM); led2.position.set(0, SCRAPER.y0 + 0.02, SCRAPER.z1 + 0.002); scene.add(led2);
  const p1Mesh = new THREE.Mesh(new RoundedBoxGeometry((W - 0.003) * 2, P1.h, P1.d, 3, 0.008), chromeM); p1Mesh.castShadow = p1Mesh.receiveShadow = true; scene.add(p1Mesh);
  const p2Mesh = new THREE.Mesh(new RoundedBoxGeometry((W - 0.003) * 2, P2.h, P2.d, 3, 0.008), chromeM); p2Mesh.castShadow = p2Mesh.receiveShadow = true; scene.add(p2Mesh);
  const fwMeshes = FW.list.map(f => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, FW.len), new THREE.MeshPhysicalMaterial({ color: '#7fe8ff', emissive: '#1aa8ff', emissiveIntensity: 1.2, transparent: true, opacity: 0.75, roughness: 0.1 })); m.rotation.y = f.th; scene.add(m); return m; });
  // the tray in front catches the winnings
  const tray = new THREE.Mesh(new RoundedBoxGeometry(WIN * 2 + 0.04, 0.05, 0.16, 3, 0.02), goldM); tray.position.set(0, -0.17, FRONT + 0.09); tray.receiveShadow = true; scene.add(tray);
  const room = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshStandardMaterial({ color: '#140709', side: THREE.BackSide })); room.position.y = 1; scene.add(room);
  // sign, marquee bulbs and the bonus lamp
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const redraw = (...a) => { g.clearRect(0, 0, w, h); draw(g, w, h, ...a); t.needsUpdate = true; }; redraw(); return { t, redraw }; };
  const sign = canvasTex(1024, 200, (g, w, h) => { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic 700 112px Georgia, serif'; const gr = g.createLinearGradient(0, 40, 0, 160); gr.addColorStop(0, '#fff1c4'); gr.addColorStop(1, '#c99a2e'); g.fillStyle = gr; g.shadowColor = 'rgba(255,190,80,.8)'; g.shadowBlur = 26; g.fillText('Coin Pusher', w / 2, h / 2); });
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.12), new THREE.MeshBasicMaterial({ map: sign.t, transparent: true })); signM.position.set(0, 0.72, BACK + 0.005); scene.add(signM);
  const bulbs = []; for (let i = 0; i < 22; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })); b.position.set(-W + 0.02 + i * ((W * 2 - 0.04) / 21), 0.8, BACK + 0.01); scene.add(b); bulbs.push(b); }
  const lamp = canvasTex(768, 220, (g, w, h, big = tr('LUCKY GATE'), small = tr('drop a coin through the ring'), col = '#ffd36a') => {
    g.fillStyle = '#12040a'; g.fillRect(0, 0, w, h); g.strokeStyle = col; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 22;
    g.font = /[\u4e00-\u9fff]/.test(big) ? '800 78px "PingFang SC", "Microsoft YaHei", sans-serif' : '700 86px "Share Tech Mono", ui-monospace, monospace'; g.fillText(big, w / 2, h * 0.42);
    g.shadowBlur = 0; g.fillStyle = 'rgba(255,230,180,.75)'; g.font = '600 34px "Libre Franklin", sans-serif'; g.fillText(small, w / 2, h * 0.78);
  });
  const lampM = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.115), new THREE.MeshBasicMaterial({ map: lamp.t, toneMapped: false })); lampM.position.set(0, 0.56, BACK + 0.005); scene.add(lampM);
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
  const silverI = new THREE.InstancedMesh(coinGeo, coinMats('#9a9ca8', '#eef0f6', '#6a6c78', '♠', 0.95), MAXC);
  const goldI = new THREE.InstancedMesh(coinGeo, coinMats('#c8902a', '#ffe08a', '#8a5a12', '★', 1, '#8a5a10'), MAXC);
  const starI = new THREE.InstancedMesh(coinGeo, coinMats('#5a24b8', '#ead2ff', '#2e0c66', '✦', 0.85, '#8a3cff'), 40);
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
    meter.innerHTML = `<small>${tr('SUPER JACKPOT')}</small><span class="pz-stars">${[0, 1, 2].map(i => `<i class="${i < JP.stars ? 'on' : ''}">★</i>`).join('')}</span><b>${jpSize()}</b><small>${tr('coins')}</small>`;
    meter.title = tr('Push 3 purple star coins into the tray to win the super jackpot.');
    if (flash) { meter.classList.remove('flash'); void meter.offsetWidth; meter.classList.add('flash'); }
  }
  function starIn(x, z) {
    JP.stars++;
    if (sim) { sim.stars = (sim.stars || 0) + 1; if (JP.stars >= 3) superJackpot(); return; }
    burst(x, 0, z, 60, 1.1, [0.9, 0.5, 1.6]); fanfare(false); pop(`★ ${JP.stars} / 3`, 'star');
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
    showBanner(tr('SUPER JACKPOT!'), `${n} ${tr('coins')}`); bannerHold(4500);
    lamp.redraw(tr('SUPER JACKPOT!'), `${n} ${tr('coins')}`, '#c58bff');
    fanfare(true); setTimeout(() => fanfare(true), 700); shake = 2;
    for (let k = 0; k < 6; k++) setTimeout(() => burst((Math.random() - 0.5) * 0.5, 0.45 + Math.random() * 0.2, -0.3 + Math.random() * 0.3, 70, 1.4, k % 2 ? [1.2, 0.85, 0.3] : [0.9, 0.5, 1.6]), k * 500);
    window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'pusher-bonus', k: 'super', n } }));
    paintMeter(true);
    setTimeout(() => { if (!rolling) lamp.redraw(); }, 9000);
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
    if (!free || sim) { JP.since++; if (!sim && JP.since % JP_EVERY === 0) { saveJP(); paintMeter(); } towerDrops++; if (towerDrops % TOWER_EVERY === 0) growTower(); }
    const c = addCoin(aimX + (Math.random() - 0.5) * 0.006, DROP.y, DROP.z + (Math.random() - 0.5) * 0.01, gold, { gate: true, vy: -0.4, star });
    if (c && star && !sim) { burst(c.body.translation().x, DROP.y, DROP.z, 25, 0.5, [0.9, 0.5, 1.6]); pop(tr('STAR COIN!'), 'star'); }
    if (c && !sim) { beep(1800); info(); document.body.classList.add('pz-played'); window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'pusher-drop' } })); }
  }

  // ---------- the bonus lamp ----------
  const BONUS = [
    { k: 'shower', p: 0.16, big: 'COIN SHOWER', small: '6 free coins' },
    { k: 'gold', p: 0.12, big: 'GOLD RUSH', small: '2 gold coins' },
    { k: 'topple', p: 0.08, big: 'TOWER FALL', small: 'the coin tower comes down' },
    { k: 'walls', p: 0.15, big: 'FUNNEL WALLS', small: 'walls guide the corners in for 15 seconds' },
    { k: 'jackpot', p: 0.025, big: 'JACKPOT!', small: '20 coins + 3 gold' },
    { k: 'none', p: 1, big: 'SO CLOSE', small: 'try the gate again' },
  ];
  let rolling = 0, rollOut = null, gateReady = 0;
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
  function buildTower(x0, z0, h) {
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
    for (let i = coins.length - 1; i >= 0; i--) { const c = coins[i]; if (!c.star && near(c.body.translation(), x, z)) { if (taken < 6) { taken++; if (c.gold) gold++; } else spill++; removeCoin(i); } }
    // coins beyond the first few drop back onto the pile around the tower (none are lost)
    for (let i = 0; i < spill; i++) { const a = Math.random() * Math.PI * 2, r = R * (2.6 + Math.random() * 1.5); addCoin(Math.max(-W + R, Math.min(W - R, x + Math.cos(a) * r)), 0.08 + i * 0.012, Math.min(FRONT - 0.02, z + Math.sin(a) * r), false, { tumble: 1 }); }
    const n = Math.min(TOWER_MAX, h + taken);
    const golds = new Set([n - 1]); for (let i = 0; i < gold; i++) golds.add(i);
    towers.push({ x, z, n, shown: 0, t: 0, body: null, golds, yaws: Array.from({ length: n }, () => Math.random() * 6), born: tp });
  }
  // the column goes into the physics once it is fully built
  const TOWER_EVERY = 18, TOWER_START = 10, TOWER_MAX = 40;
  let towerDrops = 0, rebuildAt = 0;
  const mainTower = () => towers.find(T => T.body && !T.free) || null;
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
    if (!sim) { showBanner(tr('TOWER FALL'), `${T.n} ${tr('coins')}`); fanfare(true); shake = Math.max(shake, 0.8); }
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
    if (!towers.some(t => !t.free)) { rebuildAt = tp + 6; JP.tower = null; saveJP(); }
    parts.forEach(([pp, qq], i) => {
      // velocity of this point of the spinning column, plus a little scatter
      const rx = pp.x - p0.x, ry = pp.y - p0.y, rz = pp.z - p0.z;
      const c = addCoin(pp.x, pp.y, pp.z, T.golds.has(i), { q: qq, vx: v.x + (w.y * rz - w.z * ry) + (Math.random() - 0.5) * 0.08, vy: v.y + (w.z * rx - w.x * rz) + 0.02, vz: v.z + (w.x * ry - w.y * rx) + (Math.random() - 0.5) * 0.08 });
      if (c) c.body.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 }, true);
    });
    if (!sim) { burst(p0.x, p0.y, p0.z, 40, 0.8, [1.2, 0.9, 0.4]); clink(2, true); clink(1.5); shake = Math.max(shake, 0.5); pop(tr('TOWER DOWN!'), 'gold'); }
  }
  function pickBonus() { let r = Math.random(); for (const b of BONUS) { if (r < b.p) return b; r -= b.p; } return BONUS[BONUS.length - 1]; }
  function applyBonus(b) {
    const rain = (n, gold) => { const base = rainQ.length ? rainQ[rainQ.length - 1].at : 0; for (let i = 0; i < n; i++) rainQ.push({ at: base + (i + 1) * 0.09, gold }); };
    if (b.k === 'shower') rain(6, false);
    else if (b.k === 'gold') rain(2, true);
    else if (b.k === 'walls') wallUp = 15;
    else if (b.k === 'jackpot') { rain(20, false); rain(3, true); wallUp = 15; }
    else if (b.k === 'topple') { if (!toppleTower()) rain(6, false); }
    if (sim) return;
    window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'pusher-bonus', k: b.k } }));
    lamp.redraw(tr(b.big), tr(b.small), b.k === 'none' ? '#9a8a7a' : b.k === 'jackpot' ? '#ff5ab0' : '#ffd36a');
    if (b.k !== 'none') { showBanner(tr(b.big), tr(b.small)); fanfare(b.k === 'jackpot' || b.k === 'shower'); shake = b.k === 'jackpot' ? 1.4 : 0.8; burst(0, 0.56, BACK + 0.05, b.k === 'jackpot' ? 120 : 50, 1.2); }
    setTimeout(() => { if (!rolling) lamp.redraw(); }, 3500);
  }
  function gateHit(x) {
    if (tp < gateReady) return;
    if (sim) { const o = pickBonus(); sim.hits = (sim.hits || 0) + 1; sim[o.k] = (sim[o.k] || 0) + 1; applyBonus(o); gateReady = tp + GATE_CD; return; }
    if (rolling > 0 || rollOut) return;
    gateReady = tp + 1.6 + GATE_CD;
    rollOut = pickBonus();
    rolling = 1.6; burst(x, GATE_Y, DROP.z, 30, 0.7); fanfare(false); pop(tr('LUCKY GATE!'), 'gate');
  }

  // ---------- one physics step (also used by the fast test run) ----------
  let tp = 0, rainT = 0;
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
    if (rebuildAt && tp > rebuildAt) { rebuildAt = 0; if (!towers.some(t => !t.free)) buildTower(0, 0.17, TOWER_START); }
    for (const T of towers) {
      if (T.body) continue;
      T.t += dt;
      const want = Math.min(T.n, Math.floor(T.t / 0.05));
      while (T.shown < want) { T.shown++; if (!sim) { const y = T.shown * TH; burst(T.x, y, T.z, T.shown === T.n ? 25 : 3, 0.25, T.golds.has(T.shown - 1) ? [1.2, 0.85, 0.3] : [1, 1, 1]); beep(900 + (T.shown / T.n) * 1500); } }
      if (T.shown >= T.n) raiseTower(T);
    }
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
      if (p.y < -0.14 || Math.abs(p.x) > W + 0.2 || p.z > FRONT + 0.5) removeCoin(i);
    }
  }

  // ---------- the pile: kept between visits, or built fresh ----------
  const BOARD = 'ol-pz-board'; let jammed = false;
  function savePile() {
    if (jammed) return;
    try {
      const list = coins.filter(c => !c.paid).map(c => { const p = c.body.translation(), q = c.body.rotation(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, c.star ? 2 : c.gold ? 1 : 0].map(v => Math.round(v * 1e4) / 1e4); });
      const P = new THREE.Vector3(), Q = new THREE.Quaternion();
      towers.forEach(T => { if (T.free || !T.body) for (let i = 0; i < (T.body ? T.n : T.shown); i++) { towerCoinPose(T, i, P, Q); list.push([P.x, P.y, P.z, Q.x, Q.y, Q.z, Q.w, T.golds.has(i) ? 1 : 0].map(v => Math.round(v * 1e4) / 1e4)); } });
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
  sim = null;
  setInterval(savePile, 8000); window.addEventListener('pagehide', savePile);
  document.documentElement.classList.remove('t3d-wait');

  // ---------- aim and drop ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SLAB.y1), hit = new THREE.Vector3();
  const cv = renderer.domElement;
  const aim = e => { const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); if (ray.ray.intersectPlane(aimPlane, hit)) aimX = Math.max(-W + 0.04, Math.min(W - 0.04, hit.x)); };
  cv.addEventListener('pointermove', aim);
  cv.addEventListener('pointerdown', e => { aim(e); audio(); drop(); });
  $('#pzDrop').onclick = () => { audio(); drop(); };
  let auto = false, autoT = 0;
  const paintAuto = () => { $('#pzAuto').setAttribute('aria-pressed', String(auto)); $('#pzAuto').classList.toggle('on', auto); $('#pzAuto').textContent = auto ? 'Auto on' : 'Auto'; };
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
      if (c.star && nst < 40) starI.setMatrixAt(nst++, m4); else if (c.gold) goldI.setMatrixAt(ng++, m4); else silverI.setMatrixAt(ns++, m4);
    }
    for (const T of towers) {
      const shown = T.body ? T.n : T.shown;
      for (let i = 0; i < shown; i++) {
        towerCoinPose(T, i, v3, qt); m4.compose(v3, qt, one);
        if (T.golds.has(i)) { if (ng < MAXC) goldI.setMatrixAt(ng++, m4); } else if (ns < MAXC) silverI.setMatrixAt(ns++, m4);
      }
    }
    silverI.count = ns; goldI.count = ng; starI.count = nst;
    silverI.instanceMatrix.needsUpdate = true; goldI.instanceMatrix.needsUpdate = true; starI.instanceMatrix.needsUpdate = true;
  }
  function drawTowerMarks(t) {
    const T = towers.find(x => !x.free) || null;
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
  const clock = new THREE.Clock(); let acc = 0, t = 0, rollTick = 0;
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
    drawCoins(); drawTowerMarks(t);
    // the gate, the chute and the aim marker
    ring.position.x = gateX(tp);
    if (tp >= gateReady) ringM.color.setRGB(2.2 + Math.sin(t * 12) * 0.6, 1.6, 0.4); else { const k = 1 - (gateReady - tp) / (GATE_CD + 1.6); ringM.color.setRGB(0.25 + k * 0.5, 0.18 + k * 0.35, 0.1); }
    chute.position.x += (aimX - chute.position.x) * Math.min(1, dt * 14);
    aimDot.position.set(chute.position.x, SLAB.y1 + 0.002, DROP.z); aimDot.material.opacity = 0.35 + Math.sin(t * 5) * 0.2;
    // the bonus lamp rolling
    if (rolling > 0) {
      rolling -= dt; rollTick -= dt;
      if (rollTick <= 0) { rollTick = 0.07 + (1.6 - rolling) * 0.05; const b = BONUS[Math.floor(Math.random() * BONUS.length)]; lamp.redraw(tr(b.big), '', '#ffffff'); beep(1200 + Math.random() * 600); }
      if (rolling <= 0) { rolling = 0; const b = rollOut; rollOut = null; applyBonus(b); }
    }
    // lights: chase normally, flash during a bonus
    if (superT > 0) superT -= dt;
    const party = rolling > 0 || rainQ.length > 0 || shake > 0.3 || superT > 0;
    bulbs.forEach((b, i) => { const on = party ? (Math.floor(t * 14) + i) % 2 === 0 : (i + Math.floor(t * 6)) % 3 === 0; const hue = party ? ((i * 0.09 + t) % 1) : 0.12; if (on) b.material.color.setHSL(hue, 1, 0.75).multiplyScalar(2.6); else b.material.color.setRGB(0.5, 0.35, 0.12); });
    ledM.color.setRGB(2.4 + Math.sin(t * 3) * 0.4, 1.7, 0.6);
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
    bonus(k) { if (rolling > 0) return; rollOut = BONUS.find(b => b.k === k) || BONUS[0]; rolling = 1.6; },
    where: () => { const r = { upper: 0, p2top: 0, p1top: 0, deck: 0, deckLayers: [0, 0, 0, 0, 0] }; coins.forEach(c => { const p = c.body.translation(); if (p.y > 0.19) r.p2top++; else if (p.y > 0.145) r.upper++; else if (p.z < fz1(tp) - 0.005 && p.y > 0.055) r.p1top++; else { r.deck++; r.deckLayers[Math.min(4, Math.floor(p.y / TH))]++; } }); return r; },
  };
}
