// Blackjack odds engine.
// Card ids are 0..51 like the poker engine (rank = c >> 2, 0 = 2 ... 12 = A).
// Blackjack rank index: 0 = A, 1..8 = 2..9, 9 = ten-value (10/J/Q/K).
// Odds use the current shoe composition as fixed draw probabilities (a close, fast approximation).
// Rules: dealer stands on soft 17, dealer peeks for blackjack, double any two cards, double after split, one split.
(function (root) {
  const BJ_LABEL = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const bjIdx = c => { const r = c >> 2; return r === 12 ? 0 : r <= 7 ? r + 1 : 9; };
  const val = i => (i === 0 ? 1 : i + 1);

  // add card index i to a hand state (total, soft); soft = an ace is counted as 11
  function add(t, s, i) {
    t += val(i);
    if (i === 0 && !s && t + 10 <= 21) { t += 10; s = true; }
    if (t > 21 && s) { t -= 10; s = false; }
    return [t, s];
  }
  function handState(cards) {
    let t = 0, s = false;
    for (const c of cards) [t, s] = add(t, s, bjIdx(c));
    return { total: t, soft: s };
  }
  const isBlackjack = cards => cards.length === 2 && handState(cards).total === 21;

  function probs(counts) {
    const n = counts.reduce((a, b) => a + b, 0);
    return counts.map(c => c / n);
  }

  // dealer final distribution: [17, 18, 19, 20, 21, bust]
  function dealerDist(up, p) {
    const memo = new Map();
    function fin(t, s) {
      if (t > 21) return [0, 0, 0, 0, 0, 1];
      if (t >= 17) { const r = [0, 0, 0, 0, 0, 0]; r[t - 17] = 1; return r; }
      const k = t * 2 + (s ? 1 : 0);
      if (memo.has(k)) return memo.get(k);
      const r = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 10; i++) {
        if (!p[i]) continue;
        const [t2, s2] = add(t, s, i);
        const d = fin(t2, s2);
        for (let j = 0; j < 6; j++) r[j] += p[i] * d[j];
      }
      memo.set(k, r);
      return r;
    }
    // hole card, conditioned on the dealer not having blackjack (we only get here after the peek)
    const hole = p.slice();
    if (up === 0) hole[9] = 0;
    if (up === 9) hole[0] = 0;
    const hs = hole.reduce((a, b) => a + b, 0);
    const [t0, s0] = add(0, false, up);
    const r = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 10; i++) {
      if (!hole[i]) continue;
      const [t, s] = add(t0, s0, i);
      const d = fin(t, s);
      for (let j = 0; j < 6; j++) r[j] += (hole[i] / hs) * d[j];
    }
    return r;
  }
  const dealerBJChance = (up, p) => (up === 0 ? p[9] : up === 9 ? p[0] : 0);

  // outcome objects: { ev, w, pu, l } (ev in units of the bet on this hand)
  const LOSE = { ev: -1, w: 0, pu: 0, l: 1 };
  function mix(acc, o, q, mult = 1) {
    acc.ev += q * o.ev * mult; acc.w += q * o.w; acc.pu += q * o.pu; acc.l += q * o.l;
  }
  function makeSolver(p, D) {
    const standMemo = new Map(), bestMemo = new Map(), hitMemo = new Map();
    function stand(t) {
      if (t > 21) return LOSE;
      if (standMemo.has(t)) return standMemo.get(t);
      let w = D[5], pu = 0;
      for (let v = 17; v <= 21; v++) {
        if (v < t) w += D[v - 17]; else if (v === t) pu += D[v - 17];
      }
      const l = 1 - w - pu;
      const o = { ev: w - l, w, pu, l };
      standMemo.set(t, o);
      return o;
    }
    function hit(t, s) {
      const k = t * 2 + (s ? 1 : 0);
      if (hitMemo.has(k)) return hitMemo.get(k);
      const acc = { ev: 0, w: 0, pu: 0, l: 0 };
      for (let i = 0; i < 10; i++) {
        if (!p[i]) continue;
        const [t2, s2] = add(t, s, i);
        mix(acc, best(t2, s2), p[i]);
      }
      hitMemo.set(k, acc);
      return acc;
    }
    // best of stand / hit from here (no double)
    function best(t, s) {
      if (t > 21) return { ...LOSE, act: 'bust' };
      if (t === 21) return { ...stand(21), act: 'stand' };
      const k = t * 2 + (s ? 1 : 0);
      if (bestMemo.has(k)) return bestMemo.get(k);
      const st = stand(t), h = hit(t, s);
      const o = h.ev > st.ev ? { ...h, act: 'hit' } : { ...st, act: 'stand' };
      bestMemo.set(k, o);
      return o;
    }
    // double: one card, then stand, with twice the bet
    function dbl(t, s) {
      const acc = { ev: 0, w: 0, pu: 0, l: 0 };
      for (let i = 0; i < 10; i++) {
        if (!p[i]) continue;
        const [t2] = add(t, s, i);
        mix(acc, stand(t2), p[i], 2);
      }
      return acc;
    }
    // one hand after splitting a pair of rank index r (EV per split hand, each with the original bet)
    function splitOne(r) {
      const acc = { ev: 0, w: 0, pu: 0, l: 0 };
      const [t0, s0] = add(0, false, r);
      for (let i = 0; i < 10; i++) {
        if (!p[i]) continue;
        const [t, s] = add(t0, s0, i);
        let o;
        if (r === 0) o = stand(t); // split aces get one card each
        else { const b = best(t, s), d = dbl(t, s); o = d.ev > b.ev ? d : b; }
        mix(acc, o, p[i]);
      }
      return acc;
    }
    return { stand, hit, best, dbl, splitOne };
  }

  // all options for a hand: which actions are allowed is decided by the caller
  function options(p, up, cards, allow) {
    const D = dealerDist(up, p), sv = makeSolver(p, D);
    const { total: t, soft: s } = handState(cards);
    const out = {};
    out.stand = { ...sv.stand(t) };
    if (t < 21) out.hit = { ...sv.hit(t, s) };
    if (allow.double && t < 21) out.double = sv.dbl(t, s);
    if (allow.split) {
      const one = sv.splitOne(bjIdx(cards[0]));
      out.split = { ev: one.ev * 2, w: one.w, pu: one.pu, l: one.l };
    }
    let bestKey = null;
    for (const k of Object.keys(out)) if (!bestKey || out[k].ev > out[bestKey].ev + 1e-12) bestKey = k;
    return { D, sv, opts: out, best: bestKey };
  }

  // player's expected edge for the next hand before cards are dealt, given the shoe
  function preDealEdge(p) {
    let edge = 0;
    for (let up = 0; up < 10; up++) {
      if (!p[up]) continue;
      const D = dealerDist(up, p), sv = makeSolver(p, D), dbj = dealerBJChance(up, p);
      for (let a = 0; a < 10; a++) for (let b = a; b < 10; b++) {
        const q = p[up] * p[a] * p[b] * (a === b ? 1 : 2);
        if (!q) continue;
        let ev;
        if ((a === 0 && b === 9) || (a === 9 && b === 0)) ev = (1 - dbj) * 1.5;
        else {
          let [t, s] = add(0, false, a);
          [t, s] = add(t, s, b);
          let e = Math.max(sv.best(t, s).ev, sv.dbl(t, s).ev);
          if (a === b) e = Math.max(e, sv.splitOne(a).ev * 2);
          ev = dbj * -1 + (1 - dbj) * e;
        }
        edge += q * ev;
      }
    }
    return edge;
  }

  const hiLo = i => (i >= 1 && i <= 5 ? 1 : i === 0 || i === 9 ? -1 : 0);

  const api = { BJ_LABEL, bjIdx, val, add, handState, isBlackjack, probs, dealerDist, dealerBJChance, makeSolver, options, preDealEdge, hiLo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BJ = api;
})(this);
