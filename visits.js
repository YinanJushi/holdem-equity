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
  function paint() {
    const s = V.stats; if (!s) return;
    const zh = window.I18N && I18N.lang === 'zh', n = x => x.toLocaleString(zh ? 'zh-CN' : 'en-US');
    const text = zh ? `👀 已有 ${n(s.visitors)} 位玩家来过 · 今天 ${n(s.today)} 位` : `👀 ${n(s.visitors)} players have visited · ${n(s.today)} today`;
    document.querySelectorAll('[data-visits]').forEach(el => { el.textContent = text; el.hidden = false; });
    const foot = document.querySelector('.foot');
    if (foot && !foot.querySelector('.visits')) { const sp = document.createElement('span'); sp.className = 'visits'; sp.translate = false; sp.textContent = ' · ' + text; foot.appendChild(sp); }
  }
})();
