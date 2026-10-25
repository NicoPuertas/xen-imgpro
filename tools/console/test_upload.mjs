// Offline test of the generated console script against a simulated Perchance editor.
// Usage: node tools/console/test_upload.mjs [path-to-generated-script]   (defaults to the newest in out/)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "out");
let scriptPath = process.argv[2];
if (!scriptPath) {
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".js")).sort();
  if (files.length === 0) {
    console.error("no generated script found in " + outDir + " - run: python3 -I tools/make_upload.py");
    process.exit(1);
  }
  scriptPath = path.join(outDir, files.pop());
}
if (!fs.existsSync(scriptPath)) {
  console.error("no generated script found in " + outDir + " - run: python3 -I tools/make_upload.py");
  process.exit(1);
}
const code = fs.readFileSync(scriptPath, "utf8");
const gen = path.join(here, "..", "..", "generator");
const PLANMatch = /const PLAN = (\{.*\});/.exec(code);
if (!PLANMatch) {
  console.error("could not extract PLAN from generated script");
  process.exit(1);
}
const PLAN = JSON.parse(PLANMatch[1]);
const manifest = JSON.parse(fs.readFileSync(path.join(gen, "manifest.json"), "utf8"));
// The editor's save body carries Perchance's LIVE model/template text, i.e. the baseline version, not a local edit waiting to be pushed
// (otherwise the push sees a "remote change" and rightly blocks the save). A local edit is rebuilt from git HEAD when that matches the
// baseline; the save must then carry the local text.
const baseline = JSON.parse(fs.readFileSync(path.join(gen, "baseline.json"), "utf8"));
const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");
function liveAndLocal(rel) {
  const local = fs.readFileSync(path.join(gen, rel), "utf8");
  if (sha(local) === baseline[rel]) return { live: local, local };
  // The live text is the newest revision of the file that still matches the baseline (a release can be committed before it is uploaded).
  let head = null;
  const revs = execFileSync("git", ["log", "--format=%H", "--", rel], { cwd: gen, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const rev of revs) {
    const t = execFileSync("git", ["show", rev + ":generator/" + rel], { cwd: gen, encoding: "utf8", maxBuffer: 64 << 20 });
    if (sha(t) === baseline[rel]) { head = t; break; }
  }
  if (head === null) { console.error(rel + ": no git revision matches the baseline - pull + compare first"); process.exit(1); }
  return { live: head, local };
}
const model = liveAndLocal("model.txt");
const tpl = liveAndLocal("output-template.html");
const modelText = model.live;
const template = tpl.live;

let failures = 0;
const sbReloaded = { v: false };
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) failures++; };
const scenario = async (name, fn) => { try { await fn(); } catch (e) { check(false, name + " scenario crashed: " + (e && e.message)); } };

function makeEnv(liveManifest, opts = {}) {
  const logs = [];
  const listeners = new Set();
  const store = new Map(); // key -> bytes
  const saves = [];
  let lastManifest = opts.server || {}; // what the server holds before the first save
  const dispatch = (ev) => [...listeners].forEach((l) => l(ev));
  const ORIGIN = "https://upload.perchance.org";
  // Fake upload server: text/javascript is (wrongly) stored as .txt so the MIME fallback gets exercised.
  const EXT = { "text/javascript": "txt", "application/javascript": "js", "application/json": "json", "text/plain": "txt", "text/css": "css", "image/svg+xml": "svg", "image/webp": "webp", "image/jpeg": "jpeg", "image/png": "png" };
  const sb = {
    console: { log: (...a) => logs.push(a.join(" ")), warn: (...a) => logs.push(a.join(" ")), error: (...a) => logs.push("ERR " + a.join(" ")), table: () => {} },
    setTimeout, clearTimeout, URL, TextEncoder, TextDecoder, Uint8Array, JSON, Math, Promise, Object, Blob, atob, btoa,
    crypto: webcrypto,
    location: { href: "https://perchance.org/xen-imgpro4", pathname: "/xen-imgpro4", hash: "#edit" },
    Response: class { constructor(body, init) { this.body = body; this.status = init && init.status; } },
    FileReader: class { readAsDataURL(blob) { blob.arrayBuffer().then((ab) => { this.result = `data:${blob.type};base64,${Buffer.from(ab).toString("base64")}`; this.onloadend(); }); } },
  };
  sb.window = sb;
  const draft = { resets: 0 };
  const drops = { left: opts.dropUploads || 0, dropped: 0 };
  const frames = { created: 0, removed: 0 }; // upload iframes the script made; the first opts.notReadyFrames never report ready
  const flight = { now: 0, max: 0, refused: 0 }; // uploads in flight at once (the real iframe refuses overlaps)
  const downloadFails = { left: opts.failDownloads || 0, failed: 0 };
  sb.srcState = { async resetToSaved() { draft.resets++; }, isDirty: () => false }; // the editor's local-draft owner
  // Fast timing + captured reload: the script reads window.__xenPushCfg before auto-running.
  sb.__xenPushCfg = { verifyDelayMs: 1, verify2DelayMs: 1, reloadDelayMs: 1, saveTimeoutMs: 300, uploadTimeoutMs: 40, busyWaitMs: 1, busyWaitMax: 3, readyTimeoutMs: 20, retryDelayMs: 1, navigate: (u) => { sbReloaded.v = u; } };
  sb.addEventListener = (t, l) => t === "message" && listeners.add(l);
  sb.removeEventListener = (t, l) => t === "message" && listeners.delete(l);
  const makeIframe = () => {
      const ifr = { style: {}, src: ORIGIN + "/embed#{}", remove() { frames.removed++; } };
      ifr.contentWindow = {
        postMessage(msg, target) {
          if (target !== ORIGIN || msg.type !== "anonUploadRequest") return;
          if (flight.now > 0) { flight.refused++; setTimeout(() => dispatch({ source: ifr.contentWindow, origin: ORIGIN, data: { type: "anonUploadResponse", requestId: msg.requestId, result: { error: "another_upload_in_progress" } } }), 1); return; } // the real iframe takes one upload at a time
          if (drops.left > 0) { drops.left--; drops.dropped++; return; } // a stalled upload: the iframe never answers
          const m = /^data:([^;]+);base64,(.*)$/s.exec(msg.dataUrl);
          const bytes = Buffer.from(m[2], "base64");
          const key = createHash("sha256").update(bytes).digest("hex").slice(0, 32) + "." + (EXT[m[1]] || "bin");
          store.set(key, bytes);
          flight.max = Math.max(flight.max, ++flight.now);
          setTimeout(() => { flight.now--; dispatch({ source: ifr.contentWindow, origin: ORIGIN, data: { type: "anonUploadResponse", requestId: msg.requestId, result: { url: "https://user.uploads.dev/file/" + key, size: bytes.length, error: null } } }); }, 5);
        },
      };
      return ifr;
  };
  const existing = opts.existing ? makeIframe() : null;
  // Fake editor Save button (omitted when opts.noSaveButton). Clicking it posts /api/save through the
  // CURRENT sb.fetch (which the script has replaced with its patching hook).
  const saveBtn = { disabled: !!opts.saveDisabled, innerText: "Save", textContent: "Save",
    click() { if (!saveBtn.disabled) sb.fetch("https://perchance.org/api/save", { method: "POST", body: body(opts.saveShape || "inner") }); } };
  sb.document = {
    body: { appendChild(ifr) { if (frames.created++ < (opts.notReadyFrames || 0)) return; if (!opts.neverReady) setTimeout(() => dispatch({ source: ifr.contentWindow, origin: ORIGIN, data: { type: "uploadEmbedIsReady" } }), 5); } },
    createElement: makeIframe,
    execCommand: () => false,
    querySelector: (sel) => (sel.includes("saveButton") && !opts.noSaveButton ? saveBtn : null),
    querySelectorAll: (sel) => {
      if (sel === "iframe" && existing) return [existing];
      if (sel.includes("button") && !opts.noSaveButton) return [saveBtn];
      return [];
    },
  };
  sb.fetch = async (url, init) => {
    url = String(url);
    if (url.includes("user.uploads.dev/file/")) {
      if (downloadFails.left > 0) { downloadFails.left--; downloadFails.failed++; return { ok: false, status: 525, arrayBuffer: async () => new TextEncoder().encode("<html>error 525</html>").buffer }; }
      const bytes = store.get(url.split("/file/")[1]);
      return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
    }
    if (url.includes("/api/clearCacheIfGeneratorOrImportsHaveBeenUpdated")) return { json: async () => true };
    if (url.includes("/api/downloadGenerator")) return { text: async () => '<html>\n<script id="preloaded-generator-data" type="notjs">' + JSON.stringify({ srcManifest: lastManifest }) + "</script>\n" };
    if (url.endsWith("/api/save")) {
      saves.push(init.body);
      { const b = JSON.parse(init.body); lastManifest = b.srcManifest && Object.keys(b.srcManifest).length ? b.srcManifest : b.generator.srcManifest; }
      return { clone: () => ({ json: async () => ({ status: "saved", saveCount: 7 }) }) };
    }
    throw new Error("unexpected fetch " + url);
  };
  vm.createContext(sb);
  vm.runInContext(code, sb);
  // shape: "inner" = full manifest inside generator; "delta" = real editor shape (top-level, changes only, inner empty); "topfull" = top-level full
  const body = (shape = "inner") => {
    const b = { email: "user@example.invalid", sessionToken: "SECRET-TOKEN-123", generator: { name: "xen-imgpro4", modelText, outputTemplate: template, srcManifest: shape === "inner" ? liveManifest : {} }, lastKnownSaveCount: 123, editorClientId: "x" };
    if (shape === "delta") b.srcManifest = { [PLAN.editedPath]: { key: "0".repeat(32) + ".txt", size: 12606 } };
    if (shape === "topfull") b.srcManifest = liveManifest;
    return JSON.stringify(b);
  };
  return { sb, logs, saves, body, draft, drops, downloadFails, flight, frames };
}

// ---- expectations derive from the generated plan, so the tests stay valid for any batch ----
const srcFiles = PLAN.files.filter((f) => f.kind === "src" && !f.deleted);
const staleFile = srcFiles.find((f) => f.path !== PLAN.editedPath && f.expectKey); // a planned file that already exists remotely
const freshLive = () => { const m = JSON.parse(JSON.stringify(manifest)); m[PLAN.editedPath] = { key: "0".repeat(32) + ".txt", size: 1 }; return m; };
const staleLive = () => { const m = freshLive(); if (staleFile) m[staleFile.path] = { key: "f".repeat(32) + "." + staleFile.expectExt, size: 5 }; return m; };
console.log(`plan: ${PLAN.files.length} file(s), ${srcFiles.filter((f) => !f.expectKey).length} new, stale-test file: ${staleFile ? staleFile.path : "(none)"}`);

// ---- happy path: full auto-run (upload -> auto-click Save -> patch -> double verify -> purge -> reload) ----
await scenario("happy path", async () => {
  const env = makeEnv(freshLive());
  await env.sb.__xenPush.finished;
  const up = env.sb.__xenPush.state.uploaded;
  check(Object.keys(up).length === srcFiles.length, `uploaded all ${srcFiles.length} changed files`);
  check(env.flight.max === 1 && env.flight.refused === 0, `uploads are serialized: peak ${env.flight.max} in flight, ${env.flight.refused} refused as another_upload_in_progress`);
  check(srcFiles.every((f) => up[f.path].key.endsWith("." + f.expectExt)), "every file stored with the extension the manifest expects (MIME fallback worked)");
  check(env.sb.__xenPush.state.clicks === 1, "auto-clicked Save exactly once");
  await new Promise((r) => setTimeout(r, 80));
  check(env.saves.length === 1, "exactly one save went out");
  const sent = JSON.parse(env.saves[0]);
  check(sent.sessionToken === "SECRET-TOKEN-123" && sent.email === "user@example.invalid", "credentials passed through untouched");
  const sm = sent.generator.srcManifest;
  check(srcFiles.every((f) => sm[f.path].key === up[f.path].key && sm[f.path].size === f.size), "changed/new files re-keyed in manifest with the right size");
  const deleted = PLAN.files.filter((f) => f.kind === "src" && f.deleted).map((f) => f.path);
  const untouched = Object.keys(manifest).filter((p) => !(p in up) && !deleted.includes(p));
  check(untouched.every((p) => sm[p] && sm[p].key === manifest[p].key), `${untouched.length} untouched files keep their keys`);
  check(deleted.every((p) => !(p in sm)), `${deleted.length} deleted files removed from the full manifest`);
  check(sent.generator.modelText === model.local && sent.generator.outputTemplate === tpl.local, "model/template text: the local version goes out (unchanged when not edited)");
  check(!env.logs.join("\n").includes("SECRET-TOKEN-123"), "token never printed to the console");
  check(env.logs.filter((l) => l.includes("VERIFIED on Perchance's server")).length >= 2, "post-save verification ran twice against the server");
  check(env.logs.some((l) => l.includes("cache purge requested")), "cache purge endpoint was called");
  check(typeof sbReloaded.v === "string" && sbReloaded.v.includes("__cacheBust=") && sbReloaded.v.endsWith("#edit"), "tab reloads itself with a cache-busting URL after the verified save");
  const second = await env.sb.window.fetch("https://perchance.org/api/save", { method: "POST", body: env.body() });
  check(env.draft.resets === 1 && env.logs.some((l) => l.includes("cleared the editor's local file draft")), "the editor's local file draft is cleared once, after the verified save");
  check(env.saves.length === 1 && second.status === 409, "a second save from the stale tab is BLOCKED (never reaches the server)");
  check(env.logs.some((l) => l.includes("BLOCKED a save")), "blocked save is reported loudly");
});

// ---- fallback: no Save button in the DOM -> exactly one manual step, push stays armed, manual save still patched ----
await scenario("fallback no-button", async () => {
  const env = makeEnv(freshLive(), { noSaveButton: true });
  await env.sb.__xenPush.finished;
  check(env.saves.length === 0, "fallback: no automatic save happens");
  check(env.logs.some((l) => l.includes("MANUAL STEP")), "fallback: prints the single manual instruction");
  check(env.sb.__xenPush.state.armed === true, "fallback: push stays armed for the manual save");
  await env.sb.window.fetch("https://perchance.org/api/save", { method: "POST", body: env.body() });
  check(env.saves.length === 1, "fallback: the manual save is still patched");
});

// ---- fallback: Save button present but disabled and not enabling -> manual instruction ----
await scenario("fallback disabled", async () => {
  const env = makeEnv(freshLive(), { saveDisabled: true });
  await env.sb.__xenPush.finished;
  check(env.saves.length === 0, "disabled Save: no automatic save");
  check(env.logs.some((l) => l.includes("MANUAL STEP")), "disabled Save: falls back to the manual instruction");
});

// ---- auto-click against the REAL editor shape (top-level changes-only manifest) ----
await scenario("delta shape", async () => {
  const env = makeEnv(freshLive(), { saveShape: "delta" });
  await env.sb.__xenPush.finished;
  await new Promise((r) => setTimeout(r, 80));
  const up = env.sb.__xenPush.state.uploaded;
  const sent = JSON.parse(env.saves[0]);
  check(Object.keys(sent.srcManifest).length === srcFiles.length && srcFiles.every((f) => sent.srcManifest[f.path].key === up[f.path].key), `delta shape: all ${srcFiles.length} entries present in the top-level manifest`);
  const ed = srcFiles.find((f) => f.path === PLAN.editedPath);
  check(sent.srcManifest[PLAN.editedPath].key === up[PLAN.editedPath].key && sent.srcManifest[PLAN.editedPath].size === ed.size, "delta shape: editor's entry for the trigger file replaced by ours");
  check(Object.keys(sent.generator.srcManifest).length === 0, "delta shape: generator.srcManifest left alone");
  const dels = PLAN.files.filter((f) => f.kind === "src" && f.deleted).map((f) => f.path);
  if (dels.length) check(env.logs.join("\n").includes("ONE MANUAL STEP") && dels.every((p) => env.logs.join("\n").includes(p)), `delta shape: ${dels.length} deletion(s) reported as one manual step`);
  check(sent.sessionToken === "SECRET-TOKEN-123" && !env.logs.join("\n").includes("SECRET-TOKEN-123"), "delta shape: credentials intact and never printed");
});

// ---- stale: someone edited a planned file on Perchance after the baseline -> save BLOCKED, nothing sent ----
if (staleFile) {
  await scenario("stale manifest inner", async () => {
    const env = makeEnv(staleLive());
    await env.sb.__xenPush.finished;
    await new Promise((r) => setTimeout(r, 80));
    check(env.saves.length === 0, "stale manifest: the save is BLOCKED, nothing reaches the server");
    check(env.logs.some((l) => l.startsWith("ERR NOT patched") && l.includes("BLOCKED") && l.includes(staleFile.path)), "stale manifest: loud error naming the file");
  });
  await scenario("stale manifest topfull", async () => {
    const env = makeEnv(staleLive(), { saveShape: "topfull" });
    await env.sb.__xenPush.finished;
    await new Promise((r) => setTimeout(r, 80));
    check(env.saves.length === 0, "top-level full manifest + stale file: BLOCKED, nothing sent");
  });
}

// ---- a blocked earlier run left its upload keys in the editor's local draft; the server itself is unchanged -> still saves ----
if (staleFile) {
  await scenario("stale editor draft, clean server", async () => {
    const env = makeEnv(staleLive(), { server: freshLive() });
    await env.sb.__xenPush.finished;
    await new Promise((r) => setTimeout(r, 80));
    check(env.saves.length === 1, "stale editor draft but unchanged server: the save goes out");
  });
  await scenario("edited on the server", async () => {
    const env = makeEnv(freshLive(), { server: staleLive() });
    await env.sb.__xenPush.finished;
    await new Promise((r) => setTimeout(r, 80));
    check(env.saves.length === 0, "the server's copy was edited: BLOCKED even though the editor's draft looks clean");
  });
}

// ---- reuses the editor's own upload iframe when present (no new iframe, no ready handshake needed) ----
await scenario("existing iframe", async () => {
  const env = makeEnv(freshLive(), { existing: true, neverReady: true });
  await env.sb.__xenPush.finished;
  const up = env.sb.__xenPush.state.uploaded;
  check(Object.keys(up).length === srcFiles.length, "existing editor iframe reused (works even if a new iframe would never get ready)");
  check(env.logs.some((l) => l.includes("editor's own upload iframe")), "logs that it used the editor's iframe");
});

// ---- the upload iframe stalls: each stalled upload is retried, the push still completes ----
await scenario("flaky uploads", async () => {
  const env = makeEnv(freshLive(), { dropUploads: 3 });
  await env.sb.__xenPush.finished;
  check(env.drops.dropped === 3 && Object.keys(env.sb.__xenPush.state.uploaded).length === srcFiles.length, "flaky: stalled uploads are retried and every file still lands");
  check(env.logs.filter((l) => l.includes("retrying")).length === 3, "flaky: each retry is reported");
  await new Promise((r) => setTimeout(r, 80));
  check(env.saves.length === 1, "flaky: the push still saves exactly once");
});

// ---- the upload iframe never becomes ready (1.24.1 push): the stalled one is dropped and each retry builds a fresh one ----
await scenario("iframe not ready", async () => {
  const env = makeEnv(freshLive(), { notReadyFrames: 2 });
  await env.sb.__xenPush.finished;
  check(env.frames.created === 3 && env.frames.removed === 2, "not ready: two stalled iframes removed, a third one built (" + JSON.stringify(env.frames) + ")");
  check(Object.keys(env.sb.__xenPush.state.uploaded).length === srcFiles.length, "not ready: every file still lands");
  await new Promise((r) => setTimeout(r, 80));
  check(env.saves.length === 1, "not ready: the push still saves exactly once");
});

// ---- the upload iframe never answers: gives up after the attempt limit, nothing is saved ----
await scenario("dead uploads", async () => {
  const env = makeEnv(freshLive(), { dropUploads: 1e9 });
  await env.sb.__xenPush.finished;
  check(env.sb.__xenPush.state.failed && env.saves.length === 0, "dead: push fails without saving anything");
  check(env.logs.some((l) => l.includes("after 4 attempts")), "dead: the error says how many attempts were made");
});

// ---- the CDN answers a verify download with an error page (HTTP 525): retried, never called a different file ----
await scenario("cdn errors on verify", async () => {
  const env = makeEnv(freshLive(), { failDownloads: 2 });
  await env.sb.__xenPush.finished;
  check(env.downloadFails.failed === 2 && Object.keys(env.sb.__xenPush.state.uploaded).length === srcFiles.length, "cdn: error pages are retried and every file still verifies");
  check(env.logs.filter((l) => l.includes("verify download") && l.includes("HTTP 525")).length === 2, "cdn: each retry names the HTTP status");
  await new Promise((r) => setTimeout(r, 80));
  check(env.saves.length === 1, "cdn: the push still saves exactly once");
});

await scenario("cdn down on verify", async () => {
  const env = makeEnv(freshLive(), { failDownloads: 1e9 });
  await env.sb.__xenPush.finished;
  check(env.sb.__xenPush.state.failed && env.saves.length === 0, "cdn down: push fails without saving anything");
  check(env.logs.some((l) => l.includes("HTTP 525 (after 4 attempts)")), "cdn down: the error names the status and the attempts, not a mismatch");
});

// ---- cancel mid-flight: no save ever goes out ----
await scenario("cancel", async () => {
  const env = makeEnv(freshLive(), { noSaveButton: true });
  env.sb.__xenPush.cancel();
  await env.sb.__xenPush.finished;
  check(env.saves.length === 0, "cancel: no save goes out");
  check(env.logs.some((l) => l.toLowerCase().includes("cancel")), "cancel: reported to the user");
});

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
