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
  function initDeck() { const b = document.getElementById('deckBtn'); if (b) b.onclick = deckPicker; }

  window.UI = { store, initTabs, showTab, rulesDialog, chips, sfx, deckPicker };
  const boot = () => { initTabs(); initSound(); initDeck(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
