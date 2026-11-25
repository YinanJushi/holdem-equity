// Roulette at a 3D table: click the felt to place chips, Spin, and the ball decides.
// European single zero: straight up pays 35 to 1, dozens and columns 2 to 1, red/black, odd/even and low/high 1 to 1.
import * as THREE from 'three';
import { createCasino, barButton, tableChrome } from './casino3d.js?v=145';

const $ = s => document.querySelector(s);
const host = document.getElementById('table');
const C = host ? createCasino(host, 'roulette') : null;
document.documentElement.classList.remove('t3d-wait');
if (C) {
  window.OL_CASINO = C;
  document.body.classList.add('t3d-on');
  barButton(C.wrap, C);
  const T = C.T, fmt = n => Math.round(n).toLocaleString('en-US');
  const msg = document.createElement('div'); msg.className = 't3-msg'; msg.setAttribute('role', 'status'); C.wrap.appendChild(msg);
  const hist = document.createElement('div'); hist.className = 'rl-hist'; hist.setAttribute('aria-label', 'Last numbers'); C.wrap.appendChild(hist);
  const say = h => { msg.innerHTML = h; $('#msg').innerHTML = h; };

  // ---------- state ----------
  const store = UI.store, HKEY = 'ol-rl-history', CKEY = 'ol-rl-chip';
  let chip = (store.load(CKEY, { v: 25 }) || { v: 25 }).v;
  let bets = new Map(), undo = [], lastBets = null, spinning = false, history = ((store.load(HKEY, { list: [] }) || {}).list || []).filter(n => Number.isInteger(n)).slice(-12);
  const total = () => [...bets.values()].reduce((a, b) => a + b, 0);
  const colorOf = n => (n === 0 ? 'green' : T.RED.has(n) ? 'red' : 'black');

  // ---------- table: hover highlight and chips ----------
  const hi = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.5), transparent: true, opacity: 0.28, depthWrite: false }));
  hi.rotation.x = -Math.PI / 2; hi.position.y = 0.002; hi.visible = false; C.scene.add(hi);
  const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.05, 24), new THREE.MeshPhysicalMaterial({ color: '#f2c14e', metalness: 0.9, roughness: 0.2, clearcoat: 1 }));
  mark.visible = false; mark.castShadow = true; C.scene.add(mark);
  C.onTableHover = (x, z) => {
    const c = x == null || spinning ? null : T.cellAt(x, z);
    hi.visible = !!c;
    if (c) { hi.position.set(c.cx, 0.002, c.cz); hi.scale.set(c.x1 - c.x0 - 0.006, c.z1 - c.z0 - 0.006, 1); }
    return !!c;
  };
  C.onTableClick = (x, z) => {
    if (spinning) return;
    const c = T.cellAt(x, z); if (!c) return;
    if (total() + chip > UI.wallet.chips) { say(UI.wallet.canClaim() ? 'Not enough chips. Claim your daily chips at the top.' : 'Not enough chips for that bet.'); return; }
    if (mark.visible) { mark.visible = false; }
    bets.set(c.key, (bets.get(c.key) || 0) + chip); undo.push([c.key, chip]);
    UI.sfx('chip'); paint();
  };
  const YOU = { x: 0.3, z: 0.95 }, DEALER = { x: -0.3, z: -0.55 };
  function paint(extra = []) {
    const cells = new Map(T.cells.map(c => [c.key, c]));
    C.setStacks([...bets].map(([k, n]) => ({ key: 'b:' + k, n, x: cells.get(k).cx, z: cells.get(k).cz, fromX: YOU.x, fromZ: YOU.z, toX: YOU.x, toZ: YOU.z })).concat(extra));
    $('#rlTotal').textContent = fmt(total());
    $('#rlSpin').disabled = spinning || !total();
    $('#rlUndo').disabled = spinning || !undo.length;
    $('#rlClear').disabled = spinning || !bets.size;
    $('#rlRebet').disabled = spinning || !lastBets || !!bets.size;
    document.querySelectorAll('#rlChips [data-chip]').forEach(b => b.classList.toggle('on', +b.dataset.chip === chip));
    hist.innerHTML = history.slice().reverse().map((n, i) => `<span class="rl-n ${colorOf(n)} ${i === 0 ? 'last' : ''}">${n}</span>`).join('');
    if (!spinning && !msg.innerHTML) say(total() ? `Bet <b>${fmt(total())}</b> · press Spin` : 'Click the layout to place chips, then Spin.');
  }

  // ---------- camera: glide to the wheel for the spin, then back to your seat ----------
  let camRaf = 0;
  function glide(toPos, toTarget, ms, then) {
    cancelAnimationFrame(camRaf);
    const fromPos = C.camera.position.clone(), dir = new THREE.Vector3(); C.camera.getWorldDirection(dir);
    const fromT = fromPos.clone().addScaledVector(dir, 1.2), t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / ms), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const pos = fromPos.clone().lerp(toPos, e), tg = fromT.clone().lerp(toTarget, e);
      C.debugCam = [pos.toArray(), tg.toArray()];
      if (p < 1) camRaf = requestAnimationFrame(step); else if (then) then();
    };
    camRaf = requestAnimationFrame(step);
  }

  // ---------- spin ----------
  function spin() {
    if (spinning || !total()) return;
    const stake = total();
    if (stake > UI.wallet.chips) { say('Not enough chips for these bets.'); return; }
    UI.wallet.add(-stake);
    spinning = true; lastBets = new Map(bets); undo = []; hi.visible = false; msg.innerHTML = '';
    say('No more bets…');
    paint();
    const r = new Uint32Array(1); crypto.getRandomValues(r);
    const num = r[0] % 37;
    glide(T.wheelCam.pos, T.wheelCam.target, 900);
    T.spin(num, () => settle(num, stake));
  }
  function settle(num, stake) {
    const cells = new Map(T.cells.map(c => [c.key, c]));
    let back = 0; const win = [];
    bets.forEach((n, k) => { const c = cells.get(k); if (c.nums.includes(num)) { back += n * (c.pay + 1); win.push(k); } });
    if (back) UI.wallet.add(back);
    history.push(num); history = history.slice(-12); store.save(HKEY, { list: history });
    const col = colorOf(num), net = back - stake;
    say(`<span class="win">${num} ${col === 'green' ? 'Zero' : col === 'red' ? 'Red' : 'Black'}</span><br>${back ? `You win <b class="good">${fmt(back)}</b> (net ${net >= 0 ? '+' : ''}${fmt(net)})` : `No win · <b class="bad">−${fmt(stake)}</b>`}`);
    if (back) UI.sfx('win');
    window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'roulette', num, stake, back, net, straight: win.some(k => /^n\d+$/.test(k)) } }));
    // the dolly marks the winning number; losing chips go to the croupier, winners get paid beside their bet
    const nc = cells.get('n' + num); mark.position.set(nc.cx, 0.025, nc.cz); mark.visible = true;
    const pay = win.map(k => { const c = cells.get(k); return { key: 'p:' + k, n: bets.get(k) * c.pay, x: c.cx + 0.03, z: c.cz + 0.025, fromX: DEALER.x, fromZ: DEALER.z, toX: YOU.x, toZ: YOU.z }; });
    // losing stacks are swept to the croupier
    C.setStacks([...bets].map(([k, n]) => ({ key: 'b:' + k, n, x: cells.get(k).cx, z: cells.get(k).cz, toX: win.includes(k) ? YOU.x : DEALER.x, toZ: win.includes(k) ? YOU.z : DEALER.z })));
    bets.forEach((n, k) => { if (!win.includes(k)) bets.delete(k); });
    paint(pay);
    setTimeout(() => {
      glide(C.seatNow().pos, C.seatNow().target, 900, () => { C.debugCam = null; });
      setTimeout(() => {   // you take your winnings back; the table clears for the next spin
        bets.clear(); spinning = false; paint(); msg.innerHTML = ''; paint();
      }, 1800);
    }, 1600);
  }

  // ---------- controls ----------
  $('#rlChips').onclick = e => { const b = e.target.closest('[data-chip]'); if (!b) return; chip = +b.dataset.chip; store.save(CKEY, { v: chip }); UI.sfx('chip'); paint(); };
  $('#rlUndo').onclick = () => { const u = undo.pop(); if (!u) return; const v = (bets.get(u[0]) || 0) - u[1]; if (v > 0) bets.set(u[0], v); else bets.delete(u[0]); paint(); };
  $('#rlClear').onclick = () => { bets.clear(); undo = []; paint(); };
  $('#rlRebet').onclick = () => {
    if (!lastBets || spinning) return;
    const need = [...lastBets.values()].reduce((a, b) => a + b, 0);
    if (need > UI.wallet.chips) { say('Not enough chips to repeat the last bets.'); return; }
    bets = new Map(lastBets); undo = [...bets].map(([k, n]) => [k, n]); paint();
  };
  $('#rlSpin').onclick = spin;
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) { e.preventDefault(); spin(); } });
  function showPays() {
    let d = document.getElementById('rlPays');
    if (!d) { d = document.createElement('dialog'); d.id = 'rlPays'; d.className = 'rules'; document.body.appendChild(d); }
    d.innerHTML = `<h2>Roulette payouts</h2><p class="sub">Single zero (37 pockets). Click the layout to bet; zero loses every outside bet.</p>
      <table class="pay-t"><tr><td>One number</td><td>35 to 1</td></tr><tr><td>Dozen (1st / 2nd / 3rd 12)</td><td>2 to 1</td></tr><tr><td>Column (2 to 1)</td><td>2 to 1</td></tr><tr><td>Red / Black, Odd / Even, 1–18 / 19–36</td><td>1 to 1</td></tr></table>
      <div class="rule-actions"><button type="button" class="primary" data-close>Done</button></div>`;
    d.onclick = e => { if (e.target.closest('[data-close]')) d.close(); };
    d.showModal();
  }
  tableChrome(C, [
    { icon: 'rules', label: 'Payouts', onClick: showPays },
    { icon: 'full', label: 'Full screen', onClick: () => $('#fsBtn').click(), pressed: () => document.documentElement.dataset.immersive === '1' },
  ]);
  paint();
}
