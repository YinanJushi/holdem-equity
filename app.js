(function () {
  const { RANKS, SUIT_SYM, evalN, handName, makeSim, straightHigh } = window.Engine;
  const $ = s => document.querySelector(s);
  const ITERS = 30000, CHUNK = 2500;
  const LENS = [0, 3, 4, 5];
  const LNAME = { 0: '翻前', 3: '翻牌', 4: '转牌', 5: '河牌' };
  const CATS = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];
  const SB = 1, BB = 2, START = 200;
  // 对手风格：call = 跟注门槛倍数（越小越爱跟），aggr = 主动下注倾向，bluff = 诈唬频率
  const STYLES = [
    { name: '紧手', call: 1.15, aggr: 0.45, bluff: 0.05 },
    { name: '松手', call: 0.8, aggr: 0.45, bluff: 0.1 },
    { name: '激进', call: 1.0, aggr: 0.85, bluff: 0.25 },
    { name: '稳健', call: 1.0, aggr: 0.6, bluff: 0.1 },
  ];

  // slots: 0,1 = 你的底牌；2..6 = 公共牌
  const S = {
    mode: 'random', opp: 3, slots: Array(7).fill(null), opps: [], deck: [],
    stage: 0, sel: 0, revealed: false, result: null,
    guessMode: false, guesses: {}, guessLog: [], guessLogged: new Set(),
    session: { hands: 0, wins: 0, profit: 0 },
    prev: Array(7).fill(null), styles: [], button: null,
    raiseTo: 0, raiseDec: -1, curAdvice: null,
  };
  let G = null; // 当前这手牌的下注状态（仅随机发牌模式）
  const cache = new Map();
  let token = 0, live = null;
  // 让出主线程再继续（MessageChannel 不像 setTimeout 那样会被浏览器节流）
  const chan = new MessageChannel();
  let pending = null;
  chan.port1.onmessage = () => { const f = pending; pending = null; if (f) f(); };
  const yieldThen = f => { pending = f; chan.port2.postMessage(0); };

  // ---------- 工具 ----------
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rankLabel = c => { const r = RANKS[c >> 2]; return r === 'T' ? '10' : r; };
  const cardText = c => rankLabel(c) + SUIT_SYM[c & 3];
  const cardsText = cs => cs.map(cardText).join(' ');
  const pct = x => x.toFixed(1) + '%';
  const signed = x => (x >= 0 ? '+' : '') + x;

  function cardHTML(c, cls = '', attr = '') {
    if (c == null) return `<div class="card empty ${cls}" ${attr}></div>`;
    const s = SUIT_SYM[c & 3];
    return `<div class="card s${c & 3} ${cls}" ${attr}><span class="r">${rankLabel(c)}</span><span class="r2">${s}</span><span class="pip">${s}</span></div>`;
  }

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

  // ---------- 发牌 ----------
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

  // ---------- 下注引擎 ----------
  function put(i, a) {
    const p = G.players[i];
    a = Math.max(0, Math.min(a, p.stack));
    p.stack -= a; p.bet += a; p.total += a; G.pot += a;
    if (p.stack === 0) p.allin = true;
  }
  function track() {
    const L = boardLen();
    G.cnt[L] = activeIdx().length;
    G.idx[L] = activeIdx();
  }
  const canActIdx = () => G.players.map((p, j) => j).filter(j => !G.players[j].folded && !G.players[j].allin);
  function nextIn(from) {
    for (let k = 1; k <= G.N; k++) { const j = (from + k) % G.N; if (G.need.has(j)) return j; }
    return -1;
  }
  function clearTimer() { if (G && G.timer) { clearTimeout(G.timer); G.timer = null; } }

  function startGame() {
    clearTimer();
    newHand();
    while (S.styles.length < S.opp) S.styles.push(STYLES[(Math.random() * STYLES.length) | 0]);
    const N = S.opp + 1;
    S.button = S.button == null ? (Math.random() * N) | 0 : (S.button + 1) % N;
    G = {
      N, pot: 0, curBet: 0, minRaise: BB, need: new Set(), toAct: -1, players: [],
      cnt: {}, idx: {}, log: [], over: false, timer: null, foldInfo: null,
      heroWaiting: false, decId: 0, aiCache: new Map(),
    };
    for (let i = 0; i < N; i++) G.players.push({ stack: START, bet: 0, total: 0, folded: false, allin: false, last: '', rs: 0, style: i ? S.styles[i - 1] : null });
    const btn = S.button;
    G.sb = N === 2 ? btn : (btn + 1) % N;
    G.bb = N === 2 ? (btn + 1) % N : (btn + 2) % N;
    put(G.sb, SB); put(G.bb, BB);
    G.players[G.sb].last = `小盲 ${SB}`; G.players[G.bb].last = `大盲 ${BB}`;
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
      const max = p.stack + p.bet;
      if (max <= G.curBet) type = 'call';
      else to = Math.round(Math.min(max, Math.max(to || 0, G.curBet + G.minRaise)));
    }
    if (type === 'fold') { p.folded = true; p.last = '弃牌'; }
    else if (type === 'check') p.last = '过牌';
    else if (type === 'call') { put(i, toCall); p.last = p.allin ? `全下 ${p.total}` : `跟注 ${toCall}`; }
    else {
      const was = G.curBet;
      put(i, to - p.bet);
      if (to - was >= G.minRaise) G.minRaise = to - was;
      G.curBet = Math.max(G.curBet, to);
      p.rs++;
      p.last = p.allin ? `全下 ${p.total}` : was === 0 ? `下注 ${to}` : `加注到 ${to}`;
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
    const heroNet = G.players[0].stack - START;
    const heroWin = winners.includes(0) ? 1 / winners.length : 0;
    S.result = { type: showdown ? 'showdown' : 'fold', winners, scores, best, pot, heroNet, heroWin };
    S.revealed = true; S.stage = 5;
    S.session.hands++; S.session.profit += heroNet; S.session.wins += heroWin;
    update();
  }

  // 对手 AI：只知道自己的牌，按胜率、底池赔率和自身风格行动
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

  // ---------- 你的操作 ----------
  const moveKind = t => (t === 'fold' ? 'fold' : t === 'raise' ? 'raise' : 'passive');
  function heroAct(type, to) {
    if (!inGame() || G.over || G.toAct !== 0) return;
    const p = G.players[0], toCall = G.curBet - p.bet, L = boardLen();
    if (type === 'fold') G.foldInfo = { l: L, need: toCall > 0 ? (toCall / (G.pot + toCall)) * 100 : null, idx: activeIdx() };
    const adv = S.curAdvice;
    act(0, type, to);
    G.log.push({ l: L, mine: p.last, adv: adv ? adv.act : null, match: adv ? moveKind(adv.move.type) === moveKind(type) : null });
    G.heroWaiting = false;
    S.curAdvice = null;
    proceed();
  }
  function raiseBounds() {
    const p = G.players[0], max = p.stack + p.bet;
    return { min: Math.min(max, G.curBet + G.minRaise), max };
  }
  function presets() {
    const p = G.players[0], toCall = G.curBet - p.bet, L = boardLen(), out = [];
    const potTo = f => Math.round(G.curBet + f * (G.pot + toCall));
    if (L === 0 && G.curBet <= BB) {
      const limp = G.players.filter((q, j) => j !== G.bb && !q.folded && q.bet === BB).length;
      [[2.5, '2.5 个大盲'], [3, '3 个大盲'], [4, '4 个大盲']].forEach(([m, l]) => out.push({ label: l, to: Math.round(m * BB + limp * BB) }));
    } else if (L === 0) {
      out.push({ label: '3 倍', to: G.curBet * 3 }, { label: '4 倍', to: G.curBet * 4 });
    } else {
      [[1 / 3, '1/3 池'], [0.5, '1/2 池'], [2 / 3, '2/3 池'], [1, '满池']].forEach(([f, l]) => out.push({ label: l, to: potTo(f) }));
    }
    out.push({ label: '全下', to: p.stack + p.bet });
    return out;
  }
  function moveLabel(m) {
    if (m.type === 'fold') return '弃牌';
    if (m.type === 'check') return '过牌';
    if (m.type === 'call') return '跟注';
    const { min, max } = raiseBounds();
    if (max <= G.curBet) return '跟注';
    const t = Math.max(min, Math.min(max, m.to));
    return t >= max ? `全下 ${max}` : G.curBet === 0 ? `下注 ${t}` : `加注到 ${t}`;
  }

  // ---------- 手动选牌 ----------
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

  // ---------- 计算调度：每条街独立模拟、带缓存，可被打断 ----------
  function schedule() {
    const my = ++token;
    live = null;
    const h = heroCards();
    if (!h) return;
    const L = boardLen();
    const todo = LENS.filter(l => l <= L && !cache.has(keyFor(l)));
    todo.sort((a, b) => (b === L) - (a === L)); // 当前这条街优先
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

  // ---------- 渲染：牌桌 ----------
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
      const p = G.players[0];
      $('#potShow').innerHTML = `底池 <b>${G.over ? S.result.pot : G.pot}</b>`;
      $('#heroInfo').innerHTML = `${badges(0)}你 · 💰${p.stack}${p.last ? ` · <span class="act">${p.last}</span>` : ''}`;
    } else {
      $('#potShow').innerHTML = '';
      $('#heroInfo').textContent = '你';
    }
    renderSeats();
    $('#msg').innerHTML = tableMsg();
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
        if (p && p.folded) extra = '<div class="seat-hand">已弃牌</div>';
        else if (R) {
          const won = R.winners.includes(j);
          const name = R.scores ? handName(R.scores[j]) : '';
          if (won || name) extra = `<div class="seat-hand ${won ? 'win' : ''}">${won ? '👑 ' : ''}${name || '赢下底池'}</div>`;
        }
      } else if (p && !p.folded) cards = '<div class="card back"></div><div class="card back"></div>';
      else cards = '<div class="card ghost"></div><div class="card ghost"></div>';
      const cls = ['seat'];
      if (p && p.folded && !S.revealed) cls.push('folded');
      if (inGame() && !G.over && G.toAct === j) cls.push('acting');
      const info = p ? `<div class="seat-info">💰${p.stack}${p.last ? ' · ' + p.last : ''}</div>` : '';
      html += `<div class="${cls.join(' ')}" style="left:${x}%;top:${y}%"><div class="seat-cards">${cards}</div><div class="seat-name">${badges(j)}对手 ${j}${p ? ' · ' + p.style.name : ''}</div>${info}${extra}</div>`;
    }
    $('#seats').innerHTML = html;
  }
  function tableMsg() {
    if (S.mode === 'random') {
      if (!G) return '点「发手牌」开始';
      if (G.over) {
        const R = S.result;
        const names = R.winners.map(j => (j === 0 ? '你' : '对手 ' + j)).join('、');
        let s = R.type === 'fold' ? `${names} 赢下 ${R.pot}（其他人都弃牌了）` : `${names} 用 ${handName(R.best)} 赢下 ${R.pot}`;
        s += `<br>你这手 <b class="${R.heroNet >= 0 ? 'good' : 'bad'}">${signed(R.heroNet)}</b>`;
        return s;
      }
      if (G.players[0].folded) return '你已弃牌，看看后面会怎样…';
      if (G.toAct === 0) return '👉 轮到你了';
      if (G.toAct > 0) return `对手 ${G.toAct} 思考中…`;
      return '';
    }
    if (!heroCards()) return '先选你的两张底牌';
    const b = S.slots.slice(2);
    if (b.some(c => c != null) && boardLen() === 0) return '翻牌需要凑齐 3 张才会计算';
    return '';
  }

  function renderControls() {
    const manual = S.mode === 'manual';
    $('#randomTools').hidden = manual || (inGame() && !G.over);
    $('#manualTools').hidden = !manual;
    $('#actionBtn').textContent = S.stage === 5 ? '下一局' : '发手牌';
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
    $('#callBtn').textContent = toCall === 0 ? '过牌' : toCall >= p.stack ? `全下跟注 ${p.stack}` : `跟注 ${toCall}`;
    const canRaise = max > G.curBet && toCall < p.stack;
    $('#raiseWrap').hidden = !canRaise;
    $('#raiseBtn').hidden = !canRaise;
    $('#raiseBtn').textContent = S.raiseTo >= max ? `全下 ${max}` : G.curBet === 0 ? `下注 ${S.raiseTo}` : `加注到 ${S.raiseTo}`;
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
    if (!a || !inGame()) { b.disabled = true; b.textContent = '💡 建议计算中…'; return; }
    b.disabled = false;
    b.textContent = '💡 按建议：' + moveLabel(a.move);
  }
  function renderSession() {
    const ss = S.session;
    let h = '';
    if (ss.hands) {
      h += `已玩 <b>${ss.hands}</b> 手 · 赢下 <b>${+ss.wins.toFixed(1)}</b> 手 · 本场盈亏 <b class="${ss.profit >= 0 ? 'good' : 'bad'}">${signed(ss.profit)}</b> 筹码（${signed(+(ss.profit / BB).toFixed(1))} 个大盲）`;
      h += `<br>每手开始时所有人重置为 ${START} 筹码，盲注 ${SB}/${BB}`;
    }
    if (S.guessLog.length) {
      const avg = S.guessLog.reduce((a, b) => a + b, 0) / S.guessLog.length;
      const rank = avg < 5 ? '职业牌手的眼光 🧠' : avg < 10 ? '老练 👍' : avg < 18 ? '入门 🙂' : '新手，多练练 🐣';
      h += `${h ? '<br>' : ''}🎯 猜胜率 ${S.guessLog.length} 次，平均误差 <b>${avg.toFixed(1)}</b> 个百分点 · ${rank}`;
    }
    $('#session').innerHTML = h;
  }

  // ---------- 渲染：右侧数据 ----------
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

    $('#streetTag').textContent = nOpp ? `${LNAME[L]} · 对抗 ${nOpp} 名对手` : `${LNAME[L]} · 对手都弃牌了`;
    const eq = eqOf(cur);
    if (eq != null) {
      const win = (cur.win / cur.iters) * 100, tie = (cur.tie / cur.iters) * 100, lose = 100 - win - tie;
      const big = $('#eqBig');
      big.textContent = pct(eq);
      big.style.color = eq >= fair * 1.3 ? 'var(--up)' : eq <= fair * 0.7 ? 'var(--down)' : 'var(--text)';
      $('#bWin').style.width = win + '%'; $('#bTie').style.width = tie + '%'; $('#bLose').style.width = lose + '%';
      $('#eqSub').innerHTML = `赢 ${pct(win)} · 平 ${pct(tie)} · 输 ${pct(lose)}<br>全桌平均水平 ${pct(fair)}（1 / ${nOpp + 1}）`;
      $('#prog').textContent = isFinal(cur) ? `基于 ${ITERS.toLocaleString()} 次蒙特卡洛模拟` : `模拟中… ${cur.iters.toLocaleString()} / ${ITERS.toLocaleString()}`;
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
    let s = '';
    if (L === 0) {
      s = ratio > 1.8 ? '🔥 顶级起手牌，放心入池' : ratio > 1.25 ? '👍 明显强于平均的起手牌' : ratio > 0.9 ? '🙂 中规中矩，看位置和价格' : '🥶 偏弱的起手牌，大多数时候可以弃';
    } else {
      s = d >= 15 ? `🚀 ${LNAME[L]}大幅帮到了你` : d >= 5 ? `📈 ${LNAME[L]}让你变强了` : d > -5 ? `➖ ${LNAME[L]}影响不大` : d > -15 ? `📉 ${LNAME[L]}对你不太友好` : `💥 ${LNAME[L]}重创了你的牌`;
      s += ratio > 2 ? '，你很可能领先全桌' : ratio > 1.2 ? '，目前处于优势' : ratio > 0.8 ? '，局面胶着' : '，你大概率落后';
    }
    return s;
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
    g += `<line class="c-fair" x1="${pl}" x2="${W - pr}" y1="${ys(fair)}" y2="${ys(fair)}"/><text class="c-ax" x="${W - pr}" y="${ys(fair) - 5}" text-anchor="end">平均 ${fair.toFixed(0)}%</text>`;
    LENS.forEach((l, i) => (g += `<text class="c-ax" x="${xs(i)}" y="${H - 6}" text-anchor="middle">${LNAME[l]}</text>`));
    if (pts.length) {
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
      if (pts.length > 1) g += `<path class="c-area" d="${line} L${pts[pts.length - 1].x},${ys(0)} L${pts[0].x},${ys(0)} Z"/>`;
      g += `<path class="c-line" d="${line}"/>`;
      pts.forEach(p => (g += `<circle class="c-dot" cx="${p.x}" cy="${p.y}" r="4.5"/><text class="c-txt" x="${p.x}" y="${p.y - 10}" text-anchor="middle">${p.v.toFixed(0)}%</text>`));
    }
    $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="各街胜率走势">${g}</svg>`;
  }

  function preflopInfo(h) {
    let [a, b] = h, ra = a >> 2, rb = b >> 2;
    if (rb > ra) [ra, rb] = [rb, ra];
    const suited = (a & 3) === (b & 3);
    if (ra === rb) return { label: RANKS[ra] + RANKS[rb], desc: '口袋对子' };
    const parts = [suited ? '同花' : '不同花'];
    if (ra - rb === 1) parts.push('连张');
    else if (ra - rb === 2) parts.push('隔一张');
    if (rb >= 8) parts.push('两张大牌');
    else if (ra === 12) parts.push('带 A');
    return { label: RANKS[ra] + RANKS[rb] + (suited ? 's' : 'o'), desc: parts.join(' · ') };
  }
  function draws(h, b, cat) {
    const out = [];
    if (cat >= 4) return out;
    const cards = [...h, ...b];
    for (let s = 0; s < 4; s++) {
      if (cards.filter(c => (c & 3) === s).length === 4 && h.some(c => (c & 3) === s)) out.push('同花听牌');
    }
    let all = 0;
    cards.forEach(c => (all |= 1 << (c >> 2)));
    let comp = 0;
    for (let r = 0; r < 13; r++) if (!(all & (1 << r)) && straightHigh(all | (1 << r)) >= 0) comp++;
    if (comp >= 2) out.push('两头顺听牌'); else if (comp === 1) out.push('卡顺听牌');
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
    const tags = draws(h, b, sc >> 20);
    if (L === 5 && evalN(b, 5) === sc) tags.push('你在打公共牌，底牌没起作用');
    $('#handNow').innerHTML = `<div class="hn-big">${handName(sc)}</div>` +
      (tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : '');
  }

  function renderHeat(cur, L) {
    const sec = $('#heatSec');
    if (!(L === 3 || L === 4) || !cur || !cur.iters) { sec.hidden = true; return; }
    sec.hidden = false;
    $('#heatTitle').textContent = L === 3 ? '下一张转牌会怎样改变你的胜率' : '河牌会怎样改变你的胜率';
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
      h += `<div class="hc s${s}" style="background:${bg}" title="来 ${cardText(c)}：胜率 ${pct(cond)}（${diff >= 0 ? '+' : ''}${diff.toFixed(1)}）">${cardText(c)}</div>`;
    }
    $('#heat').innerHTML = h;
    list.sort((x, y) => y.diff - x.diff);
    const good = list.filter(x => x.diff >= 10).length, bad = list.filter(x => x.diff <= -10).length;
    const fmt = x => `${cardText(x.c)} ${pct(x.cond)}`;
    $('#heatSum').innerHTML =
      `<div class="legend"><span>◀ 红色：来了对你不利</span><span>绿色：来了对你有利 ▶</span></div>` +
      `强力补牌 <b class="good">${good}</b> 张（+10% 以上）· 危险牌 <b class="bad">${bad}</b> 张（-10% 以上）<br>` +
      `最想看到：${list.slice(0, 3).map(fmt).join('、')}<br>最怕看到：${list.slice(-3).reverse().map(fmt).join('、')}` +
      (isFinal(cur) ? '' : '<br><i>（还在模拟，数字会更准）</i>');
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

  // ---------- 下注建议 ----------
  // ctx（随机发牌模式）：{ curBet, unopened, limpers }；手动模式为 null
  function advise(eq, P, C, L, ctx) {
    const nOpp = activeOpp(), fair = 100 / (nOpp + 1), ratio = eq / fair;
    const h = heroCards(), b = boardCards(L);
    let drawList = [];
    if (L === 3 || L === 4) { const all = [...h, ...b]; drawList = draws(h, b, evalN(all, all.length) >> 20); }
    const hasDraw = drawList.length > 0, multi = nOpp >= 3;
    const n = x => Math.max(1, Math.round(x));
    const curBet = ctx ? ctx.curBet : C;
    const unopened = L === 0 && (ctx ? ctx.unopened : C <= 0);
    const limp = ctx ? ctx.limpers : 0;
    const why = [];
    let act, cls, size = '', move;
    why.push(`你的胜率 ${pct(eq)}，是全桌平均水平（${pct(fair)}）的 ${ratio.toFixed(1)} 倍`);

    if (unopened) {
      const openTo = BB * 3 + limp * BB, smallTo = Math.round(BB * 2.5 + limp * BB);
      if (ratio >= 1.5) {
        act = '加注'; cls = 'raise'; move = { type: 'raise', to: openTo };
        size = ctx ? `加注到 ${openTo}（${openTo / BB} 个大盲${limp ? `，含 ${limp} 个跟注者各加 1 个大盲` : ''}）` : '加注到 2.5~3 个大盲；前面每多一个人跟注，就再多加 1 个大盲';
        why.push('强起手牌，主动加注可以赢更多，也能赶走一部分对手');
      } else if (ratio >= 1.1) {
        act = '可以加注入池'; cls = 'call'; move = { type: 'raise', to: smallTo };
        size = ctx ? `加注到 ${smallTo}；位置靠前（先行动）时也可以弃牌` : '后位可加注到 2.5 个大盲；前位更保守，也可以弃';
        why.push('略强于平均，位置越靠后越值得玩');
      } else if (ctx && C <= 0) {
        act = '过牌'; cls = 'call'; move = { type: 'check' };
        why.push('你在大盲位，没人加注，可以免费看翻牌');
      } else {
        act = '弃牌'; cls = 'fold'; move = { type: 'fold' };
        if (!ctx) size = '如果你在大盲位且没人加注，就免费过牌看翻牌';
        why.push('弱起手牌，长期玩会亏');
      }
    } else if (C <= 0) {
      if (eq >= 75 || ratio >= 2.2) {
        act = '下注（拿价值）'; cls = 'raise'; move = { type: 'raise', to: n(P * 0.66) };
        size = `下注 2/3 ~ 3/4 底池 ≈ ${n(P * 0.66)} ~ ${n(P * 0.75)}`;
        why.push('你大概率领先，让更差的牌给你付钱');
        if (L < 5) why.push('下大一点也能让听牌的对手付出代价');
      } else if (ratio >= 1.25) {
        act = '小额下注'; cls = 'raise'; move = { type: 'raise', to: n(P * 0.4) };
        size = `下注 1/3 ~ 1/2 底池 ≈ ${n(P * 0.33)} ~ ${n(P * 0.5)}`;
        why.push('领先但优势不大，小注既拿价值又保护手牌，被加注时损失也小');
      } else if (hasDraw && !multi) {
        act = '半诈唬下注'; cls = 'bluff'; move = { type: 'raise', to: n(P * 0.5) };
        size = `下注约 1/2 底池 ≈ ${n(P * 0.5)}`;
        why.push(`你有${drawList.join('、')}：对手弃牌你直接赢，被跟注也还有机会补中`);
      } else if (hasDraw) {
        act = '过牌'; cls = 'call'; move = { type: 'check' };
        why.push(`你有${drawList.join('、')}，但多人底池诈唬很难成功，争取免费看牌`);
      } else if (ratio >= 0.8) {
        act = '过牌'; cls = 'call'; move = { type: 'check' };
        why.push('牌力中等，过牌控制底池大小');
      } else {
        act = L === 5 ? '过牌，放弃这手' : '过牌，被下注就弃'; cls = 'fold'; move = { type: 'check' };
        why.push('你大概率落后，不要往底池里再投钱');
      }
    } else {
      const need = (C / (P + C)) * 100;
      why.push(`跟注 ${n(C)} 去争夺 ${n(P + C)} 的底池，至少需要 ${pct(need)} 胜率`);
      if ((eq >= 70 || ratio >= 2.2) && eq > need) {
        act = '加注'; cls = 'raise'; move = { type: 'raise', to: n(curBet * 3) };
        size = `加注到对方下注的 3 倍左右 ≈ ${n(curBet * 3)}`;
        why.push('你的牌很强，只跟注会少赢');
      } else if (eq >= need && !(L === 0 && ratio < 0.9)) {
        act = '跟注'; cls = 'call'; move = { type: 'call' };
        why.push('胜率够了，长期跟注是赚的');
      } else if (hasDraw && eq >= need * 0.75) {
        act = '可以跟注'; cls = 'bluff'; move = { type: 'call' };
        why.push(`胜率差一点，但你有${drawList.join('、')}，补中后对手往往还会付钱（隐含赔率）`);
      } else {
        act = '弃牌'; cls = 'fold'; move = { type: 'fold' };
        why.push(L === 0 && eq >= need ? '赔率看着不错，但这手牌翻牌后很难打，被加注时弃掉更稳' : '胜率不够，长期跟注会亏');
      }
    }
    if (hasDraw && !why.some(w => w.includes('听牌'))) why.push(`你还有${drawList.join('、')}，没补中也有后路`);
    if (multi && L > 0) why.push(`${nOpp} 个对手的多人底池：至少有一人牌好的可能很大，少诈唬，强牌才打大`);
    return { act, cls, size, why, move };
  }

  function renderPot() {
    const L = boardLen(), eq = eqOf(getRes(L)), g = inGame();
    $('#potInputs').hidden = g;
    S.curAdvice = null;
    const say = t => { $('#advice').innerHTML = `<p class="sub">${t}</p>`; $('#potVerdict').innerHTML = ''; renderAdviceBtn(); };
    let P, C, ctx = null;
    if (g) {
      if (G.over) { $('#potInfo').textContent = ''; return say('这手牌已经结束，看看上面的复盘，然后发下一局。'); }
      const p = G.players[0];
      $('#potInfo').innerHTML = `底池 <b>${G.pot}</b> · 你需要跟注 <b>${G.curBet - p.bet}</b> · 你还剩 <b>${p.stack}</b>`;
      if (p.folded) return say('你已弃牌。');
      if (G.toAct !== 0) return say('等待对手行动…轮到你时这里会给出建议。');
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
      `<div class="adv ${a.cls}"><div class="adv-act">建议：${a.act}</div>` +
      (a.size ? `<div class="adv-size">${a.size}</div>` : '') +
      `<ul>${a.why.map(w => `<li>${w}</li>`).join('')}</ul></div>`;
    if (C <= 0) $('#potVerdict').innerHTML = '';
    else {
      const e = eq / 100, ev = e * P - (1 - e) * C, ok = ev >= 0;
      $('#potVerdict').innerHTML = `只看这一注：跟注平均每次<b class="${ok ? 'good' : 'bad'}">${ok ? '赚' : '亏'} ${Math.abs(ev).toFixed(1)}</b>（还没算后面几条街的下注）`;
    }
    renderAdviceBtn();
  }

  function renderGuessResult(L, cur) {
    const box = $('#guessResult'), key = guessKey(L);
    if (!S.guessMode || !(key in S.guesses)) { box.hidden = true; return; }
    box.hidden = false;
    const g = S.guesses[key], eq = eqOf(cur);
    if (!isFinal(cur)) { box.innerHTML = `你猜 <b>${g}%</b>，正在计算真实胜率…`; return; }
    const err = Math.abs(g - eq);
    if (!S.guessLogged.has(key)) { S.guessLogged.add(key); S.guessLog.push(err); }
    const v = err < 3 ? '🎯 神准！' : err < 8 ? '👏 很接近' : err < 15 ? '🤏 差了一点' : '🙈 差得有点远';
    box.innerHTML = `你猜 <b>${g}%</b>，实际 <b>${pct(eq)}</b>，误差 <b>${err.toFixed(1)}</b> 个百分点 · ${v}`;
  }

  // ---------- 牌局分析 ----------
  const anaCache = new Map();
  const popcount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

  // 枚举所有可能的对手两张牌，看此刻有多少比你大
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
    if (t.maxS >= 4) out.push(`公共牌已有 ${t.maxS} 张同花色，任何一张该花色的牌都能成同花`);
    else if (t.maxS === 3) out.push('公共牌有 3 张同花色，对手拿两张该花色就已成同花');
    else if (t.maxS === 2 && L < 5) out.push('两张同花色，对手可能在听同花');
    if (t.paired) out.push('公共牌成对，葫芦和四条成为可能');
    if (t.straight) out.push('牌面比较连，顺子有可能成型');
    if (!out.length) out.push('干燥牌面：不连、不同花，很难有大牌，先领先的人通常保持领先');
    return out;
  }
  function strengthWord(ratio) {
    return ratio > 2 ? '明显领先' : ratio > 1.3 ? '处于优势' : ratio > 0.8 ? '和平均水平差不多' : ratio > 0.5 ? '处于下风' : '明显落后';
  }

  function streetAnalysis(h, L, eq) {
    const nOpp = activeOpp();
    const b = boardCards(L), fair = 100 / (nOpp + 1), ratio = eq / fair;
    let html = '<h4>局面</h4><p>';
    html += `你拿着 <b>${cardsText([...h].sort((x, y) => y - x))}</b>，` + (L === 0 ? '还没发公共牌。' : `公共牌是 <b>${cardsText(b)}</b>，你现在是 <b>${handName(evalN([...h, ...b], 2 + L))}</b>。`);
    html += nOpp ? `面对 ${nOpp} 个对手，胜率 <b>${pct(eq)}</b>，${strengthWord(ratio)}（平均水平 ${pct(fair)}）。</p>` : '对手都已弃牌。</p>';
    if (inGame() && !G.over) {
      const folded = G.players.slice(1).filter(p => p.folded).length;
      if (folded) html += `<p class="sub">已有 ${folded} 个对手弃牌，胜率只按还在牌局里的对手计算。</p>`;
    }

    if (L === 0) {
      const pair = (h[0] >> 2) === (h[1] >> 2), suited = (h[0] & 3) === (h[1] & 3);
      html += '<h4>翻牌会带来什么</h4><ul>';
      if (pair) {
        html += '<li>约 <b>11.8%</b> 的概率翻出三条（暗三），那时你几乎稳赢</li>';
        html += '<li>其余时候要小心翻牌出现比你对子大的牌</li>';
      } else {
        html += '<li>约 <b>32%</b> 的概率至少配上一张底牌成对</li>';
        html += '<li>约 <b>2%</b> 的概率直接成两对或更好</li>';
      }
      if (suited) html += '<li>同花底牌：约 <b>11%</b> 翻出同花听牌，<b>0.8%</b> 直接成同花</li>';
      if (nOpp >= 4) html += `<li>${nOpp} 个对手时，单纯一对很难赢到最后，要靠翻牌后变强</li>`;
      html += '</ul>';
      return html;
    }

    // 这条街发生了什么
    const prevL = LENS[LENS.indexOf(L) - 1];
    const newCards = L === 3 ? b : [b[L - 1]];
    const prevEq = eqOf(getRes(prevL));
    const nowCat = evalN([...h, ...b], 2 + L) >> 20;
    const prevCat = prevL === 0 ? ((h[0] >> 2) === (h[1] >> 2) ? 1 : 0) : evalN([...h, ...boardCards(prevL)], 2 + prevL) >> 20;
    const tNow = texture(b), tPrev = prevL >= 3 ? texture(boardCards(prevL)) : { maxS: 0, paired: false, straight: false };
    const events = [];
    if (nowCat > prevCat) events.push(`你的牌从 ${CATS[prevCat]} 变成了 <b>${CATS[nowCat]}</b>`);
    if (prevL > 0) {
      if (tNow.maxS >= 3 && tPrev.maxS < 3) events.push('这张牌让同花成为可能');
      if (tNow.paired && !tPrev.paired) events.push('公共牌成对了');
      if (tNow.straight && !tPrev.straight) events.push('顺子的可能出现了');
    }
    if (!events.length) events.push('你的牌型没有变化');
    html += `<h4>${LNAME[L]} ${cardsText(newCards)} 带来了什么</h4><p>`;
    if (prevEq != null) {
      const d = eq - prevEq;
      html += `胜率 ${pct(prevEq)} → <b>${pct(eq)}</b>（<span class="${d >= 0 ? 'good' : 'bad'}">${d >= 0 ? '+' : ''}${d.toFixed(1)}</span>）。`;
    }
    html += events.join('；') + '。</p>';

    html += `<h4>牌面</h4><ul>${textureLines(tNow, L).map(x => `<li>${x}</li>`).join('')}</ul>`;

    // 威胁
    if (nOpp) {
      const cv = combosVs(h, b);
      const p = cv.better / cv.total;
      const atLeastOne = 1 - Math.pow(1 - p, nOpp);
      html += '<h4>谁可能已经赢你</h4><p>';
      if (cv.better === 0) html += '此刻<b>没有任何两张牌能赢你</b>，你拿着坚果牌（当前最大）。';
      else {
        const top = cv.byCat.map((k, c) => ({ k, c })).filter(x => x.k).sort((a, z) => z.k - a.k).slice(0, 3);
        html += `对手可能的 ${cv.total} 种两张牌里，有 <b>${cv.better}</b> 种（${pct(p * 100)}）此刻比你大，主要是 ${top.map(x => `${CATS[x.c]}（${x.k} 种）`).join('、')}。`;
        if (nOpp > 1) html += ` ${nOpp} 个对手里至少一人已经领先的概率约 <b>${pct(atLeastOne * 100)}</b>。`;
      }
      html += '</p>';
    }

    // 补牌
    const cur = getRes(L);
    if (L < 5 && cur && isFinal(cur)) {
      let outs = 0;
      for (let c = 0; c < 52; c++) if (cur.nextN[c] && (cur.next[c] / cur.nextN[c]) * 100 - eq >= 15) outs++;
      if (outs) {
        const rule = Math.min(100, outs * (L === 3 ? 4 : 2));
        html += `<h4>补牌</h4><p>约 <b>${outs}</b> 张牌能让你的胜率涨 15% 以上。按「4-2 法则」（补牌数 × ${L === 3 ? 4 : 2}），${L === 3 ? '到河牌为止' : '河牌'}补中的概率约 <b>${rule}%</b>。</p>`;
      }
    }
    return html;
  }

  // 摊牌后：知道对手真实手牌时，你在某条街的真实胜率（idx 为当时还在牌局里的对手）
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
    let html = '<h4>📋 这手牌复盘</h4>';

    let verdict;
    if (heroFolded) {
      const fi = G.foldInfo;
      if (fi.need == null) verdict = `🤔 你在${LNAME[fi.l]}本可以免费过牌，却选择了弃牌（当时真实胜率 ${pct(last.real)}）。没人下注时，过牌永远不比弃牌差。`;
      else if (last.real < fi.need) verdict = `✅ <b>弃得好！</b>你在${LNAME[fi.l]}弃牌时真实胜率只有 ${pct(last.real)}，而跟注需要 ${pct(fi.need)}。`;
      else verdict = `😬 这次弃牌<b>放弃了价值</b>：你在${LNAME[fi.l]}的真实胜率有 ${pct(last.real)}，高于跟注所需的 ${pct(fi.need)}。不过当时你看不到对手的牌，别太自责。`;
    } else if (R.type === 'fold') {
      verdict = last.real < 50
        ? `😎 <b>施压成功！</b>对手全部弃牌，其实你当时落后（真实胜率 ${pct(last.real)}），却赢下了 ${R.pot}。`
        : `💰 对手全部弃牌，你赢下 ${R.pot}。你当时本来就领先（真实胜率 ${pct(last.real)}）。`;
    } else {
      const won = R.heroWin === 1, lost = R.heroWin === 0;
      const preRiver = rv.slice(0, 3).map(r => r.real);
      const maxReal = Math.max(...preRiver), minReal = Math.min(...preRiver);
      if (lost && rv[2].real >= 70) verdict = `😤 <b>Bad beat！</b>转牌时你的真实胜率有 ${pct(rv[2].real)}，却被河牌反超。打法没问题，是运气。`;
      else if (lost && maxReal >= 60) verdict = `😣 你曾经领先（最高真实胜率 ${pct(maxReal)}），后来被对手追上了。`;
      else if (lost) verdict = `🧊 对手从头到尾都占优（你的真实胜率最高只有 ${pct(maxReal)}），能早点放弃最好。`;
      else if (won && rv[2].real <= 30) verdict = `🍀 <b>幸运逆转！</b>转牌时你真实胜率只有 ${pct(rv[2].real)}，河牌救了你。`;
      else if (won && minReal <= 35) verdict = `🔁 中途你一度落后（最低真实胜率 ${pct(minReal)}），最后赢了回来。`;
      else if (won) verdict = `💪 你一路领先，赢得稳稳当当（真实胜率最低也有 ${pct(minReal)}）。`;
      else verdict = '🤝 和对手平分了底池。';
    }
    html += `<div class="verdict">${verdict}<br>这手你 <b class="${R.heroNet >= 0 ? 'good' : 'bad'}">${signed(R.heroNet)}</b> 筹码。</div>`;

    html += '<table class="rv"><tr><th>街</th><th>你看到的胜率</th><th>真实胜率</th><th>差距</th></tr>';
    rv.forEach(r => {
      const gap = r.seen == null ? null : r.seen - r.real;
      html += `<tr><td>${LNAME[r.l]}</td><td>${r.seen == null ? '—' : pct(r.seen)}</td><td><b>${pct(r.real)}</b></td><td class="${gap == null ? '' : gap > 0 ? 'bad' : 'good'}">${gap == null ? '' : (gap > 0 ? '+' : '') + gap.toFixed(0)}</td></tr>`;
    });
    html += '</table><p class="sub">「你看到的」假设对手是随机牌；「真实」是翻开当时还在牌局里的对手底牌后的胜率。</p>';

    if (rv.length > 1) {
      let key = null;
      for (let i = 1; i < rv.length; i++) {
        const d = rv[i].real - rv[i - 1].real;
        if (!key || Math.abs(d) > Math.abs(key.d)) key = { i, d };
      }
      const l = rv[key.i].l;
      const keyCards = l === 3 ? boardCards(3) : [S.slots[2 + l - 1]];
      html += `<p>🔑 <b>最关键的牌：</b>${LNAME[l]} ${cardsText(keyCards)}，你的真实胜率从 ${pct(rv[key.i - 1].real)} 变成 ${pct(rv[key.i].real)}。</p>`;
    }

    const off = rv.filter(r => (r.l === 3 || r.l === 4) && r.seen != null).map(r => r.seen - r.real);
    if (off.some(g => g >= 25)) html += '<p>👀 翻牌后你看到的胜率明显<b>高估</b>了：对手实际的牌比随机牌强得多。一直跟注或加注的对手，通常牌不差。</p>';
    else if (off.some(g => g <= -25)) html += '<p>👀 你看到的胜率<b>低估</b>了：对手的牌其实很弱，你本可以下更多注拿价值。</p>';

    if (G.log.length) {
      const matched = G.log.filter(d => d.match).length, judged = G.log.filter(d => d.match != null).length;
      html += `<h4>你的决策${judged ? `（${matched}/${judged} 次和建议一致）` : ''}</h4><ul>`;
      html += G.log.map(d => `<li>${LNAME[d.l]}：你选了「${d.mine}」${d.adv ? `，建议是「${d.adv}」 ${d.match ? '✅' : '⚠️'}` : ''}</li>`).join('');
      html += '</ul>';
    }

    if (R.type === 'showdown') {
      const alive = G.players.map((p, j) => j).filter(j => j > 0 && !G.players[j].folded);
      const best = alive.map(j => ({ j, s: R.scores[j] })).sort((a, z) => z.s - a.s)[0];
      if (best) html += `<p>摊牌时对手里最大的是 对手 ${best.j} 的 <b>${cardsText(S.opps[best.j - 1])}</b>（${handName(best.s)}）。</p>`;
    }
    html += '<p class="sub">按「下一局」或空格键重新发牌。</p>';
    return html;
  }

  function renderAnalysis(h, L, cur) {
    const box = $('#analysis');
    const eq = eqOf(cur);
    if (eq == null) { box.innerHTML = ''; return; }
    box.innerHTML = inGame() && G.over && S.result ? reviewAnalysis() : streetAnalysis(h, L, eq);
  }

  // ---------- 主更新 ----------
  function update() {
    if (cache.size > 400) cache.clear();
    renderTable();
    renderControls();
    schedule();
    renderStats();
  }

  // ---------- 事件 ----------
  const sel = $('#oppSel');
  for (let i = 1; i <= 8; i++) sel.insertAdjacentHTML('beforeend', `<option value="${i}" ${i === S.opp ? 'selected' : ''}>${i} 人</option>`);
  sel.onchange = () => {
    S.opp = +sel.value;
    if (S.mode === 'random' && G) { startGame(); return; }
    update();
  };
  $('#modeSeg').onclick = e => {
    const b = e.target.closest('button');
    if (!b || b.dataset.mode === S.mode) return;
    clearTimer();
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
})();
