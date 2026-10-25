
(function(){
  try { localStorage.forceColorScheme = "dark"; } catch(e) {}
  document.documentElement.setAttribute("data-bs-theme", "dark");
  function enhanceOne(el){
    if(el.matches && el.matches("textarea.paragraph-input, .text-input")) el.classList.add("form-control");
    else if(el.querySelectorAll) el.querySelectorAll("textarea.paragraph-input, .text-input").forEach(n => n.classList.add("form-control"));
  }
  function enhanceSelects(root){
    let lists = [];
    if(root.matches && root.matches("select") && !root.multiple) lists.push(root);
    if(root.querySelectorAll) root.querySelectorAll("select:not(.form-select):not([multiple])").forEach(n => lists.push(n));
    lists.forEach(el => el.classList.add("form-select", "form-select-sm"));
    let mods = [];
    if(root.matches && root.matches(".input-modifiers select")) mods.push(root);
    if(root.querySelectorAll) root.querySelectorAll(".input-modifiers select").forEach(n => mods.push(n));
    mods.forEach(el => { el.style.minWidth = "140px"; });
  }
  function enhanceGenBtn(){
    let g = (typeof getGenerateButton === "function") ? getGenerateButton() : document.querySelector("#generateButtonEl");
    if(g && !g.dataset.proBtn){ g.dataset.proBtn = "1"; g.innerHTML = "✨ Generar imágenes"; }
  }
  function enhanceNav(){
    let nav = document.getElementById("proNav");
    if(!nav || nav.dataset.proNavDone) return;
    nav.dataset.proNavDone = "1";
    nav.addEventListener("click", (e) => {
      if(e.target.closest && e.target.closest("a.nav-link") && window.innerWidth < 992) nav.classList.remove("show");
    });
    let toggler = document.querySelector(".navbar-toggler");
    if(toggler && !toggler.dataset.proNavAria) {
      toggler.dataset.proNavAria = "1";
      toggler.setAttribute("aria-expanded", "false");
      toggler.setAttribute("aria-controls", "proNav");
      toggler.addEventListener("click", () => {
        toggler.setAttribute("aria-expanded", nav.classList.contains("show") ? "true" : "false");
      });
    }
  }
  function enhance(root){
    root = root || document;
    enhanceOne(root);
    enhanceSelects(root);
    enhanceGenBtn();
    enhanceNav();
  }
  enhance(document);
  if(typeof onProDomChange === "function") onProDomChange((muts) => {
    let worked = false;
    (muts || []).forEach(m => {
      m.addedNodes.forEach(n => {
        if(!n || n.nodeType !== 1 || !n.matches) return;
        if(n.matches("select, textarea, .input-modifiers, #proNav") || (n.querySelector && n.querySelector("select, textarea, .input-modifiers, #proNav"))) { enhance(n); worked = true; }
      });
    });
    if(!worked) enhanceGenBtn();
  });
})();
