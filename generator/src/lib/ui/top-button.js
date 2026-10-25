(function() {
  let topBtn = document.getElementById('topBtn');
  if(!topBtn) return;
  let scrollTicking = false;
  window.addEventListener('scroll', () => {
    if(scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      scrollTicking = false;
      let show = document.body.scrollTop > 1000 || document.documentElement.scrollTop > 1000;
      topBtn.style.display = show ? 'block' : 'none';
    });
  }, {passive: true});

  window.topFunction = function() {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  };
})();
