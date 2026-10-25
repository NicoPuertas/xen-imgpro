
  // ============================================================
  // Style Compare modal
  // ============================================================
  let _styleTemplatesCache = null;
  function getStyleTemplates() {
    if(_styleTemplatesCache) return _styleTemplatesCache;
    try {
      let opts = root.settings.userInputs.artStyle.compiledOptions;
      let names = Object.keys(opts).filter(k => !k.startsWith('meta:') && !k.startsWith('___'));
      let styles = {};
      for(let name of names) {
        let s = opts[name];
        styles[name] = { prompt: s.prompt || null, negative: s.negative || null };
      }
      _styleTemplatesCache = styles;
      return styles;
    } catch(e) {
      console.error('getStyleTemplates error:', e);
      return null;
    }
  }

  // Evaluate every style's prompt/negative templates against the given
  // description/negative — the ones the clicked image was generated with,
  // so style compare stays consistent even if the form changed afterwards.
  function evalStyleStyles(description, negative) {
    let templates = getStyleTemplates();
    if(!templates) return null;
    let originalInput = window.input;
    window.input = Object.assign({}, originalInput || {}, { description: description || '', negative: negative || '' });
    let styles = {};
    try {
      for(let name of Object.keys(templates)) {
        let t = templates[name];
        styles[name] = {
          prompt: t.prompt ? String(t.prompt.evaluateItem) : null,
          negative: t.negative ? String(t.negative.evaluateItem) : null
        };
      }
    } finally {
      window.input = originalInput;
    }
    return styles;
  }

  // Last-batch stash shared via the modal helper (same shape as vary).
  let _scStash = makeBatchStash();
  function openStyleCompareModal(data, description, negative) {
    let live = document.getElementById('style-compare-modal-ctn');
    if(live && live.style.display === 'none' && _scStash.matches(data, true)) {
      live.style.display = 'flex';
      let rb = document.getElementById('style-compare-reopen-btn');
      if(rb) rb.style.visibility = 'hidden';
      if(window.__refreshBottomDock) window.__refreshBottomDock();
      return;
    }
    let allStyles = evalStyleStyles(description, negative);
    if(!allStyles) { showToast('Could not load art styles.', true); return; }
    let styleNames = Object.keys(allStyles);

    let shell = createModalShell('style-compare-modal-ctn', '🎨 Style Compare <span style="opacity:0.7;font-size:0.85em">(seed: ' + data.seed + ')</span>', '1rem');
    let backdrop = shell.backdrop, header = shell.header, imgCtn = shell.imgCtn;

    let closeBtn = makeModalButton('✖', '#e44');
    header.appendChild(closeBtn);

    let controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;padding:0.4rem 1rem;gap:0.5rem;color:white;font-family:sans-serif;flex-wrap:nowrap;background:rgba(255,255,255,0.05);';

    let styleSelectLabel = document.createElement('span');
    styleSelectLabel.textContent = 'Styles:';
    styleSelectLabel.style.cssText = 'font-size:0.85rem;font-weight:bold;flex-shrink:0;';
    controls.appendChild(styleSelectLabel);

    let styleSelect = document.createElement('select');
    styleSelect.multiple = true;
    styleSelect.style.cssText = 'padding:0.25rem;background:#333;color:white;border:1px solid #555;border-radius:3px;min-width:220px;max-height:120px;font-size:0.8rem;flex-shrink:0;';
    let preselect = ['No style (default)', 'Cinematic', 'Digital Painting', 'Concept Art', '3D Disney Character', 'Oil Painting', 'Oil Painting - Realism', 'Professional Photo', 'Franco-Belgian Comic', '90s Comic'];
    styleNames.forEach(name => {
      let opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if(preselect.includes(name)) opt.selected = true;
      styleSelect.appendChild(opt);
    });
    controls.appendChild(styleSelect);

    let btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:0.3rem;margin-left:auto;flex-shrink:0;';
    controls.appendChild(btnGroup);

    let genBtn = makeModalButton('🔄 Generate selected', '#2bbb00');
    btnGroup.appendChild(genBtn);

    let genAllBtn = makeModalButton('🔄 Generate all (' + styleNames.length + ')', '#1a8d00');
    btnGroup.appendChild(genAllBtn);

    let clearBtn = makeModalButton('🗑 Clear', '#555');
    btnGroup.appendChild(clearBtn);

    backdrop.appendChild(controls);

    function makeStyleIframe(styleName) {
      let styleData = allStyles[styleName];
      let d = JSON.parse(JSON.stringify(data));
      d.prompt = styleData.prompt || data.prompt;
      d.negativePrompt = styleData.negative || data.negativePrompt;
      let size = data.resolution === '768x768' ? 350 : 300;
      let wrapper = makeEmbed(d, {tag: 'sc', extraInputs: {artStyle: styleName}});
      let labelEl = document.createElement('div');
      labelEl.textContent = styleName;
      labelEl.style.cssText = 'color:white;font-family:sans-serif;font-size:0.8rem;font-weight:bold;text-align:center;max-width:' + size + 'px;word-wrap:break-word;';
      let container = document.createElement('div');
      container.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.3rem;';
      container.appendChild(labelEl);
      container.appendChild(wrapper);
      return container;
    }

    function generateSelected() {
      let selected = [...styleSelect.selectedOptions].map(o => o.value);
      if(selected.length === 0) { showToast('Select at least one style.'); return; }
      selected.forEach(name => imgCtn.appendChild(makeStyleIframe(name)));
    }

    function generateAll() {
      styleNames.forEach(name => imgCtn.appendChild(makeStyleIframe(name)));
    }

    genBtn.onclick = generateSelected;
    genAllBtn.onclick = generateAll;
    clearBtn.onclick = () => {
      disposeEmbeds(imgCtn);
      imgCtn.innerHTML = '';
    };

    closeBtn.onclick = closeSc;
    function closeSc() {
      // Same empty rule as Variations: cleared + closed = hide the button.
      if(typeof modalHasFrames === 'function' ? !modalHasFrames(imgCtn) : imgCtn.childElementCount === 0) {
        if(typeof hideReopenButton === 'function') hideReopenButton('style-compare-reopen-btn');
        else { try { let b = document.getElementById('style-compare-reopen-btn'); if(b) b.remove(); } catch(e) {} }
        _scStash.save(null, [], '', '');
        closeModalShell(backdrop);
        return;
      }
      _scStash.save(data, [], description, negative);
      backdrop.style.display = 'none';
      showStyleCompareReopenButton();
    }
    addModalDismiss(backdrop, closeSc);

    if(_scStash.matches(data, false)) restoreFinishedImages(imgCtn, _scStash.images, data.resolution);
  }

  function showStyleCompareReopenButton() {
    makeReopenButton({id: 'style-compare-reopen-btn', text: '🎨 Style Compare', title: 'Reopen last style compare window', background: '#6b5ce7', onOpen: () => {
      if(_scStash.data) openStyleCompareModal(_scStash.data, _scStash.desc, _scStash.neg);
    }});
  }

  window.__proResetStyleCompare = function() {
    if(typeof resetProModal === 'function') resetProModal('style-compare-modal-ctn', 'style-compare-reopen-btn', () => _scStash.save(null, []));
  };
