(function () {
  const E = window.SLOTS, $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const BETS = [1, 2, 5, 10, 20, 50];
  const JP_SEED = 5000, JP_RATE = 0.02;

  // ---------- symbols (original drawings) ----------
  const SYM_SVG = [
    // cherry
    '<svg viewBox="0 0 64 64"><path d="M30 10c-4 10-12 18-16 26M30 10c4 10 9 16 18 22" stroke="#2f7a3a" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M30 10c6-4 14-3 18 2-6 2-12 2-18-2z" fill="#3d9a4a"/><circle cx="17" cy="44" r="12" fill="#c8202f"/><circle cx="45" cy="40" r="12" fill="#d62a3a"/><circle cx="13" cy="39" r="3.5" fill="#fff" opacity=".55"/><circle cx="41" cy="35" r="3.5" fill="#fff" opacity=".55"/></svg>',
    // lemon
    '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="35" rx="23" ry="17" fill="#f4c81b"/><path d="M9 35c-4 0-5 3-3 5M55 35c4 0 5 3 3 5" stroke="#e0a800" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M33 18c4-8 12-9 16-6-4 6-10 8-16 6z" fill="#3d9a4a"/><ellipse cx="24" cy="29" rx="7" ry="3.5" fill="#fff" opacity=".45"/></svg>',
    // bell
    '<svg viewBox="0 0 64 64"><path d="M32 8c-11 0-17 9-17 20v10l-6 8h46l-6-8V28C49 17 43 8 32 8z" fill="#e2a72b"/><path d="M22 26c0-7 4-12 10-13" stroke="#fff2c4" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/><rect x="9" y="45" width="46" height="5" rx="2.5" fill="#b77d12"/><circle cx="32" cy="54" r="5" fill="#b77d12"/><circle cx="32" cy="6" r="3" fill="#b77d12"/></svg>',
    // bar
    '<svg viewBox="0 0 64 64"><rect x="6" y="20" width="52" height="24" rx="5" fill="#1b1a1f"/><rect x="8.5" y="22.5" width="47" height="19" rx="3.5" fill="none" stroke="#e8d6a3" stroke-width="1.5"/><text x="32" y="38.5" text-anchor="middle" font-family="Libre Franklin, Arial, sans-serif" font-weight="800" font-size="15" fill="#f4eee1" letter-spacing="1.5">BAR</text></svg>',
    // diamond
    '<svg viewBox="0 0 64 64"><path d="M16 14h32l12 14-28 30L4 28z" fill="#2f7fd6"/><path d="M16 14l6 14h20l6-14M4 28h56M22 28l10 30 10-30" stroke="#bfe0ff" stroke-width="1.5" fill="none" opacity=".85"/><path d="M16 14l6 14L4 28z" fill="#5ea3ee"/></svg>',
    // seven
    '<svg viewBox="0 0 64 64"><text x="32" y="53" text-anchor="middle" font-family="Bodoni Moda, Georgia, serif" font-weight="700" font-size="58" fill="#d01e2e" stroke="#f2c14e" stroke-width="2.5" paint-order="stroke">7</text></svg>',
    // crown (wild)
    '<svg viewBox="0 0 64 64"><path d="M8 40l4-24 12 12 8-16 8 16 12-12 4 24z" fill="#f2c14e" stroke="#9a6b10" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="16" r="3" fill="#d01e2e"/><circle cx="32" cy="12" r="3" fill="#2f7fd6"/><circle cx="52" cy="16" r="3" fill="#d01e2e"/><rect x="6" y="42" width="52" height="14" rx="3" fill="#7a1222"/><text x="32" y="53" text-anchor="middle" font-family="Libre Franklin, Arial, sans-serif" font-weight="800" font-size="11" fill="#f4eee1" letter-spacing="1.5">WILD</text></svg>',
    // star (scatter)
    '<svg viewBox="0 0 64 64"><path d="M32 4l8 18 19 2-14 13 4 19-17-10-17 10 4-19L5 24l19-2z" fill="#8b4bd6" stroke="#f2c14e" stroke-width="2" stroke-linejoin="round"/><text x="32" y="40" text-anchor="middle" font-family="Libre Franklin, Arial, sans-serif" font-weight="800" font-size="10" fill="#fff" letter-spacing="1">FREE</text></svg>',
  ];

  // ---------- sound (follows the site's sound switch) ----------
  let actx = null;
  const ac = () => { if (!UI.soundOn()) return null; actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; };
  function tone(freq, dur, vol = 0.05, type = 'sine', at = 0, slide = 0) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const snd = {
    coin: () => { tone(2400, 0.08, 0.06); tone(3200, 0.12, 0.05, 'sine', 0.05); tone(1800, 0.2, 0.03, 'triangle', 0.1); },
    stop: () => { tone(160, 0.12, 0.12, 'triangle', 0, 0.6); tone(900, 0.04, 0.03, 'square'); },
    tick: () => tone(1200 + Math.random() * 300, 0.03, 0.015, 'square'),
    small: () => [0, 0.08, 0.16].forEach((d, i) => tone(880 * Math.pow(1.26, i), 0.18, 0.05, 'triangle', d)),
    big: () => [0, 0.1, 0.2, 0.3, 0.4, 0.55].forEach((d, i) => tone(523 * Math.pow(1.19, i), 0.35, 0.06, 'triangle', d)),
    tease: () => tone(300, 1.4, 0.04, 'sawtooth', 0, 2.4),
    count: () => tone(2000 + Math.random() * 800, 0.05, 0.025),
    cash: () => { for (let i = 0; i < 10; i++) tone(2200 + Math.random() * 1600, 0.09, 0.035, 'sine', i * 0.06); },
  };

  // ---------- state ----------
  const CRED_KEY = 'ol-slot-credits', JP_KEY = 'ol-slot-jackpot';
  const st = {
    credits: 0, lineBet: 1, spinning: false, auto: 0, free: 0, grid: null,
    session: { spins: 0, wagered: 0, won: 0, best: 0, features: 0 },
    jackpot: (UI.store.load(JP_KEY, { v: JP_SEED }) || { v: JP_SEED }).v,
  };
  // credits left in the machine last time go back to the wallet they came from
  (function restoreCredits() {
    const c = UI.store.load(CRED_KEY, { credits: 0, mode: 'local' });
    if (c && c.credits > 0) {
      if (c.mode === UI.wallet.mode) st.credits = c.credits;
      else if (c.mode === 'local') UI.wallet.localAdd(c.credits);
    }
  })();
  const saveCredits = () => UI.store.save(CRED_KEY, { credits: st.credits, mode: UI.wallet.mode });
  const saveJackpot = () => UI.store.save(JP_KEY, { v: st.jackpot });
  const totalBet = () => st.lineBet * E.LINES.length;

  // ---------- reels ----------
  const reelsEl = $('#reels');
  const cell = s => `<div class="cell" data-sym="${s}">${SYM_SVG[s]}</div>`;
  function initReels() {
    const first = E.spin();
    st.grid = first.grid;
    reelsEl.innerHTML = st.grid.map((col, r) => `<div class="reel" data-r="${r}"><div class="strip">${col.map(cell).join('')}</div></div>`).join('');
  }
  const cellH = () => reelsEl.querySelector('.cell').getBoundingClientRect().height;

  function animateReels(grid, tease) {
    const h = cellH();
    return Promise.all(grid.map((col, r) => new Promise(res => {
      const reel = reelsEl.children[r], strip = reel.firstElementChild;
      const extra = 14 + r * 5 + (tease && r >= tease ? 14 : 0);
      const filler = [];
      for (let i = 0; i < extra; i++) filler.push(Math.floor(Math.random() * 8));
      const cur = st.grid[r];
      // strip top to bottom: new symbols on top, current ones at the bottom; it scrolls down to the new three
      strip.innerHTML = [...col, ...filler, ...cur].map(cell).join('');
      strip.style.transition = 'none';
      strip.style.transform = `translateY(${-(extra + 3) * h}px)`;
      strip.offsetHeight; // reflow
      const dur = 0.75 + r * 0.22 + (tease && r >= tease ? 1.3 : 0);
      if (tease && r === tease) { reel.classList.add('tease'); snd.tease(); }
      reel.classList.add('spinning');
      strip.style.transition = `transform ${dur}s cubic-bezier(.18,.72,.26,1.08)`;
      strip.style.transform = 'translateY(0)';
      const ticker = setInterval(snd.tick, 70);
      setTimeout(() => reel.classList.remove('spinning'), Math.max(0, dur * 1000 - 260));
      setTimeout(() => {
        clearInterval(ticker);
        strip.style.transition = 'none';
        strip.innerHTML = col.map(cell).join('');
        reel.classList.remove('tease');
        reel.classList.add('landed');
        setTimeout(() => reel.classList.remove('landed'), 220);
        snd.stop();
        res();
      }, dur * 1000);
    })));
  }

  // ---------- paylines ----------
  const linesEl = $('#lines');
  function drawLines(wins) {
    const W = 500, H = 300;
    linesEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    linesEl.setAttribute('preserveAspectRatio', 'none');
    linesEl.innerHTML = wins.map((w, k) => {
      const pts = E.LINES[w.line].map((row, r) => `${r * 100 + 50},${row * 100 + 50}`).join(' ');
      return `<polyline class="pl" style="animation-delay:${k * 0.12}s" points="${pts}"/>`;
    }).join('');
  }
  function lightCells(cells) {
    reelsEl.querySelectorAll('.cell.hit').forEach(c => c.classList.remove('hit'));
    cells.forEach(([r, row]) => { const c = reelsEl.children[r].firstElementChild.children[row]; if (c) c.classList.add('hit'); });
  }

  // ---------- display ----------
  function paint() {
    $('#credits').textContent = fmt(st.credits);
    $('#betAmt').textContent = fmt(totalBet());
    $('#lineBet').textContent = st.lineBet;
    $('#jackpot').textContent = fmt(st.jackpot);
    $('#fsBanner').hidden = !st.free;
    $('#fsLeft').textContent = st.free;
    $('#spinBtn').textContent = st.free ? 'Free spin' : 'Spin';
    $('#spinBtn').disabled = st.spinning;
    $('#autoBtn').textContent = st.auto ? (st.auto === Infinity ? 'Stop auto' : `Auto ${st.auto}`) : 'Auto';
    $('#autoBtn').classList.toggle('on', !!st.auto);
    $('#cashBtn').disabled = st.spinning || !st.credits;
    const s = st.session;
    $('#slotSession').innerHTML = s.spins
      ? `Spins <b>${fmt(s.spins)}</b> · Bet <b>${fmt(s.wagered)}</b> · Won <b>${fmt(s.won)}</b> · Return <b>${(s.won / s.wagered * 100).toFixed(0)}%</b><br>Biggest win <b>${fmt(s.best)}</b> · Free-spin features <b>${s.features}</b><br>This machine pays back about 95% over the long run.`
      : 'Insert chips and spin. This machine pays back about 95% over the long run, so expect to lose a little over time.';
  }
  const ticker = t => ($('#ticker').innerHTML = t);
  function countWin(n) {
    const el = $('#winAmt'), start = performance.now(), dur = Math.min(1200, 200 + n * 4);
    const step = now => { const p = Math.min(1, (now - start) / dur); el.textContent = fmt(n * p); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // ---------- coins in / out ----------
  $('#coins').onclick = e => {
    const b = e.target.closest('[data-coin]');
    if (!b || st.spinning) return;
    const n = +b.dataset.coin;
    if (UI.wallet.chips < n) { UI.toast(UI.wallet.canClaim() ? 'Not enough chips. Claim your daily chips at the top.' : 'Not enough chips in your wallet.'); return; }
    UI.wallet.add(-n);
    st.credits += n; saveCredits();
    const fly = document.createElement('span');
    fly.className = 'coin-fly'; fly.textContent = n;
    const a = b.getBoundingClientRect(), m = $('#slotMouth').getBoundingClientRect();
    fly.style.left = a.left + a.width / 2 + 'px'; fly.style.top = a.top + a.height / 2 + 'px';
    fly.style.setProperty('--dx', m.left + m.width / 2 - (a.left + a.width / 2) + 'px');
    fly.style.setProperty('--dy', m.top + m.height / 2 - (a.top + a.height / 2) + 'px');
    document.body.appendChild(fly);
    setTimeout(() => fly.remove(), 600);
    snd.coin();
    $('#credits').parentElement.classList.add('bump');
    setTimeout(() => $('#credits').parentElement.classList.remove('bump'), 300);
    ticker(`Inserted ${fmt(n)}. Credits ${fmt(st.credits)}.`);
    paint();
  };
  $('#cashBtn').onclick = () => {
    if (st.spinning || !st.credits) return;
    const n = st.credits;
    UI.wallet.add(n);
    st.credits = 0; saveCredits();
    snd.cash();
    ticker(`Cashed out ${fmt(n)} chips to your wallet.`);
    paint();
  };

  // ---------- spin ----------
  async function spin() {
    if (st.spinning) return;
    const bet = totalBet(), free = st.free > 0;
    if (!free && st.credits < bet) {
      st.auto = 0; paint();
      ticker(st.credits ? `Not enough credits for a ${fmt(bet)} bet. Lower the bet or insert chips.` : 'Insert chips to play.');
      document.querySelector('.coin-tray').classList.add('nudge');
      setTimeout(() => document.querySelector('.coin-tray').classList.remove('nudge'), 600);
      return;
    }
    st.spinning = true;
    if (free) st.free--;
    else { st.credits -= bet; st.jackpot += bet * JP_RATE; st.session.wagered += bet; saveCredits(); saveJackpot(); }
    st.session.spins++;
    linesEl.innerHTML = ''; lightCells([]);
    $('#winAmt').textContent = '0';
    ticker(free ? `Free spin · ${st.free} left` : 'Good luck…');
    lever(); paint();

    const { grid } = E.spin();
    // tease: if two stars land on the first reels, the rest spin longer
    let stars = 0, tease = 0;
    for (let r = 0; r < 5; r++) { if (stars >= 2 && !tease) tease = r; stars += grid[r].filter(x => x === E.S.SCATTER).length; }
    await animateReels(grid, tease && tease < 5 ? tease : 0);
    st.grid = grid;

    const res = E.evaluate(grid, st.lineBet, free);
    let win = res.total;
    if (res.jackpot) { win += Math.floor(st.jackpot); }
    const cells = [...res.wins.flatMap(w => w.cells), ...(res.scatter ? res.scatter.cells : [])];
    drawLines(res.wins); lightCells(cells);
    if (res.scatter) { st.free += res.scatter.spins; st.session.features++; }
    if (win > 0) {
      st.credits += win; st.session.won += win; st.session.best = Math.max(st.session.best, win); saveCredits();
      countWin(win);
    }
    UI.stats.add('slots', { t: Date.now(), bet: free ? 0 : bet, win, free, feature: !!res.scatter, jackpot: !!res.jackpot });

    const x = win / bet;
    const desc = res.wins.slice(0, 3).map(w => `${w.count} ${E.NAMES[w.sym].split(' ')[0]}${w.count > 1 ? 's' : ''}`).join(', ');
    if (res.jackpot) { await celebrate('Jackpot', win, 4); st.jackpot = JP_SEED; saveJackpot(); }
    else if (x >= 40) await celebrate('Mega win', win, 3);
    else if (x >= 15) await celebrate('Big win', win, 2);
    else if (x >= 5) await celebrate('Nice win', win, 1);
    else if (win > 0) snd.small();
    if (res.scatter) { ticker(`${res.scatter.count} stars! <b>${res.scatter.spins} free spins</b>, all wins doubled.`); await celebrate('Free spins', res.scatter.spins, 1, true); }
    else if (win > 0) ticker(`Win <b>${fmt(win)}</b>${desc ? ` · ${desc}` : ''}${free ? ' · doubled' : ''}`);
    else ticker(free ? `No win · ${st.free} free spins left` : 'No win this time.');

    st.spinning = false;
    paint();
    // auto spin keeps going until it runs out, credits run low, or a feature/big win lands
    if (st.free > 0 || st.auto) {
      if (st.auto && st.auto !== Infinity && !st.free) st.auto--;
      if (!st.free && (x >= 15 || res.jackpot || st.credits < totalBet())) st.auto = 0;
      paint();
      if (st.free > 0 || st.auto) setTimeout(spin, st.free ? 700 : 450);
    }
  }
  function lever() {
    const l = $('#lever');
    l.classList.remove('pull'); l.offsetWidth; l.classList.add('pull');
  }

  // ---------- big win celebration ----------
  const fx = $('#winFx'), canvas = $('#coinRain');
  let skip = null;
  fx.onclick = () => skip && skip();
  function celebrate(tier, amount, level, isSpins) {
    return new Promise(done => {
      fx.hidden = false; fx.dataset.level = level;
      $('#winTier').textContent = tier;
      const num = $('#winNum');
      num.textContent = isSpins ? `${amount} free spins` : '0';
      document.body.classList.add('shake' + Math.min(3, level));
      if (isSpins) snd.small(); else snd.big();
      const stopRain = coinRain(level);
      const dur = isSpins ? 1600 : 1200 + level * 900, start = performance.now();
      let raf, finished = false, lastTick = 0;
      const step = now => {
        const p = Math.min(1, (now - start) / dur);
        if (!isSpins) num.textContent = fmt(amount * (1 - Math.pow(1 - p, 3)));
        if (!isSpins && now - lastTick > 60 && p < 1) { snd.count(); lastTick = now; }
        if (p < 1) raf = requestAnimationFrame(step);
        else setTimeout(end, isSpins ? 300 : 900);
      };
      const end = () => {
        if (finished) return; finished = true;
        cancelAnimationFrame(raf); if (!isSpins) num.textContent = fmt(amount);
        fx.classList.add('out');
        setTimeout(() => { fx.hidden = true; fx.classList.remove('out'); document.body.classList.remove('shake1', 'shake2', 'shake3'); stopRain(); skip = null; done(); }, 350);
      };
      skip = end;
      raf = requestAnimationFrame(step);
    });
  }
  function coinRain(level) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
    const ctx = canvas.getContext('2d'), dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const n = 40 + level * 50, parts = [];
    for (let i = 0; i < n; i++) parts.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.55, vx: (Math.random() - 0.5) * 14, vy: -8 - Math.random() * 12, r: 7 + Math.random() * 7, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, delay: Math.random() * 40 });
    let raf, frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight); frame++;
      for (const p of parts) {
        if (frame < p.delay) continue;
        p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.a += p.va;
        if (p.y > innerHeight + 30 && level > 1 && frame < 160) { p.x = innerWidth / 2 + (Math.random() - 0.5) * 120; p.y = innerHeight * 0.55; p.vx = (Math.random() - 0.5) * 14; p.vy = -8 - Math.random() * 12; }
        const w = Math.abs(Math.cos(p.a)) * p.r;
        ctx.fillStyle = '#c99a2e'; ctx.beginPath(); ctx.ellipse(p.x, p.y, w + 0.5, p.r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f7d77a'; ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.3, w * 0.7), p.r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, innerWidth, innerHeight); };
  }

  // ---------- controls ----------
  $('#spinBtn').onclick = spin;
  $('#lever').onclick = spin;
  $('#betUp').onclick = () => { if (st.spinning || st.free) return; st.lineBet = BETS[Math.min(BETS.length - 1, BETS.indexOf(st.lineBet) + 1)]; snd.tick(); paint(); };
  $('#betDown').onclick = () => { if (st.spinning || st.free) return; st.lineBet = BETS[Math.max(0, BETS.indexOf(st.lineBet) - 1)]; snd.tick(); paint(); };
  $('#autoBtn').onclick = () => {
    const seq = [0, 10, 25, 50, Infinity];
    st.auto = st.auto ? 0 : 10;
    if (st.auto && !st.spinning) spin();
    paint();
  };
  $('#autoBtn').oncontextmenu = e => { e.preventDefault(); };
  document.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (!fx.hidden && skip) skip(); else spin(); }
  });

  // ---------- pay table ----------
  $('#payBtn').onclick = () => {
    let dlg = document.getElementById('payDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'payDlg'; dlg.className = 'rules pay-dlg'; document.body.appendChild(dlg); }
    const order = [E.S.WILD, E.S.SEVEN, E.S.DIAMOND, E.S.BAR, E.S.BELL, E.S.LEMON, E.S.CHERRY];
    let h = `<h2>Pays</h2><p>Line wins pay left to right, times your bet per line (now ${st.lineBet}). The crown is wild and stands in for any symbol except the star.</p><div class="pay-grid">`;
    for (const s of order) {
      const p = E.PAY[s];
      h += `<div class="pay-row"><span class="pay-sym">${SYM_SVG[s]}</span><span>5× <b>${s === E.S.SEVEN ? 'JACKPOT' : fmt(p[2] * st.lineBet)}</b></span><span>4× <b>${fmt(p[1] * st.lineBet)}</b></span><span>3× <b>${fmt(p[0] * st.lineBet)}</b></span></div>`;
    }
    h += `<div class="pay-row"><span class="pay-sym">${SYM_SVG[E.S.SCATTER]}</span><span class="pay-wide">3, 4 or 5 stars anywhere pay 2×, 10× or 50× your total bet and give 10, 15 or 20 free spins. Free-spin wins are doubled.</span></div></div>`;
    h += '<h4>The 10 lines</h4><div class="mini-lines">' + E.LINES.map((L, i) => `<svg viewBox="0 0 50 30"><title>Line ${i + 1}</title>${[0, 1, 2].map(row => [0, 1, 2, 3, 4].map(r => `<rect x="${r * 10 + 1}" y="${row * 10 + 1}" width="8" height="8" rx="1.5" class="${L[r] === row ? 'on' : ''}"/>`).join('')).join('')}</svg>`).join('') + '</div>';
    h += `<p class="sub">Five sevens on a line win the progressive jackpot, which grows by 2% of every bet. Over the long run this machine pays back about 95% of what is bet.</p><div class="rule-actions"><button type="button" class="primary" data-act="close">Close</button></div>`;
    dlg.innerHTML = h;
    dlg.onclick = e => { if (e.target.closest('[data-act="close"]')) dlg.close(); };
    dlg.showModal();
  };

  // ---------- prize wheel ----------
  const WHEEL_KEY = 'ol-wheel-free';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const freeWheel = () => (UI.store.load(WHEEL_KEY, { day: '' }) || { day: '' }).day !== today();
  const wheelEl = $('#wheel');
  const totalW = E.WHEEL.reduce((a, s) => a + s.w, 0);
  const COLORS = ['#7a1424', '#f4eee1', '#1f5c47', '#f4eee1', '#7a1424', '#f4eee1', '#1f5c47', '#c99a2e', '#1b1a1f'];
  const segs = []; let ang = 0;
  E.WHEEL.forEach((s, i) => { const a = (s.w / totalW) * 360; segs.push({ from: ang, to: ang + a }); ang += a; });
  function drawWheel() {
    const pt = (deg, r) => { const t = (deg - 90) * Math.PI / 180; return [Math.cos(t) * r, Math.sin(t) * r]; };
    let g = '<circle r="106" fill="#2a1d15"/>';
    E.WHEEL.forEach((s, i) => {
      const { from, to } = segs[i], [x1, y1] = pt(from, 100), [x2, y2] = pt(to, 100), large = to - from > 180 ? 1 : 0;
      g += `<path d="M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A100 100 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${COLORS[i]}" stroke="#2a1d15" stroke-width="1"/>`;
      const mid = (from + to) / 2, [tx, ty] = pt(mid, 70), light = COLORS[i] === '#f4eee1' || COLORS[i] === '#c99a2e';
      if (to - from > 14) g += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${mid} ${tx.toFixed(1)} ${ty.toFixed(1)})" text-anchor="middle" dominant-baseline="middle" class="wl ${light ? 'dark' : ''}">${s.label}</text>`;
    });
    for (let k = 0; k < 24; k++) { const [x, y] = pt(k * 15, 103); g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" class="wb" style="animation-delay:${(k % 2) * 0.3}s"/>`; }
    g += '<circle r="16" fill="#2a1d15"/><circle r="11" fill="#c99a2e"/>';
    wheelEl.innerHTML = `<g id="wheelRot">${g}</g>`;
    $('#wheelOdds').innerHTML = '<tr><th>Prize</th><th>Chance</th></tr>' + E.WHEEL.map(s => `<tr><td>${s.label === 'JACKPOT' ? 'Jackpot (5,000)' : s.label + ' chips'}</td><td>${(s.w / totalW * 100).toFixed(1)}%</td></tr>`).join('');
  }
  let wheelAngle = 0, wheelBusy = false;
  function paintWheel() {
    const f = freeWheel();
    $('#wheelBtn').textContent = f ? 'Free daily spin' : `Spin for ${E.WHEEL_PRICE} chips`;
    $('#wheelBtn').disabled = wheelBusy;
    $('#wheelNote').textContent = f ? 'One free spin every day. Slice sizes match the real odds.' : `Your free spin is used for today. More spins cost ${E.WHEEL_PRICE} chips (they pay back about 81 on average).`;
  }
  $('#wheelBtn').onclick = () => {
    if (wheelBusy) return;
    const f = freeWheel();
    if (!f) {
      if (UI.wallet.chips < E.WHEEL_PRICE) { UI.toast('Not enough chips for a wheel spin.'); return; }
      UI.wallet.add(-E.WHEEL_PRICE);
    } else UI.store.save(WHEEL_KEY, { day: today() });
    wheelBusy = true; paintWheel(); $('#wheelResult').textContent = '';
    const i = E.wheelSpin(), { from, to } = segs[i];
    const target = from + (to - from) * (0.15 + Math.random() * 0.7);
    // the pointer is at the top: rotate so the target angle ends up at 0°
    const base = wheelAngle - (wheelAngle % 360);
    wheelAngle = base + 360 * 6 + (360 - target);
    const rot = $('#wheelRot');
    rot.style.transition = 'transform 5.2s cubic-bezier(.12,.62,.08,1)';
    rot.style.transform = `rotate(${wheelAngle}deg)`;
    let lastSeg = -1;
    const t0 = performance.now();
    const tickLoop = now => {
      const m = new DOMMatrix(getComputedStyle(rot).transform);
      const a = ((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360, under = (360 - a) % 360;
      const seg = segs.findIndex(s => under >= s.from && under < s.to);
      if (seg !== lastSeg) { snd.tick(); lastSeg = seg; }
      if (now - t0 < 5250) requestAnimationFrame(tickLoop);
    };
    requestAnimationFrame(tickLoop);
    setTimeout(async () => {
      const prize = E.WHEEL[i];
      UI.wallet.add(prize.chips);
      UI.stats.add('wheel', { t: Date.now(), cost: f ? 0 : E.WHEEL_PRICE, prize: prize.chips });
      $('#wheelResult').innerHTML = `You won <b>${fmt(prize.chips)}</b> chips${prize.label === 'JACKPOT' ? ' — the jackpot!' : '!'} Added to your wallet.`;
      if (prize.chips >= 500) await celebrate(prize.label === 'JACKPOT' ? 'Wheel jackpot' : 'Big prize', prize.chips, prize.chips >= 5000 ? 4 : 2);
      else snd.small();
      wheelBusy = false; paintWheel();
    }, 5300);
  };

  // ---------- start ----------
  initReels();
  drawWheel();
  paint(); paintWheel();
  if (st.credits) ticker(`Welcome back. ${fmt(st.credits)} credits are still in the machine.`);
  UI.wallet.onChange(() => paintWheel());
  window.addEventListener('resize', () => { if (!st.spinning) reelsEl.querySelectorAll('.strip').forEach(s => (s.style.transform = 'translateY(0)')); });
})();
