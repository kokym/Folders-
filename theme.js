/* ============================================================
   SHADOW PHASE 影变 — shared styles
   ============================================================ */

/* ---- Fonts ---- */
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Trirong:ital,wght@0,400;0,500;0,600;1,400&family=Noto+Serif+SC:wght@400;600;700&display=swap');

/* ============================================================
   Tokens
   ============================================================ */
:root {
  /* Light (paper) */
  --paper:        #f3efe6;
  --paper-2:      #ece6d9;
  --paper-card:   #f7f3ec;
  --ink:          #211c17;
  --ink-soft:     #4d453c;
  --ink-faint:    #8a7f70;
  --rule:         #d8cfbd;
  --rule-soft:    #e4dccd;
  --crimson:      #8c2b22;   /* wordmark oxblood */
  --crimson-deep: #6f201a;
  --seal:         #c0392b;   /* stamp vermillion */
  --paper-tex:    rgba(120,100,70,0.04);

  --maxw: 1180px;
  --read: 38rem;

  --font-display: 'Cormorant Garamond', 'Trirong', Georgia, serif;
  --font-head:    'Trirong', 'Cormorant Garamond', Georgia, serif;
  --font-body:    'Sarabun', system-ui, sans-serif;
  --font-cn:      'Noto Serif SC', serif;

  --ease: cubic-bezier(.4,.06,.2,1);
}

html[data-theme="dark"] {
  --paper:        #16130f;
  --paper-2:      #1c1813;
  --paper-card:   #1e1a15;
  --ink:          #ece4d6;
  --ink-soft:     #b8ad9c;
  --ink-faint:    #7e7263;
  --rule:         #332c23;
  --rule-soft:    #2a241c;
  --crimson:      #d96a5b;   /* lifted for contrast on dark */
  --crimson-deep: #c4584a;
  --seal:         #d8493a;
  --paper-tex:    rgba(255,240,210,0.025);
}

/* ============================================================
   Base
   ============================================================ */
* { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }

body {
  margin: 0;
  background-color: var(--paper);
  background-image:
    radial-gradient(var(--paper-tex) 1px, transparent 1px),
    radial-gradient(var(--paper-tex) 1px, transparent 1px);
  background-size: 7px 7px, 11px 11px;
  background-position: 0 0, 3px 5px;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 18px;
  line-height: 1.75;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  transition: background-color .5s var(--ease), color .5s var(--ease);
}

img { max-width: 100%; display: block; }

a { color: inherit; text-decoration: none; }

::selection { background: var(--crimson); color: var(--paper); }

.wrap { width: 100%; max-width: var(--maxw); margin: 0 auto; padding: 0 clamp(20px, 5vw, 56px); }

/* ============================================================
   Type helpers
   ============================================================ */
.cn { font-family: var(--font-cn); font-weight: 400; }
.crimson { color: var(--crimson); }
.serif { font-family: var(--font-head); }

.eyebrow {
  font-family: var(--font-body);
  font-weight: 600;
  font-size: .72rem;
  letter-spacing: .28em;
  text-transform: uppercase;
  color: var(--crimson);
  display: inline-flex;
  align-items: center;
  gap: .6em;
}
.eyebrow .cn { letter-spacing: .1em; font-size: .9rem; }

h1, h2, h3 { font-family: var(--font-head); font-weight: 500; line-height: 1.18; letter-spacing: .005em; }

/* ============================================================
   Top bar
   ============================================================ */
.site-head {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--paper) 86%, transparent);
  backdrop-filter: blur(12px) saturate(1.1);
  -webkit-backdrop-filter: blur(12px) saturate(1.1);
  border-bottom: 1px solid var(--rule-soft);
  transition: background-color .5s var(--ease), border-color .5s var(--ease);
}
.site-head .wrap {
  display: flex; align-items: center; gap: 28px;
  height: 76px;
}
.brand { display: flex; align-items: center; gap: 13px; margin-right: auto; }
.brand .seal {
  width: 40px; height: 40px; object-fit: contain;
  filter: var(--seal-filter, none);
}
html[data-theme="dark"] .brand .seal,
html[data-theme="dark"] .seal-img { filter: saturate(1.15) brightness(1.18); }
.brand .lock { display: flex; flex-direction: column; line-height: 1; }
.brand .name {
  font-family: var(--font-display);
  font-weight: 600; font-size: 1.32rem; letter-spacing: .14em;
  color: var(--ink); white-space: nowrap;
}
.eyebrow { white-space: nowrap; }
.brand .sub { font-family: var(--font-cn); font-size: .82rem; color: var(--crimson); letter-spacing: .35em; margin-top: 3px; }

.nav { display: flex; align-items: center; gap: 30px; }
.nav a {
  font-size: .92rem; color: var(--ink-soft); font-weight: 500; white-space: nowrap;
  position: relative; padding: 4px 0; transition: color .25s var(--ease);
}
.nav a::after {
  content: ''; position: absolute; left: 0; right: 100%; bottom: -2px; height: 1.5px;
  background: var(--crimson); transition: right .3s var(--ease);
}
.nav a:hover, .nav a[aria-current="page"] { color: var(--ink); }
.nav a:hover::after, .nav a[aria-current="page"]::after { right: 0; }

.theme-btn {
  width: 38px; height: 38px; border-radius: 50%;
  border: 1px solid var(--rule); background: transparent; color: var(--ink-soft);
  display: grid; place-items: center; cursor: pointer; flex-shrink: 0;
  transition: border-color .25s var(--ease), color .25s var(--ease), transform .4s var(--ease);
}
.theme-btn:hover { color: var(--crimson); border-color: var(--crimson); }
.theme-btn svg { width: 18px; height: 18px; }
.theme-btn .moon { display: none; }
html[data-theme="dark"] .theme-btn .sun { display: none; }
html[data-theme="dark"] .theme-btn .moon { display: block; }

.menu-toggle { display: none; }

/* ============================================================
   Buttons / links
   ============================================================ */
.btn {
  display: inline-flex; align-items: center; gap: .6em;
  font-family: var(--font-body); font-weight: 600; font-size: .9rem;
  letter-spacing: .02em; cursor: pointer;
}
.btn-primary {
  background: var(--crimson); color: var(--paper);
  padding: 13px 26px; border: none;
  transition: background-color .25s var(--ease), transform .25s var(--ease);
}
html[data-theme="dark"] .btn-primary { color: #16130f; }
.btn-primary:hover { background: var(--crimson-deep); }
.link-arrow { color: var(--crimson); font-weight: 600; font-size: .9rem; display: inline-flex; align-items: center; gap: .5em; }
.link-arrow .ar { transition: transform .3s var(--ease); }
.link-arrow:hover .ar { transform: translateX(5px); }

/* ============================================================
   Section header
   ============================================================ */
.sec-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 38px; }
.sec-head h2 { font-size: clamp(1.7rem, 3vw, 2.3rem); margin: 8px 0 0; }

/* ============================================================
   Footer
   ============================================================ */
.site-foot {
  margin-top: 100px; border-top: 1px solid var(--rule-soft);
  background: var(--paper-2);
  transition: background-color .5s var(--ease), border-color .5s var(--ease);
}
.site-foot .wrap { padding-top: 56px; padding-bottom: 48px; }
.foot-grid { display: flex; gap: 48px; align-items: flex-start; flex-wrap: wrap; justify-content: space-between; }
.foot-brand { max-width: 360px; }
.foot-brand .seal { width: 64px; height: 64px; margin-bottom: 18px; }
.foot-brand p { color: var(--ink-soft); font-size: .95rem; margin: 0; }
.foot-cols { display: flex; gap: 64px; flex-wrap: wrap; }
.foot-col h4 { font-family: var(--font-body); font-weight: 600; font-size: .74rem; letter-spacing: .22em; text-transform: uppercase; color: var(--ink-faint); margin: 0 0 16px; }
.foot-col a { display: block; color: var(--ink-soft); font-size: .95rem; padding: 5px 0; transition: color .2s var(--ease); }
.foot-col a:hover { color: var(--crimson); }
.foot-bottom { margin-top: 44px; padding-top: 22px; border-top: 1px solid var(--rule-soft); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; color: var(--ink-faint); font-size: .82rem; }

/* ============================================================
   Article card
   ============================================================ */
.cat-tag {
  font-family: var(--font-body); font-weight: 600; font-size: .7rem;
  letter-spacing: .16em; text-transform: uppercase; color: var(--crimson);
}
.card {
  display: flex; flex-direction: column; gap: 12px;
  padding: 30px 0; border-top: 1px solid var(--rule);
  cursor: pointer;
}
.card .meta-row { display: flex; align-items: center; gap: 14px; }
.card .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--ink-faint); }
.card .when { color: var(--ink-faint); font-size: .82rem; }
.card h3 { font-size: 1.5rem; margin: 2px 0; transition: color .25s var(--ease); font-weight: 500; }
.card:hover h3 { color: var(--crimson); }
.card .cn-sub { font-family: var(--font-cn); color: var(--ink-faint); font-size: 1rem; }
.card .excerpt { color: var(--ink-soft); font-size: .98rem; max-width: 60ch; }
.card .read-more { color: var(--crimson); font-weight: 600; font-size: .86rem; }

@media (max-width: 720px) {
  .nav { display: none; }
  .site-head .wrap { gap: 14px; }
}
