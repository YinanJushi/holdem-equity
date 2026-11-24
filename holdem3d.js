// Texas Hold'em in 3D: turns the table description from app.js into seated opponents, cards, chips and labels.
// "Pick cards" mode needs the flat table (you click card spots), so the 3D view steps aside there.
import { createCasino, barButton } from './casino3d.js?v=38';

const host = document.getElementById('table');
const C = host ? createCasino(host, 'holdem') : null;
if (C) {
  window.OL_CASINO = C;
  barButton(C.wrap, C);
  const msg = document.createElement('div'); msg.className = 't3-msg'; msg.setAttribute('aria-hidden', 'true'); C.wrap.appendChild(msg);
  const heroTag = document.createElement('div'); heroTag.className = 't3-hero'; heroTag.setAttribute('aria-hidden', 'true'); C.wrap.appendChild(heroTag);

  const POT = { x: 0, z: -0.32 }, HERO = { x: 0, z: 0.72 };
  const SHIRT = { rock: '#2a3a5a', tag: '#5a1a2a', lag: '#7a4a12', fish: '#2a6a5a', station: '#4a2a6a', maniac: '#8a1a1a' };
  const SKIN = ['#d9b896', '#a87a5a', '#e8c8a8', '#8a5a3a', '#c89a78'];
  const HAIR = ['#1a1208', '#5a3a1a', '#0a0a0a', '#8a6a3a', '#3a2a1a'];
  // opponents sit across the table from you, spread along the far side (left to right)
  const angle = (i, n) => { const span = Math.min(136, 42 * (n - 1)); return ((n === 1 ? 90 : 90 + span / 2 - i * (span / (n - 1))) * Math.PI) / 180; };
  const ring = (th, a, b) => ({ x: Math.cos(th) * a, z: -Math.sin(th) * b });

  let people = [], chairs = [], seatsFor = -1;
  function seatPeople(n, seats) {
    if (seatsFor === n) return;
    people.forEach(p => C.scene.remove(p)); chairs.forEach(c => C.scene.remove(c));
    people = []; chairs = [];
    for (let i = 0; i < n; i++) {
      const th = angle(i, n), p = ring(th, 1.62, 1.02), key = (seats[i] && seats[i].styleKey) || '';
      const person = C.person({ shirt: SHIRT[key] || ['#2a2a3a', '#3a2a4a', '#1a3a3a'][i % 3], skin: SKIN[i % SKIN.length], hair: HAIR[(i * 3) % HAIR.length] });
      person.position.set(p.x, -0.16, p.z); person.rotation.y = Math.atan2(-p.x, -p.z);
      C.scene.add(person); people.push(person);
      const ch = ring(th, 1.82, 1.2); chairs.push(C.chair(ch.x, ch.z, Math.atan2(-ch.x, -ch.z) + Math.PI));
    }
    seatsFor = n;
  }
  // folded players sit back; the one to act leans in
  let tt = 0;
  (function loop() { tt += 1 / 60; people.forEach((p, i) => { const s = p.userData.seat || {}; const lean = s.folded ? -0.12 : s.acting ? 0.12 : 0; p.rotation.x += (lean - p.rotation.x) * 0.08; p.userData.head.rotation.y = s.acting ? Math.sin(tt * 2) * 0.15 : Math.sin(tt * 0.5 + i) * 0.3; }); requestAnimationFrame(loop); })();

  let round = 0, lastOver = false;
  function render(st) {
    const on = st.mode === 'random';
    document.body.classList.toggle('t3d-on', on);
    if (!on) return;
    if (lastOver && !st.over) round++;
    lastOver = st.over;
    const R = 'r' + round;
    msg.innerHTML = st.msg || ''; msg.hidden = !st.msg;
    seatPeople(st.n, st.seats);

    const cards = [], stacks = [], L = [];
    // your hole cards, tipped up toward you
    if (!st.heroFolded) st.hero.forEach((c, i) => { if (c != null) cards.push({ key: R + 'hero' + i, c, x: (i - 0.5) * 0.105, z: 0.44, tilt: 0.55, y: 0.012 + i * 0.002, yaw: (i - 0.5) * -0.12 }); });
    // the board
    st.board.forEach((c, i) => { if (c != null) cards.push({ key: R + 'b' + i, c, x: (i - 2) * 0.115, z: -0.06 }); });
    // opponents
    st.seats.forEach((s, i) => {
      const th = angle(i, st.n), cp = ring(th, 0.98, 0.5), bp = ring(th, 0.62, 0.32), sp = ring(th, 1.12, 0.6), hp = ring(th, 1.62, 1.02);
      if (people[i]) people[i].userData.seat = s;
      if (s.cards) s.cards.forEach((c, k) => {
        const off = (k - 0.5) * 0.06;
        cards.push({ key: `${R}o${s.j}-${k}`, c, x: cp.x + Math.sin(th) * off, z: cp.z + Math.cos(th) * off, yaw: th - Math.PI / 2 + (k - 0.5) * 0.12, y: k * 0.001 });
      });
      if (s.bet > 0) stacks.push({ key: `${R}bet${s.j}`, n: s.bet, x: bp.x, z: bp.z, fromX: sp.x, fromZ: sp.z, toX: POT.x, toZ: POT.z });
      if (s.stack > 0) stacks.push({ key: 'stack' + s.j, n: s.stack, x: sp.x, z: sp.z });
      const badge = st.button === s.j ? '' : st.sb === s.j && st.n > 1 ? '<i>SB</i>' : st.bb === s.j ? '<i>BB</i>' : '';
      L.push({ key: 'name' + s.j, x: hp.x, y: 0.64, z: hp.z, html: `${badge}<b>${s.name}</b>${s.style ? ` · ${s.style}` : ''}${s.stack != null ? `<br><span class="num">${s.stack}</span>` : ''}`, cls: 'plate' + (s.acting ? ' active' : '') + (s.folded ? ' dim' : '') });
      if (s.last) L.push({ key: 'act' + s.j, x: cp.x, y: 0.09, z: cp.z, html: s.last, cls: 'act' });
      if (s.hand || s.won) L.push({ key: 'res' + s.j, x: cp.x, y: 0.12, z: cp.z, html: s.hand || 'Wins the pot', cls: s.won ? 'good' : '' });
      if (s.bet > 0) L.push({ key: 'betl' + s.j, x: bp.x, y: 0.0, z: bp.z + 0.05, html: String(s.bet), cls: 'small' });
    });
    // your chips
    if (st.heroBet > 0) { stacks.push({ key: R + 'bet0', n: st.heroBet, x: -0.12, z: 0.27, fromX: -0.27, fromZ: 0.56, toX: POT.x, toZ: POT.z }); L.push({ key: 'betl0', x: -0.12, y: 0, z: 0.32, html: String(st.heroBet), cls: 'small' }); }
    if (st.heroStack > 0) stacks.push({ key: 'stack0', n: st.heroStack, x: -0.27, z: 0.56 });
    // the pot, pushed to the winner at the end
    if (st.pot > 0) {
      let px = POT.x, pz = POT.z;
      if (st.over && st.winners.length === 1) { const w = st.winners[0]; if (w === 0) { px = -0.2; pz = 0.5; } else { const th = angle(w - 1, st.n), p = ring(th, 1.0, 0.56); px = p.x; pz = p.z; } }
      stacks.push({ key: R + 'pot', n: st.pot, x: px, z: pz });
      L.push({ key: 'pot', x: POT.x, y: 0.0, z: POT.z - 0.07, html: `Pot ${st.pot}`, cls: 'small' });
    }
    // dealer button in front of whoever has it
    if (st.button != null) { if (st.button === 0) C.setPuck(0.17, 0.36); else { const p = ring(angle(st.button - 1, st.n), 0.78, 0.4); C.setPuck(p.x + 0.08, p.z + 0.04); } }
    else C.setPuck(null);

    C.setCards(cards); C.setStacks(stacks); C.setLabels(L);
    // you
    const badge = st.button === 0 ? '<i>D</i>' : st.sb === 0 && st.n > 1 ? '<i>SB</i>' : st.bb === 0 ? '<i>BB</i>' : '';
    heroTag.innerHTML = st.inGame ? `${badge}<b>You</b>${st.heroLast ? ` · ${st.heroLast}` : ''}<br><span class="num">${st.heroStack}</span>` : '';
    heroTag.classList.toggle('active', !!st.heroActing);
    heroTag.hidden = !st.inGame;
  }
  window.addEventListener('table-state', e => render(e.detail));
  if (window.OL_TABLE) render(window.OL_TABLE);
}
