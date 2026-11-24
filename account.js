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

  // a stored session means we start on the cloud wallet right away, before the library loads
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch (e) { }
  const storedUser = stored && (stored.user || (stored.currentSession && stored.currentSession.user));
  let user = storedUser || null, cloud = null;
  if (user && user.id) { cloud = makeCloud(user.id); UI.wallet.useBackend(cloud); }

  client().then(c => {
    c.auth.onAuthStateChange((event, session) => {
      const uid = session && session.user && session.user.id;
      // arriving from the email link, or signing in on this page: restart on the cloud wallet
      if (event === 'SIGNED_IN' && uid && (!cloud || !user || uid !== user.id)) { location.replace(location.pathname); }
      if (event === 'SIGNED_OUT' && cloud) location.replace(location.pathname);
    });
    return c.auth.getSession().then(({ data }) => {
      const s = data && data.session;
      if (s) {
        user = s.user;
        if (!cloud) { cloud = makeCloud(user.id); UI.wallet.useBackend(cloud); }
        cloud.start();
      } else if (cloud) { cloud = null; user = null; UI.wallet.useLocal(); }
      paintButton();
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

  function openDialog() {
    let dlg = document.getElementById('acctDlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'acctDlg'; dlg.className = 'rules acct-dlg'; document.body.appendChild(dlg); }
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    if (!user) {
      dlg.innerHTML = `<h2>Sign in</h2>
        <p>Sign in with your email to keep your chips on every device. We'll email you a link and a code; no password needed.</p>
        <form id="signinForm">
          <label class="fld">Email<input type="email" id="signinEmail" required autocomplete="email" placeholder="you@example.com"></label>
          <div class="acct-msg" id="signinMsg" role="status"></div>
          <div class="rule-actions"><button type="button" class="ghostbtn" data-act="close">Not now</button><button type="submit" class="primary">Email me a sign-in link</button></div>
        </form>
        <form id="codeSignin" hidden>
          <label class="fld">Code from the email<input type="text" id="otpInput" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456"></label>
          <div class="acct-msg" id="otpMsg" role="status"></div>
          <div class="rule-actions"><button type="submit" class="primary">Sign in with code</button></div>
        </form>
        <p class="sub">Chips you have as a guest stay on this device and are kept separate from your account.</p>`;
      dlg.querySelector('#signinForm').onsubmit = e => {
        e.preventDefault();
        const email = dlg.querySelector('#signinEmail').value.trim(), msg = dlg.querySelector('#signinMsg');
        msg.textContent = 'Sending…';
        client().then(c => c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }))
          .then(({ error }) => {
            if (error) { msg.textContent = errText(error); return; }
            msg.textContent = `Sent to ${email}. Open the link on this device, or type the code from the email below (handy if the email is on your phone).`;
            const f = dlg.querySelector('#codeSignin');
            f.hidden = false; dlg.querySelector('#otpInput').focus();
            f.onsubmit = ev => {
              ev.preventDefault();
              const token = dlg.querySelector('#otpInput').value.replace(/\s/g, ''), om = dlg.querySelector('#otpMsg');
              if (!token) return;
              om.textContent = 'Checking…';
              client().then(c => c.auth.verifyOtp({ email, token, type: 'email' }))
                .then(({ error: err }) => { om.textContent = err ? (/expired|invalid/i.test(err.message) ? "That code didn't work or has expired. Send a new email and try again." : errText(err)) : 'Signed in!'; })
                .catch(err2 => (om.textContent = errText(err2)));
            };
          })
          .catch(err => (msg.textContent = errText(err)));
      };
    } else {
      dlg.innerHTML = `<h2>Your account</h2>
        <p>Signed in as <b>${esc(user.email || '')}</b>. Your chips sync across every device you sign in on.</p>
        <form id="codeForm" class="code-form">
          <label class="fld">Secret code<input type="text" id="codeInput" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Enter a code"></label>
          <button type="submit" class="primary">Redeem</button>
        </form>
        <div class="acct-msg" id="codeMsg" role="status"></div>
        <div class="rule-actions"><button type="button" class="ghostbtn" data-act="signout">Sign out</button><button type="button" class="primary" data-act="close">Done</button></div>`;
      dlg.querySelector('#codeForm').onsubmit = e => {
        e.preventDefault();
        const code = dlg.querySelector('#codeInput').value.trim(), msg = dlg.querySelector('#codeMsg');
        if (!code) return;
        msg.textContent = 'Checking…';
        cloud.redeem(code).then(r => {
          if (r && r.ok) { msg.textContent = `Code accepted: +${Number(r.amount).toLocaleString('en-US')} chips.`; UI.sfx('win'); dlg.querySelector('#codeInput').value = ''; }
          else msg.textContent = (r && r.error) || 'That code isn\'t valid.';
        }).catch(err => (msg.textContent = errText(err)));
      };
    }
    dlg.onclick = e => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'close') dlg.close();
      if (a.dataset.act === 'signout') client().then(c => c.auth.signOut()).then(() => location.replace(location.pathname));
    };
    dlg.showModal();
  }
})();
