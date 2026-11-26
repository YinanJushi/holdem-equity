// Three more prize machines that share the claw page's cabinet, payout bank and prize table (all original designs):
//  cut   - Scissor machine: prizes hang on strings from a swaying rack; line the scissors up with a string and cut it
//  key   - Key machine: a wall of keyholes, one prize above each; raise the key to a keyhole and push it in
//  candy - Candy scoop: a scoop digs into a turning table of candy and tips it onto a pusher shelf
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// w: how often each kind is stocked
export const EXTRA_KINDS = {
  cut: {
    cut_star: { name: 'Star charm', value: 30, w: 3 }, cut_cloud: { name: 'Cloud plush', value: 40, w: 3 }, cut_duck: { name: 'Duck plush', value: 50, w: 2 },
    cut_moon: { name: 'Moon plush', value: 60, w: 2 }, cut_crown: { name: 'Crown plush', value: 150, w: 1 },
  },
  key: {
    key_fan: { name: 'Handy fan', value: 40 }, key_lamp: { name: 'Desk lamp', value: 50 }, key_buds: { name: 'Earbuds', value: 80 },
    key_speaker: { name: 'Mini speaker', value: 100 }, key_cam: { name: 'Instant camera', value: 150 }, key_gold: { name: 'Golden key trophy', value: 300 },
  },
  candy: {
    cd_candy: { name: 'Candy', value: 2 }, cd_star: { name: 'Star candy', value: 10 }, cd_box: { name: 'Candy gift box', value: 60 }, cd_jar: { name: 'Big candy jar', value: 150 },
  },
};
export const EXTRA_INFO = {
  cut: { title: 'Snip & Win', sub: '✂  CUT THE STRING · CATCH THE PRIZE  ✂', lacquer: '#3a1c5a', start: { x: -0.2, z: 0.12 }, name: 'Scissor machine', icon: '✂️', desc: 'Snip the string and the prize drops',
    tip: 'Move the scissors over a string and press Cut. The prizes sway, so time it: the string has to be right between the blades. Cut it and the prize drops. It is yours.' },
  key: { title: 'Lucky Key', sub: '🔑  FIND THE KEYHOLE · OPEN THE DOOR  🔑', lacquer: '#123a30', start: { x: -0.24, z: 0.15 }, name: 'Key machine', icon: '🔑', desc: 'Line the key up with a keyhole and push it in',
    tip: 'Move the key left or right under a prize. Then press and hold to raise it, and let go at the keyhole\'s height: the key pushes in. If it fits the slot it turns, the door opens and the prize drops. The better the prize, the narrower its slot.' },
  candy: { title: 'Candy Scoop', sub: '🍬  SCOOP · PUSH · SWEET  🍬', lacquer: '#7a1f5a', start: { x: 0, z: 0.1 }, name: 'Candy scoop', icon: '🍬', desc: 'Scoop candy onto the pusher shelf',
    tip: 'The scoop sweeps over the turning candy table. Press Scoop to stop it: it digs in, lifts and tips its candy onto the pusher shelf. Candy pushed off the front edge is yours; off the sides it goes back to the table.' },
};

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
const glow = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
const weighted = K => { const e = Object.entries(K), tot = e.reduce((a, [, v]) => a + (v.w || 1), 0); return () => { let r = Math.random() * tot; for (const [k, v] of e) { r -= v.w || 1; if (r < 0) return k; } return e[0][0]; }; };
const eyes = (g, y, z, s = 1, gap = 0.007) => { [-1, 1].forEach(sx => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0022 * s, 8, 6), M('#1a1a1a', { roughness: 0.3 })); e.position.set(sx * gap * s, y, z); g.add(e); }); };
// a mesh stretched between two points (for rods, strings and arms)
const UP = new THREE.Vector3(0, 1, 0);
function stretch(m, a, b) { const d = new THREE.Vector3().subVectors(b, a), l = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, Math.max(1e-4, l), 1); if (l > 1e-6) m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / l)); }
const rod = (r, mat) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), mat);

// ---------- prize models ----------
// hanging plush prizes, about 5 cm, with a loop on top at y = 0.03 where the string is tied
export function buildCutPrize(kind) {
  const g = new THREE.Group();
  if (kind === 'cut_star') {
    const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.011 : 0.026; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 3 }); geo.translate(0, 0, -0.005);
    g.add(new THREE.Mesh(geo, M('#ffd23f', { roughness: 0.85 }))); eyes(g, 0.002, 0.01);
  } else if (kind === 'cut_cloud') {
    [[0, 0.002, 0.018], [-0.016, -0.005, 0.013], [0.016, -0.005, 0.013], [-0.007, 0.012, 0.012], [0.008, 0.011, 0.011]].forEach(([x, y, r]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), M('#f4f6ff', { roughness: 0.9 })); b.position.set(x, y, 0); b.scale.z = 0.8; g.add(b); });
    eyes(g, 0.002, 0.014); [-1, 1].forEach(sx => { const ch = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 6), M('#ff9ab8')); ch.position.set(sx * 0.012, -0.003, 0.012); g.add(ch); });
  } else if (kind === 'cut_duck') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.019, 18, 14), M('#ffe14a', { roughness: 0.9 })); body.scale.set(1, 0.85, 1.1); body.position.y = -0.008; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 12), M('#ffe14a', { roughness: 0.9 })); head.position.set(0, 0.014, 0.006); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.012, 10), M('#ff8a1e')); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.012, 0.022); g.add(beak);
    eyes(g, 0.018, 0.017, 1, 0.006);
  } else if (kind === 'cut_moon') {
    const s = new THREE.Shape(); s.absarc(0, 0, 0.025, -Math.PI * 0.75, Math.PI * 0.75, false); s.absarc(0.012, 0, 0.019, Math.PI * 0.62, -Math.PI * 0.62, true);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 3, curveSegments: 20 }); geo.translate(0, 0, -0.005);
    g.add(new THREE.Mesh(geo, M('#b9a8ff', { roughness: 0.85 }))); eyes(g, 0.004, 0.01, 0.9, 0.004); g.children[g.children.length - 1].position.x = -0.016; g.children[g.children.length - 2].position.x = -0.012;
  } else {
    // the crown plush: a red cushion with a gold crown on it
    const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.022, 18, 12), M('#c8102e', { roughness: 0.8 })); cushion.scale.set(1.1, 0.5, 1.1); cushion.position.y = -0.012; g.add(cushion);
    const goldM = M('#f2c14e', { metalness: 0.9, roughness: 0.25, emissive: '#6a4206', emissiveIntensity: 0.4 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.015, 0.014, 20, 1, true), goldM); band.position.y = 0.004; g.add(band);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.012, 8), goldM); sp.position.set(Math.cos(a) * 0.0155, 0.017, Math.sin(a) * 0.0155); g.add(sp); const j = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), M(i % 2 ? '#3a7bff' : '#ff3a5a', { roughness: 0.2 })); j.position.set(Math.cos(a) * 0.016, 0.004, Math.sin(a) * 0.016); g.add(j); }
  }
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0012, 6, 12), M('#d8dce4', { metalness: 1, roughness: 0.3 })); loop.position.y = 0.028; g.add(loop);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const w = new THREE.Group(); g.scale.setScalar(1.3); w.add(g); return w;   // drawn 1.3x: the string is tied at y = 0.036
}
// key machine prizes: small gadgets standing on a ledge (base at y = 0, about 5 cm tall)
export function buildKeyPrize(kind) {
  const g = new THREE.Group();
  if (kind === 'key_fan') {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.032, 12), M('#6fe0c0')); h.position.y = 0.016; g.add(h);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0025, 8, 24), M('#6fe0c0')); ring.position.y = 0.05; g.add(ring);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.006, 0.002), M('#ffffff')); b.position.set(Math.cos(i * 2.1) * 0.007, 0.05 + Math.sin(i * 2.1) * 0.007, 0); b.rotation.z = i * 2.1; g.add(b); }
  } else if (kind === 'key_lamp') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.005, 20), M('#ff7a6a')); base.position.y = 0.0025; g.add(base);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.045, 8), M('#e8e8ec', { metalness: 0.6 })); arm.position.set(0.004, 0.026, 0); arm.rotation.z = -0.2; g.add(arm);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.018, 20, 1, true), M('#ff7a6a', { side: THREE.DoubleSide })); shade.position.set(0.012, 0.05, 0.004); shade.rotation.set(0.4, 0, -0.5); g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), glow(new THREE.Color(2, 1.7, 1))); bulb.position.set(0.014, 0.045, 0.006); g.add(bulb);
  } else if (kind === 'key_buds') {
    const c = new THREE.Mesh(new RoundedBoxGeometry(0.042, 0.032, 0.026, 3, 0.009), M('#f6f6f8', { roughness: 0.3 })); c.position.y = 0.016; g.add(c);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.043, 0.0012, 0.027), M('#b8bcc6')); seam.position.y = 0.022; g.add(seam);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0015, 6, 4), glow(new THREE.Color(0.4, 2, 0.6))); led.position.set(0, 0.012, 0.013); g.add(led);
  } else if (kind === 'key_speaker') {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.046, 24), M('#33384a', { roughness: 0.95 })); s.position.y = 0.023; g.add(s);
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0018, 6, 24), glow(new THREE.Color(0.4, 1.6, 2))); top.rotation.x = Math.PI / 2; top.position.y = 0.0465; g.add(top);
  } else if (kind === 'key_cam') {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.054, 0.042, 0.03, 3, 0.006), M('#9fd3ff', { roughness: 0.4 })); b.position.y = 0.021; g.add(b);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.012, 24), M('#1a1a1a', { roughness: 0.3 })); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.019, 0.019); g.add(lens);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.007, 20), M('#3a5a8a', { metalness: 0.8, roughness: 0.1 })); glass.position.set(0, 0.019, 0.0252); g.add(glass);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.002), M('#ffffff')); fl.position.set(0.016, 0.036, 0.0155); g.add(fl);
  } else {
    // the golden key trophy
    const goldM = M('#f2c14e', { metalness: 1, roughness: 0.2, emissive: '#6a4206', emissiveIntensity: 0.5 });
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.044, 0.01, 0.03, 2, 0.003), M('#1a1a22', { roughness: 0.3 })); base.position.y = 0.005; g.add(base);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0035, 10, 24), goldM); bow.position.y = 0.05; g.add(bow);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.03, 0.005), goldM); shaft.position.y = 0.025; g.add(shaft);
    [0.016, 0.022].forEach(y => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.005), goldM); t.position.set(0.006, y, 0); g.add(t); });
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function buildCandyBig(kind) {
  const g = new THREE.Group();
  if (kind === 'cd_box') {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.04, 0.04, 2, 0.003), M('#ff6fa8', { roughness: 0.5 })); g.add(b);
    const rib = M('#f2c14e', { metalness: 0.6, roughness: 0.3 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.042, 0.008), rib), new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.042, 0.042), rib));
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.002, 6, 12), rib); bow.position.y = 0.023; g.add(bow);
  } else {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 24), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, roughness: 0.05, clearcoat: 1, depthWrite: false })); g.add(jar);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.008, 24), M('#ff4a6a')); lid.position.y = 0.029; g.add(lid);
    const cols = ['#ff4a6a', '#ffd23f', '#3ad8c8', '#8a5aff', '#ffffff'];
    for (let i = 0; i < 18; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 6), M(cols[i % 5], { roughness: 0.3 })); s.position.set((Math.random() - 0.5) * 0.028, -0.02 + Math.floor(i / 6) * 0.011, (Math.random() - 0.5) * 0.028); g.add(s); }
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), glow(new THREE.Color(2, 1.6, 0.4))); star.position.y = 0.035; g.add(star);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// c: { world, scene, X, ZB, ZF, TOP, G, input, win, say, tr, tone, motor, gold, chrome, canPay }
export function makeExtra(kind, c) { return kind === 'cut' ? makeCut(c) : kind === 'key' ? makeKey(c) : makeCandy(c); }

// ---------- Scissor machine ----------
// Eight prizes hang on strings (rope joints) from hangers on two rails; the hangers sway a little on a motor, so the
// strings swing. The scissors ride the gantry at a fixed height, blades pointing to the back. Press Cut: the blades
// close, and a string that's between them (inside the slot) is cut. The payout bank decides how wide that slot is.
function makeCut(c) {
  const { world, scene, X, G } = c;
  const HY = 0.47, SY = 0.375, L = 0.15, BL = 0.042;   // rail height, scissors height, string length, blade length
  const K = EXTRA_KINDS.cut, pick = weighted(K);
  const SPOTS = [...[-0.13, 0, 0.13].map(x => ({ x, z: -0.13 })), ...[-0.195, -0.065, 0.065, 0.195].map(x => ({ x, z: 0.0 }))];   // the back row sits between the front ones, so you can see it
  const chromeM = c.chrome;
  [-0.13, 0.0].forEach(z => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, X * 2, 12), chromeM); r.rotation.z = Math.PI / 2; r.position.set(0, HY + 0.006, z); scene.add(r); });
  const strM = new THREE.MeshBasicMaterial({ color: '#f4efe4' });
  let T = 0;
  const hangs = SPOTS.map(s => {
    const hb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(s.x, HY, s.z));
    const clip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 12), c.gold); scene.add(clip);
    const str = rod(0.0009, strM); scene.add(str);
    return { ...s, hb, clip, str, ph: Math.random() * 6.28, amp: 0.005 + Math.random() * 0.006, w: 1.6 + Math.random() * 1.4, body: null };
  });
  function hang(h) {
    h.kind = pick(); h.cut = false; h.won = false; h.t = 0;
    const p = h.hb.translation();
    h.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, HY - L - 0.036, h.z).setLinearDamping(0.2).setAngularDamping(2));
    world.createCollider(RAPIER.ColliderDesc.ball(0.031).setDensity(90).setFriction(0.6).setRestitution(0.2), h.body);
    h.joint = world.createImpulseJoint(RAPIER.JointData.rope(L, { x: 0, y: 0, z: 0 }, { x: 0, y: 0.036, z: 0 }), h.hb, h.body, true);
    h.obj = buildCutPrize(h.kind); scene.add(h.obj);
    h.body.applyImpulse({ x: (Math.random() - 0.5) * h.body.mass() * 0.08, y: 0, z: 0 }, true);
  }
  hangs.forEach(hang);
  // the scissors: two chrome blades on a gold pivot, red finger loops, hung from the carriage on a rod
  const sc = new THREE.Group(); scene.add(sc);
  const blades = [-1, 1].map(sx => { const b = new THREE.Group(); const bl = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.004, BL), new THREE.MeshStandardMaterial({ color: '#e8ecf2', metalness: 1, roughness: 0.15 })); bl.position.set(sx * 0.001, sx * 0.002, -BL / 2); bl.castShadow = true; b.add(bl); const loopM = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0022, 8, 16), M('#e8243c', { roughness: 0.4 })); loopM.rotation.x = Math.PI / 2; loopM.position.set(-sx * 0.006, sx * 0.002, 0.014); b.add(loopM); sc.add(b); return b; });
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.01, 12), c.gold); sc.add(pivot);
  const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, TOP_(c) - SY, 10), chromeM); hanger.position.y = (TOP_(c) - SY) / 2; sc.add(hanger);
  const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, SY, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.2, 0.2), transparent: true, opacity: 0.55, toneMapped: false })); laser.position.set(0, -SY / 2, -BL / 2); sc.add(laser);
  let open = 0.35, checked = false;
  const anchor = new THREE.Vector3(), qq = new THREE.Quaternion();
  const anchorOf = h => { const t = h.body.translation(), q = h.body.rotation(); return anchor.set(0, 0.036, 0).applyQuaternion(qq.set(q.x, q.y, q.z, q.w)).add(new THREE.Vector3(t.x, t.y, t.z)); };
  // where each string crosses the scissors' height
  const strAt = h => { const p = h.hb.translation(), a = anchorOf(h); if (a.y >= SY) return null; const k = (HY - SY) / (HY - a.y); return { x: p.x + (a.x - p.x) * k, z: p.z + (a.z - p.z) * k }; };
  function tryCut() {
    let best = null;
    for (const h of hangs) { if (!h.body || h.cut) continue; const s = strAt(h); if (!s) continue; const dz = s.z - (G.cz - BL / 2), dx = s.x - G.cx; if (Math.abs(dz) > BL / 2 + 0.002) continue; if (!best || Math.abs(dx) < Math.abs(best.dx)) best = { h, dx }; }
    if (!best) { if (!G.sim) c.say(c.tr('Nothing between the blades')); return; }
    const tol = c.canPay(K[best.h.kind].value) ? 0.008 : 0.003;
    if (Math.abs(best.dx) < tol) {
      world.removeImpulseJoint(best.h.joint, true); best.h.cut = true; best.h.t = 0;
      c.tone(2400, 0.05, 0.05, 'square'); c.tone(1800, 0.08, 0.04, 'square'); if (!G.sim) c.say(c.tr('Snip! The string is cut'));
    } else if (Math.abs(best.dx) < 0.03) {
      // the blade catches the string and knocks the prize swinging
      const b = best.h.body; b.applyImpulse({ x: -Math.sign(best.dx) * b.mass() * 0.12, y: 0, z: 0 }, true);
      c.tone(900, 0.08, 0.04, 'square'); if (!G.sim) c.say(c.tr('Just missed: the blade only nudged the string'));
    } else if (!G.sim) c.say(c.tr('Nothing between the blades'));
  }
  return {
    gantry: true, timer: 30, speed: 0.22, startMsg: 'Move the scissors over a string, then press Cut',
    drop() { if (G.state !== 'aim') return; G.state = 'cut'; G.t = 0; checked = false; c.motor(false); if (!G.sim) c.say(c.tr('Snip…')); },
    dropLabel: () => 'Cut',
    active: () => false,
    step(dt) {
      T += dt;
      hangs.forEach(h => { h.hb.setNextKinematicTranslation({ x: h.x + Math.sin(T * h.w + h.ph) * h.amp, y: HY, z: h.z }); });
      if (G.state === 'cut') {
        open = Math.max(0, 0.35 - G.t * 3);
        if (G.t > 0.11 && !checked) { checked = true; tryCut(); }
        if (G.t > 1.4) { G.state = 'home'; G.t = 0; c.motor(true); }
      } else open = Math.min(0.35, open + dt * 1.5);
      hangs.forEach(h => {
        if (!h.body) { h.t += dt; if (h.t > 1.2) hang(h); return; }
        if (!h.cut) return;
        h.t += dt;
        if (!h.won && h.body.translation().y < 0.07) { h.won = true; c.win({ kind: h.kind, ...K[h.kind] }); }
        if (h.t > 2.4) { world.removeRigidBody(h.body); scene.remove(h.obj); h.body = null; h.t = 0; }
      });
    },
    draw() {
      sc.position.set(G.cx, SY, G.cz); blades[0].rotation.y = open / 2; blades[1].rotation.y = -open / 2;
      laser.visible = G.state === 'aim';
      hangs.forEach(h => {
        const p = h.hb.translation(); h.clip.position.set(p.x, HY, p.z);
        if (!h.body) { h.str.visible = false; return; }
        const t = h.body.translation(), q = h.body.rotation(); h.obj.position.set(t.x, t.y, t.z); h.obj.quaternion.set(q.x, q.y, q.z, q.w);
        h.str.visible = true;
        stretch(h.str, new THREE.Vector3(p.x, HY, p.z), h.cut ? new THREE.Vector3(p.x, SY + 0.004, p.z) : anchorOf(h).clone());
      });
    },
    // test player: aim at a hanging prize's rail spot with some error, cut at a random moment
    plan(noise) { const hs = hangs.filter(h => h.body && !h.cut); const h = hs[Math.floor(Math.random() * hs.length)]; return { x: h.x + (Math.random() - 0.5) * 2 * noise, z: h.z + BL / 2 + (Math.random() - 0.5) * 0.01, settle: 30 + Math.floor(Math.random() * 200), after: 240 }; },
  };
}
const TOP_ = c => c.TOP;

// ---------- Key machine ----------
// A wall of 15 small display cases. Under each case is a keyhole; the better the prize, the narrower the slot.
// The key starts low at the front: steer it left-right, hold the button to raise it, let go to push it in.
function makeKey(c) {
  const { world, scene, X, ZB, ZF, G } = c;
  const K = EXTRA_KINDS.key, PZ = ZB + 0.07, KY0 = 0.045, KZ0 = ZF - 0.045, BLADE = 0.03, RISE = 0.085;
  const COLS = [-0.2, -0.1, 0, 0.1, 0.2], ROWS = [0.075, 0.185, 0.295];
  const LAYOUT = [['key_fan', 'key_lamp', 'key_buds', 'key_lamp', 'key_fan'], ['key_buds', 'key_speaker', 'key_cam', 'key_speaker', 'key_lamp'], ['key_lamp', 'key_cam', 'key_gold', 'key_buds', 'key_fan']];
  const tolOf = v => v <= 50 ? 0.008 : v <= 100 ? 0.0055 : v <= 150 ? 0.004 : 0.003;
  const tierCol = v => v <= 50 ? '#c08040' : v <= 100 ? '#c8ccd4' : v <= 150 ? '#f2c14e' : '#ff6a4a';
  // the wall
  const wall = new THREE.Mesh(new THREE.BoxGeometry(X * 2, 0.4, 0.02), M('#141a2e', { roughness: 0.4, metalness: 0.3 })); wall.position.set(0, 0.2, PZ - 0.01); wall.receiveShadow = true; scene.add(wall);
  const glassM = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0.05, clearcoat: 1, depthWrite: false });
  const tag = (txt, col) => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 24; const g = cv.getContext('2d'); g.fillStyle = col; g.font = '800 18px "Libre Franklin", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 32, 13); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const cells = [];
  ROWS.forEach((y, r) => COLS.forEach((x, k) => {
    const kind = LAYOUT[r][k], v = K[kind].value, tol = tolOf(v);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.004, 0.05), M('#e8e2d4', { roughness: 0.5 })); ledge.position.set(x, y + 0.018, PZ + 0.025); scene.add(ledge);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.074, 0.05), glassM); box.position.set(x, y + 0.057, PZ + 0.025); scene.add(box);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.002), M(tierCol(v), { metalness: 0.9, roughness: 0.25 })); plate.position.set(x, y, PZ + 0.001); scene.add(plate);
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.003 + tol * 2, 0.012 + tol * 2), new THREE.MeshBasicMaterial({ color: '#000000' })); slot.position.set(x, y, PZ + 0.0021); scene.add(slot);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.012), new THREE.MeshBasicMaterial({ map: tag(String(v), tierCol(v)), transparent: true })); lbl.position.set(x + 0.032, y, PZ + 0.002); scene.add(lbl);
    const cell = { x, y, kind, value: v, tol, full: true, t: 0, obj: buildKeyPrize(kind), door: null };
    cell.obj.position.set(x, y + 0.02, PZ + 0.025); scene.add(cell.obj);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.072, 0.002), glassM); door.position.set(x, y + 0.057, PZ + 0.05); scene.add(door); cell.door = door;
    cells.push(cell);
  }));
  // the key on its arm: a rail along the front, a post up to the key, a rod back to the key's bow
  const goldM = c.gold, chromeM = c.chrome;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(X * 2 - 0.02, 0.008, 0.012), chromeM); rail.position.set(0, 0.02, KZ0 + 0.02); scene.add(rail);
  const post = rod(0.004, chromeM), arm = rod(0.003, chromeM); scene.add(post, arm);
  const car = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.016, 0.02, 2, 0.004), goldM); scene.add(car);
  const key = new THREE.Group(); scene.add(key);
  const bladeM = new THREE.MeshStandardMaterial({ color: '#e8ecf2', metalness: 1, roughness: 0.15 });
  const bl = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, BLADE), bladeM); bl.position.z = -BLADE / 2; key.add(bl);
  [0.006, 0.013, 0.02].forEach((z, i) => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004 + (i % 2) * 0.002, 0.004), bladeM); t.position.set(0, -0.007, -z); key.add(t); });
  const sh = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.018, 0.004), goldM); key.add(sh);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, 10, 24), goldM); bow.rotation.y = Math.PI / 2; bow.position.z = 0.014; key.add(bow);
  key.traverse(o => { if (o.isMesh) o.castShadow = true; });
  let ky = KY0, kz = KZ0, roll = 0, held = false, hit = null, wob = 0;
  const falls = [];   // prizes dropping out of an opened case
  const near = () => { let b = null; for (const cl of cells) { const d = Math.hypot(G.cx - cl.x, ky - cl.y); if (!b || d < b.d) b = { cl, d }; } return b.cl; };
  function check() {
    const cl = near(), tol = cl.full ? (c.canPay(cl.value) ? cl.tol : cl.tol * 0.35) : -1;
    if (Math.abs(G.cx - cl.x) < tol && Math.abs(ky - cl.y) < tol) { hit = cl; G.state = 'turn'; G.t = 0; c.tone(1500, 0.06, 0.04, 'square'); }
    else { hit = null; G.state = 'clank'; G.t = 0; wob = 1; c.tone(160, 0.18, 0.06, 'square'); if (!G.sim) c.say(c.tr(cl.full ? 'Clank! The key hit the edge of the keyhole' : 'That case is empty: wait for the restock')); }
  }
  function open(cl) {
    cl.full = false; cl.t = 0; cl.door.visible = false;
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(cl.x, cl.y + 0.045, PZ + 0.03).setLinvel(0, 0.1, 0.35).setAngvel({ x: 4, y: 0, z: 0 }).setLinearDamping(0.1));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.022, 0.024, 0.016).setTranslation(0, -0.02, 0).setDensity(200).setFriction(0.6).setRestitution(0.2), b);
    const o = cl.obj; cl.obj = null;
    falls.push({ b, o, kind: cl.kind, t: 0, won: false });
  }
  return {
    gantry: false, timer: 30, speed: 0.12, lockZ: true, hold: true, startMsg: 'Move the key under a prize, then hold the button to raise it',
    drop() { if (G.state !== 'aim') return; G.state = 'rise'; G.t = 0; held = true; c.motor(true); },
    up() { held = false; },
    dropLabel: () => G.state === 'rise' ? 'Let go to push' : 'Hold to raise',
    active: () => G.state === 'rise',
    step(dt) {
      if (G.state === 'rise') { ky = Math.min(0.34, ky + RISE * dt); if (!held || ky >= 0.34) { G.state = 'push'; G.t = 0; } }
      else if (G.state === 'push') { kz -= 0.2 * dt; if (kz - BLADE <= PZ + 0.002) { kz = PZ + 0.002 + BLADE; check(); } }
      else if (G.state === 'turn') {
        kz = Math.max(PZ + BLADE - 0.016, kz - 0.1 * dt); roll = Math.min(Math.PI / 2, Math.max(0, (G.t - 0.2) * 4));
        if (G.t > 0.7 && hit && hit.full) { open(hit); c.tone(880, 0.12, 0.05, 'triangle'); c.tone(1320, 0.18, 0.05, 'triangle'); if (!G.sim) c.say(c.tr('It turned! The door opens')); }
        if (G.t > 1.5) { G.state = 'back'; G.t = 0; }
      } else if (G.state === 'clank') { wob = Math.max(0, 1 - G.t * 1.8); if (G.t > 0.8) { G.state = 'back'; G.t = 0; } }
      else if (G.state === 'back') {
        roll = Math.max(0, roll - dt * 4); kz = Math.min(KZ0, kz + 0.25 * dt); if (kz >= KZ0 - 0.04) ky = Math.max(KY0, ky - 0.12 * dt);
        if (kz >= KZ0 && ky <= KY0 && roll <= 0) { G.state = 'home'; G.t = 0; }
      }
      for (let i = falls.length - 1; i >= 0; i--) {
        const f = falls[i]; f.t += dt;
        if (!f.won && f.b.translation().y < 0.05) { f.won = true; c.win({ kind: f.kind, ...K[f.kind] }); }
        if (f.t > 2) { world.removeRigidBody(f.b); scene.remove(f.o); falls.splice(i, 1); }
      }
      // the attendant restocks an empty case after a few seconds
      cells.forEach(cl => { if (cl.full) return; cl.t += dt; if (cl.t > 4) { cl.full = true; cl.door.visible = true; cl.obj = buildKeyPrize(cl.kind); cl.obj.position.set(cl.x, cl.y + 0.02, PZ + 0.025); cl.obj.scale.setScalar(0.01); scene.add(cl.obj); } });
    },
    draw(t) {
      const kx = G.cx + (wob ? Math.sin(t * 60) * 0.002 * wob : 0);
      key.position.set(kx, ky, kz); key.rotation.z = roll;
      car.position.set(G.cx, 0.028, KZ0 + 0.02);
      stretch(post, new THREE.Vector3(G.cx, 0.028, KZ0 + 0.02), new THREE.Vector3(G.cx, ky, KZ0 + 0.02));
      stretch(arm, new THREE.Vector3(G.cx, ky, KZ0 + 0.02), new THREE.Vector3(kx, ky, kz + 0.024));
      cells.forEach(cl => { if (cl.obj && cl.obj.scale.x < 1) cl.obj.scale.setScalar(Math.min(1, cl.obj.scale.x + 0.04)); });
      falls.forEach(f => { const p = f.b.translation(), q = f.b.rotation(); f.o.position.set(p.x, p.y, p.z); f.o.quaternion.set(q.x, q.y, q.z, q.w); });
    },
    // test player: pick a full case, steer to it with some error, hold until the key is near the keyhole's height
    plan(noise) {
      const fs = cells.filter(cl => cl.full); const cl = fs[Math.floor(Math.random() * fs.length)];
      const ey = (Math.random() - 0.5) * 2 * noise * 1.3;
      return { x: cl.x + (Math.random() - 0.5) * 2 * noise, settle: 30, after: 240, release: () => G.state === 'rise' && ky >= cl.y + ey };
    },
  };
}

// ---------- Candy scoop ----------
// A turntable of wrapped candy turns slowly. The scoop on its arm sweeps back and forth over it; press Scoop and it
// stops, digs in while the table carries candy into it, lifts, swings round to the front and tips the candy onto the
// pusher shelf. Candy pushed off the front edge drops into the prize trough; off the sides, back onto the table.
function makeCandy(c) {
  const { world, scene, X, ZF, G } = c;
  const K = EXTRA_KINDS.candy;
  const TC = { x: 0, y: 0.07, z: -0.115 }, TR = 0.13, TT = TC.y + 0.005, CR = 0.0105;
  const SHY = 0.1, SZ0 = 0.03, SZ1 = 0.205, SW = 0.2;   // shelf top height, back and front edges, half width
  const SC = { L: 0.076, W: 0.06, H: 0.032 };            // scoop: length along the turning direction, width, wall height
  // turntable (kinematic, turning) with a fixed rim round it
  const table = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(TC.x, TC.y, TC.z));
  world.createCollider(RAPIER.ColliderDesc.cylinder(0.005, TR).setFriction(0.9).setRestitution(0.05), table);
  for (let k = 0; k < 44; k++) { const a = (k + 0.5) / 44 * Math.PI * 2, q = new THREE.Quaternion().setFromAxisAngle(UP, -a); world.createCollider(RAPIER.ColliderDesc.cuboid(0.003, 0.024, Math.PI * (TR + 0.004) / 44 * 1.15).setTranslation(TC.x + Math.cos(a) * (TR + 0.004), TC.y + 0.022, TC.z + Math.sin(a) * (TR + 0.004)).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.3)); }
  world.createCollider(RAPIER.ColliderDesc.cylinder(TC.y / 2, TR).setTranslation(TC.x, TC.y / 2 - 0.004, TC.z));   // pedestal
  // the shelf, its support, and the pusher (kinematic, sliding front-back)
  world.createCollider(RAPIER.ColliderDesc.cuboid(SW, 0.005, (SZ1 - SZ0) / 2).setTranslation(0, SHY - 0.005, (SZ0 + SZ1) / 2).setFriction(0.45));
  world.createCollider(RAPIER.ColliderDesc.cuboid(SW - 0.01, (SHY - 0.01) / 2, (SZ1 - SZ0) / 2 - 0.005).setTranslation(0, (SHY - 0.01) / 2, (SZ0 + SZ1) / 2 - 0.005));
  const PUSH = { d: 0.03, h: 0.03, z0: 0.03, z1: 0.075, per: 2.6 };
  const pusher = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, SHY + PUSH.h / 2 + 0.0005, PUSH.z0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(SW, PUSH.h / 2, PUSH.d / 2).setFriction(0.3), pusher);
  // the scoop: a kinematic tray, open on the side the candy comes from
  const scoop = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.2, -0.04));
  const sc = (hx, hy, hz, x, y, z) => world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.5), scoop);
  sc(SC.L / 2, 0.0015, SC.W / 2, 0, 0, 0); sc(0.0015, SC.H / 2, SC.W / 2, SC.L / 2, SC.H / 2, 0); sc(SC.L / 2, SC.H / 2, 0.0015, 0, SC.H / 2, SC.W / 2); sc(SC.L / 2, SC.H / 2, 0.0015, 0, SC.H / 2, -SC.W / 2);
  // ----- looks -----
  const stripe = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); for (let k = 0; k < 12; k++) { g.fillStyle = k % 2 ? '#ffffff' : '#ff6fa8'; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 128, k / 12 * Math.PI * 2, (k + 1) / 12 * Math.PI * 2); g.fill(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const tableObj = new THREE.Mesh(new THREE.CylinderGeometry(TR, TR, 0.01, 48), [M('#ff6fa8'), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.4 }), M('#ff6fa8')]); tableObj.position.set(TC.x, TC.y, TC.z); tableObj.receiveShadow = true; scene.add(tableObj);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(TR + 0.006, TR + 0.012, TC.y - 0.005, 40), M('#c84a8a', { roughness: 0.35 })); ped.position.set(TC.x, (TC.y - 0.005) / 2, TC.z); scene.add(ped);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(TR + 0.006, TR + 0.006, 0.045, 48, 1, true), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, roughness: 0.05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide })); rim.position.set(TC.x, TC.y + 0.0225, TC.z); scene.add(rim);
  const rimTop = new THREE.Mesh(new THREE.TorusGeometry(TR + 0.006, 0.0025, 6, 64), c.gold); rimTop.rotation.x = Math.PI / 2; rimTop.position.set(TC.x, TC.y + 0.045, TC.z); scene.add(rimTop);
  const shelfM = new THREE.Mesh(new RoundedBoxGeometry(SW * 2, 0.01, SZ1 - SZ0, 2, 0.003), M('#fff4f8', { roughness: 0.35 })); shelfM.position.set(0, SHY - 0.005, (SZ0 + SZ1) / 2); shelfM.receiveShadow = true; scene.add(shelfM);
  const sup = new THREE.Mesh(new THREE.BoxGeometry(SW * 2 - 0.02, SHY - 0.01, SZ1 - SZ0 - 0.01), M('#c84a8a', { roughness: 0.35 })); sup.position.set(0, (SHY - 0.01) / 2, (SZ0 + SZ1) / 2 - 0.005); scene.add(sup);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(SW * 2, 0.004, 0.004), glow(new THREE.Color(2, 0.9, 1.4))); edge.position.set(0, SHY - 0.003, SZ1 + 0.002); scene.add(edge);
  const trough = new THREE.Mesh(new THREE.PlaneGeometry(X * 2, ZF - SZ1), glow(new THREE.Color(0.9, 0.35, 0.7))); trough.rotation.x = -Math.PI / 2; trough.position.set(0, 0.001, (SZ1 + ZF) / 2); scene.add(trough);
  const pushObj = new THREE.Mesh(new RoundedBoxGeometry(SW * 2, PUSH.h, PUSH.d, 2, 0.004), M('#ff8ac0', { roughness: 0.3 })); scene.add(pushObj);
  const pushTrim = new THREE.Mesh(new THREE.BoxGeometry(SW * 2, 0.004, 0.002), c.gold); scene.add(pushTrim);
  const scoopObj = new THREE.Group(); scene.add(scoopObj);
  const scM = new THREE.MeshStandardMaterial({ color: '#e8ecf2', metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide });
  [[SC.L, 0.003, SC.W, 0, 0, 0], [0.003, SC.H, SC.W, SC.L / 2, SC.H / 2, 0], [SC.L, SC.H, 0.003, 0, SC.H / 2, SC.W / 2], [SC.L, SC.H, 0.003, 0, SC.H / 2, -SC.W / 2]].forEach(([w, h, d, x, y, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), scM); m.position.set(x, y, z); m.castShadow = true; scoopObj.add(m); });
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, SC.W + 0.004), c.gold); lip.position.set(SC.L / 2, SC.H, 0); scoopObj.add(lip);
  const postObj = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.3 - TT, 14), c.chrome); postObj.position.set(TC.x, TT + (0.3 - TT) / 2, TC.z); scene.add(postObj);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 10), M('#ff6fa8', { roughness: 0.3 })); cap.position.set(TC.x, 0.3, TC.z); scene.add(cap);
  const armObj = rod(0.005, c.chrome), dropObj = rod(0.003, c.chrome); scene.add(armObj, dropObj);
  // ----- candy (instanced: a ball and two twisted wrapper ends each) -----
  world.numSolverIterations = 4;   // hundreds of small candies: fewer solver passes keep it smooth
  const N_TABLE = 150, N_SHELF = 110, N = N_TABLE + N_SHELF;
  const ballGeo = new THREE.SphereGeometry(CR, 12, 8); ballGeo.scale(1, 0.8, 0.8);
  const ballI = new THREE.InstancedMesh(ballGeo, new THREE.MeshStandardMaterial({ roughness: 0.25 }), N);
  const endGeo = new THREE.ConeGeometry(0.0065, 0.009, 6); endGeo.rotateZ(Math.PI / 2); endGeo.translate(-CR - 0.003, 0, 0);
  const end2 = endGeo.clone(); end2.rotateZ(Math.PI);
  const endI = new THREE.InstancedMesh(endGeo, new THREE.MeshStandardMaterial({ roughness: 0.4 }), N), endI2 = new THREE.InstancedMesh(end2, new THREE.MeshStandardMaterial({ roughness: 0.4 }), N);
  [ballI, endI, endI2].forEach(m => { m.castShadow = true; m.frustumCulled = false; scene.add(m); });
  const COLS = ['#ff4a6a', '#ffd23f', '#3ad8c8', '#8a5aff', '#5ad85a', '#ff8a1e'];
  const candies = [];
  const tableSpot = (i, y) => { const r = Math.sqrt(Math.random()) * (TR - 0.016), a = Math.random() * Math.PI * 2; return { x: TC.x + Math.cos(a) * r, y: y ?? TT + 0.03 + (i % 6) * 0.02, z: TC.z + Math.sin(a) * r }; };
  function addCandy(i, p) {
    const star = Math.random() < 0.1;
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setLinearDamping(0.1).setAngularDamping(0.6));
    world.createCollider(RAPIER.ColliderDesc.roundCuboid(CR - 0.003, CR * 0.8 - 0.003, CR * 0.8 - 0.003, 0.003).setDensity(500).setFriction(0.5).setRestitution(0.1), b);   // wrapped candy is plump but flat-sided: it slides and stops instead of rolling away
    const col = new THREE.Color(star ? '#f2c14e' : COLS[i % COLS.length]), lite = col.clone().lerp(new THREE.Color('#ffffff'), 0.45);
    if (star) col.multiplyScalar(1.4);
    ballI.setColorAt(i, col); endI.setColorAt(i, lite); endI2.setColorAt(i, lite);
    candies.push({ b, kind: star ? 'cd_star' : 'cd_candy' });
  }
  for (let i = 0; i < N_TABLE; i++) { addCandy(i, tableSpot(i)); if (i % 40 === 39) for (let k = 0; k < 40; k++) world.step(); }
  for (let i = N_TABLE; i < N; i++) { addCandy(i, { x: (Math.random() - 0.5) * (SW * 2 - 0.04), y: SHY + 0.02 + ((i - N_TABLE) % 4) * 0.02, z: PUSH.z0 + PUSH.d / 2 + 0.01 + Math.random() * (SZ1 - PUSH.z0 - PUSH.d / 2 - 0.035) }); if (i % 40 === 39) for (let k = 0; k < 40; k++) world.step(); }
  [ballI, endI, endI2].forEach(m => { m.instanceColor.needsUpdate = true; });
  // the two big prizes ride the shelf too
  const bigs = [];
  function addBig(kind, x, z) {
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, SHY + 0.03, z).setLinearDamping(0.2).setAngularDamping(0.8));
    world.createCollider(kind === 'cd_box' ? RAPIER.ColliderDesc.cuboid(0.02, 0.02, 0.02).setDensity(260).setFriction(0.55) : RAPIER.ColliderDesc.cylinder(0.025, 0.022).setDensity(320).setFriction(0.55), b);
    const o = buildCandyBig(kind); scene.add(o); bigs.push({ b, o, kind, t: 0, gone: false });
  }
  addBig('cd_box', 0.1, 0.15); addBig('cd_jar', -0.11, 0.14);
  for (let k = 0; k < 200; k++) world.step();
  // anything that rolled off while the machine was being filled goes back on the table (it isn't a win)
  candies.forEach((cd, i) => { const p = cd.b.translation(); if (p.y < 0.06) recycleInit(cd, i); });
  function recycleInit(cd, i) { const p = tableSpot(i, TT + 0.05 + Math.random() * 0.06); cd.b.setTranslation(p, true); cd.b.setLinvel({ x: 0, y: 0, z: 0 }, true); }
  // ----- the arm's motion -----
  let T = 0, PT = 0, runT = 0, ang = 0, phi = -Math.PI / 2, rr = 0.075, sy = 0.2, tilt = 0, dumpTo = Math.PI / 2;
  const basis = new THREE.Matrix4(), qb = new THREE.Quaternion(), qt = new THREE.Quaternion(), tv = new THREE.Vector3(), rv = new THREE.Vector3(), ZA = new THREE.Vector3(0, 0, 1);
  const pose = () => {
    rv.set(Math.cos(phi), 0, Math.sin(phi)); tv.set(Math.sin(phi), 0, -Math.cos(phi));
    basis.makeBasis(tv, UP, rv); qb.setFromRotationMatrix(basis); qt.setFromAxisAngle(ZA, tilt); qb.multiply(qt);
    return { p: { x: TC.x + rv.x * rr, y: sy, z: TC.z + rv.z * rr }, q: qb };
  };
  const toward = (v, to, sp) => v < to ? Math.min(to, v + sp) : Math.max(to, v - sp);
  const sweep = () => -Math.PI / 2 + 0.95 * Math.sin(T * 1.3);
  let lastWin = 0;
  function recycle(cd, i) { const p = tableSpot(i, TT + 0.05 + Math.random() * 0.06); cd.b.setTranslation(p, true); cd.b.setLinvel({ x: 0, y: 0, z: 0 }, true); cd.b.setAngvel({ x: 0, y: 0, z: 0 }, true); }
  const mtx = new THREE.Matrix4(), pv = new THREE.Vector3(), qv = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  return {
    gantry: false, timer: 15, speed: 0, lockZ: true, noPad: true, startMsg: 'Press Scoop when the scoop is over a heap of candy',
    drop() { if (G.state !== 'aim') return; G.state = 'sink'; G.t = 0; c.motor(true); if (!G.sim) c.say(c.tr('Scooping…')); },
    dropLabel: () => 'Scoop',
    active: () => false,
    step(dt) {
      T += dt;
      // the table and the pusher run while you play and for a few seconds after; between plays they rest, so the
      // candy settles (and nothing pays out while nobody is playing)
      runT = G.state !== 'idle' ? 6 : runT - dt;
      if (runT > 0) { PT += dt; ang += 0.6 * dt; const qa = new THREE.Quaternion().setFromAxisAngle(UP, ang); table.setNextKinematicRotation({ x: qa.x, y: qa.y, z: qa.z, w: qa.w }); }
      const pz = PUSH.z0 + (PUSH.z1 - PUSH.z0) * (0.5 - 0.5 * Math.cos(PT * Math.PI * 2 / PUSH.per));
      pusher.setNextKinematicTranslation({ x: 0, y: SHY + PUSH.h / 2 + 0.0005, z: pz });
      const s = G.state, yLow = TT + 0.0055;   // the scoop dips its open lip to the table, so candy slides in over it
      if (s === 'idle' || s === 'aim') { phi = sweep(); rr = toward(rr, 0.075, 0.2 * dt); sy = toward(sy, 0.2, 0.15 * dt); tilt = toward(tilt, 0, 3 * dt); }
      else if (s === 'sink') { tilt = toward(tilt, 0.15, 1.5 * dt); sy = toward(sy, yLow, 0.12 * dt); if (sy <= yLow) { G.state = 'dig'; G.t = 0; } }
      else if (s === 'dig') { phi += 0.5 * dt; if (G.t > 1.4) { G.state = 'lift'; G.t = 0; c.tone(500, 0.1, 0.03, 'square'); } }
      else if (s === 'lift') { tilt = toward(tilt, -0.2, 1.2 * dt); sy = toward(sy, 0.22, 0.1 * dt); if (sy >= 0.22) { G.state = 'swing'; G.t = 0; dumpTo = phi < -Math.PI / 2 ? -1.5 * Math.PI : Math.PI / 2; } }
      else if (s === 'swing') { phi = toward(phi, dumpTo, 1.1 * dt); rr = toward(rr, 0.235, 0.07 * dt); if (phi === dumpTo && rr >= 0.235) { G.state = 'dump'; G.t = 0; } }
      else if (s === 'dump') { tilt = G.t < 0.8 ? Math.min(2.3, G.t * 3) : G.t < 1.6 ? 2.3 : Math.max(0, 2.3 - (G.t - 1.6) * 4); if (G.t > 2.2) { G.state = 'back'; G.t = 0; phi = Math.PI / 2; } }   // (-3π/2 and π/2 are the same direction)
      else if (s === 'back') { const to = sweep(); phi = toward(phi, to, 1.8 * dt); rr = toward(rr, 0.075, 0.12 * dt); if (Math.abs(phi - to) < 0.03 && rr <= 0.075) { G.state = 'home'; G.t = 0; c.motor(false); } }
      const P = pose(); scoop.setNextKinematicTranslation(P.p); scoop.setNextKinematicRotation({ x: P.q.x, y: P.q.y, z: P.q.z, w: P.q.w });
      // candy off the front edge pays; anything else that falls goes back onto the table
      for (let i = 0; i < candies.length; i++) {
        const cd = candies[i], p = cd.b.translation();
        if (p.y < 0.06 || p.y < -0.05) {
          if (p.z > SZ1 + 0.002 && Math.abs(p.x) < X) { c.win({ kind: cd.kind, ...K[cd.kind], quiet: true }); lastWin = T; }
          if (p.z > SZ1 + 0.002 || Math.hypot(p.x - TC.x, p.z - TC.z) > TR + 0.01 || p.y < -0.05) recycle(cd, i);
        }
      }
      bigs.forEach(bg => {
        const p = bg.b.translation();
        if (bg.gone) { bg.t += dt; if (bg.t > 2) { bg.gone = false; bg.b.setTranslation({ x: (Math.random() - 0.5) * 0.2, y: SHY + 0.06, z: PUSH.z1 + PUSH.d / 2 + 0.03 }, true); bg.b.setLinvel({ x: 0, y: 0, z: 0 }, true); bg.b.setAngvel({ x: 0, y: 0, z: 0 }, true); bg.o.visible = true; } return; }
        if (p.y < 0.07) { if (p.z > SZ1) c.win({ kind: bg.kind, ...K[bg.kind] }); bg.gone = true; bg.t = 0; bg.o.visible = false; bg.b.setTranslation({ x: 0, y: -0.3, z: 0.1 }, true); bg.b.setLinvel({ x: 0, y: 0, z: 0 }, true); bg.b.sleep(); }
      });
    },
    draw() {
      const qa = table.rotation(); tableObj.quaternion.set(qa.x, qa.y, qa.z, qa.w);
      const pp = pusher.translation(); pushObj.position.set(0, pp.y, pp.z); pushTrim.position.set(0, pp.y + PUSH.h / 2, pp.z + PUSH.d / 2);
      const sp = scoop.translation(), sq = scoop.rotation(); scoopObj.position.set(sp.x, sp.y, sp.z); scoopObj.quaternion.set(sq.x, sq.y, sq.z, sq.w);
      const top = new THREE.Vector3(TC.x, 0.3, TC.z), over = new THREE.Vector3(sp.x, Math.max(sp.y + 0.05, 0.27), sp.z);
      stretch(armObj, top, over); stretch(dropObj, over, new THREE.Vector3(sp.x, sp.y + SC.H * 0.5, sp.z));
      for (let i = 0; i < candies.length; i++) { const p = candies[i].b.translation(), q = candies[i].b.rotation(); mtx.compose(pv.set(p.x, p.y, p.z), qv.set(q.x, q.y, q.z, q.w), one); ballI.setMatrixAt(i, mtx); endI.setMatrixAt(i, mtx); endI2.setMatrixAt(i, mtx); }
      ballI.instanceMatrix.needsUpdate = endI.instanceMatrix.needsUpdate = endI2.instanceMatrix.needsUpdate = true;
      bigs.forEach(bg => { const p = bg.b.translation(), q = bg.b.rotation(); bg.o.position.set(p.x, p.y, p.z); bg.o.quaternion.set(q.x, q.y, q.z, q.w); });
    },
    plan() { return { wait: Math.floor(Math.random() * 600), settle: 0, after: 900 }; },
    inScoop: () => { const sp = scoop.translation(); return candies.filter(cd => { const p = cd.b.translation(); return Math.hypot(p.x - sp.x, p.z - sp.z) < 0.04 && p.y > sp.y - 0.005 && p.y < sp.y + 0.04; }).length; },
    pose: () => ({ phi: +phi.toFixed(2), rr: +rr.toFixed(3), sy: +sy.toFixed(3), tilt: +tilt.toFixed(2), s: G.state }),
    stats: () => ({ shelf: candies.filter(cd => { const p = cd.b.translation(); return p.y > SHY && p.z > SZ0; }).length, lastWin }),
  };
}
