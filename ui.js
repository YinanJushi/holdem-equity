// Shared page helpers: tab panels and the rules dialog.
(function () {
  const store = {
    load(key, defaults) {
      try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ? { ...defaults, ...v } : null; } catch (e) { return null; }
    },
    save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode: rules just won't be remembered */ } },
  };

  function initTabs() {
    document.querySelectorAll('.tabbar').forEach(bar => {
      bar.addEventListener('click', e => {
        const b = e.target.closest('[data-tab]');
        if (b) showTab(b.dataset.tab);
      });
    });
  }
  function showTab(name) {
    const btn = document.querySelector(`.tabbar [data-tab="${name}"]`);
    if (!btn) return;
    const bar = btn.parentElement;
    bar.querySelectorAll('[data-tab]').forEach(b => {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
      const pane = document.getElementById('tab-' + b.dataset.tab);
      if (pane) pane.hidden = !on;
    });
  }

  // fields: [{ key, name, hint, options: [{ v, label }] }]
  function rulesDialog({ title, intro, fields, values, preview, onSave, cancellable }) {
    let dlg = document.getElementById('rulesDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'rulesDlg'; dlg.className = 'rules'; document.body.appendChild(dlg); }
    const cur = { ...values };
    const render = () => {
      let h = `<h2>${title}</h2><p>${intro}</p>`;
      for (const f of fields) {
        h += `<div class="rule"><div class="rule-name">${f.name}${f.hint ? `<small>${f.hint}</small>` : ''}</div><div class="seg" data-key="${f.key}">`;
        for (const o of f.options) h += `<button type="button" data-v='${JSON.stringify(o.v)}' class="${JSON.stringify(cur[f.key]) === JSON.stringify(o.v) ? 'on' : ''}">${o.label}</button>`;
        h += '</div></div>';
      }
      if (preview) h += `<div class="rule-edge">${preview(cur)}</div>`;
      h += `<div class="rule-actions">${cancellable ? '<button type="button" class="ghostbtn" data-act="cancel">Cancel</button>' : ''}<button type="button" class="primary" data-act="save">Start playing</button></div>`;
      dlg.innerHTML = h;
    };
    dlg.onclick = e => {
      const opt = e.target.closest('[data-v]');
      if (opt) { cur[opt.parentElement.dataset.key] = JSON.parse(opt.dataset.v); render(); return; }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'save') { dlg.close(); onSave(cur); }
      else dlg.close();
    };
    dlg.oncancel = e => { if (!cancellable) e.preventDefault(); };
    render();
    if (dlg.open) dlg.close();
    dlg.showModal();
  }

  // chip stack: biggest denominations at the bottom, at most `max` discs
  const DENOMS = [[500, 'gold'], [100, 'black'], [25, 'green'], [5, 'red'], [1, 'white']];
  function chips(n, max = 8) {
    const out = [];
    let r = Math.round(n);
    for (const [v, c] of DENOMS) while (r >= v && out.length < max) { out.push(c); r -= v; }
    if (!out.length && n > 0) out.push('white');
    return `<span class="cstack" style="height:${22 + (out.length - 1) * 3}px">${out.map((c, i) => `<i class="disc ${c}" style="--i:${i}"></i>`).join('')}</span>`;
  }

  // small synthesized sound effects (no audio files)
  let actx = null, last = {};
  let soundOn = (() => { try { return localStorage.getItem('ol-sound') !== '0'; } catch (e) { return true; } })();
  function tone(t, freq, dur, vol) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
  }
  function sfx(type) {
    if (!soundOn) return;
    const now = performance.now();
    if (now - (last[type] || 0) < 70) return;
    last[type] = now;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      if (type === 'card') {
        const len = Math.floor(actx.sampleRate * 0.05), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
        src.buffer = buf; f.type = 'highpass'; f.frequency.value = 1500; g.gain.value = 0.22;
        src.connect(f).connect(g).connect(actx.destination); src.start(t);
      } else if (type === 'chip') {
        tone(t, 2600, 0.09, 0.05); tone(t + 0.035, 3300, 0.08, 0.04);
      } else if (type === 'win') {
        [0, 0.07, 0.14, 0.21].forEach((dt, i) => tone(t + dt, 2200 + i * 400, 0.12, 0.05));
      }
    } catch (e) { /* audio not available */ }
  }
  function initSound() {
    const b = document.getElementById('soundBtn');
    if (!b) return;
    const paint = () => { b.textContent = soundOn ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', soundOn); };
    b.onclick = () => { soundOn = !soundOn; try { localStorage.setItem('ol-sound', soundOn ? '1' : '0'); } catch (e) { } paint(); if (soundOn) sfx('chip'); };
    paint();
  }

  // ---------- deck choice ----------
  const DECKS = [
    { id: 'classic', name: 'Classic' },
    { id: 'sky', name: 'Sky', c: '#7fb6cc' },
    { id: 'ink', name: 'Ink', c: '#34496e' },
    { id: 'mint', name: 'Mint', c: '#5aa891' },
    { id: 'apricot', name: 'Apricot', c: '#e3a083' },
    { id: 'brick', name: 'Brick', c: '#9e3530' },
    { id: 'stone', name: 'Stone', c: '#979c9d' },
    { id: 'pine', name: 'Pine', c: '#23402f' },
    { id: 'pumpkin', name: 'Pumpkin', c: '#e07b2e' },
    { id: 'pink', name: 'Pink', c: '#e58aab' },
    { id: 'lime', name: 'Lime', c: '#8cc63f' },
    { id: 'charcoal', name: 'Charcoal', c: '#2b2b2e' },
  ];
  const DECK_KEY = 'ol-deck';
  let deck = store.load(DECK_KEY, { back: 'classic', face: 'classic' }) || { back: 'classic', face: 'classic' };
  function applyDeck() {
    document.documentElement.dataset.deck = deck.back;
    document.documentElement.dataset.face = deck.face;
  }
  applyDeck();
  const sample = (rank, suit, cls) => `<div class="card s${cls} ${'JQK'.includes(rank) ? 'face' : ''}"><span class="r">${rank}</span><span class="r2">${suit}</span><span class="pip">${'JQK'.includes(rank) ? rank : suit}</span></div>`;
  function deckPicker() {
    let dlg = document.getElementById('deckDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'deckDlg'; dlg.className = 'rules'; document.body.appendChild(dlg); }
    const render = () => {
      let h = '<h2>Choose your cards</h2><p>Pick a card back and a face style. Your choice is saved on this device.</p>';
      h += '<div class="rule-name">Card back</div><div class="deck-grid">';
      for (const d of DECKS) {
        h += `<button type="button" class="deck-opt ${deck.back === d.id ? 'on' : ''}" data-back="${d.id}" ${d.c ? `data-solid style="--deck:${d.c}"` : ''}><div class="card back ${d.c ? '' : 'back-classic'}"></div>${d.name}</button>`;
      }
      h += '</div><div class="rule-name">Card faces</div><div class="deck-faces">';
      for (const [id, name] of [['classic', 'Classic serif'], ['simple', 'Simple']]) {
        h += `<button type="button" class="${deck.face === id ? 'on' : ''}" data-face="${id}"><span class="deck-face" data-face="${id}">${sample('A', '♠', 0)}${sample('K', '♥', 1)}${sample('7', '♦', 2)}</span>${name}</button>`;
      }
      h += '</div><div class="rule-actions"><button type="button" class="primary" data-act="done">Done</button></div>';
      dlg.innerHTML = h;
    };
    dlg.onclick = e => {
      const b = e.target.closest('[data-back]'), f = e.target.closest('button[data-face]');
      if (b) deck.back = b.dataset.back;
      else if (f) deck.face = f.dataset.face;
      else if (e.target.closest('[data-act="done"]')) { dlg.close(); return; }
      else return;
      store.save(DECK_KEY, deck);
      applyDeck(); render(); sfx('card');
    };
    render();
    dlg.showModal();
  }
  // ---------- view: hide analysis (play-only) and full screen ----------
  const VIEW_KEY = 'ol-view';
  let view = store.load(VIEW_KEY, { focus: false }) || { focus: false };
  const applyView = () => { document.documentElement.dataset.focus = view.focus ? '1' : '0'; };
  applyView();
  function initView() {
    const fb = document.getElementById('focusBtn'), sb = document.getElementById('fsBtn');
    if (fb) {
      const paint = () => { fb.textContent = view.focus ? 'Show analysis' : 'Hide analysis'; fb.setAttribute('aria-pressed', view.focus); };
      fb.onclick = () => { view.focus = !view.focus; store.save(VIEW_KEY, view); applyView(); paint(); };
      paint();
    }
    if (sb) {
      // "Full screen" = hide the site chrome so the table fills the window, plus real browser full screen where allowed
      const can = document.fullscreenEnabled || document.webkitFullscreenEnabled;
      const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
      let imm = false, wasFs = false;
      const paint = () => { sb.textContent = imm ? 'Exit full screen' : 'Full screen'; sb.setAttribute('aria-pressed', imm); };
      const setImm = v => { imm = v; document.documentElement.dataset.immersive = v ? '1' : '0'; paint(); };
      sb.onclick = () => {
        const el = document.documentElement;
        if (imm) { if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); setImm(false); return; }
        setImm(true);
        if (can) { try { const pr = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* stays in the in-page version */ } }
      };
      const onFs = () => { if (isFs()) wasFs = true; else if (wasFs) { wasFs = false; setImm(false); } };
      document.addEventListener('fullscreenchange', onFs);
      document.addEventListener('webkitfullscreenchange', onFs);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && imm && !isFs()) setImm(false); });
      paint();
    }
  }
  function initDeck() { const b = document.getElementById('deckBtn'); if (b) b.onclick = deckPicker; }

  // ---------- wallet: one chip balance for both games, refilled by a daily claim ----------
  const WALLET_KEY = 'ol-wallet', DAILY = 1000;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const loadWallet = () => store.load(WALLET_KEY, { chips: 0, lastClaim: '' });
  let w = loadWallet();
  if (!w) { w = { chips: DAILY, lastClaim: today() }; store.save(WALLET_KEY, w); } // first visit: today's chips
  const wallet = {
    DAILY,
    get chips() { return w.chips; },
    set(v) { w.chips = Math.max(0, Math.round(v * 10) / 10); store.save(WALLET_KEY, w); renderWallet(); },
    add(n) { this.set(w.chips + n); },
    canClaim() { return w.lastClaim !== today(); },
    claim() { if (!this.canClaim()) return false; w.lastClaim = today(); this.set(w.chips + DAILY); sfx('win'); return true; },
    nextClaimIn() { const d = new Date(); d.setHours(24, 0, 0, 0); return d - new Date(); },
  };
  const listeners = [];
  function renderWallet() {
    const box = document.getElementById('wallet');
    if (box) {
      const ms = wallet.nextClaimIn(), h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
      box.innerHTML = `<span class="wallet-amt" title="Your chips (shared by both games)">${chips(Math.max(1, w.chips), 3)}<b>${Math.floor(w.chips).toLocaleString('en-US')}</b></span>` +
        (wallet.canClaim() ? `<button class="claim" id="claimBtn">Claim ${DAILY.toLocaleString('en-US')}</button>` : `<span class="claim-wait" title="You can claim ${DAILY} free chips once a day">Next ${DAILY.toLocaleString('en-US')} in ${h}h ${m}m</span>`);
      const b = document.getElementById('claimBtn');
      if (b) b.onclick = () => wallet.claim();
    }
    listeners.forEach(f => f(w.chips));
  }
  wallet.onChange = f => listeners.push(f);
  // another tab changed the wallet
  window.addEventListener('storage', e => { if (e.key === WALLET_KEY) { w = loadWallet() || w; renderWallet(); } });
  setInterval(renderWallet, 60000);

  // ---------- stats: every finished hand, kept on this device ----------
  const STATS_KEY = g => 'ol-stats-' + g, MAX_REC = 1000;
  const stats = {
    add(game, rec) { const a = this.get(game); a.push(rec); while (a.length > MAX_REC) a.shift(); store.save(STATS_KEY(game), a); },
    get(game) { try { const v = JSON.parse(localStorage.getItem(STATS_KEY(game)) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
    clear(game) { try { localStorage.removeItem(STATS_KEY(game)); } catch (e) { } },
  };

  window.UI = { store, initTabs, showTab, rulesDialog, chips, sfx, deckPicker, wallet, stats };
  const boot = () => { initTabs(); initSound(); initDeck(); initView(); renderWallet(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
