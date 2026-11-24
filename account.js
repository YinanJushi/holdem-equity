// Accounts (Supabase email sign-in links) and the cloud chip wallet.
// Without a configured project the site stays in guest mode and this file does nothing.
(function () {
  const cfg = window.OL_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.UI) return;
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const ref = new URL(cfg.supabaseUrl).hostname.split('.')[0];
  const TOKEN_KEY = `sb-${ref}-auth-token`;
  const CACHE = uid => 'ol-cloud-' + uid;
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } };
  const errText = e => {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/not enough chips/.test(m)) return 'Not enough chips in your account.';
    if (/already claimed/.test(m)) return "You've already claimed today's chips.";
    if (/Failed to fetch|NetworkError/i.test(m)) return 'No connection. Your chips will sync when you are back online.';
    return m;
  };

  // ---------- Supabase client, loaded on demand ----------
  let clientP = null;
  function client() {
    if (!clientP) clientP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = LIB; s.async = true;
      s.onload = () => res(window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } }));
      s.onerror = () => rej(new Error('Could not load the sign-in library.'));
      document.head.appendChild(s);
    });
    return clientP;
  }
  const rpc = (name, args) => client().then(c => c.rpc(name, args || {})).then(({ data, error }) => { if (error) throw error; return data; });

  // ---------- cloud wallet backend ----------
  function makeCloud(uid) {
    const cache = UI.store.load(CACHE(uid), { chips: 0, canClaim: false, nextAt: 0 }) || { chips: 0, canClaim: false, nextAt: 0 };
    let server = cache.chips, pending = 0, canClaim = cache.canClaim, nextAt = cache.nextAt;
    let queue = Promise.resolve(), readyRes;
    const ready = new Promise(r => (readyRes = r));
    const b = {
      mode: 'cloud', loading: true,
      chips: () => Math.max(0, Math.round((server + pending) * 10) / 10),
      set(v) { this.add(v - this.chips()); },
      add(n) {
        n = Math.round(n * 10) / 10;
        if (!n) return;
        pending += n; UI.wallet.render();
        queue = queue.then(() => ready).then(() => rpc('apply_delta', { p_delta: n }))
          .then(st => { pending -= n; apply(st); })
          .catch(e => { pending -= n; UI.toast(errText(e)); resync(); });
      },
      canClaim: () => canClaim && !b.loading,
      claim() {
        if (!this.canClaim()) return false;
        canClaim = false; UI.wallet.render();
        rpc('claim_daily').then(st => { apply(st); UI.sfx('win'); UI.toast(`+${UI.wallet.DAILY.toLocaleString('en-US')} chips added to your account.`); })
          .catch(e => { UI.toast(errText(e)); resync(); });
        return true;
      },
      nextClaimIn: () => Math.max(0, (nextAt || 0) - Date.now()),
    };
    function apply(st) {
      if (!st) return;
      server = Number(st.chips); canClaim = !!st.can_claim; nextAt = Date.parse(st.next_claim_at) || 0; b.loading = false;
      UI.store.save(CACHE(uid), { chips: server, canClaim, nextAt });
      UI.wallet.render();
    }
    function resync() { return rpc('get_wallet', { p_tz: tz() }).then(apply).catch(() => {}); }
    b.start = () => rpc('get_wallet', { p_tz: tz() }).then(st => { apply(st); readyRes(); })
      .catch(e => { b.loading = false; UI.wallet.render(); UI.toast('Could not load your chips: ' + errText(e)); readyRes(); });
    b.redeem = code => ready.then(() => rpc('redeem_code', { p_code: code })).then(r => { if (r && r.wallet) apply(r.wallet); return r; });
    return b;
  }

  // ---------- cloud stats: kept with the account, cached on this device for instant reading ----------
  function makeCloudStats(uid) {
    const KEY = 'ol-cloud-stats-' + uid, MAX = 1000;
    let data = UI.store.load(KEY, {}) || {}, pending = [], cleared = new Set(), q = Promise.resolve(), readyRes;
    const ready = new Promise(r => (readyRes = r));
    const save = () => UI.store.save(KEY, data);
    const trim = a => { while (a.length > MAX) a.shift(); return a; };
    let warned = false;
    const send = (fn, args) => { q = q.then(() => ready).then(() => rpc(fn, args)).catch(e => { if (!warned) { warned = true; UI.toast('Could not save stats to your account: ' + errText(e)); } }); };
    const s = {
      loading: true,
      get: g => (data[g] || []).slice(),
      add(g, rec) {
        data[g] = trim((data[g] || []).concat([rec])); save();
        if (s.loading) pending.push([g, rec]);
        send('add_stat', { p_game: g, p_rec: rec });
      },
      clear(g) {
        const games = g ? [g] : UI.stats.GAMES;
        games.forEach(x => { delete data[x]; cleared.add(x); UI.stats.localClear(x); });
        pending = pending.filter(p => !games.includes(p[0]));
        save(); UI.stats.changed();
        send('clear_stats', { p_game: g || null });
      },
      start() {
        return rpc('get_stats').then(async srv => {
          srv = srv || {};
          // stats played as a guest on this device move into the account (only for games the account has none of)
          for (const g of UI.stats.GAMES) {
            const local = UI.stats.localGet(g);
            if (local.length && !(srv[g] || []).length && !cleared.has(g)) {
              try { await rpc('import_stats', { p_game: g, p_recs: local.slice(-MAX) }); srv[g] = local.slice(-MAX); UI.stats.localClear(g); } catch (e) { }
            }
          }
          const next = {};
          UI.stats.GAMES.forEach(g => {
            const mine = pending.filter(p => p[0] === g).map(p => p[1]);
            next[g] = trim((cleared.has(g) ? [] : (srv[g] || [])).concat(mine));
          });
          data = next; pending = []; s.loading = false; save(); readyRes(); UI.stats.changed();
        }).catch(e => { s.loading = false; readyRes(); UI.stats.changed(); UI.toast('Could not load your stats: ' + errText(e)); });
      },
    };
    return s;
  }

  // arriving from a password-reset email: ask for a new password once signed in
  try { if (/type=recovery/.test(location.hash)) sessionStorage.setItem('ol-set-pw', '1'); } catch (e) { }
  // a stored session means we start on the cloud wallet right away, before the library loads
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch (e) { }
  const storedUser = stored && (stored.user || (stored.currentSession && stored.currentSession.user));
  let user = storedUser || null, cloud = null;
  let cloudStats = null;
  if (user && user.id) { cloud = makeCloud(user.id); UI.wallet.useBackend(cloud); cloudStats = makeCloudStats(user.id); UI.stats.useBackend(cloudStats); }

  client().then(c => {
    c.auth.onAuthStateChange((event, session) => {
      const uid = session && session.user && session.user.id;
      // arriving from the email link, or signing in on this page: restart on the cloud wallet
      if (event === 'PASSWORD_RECOVERY') { try { sessionStorage.setItem('ol-set-pw', '1'); } catch (e) { } }
      if (event === 'SIGNED_IN' && uid && (!cloud || !user || uid !== user.id)) { location.replace(location.pathname); }
      if (event === 'SIGNED_OUT' && cloud) location.replace(location.pathname);
    });
    return c.auth.getSession().then(({ data }) => {
      const s = data && data.session;
      if (s) {
        user = s.user;
        if (!cloud) { cloud = makeCloud(user.id); UI.wallet.useBackend(cloud); }
        if (!cloudStats) { cloudStats = makeCloudStats(user.id); UI.stats.useBackend(cloudStats); }
        cloud.start(); cloudStats.start();
      } else if (cloud) { cloud = null; user = null; cloudStats = null; UI.wallet.useLocal(); UI.stats.useBackend(null); }
      paintButton();
      let reset = false;
      try { reset = sessionStorage.getItem('ol-set-pw') === '1'; } catch (e) { }
      if (s && reset) { const dlg = dialog(); signedIn(dlg, 'Choose a new password below.'); dlg.showModal(); }
    });
  }).catch(e => UI.toast(errText(e)));

  // ---------- header button and account dialog ----------
  const btn = document.createElement('button');
  btn.id = 'acctBtn'; btn.className = 'iconbtn acct';
  const right = document.querySelector('.top-right');
  if (right) right.insertBefore(btn, document.getElementById('wallet'));
  function paintButton() {
    btn.textContent = user ? (user.email || 'Account').split('@')[0] : 'Sign in';
    btn.title = user ? `Signed in as ${user.email}` : 'Sign in to keep your chips on every device';
  }
  paintButton();
  btn.onclick = openDialog;

  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const pwErr = e => {
    const m = (e && e.message) || '';
    if (/invalid login credentials/i.test(m)) return "Wrong email or password. If you've only used email links so far, sign in with a link once, then set a password in your account.";
    if (/email not confirmed/i.test(m)) return 'Please confirm your email first: open the confirmation email (on any device), then sign in here.';
    if (/already registered|already exists/i.test(m)) return 'That email already has an account. Sign in instead, or use "Forgot password".';
    if (/password should be|at least/i.test(m)) return 'Use a password of at least 8 characters.';
    if (/rate limit|too many/i.test(m)) return 'Too many emails sent recently. Please wait a while and try again.';
    return errText(e);
  };
  const back = location.origin + location.pathname;

  function dialog() {
    let dlg = document.getElementById('acctDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'acctDlg'; dlg.className = 'rules acct-dlg'; document.body.appendChild(dlg); }
    dlg.onclick = e => {
      const m = e.target.closest('[data-mode]');
      if (m) { signedOut(dlg, m.dataset.mode); return; }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'close') dlg.close();
      if (a.dataset.act === 'signout') client().then(c => c.auth.signOut()).then(() => location.replace(location.pathname));
    };
    return dlg;
  }
  function openDialog() {
    const dlg = dialog();
    if (!user) signedOut(dlg, 'password'); else signedIn(dlg);
    if (!dlg.open) dlg.showModal();
  }

  // signed out: password (default), create account, email link, forgot password
  function signedOut(dlg, mode) {
    const tabs = `<div class="seg acct-tabs"><button type="button" data-mode="password" class="${mode === 'password' || mode === 'signup' ? 'on' : ''}">Password</button><button type="button" data-mode="link" class="${mode === 'link' ? 'on' : ''}">Email link</button></div>`;
    const foot = '<p class="sub">Chips you have as a guest stay on this device and are kept separate from your account.</p>';
    if (mode === 'password' || mode === 'signup') {
      const up = mode === 'signup';
      dlg.innerHTML = `<h2>${up ? 'Create an account' : 'Sign in'}</h2>${tabs}
        <form id="pwForm">
          <label class="fld">Email<input type="email" id="pwEmail" required autocomplete="email" placeholder="you@example.com"></label>
          <label class="fld">Password<input type="password" id="pwPass" required minlength="8" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${up ? 'At least 8 characters' : 'Your password'}"></label>
          <div class="acct-msg" id="pwMsg" role="status"></div>
          <div class="rule-actions acct-row">
            ${up ? '<button type="button" class="linkbtn" data-mode="password">I already have an account</button>' : '<button type="button" class="linkbtn" data-mode="reset">Forgot password?</button><button type="button" class="linkbtn" data-mode="signup">Create an account</button>'}
            <button type="submit" class="primary">${up ? 'Create account' : 'Sign in'}</button>
          </div>
        </form>${foot}`;
      dlg.querySelector('#pwForm').onsubmit = e => {
        e.preventDefault();
        const email = dlg.querySelector('#pwEmail').value.trim(), password = dlg.querySelector('#pwPass').value, msg = dlg.querySelector('#pwMsg');
        if (password.length < 8) { msg.textContent = 'Use a password of at least 8 characters.'; return; }
        msg.textContent = up ? 'Creating your account…' : 'Signing in…';
        client().then(c => up ? c.auth.signUp({ email, password, options: { emailRedirectTo: back } }) : c.auth.signInWithPassword({ email, password }))
          .then(({ data, error }) => {
            if (error) { msg.textContent = pwErr(error); return; }
            if (up && !(data && data.session)) msg.textContent = `Almost done: we sent a confirmation email to ${email}. Click the link in it on any device, then come back here and sign in with your password.`;
            else msg.textContent = 'Signed in!';
          }).catch(err => (msg.textContent = pwErr(err)));
      };
    } else if (mode === 'link') {
      dlg.innerHTML = `<h2>Sign in with an email link</h2>${tabs}
        <p>We'll email you a link. Open it on the device you want to sign in on.</p>
        <form id="linkForm">
          <label class="fld">Email<input type="email" id="linkEmail" required autocomplete="email" placeholder="you@example.com"></label>
          <div class="acct-msg" id="linkMsg" role="status"></div>
          <div class="rule-actions"><button type="button" class="ghostbtn" data-act="close">Not now</button><button type="submit" class="primary">Email me a link</button></div>
        </form>${foot}`;
      dlg.querySelector('#linkForm').onsubmit = e => {
        e.preventDefault();
        const email = dlg.querySelector('#linkEmail').value.trim(), msg = dlg.querySelector('#linkMsg');
        msg.textContent = 'Sending…';
        client().then(c => c.auth.signInWithOtp({ email, options: { emailRedirectTo: back } }))
          .then(({ error }) => { msg.textContent = error ? pwErr(error) : `Sent to ${email}. Open the email on this device and click the link.`; })
          .catch(err => (msg.textContent = pwErr(err)));
      };
    } else if (mode === 'reset') {
      dlg.innerHTML = `<h2>Reset your password</h2>
        <p>We'll email you a link. Open it on the device you want to use, and you'll be asked for a new password.</p>
        <form id="resetForm">
          <label class="fld">Email<input type="email" id="resetEmail" required autocomplete="email" placeholder="you@example.com"></label>
          <div class="acct-msg" id="resetMsg" role="status"></div>
          <div class="rule-actions"><button type="button" class="ghostbtn" data-mode="password">Back</button><button type="submit" class="primary">Email me a reset link</button></div>
        </form>`;
      dlg.querySelector('#resetForm').onsubmit = e => {
        e.preventDefault();
        const email = dlg.querySelector('#resetEmail').value.trim(), msg = dlg.querySelector('#resetMsg');
        msg.textContent = 'Sending…';
        client().then(c => c.auth.resetPasswordForEmail(email, { redirectTo: back }))
          .then(({ error }) => { msg.textContent = error ? pwErr(error) : `If ${email} has an account, a reset link is on its way.`; })
          .catch(err => (msg.textContent = pwErr(err)));
      };
    }
    const first = dlg.querySelector('input'); if (first) setTimeout(() => first.focus(), 30);
  }

  // signed in: secret code, password, sign out
  function signedIn(dlg, note) {
    dlg.innerHTML = `<h2>Your account</h2>
      ${note ? `<p class="acct-note">${note}</p>` : ''}
      <p>Signed in as <b>${esc(user.email || '')}</b>. Your chips and stats sync across every device you sign in on.</p>
      <form id="codeForm" class="code-form">
        <label class="fld">Secret code<input type="text" id="codeInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Enter a code"></label>
        <button type="submit" class="primary">Redeem</button>
      </form>
      <div class="acct-msg" id="codeMsg" role="status"></div>
      <form id="setPwForm" class="code-form">
        <input type="email" autocomplete="username" value="${esc(user.email || '')}" hidden>
        <label class="fld">${note ? 'New password' : 'Password (to sign in on other devices)'}<input type="password" id="newPw" minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>
        <button type="submit" class="primary">Set password</button>
      </form>
      <div class="acct-msg" id="pwSetMsg" role="status"></div>
      <div class="rule-actions"><button type="button" class="ghostbtn" data-act="signout">Sign out</button><button type="button" class="primary" data-act="close">Done</button></div>`;
    dlg.querySelector('#codeForm').onsubmit = e => {
      e.preventDefault();
      const code = dlg.querySelector('#codeInput').value.trim(), msg = dlg.querySelector('#codeMsg');
      if (!code || !cloud) return;
      msg.textContent = 'Checking…';
      cloud.redeem(code).then(r => {
        if (r && r.ok) { msg.textContent = `Code accepted: +${Number(r.amount).toLocaleString('en-US')} chips.`; UI.sfx('win'); dlg.querySelector('#codeInput').value = ''; }
        else msg.textContent = (r && r.error) || "That code isn't valid.";
      }).catch(err => (msg.textContent = errText(err)));
    };
    dlg.querySelector('#setPwForm').onsubmit = e => {
      e.preventDefault();
      const password = dlg.querySelector('#newPw').value, msg = dlg.querySelector('#pwSetMsg');
      if (password.length < 8) { msg.textContent = 'Use a password of at least 8 characters.'; return; }
      msg.textContent = 'Saving…';
      client().then(c => c.auth.updateUser({ password }))
        .then(({ error }) => {
          if (error) { msg.textContent = pwErr(error); return; }
          msg.textContent = 'Password saved. On any other device, choose Sign in → Password and use your email and this password.';
          dlg.querySelector('#newPw').value = '';
          try { sessionStorage.removeItem('ol-set-pw'); } catch (er) { }
        }).catch(err => (msg.textContent = pwErr(err)));
    };
  }
})();
