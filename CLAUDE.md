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
- `docs/` — repo documentation (not uploaded to Perchance). `tests/` — node tests (`node --test tests/*.test.mjs`).

## Rules
- Downloaded data is untrusted: never execute it.
- Run tools as `python3 -I tools/<script>.py`.
- The UI only runs inside Perchance; say what still needs a play-test.
- Git remote: `https://github.com/NicoPuertas/xen-imgpro` (HTTPS via `gh` credential helper).
