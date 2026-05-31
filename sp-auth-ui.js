// ============================================================
// SHADOW PHASE 影变 — auth UI: header account control + modal
// Reactive: re-renders on SP auth-state changes (works for both backends).
// ============================================================
(function () {
  var SP = window.SP;
  if (!SP) return;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function renderAcct() {
    var wrap = document.getElementById('spAcct');
    if (!wrap) return;
    var s = SP.session();
    if (!s) {
      wrap.innerHTML = '<button class="sp-login-btn" type="button">เข้าสู่ระบบ</button>';
      wrap.querySelector('button').onclick = function () { SP.openAuth(); };
      return;
    }
    var admin = s.role === 'admin';
    wrap.innerHTML =
      '<div class="sp-chip" role="button" tabindex="0" aria-haspopup="true">' +
        '<span class="sp-ava">' + esc((s.name || s.email).slice(0, 1)) + '</span>' +
        '<span class="sp-chip-name">' + esc(s.name || s.email) + '</span>' +
        (admin ? '<span class="sp-role">แอดมิน</span>' : '') +
      '</div>' +
      '<div class="sp-menu">' +
        (admin ? '<a href="admin.html">แผงควบคุมแอดมิน</a><div class="sp-divider"></div>' : '') +
        '<button type="button" class="sp-logout">ออกจากระบบ</button>' +
      '</div>';
    var chip = wrap.querySelector('.sp-chip'), menu = wrap.querySelector('.sp-menu');
    chip.onclick = function (e) { e.stopPropagation(); menu.classList.toggle('open'); };
    chip.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); menu.classList.toggle('open'); } };
    document.addEventListener('click', function () { menu.classList.remove('open'); });
    wrap.querySelector('.sp-logout').onclick = function () { SP.logout().then(function () { /* onAuth re-renders */ }); };
  }

  function inject() {
    var bar = document.querySelector('.site-head .wrap');
    if (bar && !document.getElementById('spAcct')) {
      var slot = document.createElement('div');
      slot.id = 'spAcct'; slot.className = 'sp-acct';
      var themeBtn = bar.querySelector('.theme-btn');
      bar.insertBefore(slot, themeBtn || null);
    }
    if (!document.getElementById('spOverlay')) {
      var ov = document.createElement('div');
      ov.id = 'spOverlay'; ov.className = 'sp-overlay';
      ov.innerHTML =
        '<div class="sp-modal" role="dialog" aria-modal="true">' +
          '<button class="sp-x" type="button" aria-label="ปิด">&times;</button>' +
          '<div class="sp-modal-head">' +
            '<img class="seal-img" src="assets/seal-sp.png" alt="">' +
            '<h2 id="spAuthTitle">เข้าสู่ระบบ</h2>' +
            '<span class="cn">影变</span>' +
          '</div>' +
          '<div class="sp-tabs">' +
            '<button class="sp-tab active" data-tab="login" type="button">เข้าสู่ระบบ</button>' +
            '<button class="sp-tab" data-tab="register" type="button">สมัครสมาชิก</button>' +
          '</div>' +
          '<form class="sp-form" id="spLoginForm">' +
            '<div class="sp-field"><label>อีเมล</label><input class="sp-input" name="email" type="email" autocomplete="username" required></div>' +
            '<div class="sp-field"><label>รหัสผ่าน</label><input class="sp-input" name="p" type="password" autocomplete="current-password" required></div>' +
            '<div class="sp-msg" id="spLoginMsg"></div>' +
            '<button class="btn btn-primary sp-btn-full" type="submit">เข้าสู่ระบบ</button>' +
            '<p class="sp-hint" id="spDemoHint"></p>' +
          '</form>' +
          '<form class="sp-form" id="spRegForm" style="display:none">' +
            '<div class="sp-field"><label>ชื่อที่แสดง</label><input class="sp-input" name="name" autocomplete="name" placeholder="เช่น ผู้อ่านนิรนาม"></div>' +
            '<div class="sp-field"><label>อีเมล</label><input class="sp-input" name="email" type="email" autocomplete="username" required></div>' +
            '<div class="sp-field"><label>รหัสผ่าน</label><input class="sp-input" name="p" type="password" autocomplete="new-password" required></div>' +
            '<div class="sp-msg" id="spRegMsg"></div>' +
            '<button class="btn btn-primary sp-btn-full" type="submit">สมัครสมาชิก</button>' +
            '<p class="sp-hint">สมัครเป็นสมาชิกเพื่อร่วมแสดงความคิดเห็นใต้บทความ</p>' +
          '</form>' +
        '</div>';
      document.body.appendChild(ov);
      // demo hint only in local mode
      var hint = ov.querySelector('#spDemoHint');
      if (SP.mode === 'local') hint.innerHTML = 'โหมดสาธิต — บัญชีแอดมิน <code>admin@shadowphase.local</code> / <code>admin1234</code>';
      else hint.style.display = 'none';
      wireModal(ov);
    }
    renderAcct();
  }

  function wireModal(ov) {
    var close = function () { ov.classList.remove('open'); };
    ov.querySelector('.sp-x').onclick = close;
    ov.onclick = function (e) { if (e.target === ov) close(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    var loginForm = ov.querySelector('#spLoginForm'), regForm = ov.querySelector('#spRegForm');
    var title = ov.querySelector('#spAuthTitle');
    ov.querySelectorAll('.sp-tab').forEach(function (t) {
      t.onclick = function () {
        ov.querySelectorAll('.sp-tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        var login = t.dataset.tab === 'login';
        loginForm.style.display = login ? 'flex' : 'none';
        regForm.style.display = login ? 'none' : 'flex';
        title.textContent = login ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก';
      };
    });

    function busy(form, on) {
      var b = form.querySelector('button[type=submit]');
      b.disabled = on; b.style.opacity = on ? '.6' : '';
      b.textContent = on ? 'กำลังดำเนินการ…' : (form === loginForm ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก');
    }

    loginForm.onsubmit = function (e) {
      e.preventDefault();
      ov.querySelector('#spLoginMsg').textContent = ''; busy(loginForm, true);
      Promise.resolve(SP.login(loginForm.email.value, loginForm.p.value)).then(function (r) {
        busy(loginForm, false);
        if (r.ok) { close(); } else { ov.querySelector('#spLoginMsg').textContent = r.msg; }
      });
    };
    regForm.onsubmit = function (e) {
      e.preventDefault();
      ov.querySelector('#spRegMsg').textContent = ''; busy(regForm, true);
      Promise.resolve(SP.register(regForm.email.value, regForm.p.value, regForm.name.value)).then(function (r) {
        busy(regForm, false);
        if (r.ok) { close(); } else { ov.querySelector('#spRegMsg').textContent = r.msg; }
      });
    };
  }

  SP.openAuth = function (tab) {
    var ov = document.getElementById('spOverlay'); if (!ov) return;
    var t = ov.querySelector('.sp-tab[data-tab="' + (tab || 'login') + '"]');
    if (t) t.click();
    ov.querySelectorAll('.sp-msg').forEach(function (m) { m.textContent = ''; });
    ov.classList.add('open');
    var first = ov.querySelector((tab === 'register' ? '#spRegForm' : '#spLoginForm') + ' input');
    if (first) setTimeout(function () { first.focus(); }, 60);
  };
  SP.renderAcct = renderAcct;

  function start() { inject(); SP.onAuth(function () { renderAcct(); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
