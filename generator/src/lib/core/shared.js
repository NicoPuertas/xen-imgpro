
  // ============================================================
  // Shared helpers for the per-image buttons and modals
  // ============================================================

  // Parse the generation data stored in an image iframe's URL hash.
  // If preferFinishedSeed is true, use the real seed the image ended up
  // using (available once the iframe reports it finished).
  function getImageData(ctn, preferFinishedSeed) {
    let iframe = ctn.querySelector('iframe');
    if(!iframe) return null;
    let src = iframe.dataset.src || iframe.src;
    if(!src) return null;
    let hashIdx = src.indexOf('#');
    if(hashIdx < 0) return null;
    try {
      let data = JSON.parse(decodeURIComponent(src.substring(hashIdx + 1)));
      let out = preferFinishedSeed ? iframe.textToImagePluginOutput : null;
      if(out && out.inputs && out.inputs.seed && out.inputs.seed !== -1) data.seed = out.inputs.seed;
      return data;
    } catch(e) {
      console.error('getImageData error:', e);
      return null;
    }
  }

  // Stable identity for a set of generation params (order-independent),
  // used to decide whether a previous modal batch can be restored.
  function dataKey(data) {
    return JSON.stringify([data.prompt, data.seed, data.negativePrompt, data.guidanceScale, data.resolution]);
  }

  // CSS sizing for an embedded image iframe based on its resolution.
  function iframeSizeFor(resolution) {
    let parts = String(resolution || '768x768').split('x');
    let w = Number(parts[0]), h = Number(parts[1]);
    let size = 300;
    if(resolution === '768x768') size = 350;
    let css = 'border:0;';
    if(w > h) css += 'width:' + size + 'px;height:' + Math.round(size * h / w) + 'px;';
    else css += 'width:' + Math.round(size * w / h) + 'px;height:' + size + 'px;';
    return css;
  }

  // Overlay "save to private gallery" button. onSave() runs on click.
  function makeSaveButton(onSave) {
    let btn = document.createElement('button');
    btn.textContent = '\u{1F6E1}\u{1F4BE}';
    btn.title = 'Save to private gallery';
    btn.style.cssText = 'position:absolute;bottom:4px;right:4px;opacity:0;cursor:pointer;border:none;border-radius:3px;background:rgba(0,0,0,0.6);color:white;padding:2px 6px;font-size:14px;transition:opacity 0.3s;z-index:10;';
    btn.onmouseenter = () => btn.style.opacity = '1';
    btn.onmouseleave = () => btn.style.opacity = '0.4';
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = '\u23F3';
      try {
        await onSave();
        btn.textContent = '\u2705';
      } catch(e) {
        console.error('save error:', e);
        btn.textContent = '\u274C';
      }
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '\u{1F6E1}\u{1F4BE}';
        btn.style.opacity = '0.4';
      }, 1500);
    };
    return btn;
  }

  async function saveImageToGallery(dataUrl, info) {
    let blob = await fetch(dataUrl).then(r => r.blob());
    await getPrivateGallery().add(blob, {info: info});
  }

  // Non-blocking notification (replaces alert()).
  let _toastEl = null;
  function showToast(message, isError) {
    if(!_toastEl) {
      _toastEl = document.createElement('div');
      _toastEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100001;background:rgba(30,30,30,0.95);color:#fff;font-family:sans-serif;font-size:0.9rem;padding:10px 16px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.5);max-width:80vw;pointer-events:none;opacity:0;transition:opacity 0.25s;';
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = message;
    _toastEl.style.background = isError ? 'rgba(120,30,30,0.95)' : 'rgba(30,30,30,0.95)';
    _toastEl.style.opacity = '1';
    clearTimeout(_toastEl.__t);
    _toastEl.__t = setTimeout(() => { _toastEl.style.opacity = '0'; }, 3200);
  }

  // Build an embeddable generation iframe (plus its save button) that
  // reports back via window 'message' events, matching the plugin's protocol.
  function makeEmbed(data, opts) {
    opts = opts || {};
    let d = JSON.parse(JSON.stringify(data));
    d.requestId = Math.random().toString();
    d.iframeId = (opts.tag || 'id') + Math.random().toString().replace('.', '');

    let url = 'https://image-generation.perchance.org/embed#' + encodeURIComponent(JSON.stringify(d));
    let ifr = document.createElement('iframe');
    ifr.src = url;
    ifr.style.cssText = iframeSizeFor(d.resolution);
    ifr.style.background = 'rgba(255,255,255,0.1)';

    let wrapper = document.createElement('div');
    wrapper.className = 't2i-embed-wrap';
    wrapper.style.cssText = 'position:relative;display:inline-block;';
    wrapper.appendChild(ifr);

    let saveBtn = makeSaveButton(async () => {
      let out = ifr.textToImagePluginOutput;
      if(!out) throw new Error('Image not finished generating yet');
      await saveToGalleryWithFly(out.dataUrl, out.inputs, wrapper);
    });
    wrapper.appendChild(saveBtn);

    let msgHandler = function(event) {
      if(event.data && event.data.type === 'finished' && event.data.id === d.iframeId) {
        ifr.textToImagePluginOutput = {
          dataUrl: event.data.dataUrl,
          inputs: Object.assign(
            { prompt: d.prompt, negativePrompt: d.negativePrompt, seed: event.data.seedUsed || d.seed, guidanceScale: d.guidanceScale },
            opts.extraInputs || {}
          )
        };
        saveBtn.style.opacity = '0.4';
        window.removeEventListener('message', msgHandler);
      }
    };
    window.addEventListener('message', msgHandler);
    wrapper.__dispose = () => window.removeEventListener('message', msgHandler);

    return wrapper;
  }

  // ============================================================
  // Per-image buttons: regenerate / vary / style compare
  // ============================================================

  function makeImageActionButton(className, icon, title, onClick, onHoverTitle) {
    let btn = document.createElement('button');
    btn.className = className;
    btn.style.cssText = 'margin-right:0.5rem; opacity:0.5;';
    btn.title = title;
    btn.textContent = icon;
    btn.onmouseenter = () => {
      btn.style.opacity = '1';
      if(onHoverTitle) onHoverTitle(btn);
    };
    btn.onmouseleave = () => btn.style.opacity = '0.5';
    btn.onclick = onClick;
    return btn;
  }

  function requireFinishedSeed(ctn, actionName) {
    let data = getImageData(ctn, true);
    if(!data) return null;
    if(data.seed === -1 || data.seed === undefined) {
      showToast('This image has not finished generating yet. Please wait for it to finish, then click the ' + actionName + ' button.');
      return null;
    }
    return data;
  }

  function makeRegenerateButton(ctn) {
    return makeImageActionButton('t2i-regenerate-button', '\u{1F504}', 'Regenerate this image with a new random seed', function() {
      let iframe = ctn.querySelector('iframe');
      if(!iframe) return;
      let data = getImageData(ctn);
      if(!data) return;
      // Respect the user's seed input: if they set a fixed seed, keep it; otherwise randomize
      let userSeed = String(window.input && window.input.seed != null ? window.input.seed : '').trim();
      if(userSeed && userSeed !== "-1" && !isNaN(Number(userSeed))) data.seed = Number(userSeed);
      else data.seed = Math.floor(Math.random() * 1000000);
      data.requestId = Math.random().toString();
      let src = iframe.dataset.src || iframe.src;
      let hashIdx = src.indexOf('#');
      if(hashIdx < 0) return;
      let newSrc = src.substring(0, hashIdx + 1) + encodeURIComponent(JSON.stringify(data));
      iframe.src = '';
      iframe.dataset.src = newSrc;
      setTimeout(() => { iframe.src = newSrc; }, 700);
    });
  }

  function makeVaryButton(ctn) {
    return makeImageActionButton('t2i-vary-button', '\u{1F331}', 'Open this image in a variation workspace (same seed)', function() {
      let data = requireFinishedSeed(ctn, 'vary');
      if(!data) return;
      openVaryModal(data);
    });
  }

  // Copy text to the clipboard, with a fallback for older browsers.
  async function copyTextToClipboard(text) {
    try {
      if(navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch(e) {}
    try {
      let ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch(e) {
      return false;
    }
  }

  function makeCopySeedButton(ctn) {
    return makeImageActionButton('t2i-copy-seed-button', '\u{1F4CB}', "Copy this image's seed to clipboard", async function() {
      let data = requireFinishedSeed(ctn, 'copy-seed');
      if(!data) return;
      let ok = await copyTextToClipboard(String(data.seed));
      if(ok) showToast('Seed ' + data.seed + ' copied to clipboard');
      else showToast('Failed to copy seed. Seed is: ' + data.seed, true);
    }, function(btn) {
      let data = getImageData(ctn, true);
      if(data && data.seed !== -1 && data.seed !== undefined) btn.title = 'Seed: ' + data.seed + ' \u2014 click to copy';
    });
  }

  function makeStyleCompareButton(ctn) {
    return makeImageActionButton('t2i-style-compare-button', '\u{1F3A8}', 'Compare this image across different art styles (same seed)', function() {
      let data = requireFinishedSeed(ctn, 'style compare');
      if(!data) return;
      openStyleCompareModal(data, ctn.__description || '', ctn.__negative || '');
    });
  }

  // Fire the framework's input/change listeners on an element, covering
  // both real event listeners and direct oninput/onchange properties.
  // Single shared copy (used by prompt-io, reset-defaults, seed-tools).
  function fireInputEvents(el) {
    try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch(e) {}
    try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch(e) {}
    try { if(typeof el.oninput === "function") el.oninput({}); } catch(e) {}
    try { if(typeof el.onchange === "function") el.onchange({}); } catch(e) {}
  }

  // One scan pass: inject the buttons into every image container that
  // doesn't have them yet. Containers are tracked with a WeakSet so each
  // is processed exactly once. Mutation batches only scan added nodes;
  // a null/omitted batch (initial call) falls back to a full scan.
  let _processedImages = new WeakSet();
  let _lastGenSnapshot = null;
  document.addEventListener('click', (e) => {
    if(e.target && e.target.closest && e.target.closest('#' + PRO_FRAMEWORK.generateButtonId)) {
      _lastGenSnapshot = {
        description: (window.input && window.input.description) || '',
        negative: (window.input && window.input.negative) || ''
      };
    }
  }, true);
  function addButtonsToImages(muts) {
    let imageCtns;
    if(muts) {
      imageCtns = [];
      for(let m of muts) {
        for(let n of m.addedNodes) {
          if(!n || n.nodeType !== 1) continue;
          if(n.matches && n.matches(PRO_FRAMEWORK.imageCtnSelector)) imageCtns.push(n);
          else if(n.querySelectorAll) {
            for(let c of n.querySelectorAll(PRO_FRAMEWORK.imageCtnSelector)) imageCtns.push(c);
          }
        }
      }
      if(!imageCtns.length) return;
    } else {
      imageCtns = document.querySelectorAll(PRO_FRAMEWORK.imageCtnSelector);
    }
    for(let ctn of imageCtns) {
      if(_processedImages.has(ctn)) continue;
      let underCtn = ctn.querySelector('.t2i-under-each-image-ctn > div');
      if(!underCtn) continue;
      _processedImages.add(ctn);
      let snap = _lastGenSnapshot || {};
      ctn.__description = snap.description !== undefined ? snap.description : ((window.input && window.input.description) || '');
      ctn.__negative = snap.negative !== undefined ? snap.negative : ((window.input && window.input.negative) || '');
      let btns = [makeStyleCompareButton(ctn), makeVaryButton(ctn), makeCopySeedButton(ctn), makeRegenerateButton(ctn)];
      for(let b of btns) underCtn.insertBefore(b, underCtn.firstChild);
    }
  }

  // Watch for new image containers via the central dispatcher; run an
  // initial pass too. No polling.
  onProDomChange((muts) => { addButtonsToImages(muts); });
  addButtonsToImages();
