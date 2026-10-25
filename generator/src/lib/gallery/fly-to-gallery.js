
  // Ghost fly-to-gallery animation.
  // The framework animates a shrinking ghost image into
  // `#privateGalleryCtn97364827 button`, but the dock moves that button
  // into `#bottomDockCtn` — so the framework's lookup finds null and the
  // animation silently dies (the save itself still works). This module
  // resolves the button wherever it currently lives and replays the same
  // fly + wiggle effect, both for the framework's per-image save button
  // (via an override installed below) and for our overlay save buttons.

  function galleryFlyTarget() {
    let btn = null;
    try { btn = getPrivateGalleryButton(); } catch(e) {}
    if(btn) {
      let r = null;
      try { r = btn.getBoundingClientRect(); } catch(e) {}
      // Visible button: use it directly.
      if(r && (r.width || r.height)) return btn;
    }
    // Button hidden (the dock hides it while the personal gallery is open):
    // fly into the open gallery itself so the effect stays visible instead
    // of silently doing nothing.
    try {
      let root = document.getElementById('localMediaGallery_root');
      if(root) {
        let r = root.getBoundingClientRect();
        if(r && (r.width || r.height)) return root;
      }
    } catch(e) {}
    try {
      let dock = document.getElementById('bottomDockCtn');
      if(dock) {
        let r = dock.getBoundingClientRect();
        if(r && (r.width || r.height)) return dock;
      }
    } catch(e) {}
    // Last resort: the (possibly hidden) button itself.
    return btn;
  }

  // Restartable wiggle that can never get stuck: the old flag-based guard
  // skipped all future wiggles if a single `animationend` never fired
  // (hidden tab, display:none target, interrupted animation, ...). Now
  // every save restarts the animation and cleanup is guaranteed via both
  // `animationend` and a timeout.
  function wiggleEl(targetEl) {
    if(!targetEl) return;
    try {
      clearTimeout(targetEl.__proWiggleT);
      targetEl.classList.remove('pro-wiggle');
      // Force reflow so re-adding the class restarts the animation even
      // when saves happen in quick succession.
      void targetEl.offsetWidth;
      targetEl.classList.add('pro-wiggle');
      let done = false;
      let cleanup = () => {
        if(done) return;
        done = true;
        clearTimeout(targetEl.__proWiggleT);
        try { targetEl.classList.remove('pro-wiggle'); } catch(e) {}
      };
      targetEl.__proWiggleT = setTimeout(cleanup, 600);
      targetEl.addEventListener('animationend', cleanup, {once: true});
    } catch(e) {}
  }

  function flyImageToGallery(sourceEl, dataUrl, durationMs) {
    let targetEl = galleryFlyTarget();
    if(!sourceEl || !targetEl || !dataUrl) return false;
    let srcRect = null, tgtRect = null;
    try { srcRect = sourceEl.getBoundingClientRect(); } catch(e) {}
    try { tgtRect = targetEl.getBoundingClientRect(); } catch(e) {}
    if(!srcRect || (!srcRect.width && !srcRect.height)) return false;
    if(!tgtRect || (!tgtRect.width && !tgtRect.height)) {
      // No visible target (e.g. everything hidden): still wiggle the button
      // for feedback, but there is nowhere to fly from/to.
      try { wiggleEl(targetEl); } catch(e) {}
      return false;
    }
    durationMs = durationMs || 700;
    let imgEl = document.createElement('img');
    imgEl.src = dataUrl;
    imgEl.style.cssText = `position:fixed;top:${srcRect.top}px;left:${srcRect.left}px;width:${srcRect.width}px;height:${srcRect.height}px;margin:0;pointer-events:none;z-index:100002;object-fit:cover;transition:top ${durationMs}ms cubic-bezier(.4,0,.2,1),left ${durationMs}ms cubic-bezier(.4,0,.2,1),width ${durationMs}ms cubic-bezier(.4,0,.2,1),height ${durationMs}ms cubic-bezier(.4,0,.2,1)`;
    document.body.appendChild(imgEl);
    imgEl.getBoundingClientRect();
    imgEl.style.top = tgtRect.top + tgtRect.height / 2 + 'px';
    imgEl.style.left = tgtRect.left + tgtRect.width / 2 + 'px';
    imgEl.style.width = imgEl.style.height = '0px';
    let done = false;
    // Wiggling the whole fullscreen gallery looks wrong, so only wiggle
    // button/dock targets — flying into the open gallery is feedback enough
    // (plus it auto-refreshes to show the new image).
    let shouldWiggle = !targetEl.id || targetEl.id !== 'localMediaGallery_root';
    let finish = () => {
      if(done) return;
      done = true;
      try { imgEl.remove(); } catch(e) {}
      if(shouldWiggle) wiggleEl(targetEl);
    };
    // `transitionend` fires per transitioned property; the `done` guard
    // makes the first one win. The timeout is the guarantee for hidden
    // tabs / no-transition environments where it never fires.
    imgEl.addEventListener('transitionend', finish, {once: true});
    setTimeout(finish, durationMs + 200);
    return true;
  }

  async function saveToGalleryWithFly(dataUrl, info, sourceEl) {
    await saveImageToGallery(dataUrl, info);
    try { flyImageToGallery(sourceEl, dataUrl); } catch(e) {}
  }

  // Override the framework's per-image save so the ghost flies to the
  // button's live location. Save semantics match the original. Installed
  // defensively: the framework assigns its version after our scripts run,
  // so retry until it shows up (then wrap exactly once, marked to avoid
  // double-wrapping).
  function installSaveOverride() {
    if(window.t2i_privateGallerySave && window.t2i_privateGallerySave.__proWrapped) {
      window.__proSaveOverrideInstalled = true;
      return true;
    }
    if(typeof window.t2i_privateGallerySave !== 'function') return false;
    window.t2i_privateGallerySave = async function(btn, imageCtn) {
      try {
        let iframe = imageCtn && imageCtn.querySelector ? imageCtn.querySelector('iframe') : null;
        if(!iframe || !iframe.textToImagePluginOutput) {
          if(typeof showToast === "function") showToast("Please wait for the image to finish generating before using the 'private save' feature.", true);
          else alert("Please wait for the image to finish generating before using the 'private save' feature.");
          return;
        }
        if(btn) btn.disabled = true;
        let textToImagePluginOutput = iframe.textToImagePluginOutput;
        let inputs = textToImagePluginOutput.inputs || {};
        let {prompt, negativePrompt, seed, guidanceScale} = inputs;
        let imageBlob = await fetch(textToImagePluginOutput.dataUrl).then(r => r.blob());
        await window.t2i_privateGallery.add(imageBlob, {info: {prompt, negativePrompt, seed, guidanceScale}});
        let ctn = null;
        try { ctn = getPrivateGalleryCtn(); } catch(e) {}
        if(ctn) ctn.hidden = false;
        if(window.__refreshBottomDock) window.__refreshBottomDock();
        try { flyImageToGallery(iframe, textToImagePluginOutput.dataUrl); } catch(e) {}
      } catch(e) {
        console.error(e);
      }
      if(btn) setTimeout(() => { try { btn.disabled = false; } catch(e) {} }, 1000);
    };
    window.t2i_privateGallerySave.__proWrapped = true;
    window.__proSaveOverrideInstalled = true;
    return true;
  }
  if(!installSaveOverride()) {
    let tries = 0;
    let installer = () => {
      if(installSaveOverride() || ++tries > 100) offProDomChange(installer);
    };
    onProDomChange(installer);
    setTimeout(() => offProDomChange(installer), 20000);
  }
