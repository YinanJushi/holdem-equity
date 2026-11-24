(function () {
  const E = window.SLOTS, TH = window.SLOT_THEMES, $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const BETS = [1, 2, 5, 10, 20, 50];
  const JP_SEED = 5000, JP_RATE = 0.02;
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- theme ----------
  const THEME_KEY = 'ol-slot-theme';
  let theme = TH[(UI.store.load(THEME_KEY, { id: 'fruit' }) || { id: 'fruit' }).id] || TH.fruit;
  const symSvg = s => theme.symbols[s];
  const symName = s => theme.names[s];

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
  function noise(dur, vol, at = 0, hp = 1500) {
    const a = ac(); if (!a) return;
    const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination); src.start(a.currentTime + at);
  }
  const chord = (root, at = 0, vol = 0.045, dur = 0.5) => [1, 1.26, 1.5, 2].forEach((m, i) => tone(root * m, dur, vol, i % 2 ? 'triangle' : 'sawtooth', at + i * 0.015));
  const snd = {
    coin: () => { tone(2400, 0.08, 0.06); tone(3200, 0.12, 0.05, 'sine', 0.05); tone(1800, 0.2, 0.03, 'triangle', 0.1); },
    stop: () => { tone(160, 0.12, 0.12, 'triangle', 0, 0.6); noise(0.04, 0.05, 0, 3000); },
    tick: () => tone(1200 + Math.random() * 300, 0.03, 0.015, 'square'),
    peg: () => { noise(0.03, 0.12, 0, 2500); tone(1800, 0.03, 0.02, 'square'); },
    small: () => [0, 0.08, 0.16].forEach((d, i) => tone(880 * Math.pow(1.26, i), 0.18, 0.05, 'triangle', d)),
    tease: () => tone(300, 1.4, 0.04, 'sawtooth', 0, 2.4),
    count: () => tone(2000 + Math.random() * 900, 0.05, 0.022),
    tier: lvl => { const r = 262 * Math.pow(1.12, lvl * 2); chord(r, 0, 0.04, 0.6); chord(r * 1.5, 0.18, 0.04, 0.9); noise(0.5, 0.06, 0, 800); },
    fanfare: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 0.05, 'triangle', i * 0.11)),
    boom: () => { tone(90, 0.6, 0.15, 'sine', 0, 0.4); noise(0.4, 0.08, 0, 400); },
    cash: () => { for (let i = 0; i < 12; i++) tone(2200 + Math.random() * 1600, 0.09, 0.035, 'sine', i * 0.055); },
  };

  // ---------- state ----------
  const CRED_KEY = 'ol-slot-credits', JP_KEY = 'ol-slot-jackpot';
  const st = {
    credits: 0, lineBet: 1, spinning: false, auto: 0, free: 0, fsTotal: 0, inFeature: false, grid: null,
    session: { spins: 0, wagered: 0, won: 0, best: 0, features: 0 },
    jackpot: (UI.store.load(JP_KEY, { v: JP_SEED }) || { v: JP_SEED }).v,
  };
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
  const jpValue = b => (b.kind === 'grand' ? Math.floor(st.jackpot) : b.v * totalBet());

  // ---------- reels ----------
  const reelsEl = $('#reels');
  const cell = s => `<div class="cell" data-sym="${s}">${symSvg(s)}</div>`;
  function drawReels() {
    reelsEl.innerHTML = st.grid.map((col, r) => `<div class="reel" data-r="${r}"><div class="strip">${col.map(cell).join('')}</div></div>`).join('');
  }
  // ---------- 3D reels (slots3d.js); the flat reels stay as the fallback ----------
  let R3 = null;
  function use3D() {
    if (R3 || !window.Reels3D || reduced()) { if (!R3 && window.Reels3D) document.documentElement.classList.remove('t3d-wait'); return; }
    const host = $('#cab3d');
    document.body.classList.add('cab3d-on');      // show the 3D machine; the HTML one stays for keyboards and screen readers
    R3 = window.Reels3D.create(host);
    document.documentElement.classList.remove('t3d-wait');
    if (!R3) { document.body.classList.remove('cab3d-on'); return; }
    R3.setTheme(theme.id, theme.symbols, theme.title).then(() => R3.setGrid(st.grid));
  }
  window.addEventListener('reels3d-ready', use3D);

  const cellH = () => reelsEl.querySelector('.cell').getBoundingClientRect().height;
  function animateReels(grid, tease) {
    if (R3) {
      const tick = setInterval(snd.tick, 65);
      return R3.spin(grid, {
        tease,
        onTease: () => snd.tease(),
        onStop: r => { snd.stop(); if (r === 4) clearInterval(tick); },
      }).then(() => clearInterval(tick));
    }
    const h = cellH();
    return Promise.all(grid.map((col, r) => new Promise(res => {
      const reel = reelsEl.children[r], strip = reel.firstElementChild;
      const slow = tease && r >= tease;
      const extra = 14 + r * 5 + (slow ? 16 : 0);
      const filler = [];
      for (let i = 0; i < extra; i++) filler.push(Math.floor(Math.random() * 8));
      strip.innerHTML = [...col, ...filler, ...st.grid[r]].map(cell).join('');
      strip.style.transition = 'none';
      strip.style.transform = `translateY(${-(extra + 3) * h}px)`;
      strip.offsetHeight;
      const dur = 0.75 + r * 0.22 + (slow ? 1.5 : 0);
      if (tease && r === tease) { snd.tease(); }
      if (slow) reel.classList.add('tease');
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
    if (R3) { R3.lines(wins.map(x => E.LINES[x.line])); return; }
    linesEl.setAttribute('viewBox', '0 0 500 300');
    linesEl.setAttribute('preserveAspectRatio', 'none');
    linesEl.innerHTML = wins.map((w, k) => `<polyline class="pl" style="animation-delay:${k * 0.12}s" points="${E.LINES[w.line].map((row, r) => `${r * 100 + 50},${row * 100 + 50}`).join(' ')}"/>`).join('');
  }
  function lightCells(cells) {
    if (R3) { R3.highlight(cells); return; }
    reelsEl.querySelectorAll('.cell.hit').forEach(c => c.classList.remove('hit'));
    cells.forEach(([r, row]) => { const c = reelsEl.children[r].firstElementChild.children[row]; if (c) c.classList.add('hit'); });
  }

  // ---------- display ----------
  function paint() {
    $('#credits').textContent = fmt(st.credits);
    $('#betAmt').textContent = fmt(totalBet());
    $('#lineBet').textContent = st.lineBet;
    $('#jpGrand').textContent = fmt(st.jackpot);
    E.BONUS.filter(b => b.kind === 'jp').forEach(b => ($('#jp' + b.label).textContent = fmt(b.v * totalBet())));
    $('#fsBanner').hidden = !st.free;
    $('#fsLeft').textContent = st.free;
    $('#spinBtn').textContent = st.free ? 'Free spin' : 'Spin';
    $('#spinBtn').disabled = st.spinning;
    $('#autoBtn').textContent = st.auto ? `Auto ${st.auto}` : 'Auto';
    $('#autoBtn').classList.toggle('on', !!st.auto);
    $('#cashBtn').disabled = st.spinning || !st.credits || st.free > 0;
    const s = st.session;
    $('#slotSession').innerHTML = s.spins
      ? `Spins <b>${fmt(s.spins)}</b> · Bet <b>${fmt(s.wagered)}</b> · Won <b>${fmt(s.won)}</b> · Return <b>${s.wagered ? (s.won / s.wagered * 100).toFixed(0) : 0}%</b><br>Biggest win <b>${fmt(s.best)}</b> · Bonus wheels <b>${s.features}</b><br>This machine pays back about 95% over the long run.`
      : 'Insert chips and spin. Three or more bonus symbols spin the bonus wheel for free spins or a jackpot. This machine pays back about 95% over the long run.';
  }
  const ticker = t => ($('#ticker').innerHTML = t);
  function countWin(n) {
    const el = $('#winAmt'), start = performance.now(), dur = Math.min(1200, 200 + n * 4);
    const step = now => { const p = Math.min(1, (now - start) / dur); el.textContent = fmt(n * p); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function applyTheme() {
    $('#cabinet').dataset.theme = theme.id;
    document.body.dataset.slotTheme = theme.id;
    $('#cabTitle').innerHTML = `${theme.title[0]} <em>${theme.title[1]}</em>`;
    $('#themePick').innerHTML = Object.values(TH).map(t => `<button type="button" role="radio" aria-checked="${t.id === theme.id}" class="tp ${t.id === theme.id ? 'on' : ''}" data-theme="${t.id}" aria-label="${t.name}"><span class="tp-ic">${t.symbols[5]}</span>${t.name}</button>`).join('');
    if (st.grid) drawReels();
    if (R3) R3.setTheme(theme.id, theme.symbols, theme.title).then(() => R3.setGrid(st.grid));
  }
  $('#themePick').onclick = e => {
    const b = e.target.closest('[data-theme]');
    if (!b || st.spinning || st.inFeature) return;
    theme = TH[b.dataset.theme]; UI.store.save(THEME_KEY, { id: theme.id });
    applyTheme(); snd.coin();
  };

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
    if (R3) R3.coinIn(n);
    $('#credits').parentElement.classList.add('bump');
    setTimeout(() => $('#credits').parentElement.classList.remove('bump'), 300);
    ticker(`Inserted ${fmt(n)}. Credits ${fmt(st.credits)}.`);
    paint();
  };
  $('#cashBtn').onclick = () => {
    if (st.spinning || !st.credits || st.free) return;
    const n = st.credits;
    UI.wallet.add(n);
    st.credits = 0; saveCredits();
    snd.cash();
    if (R3) R3.cashOut(n);
    ticker(`Cashed out ${fmt(n)} chips to your wallet.`);
    paint();
  };

  // ---------- spin ----------
  async function spin() {
    if (st.spinning || st.inFeature) return;
    const bet = totalBet(), free = st.free > 0;
    if (!free && st.credits < bet) {
      st.auto = 0; paint();
      ticker(st.credits ? `Not enough credits for a ${fmt(bet)} bet. Lower the bet or insert chips.` : 'Insert chips to play.');
      const tray = document.querySelector('.coin-tray');
      tray.classList.add('nudge'); setTimeout(() => tray.classList.remove('nudge'), 600);
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
    let bonusSeen = 0, tease = 0;
    for (let r = 0; r < 5; r++) { if (bonusSeen >= 2 && !tease) tease = r; bonusSeen += grid[r].filter(x => x === E.S.SCATTER).length; }
    await animateReels(grid, tease && tease < 5 ? tease : 0);
    st.grid = grid;

    const res = E.evaluate(grid, st.lineBet, free);
    let win = res.total, grand = 0;
    if (res.jackpot) { grand = Math.floor(st.jackpot); win += grand; }
    drawLines(res.wins);
    lightCells([...res.wins.flatMap(w => w.cells), ...(res.scatter ? res.scatter.cells : [])]);
    if (win > 0) { st.credits += win; st.session.won += win; st.session.best = Math.max(st.session.best, win); if (free) st.fsTotal += win; saveCredits(); countWin(win); }
    UI.stats.add('slots', { t: Date.now(), bet: free ? 0 : bet, win, free, feature: !!res.scatter, jackpot: !!res.jackpot });

    const desc = res.wins.slice(0, 3).map(w => `${w.count} ${symName(w.sym)}`).join(', ');
    if (res.jackpot) { await celebrate({ amount: win, bet, jackpot: 'Grand jackpot' }); st.jackpot = JP_SEED; saveJackpot(); }
    else if (win >= bet * 5) await celebrate({ amount: win, bet });
    else if (win > 0) snd.small();
    if (win > 0) ticker(`Win <b>${fmt(win)}</b>${desc ? ` · ${desc}` : ''}${free ? ' · doubled' : ''}`);
    else ticker(free ? `No win · ${st.free} free spins left` : 'No win this time.');

    if (res.scatter) { st.session.features++; await bonusFeature(res.scatter.count); }
    if (free && st.free === 0) {
      ticker(`Free spins over: you won <b>${fmt(st.fsTotal)}</b> in total.`);
      if (st.fsTotal >= bet * 5) await celebrate({ amount: st.fsTotal, bet, title: 'Free spins total' });
      st.fsTotal = 0;
    }

    st.spinning = false;
    paint();
    if (st.free > 0 || st.auto) {
      if (st.auto && !st.free) st.auto--;
      if (!st.free && (win >= bet * 15 || res.jackpot || st.credits < totalBet())) st.auto = 0;
      paint();
      if (st.free > 0 || st.auto) setTimeout(spin, st.free ? 700 : 450);
    }
  }
  function lever() { if (R3) R3.pullLever(); const l = $('#lever'); l.classList.remove('pull'); l.offsetWidth; l.classList.add('pull'); }

  // ---------- the wheel (used by the bonus wheel and the prize wheel) ----------
  // segments: [{ label, sub, w, fill, ink }] — slice size follows w (the real odds)
  function makeWheel(svgEl, segments, { hub = '' } = {}) {
    const tot = segments.reduce((a, s) => a + s.w, 0);
    const arcs = []; let a0 = 0;
    segments.forEach(s => { const a = (s.w / tot) * 360; arcs.push({ from: a0, to: a0 + a }); a0 += a; });
    const pt = (deg, r) => { const t = ((deg - 90) * Math.PI) / 180; return [Math.cos(t) * r, Math.sin(t) * r]; };
    const NB = 32;
    let g = '<defs><radialGradient id="whl-sheen" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>';
    g += '<circle r="122" fill="url(#rimG)"/><circle r="122" fill="none" stroke="#f6d77a" stroke-width="2"/><circle r="104" fill="#2a1406"/>';
    g = '<defs><linearGradient id="rimG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d77a"/><stop offset=".5" stop-color="#a8761a"/><stop offset="1" stop-color="#f6d77a"/></linearGradient></defs>' + g;
    let segs = '';
    segments.forEach((s, i) => {
      const { from, to } = arcs[i], [x1, y1] = pt(from, 100), [x2, y2] = pt(to, 100), large = to - from > 180 ? 1 : 0;
      segs += `<path class="seg" data-i="${i}" d="M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A100 100 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${s.fill}" stroke="#f6d77a" stroke-width="1.2"/>`;
      const mid = (from + to) / 2, span = to - from;
      if (span >= 40) {
        // wide slice: text across the slice, label above its subtitle
        const [tx, ty] = pt(mid, 70), [ux, uy] = pt(mid, 52);
        segs += `<text class="wl" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${mid} ${tx.toFixed(1)} ${ty.toFixed(1)})" text-anchor="middle" dominant-baseline="middle" fill="${s.ink}" font-size="13">${s.label}</text>`;
        if (s.sub) segs += `<text class="wl sub" x="${ux.toFixed(1)}" y="${uy.toFixed(1)}" transform="rotate(${mid} ${ux.toFixed(1)} ${uy.toFixed(1)})" text-anchor="middle" dominant-baseline="middle" fill="${s.ink}">${s.sub}</text>`;
      } else if (span >= 8) {
        // narrow slice: label along the radius only
        const [tx, ty] = pt(mid, 64);
        segs += `<text class="wl" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${mid - 90} ${tx.toFixed(1)} ${ty.toFixed(1)})" text-anchor="middle" dominant-baseline="middle" fill="${s.ink}" font-size="${span < 16 ? 8.5 : 11}">${s.label}</text>`;
      }
      const [px, py] = pt(from, 96);
      segs += `<circle class="peg" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.6"/>`;
    });
    let bulbs = '';
    for (let k = 0; k < NB; k++) { const [x, y] = pt((k * 360) / NB, 113); bulbs += `<circle class="bulb" data-k="${k}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6"/>`; }
    svgEl.innerHTML = `${g}${bulbs}<g class="rot">${segs}<circle r="100" fill="url(#whl-sheen)" pointer-events="none"/><g class="winseg"></g></g><circle r="24" fill="url(#rimG)"/><circle r="19" fill="#2a1406"/><text class="hub" text-anchor="middle" dominant-baseline="middle">${hub}</text>`;
    const rot = svgEl.querySelector('.rot'), bulbEls = [...svgEl.querySelectorAll('.bulb')], flap = svgEl.parentElement.querySelector('.flapper');
    let angle = 0, idleRaf = null;
    // idle light chase
    const idle = () => {
      let k = 0;
      const step = () => { bulbEls.forEach((b, j) => b.classList.toggle('on', (j + k) % 4 === 0)); k++; idleRaf = setTimeout(step, 260); };
      clearTimeout(idleRaf); step();
    };
    idle();
    function spinTo(i, dur = 6) {
      clearTimeout(idleRaf);
      svgEl.querySelector('.winseg').innerHTML = '';
      const { from, to } = arcs[i], span = to - from;
      // sometimes stop right at the edge next to a bigger prize, the way real wheels feel
      const edge = Math.random() < 0.35 ? (Math.random() < 0.5 ? 0.08 : 0.92) : 0.2 + Math.random() * 0.6;
      const target = from + span * edge;
      const base = angle - (angle % 360);
      angle = base + 360 * (5 + Math.floor(dur / 2)) + (360 - target);
      rot.style.transition = reduced() ? 'none' : `transform ${dur}s cubic-bezier(.1,.62,.06,1)`;
      rot.style.transform = `rotate(${angle}deg)`;
      return new Promise(done => {
        let last = null, k = 0, prevA = null, t0 = performance.now();
        const loop = now => {
          const m = new DOMMatrix(getComputedStyle(rot).transform);
          const a = ((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360, under = (360 - a) % 360;
          const seg = arcs.findIndex(s => under >= s.from && under < s.to);
          if (seg !== last && last !== null) { snd.peg(); if (flap) { flap.classList.remove('flap'); flap.offsetWidth; flap.classList.add('flap'); } }
          last = seg;
          const speed = prevA == null ? 0 : Math.abs(((a - prevA + 540) % 360) - 180);
          prevA = a;
          k += Math.max(0.15, speed / 6);
          bulbEls.forEach((b, j) => b.classList.toggle('on', (j + Math.floor(k)) % 3 === 0));
          if (now - t0 < dur * 1000 + 60) requestAnimationFrame(loop);
          else {
            // light the winning slice
            const s = segments[i], [x1, y1] = pt(from, 100), [x2, y2] = pt(to, 100), large = span > 180 ? 1 : 0;
            svgEl.querySelector('.winseg').innerHTML = `<path class="win-glow" d="M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A100 100 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z"/>`;
            let f = 0; const flash = setInterval(() => { bulbEls.forEach(b => b.classList.toggle('on', f % 2 === 0)); if (++f > 9) { clearInterval(flash); idle(); } }, 140);
            done(s);
          }
        };
        requestAnimationFrame(loop);
      });
    }
    return { spinTo, arcs };
  }

  // ---------- bonus wheel feature ----------
  const BONUS_COLORS = { fs10: ['#5b2a9a', '#fff'], fs15: ['#7a3ac6', '#fff'], fs20: ['#9a52e6', '#fff'], mini: ['#1f8a4c', '#fff'], minor: ['#2a62c9', '#fff'], major: ['#c0202f', '#fff'], grand: ['#f2c14e', '#3a1a02'] };
  const bonusFx = $('#bonusFx');
  let bonusWheel = null;
  function buildBonusWheel() {
    bonusWheel = makeWheel($('#bonusWheel'), E.BONUS.map(b => ({
      label: b.kind === 'fs' ? `${b.v} FREE` : b.label.toUpperCase(), sub: b.kind === 'fs' ? 'SPINS' : b.kind === 'grand' ? '' : `${b.v}× BET`,
      w: b.w, fill: BONUS_COLORS[b.id][0], ink: BONUS_COLORS[b.id][1],
    })), { hub: 'BONUS' });
  }
  async function bonusFeature(count) {
    st.inFeature = true; st.auto = 0;
    snd.fanfare();
    $('#bonusTitle').textContent = `${count} ${theme.bonusName}!`;
    $('#bonusMsg').textContent = 'Spinning the bonus wheel…';
    bonusFx.hidden = false;
    document.body.classList.add('party');
    await wait(900);
    const i = E.bonusSpin(), b = E.BONUS[i];
    await bonusWheel.spinTo(i, 6.5);
    if (b.kind === 'fs') {
      $('#bonusMsg').innerHTML = `<b>${b.v} free spins</b>, all wins doubled`;
      snd.tier(2);
      await wait(1600);
      bonusFx.hidden = true;
      st.free += b.v; st.fsTotal = 0;
      ticker(`<b>${b.v} free spins</b>, all wins doubled!`);
    } else {
      const amt = jpValue(b);
      $('#bonusMsg').innerHTML = `<b>${b.label} jackpot: ${fmt(amt)}</b>`;
      await wait(1100);
      bonusFx.hidden = true;
      st.credits += amt; st.session.won += amt; st.session.best = Math.max(st.session.best, amt); saveCredits();
      if (b.kind === 'grand') { st.jackpot = JP_SEED; saveJackpot(); }
      UI.stats.add('slots', { t: Date.now(), bet: 0, win: amt, free: false, feature: false, jackpot: b.kind === 'grand' });
      await celebrate({ amount: amt, bet: totalBet(), jackpot: `${b.label} jackpot` });
      ticker(`${b.label} jackpot! <b>${fmt(amt)}</b> credits.`);
    }
    document.body.classList.remove('party');
    st.inFeature = false;
    paint();
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---------- celebration: the title climbs tiers as the counter rises ----------
  const TIERS = [[5, 'Nice win'], [15, 'Big win'], [30, 'Super win'], [60, 'Mega win'], [120, 'Epic win']];
  const fx = $('#winFx'), canvas = $('#coinRain');
  let skip = null;
  fx.onclick = () => skip && skip();
  function celebrate({ amount, bet, jackpot, title }) {
    return new Promise(done => {
      const x = amount / bet;
      const top = jackpot ? 5 : Math.max(1, TIERS.filter(t => x >= t[0]).length);
      fx.hidden = false; fx.dataset.level = Math.min(4, top);
      document.body.classList.add('party');
      const tierEl = $('#winTier'), num = $('#winNum');
      let shown = 0;
      const setTier = lvl => {
        shown = lvl;
        fx.dataset.level = Math.min(4, lvl);
        tierEl.textContent = jackpot && lvl >= top ? jackpot : title && lvl >= top ? title : TIERS[Math.min(TIERS.length, lvl) - 1][1];
        tierEl.classList.remove('up'); tierEl.offsetWidth; tierEl.classList.add('up');
        document.body.classList.remove('shake1', 'shake2', 'shake3'); document.body.offsetWidth;
        document.body.classList.add('shake' + Math.min(3, lvl));
        snd.tier(lvl); if (lvl >= 3) snd.boom();
        burst(lvl);
      };
      setTier(jackpot || title ? top : 1);
      if (R3) R3.celebrate(top);
      const stopFx = particles(top);
      const dur = jackpot ? 6000 : 1500 + top * 1100, start = performance.now();
      let raf, finished = false, lastTick = 0;
      const step = now => {
        const p = Math.min(1, (now - start) / dur), v = amount * (1 - Math.pow(1 - p, 2.2));
        num.textContent = fmt(v);
        const lvlNow = jackpot || title ? top : Math.max(1, TIERS.filter(t => v / bet >= t[0]).length);
        if (lvlNow > shown) setTier(lvlNow);
        if (now - lastTick > 55 && p < 1) { snd.count(); lastTick = now; }
        if (p < 1) raf = requestAnimationFrame(step);
        else { num.classList.add('final'); setTimeout(end, 1300); }
      };
      const end = () => {
        if (finished) return; finished = true;
        cancelAnimationFrame(raf); num.textContent = fmt(amount);
        fx.classList.add('out');
        setTimeout(() => {
          fx.hidden = true; fx.classList.remove('out'); num.classList.remove('final');
          document.body.classList.remove('shake1', 'shake2', 'shake3', 'party');
          stopFx(); skip = null; done();
        }, 380);
      };
      skip = () => { if (!finished) { num.textContent = fmt(amount); if (!jackpot && !title) { const l = Math.max(1, TIERS.filter(t => x >= t[0]).length); if (l > shown) setTier(l); } end(); } };
      raf = requestAnimationFrame(step);
    });
  }

  // fireworks, confetti and a coin fountain on one canvas
  let bursts = [];
  const burst = lvl => { for (let b = 0; b < Math.min(4, lvl); b++) bursts.push({ x: innerWidth * (0.2 + Math.random() * 0.6), y: innerHeight * (0.15 + Math.random() * 0.35), at: performance.now() + b * 180 }); };
  function particles(level) {
    if (reduced()) return () => {};
    const ctx = canvas.getContext('2d'), dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const COLORS = ['#ffd34a', '#ff4a6a', '#4ac8ff', '#7affa0', '#ffffff', '#c77aff'];
    const coins = [], confetti = [], sparks = [];
    const addCoin = () => coins.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 160, y: innerHeight + 20, vx: (Math.random() - 0.5) * 9, vy: -14 - Math.random() * 10, r: 8 + Math.random() * 7, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4 });
    for (let i = 0; i < 40 + level * 30; i++) setTimeout(addCoin, i * 25);
    for (let i = 0; i < 60 + level * 40; i++) confetti.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.8, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, c: COLORS[(Math.random() * COLORS.length) | 0] });
    let raf, frame = 0;
    const draw = now => {
      ctx.clearRect(0, 0, innerWidth, innerHeight); frame++;
      // fireworks
      bursts = bursts.filter(b => { if (now >= b.at) { for (let i = 0; i < 70; i++) { const t = (Math.PI * 2 * i) / 70, sp = 2 + Math.random() * 5; sparks.push({ x: b.x, y: b.y, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp, life: 1, c: COLORS[(Math.random() * COLORS.length) | 0] }); } return false; } return true; });
      for (const s of sparks) { s.vy += 0.06; s.vx *= 0.985; s.vy *= 0.985; s.x += s.vx; s.y += s.vy; s.life -= 0.012; if (s.life > 0) { ctx.globalAlpha = s.life; ctx.fillStyle = s.c; ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3); } }
      ctx.globalAlpha = 1;
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      // confetti
      for (const p of confetti) { p.x += p.vx + Math.sin((frame + p.y) / 30); p.y += p.vy; p.a += p.va; if (p.y > innerHeight + 20 && level > 2) { p.y = -10; p.x = Math.random() * innerWidth; } ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.a * 2))); ctx.restore(); }
      // coins
      for (const p of coins) { p.vy += 0.42; p.x += p.vx; p.y += p.vy; p.a += p.va; const w = Math.abs(Math.cos(p.a)) * p.r; ctx.fillStyle = '#b8861e'; ctx.beginPath(); ctx.ellipse(p.x, p.y, w + 0.6, p.r, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ffd96a'; ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.3, w * 0.72), p.r * 0.74, 0, 0, Math.PI * 2); ctx.fill(); }
      if (level >= 3 && frame % 10 === 0 && frame < 400) addCoin();
      if (level >= 3 && frame % 70 === 0) burst(1);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); bursts = []; ctx.clearRect(0, 0, innerWidth, innerHeight); };
  }

  // ---------- controls ----------
  $('#spinBtn').onclick = spin;
  $('#lever').onclick = spin;
  $('#betUp').onclick = () => { if (st.spinning || st.free) return; st.lineBet = BETS[Math.min(BETS.length - 1, BETS.indexOf(st.lineBet) + 1)]; snd.tick(); paint(); };
  $('#betDown').onclick = () => { if (st.spinning || st.free) return; st.lineBet = BETS[Math.max(0, BETS.indexOf(st.lineBet) - 1)]; snd.tick(); paint(); };
  $('#autoBtn').onclick = () => { st.auto = st.auto ? 0 : 10; if (st.auto && !st.spinning) spin(); paint(); };
  document.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (!fx.hidden && skip) skip(); else spin(); }
  });

  // ---------- pay table ----------
  $('#payBtn').onclick = () => {
    let dlg = document.getElementById('payDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'payDlg'; dlg.className = 'rules pay-dlg'; document.body.appendChild(dlg); }
    const order = [E.S.WILD, E.S.SEVEN, E.S.DIAMOND, E.S.BAR, E.S.BELL, E.S.LEMON, E.S.CHERRY];
    let h = `<h2>${theme.name}: pays</h2><p>Line wins pay left to right, times your bet per line (now ${st.lineBet}). ${symName(E.S.WILD)} is wild and stands in for any symbol except ${symName(E.S.SCATTER)}.</p><div class="pay-grid">`;
    for (const s of order) {
      const p = E.PAY[s];
      h += `<div class="pay-row"><span class="pay-sym">${symSvg(s)}</span><span>5× <b>${s === E.S.SEVEN ? 'GRAND' : fmt(p[2] * st.lineBet)}</b></span><span>4× <b>${fmt(p[1] * st.lineBet)}</b></span><span>3× <b>${fmt(p[0] * st.lineBet)}</b></span></div>`;
    }
    const tot = E.BONUS.reduce((a, b) => a + b.w, 0);
    h += `<div class="pay-row"><span class="pay-sym">${symSvg(E.S.SCATTER)}</span><span class="pay-wide">3, 4 or 5 ${theme.bonusName.toLowerCase()} anywhere pay 2×, 10× or 50× your total bet and spin the bonus wheel.</span></div></div>`;
    h += `<h4>Bonus wheel</h4><table class="st-table-in"><tr><th>Prize</th><th>Chance</th></tr>${E.BONUS.map(b => `<tr><td>${b.kind === 'fs' ? `${b.v} free spins (wins ×2)` : b.kind === 'grand' ? 'Grand jackpot (progressive)' : `${b.label} jackpot (${b.v}× total bet)`}</td><td>${(b.w / tot * 100).toFixed(1)}%</td></tr>`).join('')}</table>`;
    h += '<h4>The 10 lines</h4><div class="mini-lines">' + E.LINES.map((L, i) => `<svg viewBox="0 0 50 30"><title>Line ${i + 1}</title>${[0, 1, 2].map(row => [0, 1, 2, 3, 4].map(r => `<rect x="${r * 10 + 1}" y="${row * 10 + 1}" width="8" height="8" rx="1.5" class="${L[r] === row ? 'on' : ''}"/>`).join('')).join('')}</svg>`).join('') + '</div>';
    h += `<p class="sub">Five ${symName(E.S.SEVEN)} on a line also win the Grand jackpot, which grows by 2% of every bet. Over the long run this machine pays back about 95% of what is bet.</p><div class="rule-actions"><button type="button" class="primary" data-act="close">Close</button></div>`;
    dlg.innerHTML = h;
    dlg.onclick = e => { if (e.target.closest('[data-act="close"]')) dlg.close(); };
    dlg.showModal();
  };

  // ---------- prize wheel ----------
  const WHEEL_KEY = 'ol-wheel-free';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const freeWheel = () => (UI.store.load(WHEEL_KEY, { day: '' }) || { day: '' }).day !== today();
  const PW_COLORS = [['#7a1424', '#fff'], ['#f4eee1', '#3a1a02'], ['#1f5c47', '#fff'], ['#f4eee1', '#3a1a02'], ['#2a62c9', '#fff'], ['#f4eee1', '#3a1a02'], ['#5b2a9a', '#fff'], ['#c0202f', '#fff'], ['#f2c14e', '#3a1a02']];
  const prizeWheel = makeWheel($('#wheel'), E.WHEEL.map((s, i) => ({ label: s.label, w: s.w, fill: PW_COLORS[i][0], ink: PW_COLORS[i][1] })), { hub: 'WIN' });
  const totalW = E.WHEEL.reduce((a, s) => a + s.w, 0);
  $('#wheelOdds').innerHTML = '<tr><th>Prize</th><th>Chance</th></tr>' + E.WHEEL.map(s => `<tr><td>${s.label === 'JACKPOT' ? 'Jackpot (5,000)' : s.label + ' chips'}</td><td>${(s.w / totalW * 100).toFixed(1)}%</td></tr>`).join('');
  let wheelBusy = false;
  function paintWheel() {
    const f = freeWheel();
    $('#wheelBtn').textContent = f ? 'Free daily spin' : `Spin for ${E.WHEEL_PRICE} chips`;
    $('#wheelBtn').disabled = wheelBusy;
    $('#wheelNote').textContent = f ? 'One free spin every day. Slice sizes match the real odds.' : `Your free spin is used for today. More spins cost ${E.WHEEL_PRICE} chips (they pay back about 81 on average).`;
  }
  $('#wheelBtn').onclick = async () => {
    if (wheelBusy) return;
    const f = freeWheel();
    if (!f) {
      if (UI.wallet.chips < E.WHEEL_PRICE) { UI.toast('Not enough chips for a wheel spin.'); return; }
      UI.wallet.add(-E.WHEEL_PRICE);
    } else UI.store.save(WHEEL_KEY, { day: today() });
    wheelBusy = true; paintWheel(); $('#wheelResult').textContent = '';
    const i = E.wheelSpin();
    await prizeWheel.spinTo(i, 6);
    const prize = E.WHEEL[i];
    UI.wallet.add(prize.chips);
    UI.stats.add('wheel', { t: Date.now(), cost: f ? 0 : E.WHEEL_PRICE, prize: prize.chips });
    $('#wheelResult').innerHTML = `You won <b>${fmt(prize.chips)}</b> chips${prize.label === 'JACKPOT' ? ', the jackpot!' : '!'} Added to your wallet.`;
    if (prize.chips >= 200) await celebrate({ amount: prize.chips, bet: 20, jackpot: prize.label === 'JACKPOT' ? 'Wheel jackpot' : null, title: prize.label === 'JACKPOT' ? null : 'Wheel prize' });
    else snd.small();
    wheelBusy = false; paintWheel();
  };

  // ---------- start ----------
  st.grid = E.spin().grid;
  applyTheme();
  buildBonusWheel();
  paint(); paintWheel();
  use3D();
  if (st.credits) ticker(`Welcome back. ${fmt(st.credits)} credits are still in the machine.`);
  UI.wallet.onChange(() => paintWheel());
  window.addEventListener('resize', () => { if (!st.spinning) reelsEl.querySelectorAll('.strip').forEach(s => (s.style.transform = 'translateY(0)')); });
})();
