(function () {
  const $ = s => document.querySelector(s);
  const pct = (a, b) => (b ? (a / b) * 100 : null);
  const fmtP = v => (v == null ? '—' : v.toFixed(v < 10 && v > 0 ? 1 : 0) + '%');
  const signed = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString('en-US');
  const LN = { 0: 'Preflop', 3: 'Flop', 4: 'Turn', 5: 'River' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- tooltip ----------
  const tip = $('#tip');
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x + 12)) + 'px';
    tip.style.top = Math.max(8, y - r.height - 12) + 'px';
  }
  const hideTip = () => (tip.hidden = true);

  // ---------- building blocks ----------
  function kpis(el, items) {
    el.innerHTML = items.map(k => `<div class="kpi"><div class="kpi-l">${k.label}</div><div class="kpi-v">${k.value}</div>${k.sub ? `<div class="kpi-s">${k.sub}</div>` : ''}</div>`).join('');
  }
  // horizontal bars, one series; items: { label, value, text, detail }
  function bars(el, items, { max, ref, refLabel } = {}) {
    const m = max || Math.max(1e-9, ...items.map(i => i.value || 0));
    let h = '<div class="hbars">';
    items.forEach((it, k) => {
      const w = it.value == null ? 0 : Math.max(0, Math.min(100, (it.value / m) * 100));
      h += `<div class="hbar" data-k="${k}" tabindex="0"><span class="hb-l">${esc(it.label)}</span><span class="hb-t">` +
        (it.value ? `<i style="width:${w}%"></i>` : '') +
        (ref != null ? `<b class="hb-ref" style="left:${(ref / m) * 100}%" title="${esc(refLabel || '')}"></b>` : '') +
        `</span><span class="hb-v">${it.value == null ? '—' : it.text}</span></div>`;
    });
    h += '</div>';
    if (ref != null && refLabel) h += `<div class="hb-reflab"><b class="hb-ref-key"></b>${esc(refLabel)}</div>`;
    h += `<details class="st-table"><summary>Show table</summary><table><tr><th>Item</th><th>Value</th><th>Based on</th></tr>${items.map(it => `<tr><td>${esc(it.label)}</td><td>${it.value == null ? '—' : it.text}</td><td>${esc(it.detail || '')}</td></tr>`).join('')}</table></details>`;
    el.innerHTML = h;
    el.querySelectorAll('.hbar').forEach(row => {
      const it = items[+row.dataset.k];
      const html = `<b>${esc(it.label)}</b><br>${it.value == null ? 'No data yet' : it.text}${it.detail ? `<br><span>${esc(it.detail)}</span>` : ''}`;
      row.onmousemove = e => showTip(html, e.clientX, e.clientY);
      row.onmouseleave = hideTip;
      row.onfocus = () => { const r = row.getBoundingClientRect(); showTip(html, r.left + r.width / 2, r.top); };
      row.onblur = hideTip;
    });
  }
  // running total line, one series, with a crosshair
  function line(el, values, unit) {
    const W = 600, H = 210, pl = 46, pr = 12, pt = 14, pb = 26;
    if (values.length < 2) { el.innerHTML = '<p class="sub">Play at least two hands to see a line.</p>'; return; }
    const lo = Math.min(0, ...values), hi = Math.max(0, ...values), span = hi - lo || 1;
    const xs = i => pl + (i * (W - pl - pr)) / (values.length - 1);
    const ys = v => pt + (1 - (v - lo) / span) * (H - pt - pb);
    const step = niceStep(span / 4);
    let g = '';
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      g += `<line class="c-grid" x1="${pl}" x2="${W - pr}" y1="${ys(v)}" y2="${ys(v)}"/><text class="c-ax" x="${pl - 8}" y="${ys(v) + 4}" text-anchor="end">${(Math.abs(v) < 1e-9 ? 0 : Math.round(v * 100) / 100).toLocaleString('en-US')}</text>`;
    }
    g += `<line class="c-zero" x1="${pl}" x2="${W - pr}" y1="${ys(0)}" y2="${ys(0)}"/>`;
    g += `<text class="c-ax" x="${pl}" y="${H - 6}">Hand 1</text><text class="c-ax" x="${W - pr}" y="${H - 6}" text-anchor="end">Hand ${values.length}</text>`;
    g += `<path class="st-line" d="${values.map((v, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ')}"/>`;
    g += `<line class="st-cross" x1="0" x2="0" y1="${pt}" y2="${H - pb}" visibility="hidden"/><circle class="st-dot" r="4.5" visibility="hidden"/>`;
    g += `<rect class="st-hit" x="${pl}" y="${pt}" width="${W - pl - pr}" height="${H - pt - pb}"/>`;
    const last = values[values.length - 1];
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Running result over ${values.length} hands, ending at ${signed(last)} ${unit}">${g}</svg>` +
      `<details class="st-table"><summary>Show table</summary><table><tr><th>Hand</th><th>Running result</th></tr>${values.map((v, i) => `<tr><td>${i + 1}</td><td>${signed(v)}</td></tr>`).join('')}</table></details>`;
    const svg = el.querySelector('svg'), cross = svg.querySelector('.st-cross'), dot = svg.querySelector('.st-dot');
    const move = e => {
      const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(values.length - 1, Math.round(((x - pl) / (W - pl - pr)) * (values.length - 1))));
      cross.setAttribute('x1', xs(i)); cross.setAttribute('x2', xs(i)); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', xs(i)); dot.setAttribute('cy', ys(values[i])); dot.setAttribute('visibility', 'visible');
      const d = i ? values[i] - values[i - 1] : values[0];
      showTip(`<b>Hand ${i + 1}</b><br>Running result ${signed(values[i])} ${unit}<br><span>This hand ${signed(d)}</span>`, e.clientX, e.clientY);
    };
    svg.querySelector('.st-hit').addEventListener('mousemove', move);
    svg.querySelector('.st-hit').addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); });
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }
  const running = arr => { let s = 0; return arr.map(v => (s += v)); };

  // ---------- Texas Hold'em ----------
  function holdem() {
    const H = UI.stats.get('holdem');
    $('#hEmpty').hidden = !!H.length; $('#hBody').hidden = !H.length;
    if (!H.length) return;
    const n = H.length, bb = H[0].bb || 2;
    const net = H.reduce((a, r) => a + r.net, 0);
    const wins = H.reduce((a, r) => a + (r.win || 0), 0);
    const vpip = H.filter(r => r.vpip).length, pfr = H.filter(r => r.pfr).length;
    const flop = H.filter(r => r.sawFlop), sd = H.filter(r => r.sd);
    const acts = H.flatMap(r => r.acts || []);
    const judged = acts.filter(a => a[3] !== -1), matched = judged.filter(a => a[3] === 1);
    kpis($('#hKpis'), [
      { label: 'Hands', value: n.toLocaleString('en-US') },
      { label: 'Result', value: signed(net), sub: `${(net / bb / n * 100 >= 0 ? '+' : '−')}${Math.abs(net / bb / n * 100).toFixed(1)} big blinds per 100 hands` },
      { label: 'Hands won', value: fmtP(pct(wins, n)) },
      { label: 'Played preflop', value: fmtP(pct(vpip, n)), sub: 'Put chips in by choice (VPIP)' },
      { label: 'Raised preflop', value: fmtP(pct(pfr, n)), sub: 'PFR' },
      { label: 'Saw the flop', value: fmtP(pct(flop.length, n)) },
      { label: 'Went to showdown', value: fmtP(pct(sd.length, flop.length)), sub: 'Of hands that saw the flop' },
      { label: 'Won at showdown', value: fmtP(pct(sd.reduce((a, r) => a + (r.win || 0), 0), sd.length)) },
      { label: 'Followed advice', value: fmtP(pct(matched.length, judged.length)), sub: `${matched.length} of ${judged.length} decisions` },
    ]);

    // where hands end in a fold
    const foldItems = [0, 3, 4, 5].map(l => { const c = H.filter(r => r.foldL === l).length; return { label: LN[l], value: pct(c, n), text: fmtP(pct(c, n)), detail: `${c} of ${n} hands` }; });
    const never = H.filter(r => r.foldL == null).length;
    foldItems.push({ label: 'Never folded', value: pct(never, n), text: fmtP(pct(never, n)), detail: `${never} of ${n} hands` });
    bars($('#hFold'), foldItems, { max: 100 });

    // folding to a bet, by street
    bars($('#hFoldBet'), [0, 3, 4, 5].map(l => {
      const f = acts.filter(a => a[0] === l && a[2] === 1), folds = f.filter(a => a[1] === 'fold').length;
      return { label: LN[l], value: f.length ? pct(folds, f.length) : null, text: fmtP(pct(folds, f.length)), detail: f.length ? `${folds} folds in ${f.length} spots facing a bet` : 'No spots facing a bet yet' };
    }), { max: 100 });

    // preflop strength of hands played vs folded, and win rates
    const ratio = r => (r.eq0 == null ? null : r.eq0 / (100 / ((r.opp || 1) + 1)));
    const avg = a => { const v = a.map(ratio).filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const played = H.filter(r => r.vpip), foldedPre = H.filter(r => r.foldL === 0);
    const ap = avg(played), af = avg(foldedPre);
    const el = $('#hFlop');
    el.innerHTML = '<h4>Preflop odds vs table average</h4><div id="hFlopA"></div><h4>How often you won</h4><div id="hFlopB"></div>';
    bars($('#hFlopA'), [
      { label: 'Hands you played', value: ap, text: ap == null ? '—' : ap.toFixed(2) + '×', detail: `${played.length} hands` },
      { label: 'Hands you folded', value: af, text: af == null ? '—' : af.toFixed(2) + '×', detail: `${foldedPre.length} hands folded preflop` },
    ], { max: Math.max(2, (ap || 0) * 1.15, (af || 0) * 1.15), ref: 1, refLabel: '1.0× = an average hand for that table size' });
    const fw = flop.reduce((a, r) => a + (r.win || 0), 0);
    bars($('#hFlopB'), [
      { label: 'All hands', value: pct(wins, n), text: fmtP(pct(wins, n)), detail: `${n} hands` },
      { label: 'Saw the flop', value: pct(fw, flop.length), text: fmtP(pct(fw, flop.length)), detail: `${flop.length} hands` },
      { label: 'Went to showdown', value: pct(sd.reduce((a, r) => a + (r.win || 0), 0), sd.length), text: fmtP(pct(sd.reduce((a, r) => a + (r.win || 0), 0), sd.length)), detail: `${sd.length} hands` },
    ], { max: 100 });

    line($('#hLine'), running(H.map(r => r.net)), 'chips');
  }

  // ---------- Blackjack ----------
  function blackjack() {
    const B = UI.stats.get('bj');
    $('#bEmpty').hidden = !!B.length; $('#bBody').hidden = !B.length;
    if (!B.length) return;
    const hands = B.flatMap(r => r.hands || []), n = hands.length;
    const net = B.reduce((a, r) => a + r.net, 0);
    const cnt = k => hands.filter(h => h.res === k).length;
    const bjs = cnt('Blackjack'), win = cnt('Win'), push = cnt('Push'), lose = cnt('Lose'), bust = cnt('Bust');
    const dbl = hands.filter(h => h.dbl), dblWon = dbl.filter(h => h.res === 'Win').length;
    const dec = B.reduce((a, r) => a + (r.dec || 0), 0), ok = B.reduce((a, r) => a + (r.ok || 0), 0);
    const lost = B.reduce((a, r) => a + (r.lost || 0), 0);
    const withEv = B.filter(r => r.ev != null), luck = withEv.reduce((a, r) => a + (r.net - r.ev), 0);
    kpis($('#bKpis'), [
      { label: 'Hands', value: n.toLocaleString('en-US'), sub: `${B.length} rounds` },
      { label: 'Result', value: signed(net), sub: 'chips' },
      { label: 'Won', value: fmtP(pct(win + bjs, n)), sub: `Push ${fmtP(pct(push, n))} · Lost ${fmtP(pct(lose + bust, n))}` },
      { label: 'Blackjacks', value: bjs.toLocaleString('en-US'), sub: fmtP(pct(bjs, n)) + ' of hands' },
      { label: 'Busted', value: fmtP(pct(bust, n)) },
      { label: 'Doubles won', value: fmtP(pct(dblWon, dbl.length)), sub: `${dbl.length} doubles` },
      { label: 'Best-play accuracy', value: fmtP(pct(ok, dec)), sub: `${ok} of ${dec} decisions` },
      { label: 'Lost to mistakes', value: Math.round(lost).toLocaleString('en-US'), sub: 'chips, on average' },
      { label: 'Luck', value: signed(luck), sub: 'Result minus what your play was worth' },
    ]);
    bars($('#bRes'), [['Blackjack', bjs], ['Win', win], ['Push', push], ['Lose', lose], ['Bust', bust]].map(([l, c]) => ({ label: l, value: pct(c, n), text: fmtP(pct(c, n)), detail: `${c} of ${n} hands` })), { max: 100 });
    line($('#bLine'), running(B.map(r => r.net)), 'chips');
  }

  // ---------- Slots & wheel ----------
  function slots() {
    const S = UI.stats.get('slots'), Wh = UI.stats.get('wheel');
    $('#sEmpty').hidden = !!(S.length || Wh.length); $('#sBody').hidden = !(S.length || Wh.length);
    if (!S.length && !Wh.length) return;
    const bet = S.reduce((a, r) => a + r.bet, 0), won = S.reduce((a, r) => a + r.win, 0);
    const best = S.reduce((a, r) => Math.max(a, r.win), 0), feats = S.filter(r => r.feature).length, jps = S.filter(r => r.jackpot).length;
    const wCost = Wh.reduce((a, r) => a + r.cost, 0), wWon = Wh.reduce((a, r) => a + r.prize, 0);
    kpis($('#sKpis'), [
      { label: 'Spins', value: S.length.toLocaleString('en-US'), sub: `${S.filter(r => r.free).length} of them free` },
      { label: 'Result', value: signed(won - bet), sub: `Bet ${Math.round(bet).toLocaleString('en-US')} · won ${Math.round(won).toLocaleString('en-US')}` },
      { label: 'Return', value: fmtP(pct(won, bet)), sub: 'The machine is built to return about 95%' },
      { label: 'Biggest win', value: Math.round(best).toLocaleString('en-US') },
      { label: 'Free-spin features', value: feats.toLocaleString('en-US'), sub: jps ? `${jps} jackpot${jps > 1 ? 's' : ''}!` : 'No jackpot yet' },
      { label: 'Wheel spins', value: Wh.length.toLocaleString('en-US'), sub: `Paid ${wCost} · won ${wWon.toLocaleString('en-US')}` },
    ]);
    line($('#sLine'), running(S.map(r => r.win - r.bet)), 'chips');
    const prizes = [...new Set(UI_WHEEL_PRIZES)];
    bars($('#wBars'), prizes.map(p => { const c = Wh.filter(r => r.prize === p).length; return { label: p >= 5000 ? 'Jackpot' : `${p} chips`, value: Wh.length ? pct(c, Wh.length) : null, text: fmtP(pct(c, Wh.length)), detail: `${c} of ${Wh.length} spins` }; }), { max: 100 });
  }
  const UI_WHEEL_PRIZES = [10, 25, 50, 75, 100, 200, 500, 1000, 5000];

  function walletLine() {
    const w = UI.wallet, ms = w.nextClaimIn(), h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
    $('#walletLine').innerHTML = `You have <b>${Math.floor(w.chips).toLocaleString('en-US')}</b> chips. ` +
      (w.canClaim() ? `Your daily ${w.DAILY.toLocaleString('en-US')} chips are ready to claim at the top.` : `You can claim ${w.DAILY.toLocaleString('en-US')} more chips in ${h}h ${m}m (once a day).`);
  }

  document.querySelectorAll('[data-reset]').forEach(b => (b.onclick = () => {
    const g = b.dataset.reset;
    const name = g === 'bj' ? 'Blackjack' : g === 'slots' ? 'Slots and prize wheel' : "Texas Hold'em";
    if (!confirm(`Delete all your ${name} stats on this device? This can't be undone.`)) return;
    UI.stats.clear(g); if (g === 'slots') UI.stats.clear('wheel'); render();
  }));
  UI.wallet.onChange(walletLine);
  function render() { walletLine(); holdem(); blackjack(); slots(); }
  render();
})();
