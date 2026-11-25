// Daily missions and achievement badges.
// Missions: three a day (picked from the date, so everyone gets the same three), each paying a few chips when you
// claim it. Badges: one-off goals across all the games, each paying a small reward once. Progress is kept on this
// device. Games report what happened through UI.stats.add (blackjack, Hold'em, slots, prize wheel) or an
// 'ol-event' on window (baccarat, roulette, coin pusher, drinks).
(function () {
  if (!window.UI) return;
  const QKEY = 'ol-quests', AKEY = 'ol-ach';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const T = x => (window.I18N ? I18N.t(x) : x);

  // ---------- what can be asked of you ----------
  const MISSIONS = [
    { id: 'bj_hands', game: 'bj', n: 5, reward: 150, text: 'Play 5 hands of blackjack' },
    { id: 'bj_win', game: 'bj', n: 3, reward: 200, text: 'Win 3 hands of blackjack' },
    { id: 'bj_bj', game: 'bj', n: 1, reward: 250, text: 'Get a blackjack (an ace and a 10-value card)' },
    { id: 'he_hands', game: 'holdem', n: 6, reward: 150, text: "Play 6 hands of Texas Hold'em" },
    { id: 'he_win', game: 'holdem', n: 2, reward: 250, text: "Win 2 pots in Texas Hold'em" },
    { id: 'bc_hands', game: 'baccarat', n: 5, reward: 150, text: 'Play 5 coups of baccarat' },
    { id: 'bc_banker', game: 'baccarat', n: 2, reward: 200, text: 'Win 2 bets on Banker in baccarat' },
    { id: 'bc_player', game: 'baccarat', n: 2, reward: 200, text: 'Win 2 bets on Player in baccarat' },
    { id: 'rl_spins', game: 'roulette', n: 5, reward: 150, text: 'Spin the roulette wheel 5 times' },
    { id: 'rl_win', game: 'roulette', n: 3, reward: 200, text: 'Win on 3 roulette spins' },
    { id: 'sl_spins', game: 'slots', n: 20, reward: 150, text: 'Spin the slot machine 20 times' },
    { id: 'sl_big', game: 'slots', n: 1, reward: 250, text: 'Win 10 times your bet on one slot spin' },
    { id: 'pz_drops', game: 'pusher', n: 30, reward: 150, text: 'Drop 30 coins in the coin pusher' },
    { id: 'pz_bonus', game: 'pusher', n: 1, reward: 250, text: 'Get a bonus from the Lucky Gate' },
    { id: 'cl_plays', game: 'claw', n: 5, reward: 150, text: 'Play the claw machine 5 times' },
    { id: 'cl_win', game: 'claw', n: 1, reward: 200, text: 'Win a prize from the claw machine' },
    { id: 'drink', game: 'any', n: 1, reward: 100, text: 'Order a drink at any table' },
    { id: 'games3', game: 'any', n: 3, reward: 300, text: 'Play 3 different games today' },
  ];
  const BADGES = [
    { id: 'first_win', icon: '★', reward: 100, name: 'First Win', text: 'Win your first hand, spin or coup.' },
    { id: 'natural', icon: '21', reward: 200, name: 'Blackjack!', text: 'Get a natural blackjack.' },
    { id: 'double', icon: '×2', reward: 200, name: 'Double Trouble', text: 'Win a doubled blackjack hand.' },
    { id: 'split', icon: '⫽', reward: 200, name: 'Splitting Image', text: 'Win a hand after splitting.' },
    { id: 'showdown', icon: '♠', reward: 200, name: 'Show Them', text: "Win a showdown in Texas Hold'em." },
    { id: 'bigpot', icon: '◆', reward: 500, name: 'Big Pot', text: "Win 1,000 chips or more in one Hold'em hand." },
    { id: 'bc_natural', icon: '9', reward: 200, name: 'Natural Nine', text: 'Win a baccarat bet on a natural 8 or 9.' },
    { id: 'bc_tie', icon: '=', reward: 400, name: 'Dead Heat', text: 'Win a Tie bet in baccarat.' },
    { id: 'straight', icon: '35', reward: 400, name: 'Straight Up', text: 'Hit a single number in roulette.' },
    { id: 'zero', icon: '0', reward: 400, name: 'Green Zero', text: 'Win a bet on zero in roulette.' },
    { id: 'freespins', icon: '↻', reward: 300, name: 'Free Spins', text: 'Trigger free spins on the slot machine.' },
    { id: 'slot_jackpot', icon: '♛', reward: 1000, name: 'Jackpot', text: 'Hit the slot machine jackpot.' },
    { id: 'pz_gold', icon: '●', reward: 150, name: 'Gold Digger', text: 'Push a gold coin into the coin pusher tray.' },
    { id: 'pz_jackpot', icon: '✦', reward: 800, name: 'Pusher Jackpot', text: 'Hit the JACKPOT on the coin pusher bonus lamp.' },
    { id: 'pz_super', icon: '★', reward: 1000, name: 'Coin Flood', text: 'Win the coin pusher SUPER JACKPOT (three star coins).' },
    { id: 'cl_gold', icon: '▰', reward: 500, name: 'Golden Grab', text: 'Win a gold bar from the claw machine.' },
    { id: 'cl_happy', icon: '🍸', reward: 300, name: 'Happy Hour', text: 'Win all three kinds of cocktail from the claw machine.' },
    { id: 'cl_lucky', icon: '✪', reward: 800, name: 'Lucky Chip', text: 'Win the golden lucky chip from the claw machine.' },
    { id: 'cl_fullset', icon: '♠', reward: 1000, name: 'Full Set', text: 'Collect all ten collector decks from the poker claw machine.' },
    { id: 'cl_prism', icon: '◇', reward: 800, name: 'Prism Ace', text: 'Win the legendary Prism Ace deck.' },
    { id: 'cl_figs', icon: '♪', reward: 1500, name: 'Virtual Singers', text: 'Win all six figures from the figure claw machine.' },
    { id: 'cl_tako', icon: '🐙', reward: 300, name: 'Golden Takoyaki', text: 'Drop a ball into the gold hole of the takoyaki machine.' },
    { id: 'high_roller', icon: '$', reward: 300, name: 'High Roller', text: 'Bet 1,000 chips or more at once.' },
    { id: 'bartender', icon: '🍸', reward: 200, name: 'Regular at the Bar', text: 'Order 5 drinks.' },
    { id: 'explorer', icon: '⌂', reward: 500, name: 'Grand Tour', text: 'Play every game in the lounge.' },
    { id: 'streak3', icon: '3', reward: 600, name: 'Three-Day Streak', text: 'Finish all daily missions 3 days in a row.' },
    { id: 'days7', icon: '7', reward: 500, name: 'Week Regular', text: 'Play on 7 different days.' },
    { id: 'rich', icon: '¥', reward: 0, name: 'Big Stack', text: 'Have 20,000 chips at once.' },
  ];
  const GAMES = ['bj', 'holdem', 'baccarat', 'roulette', 'slots', 'pusher', 'claw'];

  // ---------- today's missions ----------
  function seedPick(day) {
    let h = 2166136261; for (const ch of day) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
    const pool = MISSIONS.slice(), out = [], used = new Set();
    while (out.length < 3 && pool.length) {
      const m = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      if (m.game !== 'any' && used.has(m.game)) continue;   // three different games
      if (m.game === 'any' && out.some(o => o.game === 'any')) continue;
      used.add(m.game); out.push(m.id);
    }
    return out;
  }
  let Q = load(QKEY, null);
  function freshDay() {
    const d = today();
    if (!Q || Q.day !== d) {
      const prevAll = Q && Q.ids && Q.ids.every(id => Q.claimed && Q.claimed[id]);
      Q = { day: d, ids: seedPick(d), prog: {}, claimed: {}, games: [], prevDay: Q ? Q.day : null, prevAll: !!prevAll };
      save(QKEY, Q);
    }
  }
  freshDay();
  let A = load(AKEY, { got: {}, drinks: 0, days: [], streak: 0, streakDay: '', played: [] });
  ['got', 'days', 'played'].forEach(k => { if (!A[k]) A[k] = k === 'got' ? {} : []; });

  // ---------- progress ----------
  const missionById = id => MISSIONS.find(m => m.id === id);
  function bump(id, by = 1) {
    freshDay();
    if (!Q.ids.includes(id) || Q.claimed[id]) return;
    const m = missionById(id), was = Q.prog[id] || 0;
    if (was >= m.n) return;
    Q.prog[id] = Math.min(m.n, was + by); save(QKEY, Q);
    if (Q.prog[id] >= m.n) { UI.toast(`${T('Mission complete:')} ${T(m.text)} · ${T('open Missions to claim')} +${fmt(m.reward)}`); UI.sfx('win'); }
    changed();
  }
  function unlock(id) {
    if (A.got[id]) return;
    const b = BADGES.find(x => x.id === id); if (!b) return;
    A.got[id] = Date.now(); save(AKEY, A);
    if (b.reward) UI.wallet.add(b.reward);
    showBadge(b);
    changed();
  }
  function played(game, stake) {
    freshDay();
    if (!Q.games.includes(game)) { Q.games.push(game); save(QKEY, Q); if (Q.ids.includes('games3') && (Q.prog.games3 || 0) < 3) bump('games3'); }
    const d = today();
    if (!A.days.includes(d)) { A.days.push(d); A.days = A.days.slice(-60); save(AKEY, A); if (A.days.length >= 7) unlock('days7'); }
    if (!A.played.includes(game)) { A.played.push(game); save(AKEY, A); if (GAMES.every(g => A.played.includes(g))) unlock('explorer'); }
    if (stake >= 1000) unlock('high_roller');
    if (UI.wallet.chips >= 20000) unlock('rich');
    changed();
  }
  const won = net => { if (net > 0) unlock('first_win'); };

  // blackjack, Hold'em, slots and the prize wheel already record every hand
  const origAdd = UI.stats.add.bind(UI.stats);
  UI.stats.add = (game, rec) => {
    const r = origAdd(game, rec);
    try { onRecord(game, rec || {}); } catch (e) { console.error(e); }
    return r;
  };
  function onRecord(game, rec) {
    if (game === 'bj') {
      const hands = rec.hands || [], stake = hands.reduce((a, h) => a + (h.bet || 0), 0);
      played('bj', stake); bump('bj_hands');
      if (rec.net > 0) { bump('bj_win'); won(rec.net); }
      if (hands.some(h => h.bj)) { bump('bj_bj'); unlock('natural'); }
      if (hands.some(h => h.dbl && h.net > 0)) unlock('double');
      if (hands.some(h => h.split && h.net > 0)) unlock('split');
    } else if (game === 'holdem') {
      played('holdem', 0); bump('he_hands');
      if (rec.net > 0) { bump('he_win'); won(rec.net); }
      if (rec.sd && rec.net > 0) unlock('showdown');
      if (rec.net >= 1000) unlock('bigpot');
    } else if (game === 'slots') {
      played('slots', rec.bet || 0); bump('sl_spins');
      if (rec.win > 0) won(rec.win - (rec.bet || 0));
      if (rec.bet > 0 && rec.win >= rec.bet * 10) bump('sl_big');
      if (rec.feature) unlock('freespins');
      if (rec.jackpot) unlock('slot_jackpot');
    } else if (game === 'wheel') {
      played('slots', 0);
    }
  }
  // the other games send events
  window.addEventListener('ol-event', e => {
    const d = e.detail || {};
    try {
      if (d.type === 'baccarat') {
        played('baccarat', d.stake || 0); bump('bc_hands'); won(d.net);
        const w = d.won || [];
        if (w.includes('banker')) bump('bc_banker');
        if (w.includes('player')) bump('bc_player');
        if (w.includes('tie')) unlock('bc_tie');
        if (d.natural && w.some(k => k !== 'tie')) unlock('bc_natural');
      } else if (d.type === 'roulette') {
        played('roulette', d.stake || 0); bump('rl_spins');
        if (d.back > 0) { bump('rl_win'); won(d.back - d.stake); }
        if (d.straight) unlock('straight');
        if (d.num === 0 && d.back > 0) unlock('zero');
      } else if (d.type === 'pusher-drop') {
        played('pusher', 0); bump('pz_drops');
      } else if (d.type === 'pusher-win') {
        won(d.v); if (d.gold) unlock('pz_gold');
      } else if (d.type === 'pusher-bonus') {
        if (d.k !== 'none') bump('pz_bonus');
        if (d.k === 'jackpot') unlock('pz_jackpot');
        if (d.k === 'super') unlock('pz_super');
      } else if (d.type === 'claw-play') {
        played('claw', 0); bump('cl_plays');
      } else if (d.type === 'claw-win') {
        bump('cl_win'); won(d.value);
        if (d.kind === 'bar') unlock('cl_gold');
        if (d.drinks >= 3) unlock('cl_happy');
        if (d.kind === 'golden') unlock('cl_lucky');
        if (d.decks >= 10) unlock('cl_fullset');
        if (d.kind === 'deck_holo') unlock('cl_prism');
        if (d.figs >= 6) unlock('cl_figs');
        if (d.kind === 'tako_gold') unlock('cl_tako');
      } else if (d.type === 'drink') {
        bump('drink'); A.drinks = (A.drinks || 0) + 1; save(AKEY, A); if (A.drinks >= 5) unlock('bartender');
      }
    } catch (err) { console.error(err); }
  });

  // ---------- claiming ----------
  function claim(id) {
    freshDay();
    const m = missionById(id);
    if (!m || Q.claimed[id] || (Q.prog[id] || 0) < m.n) return;
    Q.claimed[id] = true; save(QKEY, Q);
    UI.wallet.add(m.reward); UI.sfx('win');
    // all three done: keep the streak going
    if (Q.ids.every(x => Q.claimed[x])) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yd = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
      A.streak = A.streakDay === yd ? (A.streak || 0) + 1 : 1; A.streakDay = Q.day; save(AKEY, A);
      if (A.streak >= 3) unlock('streak3');
    }
    changed();
  }
  const claimable = () => { freshDay(); return Q.ids.filter(id => !Q.claimed[id] && (Q.prog[id] || 0) >= missionById(id).n).length; };
  function changed() { window.dispatchEvent(new CustomEvent('ol-quests', { detail: { claimable: claimable() } })); render(); }

  // ---------- the panel ----------
  let dlg = null;
  function untilReset() { const d = new Date(); d.setHours(24, 0, 0, 0); const ms = d - new Date(); return `${Math.floor(ms / 3.6e6)}h ${Math.floor((ms % 3.6e6) / 6e4)}m`; }
  function html() {
    freshDay();
    const ms = Q.ids.map(id => {
      const m = missionById(id), p = Q.prog[id] || 0, done = p >= m.n, got = !!Q.claimed[id];
      return `<li class="q-m ${got ? 'got' : done ? 'done' : ''}"><div class="q-t">${m.text}<div class="q-bar"><i style="width:${Math.round(p / m.n * 100)}%"></i></div><small>${p} / ${m.n}</small></div>
        <div class="q-r">${got ? '<span class="q-ok">Claimed</span>' : done ? `<button type="button" class="primary" data-claim="${id}">Claim +${fmt(m.reward)}</button>` : `<span class="q-rw">+${fmt(m.reward)}</span>`}</div></li>`;
    }).join('');
    const nGot = BADGES.filter(b => A.got[b.id]).length;
    const bs = BADGES.map(b => `<li class="q-b ${A.got[b.id] ? 'on' : ''}" title="${b.text}"><span class="q-ic">${b.icon}</span><b>${b.name}</b><small>${b.text}</small>${b.reward ? `<small class="q-rwd">+${fmt(b.reward)}</small>` : ''}</li>`).join('');
    return `<h2>Daily missions</h2><p class="sub">New missions every day at midnight (in ${untilReset()}). Finish all three ${A.streak ? `· streak <b>${A.streak}</b> day${A.streak > 1 ? 's' : ''}` : 'for a streak'}.</p>
      <ul class="q-list">${ms}</ul>
      <h2 class="q-h2">Badges <small>${nGot} / ${BADGES.length}</small></h2>
      <ul class="q-badges">${bs}</ul>
      <p class="sub">Missions and badges are kept on this device.</p>`;
  }
  function render() { if (dlg && dlg.open) { dlg.querySelector('.q-body').innerHTML = html(); } const inl = document.getElementById('questsInline'); if (inl) inl.innerHTML = html(); }
  function open() {
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.className = 'rules q-dlg'; dlg.id = 'questDlg';
      dlg.innerHTML = '<div class="q-body"></div><div class="rule-actions"><button type="button" class="primary" data-close>Done</button></div>';
      dlg.addEventListener('click', e => { if (e.target.closest('[data-close]')) dlg.close(); });
      document.body.appendChild(dlg);
    }
    dlg.querySelector('.q-body').innerHTML = html();
    dlg.showModal();
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-claim]'); if (b) claim(b.dataset.claim); });

  // a badge popping up
  const popQ = []; let popping = false;
  function showBadge(b) { popQ.push(b); if (!popping) nextPop(); }
  function nextPop() {
    const b = popQ.shift(); if (!b) { popping = false; return; }
    popping = true;
    const el = document.createElement('div'); el.className = 'q-pop'; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="q-ic">${b.icon}</span><div><small>Badge unlocked</small><b>${b.name}</b>${b.reward ? `<em>+${fmt(b.reward)} chips</em>` : ''}</div>`;
    document.body.appendChild(el); UI.sfx('win');
    setTimeout(() => el.classList.add('out'), 3000); setTimeout(() => { el.remove(); nextPop(); }, 3500);
  }
  // a Missions button in the plain header (the 3D pages put theirs among the header icons)
  function headerButton() {
    const right = document.querySelector('.top .top-right'); if (!right || document.getElementById('questBtn')) return;
    const b = document.createElement('button'); b.id = 'questBtn'; b.className = 'iconbtn'; b.type = 'button'; b.textContent = 'Missions'; b.onclick = open;
    const w = document.getElementById('wallet'); right.insertBefore(b, w && w.parentNode === right ? w : null);
    const paint = () => b.classList.toggle('dot', claimable() > 0); paint();
    window.addEventListener('ol-quests', paint);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', headerButton) : headerButton();
  window.addEventListener('focus', () => { const d = Q.day; freshDay(); if (Q.day !== d) changed(); });
  window.OLQ = { open, claimable, render, MISSIONS, BADGES };
})();
