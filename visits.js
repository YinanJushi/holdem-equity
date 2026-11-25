// Visitor counter: records this page view (once per 30 minutes per page) and fetches the site totals.
// Each browser gets a random anonymous id; nothing personal is sent. Uses the Supabase project in config.js
// (functions log_visit / site_stats in supabase/visits.sql). If they aren't set up, nothing is shown.
(function () {
  const cfg = window.OL_CONFIG || {};
  const V = window.OL_VISITS = { stats: null };
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.fetch) return;
  let id = null;
  try { id = localStorage.getItem('ol-visitor'); if (!id) { id = crypto.randomUUID(); localStorage.setItem('ol-visitor', id); } } catch (e) { id = null; }
  const page = ((location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'index';
  const fn = id ? 'log_visit' : 'site_stats', body = id ? { p_page: page, p_visitor: id } : {};
  fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => (r.ok ? r.json() : null)).then(s => {
      if (!s || typeof s.visitors !== 'number') return;
      V.stats = s; window.dispatchEvent(new CustomEvent('ol-visits', { detail: s }));
      paint();
    }).catch(() => { /* offline or not set up */ });
  // a small line in the page footer (shown on pages whose footer is visible), and any element marked data-visits
  V.paint = paint;
  // The numbers are only shown to the site owner: entering the owner code (the coin pusher / claw machine code,
  // or a long-press / double-click on the stats page title) marks this browser, and only then is the count drawn.
  // Visits are still recorded for everyone.
  const isOwner = () => { try { return localStorage.getItem('ol-owner') === '1'; } catch (e) { return false; } };
  V.setOwner = () => { try { localStorage.setItem('ol-owner', '1'); } catch (e) { /* ignore */ } paint(); };
  V.isOwner = isOwner;
  function paint() {
    const s = V.stats; if (!s || !isOwner()) return;
    const zh = window.I18N && I18N.lang === 'zh', n = x => x.toLocaleString(zh ? 'zh-CN' : 'en-US');
    const text = zh ? `👀 已有 ${n(s.visitors)} 位玩家来过 · 今天 ${n(s.today)} 位 · 共 ${n(s.views)} 次浏览` : `👀 ${n(s.visitors)} players have visited · ${n(s.today)} today · ${n(s.views)} views`;
    document.querySelectorAll('[data-visits]').forEach(el => { el.textContent = text; el.hidden = false; });
    const foot = document.querySelector('.foot');
    if (foot && !foot.querySelector('.visits')) { const sp = document.createElement('span'); sp.className = 'visits'; sp.translate = false; sp.textContent = ' · ' + text; foot.appendChild(sp); }
  }
  // the stats page: long-press or double-click the title to enter the owner code
  const sha256 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(x => x.toString(16).padStart(2, '0')).join('');
  let tries = 0, lockUntil = 0;
  function codeBox() {
    if (isOwner()) return;
    const tr = x => (window.I18N ? I18N.t(x) : x), hash = (cfg.pusherCodeHash || '').trim().toLowerCase();
    let d = document.getElementById('olOwner'); if (!d) { d = document.createElement('dialog'); d.id = 'olOwner'; d.className = 'rules'; document.body.appendChild(d); }
    d.innerHTML = `<h2>${tr('Enter code')}</h2><form method="dialog" class="pz-codeform"><input type="password" autocomplete="off" aria-label="${tr('Code')}"><p class="sub" role="status"></p><div class="rule-actions"><button type="button" class="ghostbtn" data-close>${tr('Cancel')}</button><button type="submit" class="primary">${tr('OK')}</button></div></form>`;
    const input = d.querySelector('input'), msg = d.querySelector('[role=status]');
    d.querySelector('[data-close]').onclick = () => d.close();
    d.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      if (!hash) { msg.textContent = tr('No code has been set up for this machine yet.'); return; }
      if (Date.now() < lockUntil) { msg.textContent = tr('Too many tries. Wait a minute.'); return; }
      if ((await sha256(input.value.trim())) !== hash) { if (++tries >= 5) { tries = 0; lockUntil = Date.now() + 60000; } msg.textContent = tr('That code is not right.'); input.select(); return; }
      d.close(); V.setOwner();
    };
    d.showModal(); setTimeout(() => input.focus(), 50);
  }
  function hookTitle() {
    const h = document.querySelector('.st-intro h1'); if (!h) return;
    let t = 0;
    h.addEventListener('dblclick', codeBox);
    h.addEventListener('pointerdown', () => { clearTimeout(t); t = setTimeout(codeBox, 900); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => h.addEventListener(ev, () => clearTimeout(t)));
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', hookTitle) : hookTitle();
})();
