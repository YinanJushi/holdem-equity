(function () {
  const { RANKS, SUIT_SYM, CAT_NAMES, evalN, handName, makeSim, straightHigh } = window.Engine;
  const $ = s => document.querySelector(s);
  const ITERS = 30000, CHUNK = 2500;
  const LENS = [0, 3, 4, 5];
  const LNAME = { 0: 'Preflop', 3: 'Flop', 4: 'Turn', 5: 'River' };
  const CATS = CAT_NAMES;
  const SB = 1, BB = 2;
  const RULE_KEY = 'ol-holdem-rules';
  const DEF_RULES = { opp: 3, stackBB: 100, ante: 0, potLimit: false, style: 'mixed' };
  const savedRules = window.UI ? UI.store.load(RULE_KEY, DEF_RULES) : null;
  let RULES = savedRules || { ...DEF_RULES };
  const startStack = () => RULES.stackBB * BB;
  // Opponent styles: call = calling-threshold multiplier (lower calls more), aggr = betting tendency, bluff = bluff frequency
  const STYLES = [
    { key: 'tight', name: 'Tight', call: 1.15, aggr: 0.45, bluff: 0.05 },
    { key: 'loose', name: 'Loose', call: 0.8, aggr: 0.45, bluff: 0.1 },
    { key: 'aggressive', name: 'Aggressive', call: 1.0, aggr: 0.85, bluff: 0.25 },
    { key: 'solid', name: 'Solid', call: 1.0, aggr: 0.6, bluff: 0.1 },
  ];

  // slots: 0,1 = your hole cards; 2..6 = board
  const S = {
    mode: 'random', opp: RULES.opp, slots: Array(7).fill(null), opps: [], deck: [],
    stage: 0, sel: 0, revealed: false, result: null,
    guessMode: false, guesses: {}, guessLog: [], guessLogged: new Set(),
    session: { hands: 0, wins: 0, profit: 0 },
    prev: Array(7).fill(null), styles: [], button: null,
    raiseTo: 0, raiseDec: -1, curAdvice: null,
  };
  let G = null; // betting state for the current hand (Play mode only)
  const cache = new Map();
  let token = 0, live = null;
  // Yield to the browser, then continue (MessageChannel isn't throttled like setTimeout)
  const chan = new MessageChannel();
  let pending = null;
  chan.port1.onmessage = () => { const f = pending; pending = null; if (f) f(); };
  const yieldThen = f => { pending = f; chan.port2.postMessage(0); };

  // ---------- helpers ----------
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rankLabel = c => { const r = RANKS[c >> 2]; return r === 'T' ? '10' : r; };
  const cardText = c => rankLabel(c) + SUIT_SYM[c & 3];
  const cardsText = cs => cs.map(cardText).join(' ');
  const pct = x => x.toFixed(1) + '%';
  const signed = x => (x >= 0 ? '+' : '') + x;
  const fmt = n => n.toLocaleString('en-US');
  const oppName = j => (j === 0 ? 'You' : 'Opponent ' + j);

  function cardHTML(c, cls = '', attr = '') {
    if (c == null) return `<div class="card empty ${cls}" ${attr}></div>`;
    const s = SUIT_SYM[c & 3];
    const rl = rankLabel(c), face = 'JQK'.includes(rl);
    return `<div class="card s${c & 3} ${face ? 'face' : ''} ${cls}" ${attr}><span class="r">${rl}</span><span class="r2">${s}</span><span class="pip">${face ? rl : s}</span></div>`;
  }
  const CHIP_COLORS = ['red', 'green', 'black', 'gold', 'white'];
  const chipStack = n => (window.UI ? UI.chips(n) : '');
  const sfx = t => window.UI && UI.sfx(t);

  const heroCards = () => (S.slots[0] != null && S.slots[1] != null ? [S.slots[0], S.slots[1]] : null);
  function boardLen() {
    const b = S.slots;
    if (b[2] == null || b[3] == null || b[4] == null) return 0;
    if (b[5] == null) return 3;
    if (b[6] == null) return 4;
    return 5;
  }
  const boardCards = (l = boardLen()) => S.slots.slice(2, 2 + l);

  const inGame = () => S.mode === 'random' && !!G;
  const activeIdx = () => G.players.map((p, j) => j).filter(j => j > 0 && !G.players[j].folded);
  const activeOpp = () => (inGame() ? activeIdx().length : S.opp);
  const nOppAt = l => (inGame() && G.cnt[l] != null ? G.cnt[l] : activeOpp());
  const keyFor = l => S.slots[0] + ',' + S.slots[1] + '|' + boardCards(l).join(',') + '|' + nOppAt(l);
  const guessKey = l => S.slots[0] + ',' + S.slots[1] + '|' + boardCards(l).join(',');
  function getRes(l) {
    const k = keyFor(l);
    return cache.get(k) || (live && live.key === k ? live.st : null);
  }
  const eqOf = r => (r && r.iters ? (r.eq / r.iters) * 100 : null);
  const isFinal = r => r && r.iters >= ITERS;

  // ---------- dealing ----------
  function dealOpps() {
    S.opps = [];
    for (let i = 0; i < S.opp; i++) S.opps.push([S.deck.pop(), S.deck.pop()]);
  }
  function newHand() {
    S.deck = shuffle([...Array(52).keys()]);
    S.slots = Array(7).fill(null);
    S.slots[0] = S.deck.pop(); S.slots[1] = S.deck.pop();
    dealOpps();
    S.revealed = false; S.result = null; S.stage = 1;
  }

  // ---------- betting engine ----------
  function put(i, a) {
    const p = G.players[i];
    a = Math.max(0, Math.min(a, p.stack));
    p.stack -= a; p.bet += a; p.total += a; G.pot += a;
    if (p.stack === 0) p.allin = true;
    if (a > 0) sfx('chip');
    if (i === 0) savePending();
  }
  function track() {
    const L = boardLen();
    // keep the last snapshot with opponents in it, so a hand won by folds is judged against who was still in
    if (!activeIdx().length && G.cnt[L] != null) return;
    G.cnt[L] = activeIdx().length;
    G.idx[L] = activeIdx();
  }
  const canActIdx = () => G.players.map((p, j) => j).filter(j => !G.players[j].folded && !G.players[j].allin);
  function nextIn(from) {
    for (let k = 1; k <= G.N; k++) { const j = (from + k) % G.N; if (G.need.has(j)) return j; }
    return -1;
  }
  // pot-limit: the biggest raise is to the current bet plus the pot after calling
  const potMax = i => { const p = G.players[i]; return G.curBet + G.pot + (G.curBet - p.bet); };
  function clearTimer() { if (G && G.timer) { clearTimeout(G.timer); G.timer = null; } }

  // ---------- wallet: each hand buys in from the shared chip wallet ----------
  const PENDING_KEY = 'ol-holdem-pending', MIN_BUYIN = 10 * BB;
  const savePending = () => { if (G && !G.over) UI.store.save(PENDING_KEY, { buyin: G.buyin, committed: G.players[0].total, mode: UI.wallet.mode }); };
  const clearPending = () => { try { localStorage.removeItem(PENDING_KEY); } catch (e) { } };
  // a hand left unfinished (page closed): the chips already in the pot are lost, the rest come back
  (function settleLeftHand() {
    const p = UI.store.load(PENDING_KEY, { buyin: 0, committed: 0 });
    if (p && p.buyin) {
      const back = Math.max(0, p.buyin - p.committed);
      if ((p.mode || 'local') === UI.wallet.mode) UI.wallet.add(back);
      else if ((p.mode || 'local') === 'local') UI.wallet.localAdd(back);
    }
    clearPending();
  })();
  function abandonHand() {
    if (G && !G.over) { UI.wallet.add(G.players[0].stack); clearPending(); }
  }

  function startGame() {
    clearTimer();
    abandonHand();
    const buyin = Math.min(startStack(), Math.floor(UI.wallet.chips));
    if (buyin < MIN_BUYIN) {
      G = null; S.stage = 0;
      update();
      $('#msg').innerHTML = UI.wallet.canClaim() ? 'Out of chips. Claim your daily chips at the top.' : 'Out of chips. Your next free chips arrive tomorrow.';
      return;
    }
    UI.wallet.add(-buyin);
    newHand();
    S.styles = S.styles.slice(0, S.opp);
    while (S.styles.length < S.opp) S.styles.push(RULES.style === 'mixed' ? STYLES[(Math.random() * STYLES.length) | 0] : STYLES.find(x => x.key === RULES.style));
    const N = S.opp + 1;
    S.button = S.button == null ? (Math.random() * N) | 0 : (S.button + 1) % N;
    G = {
      N, pot: 0, curBet: 0, minRaise: BB, need: new Set(), toAct: -1, players: [],
      cnt: {}, idx: {}, log: [], over: false, timer: null, foldInfo: null,
      heroWaiting: false, decId: 0, aiCache: new Map(), buyin,
    };
    // everyone sits with the same stack, so there are never side pots
    for (let i = 0; i < N; i++) G.players.push({ stack: buyin, bet: 0, total: 0, folded: false, allin: false, last: '', rs: 0, style: i ? S.styles[i - 1] : null });
    if (RULES.ante) G.players.forEach(p => { const a = Math.min(RULES.ante, p.stack); p.stack -= a; p.total += a; G.pot += a; });
    savePending();
    const btn = S.button;
    G.sb = N === 2 ? btn : (btn + 1) % N;
    G.bb = N === 2 ? (btn + 1) % N : (btn + 2) % N;
    put(G.sb, SB); put(G.bb, BB);
    G.players[G.sb].last = `SB ${SB}`; G.players[G.bb].last = `BB ${BB}`;
    G.curBet = BB;
    G.need = new Set(canActIdx());
    G.toAct = nextIn(G.bb);
    track();
    proceed();
  }

  function proceed() {
    clearTimer();
    if (!G || G.over) return;
    if (G.players.filter(p => !p.folded).length === 1) return finishHand(false);
    if (G.need.size === 0 || G.toAct < 0) return endRound();
    if (G.toAct === 0) {
      if (!G.heroWaiting) { G.heroWaiting = true; G.decId++; }
      update();
      return;
    }
    update();
    G.timer = setTimeout(() => {
      const i = G.toAct;
      const m = aiDecide(i);
      act(i, m.type, m.to);
      proceed();
    }, G.players[0].folded ? 150 : 650);
  }

  function act(i, type, to) {
    const p = G.players[i], toCall = G.curBet - p.bet;
    if (type === 'check' && toCall > 0) type = 'call';
    if (type === 'call' && toCall === 0) type = 'check';
    if (type === 'raise') {
      const max = RULES.potLimit ? Math.min(p.stack + p.bet, potMax(i)) : p.stack + p.bet;
      if (max <= G.curBet) type = 'call';
      else to = Math.round(Math.min(max, Math.max(to || 0, G.curBet + G.minRaise)));
    }
    if (type === 'fold') { p.folded = true; p.last = 'Fold'; }
    else if (type === 'check') p.last = 'Check';
    else if (type === 'call') { put(i, toCall); p.last = p.allin ? `All-in ${p.total}` : `Call ${toCall}`; }
    else {
      const was = G.curBet;
      put(i, to - p.bet);
      if (to - was >= G.minRaise) G.minRaise = to - was;
      G.curBet = Math.max(G.curBet, to);
      p.rs++;
      p.last = p.allin ? `All-in ${p.total}` : was === 0 ? `Bet ${to}` : `Raise to ${to}`;
      G.need = new Set(canActIdx().filter(j => j !== i));
    }
    G.need.delete(i);
    G.toAct = nextIn(i);
    track();
  }

  function endRound() {
    G.players.forEach(p => { p.bet = 0; p.rs = 0; });
    G.curBet = 0; G.minRaise = BB;
    const L = boardLen();
    if (L === 5) return finishHand(true);
    update();
    G.timer = setTimeout(() => {
      if (L === 0) { S.slots[2] = S.deck.pop(); S.slots[3] = S.deck.pop(); S.slots[4] = S.deck.pop(); S.stage = 2; }
      else if (L === 3) { S.slots[5] = S.deck.pop(); S.stage = 3; }
      else { S.slots[6] = S.deck.pop(); S.stage = 4; }
      G.players.forEach(p => { if (!p.folded && !p.allin) p.last = ''; });
      const ca = canActIdx();
      G.need = new Set(ca.length >= 2 ? ca : []);
      G.toAct = G.need.size ? nextIn(S.button) : -1;
      track();
      proceed();
    }, G.players[0].folded ? 300 : 900);
  }

  function finishHand(showdown) {
    clearTimer();
    const alive = G.players.map((p, j) => j).filter(j => !G.players[j].folded);
    let winners = alive, scores = null, best = null;
    if (showdown) {
      const buf = new Int32Array(7);
      boardCards(5).forEach((c, i) => (buf[2 + i] = c));
      scores = G.players.map((p, j) => { const cs = j ? S.opps[j - 1] : heroCards(); buf[0] = cs[0]; buf[1] = cs[1]; return evalN(buf, 7); });
      best = Math.max(...alive.map(j => scores[j]));
      winners = alive.filter(j => scores[j] === best);
    }
    const pot = G.pot, share = Math.floor(pot / winners.length);
    winners.forEach((j, k) => (G.players[j].stack += share + (k === 0 ? pot - share * winners.length : 0)));
    G.pot = 0; G.over = true;
    const heroNet = G.players[0].stack - G.buyin;
    UI.wallet.add(G.players[0].stack);
    clearPending();
    const heroWin = winners.includes(0) ? 1 / winners.length : 0;
    S.result = { type: showdown ? 'showdown' : 'fold', winners, scores, best, pot, heroNet, heroWin };
    S.revealed = true; S.stage = 5;
    S.session.hands++; S.session.profit += heroNet; S.session.wins += heroWin;
    recordHand(showdown, heroNet, heroWin);
    update();
    if (window.UI) UI.showTab('ana');
    if (heroWin > 0 && heroNet > 0) sfx('win');
    if (heroWin > 0 && heroNet > 0) chipShower(Math.min(40, 12 + Math.round(heroNet / 4)));
  }

  function recordHand(showdown, net, win) {
    const hero = G.players[0], log = G.log;
    const pre = log.filter(d => d.l === 0);
    const foldL = hero.folded ? G.foldInfo.l : null;
    const sawFlop = boardLen() >= 3 && foldL !== 0;
    UI.stats.add('holdem', {
      t: Date.now(), opp: G.N - 1, bb: BB, net, win, foldL,
      sd: showdown && !hero.folded,
      vpip: pre.some(d => d.kind !== 'fold' && (d.facing || d.kind === 'raise')),
      pfr: pre.some(d => d.kind === 'raise'),
      sawFlop,
      eq0: eqOf(getRes(0)), eqF: sawFlop ? eqOf(getRes(3)) : null,
      acts: log.map(d => [d.l, d.kind, d.facing ? 1 : 0, d.match == null ? -1 : d.match ? 1 : 0]),
    });
  }

  function chipShower(n) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fx = $('#fx'), H = fx.clientHeight + 60;
    let h = '';
    for (let i = 0; i < n; i++) {
      const c = CHIP_COLORS[(Math.random() * CHIP_COLORS.length) | 0];
      const dur = 1.2 + Math.random() * 1.3, delay = Math.random() * 0.6;
      h += `<div class="fall" style="left:${Math.random() * 100}%;animation-duration:${dur}s;animation-delay:${delay}s;--dy:${H}px;--rot:${(Math.random() * 720 - 360) | 0}deg"><span class="cstack" style="height:22px"><i class="disc ${c || 'red'}" style="--i:0"></i></span></div>`;
    }
    fx.innerHTML = h;
    setTimeout(() => { if (fx.innerHTML === h) fx.innerHTML = ''; }, 3200);
  }

  // Opponent AI: knows only its own cards; acts on equity, pot odds and its style
  function aiEquity(i) {
    const n = G.players.filter((q, j) => j !== i && !q.folded).length;
    if (n === 0) return 1;
    const k = i + '|' + boardLen() + '|' + n;
    if (G.aiCache.has(k)) return G.aiCache.get(k);
    const sim = makeSim(S.opps[i - 1], boardCards(), n);
    sim.run(1500);
    const e = sim.st.eq / sim.st.iters;
    G.aiCache.set(k, e);
    return e;
  }
  function aiDecide(i) {
    const p = G.players[i], st = p.style, L = boardLen();
    const n = G.players.filter((q, j) => j !== i && !q.folded).length;
    const e = aiEquity(i), ratio = e * (n + 1);
    const toCall = G.curBet - p.bet, pot = G.pot, r = Math.random();
    const potTo = f => Math.round(G.curBet + f * (pot + toCall));
    const capRaise = m => (m.type === 'raise' && p.rs >= 2 ? { type: toCall ? 'call' : 'check' } : m);
    if (L === 0) {
      const limp = G.players.filter((q, j) => j !== G.bb && !q.folded && q.bet === BB).length;
      if (ratio > 1.8 && r < st.aggr) return capRaise({ type: 'raise', to: G.curBet <= BB ? BB * 3 + limp * BB : G.curBet * 3 });
      if (toCall === 0) return ratio > 1.3 && r < st.aggr * 0.5 ? capRaise({ type: 'raise', to: BB * 3 + limp * BB }) : { type: 'check' };
      const thr = G.curBet <= BB ? 0.95 : 1.2;
      if (ratio >= thr * st.call) return { type: 'call' };
      if (r < st.bluff * 0.3 && toCall <= BB * 2) return { type: 'call' };
      return { type: 'fold' };
    }
    if (toCall === 0) {
      if (ratio > 1.7 && r < st.aggr) return capRaise({ type: 'raise', to: potTo(0.66) });
      if (ratio > 1.2 && r < st.aggr * 0.6) return capRaise({ type: 'raise', to: potTo(0.5) });
      if (r < st.bluff) return capRaise({ type: 'raise', to: potTo(0.5) });
      return { type: 'check' };
    }
    const need = toCall / (pot + toCall);
    if (ratio > 2.2 && e > need && r < st.aggr * 0.6) return capRaise({ type: 'raise', to: G.curBet * 3 });
    if (e >= need * st.call) return { type: 'call' };
    if (r < st.bluff * 0.25) return { type: 'call' };
    return { type: 'fold' };
  }

  // ---------- your actions ----------
  const moveKind = t => (t === 'fold' ? 'fold' : t === 'raise' ? 'raise' : 'passive');
  function heroAct(type, to) {
    if (!inGame() || G.over || G.toAct !== 0) return;
    const p = G.players[0], toCall = G.curBet - p.bet, L = boardLen();
    if (type === 'fold') G.foldInfo = { l: L, need: toCall > 0 ? (toCall / (G.pot + toCall)) * 100 : null, idx: activeIdx() };
    const adv = S.curAdvice;
    act(0, type, to);
    G.log.push({ l: L, mine: p.last, kind: moveKind(type), facing: toCall > 0, adv: adv ? adv.act : null, match: adv ? moveKind(adv.move.type) === moveKind(type) : null });
    G.heroWaiting = false;
    S.curAdvice = null;
    proceed();
  }
  function raiseBounds() {
    const p = G.players[0], max = RULES.potLimit ? Math.min(p.stack + p.bet, potMax(0)) : p.stack + p.bet;
    return { min: Math.min(max, G.curBet + G.minRaise), max };
  }
  function presets() {
    const p = G.players[0], toCall = G.curBet - p.bet, L = boardLen(), out = [];
    const potTo = f => Math.round(G.curBet + f * (G.pot + toCall));
    if (L === 0 && G.curBet <= BB) {
      const limp = G.players.filter((q, j) => j !== G.bb && !q.folded && q.bet === BB).length;
      [[2.5, '2.5 BB'], [3, '3 BB'], [4, '4 BB']].forEach(([m, l]) => out.push({ label: l, to: Math.round(m * BB + limp * BB) }));
    } else if (L === 0) {
      out.push({ label: '3×', to: G.curBet * 3 }, { label: '4×', to: G.curBet * 4 });
    } else {
      [[1 / 3, '⅓ pot'], [0.5, '½ pot'], [2 / 3, '⅔ pot'], [1, 'Pot']].forEach(([f, l]) => out.push({ label: l, to: potTo(f) }));
    }
    out.push(RULES.potLimit ? { label: 'Max (pot)', to: raiseBounds().max } : { label: 'All-in', to: p.stack + p.bet });
    return out;
  }
  function moveLabel(m) {
    if (m.type === 'fold') return 'Fold';
    if (m.type === 'check') return 'Check';
    if (m.type === 'call') return 'Call';
    const { min, max } = raiseBounds();
    if (max <= G.curBet) return 'Call';
    const t = Math.max(min, Math.min(max, m.to));
    const p = G.players[0];
    return t >= p.stack + p.bet ? `All-in ${t}` : G.curBet === 0 ? `Bet ${t}` : `Raise to ${t}`;
  }

  // ---------- pick-cards mode ----------
  function slotClick(i) {
    if (S.mode !== 'manual') return;
    if (S.sel === i && S.slots[i] != null) S.slots[i] = null;
    S.sel = i;
    update();
  }
  function advanceSel() {
    for (let k = 1; k <= 7; k++) { const j = (S.sel + k) % 7; if (S.slots[j] == null) { S.sel = j; return; } }
  }
  function pickCard(c) {
    const at = S.slots.indexOf(c);
    if (at >= 0) { S.slots[at] = null; S.sel = at; update(); return; }
    S.slots[S.sel] = c;
    advanceSel();
    update();
  }
  function randomPick() {
    const free = [...Array(52).keys()].filter(c => !S.slots.includes(c));
    if (S.slots[S.sel] != null) S.slots[S.sel] = null;
    pickCard(free[(Math.random() * free.length) | 0]);
  }

  // ---------- scheduler: one simulation per street, cached, interruptible ----------
  function schedule() {
    const my = ++token;
    live = null;
    const h = heroCards();
    if (!h) return;
    const L = boardLen();
    const todo = LENS.filter(l => l <= L && !cache.has(keyFor(l)));
    todo.sort((a, b) => (b === L) - (a === L)); // current street first
    const runNext = () => {
      if (my !== token) return;
      const l = todo.shift();
      if (l === undefined) { renderStats(); return; }
      const k = keyFor(l);
      const sim = makeSim(h, boardCards(l), nOppAt(l));
      live = { key: k, st: sim.st };
      const step = () => {
        if (my !== token) return;
        const t0 = performance.now();
        do sim.run(Math.min(CHUNK, ITERS - sim.st.iters));
        while (sim.st.iters < ITERS && performance.now() - t0 < 40);
        if (sim.st.iters >= ITERS) { cache.set(k, sim.st); live = null; renderStats(); runNext(); }
        else { renderStats(); yieldThen(step); }
      };
      step();
    };
    runNext();
  }

  // ---------- render: table ----------
  function slotHTML(i) {
    const c = S.slots[i];
    const cls = [];
    if (c != null && S.prev[i] !== c) cls.push('deal');
    if (S.mode === 'manual') { cls.push('clickable'); if (S.sel === i) cls.push('sel'); }
    return cardHTML(c, cls.join(' '), `data-slot="${i}"`);
  }
  function badges(j) {
    if (!inGame()) return '';
    let b = '';
    if (j === S.button) b += '<span class="badge d">D</span>';
    if (j === G.sb && G.N > 2) b += '<span class="badge">SB</span>';
    if (j === G.bb) b += '<span class="badge">BB</span>';
    return b;
  }
  function renderTable() {
    let b = '';
    for (let i = 2; i < 7; i++) b += slotHTML(i);
    $('#board').innerHTML = b;
    $('#hero').innerHTML = slotHTML(0) + slotHTML(1);
    $('#hero').classList.toggle('folded', inGame() && G.players[0].folded);
    if (inGame()) {
      const p = G.players[0], pot = G.over ? S.result.pot : G.pot;
      $('#potShow').innerHTML = `<span class="lbl">Pot</span>${chipStack(pot)}<b>${pot}</b>`;
      $('#heroInfo').innerHTML = `<span class="plate"><span class="ava you">You</span><span><span class="pname">${badges(0)}${p.last || 'You'}</span><br><span class="pstack">${p.stack}</span></span></span>`;
    } else {
      $('#potShow').innerHTML = '';
      $('#heroInfo').textContent = 'You';
    }
    renderSeats();
    $('#msg').innerHTML = tableMsg();
    if (S.slots.some((c, i) => c != null && S.prev[i] !== c)) sfx('card');
    S.prev = S.slots.slice();
  }
  function renderSeats() {
    const n = S.opp, R = S.result;
    let html = '';
    for (let i = 0; i < n; i++) {
      const j = i + 1;
      const th = n === 1 ? 90 : 210 - i * (240 / (n - 1));
      const rad = (th * Math.PI) / 180;
      const x = 50 + 43 * Math.cos(rad), y = 50 - 40 * Math.sin(rad);
      const o = S.opps[i], p = inGame() ? G.players[j] : null;
      let cards, extra = '';
      if (S.mode === 'random' && S.revealed && o) {
        cards = cardHTML(o[0], 'flip') + cardHTML(o[1], 'flip');
        if (p && p.folded) extra = '<div class="seat-hand">Folded</div>';
        else if (R) {
          const won = R.winners.includes(j);
          const name = R.scores ? handName(R.scores[j]) : '';
          if (won || name) extra = `<div class="seat-hand ${won ? 'win' : ''}">${won ? '' : ''}${name || 'Wins the pot'}</div>`;
        }
      } else if (p && !p.folded) cards = '<div class="card back"></div><div class="card back"></div>';
      else cards = '<div class="card ghost"></div><div class="card ghost"></div>';
      const cls = ['seat'];
      if (p && p.folded && !S.revealed) cls.push('folded');
      if (inGame() && !G.over && G.toAct === j) cls.push('acting');
      const st = p ? p.style : S.styles[i];
      const plate = `<div class="plate"><span class="ava ${st ? st.key : ''}">${st ? st.name[0] : j}</span><span><span class="pname">${badges(j)}Opp ${j}${st ? `<span class="pstyle"> · ${st.name}</span>` : ''}</span>${p ? `<br><span class="pstack">${p.stack}</span>` : ''}</span></div>`;
      const act = p && p.last && !S.revealed ? `<div class="seat-act">${p.last}</div>` : '';
      html += `<div class="${cls.join(' ')}" style="left:${x}%;top:${y}%"><div class="seat-cards">${cards}</div>${plate}${act}${extra}</div>`;
      // chips this player has put in on the current street, pushed toward the middle of the felt
      if (p && p.bet > 0 && !G.over) html += `<div class="betpos" style="left:${x + (50 - x) * 0.42}%;top:${y + (44 - y) * 0.42}%">${chipStack(p.bet)}<span>${p.bet}</span></div>`;
    }
    if (inGame() && !G.over && G.players[0].bet > 0) html += `<div class="betpos" style="left:33%;top:70%">${chipStack(G.players[0].bet)}<span>${G.players[0].bet}</span></div>`;
    $('#seats').innerHTML = html;
  }
  function tableMsg() {
    if (S.mode === 'random') {
      if (!G) return 'Press <b>Deal</b> to start';
      if (G.over) {
        const R = S.result;
        if (R.heroWin === 1) {
          const how = R.type === 'fold' ? 'everyone folded' : `with ${handName(R.best)}`;
          return `<span class="win">You win ${R.pot}</span><br>${how} · <b class="good">${signed(R.heroNet)}</b>`;
        }
        const names = R.winners.map(oppName).join(' & ');
        let s = R.type === 'fold' ? `${names} wins ${R.pot} (everyone else folded)` : `${names} ${R.winners.length > 1 ? 'split' : 'wins'} ${R.pot} with ${handName(R.best)}`;
        s += `<br>Your result: <b class="${R.heroNet >= 0 ? 'good' : 'bad'}">${signed(R.heroNet)}</b>`;
        return s;
      }
      if (G.players[0].folded) return "You folded. Let's see how it plays out…";
      if (G.toAct === 0) return 'Your turn';
      if (G.toAct > 0) return `Opponent ${G.toAct} is thinking…`;
      return '';
    }
    if (!heroCards()) return 'Pick your two hole cards first';
    const b = S.slots.slice(2);
    if (b.some(c => c != null) && boardLen() === 0) return 'The flop needs all 3 cards before odds are calculated';
    return '';
  }

  function renderControls() {
    const manual = S.mode === 'manual';
    $('#randomTools').hidden = manual || (inGame() && !G.over);
    $('#manualTools').hidden = !manual;
    $('#actionBtn').textContent = S.stage === 5 ? 'Next hand' : 'Deal';
    document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
    if (manual) {
      let h = '';
      for (let s = 0; s < 4; s++) for (let r = 12; r >= 0; r--) {
        const c = r * 4 + s;
        h += `<button class="pk s${s} ${S.slots.includes(c) ? 'used' : ''}" data-card="${c}">${cardText(c)}</button>`;
      }
      $('#picker').innerHTML = h;
    }
    renderBetBar();
    renderSession();
  }
  function renderBetBar() {
    const show = inGame() && !G.over && G.toAct === 0 && !G.players[0].folded;
    $('#betBar').hidden = !show;
    if (!show) return;
    const p = G.players[0], toCall = G.curBet - p.bet, { min, max } = raiseBounds();
    if (S.raiseDec !== G.decId) { S.raiseDec = G.decId; S.raiseTo = min; }
    S.raiseTo = Math.max(min, Math.min(max, Math.round(S.raiseTo)));
    $('#callBtn').textContent = toCall === 0 ? 'Check' : toCall >= p.stack ? `Call all-in ${p.stack}` : `Call ${toCall}`;
    const canRaise = max > G.curBet && toCall < p.stack;
    $('#raiseWrap').hidden = !canRaise;
    $('#raiseBtn').hidden = !canRaise;
    $('#raiseBtn').textContent = S.raiseTo >= p.stack + p.bet ? `All-in ${S.raiseTo}` : G.curBet === 0 ? `Bet ${S.raiseTo}` : `Raise to ${S.raiseTo}`;
    const rg = $('#raiseRange'), num = $('#raiseNum');
    rg.min = num.min = min; rg.max = num.max = max;
    rg.value = num.value = S.raiseTo;
    $('#sizes').innerHTML = presets().map(x => {
      const t = Math.max(min, Math.min(max, x.to));
      return `<button data-to="${t}" class="${t === S.raiseTo ? 'on' : ''}">${x.label}<small>${t}</small></button>`;
    }).join('');
    renderAdviceBtn();
  }
  function renderAdviceBtn() {
    const b = $('#adviceBtn'), a = S.curAdvice;
    if (!a || !inGame()) { b.disabled = true; b.textContent = 'Working out advice…'; return; }
    b.disabled = false;
    b.textContent = 'Follow advice: ' + moveLabel(a.move);
  }
  function renderSession() {
    const ss = S.session;
    let h = '';
    if (ss.hands) {
      h += `Hands played <b>${ss.hands}</b> · Won <b>${+ss.wins.toFixed(1)}</b> · Session result <b class="${ss.profit >= 0 ? 'good' : 'bad'}">${signed(ss.profit)}</b> chips (${signed(+(ss.profit / BB).toFixed(1))} big blinds)`;
      h += `<br>Each hand buys in for up to ${startStack()} chips from your wallet · Blinds ${SB}/${BB}`;
    }
    if (S.guessLog.length) {
      const avg = S.guessLog.reduce((a, b) => a + b, 0) / S.guessLog.length;
      const rank = avg < 5 ? 'Pro-level read ' : avg < 10 ? 'Seasoned ' : avg < 18 ? 'Getting there ' : 'Rookie, keep practicing ';
      h += `${h ? '<br>' : ''}${S.guessLog.length} guesses, average miss <b>${avg.toFixed(1)}</b> points · ${rank}`;
    }
    $('#session').innerHTML = h;
  }

  // ---------- render: stats panel ----------
  function renderStats() {
    const h = heroCards();
    $('#statsEmpty').hidden = !!h;
    $('#statsMain').hidden = !h;
    if (!h) return;
    const L = boardLen(), cur = getRes(L), nOpp = activeOpp(), fair = 100 / (nOpp + 1);
    const veiled = S.guessMode && !(guessKey(L) in S.guesses);
    $('#guessBox').hidden = !veiled;
    $('#info').classList.toggle('veiled', veiled);
    renderGuessResult(L, cur);

    $('#streetTag').textContent = nOpp ? `${LNAME[L]} · vs ${nOpp} opponent${nOpp > 1 ? 's' : ''}` : `${LNAME[L]} · all opponents folded`;
    const eq = eqOf(cur);
    if (eq != null) {
      const win = (cur.win / cur.iters) * 100, tie = (cur.tie / cur.iters) * 100, lose = 100 - win - tie;
      const big = $('#eqBig');
      big.textContent = pct(eq);
      big.style.color = eq >= fair * 1.3 ? 'var(--up)' : eq <= fair * 0.7 ? 'var(--down)' : 'var(--text)';
      $('#bWin').style.width = win + '%'; $('#bTie').style.width = tie + '%'; $('#bLose').style.width = lose + '%';
      $('#eqSub').innerHTML = `Win ${pct(win)} · Tie ${pct(tie)} · Lose ${pct(lose)}<br>Table average ${pct(fair)} (1 / ${nOpp + 1})`;
      $('#prog').textContent = isFinal(cur) ? `Based on ${fmt(ITERS)} Monte Carlo simulations` : `Simulating… ${fmt(cur.iters)} / ${fmt(ITERS)}`;
      const idx = LENS.indexOf(L);
      const prevEq = idx > 0 ? eqOf(getRes(LENS[idx - 1])) : null;
      const d = prevEq == null ? null : eq - prevEq;
      $('#eqDelta').innerHTML = d == null ? '' :
        `<span class="delta ${d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat'}">${d > 0.5 ? '▲' : d < -0.5 ? '▼' : '■'} ${d >= 0 ? '+' : ''}${d.toFixed(1)}</span>`;
      $('#comment').innerHTML = commentary(eq, d, fair, L);
    }
    renderChart(L, fair);
    renderAnalysis(h, L, cur);
    renderHandNow(h, L);
    renderHeat(cur, L);
    renderCats(cur);
    renderPot();
    renderSession();
  }

  function commentary(eq, d, fair, L) {
    const ratio = eq / fair;
    if (L === 0) return ratio > 1.8 ? 'Premium hand' : ratio > 1.25 ? 'Above average' : ratio > 0.9 ? 'Playable; depends on position' : 'Weak; usually a fold';
    const st = LNAME[L].toLowerCase();
    const change = d >= 15 ? `Big help on the ${st}` : d >= 5 ? `Improved on the ${st}` : d > -5 ? `Little change on the ${st}` : d > -15 ? `Worse after the ${st}` : `Badly hurt by the ${st}`;
    return change + (ratio > 2 ? '; likely the best hand' : ratio > 1.2 ? '; ahead of average' : ratio > 0.8 ? '; close spot' : '; probably behind');
  }

  function renderChart(L, fair) {
    const W = 340, H = 170, pl = 34, pr = 16, pt = 22, pb = 26;
    const xs = i => pl + (i * (W - pl - pr)) / 3;
    const ys = v => pt + (1 - v / 100) * (H - pt - pb);
    const pts = [];
    LENS.forEach((l, i) => {
      if (l > L) return;
      const e = eqOf(getRes(l));
      if (e == null) return;
      if (S.guessMode && l === L && !(guessKey(L) in S.guesses)) return;
      pts.push({ x: xs(i), y: ys(e), v: e });
    });
    let g = '';
    [0, 25, 50, 75, 100].forEach(v => {
      g += `<line class="c-grid" x1="${pl}" x2="${W - pr}" y1="${ys(v)}" y2="${ys(v)}"/><text class="c-ax" x="${pl - 6}" y="${ys(v) + 4}" text-anchor="end">${v}</text>`;
    });
    g += `<line class="c-fair" x1="${pl}" x2="${W - pr}" y1="${ys(fair)}" y2="${ys(fair)}"/><text class="c-ax" x="${W - pr}" y="${ys(fair) - 5}" text-anchor="end">avg ${fair.toFixed(0)}%</text>`;
    LENS.forEach((l, i) => (g += `<text class="c-ax" x="${xs(i)}" y="${H - 6}" text-anchor="middle">${LNAME[l]}</text>`));
    if (pts.length) {
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
      if (pts.length > 1) g += `<path class="c-area" d="${line} L${pts[pts.length - 1].x},${ys(0)} L${pts[0].x},${ys(0)} Z"/>`;
      g += `<path class="c-line" d="${line}"/>`;
      pts.forEach(p => (g += `<circle class="c-dot" cx="${p.x}" cy="${p.y}" r="4.5"/><text class="c-txt" x="${p.x}" y="${p.y - 10}" text-anchor="middle">${p.v.toFixed(0)}%</text>`));
    }
    $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Your odds on each street">${g}</svg>`;
  }

  function preflopInfo(h) {
    let [a, b] = h, ra = a >> 2, rb = b >> 2;
    if (rb > ra) [ra, rb] = [rb, ra];
    const suited = (a & 3) === (b & 3);
    if (ra === rb) return { label: RANKS[ra] + RANKS[rb], desc: 'Pocket pair' };
    const parts = [suited ? 'Suited' : 'Offsuit'];
    if (ra - rb === 1) parts.push('connectors');
    else if (ra - rb === 2) parts.push('one-gapper');
    if (rb >= 8) parts.push('two big cards');
    else if (ra === 12) parts.push('ace-high');
    return { label: RANKS[ra] + RANKS[rb] + (suited ? 's' : 'o'), desc: parts.join(' · ') };
  }
  function draws(h, b, cat) {
    const out = [];
    if (cat >= 4) return out;
    const cards = [...h, ...b];
    for (let s = 0; s < 4; s++) {
      if (cards.filter(c => (c & 3) === s).length === 4 && h.some(c => (c & 3) === s)) out.push('flush draw');
    }
    let all = 0;
    cards.forEach(c => (all |= 1 << (c >> 2)));
    let comp = 0;
    for (let r = 0; r < 13; r++) if (!(all & (1 << r)) && straightHigh(all | (1 << r)) >= 0) comp++;
    if (comp >= 2) out.push('open-ended straight draw'); else if (comp === 1) out.push('gutshot straight draw');
    return out;
  }
  function renderHandNow(h, L) {
    if (L === 0) {
      const p = preflopInfo(h);
      $('#handNow').innerHTML = `<div class="hn-big">${p.label}</div><div class="hn-sub">${p.desc}</div>`;
      return;
    }
    const b = boardCards(L), all = [...h, ...b];
    const sc = evalN(all, all.length);
    const tags = draws(h, b, sc >> 20).map(t => t[0].toUpperCase() + t.slice(1));
    if (L === 5 && evalN(b, 5) === sc) tags.push("You're playing the board; your hole cards don't count");
    $('#handNow').innerHTML = `<div class="hn-big">${handName(sc)}</div>` +
      (tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : '');
  }

  function renderHeat(cur, L) {
    const sec = $('#heatSec');
    if (!(L === 3 || L === 4) || !cur || !cur.iters) { sec.hidden = true; return; }
    sec.hidden = false;
    $('#heatTitle').textContent = L === 3 ? 'How each turn card changes your odds' : 'How each river card changes your odds';
    const curEq = eqOf(cur);
    const known = new Set(S.slots.slice(0, 2 + L));
    const list = [];
    let h = '';
    for (let s = 0; s < 4; s++) for (let r = 12; r >= 0; r--) {
      const c = r * 4 + s;
      if (known.has(c) || !cur.nextN[c]) { h += `<div class="hc s${s} dead">${cardText(c)}</div>`; continue; }
      const cond = (cur.next[c] / cur.nextN[c]) * 100, diff = cond - curEq;
      list.push({ c, cond, diff });
      const a = Math.min(0.85, Math.abs(diff) / 25 + 0.06);
      const bg = diff >= 0 ? `rgba(79,209,139,${a})` : `rgba(255,107,107,${a})`;
      h += `<div class="hc s${s}" style="background:${bg}" title="If ${cardText(c)} comes: ${pct(cond)} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)})">${cardText(c)}</div>`;
    }
    $('#heat').innerHTML = h;
    list.sort((x, y) => y.diff - x.diff);
    const good = list.filter(x => x.diff >= 10).length, bad = list.filter(x => x.diff <= -10).length;
    const f = x => `${cardText(x.c)} ${pct(x.cond)}`;
    $('#heatSum').innerHTML =
      `<div class="legend"><span>◀ Red: bad for you</span><span>Green: good for you ▶</span></div>` +
      `Big helpers <b class="good">${good}</b> cards (+10% or more) · Danger cards <b class="bad">${bad}</b> (−10% or more)<br>` +
      `Hoping for: ${list.slice(0, 3).map(f).join(', ')}<br>Dreading: ${list.slice(-3).reverse().map(f).join(', ')}` +
      (isFinal(cur) ? '' : '<br><i>(still simulating; numbers will sharpen)</i>');
  }

  function renderCats(cur) {
    if (!cur || !cur.iters) { $('#cats').innerHTML = ''; return; }
    let h = '';
    for (let c = 8; c >= 0; c--) {
      const p = (cur.cat[c] / cur.iters) * 100;
      if (p < 0.05) continue;
      h += `<div class="cat-row"><span>${CATS[c]}</span><div class="cb"><i style="width:${p}%"></i></div><span>${p < 1 ? p.toFixed(2) : p.toFixed(1)}%</span></div>`;
    }
    $('#cats').innerHTML = h;
  }

  // ---------- betting advice ----------
  // ctx (Play mode): { curBet, unopened, limpers }; null in Pick-cards mode
  function advise(eq, P, C, L, ctx) {
    const nOpp = activeOpp(), fair = 100 / (nOpp + 1), ratio = eq / fair;
    const h = heroCards(), b = boardCards(L);
    let drawList = [];
    if (L === 3 || L === 4) { const all = [...h, ...b]; drawList = draws(h, b, evalN(all, all.length) >> 20); }
    const drawsTxt = drawList.join(' and ');
    const hasDraw = drawList.length > 0, multi = nOpp >= 3;
    const n = x => Math.max(1, Math.round(x));
    const curBet = ctx ? ctx.curBet : C;
    const unopened = L === 0 && (ctx ? ctx.unopened : C <= 0);
    const limp = ctx ? ctx.limpers : 0;
    const why = [];
    let act, cls, size = '', move;
    why.push(`Your odds are ${pct(eq)}, ${ratio.toFixed(1)}× the table average (${pct(fair)})`);

    if (unopened) {
      const openTo = BB * 3 + limp * BB, smallTo = Math.round(BB * 2.5 + limp * BB);
      if (ratio >= 1.5) {
        act = 'Raise'; cls = 'raise'; move = { type: 'raise', to: openTo };
        size = ctx ? `Raise to ${openTo} (${openTo / BB} big blinds${limp ? `, +1 BB for each of ${limp} limper${limp > 1 ? 's' : ''}` : ''})` : 'Raise to 2.5–3 big blinds, plus 1 big blind for each player who already called';
        why.push('Strong starting hand: raising wins more and thins the field');
      } else if (ratio >= 1.1) {
        act = 'Raise is fine'; cls = 'call'; move = { type: 'raise', to: smallTo };
        size = ctx ? `Raise to ${smallTo}; folding is also OK if you act early` : 'From late position raise to 2.5 big blinds; from early position you can fold';
        why.push('A bit better than average, and better the later your position');
      } else if (ctx && C <= 0) {
        act = 'Check'; cls = 'call'; move = { type: 'check' };
        why.push("You're in the big blind and nobody raised, so see the flop for free");
      } else {
        act = 'Fold'; cls = 'fold'; move = { type: 'fold' };
        if (!ctx) size = "If you're in the big blind and nobody raised, check for a free flop";
        why.push('Weak starting hand; playing it loses money over time');
      }
    } else if (C <= 0) {
      if (eq >= 75 || ratio >= 2.2) {
        act = 'Bet for value'; cls = 'raise'; move = { type: 'raise', to: n(P * 0.66) };
        size = `Bet ⅔–¾ pot ≈ ${n(P * 0.66)}–${n(P * 0.75)}`;
        why.push("You're probably ahead; make worse hands pay");
        if (L < 5) why.push('A bigger bet also charges opponents who are drawing');
      } else if (ratio >= 1.25) {
        act = 'Small bet'; cls = 'raise'; move = { type: 'raise', to: n(P * 0.4) };
        size = `Bet ⅓–½ pot ≈ ${n(P * 0.33)}–${n(P * 0.5)}`;
        why.push('Ahead but not by much: a small bet gets value, protects your hand and limits losses if raised');
      } else if (hasDraw && !multi) {
        act = 'Semi-bluff'; cls = 'bluff'; move = { type: 'raise', to: n(P * 0.5) };
        size = `Bet about ½ pot ≈ ${n(P * 0.5)}`;
        why.push(`You have a ${drawsTxt}: if they fold you win now, and if they call you can still hit`);
      } else if (hasDraw) {
        act = 'Check'; cls = 'call'; move = { type: 'check' };
        why.push(`You have a ${drawsTxt}, but bluffs rarely work against many players; take a free card`);
      } else if (ratio >= 0.8) {
        act = 'Check'; cls = 'call'; move = { type: 'check' };
        why.push('Medium strength: check and keep the pot small');
      } else {
        act = L === 5 ? 'Check and give up' : 'Check, fold to a bet'; cls = 'fold'; move = { type: 'check' };
        why.push("You're probably behind; don't put more chips in");
      }
    } else {
      const need = (C / (P + C)) * 100;
      why.push(`Calling ${n(C)} to win a pot of ${n(P + C)} needs at least ${pct(need)} equity`);
      if ((eq >= 70 || ratio >= 2.2) && eq > need) {
        act = 'Raise'; cls = 'raise'; move = { type: 'raise', to: n(curBet * 3) };
        size = `Raise to about 3× their bet ≈ ${n(curBet * 3)}`;
        why.push('Your hand is strong; just calling leaves money on the table');
      } else if (eq >= need && !(L === 0 && ratio < 0.9)) {
        act = 'Call'; cls = 'call'; move = { type: 'call' };
        why.push('You have enough equity; calling makes money over time');
      } else if (hasDraw && eq >= need * 0.75) {
        act = 'Call is OK'; cls = 'bluff'; move = { type: 'call' };
        why.push(`Slightly short, but with a ${drawsTxt} you'll often get paid when you hit (implied odds)`);
      } else {
        act = 'Fold'; cls = 'fold'; move = { type: 'fold' };
        why.push(L === 0 && eq >= need ? 'The price looks OK, but this hand plays badly after the flop; fold to raises' : 'Not enough equity; calling loses over time');
      }
    }
    if (hasDraw && !why.some(w => w.includes('draw'))) why.push(`You also have a ${drawsTxt} to fall back on`);
    if (multi && L > 0) why.push(`${nOpp} opponents: someone likely has a good hand, so bluff less and bet big only with strong hands`);
    return { act, cls, size, why, move };
  }

  function renderPot() {
    const L = boardLen(), eq = eqOf(getRes(L)), g = inGame();
    $('#potInputs').hidden = g;
    S.curAdvice = null;
    const say = t => { $('#advice').innerHTML = `<p class="sub">${t}</p>`; $('#potVerdict').innerHTML = ''; renderAdviceBtn(); };
    let P, C, ctx = null;
    if (g) {
      if (G.over) { $('#potInfo').textContent = ''; return say('This hand is over. Check the replay above, then deal the next one.'); }
      const p = G.players[0];
      $('#potInfo').innerHTML = `Pot <b>${G.pot}</b> · To call <b>${G.curBet - p.bet}</b> · Your stack <b>${p.stack}</b>`;
      if (p.folded) return say('You folded.');
      if (G.toAct !== 0) return say("Waiting for opponents… advice appears when it's your turn.");
      P = G.pot; C = G.curBet - p.bet;
      ctx = {
        curBet: G.curBet,
        unopened: L === 0 && G.curBet <= BB,
        limpers: G.players.filter((q, j) => j !== G.bb && j !== 0 && !q.folded && q.bet === BB).length,
      };
    } else {
      $('#potInfo').textContent = '';
      P = Math.max(0, +$('#pot').value || 0); C = Math.max(0, +$('#call').value || 0);
    }
    if (eq == null) { $('#advice').innerHTML = ''; $('#potVerdict').innerHTML = ''; renderAdviceBtn(); return; }
    const a = advise(eq, P, C, L, ctx);
    if (g) S.curAdvice = a;
    $('#advice').innerHTML =
      `<div class="adv ${a.cls}"><div class="adv-act"><small>Advice</small>${a.act}</div>` +
      (a.size ? `<div class="adv-size">${a.size}</div>` : '') +
      `<ul>${a.why.slice(1, 3).map(w => `<li>${w}</li>`).join('')}</ul></div>`;
    if (C <= 0) $('#potVerdict').innerHTML = '';
    else {
      const e = eq / 100, ev = e * P - (1 - e) * C, ok = ev >= 0;
      $('#potVerdict').innerHTML = `Calling ${ok ? 'wins' : 'loses'} <b class="${ok ? 'good' : 'bad'}">${Math.abs(ev).toFixed(1)}</b> chips on average (this bet only).`;
    }
    renderAdviceBtn();
  }

  function renderGuessResult(L, cur) {
    const box = $('#guessResult'), key = guessKey(L);
    if (!S.guessMode || !(key in S.guesses)) { box.hidden = true; return; }
    box.hidden = false;
    const g = S.guesses[key], eq = eqOf(cur);
    if (!isFinal(cur)) { box.innerHTML = `You guessed <b>${g}%</b>. Calculating the real odds…`; return; }
    const err = Math.abs(g - eq);
    if (!S.guessLogged.has(key)) { S.guessLogged.add(key); S.guessLog.push(err); }
    const v = err < 3 ? 'Spot on!' : err < 8 ? 'Very close' : err < 15 ? 'A little off' : 'Way off';
    box.innerHTML = `You guessed <b>${g}%</b>, actual <b>${pct(eq)}</b>, off by <b>${err.toFixed(1)}</b> points · ${v}`;
  }

  // ---------- hand analysis ----------
  const anaCache = new Map();
  const popcount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

  // Enumerate every possible two-card opponent hand and count how many beat you right now
  function combosVs(h, b) {
    const k = h.join(',') + '|' + b.join(',');
    if (anaCache.has(k)) return anaCache.get(k);
    const dead = new Set([...h, ...b]), rest = [];
    for (let c = 0; c < 52; c++) if (!dead.has(c)) rest.push(c);
    const buf = new Int32Array(7), n = 2 + b.length;
    b.forEach((c, i) => (buf[2 + i] = c));
    buf[0] = h[0]; buf[1] = h[1];
    const hs = evalN(buf, n);
    let total = 0, better = 0, tie = 0;
    const byCat = new Array(9).fill(0);
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
      buf[0] = rest[i]; buf[1] = rest[j];
      const s = evalN(buf, n);
      total++;
      if (s > hs) { better++; byCat[s >> 20]++; } else if (s === hs) tie++;
    }
    const res = { hs, total, better, tie, byCat };
    if (anaCache.size > 300) anaCache.clear();
    anaCache.set(k, res);
    return res;
  }

  function texture(b) {
    const sc = [0, 0, 0, 0], rc = new Array(13).fill(0);
    let mask = 0;
    b.forEach(c => { sc[c & 3]++; rc[c >> 2]++; mask |= 1 << (c >> 2); });
    const wins = [0x100f];
    for (let h = 4; h <= 12; h++) wins.push(0x1f << (h - 4));
    return {
      maxS: Math.max(...sc),
      paired: rc.some(x => x >= 2),
      straight: wins.some(w => popcount(mask & w) >= 3),
    };
  }
  function textureLines(t, L) {
    const out = [];
    if (t.maxS >= 4) out.push(`${t.maxS} cards of one suit on board: any card of that suit makes a flush`);
    else if (t.maxS === 3) out.push('3 cards of one suit on board: anyone holding two of that suit already has a flush');
    else if (t.maxS === 2 && L < 5) out.push('Two cards of one suit: someone may be on a flush draw');
    if (t.paired) out.push('The board is paired, so full houses and quads are possible');
    if (t.straight) out.push('The board is connected; straights are possible');
    if (!out.length) out.push("Dry board: no straight or flush threats, so whoever is ahead usually stays ahead");
    return out;
  }
  function strengthWord(ratio) {
    return ratio > 2 ? 'well ahead' : ratio > 1.3 ? 'in good shape' : ratio > 0.8 ? 'about average' : ratio > 0.5 ? 'behind' : 'far behind';
  }

  function streetAnalysis(h, L, eq) {
    const nOpp = activeOpp();
    const b = boardCards(L), fair = 100 / (nOpp + 1), ratio = eq / fair;
    let html = '<h4>Where you stand</h4><p>';
    html += `You hold <b>${cardsText([...h].sort((x, y) => y - x))}</b>` + (L === 0 ? ', with no board cards yet. ' : `; the board is <b>${cardsText(b)}</b> and you have <b>${handName(evalN([...h, ...b], 2 + L))}</b>. `);
    html += nOpp ? `Against ${nOpp} opponent${nOpp > 1 ? 's' : ''} your odds are <b>${pct(eq)}</b>, which is ${strengthWord(ratio)} (average ${pct(fair)}).</p>` : 'Every opponent has folded.</p>';
    if (inGame() && !G.over) {
      const folded = G.players.slice(1).filter(p => p.folded).length;
      if (folded) html += `<p class="sub">${folded} opponent${folded > 1 ? 's have' : ' has'} folded; odds only count players still in the hand.</p>`;
    }

    if (L === 0) {
      const pair = (h[0] >> 2) === (h[1] >> 2), suited = (h[0] & 3) === (h[1] & 3);
      html += '<h4>What the flop may bring</h4><ul>';
      if (pair) {
        html += '<li>About <b>11.8%</b> of the time you flop three of a kind (a set), and you will almost always win</li>';
        html += '<li>Otherwise, watch out for flop cards higher than your pair</li>';
      } else {
        html += '<li>About <b>32%</b> of the time you pair at least one hole card</li>';
        html += '<li>About <b>2%</b> of the time you flop two pair or better</li>';
      }
      if (suited) html += '<li>Suited cards: about <b>11%</b> to flop a flush draw, <b>0.8%</b> to flop a flush</li>';
      if (nOpp >= 4) html += `<li>Against ${nOpp} opponents one pair rarely holds up; you need to improve after the flop</li>`;
      html += '</ul>';
      return html;
    }

    // what this street changed
    const prevL = LENS[LENS.indexOf(L) - 1];
    const newCards = L === 3 ? b : [b[L - 1]];
    const prevEq = eqOf(getRes(prevL));
    const nowCat = evalN([...h, ...b], 2 + L) >> 20;
    const prevCat = prevL === 0 ? ((h[0] >> 2) === (h[1] >> 2) ? 1 : 0) : evalN([...h, ...boardCards(prevL)], 2 + prevL) >> 20;
    const tNow = texture(b), tPrev = prevL >= 3 ? texture(boardCards(prevL)) : { maxS: 0, paired: false, straight: false };
    const events = [];
    if (nowCat > prevCat) events.push(`Your hand went from ${CATS[prevCat]} to <b>${CATS[nowCat]}</b>`);
    if (prevL > 0) {
      if (tNow.maxS >= 3 && tPrev.maxS < 3) events.push('this card makes a flush possible');
      if (tNow.paired && !tPrev.paired) events.push('the board paired');
      if (tNow.straight && !tPrev.straight) events.push('a straight is now possible');
    }
    if (!events.length) events.push('Your hand category did not change');
    html += `<h4>What the ${LNAME[L].toLowerCase()} ${cardsText(newCards)} changed</h4><p>`;
    if (prevEq != null) {
      const d = eq - prevEq;
      html += `Odds ${pct(prevEq)} → <b>${pct(eq)}</b> (<span class="${d >= 0 ? 'good' : 'bad'}">${d >= 0 ? '+' : ''}${d.toFixed(1)}</span>). `;
    }
    html += events.join('; ') + '.</p>';

    html += `<h4>Board texture</h4><ul>${textureLines(tNow, L).map(x => `<li>${x}</li>`).join('')}</ul>`;

    // threats
    if (nOpp) {
      const cv = combosVs(h, b);
      const p = cv.better / cv.total;
      const atLeastOne = 1 - Math.pow(1 - p, nOpp);
      html += '<h4>Who might already beat you</h4><p>';
      if (cv.better === 0) html += 'Right now <b>no two cards beat you</b>. You hold the nuts (the best possible hand).';
      else {
        const top = cv.byCat.map((k, c) => ({ k, c })).filter(x => x.k).sort((a, z) => z.k - a.k).slice(0, 3);
        html += `Of the ${fmt(cv.total)} two-card hands an opponent could hold, <b>${fmt(cv.better)}</b> (${pct(p * 100)}) beat you right now, mostly ${top.map(x => `${CATS[x.c]} (${x.k})`).join(', ')}.`;
        if (nOpp > 1) html += ` With ${nOpp} opponents, the chance at least one is already ahead is about <b>${pct(atLeastOne * 100)}</b>.`;
      }
      html += '</p>';
    }

    // outs
    const cur = getRes(L);
    if (L < 5 && cur && isFinal(cur)) {
      let outs = 0;
      for (let c = 0; c < 52; c++) if (cur.nextN[c] && (cur.next[c] / cur.nextN[c]) * 100 - eq >= 15) outs++;
      if (outs) {
        const rule = Math.min(100, outs * (L === 3 ? 4 : 2));
        html += `<h4>Outs</h4><p>About <b>${outs}</b> cards would raise your odds by 15% or more. By the "rule of 4 and 2" (outs × ${L === 3 ? 4 : 2}), your chance to hit ${L === 3 ? 'by the river' : 'on the river'} is about <b>${rule}%</b>.</p>`;
      }
    }
    return html;
  }

  // After the hand: your real odds on a street once opponents' cards are known (idx = opponents still in at that point)
  function realEquity(l, idx) {
    const hero = heroCards(), b = boardCards(l), opps = idx.map(j => S.opps[j - 1]);
    if (!opps.length) return 100;
    const dead = new Set([...hero, ...b, ...S.opps.flat()]);
    const rest = [];
    for (let c = 0; c < 52; c++) if (!dead.has(c)) rest.push(c);
    const need = 5 - l, buf = new Int32Array(7);
    b.forEach((c, i) => (buf[2 + i] = c));
    const score = () => {
      buf[0] = hero[0]; buf[1] = hero[1];
      const hs = evalN(buf, 7);
      let ties = 0;
      for (const o of opps) { buf[0] = o[0]; buf[1] = o[1]; const s = evalN(buf, 7); if (s > hs) return 0; if (s === hs) ties++; }
      return 1 / (ties + 1);
    };
    let sum = 0, n = 0;
    if (need === 0) { sum = score(); n = 1; }
    else if (need === 1) { for (const c of rest) { buf[6] = c; sum += score(); n++; } }
    else if (need === 2) {
      for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) { buf[5] = rest[i]; buf[6] = rest[j]; sum += score(); n++; }
    } else {
      for (let it = 0; it < 20000; it++) {
        for (let i = 0; i < 5; i++) { const j = i + ((Math.random() * (rest.length - i)) | 0); [rest[i], rest[j]] = [rest[j], rest[i]]; buf[2 + i] = rest[i]; }
        sum += score(); n++;
      }
    }
    return (sum / n) * 100;
  }

  function reviewAnalysis() {
    const R = S.result, heroFolded = G.players[0].folded;
    const lastL = heroFolded ? G.foldInfo.l : boardLen();
    if (!R.review) {
      R.review = LENS.filter(l => l <= lastL).map(l => ({
        l, real: realEquity(l, heroFolded && l === lastL ? G.foldInfo.idx : G.idx[l] || []),
      }));
    }
    const rv = R.review;
    rv.forEach(r => (r.seen = eqOf(getRes(r.l))));
    const last = rv[rv.length - 1];
    const st = l => LNAME[l].toLowerCase();
    let html = '<h4>Hand replay</h4>';

    let verdict;
    if (heroFolded) {
      const fi = G.foldInfo;
      if (fi.need == null) verdict = `You folded on the ${st(fi.l)} when you could have checked for free (your real odds were ${pct(last.real)}). With no bet to call, checking is never worse than folding.`;
      else if (last.real < fi.need) verdict = `✓ <b>Good fold!</b> When you folded on the ${st(fi.l)} your real odds were only ${pct(last.real)}, and calling needed ${pct(fi.need)}.`;
      else verdict = `That fold <b>gave up value</b>: on the ${st(fi.l)} your real odds were ${pct(last.real)}, above the ${pct(fi.need)} you needed to call. You couldn't see their cards, so don't be too hard on yourself.`;
    } else if (R.type === 'fold') {
      verdict = last.real < 50
        ? `<b>Pressure worked!</b> Everyone folded even though you were behind (real odds ${pct(last.real)}), and you took down ${R.pot}.`
        : `Everyone folded and you won ${R.pot}. You were ahead anyway (real odds ${pct(last.real)}).`;
    } else {
      const won = R.heroWin === 1, lost = R.heroWin === 0;
      const preRiver = rv.slice(0, 3).map(r => r.real);
      const maxReal = Math.max(...preRiver), minReal = Math.min(...preRiver);
      if (lost && rv[2].real >= 70) verdict = `<b>Bad beat!</b> On the turn your real odds were ${pct(rv[2].real)}, and the river still turned it around. You played it right; that's luck.`;
      else if (lost && maxReal >= 60) verdict = `You were ahead at one point (best real odds ${pct(maxReal)}), but your opponent caught up.`;
      else if (lost) verdict = `Your opponent led the whole way (your real odds never got above ${pct(maxReal)}). Getting out earlier would have saved chips.`;
      else if (won && rv[2].real <= 30) verdict = `<b>Lucky comeback!</b> On the turn your real odds were only ${pct(rv[2].real)}, and the river saved you.`;
      else if (won && minReal <= 35) verdict = `You fell behind along the way (lowest real odds ${pct(minReal)}) and fought back to win.`;
      else if (won) verdict = `You led from start to finish (your real odds never dropped below ${pct(minReal)}).`;
      else verdict = 'You split the pot.';
    }
    html += `<div class="verdict">${verdict}<br>Your result this hand: <b class="${R.heroNet >= 0 ? 'good' : 'bad'}">${signed(R.heroNet)}</b> chips.</div>`;

    html += '<table class="rv"><tr><th>Street</th><th>Odds you saw</th><th>Real odds</th><th>Gap</th></tr>';
    rv.forEach(r => {
      const gap = r.seen == null ? null : r.seen - r.real;
      html += `<tr><td>${LNAME[r.l]}</td><td>${r.seen == null ? '—' : pct(r.seen)}</td><td><b>${pct(r.real)}</b></td><td class="${gap == null ? '' : gap > 0 ? 'bad' : 'good'}">${gap == null ? '' : (gap > 0 ? '+' : '') + gap.toFixed(0)}</td></tr>`;
    });
    html += '</table><p class="sub">"Odds you saw" assumes opponents hold random cards. "Real odds" uses the actual cards of the opponents still in the hand.</p>';

    if (rv.length > 1) {
      let key = null;
      for (let i = 1; i < rv.length; i++) {
        const d = rv[i].real - rv[i - 1].real;
        if (!key || Math.abs(d) > Math.abs(key.d)) key = { i, d };
      }
      const l = rv[key.i].l;
      const keyCards = l === 3 ? boardCards(3) : [S.slots[2 + l - 1]];
      html += `<p><b>Key card:</b> the ${st(l)} ${cardsText(keyCards)} moved your real odds from ${pct(rv[key.i - 1].real)} to ${pct(rv[key.i].real)}.</p>`;
    }

    const off = rv.filter(r => (r.l === 3 || r.l === 4) && r.seen != null).map(r => r.seen - r.real);
    if (off.some(g => g >= 25)) html += "<p>After the flop the odds you saw were <b>too optimistic</b>: your opponents' real hands were much stronger than random. Players who keep calling or raising usually have something.</p>";
    else if (off.some(g => g <= -25)) html += "<p>The odds you saw were <b>too pessimistic</b>: your opponents' hands were weak, and you could have bet more for value.</p>";

    if (G.log.length) {
      const matched = G.log.filter(d => d.match).length, judged = G.log.filter(d => d.match != null).length;
      html += `<h4>Your decisions${judged ? ` (${matched}/${judged} matched the advice)` : ''}</h4><ul>`;
      html += G.log.map(d => `<li>${LNAME[d.l]}: you chose "${d.mine}"${d.adv ? `, advice was "${d.adv}" ${d.match ? '✓' : '✗'}` : ''}</li>`).join('');
      html += '</ul>';
    }

    if (R.type === 'showdown') {
      const alive = G.players.map((p, j) => j).filter(j => j > 0 && !G.players[j].folded);
      const best = alive.map(j => ({ j, s: R.scores[j] })).sort((a, z) => z.s - a.s)[0];
      if (best) html += `<p>Best opponent hand at showdown: Opponent ${best.j} with <b>${cardsText(S.opps[best.j - 1])}</b> (${handName(best.s)}).</p>`;
    }
    html += '<p class="sub">Press <b>Next hand</b> or the space bar to deal again.</p>';
    return html;
  }

  function renderAnalysis(h, L, cur) {
    const box = $('#analysis');
    const eq = eqOf(cur);
    if (eq == null) { box.innerHTML = ''; return; }
    box.innerHTML = inGame() && G.over && S.result ? reviewAnalysis() : streetAnalysis(h, L, eq);
  }

  // ---------- main update ----------
  function update() {
    if (cache.size > 400) cache.clear();
    renderTable();
    renderControls();
    schedule();
    renderStats();
  }

  // ---------- events ----------
  function rulesText() {
    return `${RULES.opp} opponent${RULES.opp > 1 ? 's' : ''} · ${RULES.stackBB} BB · ${RULES.potLimit ? 'Pot-limit' : 'No-limit'}${RULES.ante ? ' · Ante' : ''}`;
  }
  function openRules(first) {
    UI.rulesDialog({
      title: "Texas Hold'em rules",
      intro: 'Choose how this table plays. You can change it later between hands.',
      cancellable: !first,
      values: RULES,
      fields: [
        { key: 'opp', name: 'Opponents', options: [1, 2, 3, 4, 5, 6, 7, 8].map(v => ({ v, label: String(v) })) },
        { key: 'stackBB', name: 'Starting stack', hint: `Blinds are ${SB}/${BB}. Everyone starts each hand with this many chips.`, options: [{ v: 50, label: '50 BB (100)' }, { v: 100, label: '100 BB (200)' }, { v: 200, label: '200 BB (400)' }] },
        { key: 'potLimit', name: 'Betting', hint: 'No-limit: bet any amount up to all-in. Pot-limit: the biggest bet or raise is the size of the pot.', options: [{ v: false, label: 'No-limit' }, { v: true, label: 'Pot-limit' }] },
        { key: 'ante', name: 'Ante', hint: 'An ante is a small forced bet from every player, which makes each pot bigger.', options: [{ v: 0, label: 'None' }, { v: 1, label: '1 chip each' }] },
        { key: 'style', name: 'Opponents play', options: [{ v: 'mixed', label: 'Mixed' }, { v: 'tight', label: 'Tight' }, { v: 'loose', label: 'Loose' }, { v: 'aggressive', label: 'Aggressive' }] },
      ],
      preview: v => `Tight players only play strong hands. Loose players call a lot. Aggressive players bet and raise often. Mixed gives each opponent a random style.`,
      onSave: v => {
        RULES = v;
        UI.store.save(RULE_KEY, RULES);
        S.opp = RULES.opp; S.styles = [];
        $('#rulesText').textContent = rulesText();
        if (S.mode === 'random') { clearTimer(); abandonHand(); G = null; S.slots = Array(7).fill(null); S.stage = 0; S.opps = []; S.revealed = false; S.result = null; }
        update();
      },
    });
  }
  $('#rulesBtn').onclick = () => openRules(false);
  $('#rulesText').textContent = rulesText();
  $('#modeSeg').onclick = e => {
    const b = e.target.closest('button');
    if (!b || b.dataset.mode === S.mode) return;
    clearTimer();
    abandonHand();
    G = null;
    S.mode = b.dataset.mode;
    S.revealed = false; S.result = null;
    if (S.mode === 'random') { S.slots = Array(7).fill(null); S.stage = 0; S.opps = []; }
    else { S.sel = S.slots.findIndex(c => c == null); if (S.sel < 0) S.sel = 0; }
    update();
  };
  const action = () => { if (S.mode === 'random' && (!G || G.over)) startGame(); };
  $('#actionBtn').onclick = action;
  $('#table').onclick = e => { const el = e.target.closest('[data-slot]'); if (el) slotClick(+el.dataset.slot); };
  $('#picker').onclick = e => { const el = e.target.closest('[data-card]'); if (el) pickCard(+el.dataset.card); };
  $('#randBtn').onclick = randomPick;
  $('#clearBtn').onclick = () => { S.slots = Array(7).fill(null); S.sel = 0; update(); };
  $('#guessToggle').onchange = e => { S.guessMode = e.target.checked; renderStats(); };
  $('#guessRange').oninput = e => ($('#guessVal').textContent = e.target.value + '%');
  $('#guessBtn').onclick = () => { S.guesses[guessKey(boardLen())] = +$('#guessRange').value; renderStats(); };
  $('#pot').oninput = renderPot;
  $('#call').oninput = renderPot;
  document.querySelector('.quick').onclick = e => {
    const b = e.target.closest('[data-bet]');
    if (!b) return;
    const P = Math.max(0, +$('#pot').value || 0);
    $('#call').value = Math.round(P * +b.dataset.bet);
    renderPot();
  };

  $('#foldBtn').onclick = () => heroAct('fold');
  $('#callBtn').onclick = () => heroAct('call');
  $('#raiseBtn').onclick = () => heroAct('raise', S.raiseTo);
  $('#adviceBtn').onclick = () => { const a = S.curAdvice; if (a) heroAct(a.move.type, a.move.to); };
  $('#sizes').onclick = e => { const b = e.target.closest('[data-to]'); if (b) { S.raiseTo = +b.dataset.to; renderBetBar(); } };
  $('#raiseRange').oninput = e => { S.raiseTo = +e.target.value; renderBetBar(); };
  $('#raiseNum').onchange = e => { S.raiseTo = +e.target.value || 0; renderBetBar(); };

  document.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const heroTurn = inGame() && !G.over && G.toAct === 0 && !G.players[0].folded;
    if (heroTurn) {
      const k = e.key.toLowerCase();
      if (k === 'f') heroAct('fold');
      else if (k === 'c') heroAct('call');
      else if (k === 'r' && !$('#raiseBtn').hidden) heroAct('raise', S.raiseTo);
      return;
    }
    if (e.code !== 'Space' || S.mode !== 'random' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    action();
  });

  update();
  if (!savedRules && window.UI) openRules(true);
})();
