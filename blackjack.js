(function () {
  const B = window.BJ;
  const $ = s => document.querySelector(s);
  const SUIT = ['♠', '♥', '♦', '♣'];
  const DECKS = 6, START_BANK = 1000, MIN_BET = 5;
  const ACT_NAME = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split' };

  // ---------- helpers ----------
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rankLabel = c => { const r = '23456789TJQKA'[c >> 2]; return r === 'T' ? '10' : r; };
  const ct = c => rankLabel(c) + SUIT[c & 3];
  const cts = cs => cs.map(ct).join(' ');
  const pc = x => (x * 100).toFixed(1) + '%';
  const signed = x => (x >= 0 ? '+' : '') + (Math.round(x * 10) / 10).toLocaleString('en-US');
  const evTxt = x => (x >= 0 ? '+' : '') + x.toFixed(3);
  const money = x => Math.round(x * 10) / 10;
  const handDesc = cards => { const s = B.handState(cards); return (s.soft ? 'soft ' : 'hard ') + s.total; };
  const upName = c => { const i = B.bjIdx(c); return i === 0 ? 'Ace' : i === 9 ? '10' : String(i + 1); };

  function cardHTML(c, cls = '') {
    if (c == null) return `<div class="card back ${cls}"></div>`;
    const s = SUIT[c & 3];
    return `<div class="card s${c & 3} ${cls}"><span class="r">${rankLabel(c)}</span><span class="r2">${s}</span><span class="pip">${s}</span></div>`;
  }

  const S = {
    bank: START_BANK, bet: 25, shoe: [], cut: 0, rc: 0, phase: 'bet',
    dealer: [], holeShown: false, peeked: false, hands: [], cur: 0,
    log: [], timeline: [], result: null, opts: null, decKey: 0, startEV: null,
    session: { hands: 0, net: 0, lost: 0, matched: 0, judged: 0 },
    guessMode: false, guesses: {}, guessLog: [], guessLogged: new Set(),
    shown: { dealer: 0, hands: [] }, timer: null,
  };

  // ---------- shoe ----------
  function newShoe() {
    const a = [];
    for (let d = 0; d < DECKS; d++) for (let c = 0; c < 52; c++) a.push(c);
    S.shoe = shuffle(a); S.rc = 0; S.cut = Math.floor(a.length * 0.25); S.justShuffled = true;
  }
  function draw(visible = true) {
    const c = S.shoe.pop();
    if (visible) S.rc += B.hiLo(B.bjIdx(c));
    return c;
  }
  // cards the player can't see: the shoe plus the dealer's hole card while it's face down
  function unseenCounts() {
    const n = new Array(10).fill(0);
    for (const c of S.shoe) n[B.bjIdx(c)]++;
    if (S.phase === 'play' && !S.holeShown && S.dealer[1] != null) n[B.bjIdx(S.dealer[1])]++;
    return n;
  }
  const decksLeft = () => Math.max(0.25, unseenCounts().reduce((a, b) => a + b, 0) / 52);
  const trueCount = () => S.rc / decksLeft();

  // ---------- game flow ----------
  function allowed() {
    const h = S.hands[S.cur];
    if (!h) return { double: false, split: false };
    const two = h.cards.length === 2;
    return {
      double: two && S.bank >= h.bet && !h.splitAces,
      split: two && S.hands.length === 1 && B.bjIdx(h.cards[0]) === B.bjIdx(h.cards[1]) && S.bank >= h.bet,
    };
  }

  function deal() {
    if (S.phase !== 'bet' && S.phase !== 'over') return;
    if (S.bank < MIN_BET) { S.bank = START_BANK; S.bet = 25; }
    S.bet = Math.min(S.bet, S.bank);
    if (S.bet < MIN_BET) return;
    if (!S.shoe.length || S.shoe.length < S.cut) newShoe(); else S.justShuffled = false;
    clearTimeout(S.timer);
    S.bank -= S.bet;
    S.result = null; S.log = []; S.timeline = []; S.holeShown = false; S.peeked = false; S.startEV = null;
    S.shown = { dealer: 0, hands: [] };
    $('#fx').innerHTML = '';
    const p1 = draw(), d1 = draw(), p2 = draw(), d2 = draw(false);
    S.dealer = [d1, d2];
    S.hands = [{ cards: [p1, p2], bet: S.bet, done: false }];
    S.cur = 0; S.phase = 'play';
    const up = B.bjIdx(d1);
    const dealerBJ = B.isBlackjack(S.dealer), playerBJ = B.isBlackjack(S.hands[0].cards);
    if (up === 0 || up === 9) S.peeked = true;
    if (dealerBJ || playerBJ) {
      S.hands[0].done = true;
      S.hands[0].bj = playerBJ;
      return dealerPlay();
    }
    point('Deal');
    S.startEV = S.opts ? S.opts.opts[S.opts.best].ev : null;
    update();
  }

  function act(type) {
    if (S.phase !== 'play') return;
    const h = S.hands[S.cur], al = allowed(), st = B.handState(h.cards);
    if (type === 'double' && !al.double) return;
    if (type === 'split' && !al.split) return;
    if (type === 'hit' && st.total >= 21) return;
    const o = S.opts;
    if (o && o.opts[type]) {
      const evBest = o.opts[o.best].ev, evMine = o.opts[type].ev;
      S.log.push({
        hand: S.cur, desc: handDesc(h.cards), cards: h.cards.slice(), up: S.dealer[0],
        act: type, best: o.best, evMine, evBest, lost: Math.max(0, evBest - evMine), bet: h.bet,
      });
    }
    if (type === 'hit') {
      h.cards.push(draw());
      if (B.handState(h.cards).total >= 21) h.done = true;
    } else if (type === 'stand') {
      h.done = true;
    } else if (type === 'double') {
      S.bank -= h.bet; h.bet *= 2; h.doubled = true;
      h.cards.push(draw());
      h.done = true;
    } else if (type === 'split') {
      S.bank -= h.bet;
      const c2 = h.cards.pop(), aces = B.bjIdx(c2) === 0;
      const h2 = { cards: [c2], bet: h.bet, split: true, splitAces: aces, done: false };
      h.split = true; h.splitAces = aces;
      h.cards.push(draw()); h2.cards.push(draw());
      S.hands.push(h2);
      for (const x of [h, h2]) if (aces || B.handState(x.cards).total === 21) x.done = true;
    }
    S.decKey++;
    const label = type === 'hit' ? 'Hit' : type === 'double' ? 'Double' : type === 'split' ? 'Split' : null;
    while (S.cur < S.hands.length && S.hands[S.cur].done) S.cur++;
    if (S.cur >= S.hands.length) { S.cur = S.hands.length - 1; return dealerPlay(); }
    point(label || `Hand ${S.cur + 1}`);
    update();
  }

  function dealerPlay() {
    S.phase = 'dealer';
    S.holeShown = true;
    S.rc += B.hiLo(B.bjIdx(S.dealer[1]));
    const dealerBJ = B.isBlackjack(S.dealer);
    const live = S.hands.some(h => !h.bj && B.handState(h.cards).total <= 21);
    update();
    const step = () => {
      const st = B.handState(S.dealer);
      if (!dealerBJ && live && st.total < 17) {
        S.timer = setTimeout(() => { S.dealer.push(draw()); update(); step(); }, 700);
      } else S.timer = setTimeout(finish, 450);
    };
    step();
  }

  function finish() {
    const ds = B.handState(S.dealer), dealerBJ = B.isBlackjack(S.dealer), dBust = ds.total > 21;
    let paid = 0, staked = 0;
    for (const h of S.hands) {
      const st = B.handState(h.cards);
      staked += h.bet;
      let pay = 0, res;
      if (dealerBJ) { if (h.bj) { pay = h.bet; res = 'Push'; } else res = 'Lose'; }
      else if (h.bj) { pay = h.bet * 2.5; res = 'Blackjack!'; }
      else if (st.total > 21) res = 'Bust';
      else if (dBust || st.total > ds.total) { pay = h.bet * 2; res = 'Win'; }
      else if (st.total === ds.total) { pay = h.bet; res = 'Push'; }
      else res = 'Lose';
      h.res = res; h.net = pay - h.bet;
      paid += pay;
    }
    S.bank += paid;
    const net = paid - staked;
    const lost = S.log.reduce((a, d) => a + d.lost * d.bet, 0);
    S.result = { net, dealerBJ, dBust, dealerTotal: ds.total, lost };
    S.phase = 'over';
    S.session.hands++; S.session.net += net; S.session.lost += lost;
    S.log.forEach(d => { S.session.judged++; if (d.act === d.best) S.session.matched++; });
    S.timeline.push({ label: 'Result', w: net > 0 ? 1 : net === 0 ? 0.5 : 0, final: true });
    update();
    if (net > 0) chipShower(Math.min(40, 10 + Math.round(net / 5)));
  }

  function point(label) {
    computeOpts();
    if (!S.opts) return;
    const b = S.opts.opts[S.opts.best];
    S.timeline.push({ label, w: b.w, ev: b.ev });
  }

  function chipShower(n) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fx = $('#fx'), H = fx.clientHeight + 60, cols = ['', 'blue', 'green', 'black', 'gold'];
    let h = '';
    for (let i = 0; i < n; i++) {
      const dur = 1.2 + Math.random() * 1.3, delay = Math.random() * 0.6;
      h += `<div class="fall" style="left:${Math.random() * 100}%;animation-duration:${dur}s;animation-delay:${delay}s;--dy:${H}px;--rot:${(Math.random() * 720 - 360) | 0}deg"><span class="chip ${cols[(Math.random() * cols.length) | 0]}"></span></div>`;
    }
    fx.innerHTML = h;
    setTimeout(() => { if (fx.innerHTML === h) fx.innerHTML = ''; }, 3200);
  }

  // ---------- odds ----------
  function computeOpts() {
    if (S.phase !== 'play') { S.opts = null; return; }
    const h = S.hands[S.cur];
    const p = B.probs(unseenCounts());
    S.opts = B.options(p, B.bjIdx(S.dealer[0]), h.cards, allowed());
    S.opts.p = p;
  }

  // ---------- render ----------
  function renderTable() {
    // dealer
    const dc = S.dealer.map((c, i) => {
      const hidden = i === 1 && !S.holeShown;
      const isNew = i >= S.shown.dealer || (i === 1 && S.holeShown && !S.shown.hole);
      return hidden ? cardHTML(null, isNew ? 'deal' : '') : cardHTML(c, isNew ? (i === 1 ? 'flip' : 'deal') : '');
    }).join('');
    $('#dealerCards').innerHTML = dc;
    let dl = 'Dealer';
    if (S.dealer.length) {
      if (!S.holeShown) dl = `Dealer shows ${B.handState([S.dealer[0]]).total === 11 ? 'an Ace' : B.handState([S.dealer[0]]).total}`;
      else { const ds = B.handState(S.dealer); dl = `Dealer · ${B.isBlackjack(S.dealer) ? 'Blackjack' : ds.total > 21 ? `Bust (${ds.total})` : (ds.soft ? 'soft ' : '') + ds.total}`; }
    }
    $('#dealerLabel').textContent = dl;
    S.shown.dealer = S.dealer.length; S.shown.hole = S.holeShown;

    // player hands
    let ph = '';
    S.hands.forEach((h, k) => {
      const st = B.handState(h.cards), seen = S.shown.hands[k] || 0;
      const cards = h.cards.map((c, i) => cardHTML(c, i >= seen ? 'deal' : '')).join('');
      const active = S.phase === 'play' && k === S.cur;
      const tot = h.bj ? 'Blackjack' : st.total > 21 ? `Bust (${st.total})` : (st.soft ? 'soft ' : '') + st.total;
      const res = h.res ? `<span class="res ${h.net > 0 ? 'good' : h.net < 0 ? 'bad' : ''}">${h.res} ${h.net ? signed(h.net) : ''}</span>` : '';
      ph += `<div class="bj-hand ${active ? 'active' : ''}"><div class="bj-cards">${cards}</div><div class="bj-label">${S.hands.length > 1 ? `Hand ${k + 1} · ` : ''}${tot} · <span class="chip gold"></span>${h.bet}${h.doubled ? ' (doubled)' : ''} ${res}</div></div>`;
      S.shown.hands[k] = h.cards.length;
    });
    $('#playerHands').innerHTML = ph || '<div class="bj-hand"><div class="bj-cards"><div class="card empty"></div><div class="card empty"></div></div><div class="bj-label">You</div></div>';

    // shoe
    const left = S.shoe.length, total = DECKS * 52;
    $('#shoeBox').innerHTML = `<div class="shoe-body"><i style="height:${(left / total) * 100}%"></i></div><div class="shoe-txt">Shoe<br><b>${left}</b> cards<br>Count <b>${S.rc >= 0 ? '+' : ''}${S.rc}</b></div>`;

    $('#msg').innerHTML = tableMsg();
  }
  function tableMsg() {
    if (S.phase === 'bet') return S.justShuffled === undefined ? 'Place your bet and press <b>Deal</b>' : 'Place your bet and press <b>Deal</b>';
    if (S.phase === 'dealer') return S.holeShown ? 'Dealer plays…' : '';
    if (S.phase === 'over') {
      const R = S.result;
      if (R.net > 0) return `<span class="win-banner">YOU WIN ${signed(R.net)}!</span>`;
      if (R.net === 0) return 'Push. Your bet comes back.';
      return R.dealerBJ ? `Dealer has blackjack · <b class="bad">${signed(R.net)}</b>` : `Dealer wins · <b class="bad">${signed(R.net)}</b>`;
    }
    const h = S.hands[S.cur];
    let s = S.hands.length > 1 ? `👉 Hand ${S.cur + 1}: your move` : '👉 Your move';
    if (S.peeked && S.log.length === 0 && S.cur === 0) s = 'Dealer checked for blackjack: none.<br>' + s;
    return h ? s : '';
  }

  function renderControls() {
    const betting = S.phase === 'bet' || S.phase === 'over';
    $('#betTools').hidden = !betting;
    $('#actBar').hidden = S.phase !== 'play';
    $('#bankShow').innerHTML = `<span class="chip gold"></span>${money(S.bank).toLocaleString('en-US')}`;
    $('#betShow').innerHTML = `<span class="chip"></span>${S.bet}`;
    $('#dealBtn').textContent = S.bank < MIN_BET ? 'Rebuy 1,000 & deal' : S.phase === 'over' ? 'Deal again' : 'Deal';
    if (S.phase === 'play') {
      const h = S.hands[S.cur], al = allowed(), st = B.handState(h.cards);
      $('#hitBtn').disabled = st.total >= 21;
      $('#doubleBtn').hidden = !al.double;
      $('#splitBtn').hidden = !al.split;
      const a = S.opts && S.opts.best;
      $('#adviceBtn').disabled = !a;
      $('#adviceBtn').textContent = a ? `💡 Follow advice: ${ACT_NAME[a]}` : '💡 Working out advice…';
    }
    renderSession();
  }
  function renderSession() {
    const ss = S.session;
    let h = '';
    if (ss.hands) {
      h += `Hands <b>${ss.hands}</b> · Session result <b class="${ss.net >= 0 ? 'good' : 'bad'}">${signed(ss.net)}</b> chips · Decisions matching best play <b>${ss.matched}/${ss.judged}</b>`;
      if (ss.lost > 0.05) h += ` · Chips given away by mistakes (on average) <b class="bad">${money(ss.lost)}</b>`;
    }
    if (S.guessLog.length) {
      const avg = S.guessLog.reduce((a, b) => a + b, 0) / S.guessLog.length;
      const rank = avg < 5 ? 'Pro-level read 🧠' : avg < 10 ? 'Seasoned 👍' : avg < 18 ? 'Getting there 🙂' : 'Rookie, keep practicing 🐣';
      h += `${h ? '<br>' : ''}🎯 ${S.guessLog.length} guesses, average miss <b>${avg.toFixed(1)}</b> points · ${rank}`;
    }
    $('#session').innerHTML = h;
  }

  function renderPreDeal() {
    const n = unseenCounts();
    const fresh = !S.shoe.length || S.shoe.length < S.cut;
    const p = fresh ? B.probs([24, 24, 24, 24, 24, 24, 24, 24, 24, 96]) : B.probs(n);
    const edge = B.preDealEdge(p) * 100;
    const tc = fresh ? 0 : trueCount();
    let html = `<p class="ana">Your expected edge on the next hand: <b class="${edge >= 0 ? 'good' : 'bad'}">${edge >= 0 ? '+' : ''}${edge.toFixed(2)}%</b> of your bet${edge < 0 ? ` (the house edge is ${(-edge).toFixed(2)}%)` : ' (the shoe favors you right now!)'}.</p>`;
    html += `<p class="ana">${fresh ? 'A fresh shoe will be shuffled for this hand.' : `Shoe: <b>${n.reduce((a, b) => a + b, 0)}</b> cards left · Running count <b>${S.rc >= 0 ? '+' : ''}${S.rc}</b> · True count <b>${tc >= 0 ? '+' : ''}${tc.toFixed(1)}</b>`}</p>`;
    html += `<p class="sub">The count (Hi-Lo) adds 1 for each 2–6 seen and subtracts 1 for each 10 or Ace. A high true count means the shoe is rich in tens and aces, which gives you more blackjacks and makes the dealer bust more. Each +1 of true count is worth roughly +0.5% to you.</p>`;
    if (tc >= 2) html += '<p class="ana">🔥 The count is high: a card counter would bet bigger here.</p>';
    else if (tc <= -2) html += '<p class="ana">🥶 The count is low: a card counter would bet the minimum here.</p>';
    if (S.phase === 'over') html = reviewHTML() + '<h4 class="ana">Next hand</h4>' + html;
    $('#preTitle').textContent = S.phase === 'over' ? '📋 Hand Replay' : '🎰 Before You Deal';
    $('#preDeal').innerHTML = html;
  }

  function renderStats() {
    const playing = S.phase === 'play';
    $('#statsEmpty').hidden = playing || S.phase === 'dealer';
    $('#statsMain').hidden = !(playing || S.phase === 'dealer');
    if (!playing && S.phase !== 'dealer') { renderPreDeal(); return; }
    if (S.phase === 'dealer') { $('#guessBox').hidden = true; $('#info').classList.remove('veiled'); return; }
    computeOpts();
    const o = S.opts, h = S.hands[S.cur], b = o.opts[o.best];
    const gk = S.decKey + '|' + S.cur + '|' + h.cards.join(',');
    const veiled = S.guessMode && !(gk in S.guesses);
    $('#guessBox').hidden = !veiled;
    $('#info').classList.toggle('veiled', veiled);
    renderGuessResult(gk, b.w);

    $('#streetTag').textContent = `${S.hands.length > 1 ? `Hand ${S.cur + 1} · ` : ''}${handDesc(h.cards)} vs dealer ${upName(S.dealer[0])}`;
    $('#eqBig').textContent = pc(b.w);
    $('#eqBig').style.color = b.ev > 0.05 ? 'var(--up)' : b.ev < -0.3 ? 'var(--down)' : 'var(--text)';
    $('#bWin').style.width = b.w * 100 + '%'; $('#bTie').style.width = b.pu * 100 + '%'; $('#bLose').style.width = b.l * 100 + '%';
    $('#eqSub').innerHTML = `Chance to win if you play it right: win ${pc(b.w)} · push ${pc(b.pu)} · lose ${pc(b.l)}<br>Expected result: <b>${evTxt(b.ev)}</b> bets (${signed(b.ev * h.bet)} chips at your ${h.bet} bet)`;
    const prev = S.timeline.length > 1 ? S.timeline[S.timeline.length - 2] : null;
    const d = prev && !prev.final ? (b.w - prev.w) * 100 : null;
    $('#eqDelta').innerHTML = d == null ? '' : `<span class="delta ${d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat'}">${d > 0.5 ? '▲' : d < -0.5 ? '▼' : '■'} ${d >= 0 ? '+' : ''}${d.toFixed(1)}</span>`;
    $('#comment').innerHTML = b.ev > 0.3 ? '🔥 Great spot. Press your advantage.' : b.ev > 0 ? "👍 You're the favorite here" : b.ev > -0.2 ? '🙂 Close to even' : b.ev > -0.45 ? '📉 Tough spot; the right play loses least' : '🥶 Bad spot: minimize the damage';

    renderOptTable(o, h);
    renderAnalysis(o, h);
    renderChart();
    renderHeat(o, h);
    renderDealer(o);
    renderControls();
  }

  function renderOptTable(o, h) {
    const order = ['stand', 'hit', 'double', 'split'].filter(k => o.opts[k]);
    let t = '<table class="rv opt"><tr><th>Play</th><th>Win</th><th>Push</th><th>Lose</th><th>EV (bets)</th></tr>';
    for (const k of order) {
      const x = o.opts[k], best = k === o.best;
      t += `<tr class="${best ? 'best' : ''}"><td>${best ? '★ ' : ''}${ACT_NAME[k]}</td><td>${pc(x.w)}</td><td>${pc(x.pu)}</td><td>${pc(x.l)}</td><td><b class="${x.ev >= 0 ? 'good' : 'bad'}">${evTxt(x.ev)}</b></td></tr>`;
    }
    t += '</table>';
    const second = order.filter(k => k !== o.best).sort((a, z) => o.opts[z].ev - o.opts[a].ev)[0];
    const gap = second ? o.opts[o.best].ev - o.opts[second].ev : 0;
    t += `<div class="adv raise"><div class="adv-act">Best play: ${ACT_NAME[o.best]}</div>`;
    if (second) t += `<div class="adv-size">${gap < 0.01 ? `Almost a coin flip: ${ACT_NAME[second]} is only ${gap.toFixed(3)} bets worse.` : `${ACT_NAME[second]} would cost ${gap.toFixed(3)} bets on average (${money(gap * h.bet)} chips at your bet).`}</div>`;
    t += '</div>';
    if (o.opts.double || o.opts.split) t += '<p class="sub">Double and split EVs count the extra chips you put in. Split shows win/push/lose for each of the two hands.</p>';
    $('#optTable').innerHTML = t;
  }

  function bustInfo(p, h) {
    const st = B.handState(h.cards);
    let bust = 0;
    const bad = [];
    for (let i = 0; i < 10; i++) {
      const [t2] = B.add(st.total, st.soft, i);
      if (t2 > 21) { bust += p[i]; bad.push(B.BJ_LABEL[i]); }
    }
    return { bust, bad };
  }

  function renderAnalysis(o, h) {
    const st = B.handState(h.cards), up = B.bjIdx(S.dealer[0]), D = o.D, p = o.p;
    let html = '<h4>Where you stand</h4><p>';
    html += `You have <b>${cts(h.cards)}</b> (${handDesc(h.cards)}) against the dealer's <b>${ct(S.dealer[0])}</b>. `;
    if (S.peeked) html += 'The dealer peeked and does <b>not</b> have blackjack. ';
    html += `With a ${upName(S.dealer[0])} showing, the dealer busts <b>${pc(D[5])}</b> of the time.</p>`;

    const bi = bustInfo(p, h);
    if (st.total < 21) {
      html += `<h4>If you take a card</h4><p>You bust <b>${pc(bi.bust)}</b> of the time${bi.bad.length ? ` (any ${bi.bad.join(', ')})` : ''}.`;
      if (!bi.bad.length) html += ' You can never bust with one more card here, so hitting is free of risk.';
      html += '</p>';
    }

    html += '<h4>Why this play</h4><ul>';
    const dw = up >= 1 && up <= 5;
    if (!st.soft && st.total >= 12 && st.total <= 16) {
      html += dw ? `<li>Hard ${st.total} vs a weak dealer card (${upName(S.dealer[0])}): let the dealer take the risk of busting.</li>`
        : `<li>Hard ${st.total} vs a strong dealer card (${upName(S.dealer[0])}) is the "stiff hand" zone: you lose more often than not whatever you do; the best play just loses least.</li>`;
    }
    if (!st.soft && (st.total === 10 || st.total === 11) && h.cards.length === 2) html += '<li>10 or 11 is a great doubling hand: many cards give you 20 or 21.</li>';
    if (st.soft && st.total <= 17) html += '<li>Soft hands can\'t bust on the next card, so improving them is cheap.</li>';
    if (st.soft && st.total === 18) html += `<li>Soft 18 is tricky: strong against weak dealer cards, but behind a dealer 9, 10 or Ace.</li>`;
    if (o.opts.split) {
      const r = B.bjIdx(h.cards[0]);
      if (r === 0 || r === 7) html += '<li>Always split Aces and 8s: two fresh starts beat one bad total.</li>';
      if (r === 9) html += '<li>Never split tens: 20 is already a winning hand.</li>';
      if (r === 4) html += '<li>Never split 5s: 10 is a doubling hand, not two weak hands.</li>';
    }
    if (st.total >= 17 && !st.soft) html += '<li>Hard 17 or more: hitting busts too often, so stand.</li>';
    html += `<li>The odds use the cards left in the shoe, so they shift slightly as the count changes.</li></ul>`;

    const tc = trueCount();
    html += `<p class="sub">Shoe: ${S.shoe.length} cards left · Running count ${S.rc >= 0 ? '+' : ''}${S.rc} · True count ${tc >= 0 ? '+' : ''}${tc.toFixed(1)}${tc >= 2 ? ' (rich in tens and aces: good for you)' : tc <= -2 ? ' (rich in small cards: good for the dealer)' : ''}</p>`;
    $('#analysis').innerHTML = html;
  }

  function renderChart() {
    const pts = S.timeline.filter(x => !x.final);
    const W = 340, H = 170, pl = 34, pr = 16, pt = 22, pb = 26;
    const n = Math.max(2, pts.length);
    const xs = i => pl + (i * (W - pl - pr)) / (n - 1);
    const ys = v => pt + (1 - v) * (H - pt - pb);
    let g = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(v => (g += `<line class="c-grid" x1="${pl}" x2="${W - pr}" y1="${ys(v)}" y2="${ys(v)}"/><text class="c-ax" x="${pl - 6}" y="${ys(v) + 4}" text-anchor="end">${v * 100}</text>`));
    if (pts.length) {
      const P = pts.map((x, i) => ({ x: xs(i), y: ys(x.w), v: x.w, label: x.label }));
      const line = P.map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' ');
      if (P.length > 1) g += `<path class="c-area" d="${line} L${P[P.length - 1].x},${ys(0)} L${P[0].x},${ys(0)} Z"/>`;
      g += `<path class="c-line" d="${line}"/>`;
      P.forEach(q => (g += `<circle class="c-dot" cx="${q.x}" cy="${q.y}" r="4.5"/><text class="c-txt" x="${q.x}" y="${q.y - 10}" text-anchor="middle">${(q.v * 100).toFixed(0)}%</text><text class="c-ax" x="${q.x}" y="${H - 6}" text-anchor="middle">${q.label}</text>`));
    }
    $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Win chance after each card">${g}</svg>`;
  }

  function renderHeat(o, h) {
    const st = B.handState(h.cards);
    if (st.total >= 21 || !o.opts.hit) { $('#heatSec').hidden = true; return; }
    $('#heatSec').hidden = false;
    const p = o.p, curW = o.opts[o.best].w, list = [];
    let html = '';
    for (let i = 0; i < 10; i++) {
      const [t2, s2] = B.add(st.total, st.soft, i);
      if (t2 > 21) {
        html += `<div class="bjc bust"><b>${B.BJ_LABEL[i]}</b><span>${pc(p[i])}</span><small>BUST</small></div>`;
        list.push({ i, w: 0 });
        continue;
      }
      const w = o.sv.best(t2, s2).w, diff = w - curW;
      list.push({ i, w });
      const a = Math.min(0.85, Math.abs(diff) * 3 + 0.08);
      html += `<div class="bjc" style="background:${diff >= 0 ? `rgba(79,209,139,${a})` : `rgba(255,107,107,${a})`}"><b>${B.BJ_LABEL[i]}</b><span>${pc(p[i])}</span><small>${(s2 ? 's' : '') + t2} · ${(w * 100).toFixed(0)}%</small></div>`;
    }
    $('#heat').innerHTML = html;
    const bi = bustInfo(p, h);
    list.sort((a, z) => z.w - a.w);
    $('#heatSum').innerHTML = `Each tile: the card, its chance of coming next, and your new total · win chance after it.<br>Bust chance if you hit: <b class="${bi.bust > 0.4 ? 'bad' : ''}">${pc(bi.bust)}</b> · Best cards to catch: ${list.slice(0, 3).map(x => B.BJ_LABEL[x.i]).join(', ')}`;
  }

  function renderDealer(o) {
    const D = o.D, labels = ['17', '18', '19', '20', '21', 'Bust'];
    let h = `<p class="sub">Dealer showing ${upName(S.dealer[0])}, after checking for blackjack:</p>`;
    for (let k = 5; k >= 0; k--) {
      h += `<div class="cat-row"><span>${labels[k]}</span><div class="cb"><i style="width:${D[k] * 100}%;${k === 5 ? 'background:var(--up)' : ''}"></i></div><span>${pc(D[k])}</span></div>`;
    }
    $('#cats').innerHTML = h;
  }

  function renderGuessResult(gk, w) {
    const box = $('#guessResult');
    if (!S.guessMode || !(gk in S.guesses)) { box.hidden = true; return; }
    box.hidden = false;
    const g = S.guesses[gk], err = Math.abs(g - w * 100);
    if (!S.guessLogged.has(gk)) { S.guessLogged.add(gk); S.guessLog.push(err); }
    const v = err < 3 ? '🎯 Spot on!' : err < 8 ? '👏 Very close' : err < 15 ? '🤏 A little off' : '🙈 Way off';
    box.innerHTML = `You guessed <b>${g}%</b>, actual <b>${pc(w)}</b>, off by <b>${err.toFixed(1)}</b> points · ${v}`;
  }

  function reviewHTML() {
    const R = S.result;
    if (!R) return '';
    let html = '<h4 class="ana">📋 Hand replay</h4><div class="ana">';
    const ds = B.handState(S.dealer);
    const dline = R.dealerBJ ? 'The dealer had <b>blackjack</b>.' : `The dealer's hole card was <b>${ct(S.dealer[1])}</b>; the dealer finished with <b>${ds.total > 21 ? `${ds.total} (bust)` : ds.total}</b>.`;
    let verdict;
    if (S.hands.some(h => h.bj) && !R.dealerBJ) verdict = `🂡 <b>Blackjack!</b> Paid 3 to 2.`;
    else if (R.dealerBJ) verdict = S.hands[0].bj ? '🤝 Both of you had blackjack: push.' : '😶 Nothing you could do: the dealer had blackjack.';
    else if (R.net > 0) verdict = `💰 You won <b>${signed(R.net)}</b> chips.`;
    else if (R.net === 0) verdict = '🤝 Push overall.';
    else verdict = `🧊 You lost <b>${money(-R.net)}</b> chips.`;
    html += `<div class="verdict">${verdict} ${dline}</div>`;

    if (S.log.length) {
      html += '<ul>';
      for (const d of S.log) {
        const ok = d.act === d.best;
        html += `<li>${S.hands.length > 1 ? `Hand ${d.hand + 1}, ` : ''}${d.desc} (${cts(d.cards)}) vs ${upName(d.up)}: you chose <b>${ACT_NAME[d.act]}</b> (EV ${evTxt(d.evMine)})${ok ? ' ✅ best play' : `, best was <b>${ACT_NAME[d.best]}</b> (EV ${evTxt(d.evBest)}) ⚠️ cost ${money(d.lost * d.bet)} chips on average`}</li>`;
      }
      html += '</ul>';
      if (S.startEV != null) {
        const bet0 = S.log[0].bet;
        const expected = (S.startEV - S.log.reduce((a, d) => a + d.lost * (d.bet / bet0), 0)) * bet0;
        const luck = R.net - expected;
        html += `<p>With the choices you made, this hand was worth <b>${signed(money(expected))}</b> chips on average. You got <b>${signed(R.net)}</b>, so luck was <b class="${luck >= 0 ? 'good' : 'bad'}">${signed(money(luck))}</b>.</p>`;
      }
    }
    html += '</div>';
    return html;
  }

  function update() {
    renderTable();
    if (S.phase === 'play') computeOpts();
    renderControls();
    renderStats();
  }

  // ---------- events ----------
  $('#chipRow').onclick = e => {
    const b = e.target.closest('[data-add]');
    if (!b || !(S.phase === 'bet' || S.phase === 'over')) return;
    S.bet = Math.min(S.bank < MIN_BET ? START_BANK : S.bank, S.bet + +b.dataset.add);
    renderControls();
  };
  $('#clearBet').onclick = () => { S.bet = MIN_BET; renderControls(); };
  $('#dealBtn').onclick = deal;
  $('#hitBtn').onclick = () => act('hit');
  $('#standBtn').onclick = () => act('stand');
  $('#doubleBtn').onclick = () => act('double');
  $('#splitBtn').onclick = () => act('split');
  $('#adviceBtn').onclick = () => { if (S.opts) act(S.opts.best); };
  $('#guessToggle').onchange = e => { S.guessMode = e.target.checked; renderStats(); };
  $('#guessRange').oninput = e => ($('#guessVal').textContent = e.target.value + '%');
  $('#guessBtn').onclick = () => {
    const h = S.hands[S.cur];
    S.guesses[S.decKey + '|' + S.cur + '|' + h.cards.join(',')] = +$('#guessRange').value;
    renderStats();
  };
  document.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (S.phase === 'play') {
      const al = allowed();
      if (k === 'h') act('hit');
      else if (k === 's') act('stand');
      else if (k === 'd' && al.double) act('double');
      else if (k === 'p' && al.split) act('split');
      return;
    }
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON' && (S.phase === 'bet' || S.phase === 'over')) { e.preventDefault(); deal(); }
  });

  update();
})();
