// Texas Hold'em in 3D: turns the table description from app.js into seated opponents, cards, chips and labels.
// "Pick cards" mode needs the flat table (you click card spots), so the 3D view steps aside there.
import { createCasino, barButton, tableChrome, analysisToggle } from './casino3d.js?v=76';

const host = document.getElementById('table');
const C = host ? createCasino(host, 'holdem') : null;
document.documentElement.classList.remove('t3d-wait');
if (C) {
  window.OL_CASINO = C;
  barButton(C.wrap, C);
  const press = id => () => { const el = document.getElementById(id); if (el) el.click(); };
  // bet sizes as one-tap buttons in the row: each one raises straight to that amount (no pop-up, no slider)
  const bar = document.getElementById('betBar'), src = document.getElementById('sizes'), wrapR = document.getElementById('raiseWrap');
  if (bar && src && !document.getElementById('t3Sizes')) {
    const box = document.createElement('div'); box.id = 't3Sizes'; box.className = 't3-sizes';
    bar.querySelector('.bb-main').after(box);
    const paintSizes = () => {
      const can = wrapR && !wrapR.hidden;
      box.hidden = !can;
      box.innerHTML = can ? [...src.querySelectorAll('[data-to]')].map(b => { const lab = b.firstChild.textContent.trim().replace(/^(\d+(?:\.\d+)?)×$/, '$1× raise'); return `<button type="button" data-to="${b.dataset.to}" aria-label="Raise to ${b.dataset.to} (${lab})"><span>${b.dataset.to}</span><small>${lab}</small></button>`; }).join('') : '';
    };
    new MutationObserver(paintSizes).observe(src, { childList: true, subtree: true });
    if (wrapR) new MutationObserver(paintSizes).observe(wrapR, { attributes: true, attributeFilter: ['hidden'] });
    box.onclick = e => {
      const b = e.target.closest('[data-to]'); if (!b) return;
      const pick = src.querySelector(`[data-to="${b.dataset.to}"]`), go = document.getElementById('raiseBtn');
      if (pick) pick.click();
      if (go && !go.disabled) go.click();
    };
    paintSizes();
  }
  tableChrome(C, [
    { icon: 'rules', label: 'Rules', onClick: press('rulesBtn') },
    { icon: 'cards', label: 'Card backs', onClick: press('deckBtn') },
    { icon: 'analysis', label: 'Analysis', onClick: analysisToggle, pressed: () => document.body.classList.contains('t3-ana') },
    { icon: 'guess', label: 'Guess first', onClick: press('guessToggle'), pressed: () => !!(document.getElementById('guessToggle') || {}).checked },
    { icon: 'pick', label: 'Pick cards (flat table)', onClick: () => { const b = document.querySelector('#modeSeg [data-mode="manual"]'); if (b) b.click(); } },
    { icon: 'full', label: 'Full screen', onClick: press('fsBtn'), pressed: () => document.documentElement.dataset.immersive === '1' },
  ]);
  const msg = document.createElement('div'); msg.className = 't3-msg'; msg.setAttribute('aria-hidden', 'true'); C.wrap.appendChild(msg);
  const heroTag = document.createElement('div'); heroTag.className = 't3-hero'; heroTag.setAttribute('aria-hidden', 'true'); C.wrap.appendChild(heroTag);

  const POT = { x: 0, z: -0.17 }, HERO = { x: 0, z: 0.72 };
  const SHIRT = { rock: '#2a3a5a', tag: '#5a1a2a', lag: '#7a4a12', fish: '#2a6a5a', station: '#4a2a6a', maniac: '#8a1a1a' };
  const HAIR = ['#1a1208', '#5a3a1a', '#0a0a0a', '#7a7a7a', '#3a2a1a', '#8a6a3a', '#1a1208', '#2a1a12'];
  const STYLE = ['short', 'long', 'short', 'none', 'bun', 'short', 'long', 'short'];
  // opponents sit across the table from you, spread along the far side (left to right)
  const angle = (i, n) => { const span = Math.min(136, 42 * (n - 1)); return ((n === 1 ? 90 : 90 + span / 2 - i * (span / (n - 1))) * Math.PI) / 180; };
  const ring = (th, a, b) => ({ x: Math.cos(th) * a, z: -Math.sin(th) * b });

  // how far a seated player is from the table's padded rail (the table is a stadium 2.7 m by 1.5 m)
  const TA = 1.35, TB = 0.75;
  const inside = (x, z) => { const cx = Math.max(-(TA - TB), Math.min(TA - TB, x)); return Math.hypot(x - cx, z) <= TB; };
  function railDist(px, pz) { const L = Math.hypot(px, pz), ux = -px / L, uz = -pz / L; let d = 0; while (d < 1.5 && !inside(px + ux * d, pz + uz * d)) d += 0.004; return d - 0.045; }
  const PY = -0.12;   // seated players' height offset (table top = 0)
  let people = [], chairs = [], seatsFor = -1;
  function seatPeople(n, seats) {
    if (seatsFor === n) return;
    people.forEach(p => C.scene.remove(p)); chairs.forEach(c => C.scene.remove(c));
    people = []; chairs = [];
    for (let i = 0; i < n; i++) {
      const th = angle(i, n), p = ring(th, 1.62, 1.02), key = (seats[i] && seats[i].styleKey) || '';
      const person = C.person({ shirt: SHIRT[key] || ['#2a2a3a', '#3a2a4a', '#1a3a3a'][i % 3], skin: C.SKINS[(i * 2 + 1) % C.SKINS.length], hair: HAIR[i % HAIR.length], hairStyle: STYLE[i % STYLE.length], glasses: i % 4 === 2 });
      person.position.set(p.x, PY, p.z); person.rotation.y = Math.atan2(-p.x, -p.z); person.userData.railD = railDist(p.x, p.z);
      C.scene.add(person); people.push(person);
      const ch = ring(th, 1.7, 1.1); chairs.push(C.chair(ch.x, ch.z, Math.atan2(-ch.x, -ch.z) + Math.PI));
    }
    seatsFor = n;
  }
  // hands on the rail; folded players sit back with hands in their lap, the one to act leans in and reaches
  let tt = 0;
  (function loop() {
    tt += 1 / 60;
    people.forEach((p, i) => {
      const s = p.userData.seat || {}, ph = i * 1.7;
      const lean = s.folded ? -0.08 : s.acting ? 0.08 : 0;
      p.rotation.x += (lean - p.rotation.x) * 0.08;
      p.userData.head.rotation.y = s.acting ? Math.sin(tt * 2 + ph) * 0.12 : Math.sin(tt * 0.45 + ph) * 0.3;
      const rd = p.userData.railD, railY = 0.08 - PY, feltY = -PY;
      if (s.folded) { p.userData.reach('L', -0.11, 0.06, 0.14); p.userData.reach('R', 0.11, 0.06, 0.14); }
      else { p.userData.rest('L', rd, railY, feltY, 0.13 + Math.sin(tt * 0.7 + ph) * 0.004); p.userData.rest('R', rd, railY, feltY, 0.13, s.acting ? 0.015 + Math.abs(Math.sin(tt * 3)) * 0.01 : 0); }
    });
    requestAnimationFrame(loop);
  })();

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
    if (!st.heroFolded) st.hero.forEach((c, i) => { if (c != null) cards.push({ key: R + 'hero' + i, c, ...C.onPlane((i - 0.5) * 0.105, 0.44, 0.55, i * 0.012, 0, i), yaw: (i - 0.5) * -0.1 }); });
    // the board
    st.board.forEach((c, i) => { if (c != null) cards.push({ key: R + 'b' + i, c, x: (i - 2) * 0.112, z: 0.11, tilt: 0.3 }); });
    // opponents
    st.seats.forEach((s, i) => {
      const th = angle(i, st.n), cp = ring(th, 0.98, 0.5), bp = ring(th, 0.62, 0.32), sp = ring(th, 1.17, 0.64), hp = ring(th, 1.62, 1.02);
      if (people[i]) people[i].userData.seat = s;
      const shown = s.cards && s.cards[0] >= 0;
      if (shown) {
        // showdown: the two cards fly up off the felt and hang in the air in front of their owner, facing you
        const sp2 = ring(th, 0.8, 0.4);
        s.cards.forEach((c, k) => cards.push({ key: `${R}o${s.j}-${k}`, c, x: sp2.x + (k - 0.5) * 0.19, z: sp2.z + k * 0.006, y: 0.17, tilt: 1.3, yaw: (k - 0.5) * -0.12, float: true, scale: 1.7 }));
      } else if (s.cards) s.cards.forEach((c, k) => {
        const off = (k - 0.5) * 0.06;
        cards.push({ key: `${R}o${s.j}-${k}`, c, x: cp.x + Math.sin(th) * off, z: cp.z + Math.cos(th) * off, yaw: th - Math.PI / 2 + (k - 0.5) * 0.12, y: k * 0.0025 });
      });
      if (s.bet > 0) stacks.push({ key: `${R}bet${s.j}`, n: s.bet, x: bp.x, z: bp.z, fromX: sp.x, fromZ: sp.z, toX: POT.x, toZ: POT.z });
      if (s.stack > 0) stacks.push({ key: 'stack' + s.j, n: s.stack, x: sp.x, z: sp.z });
      const badge = st.button === s.j ? '' : st.sb === s.j && st.n > 1 ? '<i>SB</i>' : st.bb === s.j ? '<i>BB</i>' : '';
      L.push({ key: 'name' + s.j, x: hp.x, y: 0.3, z: hp.z, html: `${badge}<b>${s.name}</b>${s.style && st.n <= 4 ? ` · ${s.style}` : ''}${s.stack != null ? `<br><span class="num">${s.stack}</span>` : ''}`, cls: 'plate' + (s.acting ? ' active' : '') + (s.folded ? ' dim' : '') });
      if (s.last) L.push({ key: 'act' + s.j, x: cp.x, y: 0.09, z: cp.z, html: s.last, cls: 'act' });
      if (s.hand || s.won) { const rp = ring(th, 0.8, 0.4); L.push({ key: 'res' + s.j, x: rp.x, y: 0.5, z: rp.z, html: s.hand || 'Wins the pot', cls: s.won ? 'good' : '' }); }
      if (s.bet > 0) L.push({ key: 'betl' + s.j, x: bp.x, y: 0.0, z: bp.z + 0.05, html: String(s.bet), cls: 'small' });
    });
    // your chips
    if (st.heroBet > 0) { stacks.push({ key: R + 'bet0', n: st.heroBet, x: -0.12, z: 0.27, fromX: -0.2, fromZ: 0.6, toX: POT.x, toZ: POT.z }); L.push({ key: 'betl0', x: -0.12, y: 0, z: 0.32, html: String(st.heroBet), cls: 'small' }); }
    if (st.heroStack > 0) stacks.push({ key: 'stack0', n: st.heroStack, x: -0.2, z: 0.6 });
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
