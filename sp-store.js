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

  // ---- payment / coins settings ----
  function payDefaults() {
    var d = window.SP_PAYMENT_DEFAULTS || {};
    return { coinName: d.coinName || 'เหรียญ', pricePerChapter: d.pricePerChapter || 1,
      promptpay: d.promptpay || '', accountName: d.accountName || '', bankInfo: d.bankInfo || '',
      note: d.note || '', packages: (d.packages || []).slice() };
  }
  function mergePayment(stored) {
    var out = payDefaults();
    if (stored) Object.keys(stored).forEach(function (k) { if (stored[k] != null) out[k] = stored[k]; });
    return out;
  }
  // is a chapter free? (free===true, or no price and not explicitly paid)
  SP.chapterIsFree = function (ch) { return !!(ch && (ch.free === true || (ch.free !== false && !(ch.price > 0)))); };
  SP.chapterPrice = function (ch) { return SP.chapterIsFree(ch) ? 0 : (ch.price > 0 ? ch.price : (payDefaults().pricePerChapter || 1)); };
  SP.unlockKey = function (slug, chId) { return slug + '__' + chId; };
  // every chapter must carry a STABLE id (used in the unlock key). Seed/legacy
  // chapters may lack one — assign a deterministic id based on position so it
  // stays identical across reloads (a random id would break unlocks).
  function ensureChapterIds(slug, chapters) {
    return (chapters || []).map(function (c, i) {
      if (c && c.id) return c;
      return Object.assign({}, c, { id: slug + '-c' + i, order: (c && c.order != null) ? c.order : i });
    });
  }
  SP.ensureChapterIds = ensureChapterIds;
  SP.coins = function () { return (_session && _session.coins) || 0; };
  SP.isUnlocked = function (slug, chId) { return !!(_session && _session.unlocks && _session.unlocks[SP.unlockKey(slug, chId)]); };

  // ---- base articles (always present, from data.js) ----
  // Firestore rejects nested arrays, so article `body` ([[type,text],...]) and
  // novel chapter bodies are stored as JSON strings in Firestore and decoded on read.
  function encBody(b){ return (typeof b === 'string') ? b : JSON.stringify(b || []); }
  function decBody(b){ if (typeof b !== 'string') return b || []; try { return JSON.parse(b); } catch(e){ return []; } }
  function decodeArticle(a){ if (a && typeof a.body === 'string') a.body = decBody(a.body); return a; }
  function decodeNovel(n){
    if (n && Array.isArray(n.chapters)) n.chapters = n.chapters.map(function(c){
      if (c && typeof c.body === 'string') c = Object.assign({}, c, { body: decBody(c.body) });
      return c;
    });
    return n;
  }
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
  // downscale an image File/Blob to a small JPEG data URL (so it can live inside a
  // Firestore document — no paid Storage needed). Falls back to the raw file on error.
  function downscaleToDataURL(file, maxW, quality) {
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, (maxW || 1200) / img.width);
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          try { resolve(cv.toDataURL('image/jpeg', quality || 0.72)); }
          catch (e) { fileToDataURL(file).then(resolve); }
        };
        img.onerror = function () { fileToDataURL(file).then(resolve); };
        img.src = URL.createObjectURL(file);
      } catch (e) { fileToDataURL(file).then(resolve); }
    });
  }
  SP.downscaleToDataURL = downscaleToDataURL;
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
          setSession({ uid: user.uid, email: user.email, name: d.name || user.displayName || user.email, role: d.role || 'member', coins: d.coins || 0, unlocks: d.unlocks || {} });
          resolve();
        }).catch(function () {
          setSession({ uid: user.uid, email: user.email, name: user.displayName || user.email, role: 'member', coins: 0, unlocks: {} });
          resolve();
        });
      });
    });

    // re-read the signed-in user's doc (coins/unlocks may have changed server-side)
    SP.refreshUser = function () {
      if (!_session) return Promise.resolve(null);
      return db.collection('users').doc(_session.uid).get().then(function (doc) {
        var d = doc.exists ? doc.data() : {};
        setSession(Object.assign({}, _session, { coins: d.coins || 0, unlocks: d.unlocks || {}, role: d.role || _session.role, name: d.name || _session.name }));
        return _session;
      }).catch(function () { return _session; });
    };

    SP.register = function (email, pass, name) {
      return auth.createUserWithEmailAndPassword((email || '').trim(), pass).then(function (cred) {
        var u = cred.user;
        return db.collection('users').doc(u.uid).set({
          name: (name || email).trim(), email: u.email, role: 'member', coins: 0, unlocks: {}, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          setSession({ uid: u.uid, email: u.email, name: (name || email).trim(), role: 'member', coins: 0, unlocks: {} });
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
        var custom = []; snap.forEach(function (d) { custom.push(decodeArticle(d.data())); });
        return mergeArticles(custom);
      }), mergeArticles([]));
    };
    SP.customArticles = function () {
      return guard(db.collection('articles').orderBy('date', 'desc').get().then(function (snap) {
        var a = []; snap.forEach(function (d) { a.push(decodeArticle(d.data())); }); return a;
      }), []);
    };
    SP.getArticle = function (slug) { return SP.listArticles().then(function (l) { return l.find(function (a) { return a.slug === slug; }); }); };
    SP.addArticle = function (obj) {
      try {
        var toSave = Object.assign({}, obj, { body: encBody(obj.body) });
        return db.collection('articles').doc(obj.slug).set(toSave).then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
      } catch (e) { return Promise.resolve({ ok: false, msg: fbErr(e) }); }
    };
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
    // Image uploads are FREE by default: images are compressed to a base64 data
    // URL stored inside Firestore — no paid Storage bucket needed. If you later
    // enable Firebase Storage (Blaze plan), set window.SP_USE_STORAGE = true in
    // firebase-config.js to use it instead. A 5s timeout guards against hangs.
    SP.uploadImage = function (file, maxW, quality) {
      function fallback() { return downscaleToDataURL(file, maxW || 1200, quality || 0.72); }
      if (storage && window.SP_USE_STORAGE === true) {
        try {
          var ref = storage.ref('uploads/' + Date.now() + '-' + ((file && file.name) || 'img').replace(/[^\w.\-]/g, '_'));
          var put = ref.put(file).then(function (snap) { return snap.ref.getDownloadURL(); });
          var timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 5000); });
          return Promise.race([put, timeout]).then(function (url) { return url || fallback(); }).catch(function () { return fallback(); });
        } catch (e) { return fallback(); }
      }
      return fallback();
    };

    // ---- coins / unlock (members spend their own coins; balance can never be self-raised) ----
    SP.unlockChapter = function (slug, chId, price) {
      if (!_session) return Promise.resolve({ ok: false, msg: 'กรุณาเข้าสู่ระบบ' });
      var key = SP.unlockKey(slug, chId);
      if (_session.unlocks && _session.unlocks[key]) return Promise.resolve({ ok: true, already: true });
      var ref = db.collection('users').doc(_session.uid);
      return db.runTransaction(function (tx) {
        return tx.get(ref).then(function (doc) {
          var data = (doc.exists && doc.data()) || {};
          var have = data.coins || 0;
          if (have < price) { var e = new Error('insufficient'); e.insufficient = true; throw e; }
          var unlocks = data.unlocks || {};
          unlocks[key] = true;
          // write the WHOLE map (never a dotted field path — slugs contain
          // dashes/Thai chars that are invalid in Firestore field paths)
          tx.update(ref, { coins: have - price, unlocks: unlocks });
        });
      }).then(function () {
        _session.coins = (_session.coins || 0) - price;
        if (!_session.unlocks) _session.unlocks = {};
        _session.unlocks[key] = true;
        setSession(_session);
        return { ok: true };
      }).catch(function (e) {
        if (e && e.insufficient) return { ok: false, insufficient: true, msg: 'เหรียญไม่พอ' };
        return { ok: false, msg: fbErr(e) };
      });
    };

    // ---- top-up requests (member creates; admin approves -> adds coins) ----
    SP.getPayment = function () {
      return guard(db.collection('settings').doc('payment').get().then(function (doc) {
        return mergePayment(doc.exists ? doc.data() : null);
      }), payDefaults());
    };
    SP.savePayment = function (obj) {
      return db.collection('settings').doc('payment').set(obj, { merge: true })
        .then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };
    SP.requestTopup = function (pkg, slipUrl) {
      if (!_session) return Promise.resolve({ ok: false, msg: 'กรุณาเข้าสู่ระบบ' });
      return db.collection('topupRequests').add({
        uid: _session.uid, name: _session.name, email: _session.email,
        amount: pkg.amount, coins: pkg.coins, slip: slipUrl || '', status: 'pending', date: new Date().toISOString()
      }).then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };
    SP.myTopups = function () {
      if (!_session) return Promise.resolve([]);
      return guard(db.collection('topupRequests').where('uid', '==', _session.uid).get().then(function (snap) {
        var a = []; snap.forEach(function (d) { a.push(Object.assign({ id: d.id }, d.data())); });
        return a.sort(function (x, y) { return new Date(y.date) - new Date(x.date); });
      }), []);
    };
    SP.listTopups = function () {
      return guard(db.collection('topupRequests').orderBy('date', 'desc').get().then(function (snap) {
        var a = []; snap.forEach(function (d) { a.push(Object.assign({ id: d.id }, d.data())); }); return a;
      }), []);
    };
    SP.approveTopup = function (id) {
      var ref = db.collection('topupRequests').doc(id);
      return ref.get().then(function (doc) {
        if (!doc.exists) return { ok: false, msg: 'ไม่พบรายการ' };
        var r = doc.data();
        if (r.status === 'done') return { ok: true, already: true };
        return db.collection('users').doc(r.uid).update({ coins: firebase.firestore.FieldValue.increment(r.coins) })
          .then(function () { return ref.update({ status: 'done', approvedAt: new Date().toISOString() }); })
          .then(function () { return { ok: true }; });
      }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };
    SP.rejectTopup = function (id) {
      return db.collection('topupRequests').doc(id).update({ status: 'rejected' })
        .then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };
    // ---- users (admin) ----
    SP.listUsers = function () {
      return guard(db.collection('users').get().then(function (snap) {
        var a = []; snap.forEach(function (d) { a.push(Object.assign({ uid: d.id }, d.data())); }); return a;
      }), []);
    };
    SP.addCoins = function (uid, amount) {
      return db.collection('users').doc(uid).update({ coins: firebase.firestore.FieldValue.increment(amount) })
        .then(function () { if (_session && _session.uid === uid) { _session.coins = (_session.coins || 0) + amount; setSession(_session); } return { ok: true }; })
        .catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };

    SP.listLinks = function () {
      return guard(db.collection('links').orderBy('date', 'desc').get().then(function (snap) {
        var l = []; snap.forEach(function (d) { l.push(Object.assign({ id: d.id }, d.data())); }); return l;
      }), []);
    };
    SP.addLink = function (obj) { return db.collection('links').add(Object.assign({ date: new Date().toISOString() }, obj)).then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; }); };
    SP.deleteLink = function (id) { return db.collection('links').doc(id).delete().then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; }); };

    // novels: metadata in novels/{slug}; each chapter is its OWN doc in
    // novels/{slug}/chapters/{id} — this sidesteps Firestore's 1 MB per-document
    // limit so a novel can hold an effectively unlimited number of chapters.
    SP.listNovels = function () {
      return guard(db.collection('novels').get().then(function (snap) {
        var custom = []; snap.forEach(function (d) {
          var n = d.data();
          if (typeof n.chapterCount !== 'number') n.chapterCount = (n.chapters || []).length;
          custom.push(n);
        });
        return mergeNovels(custom);
      }), mergeNovels([]));
    };
    SP.customNovels = function () {
      return guard(db.collection('novels').get().then(function (snap) {
        var a = []; snap.forEach(function (d) {
          var n = d.data();
          if (typeof n.chapterCount !== 'number') n.chapterCount = (n.chapters || []).length;
          a.push(n);
        }); return a;
      }), []);
    };
    SP.getNovel = function (slug) {
      return guard(db.collection('novels').doc(slug).get().then(function (doc) {
        if (!doc.exists) {
          var seed = baseNovels().find(function (n) { return n.slug === slug; });
          if (!seed) return null;
          var sc = JSON.parse(JSON.stringify(seed));
          sc.chapters = ensureChapterIds(slug, sc.chapters);
          return sc;
        }
        var meta = doc.data();
        return db.collection('novels').doc(slug).collection('chapters').get().then(function (snap) {
          var subs = []; snap.forEach(function (c) { var d = c.data(); d.id = c.id; subs.push(d); });
          if (subs.length) {
            subs.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
            meta.chapters = subs.map(function (c) { return { id: c.id, title: c.title, date: c.date, order: c.order, free: c.free, price: c.price, body: decBody(c.body) }; });
          } else {
            // legacy: chapters were embedded in the parent doc — flag for migration
            meta.chapters = ensureChapterIds(slug, (meta.chapters || []).map(function (c, i) { return { title: c.title, date: c.date, order: i, free: c.free, price: c.price, body: decBody(c.body) }; }));
            if (meta.chapters.length) meta._legacy = true;
          }
          return meta;
        });
      }), null);
    };
    // save metadata ONLY (chapters live in the subcollection)
    SP.saveNovel = function (meta) {
      try {
        var toSave = {
          slug: meta.slug, title: meta.title, cn: meta.cn || '', cover: meta.cover || '',
          status: meta.status || 'ongoing', synopsis: meta.synopsis || '',
          date: meta.date || new Date().toISOString(), updated: new Date().toISOString(),
          chapterCount: typeof meta.chapterCount === 'number' ? meta.chapterCount : (meta.chapters || []).length
        };
        return db.collection('novels').doc(meta.slug).set(toSave, { merge: true })
          .then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
      } catch (e) { return Promise.resolve({ ok: false, msg: fbErr(e) }); }
    };
    // add (no id) or update (with id) a single chapter; returns its id
    SP.saveChapter = function (slug, chapter) {
      try {
        var data = { title: chapter.title || '', body: encBody(chapter.body), date: chapter.date || new Date().toISOString(), order: chapter.order || 0, free: !!chapter.free, price: chapter.price || 0 };
        var col = db.collection('novels').doc(slug).collection('chapters');
        var ref = chapter.id ? col.doc(chapter.id) : col.doc();
        return ref.set(data).then(function () { return { ok: true, id: ref.id }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
      } catch (e) { return Promise.resolve({ ok: false, msg: fbErr(e) }); }
    };
    SP.deleteChapter = function (slug, id) {
      return db.collection('novels').doc(slug).collection('chapters').doc(id).delete()
        .then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };
    // one-time move: embedded chapters array -> subcollection docs; clears the embedded array
    SP.migrateNovelChapters = function (slug, chapters) {
      try {
        var col = db.collection('novels').doc(slug).collection('chapters');
        var batch = db.batch();
        (chapters || []).forEach(function (c, i) {
          var ref = col.doc();
          batch.set(ref, { title: c.title || '', body: encBody(c.body), date: c.date || new Date().toISOString(), order: i });
        });
        batch.set(db.collection('novels').doc(slug), { chapters: firebase.firestore.FieldValue.delete(), chapterCount: (chapters || []).length }, { merge: true });
        return batch.commit().then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
      } catch (e) { return Promise.resolve({ ok: false, msg: fbErr(e) }); }
    };
    SP.deleteNovel = function (slug) {
      var col = db.collection('novels').doc(slug).collection('chapters');
      return col.get().then(function (snap) {
        var batch = db.batch();
        snap.forEach(function (d) { batch.delete(d.ref); });
        return batch.commit();
      }).then(function () {
        return db.collection('novels').doc(slug).delete();
      }).then(function () { return { ok: true }; }).catch(function (e) { return { ok: false, msg: fbErr(e) }; });
    };

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
  var LS = { users: 'sp-users-v2', session: 'sp-session-v2', arts: 'sp-articles-v2', comments: 'sp-comments-v2', links: 'sp-links-v2', site: 'sp-site-v2', novels: 'sp-novels-v2', pay: 'sp-pay-v2', topups: 'sp-topups-v2' };
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
    if (s) { // refresh coins/unlocks/role from the user record
      var u = read(LS.users, []).find(function (x) { return x.uid === s.uid; });
      if (u) { s.coins = u.coins || 0; s.unlocks = u.unlocks || {}; s.role = u.role; s.name = u.name; }
    }
    setSession(s);
  }
  SP.ready = Promise.resolve().then(loadSession);

  SP.refreshUser = function () { loadSession(); return Promise.resolve(_session); };

  SP.register = function (email, pass, name) {
    email = (email || '').trim();
    if (!email || !pass) return Promise.resolve({ ok: false, msg: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    if (pass.length < 4) return Promise.resolve({ ok: false, msg: 'รหัสผ่านต้องยาวอย่างน้อย 4 ตัว' });
    var users = read(LS.users, []);
    if (users.some(function (x) { return x.email.toLowerCase() === email.toLowerCase(); }))
      return Promise.resolve({ ok: false, msg: 'อีเมลนี้ถูกใช้แล้ว' });
    var nu = { uid: uid('u'), email: email, p: pass, role: 'member', name: (name || email).trim(), coins: 0, unlocks: {} };
    users.push(nu); write(LS.users, users);
    var sess = { uid: nu.uid, email: nu.email, name: nu.name, role: nu.role, coins: 0, unlocks: {} };
    write(LS.session, sess); setSession(sess);
    return Promise.resolve({ ok: true });
  };
  SP.login = function (email, pass) {
    email = (email || '').trim();
    var f = read(LS.users, []).find(function (x) { return x.email.toLowerCase() === email.toLowerCase() && x.p === pass; });
    if (!f) return Promise.resolve({ ok: false, msg: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    var sess = { uid: f.uid, email: f.email, name: f.name, role: f.role, coins: f.coins || 0, unlocks: f.unlocks || {} };
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
  SP.uploadImage = function (file, maxW, quality) { return downscaleToDataURL(file, maxW || 1200, quality || 0.72); };

  SP.listLinks = function () { return Promise.resolve(read(LS.links, [])); };
  SP.addLink = function (obj) { var l = read(LS.links, []); l.unshift(Object.assign({ id: uid('l'), date: new Date().toISOString() }, obj)); write(LS.links, l); return Promise.resolve(); };
  SP.deleteLink = function (id) { write(LS.links, read(LS.links, []).filter(function (x) { return x.id !== id; })); return Promise.resolve(); };

  SP.getSite = function () { return Promise.resolve(mergeSite(read(LS.site, null))); };
  SP.saveSite = function (obj) { write(LS.site, Object.assign(read(LS.site, {}) || {}, obj)); return Promise.resolve({ ok: true }); };

  SP.customNovels = function () { return Promise.resolve(read(LS.novels, []).map(withCount)); };
  SP.listNovels = function () { return Promise.resolve(mergeNovels(read(LS.novels, []).map(withCount))); };
  function withCount(n){ if (typeof n.chapterCount !== 'number') n.chapterCount = (n.chapters || []).length; return n; }
  SP.getNovel = function (slug) {
    var stored = read(LS.novels, []).find(function (n) { return n.slug === slug; });
    if (stored) {
      var copy = JSON.parse(JSON.stringify(stored));
      copy.chapters = ensureChapterIds(slug, copy.chapters);
      return Promise.resolve(copy);
    }
    var seed = baseNovels().find(function (n) { return n.slug === slug; });
    if (!seed) return Promise.resolve(null);
    var sc = JSON.parse(JSON.stringify(seed));
    sc.chapters = ensureChapterIds(slug, sc.chapters);
    return Promise.resolve(sc);
  };
  // save metadata only; preserve existing chapters (or seed chapters on first save)
  SP.saveNovel = function (meta) {
    var c = read(LS.novels, []);
    var i = c.findIndex(function (n) { return n.slug === meta.slug; });
    var existing = i > -1 ? c[i] : (baseNovels().find(function (n) { return n.slug === meta.slug; }) || {});
    var obj = {
      slug: meta.slug, title: meta.title, cn: meta.cn || '', cover: meta.cover || '',
      status: meta.status || 'ongoing', synopsis: meta.synopsis || '',
      date: meta.date || existing.date || new Date().toISOString(), updated: new Date().toISOString(),
      chapters: (existing.chapters || []).map(function (ch, k) { if (!ch.id) ch.id = uid('c'); ch.order = k; return ch; })
    };
    obj.chapterCount = obj.chapters.length;
    if (i > -1) c[i] = obj; else c.unshift(obj);
    write(LS.novels, c); return Promise.resolve({ ok: true });
  };
  SP.saveChapter = function (slug, chapter) {
    var c = read(LS.novels, []);
    var i = c.findIndex(function (n) { return n.slug === slug; });
    if (i < 0) {
      // novel not yet stored (seed) — clone seed then save
      var seed = baseNovels().find(function (n) { return n.slug === slug; });
      if (!seed) return Promise.resolve({ ok: false, msg: 'ไม่พบนิยาย' });
      c.unshift(JSON.parse(JSON.stringify(seed))); i = 0;
    }
    if (!c[i].chapters) c[i].chapters = [];
    if (chapter.id) {
      var k = c[i].chapters.findIndex(function (x) { return x.id === chapter.id; });
      if (k > -1) c[i].chapters[k] = Object.assign({}, c[i].chapters[k], { title: chapter.title, body: chapter.body, date: chapter.date || c[i].chapters[k].date, free: !!chapter.free, price: chapter.price || 0 });
      else c[i].chapters.push(Object.assign({ id: chapter.id }, chapter));
    } else {
      chapter.id = uid('c'); c[i].chapters.push(chapter);
    }
    c[i].chapters.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    c[i].chapterCount = c[i].chapters.length;
    c[i].updated = new Date().toISOString();
    write(LS.novels, c); return Promise.resolve({ ok: true, id: chapter.id });
  };
  SP.deleteChapter = function (slug, id) {
    var c = read(LS.novels, []);
    var i = c.findIndex(function (n) { return n.slug === slug; });
    if (i > -1) {
      c[i].chapters = (c[i].chapters || []).filter(function (x) { return x.id !== id; });
      c[i].chapterCount = c[i].chapters.length;
      write(LS.novels, c);
    }
    return Promise.resolve({ ok: true });
  };
  SP.migrateNovelChapters = function () { return Promise.resolve({ ok: true }); };
  SP.deleteNovel = function (slug) { write(LS.novels, read(LS.novels, []).filter(function (n) { return n.slug !== slug; })); return Promise.resolve({ ok: true }); };

  // ---- coins / unlock (local) ----
  function lsUpdateUser(uid_, patch) {
    var users = read(LS.users, []);
    var i = users.findIndex(function (u) { return u.uid === uid_; });
    if (i < 0) return null;
    Object.assign(users[i], patch); write(LS.users, users);
    return users[i];
  }
  SP.unlockChapter = function (slug, chId, price) {
    if (!_session) return Promise.resolve({ ok: false, msg: 'กรุณาเข้าสู่ระบบ' });
    var key = SP.unlockKey(slug, chId);
    if (_session.unlocks && _session.unlocks[key]) return Promise.resolve({ ok: true, already: true });
    if ((_session.coins || 0) < price) return Promise.resolve({ ok: false, insufficient: true, msg: 'เหรียญไม่พอ' });
    var unlocks = Object.assign({}, _session.unlocks || {}); unlocks[key] = true;
    var coins = (_session.coins || 0) - price;
    lsUpdateUser(_session.uid, { coins: coins, unlocks: unlocks });
    _session.coins = coins; _session.unlocks = unlocks; setSession(_session);
    return Promise.resolve({ ok: true });
  };
  SP.getPayment = function () { return Promise.resolve(mergePayment(read(LS.pay, null))); };
  SP.savePayment = function (obj) { write(LS.pay, Object.assign(read(LS.pay, {}) || {}, obj)); return Promise.resolve({ ok: true }); };
  SP.requestTopup = function (pkg, slipUrl) {
    if (!_session) return Promise.resolve({ ok: false, msg: 'กรุณาเข้าสู่ระบบ' });
    var t = read(LS.topups, []);
    t.unshift({ id: uid('t'), uid: _session.uid, name: _session.name, email: _session.email, amount: pkg.amount, coins: pkg.coins, slip: slipUrl || '', status: 'pending', date: new Date().toISOString() });
    write(LS.topups, t); return Promise.resolve({ ok: true });
  };
  SP.myTopups = function () { if (!_session) return Promise.resolve([]); return Promise.resolve(read(LS.topups, []).filter(function (t) { return t.uid === _session.uid; })); };
  SP.listTopups = function () { return Promise.resolve(read(LS.topups, [])); };
  SP.approveTopup = function (id) {
    var t = read(LS.topups, []); var r = t.find(function (x) { return x.id === id; });
    if (!r) return Promise.resolve({ ok: false, msg: 'ไม่พบรายการ' });
    if (r.status !== 'done') {
      var u = read(LS.users, []).find(function (x) { return x.uid === r.uid; });
      if (u) lsUpdateUser(r.uid, { coins: (u.coins || 0) + r.coins });
      r.status = 'done'; r.approvedAt = new Date().toISOString(); write(LS.topups, t);
      if (_session && _session.uid === r.uid) { loadSession(); }
    }
    return Promise.resolve({ ok: true });
  };
  SP.rejectTopup = function (id) {
    var t = read(LS.topups, []); var r = t.find(function (x) { return x.id === id; });
    if (r) { r.status = 'rejected'; write(LS.topups, t); }
    return Promise.resolve({ ok: true });
  };
  SP.listUsers = function () { return Promise.resolve(read(LS.users, []).map(function (u) { return { uid: u.uid, name: u.name, email: u.email, role: u.role, coins: u.coins || 0 }; })); };
  SP.addCoins = function (uid_, amount) {
    var u = read(LS.users, []).find(function (x) { return x.uid === uid_; });
    if (u) lsUpdateUser(uid_, { coins: (u.coins || 0) + amount });
    if (_session && _session.uid === uid_) loadSession();
    return Promise.resolve({ ok: true });
  };
})();
