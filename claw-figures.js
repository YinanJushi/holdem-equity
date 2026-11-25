// Chibi figures and their window boxes for the figure crane machine (claw.html, "Figure machine").
// The six characters are Crypton Future Media's virtual singers, used under the Piapro Character License
// (non-commercial, free fan work): https://piapro.jp/license/pcl/summary . The figures are our own simple
// models built from shapes here, not copies of official artwork.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const FIG_CREDIT = 'MEIKO, KAITO, Hatsune Miku, Kagamine Rin, Kagamine Len and Megurine Luka are characters of Crypton Future Media, INC. (piapro.net). Fan-made figures under the Piapro Character License.';
export const FIG_CREDIT_ZH = '初音未来、镜音铃、镜音连、巡音流歌、MEIKO、KAITO 是 Crypton Future Media, INC.（piapro.net）的角色。本手办为依据 Piapro Character License 制作的粉丝二次创作。';

// look of each character: hair, eyes, outfit colours and a few signature pieces
export const FIGS = {
  miku: { name: 'Hatsune Miku', zh: '初音未来', jp: '初音ミク', hair: '#2fbfb4', hairDark: '#1d8f87', eye: '#24b3a8', top: '#9aa3a8', accent: '#2fbfb4', skirt: '#202024', legs: '#202024', boots: '#202024', style: 'twintails', bg: ['#0e3d3a', '#2fbfb4'] },
  rin: { name: 'Kagamine Rin', zh: '镜音铃', jp: '鏡音リン', hair: '#ffd34d', hairDark: '#e0a91e', eye: '#2a86d8', top: '#f4f4f2', accent: '#ffd34d', skirt: '#202024', legs: '#f4f4f2', boots: '#f4f4f2', style: 'bow', shorts: true, bg: ['#5a4206', '#ffd34d'] },
  len: { name: 'Kagamine Len', zh: '镜音连', jp: '鏡音レン', hair: '#ffd34d', hairDark: '#e0a91e', eye: '#2a86d8', top: '#f4f4f2', accent: '#ffd34d', skirt: '#202024', legs: '#202024', boots: '#f4f4f2', style: 'ponytail', shorts: true, bg: ['#4a3a08', '#f2c14e'] },
  luka: { name: 'Megurine Luka', zh: '巡音流歌', jp: '巡音ルカ', hair: '#f4a2c4', hairDark: '#d8769e', eye: '#3a78d8', top: '#2a2a2e', accent: '#d4af37', skirt: '#2a2a2e', legs: '#2a2a2e', boots: '#d4af37', style: 'long', bg: ['#4a1a30', '#f4a2c4'] },
  meiko: { name: 'MEIKO', zh: 'MEIKO', jp: 'MEIKO', hair: '#6a3a1e', hairDark: '#4a2410', eye: '#7a3a1e', top: '#c8102e', accent: '#c8102e', skirt: '#c8102e', legs: '#e9c7a8', boots: '#c8102e', style: 'bob', bg: ['#4a0a12', '#c8102e'] },
  kaito: { name: 'KAITO', zh: 'KAITO', jp: 'KAITO', hair: '#2050d0', hairDark: '#16389a', eye: '#2050d0', top: '#f4f4f6', accent: '#2050d0', skirt: '#f4f4f6', legs: '#20202a', boots: '#2a2a30', style: 'short', coat: true, bg: ['#0e1e4a', '#2050d0'] },
};

const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.canvas = c; return t; };
const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25, ...o });

// the face: big anime eyes with a highlight, small mouth and blush, drawn on a patch of the head sphere
function faceTex(f) {
  return canvasTex(256, 128, g => {
    g.clearRect(0, 0, 256, 128);
    [[88, 1], [168, -1]].forEach(([x]) => {
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, 62, 19, 25, 0, 0, 7); g.fill();
      const gr = g.createLinearGradient(0, 40, 0, 86); gr.addColorStop(0, '#111'); gr.addColorStop(0.45, f.eye); gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, 64, 15, 22, 0, 0, 7); g.fill();
      g.fillStyle = '#0c0c10'; g.beginPath(); g.ellipse(x, 62, 7, 11, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - 6, 52, 5, 7, 0, 0, 7); g.fill(); g.beginPath(); g.arc(x + 6, 74, 2.5, 0, 7); g.fill();
      g.strokeStyle = '#1a1214'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.ellipse(x, 62, 21, 27, 0, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    });
    g.fillStyle = 'rgba(255,120,140,.35)'; g.beginPath(); g.ellipse(62, 98, 14, 6, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(194, 98, 14, 6, 0, 0, 7); g.fill();
    g.strokeStyle = '#8a3040'; g.lineWidth = 3; g.beginPath(); g.arc(128, 96, 7, 0.2, Math.PI - 0.2); g.stroke();
  });
}

// one chibi figure, about 8.5 cm tall, standing on a clear base; origin at the bottom of the base
export function buildFigure(id) {
  const f = FIGS[id], g = new THREE.Group();
  const skin = mat('#ffe3d0', { clearcoat: 0.3 }), hair = mat(f.hair, { clearcoat: 0.9, clearcoatRoughness: 0.15 }), hairD = mat(f.hairDark);
  const top = mat(f.top), acc = mat(f.accent, { metalness: f.accent === '#d4af37' ? 0.7 : 0 }), skirt = mat(f.skirt), legs = mat(f.legs), boots = mat(f.boots, { clearcoat: 1 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
  // base
  add(new THREE.CylinderGeometry(0.022, 0.024, 0.004, 32), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, roughness: 0.05, clearcoat: 1 }), 0, 0.002, 0);
  // legs and boots
  [-1, 1].forEach(s => {
    add(new THREE.CylinderGeometry(0.0042, 0.0038, 0.024, 12), legs, s * 0.0058, 0.017, 0);
    add(new THREE.CylinderGeometry(0.0048, 0.0052, f.coat ? 0.008 : 0.012, 12), boots, s * 0.0058, f.coat ? 0.008 : 0.01, 0.0006);
    add(new THREE.SphereGeometry(0.0052, 10, 8), boots, s * 0.0058, 0.0055, 0.002).scale.set(1, 0.6, 1.4);
  });
  // lower body: skirt, shorts or a long coat
  if (f.coat) add(new THREE.CylinderGeometry(0.011, 0.02, 0.036, 20, 1, true), mat(f.top, { side: THREE.DoubleSide }), 0, 0.03, 0);
  else if (f.shorts) add(new THREE.CylinderGeometry(0.0105, 0.012, 0.008, 18), skirt, 0, 0.032, 0);
  else add(new THREE.CylinderGeometry(0.0105, 0.0175, 0.013, 20), skirt, 0, 0.032, 0);
  if (f.style === 'long') add(new THREE.BoxGeometry(0.003, 0.014, 0.0005), acc, 0.012, 0.031, 0.006, 0, 0, 0.3);   // gold trim on the slit skirt
  // torso, collar/tie, arms
  add(new THREE.CylinderGeometry(0.0085, 0.0105, 0.018, 18), top, 0, 0.046, 0);
  if (id === 'miku') add(new THREE.BoxGeometry(0.004, 0.012, 0.002), acc, 0, 0.047, 0.0095);
  if (id === 'rin' || id === 'len') { add(new THREE.CylinderGeometry(0.0098, 0.0098, 0.004, 18), mat('#202024'), 0, 0.054, 0); add(new THREE.BoxGeometry(0.005, 0.006, 0.002), acc, 0, 0.05, 0.0095); }
  if (f.coat) { add(new THREE.TorusGeometry(0.0078, 0.0032, 8, 18), acc, 0, 0.055, 0, Math.PI / 2); add(new THREE.BoxGeometry(0.004, 0.02, 0.0025), acc, 0.004, 0.044, 0.01, 0, 0, 0.1); }
  if (id === 'luka') add(new THREE.BoxGeometry(0.014, 0.003, 0.0022), acc, 0, 0.052, 0.0088);
  if (id === 'meiko') add(new THREE.CylinderGeometry(0.0088, 0.0088, 0.003, 18), skin, 0, 0.04, 0);
  [-1, 1].forEach(s => {
    const sleeve = id === 'miku' ? mat('#202024') : f.coat ? top : (id === 'meiko' ? skin : top);
    add(new THREE.CapsuleGeometry(0.0032, 0.013, 4, 8), sleeve, s * 0.0125, 0.044, 0, 0, 0, s * 0.35);
    add(new THREE.SphereGeometry(0.0034, 8, 6), skin, s * 0.0158, 0.035, 0.001);
  });
  // head and face
  const HY = 0.076, HR = 0.0195;
  add(new THREE.SphereGeometry(HR, 28, 20), skin, 0, HY, 0);
  const face = new THREE.Mesh(new THREE.SphereGeometry(HR * 1.004, 28, 16, Math.PI / 2 - 0.95 + Math.PI, 1.9, 1.15, 1.0), new THREE.MeshBasicMaterial({ map: faceTex(f), transparent: true }));
  face.rotation.y = Math.PI; face.position.set(0, HY, 0); g.add(face);
  // hair: a cap over the top and back, bangs over the forehead, then the signature style
  add(new THREE.SphereGeometry(HR * 1.07, 28, 18, 0, Math.PI * 2, 0, 1.45), hair, 0, HY + 0.0015, -0.0008);
  add(new THREE.SphereGeometry(HR * 1.06, 24, 16, Math.PI * 1.05, Math.PI * 0.9, 1.2, 1.3), hair, 0, HY, -0.001);   // back of the head
  for (let i = -2; i <= 2; i++) add(new THREE.ConeGeometry(0.0042, 0.011, 6), hair, i * 0.0058, HY + 0.0105, 0.0155 - Math.abs(i) * 0.0012, -0.35, 0, Math.PI + i * 0.12);
  [-1, 1].forEach(s => add(new THREE.ConeGeometry(0.0035, 0.018, 6), hair, s * 0.0168, HY - 0.006, 0.006, 0, 0, Math.PI + s * 0.08));   // side locks
  if (f.style === 'twintails') {
    [-1, 1].forEach(s => {
      const pts = [[0.017, 0.086], [0.026, 0.08], [0.028, 0.06], [0.027, 0.036], [0.025, 0.014]].map(([x, y]) => new THREE.Vector3(s * x, y, -0.006));
      const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0062, 10), hair); tail.castShadow = true; g.add(tail);
      add(new THREE.SphereGeometry(0.0062, 10, 8), hair, s * 0.025, 0.014, -0.006);
      add(new THREE.BoxGeometry(0.006, 0.008, 0.004), mat('#202024'), s * 0.019, 0.087, -0.004, 0, 0, s * 0.3);   // hair ties
      add(new THREE.BoxGeometry(0.0025, 0.006, 0.0045), mat('#e0306a'), s * 0.0215, 0.087, -0.004, 0, 0, s * 0.3);
    });
  }
  if (f.style === 'bow') { [-1, 1].forEach(s => add(new THREE.SphereGeometry(0.0085, 12, 10), mat('#ffffff'), s * 0.009, HY + 0.024, -0.002).scale.set(1, 0.75, 0.35)); add(new THREE.SphereGeometry(0.004, 8, 6), mat('#ffffff'), 0, HY + 0.023, -0.001); }
  if (f.style === 'ponytail') add(new THREE.ConeGeometry(0.004, 0.014, 6), hair, 0, HY - 0.004, -0.02, -0.5, 0, Math.PI);
  if (f.style === 'long') { add(new THREE.CapsuleGeometry(0.012, 0.045, 4, 12), hair, 0, 0.052, -0.012).scale.set(1.25, 1, 0.45); }
  if (f.style === 'bob') [-1, 1].forEach(s => add(new THREE.SphereGeometry(0.009, 12, 10), hair, s * 0.014, HY - 0.008, -0.002).scale.set(0.8, 1, 1));
  return g;
}

// the box: printed card on five sides, a clear window on the front so you can see the figure inside
export function buildBox(id, size) {
  const f = FIGS[id], [W, H, D] = size;
  const art = (w, h, front) => canvasTex(w, h, g => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, f.bg[0]); gr.addColorStop(1, f.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; for (let k = -h; k < w; k += 18) { g.beginPath(); g.moveTo(k, h); g.lineTo(k + h, 0); g.stroke(); }
    if (front) { g.clearRect(w * 0.12, h * 0.1, w * 0.76, h * 0.66); g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(w * 0.12, h * 0.1, w * 0.76, h * 0.66); }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `800 ${Math.round(h * 0.1)}px "Libre Franklin", Arial`;
    g.fillText(f.jp, w / 2, front ? h * 0.88 : h * 0.45);
    g.font = `600 ${Math.round(h * 0.045)}px "Libre Franklin", Arial`; g.fillText((front ? '' : f.name + ' · ') + 'PRIZE FIGURE · ODDS LOUNGE', w / 2, front ? h * 0.95 : h * 0.58);
    if (!front) { g.font = `500 ${Math.round(h * 0.03)}px Arial`; g.fillText('© Crypton Future Media, INC. www.piapro.net · Piapro Character License', w / 2, h * 0.92); }
  });
  const frontTex = art(512, 380, true), backTex = art(512, 380, false), sideTex = art(256, 380, false), topTex = art(512, 256, false);
  const card = t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
  const front = new THREE.MeshPhysicalMaterial({ map: frontTex, transparent: true, roughness: 0.1, clearcoat: 1, alphaTest: 0.02 });
  // the box lies flat on the bridge with its window facing up (W along x, H up, D along z)
  const box = new THREE.Group();
  const shell = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 2, 0.002), [card(sideTex), card(sideTex), front, card(backTex), card(topTex), card(topTex)]);
  shell.castShadow = true; shell.receiveShadow = true; shell.renderOrder = 2; box.add(shell);
  // the clear plastic window and a soft light inside so the figure shows
  const win = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.76, D * 0.66), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0.02, clearcoat: 1, depthWrite: false }));
  win.rotation.x = -Math.PI / 2; win.position.set(0, H / 2 + 0.0006, -D * (0.5 - 0.1 - 0.33)); box.add(win);
  const inner = new THREE.PointLight('#fff4e8', 0.05, 0.25, 1.5); inner.position.set(0, H * 0.45, 0); box.add(inner);
  // the figure lies on its back inside, face up, head toward the back of the box
  const fig = buildFigure(id); const sc = (D * 0.62) / 0.105; fig.scale.setScalar(sc); fig.rotation.x = -Math.PI / 2; fig.position.set(0, -H / 2 + 0.024 * sc, D * 0.5 - 0.012 - D * 0.1); box.add(fig);
  return { obj: box, artCanvas: frontTex.userData.canvas, figure: fig };
}
