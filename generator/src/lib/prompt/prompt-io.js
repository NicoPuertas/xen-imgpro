function getPromptIoSettings() {
  try {
    if (typeof getFrameworkSettings === "function") {
      let s = getFrameworkSettings();
      if (s) return s;
    }
  } catch (e) {}
  return window.___userSettings746291937 || null;
}

function getPromptIoEl(name) {
  // Single lookup path lives in framework-adapter.js; kept as a thin alias.
  if (typeof getUserInputEl === "function") return getUserInputEl(name);
  return document.querySelector('[data-name="' + name + '"]') || null;
}

function collectPromptConfig() {
  let s = getPromptIoSettings();
  let values = {};
  let names = s && s.userInputs ? Object.keys(s.userInputs) : [];
  if (!names.length) {
    document.querySelectorAll('#userInputsCtn8462746262 input, #userInputsCtn8462746262 select, #userInputsCtn8462746262 textarea').forEach(el => {
      if (el.dataset && el.dataset.name) names.push(el.dataset.name);
    });
  }
  for (let name of names) {
    let el = getPromptIoEl(name);
    if (el && typeof el.value === "string") values[name] = el.value;
  }
  return {
    app: "xen-image-generator-pro",
    format: 1,
    exportedAt: new Date().toISOString(),
    generator: window.generatorName || null,
    values: values
  };
}

function fireIoEvents(el) {
  // Single implementation lives in shared.js; kept as a thin alias.
  if (typeof fireInputEvents === "function") { fireInputEvents(el); return; }
  try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
  try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
  try { if (typeof el.oninput === "function") el.oninput({}); } catch (e) {}
  try { if (typeof el.onchange === "function") el.onchange({}); } catch (e) {}
}

function applyPromptConfig(values) {
  let applied = [];
  let skipped = [];
  for (let name of Object.keys(values || {})) {
    let el = getPromptIoEl(name);
    if (!el) { skipped.push(name); continue; }
    let v = String(values[name]);
    if ((el.tagName === "SELECT") && ![...el.querySelectorAll("option")].some(o => o.value === v)) {
      skipped.push(name);
      continue;
    }
    try {
      el.value = v;
      fireIoEvents(el);
      applied.push(name);
    } catch (e) {
      skipped.push(name);
    }
  }
  try {
    if (typeof localStorage !== "undefined") {
      for (let n of applied) {
        try {
          let el = getPromptIoEl(n);
          if (el) localStorage["rememberedInput_P9hkcjnv92hfO2bf9hiu_" + n] = el.value;
        } catch (e) {}
      }
    }
  } catch (e) {}
  return { applied: applied, skipped: skipped };
}

function notifyIo(msg, isErr) {
  try {
    if (typeof showToast === "function") { showToast(msg, !!isErr); return; }
  } catch (e) {}
  try { alert(msg); } catch (e2) {}
}

function downloadIoBlob(blob, filename) {
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

function ioTimestamp() {
  let d = new Date();
  let p = n => String(n).padStart(2, "0");
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
}

async function exportPrompts() {
  try {
    let config = collectPromptConfig();
    let json = JSON.stringify(config);
    let base = "prompts-" + ioTimestamp();
    if (typeof CompressionStream !== "undefined") {
      try {
        let stream = new Blob([json], { type: "application/json" }).stream().pipeThrough(new CompressionStream("gzip"));
        let buf = await new Response(stream).arrayBuffer();
        downloadIoBlob(new Blob([buf], { type: "application/gzip" }), base + ".json.gz");
        notifyIo("Prompts exported (" + Object.keys(config.values).length + " fields, gzip)");
        return;
      } catch (e) {}
    }
    downloadIoBlob(new Blob([json], { type: "application/json" }), base + ".json");
    notifyIo("Prompts exported (" + Object.keys(config.values).length + " fields)");
  } catch (e) {
    notifyIo("Export failed: " + (e && e.message || e), true);
  }
}

function exportPromptsAsText() {
  try {
    let get = name => {
      let el = getPromptIoEl(name);
      return el && typeof el.value === "string" ? el.value.trim() : "";
    };
    let text = ["prePrompt", "description", "postPrompt", "negative"]
      .map(get)
      .filter(v => v)
      .join("\n\n");
    downloadIoBlob(new Blob([text], { type: "text/plain" }), "prompts-" + ioTimestamp() + ".txt");
    notifyIo("Prompts exported as text");
  } catch (e) {
    notifyIo("Export failed: " + (e && e.message || e), true);
  }
}

async function readImportedFile(file) {
  let buf = await file.arrayBuffer();
  let bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined") throw new Error("gzip not supported in this browser");
    let out = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    return new TextDecoder().decode(out);
  }
  return new TextDecoder().decode(buf);
}

async function importPromptsFromFile(file) {
  if (!file) return;
  try {
    let text = await readImportedFile(file);
    let config = JSON.parse(text);
    let values = config && (config.values || config.inputs || null);
    if (!values || typeof values !== "object") throw new Error("invalid format (missing 'values')");
    let r = applyPromptConfig(values);
    try { if(typeof window.syncProPresets === "function") window.syncProPresets(); } catch(e) {}
    if (!r.applied.length) notifyIo("No fields applied (incompatible file)", true);
    else notifyIo("Prompts imported: " + r.applied.length + " fields" + (r.skipped.length ? " (" + r.skipped.length + " skipped)" : ""));
  } catch (e) {
    notifyIo("Import failed: " + (e && e.message || e), true);
  }
}

function movePromptIoBar(bar, genRow) {
  let shareBtn = document.getElementById("shareSettingsBtn758374");
  if (shareBtn && shareBtn.parentElement) {
    if (bar.previousElementSibling !== shareBtn) shareBtn.parentElement.insertBefore(bar, shareBtn.nextSibling);
    return true;
  }
  if (genRow && genRow.parentElement) {
    genRow.parentElement.insertBefore(bar, genRow);
    return true;
  }
  return false;
}

function mountPromptIoBar() {
  let old = document.getElementById("promptIoBar");
  if (old && old.dataset.v === "4") { movePromptIoBar(old); return; }
  if (old) old.remove();
  let genBtn = document.getElementById("generateButtonEl");
  if (!genBtn) return false;
  let genRow = genBtn.parentElement;
  while (genRow && genRow.parentElement && genRow.parentElement.id !== "mainColumnEl85394739") genRow = genRow.parentElement;
  if (!genRow || !genRow.parentElement) return false;
  let bar = document.createElement("div");
  bar.id = "promptIoBar";
  bar.dataset.v = "4";
  let exp = document.createElement("button");
  exp.type = "button";
  exp.className = "prompt-io-link";
  exp.innerHTML = '<i class="bi bi-box-arrow-up"></i>export';
  exp.title = "Export all prompt fields to a file (.json.gz)";
  exp.onclick = exportPrompts;
  let imp = document.createElement("button");
  imp.type = "button";
  imp.className = "prompt-io-link";
  imp.innerHTML = '<i class="bi bi-box-arrow-down"></i>import';
  imp.title = "Import all prompt fields from a file (.json / .json.gz)";
  let file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,.json.gz,.gz,application/json,application/gzip";
  file.hidden = true;
  file.onchange = () => { importPromptsFromFile(file.files && file.files[0]); file.value = ""; };
  imp.onclick = () => file.click();
  let txt = document.createElement("button");
  txt.type = "button";
  txt.className = "prompt-io-link";
  txt.innerHTML = '<i class="bi bi-file-text"></i>export to text';
  txt.title = "Export pre-prompt, prompt, post-prompt and negative prompt as a plain .txt file";
  txt.onclick = exportPromptsAsText;
  bar.appendChild(exp);
  bar.appendChild(imp);
  bar.appendChild(txt);
  bar.appendChild(file);
  movePromptIoBar(bar, genRow);
  if (!bar.parentElement) return false;
  window.exportPrompts = exportPrompts;
  window.exportPromptsAsText = exportPromptsAsText;
  window.importPromptsFromFile = importPromptsFromFile;
  window.collectPromptConfig = collectPromptConfig;
  window.applyPromptConfig = applyPromptConfig;
  return true;
}

if (!mountPromptIoBar()) {
  if (typeof onProDomChange === "function") {
    let handler = () => {
      if (mountPromptIoBar()) {
        try { offProDomChange(handler); } catch (e) {}
      }
    };
    onProDomChange(handler);
  }
  setTimeout(mountPromptIoBar, 4000);
}
