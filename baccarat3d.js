// Baccarat (punto banco) at a 3D table. Bet on Player, Banker or Tie, press Deal; the cards follow the standard
// third-card rules. Player pays 1 to 1, Banker 19 to 20 (a 5% commission), Tie 8 to 1; on a tie, Player and
// Banker bets come back. Eight decks, reshuffled when the shoe runs low. A bead road shows the last results.
import { createCasino, barButton, tableChrome } from './casino3d.js?v=138';

const $ = s => document.querySelector(s);
const host = document.getElementById('table');
const C = host ? createCasino(host, 'baccarat') : null;
document.documentElement.classList.remove('t3d-wait');
if (C) {
  window.OL_CASINO = C;
  document.body.classList.add('t3d-on');
  barButton(C.wrap, C);
  const T = C.T, fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-US');
  const msg = document.createElement('div'); msg.className = 't3-msg'; msg.setAttribute('role', 'status'); C.wrap.appendChild(msg);
  const road = document.createElement('div'); road.className = 'bc-road'; road.setAttribute('aria-label', 'Last results'); C.wrap.appendChild(road);
  const say = h => { msg.innerHTML = h; $('#msg').innerHTML = h; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- the shoe ----------
  const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  let shoe = [];
  const shuffle = () => { shoe = []; for (let d = 0; d < 8; d++) for (let c = 0; c < 52; c++) shoe.push(c); for (let i = shoe.length - 1; i > 0; i--) { const j = rnd(i + 1); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; } };
  shuffle();
  const draw = () => { if (shoe.length < 6) shuffle(); return shoe.pop(); };
  const val = c => { const r = c >> 2; return r <= 7 ? r + 2 : r === 12 ? 1 : 0; };   // 2–9 face value, A = 1, 10/J/Q/K = 0
  const total = h => h.reduce((a, c) => a + val(c), 0) % 10;
  // the banker's third-card rule, given the player's third card (or null if the player stood)
  function bankerDraws(b, p3) {
    if (p3 == null) return b <= 5;
    const v = val(p3);
    if (b <= 2) return true;
    if (b === 3) return v !== 8;
    if (b === 4) return v >= 2 && v <= 7;
    if (b === 5) return v >= 4 && v <= 7;
    if (b === 6) return v === 6 || v === 7;
    return false;
  }

  // ---------- state ----------
  const store = UI.store, HKEY = 'ol-bc-road', CKEY = 'ol-bc-chip';
  const PAY = { player: 1, banker: 0.95, tie: 8 };
  let chip = (store.load(CKEY, { v: 25 }) || { v: 25 }).v;
  let bets = new Map(), undo = [], lastBets = null, busy = false, round = 0;
  let history = ((store.load(HKEY, { list: [] }) || {}).list || []).filter(x => 'PBT'.includes(x)).slice(-60);
  const staked = () => [...bets.values()].reduce((a, b) => a + b, 0);
  const YOU = { x: 0, z: 1.0 }, RACK = { x: 0, z: -0.5 };
  const zone = k => T.zones.find(z => z.key === k);

  // ---------- betting on the felt ----------
  C.onTableHover = (x, z) => !busy && x != null && !!T.zoneAt(x, z);
  C.onTableClick = (x, z) => { const q = T.zoneAt(x, z); if (q) placeBet(q); };
  function placeBet(q) {
    if (busy) return;
    if (staked() + chip > UI.wallet.chips) { say(UI.wallet.canClaim() ? 'Not enough chips. Claim your daily chips at the top.' : 'Not enough chips for that bet.'); return; }
    bets.set(q.key, (bets.get(q.key) || 0) + chip); undo.push([q.key, chip]);
    UI.sfx('chip'); paint();
  }
  $('#bcZones').onclick = e => { const b = e.target.closest('[data-zone]'); if (b) placeBet(zone(b.dataset.zone)); };
  function betStacks() { return [...bets].map(([k, n]) => { const q = zone(k); return { key: `r${round}b:${k}`, n, x: q.cx, z: q.cz, fromX: YOU.x, fromZ: YOU.z, toX: YOU.x, toZ: YOU.z }; }); }
  function paint(extraStacks = []) {
    if (!busy) C.setStacks(betStacks().concat(extraStacks));
    $('#bcTotal').textContent = fmt(staked());
    $('#bcDeal').disabled = busy || !staked();
    $('#bcUndo').disabled = busy || !undo.length;
    $('#bcClear').disabled = busy || !bets.size;
    $('#bcRebet').disabled = busy || !lastBets || !!bets.size;
    document.querySelectorAll('#bcChips [data-chip]').forEach(b => b.classList.toggle('on', +b.dataset.chip === chip));
    document.querySelectorAll('#bcZones [data-zone]').forEach(b => { b.disabled = busy; const n = bets.get(b.dataset.zone); b.dataset.n = n ? fmt(n) : ''; });
    paintRoad();
    const L = [...bets].map(([k, n]) => { const q = zone(k); return { key: 'bet-' + k, x: q.cx, y: 0.01, z: q.z0 + 0.035, html: `<span class="num">${fmt(n)}</span>`, cls: 'plate bet' }; });
    if (!busy) C.setLabels(L);
    if (!busy) say(staked() ? `Bet <b>${fmt(staked())}</b> · press Deal` : 'Tap Player, Banker or Tie (on the table or below) to bet, then Deal.');
  }
  // the bead road: one column per six results, newest last
  function paintRoad() {
    if (!history.length) { road.innerHTML = ''; return; }
    const list = history.slice(-36), cols = [];
    for (let i = 0; i < list.length; i += 6) cols.push(list.slice(i, i + 6));
    const cnt = k => history.filter(x => x === k).length;
    road.innerHTML = `<div class="bc-grid">${cols.map(c => `<div class="bc-col">${c.map((x, i) => `<i class="bc-b ${x}" title="${x === 'P' ? 'Player' : x === 'B' ? 'Banker' : 'Tie'}">${x === 'P' ? 'P' : x === 'B' ? 'B' : 'T'}</i>`).join('')}</div>`).join('')}</div>` +
      (history.length ? `<div class="bc-cnt"><span class="P">P ${cnt('P')}</span><span class="B">B ${cnt('B')}</span><span class="T">T ${cnt('T')}</span></div>` : '');
  }

  // ---------- one coup ----------
  const cardPos = (side, i) => {
    const sx = side === 'P' ? -1 : 1;
    if (i < 2) return { x: sx * (0.29 + (side === 'P' ? (1 - i) : i) * 0.115) * 1, z: 0.06 };
    return { x: sx * 0.58, z: 0.07, yaw: Math.PI / 2 };   // the third card lies sideways
  };
  async function deal() {
    if (busy || !staked()) return;
    const stake = staked();
    if (stake > UI.wallet.chips) { say('Not enough chips for these bets.'); return; }
    UI.wallet.add(-stake);
    busy = true; lastBets = new Map(bets); undo = [];
    paint(); C.setLabels([...bets].map(([k, n]) => { const q = zone(k); return { key: 'bet-' + k, x: q.cx, y: 0.01, z: q.z0 + 0.035, html: `<span class="num">${fmt(n)}</span>`, cls: 'plate bet' }; }));
    say('No more bets…');
    const P = [draw()], B = [draw()]; P.push(draw()); B.push(draw());
    const shown = { P: [false, false, false], B: [false, false, false] };
    const R = 'c' + round;
    const lay = () => {
      const list = [];
      P.forEach((c, i) => list.push({ key: `${R}P${i}`, c: shown.P[i] ? c : -1, ...cardPos('P', i) }));
      B.forEach((c, i) => list.push({ key: `${R}B${i}`, c: shown.B[i] ? c : -1, ...cardPos('B', i) }));
      C.setCards(list);
      const L = [...bets].map(([k, n]) => { const q = zone(k); return { key: 'bet-' + k, x: q.cx, y: 0.01, z: q.z0 + 0.035, html: `<span class="num">${fmt(n)}</span>`, cls: 'plate bet' }; });
      const pt = total(P.filter((_, i) => shown.P[i])), bt = total(B.filter((_, i) => shown.B[i]));
      if (shown.P[0]) L.push({ key: 'pt', x: -0.35, y: 0.12, z: -0.12, html: `Player <span class="num">${pt}</span>`, cls: 'plate' });
      if (shown.B[0]) L.push({ key: 'bt', x: 0.35, y: 0.12, z: -0.12, html: `Banker <span class="num">${bt}</span>`, cls: 'plate' });
      C.setLabels(L);
    };
    lay(); await sleep(1100);
    // the cards are turned one at a time: player first, then banker
    for (const [side, i] of [['P', 0], ['P', 1], ['B', 0], ['B', 1]]) { shown[side][i] = true; lay(); UI.sfx('card'); await sleep(side === 'P' && i === 1 ? 700 : 520); }
    let pt = total(P), bt = total(B), p3 = null;
    const natural = pt >= 8 || bt >= 8;
    if (natural) { say(`<b>Natural ${Math.max(pt, bt)}</b>`); await sleep(700); }
    else {
      if (pt <= 5) { p3 = draw(); P.push(p3); say('Player draws a third card'); lay(); await sleep(800); shown.P[2] = true; lay(); UI.sfx('card'); await sleep(700); pt = total(P); }
      if (bankerDraws(bt, p3)) { B.push(draw()); say('Banker draws a third card'); lay(); await sleep(800); shown.B[2] = true; lay(); UI.sfx('card'); await sleep(700); bt = total(B); }
    }
    // settle
    const res = pt > bt ? 'P' : bt > pt ? 'B' : 'T';
    let back = 0; const won = [];
    bets.forEach((n, k) => {
      if ((res === 'P' && k === 'player') || (res === 'B' && k === 'banker') || (res === 'T' && k === 'tie')) { back += n * (1 + PAY[k]); won.push(k); }
      else if (res === 'T' && k !== 'tie') back += n;   // Player and Banker bets push on a tie
    });
    back = Math.round(back * 100) / 100;
    if (back) UI.wallet.add(back);
    history.push(res); history = history.slice(-60); store.save(HKEY, { list: history });
    const net = Math.round((back - stake) * 100) / 100, name = res === 'P' ? 'Player' : res === 'B' ? 'Banker' : 'Tie';
    say(`<span class="win">${name} wins ${res === 'T' ? pt : Math.max(pt, bt)}${res === 'T' ? '' : ' to ' + Math.min(pt, bt)}</span><br>` +
      (net > 0 ? `You win <b class="good">+${fmt(net)}</b>` : net === 0 ? 'Your bet comes back.' : `<b class="bad">−${fmt(-net)}</b>`));
    if (net > 0) UI.sfx('win');
    // chips: losing bets to the rack, winners paid beside their bet, pushes stay
    const st = [];
    bets.forEach((n, k) => {
      const q = zone(k), win = won.includes(k), push = res === 'T' && k !== 'tie';
      st.push({ key: `r${round}b:${k}`, n, x: q.cx, z: q.cz, toX: win || push ? YOU.x : RACK.x, toZ: win || push ? YOU.z : RACK.z });
      if (win) st.push({ key: `r${round}p:${k}`, n: Math.round(n * PAY[k] * 100) / 100, x: q.cx + 0.08, z: q.cz + 0.02, fromX: RACK.x, fromZ: RACK.z, toX: YOU.x, toZ: YOU.z });
    });
    C.setStacks(st);
    paintRoad();
    window.dispatchEvent(new CustomEvent('ol-event', { detail: { type: 'baccarat', res, net, stake, natural, pt, bt, bets: Object.fromEntries(bets), won } }));
    await sleep(600);
    // losing chips go to the dealer now; winners and pushes stay a moment, then come back to you
    C.setStacks(st.filter(d => d.toX === YOU.x && d.toZ === YOU.z));
    await sleep(2200);
    round++; bets.clear(); busy = false;
    C.setCards([]); C.setStacks([]);
    paint();
  }

  // ---------- controls ----------
  $('#bcChips').onclick = e => { const b = e.target.closest('[data-chip]'); if (!b) return; chip = +b.dataset.chip; store.save(CKEY, { v: chip }); UI.sfx('chip'); paint(); };
  $('#bcUndo').onclick = () => { const u = undo.pop(); if (!u) return; const v = (bets.get(u[0]) || 0) - u[1]; if (v > 0) bets.set(u[0], v); else bets.delete(u[0]); paint(); };
  $('#bcClear').onclick = () => { bets.clear(); undo = []; paint(); };
  $('#bcRebet').onclick = () => {
    if (!lastBets || busy) return;
    const need = [...lastBets.values()].reduce((a, b) => a + b, 0);
    if (need > UI.wallet.chips) { say('Not enough chips to repeat the last bets.'); return; }
    bets = new Map(lastBets); undo = [...bets].map(([k, n]) => [k, n]); paint();
  };
  $('#bcDeal').onclick = deal;
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) { e.preventDefault(); deal(); } });
  function showRules() {
    let d = document.getElementById('bcRules');
    if (!d) { d = document.createElement('dialog'); d.id = 'bcRules'; d.className = 'rules'; document.body.appendChild(d); }
    d.innerHTML = `<h2>How baccarat works</h2>
      <p class="sub">Bet on which hand ends closer to 9: <b>Player</b> or <b>Banker</b>, or on a <b>Tie</b>. You don't make any decisions after the deal; the cards follow fixed rules.</p>
      <table class="pay-t">
        <tr><td>Card values</td><td>A = 1 · 2–9 = face value · 10, J, Q, K = 0. Only the last digit of the total counts (7 + 8 = 15 → 5).</td></tr>
        <tr><td>Natural</td><td>If either hand has 8 or 9 with two cards, nobody draws.</td></tr>
        <tr><td>Player</td><td>Draws a third card on 0–5, stands on 6–7.</td></tr>
        <tr><td>Banker</td><td>If the player stood, draws on 0–5. Otherwise it depends on the player's third card (the standard table).</td></tr>
      </table>
      <table class="pay-t"><tr><td>Player</td><td>1 to 1</td></tr><tr><td>Banker</td><td>19 to 20 (5% commission)</td></tr><tr><td>Tie</td><td>8 to 1 · Player and Banker bets come back</td></tr></table>
      <p class="sub">House edge: Banker 1.06%, Player 1.24%, Tie 14.4%. The bead road at the top right shows recent results; past results don't change the odds of the next coup.</p>
      <div class="rule-actions"><button type="button" class="primary" data-close>Done</button></div>`;
    d.onclick = e => { if (e.target.closest('[data-close]')) d.close(); };
    d.showModal();
  }
  tableChrome(C, [
    { icon: 'rules', label: 'Rules & payouts', onClick: showRules },
    { icon: 'cards', label: 'Card backs', onClick: () => UI.deckPicker() },
    { icon: 'full', label: 'Full screen', onClick: () => $('#fsBtn').click(), pressed: () => document.documentElement.dataset.immersive === '1' },
  ]);
  paint();
}
