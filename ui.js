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

  window.UI = { store, initTabs, showTab, rulesDialog };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTabs); else initTabs();
})();
