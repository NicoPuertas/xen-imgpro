
  let _varyStash = makeBatchStash();
  function openVaryModal(data) {
    // Reopen = unhide the live modal (same batch): the finished iframe
    // embeds keep their full in-frame UI (info/reload/gallery buttons),
    // which a destroy + static-<img> restore could never bring back.
    let live = document.getElementById('vary-modal-ctn');
    if(live && live.style.display === 'none' && _varyStash.matches(data, true)) {
      live.style.display = 'flex';
      let rb = document.getElementById('vary-reopen-btn');
      if(rb) rb.style.visibility = 'hidden';
      if(window.__refreshBottomDock) window.__refreshBottomDock();
      return;
    }
    let shell = createModalShell('vary-modal-ctn', '🌱 Variations (seed: ' + data.seed + ')');
    let backdrop = shell.backdrop, header = shell.header, imgCtn = shell.imgCtn;

    let btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;align-items:center;gap:0.4rem;flex-shrink:0;';
    header.appendChild(btnGroup);

    let numInput = document.createElement('select');
    numInput.className = 'form-select form-select-sm';
    numInput.style.cssText = 'width:auto;display:inline-block;flex-shrink:0;';
    [3,4,6,9].forEach(n => {
      let opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n + ' images';
      if(n === 3) opt.selected = true;
      numInput.appendChild(opt);
    });
    btnGroup.appendChild(numInput);

    let moreBtn = makeModalButton('<i class="bi bi-plus-lg"></i> Add', '#2bbb00');
    moreBtn.title = 'Add more images (keeps existing frames)';
    moreBtn.onclick = () => generateImages(Number(numInput.value));
    btnGroup.appendChild(moreBtn);

    let regenBtn = makeModalButton('<i class="bi bi-arrow-clockwise"></i> Regenerate', '#2bbb00');
    regenBtn.title = 'Discard all frames and generate new ones (same seed)';
    regenBtn.onclick = () => {
      disposeEmbeds(imgCtn);
      imgCtn.innerHTML = '';
      generateImages(Number(numInput.value));
    };
    btnGroup.appendChild(regenBtn);

    let clearBtn = makeModalButton('🗑 Clear', '#555');
    clearBtn.title = 'Remove all frames';
    clearBtn.onclick = () => {
      disposeEmbeds(imgCtn);
      imgCtn.innerHTML = '';
    };
    btnGroup.appendChild(clearBtn);

    let closeBtn = makeModalButton('✖', '#e44');
    btnGroup.appendChild(closeBtn);

    function generateImages(n) {
      for(let i = 0; i < n; i++) imgCtn.appendChild(makeEmbed(data));
    }

    function closeVary() {
      // Cleared (or never generated) + closed = nothing to reopen:
      // destroy the empty shell, drop the stash, hide the dock button.
      if(typeof modalHasFrames === 'function' ? !modalHasFrames(imgCtn) : imgCtn.childElementCount === 0) {
        if(typeof hideReopenButton === 'function') hideReopenButton('vary-reopen-btn');
        else { try { let b = document.getElementById('vary-reopen-btn'); if(b) b.remove(); } catch(e) {} }
        _varyStash.save(null, []);
        closeModalShell(backdrop);
        return;
      }
      _varyStash.save(data, []);
      backdrop.style.display = 'none';
      showReopenButton();
    }
    closeBtn.onclick = closeVary;
    addModalDismiss(backdrop, closeVary);

    if(!_varyStash.matches(data, false)) generateImages(3);
    else restoreFinishedImages(imgCtn, _varyStash.images, data.resolution);
  }

  function showReopenButton() {
    makeReopenButton({id: 'vary-reopen-btn', text: '🌱 Variations', title: 'Reopen last variations window', background: '#2bbb00', onOpen: () => {
      if(_varyStash.data) openVaryModal(_varyStash.data);
    }});
  }

  window.__proResetVary = function() {
    if(typeof resetProModal === 'function') resetProModal('vary-modal-ctn', 'vary-reopen-btn', () => _varyStash.save(null, []));
  };
