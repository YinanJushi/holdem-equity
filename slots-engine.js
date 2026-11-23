// Slot machine maths: 5 reels × 3 rows, 10 paylines, wild, scatter free spins, progressive jackpot.
(function (root) {
  // symbol ids
  const S = { CHERRY: 0, LEMON: 1, BELL: 2, BAR: 3, DIAMOND: 4, SEVEN: 5, WILD: 6, SCATTER: 7 };
  const NAMES = ['Cherry', 'Lemon', 'Bell', 'Bar', 'Diamond', 'Seven', 'Crown (wild)', 'Star (scatter)'];
  // pay per line bet for 3, 4, 5 of a kind (left to right)
  const PAY = {
    [S.CHERRY]: [6, 17, 48],
    [S.LEMON]: [6, 19, 60],
    [S.BELL]: [11, 33, 120],
    [S.BAR]: [17, 60, 240],
    [S.DIAMOND]: [32, 120, 480],
    [S.SEVEN]: [60, 300, 0], // five on a line = Grand jackpot
    [S.WILD]: [75, 380, 1500],
  };
  // scatter anywhere: pays × total bet and starts the bonus wheel
  const SCATTER = { 3: { pay: 2 }, 4: { pay: 10 }, 5: { pay: 50 } };
  // bonus wheel: free spins, or one of four jackpots (mini/minor/major × total bet; grand is the progressive pool)
  const BONUS = [
    { id: 'fs10', label: '10 Free Spins', kind: 'fs', v: 10, w: 9 },
    { id: 'mini', label: 'Mini', kind: 'jp', v: 25, w: 4 },
    { id: 'fs15', label: '15 Free Spins', kind: 'fs', v: 15, w: 4 },
    { id: 'minor', label: 'Minor', kind: 'jp', v: 60, w: 2 },
    { id: 'fs20', label: '20 Free Spins', kind: 'fs', v: 20, w: 2 },
    { id: 'major', label: 'Major', kind: 'jp', v: 250, w: 0.6 },
    { id: 'grand', label: 'Grand', kind: 'grand', v: 0, w: 0.12 },
  ];
  function bonusSpin(rng = Math.random) {
    const tot = BONUS.reduce((a, b) => a + b.w, 0);
    let r = rng() * tot;
    for (let i = 0; i < BONUS.length; i++) { r -= BONUS[i].w; if (r < 0) return i; }
    return 0;
  }
  const FREE_MULT = 2;
  const LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  ];
  // reel strips built from symbol counts (wilds only on the middle three reels)
  const COUNTS = [
    { 0: 10, 1: 9, 2: 7, 3: 5, 4: 3, 5: 2, 6: 0, 7: 1 },
    { 0: 10, 1: 9, 2: 7, 3: 5, 4: 3, 5: 2, 6: 1, 7: 1 },
    { 0: 10, 1: 9, 2: 7, 3: 5, 4: 3, 5: 2, 6: 1, 7: 1 },
    { 0: 10, 1: 9, 2: 7, 3: 5, 4: 3, 5: 2, 6: 1, 7: 1 },
    { 0: 10, 1: 9, 2: 7, 3: 5, 4: 3, 5: 2, 6: 0, 7: 1 },
  ];
  // spread the symbols out evenly with a fixed shuffle so every visitor sees the same strips
  function buildStrip(counts, seed) {
    const a = [];
    Object.entries(counts).forEach(([sym, n]) => { for (let i = 0; i < n; i++) a.push(+sym); });
    let x = seed;
    const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const STRIPS = COUNTS.map((c, i) => buildStrip(c, 7919 * (i + 3)));

  function spin(rng = Math.random) {
    const stops = STRIPS.map(s => Math.floor(rng() * s.length));
    return { stops, grid: gridAt(stops) };
  }
  function gridAt(stops) {
    return stops.map((st, r) => { const s = STRIPS[r], L = s.length; return [s[(st - 1 + L) % L], s[st], s[(st + 1) % L]]; });
  }

  // grid[reel][row]
  function evaluate(grid, lineBet, free = false) {
    const mult = free ? FREE_MULT : 1, wins = [];
    let jackpot = false;
    LINES.forEach((rows, li) => {
      const syms = rows.map((row, r) => grid[r][row]);
      if (syms[0] === S.SCATTER) return;
      // the paying symbol is the first non-wild (or wild if the line starts with wilds only)
      let base = syms.find(x => x !== S.WILD);
      if (base === undefined) base = S.WILD;
      if (base === S.SCATTER) base = S.WILD;
      let n = 0;
      for (const x of syms) { if (x === base || x === S.WILD) n++; else break; }
      // a run of leading wilds can pay more as wilds than as the following symbol
      let lead = 0;
      for (const x of syms) { if (x === S.WILD) lead++; else break; }
      const cand = [];
      if (n >= 3 && PAY[base]) cand.push({ sym: base, count: n, pay: PAY[base][n - 3] });
      if (lead >= 3 && base !== S.WILD) cand.push({ sym: S.WILD, count: lead, pay: PAY[S.WILD][lead - 3] });
      if (n === 5 && base === S.SEVEN) { jackpot = true; cand.push({ sym: S.SEVEN, count: 5, pay: 0, jackpot: true }); }
      if (!cand.length) return;
      const best = cand.sort((a, b) => b.pay - a.pay || (b.jackpot ? 1 : 0) - (a.jackpot ? 1 : 0))[0];
      if (!best.pay && !best.jackpot) return;
      wins.push({ line: li, sym: best.sym, count: best.count, pay: best.pay * lineBet * mult, cells: rows.slice(0, best.count).map((row, r) => [r, row]), jackpot: !!best.jackpot });
    });
    const sc = [];
    grid.forEach((col, r) => col.forEach((x, row) => { if (x === S.SCATTER) sc.push([r, row]); }));
    const sp = SCATTER[Math.min(5, sc.length)];
    const scatter = sp ? { count: sc.length, cells: sc, pay: sp.pay * lineBet * LINES.length * mult } : null;
    const total = wins.reduce((a, w) => a + w.pay, 0) + (scatter ? scatter.pay : 0);
    return { wins, scatter, total, jackpot };
  }

  // the wheel: weights and prizes in chips; expected value per spin is below the price
  const WHEEL = [
    { label: '10', chips: 10, w: 30 }, { label: '25', chips: 25, w: 25 }, { label: '50', chips: 50, w: 18 },
    { label: '75', chips: 75, w: 10 }, { label: '100', chips: 100, w: 10 }, { label: '200', chips: 200, w: 6 },
    { label: '500', chips: 500, w: 2 }, { label: '1,000', chips: 1000, w: 1 }, { label: 'JACKPOT', chips: 5000, w: 0.3 },
  ];
  const WHEEL_PRICE = 100;
  function wheelSpin(rng = Math.random) {
    const tot = WHEEL.reduce((a, s) => a + s.w, 0);
    let r = rng() * tot;
    for (let i = 0; i < WHEEL.length; i++) { r -= WHEEL[i].w; if (r < 0) return i; }
    return WHEEL.length - 1;
  }

  const api = { S, NAMES, PAY, SCATTER, FREE_MULT, LINES, STRIPS, spin, gridAt, evaluate, BONUS, bonusSpin, WHEEL, WHEEL_PRICE, wheelSpin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SLOTS = api;
})(this);
