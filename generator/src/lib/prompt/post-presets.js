// Preset tag lists. EDIT THESE to change the dropdown items:
// label = short name shown in the dropdown + tag chip, text = paragraph written into the input.
// NOTE: keep this list ordered alphabetically by label.
const POST_PRESETS = [
  { id: 'anatomical', label: 'Anatomically correct', text: 'anatomically correct human body, perfect anatomy, correct realistic proportions, well-formed hands, naturally connected limbs, complete coherent body structure' },
  { id: 'cgi-artwork', label: 'CGI Artwork', text: '(((breathtaking cinematic CGI artwork. Highly detailed 3D rendering with sophisticated materials and intricate textures, luminous volumetric lighting, atmospheric haze, realistic light diffusion and shadow interaction, deep environmental layering, exquisite depth and dimensionality; cinematic composition, dramatic illumination, subtle depth of field, rich surface detail, polished high-end rendering, immersive atmosphere and exceptional visual fidelity.)))' },
  { id: 'cgi-cinematic', label: 'CGI Cinematic', text: '(((breathtaking high-end cinematic CGI render. Ultra-detailed 3D rendering, physically based materials and realistic textures, sophisticated volumetric lighting, global illumination, ray-traced reflections and shadows, exquisite depth and dimensionality; cinematic composition, atmospheric perspective, subtle depth of field, realistic light scattering, intricate surface detail, polished professional rendering, stunning visual fidelity and flawless technical execution.)))' },
  { id: 'gothic-horror-painting', label: 'Gothic horror painting', text: 'traditional oil painting, gothic horror, moody lighting, chiaroscuro, desaturated colors, victorian macabre, detailed textures, eerie atmosphere, visible brushstrokes, rich impasto texture, classical composition, museum masterpiece, highly detailed, painterly concept art, best quality' },
  { id: 'hyperreal-painting', label: 'Hyper-realistic painting', text: '(((breathtaking hyper-realistic oil painting. Oil painting masterpiece, *alla prima* style, featuring subtle, fine brushstrokes and hyper-realistic, detailed, and volumetric rendering; exquisite composition of color, light, and shadow; masterful brushwork and flawless technique.)))' },
  { id: 'hyperdetailed', label: 'Hyperdetailed', text: 'obsessive levels of intricate detail across the entire image, from the main subject to foreground, midground and background. Hyper-detailed textures, realistic materials, subtle imperfections, rich micro-details, volumetric lighting, atmospheric depth, visible light scattering through the air, complex color interplay, intricate composition, natural depth of field, realistic reflections, nuanced shadows and highlights, lifelike optical detail, cinematic clarity, immersive environmental detail, physically plausible light and textures' },
  { id: 'artificial-env', label: 'Improve artificial environment', text: 'intricate architectural detail, layered surfaces, realistic wear and aging, subtle imperfections, complex materials, environmental clutter, functional objects, believable construction details, coherent spatial geometry and lived-in realism' },
  { id: 'natural-env', label: 'Improve natural environment', text: 'chaotic organic complexity, natural asymmetry, irregular growth patterns, layered vegetation, scattered debris, weathered surfaces, subtle erosion, organic imperfections, ecological density and uncontrolled natural entropy' },
  { id: 'realistic', label: 'Realistic', text: 'breathtaking photorealistic macro photography, HD RAW, professional camera, cinematic lens, razor-sharp focal detail' },
];
const PRE_PRESETS = [
  { id: 'perfect-hands', label: 'Perfect hands', text: '(well-formed hands, with prefect fingers), (perfect two arms, with hands with three fingers), (her fingers are naturally positioned, showing clean fingernails, detailed knuckles, and proper anatomical proportions)' },
  { id: 'perfect-heels', label: 'Perfect heels', text: '(well-drawn heels shoes)' },
];
const NEG_PRESETS = [
  { id: 'base', label: 'Base', text: 'bad anatomy, bad hands, three hands, three legs, bad arms, missing legs, missing arms, poorly drawn face, bad face, fused face, cloned face, worst face, three crus, extra crus, fused crus, worst feet, three feet, fused feet, fused thigh, three thigh, fused thigh, extra thigh, worst thigh, missing fingers, extra fingers, ugly fingers, long fingers, horn, realistic photo, extra eyes, huge eyes, 2girl, amputation, disconnected limbs' },
];

(function() {
  let __proPresetInstances = [];
  function loadSelected(storeKey, presets) {
    try {
      let ids = JSON.parse(localStorage.getItem(storeKey) || '[]');
      return Array.isArray(ids) ? ids.filter(id => presets.some(p => p.id === id)) : [];
    } catch (e) { return []; }
  }
  function saveSelected(storeKey, ids) {
    try { localStorage.setItem(storeKey, JSON.stringify(ids)); } catch (e) {}
  }
  function fireInput(ta) {
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function appendText(ta, text) {
    if (ta.value.includes(text)) return;
    let v = ta.value.replace(/[\s,]+$/, '');
    ta.value = v ? v + '\n\n' + text : text;
    fireInput(ta);
  }
  function removeText(ta, text) {
    let i = ta.value.indexOf(text);
    if (i < 0) return;
    let nv = (ta.value.slice(0, i) + ta.value.slice(i + text.length))
      .replace(/\s*,\s*,\s*/g, ', ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s*[,\s]+/, '')
      .replace(/[,\s]+$/, '')
      .replace(/ {2,}/g, ' ')
      .trim();
    ta.value = nv;
    fireInput(ta);
  }
  function updateCountBadge(ta, n) {
    let wrap = ta.closest('.input-ctn');
    let label = wrap && wrap.querySelector('.input-label');
    if(!label) return;
    let badge = label.querySelector('.post-preset-count');
    if(!badge) {
      badge = document.createElement('span');
      badge.className = 'post-preset-count';
      let tip = label.querySelector('.input-tip-btn');
      if(tip && tip.after) tip.after(badge);
      else label.appendChild(badge);
    }
    badge.textContent = n;
    badge.hidden = !n;
  }
  function renderUI(ta, cfg, dropBtn, menu, tagsBox, selected) {
    let left = cfg.presets.filter(p => !selected.includes(p.id));
    if (cfg.textarea === 'prePrompt' || cfg.textarea === 'postPrompt') left.sort((a, b) => a.label.localeCompare(b.label));
    dropBtn.disabled = left.length === 0;
    dropBtn.innerHTML = left.length === 0 ? 'All presets added ✓' : '＋ Add preset... ▾';
    menu.innerHTML = '';
    for (let p of left) {
      let item = document.createElement('div');
      item.className = 'post-preset-item';
      item.textContent = p.label;
      item.onclick = () => {
        selected.push(p.id);
        saveSelected(cfg.storeKey, selected);
        appendText(ta, p.text);
        menu.hidden = true;
        renderUI(ta, cfg, dropBtn, menu, tagsBox, selected);
      };
      menu.appendChild(item);
    }
    tagsBox.innerHTML = '';
    for (let id of selected) {
      let p = cfg.presets.find(q => q.id === id);
      if (!p) continue;
      let chip = document.createElement('span');
      chip.className = 'post-preset-tag';
      chip.textContent = p.label + ' ';
      let x = document.createElement('button');
      x.type = 'button';
      x.className = 'post-preset-x';
      x.textContent = '✕';
      x.title = 'Remove ' + p.label;
      x.onclick = () => {
        selected.splice(selected.indexOf(id), 1);
        saveSelected(cfg.storeKey, selected);
        removeText(ta, p.text);
        renderUI(ta, cfg, dropBtn, menu, tagsBox, selected);
      };
      chip.appendChild(x);
      tagsBox.appendChild(chip);
    }
    updateCountBadge(ta, selected.length);
  }
  function enhance(ta, cfg) {
    if (ta.dataset.presetsDone) return;
    ta.dataset.presetsDone = '1';
    let inner = ta.closest('.input-inner');
    if (!inner) return;
    let ctn = document.createElement('div');
    ctn.className = 'post-preset-ctn';
    let dropWrap = document.createElement('div');
    dropWrap.className = 'post-preset-dropwrap';
    let dropBtn = document.createElement('button');
    dropBtn.type = 'button';
    dropBtn.className = 'btn btn-outline-secondary btn-sm post-preset-dropbtn';
    let menu = document.createElement('div');
    menu.className = 'post-preset-menu';
    menu.hidden = true;
    let tagsBox = document.createElement('div');
    tagsBox.className = 'post-preset-tags';
    dropWrap.appendChild(dropBtn);
    dropWrap.appendChild(menu);
    ctn.appendChild(dropWrap);
    ctn.appendChild(tagsBox);
    inner.appendChild(ctn);
    let selected = loadSelected(cfg.storeKey, cfg.presets);
    for (let p of cfg.presets) {
      if (!selected.includes(p.id) && ta.value.includes(p.text)) selected.push(p.id);
    }
    for (let id of selected) {
      let p = cfg.presets.find(q => q.id === id);
      if (p && !ta.value.includes(p.text)) appendText(ta, p.text);
    }
    saveSelected(cfg.storeKey, selected);
    renderUI(ta, cfg, dropBtn, menu, tagsBox, selected);
    dropBtn.onclick = (e) => {
      e.stopPropagation();
      let wasHidden = menu.hidden;
      closeAllPresetMenus();
      menu.hidden = !wasHidden;
    };
    __proPresetInstances.push({ta: ta, cfg: cfg, dropBtn: dropBtn, menu: menu, tagsBox: tagsBox, selected: selected});
  }
  function closeAllPresetMenus(except) {
    document.querySelectorAll('.post-preset-menu').forEach(m => {
      if(m !== except) m.hidden = true;
    });
  }
  if(!window.__proPresetsGlobalCloser) {
    window.__proPresetsGlobalCloser = true;
    document.addEventListener('click', (e) => {
      if(!e.target.closest || !e.target.closest('.post-preset-dropwrap')) closeAllPresetMenus();
    });
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape') closeAllPresetMenus();
    });
  }
  const CFGS = [
    { textarea: 'prePrompt', storeKey: 'xenPrePresets', presets: PRE_PRESETS },
    { textarea: 'postPrompt', storeKey: 'xenPostPresets', presets: POST_PRESETS },
    { textarea: 'negative', storeKey: 'xenNegPresets', presets: NEG_PRESETS },
  ];
  window.clearProPresets = function() {
    for(let inst of __proPresetInstances) {
      inst.selected.length = 0;
      saveSelected(inst.cfg.storeKey, inst.selected);
      renderUI(inst.ta, inst.cfg, inst.dropBtn, inst.menu, inst.tagsBox, inst.selected);
    }
    for(let cfg of CFGS) {
      try { localStorage.removeItem(cfg.storeKey); } catch(e) {}
    }
  };
  window.syncProPresets = function() {
    for(let inst of __proPresetInstances) {
      let found = inst.cfg.presets.filter(p => inst.ta.value.includes(p.text)).map(p => p.id);
      inst.selected.length = 0;
      for(let id of found) inst.selected.push(id);
      saveSelected(inst.cfg.storeKey, inst.selected);
      renderUI(inst.ta, inst.cfg, inst.dropBtn, inst.menu, inst.tagsBox, inst.selected);
    }
  };
  function scan(muts) {
    if(muts) {
      let maybe = false;
      for(let m of (muts || [])) {
        for(let n of m.addedNodes) {
          if(!n || n.nodeType !== 1) continue;
          if(n.matches && n.matches('textarea, input, select')) { maybe = true; break; }
          if(n.querySelector && n.querySelector('textarea, input, select')) { maybe = true; break; }
        }
        if(maybe) break;
      }
      if(!maybe) return;
    }
    let allDone = true;
    for (let cfg of CFGS) {
      let ta = document.querySelector('textarea[data-name="' + cfg.textarea + '"]');
      if(!ta) { allDone = false; continue; }
      if(!ta.dataset.presetsDone) enhance(ta, cfg);
    }
    if(allDone && muts && typeof offProDomChange === 'function') offProDomChange(scan);
  }
  function ready(fn) {
    let tries = 0;
    (function poll() {
      let s = (typeof getFrameworkSettings === 'function' ? getFrameworkSettings() : null);
      let u = s && s.userInputs;
      if (u && u.prePrompt && u.prePrompt._element && u.postPrompt && u.postPrompt._element && u.negative && u.negative._element) setTimeout(fn, 300);
      else if (tries++ < 100) setTimeout(poll, 200);
      else fn();
    })();
  }
  if (typeof onProDomChange === 'function') onProDomChange(scan);
  ready(scan);
})();
