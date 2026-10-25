
  // Bottom-center dock: gathers the floating reopen buttons
  // (Variations, Style Compare) plus the private-gallery button
  // side by side, centered on the window, with matching shape.
  (function(){
    function galleryOpen(){
      return !!document.getElementById('localMediaGallery_root');
    }
    function padGalleryGrid(){
      let root = document.getElementById('localMediaGallery_root');
      if(!root || root.dataset.proPadded) return;
      root.dataset.proPadded = '1';
      for(let el of root.children){
        if(el.tagName !== 'DIV') continue;
        try{ if(getComputedStyle(el).flexGrow === '1'){ el.style.paddingBottom = '24px'; break; } }catch(e){}
      }
    }
    function dock(){
      let d = document.getElementById('bottomDockCtn');
      if(!d) {
        d = document.createElement('div');
        d.id = 'bottomDockCtn';
        document.body.appendChild(d);
      }
      let g = getPrivateGalleryButton();
      if(g && g.parentElement !== d) { g.dataset.dock = 'gallery'; d.appendChild(g); }
      for(let id of ['vary-reopen-btn', 'style-compare-reopen-btn']) {
        let b = document.getElementById(id);
        if(b && b.parentElement !== d) d.appendChild(b);
      }
      if(g){
        if(galleryOpen()){ g.style.display = 'none'; padGalleryGrid(); }
        else if(g.dataset.dock === 'gallery'){ g.style.display = ''; }
      }
      d.hidden = [...d.children].every(b => b.style.visibility === 'hidden');
    }
    window.__refreshBottomDock = dock;
    dock();
    onProDomChange(() => { dock(); });
  })();
