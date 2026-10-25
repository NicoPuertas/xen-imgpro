(function() {
  function setSeedValue(el, v) {
    el.value = v;
    if (typeof fireInputEvents === 'function') fireInputEvents(el);
    else {
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    }
    updateX(el);
  }
  function updateX(el) {
    let wrap = el.closest('[data-seed-tools]');
    if (!wrap) return;
    let clearBtn = wrap.querySelector('[data-seed-clear]');
    if (clearBtn) clearBtn.hidden = !el.value;
  }
  function extractSeed(text) {
    text = String(text == null ? '' : text).trim();
    if (!text) return null;
    let m = text.match(/\d+/);
    return m ? m[0] : null;
  }
  function toast(msg, isErr) {
    if (typeof showToast === 'function') showToast(msg, isErr);
  }
  function applyText(el, text) {
    let seed = extractSeed(text);
    if (!seed) {
      toast('No seed number found in clipboard', true);
      return false;
    }
    setSeedValue(el, seed);
    toast('Seed pasted: ' + seed);
    return true;
  }
  function isCoarsePointer() {
    try { return window.matchMedia && matchMedia('(pointer:coarse)').matches; }
    catch (e) { return false; }
  }
  function focusFallback(el, msg) {
    try { el.focus(); } catch (e) {}
    try { el.select(); } catch (e) {}
    toast(msg || 'Auto-paste is blocked here — press Ctrl+V (or tap the field → Paste)');
  }

  // The Perchance output iframe only allows `clipboard-write`, not
  // `clipboard-read`, so navigator.clipboard.readText() inside this frame
  // is denied by permissions-policy. Cache that state so a click can open
  // the top-level popup *synchronously* (popup blockers allow it).
  let readBlockedKnown = null;
  try {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'clipboard-read' }).then(
        (r) => {
          readBlockedKnown = (r.state === 'denied');
          try { r.onchange = () => { readBlockedKnown = (r.state === 'denied'); }; } catch (e) {}
        },
        () => { readBlockedKnown = null; }
      );
    }
  } catch (e) {}

  let activePopup = null;
  let activeEl = null;
  let activeDone = false;
  let activePoll = 0;

  function activeCleanup(popup) {
    if (activePoll) { try { clearInterval(activePoll); } catch (e) {} activePoll = 0; }
    if (activePopup === popup || !popup) { activePopup = null; activeEl = null; }
  }

  // Called directly by the top-level popup helper (same-origin
  // about:blank inherits this origin). A direct call — not postMessage —
  // so other message listeners on the page never see it.
  window.__seedPasteApply = function(text) {
    let popup = activePopup, el = activeEl;
    if (!popup || !el || activeDone) return;
    activeDone = true;
    try {
      if (text != null && String(text).trim() !== '') applyText(el, text);
      else focusFallback(el, 'Clipboard is empty — copy a seed first');
    } catch (e) {}
    activeCleanup(popup);
    try { popup.close(); } catch (e) {}
    try { el.focus(); } catch (e) {}
  };

  // Last paste-button click, in screen + frame coords. screenX/Y - clientX/Y
  // = the app frame's viewport origin on the screen, so centering on that
  // puts the popup over the frame whether the app is full-window or docked
  // in the editor preview pane (window.screenX/outerWidth alone can only
  // center on the whole browser window).
  let lastFrameClick = null;
  function noteFrameClick(ev) {
    try {
      if (!ev || typeof ev.screenX !== 'number' || !ev.screenX) return null;
      if (typeof ev.clientX !== 'number' || typeof ev.clientY !== 'number') return null;
      let c = {
        screenX: ev.screenX, screenY: ev.screenY,
        clientX: ev.clientX, clientY: ev.clientY,
        frameW: window.innerWidth || 0, frameH: window.innerHeight || 0,
        t: Date.now()
      };
      lastFrameClick = c;
      return c;
    } catch (e) { return null; }
  }
  function pickFrameClick(ev) {
    let c = null;
    try {
      if (ev && typeof ev.screenX === 'number' && ev.screenX &&
          typeof ev.clientX === 'number' && typeof ev.clientY === 'number') {
        c = {
          screenX: ev.screenX, screenY: ev.screenY,
          clientX: ev.clientX, clientY: ev.clientY,
          frameW: window.innerWidth || 0, frameH: window.innerHeight || 0,
          t: Date.now()
        };
        lastFrameClick = c;
      } else if (lastFrameClick && (Date.now() - lastFrameClick.t) < 10000) {
        c = lastFrameClick;
      }
    } catch (e) { c = null; }
    return c;
  }

  function popupGeometry(w, h, click) {
    // Preferred: center over the app FRAME using the click's screen position.
    // Fallback: center over the browser window (old behavior).
    // Chrome uses left/top, Firefox uses screenX/screenY — pass both.
    try {
      if (screen && screen.availWidth) w = Math.min(w, screen.availWidth - 16);
      if (screen && screen.availHeight) h = Math.min(h, screen.availHeight - 16);
    } catch (e) {}
    try {
      if (click && click.frameW > 0) w = Math.max(280, Math.min(w, click.frameW - 8));
      else {
        let ow0 = 0;
        try { ow0 = window.outerWidth || window.innerWidth || screen.width; } catch (x) {}
        if (ow0) w = Math.max(280, Math.min(w, ow0 - 8 || w));
      }
      if (click && click.frameH > 0) h = Math.max(280, Math.min(h, click.frameH - 8));
      else {
        let oh0 = 0;
        try { oh0 = window.outerHeight || window.innerHeight || screen.height; } catch (x) {}
        if (oh0) h = Math.max(280, Math.min(h, oh0 - 8 || h));
      }
    } catch (e) {}
    if (click && click.screenX && click.frameW > 0 && click.frameH > 0) {
      let originX = click.screenX - click.clientX;
      let originY = click.screenY - click.clientY;
      let left = Math.round(originX + (click.frameW - w) / 2);
      let top = Math.round(originY + (click.frameH - h) / 2);
      return { w: w, h: h, left: Math.max(0, left), top: Math.max(0, top), mode: 'frame' };
    }
    let sx = 0, sy = 0;
    try { sx = (typeof window.screenX === 'number' ? window.screenX : window.screenLeft) || 0; } catch (e) {}
    try { sy = (typeof window.screenY === 'number' ? window.screenY : window.screenTop) || 0; } catch (e) {}
    let ow = 0, oh = 0;
    try { ow = window.outerWidth || window.innerWidth || screen.width; } catch (e) {}
    try { oh = window.outerHeight || window.innerHeight || screen.height; } catch (e) {}
    if (!ow) ow = w;
    if (!oh) oh = h;
    let left = Math.max(0, Math.round(sx + (ow - w) / 2));
    let top = Math.max(0, Math.round(sy + (oh - h) / 2));
    return { w: w, h: h, left: left, top: top, mode: 'window' };
  }

  function openPastePopup(el, ev) {
    let click = pickFrameClick(ev);
    let geo = popupGeometry(400, 430, click);
    let feat = 'popup=yes,width=' + geo.w + ',height=' + geo.h +
      ',left=' + geo.left + ',top=' + geo.top +
      ',screenX=' + geo.left + ',screenY=' + geo.top;
    try {
      if (activePopup && !activePopup.closed) {
        try { activePopup.moveTo(geo.left, geo.top); } catch (e) {}
        try { activePopup.focus(); } catch (e) {}
        return true;
      }
    } catch (e) {}
    activeCleanup(activePopup);
    let popup = null;
    try {
      popup = window.open('about:blank', 'seedPasteHelper', feat);
    } catch (e) { popup = null; }
    if (!popup) return false;
    activePopup = popup;
    activeEl = el;
    activeDone = false;
    // Named windows ignore position/size on reuse — enforce centering.
    try { popup.moveTo(geo.left, geo.top); } catch (e) {}
    try { popup.resizeTo(geo.w, geo.h); } catch (e) {}
    try { popup.focus(); } catch (e) {}
    activePoll = setInterval(() => {
      try {
        if (popup.closed && !activeDone) {
          activeDone = true;
          activeCleanup(popup);
        }
      } catch (e) {}
    }, 500);

    // Inject the helper UI + a script that runs IN the popup's (top-level,
    // policy-free) context. Clipboard must be read there — opener-side code
    // would still be gated by this iframe's permissions-policy.
    try {
      popup.document.title = 'Paste seed — Image Generator PRO';
      popup.document.body.style.cssText = 'margin:0;height:100vh;overflow:hidden;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:16px;background:radial-gradient(120% 120% at 20% 0%,#2b3348 0%,#1b1d21 55%,#141518 100%);font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;';
      let styleEl = popup.document.createElement('style');
      styleEl.textContent =
        'html,body{height:100%;overflow:hidden;margin:0;}' +
        '.seed-card{width:320px;max-width:94vw;margin:auto;background:rgba(36,38,43,.96);border:1px solid #4a4f58;border-radius:14px;padding:18px 18px 14px;box-shadow:0 18px 50px rgba(0,0,0,.55);backdrop-filter:blur(6px);}' +
        '.seed-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;}' +
        '.seed-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-size:17px;background:linear-gradient(135deg,#4d7cfe,#8a5cf6);box-shadow:0 4px 14px rgba(90,110,250,.45);}' +
        '.seed-title{font-weight:700;font-size:14px;color:#f2f2f2;letter-spacing:.2px;}' +
        '.seed-sub{font-size:11px;color:#9aa0a6;}' +
        '.seed-spin{margin-left:auto;width:18px;height:18px;border-radius:50%;border:2px solid #4a4f58;border-top-color:#8a9bff;animation:seedspin .8s linear infinite;}' +
        '@keyframes seedspin{to{transform:rotate(360deg);}}' +
        '.seed-status{font-size:12.5px;color:#c9cdd3;background:#1b1d21;border:1px solid #3a3d42;border-radius:8px;padding:8px 10px;margin-bottom:10px;min-height:34px;}' +
        '.seed-go{display:none;width:100%;padding:10px 12px;cursor:pointer;border:none;border-radius:10px;font-weight:700;font-size:13px;color:#fff;background:linear-gradient(135deg,#4d7cfe,#8a5cf6);box-shadow:0 4px 14px rgba(90,110,250,.4);animation:seedpulse 1.6s ease-in-out infinite;}' +
        '@keyframes seedpulse{0%,100%{transform:scale(1);}50%{transform:scale(1.03);}}' +
        '.seed-go:hover:not(:disabled){filter:brightness(1.1);}' +
        '.seed-go:disabled{opacity:.6;cursor:wait;}' +
        '.seed-manual{display:none;width:100%;height:70px;margin-top:10px;box-sizing:border-box;background:#1b1d21;border:1px solid #3a3d42;color:#e8e8e8;border-radius:8px;padding:8px;font-size:12.5px;resize:vertical;}' +
        '.seed-foot{font-size:11px;color:#8a8f96;margin-top:10px;text-align:center;}';
      popup.document.head.appendChild(styleEl);
      popup.document.body.innerHTML =
        '<div class="seed-card">' +
        '<div class="seed-head"><span class="seed-logo">📋</span>' +
        '<span><div class="seed-title">Paste seed</div><div class="seed-sub">Image Generator PRO helper</div></span>' +
        '<span class="seed-spin" id="spin"></span></div>' +
        '<div class="seed-status" id="st" style="text-align:center">Reading clipboard…</div>' +
        '<button class="seed-go" id="go">🔓 Enable clipboard access</button>' +
        '<textarea class="seed-manual" id="m" placeholder="Press Ctrl+V here, then Enter"></textarea>' +
        '<div class="seed-foot">Centered helper from Image Generator PRO · closes automatically.</div>' +
        '</div>';
      let scr = popup.document.createElement('script');
      scr.textContent =
        "(function(){\n" +
        "var st=document.getElementById('st'),go=document.getElementById('go'),m=document.getElementById('m'),sp=document.getElementById('spin');\n" +
        "function stopSpin(){try{if(sp)sp.style.display='none';}catch(e){}}\n" +
        "function send(t){\n" +
        "  try{\n" +
        "    if(window.opener&&window.opener.__seedPasteApply){window.opener.__seedPasteApply(t);return true;}\n" +
        "  }catch(e){}\n" +
        "  return false;\n" +
        "}\n" +
        "function showCopy(t,hint){\n" +
        "  try{\n" +
        "    stopSpin();\n" +
        "    if(st)st.textContent=hint||'Copy the seed below, close this window, and paste it into the seed field.';\n" +
        "    m.style.display='';m.readOnly=true;m.value=t;\n" +
        "    m.focus();m.select();\n" +
        "  }catch(e){}\n" +
        "}\n" +
        "function manual(hint){\n" +
        "  try{\n" +
        "    stopSpin();\n" +
        "    if(st&&hint)st.textContent=hint;\n" +
        "    if(m&&m.style.display==='none'){\n" +
        "      m.style.display='';\n" +
        "      m.addEventListener('paste',function(){setTimeout(function(){if(m.value&&!send(m.value))showCopy(m.value);},50);});\n" +
        "      m.addEventListener('keydown',function(ev){if(ev.key==='Enter'&&m.value&&!send(m.value))showCopy(m.value);});\n" +
        "    }\n" +
        "  }catch(e){}\n" +
        "}\n" +
        "async function attempt(){\n" +
        "  try{\n" +
        "    var t=await navigator.clipboard.readText();\n" +
        "    if(t&&String(t).trim()){if(!send(t))showCopy(t);return;}\n" +
        "    if(st)st.textContent='Clipboard is empty — copy a seed first.';\n" +
        "    manual(null);\n" +
        "  }catch(e){\n" +
        "    if(st)st.textContent='Click below once to allow clipboard access.';\n" +
        "    try{\n" +
        "      stopSpin();go.style.display='block';\n" +
        "      go.onclick=function(){\n" +
        "        go.disabled=true;\n" +
        "        navigator.clipboard.readText().then(function(t){\n" +
        "          if(t&&String(t).trim()){if(!send(t))showCopy(t);}\n" +
        "          else{if(st)st.textContent='Clipboard is empty.';go.disabled=false;manual(null);}\n" +
        "        },function(){\n" +
        "          if(st)st.textContent='Auto-read blocked. Press Ctrl+V below.';\n" +
        "          go.disabled=false;\n" +
        "          manual(null);\n" +
        "          try{m.focus();}catch(x){}\n" +
        "        });\n" +
        "      };\n" +
        "    }catch(x){manual('Auto-read blocked. Press Ctrl+V below.');}\n" +
        "  }\n" +
        "}\n" +
        "attempt();\n" +
        "})();";
      popup.document.body.appendChild(scr);
    } catch (e) {
      try { popup.close(); } catch (x) {}
      activeDone = true;
      activeCleanup(popup);
      return true;
    }
    return true;
  }

  async function pasteSeed(el, ev) {
    // 1) Direct read — works if the platform ever allows clipboard-read here.
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        let text = await navigator.clipboard.readText();
        if (text != null && String(text).trim() !== '') {
          applyText(el, text);
          return;
        }
        focusFallback(el, 'Clipboard is empty — copy a seed first');
        return;
      }
    } catch (e) {
      // 2) Policy-blocked: break out to a top-level popup (escapes the
      // iframe sandbox via allow-popups-to-escape-sandbox) which CAN read.
      // ev carries the click's screen/client coords so the popup centers
      // over the app frame, not the whole browser window.
      if (!isCoarsePointer()) {
        try {
          if (openPastePopup(el, ev)) return;
        } catch (x) {}
      }
      focusFallback(el);
      return;
    }
    // 3) No async clipboard API at all.
    if (!isCoarsePointer()) {
      try {
        if (openPastePopup(el, ev)) return;
      } catch (e) {}
    }
    focusFallback(el);
  }

  function enhance(seedEl) {
    if (seedEl.dataset.seedToolsDone) return;
    seedEl.dataset.seedToolsDone = '1';
    let holder = seedEl.parentElement;
    holder.dataset.seedTools = '1';
    holder.classList.add('input-group', 'input-group-sm', 'seed-group');
    holder.style.position = '';
    holder.style.width = '';
    seedEl.style.paddingRight = '';
    // Pasting "Seed: 12345" style text straight into the field should just
    // keep the digits — this makes the button's focus-fallback genuinely
    // useful instead of a pointless extra prompt.
    seedEl.addEventListener('paste', (e) => {
      try {
        let t = (e.clipboardData && e.clipboardData.getData('text')) || '';
        if (!t) return;
        let seed = extractSeed(t);
        if (!seed) {
          e.preventDefault();
          toast('No seed number found in pasted text', true);
        } else if (seed !== t.trim()) {
          e.preventDefault();
          setSeedValue(seedEl, seed);
          toast('Seed pasted: ' + seed);
        }
      } catch (x) {}
    });
    let pasteBtn = document.createElement('button');
    pasteBtn.type = 'button';
    pasteBtn.dataset.seedPaste = '1';
    pasteBtn.className = 'btn btn-outline-secondary';
    pasteBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
    pasteBtn.title = 'Paste seed from clipboard';
    pasteBtn.onclick = (ev) => {
      noteFrameClick(ev);
      // Synchronous popup open when we already know direct read is blocked,
      // otherwise popup blockers would eat the async open.
      if (!isCoarsePointer() && readBlockedKnown === true) {
        try {
          if (openPastePopup(seedEl, ev)) return;
        } catch (e) {}
      }
      pasteSeed(seedEl, ev);
    };
    let clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.dataset.seedClear = '1';
    clearBtn.className = 'btn btn-outline-secondary';
    clearBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
    clearBtn.title = 'Clear seed (random)';
    clearBtn.hidden = !seedEl.value;
    clearBtn.onclick = () => {
      setSeedValue(seedEl, '');
      seedEl.focus();
    };
    holder.appendChild(pasteBtn);
    holder.appendChild(clearBtn);
    seedEl.addEventListener('input', () => updateX(seedEl));
  }
  function scan(muts) {
    if(muts) {
      let maybe = false;
      for(let m of (muts || [])) {
        for(let n of m.addedNodes) {
          if(!n || n.nodeType !== 1) continue;
          if(n.matches && n.matches('input, textarea, select')) { maybe = true; break; }
          if(n.querySelector && n.querySelector('input[data-name="seed"]')) {
            enhance(n.matches && n.matches('input[data-name="seed"]') ? n : n.querySelector('input[data-name="seed"]'));
            if(typeof offProDomChange === 'function') offProDomChange(scan);
            return;
          }
          if(n.querySelector && n.querySelector('input, textarea, select')) { maybe = true; break; }
        }
        if(maybe) break;
      }
      if(!maybe) return;
    }
    let el = document.querySelector('input[data-name="seed"]');
    if(!el) return;
    enhance(el);
    if(typeof offProDomChange === 'function') offProDomChange(scan);
  }
  if (typeof onProDomChange === 'function') onProDomChange(scan);
  scan();
})();
