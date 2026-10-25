"""Generate ONE Chrome-console script that uploads every changed file to Perchance.

Usage:
    python3 -I tools/make_upload.py            # writes tools/console/out/push.js (same name every time)
    python3 -I tools/make_upload.py --list     # just list what would be pushed

Then: open the Perchance editor (logged in, top frame) -> DevTools Console -> paste the script.
It runs by itself: upload -> editor Save -> double verify -> cache purge -> stale-save lock -> cache-busted reload.
(If it cannot find the Save button it prints ONE manual step: edit src/README.md and press Save.)
Afterwards verify with:  python3 -I tools/pull.py --dest <dir> ; python3 -I tools/compare.py <dir>
"""
import argparse, base64, hashlib, importlib.util, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.abspath(os.path.join(HERE, "..", "generator"))
OUT = os.path.join(HERE, "console", "out")
TEMPLATE = os.path.join(HERE, "console", "upload.template.js")
EDITED_PATH = "README.md"  # required member of every release slice (its "Changelog" section); also the manual-fallback trigger


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def scan():
    out = {}
    for dp, _, fs in os.walk(GEN):
        for n in fs:
            f = os.path.join(dp, n)
            rel = os.path.relpath(f, GEN).replace(os.sep, "/")
            if rel in ("baseline.json", "manifest.json"):
                continue
            out[rel] = sha256(open(f, "rb").read())
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--offline", action="store_true", help="skip the live Perchance checks (the script is then NOT verified against the server)")
    a = ap.parse_args()

    base = json.load(open(os.path.join(GEN, "baseline.json")))
    manifest = json.load(open(os.path.join(GEN, "manifest.json")))
    now = scan()
    files = []
    for rel in sorted(set(base) | set(now)):
        if rel in ("baseline.json", "manifest.json"):
            continue
        if base.get(rel) == now.get(rel):
            continue
        deleted = rel not in now
        data = b"" if deleted else open(os.path.join(GEN, *rel.split("/")), "rb").read()
        if rel == "model.txt":
            kind, path = "model", rel
        elif rel == "output-template.html":
            kind, path = "template", rel
        elif rel.startswith("src/"):
            kind, path = "src", rel[4:]
        else:
            sys.exit("unexpected changed file outside src/: " + rel)
        entry = {"kind": kind, "path": path, "deleted": deleted, "size": len(data),
                 "b64": base64.b64encode(data).decode(), "sha256": sha256(data)}
        if kind == "src":
            old = manifest.get(path)
            entry["expectKey"] = old["key"] if old else None
            ext = old["key"].rsplit(".", 1)[1] if old else path.rsplit(".", 1)[-1]
            if not old and ext == "md":
                ext = "txt"  # Perchance stores markdown as .txt (observed in the existing manifest)
            if ext == "jpg" and not deleted:
                # The upload service stores image/jpeg as .jpeg and never produces .jpg (the push would fail after uploading the other files).
                sys.exit("%s: the uploader cannot store a .jpg; name the image .jpeg (and update the paths that use it)" % path)
            entry["expectExt"] = ext
        else:
            entry["baselineSha"] = base.get(rel)
        files.append(entry)

    if not files:
        sys.exit("nothing changed since the baseline — nothing to push")
    print(f"{len(files)} file(s) to push:")
    for f in files:
        tag = "DELETE" if f["deleted"] else ("NEW" if f["kind"] == "src" and not f["expectKey"] else "MODIFY")
        print(f"  {tag:7} {f['kind']:8} {f['path']}  ({f['size']} bytes)")
    if not any(f["path"] == EDITED_PATH and not f["deleted"] for f in files):
        sys.exit(f"{EDITED_PATH} is not in the change set; every release adds an entry to the "
                 f"Changelog section at the bottom of src/README.md - add it first")
    if a.list:
        return

    stale = os.path.join(OUT, "push.js")
    if os.path.exists(stale):
        os.remove(stale)  # whatever happens below, an old script must never be pasted by mistake
    spec = importlib.util.spec_from_file_location("preflight", os.path.join(HERE, "preflight.py"))
    pre = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pre)
    pushed = {("model.txt" if f["kind"] == "model" else "output-template.html" if f["kind"] == "template" else "src/" + f["path"]) for f in files}
    unchanged = {rel[4:]: os.path.getsize(os.path.join(GEN, *rel.split("/"))) for rel in now if rel.startswith("src/") and rel not in pushed}
    if a.offline:
        print("\n!! --offline: NOT checked against Perchance. Do not trust this script until a normal run passes.")
    else:
        print("\nchecking against Perchance (live)...")
        live = pre.read_live("xen-imgpro4")
        bad = pre.problems(live, manifest, base, files, unchanged)
        if bad:
            sys.exit("\nPUSH NOT BUILT - the baseline no longer matches Perchance, or the release is inconsistent:\n  - " + "\n  - ".join(bad)
                     + "\n\nPull + compare first (python3 -I tools/pull.py --dest DIR; python3 -I tools/compare.py DIR), merge, reset baseline/manifest, then rebuild.")
        by_hand = sorted(p for p in base if p.startswith("src/") and p[4:] not in live["manifest"])
        print("  OK: server == manifest.json (%d files)" % len(live["manifest"]))
        if by_hand:
            print("  NOT on Perchance yet (upload by hand, they are not in push.js):\n    " + "\n    ".join(by_hand))

    plan = {"generator": "xen-imgpro4", "editedPath": EDITED_PATH, "baselineManifestCount": len(manifest), "files": files}
    js = open(TEMPLATE, encoding="utf-8").read().replace("/*PLAN*/null", json.dumps(plan, separators=(",", ":")), 1)
    # Pure ASCII so the console can never garble it.
    js = js.replace("\u2014", "-").replace("\u2192", "->").replace("\u2714", "OK")
    if not js.isascii():
        sys.exit("generated script still contains non-ASCII characters")
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):  # one fixed file name; drop the old timestamped scripts
        if old.startswith("xen-upload-") and old.endswith(".js"):
            os.remove(os.path.join(OUT, old))
    path = os.path.join(OUT, "push.js")
    open(path, "w", encoding="utf-8").write(js)
    # Re-read what was written, and prove it is exactly the disk: embedded copies, nothing edited meanwhile, valid JS, offline test.
    built = open(path, encoding="utf-8").read()
    bad = pre.built_problems(built, files, lambda rel: open(os.path.join(GEN, *rel.split("/")), "rb").read())
    if scan() != now:
        bad.append("a generator file changed while push.js was being built")
    for cmd in (["node", "--check", path], ["node", os.path.join(HERE, "console", "test_upload.mjs")]):
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0 or (cmd[1].endswith(".mjs") and "all passed" not in r.stdout):
            bad.append(" ".join(os.path.basename(c) for c in cmd) + " failed:\n" + (r.stdout + r.stderr)[-600:])
    if bad:
        os.remove(path)
        sys.exit("\nPUSH NOT BUILT (post-build check):\n  - " + "\n  - ".join(bad))
    print(f"\nwrote {path}  ({len(js)//1024} KB)  - verified: embedded files == disk, node --check, offline push test")


if __name__ == "__main__":
    main()
