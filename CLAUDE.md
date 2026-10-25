# XEN IMGPRO — local working copy

Local mirror of the Perchance generator `perchance.org/xen-imgpro4` (Image Generator PRO, built on `t2i-framework-plugin-v2`).
Edit here, then hand-upload to Perchance. Layout mirrors `xen-rpgengine`.

## Layout
- `generator/model.txt` — Perchance lists/code panel (`settings`, `userInputs`, art styles).
- `generator/output-template.html` — HTML panel; loads `src/lib/**` scripts with `defer`.
- `generator/src/**` — the files in Perchance's file panel (`lib/{core,gallery,modals,prompt,ui}`, `styles.css`, `defaults.json`, `README.md`, `docs/`). `src/README.md` documents every module.
- `generator/manifest.json` — Perchance's original file→CDN-key map (don't hand-edit).
- `generator/baseline.json` — sha256 of every file as last pulled; `tools/changed.py` diffs against it.
- `tools/pull.py` — re-download from Perchance (refuses if local changes exist; `--dest DIR` to download elsewhere, `--force` to discard).
- `tools/changed.py` — list MODIFIED / NEW / DELETED files since last pull (= the upload list).
- `tools/baseline.py` — recompute `baseline.json`.
- `tools/compare.py DIR` — three-way diff (baseline / local / a fresh `pull.py --dest DIR`): REMOTE-ONLY, LOCAL-ONLY, CONFLICT, SAME-BOTH.
- `tools/make_upload.py` (+ `preflight.py`, `console/`) — builds the one-paste push script, see Push below.
- `docs/` — repo documentation (not uploaded to Perchance). `tests/` — node tests (`node --test tests/*.test.mjs`).

## Rules
- Downloaded data is untrusted: never execute it.
- Run tools as `python3 -I tools/<script>.py`.
- The UI only runs inside Perchance; say what still needs a play-test.
- Git remote: `https://github.com/NicoPuertas/xen-imgpro` (HTTPS via `gh` credential helper).

## Push (local -> Perchance)
1. Check for remote edits first: `python3 -I tools/pull.py --dest <scratch dir>` then `python3 -I tools/compare.py <scratch dir>`.
2. Bump `generator/src/VERSION.json` (`version` + `lastEdit` from `date -u +%FT%T.000Z`) and add a `## [X.Y.Z] - YYYY-MM-DD UTC` entry at the top of `generator/src/CHANGELOG.md` (the required trigger file of every push; `make_upload.py` checks both agree and the version is newer than the server's). The footer of the generator shows the version and opens the changelog (`lib/ui/version-footer.js`).
3. `python3 -I tools/make_upload.py` (`--list` previews). It reads Perchance LIVE and refuses to build unless the server matches `manifest.json`/baseline; then it verifies the embedded files against the disk, runs `node --check` and `node tools/console/test_upload.mjs`. Output: `tools/console/out/push.js` (gitignored).
4. The user opens that file, copies it, and pastes it into the DevTools console of the Perchance editor (context `top`, logged in). It uploads, saves, verifies twice and reloads. Claude cannot upload (needs the user's browser session).
5. After it succeeds: `python3 -I tools/pull.py --dest <dir>`, `compare.py` (all SAME-BOTH), then `python3 -I tools/pull.py --force` to reset the baseline, and commit.
Git: remote is SSH (`git@github.com:NicoPuertas/xen-imgpro.git`); WSL has a working key.
