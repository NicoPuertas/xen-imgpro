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
    var __gens = [], __tweaks = []; function inspGenerate(base, seed, tweak) { __gens.push(seed); __tweaks.push(tweak || null); return Promise.resolve({ dataUrl: "data:image/png;base64,G" + __gens.length }); }
    window.__run = inspRun; window.__gens = __gens; window.__tweaks = __tweaks;`, ctx);
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

const iframeStub = () => (q) => (q === "iframe" ? { parentElement: null, style: {}, offsetWidth: 1, offsetLeft: 0 } : null);

test("when nothing is accepted: correct hands > extra finger > malformed hands, regardless of score", async () => {
  const { ctx, ctn } = sandbox({ scores: [
    "5|left hand fused|left hand: 5 digits, fused sausage-like fingers",   // malformed, score 5
    "4|extra finger on right hand|right hand: 6 digits",                   // count only, score 4
    "6|extra digits and distorted anatomy|left hand: 6 digits, distorted",  // malformed, score 6
  ] });
  ctn.querySelector = iframeStub();
  await ctx.window.__run(ctn, { dataUrl: "data:image/png;base64,F", seedUsed: 9 }, 3);
  const a = ctn.__inspRun.attempts;
  assert.equal(a.map((x) => x.handTier).join(), "2,1,2");
  assert.equal(ctn.__inspRun.winner, 1);
});

test("a try with correct hands beats a higher-scored try with extra fingers", async () => {
  const { ctx, ctn } = sandbox({ scores: ["7|extra finger|right hand: 6 digits", "6|slightly soft|left hand: 5 digits, normal"] });
  ctn.querySelector = iframeStub();
  await ctx.window.__run(ctn, { dataUrl: "data:image/png;base64,F", seedUsed: 9 }, 2);
  assert.equal(ctn.__inspRun.winner, 1);
});

test("hand boost escalates after failed hands and never touches try 1", async () => {
  const { ctx, ctn } = sandbox({ scores: ["4|extra finger|right hand: 6 digits", "4|extra finger|left hand: 6 digits", "4|extra finger|left hand: 6 digits", "4|extra finger|left hand: 6 digits", "4|extra finger|left hand: 6 digits"] });
  ctn.querySelector = iframeStub();
  await ctx.window.__run(ctn, { dataUrl: "data:image/png;base64,F", seedUsed: 9 }, 5);
  const t = ctx.window.__tweaks;
  assert.equal(t.length, 4);
  assert.ok(/five fingers/.test(t[0].prompt) && !/\(/.test(t[0].prompt.split("five fingers")[0].slice(-3)));
  assert.ok(/perfect hands:1\.2/.test(t[2].prompt), t[2].prompt);
  assert.ok(/perfect hands:1\.2/.test(t[3].prompt), "capped at level 3");
  assert.equal(ctn.__inspRun.attempts[0].boost, undefined);
  assert.equal(ctn.__inspRun.attempts[3].boost, 3);
  assert.ok(!/\b1\.[3-9]/.test(t[3].prompt), "weights stay <= 1.2");
});

test("no hand boost when the hands were fine", async () => {
  const { ctx, ctn } = sandbox({ scores: ["6|soft focus", "6|soft focus"] });
  ctn.querySelector = iframeStub();
  await ctx.window.__run(ctn, { dataUrl: "data:image/png;base64,F", seedUsed: 9 }, 2);
  assert.equal(ctx.window.__tweaks[0], null);
});

test("hand tier parsing", () => {
  const { ctx } = sandbox({ scores: [] });
  const t = (...x) => ctx.inspHandTier(...x);
  assert.equal(t("left hand: 5 digits, normal", "none visible"), 0);
  assert.equal(t("left hand: 4 digits (thumb hidden), normal"), 0);
  assert.equal(t("right hand: 6 digits"), 1);
  assert.equal(t("left hand: 6 digits, abnormal", "extra finger on left hand"), 1);
  assert.equal(t("left hand: 6 digits, merged/blob-like"), 2);
  assert.equal(t("a", "left hand has extra digits and distorted anatomy"), 2);
  assert.equal(t("left hand: 5 digits, normal", "distorted face"), 0);
});
