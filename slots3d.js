// 3D reels for the slot machine (Three.js). Each reel is a 12-sided drum that really turns.
// slots.js keeps all the game logic; this file only draws. When WebGL is missing, slots.js keeps its flat reels.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const REELS = 5, N = 12, ALPHA = (Math.PI * 2) / N;        // faces per drum, angle per face
const FACE = 1, GAP = 0.09, AP = FACE / (2 * Math.tan(ALPHA / 2)); // face height, gap between reels, drum apothem
const REEL_X = r => (r - 2) * (FACE + GAP);
const TEX = 256;
const THEME_BG = { fruit: ['#fffdf6', '#efe6cf'], safari: ['#fff4d6', '#e8d29e'], ocean: ['#e9fbff', '#bfe6f2'] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
const easeOutQuint = p => 1 - Math.pow(1 - p, 5);

function create(host) {
  // ---------- renderer, scene, camera ----------
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.className = 'reels3d';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#14030a');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;

  const camera = new THREE.PerspectiveCamera(30, 5 / 3, 0.1, 100);
  const CAM_Z = AP + 6.1;
  const cam = { x: 0, y: 0, z: CAM_Z, punch: 0, shake: 0, lookX: 0, dolly: 0, tilt: 0 };

  scene.add(new THREE.HemisphereLight('#fff6e0', '#3a0a14', 0.55));
  const key = new THREE.DirectionalLight('#ffffff', 1.1); key.position.set(-3, 7, 5); scene.add(key);
  const sweep = new THREE.PointLight('#ffd27a', 0, 7, 1.6); sweep.position.set(-4, 0, AP + 1.4); scene.add(sweep);
  const teaseLight = new THREE.PointLight('#ffb020', 0, 4, 1.4); teaseLight.position.set(0, 0, AP + 1); scene.add(teaseLight);

  // ---------- symbol textures (sharp + motion-blurred) ----------
  let sharp = [], blurred = [], themeId = 'fruit';
  function svgImage(svg) {
    const s = svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${TEX}" height="${TEX}" `);
    return new Promise(res => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); });
  }
  function faceCanvas(img, blur) {
    const c = document.createElement('canvas'); c.width = c.height = TEX;
    const g = c.getContext('2d'), [a, b] = THEME_BG[themeId] || THEME_BG.fruit;
    const grd = g.createLinearGradient(0, 0, 0, TEX); grd.addColorStop(0, b); grd.addColorStop(0.12, a); grd.addColorStop(0.88, a); grd.addColorStop(1, b);
    g.fillStyle = grd; g.fillRect(0, 0, TEX, TEX);
    if (img) {
      const s = TEX * 0.76, o = (TEX - s) / 2;
      if (blur) { // vertical streak: the same symbol stamped many times, fading
        for (let i = -9; i <= 9; i++) { g.globalAlpha = 0.11 * (1 - Math.abs(i) / 10); g.drawImage(img, o, o + i * 9, s, s); }
        g.globalAlpha = 1;
      } else {
        g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowOffsetY = 5; g.shadowBlur = 6;
        g.drawImage(img, o, o, s, s);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  async function setTheme(id, svgs) {
    themeId = id;
    const imgs = await Promise.all(svgs.map(svgImage));
    const old = [...sharp, ...blurred];
    sharp = imgs.map(i => faceCanvas(i, false));
    blurred = imgs.map(i => faceCanvas(i, true));
    reels.forEach(R => R.faces.forEach(f => setFace(f, f.sym, false)));
    old.forEach(t => t.dispose());
  }

  // ---------- drums ----------
  const faceGeo = new THREE.PlaneGeometry(FACE, FACE * 1.0005);
  // glowing gold frame that appears behind a winning symbol (bright enough for the bloom to catch)
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.strokeStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 14; g.lineWidth = 9; g.strokeRect(14, 14, 100, 100); return new THREE.CanvasTexture(c); })();
  const haloGeo = new THREE.PlaneGeometry(FACE * 1.22, FACE * 1.22);
  const rimGeo = new THREE.CylinderGeometry(AP * 1.07, AP * 1.07, 0.035, 48);
  const hubGeo = new THREE.CylinderGeometry(AP * 0.98, AP * 0.98, FACE * 0.995, N, 1, true);
  const gold = new THREE.MeshStandardMaterial({ color: '#d8a640', metalness: 1, roughness: 0.28 });
  const hubMat = new THREE.MeshStandardMaterial({ color: '#2a0810', roughness: 0.9, side: THREE.BackSide });
  const reels = [];
  for (let r = 0; r < REELS; r++) {
    const group = new THREE.Group(); group.position.x = REEL_X(r); scene.add(group);
    const drum = new THREE.Group(); group.add(drum);
    const faces = [];
    for (let i = 0; i < N; i++) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.0, emissive: '#ffb020', emissiveIntensity: 0 });
      const m = new THREE.Mesh(faceGeo, mat);
      const holder = new THREE.Group();
      holder.rotation.x = -i * ALPHA;          // face i sits at angle i·α around the drum
      m.position.z = AP;
      const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ map: haloTex, color: new THREE.Color(2.2, 1.5, 0.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.z = -0.02; m.add(halo);
      holder.add(m); drum.add(holder);
      faces.push({ mesh: m, mat, halo, sym: 0, i, lift: 0, glow: 0, dim: 0, hit: false });
    }
    const hub = new THREE.Mesh(hubGeo, hubMat); hub.rotation.z = Math.PI / 2; drum.add(hub);
    [-1, 1].forEach(s => { const rim = new THREE.Mesh(rimGeo, gold); rim.rotation.z = Math.PI / 2; rim.position.x = s * (FACE / 2 + 0.02); group.add(rim); });
    reels.push({ r, group, drum, faces, theta: 0, anim: null, speed: 0, blur: false, tease: 0, bounce: 0 });
  }
  function setFace(f, sym, blur) {
    f.sym = sym;
    const t = (blur ? blurred : sharp)[sym];
    if (t) { const first = !f.mat.map; f.mat.map = t; if (first) f.mat.needsUpdate = true; }
  }
  // which face shows a given row (0 top, 1 middle, 2 bottom) when the drum is at rest
  const frontIndex = theta => ((Math.round(theta / ALPHA) % N) + N) % N;
  const faceAt = (R, row) => R.faces[(frontIndex(R.theta) + (1 - row) + N) % N];

  function setGrid(grid) {
    reels.forEach((R, r) => { R.theta = Math.round(R.theta / ALPHA) * ALPHA; for (let row = 0; row < 3; row++) setFace(faceAt(R, row), grid[r][row], false); });
  }

  // ---------- sparks (additive points, picked up by the bloom) ----------
  const MAXP = 900;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,230,160,.85)'); rg.addColorStop(1, 'rgba(255,160,40,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const pMat = new THREE.PointsMaterial({ size: 0.16, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; scene.add(points);
  const parts = [];
  const PCOL = [[1, 0.85, 0.35], [1, 0.55, 0.2], [1, 1, 0.85], [1, 0.35, 0.45]];
  function emit(x, y, z, n, { speed = 3, up = 0, spread = 1, life = 0.7, col } = {}) {
    for (let k = 0; k < n && parts.length < MAXP; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      parts.push({ x, y, z, vx: Math.cos(a) * s * spread, vy: Math.sin(a) * s + up, vz: Math.random() * s * 0.8, life, max: life, c: col || PCOL[(Math.random() * PCOL.length) | 0] });
    }
  }
  function stepParts(dt) {
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k]; p.life -= dt;
      if (p.life <= 0) { parts.splice(k, 1); continue; }
      p.vy -= 5 * dt; p.vx *= 0.97; p.vz *= 0.97;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (let k = 0; k < MAXP; k++) {
      const p = parts[k];
      if (p) { const f = p.life / p.max; pPos.set([p.x, p.y, AP + 0.25 + p.z], k * 3); pCol.set([p.c[0] * f, p.c[1] * f, p.c[2] * f], k * 3); }
      else pPos.set([0, 0, -50], k * 3);
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }

  // ---------- bloom ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.25, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let bloomBoost = 0;

  // ---------- size ----------
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h;
    // fit the five reels across, whatever the shape of the window
    const halfW = (REELS * FACE + (REELS - 1) * GAP) / 2 + 0.06, halfH = 1.6;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    cam.z = AP + Math.max(halfH / t, halfW / (t * camera.aspect));
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  // ---------- spinning ----------
  // plan: wind back a little, rip forward (motion blur), ease into the stop, overshoot, spring back
  function spin(grid, { tease = 0, onStop, onTease } = {}) {
    return new Promise(done => {
      let left = REELS;
      cam.punch = 1;            // camera kicks in on the pull
      sweep.intensity = 0;
      reels.forEach((R, r) => {
        const slow = tease && r >= tease;
        const c0 = frontIndex(R.theta);
        const turns = 3 + r + (slow ? 3 + (r - tease) * 2 : 0);
        const step = turns * N + 6;                     // whole turns + half a turn, so the new symbols load out of sight
        const c1 = (c0 + step) % N;
        // load the result onto the faces that will stop in front, and fresh random symbols everywhere else out of sight
        for (let i = 0; i < N; i++) {
          const d = (i - c0 + N) % N;
          if (d <= 1 || d === N - 1) continue;            // keep what is on screen now
          setFace(R.faces[i], Math.floor(Math.random() * 8), false);
        }
        for (let row = 0; row < 3; row++) setFace(R.faces[(c1 + (1 - row) + N) % N], grid[r][row], false);
        const start = Math.round(R.theta / ALPHA) * ALPHA;
        const target = start + step * ALPHA;
        const delay = r * 0.07;
        const dur = 0.9 + r * 0.28 + (slow ? 1.8 + (r - tease) * 1.1 : 0);
        R.anim = { t: -delay, start, target, dur, slow, wind: 0.16, over: slow ? 0.1 : 0.2 + r * 0.01, phase: 0, onStop: () => {
          left--; onStop && onStop(r);
          if (left === 0) { sweep.intensity = 0; done(); }
        } };
        if (slow) R.anim.onTeaseStart = () => onTease && onTease(r);
      });
    });
  }

  function stepReel(R, dt) {
    const A = R.anim; if (!A) return;
    const prev = R.theta;
    A.t += dt;
    const WIND = 0.17, SETTLE = 0.42;
    if (A.t < 0) return;
    if (A.t < WIND) {                                    // wind-up: drum pulls back
      const p = A.t / WIND; R.theta = A.start - A.wind * Math.sin(p * Math.PI * 0.5);
    } else if (A.t < WIND + A.dur) {                     // main run into the stop
      const p = (A.t - WIND) / A.dur;
      const e = A.slow ? easeOutQuint(p) : easeOutCubic(p);
      R.theta = A.start - A.wind + (A.target + A.over - (A.start - A.wind)) * e;
      if (A.slow && !A.teased && p > 0.05) { A.teased = true; A.onTeaseStart && A.onTeaseStart(); R.tease = 1; }
    } else if (A.t < WIND + A.dur + SETTLE) {           // overshoot, then a damped spring back
      if (!A.landed) { A.landed = true; land(R); }
      const p = (A.t - WIND - A.dur) / SETTLE;
      R.theta = A.target + A.over * Math.exp(-6 * p) * Math.cos(p * Math.PI * 2.5);
    } else {
      R.theta = A.target; R.anim = null; R.tease = 0;
      A.onStop();
    }
    R.speed = Math.abs(R.theta - prev) / Math.max(dt, 1e-3);
    const blur = R.speed > 9;
    if (blur !== R.blur) { R.blur = blur; R.faces.forEach(f => setFace(f, f.sym, blur)); }
  }
  function land(R) {
    R.bounce = 1;
    cam.shake = Math.min(1, cam.shake + 0.35 + (R.r === REELS - 1 ? 0.25 : 0));
    const x = REEL_X(R.r);
    emit(x, -1.45, 0, 26, { speed: 2.6, up: 1.4, life: 0.55 });
    emit(x, 1.45, 0, 14, { speed: 2, up: -0.5, life: 0.45 });
    if (R.tease) { emit(x, 0, 0.2, 80, { speed: 5, up: 1, life: 0.9 }); bloomBoost = 1; }
  }

  // ---------- wins ----------
  let hitSet = new Set(), winPulse = 0, celebrateT = 0;
  function highlight(cells) {
    reels.forEach(R => R.faces.forEach(f => (f.hit = false)));
    hitSet = new Set(cells.map(([r, row]) => r + ':' + row));
    cells.forEach(([r, row]) => { const f = faceAt(reels[r], row); f.hit = true; });
    winPulse = cells.length ? 0.0001 : 0;
    if (cells.length) {
      cells.forEach(([r, row]) => emit(REEL_X(r), (1 - row) * FACE * 0.93, 0.3, 18, { speed: 3.2, up: 1.2, life: 0.7 }));
      bloomBoost = Math.max(bloomBoost, 0.6);
    }
  }
  function celebrate(level) {           // big win: camera punch, fountain of sparks from every reel
    celebrateT = 1.6 + level * 0.5; cam.punch = 1.6; bloomBoost = 1.4;
    for (let r = 0; r < REELS; r++) emit(REEL_X(r), -1.6, 0.2, 40 + level * 15, { speed: 4 + level, up: 4 + level, life: 1.2 });
  }
  // where a cell sits on screen, in CSS pixels of the canvas (for drawing paylines on top)
  const v = new THREE.Vector3();
  function project(r, row) {
    const R = reels[r];
    const a = (1 - row) * ALPHA;
    v.set(REEL_X(r), Math.sin(a) * AP, Math.cos(a) * AP).project(camera);
    return { x: (v.x + 1) / 2 * host.clientWidth, y: (1 - v.y) / 2 * host.clientHeight };
  }

  // ---------- frame loop ----------
  const clock = new THREE.Clock();
  let tAll = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.2, clock.getDelta()); tAll += dt;
    let anySpin = false, teaseR = -1;
    reels.forEach(R => { stepReel(R, dt); if (R.anim) anySpin = true; if (R.tease && teaseR < 0) teaseR = R.r; R.drum.rotation.x = R.theta; });

    // light sweep while spinning, gold glow on a teasing reel
    sweep.intensity += ((anySpin ? 2.2 : 0) - sweep.intensity) * Math.min(1, dt * 6);
    sweep.position.x = Math.sin(tAll * 3.2) * 3.4;
    teaseLight.intensity += ((teaseR >= 0 ? 2.5 + Math.sin(tAll * 18) * 1 : 0) - teaseLight.intensity) * Math.min(1, dt * 8);
    if (teaseR >= 0) { teaseLight.position.x = REEL_X(teaseR); if (Math.random() < 0.7) emit(REEL_X(teaseR) + (Math.random() - 0.5) * 0.9, -1.6, 0.1, 2, { speed: 0.6, up: 3.2, spread: 0.3, life: 0.9 }); }

    // faces: tease shimmer, win pop-out, dim the losers
    if (winPulse) winPulse += dt;
    const anyHit = hitSet.size > 0;
    reels.forEach(R => {
      const reelTease = R.r === teaseR ? 0.5 + 0.5 * Math.sin(tAll * 14) : 0;
      R.bounce = Math.max(0, R.bounce - dt * 3);
      R.group.scale.setScalar(1 + R.bounce * R.bounce * 0.035);
      R.faces.forEach(f => {
        const want = f.hit ? 1 : 0;
        f.lift += (want - f.lift) * Math.min(1, dt * 9);
        const beat = f.hit ? 0.5 + 0.5 * Math.sin(winPulse * 9) : 0;
        f.mesh.position.z = AP + f.lift * (0.22 + beat * 0.08);
        f.mesh.scale.setScalar(1 + f.lift * (0.06 + beat * 0.07));
        f.mesh.rotation.y = f.hit ? Math.sin(winPulse * 4 + R.r) * 0.18 * f.lift : 0;
        f.mat.emissiveIntensity = f.hit ? 0.03 + beat * 0.06 : reelTease * 0.12;
        f.halo.material.opacity = Math.max(f.lift * (0.55 + beat * 0.45), reelTease * 0.22);
        f.halo.visible = f.halo.material.opacity > 0.01;
        const d = anyHit && !f.hit && !anySpin ? 0.55 : 1;
        f.dim += (d - (f.dim || 1)) * Math.min(1, dt * 6);
        f.mat.color.setScalar((f.dim || 1) * 0.94);
      });
    });

    // camera: kick on the pull, shake on each stop, slow push toward a teasing reel, punch on big wins
    cam.punch = Math.max(0, cam.punch - dt * 2.2);
    cam.shake = Math.max(0, cam.shake - dt * 3.2);
    cam.dolly += ((teaseR >= 0 ? 0.55 : celebrateT > 0 ? 0.2 : 0) - cam.dolly) * Math.min(1, dt * 2);
    cam.lookX += ((teaseR >= 0 ? REEL_X(teaseR) * 0.15 : 0) - cam.lookX) * Math.min(1, dt * 2);
    celebrateT = Math.max(0, celebrateT - dt);
    // (emissive colour is the tease gold; winners shine through the halo instead)
    const sh = cam.shake * cam.shake * 0.09;
    const punch = Math.sin(Math.min(1, cam.punch) * Math.PI) * 0.45;
    camera.position.set(cam.lookX + (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh + (celebrateT > 0 ? Math.sin(tAll * 7) * 0.04 : 0), cam.z - punch - cam.dolly);
    camera.lookAt(cam.lookX, 0, 0);
    if (celebrateT > 0) camera.rotation.z = Math.sin(tAll * 5) * 0.012;

    bloomBoost = Math.max(0, bloomBoost - dt * 0.9);
    bloom.strength = 0.45 + Math.min(1, bloomBoost) * 0.55 + (teaseR >= 0 ? 0.15 : 0);

    stepParts(dt);
    composer.render();
  });

  return { setTheme, setGrid, spin, highlight, celebrate, project, emit, el: renderer.domElement };
}

window.Reels3D = { create };
window.dispatchEvent(new Event('reels3d-ready'));
