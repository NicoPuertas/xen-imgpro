// Reset-to-defaults: restores the values listed in src/defaults.json
// (edit that file to change the defaults — no code changes needed).
// Selects are matched by option text; text fields are set to the JSON
// value. Seed, image title and notepad are NOT listed, so never touched.
let __proDefaultsCache = null;
async function loadProDefaults() {
  if(__proDefaultsCache) return __proDefaultsCache;
  let r = await fetch("src/defaults.json", {cache: "no-store"});
  if(!r.ok) throw new Error("defaults.json not found");
  __proDefaultsCache = await r.json();
  return __proDefaultsCache;
}
function fireProChange(el) {
  // Single implementation lives in shared.js; kept as a thin alias.
  if (typeof fireInputEvents === "function") { fireInputEvents(el); return; }
  try { el.dispatchEvent(new Event("input", {bubbles: true})); } catch(e) {}
  try { el.dispatchEvent(new Event("change", {bubbles: true})); } catch(e) {}
  try { if(typeof el.oninput === "function") el.oninput({}); } catch(e) {}
  try { if(typeof el.onchange === "function") el.onchange({}); } catch(e) {}
}
function clearGeneratedImages() {
  let out = document.getElementById("outputAreaEl");
  if(!out) return;
  try { out.querySelectorAll(".t2i-embed-wrap").forEach(w => { try { w.__dispose && w.__dispose(); } catch(e) {} }); } catch(e) {}
  try { out.querySelectorAll("iframe").forEach(fr => { try { fr.src = "about:blank"; } catch(e) {} }); } catch(e) {}
  let msg = "Set inputs and click <i>generate</i> to begin.";
  try {
    let m = null;
    if(typeof root !== "undefined" && root.settings && root.settings.introMessage) m = String(root.settings.introMessage.evaluateItem || root.settings.introMessage);
    else if(window.___userSettings746291937 && window.___userSettings746291937.introMessage) m = String(window.___userSettings746291937.introMessage);
    if(m) msg = m;
  } catch(e) {}
  out.innerHTML = "<span>" + msg + "</span>";
  let main = document.getElementById("mainColumnEl85394739");
  if(main) main.style.maxWidth = "";
}
async function resetToDefaults() {
  try {
    let defaults = await loadProDefaults();
    let applied = 0, skipped = [];
    for(let name of Object.keys(defaults)) {
      let el = (typeof getUserInputEl === "function" && getUserInputEl(name)) || null;
      if(!el || typeof el.value !== "string") { skipped.push(name); continue; }
      if(el.tagName === "SELECT") {
        let want = String(defaults[name]).trim();
        let opt = [...el.options].find(o => (o.textContent || "").trim() === want);
        if(!opt) { skipped.push(name); continue; }
        if(el.selectedIndex !== opt.index) {
          el.selectedIndex = opt.index;
          fireProChange(el);
        }
      } else {
        let want = String(defaults[name]);
        if(el.value !== want) {
          el.value = want;
          fireProChange(el);
        }
      }
      try { localStorage["rememberedInput_P9hkcjnv92hfO2bf9hiu_" + name] = el.value; } catch(e) {}
      applied++;
    }
    try { if(typeof window.clearProPresets === "function") window.clearProPresets(); } catch(e) {}
    try { clearGeneratedImages(); } catch(e) {}
    try { if(typeof window.__proResetVary === "function") window.__proResetVary(); } catch(e) {}
    try { if(typeof window.__proResetStyleCompare === "function") window.__proResetStyleCompare(); } catch(e) {}
    try { if(typeof window.__refreshBottomDock === "function") window.__refreshBottomDock(); } catch(e) {}
    let msg = applied ? "Defaults restored (" + applied + " fields)" + (skipped.length ? ", " + skipped.length + " skipped" : "") : "No defaults applied";
    if(typeof showToast === "function") showToast(msg, !applied);
    return {applied: applied, skipped: skipped};
  } catch(e) {
    if(typeof showToast === "function") showToast("Reset failed: " + (e && e.message || e), true);
    return {applied: 0, error: String(e && e.message || e)};
  }
}
window.resetToDefaults = resetToDefaults;
