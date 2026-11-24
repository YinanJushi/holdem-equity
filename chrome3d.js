// Shared chrome for the 3D pages: the site header folded into the 3D view (games, account, sound and graphics
// quality as small icons top-left; your chips top-right), and the graphics quality setting itself.
export const ICONS = {
  rules: '<path d="M6 4h9a3 3 0 0 1 3 3v13H9a3 3 0 0 1-3-3z"/><path d="M6 17a3 3 0 0 1 3-3h9"/>',
  cards: '<rect x="4" y="6" width="10" height="14" rx="1.6" transform="rotate(-10 9 13)"/><rect x="10" y="4" width="10" height="14" rx="1.6" transform="rotate(8 15 11)"/>',
  analysis: '<path d="M4 20h16"/><path d="M7 17v-5"/><path d="M12 17V7"/><path d="M17 17v-8"/>',
  full: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  guess: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4"/><circle cx="12" cy="16.8" r=".6" fill="currentColor"/>',
  games: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  account: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  soundOn: '<path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 6.5a7.5 7.5 0 0 1 0 11"/>',
  soundOff: '<path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M17 9.5l4 5"/><path d="M21 9.5l-4 5"/>',
  quality: '<path d="M12 3l2.2 5.6L20 9.3l-4.4 3.9 1.3 5.8L12 16l-4.9 3 1.3-5.8L4 9.3l5.8-.7z"/>',
  pick: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
};

// ---------- graphics quality: high (glow, shadows, sharp) or low (for phones and older machines) ----------
const QKEY = 'ol-3d-quality';
const autoQuality = () => { try { return matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700 ? 'low' : 'high'; } catch (e) { return 'high'; } };
export function getQuality() { try { const q = localStorage.getItem(QKEY); if (q === 'high' || q === 'low') return q; } catch (e) { } return autoQuality(); }
const qListeners = [];
export function onQuality(f) { qListeners.push(f); f(getQuality()); }
export function setQuality(q) { try { localStorage.setItem(QKEY, q); } catch (e) { } qListeners.forEach(f => f(q)); }

// container: the element the icons sit in; onClass: the body class that means "the 3D view is showing"
export function headerChrome(container, onClass) {
  // the site header folds into the table: games, account and sound top-left, your chips top-right
  const topL = document.createElement('div'); topL.className = 't3-topl'; container.appendChild(topL);
  const chipBox = document.createElement('div'); chipBox.className = 't3-chips'; container.appendChild(chipBox);
  const mk = (icon, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 't3-ico'; b.setAttribute('aria-label', label); b.dataset.tip = label; b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`; b.onclick = fn; topL.appendChild(b); return b; };
  const menu = document.createElement('div'); menu.className = 't3-menu'; menu.hidden = true;
  const here = location.pathname.split('/').pop() || 'index.html';
  menu.innerHTML = [['index.html', "Texas Hold'em"], ['blackjack.html', 'Blackjack'], ['roulette.html', 'Roulette'], ['slots.html', 'Slots'], ['pusher.html', 'Coin Pusher'], ['stats.html', 'Stats']]
    .map(([h, n]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ''}>${n}</a>`).join('');
  const gamesBtn = mk('games', 'Games', () => { menu.hidden = !menu.hidden; gamesBtn.setAttribute('aria-expanded', String(!menu.hidden)); });
  topL.appendChild(menu);
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.t3-topl')) { menu.hidden = true; gamesBtn.setAttribute('aria-expanded', 'false'); } });
  const accBtn = mk('account', 'Account', () => { const a = document.getElementById('acctBtn'); if (a) a.click(); });
  const sndBtn = mk('soundOn', 'Sound', () => { const sb = document.getElementById('soundBtn'); if (sb) sb.click(); paintTop(); });
  const qBtn = mk('quality', 'Graphics', () => { setQuality(getQuality() === 'high' ? 'low' : 'high'); });
  onQuality(q => { qBtn.dataset.tip = q === 'high' ? 'Graphics: high (tap for low)' : 'Graphics: low (tap for high)'; qBtn.setAttribute('aria-label', qBtn.dataset.tip); qBtn.setAttribute('aria-pressed', String(q === 'high')); });
  function paintTop() {
    const a = document.getElementById('acctBtn'), sb = document.getElementById('soundBtn');
    if (a) { accBtn.dataset.tip = a.textContent.trim() === 'Sign in' ? 'Sign in' : 'Account · ' + a.textContent.trim(); accBtn.setAttribute('aria-label', accBtn.dataset.tip); }
    const on = window.UI ? UI.soundOn() : true;
    sndBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[on ? 'soundOn' : 'soundOff']}</svg>`;
    sndBtn.dataset.tip = on ? 'Sound on' : 'Sound off'; sndBtn.setAttribute('aria-pressed', String(on));
  }
  // the chip counter itself (with its Claim button) moves into the table while the 3D view is on, and back after
  const walletEl = document.getElementById('wallet');
  const home = walletEl ? { parent: walletEl.parentNode, next: walletEl.nextSibling } : null;
  function placeWallet() {
    if (!walletEl) return;
    const on = document.body.classList.contains(onClass);
    if (on && walletEl.parentNode !== chipBox) chipBox.appendChild(walletEl);
    if (!on && walletEl.parentNode === chipBox) home.parent.insertBefore(walletEl, home.next);
    paintTop();
  }
  new MutationObserver(placeWallet).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  setTimeout(paintTop, 1500);
  placeWallet();

}
