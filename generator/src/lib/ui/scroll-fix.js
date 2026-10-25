(function(){
  function overlayOpen(){
    for(let id of ["vary-modal-ctn", "style-compare-modal-ctn", "t2iUpscaleLightbox"]) {
      let b = document.getElementById(id);
      if(b && b.style.display !== "none" && !b.hidden) return true;
    }
    return !!(
      document.getElementById("localMediaGallery_root") ||
      document.querySelector("[data-local-media-gallery-lightbox]") ||
      document.querySelector(".modal.show")
    );
  }
  function fix(){
    if(overlayOpen()) return;
    var h = document.documentElement, b = document.body;
    if(h.style.overflow === "hidden") h.style.overflow = "";
    if(b.style.overflow === "hidden") b.style.overflow = "";
  }
  if(typeof onProDomChange === "function") onProDomChange(fix);
  fix();
})();
