// The framework always renders the comments + gallery containers, but they
// stay empty until the user clicks "show comments & gallery". Our box styling
// would show two empty bordered blocks, so keep each hidden while it has no
// real content (element nodes or non-whitespace text). Uses the `hidden`
// property so it composes with the framework's own hide/show buttons, which
// toggle inline `display`.
(function() {
  function hasContent(el) {
    if(!el) return false;
    for(let n of el.childNodes) {
      if(n.nodeType === 1) return true;
      if(n.nodeType === 3 && n.textContent.trim()) return true;
    }
    return false;
  }
  function syncSocialVisibility() {
    let c = (typeof getCommentsCtn === "function") ? getCommentsCtn() : document.getElementById("commentsPluginCtn654732");
    let g = (typeof getGalleryCtn === "function") ? getGalleryCtn() : document.getElementById("imageGalleryCtn8569284");
    if(c) c.hidden = !hasContent(c);
    if(g) g.hidden = !hasContent(g);
  }
  window.syncSocialVisibility = syncSocialVisibility;
  syncSocialVisibility();
  if(typeof onProDomChange === "function") onProDomChange(syncSocialVisibility);
})();
