
  // Generic modal shell shared by the vary + style-compare modals.
  // Both modals are a fullscreen backdrop + header (+ optional controls)
  // + image grid, with a docked reopen button that restores the last batch.

  function disposeEmbeds(rootEl) {
    rootEl.querySelectorAll('.t2i-embed-wrap').forEach(w => {
      try { w.__dispose && w.__dispose(); } catch(e) {}
    });
  }

  function closeModalShell(backdrop) {
    disposeEmbeds(backdrop);
    backdrop.remove();
  }

  function createModalShell(id, titleHtml, imgGap) {
    let existing = document.getElementById(id);
    if(existing) closeModalShell(existing);    let backdrop = document.createElement('div');
    backdrop.id = id;
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;';
    let header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:0.5rem 1rem;gap:0.5rem;color:white;font-family:sans-serif;flex-wrap:wrap;';
    let title = document.createElement('span');
    title.innerHTML = titleHtml;
    title.style.cssText = 'flex:1;font-size:1rem;font-weight:bold;';
    header.appendChild(title);
    backdrop.appendChild(header);
    let imgCtn = document.createElement('div');
    imgCtn.style.cssText = 'flex:1;overflow-y:auto;padding:1rem;display:flex;flex-wrap:wrap;justify-content:center;gap:' + (imgGap || '0.5rem') + ';align-content:flex-start;';
    backdrop.appendChild(imgCtn);
    document.body.appendChild(backdrop);
    return {backdrop: backdrop, header: header, title: title, imgCtn: imgCtn};
  }

  function makeModalButton(html, background) {
    let btn = document.createElement('button');
    btn.innerHTML = html;
    btn.style.cssText = 'padding:0.3rem 0.6rem;cursor:pointer;border:none;border-radius:3px;background:' + background + ';color:white;font-weight:bold;font-size:0.85rem;white-space:nowrap;';
    return btn;
  }

  // Gather finished generations (live iframes) plus restored <img> shots,
  // so closing a modal stashes everything for the reopen button.
  function collectFinishedImages(imgCtn) {
    let out = [];
    imgCtn.querySelectorAll('iframe').forEach(fr => {
      if(fr.textToImagePluginOutput && fr.textToImagePluginOutput.dataUrl) {
        out.push({dataUrl: fr.textToImagePluginOutput.dataUrl, inputs: fr.textToImagePluginOutput.inputs});
      }
    });
    imgCtn.querySelectorAll('img').forEach(im => {
      if(im.src && im.src.startsWith('data:')) {
        let inputs = im.__proInputs || (im.parentElement && im.parentElement.__proInputs) || null;
        out.push({dataUrl: im.src, inputs: inputs});
      }
    });
    return out;
  }

  // Re-render stashed data URLs as plain images with save buttons.
  function restoreFinishedImages(imgCtn, images, resolution) {
    let restored = false;
    (images || []).forEach(img => {
      if(!img || !img.dataUrl) return;
      let el = document.createElement('img');
      el.src = img.dataUrl;
      el.__proInputs = img.inputs || null;
      el.style.cssText = iframeSizeFor(resolution).replace('border:0;', 'display:block;');
      let wrap = document.createElement('div');
      wrap.__proInputs = img.inputs || null;
      wrap.style.cssText = 'position:relative;display:inline-block;';
      wrap.appendChild(el);
      let saveBtn = makeSaveButton(async () => { await saveToGalleryWithFly(img.dataUrl, img.inputs, wrap); });
      saveBtn.style.opacity = '0.4';
      wrap.appendChild(saveBtn);
      imgCtn.appendChild(wrap);
      restored = true;
    });
    return restored;
  }

  // True when the modal still shows at least one frame (live embed or
  // restored image). After Clear the grid is empty (childElementCount 0).
  function modalHasFrames(imgCtn) {
    try { return !!imgCtn && imgCtn.childElementCount > 0; } catch(e) { return false; }
  }

  // Drop the docked reopen button (used when a modal is closed empty —
  // nothing to reopen, so the button hides instead of lingering).
  function hideReopenButton(id) {
    try { let b = document.getElementById(id); if(b) b.remove(); } catch(e) {}
    try { if(window.__refreshBottomDock) window.__refreshBottomDock(); } catch(e) {}
  }

  // Docked reopen button. Only one per id: re-show the hidden one if it
  // exists, otherwise create it and let the dock pick it up.
  function makeReopenButton(opts) {
    let existing = document.getElementById(opts.id);
    if(existing) {
      existing.style.visibility = 'visible';
      if(window.__refreshBottomDock) window.__refreshBottomDock();
      return;
    }
    let btn = document.createElement('button');
    btn.id = opts.id;
    btn.textContent = opts.text;
    btn.title = opts.title;
    btn.style.cssText = 'background:' + opts.background + ';color:white;opacity:0.85;';
    btn.onmouseenter = () => btn.style.transform = 'scale(1.1)';
    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
    btn.onclick = () => {
      btn.style.visibility = 'hidden';
      if(window.__refreshBottomDock) window.__refreshBottomDock();
      opts.onOpen();
    };
    document.body.appendChild(btn);
  }

  function addModalDismiss(backdrop, onClose) {
    if(!backdrop || backdrop.__proDismiss) return;
    backdrop.__proDismiss = onClose;
    backdrop.addEventListener('mousedown', (e) => {
      if(e.target === backdrop && backdrop.__proDismiss) backdrop.__proDismiss();
    });
    if(!window.__proModalEsc) {
      window.__proModalEsc = true;
      document.addEventListener('keydown', (e) => {
        if(e.key !== 'Escape') return;
        for(let id of ['vary-modal-ctn', 'style-compare-modal-ctn']) {
          let b = document.getElementById(id);
          if(b && b.isConnected && b.__proDismiss) { b.__proDismiss(); break; }
        }
      });
    }
  }

  // Fully destroy a modal: blank its iframes (stop generation traffic),
  // remove the shell, clear the batch stash via onClear, and drop the
  // docked reopen button. Shared by vary + style-compare resets.
  function resetProModal(modalId, reopenBtnId, onClear) {
    try {
      let b = document.getElementById(modalId);
      if(b) {
        try { b.querySelectorAll('iframe').forEach(fr => { try { fr.src = 'about:blank'; } catch(e) {} }); } catch(e) {}
        closeModalShell(b);
      }
    } catch(e) {}
    try { if(typeof onClear === 'function') onClear(); } catch(e) {}
    try { let btn = document.getElementById(reopenBtnId); if(btn) btn.remove(); } catch(e) {}
  }

  function makeBatchStash() {
    return {
      data: null, key: null, images: [], desc: '', neg: '',
      save(data, images, desc, neg) {
        this.data = data;
        this.key = data ? dataKey(data) : null;
        this.images = images || [];
        if(desc !== undefined) this.desc = desc;
        if(neg !== undefined) this.neg = neg;
      },
      matches(data, hasLive) {
        return !!(this.key && data && this.key === dataKey(data) && (this.images.length || hasLive));
      }
    };
  }
