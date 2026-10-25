(function() {
  // Top bar for each private-gallery frame (mirrors the plugin's bottom
  // bar, but pinned to the top of the image). It holds a single button that
  // shows the image's seed and copies it on click.
  // The gallery itself is built by the create-media-gallery-plugin import
  // (read-only), so the bar is injected into each
  // `[data-local-media-gallery-item]` via the central dispatcher.

  function toast(msg, isError) {
    if (typeof showToast === "function") showToast(msg, isError);
    else alert(msg);
  }

  async function copyText(text) {
    if (typeof copyTextToClipboard === "function") {
      try { return await copyTextToClipboard(text); }
      catch (e) { /* fall through to legacy paths */ }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      let ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  // Same IndexedDB store the gallery plugin uses internally:
  // pre = "localMediaGallery_.", blobs live in kv[pre + "blobs"].
  async function loadSeedForItem(itemEl) {
    let id = itemEl ? itemEl.dataset.id : null;
    if (!id) return null;
    try {
      let proxy = window.__kvPluginProxy7583683;
      if (proxy) {
        let rec = await proxy["localMediaGallery_.blobs"].get(id);
        if (rec) {
          let info = rec.info || {};
          if (info && info.seed !== undefined && info.seed !== null) return String(info.seed);
        }
      }
    } catch (e) {
      console.warn("gallery seed bar: kv read failed", e);
    }
    return null;
  }

  async function onSeedClick(e, btn) {
    e.stopPropagation();
    if (btn.dataset.busy || btn.disabled) return;
    let item = btn.closest("[data-local-media-gallery-item]");
    if (!item) return;
    btn.dataset.busy = "1";
    btn.disabled = true;
    let seed = btn.dataset.seed;
    if (seed === undefined || seed === null) seed = await loadSeedForItem(item);
    if (seed === null || seed === "" || seed === "undefined") {
      toast("No seed stored for this image.", true);
    } else if (seed === "-1") {
      toast("This image was saved with a random seed (−1).", true);
    } else {
      let ok = await copyText(seed);
      if (ok) toast("Seed " + seed + " copied to clipboard");
      else toast("Failed to copy seed. Seed is: " + seed, true);
    }
    delete btn.dataset.busy;
    btn.disabled = false;
  }

  function injectSeedBar(item) {
    if (item.querySelector("[data-pro-topbar]")) return;
    let bar = document.createElement("div");
    bar.setAttribute("data-pro-topbar", "1");

    let btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-pro-seed-btn", "1");
    btn.textContent = "📋 …";
    btn.title = "Copy this image's seed to clipboard";
    btn.onclick = function(e) { onSeedClick(e, btn); };
    bar.appendChild(btn);
    item.appendChild(bar);

    // Fill in the real seed once loaded (kept in dataset for the click).
    loadSeedForItem(item).then(function(seed) {
      if (!btn.isConnected) return;
      if (seed !== null && seed !== "" && seed !== "undefined" && seed !== "-1") {
        btn.dataset.seed = seed;
        btn.textContent = "📋 " + seed;
        btn.title = "Seed: " + seed + " — click to copy";
      } else {
        btn.textContent = "📋 no seed";
        btn.title = seed === "-1"
          ? "This image was saved with a random seed (−1)"
          : "No seed stored for this image";
      }
    });
  }

  function scanSeedBars(muts) {
    if (muts) {
      for (let m of muts) {
        for (let n of m.addedNodes) {
          if (!n || n.nodeType !== 1) continue;
          if (n.matches && n.matches("[data-local-media-gallery-item]")) injectSeedBar(n);
          else if (n.querySelectorAll && n.querySelector("[data-local-media-gallery-item], #localMediaGallery_root")) {
            n.querySelectorAll("[data-local-media-gallery-item]").forEach(injectSeedBar);
          }
        }
      }
      return;
    }
    document.querySelectorAll("[data-local-media-gallery-item]").forEach(injectSeedBar);
  }

  onProDomChange(function(muts) { scanSeedBars(muts); });
  scanSeedBars();
})();
