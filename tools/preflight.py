"""Checks that make_upload.py runs before it writes push.js, and again on the finished file.

The push script itself only knows the baseline it was built from. Every failed push so far was a baseline that no longer
matched Perchance. These checks read Perchance LIVE and refuse to build unless:
  1. the server's file list (keys) is exactly generator/manifest.json, and model.txt / output-template.html match the baseline;
  2. every file about to be pushed is known to the server under the key the script will expect (NEW files are not on the server);
  3. no unchanged file differs in size from the server's copy (a hand-edited baseline.json cannot hide a difference);
  4. after writing, push.js is parsed back: every embedded file is byte-identical to the disk and nothing changed meanwhile.
Any failure exits non-zero and removes the old push.js, so a stale script can never be pasted by mistake.
Usage (normally through make_upload.py):  python3 -I tools/preflight.py --selftest
"""
import base64, hashlib, json, re, sys, time, urllib.request

UA = {"User-Agent": "Mozilla/5.0"}


def fetch(url, attempts=4):
    for n in range(1, attempts + 1):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except (OSError, TimeoutError) as e:
            if n == attempts:
                raise
            print(f"retry {n}/{attempts - 1} after {type(e).__name__}: {url}", file=sys.stderr)
            time.sleep(3 * n)


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def read_live(generator):
    """The server's current model text, template, manifest."""
    html = fetch("https://perchance.org/api/downloadGenerator?generatorName=" + generator).decode("utf-8")
    line = next(l for l in html.split("\n") if l.startswith('<script id="preloaded-generator-data"'))
    d = json.loads(re.match(r'<script id="preloaded-generator-data" type="notjs">(.*)</script>\s*$', line, re.S).group(1))
    man = d["srcManifest"]
    return {"model": d["modelText"], "template": d["outputTemplate"], "manifest": man}


def problems(live, local_manifest, base, files, unchanged_sizes):
    """Pure: every reason this push must not be built. live = read_live(); files = the plan's file entries;
    unchanged_sizes = {path: size} of local files that are NOT being pushed."""
    bad = []
    srv = live["manifest"]
    # 1. the server is exactly what the local manifest says
    for p in sorted(set(srv) | set(local_manifest)):
        if p not in srv:
            bad.append(f"{p}: in the local manifest but not on Perchance (deleted there)")
        elif p not in local_manifest:
            bad.append(f"{p}: on Perchance but not in the local manifest (added there; uploaded by hand? pull it)")
        elif srv[p]["key"] != local_manifest[p]["key"]:
            bad.append(f"{p}: Perchance holds {srv[p]['key']}, the local manifest says {local_manifest[p]['key']} (edited on Perchance)")
    for kind, field, rel in (("model", "model", "model.txt"), ("template", "template", "output-template.html")):
        if base.get(rel) and sha256(live[field].encode("utf-8")) != base[rel]:
            bad.append(f"{rel}: differs on Perchance from the baseline")
    # 2. every pushed file is known to the server under the key the script will expect
    for f in files:
        if f["kind"] != "src":
            continue
        on_server = srv.get(f["path"])
        if f["expectKey"] is None and on_server and not f["deleted"]:
            bad.append(f"{f['path']}: planned as NEW but Perchance already has it ({on_server['key']})")
        if f["expectKey"] is not None and (not on_server or on_server["key"] != f["expectKey"]):
            bad.append(f"{f['path']}: the script would expect {f['expectKey']}, Perchance has {on_server and on_server['key']}")
    # 3. unchanged files really are what the server holds (size is enough to catch a baseline that lies)
    for p, size in unchanged_sizes.items():
        if p in srv and srv[p].get("size") not in (None, size):
            bad.append(f"{p}: {size} bytes locally, {srv[p]['size']} on Perchance, yet not in the change set (baseline.json is wrong)")
    return bad


def built_problems(js, files, read_disk):
    """Pure: parse the finished push.js back. read_disk(rel) -> bytes of the file as it is on disk right now."""
    bad = []
    m = re.search(r"const PLAN = (\{.*?\});\n", js, re.S) or re.search(r"PLAN\s*=\s*(\{\"generator\".*?\});", js, re.S)
    if "/*PLAN*/null" in js:
        return ["push.js still contains the unfilled /*PLAN*/ placeholder"]
    if not m:
        return ["could not find the embedded plan in push.js"]
    plan = json.loads(m.group(1))
    if [f["path"] for f in plan["files"]] != [f["path"] for f in files]:
        bad.append("the embedded file list differs from the one that was planned")
    for f in plan["files"]:
        data = base64.b64decode(f["b64"])
        if sha256(data) != f["sha256"] or len(data) != f["size"]:
            bad.append(f"{f['path']}: the embedded copy does not match its own hash")
            continue
        if not f["deleted"]:
            rel = {"model": "model.txt", "template": "output-template.html"}.get(f["kind"]) or "src/" + f["path"]
            if sha256(read_disk(rel)) != f["sha256"]:
                bad.append(f"{f['path']}: the embedded copy differs from the file on disk (it changed while building)")
    return bad


def selftest():
    live = {"model": "m", "template": "t",
            "manifest": {"README.md": {"key": "b.txt", "size": 9}, "x.js": {"key": "c.js", "size": 3}}}
    local = {k: dict(v) for k, v in live["manifest"].items()}
    base = {"model.txt": sha256(b"m"), "output-template.html": sha256(b"t")}
    files = [{"kind": "src", "path": "README.md", "deleted": False, "expectKey": "b.txt"}]
    ok = lambda **kw: problems(kw.get("live", live), kw.get("local", local), base, kw.get("files", files), kw.get("sizes", {"x.js": 3}))
    assert ok() == [], ok()
    cases = {
        "edited on Perchance": ok(live={**live, "manifest": {**live["manifest"], "x.js": {"key": "z.js", "size": 3}}}),
        "added there": ok(live={**live, "manifest": {**live["manifest"], "y.svg": {"key": "y.svg", "size": 1}}}),
        "deleted there": ok(local={**local, "q.js": {"key": "q.js", "size": 1}}),
        "template edited": ok(live={**live, "template": "tt"}),
        "wrong expected key": ok(files=[{**files[0], "expectKey": "old.txt"}]),
        "NEW but present": ok(files=[{**files[0], "expectKey": None}]),
        "baseline lies": ok(sizes={"x.js": 4}),
    }
    for name, got in cases.items():
        assert got, "not caught: " + name
    data = b"hello"
    entry = {"kind": "src", "path": "a.js", "deleted": False, "size": 5, "b64": base64.b64encode(data).decode(), "sha256": sha256(data)}
    js = "const PLAN = " + json.dumps({"generator": "g", "files": [entry]}) + ";\n"
    assert built_problems(js, [entry], lambda rel: data) == []
    assert built_problems(js, [entry], lambda rel: b"other"), "disk drift not caught"
    assert built_problems("/*PLAN*/null", [entry], lambda rel: data), "placeholder not caught"
    print("preflight selftest: ok (%d failure cases caught)" % len(cases))


if __name__ == "__main__":
    selftest() if "--selftest" in sys.argv else sys.exit(__doc__)
