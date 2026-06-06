// ============================================================
// SHADOW PHASE 影变 — unified data layer
// Uses Firebase (Auth + Firestore) when firebase-config.js is filled in,
// otherwise falls back to a localStorage demo so previews work offline.
// Public API is identical in both modes and returns Promises.
// ============================================================
(function () {
  var SP = window.SP = window.SP || {};
  var CFG = window.SP_FIREBASE_CONFIG || {};
  var fbReady = (typeof firebase !== 'undefined') && CFG.apiKey && CFG.apiKey.indexOf('PASTE') === -1;
  SP.mode = fbReady ? 'firebase' : 'local';

  // ---- shared auth state (cached, sync-readable) ----
  var _session = null;        // { uid, name, email, role }
  var _authCbs = [];
  var _authResolved = false;
  SP.session  = function () { return _session; };
  SP.isAdmin  = function () { return !!(_session && _session.role === 'admin'); };
  SP.isMember = function () { return !!_session; };
  SP.onAuth   = function (cb) { _authCbs.push(cb); if (_authResolved) cb(_session); };
  function setSession(s) { _session = s; _authResolved = true; _authCbs.forEach(function (cb) { try { cb(s); } catch (e) {} }); }

  // ---- site content (editable page text: hero, headings, footer, brand) ----
  function siteDefaults() { return Object.assign({}, window.SP_SITE_DEFAULTS || {}); }
  function mergeSite(stored) {
    var out = siteDefaults();
    if (stored) Object.keys(stored).forEach(function (k) { if (stored[k] != null) out[k] = stored[k]; });
    return out;
  }

  // ---- base articles (always present, from data.js) ----
  function baseArticles() { return (window.SP_ARTICLES || []).slice(); }
  function mergeArticles(custom) {
    var have = {}, out = [];
    custom.forEach(function (a) { if (!have[a.slug]) { have[a.slug] = 1; out.push(a); } });
    baseArticles().forEach(function (a) { if (!have[a.slug]) { have[a.slug] = 1; out.push(a); } });
    return out.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  }

  // ---- novels (separate system; merged base + custom by slug, newest update first) ----
  function baseNovels() { return (window.SP_NOVELS || []).slice(); }
  function mergeNovels(custom) {
    var have = {}, out = [];
    custom.forEach(function (n) { if (!have[n.slug]) { have[n.slug] = 1; out.push(n); } });
    baseNovels().forEach(function (n) { if (!have[n.slug]) { have[n.slug] = 1; out.push(n); } });
    return out.sort(function (a, b) { return new Date(b.updated || b.date) - new Date(a.updated || a.date); });
  }

  // body editor → block format
  SP.parseBody = function (text) {
    var blocks = [];
    (text || '').split(/\n{2,}/).forEach(function (chunk) {
      chunk = chunk.trim(); if (!chunk) return;
      var img = chunk.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (chunk.indexOf('## ') === 0) blocks.push(['h2', chunk.slice(3).trim()]);
      else if (chunk.indexOf('> ') === 0) blocks.push(['quote', chunk.slice(2).trim()]);
      else if (img) blocks.push(['img', img[2].trim(), img[1].trim()]);
      else blocks.push(['p', chunk]);
    });
    return blocks;
  };
  // block format → editor text (for the edit form)
  SP.bodyToText = function (blocks) {
    return (blocks || []).map(function (b) {
      if (b[0] === 'h2') return '## ' + b[1];
      if (b[0] === 'quote') return '> ' + b[1] + (b[2] ? '' : '');
      if (b[0] === 'img') return '![' + (b[2] || '') + '](' + b[1] + ')';
      return b[1];
    }).join('\n\n');
  };
  function fileToDataURL(file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); });
  }
  SP.makeSlug = function (title) {
    var base = (title || 'post').toLowerCase().replace(/[^\w\u0e00-\u0e7f]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return (base || 'post') + '-' + Date.now().toString(36);
  };
  function uid(p) { return (p || 'id') + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); }

  // ============================================================
  //  FIREBASE MODE
  // ============================================================
  if (fbReady) {
    firebase.initializeApp(CFG);
    var auth = firebase.auth();
    var db = firebase.firestore();
    var storage = (firebase.storage) ? firebase.storage() : null;

    // Resilience: if Firestore is slow or not yet set up (DB not created /
    // rules not published), don't hang the page — fall back after a few seconds
    // so the public site still renders its built-in articles & default text.
    function guard(promise, fallback, ms) {
      return Promise.race([
        Promise.resolve(promise).catch(function () { return fallback; }),
        new Promise(function (resolve) { setTimeout(function () { resolve(fallback); }, ms || 6000); })
      ]);
    }

    SP.ready = new Promise(function (resolve) {
      auth.onAuthStateChanged(function (user) {
        if (!user) { setSession(null); resolve(); return; }
        db.collection('users').doc(user.uid).get().then(function (doc) {
          var d = doc.exists ? doc.data() : {};
          setSession({ uid: user.uid, email: user.email, name: d.name || user.displayName || user.email, role: d.role || 'member' });
          resolve();
        }).catch(function () {
          setSession({ uid: user.uid, email: user.email, name: user.displayName || user.email, role: 'member' });
          resolve();
        });
      });
    });

    SP.register = function (email, pass, name) {
      return auth.createUserWithEmailAndPassword((email || '').trim(), pass).then(function (cred) {
        var u = cred.user;
        return db.collection('users').doc(u.uid).set({
          name: (name || email).trim(), email: u.email, role: 'member', createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          setSession({ uid: u.uid, email: u.email, name: (name || email).trim(), role: 'member' });
          return { ok: true };
        });
      }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };
    SP.login = function (email, pass) {
      return auth.signInWithEmailAndPassword((email || '').trim(), pass)
        .then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };
    SP.logout = function () { return auth.signOut(); };

    SP.listArticles = function () {
      return guard(db.collection('articles').get().then(function (snap) {
        var custom = []; snap.forEach(function (d) { custom.push(d.data()); });
        return mergeArticles(custom);
      }), mergeArticles([]));
    };
    SP.customArticles = function () {
      return guard(db.collection('articles').orderBy('date', 'desc').get().then(function (snap) {
        var a = []; snap.forEach(function (d) { a.push(d.data()); }); return a;
      }), []);
    };
    SP.getArticle = function (slug) { return SP.listArticles().then(function (l) { return l.find(function (a) { return a.slug === slug; }); }); };
    SP.addArticle = function (obj) { return db.collection('articles').doc(obj.slug).set(obj).then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; }); };
    SP.deleteArticle = function (slug) { return db.collection('articles').doc(slug).delete().then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; }); };

    SP.listComments = function (slug) {
      return guard(db.collection('comments').where('slug', '==', slug).get().then(function (snap) {
        var c = []; snap.forEach(function (d) { c.push(Object.assign({ id: d.id }, d.data())); });
        return c.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      }), []);
    };
    SP.allComments = function () {
      return guard(db.collection('comments').orderBy('date', 'desc').get().then(function (snap) {
        var c = []; snap.forEach(function (d) { c.push(Object.assign({ id: d.id }, d.data())); }); return c;
      }), []);
    };
    SP.addComment = function (slug, text) {
      if (!_session) return Promise.resolve({ ok: false, msg: 'กรุณาเข้าสู่ระบบ' });
      text = (text || '').trim(); if (!text) return Promise.resolve({ ok: false, msg: 'พิมพ์ข้อความก่อนส่ง' });
      return db.collection('comments').add({
        slug: slug, uid: _session.uid, name: _session.name, role: _session.role, text: text, likes: [], date: new Date().toISOString()
      }).then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };
    SP.deleteComment = function (id) { return db.collection('comments').doc(id).delete().then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; }); };
    SP.toggleLike = function (id, liked) {
      if (!_session) return Promise.resolve({ ok: false });
      var op = liked ? firebase.firestore.FieldValue.arrayRemove(_session.uid) : firebase.firestore.FieldValue.arrayUnion(_session.uid);
      return db.collection('comments').doc(id).update({ likes: op }).then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };
    SP.uploadImage = function (file) {
      if (storage) {
        var ref = storage.ref('uploads/' + Date.now() + '-' + (file.name || 'img').replace(/[^\w.\-]/g, '_'));
        return ref.put(file).then(function (snap) { return snap.ref.getDownloadURL(); });
      }
      return fileToDataURL(file);
    };

    SP.listLinks = function () {
      return guard(db.collection('links').orderBy('date', 'desc').get().then(function (snap) {
        var l = []; snap.forEach(function (d) { l.push(Object.assign({ id: d.id }, d.data())); }); return l;
      }), []);
    };
    SP.addLink = function (obj) { return db.collection('links').add(Object.assign({ date: new Date().toISOString() }, obj)).then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; }); };
    SP.deleteLink = function (id) { return db.collection('links').doc(id).delete().then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; }); };

    SP.listNovels = function () {
      return guard(db.collection('novels').get().then(function (snap) {
        var custom = []; snap.forEach(function (d) { custom.push(d.data()); });
        return mergeNovels(custom);
      }), mergeNovels([]));
    };
    SP.customNovels = function () {
      return guard(db.collection('novels').get().then(function (snap) {
        var a = []; snap.forEach(function (d) { a.push(d.data()); }); return a;
      }), []);
    };
    SP.getNovel = function (slug) { return SP.listNovels().then(function (l) { return l.find(function (n) { return n.slug === slug; }); }); };
    SP.saveNovel = function (obj) { return db.collection('novels').doc(obj.slug).set(obj).then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; }); };
    SP.deleteNovel = function (slug) { return db.collection('novels').doc(slug).delete().then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; }); };

    SP.getSite = function () {
      return guard(db.collection('settings').doc('site').get().then(function (doc) {
        return mergeSite(doc.exists ? doc.data() : null);
      }), siteDefaults());
    };
    SP.saveSite = function (obj) {
      return db.collection('settings').doc('site').set(obj, { merge: true })
        .then(function () { return { ok: true }; })
        .catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };

    function fbErr(e) {
      var c = e && e.code || '';
      if (c === 'auth/email-already-in-use') return 'อีเมลนี้ถูกใช้แล้ว';
      if (c === 'auth/invalid-email') return 'รูปแบบอีเมลไม่ถูกต้อง';
      if (c === 'auth/weak-password') return 'รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัว)';
      if (c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-credential') return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
      if (c === 'permission-denied' || c === 'PERMISSION_DENIED') return 'Firebase ปฏิเสธการบันทึก (permission-denied) — โปรดตรวจ 2 อย่าง: 1) Publish กฎจากไฟล์ firestore.rules ใน Console แล้วหรือยัง  2) บัญชีนี้ตั้ง role เป็น "admin" ใน Firestore › users แล้วหรือยัง';
      if (c === 'unavailable' || c === 'failed-precondition') return 'เชื่อมต่อฐานข้อมูลไม่ได้ชั่วคราว ลองใหม่อีกครั้ง';
      return (e && e.message) || 'เกิดข้อผิดพลาด';
    }
    return;
  }

  // ============================================================
  //  LOCAL DEMO MODE (localStorage)
  // ============================================================
  var LS = { users: 'sp-users-v2', session: 'sp-session-v2', arts: 'sp-articles-v2', comments: 'sp-comments-v2', links: 'sp-links-v2', site: 'sp-site-v2', novels: 'sp-novels-v2' };
  function read(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function write(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  // seed a demo admin once
  (function seed() {
    if (!read(LS.users, null)) {
      write(LS.users, [{ uid: 'admin', email: 'admin@shadowphase.local', p: 'admin1234', role: 'admin', name: 'ผู้ดูแลระบบ' }]);
    }
  })();

  function loadSession() {
    var s = read(LS.session, null);
    setSession(s);
  }
  SP.ready = Promise.resolve().then(loadSession);

  SP.register = function (email, pass, name) {
    email = (email || '').trim();
    if (!email || !pass) return Promise.resolve({ ok: false, msg: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    if (pass.length < 4) return Promise.resolve({ ok: false, msg: 'รหัสผ่านต้องยาวอย่างน้อย 4 ตัว' });
    var users = read(LS.users, []);
    if (users.some(function (x) { return x.email.toLowerCase() === email.toLowerCase(); }))
      return Promise.resolve({ ok: false, msg: 'อีเมลนี้ถูกใช้แล้ว' });
    var nu = { uid: uid('u'), email: email, p: pass, role: 'member', name: (name || email).trim() };
    users.push(nu); write(LS.users, users);
    var sess = { uid: nu.uid, email: nu.email, name: nu.name, role: nu.role };
    write(LS.session, sess); setSession(sess);
    return Promise.resolve({ ok: true });
  };
  SP.login = function (email, pass) {
    email = (email || '').trim();
    var f = read(LS.users, []).find(function (x) { return x.email.toLowerCase() === email.toLowerCase() && x.p === pass; });
    if (!f) return Promise.resolve({ ok: false, msg: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    var sess = { uid: f.uid, email: f.email, name: f.name, role: f.role };
    write(LS.session, sess); setSession(sess);
    return Promise.resolve({ ok: true });
  };
  SP.logout = function () { localStorage.removeItem(LS.session); setSession(null); return Promise.resolve(); };

  SP.customArticles = function () { return Promise.resolve(read(LS.arts, [])); };
  SP.listArticles = function () { return Promise.resolve(mergeArticles(read(LS.arts, []))); };
  SP.getArticle = function (slug) { return SP.listArticles().then(function (l) { return l.find(function (a) { return a.slug === slug; }); }); };
  SP.addArticle = function (obj) {
    var c = read(LS.arts, []);
    var i = c.findIndex(function (a) { return a.slug === obj.slug; });
    if (i > -1) c[i] = obj; else c.unshift(obj);
    write(LS.arts, c); return Promise.resolve();
  };
  SP.deleteArticle = function (slug) { write(LS.arts, read(LS.arts, []).filter(function (a) { return a.slug !== slug; })); return Promise.resolve(); };

  SP.listComments = function (slug) {
    return Promise.resolve(read(LS.comments, []).filter(function (c) { return c.slug === slug; })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); }));
  };
  SP.allComments = function () {
    return Promise.resolve(read(LS.comments, []).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }));
  };
  SP.addComment = function (slug, text) {
    if (!_session) return Promise.resolve({ ok: false, msg: 'กรุณาเข้าสู่ระบบ' });
    text = (text || '').trim(); if (!text) return Promise.resolve({ ok: false, msg: 'พิมพ์ข้อความก่อนส่ง' });
    var all = read(LS.comments, []);
    all.push({ id: uid('c'), slug: slug, uid: _session.uid, name: _session.name, role: _session.role, text: text, likes: [], date: new Date().toISOString() });
    write(LS.comments, all);
    return Promise.resolve({ ok: true });
  };
  SP.deleteComment = function (id) { write(LS.comments, read(LS.comments, []).filter(function (c) { return c.id !== id; })); return Promise.resolve(); };
  SP.toggleLike = function (id, liked) {
    if (!_session) return Promise.resolve({ ok: false });
    var all = read(LS.comments, []);
    var c = all.find(function (x) { return x.id === id; });
    if (c) { c.likes = c.likes || []; var k = c.likes.indexOf(_session.uid); if (k > -1) c.likes.splice(k, 1); else c.likes.push(_session.uid); write(LS.comments, all); }
    return Promise.resolve({ ok: true });
  };
  SP.uploadImage = function (file) { return fileToDataURL(file); };

  SP.listLinks = function () { return Promise.resolve(read(LS.links, [])); };
  SP.addLink = function (obj) { var l = read(LS.links, []); l.unshift(Object.assign({ id: uid('l'), date: new Date().toISOString() }, obj)); write(LS.links, l); return Promise.resolve(); };
  SP.deleteLink = function (id) { write(LS.links, read(LS.links, []).filter(function (x) { return x.id !== id; })); return Promise.resolve(); };

  SP.getSite = function () { return Promise.resolve(mergeSite(read(LS.site, null))); };
  SP.saveSite = function (obj) { write(LS.site, Object.assign(read(LS.site, {}) || {}, obj)); return Promise.resolve({ ok: true }); };

  SP.customNovels = function () { return Promise.resolve(read(LS.novels, [])); };
  SP.listNovels = function () { return Promise.resolve(mergeNovels(read(LS.novels, []))); };
  SP.getNovel = function (slug) { return SP.listNovels().then(function (l) { return l.find(function (n) { return n.slug === slug; }); }); };
  SP.saveNovel = function (obj) {
    var c = read(LS.novels, []);
    var i = c.findIndex(function (n) { return n.slug === obj.slug; });
    if (i > -1) c[i] = obj; else c.unshift(obj);
    write(LS.novels, c); return Promise.resolve({ ok: true });
  };
  SP.deleteNovel = function (slug) { write(LS.novels, read(LS.novels, []).filter(function (n) { return n.slug !== slug; })); return Promise.resolve(); };
})();
