// Blackjack in 3D: turns the table description from blackjack.js into cards, chips and labels on a 3D table.
import { createCasino, barButton, tableChrome, analysisToggle } from './casino3d.js?v=92';

const host = document.getElementById('table');
const C = host ? createCasino(host, 'bj') : null;
document.documentElement.classList.remove('t3d-wait');
if (C) {
  window.OL_CASINO = C;
  document.body.classList.add('t3d-on');
  barButton(C.wrap, C);
  const press = id => () => { const el = document.getElementById(id); if (el) el.click(); };
  tableChrome(C, [
    { icon: 'rules', label: 'Rules', onClick: press('rulesBtn') },
    { icon: 'cards', label: 'Card backs', onClick: press('deckBtn') },
    { icon: 'analysis', label: 'Analysis', onClick: analysisToggle, pressed: () => document.body.classList.contains('t3-ana') },
    { icon: 'guess', label: 'Guess first', onClick: press('guessToggle'), pressed: () => !!(document.getElementById('guessToggle') || {}).checked },
    { icon: 'full', label: 'Full screen', onClick: press('fsBtn'), pressed: () => document.documentElement.dataset.immersive === '1' },
  ]);
  const msg = document.createElement('div'); msg.className = 't3-msg'; msg.setAttribute('aria-hidden', 'true'); C.wrap.appendChild(msg);

  const RACK = { x: 0, z: -0.5 }, YOU = { x: 0, z: 1.05 };
  const handX = (k, n) => (k - (n - 1) / 2) * 0.34;

  let round = 0, lastPhase = '';
  function render(st) {
    if (lastPhase === 'over' && st.phase !== 'over') round++;
    lastPhase = st.phase;
    const R = 'r' + round;
    msg.innerHTML = st.msg || ''; msg.hidden = !st.msg;
    // cards
    const list = [];
    st.dealer.forEach((c, i) => list.push({ key: R + 'd' + i, c, x: (i - (st.dealer.length - 1) / 2) * 0.115, z: -0.25 }));
    const n = st.hands.length;
    st.hands.forEach((h, k) => {
      const hx = handX(k, n);
      h.cards.forEach((c, i) => {
        // a doubled hand gets its last card turned sideways, like at a real table
        const side = h.doubled && i === 2;
        // cascade up and to the right, each card resting on the one before (no cards cutting through each other)
        const q = C.onPlane(hx - 0.021 * Math.min(1, h.cards.length - 1), 0.42, 0.42, i * 0.045, i * 0.042, i);
        list.push({ key: `${R}h${k}-${i}`, c, ...q, yaw: side ? Math.PI / 2 : 0 });
      });
    });
    C.setCards(list);

    // chips: your bet in the circle, winnings paid from the rack, losses taken to the rack
    const stacks = [];
    if (!n) { if (st.pendingBet > 0) stacks.push({ key: R + 'bet0', n: st.pendingBet, x: 0, z: 0.62, fromX: YOU.x, fromZ: YOU.z, toX: YOU.x, toZ: YOU.z }); }
    st.hands.forEach((h, k) => {
      const hx = handX(k, n), lost = h.res && h.net < 0;
      // a lost bet slides over to the dealer's rack; otherwise it sits in your circle
      stacks.push(lost ? { key: R + 'bet' + k, n: h.bet, x: RACK.x + (k - (n - 1) / 2) * 0.09, z: RACK.z + 0.08, toX: RACK.x, toZ: RACK.z }
        : { key: R + 'bet' + k, n: h.bet, x: hx, z: 0.62, fromX: YOU.x, fromZ: YOU.z, toX: YOU.x, toZ: YOU.z });
      if (h.res && h.net > 0) stacks.push({ key: R + 'pay' + k, n: h.net, x: hx - 0.07, z: 0.6, fromX: RACK.x, fromZ: RACK.z, toX: YOU.x, toZ: YOU.z });
    });
    C.setStacks(stacks);

    // labels
    const L = [];
    if (st.dealer.length) L.push({ key: 'dealer', x: 0, y: 0.07, z: -0.36, html: st.dealerLabel, cls: 'dealer' });
    st.hands.forEach((h, k) => {
      const hx = handX(k, n);
      const res = h.res ? ` <span class="${h.net > 0 ? 'good' : h.net < 0 ? 'bad' : ''}">${h.res}${h.net ? ' ' + (h.net > 0 ? '+' : '') + h.net : ''}</span>` : '';
      L.push({ key: 'hand' + k, x: hx, y: 0.1, z: 0.3, html: `${n > 1 ? `Hand ${k + 1} · ` : ''}${h.total}${h.doubled ? ' · doubled' : ''}${res}`, cls: h.active ? 'active' : '' });
    });
    const betShown = n ? st.hands.reduce((a, h) => a + (h.res && h.net < 0 ? 0 : h.bet), 0) : st.pendingBet;
    // float the bet above your chips (in front of the circle it would sit under the buttons)
    if (betShown > 0) L.push({ key: 'bet', x: 0, y: 0.11, z: 0.62, html: `Bet <span class="num">${betShown}</span>`, cls: 'plate bet' });
    L.push({ key: 'shoe', x: 0.85, y: 0.16, z: -0.32, html: `Shoe ${st.shoeLeft} · Count ${st.count >= 0 ? '+' : ''}${st.count}`, cls: 'small muted' });
    C.setLabels(L);
  }
  window.addEventListener('table-state', e => render(e.detail));
  if (window.OL_TABLE) render(window.OL_TABLE);
}
