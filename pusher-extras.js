// Coin pusher extras: prizes on the deck (gold bars, poker chips, playing cards with a poker-hand bonus), a robot
// claw on a gantry that grabs a prize or a clump of coins and drops it into the tray, LED counters on the front
// panel and a rotating warning beacon. Everything here is real physics (Rapier) where it touches the pile.
// createExtras(ctx) gets what it needs from the machine (scene, world, sizes, sounds, how to pay).

export function createExtras(ctx) {
  const { THREE, RAPIER, scene, world, W, FRONT, BACK, WIN, tr } = ctx;
  const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ======================= prizes =======================
  const PRIZE_VAL = { bar: 60, chip: 20 };
  const BAR = { l: 0.068, w: 0.032, h: 0.02 };
  const CHIP = { r: 0.021, h: 0.006 };
  const CARD = { w: 0.05, l: 0.07, h: 0.0016 };

  // gold bar: a bevelled trapezoid ingot with a stamped top
  const barGeo = (() => {
    const s = new THREE.Shape(), b = BAR.l / 2, t = BAR.l / 2 - 0.007, h = BAR.h;
    s.moveTo(-b, -h / 2); s.lineTo(b, -h / 2); s.lineTo(t, h / 2); s.lineTo(-t, h / 2); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: BAR.w - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 2 });
    g.translate(0, 0, -(BAR.w - 0.004) / 2); return g;
  })();
  const barM = new THREE.MeshStandardMaterial({ color: '#f0b83a', metalness: 1, roughness: 0.2, envMapIntensity: 1.1, emissive: '#5a3a08', emissiveIntensity: 0.25 });
  const stampTex = canvas(256, 128, g => { g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 128); g.strokeStyle = 'rgba(120,70,10,.75)'; g.lineWidth = 6; g.strokeRect(10, 10, 236, 108); g.fillStyle = 'rgba(120,70,10,.85)'; g.textAlign = 'center'; g.font = '800 34px Georgia, serif'; g.fillText('FINE GOLD', 128, 56); g.font = '700 28px Georgia, serif'; g.fillText('999.9', 128, 96); });
  const stampM = new THREE.MeshStandardMaterial({ map: stampTex, transparent: true, metalness: 1, roughness: 0.3, depthWrite: false });
  // poker chip: striped edge, printed faces
  const chipCols = [['#c8102e', '#ffffff'], ['#1f4fb8', '#ffffff'], ['#151515', '#f2c14e'], ['#1e8a4a', '#ffffff']];
  const chipMats = chipCols.map(([base, stripe]) => {
    const edge = canvas(256, 16, g => { g.fillStyle = base; g.fillRect(0, 0, 256, 16); g.fillStyle = stripe; for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 8, 0, 14, 16); });
    const face = canvas(256, 256, g => { g.fillStyle = base; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill(); g.fillStyle = stripe; for (let i = 0; i < 8; i++) { g.save(); g.translate(128, 128); g.rotate(i * Math.PI / 4); g.fillRect(-12, -128, 24, 34); g.restore(); } g.strokeStyle = stripe; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 78, 0, 7); g.stroke(); g.fillStyle = stripe; g.font = '900 60px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('20', 128, 132); });
    return [new THREE.MeshStandardMaterial({ map: edge, roughness: 0.4 }), new THREE.MeshStandardMaterial({ map: face, roughness: 0.35 }), new THREE.MeshStandardMaterial({ map: face, roughness: 0.35 })];
  });
  const chipGeo = new THREE.CylinderGeometry(CHIP.r, CHIP.r, CHIP.h, 40);
  // playing cards
  const RANKS = '23456789TJQKA', SUITS = ['♠', '♥', '♦', '♣'], SCOL = ['#16161c', '#c4142c', '#c4142c', '#16161c'];
  const cardFaceTex = {};
  const cardFace = c => cardFaceTex[c] || (cardFaceTex[c] = canvas(200, 280, g => {
    const r = RANKS[c >> 2], s = c & 3, lab = r === 'T' ? '10' : r;
    g.fillStyle = '#fbf8f1'; g.beginPath(); g.roundRect(0, 0, 200, 280, 16); g.fill(); g.strokeStyle = '#d8cfbd'; g.lineWidth = 4; g.stroke();
    g.fillStyle = SCOL[s]; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 46px Georgia, serif'; g.fillText(lab, 32, 38); g.font = '38px Arial'; g.fillText(SUITS[s], 32, 80);
    g.save(); g.translate(200, 280); g.rotate(Math.PI); g.font = '800 46px Georgia, serif'; g.fillText(lab, 32, 38); g.font = '38px Arial'; g.fillText(SUITS[s], 32, 80); g.restore();
    g.font = 'JQK'.includes(r) ? 'italic 800 110px Georgia, serif' : '120px Arial'; g.fillText('JQK'.includes(r) ? lab : SUITS[s], 100, 146);
  }));
  const cardBack = canvas(200, 280, g => { g.fillStyle = '#f6f1e5'; g.beginPath(); g.roundRect(0, 0, 200, 280, 16); g.fill(); g.fillStyle = '#6e1824'; g.beginPath(); g.roundRect(12, 12, 176, 256, 10); g.fill(); g.strokeStyle = 'rgba(244,226,200,.3)'; g.lineWidth = 5; for (let i = -280; i < 280; i += 20) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 280, 280); g.stroke(); } });
  const cardEdgeM = new THREE.MeshStandardMaterial({ color: '#efe9dc' }), cardBackM = new THREE.MeshStandardMaterial({ map: cardBack, roughness: 0.5 });
  const cardGeo = new THREE.BoxGeometry(CARD.w, CARD.h, CARD.l);

  const prizes = [];   // { kind, body, mesh, card, paid, held }
  function addPrize(kind, x, y, z, opts = {}) {
    if (prizes.length >= 8) return null;
    const q = opts.q || new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(-0.2, 0.2), rnd(0, 6), rnd(-0.2, 0.2)));
    const d = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.5).setAngularDamping(1.2).setCcdEnabled(true);
    const body = world.createRigidBody(d);
    let mesh, card = null;
    if (kind === 'bar') {
      world.createCollider(RAPIER.ColliderDesc.roundCuboid(BAR.l / 2 - 0.003, BAR.h / 2 - 0.002, BAR.w / 2 - 0.002, 0.002).setDensity(10).setFriction(0.22).setRestitution(0.02), body);
      mesh = new THREE.Group(); const m = new THREE.Mesh(barGeo, barM); m.castShadow = m.receiveShadow = true; mesh.add(m);
      const st = new THREE.Mesh(new THREE.PlaneGeometry(BAR.l - 0.02, BAR.w - 0.008), stampM); st.rotation.x = -Math.PI / 2; st.position.y = BAR.h / 2 + 0.0006; mesh.add(st);
    } else if (kind === 'chip') {
      world.createCollider(RAPIER.ColliderDesc.roundCylinder(CHIP.h / 2 - 0.001, CHIP.r - 0.001, 0.001).setDensity(6).setFriction(0.4).setRestitution(0.05), body);
      mesh = new THREE.Mesh(chipGeo, chipMats[opts.color != null ? opts.color : Math.floor(Math.random() * chipMats.length)]); mesh.castShadow = mesh.receiveShadow = true;
    } else {
      card = opts.card != null ? opts.card : Math.floor(Math.random() * 52);
      // the card's physical shape is a little thicker than it looks, so it can never slip into the 4 mm gaps over the pushers
      world.createCollider(RAPIER.ColliderDesc.cuboid(CARD.w / 2, 0.0026, CARD.l / 2).setDensity(2).setFriction(0.3).setRestitution(0.02), body);
      const fm = new THREE.MeshStandardMaterial({ map: cardFace(card), roughness: 0.45 });
      mesh = new THREE.Mesh(cardGeo, [cardEdgeM, cardEdgeM, fm, cardBackM, cardEdgeM, cardEdgeM]); mesh.castShadow = mesh.receiveShadow = true;
    }
    scene.add(mesh);
    const p = { kind, body, mesh, card, paid: false, held: false };
    prizes.push(p); return p;
  }
  function removePrize(i) { const p = prizes[i]; world.removeRigidBody(p.body); scene.remove(p.mesh); prizes.splice(i, 1); }
  const pickKind = () => { const r = Math.random(); return r < 0.22 ? 'bar' : r < 0.6 ? 'chip' : 'card'; };
  // a prize drops in from the chute now and then
  function dropPrize(x) { return addPrize(pickKind(), x, 0.42, -0.4 + rnd(-0.01, 0.01)); }
  function seedPrizes() {
    [['bar', -0.12, 0.08], ['chip', 0.02, 0.12], ['chip', 0.2, 0.06], ['card', -0.04, 0.05], ['card', 0.12, 0.16]]
      .forEach(([k, x, z]) => addPrize(k, x, 0.09, z));
  }

  // ---------- the poker hand: five cards pushed into the tray pay by poker ranking ----------
  const HAND_PAY = [['Royal flush', 3000], ['Straight flush', 1500], ['Four of a kind', 600], ['Full house', 300], ['Flush', 200], ['Straight', 150], ['Three of a kind', 100], ['Two pair', 60], ['One pair', 25], ['High card', 0]];
  function rankHand(cs) {
    const rs = cs.map(c => c >> 2).sort((a, b) => b - a), ss = cs.map(c => c & 3);
    const flush = ss.every(s => s === ss[0]);
    const uniq = [...new Set(rs)];
    let straight = uniq.length === 5 && (rs[0] - rs[4] === 4 || (rs[0] === 12 && rs[1] === 3));
    const counts = Object.values(rs.reduce((m, r) => (m[r] = (m[r] || 0) + 1, m), {})).sort((a, b) => b - a);
    if (straight && flush) return rs[0] === 12 && rs[1] === 11 ? 0 : 1;
    if (counts[0] === 4) return 2;
    if (counts[0] === 3 && counts[1] === 2) return 3;
    if (flush) return 4;
    if (straight) return 5;
    if (counts[0] === 3) return 6;
    if (counts[0] === 2 && counts[1] === 2) return 7;
    if (counts[0] === 2) return 8;
    return 9;
  }
  const hand = [];
  const handEl = document.createElement('div'); handEl.className = 'pz-hand'; handEl.setAttribute('aria-label', tr('Your poker hand')); ctx.host.appendChild(handEl);
  function paintHand(flash) {
    handEl.innerHTML = `<small>${tr('Poker hand')}</small>` + [0, 1, 2, 3, 4].map(i => { const c = hand[i]; if (c == null) return '<i class="pz-hc empty"></i>'; const r = RANKS[c >> 2], s = c & 3; return `<i class="pz-hc ${s === 1 || s === 2 ? 'red' : ''}">${r === 'T' ? '10' : r}<b>${SUITS[s]}</b></i>`; }).join('');
    if (flash) { handEl.classList.remove('flash'); void handEl.offsetWidth; handEl.classList.add('flash'); }
  }
  function collectCard(c) {
    hand.push(c);
    if (ctx.isSim()) { if (hand.length >= 5) { const k = rankHand(hand.splice(0)); ctx.pay(HAND_PAY[k][1]); } return; }
    paintHand(true); ctx.sound('card');
    if (hand.length >= 5) {
      const k = rankHand(hand), [name, v] = HAND_PAY[k];
      setTimeout(() => {
        if (v) { ctx.pay(v); ctx.celebrate(tr(name), `+${v}`, k <= 3); } else ctx.pop(tr('High card'));
        hand.length = 0; paintHand(true); save();
      }, 700);
    }
    save();
  }

  // prizes falling over the edge
  function stepPrizes() {
    for (let i = prizes.length - 1; i >= 0; i--) {
      const p = prizes[i]; if (p.held) continue;
      const t = p.body.translation();
      if (!p.paid && t.y < -0.03 && t.z > FRONT - 0.02) {
        p.paid = true;
        if (Math.abs(t.x) < WIN) {
          if (p.kind === 'card') collectCard(p.card);
          else { const v = PRIZE_VAL[p.kind]; ctx.pay(v); if (!ctx.isSim()) { ctx.burst(t.x, -0.02, t.z, p.kind === 'bar' ? 50 : 20, 0.9, p.kind === 'bar' ? [1.4, 1.0, 0.3] : [1, 1, 1]); ctx.pop(`+${v}`, 'gold'); ctx.sound(p.kind); } }
          if (ctx.isSim()) ctx.simCount('prize_' + p.kind);
        } else if (ctx.isSim()) ctx.simCount('prizeLost');
      }
      if (t.y < -0.16 || Math.abs(t.x) > W + 0.2 || t.z > FRONT + 0.5) removePrize(i);
    }
  }
  const m4 = new THREE.Matrix4();
  function drawPrizes() {
    for (const p of prizes) { const t = p.body.translation(), q = p.body.rotation(); p.mesh.position.set(t.x, t.y, t.z); p.mesh.quaternion.set(q.x, q.y, q.z, q.w); }
  }

  // ======================= the claw =======================
  // a gantry across the top of the cabinet: a bridge sliding front-to-back, a carriage sliding across it,
  // a cable and a three-finger claw head
  const steel = new THREE.MeshStandardMaterial({ color: '#c9ced8', metalness: 1, roughness: 0.25, envMapIntensity: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2d36', metalness: 0.6, roughness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: ctx.accent || '#ff4fa0', metalness: 0.3, roughness: 0.35, emissive: ctx.accent || '#ff4fa0', emissiveIntensity: 0.35 });
  const RAIL_Y = 0.52;
  const railL = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, FRONT - BACK - 0.2), steel), railR = railL.clone();
  railL.position.set(-W + 0.01, RAIL_Y, (FRONT + BACK) / 2 + 0.1); railR.position.set(W - 0.01, RAIL_Y, (FRONT + BACK) / 2 + 0.1); scene.add(railL, railR);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.014, 0.022), dark); bridge.position.set(0, RAIL_Y - 0.004, 0); scene.add(bridge);
  const carriage = new THREE.Group(); scene.add(carriage);
  const cbox = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), accent); carriage.add(cbox);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 16), steel); motor.rotation.z = Math.PI / 2; motor.position.y = 0.018; carriage.add(motor);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 1, 8), dark); scene.add(cable);
  const head = new THREE.Group(); scene.add(head);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.024, 20), accent); head.add(hub);
  const hubCap = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel); hubCap.position.y = 0.012; head.add(hubCap);
  const fingers = [0, 1, 2].map(k => {
    const pivot = new THREE.Group(); pivot.rotation.y = k * Math.PI * 2 / 3; head.add(pivot);
    const arm = new THREE.Group(); arm.position.set(0.016, -0.01, 0); pivot.add(arm);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.034, 0.008), steel); upper.position.y = -0.017; arm.add(upper);
    const knuckle = new THREE.Group(); knuckle.position.y = -0.034; arm.add(knuckle);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.026, 0.007), steel); lower.position.set(-0.004, -0.012, 0); lower.rotation.z = 0.45; knuckle.add(lower);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), accent); tip.position.set(-0.009, -0.024, 0); knuckle.add(tip);
    return arm;
  });
  const PARK = { x: W - 0.06, z: -0.22 };
  const claw = { x: PARK.x, z: PARK.z, drop: 0.06, open: 0.6, state: 'idle', t: 0, from: null, to: null, held: [], target: null, busy: false };
  function setClaw() {
    bridge.position.z = claw.z; carriage.position.set(claw.x, RAIL_Y + 0.012, claw.z);
    const headY = RAIL_Y - claw.drop; head.position.set(claw.x, headY, claw.z);
    cable.position.set(claw.x, (RAIL_Y + headY) / 2, claw.z); cable.scale.y = Math.max(0.001, RAIL_Y - headY);
    fingers.forEach(f => { f.rotation.z = -claw.open; });
  }
  setClaw();
  const ease = q => q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
  const TIP = 0.06;   // from the hub down to the finger tips
  function clawGrab() {
    if (claw.busy) return false;
    // aim: a prize on the lower deck if there is one, otherwise the thickest clump of coins near the front
    let target = null;
    const reachable = t => t.y < 0.09 && t.z > 0.02 && t.z < FRONT - 0.03 && Math.abs(t.x) < W - 0.05;
    const cands = prizes.filter(p => !p.held && !p.paid && reachable(p.body.translation()));
    if (cands.length) { const p = cands[Math.floor(Math.random() * cands.length)]; const t = p.body.translation(); target = { x: t.x, z: t.z, y: t.y }; }
    else {
      const cs = ctx.coins().filter(c => !c.paid && reachable(c.body.translation()));
      if (cs.length) { const c = cs[Math.floor(Math.random() * cs.length)]; const t = c.body.translation(); target = { x: t.x, z: t.z, y: t.y }; }
    }
    if (!target) return false;
    claw.busy = true; claw.target = target; go('toTarget', { x: target.x, z: target.z }, 1.1);
    if (!ctx.isSim()) ctx.sound('claw');
    return true;
  }
  function go(state, to, dur) { claw.state = state; claw.t = 0; claw.dur = dur; claw.from = { x: claw.x, z: claw.z, drop: claw.drop, open: claw.open }; claw.to = { ...claw.from, ...to }; }
  const tmpQ = new THREE.Quaternion();
  function stepClaw(dt) {
    if (claw.state === 'idle') return;
    claw.t += dt; const q = Math.min(1, claw.t / claw.dur), e = ease(q);
    ['x', 'z', 'drop', 'open'].forEach(k => { claw[k] = claw.from[k] + (claw.to[k] - claw.from[k]) * e; });
    // what the claw carries rides along with the finger tips
    const tipY = RAIL_Y - claw.drop - TIP;
    claw.held.forEach(h => h.body.setNextKinematicTranslation({ x: claw.x + h.ox, y: tipY + h.oy, z: claw.z + h.oz }));
    if (q < 1) return;
    if (claw.state === 'toTarget') go('lower', { drop: Math.max(0.1, RAIL_Y - TIP - claw.target.y - 0.006) }, 0.9);
    else if (claw.state === 'lower') go('close', { open: 0.05 }, 0.35);
    else if (claw.state === 'close') {
      // take what is under the fingers: a prize and/or up to eight coins
      const tipY2 = RAIL_Y - claw.drop - TIP, near = (t, r) => (t.x - claw.x) ** 2 + (t.z - claw.z) ** 2 < r * r && Math.abs(t.y - tipY2) < 0.035;
      const take = (body, extra) => { const t = body.translation(); body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true); claw.held.push({ body, ox: (t.x - claw.x) * 0.6, oy: t.y - tipY2 + 0.004, oz: (t.z - claw.z) * 0.6, ...extra }); };
      prizes.filter(p => !p.held && !p.paid && near(p.body.translation(), 0.045)).slice(0, 1).forEach(p => { p.held = true; take(p.body, { prize: p }); });
      ctx.coins().filter(c => !c.paid && !c.held && near(c.body.translation(), 0.04)).slice(0, 8).forEach(c => { c.held = true; take(c.body, { coin: c }); });
      go('raise', { drop: 0.06 }, 0.9);
      if (!ctx.isSim()) ctx.sound('grab');
    } else if (claw.state === 'raise') go('toChute', { x: Math.max(-WIN + 0.03, Math.min(WIN - 0.03, claw.x * 0.4)), z: FRONT + 0.035 }, 1.2);
    else if (claw.state === 'toChute') {
      // let go over the front edge: everything falls into the tray
      claw.held.forEach(h => { h.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); h.body.setLinvel({ x: 0, y: -0.2, z: 0.15 }, true); if (h.prize) h.prize.held = false; if (h.coin) h.coin.held = false; });
      if (!ctx.isSim() && claw.held.length) ctx.sound('release');
      claw.held = []; go('open', { open: 0.6 }, 0.3);
    } else if (claw.state === 'open') go('home', { x: PARK.x, z: PARK.z }, 1.3);
    else { claw.state = 'idle'; claw.busy = false; }
  }

  // ======================= LED counters and the beacon =======================
  const apron = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.12, 0.1, 0.02), dark); apron.position.set(0, -0.07, FRONT + 0.01); scene.add(apron);
  // seven-segment digits drawn by hand
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  function segDigit(g, d, x, y, s, on, off) {
    const L = s, T = s * 0.16, H = s;
    const bars = { a: [x + T, y, L, T], b: [x + L + T, y + T, T, H], c: [x + L + T, y + H + 2 * T, T, H], d: [x + T, y + 2 * H + 2 * T, L, T], e: [x, y + H + 2 * T, T, H], f: [x, y + T, T, H], g: [x + T, y + H + T, L, T] };
    Object.entries(bars).forEach(([k, [bx, by, bw, bh]]) => { g.fillStyle = (SEG[d] || '').includes(k) ? on : off; g.fillRect(bx, by, bw, bh); });
  }
  function ledBoard(label, col) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 180; const g = c.getContext('2d');
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.07), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    let last = null;
    m.userData.set = v => {
      const s = String(Math.max(0, Math.floor(v))).padStart(7, ' ').slice(-7); if (s === last) return; last = s;
      g.fillStyle = '#05040a'; g.fillRect(0, 0, 512, 180); g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(4, 4, 504, 172);
      g.fillStyle = col; g.font = '800 30px "Libre Franklin", Arial'; g.textAlign = 'left'; g.fillText(label, 18, 40);
      [...s].forEach((ch, i) => segDigit(g, ch === ' ' ? -1 : +ch, 26 + i * 68, 58, 44, col, 'rgba(255,255,255,.06)'));
      t.needsUpdate = true;
    };
    m.userData.set(0); return m;
  }
  const credit = ledBoard(tr('CREDIT'), ctx.ledA || '#35e0ff'), winB = ledBoard(tr('WIN'), ctx.ledB || '#ff4fd8');
  credit.position.set(-W + 0.08, -0.062, FRONT + 0.021); winB.position.set(W - 0.08, -0.062, FRONT + 0.021); scene.add(credit, winB);
  // beacon: an amber dome with a turning reflector on the top corner of the cabinet
  const beacon = new THREE.Group(); beacon.position.set(W + 0.03, 0.69, BACK + 0.1); scene.add(beacon);
  const bBase = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.016, 24), dark); beacon.add(bBase);
  const domeM = new THREE.MeshPhysicalMaterial({ color: '#ffb02e', transparent: true, opacity: 0.55, roughness: 0.15, emissive: '#ff8a00', emissiveIntensity: 0.2 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.024, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeM); dome.position.y = 0.008; beacon.add(dome);
  const reflector = new THREE.Group(); reflector.position.y = 0.016; beacon.add(reflector);
  const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.4, 0.3) });
  reflector.add(new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), lampM));
  const beamM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 24, 1, true), beamM); beam.rotation.z = Math.PI / 2; beam.position.x = 0.13; reflector.add(beam);
  let beaconT = 0;
  function beaconOn(sec) { beaconT = Math.max(beaconT, sec); }
  function stepLights(dt, t, creditV, winV) {
    credit.userData.set(creditV); winB.userData.set(winV);
    if (beaconT > 0) { beaconT -= dt; reflector.rotation.y += dt * 9; beamM.opacity = 0.35; domeM.emissiveIntensity = 1.2 + Math.sin(t * 30) * 0.3; lampM.color.setRGB(2.4, 1.4, 0.3); }
    else { beamM.opacity = 0; domeM.emissiveIntensity = 0.2; lampM.color.setRGB(0.6, 0.35, 0.1); }
  }

  // ======================= saving =======================
  const KEY = 'ol-pz-prizes';
  function save() {
    if (ctx.isSim()) return;
    try {
      const list = prizes.filter(p => !p.paid && !p.held).map(p => { const t = p.body.translation(), q = p.body.rotation(); return [p.kind, ...[t.x, t.y, t.z, q.x, q.y, q.z, q.w].map(v => Math.round(v * 1e4) / 1e4), p.card]; });
      localStorage.setItem(KEY, JSON.stringify({ list, hand }));
    } catch (e) { /* ignore */ }
  }
  function load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    if (s && Array.isArray(s.list) && s.list.length) {
      s.list.forEach(a => { if (Array.isArray(a) && ['bar', 'chip', 'card'].includes(a[0]) && a.slice(1, 8).every(Number.isFinite)) addPrize(a[0], a[1], a[2] + 0.001, a[3], { q: new THREE.Quaternion(a[4], a[5], a[6], a[7]), card: a[8] }); });
    } else seedPrizes();
    if (s && Array.isArray(s.hand)) s.hand.filter(c => Number.isInteger(c) && c >= 0 && c < 52).slice(0, 4).forEach(c => hand.push(c));
    paintHand();
  }
  load();

  return {
    step(dt) { stepPrizes(); stepClaw(dt); },
    draw(dt, t, creditV, winV) { drawPrizes(); setClaw(); stepLights(dt, t, creditV, winV); },
    clawGrab, beaconOn, dropPrize, save, prizes, hand,
    count: () => prizes.length,
  };
}
