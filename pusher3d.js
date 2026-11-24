// A 3D coin pusher (three.js). Coins slide on the deck when the pusher or other coins push them; coins that land
// on the pile sit on top and drop down when what holds them up is pushed away. Light enough for phones.
// Each coin costs 5 chips. Coins pushed over the middle of the front edge pay out; the two corners go to the house.
// Every 20th coin is gold and worth five. Over time the machine pays back about 90%.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { headerChrome, onQuality } from './chrome3d.js?v=75';

const COIN = 5, GOLD = 5, $ = s => document.querySelector(s);
const host = $('#pzHost');
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); if (!renderer.getContext()) renderer = null; } catch (e) { renderer = null; }
document.documentElement.classList.remove('t3d-wait');
if (renderer && host) start();

function start() {
  document.body.classList.add('pz-on');
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'pz-canvas'; host.appendChild(renderer.domElement);
  headerChrome(host, 'pz-on');
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#12070a');
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
  scene.add(new THREE.HemisphereLight('#ffe6c8', '#2a0a10', 0.7));
  const key = new THREE.SpotLight('#fff1dc', 3.5, 3, 0.75, 0.7, 1.2); key.position.set(0, 0.9, 0.15); key.target.position.set(0, 0, -0.1); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key, key.target);

  // ---------- the deck (metres) ----------
  const W = 0.36, FRONT = 0.3, BACK = -0.55, WIN = 0.27, R = 0.03, TH = 0.008;   // half width, front edge, back wall, payout half width, coin radius, thickness
  const PD = 0.28;
  const pushZ = t => -0.25 + Math.sin(t * 1.3) * 0.11;   // pusher centre; its front face travels between about -0.22 and 0.0

  // ---------- the cabinet ----------
  const gold = new THREE.MeshStandardMaterial({ color: '#b8862e', metalness: 0.9, roughness: 0.4, envMapIntensity: 0.6 });
  const deckM = new THREE.MeshStandardMaterial({ color: '#2a0a14', roughness: 0.5, metalness: 0.2 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.04, FRONT - BACK), deckM); deck.position.set(0, -0.02, (FRONT + BACK) / 2); deck.receiveShadow = true; scene.add(deck);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(WIN * 2, 0.012, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.4) })); lip.position.set(0, 0.0, FRONT - 0.01); scene.add(lip);
  [-1, 1].forEach(sd => { const c = new THREE.Mesh(new THREE.BoxGeometry(W - WIN, 0.012, 0.02), new THREE.MeshBasicMaterial({ color: '#5a0a14' })); c.position.set(sd * (WIN + (W - WIN) / 2), 0.0, FRONT - 0.01); scene.add(c); });
  const sideM = new THREE.MeshPhysicalMaterial({ color: '#7a1030', metalness: 0.4, roughness: 0.3, clearcoat: 1 });
  [-1, 1].forEach(sd => { const s = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.62, FRONT - BACK + 0.1, 3, 0.02), sideM); s.position.set(sd * (W + 0.03), 0.2, (FRONT + BACK) / 2); s.castShadow = true; scene.add(s); });
  const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 0.6), new THREE.MeshStandardMaterial({ color: '#3a0a18', roughness: 0.6 })); backPanel.position.set(0, 0.28, BACK - 0.04); scene.add(backPanel);
  const signTex = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic 700 120px Georgia, serif'; const gr = g.createLinearGradient(0, 60, 0, 200); gr.addColorStop(0, '#fff1c4'); gr.addColorStop(1, '#c99a2e'); g.fillStyle = gr; g.shadowColor = 'rgba(255,190,80,.7)'; g.shadowBlur = 24; g.fillText('Coin Pusher', 512, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), new THREE.MeshBasicMaterial({ map: signTex, transparent: true })); sign.position.set(0, 0.48, BACK - 0.03); scene.add(sign);
  const bulbs = []; for (let i = 0; i < 18; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })); b.position.set(-W + 0.02 + i * ((W * 2 - 0.04) / 17), 0.57, BACK - 0.03); scene.add(b); bulbs.push(b); }
  const pusherMesh = new THREE.Mesh(new RoundedBoxGeometry((W - 0.005) * 2, 0.06, PD, 3, 0.01), new THREE.MeshPhysicalMaterial({ color: '#9a9aa6', metalness: 0.9, roughness: 0.4, envMapIntensity: 0.5 }));
  pusherMesh.castShadow = true; pusherMesh.receiveShadow = true; scene.add(pusherMesh);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 0.3), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, roughness: 0.05, clearcoat: 1, depthWrite: false }));
  glass.position.set(0, 0.32, FRONT - 0.02); glass.rotation.x = -0.35; scene.add(glass);
  const tray = new THREE.Mesh(new RoundedBoxGeometry(W * 2 + 0.06, 0.06, 0.16, 3, 0.02), gold); tray.position.set(0, -0.16, FRONT + 0.1); scene.add(tray);
  const room = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshStandardMaterial({ color: '#1a0a0c', side: THREE.BackSide })); room.position.y = 1; scene.add(room);
  const chute = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 24, 1, true), gold); chute.position.set(0, 0.36, 0.04); scene.add(chute);
  let aimX = 0;

  // ---------- coins: one instanced batch for silver, one for gold ----------
  const MAXC = 400;
  const coinGeo = new THREE.CylinderGeometry(R, R, TH, 28);
  const silverM = new THREE.MeshStandardMaterial({ color: '#c8c8d0', metalness: 0.9, roughness: 0.35, envMapIntensity: 0.7 });
  const goldM = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 1, roughness: 0.22, emissive: '#7a4a10', emissiveIntensity: 0.3 });
  const silverI = new THREE.InstancedMesh(coinGeo, silverM, MAXC), goldI = new THREE.InstancedMesh(coinGeo, goldM, MAXC);
  [silverI, goldI].forEach(m => { m.castShadow = true; m.receiveShadow = true; m.count = 0; m.frustumCulled = false; scene.add(m); });
  const coins = [];   // { x, y, z, vy, vz, st: 'drop' | 'deck' | 'fall', gold, yaw, tilt, dx, dz }
  const newCoin = (x, y, z, gold, st) => ({ x, y, z, vy: st === 'drop' ? -0.3 : 0, vz: 0, st, gold, yaw: Math.random() * 6, tilt: 0, dx: 0, dz: 0 });
  // the height of the pile under a coin: the top of the highest coin it would rest on
  function restHeight(c) {
    let h = 0;
    for (const o of coins) if (o !== c && o.st === 'deck' && o.y < c.y + 0.001 && (o.x - c.x) ** 2 + (o.z - c.z) ** 2 < (R * 1.6) ** 2) h = Math.max(h, o.y + TH);
    return h;
  }
  // the machine starts with a pile on the deck
  for (let i = 0; i < 70; i++) { const c = newCoin((Math.random() - 0.5) * (W * 2 - 0.08), 0.3, Math.random() * 0.27, Math.random() < 0.04, 'deck'); c.y = restHeight(c); coins.push(c); }

  // ---------- money: each drop costs a coin; wins are paid in batches so the wallet isn't hit for every coin ----------
  let pending = 0, dropped = 0, won = 0, drops = 0;
  const flush = () => { if (pending) { UI.wallet.add(pending); pending = 0; } };
  setInterval(flush, 1500); window.addEventListener('pagehide', flush);
  const info = () => { $('#pzInfo').innerHTML = `Dropped <b>${dropped}</b> · Won <b>${won}</b> chips`; };
  function drop() {
    if (UI.wallet.chips + pending < COIN) { $('#pzInfo').textContent = 'Not enough chips. Claim your daily chips at the top.'; auto = false; paintAuto(); return; }
    if (coins.length >= MAXC) return;
    pending -= COIN; dropped += COIN; drops++;
    coins.push(newCoin(aimX + (Math.random() - 0.5) * 0.01, 0.34, 0.04 + (Math.random() - 0.5) * 0.02, drops % 20 === 0, 'drop'));
    UI.sfx('chip'); info();
  }

  // ---------- the simulation ----------
  function step(dt, fz) {
    for (const c of coins) { c.dx = 0; c.dz = 0; }
    // falling coins drop and land on the pile
    for (const c of coins) if (c.st === 'drop') {
      c.vy -= 9.8 * dt; c.y += c.vy * dt; c.tilt += dt * 6;
      const h = restHeight(c);
      if (c.y <= h) { c.y = h; c.st = 'deck'; c.tilt = 0; }
    }
    const deck = coins.filter(c => c.st === 'deck');
    // the pusher shoves coins lying on the deck in front of it
    for (const c of deck) if (c.y < TH * 0.6 && c.z - R < fz) { const d = fz + R - c.z; c.z += d; c.dz += d; }
    // coins on the same layer can't overlap: they push each other apart
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) {
        const a = deck[i], b = deck[j];
        if (Math.abs(a.y - b.y) > TH * 0.6) continue;
        let nx = b.x - a.x, nz = b.z - a.z; const d2 = nx * nx + nz * nz;
        if (d2 >= 4 * R * R || d2 < 1e-10) continue;
        const d = Math.sqrt(d2), push = (2 * R - d) / 2; nx /= d; nz /= d;
        // a coin pressed against the pusher can't move back into it, so the other one takes the whole push
        const aStuck = a.y < TH * 0.6 && a.z - R < fz + 0.002 && nz > 0, bStuck = b.y < TH * 0.6 && b.z - R < fz + 0.002 && nz < 0;
        const ka = aStuck ? 0 : bStuck ? 2 : 1, kb = bStuck ? 0 : aStuck ? 2 : 1;
        a.x -= nx * push * ka; a.z -= nz * push * ka; a.dx -= nx * push * ka; a.dz -= nz * push * ka;
        b.x += nx * push * kb; b.z += nz * push * kb; b.dx += nx * push * kb; b.dz += nz * push * kb;
      }
    }
    // coins resting on a moved coin ride along; coins whose support slid away drop down
    deck.sort((p, q) => p.y - q.y);
    for (const c of deck) if (c.y > TH * 0.6) {
      let sup = null, best = 1e9;
      for (const o of deck) { if (o === c || Math.abs(o.y + TH - c.y) > TH * 0.6) continue; const d = (o.x - c.x) ** 2 + (o.z - c.z) ** 2; if (d < (R * 1.6) ** 2 && d < best) { best = d; sup = o; } }
      if (sup) { c.x += sup.dx * 0.9; c.z += sup.dz * 0.9; c.dx += sup.dx * 0.9; c.dz += sup.dz * 0.9; }
      else { c.st = 'drop'; c.vy = 0; }
    }
    // walls, the front edge, and coins going over it
    for (const c of coins) {
      c.x = Math.max(-W + R, Math.min(W - R, c.x));
      if (c.st === 'deck' && c.z > FRONT) { c.st = 'fall'; c.vy = 0; c.vz = 0.15; }
      if (c.st === 'fall') {
        c.vy -= 9.8 * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.tilt += dt * 9;
        if (!c.paid && c.y < -0.05) {
          c.paid = true;
          if (Math.abs(c.x) < WIN) { const v = COIN * (c.gold ? GOLD : 1); pending += v; won += v; UI.sfx(c.gold ? 'win' : 'chip'); info(); }
        }
      }
    }
    for (let i = coins.length - 1; i >= 0; i--) if (coins[i].st === 'fall' && coins[i].y < -0.3) coins.splice(i, 1);
  }
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  function draw() {
    let ns = 0, ng = 0;
    for (const c of coins) {
      qt.setFromEuler(e3.set(c.tilt, c.yaw, c.tilt * 0.4)); m4.compose(v3.set(c.x, c.y + TH / 2, c.z), qt, one);
      if (c.gold) goldI.setMatrixAt(ng++, m4); else silverI.setMatrixAt(ns++, m4);
    }
    silverI.count = ns; goldI.count = ng; silverI.instanceMatrix.needsUpdate = true; goldI.instanceMatrix.needsUpdate = true;
  }

  // ---------- aim and drop ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const cv = renderer.domElement;
  const aim = e => { const r = cv.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); if (ray.ray.intersectPlane(aimPlane, hit)) aimX = Math.max(-W + 0.05, Math.min(W - 0.05, hit.x)); };
  cv.addEventListener('pointermove', aim);
  cv.addEventListener('pointerdown', e => { aim(e); drop(); });
  $('#pzDrop').onclick = drop;
  let auto = false, autoT = 0;
  const paintAuto = () => { $('#pzAuto').setAttribute('aria-pressed', String(auto)); $('#pzAuto').classList.toggle('on', auto); $('#pzAuto').textContent = auto ? 'Auto on' : 'Auto'; };
  $('#pzAuto').onclick = () => { auto = !auto; paintAuto(); };
  document.addEventListener('keydown', e => { if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); drop(); } });

  // ---------- render loop ----------
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.4, 1.7); composer.addPass(bloom); composer.addPass(new OutputPass());
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h;
    camera.fov = w / h < 1 ? 56 : 40; camera.updateProjectionMatrix();
    const back = w / h < 1 ? 1.15 : 0.75;
    camera.position.set(0, 0.62 * back / 0.75, 0.42 + back * 0.55); camera.lookAt(0, 0, -0.06);
  }
  new ResizeObserver(resize).observe(host); resize();
  onQuality(q => { const hi = q === 'high'; renderer.setPixelRatio(hi ? Math.min(2, devicePixelRatio || 1) : 1); bloom.enabled = hi; renderer.shadowMap.enabled = hi; key.castShadow = hi; resize(); });
  const clock = new THREE.Clock(); let t = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta()); t += dt;
    const fz = pushZ(t) + PD / 2;          // the pusher's front face
    pusherMesh.position.set(0, 0.03, fz - PD / 2);
    step(dt, fz);
    draw();
    if (auto) { autoT += dt; if (autoT > 0.7) { autoT = 0; drop(); } }
    chute.position.x += (aimX - chute.position.x) * Math.min(1, dt * 12);
    bulbs.forEach((b, i) => { const on = (i + Math.floor(t * 6)) % 3 === 0; b.material.color.setRGB(on ? 2.4 : 0.6, on ? 1.9 : 0.4, on ? 0.8 : 0.15); });
    composer.render();
  });
  info();
  // for testing: run the machine fast without drawing (used to check the payback rate)
  window.OL_PUSHER = { sim(seconds, every = 0.7) { let cost = 0, w0 = won, tt = 0, dt = 1 / 60, at = 0; const ow = UI.wallet.chips; while (tt < seconds) { tt += dt; at += dt; if (at > every) { at = 0; cost += COIN; drops++; coins.push(newCoin((Math.random() - 0.5) * 0.5, 0.34, 0.04, drops % 20 === 0, 'drop')); } step(dt, pushZ(t + tt) + PD / 2); } pending = 0; void ow; return { cost, won: won - w0, onDeck: coins.length }; } };
}
