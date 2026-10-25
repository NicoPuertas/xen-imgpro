// Loads src/lib/inspector/passes.js into a stubbed sandbox and drives the retry loop with fake generations + judge.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("../generator/src/lib/inspector/passes.js", import.meta.url), "utf8");

function sandbox({ scores, hands }) {
  const listeners = [];
  let call = 0, handsCall = 0;
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
    root: { aiTextPlugin: async ({ instruction }) => {
      if (String(instruction[0]).includes("ONE thing: hands")) { const h = (hands && hands[handsCall++]) || "left hand: 5 digits, normal\nVERDICT: OK"; return { text: " " + h }; }
      const v = scores[call++]; const [sc, d, hl] = String(v).split("|");
      return { text: " " + (hl || "left hand: 5 digits, normal") + "\nFACE: ok\nOTHER: ok\nSCORE: " + sc + "\nDEFECTS: " + (d || "none visible") };
    } },
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

test("score 8 with listed defects is rejected; clean 8 is accepted", async () => {
  const { ctx, ctn } = sandbox({ scores: ["8|bad hands, fused fingers", "8|none visible"] });
  ctn.querySelector = (q) => (q === "iframe" ? { parentElement: null, style: {}, offsetWidth: 1, offsetLeft: 0 } : null);
  await ctx.window.__run(ctn, { dataUrl: "data:image/png;base64,F", seedUsed: 5 }, 4);
  const run = ctn.__inspRun;
  assert.equal(run.attempts.map((a) => a.status).join(), "rejected,accepted");
  assert.equal(run.winner, 1);
});

test("judge number is overridden when its own HANDS line reports a bad hand", async () => {
  const { ctx, ctn } = sandbox({ scores: ["9|none visible|left hand: 6 digits, extra finger", "9|none visible|right hand: 5 digits, normal"] });
  ctn.querySelector = (q) => (q === "iframe" ? { parentElement: null, style: {}, offsetWidth: 1, offsetLeft: 0 } : null);
  await ctx.window.__run(ctn, { dataUrl: "data:image/png;base64,F", seedUsed: 5 }, 3);
  const a = ctn.__inspRun.attempts;
  assert.equal(a[0].status, "rejected");
  assert.ok(a[0].score <= 5 && /6 fingers/.test(a[0].defects), a[0].defects);
  assert.equal(a[1].status, "accepted");
});

test("hands-only second opinion can veto an otherwise accepted try", async () => {
  const { ctx, ctn } = sandbox({ scores: ["10", "10"], hands: ["right hand: 4 digits, fused\nVERDICT: BAD"] });
  ctn.querySelector = (q) => (q === "iframe" ? { parentElement: null, style: {}, offsetWidth: 1, offsetLeft: 0 } : null);
  await ctx.window.__run(ctn, { dataUrl: "data:image/png;base64,F", seedUsed: 5 }, 3);
  const a = ctn.__inspRun.attempts;
  assert.equal(a[0].status, "rejected");
  assert.equal(a[1].status, "accepted");
});

test("hand text parsing", () => {
  const { ctx } = sandbox({ scores: [] });
  const p = (t) => ctx.inspHandsProblem(t);
  assert.equal(p("left hand: 5 digits, normal"), "");
  assert.equal(p("left hand: 4 fingers and a thumb, normal"), "");
  assert.equal(p("none visible"), "");
  assert.equal(p("no extra fingers, not fused, 5 digits"), "");
  assert.match(p("right hand: 6 digits"), /6 fingers/);
  assert.match(p("two fingers fused"), /fused/);
});
