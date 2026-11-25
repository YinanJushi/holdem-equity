// Lucky Claw: a casino-style claw machine in 3D (three.js + Rapier physics).
// The claw head hangs from the gantry on a springy cable, so it swings as the carriage starts and stops. Three
// prongs are hinged to the head and driven by motors; the motor's strength is the grip, decided for each play
// (most plays loosen a little once the prize is lifted, some hold tight all the way), which is how real machines
// set their payout. Prizes are all casino things: cocktails, champagne, chips, cards, dice, cash and gold.
// Drop a prize down the chute in the front-left corner to win its value.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FIGS, buildBox, buildFigure, FIG_CREDIT, FIG_CREDIT_ZH } from './claw-figures.js?v=134';
import { headerChrome, onQuality } from './chrome3d.js?v=134';

const $ = s => document.querySelector(s), tr = x => (window.I18N ? I18N.t(x) : x);
const host = $('#clHost');
// two machines share this page: the casino machine and the poker-deck machine (switch with the Machine button)
const MACHINE = (() => { let m = new URLSearchParams(location.search).get('m'); try { m = m || localStorage.getItem('ol-claw-m'); } catch (e) { /* ignore */ } return m === 'poker' || m === 'figure' ? m : 'casino'; })();
const POKER = MACHINE === 'poker', FIGURE = MACHINE === 'figure', SUFFIX = POKER ? '-poker' : FIGURE ? '-figure' : '';
// two kinds of claw, like real machines: a round head with three curved wire prongs (the classic crane claw),
// or a box head with two arms and rubber feet (the UFO-catcher style). Switch with the Claw button.
// the figure machine always uses the two-arm claw, like real prize-figure machines
const CLAW = FIGURE ? 'two' : (() => { try { return localStorage.getItem('ol-claw-type') === 'two' ? 'two' : 'three'; } catch (e) { return 'three'; } })();
const COST = 25;
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ antialias: true }); if (!renderer.getContext()) renderer = null; } catch (e) { renderer = null; }
if (renderer && host) RAPIER.init().then(() => start()).catch(e => { console.error(e); document.documentElement.classList.remove('t3d-wait'); });
else document.documentElement.classList.remove('t3d-wait');

function start() {
  document.body.classList.add('cl-on');
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'cl-canvas'; host.appendChild(renderer.domElement);
  headerChrome(host, 'cl-on');
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0c0507');
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 30);
  scene.add(new THREE.HemisphereLight('#ffe8cc', '#2a0a10', 0.42));
  const key = new THREE.SpotLight('#fff3e0', 1.8, 3, 0.7, 0.8, 1.4); key.position.set(0.05, 0.62, 0.12); key.target.position.set(0, 0, -0.02); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; scene.add(key, key.target);

  // ---------- sizes (metres) ----------
  const X = 0.28, ZB = -0.26, ZF = 0.24, TOP = 0.52;            // inside of the prize box
  const CH = { x0: -X, x1: -0.11, z0: 0.07, z1: ZF };          // the prize chute (front-left)
  const HEAD = { r: 0.032, h: 0.04 }, FING = FIGURE ? { n: 2, len: 0.17, r: 0.06 } : CLAW === 'two' ? { n: 2, len: 0.115, r: 0.042 } : { n: 3, len: 0.095, r: 0.026 };
  // a three-prong claw's wire prong, side view (x outward, y up; the hinge is at the top): it bows out, then hooks in
  // a UFO-catcher arm, side view (x outward, hinge at the top): it angles out, then an elbow turns the finger in
  const ARM = [[0, FING.len / 2], [0.016, -FING.len / 2 + FING.len * 0.32], [-FING.len * 0.13, -FING.len / 2 + 0.004]];
  const PRONG = [[0, 0.0475], [0.011, 0.02], [0.012, -0.01], [0.004, -0.035], [-0.012, -0.0465]];
  const ROPE_MIN = 0.05, ROPE_MAX = 0.46;

  // ---------- materials ----------
  const canvasTex = (w, h, draw, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const gold = new THREE.MeshStandardMaterial({ color: '#d4a444', metalness: 1, roughness: 0.25, envMapIntensity: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#b8bcc6', metalness: 1, roughness: 0.28, envMapIntensity: 0.9 });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: POKER ? '#0e3a2a' : FIGURE ? '#2a1450' : '#6e0d1d', metalness: 0.2, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const blackGloss = new THREE.MeshPhysicalMaterial({ color: '#120a0c', metalness: 0.3, roughness: 0.3, clearcoat: 1 });
  const velvetTex = canvasTex(256, 256, g => { g.fillStyle = POKER ? '#0d5236' : '#5a0a16'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : POKER ? '140,255,190' : '255,120,140'},${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } });
  velvetTex.wrapS = velvetTex.wrapT = THREE.RepeatWrapping; velvetTex.repeat.set(3, 3);
  const velvet = new THREE.MeshStandardMaterial({ map: velvetTex, roughness: 0.95 });
  const backTex = canvasTex(512, 512, g => {
    const gr = g.createRadialGradient(256, 200, 20, 256, 256, 380); gr.addColorStop(0, '#3a0c18'); gr.addColorStop(1, '#12040a'); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(242,193,78,.35)'; g.lineWidth = 2; for (let r = 40; r < 400; r += 36) { g.beginPath(); g.arc(256, 560, r, Math.PI, Math.PI * 2); g.stroke(); }
    ['♠', '♥', '♦', '♣'].forEach((s, i) => { g.fillStyle = i % 3 ? 'rgba(242,193,78,.22)' : 'rgba(255,90,110,.22)'; g.font = '120px Georgia, serif'; g.textAlign = 'center'; g.fillText(s, 90 + i * 110, 150 + (i % 2) * 60); });
    g.fillStyle = 'rgba(255,230,170,.6)'; g.font = 'italic 700 46px Georgia, serif'; g.fillText('Odds Lounge', 256, 330);
    if (POKER) {   // the poker machine: green felt glow and a fan of cards
      g.fillStyle = 'rgba(8,40,26,.85)'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 7; i++) { g.save(); g.translate(256, 470); g.rotate((i - 3) * 0.2); g.fillStyle = i % 2 ? '#f4efe4' : '#e9e2d2'; g.strokeStyle = '#c99a2e'; g.lineWidth = 3; g.beginPath(); g.roundRect(-55, -330, 110, 160, 10); g.fill(); g.stroke(); g.fillStyle = i % 3 === 1 ? '#c8102e' : '#151515'; g.font = '700 54px Georgia, serif'; g.textAlign = 'center'; g.fillText('♠♥♦♣'[i % 4], 0, -235); g.font = '700 26px Georgia, serif'; g.fillText('A23456789'[i] || 'K', -32, -298); g.restore(); }
      g.fillStyle = 'rgba(242,193,78,.75)'; g.font = 'italic 700 40px Georgia, serif'; g.textAlign = 'center'; g.fillText('Collector Decks', 256, 70);
    }
  });

  // ---------- physics world ----------
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.lengthUnit = 0.05; world.timestep = 1 / 120; world.numSolverIterations = 8;
  const fixedBox = (hx, hy, hz, x, y, z, fr = 0.6) => world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(fr).setRestitution(0.05));
  // floor around the chute hole
  if (!FIGURE) {
    fixedBox((X - CH.x1) / 2, 0.02, (ZF - ZB) / 2, CH.x1 + (X - CH.x1) / 2, -0.02, (ZF + ZB) / 2);
    fixedBox((CH.x1 - CH.x0) / 2, 0.02, (CH.z0 - ZB) / 2, (CH.x0 + CH.x1) / 2, -0.02, (CH.z0 + ZB) / 2);
  }
  // the figure machine: no floor, just a "bridge" of two bars over the drop. The boxed figure rests across them;
  // tip, turn and shuffle it until it slips through the gap. Fences keep it from walking off the ends.
  const BR = { y: 0.2, r: 0.008, gap: 0.116, z0: ZB + 0.03, z1: ZF - 0.03, fence: 0.25 };
  const BOX = [0.18, 0.068, 0.13];   // the figure box lies flat: long side across the bars, window up
  if (FIGURE) {
    [-1, 1].forEach(sx => {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      world.createCollider(RAPIER.ColliderDesc.cylinder((BR.z1 - BR.z0) / 2, BR.r).setTranslation(sx * BR.gap / 2, BR.y, (BR.z0 + BR.z1) / 2).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.35));
      fixedBox(0.004, 0.06, (BR.z1 - BR.z0) / 2, sx * BR.fence, BR.y + 0.03, (BR.z0 + BR.z1) / 2, 0.2);
      // solid ledges outside the bars (a little lower), so a box pushed off the side lands there instead of dropping
      const lx0 = BR.gap / 2 + BR.r + 0.006; fixedBox((BR.fence - lx0) / 2, 0.005, (BR.z1 - BR.z0) / 2, sx * (lx0 + BR.fence) / 2, BR.y - 0.012, (BR.z0 + BR.z1) / 2, 0.5);
    });
    [BR.z0 - 0.004, BR.z1 + 0.004].forEach(z => fixedBox(BR.fence, 0.06, 0.004, 0, BR.y + 0.03, z, 0.2));
  }
  // glass walls and the chute's inner walls (acrylic)
  fixedBox(0.01, 0.4, (ZF - ZB) / 2 + 0.02, -X - 0.01, 0.3, (ZF + ZB) / 2, 0.2); fixedBox(0.01, 0.4, (ZF - ZB) / 2 + 0.02, X + 0.01, 0.3, (ZF + ZB) / 2, 0.2);
  fixedBox(X + 0.02, 0.4, 0.01, 0, 0.3, ZB - 0.01, 0.2); fixedBox(X + 0.02, 0.4, 0.01, 0, 0.3, ZF + 0.01, 0.2);
  const CHW = 0.11;   // chute wall height: lower than the pile, so a shove or an avalanche can tip prizes in by luck
  if (!FIGURE) {
    fixedBox(0.004, CHW / 2, (CH.z1 - CH.z0) / 2, CH.x1 + 0.004, CHW / 2, (CH.z0 + CH.z1) / 2, 0.2);
    fixedBox((CH.x1 - CH.x0) / 2, CHW / 2, 0.004, (CH.x0 + CH.x1) / 2, CHW / 2, CH.z0 - 0.004, 0.2);
  }
  // the bin under the chute catches what falls
  fixedBox(X, 0.01, 0.2, -0.1, -0.24, 0.15, 0.6);

  // ---------- the claw: carriage (kinematic), head on a springy cable, three motorised prongs ----------
  // like a real machine, the claw waits over the prize chute and comes back there after every play
  const START = { x: (CH.x0 + CH.x1) / 2, z: (CH.z0 + CH.z1) / 2 };
  const carriage = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(START.x, TOP, START.z));
  const headBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(START.x, TOP - ROPE_MIN, START.z).setLinearDamping(0.6).setCcdEnabled(true));
  headBody.setEnabledRotations(false, false, false, true);
  world.createCollider((CLAW === 'two' ? RAPIER.ColliderDesc.cuboid(FING.r + 0.012, HEAD.h / 2, 0.024) : RAPIER.ColliderDesc.cylinder(HEAD.h / 2, HEAD.r)).setDensity(CLAW === 'two' ? 2400 : 3000).setFriction(0.3), headBody);
  const FG = (0x0002 << 16) | 0xfffd;   // prongs don't collide with each other
  const fingers = Array.from({ length: FING.n }, (_, i) => {
    const th = FING.n === 2 ? i * Math.PI : i * Math.PI * 2 / 3 + Math.PI / 6, o = { x: Math.cos(th), z: Math.sin(th) };
    const hp = headBody.translation();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -th);
    const fb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(hp.x + o.x * FING.r, hp.y - HEAD.h / 2 - FING.len / 2, hp.z + o.z * FING.r).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setAngularDamping(2).setCcdEnabled(true));
    // local -x points toward the centre of the claw
    if (CLAW === 'two') {
      // a UFO-catcher arm: a flat bar angled out, an elbow, then a finger turned inward with a rubber pad on its tip
      for (let k = 1; k < ARM.length; k++) {
        const [x0, y0] = ARM[k - 1], [x1, y1] = ARM[k], len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(x1 - x0, y1 - y0);
        const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ang);
        world.createCollider(RAPIER.ColliderDesc.cuboid(0.0045, len / 2, 0.013).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, 0).setRotation({ x: qz.x, y: qz.y, z: qz.z, w: qz.w }).setDensity(2000).setFriction(0.8).setCollisionGroups(FG), fb);
      }
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.009, 0.005, 0.014).setTranslation(ARM[2][0] + 0.006, ARM[2][1] + 0.002, 0).setDensity(1500).setFriction(1.6).setCollisionGroups(FG), fb);
    } else {
      // a wire prong: capsules along its curve, with a small rubber ball at the tip
      for (let k = 1; k < PRONG.length; k++) {
        const [x0, y0] = PRONG[k - 1], [x1, y1] = PRONG[k], len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(x1 - x0, y1 - y0);
        const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ang);
        world.createCollider(RAPIER.ColliderDesc.capsule(len / 2, 0.0035).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, 0).setRotation({ x: qz.x, y: qz.y, z: qz.z, w: qz.w }).setDensity(4000).setFriction(1.0).setCollisionGroups(FG), fb);
      }
      world.createCollider(RAPIER.ColliderDesc.ball(0.0055).setTranslation(PRONG[4][0], PRONG[4][1], 0).setDensity(3000).setFriction(1.3).setCollisionGroups(FG), fb);
    }
    const jd = RAPIER.JointData.revoluteWithAxes({ x: o.x * FING.r, y: -HEAD.h / 2, z: o.z * FING.r }, { x: 0, y: FING.len / 2, z: 0 }, { x: -o.z, y: 0, z: o.x }, { x: 0, y: 0, z: 1 });
    const j = world.createImpulseJoint(jd, headBody, fb, true);
    j.setContactsEnabled(false); j.setLimits(-0.62, FIGURE ? 1.0 : 0.7);
    return { body: fb, joint: j, th };
  });
  // the prong motors are stiff, but their torque is capped: the cap (N·m) is the grip strength
  const setGrip = (target, torque) => fingers.forEach(f => { f.joint.configureMotorPosition(target, 4000, 130); f.joint.setMotorMaxForce(torque); });
  // the figure machine's long arms open wide so their feet can land past the ends of a box and slide under it
  const OPEN_T = FIGURE ? 0.35 : 0.05;   // torque holding the arms open (the figure machine's long arms are heavy)
  const OPEN = FIGURE ? 0.6 : CLAW === 'two' ? 0.6 : 0.55, CLOSED = FIGURE ? -0.35 : CLAW === 'two' ? -0.45 : -0.5;
  setGrip(OPEN, OPEN_T);

  // ---------- prizes ----------
  // all casino things: cocktails from the lounge bar, champagne, chips, cards, dice, cash and gold
  const prizes = [];   // { kind, body, obj, value, name }
  const KINDS = {
    chip: { name: 'Loose chip', value: 10 }, chips: { name: 'Chip stack', value: 60 }, dice: { name: 'Lucky dice', value: 40 }, cards: { name: 'Card deck', value: 40 },
    rocks: { name: 'Old Fashioned', value: 50 }, highball: { name: 'Highball cocktail', value: 60 }, martini: { name: 'Martini', value: 70 },
    cash: { name: 'Cash bundle', value: 150 }, champagne: { name: 'Champagne', value: 200 }, bar: { name: 'Gold bar', value: 250 }, golden: { name: 'Golden lucky chip', value: 500 },
  };
  // the poker machine's prizes: loose cards and ten original collector decks in four rarities
  const DECKS = {
    deck_red: { name: 'Lounge Classic Red', value: 30, rarity: 'Common' }, deck_blue: { name: 'Lounge Classic Blue', value: 30, rarity: 'Common' },
    deck_noir: { name: 'Midnight Noir', value: 60, rarity: 'Rare' }, deck_jade: { name: 'Jade Garden', value: 60, rarity: 'Rare' }, deck_sakura: { name: 'Sakura Night', value: 60, rarity: 'Rare' }, deck_neon: { name: 'Neon Alley', value: 70, rarity: 'Rare' },
    deck_gold: { name: 'Royal Gold Foil', value: 150, rarity: 'Limited' }, deck_ice: { name: 'Ice Crystal', value: 150, rarity: 'Limited' }, deck_ember: { name: 'Dragon Ember', value: 180, rarity: 'Limited' },
    deck_holo: { name: 'Prism Ace', value: 500, rarity: 'Legendary' },
  };
  if (POKER) { for (const k of Object.keys(KINDS)) delete KINDS[k]; Object.assign(KINDS, { card: { name: 'Loose card', value: 5 } }, DECKS); }
  if (FIGURE) { for (const k of Object.keys(KINDS)) delete KINDS[k]; for (const id of Object.keys(FIGS)) KINDS['fig_' + id] = { name: FIGS[id].name, value: 300 }; }
  const boxArt = {};   // front of each figure box (for the collection book)
  const chipFace = (base, stripe, mark = '') => canvasTex(128, 128, g => { g.fillStyle = base; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill(); g.fillStyle = stripe; for (let i = 0; i < 8; i++) { g.save(); g.translate(64, 64); g.rotate(i * Math.PI / 4); g.fillRect(-6, -64, 12, 16); g.restore(); } g.strokeStyle = stripe; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 38, 0, 7); g.stroke(); if (mark) { g.fillStyle = stripe; g.font = '700 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(mark, 64, 67); } });
  const chipMats = (a, b, mark, extra = {}) => { const f = chipFace(a, b, mark); const edge = canvasTex(128, 8, g => { g.fillStyle = a; g.fillRect(0, 0, 128, 8); g.fillStyle = b; for (let i = 0; i < 8; i++) g.fillRect(i * 16 + 4, 0, 7, 8); }); return [new THREE.MeshStandardMaterial({ map: edge, roughness: 0.4, ...extra }), new THREE.MeshStandardMaterial({ map: f, roughness: 0.35, ...extra }), new THREE.MeshStandardMaterial({ map: f, roughness: 0.35, ...extra })]; };
  const chipSets = [['#c8102e', '#fff', '5'], ['#1f4fb8', '#fff', '10'], ['#151515', '#f2c14e', '100'], ['#1e8a4a', '#fff', '25'], ['#6a2a9a', '#fff', '500']].map(([a, b, m]) => chipMats(a, b, m));
  const goldChipM = chipMats('#e0a628', '#7a3a06', '★', { metalness: 0.9, roughness: 0.22, emissive: '#6a4206', emissiveIntensity: 0.35 });
  const noteTex = canvasTex(256, 128, g => {
    g.fillStyle = '#d9e8cf'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#3f6a3a'; g.lineWidth = 6; g.strokeRect(6, 6, 244, 116);
    g.fillStyle = '#3f6a3a'; g.font = '800 40px Georgia, serif'; g.textAlign = 'center'; g.fillText('100', 52, 52); g.fillText('100', 204, 104);
    g.beginPath(); g.ellipse(128, 64, 34, 40, 0, 0, 7); g.fillStyle = '#b8d3a8'; g.fill(); g.fillStyle = '#3f6a3a'; g.font = '700 46px Georgia, serif'; g.fillText('♠', 128, 80);
    g.font = '700 14px Georgia, serif'; g.fillText('ODDS LOUNGE', 128, 116);
  });
  const noteEdge = new THREE.MeshStandardMaterial({ color: '#c4ccb8', roughness: 0.9 });
  const noteTop = new THREE.MeshStandardMaterial({ map: noteTex, color: '#c8d0c0', roughness: 0.8 });
  const bandM = new THREE.MeshStandardMaterial({ color: '#f2c14e', roughness: 0.5 });
  const barGeo = (() => { const s = new THREE.Shape(), b = 0.049, t = 0.039, h = 0.03; s.moveTo(-b, -h / 2); s.lineTo(b, -h / 2); s.lineTo(t, h / 2); s.lineTo(-t, h / 2); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.002, bevelSegments: 2 }); g.translate(0, 0, -0.02); return g; })();
  const barM = new THREE.MeshStandardMaterial({ color: '#f0b83a', metalness: 1, roughness: 0.18, envMapIntensity: 1.2, emissive: '#5a3a08', emissiveIntensity: 0.2 });
  const diceFace = n => canvasTex(128, 128, g => { g.fillStyle = '#d9102e'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff'; const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]], 5: [[30, 30], [98, 30], [64, 64], [30, 98], [98, 98]], 6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]] }[n]; P.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); }); });
  const diceMats = [1, 6, 2, 5, 3, 4].map(n => new THREE.MeshPhysicalMaterial({ map: diceFace(n), roughness: 0.15, clearcoat: 1 }));
  // a deck of cards in its box: the lounge's card back on the front, white card edges at the open end
  const deckBack = canvasTex(128, 180, g => { g.fillStyle = '#8a0e1e'; g.fillRect(0, 0, 128, 180); g.strokeStyle = '#f2c14e'; g.lineWidth = 4; g.strokeRect(8, 8, 112, 164); g.strokeStyle = 'rgba(242,193,78,.35)'; g.lineWidth = 1; for (let k = -180; k < 180; k += 10) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 180, 180); g.stroke(); g.beginPath(); g.moveTo(k + 180, 0); g.lineTo(k, 180); g.stroke(); } g.fillStyle = '#f2c14e'; g.font = 'italic 700 30px Georgia, serif'; g.textAlign = 'center'; g.fillText('OL', 64, 100); });
  const deckSide = new THREE.MeshStandardMaterial({ color: '#7a0c1a', roughness: 0.5 }), deckEdge = new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.7 });
  const deckMats = [deckSide, deckSide, deckEdge, deckSide, new THREE.MeshStandardMaterial({ map: deckBack, roughness: 0.45 }), new THREE.MeshStandardMaterial({ map: deckBack, roughness: 0.45 })];
  // ---------- collector deck art (all original) ----------
  // each design draws the front of its tuck box on a canvas; the same art is shown in the collection book
  const rnd = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const lattice = (g, w, h, a, b, step = 12) => { g.strokeStyle = b; g.lineWidth = 1.4; for (let k = -h; k < w + h; k += step) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k + h, 0); g.lineTo(k, h); g.stroke(); } void a; };
  const frame = (g, w, h, c, inset = 8, lw = 3) => { g.strokeStyle = c; g.lineWidth = lw; g.strokeRect(inset, inset, w - inset * 2, h - inset * 2); };
  const medallion = (g, w, h, fill, ink, text = 'OL') => { g.fillStyle = fill; g.beginPath(); g.ellipse(w / 2, h / 2, 30, 38, 0, 0, 7); g.fill(); g.strokeStyle = ink; g.lineWidth = 2.5; g.stroke(); g.fillStyle = ink; g.font = 'italic 700 26px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); };
  const label = (g, w, h, text, col) => { g.fillStyle = col; g.font = '700 10px "Libre Franklin", Arial'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(text, w / 2, h - 16); };
  const DECK_ART = {
    deck_red: g => { g.fillStyle = '#9e1022'; g.fillRect(0, 0, 128, 180); lattice(g, 128, 180, 0, 'rgba(255,255,255,.35)'); frame(g, 128, 180, '#fff'); medallion(g, 128, 180, '#9e1022', '#fff'); label(g, 128, 180, 'DECK HUNTER · CLASSIC', '#fff'); },
    deck_blue: g => { g.fillStyle = '#1d3f8f'; g.fillRect(0, 0, 128, 180); lattice(g, 128, 180, 0, 'rgba(255,255,255,.35)'); frame(g, 128, 180, '#fff'); medallion(g, 128, 180, '#1d3f8f', '#fff'); label(g, 128, 180, 'DECK HUNTER · CLASSIC', '#fff'); },
    deck_noir: g => { g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, 128, 180); g.strokeStyle = 'rgba(214,170,80,.8)'; g.lineWidth = 1; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(64, 150); g.lineTo(i * 10, 20); g.stroke(); } g.beginPath(); g.arc(64, 150, 40, Math.PI, 0); g.stroke(); frame(g, 128, 180, '#d6aa50', 8, 1.5); frame(g, 128, 180, '#d6aa50', 12, 0.8); g.fillStyle = '#d6aa50'; g.font = '700 30px Georgia, serif'; g.textAlign = 'center'; g.fillText('♠', 64, 100); label(g, 128, 180, 'MIDNIGHT NOIR', '#d6aa50'); },
    deck_jade: g => { g.fillStyle = '#0f5a45'; g.fillRect(0, 0, 128, 180); g.strokeStyle = 'rgba(232,200,120,.75)'; g.lineWidth = 1.2; for (let y = 22; y < 170; y += 26) for (let x = 18; x < 120; x += 26) { g.beginPath(); g.arc(x, y, 10, 0, 7); g.stroke(); g.beginPath(); g.arc(x, y, 4, 0, 7); g.stroke(); } frame(g, 128, 180, '#e8c878'); medallion(g, 128, 180, '#0f5a45', '#e8c878', '♣'); label(g, 128, 180, 'JADE GARDEN', '#e8c878'); },
    deck_sakura: g => { g.fillStyle = '#2a1430'; g.fillRect(0, 0, 128, 180); const r = rnd(7); for (let i = 0; i < 22; i++) { const x = r() * 128, y = r() * 180, s = 4 + r() * 6; g.fillStyle = `rgba(255,${150 + r() * 60 | 0},${190 + r() * 40 | 0},.85)`; for (let p = 0; p < 5; p++) { g.beginPath(); g.ellipse(x + Math.cos(p * 1.256) * s, y + Math.sin(p * 1.256) * s, s * 0.7, s * 0.45, p * 1.256, 0, 7); g.fill(); } g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(x, y, s * 0.3, 0, 7); g.fill(); } frame(g, 128, 180, '#ffb6d0'); label(g, 128, 180, 'SAKURA NIGHT', '#ffd6e4'); },
    deck_neon: g => { g.fillStyle = '#160a26'; g.fillRect(0, 0, 128, 180); const r = rnd(42); g.lineCap = 'round'; for (let i = 0; i < 16; i++) { g.strokeStyle = ['#ff3fa4', '#2ef2ff', '#b6ff3a', '#ffd23f'][i % 4]; g.shadowColor = g.strokeStyle; g.shadowBlur = 8; g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(r() * 128, r() * 180); g.bezierCurveTo(r() * 128, r() * 180, r() * 128, r() * 180, r() * 128, r() * 180); g.stroke(); } g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = '900 22px "Libre Franklin", Arial'; g.textAlign = 'center'; g.fillText('NEON', 64, 92); label(g, 128, 180, 'NEON ALLEY', '#2ef2ff'); },
    deck_gold: g => { const gr = g.createLinearGradient(0, 0, 128, 180); gr.addColorStop(0, '#fff0b0'); gr.addColorStop(0.5, '#d6a12e'); gr.addColorStop(1, '#7a5212'); g.fillStyle = gr; g.fillRect(0, 0, 128, 180); frame(g, 128, 180, '#5a3a08', 8, 2); g.strokeStyle = '#5a3a08'; g.lineWidth = 2; for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(64 - 26 + i * 0, 95, 10, 4, -0.6, 0, 7); } g.fillStyle = '#5a3a08'; g.beginPath(); g.moveTo(40, 98); g.lineTo(44, 74); g.lineTo(54, 88); g.lineTo(64, 68); g.lineTo(74, 88); g.lineTo(84, 74); g.lineTo(88, 98); g.closePath(); g.fill(); g.fillRect(40, 100, 48, 6); for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(30 + i * 3, 124 - i * 9, 6, 3, -1, 0, 7); g.fill(); g.beginPath(); g.ellipse(98 - i * 3, 124 - i * 9, 6, 3, 1, 0, 7); g.fill(); } label(g, 128, 180, 'ROYAL GOLD FOIL', '#3a2404'); },
    deck_ice: g => { const gr = g.createLinearGradient(0, 0, 0, 180); gr.addColorStop(0, '#e8f8ff'); gr.addColorStop(1, '#7fb8e6'); g.fillStyle = gr; g.fillRect(0, 0, 128, 180); const r = rnd(9); for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.4})`; g.beginPath(); g.moveTo(r() * 128, r() * 180); g.lineTo(r() * 128, r() * 180); g.lineTo(r() * 128, r() * 180); g.fill(); } g.strokeStyle = '#2b6ea8'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(64, 90); g.lineTo(64 + Math.cos(i * 1.047) * 28, 90 + Math.sin(i * 1.047) * 28); g.stroke(); } frame(g, 128, 180, '#2b6ea8', 8, 2); label(g, 128, 180, 'ICE CRYSTAL', '#1d4f7a'); },
    deck_ember: g => { const gr = g.createLinearGradient(0, 180, 0, 0); gr.addColorStop(0, '#ffb02e'); gr.addColorStop(0.5, '#d8301a'); gr.addColorStop(1, '#4a0a08'); g.fillStyle = gr; g.fillRect(0, 0, 128, 180); g.strokeStyle = 'rgba(255,220,140,.55)'; g.lineWidth = 1.3; for (let y = 10; y < 180; y += 12) for (let x = (y / 12 % 2) * 8; x < 136; x += 16) { g.beginPath(); g.arc(x, y, 8, 0, Math.PI); g.stroke(); } frame(g, 128, 180, '#ffd08a'); medallion(g, 128, 180, '#4a0a08', '#ffd08a', '♦'); label(g, 128, 180, 'DRAGON EMBER', '#ffe2b0'); },
    deck_holo: g => { g.fillStyle = '#050507'; g.fillRect(0, 0, 128, 180); const gr = g.createLinearGradient(0, 0, 128, 180); ['#ff4d6d', '#ffd23f', '#3affb0', '#3ab0ff', '#b04dff', '#ff4d6d'].forEach((c, i) => gr.addColorStop(i / 5, c)); g.strokeStyle = gr; g.lineWidth = 5; g.strokeRect(9, 9, 110, 162); g.lineWidth = 1.5; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(64, 30 + i * 2); g.lineTo(20 + i * 2, 90); g.lineTo(64, 150 - i * 2); g.lineTo(108 - i * 2, 90); g.closePath(); g.stroke(); } g.fillStyle = gr; g.font = '700 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('A', 64, 92); label(g, 128, 180, 'PRISM ACE · 1 OF 1', '#fff'); },
  };
  const deckArt = {};   // canvas per design (for the collection book)
  const deckMatCache = {};
  function pokerDeck(kind) {
    if (deckMatCache[kind]) return deckMatCache[kind];
    const c = document.createElement('canvas'); c.width = 128; c.height = 180; DECK_ART[kind](c.getContext('2d')); deckArt[kind] = c;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const R = DECKS[kind].rarity, gold = kind === 'deck_gold', holo = kind === 'deck_holo';
    const face = new THREE.MeshPhysicalMaterial({ map: tex, roughness: gold ? 0.25 : 0.42, metalness: gold ? 0.75 : 0.05, clearcoat: R === 'Common' ? 0.3 : 1, iridescence: holo ? 1 : 0, emissive: holo ? '#222' : '#000', emissiveMap: holo ? tex : null, emissiveIntensity: holo ? 0.6 : 0 });
    const sideCol = { deck_red: '#9e1022', deck_blue: '#1d3f8f', deck_noir: '#0c0c0e', deck_jade: '#0f5a45', deck_sakura: '#2a1430', deck_neon: '#160a26', deck_gold: '#c9952c', deck_ice: '#a8d4f2', deck_ember: '#b8281a', deck_holo: '#050507' }[kind];
    const side = new THREE.MeshPhysicalMaterial({ color: sideCol, roughness: 0.45, metalness: gold ? 0.8 : 0.05, clearcoat: 0.6, iridescence: holo ? 1 : 0 });
    const flap = new THREE.MeshStandardMaterial({ color: sideCol, roughness: 0.5, emissive: R === 'Legendary' ? '#5a4a10' : R === 'Limited' ? '#2a1e06' : '#000', emissiveIntensity: 0.6 });
    return (deckMatCache[kind] = { mats: [side, side, flap, flap, face, face], face });
  }
  // loose playing cards (thin; mostly filler that slides around the pile)
  const cardBackTex = canvasTex(64, 90, g => { g.fillStyle = '#f4efe4'; g.fillRect(0, 0, 64, 90); g.fillStyle = '#9e1022'; g.fillRect(4, 4, 56, 82); lattice(g, 64, 90, 0, 'rgba(255,255,255,.4)', 8); });
  const cardFaces = Array.from({ length: 12 }, (_, i) => canvasTex(64, 90, g => { const su = '♠♥♦♣'[i % 4], rk = 'AKQJ1098765432'.replace('10', 'T')[i % 13]; g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 64, 90); g.fillStyle = su === '♥' || su === '♦' ? '#c8102e' : '#151515'; g.font = '700 16px Georgia, serif'; g.textAlign = 'left'; g.fillText((rk === 'T' ? '10' : rk) + su, 5, 18); g.font = '40px Georgia, serif'; g.textAlign = 'center'; g.fillText(su, 32, 60); }));
  const cardEdge = new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.7 });
  const cardBackM = new THREE.MeshStandardMaterial({ map: cardBackTex, roughness: 0.5 });
  const cardMats = cardFaces.map(t => [cardEdge, cardEdge, new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }), cardBackM, cardEdge, cardEdge]);
  const cardGeo = new THREE.BoxGeometry(0.063, 0.0012, 0.088), deckGeo = new RoundedBoxGeometry(0.063, 0.088, 0.022, 2, 0.002);

  // cocktail glasses (lathe profiles: radius, height in metres), with the drink inside and a garnish
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const GLASSES = {
    martini: { outer: [[0, 0], [0.022, 0], [0.022, 0.003], [0.004, 0.005], [0.003, 0.042], [0.005, 0.047], [0.04, 0.085]], inner: [[0, 0.05], [0.037, 0.084]], top: 0.085, fill: 0.8 },
    rocks: { outer: [[0, 0], [0.026, 0], [0.028, 0.003], [0.029, 0.057]], inner: [[0, 0.009], [0.026, 0.009], [0.027, 0.057]], top: 0.057, fill: 0.7 },
    highball: { outer: [[0, 0], [0.019, 0], [0.02, 0.003], [0.021, 0.092]], inner: [[0, 0.009], [0.018, 0.009], [0.019, 0.092]], top: 0.092, fill: 0.78 },
  };
  const DRINK_LOOKS = {
    martini: [{ col: '#e0446a', garnish: 'lime' }, { col: '#eef2dc', garnish: 'olive' }, { col: '#2e1a10', garnish: 'beans', foam: '#d9b98a' }],
    rocks: [{ col: '#b8651b', garnish: 'cherry', ice: true }],
    highball: [{ col: '#d6ecb0', garnish: 'lime', ice: true, straw: '#1d1d1d' }, { col: '#ff9a2e', col2: '#c8102e', garnish: 'cherry', ice: true, straw: '#ff5a8a' }],
  };
  const glassM = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transparent: true, opacity: 0.2, clearcoat: 0.6, envMapIntensity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const lathe = pts => new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), 28);
  const innerR = (prof, y) => { for (let i = 1; i < prof.length; i++) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; if (y <= y1) return r0 + (r1 - r0) * Math.max(0, (y - y0) / Math.max(1e-6, y1 - y0)); } return prof[prof.length - 1][0]; };
  const iceM = new THREE.MeshPhysicalMaterial({ color: '#f4fbff', roughness: 0.12, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false });
  function buildDrink(type) {
    const G = GLASSES[type], D = DRINK_LOOKS[type][Math.floor(Math.random() * DRINK_LOOKS[type].length)];
    const g = new THREE.Group();
    const shell = new THREE.Mesh(lathe([...G.outer, [G.outer[G.outer.length - 1][0] - 0.0012, G.top + 0.0008], ...G.inner.slice().reverse()]), glassM); shell.renderOrder = 2; g.add(shell);
    const y0 = G.inner[0][1] + 0.0005, yl = y0 + (G.top - y0) * G.fill, pts = [V2(0, y0)];
    for (let i = 0; i <= 8; i++) { const y = y0 + (yl - y0) * i / 8; pts.push(V2(Math.max(0.0005, innerR(G.inner, y) - 0.001), y)); }
    pts.push(V2(0, yl));
    const lg = new THREE.LatheGeometry(pts, 24);
    if (D.col2) { const c1 = new THREE.Color(D.col2), c2 = new THREE.Color(D.col), cols = [], pos = lg.attributes.position; for (let i = 0; i < pos.count; i++) { const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / ((yl - y0) * 0.6))); const c = c1.clone().lerp(c2, t); cols.push(c.r, c.g, c.b); } lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); }
    g.add(new THREE.Mesh(lg, new THREE.MeshPhysicalMaterial({ color: D.col2 ? '#ffffff' : D.col, vertexColors: !!D.col2, roughness: 0.25, clearcoat: 0.4, emissive: D.col2 ? '#000' : D.col, emissiveIntensity: 0.02 })));
    const rTop = innerR(G.inner, G.top - 0.003);
    if (D.ice) for (let i = 0; i < 2; i++) { const ic = new THREE.Mesh(new RoundedBoxGeometry(0.016, 0.016, 0.016, 2, 0.003), iceM); ic.position.set(i ? 0.005 : -0.005, yl - 0.006 - i * 0.012, 0); ic.rotation.set(i, i * 1.3, 0.3); g.add(ic); }
    if (D.foam) { const fm = new THREE.Mesh(new THREE.CylinderGeometry(innerR(G.inner, yl) - 0.001, innerR(G.inner, yl - 0.003) - 0.001, 0.003, 24), new THREE.MeshStandardMaterial({ color: D.foam, roughness: 0.9 })); fm.position.y = yl; g.add(fm); }
    if (D.garnish === 'cherry') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.007, 14, 10), new THREE.MeshPhysicalMaterial({ color: '#8a0614', roughness: 0.15, clearcoat: 1 })); c.position.set(-rTop * 0.3, yl + 0.004, 0); g.add(c); }
    if (D.garnish === 'olive') { const o = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 12, 10), new THREE.MeshPhysicalMaterial({ color: '#6f7d2a', roughness: 0.3, clearcoat: 0.6 })); o.scale.set(1, 1.3, 1); o.position.set(0.004, yl - 0.004, 0); g.add(o); const pk = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.06, 5), bandM); pk.position.set(0.012, yl + 0.014, 0); pk.rotation.z = 0.55; g.add(pk); }
    if (D.garnish === 'beans') for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.0038, 8, 6), new THREE.MeshPhysicalMaterial({ color: '#2a160c', roughness: 0.25, clearcoat: 0.8 })); b.scale.set(1, 0.6, 1.4); b.position.set((i - 1) * 0.008, yl + 0.004, 0); g.add(b); }
    if (D.garnish === 'lime') { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.003, 24), [new THREE.MeshStandardMaterial({ color: '#6cb33a' }), new THREE.MeshStandardMaterial({ color: '#d8ec9a' }), new THREE.MeshStandardMaterial({ color: '#d8ec9a' })]); w.rotation.set(Math.PI / 2, 0, 0.5); w.position.set(rTop * 0.9, G.top - 0.003, 0); g.add(w); }
    if (D.straw) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, G.top * 1.25, 8), new THREE.MeshStandardMaterial({ color: D.straw, roughness: 0.4 })); st.position.set(rTop * 0.35, G.top * 0.62, 0); st.rotation.z = -0.15; g.add(st); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    // centre the glass on its middle (the physics body's origin)
    g.position.y = -G.top / 2; const holder = new THREE.Group(); holder.add(g);
    // collider: the glass outline turned into a convex hull
    const hull = []; G.outer.forEach(([r, y]) => { for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; hull.push(Math.cos(a) * Math.max(r, 0.001), y - G.top / 2, Math.sin(a) * Math.max(r, 0.001)); } });
    return { obj: holder, hull: new Float32Array(hull) };
  }
  // champagne bottle: dark green glass, gold foil, cream label
  const bottleProf = [[0, 0], [0.023, 0], [0.024, 0.004], [0.024, 0.085], [0.02, 0.1], [0.011, 0.118], [0.0095, 0.15], [0.011, 0.152], [0, 0.152]];
  const bottleGeo = lathe(bottleProf), foilGeo = new THREE.CylinderGeometry(0.0105, 0.014, 0.04, 20), labelGeo = new THREE.CylinderGeometry(0.0243, 0.0243, 0.035, 28, 1, true);
  const bottleM = new THREE.MeshPhysicalMaterial({ color: '#0f3a1e', roughness: 0.12, clearcoat: 1, metalness: 0.1 });
  const foilM = new THREE.MeshStandardMaterial({ color: '#e2b04a', metalness: 1, roughness: 0.3 });
  const labelTex = canvasTex(256, 64, g => { g.fillStyle = '#f3ead2'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#7a0c1a'; g.font = 'italic 700 26px Georgia, serif'; g.textAlign = 'center'; g.fillText('Odds Lounge', 128, 32); g.font = '700 12px Georgia, serif'; g.fillStyle = '#9a7020'; g.fillText('BRUT · RÉSERVE', 128, 52); });
  const labelM = new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.7 });

  function spawnPrize(kind, x, y, z) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(kind === 'champagne' ? Math.PI / 2 : 0, Math.random() * 6, 0, 'YXZ'));
    const d = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.4).setAngularDamping(0.8).setCcdEnabled(true);
    const body = world.createRigidBody(d);
    let obj;
    const col = desc => world.createCollider(desc, body);
    if (kind === 'chips') {
      col(RAPIER.ColliderDesc.cylinder(0.022, 0.036).setDensity(500).setFriction(0.7));
      obj = new THREE.Group(); const set = chipSets[Math.floor(Math.random() * chipSets.length)];
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.0072, 32), set); m.position.set((Math.random() - 0.5) * 0.002, -0.018 + i * 0.0073, (Math.random() - 0.5) * 0.002); m.rotation.y = Math.random() * 6; m.castShadow = m.receiveShadow = true; obj.add(m); }
    } else if (kind === 'chip' || kind === 'golden') {
      const r = kind === 'golden' ? 0.044 : 0.036, h = kind === 'golden' ? 0.013 : 0.0075;
      col(RAPIER.ColliderDesc.cylinder(h / 2, r).setDensity(kind === 'golden' ? 1600 : 700).setFriction(kind === 'golden' ? 0.5 : 0.55));
      obj = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 36), kind === 'golden' ? goldChipM : chipSets[Math.floor(Math.random() * chipSets.length)]); obj.castShadow = obj.receiveShadow = true;
    } else if (kind === 'cash') {
      col(RAPIER.ColliderDesc.cuboid(0.052, 0.015, 0.026).setDensity(300).setFriction(0.8));
      obj = new THREE.Group();
      const stack = new THREE.Mesh(new RoundedBoxGeometry(0.104, 0.03, 0.052, 2, 0.003), [noteEdge, noteEdge, noteTop, noteEdge, noteEdge, noteEdge]); stack.castShadow = stack.receiveShadow = true; obj.add(stack);
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.032, 0.054), bandM));
    } else if (kind === 'bar') {
      col(RAPIER.ColliderDesc.cuboid(0.047, 0.015, 0.022).setDensity(500).setFriction(0.6));
      obj = new THREE.Mesh(barGeo, barM); obj.castShadow = obj.receiveShadow = true;
    } else if (DECKS[kind] && POKER) {
      col(RAPIER.ColliderDesc.cuboid(0.0315, 0.044, 0.011).setDensity(500).setFriction(0.6));
      obj = new THREE.Mesh(deckGeo, pokerDeck(kind).mats); obj.castShadow = obj.receiveShadow = true;
      if (DECKS[kind].rarity !== 'Common') {   // a little seal sticker on the flap
        const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.0235, 16), new THREE.MeshStandardMaterial({ color: { Rare: '#c0c4cc', Limited: '#f2c14e', Legendary: '#ffffff' }[DECKS[kind].rarity], metalness: 0.8, roughness: 0.3 }));
        seal.rotation.x = Math.PI / 2; seal.position.y = 0.044; obj.add(seal);
      }
    } else if (kind.startsWith('fig_')) {
      col(RAPIER.ColliderDesc.cuboid(BOX[0] / 2, BOX[1] / 2, BOX[2] / 2).setDensity(190).setFriction(0.45));
      const b = buildBox(kind.slice(4), BOX); obj = b.obj; boxArt[kind] = b.artCanvas;
    } else if (kind === 'card') {
      col(RAPIER.ColliderDesc.cuboid(0.0315, 0.0022, 0.044).setDensity(300).setFriction(0.5));
      obj = new THREE.Mesh(cardGeo, cardMats[Math.floor(Math.random() * cardMats.length)]); obj.castShadow = obj.receiveShadow = true;
    } else if (kind === 'cards') {
      col(RAPIER.ColliderDesc.cuboid(0.03, 0.042, 0.011).setDensity(500).setFriction(0.6));
      obj = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.084, 0.022, 2, 0.002), deckMats); obj.castShadow = obj.receiveShadow = true;
    } else if (kind === 'champagne') {
      const hull = []; bottleProf.forEach(([r, yy]) => { for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; hull.push(Math.cos(a) * Math.max(r, 0.001), yy - 0.076, Math.sin(a) * Math.max(r, 0.001)); } });
      col(RAPIER.ColliderDesc.convexHull(new Float32Array(hull)).setDensity(350).setFriction(0.85));
      obj = new THREE.Group(); const b = new THREE.Group(); b.position.y = -0.076; obj.add(b);
      const bm = new THREE.Mesh(bottleGeo, bottleM); bm.castShadow = true; b.add(bm);
      const fo = new THREE.Mesh(foilGeo, foilM); fo.position.y = 0.134; b.add(fo);
      const lb = new THREE.Mesh(labelGeo, labelM); lb.position.y = 0.05; b.add(lb);
    } else if (GLASSES[kind]) {
      const dr = buildDrink(kind);
      col(RAPIER.ColliderDesc.convexHull(dr.hull).setDensity(kind === 'martini' ? 500 : 380).setFriction(0.95));
      obj = dr.obj;
    } else {
      col(RAPIER.ColliderDesc.roundCuboid(0.021, 0.021, 0.021, 0.004).setDensity(400).setFriction(0.6));
      obj = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.05, 0.05, 3, 0.005), diceMats); obj.castShadow = obj.receiveShadow = true;
    }
    scene.add(obj);
    const p = { kind, body, obj, ...KINDS[kind] };
    prizes.push(p); return p;
  }
  const randomSpot = () => { let x, z; do { x = (Math.random() * 2 - 1) * (X - 0.04); z = ZB + 0.04 + Math.random() * (ZF - ZB - 0.08); } while (x < CH.x1 + 0.04 && z > CH.z0 - 0.04); return { x, z }; };
  function putBack() {
    for (const p of prizes) { const t2 = p.body.translation(); if (t2.y < 0.02 && t2.x < CH.x1 + 0.005 && t2.z > CH.z0 - 0.005 || t2.y < -0.05) { const r = randomSpot(); p.body.setTranslation({ x: r.x, y: 0.3, z: r.z }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); } }
  }
  // a fixed mix of prizes, piled up (each one won is restocked with the same kind)
  const STOCK_MIX = POKER ? { card: 40, deck_red: 16, deck_blue: 16, deck_noir: 8, deck_jade: 8, deck_sakura: 8, deck_neon: 7, deck_gold: 4, deck_ice: 4, deck_ember: 3, deck_holo: 1 }
    : { chip: 40, chips: 20, dice: 15, cards: 15, rocks: 13, highball: 13, martini: 13, cash: 9, champagne: 5, bar: 3, golden: 1 };
  const STOCK = Object.entries(STOCK_MIX).flatMap(([k, n]) => Array(n).fill(k)).sort(() => Math.random() - 0.5);
  // pour them in a few at a time, letting each layer settle, so they pile up instead of exploding
  for (let i = 0; i < (FIGURE ? 0 : STOCK.length); i += 16) {
    STOCK.slice(i, i + 16).forEach((k, j) => { const s = randomSpot(); spawnPrize(k, s.x, 0.1 + (j % 4) * 0.05 + i * 0.002, s.z); });
    for (let k = 0; k < 120; k++) world.step();
    putBack();
  }
  // the figure machine holds one box at a time, set across the bridge
  let figPick = (() => { try { const v = localStorage.getItem('ol-claw-fig'); return FIGS[v] ? v : 'miku'; } catch (e) { return 'miku'; } })();
  const placeBox = () => {
    for (let i = prizes.length - 1; i >= 0; i--) { world.removeRigidBody(prizes[i].body); scene.remove(prizes[i].obj); prizes.splice(i, 1); }
    const p = spawnPrize('fig_' + figPick, (Math.random() - 0.5) * 0.01, BR.y + BR.r + BOX[1] / 2 + 0.002, (Math.random() - 0.5) * 0.04);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.12); p.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  };
  if (FIGURE) placeBox();
  for (let i = 0; i < 240; i++) world.step();
  putBack();

  // ---------- the cabinet (looks) ----------
  // base with a sloping control deck, prize door, glass box with gold pillars, a lit marquee
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.5, 0.66, 4, 0.02), lacquer); base.position.set(0, -0.27, -0.01); base.receiveShadow = true; scene.add(base);
  const floorM = new THREE.Mesh(new THREE.BoxGeometry(X * 2, 0.01, ZF - ZB), FIGURE ? new THREE.MeshStandardMaterial({ color: '#08080c', roughness: 0.9 }) : velvet); floorM.position.set(0, FIGURE ? -0.12 : -0.005, (ZF + ZB) / 2); floorM.receiveShadow = true; scene.add(floorM);
  if (FIGURE) {
    // the bridge: two chrome bars on posts, clear fences round it, and a glowing drop below
    const barMat = new THREE.MeshStandardMaterial({ color: '#d8dce4', metalness: 1, roughness: 0.18 });
    [-1, 1].forEach(sx => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(BR.r, BR.r, BR.z1 - BR.z0 + 0.02, 20), barMat); b.rotation.x = Math.PI / 2; b.position.set(sx * BR.gap / 2, BR.y, (BR.z0 + BR.z1) / 2); b.castShadow = true; scene.add(b);
      [BR.z0, BR.z1].forEach(z => { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, BR.y + 0.12, 12), barMat); post.position.set(sx * BR.gap / 2, (BR.y - 0.12) / 2, z); scene.add(post); });
      const lx0 = BR.gap / 2 + BR.r + 0.006, ledge = new THREE.Mesh(new THREE.BoxGeometry(BR.fence - lx0, 0.01, BR.z1 - BR.z0), new THREE.MeshStandardMaterial({ color: '#1a1030', roughness: 0.6, metalness: 0.3 })); ledge.position.set(sx * (lx0 + BR.fence) / 2, BR.y - 0.012, (BR.z0 + BR.z1) / 2); ledge.receiveShadow = true; scene.add(ledge);
      const fence = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.12, BR.z1 - BR.z0), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0.05, depthWrite: false })); fence.position.set(sx * BR.fence, BR.y + 0.03, (BR.z0 + BR.z1) / 2); scene.add(fence);
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(BR.gap * 2.2, BR.z1 - BR.z0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.5, 1.2), transparent: true, opacity: 0.35, toneMapped: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(0, -0.11, (BR.z0 + BR.z1) / 2); scene.add(glow);
  }
  // the hole in the floor where the chute is (drawn dark over the velvet)
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(CH.x1 - CH.x0, CH.z1 - CH.z0), new THREE.MeshBasicMaterial({ color: '#050203' })); hole.rotation.x = -Math.PI / 2; hole.position.set((CH.x0 + CH.x1) / 2, 0.0005, (CH.z0 + CH.z1) / 2); if (!FIGURE) scene.add(hole);
  const acrylic = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1, depthWrite: false });
  const cw1 = new THREE.Mesh(new THREE.BoxGeometry(0.006, CHW, CH.z1 - CH.z0), acrylic); cw1.position.set(CH.x1 + 0.003, CHW / 2, (CH.z0 + CH.z1) / 2); if (!FIGURE) scene.add(cw1);
  const cw2 = new THREE.Mesh(new THREE.BoxGeometry(CH.x1 - CH.x0, CHW, 0.006), acrylic); cw2.position.set((CH.x0 + CH.x1) / 2, CHW / 2, CH.z0 - 0.003); if (!FIGURE) scene.add(cw2);
  [[CH.x1 + 0.003, (CH.z0 + CH.z1) / 2, 0.008, CH.z1 - CH.z0], [(CH.x0 + CH.x1) / 2, CH.z0 - 0.003, CH.x1 - CH.x0, 0.008]].forEach(([x, z, w, d]) => { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.006, d), gold); r.position.set(x, CHW, z); if (!FIGURE) scene.add(r); });
  const chuteSign = canvasTex(256, 64, g => { g.fillStyle = '#f2c14e'; g.font = '800 40px "Libre Franklin", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PRIZE', 128, 34); });
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.025), new THREE.MeshBasicMaterial({ map: chuteSign, transparent: true })); cs.position.set((CH.x0 + CH.x1) / 2, CHW - 0.022, CH.z0 + 0.004); if (!FIGURE) scene.add(cs);
  // a glowing strip along the top of the chute walls so the target is easy to see
  const chuteLed = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 0.4), toneMapped: false });
  [[CH.x1 + 0.003, (CH.z0 + CH.z1) / 2, 0.004, CH.z1 - CH.z0], [(CH.x0 + CH.x1) / 2, CH.z0 - 0.003, CH.x1 - CH.x0, 0.004]].forEach(([x, z, w, d]) => { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.003, d), chuteLed); r.position.set(x, CHW + 0.0045, z); if (!FIGURE) scene.add(r); });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(X * 2, 0.56), new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.8 })); back.position.set(0, 0.27, ZB - 0.002); scene.add(back);
  // the cabinet's back wall (seen when you turn the machine round)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(X * 2 + 0.05, 0.58, 0.014), lacquer); backWall.position.set(0, 0.27, ZB - 0.011); scene.add(backWall);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, roughness: 0.02, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
  [[-X - 0.003, 0, 1], [X + 0.003, 0, 1]].forEach(([x]) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(ZF - ZB, 0.56), glass); p.rotation.y = Math.PI / 2; p.position.set(x, 0.27, (ZF + ZB) / 2); scene.add(p); });
  const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(X * 2, 0.56), glass); frontGlass.position.set(0, 0.27, ZF + 0.003); scene.add(frontGlass);
  // gold corner pillars with LED strips
  const ledM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.8, 0.34) }); const ledBase = new THREE.Color(1.1, 0.8, 0.34);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const px = sx * (X + 0.012), pz = sz > 0 ? ZF + 0.012 : ZB - 0.012;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.58, 0.024), gold); p.position.set(px, 0.27, pz); p.castShadow = true; scene.add(p);
    if (sz > 0) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.54, 0.006), ledM); l.position.set(px - sx * 0.013, 0.27, pz + 0.013); scene.add(l); }
  });
  // roof and marquee
  const roof = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.04, 0.68, 3, 0.01), lacquer); roof.position.set(0, 0.57, -0.01); scene.add(roof);
  function drawMarquee(g, sub) {
    g.fillStyle = '#0a0406'; g.fillRect(0, 0, 1024, 256);
    const gr = g.createLinearGradient(0, 60, 0, 200); gr.addColorStop(0, '#fff1c4'); gr.addColorStop(1, '#e0a23a');
    g.fillStyle = gr; g.shadowColor = 'rgba(255,190,80,.9)'; g.shadowBlur = 30; g.font = 'italic 900 130px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(POKER ? 'Deck Hunter' : FIGURE ? 'Figure Stage' : 'Lucky Claw', 512, 120);
    g.shadowBlur = 0; g.fillStyle = 'rgba(255,230,180,.8)'; g.font = '700 34px "Libre Franklin", Arial'; g.fillText(sub, 512, 212);
  }
  const marqueeTex = canvasTex(1024, 256, g => drawMarquee(g, POKER ? '♠  ♥  COLLECTOR DECKS  ♦  ♣' : FIGURE ? '♪  VIRTUAL SINGERS · PRIZE FIGURES  ♪' : '♠  ♥  ODDS LOUNGE  ♦  ♣'));
  const marquee = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.05), [blackGloss, blackGloss, blackGloss, blackGloss, new THREE.MeshBasicMaterial({ map: marqueeTex, toneMapped: false }), blackGloss]);
  marquee.position.set(0, 0.67, ZF - 0.01); scene.add(marquee);
  // ---------- figure machine: display shelves, posters, and colours that follow the chosen figure ----------
  let applyTheme = () => {};
  if (FIGURE) {
    const ids = Object.keys(FIGS), shelfM = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, roughness: 0.05, clearcoat: 1, depthWrite: false });
    // two corner towers of glass shelves on the back wall, three figures each
    [-1, 1].forEach((sx, col) => {
      const cx = sx * 0.2, cz = ZB + 0.035;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.33, 0.004), new THREE.MeshStandardMaterial({ color: '#140a24', roughness: 0.7 })); frame.position.set(cx, 0.355, ZB + 0.004); scene.add(frame);
      [0.215, 0.32, 0.425].forEach((y, row) => {
        const sh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.005, 0.06), shelfM); sh.position.set(cx, y, cz); scene.add(sh);
        const lip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.004, 0.003), gold); lip.position.set(cx, y + 0.002, cz + 0.03); scene.add(lip);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.002, 0.004), ledM); strip.position.set(cx, y - 0.004, cz + 0.026); scene.add(strip);
        const fig = buildFigure(ids[col * 3 + row]); fig.scale.setScalar(0.95); fig.position.set(cx, y + 0.0025, cz); fig.rotation.y = -sx * 0.35; scene.add(fig);
      });
    });
    // posters: the chosen figure rendered from our own model onto a printed background
    const rt = new THREE.WebGLRenderTarget(512, 768, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const pScene = new THREE.Scene(); pScene.add(new THREE.HemisphereLight('#ffffff', '#806070', 1.6)); const pKey = new THREE.DirectionalLight('#ffffff', 2.4); pKey.position.set(0.4, 0.8, 1); pScene.add(pKey);
    const pCam = new THREE.PerspectiveCamera(24, 512 / 768, 0.01, 5); pCam.position.set(0.05, 0.07, 0.32); pCam.lookAt(0, 0.048, 0);
    let pFig = null;
    const posterBg = canvasTex(512, 768, () => {});
    const posterMats = [new THREE.MeshStandardMaterial({ map: posterBg, roughness: 0.6 }), new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, toneMapped: true })];
    const makePoster = (w, h, x, y, z, ry = 0) => {
      const g2 = new THREE.Group(); g2.position.set(x, y, z); g2.rotation.y = ry; scene.add(g2);
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, h), posterMats[0]); g2.add(bg);
      const fg = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.92), posterMats[1]); fg.position.set(0, -h * 0.02, 0.0008); g2.add(fg);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, h + 0.01, 0.003), gold); fr.position.z = -0.002; g2.add(fr);
    };
    makePoster(0.19, 0.285, 0, 0.36, ZB + 0.005);             // the big one on the back wall, above the bridge
    makePoster(0.15, 0.225, 0.13, -0.24, 0.325);               // on the cabinet front, beside the prize door
    applyTheme = id => {
      const f = FIGS[id], zh = window.I18N && I18N.lang === 'zh';
      // cabinet lacquer and lights take the character's colours
      lacquer.color.set(f.bg[1]).multiplyScalar(0.42); const hc = new THREE.Color(f.hair); ledBase.setRGB(hc.r * 1.5 + 0.2, hc.g * 1.5 + 0.2, hc.b * 1.5 + 0.2);
      const mg = marqueeTex.image.getContext('2d'); drawMarquee(mg, `♪  ${f.name.toUpperCase()} FAIR  ♪`); marqueeTex.needsUpdate = true;
      // the poster background
      const g = posterBg.image.getContext('2d'), W = 512, H = 768;
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, f.bg[0]); gr.addColorStop(1, f.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.25; for (let i = 0; i < 14; i++) { g.fillStyle = '#fff'; g.beginPath(); g.arc(256, 330, 60 + i * 34, 0, 7); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); } g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.font = '28px Georgia, serif'; g.fillText('♪', 256 + Math.cos(a) * 220 - 8, 330 + Math.sin(a) * 260); }
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '900 64px "Libre Franklin", Arial'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 12; g.fillText(f.jp, W / 2, 668); g.shadowBlur = 0;
      g.font = '700 26px "Libre Franklin", Arial'; g.fillText(`ODDS LOUNGE × ${f.name.toUpperCase()} FAIR`, W / 2, 712);
      g.font = '500 14px Arial'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText('© Crypton Future Media, INC. www.piapro.net · fan art (PCL)', W / 2, 748);
      g.font = '700 30px "Libre Franklin", Arial'; g.fillStyle = '#fff'; g.fillText(zh ? '限定手办 登场！' : 'PRIZE FIGURE ON STAGE', W / 2, 60);
      posterBg.needsUpdate = true;
      // render the figure into the poster
      if (pFig) pScene.remove(pFig); pFig = buildFigure(id); pFig.rotation.y = -0.35; pScene.add(pFig);
      const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(pScene, pCam); renderer.setRenderTarget(null); renderer.setClearColor(cc, ca);
    };
  }
  const mframe = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.04), gold); mframe.position.set(0, 0.67, ZF - 0.025); scene.add(mframe);
  const bulbs = []; for (let i = 0; i < 26; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff' })); const u = i / 26; const per = 2 * (0.7 + 0.16); let d = u * per, x, y; if (d < 0.7) { x = -0.35 + d; y = 0.75; } else if ((d -= 0.7) < 0.16) { x = 0.35; y = 0.75 - d; } else if ((d -= 0.16) < 0.7) { x = 0.35 - d; y = 0.59; } else { d -= 0.7; x = -0.35; y = 0.59 + d; } b.position.set(x, y, ZF + 0.018); scene.add(b); bulbs.push(b); }
  // control deck
  const deck = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.03, 0.16, 3, 0.01), blackGloss); deck.position.set(0, -0.04, ZF + 0.09); deck.rotation.x = 0.22; scene.add(deck);
  const stick = new THREE.Group(); stick.position.set(0.14, -0.02, ZF + 0.09); scene.add(stick);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 12), chrome); shaft.position.y = 0.025; stick.add(shaft);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.016, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#d9102e', roughness: 0.15, clearcoat: 1 })); ball.position.y = 0.052; stick.add(ball);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.012, 32), new THREE.MeshPhysicalMaterial({ color: '#f2c14e', roughness: 0.2, clearcoat: 1, emissive: '#7a4a10', emissiveIntensity: 0.4 })); btn.position.set(0.25, -0.022, ZF + 0.1); scene.add(btn);
  const slotPlate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.008), chrome); slotPlate.position.set(0.25, -0.18, ZF + 0.098); scene.add(slotPlate);
  // prize door (front, under the chute)
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.01), new THREE.MeshStandardMaterial({ color: '#050203' })); door.position.set(-0.16, -0.24, ZF + 0.105); scene.add(door);
  const doorFrame = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 8, 4, Math.PI * 2), gold); doorFrame.rotation.z = Math.PI / 4; doorFrame.scale.set(1.08, 0.82, 1); doorFrame.position.set(-0.16, -0.24, ZF + 0.11); scene.add(doorFrame);
  // gantry: rails, bridge, carriage, cable and the claw head with prongs (drawn from the physics)
  const brass = new THREE.MeshStandardMaterial({ color: '#c99a4a', metalness: 1, roughness: 0.3 });
  [-1, 1].forEach(sx => { const r = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, ZF - ZB), brass); r.position.set(sx * (X - 0.01), TOP + 0.02, (ZF + ZB) / 2); scene.add(r); });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(X * 2, 0.014, 0.024), brass); scene.add(bridge);
  const carM = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.03, 0.05, 2, 0.006), lacquer); scene.add(carM);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 1, 6), new THREE.MeshStandardMaterial({ color: '#2a2a2a', metalness: 0.6, roughness: 0.4 })); scene.add(cable);
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.5), transparent: true, opacity: 0.7, depthTest: false, toneMapped: false }));
  aimRing.rotation.x = -Math.PI / 2; aimRing.renderOrder = 5; scene.add(aimRing);
  const headM = new THREE.Group(); scene.add(headM);
  const rubber = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.85 });
  if (CLAW === 'two') {
    // box head with a motor housing on top and the two arm pivots at its ends
    // a wide UFO-catcher head: a long body the arms hang from at its ends, a domed motor cover and side plates
    const HW = FING.r * 2 + 0.024;
    const hb = new THREE.Mesh(new RoundedBoxGeometry(HW, HEAD.h * 0.8, 0.05, 3, 0.008), chrome); hb.castShadow = true; headM.add(hb);
    const domeT = new THREE.Mesh(new THREE.SphereGeometry(0.028, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold); domeT.scale.set(1.3, 0.8, 0.9); domeT.position.y = HEAD.h * 0.4; headM.add(domeT);
    const band = new THREE.Mesh(new THREE.BoxGeometry(HW + 0.002, 0.006, 0.052), gold); band.position.y = -HEAD.h * 0.4 + 0.004; headM.add(band);
    [-1, 1].forEach(sx => { const pl = new THREE.Mesh(new RoundedBoxGeometry(0.02, HEAD.h * 0.9, 0.056, 2, 0.004), gold); pl.position.set(sx * (FING.r + 0.004), -0.004, 0); headM.add(pl); });
  } else {
    // round head: a domed cap, a spring housing and a rim the three prongs hang from
    const hm = new THREE.Mesh(new THREE.CylinderGeometry(HEAD.r * 0.8, HEAD.r, HEAD.h * 0.7, 28), chrome); hm.position.y = -HEAD.h * 0.15; hm.castShadow = true; headM.add(hm);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(HEAD.r * 0.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.position.y = HEAD.h * 0.2; headM.add(dome);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(HEAD.r * 0.55, 0.0025, 6, 20), chrome); coil.rotation.x = Math.PI / 2; coil.position.y = HEAD.h * 0.42; headM.add(coil);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(HEAD.r, 0.0035, 8, 32), gold); rim.rotation.x = Math.PI / 2; rim.position.y = -HEAD.h / 2 + 0.003; headM.add(rim);
  }
  const fingerMeshes = fingers.map(() => {
    const g = new THREE.Group();
    if (CLAW === 'two') {
      for (let k = 1; k < ARM.length; k++) {
        const [x0, y0] = ARM[k - 1], [x1, y1] = ARM[k], len = Math.hypot(x1 - x0, y1 - y0);
        const seg = new THREE.Mesh(new RoundedBoxGeometry(0.009, len + 0.006, 0.026, 2, 0.003), chrome); seg.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); seg.rotation.z = -Math.atan2(x1 - x0, y1 - y0); seg.castShadow = true; g.add(seg);
      }
      const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.03, 14), gold); elbow.rotation.x = Math.PI / 2; elbow.position.set(ARM[1][0], ARM[1][1], 0); g.add(elbow);
      const pad = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.01, 0.028, 2, 0.003), rubber); pad.position.set(ARM[2][0] + 0.006, ARM[2][1] + 0.002, 0); g.add(pad);
      const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.034, 14), gold); pivot.rotation.x = Math.PI / 2; pivot.position.y = FING.len / 2; g.add(pivot);
    } else {
      const curve = new THREE.CatmullRomCurve3(PRONG.map(([x, y]) => new THREE.Vector3(x, y, 0)));
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.0032, 8), chrome); wire.castShadow = true; g.add(wire);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 12, 10), rubber); tip.position.set(PRONG[4][0], PRONG[4][1], 0); g.add(tip);
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 12), gold); hinge.rotation.x = Math.PI / 2; hinge.position.y = PRONG[0][1]; g.add(hinge);
    }
    scene.add(g); return g;
  });
  // the room: dark lounge with soft bokeh lights
  const room = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), new THREE.MeshStandardMaterial({ color: '#12060a', side: THREE.BackSide })); room.position.y = 1.5; scene.add(room);
  const bokehTex = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  for (let i = 0; i < 40; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bokehTex, color: new THREE.Color().setHSL(Math.random() < 0.6 ? 0.1 : 0.95, 0.8, 0.5 + Math.random() * 0.2), transparent: true, opacity: 0.35, depthWrite: false })); sp.position.set((Math.random() - 0.5) * 6, -0.5 + Math.random() * 2.5, -1.5 - Math.random() * 2); sp.scale.setScalar(0.1 + Math.random() * 0.25); scene.add(sp); }

  // ---------- sound ----------
  let actx = null;
  const audio = () => { if (!UI.soundOn()) return null; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { return null; } return actx; };
  function tone(f, d = 0.12, v = 0.05, type = 'sine', slide = 0) { const a = audio(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.02); }
  let motorO = null;
  function motor(on) { const a = audio(); if (!a) return; if (on && !motorO) { const o = a.createOscillator(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = 70; g.gain.value = 0.012; o.connect(g).connect(a.destination); o.start(); motorO = { o, g }; } else if (!on && motorO) { motorO.o.stop(); motorO = null; } }
  const fanfare = () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.08, 'triangle'), i * 90));
  function voice(en, zh) { try { if (!UI.soundOn() || !window.speechSynthesis) return; const z = window.I18N && I18N.lang === 'zh', u = new SpeechSynthesisUtterance(z ? zh : en); u.lang = z ? 'zh-CN' : 'en-US'; u.rate = 1.05; u.pitch = 1.2; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* none */ } }

  // ---------- the game ----------
  // states: idle (insert to play) → aim (move, timer) → lower → close → raise → carry → release → home
  const G = { state: 'idle', t: 0, timer: 0, rope: ROPE_MIN, cx: START.x, cz: START.z, vx: 0, vz: 0, grip: 0, hold: 0, strong: false, sim: false };
  // Payout control, the way real prize machines do it: every play puts 90% of its cost into a "bank", every prize
  // won takes its value out, and the claw only keeps a strong grip all the way to the chute when the bank can pay
  // for a prize (plus a small random chance). On the other plays it relaxes at the top (LOOSE angle, WEAK torque)
  // and the prize usually slips. So over many plays about 90% of what goes in comes back out, however well you aim.
  // GRIP: the closing torque cap in N·m. P_STRONG: forces the share of strong plays (testing only; null = bank).
  // Even a strong play isn't a sure thing: SLIP is the chance it eases to MID strength at the top, and the swing on
  // the way to the chute can still shake a prize loose. COMBO: bonus for each extra prize dropped in the same play.
  const TUNE = { TARGET: 0.9, STRONG_AT: 50, LUCKY: 0.06, BANK_MAX: 300, GRIP: 0.1, WEAK: 0.15, LOOSE: 0.3, SLIP: 0.3, MID: 0.4, COMBO: 50, P_STRONG: null };
  let superClaw = false;   // the owner's super claw (see the code box below): full grip all the way, outside the payout bank
  let bank = (() => { try { return +localStorage.getItem('ol-claw-bank' + SUFFIX) || 0; } catch (e) { return 0; } })();
  const saveBank = () => { if (!G.sim) try { localStorage.setItem('ol-claw-bank' + SUFFIX, String(Math.round(bank))); } catch (e) { /* ignore */ } };
  function newPlay() {
    if (!superClaw) bank = Math.min(TUNE.BANK_MAX, bank + COST * TUNE.TARGET);
    G.strong = TUNE.P_STRONG != null ? Math.random() < TUNE.P_STRONG : (bank >= TUNE.STRONG_AT || Math.random() < TUNE.LUCKY);
    G.grip = TUNE.GRIP * (0.85 + Math.random() * 0.3);   // this play's motor strength
    if (FIGURE) G.grip *= G.strong ? 0.45 : 0.18;   // figure arms are weak: they tip and shift a box, they can't carry it away
    if (superClaw) { G.strong = true; G.grip = TUNE.GRIP * 4; }
    G.playWins = 0;
    G.state = 'aim'; G.timer = 30; saveBank();
  }
  const input = { x: 0, z: 0 };
  const HOME = START;   // where prizes are let go: over the chute
  let pending = 0, wonTotal = 0, plays = 0;
  const flush = () => { if (pending) { UI.wallet.add(pending); pending = 0; } };
  setInterval(flush, 1500); window.addEventListener('pagehide', flush);
  function insert() {
    if (G.state !== 'idle') return;
    if (UI.wallet.chips + pending < COST) { say(tr('Not enough chips. Claim your daily chips at the top.')); return; }
    pending -= COST; plays++;
    newPlay();
    tone(1400, 0.08); tone(1800, 0.1); say(tr('Move the claw, then press Drop')); paint();
    G.got = false; window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'claw-play' } }));
  }
  function dropClaw() { if (G.state !== 'aim') return; G.state = 'lower'; G.t = 0; G.slackT = 0; motor(true); paint(); if (!G.sim) say(tr('Here goes…')); }
  function step(dt) {
    // carriage: eases toward the stick direction (during aim) or a target (carry / home)
    let tx = null, tz = null;
    if (G.state === 'aim') { const sp = 0.22; G.vx += ((input.x * sp) - G.vx) * Math.min(1, dt * 6); G.vz += ((input.z * sp) - G.vz) * Math.min(1, dt * 6); }
    else if (G.state === 'carry' || G.state === 'home') { const T = G.state === 'carry' ? HOME : START; tx = T.x; tz = T.z; const dx = T.x - G.cx, dz = T.z - G.cz, d = Math.hypot(dx, dz), sp = Math.min(0.2, d * 3); G.vx += ((d > 1e-4 ? dx / d * sp : 0) - G.vx) * Math.min(1, dt * 5); G.vz += ((d > 1e-4 ? dz / d * sp : 0) - G.vz) * Math.min(1, dt * 5); }
    else { G.vx *= Math.max(0, 1 - dt * 8); G.vz *= Math.max(0, 1 - dt * 8); }
    G.cx = Math.max(-X + 0.04, Math.min(X - 0.04, G.cx + G.vx * dt)); G.cz = Math.max(ZB + 0.04, Math.min(ZF - 0.04, G.cz + G.vz * dt));
    carriage.setNextKinematicTranslation({ x: G.cx, y: TOP, z: G.cz });
    // the cable: a stiff spring that only pulls (so the head swings like a pendulum)
    const a = { x: G.cx, y: TOP, z: G.cz }, h = headBody.translation(), v = headBody.linvel(), m = headBody.mass();
    const dx = h.x - a.x, dy = h.y - a.y, dz = h.z - a.z, dist = Math.hypot(dx, dy, dz) || 1e-6, ux = dx / dist, uy = dy / dist, uz = dz / dist;
    const stretch = dist - G.rope;
    if (stretch > 0) { const vr = v.x * ux + v.y * uy + v.z * uz, f = (-900 * stretch - 40 * vr) * m * dt; headBody.applyImpulse({ x: ux * f, y: uy * f, z: uz * f }, true); }
    // a little air drag on the swing
    headBody.applyImpulse({ x: -v.x * 1.6 * m * dt, y: 0, z: -v.z * 1.6 * m * dt }, true);
    G.t += dt;
    if (G.state === 'aim') { G.timer -= dt; if (G.timer <= 0) dropClaw(); }
    else if (G.state === 'lower') {
      // the cable keeps paying out after the claw touches the pile: the heavy head and its open prongs sink and dig
      // in under their own weight, pushing prizes aside, until the head has rested on the slack cable for a moment
      // (like a real machine's slack-cable switch) or the cable runs out. Then the prongs close.
      const slack = G.rope - dist;
      if (slack < 0.05) G.rope = Math.min(ROPE_MAX, G.rope + 0.2 * dt);
      G.slackT = slack > 0.015 ? (G.slackT || 0) + dt : 0;
      if (G.slackT > 0.6 || G.rope >= ROPE_MAX) { G.state = 'settle'; G.t = 0; G.slackT = 0; }
    } else if (G.state === 'settle') {
      if (G.t > 0.3) { G.state = 'close'; G.t = 0; setGrip(CLOSED, G.grip); tone(300, 0.15, 0.04, 'square'); }
    } else if (G.state === 'close') { if (G.t > 0.6) { G.state = 'raise'; G.t = 0; } }
    else if (G.state === 'raise') {
      G.rope = Math.max(ROPE_MIN, G.rope - 0.16 * dt);
      // at the top the grip relaxes on most plays: what's held loosely may slip on the way
      if (G.rope <= ROPE_MIN + 0.001) { if (FIGURE) { G.state = 'release'; G.t = 0; setGrip(OPEN, OPEN_T * 1.6); tone(500, 0.12, 0.04, 'square'); }   // bridge machines let go at the top: the box drops back, shifted
        else { if (!G.strong) setGrip(TUNE.LOOSE, G.grip * TUNE.WEAK); else if (!superClaw && Math.random() < TUNE.SLIP) setGrip(CLOSED, G.grip * TUNE.MID); G.state = 'carry'; G.t = 0; } }
    } else if (G.state === 'carry') { if (Math.hypot(HOME.x - G.cx, HOME.z - G.cz) < 0.006 && G.t > 0.5) { G.state = 'release'; G.t = 0; setGrip(OPEN, OPEN_T * 1.6); tone(500, 0.12, 0.04, 'square'); } }
    else if (G.state === 'release') { if (G.t > 1.0) { G.state = 'home'; G.t = 0; } }
    else if (G.state === 'home') { if (Math.hypot(START.x - G.cx, START.z - G.cz) < 0.006) { G.state = 'idle'; motor(false); setGrip(OPEN, OPEN_T); paint(); if (!G.sim) say(tr(G.got ? 'Press Play to go again' : 'So close! Press Play to try again')); } }
    world.step();
    void tx; void tz;
    // prizes that fall down the chute are won; anything that escapes is put back
    for (let i = prizes.length - 1; i >= 0; i--) {
      const p = prizes[i], t = p.body.translation();
      if (t.y < -0.08) {
        if (FIGURE || (t.x < CH.x1 + 0.02 && t.z > CH.z0 - 0.02)) win(p);
        world.removeRigidBody(p.body); scene.remove(p.obj); prizes.splice(i, 1);
        if (FIGURE) { placeBox(); continue; }
        // the same kind of prize is restocked from the top, so the mix in the machine stays the same
        const s = randomSpot(); spawnPrize(p.kind, s.x, 0.4, s.z);
      }
    }
  }
  const collection = (() => { try { return JSON.parse(localStorage.getItem('ol-claw-col' + SUFFIX) || '{}') || {}; } catch (e) { return {}; } })();
  function win(p) {
    // a second (third…) prize in the same play earns the combo bonus
    G.playWins = (G.playWins || 0) + 1;
    const bonus = G.playWins >= 2 && G.state !== 'idle' ? TUNE.COMBO : 0, v = p.value + bonus;
    if (!superClaw) { bank -= v; saveBank(); }
    if (G.sim) { G.simWon += v; G.simWins++; G.simKinds[p.kind] = (G.simKinds[p.kind] || 0) + 1; return; }
    pending += v; wonTotal += v; G.got = true;
    collection[p.kind] = (collection[p.kind] || 0) + 1; try { localStorage.setItem('ol-claw-col' + SUFFIX, JSON.stringify(collection)); } catch (e) { /* ignore */ }
    fanfare(); if (p.value < 150) voice(bonus ? 'Double!' : 'Got it!', bonus ? '一抓两个！' : '抓到啦！');
    showWin(p, bonus);
    window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'claw-win', kind: p.kind, value: p.value, drinks: ['rocks', 'highball', 'martini'].filter(k => collection[k]).length, decks: Object.keys(DECKS).filter(k => collection[k]).length, figs: Object.keys(FIGS).filter(k => collection['fig_' + k]).length, machine: MACHINE, combo: bonus > 0 } }));
    paint();
  }

  // ---------- screen: status, win card, controls ----------
  const msg = document.createElement('div'); msg.className = 'cl-msg'; msg.setAttribute('role', 'status'); host.appendChild(msg);
  const say = h => { msg.textContent = h; };
  const winCard = document.createElement('div'); winCard.className = 'cl-win'; winCard.hidden = true; host.appendChild(winCard);
  function showWin(p, bonus) {
    winCard.innerHTML = bonus ? `<small>${tr('Double grab!')}</small><b>${tr(p.name)}</b><em>+${p.value} +${bonus}</em>` : `<small>${tr('You won')}</small><b>${tr(p.name)}</b><em>+${p.value}</em>`;
    if (p.rarity) winCard.insertAdjacentHTML('afterbegin', `<span class="cl-rar r-${p.rarity.toLowerCase()}">${tr(p.rarity)}</span>`);
    winCard.classList.toggle('big', p.value >= 150 || !!bonus);
    winCard.hidden = false; winCard.classList.remove('go'); void winCard.offsetWidth; winCard.classList.add('go');
    clearTimeout(showWin.t); showWin.t = setTimeout(() => { winCard.hidden = true; }, 2600);
    if (p.value >= 150) { const leg = p.kind === 'golden' || p.kind === 'deck_holo'; voice(leg ? 'Legendary! Jackpot!' : 'Big prize!', leg ? '传说级！大奖！' : '大奖！'); bulbsHot = 4; }
  }
  function paint() {
    $('#clInsert').disabled = G.state !== 'idle';
    $('#clDrop').disabled = G.state !== 'aim';
    $('#clInsert').innerHTML = `${tr('Play')} <b>${COST}</b>`;
    $('#clInfo').innerHTML = `${superClaw ? `<span class="cl-sup">${tr('SUPER')}</span> ` : ''}${tr('Plays')} <b>${plays}</b> · ${tr('Won')} <b>${wonTotal}</b>`;
    document.body.classList.toggle('cl-aiming', G.state === 'aim');
  }
  $('#clInsert').onclick = () => { audio(); insert(); };
  $('#clDrop').onclick = () => { audio(); dropClaw(); };
  $('#clCol').onclick = () => {
    let d = document.getElementById('clColDlg'); if (!d) { d = document.createElement('dialog'); d.id = 'clColDlg'; d.className = 'rules'; document.body.appendChild(d); }
    if (FIGURE) {
      const keys = Object.keys(KINDS), have = keys.filter(k => collection[k]).length;
      const cards = keys.map(k => { if (!boxArt[k]) boxArt[k] = buildBox(k.slice(4), BOX).artCanvas; const zh = window.I18N && I18N.lang === 'zh'; return `<figure class="cl-deck cl-figbox${collection[k] ? '' : ' no'}"><img src="${boxArt[k].toDataURL()}" alt=""><figcaption><b>${zh ? FIGS[k.slice(4)].zh : FIGS[k.slice(4)].name}</b><small>${tr('worth')} ${KINDS[k].value} · × ${collection[k] || 0}</small></figcaption></figure>`; }).join('');
      d.innerHTML = `<h2>${tr('Figure collection')}</h2><p class="sub">${tr('Collected')} <b>${have}</b> / ${keys.length}. ${tr('Tip the box so it slips between the two bars. Hook one end with an arm rather than grabbing the middle.')}</p><div class="cl-book">${cards}</div><p class="sub" translate="no">${window.I18N && I18N.lang === 'zh' ? FIG_CREDIT_ZH : FIG_CREDIT}</p><div class="rule-actions"><button type="button" class="primary" data-close>${tr('Done')}</button></div>`;
    } else if (POKER) {
      // the collection book: every design, greyed out until you've won one
      const keys = Object.keys(DECKS), have = keys.filter(k => collection[k]).length;
      const cards = keys.map(k => { pokerDeck(k); const v = DECKS[k]; return `<figure class="cl-deck${collection[k] ? '' : ' no'}"><img src="${deckArt[k].toDataURL()}" alt=""><figcaption><b>${tr(v.name)}</b><span class="r-${v.rarity.toLowerCase()}">${tr(v.rarity)}</span><small>${tr('worth')} ${v.value} · × ${collection[k] || 0}</small></figcaption></figure>`; }).join('');
      d.innerHTML = `<h2>${tr('Deck collection')}</h2><p class="sub">${tr('Collected')} <b>${have}</b> / ${keys.length}. ${tr('Collect all ten designs for the Full Set badge.')}</p><div class="cl-book">${cards}</div><p class="sub">${tr('Loose cards are worth 5. Drop two prizes in one play for a +50 combo bonus.')}</p><div class="rule-actions"><button type="button" class="primary" data-close>${tr('Done')}</button></div>`;
    } else {
      d.innerHTML = `<h2>${tr('Prize collection')}</h2><p class="sub">${tr('Everything you have won from the claw machine.')}</p><p class="sub">${tr('Drop two prizes in one play for a +50 combo bonus. The golden lucky chip is the jackpot.')}</p><table class="pay-t">${Object.entries(KINDS).map(([k, v]) => `<tr><td>${tr(v.name)}</td><td>${tr('worth')} ${v.value}</td><td><b>× ${collection[k] || 0}</b></td></tr>`).join('')}</table><div class="rule-actions"><button type="button" class="primary" data-close>${tr('Done')}</button></div>`;
    }
    d.onclick = e => { if (e.target.closest('[data-close]')) d.close(); }; d.showModal();
  };
  // ---------- the owner's code: long-press or double-click the plays/won pill to open a hidden box; the right code
  // turns on the super claw for this visit. Only a SHA-256 hash of the code is in the site (the same owner code as
  // the coin pusher, OL_CONFIG.pusherCodeHash), never the code itself.
  const codeHash = ((window.OL_CONFIG || {}).pusherCodeHash || '').trim().toLowerCase();
  let codeTries = 0, codeLockUntil = 0, pressT = 0;
  const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('');
  function openCodeBox() {
    if (superClaw) { setSuper(false); return; }
    let d = document.getElementById('clCode'); if (!d) { d = document.createElement('dialog'); d.id = 'clCode'; d.className = 'rules'; document.body.appendChild(d); }
    d.innerHTML = `<h2>${tr('Enter code')}</h2><form method="dialog" class="pz-codeform"><input type="password" id="clCodeIn" autocomplete="off" aria-label="${tr('Code')}"><p class="sub" id="clCodeMsg" role="status"></p><div class="rule-actions"><button type="button" class="ghostbtn" data-close>${tr('Cancel')}</button><button type="submit" class="primary">${tr('OK')}</button></div></form>`;
    const msgEl = d.querySelector('#clCodeMsg'), input = d.querySelector('#clCodeIn');
    d.querySelector('[data-close]').onclick = () => d.close();
    d.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      if (!codeHash) { msgEl.textContent = tr('No code has been set up for this machine yet.'); return; }
      if (Date.now() < codeLockUntil) { msgEl.textContent = tr('Too many tries. Wait a minute.'); return; }
      if ((await sha256(input.value.trim())) !== codeHash) { codeTries++; if (codeTries >= 5) { codeTries = 0; codeLockUntil = Date.now() + 60000; } msgEl.textContent = tr('That code is not right.'); input.select(); return; }
      d.close(); setSuper(true);
    };
    d.showModal(); setTimeout(() => input.focus(), 50);
  }
  function setSuper(on) {
    superClaw = on; document.body.classList.toggle('cl-super', on);
    if (on) { if (G.state === 'aim') { G.strong = true; G.grip = TUNE.GRIP * 4; } say(tr('SUPER CLAW ON')); voice('Super claw!', '超级强力爪！'); fanfare(); bulbsHot = 3; }
    else say(tr('Super claw off'));
    paint();
  }
  const infoEl = $('#clInfo');
  infoEl.addEventListener('dblclick', openCodeBox);
  infoEl.addEventListener('pointerdown', () => { clearTimeout(pressT); pressT = setTimeout(openCodeBox, 900); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => infoEl.addEventListener(ev, () => clearTimeout(pressT)));
  const cBtn = $('#clClaw');
  if (cBtn) { cBtn.textContent = tr(CLAW === 'two' ? 'Claw: 2 arms' : 'Claw: 3 prongs'); cBtn.onclick = () => { if (!['idle', 'aim'].includes(G.state) || G.state === 'aim') { say(tr('Change the claw between plays')); return; } try { localStorage.setItem('ol-claw-type', CLAW === 'two' ? 'three' : 'two'); } catch (e) { /* ignore */ } flush(); location.reload(); }; }
  const mBtn = $('#clMachine');
  const NEXT_M = { casino: 'poker', poker: 'figure', figure: 'casino' }, M_NAME = { casino: 'Casino machine', poker: 'Poker machine', figure: 'Figure machine' };
  if (mBtn) { mBtn.textContent = tr(M_NAME[NEXT_M[MACHINE]]); mBtn.onclick = () => { const n = NEXT_M[MACHINE]; try { localStorage.setItem('ol-claw-m', n); } catch (e) { /* ignore */ } flush(); location.href = location.pathname + '?m=' + n; }; }
  // figure machine: pick which figure sits on the bridge, or ask the attendant to set the box straight again
  const fBtn = $('#clFig'), rBtn = $('#clReset'), cBtn2 = $('#clClaw');
  if (fBtn) fBtn.hidden = !FIGURE; if (rBtn) rBtn.hidden = !FIGURE; if (cBtn2 && FIGURE) cBtn2.hidden = true;
  const paintFig = () => { if (fBtn) fBtn.textContent = (window.I18N && I18N.lang === 'zh' ? FIGS[figPick].zh : FIGS[figPick].name) + ' ▸'; };
  if (FIGURE) {
    paintFig(); applyTheme(figPick);
    fBtn.onclick = () => { if (G.state !== 'idle') { say(tr('Change the figure between plays')); return; } const ids = Object.keys(FIGS); figPick = ids[(ids.indexOf(figPick) + 1) % ids.length]; try { localStorage.setItem('ol-claw-fig', figPick); } catch (e) { /* ignore */ } placeBox(); paintFig(); applyTheme(figPick); };
    rBtn.onclick = () => { if (G.state !== 'idle') { say(tr('The attendant can reset the box between plays')); return; } placeBox(); say(tr('The attendant set the box back on the bridge')); };
    const credit = document.createElement('p'); credit.className = 'cl-credit'; credit.translate = false; credit.textContent = window.I18N && I18N.lang === 'zh' ? FIG_CREDIT_ZH : FIG_CREDIT; host.appendChild(credit);
  }
  // joystick: drag inside the pad; or arrow keys / WASD
  const pad = $('#clPad'), knob = $('#clKnob');
  let padId = null;
  const padMove = e => { const r = pad.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } input.x = dx; input.z = dy; knob.style.transform = `translate(${dx * 28}px, ${dy * 28}px)`; };
  pad.addEventListener('pointerdown', e => { padId = e.pointerId; pad.setPointerCapture(e.pointerId); audio(); padMove(e); });
  pad.addEventListener('pointermove', e => { if (padId === e.pointerId) padMove(e); });
  const padEnd = () => { padId = null; input.x = 0; input.z = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);
  const keys = new Set();
  const keyInput = () => { input.x = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0); input.z = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0); };
  document.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) { keys.add(e.code); keyInput(); e.preventDefault(); }
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); audio(); if (G.state === 'idle') insert(); else dropClaw(); }
  });
  document.addEventListener('keyup', e => { keys.delete(e.code); keyInput(); });

  // ---------- camera and rendering ----------
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.15, 0.25, 1.15); composer.addPass(bloom); composer.addPass(new OutputPass());
  const look = new THREE.Vector3(0, 0.18, 0);
  // drag to look around the machine (pinch or scroll to zoom); the View button steps through set angles
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08; controls.rotateSpeed = 0.6;
  controls.minPolarAngle = 0.1; controls.maxPolarAngle = 1.62;   // all the way round; just not under the floor
  controls.target = look;
  const VIEWS = [{ az: 0, el: 0.16 }, { az: -0.85, el: 0.3 }, { az: 0, el: 1.25 }, { az: 0.85, el: 0.3 }];   // front, left, top, right
  let view = 0, homeDist = 1, viewAnim = null;
  const viewPos = (v, d) => new THREE.Vector3(Math.sin(v.az) * Math.cos(Math.atan(v.el)) , Math.sin(Math.atan(v.el)), Math.cos(v.az) * Math.cos(Math.atan(v.el))).multiplyScalar(d).add(look);
  function goView(i, instant) { view = i; const to = viewPos(VIEWS[i], homeDist * (i === 2 ? 0.95 : 1)); if (instant) { camera.position.copy(to); viewAnim = null; } else viewAnim = { from: camera.position.clone(), to, t: 0 }; }
  function animView() { if (!viewAnim) return; viewAnim.t = Math.min(1, viewAnim.t + 0.04); const k = 1 - Math.pow(1 - viewAnim.t, 3); camera.position.lerpVectors(viewAnim.from, viewAnim.to, k); if (viewAnim.t >= 1) viewAnim = null; }
  controls.addEventListener('start', () => { viewAnim = null; });
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h;
    // fit the whole cabinet (marquee to control deck) above the button bar, on any screen shape
    const tall = w / h < 1; camera.fov = tall ? 50 : 38; camera.updateProjectionMatrix();
    const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const bar = Math.min(0.3, (tall ? 190 : 100) / h), top = 56 / h;
    const W = 0.8, H = 0.92, CY = 0.32;
    const dist = Math.max(W / 2 / Math.tan(hf / 2), H / 2 / Math.tan(vf / 2) / (1 - bar - top));
    const half = dist * Math.tan(vf / 2);
    look.set(0, CY - (bar - top) * half, 0);
    homeDist = Math.hypot(dist, dist * 0.16);
    controls.minDistance = homeDist * 0.35; controls.maxDistance = homeDist * 1.5;
    // first time: the front view; after that keep whatever angle you turned it to
    if (!resize.done) { resize.done = true; goView(0, true); }
    else { const dir = camera.position.clone().sub(look).normalize(); camera.position.copy(look).addScaledVector(dir, Math.min(controls.maxDistance, Math.max(controls.minDistance, homeDist))); }
  }
  const viewBtn = $('#clView');
  if (viewBtn) viewBtn.onclick = () => goView(0);   // back to the front
  new ResizeObserver(resize).observe(host); resize();
  onQuality(q => { const hi = q === 'high'; renderer.setPixelRatio(hi ? Math.min(2, devicePixelRatio || 1) : 1); bloom.enabled = hi; renderer.shadowMap.enabled = hi; key.castShadow = hi; });
  const m4q = new THREE.Quaternion(); let bulbsHot = 0;
  function draw(t) {
    const hp = headBody.translation();
    bridge.position.set(0, TOP + 0.016, G.cz); carM.position.set(G.cx, TOP + 0.03, G.cz);
    headM.position.set(hp.x, hp.y, hp.z);
    cable.position.set((hp.x + G.cx) / 2, (hp.y + TOP) / 2 + HEAD.h / 4, (hp.z + G.cz) / 2);
    const dl = new THREE.Vector3(hp.x - G.cx, hp.y + HEAD.h / 2 - TOP, hp.z - G.cz); cable.scale.y = Math.max(0.001, dl.length()); cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dl.normalize().multiplyScalar(-1));
    fingers.forEach((f, i) => { const p = f.body.translation(), q = f.body.rotation(); fingerMeshes[i].position.set(p.x, p.y, p.z); fingerMeshes[i].quaternion.copy(m4q.set(q.x, q.y, q.z, q.w)); });
    for (const p of prizes) { const tt = p.body.translation(), q = p.body.rotation(); p.obj.position.set(tt.x, tt.y, tt.z); p.obj.quaternion.set(q.x, q.y, q.z, q.w); }
    aimRing.visible = G.state === 'aim'; aimRing.position.set(G.cx, FIGURE ? BR.y + BR.r + BOX[1] + 0.004 : 0.003, G.cz); aimRing.material.opacity = 0.45 + Math.sin(t * 6) * 0.2;
    stick.rotation.set(input.z * 0.35, 0, -input.x * 0.35);
    if (bulbsHot > 0) bulbsHot -= 1 / 60;
    if (deckMatCache.deck_holo) { deckMatCache.deck_holo.face.emissiveIntensity = 0.4 + Math.max(0, Math.sin(t * 2.4)) * 0.6; deckMatCache.deck_holo.face.iridescenceIOR = 1.3 + Math.sin(t) * 0.2; }
    goldChipM.forEach(m => { m.emissiveIntensity = 0.3 + Math.max(0, Math.sin(t * 2.2)) * 0.5; });
    bulbs.forEach((b, i) => { const on = bulbsHot > 0 ? (i + Math.floor(t * 30)) % 2 === 0 : G.state === 'idle' ? (i + Math.floor(t * 5)) % 3 === 0 : (i + Math.floor(t * 12)) % 2 === 0; b.material.color.setRGB(on ? 1.5 : 0.4, on ? 1.1 : 0.28, on ? 0.45 : 0.1); });
    chrome.emissive.setRGB(superClaw ? 0.55 + Math.sin(t * 6) * 0.25 : 0, superClaw ? 0.35 + Math.sin(t * 6) * 0.15 : 0, 0);
    ledM.color.setRGB(ledBase.r + Math.sin(t * 3) * 0.2, ledBase.g, ledBase.b);
    animView(); controls.update();
  }
  const clock = new THREE.Clock(); let acc = 0, t = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta()); t += dt; acc += dt;
    let n = 0; while (acc >= world.timestep && n < 8) { step(world.timestep); acc -= world.timestep; n++; } if (n === 8) acc = 0;
    if (G.state === 'aim') { const s = Math.ceil(G.timer); $('#clTimer').textContent = s; $('#clTimer').classList.toggle('low', s <= 5); }
    draw(t); composer.render();
  });
  document.documentElement.classList.remove('t3d-wait');
  say(tr('Press Play to start')); paint();

  // for testing: an automatic player that aims at a random prize; returns cost and winnings
  window.OL_CLAW = {
    sim(n = 20, noise = 0.02) {
      const bank0 = bank; G.sim = true; G.simWon = 0; G.simWins = 0; G.simKinds = {}; const tries = {}; let cost = 0;
      for (let k = 0; k < n; k++) {
        cost += COST; newPlay();
        const tgt = prizes.filter(p => { const t2 = p.body.translation(); return p.kind !== 'chip' && p.kind !== 'card' && !(t2.x < CH.x1 + 0.03 && t2.z > CH.z0 - 0.03) && true; }).sort((a, b) => b.body.translation().y - a.body.translation().y).slice(0, 14);
        const p = tgt[Math.floor(Math.random() * tgt.length)]; if (!p) continue; tries[p.kind] = (tries[p.kind] || 0) + 1;
        const ox = (Math.random() - 0.5) * noise, oz = (Math.random() - 0.5) * noise;
        let guard = 0;
        while (G.state === 'aim' && guard++ < 6000) {
          const pt = p.body.translation(), dx = pt.x + ox - G.cx, dz = pt.z + oz - G.cz, d = Math.hypot(dx, dz);
          input.x = d > 0.006 ? dx / d * Math.min(1, d * 20) : 0; input.z = d > 0.006 ? dz / d * Math.min(1, d * 20) : 0;
          if (d < 0.008 && Math.hypot(G.vx, G.vz) < 0.01) { input.x = 0; input.z = 0; for (let w = 0; w < 120; w++) step(world.timestep); dropClaw(); }
          step(world.timestep);
        }
        guard = 0; while (G.state !== 'idle' && guard++ < 20000) step(world.timestep);
      }
      input.x = 0; input.z = 0; G.sim = false; motor(false); const simBank = bank; bank = bank0;
      return { plays: n, cost, won: G.simWon, wins: G.simWins, rtp: +(G.simWon / cost).toFixed(3), tries, got: G.simKinds, bank: Math.round(simBank) };
    },
    state: () => ({ ...G, prizes: prizes.length }),
    head: () => { const h = headBody.translation(); return [+h.x.toFixed(3), +h.y.toFixed(3), +h.z.toFixed(3)]; },
    play: (x, z) => { G.sim = true; G.simWon = 0; G.simWins = 0; G.simKinds = {}; newPlay(); for (let i = 0; i < 4000; i++) { const dx = x - G.cx, dz = z - G.cz, d = Math.hypot(dx, dz); input.x = d > 0.003 ? dx / d * Math.min(1, d * 15) : 0; input.z = d > 0.003 ? dz / d * Math.min(1, d * 15) : 0; step(world.timestep); if (d < 0.003 && Math.hypot(G.vx, G.vz) < 0.005) break; } input.x = input.z = 0; for (let i = 0; i < 360; i++) step(world.timestep); dropClaw(); let g = 0; const tr2 = {}; while (G.state !== 'idle' && g++ < 6000) { step(world.timestep); if (!tr2[G.state]) tr2[G.state] = { head: OL_CLAW.head(), f: OL_CLAW.fingers(), box: prizes[0] && [+prizes[0].body.translation().y.toFixed(3)] }; if (prizes[0]) tr2.maxBoxY = Math.max(tr2.maxBoxY || 0, prizes[0].body.translation().y); if (G.state === 'lower' && g % 30 === 0) (tr2.trace = tr2.trace || []).push([+G.rope.toFixed(3), OL_CLAW.head()[1], OL_CLAW.fingers().map(q => q[0])]); } tr2.list = OL_CLAW.list(); tr2.won = G.simWins; G.sim = false; return tr2; },
    step: n => { for (let i = 0; i < n; i++) step(world.timestep); },
    grip: (a, k) => setGrip(a, k),
    tune: o => Object.assign(TUNE, o),
    bank: v => (v != null ? (bank = v) : bank),
    jt: () => fingers.map(f => f.joint.type()),
    fingers: () => fingers.map(f => { const p = f.body.translation(), h = headBody.translation(); const r = Math.hypot(p.x - h.x, p.z - h.z); return [+r.toFixed(3), +(p.y - h.y).toFixed(3)]; }),
    list: () => prizes.map(p => { const t2 = p.body.translation(); return [p.kind, +t2.x.toFixed(3), +t2.y.toFixed(3), +t2.z.toFixed(3)]; }),
  };
}
