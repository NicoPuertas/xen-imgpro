// Loads src/lib/inspector/passes.js into a stubbed sandbox and drives the retry loop with fake generations + judge.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../generator/src/lib/inspector/passes.js", import.meta.url), "utf8");

function sandbox({ scores, genFail = [] }) {
  const listeners = [];
  let call = 0, gens = 0;
  const el = () => ({ style: {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, remove() {}, setAttribute() {}, insertBefore() {}, addEventListener() {} });
  const ctn = { isConnected: true, __negative: "", querySelector: () => null, querySelectorAll: () => [] };
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Number, String, Object, Error, isFinite, parseInt,
    PRO_FRAMEWORK: { imageCtnSelector: ".t2i-image-ctn" },
    getUserInputEl: () => ({ value: "5 (default)" }),
    getImageData: () => ({ prompt: "p", negativePrompt: "extra fingers", seed: -1, resolution: "512x512", iframeId: "x" }),
    makeImageActionButton: () => el(), makeSaveButton: () => el(), saveToGalleryWithFly() {}, openInspectorAttempts() {},
    iframeSizeFor: () => "", getComputedStyle: () => ({ position: "relative" }),
    fetch: async () => ({ blob: async () => ({}) }),
    root: { aiTextPlugin: async () => ({ text: " " + scores[call++] + "\nDEFECTS: bad hands" }) },
    document: { createElement: el, body: el(), querySelectorAll: () => [] },
    Image: class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } },
    window: { addEventListener: (t, f) => listeners.push(f), removeEventListener() {} },
  };
  ctx.window.input = { passes: "5" };
  vm.createContext(ctx);
  vm.runInContext(src.replace("function inspGenerate(", "function __orig(") + `
    var __gens = []; function inspGenerate(base, seed) { __gens.push(seed); return Promise.resolve({ dataUrl: "data:image/png;base64,G" + __gens.length }); }
    window.__run = inspRun; window.__gens = __gens;`, ctx);
  return { ctx, ctn };
}

test("stops at first accepted try, same seed, keeps best", async () => {
  const { ctx, ctn } = sandbox({ scores: ["4", "6", "9", "2"] });
  ctn.querySelector = (q) => (q === "iframe" ? { parentElement: null, style: {}, offsetWidth: 1, offsetLeft: 0 } : null);
  await ctx.window.__run(ctn, { dataUrl: "data:image/png;base64,F", seedUsed: 777 }, 5);
  const run = ctn.__inspRun;
  assert.equal(run.attempts.map((a) => a.status).join(), "rejected,rejected,accepted");
  assert.equal(JSON.stringify(ctx.window.__gens), "[777,777]");
  assert.equal(run.winner, 2);
  assert.equal(run.stoppedEarly, true);
  assert.equal(run.attempts[0].dataUrl, null);
  assert.ok(run.attempts[2].dataUrl);
});

test("no accepted try: highest score wins, all tries used", async () => {
  const { ctx, ctn } = sandbox({ scores: ["4", "7", "5"] });
  ctn.querySelector = (q) => (q === "iframe" ? { parentElement: null, style: {}, offsetWidth: 1, offsetLeft: 0 } : null);
  await ctx.window.__run(ctn, { dataUrl: "data:image/png;base64,F", seedUsed: 1 }, 3);
  assert.equal(ctn.__inspRun.winner, 1);
  assert.equal(ctn.__inspRun.attempts.length, 3);
});
