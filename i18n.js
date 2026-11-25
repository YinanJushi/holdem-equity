// Chinese / English. The site is written in English; with Chinese on, every piece of text that appears on the page
// (including what the games write while you play) is looked up in a dictionary and replaced. Numbers inside a
// sentence are matched as placeholders, so "Dealer shows 7" and "Dealer shows 9" share one entry ("Dealer shows {0}").
// Loaded first on every page; the Chinese dictionary (i18n-zh.js) is only fetched when it is needed.
(function () {
  const KEY = 'ol-lang';
  let lang = 'en';
  try { lang = localStorage.getItem(KEY) || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'); } catch (e) { /* default */ }
  if (lang !== 'zh') lang = 'en';
  const collect = (() => { try { return localStorage.getItem('ol-i18n-collect') === '1'; } catch (e) { return false; } })();
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  const I18N = window.I18N = { lang, dict: {}, rules: [], misses: new Set(), t, set, apply };
  if (lang === 'zh' || collect) document.write('<script src="i18n-zh.js?v=150"><\/script>');

  let saveT = 0;
  function miss(k) {
    if (I18N.misses.has(k)) return; I18N.misses.add(k);
    clearTimeout(saveT); saveT = setTimeout(() => { try { const all = new Set(JSON.parse(localStorage.getItem('ol-i18n-miss') || '[]')); I18N.misses.forEach(x => all.add(x)); localStorage.setItem('ol-i18n-miss', JSON.stringify([...all])); } catch (e) { /* ignore */ } }, 500);
  }
  // numbers and playing cards (A♠, 10♦…) become placeholders when looking a sentence up
  const NUM = /(?:10|[2-9AJQKT])[♠♥♦♣]|[-+−]?\d[\d,]*(?:\.\d+)?/g;
  const hasWords = s => /[A-Za-z]{2}/.test(s);
  // translate one string (whitespace around it is kept)
  function t(s) {
    if (lang !== 'zh' && !collect) return s;
    if (s == null) return s;
    const str = String(s), m = str.match(/^(\s*)([\s\S]*?)(\s*)$/), core = m[2].replace(/\s+/g, ' ');
    if (!core || !hasWords(core)) return str;
    const d = I18N.dict;
    let out = d[core];
    if (out == null) {
      const nums = []; const key = core.replace(NUM, x => { nums.push(x); return `{${nums.length - 1}}`; });
      const tpl = nums.length ? d[key] : null;
      if (tpl != null) out = tpl.replace(/\{(\d+)\}/g, (_, i) => nums[+i] != null ? nums[+i] : '');
      else {
        // a few sentences are built from parts: try the pattern rules
        for (const [re, f] of I18N.rules) { const mm = core.match(re); if (!mm) continue; const r = typeof f === 'function' ? f(...mm) : core.replace(re, f); if (r != null && r !== core) { out = r; break; } }
        if (out == null) { if (collect) miss(nums.length ? key : core); return str; }
      }
    }
    return lang === 'zh' ? m[1] + out + m[3] : str;
  }
  // ---------- the page ----------
  const ATTRS = ['aria-label', 'title', 'placeholder', 'data-tip', 'alt'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'svg', 'SVG']);
  const done = new WeakMap();   // text node -> the text we put there (so we don't translate our own output again)
  function skip(el) { for (let e = el; e && e.nodeType === 1; e = e.parentNode) { if (SKIP.has(e.nodeName) || e.translate === false || e.hasAttribute('data-no-i18n')) return true; } return false; }
  function doText(n) {
    const v = n.nodeValue; if (!v || done.get(n) === v || !hasWords(v)) return;
    if (skip(n.parentNode)) return;
    const o = t(v); done.set(n, o); if (o !== v) n.nodeValue = o;
  }
  function doAttrs(el) {
    if (skip(el)) return;
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v && hasWords(v)) { const o = t(v); if (o !== v) el.setAttribute(a, o); } }
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) { const o = t(el.value); if (o !== el.value) el.value = o; }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (SKIP.has(root.nodeName)) return; doAttrs(root); }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function apply() {
    if (lang !== 'zh' && !collect) return;
    document.title = t(document.title);
    walk(document.body);
    const mo = new MutationObserver(list => {
      for (const r of list) {
        if (r.type === 'characterData') doText(r.target);
        else if (r.type === 'attributes') { if (ATTRS.includes(r.attributeName)) doAttrs(r.target); }
        else r.addedNodes.forEach(walk);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function set(l) { try { localStorage.setItem(KEY, l); } catch (e) { /* ignore */ } location.reload(); }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', apply) : apply();

  // ---------- the switch in the page header ----------
  function headerSwitch() {
    const right = document.querySelector('.top .top-right'); if (!right || document.getElementById('langBtn')) return;
    const b = document.createElement('button'); b.id = 'langBtn'; b.type = 'button'; b.className = 'iconbtn'; b.translate = false;
    b.textContent = lang === 'zh' ? 'EN' : '中文'; b.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
    b.onclick = () => set(lang === 'zh' ? 'en' : 'zh');
    right.insertBefore(b, right.firstChild);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', headerSwitch) : headerSwitch();
})();
