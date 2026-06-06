// ============================================================
// SHADOW PHASE 影变 — site content applier
// Reads editable page text (saved by an admin via the “เนื้อหาเว็บ” tab)
// and writes it into any element carrying a [data-site="key"] attribute.
// Runs automatically on every page that includes this file.
// Admin-only content, so HTML in the values is intentional and trusted.
// ============================================================
(function () {
  var SP = window.SP;
  if (!SP) return;

  SP.applySite = function (site) {
    if (!site) return;
    document.querySelectorAll('[data-site]').forEach(function (el) {
      var key = el.getAttribute('data-site');
      var val = site[key];
      if (val != null && val !== '') el.innerHTML = val;
    });
    // keep the document title in sync with the brand name where relevant
    var brand = site.brandName;
    if (brand && document.title.indexOf('แผงควบคุม') === -1) {
      // leave per-page titles alone; only used if a page opts in via data-site-title
      var t = document.querySelector('[data-site-title]');
      if (t) document.title = brand + ' ' + (site.brandCn || '');
    }
  };

  function init() {
    Promise.resolve(SP.getSite ? SP.getSite() : null).then(function (site) {
      SP.applySite(site);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
