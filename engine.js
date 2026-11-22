// 德州扑克胜率引擎：7 张牌评估 + 蒙特卡洛模拟
// 牌编码：0..51，rank = c >> 2（0 = 2 ... 12 = A），suit = c & 3（♠♥♦♣）
(function (root) {
  const RANKS = '23456789TJQKA';
  const SUIT_SYM = ['♠', '♥', '♦', '♣'];
  const CAT_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

  const RC = new Int8Array(13), SC = new Int8Array(4), SM = new Int32Array(4);

  // 在 rank 位掩码中找顺子，返回最高牌 rank，没有则 -1
  function straightHigh(m) {
    for (let h = 12; h >= 4; h--) {
      const mask = 0x1f << (h - 4);
      if ((m & mask) === mask) return h;
    }
    if ((m & 0x100f) === 0x100f) return 3; // A-2-3-4-5
    return -1;
  }

  // 从掩码中按从大到小取 cnt 张作为踢脚，每张占 4 bit
  function kick(m, cnt, shift) {
    let v = 0;
    for (let r = 12; r >= 0 && cnt > 0; r--) {
      if (m & (1 << r)) { v |= r << shift; shift -= 4; cnt--; }
    }
    return v;
  }

  // 评估 n 张牌（3~7）中最好的 5 张，返回可直接比较大小的整数
  function evalN(a, n) {
    RC.fill(0); SC.fill(0); SM.fill(0);
    let all = 0;
    for (let i = 0; i < n; i++) {
      const c = a[i], r = c >> 2, s = c & 3;
      RC[r]++; SC[s]++; SM[s] |= 1 << r; all |= 1 << r;
    }
    let fs = -1;
    for (let s = 0; s < 4; s++) if (SC[s] >= 5) { fs = s; break; }
    if (fs >= 0) {
      const h = straightHigh(SM[fs]);
      if (h >= 0) return (8 << 20) | (h << 16);
    }
    let q = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
    for (let r = 12; r >= 0; r--) {
      const k = RC[r];
      if (k === 4) q = r;
      else if (k === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
      else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
    }
    if (q >= 0) return (7 << 20) | (q << 16) | kick(all & ~(1 << q), 1, 12);
    if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 16) | (Math.max(t2, p1) << 12);
    if (fs >= 0) return (5 << 20) | kick(SM[fs], 5, 16);
    const st = straightHigh(all);
    if (st >= 0) return (4 << 20) | (st << 16);
    if (t1 >= 0) return (3 << 20) | (t1 << 16) | kick(all & ~(1 << t1), 2, 12);
    if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | kick(all & ~(1 << p1) & ~(1 << p2), 1, 8);
    if (p1 >= 0) return (1 << 20) | (p1 << 16) | kick(all & ~(1 << p1), 3, 12);
    return kick(all, 5, 16);
  }

  function handName(score) {
    const c = score >> 20;
    if (c === 8 && ((score >> 16) & 15) === 12) return '皇家同花顺';
    return CAT_NAMES[c];
  }

  // 建一个可分段运行的模拟器：hero 两张底牌、已知公共牌、对手人数（对手手牌未知）
  function makeSim(hero, board, nOpp) {
    const dead = new Uint8Array(52);
    hero.forEach(c => (dead[c] = 1));
    board.forEach(c => (dead[c] = 1));
    const rest = [];
    for (let c = 0; c < 52; c++) if (!dead[c]) rest.push(c);
    const B = board.length, need = 5 - B, total = need + 2 * nOpp, R = rest.length;
    const buf = new Int32Array(7);
    for (let i = 0; i < B; i++) buf[2 + i] = board[i];
    const st = {
      iters: 0, eq: 0, win: 0, tie: 0,
      cat: new Float64Array(9),      // 你最终成牌类型的分布
      next: new Float64Array(52),    // 下一张公共牌为 c 时的累计胜率
      nextN: new Float64Array(52),
    };
    function run(k) {
      for (let it = 0; it < k; it++) {
        for (let i = 0; i < total; i++) {
          const j = i + ((Math.random() * (R - i)) | 0);
          const t = rest[i]; rest[i] = rest[j]; rest[j] = t;
        }
        for (let i = 0; i < need; i++) buf[2 + B + i] = rest[i];
        buf[0] = hero[0]; buf[1] = hero[1];
        const hs = evalN(buf, 7);
        let lose = false, ties = 0;
        for (let o = 0; o < nOpp; o++) {
          buf[0] = rest[need + 2 * o]; buf[1] = rest[need + 2 * o + 1];
          const s = evalN(buf, 7);
          if (s > hs) { lose = true; break; }
          if (s === hs) ties++;
        }
        const share = lose ? 0 : 1 / (ties + 1);
        st.eq += share;
        if (share === 1) st.win++; else if (share > 0) st.tie++;
        st.cat[hs >> 20]++;
        if (need > 0) { const c = rest[0]; st.next[c] += share; st.nextN[c]++; }
        st.iters++;
      }
    }
    return { st, run };
  }

  const api = { RANKS, SUIT_SYM, CAT_NAMES, evalN, handName, makeSim, straightHigh };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(this);
