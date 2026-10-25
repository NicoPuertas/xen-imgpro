# Audit — Refactor / Cleanup / Optimization Plan

Status: P0 done, P1 done, P2 done, P3 done (safe subset — see below).
Cleanup pass 2 done (see §Cleanup pass 2).

Based on `main.pjs` (~1400 lines), `index.html` (16x deferred `<script src>`), and all 16 `src/*.js + styles.css + docs`.

## P0 — Correctness / fragility (do first)

1. **Hash-link hijack** — `src/lib/ui/open-links.js` forces `_blank` on *all* `<a>`, breaking `#Crear/#Resultados/#Galería` nav. Exclude `href^="#"`.
2. **`collectFinishedImages` wrong inputs** — `src/lib/modals/modal.js` assigns `out[0].inputs` to every restored `<img>`. Store per-image inputs.
3. **Stale prompt stamping** — `src/lib/core/shared.js:addButtonsToImages` stamps `window.input.description` at scan time, not generation time. Use `getImageData().prompt` as source of truth.
4. **Duplicate `document` listeners** — `src/lib/prompt/post-presets.js:enhance()` adds global click/Escape closers per textarea (2x). Register once.
5. **Hardcoded framework IDs** (`#privateGalleryCtn97364827`, `window.___userSettings746291937`, `t2i_privateGallerySave`) — isolate behind one `framework-adapter.js` so a plugin bump touches 1 file.

## P1 — De-duplicate JS

6. **Button factory** — `makeRegenerate/Vary/CopySeed/StyleCompare` + `makeModalButton/makeSaveButton` are ~90% identical. One `makeIconButton({icon,title,onClick})`.
7. **One clipboard helper** — `src/lib/core/shared.js:copyTextToClipboard` ≈ `src/lib/gallery/gallery-info.js` copy. Keep one in `shared.js`.
8. **One modal manager** — `src/lib/modals/vary-modal.js` + `src/lib/modals/style-compare.js` duplicate stash/restore/reopen/dock logic. Generic `openProModal({id,title,controls,stash})`; add Esc + backdrop-click close.
9. **One fly/wiggle** — `src/lib/gallery/fly-to-gallery.js` duplicates framework's `animateImageIntoTarget` and injects a new `<style>@keyframes>` per save. Single shared animation, static keyframes in `styles.css`.
10. **Two scroll-top buttons** — project `src/lib/ui/top-button.js` (>1000px) vs framework `t2iScrollTopBtn` (20x viewport, effectively dead). Keep one.

## P2 — Perf / observer hygiene

11. **Bypassers of central dispatcher** — `src/lib/ui/scroll-fix.js` has own `MutationObserver + setInterval(2000)`. Route through `onProDomChange`, drop poll.
12. **Full-doc scans per mutation** — `src/lib/ui/bootstrap-enhance.js`, `src/lib/gallery/gallery-info.js`, `src/lib/prompt/seed-tools.js`, `src/lib/prompt/post-presets.js` run `querySelectorAll` over `document` on every frame. Filter to `addedNodes`, scope selectors, cache done-flags (already done for images via `WeakSet` — extend pattern).
13. **`index.html` load** — 15 blocking classic scripts. Bundle or `defer`, in dependency order (`observer → shared → modal → vary/style-compare → dock/fly → rest`).
14. **`src/styles.css` `!important` war** — ~200 overrides + 6x repeated button rules. Introduce `--pro-*` CSS vars + one `.pro-btn` class; drops size and fixes Bootstrap conflicts (navbar manual `classList.toggle('show')` vs real collapse).

## P3 — `main.pjs` data bloat (biggest win)

15. **Yearly vintage photos (1990s→1920s, 8x), Furry x3, Pokémon x3, Icon x7, NSFW x4** are near-identical. Extract `baseNegative`, `photoNeg`, `vintagePhoto(year,traits)` builder / shared sublists.
16. **Options enumerations** — `numImages` (30 entries), `Gscale` 1-30, `steps` 1-50. Generate via range/`{a-b}` instead of literal lines.
17. **`beforeGenerate()` pre/post concat** via DOM scraping is fragile. Move into `imageOptions.prompt` template (`[input.prePrompt] [input.description] [input.postPrompt]`) and delete the function.
18. **Steps `(steps:::N)` + `src/lib/prompt/migrate-steps.js`** — confirmed no-op label (not in plugin whitelist). Decide keep-as-label vs delete both + migration shim.
19. **I18n + defaults** — `pre/postPrompt` tips in Spanish, rest English; `colorScheme` lists `Auto` first but marks `Dark meta:selected`; `steps Off = {|} ` hack. Standardize language, fix default markers.

## Suggested order

P0 (1-5) → P1 (6-10) → P2 (11-14) → P3 (15-19).

## P3 outcome (safe subset implemented)

- 15 — deferred: style prompts are unique per style by design; modifiers
  are already factored (`*Modifiers` lists); the only exact duplicates
  (7x 1-line vintage negatives) would not shrink via a shared list.
  No change.
- 16 — deferred: the framework iterates option children, so a `{1-30}`
  shorthand would be one option, not 30; values are curated skips
  anyway. Lists stay explicit.
- 17 — done: `beforeGenerate()` reads via `getFrameworkSettings()`
  (fallback to the old global), same concat behavior, verified
  `"photo of a cat in a garden"`.
- 18 — kept as label per prior decision (visible in image prompt info);
  `migrate-steps.js` stays (one-time, self-disabling). No change.
- 19 — superseded: defaults are now "(default)"-suffixed first options
  (`Off (default)`, `3 (default) = 3`, `No style (default)` first in source,
  `Square (768x768px) (default)`, `12 (default) = 12`, `20 (default) = 20`,
  colorScheme Dark first), each with `meta:selected = true`, plus the plain
  value kept in the list. `meta:position = 0` does NOT work (framework
  truthiness-checks it) — use source order for first place.
  Node-valued options verified to stringify (`numImages → "3"`,
  `Gscale 12 → "12"`, `shape → "768x768"`).

## Cleanup pass 2

- `fly-to-gallery.js`: blocking `alert()` on premature private-save replaced
  with non-blocking `showToast` (alert kept as fallback if unavailable).
- `bootstrap-enhance.js`: dispatcher filter was a no-op (`|| n.querySelector`
  is always truthy, so `enhance()` ran on every added element). Now only
  enhances subtrees actually containing `select/textarea/.input-modifiers/#proNav`.
- Docs synced: README defaults/steps/prompt-io sections rewritten for the
  "(default)" pattern + export-to-text + io-bar placement.

## Cleanup pass 4

- `shared.js` / `gallery-upscale.js`: `addButtonsToImages` and the gallery
  upscale-button scan now process `addedNodes` only on mutation batches
  (full scan kept for the initial call) — no more whole-document
  `querySelectorAll` per batch. Idle batch latency unchanged (~15ms,
  rAF-dominated); the win is scaling with node count.
- Dedup: one `fireInputEvents` in `shared.js` (prompt-io/reset-defaults
  keep thin aliases); one input lookup `getUserInputEl` in
  `framework-adapter.js` (with `#userInputsCtn`-scoped fallback);
  one modal destroy path `resetProModal` in `modal.js` (vary +
  style-compare resets are one-liners now).
- Verified live: fresh load error-free; reset restores 11 fields;
  gallery upscale-button injection intact.

## Cleanup pass 3

- `post-presets.js`: new `window.syncProPresets()` re-derives chips/badges
  from textarea content — import no longer leaves them stale
  (`prompt-io.js` calls it after applying a file). `ready()` gate now also
  requires the prePrompt element (was postPrompt + negative only).
- `seed-tools.js`: user-facing strings in English like the rest of the UI.
- `gallery-info.js`: copy button routes fully through the shared
  `copyTextToClipboard` helper (audit item 7); redundant clipboard branch
  removed.
- Verified live: fresh load error-free; reset restores 11 fields, clears
  texts/badges/chips, destroys output + modals; import syncs badges;
  style-compare hide→unhide→reset-destroy cycle intact.
