// Shadow Phase — theme toggle (persisted)
(function () {
  var KEY = 'sp-theme';
  var root = document.documentElement;
  function apply(t) { root.setAttribute('data-theme', t); }
  // initial (run before paint via inline call in <head>)
  var saved = localStorage.getItem(KEY);
  if (!saved) saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  apply(saved);

  window.SPtoggleTheme = function () {
    var cur = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(cur);
    localStorage.setItem(KEY, cur);
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.addEventListener('click', window.SPtoggleTheme);
    });
    // mobile menu
    var mt = document.querySelector('.menu-toggle');
    var nav = document.querySelector('.nav');
    if (mt && nav) mt.addEventListener('click', function () { nav.classList.toggle('open'); });
  });
})();
