
  // Open links in a new tab via event delegation — this works for links
  // added after page load (the old approach ran before any links existed).
  document.addEventListener('click', (e) => {
    let a = e.target.closest ? e.target.closest('a[href]') : null;
    if(!a || a.target) return;
    let href = a.getAttribute('href') || '';
    if(!href || href.charAt(0) === '#') return;
    a.target = '_blank';
  }, true);
