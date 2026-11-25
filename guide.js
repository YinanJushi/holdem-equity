// A short first-visit guide for each game: three or four steps, each pointing at the control it talks about.
// Shown once per page (remembered on this device); "?" style help stays available through each table's rules.
(function () {
  const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  const T = s => (window.I18N ? I18N.t(s) : s);
  const STEPS = {
    index: [
      { at: null, text: "Welcome to the Hold'em table. You play against AI opponents with play chips; nothing here costs real money." },
      { at: '.t3-ico[data-k="rules"]', text: 'Rules: blinds, number of opponents and how strong they play (Easy, Normal or Hard).' },
      { at: '#actionBtn', text: 'Your moves are the buttons along the bottom: deal, fold, call, and one-tap raise sizes.' },
      { at: '.t3-ico[data-k="analysis"]', text: 'Analysis shows your chance to win on every card and what a strong player would do.' },
      { at: '.t3-ico[data-k="trophy"]', text: 'Missions and badges: finish daily missions for free chips.' },
    ],
    blackjack: [
      { at: null, text: 'Welcome to blackjack. Get closer to 21 than the dealer without going over.' },
      { at: '#betTools', text: 'Tap the chips to build your bet, then press Deal.' },
      { at: '.t3-ico[data-k="analysis"]', text: 'Analysis shows the best play for every hand and your chance to win. Use it to learn basic strategy.' },
      { at: '.t3-ico[data-k="trophy"]', text: 'Missions and badges: finish daily missions for free chips.' },
    ],
    baccarat: [
      { at: null, text: 'Welcome to baccarat. Bet on the hand that ends closer to 9: Player or Banker, or on a Tie.' },
      { at: '#bcBar', text: 'Pick a chip, tap Player, Banker or Tie on the table, then press Deal. The cards follow fixed rules.' },
      { at: '.t3-ico[data-k="rules"]', text: 'Rules and payouts: card values, when a third card is drawn, and what each bet pays.' },
      { at: '.t3-ico[data-k="trophy"]', text: 'Missions and badges: finish daily missions for free chips.' },
    ],
    roulette: [
      { at: null, text: 'Welcome to roulette: a single-zero wheel with 37 pockets.' },
      { at: '#rlBar', text: 'Pick a chip, tap numbers or areas on the layout, then press Spin. Rebet repeats your last bets.' },
      { at: '.t3-ico[data-k="rules"]', text: 'Payouts for every kind of bet.' },
      { at: '.t3-ico[data-k="trophy"]', text: 'Missions and badges: finish daily missions for free chips.' },
    ],
    slots: [
      { at: null, text: 'Welcome to the slot machine. Line up symbols from left to right to win; three scatters start free spins.' },
      { at: '#spinBtn', text: 'Set your bet, then press Spin (or pull the lever).' },
      { at: '#wheelOpen', text: 'The prize wheel: one free spin a day.' },
      { at: '.t3-ico[data-k="trophy"]', text: 'Missions and badges: finish daily missions for free chips.' },
    ],
    pusher: [
      { at: null, text: 'Welcome to the coin pusher. Each coin costs 5 chips; coins pushed over the middle of the front edge are yours.' },
      { at: '#pzHost', text: 'Tap the machine to aim and drop a coin. Time it through the moving gold ring for a bonus (it recharges after each one).' },
      { at: '#pzAuto', text: 'Auto drops a coin every moment for you.' },
      { at: '.t3-ico[data-k="trophy"]', text: 'Missions and badges: finish daily missions for free chips.' },
    ],
    claw: [
      { at: null, text: 'Welcome to the Lucky Claw. Each play costs 25 chips; drop a prize into the PRIZE chute at the front left to win its value.' },
      { at: '#clInsert', text: 'Press Play, then steer the claw with the joystick (or the arrow keys). The gold ring on the floor shows where it will land.' },
      { at: '#clDrop', text: 'Press Drop (or Space) to lower the claw. Grab near the middle of a prize; the claw swings, so let it settle first.' },
      { at: '#clCol', text: 'Prizes shows what each prize is worth and everything you have won.' },
    ],
  };
  const steps = STEPS[page];
  if (!steps) return;
  const KEY = 'ol-guide-' + page;
  let seen = false; try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { seen = true; }
  if (seen && !/[?&]guide=1/.test(location.search)) return;
  if (/[?&]guide=0/.test(location.search)) return;   // e.g. for screenshots

  let i = 0, box = null, ring = null;
  function visible(el) { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function show() {
    // skip steps whose control isn't on screen
    while (i < steps.length && steps[i].at && !visible(document.querySelector(steps[i].at))) i++;
    if (i >= steps.length) return done();
    const s = steps[i], el = s.at && document.querySelector(s.at);
    if (!box) {
      box = document.createElement('div'); box.className = 'g-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', T('Quick guide'));
      ring = document.createElement('div'); ring.className = 'g-ring';
      document.body.append(ring, box);
      box.addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; if (b.dataset.g === 'skip') done(); else { i++; show(); } });
      window.addEventListener('resize', place);
    }
    const last = steps.slice(i + 1).every(x => x.at && !visible(document.querySelector(x.at)));
    box.innerHTML = `<p>${T(s.text)}</p><div class="g-foot"><span class="g-dots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>
      <button type="button" class="linkbtn" data-g="skip">${T('Skip')}</button><button type="button" class="primary" data-g="next">${T(last ? 'Got it' : 'Next')}</button></div>`;
    place();
  }
  function place() {
    if (!box) return;
    const s = steps[i], el = s && s.at && document.querySelector(s.at);
    if (el && visible(el)) {
      const r = el.getBoundingClientRect(), pad = 6;
      ring.style.display = ''; Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      // the card goes on whichever side of the control has more room
      const below = r.top < innerHeight / 2;
      box.style.top = below ? Math.min(innerHeight - 180, r.bottom + 16) + 'px' : '';
      box.style.bottom = below ? '' : Math.max(16, innerHeight - r.top + 16) + 'px';
    } else { ring.style.display = 'none'; box.style.top = '30%'; box.style.bottom = ''; }
  }
  function done() { try { localStorage.setItem(KEY, '1'); } catch (e) { } if (box) { box.remove(); ring.remove(); } box = null; window.removeEventListener('resize', place); }
  // wait until the 3D table is up, then a moment more
  function start() { if (document.documentElement.classList.contains('t3d-wait')) return setTimeout(start, 400); setTimeout(show, 1400); }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
  window.OL_GUIDE = { restart() { try { localStorage.removeItem(KEY); } catch (e) { } i = 0; show(); } };
})();
