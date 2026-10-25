
(function() {
  // Adds a "upscale image" button to every private-gallery photo bar
  // (next to delete/move/rate/download/info). The gallery itself is built
  // by the create-media-gallery-plugin import (read-only), so the button is
  // injected into each `[data-local-media-gallery-bar]` via the central
  // dispatcher. Clicking it loads the stored blob, converts it to a data
  // URL, shows the same bigger.pics confirmation used by the main image
  // frames, and hands over to the framework's existing upscale protocol
  // (`window.t2i_pendingUpscales` + `window.t2i_showUpscaleLightbox`), so the
  // upscaled result can be privately saved / downloaded from there.

  function toast(msg, isError) {
    if (typeof showToast === "function") showToast(msg, isError);
    else alert(msg);
  }

  function cleanInputs(info) {
    let out = {};
    for (let k of ["prompt", "negativePrompt", "seed", "guidanceScale"]) {
      try {
        let v = info ? info[k] : undefined;
        if (v === undefined || v === null || String(v) === "undefined") continue;
        out[k] = v;
      } catch (e) {}
    }
    return out;
  }

  // Same IndexedDB store the gallery plugin uses internally:
  // pre = "localMediaGallery_.", blobs live in kv[pre + "blobs"].
  async function loadGalleryBlob(id, itemEl) {
    let blob = null, info = {};
    try {
      let proxy = window.__kvPluginProxy7583683;
      if (proxy) {
        let rec = await proxy["localMediaGallery_.blobs"].get(id);
        if (rec) {
          if (rec.buffer) {
            blob = new Blob([rec.buffer], { type: rec.type || "image/jpeg" });
            info = rec.info || {};
          } else if (rec.blob instanceof Blob) {
            blob = rec.blob;
            info = rec.info || {};
          } else if (rec instanceof Blob) {
            blob = rec;
          }
        }
      }
    } catch (e) {
      console.warn("gallery upscale: kv read failed, falling back to DOM", e);
    }
    if (!blob) {
      let img = itemEl ? itemEl.querySelector("img") : null;
      if (img && img.src) blob = await fetch(img.src).then(function(r) { return r.blob(); });
    }
    return { blob: blob, info: info };
  }

  function blobToDataUrl(blob) {
    return new Promise(function(res, rej) {
      let fr = new FileReader();
      fr.onload = function() { res(fr.result); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  // Install the framework's bigger.pics message listener if the user never
  // upscaled from the main frames (the framework only installs it inside
  // `t2i_startUpscale`). Identical logic, so the framework skips its own
  // install later and results are never double-sent.
  function ensureUpscaleListener() {
    if (window.t2i_upscaleListenerAdded) return;
    window.t2i_upscaleListenerAdded = true;
    window.addEventListener("message", function(e) {
      if (e.origin !== "https://app.bigger.pics") return;
      if (e.data && e.data.type === "bigger-pics-ready") {
        let top = null; try { top = e.source.top; } catch (err) {}
        let entries = Array.from(window.t2i_pendingUpscales || []);
        let match = entries.find(function(entry) {
          return entry[1].popup === top || entry[1].popup === e.source;
        }) || entries.reverse().find(function(entry) { return !entry[1].sent; });
        if (!match) return;
        let pending = match[1];
        pending.sent = true;
        e.source.postMessage({
          type: "bigger-pics-image",
          url: pending.output.dataUrl,
          name: "perchance-" + ((pending.output.inputs && pending.output.inputs.seed) || "image") + ".jpg",
          site: "perchance.org/" + window.generatorName,
          format: "jpeg",
          context: match[0]
        }, "https://app.bigger.pics");
      } else if (e.data && e.data.type === "bigger-pics-result" && e.data.blob) {
        let pending = e.data.context !== undefined && window.t2i_pendingUpscales
          ? window.t2i_pendingUpscales.get(e.data.context) : null;
        window.t2i_showUpscaleLightbox(e.data, pending ? pending.output : null);
      }
    });
  }

  function showGalleryUpscaleConfirm(dataUrl, info) {
    document.querySelector(".pro-gallery-upscale-notice")?.remove();
    let tmp = document.createElement("div");
    tmp.innerHTML = '<div class="pro-gallery-upscale-notice" style="position:fixed;inset:0;z-index:10002;display:flex;align-items:center;justify-content:center;padding:0.75rem;background:rgba(0,0,0,0.55);">'
      + '<div class="t2i-upscale-modal" role="dialog" aria-label="Upscale image">'
      + '<div class="t2i-upscale-modal-icon">🔍</div>'
      + '<div class="t2i-upscale-modal-title">Upscale image</div>'
      + '<div class="t2i-upscale-modal-text">This feature uses an external website, <a href="https://bigger.pics" target="_blank" rel="noopener">bigger.pics</a>, to increase the resolution of your image.</div>'
      + '<div class="t2i-upscale-modal-actions">'
      + '<button class="t2i-upscale-btn pro-gallery-upscale-cancel">Cancel</button>'
      + '<button class="t2i-upscale-btn primary pro-gallery-upscale-ok">Okay</button>'
      + '</div></div></div>';
    let overlay = tmp.firstElementChild;
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector(".pro-gallery-upscale-cancel").onclick = function() {
      overlay.remove();
    };
    // Popup blockers require window.open synchronously inside the click, so
    // the data URL is already prepared above and this handler does no awaits.
    overlay.querySelector(".pro-gallery-upscale-ok").onclick = function() {
      window.t2i_pendingUpscales = window.t2i_pendingUpscales || new Map();
      let popup = window.open("https://bigger.pics/", "_blank");
      if (!popup) {
        alert("Your browser blocked the bigger.pics window. Please allow pop-ups for this site and try again.");
        return;
      }
      let id = "t2i-gallery-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      try {
        for (let [oldId, p] of window.t2i_pendingUpscales) {
          if (p.popup === popup || p.popup.closed) window.t2i_pendingUpscales.delete(oldId);
        }
      } catch (e) {}
      window.t2i_pendingUpscales.set(id, {
        imageCtn: null,
        output: { dataUrl: dataUrl, inputs: cleanInputs(info) },
        popup: popup
      });
      ensureUpscaleListener();
      overlay.remove();
    };
    document.body.appendChild(overlay);
  }

  async function onUpscaleClick(e, btn) {
    e.stopPropagation();
    if (btn.dataset.busy) return;
    let item = btn.closest("[data-local-media-gallery-item]");
    if (!item) return;
    btn.dataset.busy = "1";
    btn.disabled = true;
    let orig = btn.textContent;
    btn.textContent = "⏳";
    try {
      let id = item.dataset.id;
      let loaded = await loadGalleryBlob(id, item);
      if (!loaded.blob) {
        toast("Could not load this image for upscaling.", true);
        return;
      }
      if (!loaded.blob.type || !loaded.blob.type.startsWith("image/")) {
        toast("Only images can be upscaled.", true);
        return;
      }
      let dataUrl = await blobToDataUrl(loaded.blob);
      showGalleryUpscaleConfirm(dataUrl, loaded.info);
    } catch (err) {
      console.error("gallery upscale error:", err);
      toast("Upscaling failed to start. Please try again.", true);
    } finally {
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  function injectUpscaleBtn(bar) {
    if (bar.querySelector("[data-pro-upscale]")) return;
    let btn = document.createElement("button");
    btn.dataset.proUpscale = "1";
    btn.title = "Upscale image";
    btn.textContent = "🔍";
    btn.onclick = function(e) { onUpscaleClick(e, btn); };
    bar.appendChild(btn);
  }

  // Mutation batches only scan added nodes for gallery bars; a
  // null/omitted batch (initial call) falls back to a full scan.
  function scanGalleryUpscale(muts) {
    if (muts) {
      for (let m of muts) {
        for (let n of m.addedNodes) {
          if (!n || n.nodeType !== 1) continue;
          if (n.matches && n.matches("[data-local-media-gallery-bar]")) injectUpscaleBtn(n);
          else if (n.querySelectorAll && n.querySelector("[data-local-media-gallery-bar], [data-local-media-gallery-item], #localMediaGallery_root")) {
            n.querySelectorAll("[data-local-media-gallery-bar]").forEach(injectUpscaleBtn);
          }
        }
      }
      return;
    }
    document.querySelectorAll("[data-local-media-gallery-bar]").forEach(injectUpscaleBtn);
  }

  // ------------------------------------------------------------
  // Auto-refresh: when an upscaled image is saved while the gallery is
  // open, the gallery's grid would otherwise stay stale (its item list
  // lives in a closure inside the plugin's show()). So after any external
  // add completes while the gallery root is open, rebuild the gallery view
  // in place — preserving scroll position and sort order — instead of
  // making the user close and reopen it. Debounced so rapid-fire adds
  // (e.g. multi-file imports) trigger a single rebuild.
  // ------------------------------------------------------------
  function installShowWrap() {
    if (window.__proGalleryShowWrapInstalled) return true;
    let g = window.t2i_privateGallery;
    if (!g || typeof g.show !== "function") return false;
    let orig = g.show.bind(g);
    g.show = function() {
      // Remember the page overflow from before the gallery opened, so a
      // refresh-reopen below can restore it first (otherwise the nested
      // show() would capture "hidden" and closing would stick the page).
      if (!document.getElementById("localMediaGallery_root")) {
        try {
          window.__proGalleryOrigOverflow = {
            html: document.documentElement.style.overflow,
            body: document.body.style.overflow
          };
        } catch (e) {}
      }
      return orig.apply(undefined, arguments);
    };
    window.__proGalleryShowWrapInstalled = true;
    return true;
  }

  function refreshOpenGallery() {
    let oldRoot = document.getElementById("localMediaGallery_root");
    if (!oldRoot) return;
    let oldItems = oldRoot.querySelectorAll("[data-local-media-gallery-item]");
    let oldGrid = oldItems.length ? oldItems[0].parentElement : null;
    let scrollTop = 0;
    try { scrollTop = oldGrid ? oldGrid.scrollTop : 0; } catch (e) {}
    let sortVal = null;
    try {
      let sortSel = Array.prototype.find.call(
        oldRoot.querySelectorAll("select"),
        function(s) {
          return Array.prototype.some.call(s.options, function(o) { return o.value === "dateDesc"; });
        }
      );
      sortVal = sortSel ? sortSel.value : null;
    } catch (e) {}
    // Restore pre-gallery overflow first so the nested show() below
    // captures correct values for its own close handler.
    try {
      let saved = window.__proGalleryOrigOverflow;
      if (saved) {
        document.documentElement.style.overflow = saved.html;
        document.body.style.overflow = saved.body;
      }
    } catch (e) {}
    try { window.t2i_privateGallery.show(); } catch (e) { console.error(e); return; }
    (async function() {
      for (let i = 0; i < 50; i++) {
        await new Promise(function(r) { setTimeout(r, 100); });
        let root = document.getElementById("localMediaGallery_root");
        if (!root) return;
        let items = root.querySelectorAll("[data-local-media-gallery-item]");
        if (!items.length) continue;
        try {
          if (sortVal) {
            let newSort = Array.prototype.find.call(
              root.querySelectorAll("select"),
              function(s) {
                return Array.prototype.some.call(s.options, function(o) { return o.value === "dateDesc"; });
              }
            );
            if (newSort && newSort.value !== sortVal) {
              newSort.value = sortVal;
              if (typeof newSort.onchange === "function") newSort.onchange();
            }
          }
          items[0].parentElement.scrollTop = scrollTop;
        } catch (e) {}
        try { if (window.__refreshBottomDock) window.__refreshBottomDock(); } catch (e) {}
        return;
      }
    })();
  }

  function installAddWrap() {
    if (window.__proGalleryAddRefreshInstalled) return true;
    let g = window.t2i_privateGallery;
    if (!g || typeof g.add !== "function") return false;
    let orig = g.add.bind(g);
    let refreshTimer = null;
    g.add = async function() {
      let id = await orig.apply(undefined, arguments);
      try {
        if (document.getElementById("localMediaGallery_root")) {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(function() {
            try { refreshOpenGallery(); } catch (e) { console.error(e); }
          }, 600);
        }
      } catch (e) {}
      return id;
    };
    window.__proGalleryAddRefreshInstalled = true;
    return true;
  }

  function installWraps() {
    installShowWrap();
    installAddWrap();
    return window.__proGalleryShowWrapInstalled && window.__proGalleryAddRefreshInstalled;
  }
  if (!installWraps()) {
    let tries = 0;
    let installer = function() {
      if (installWraps() || ++tries > 100) offProDomChange(installer);
    };
    onProDomChange(installer);
    setTimeout(function() { offProDomChange(installer); }, 20000);
  }

  onProDomChange(function(muts) { scanGalleryUpscale(muts); });
  scanGalleryUpscale();
})();
