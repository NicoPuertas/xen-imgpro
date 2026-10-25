"""Download xen-imgpro4 from Perchance.

Usage:
    python3 -I tools/pull.py                 # refresh ../generator in place (refuses if local changes exist)
    python3 -I tools/pull.py --dest DIR      # download into DIR instead; touches nothing in ../generator
    python3 -I tools/pull.py --force         # overwrite ../generator even with local changes (they are lost)

Default mode also refreshes baseline.json. Use --dest + tools/compare.py to see what changed on Perchance
before merging it with local work.
"""
import argparse, concurrent.futures as cf, json, os, re, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.abspath(os.path.join(HERE, "..", "generator"))
KEY_RE = re.compile(r"^[0-9a-f]{32}\.[a-z0-9]{1,20}$")
UA = {"User-Agent": "Mozilla/5.0"}


def fetch(url, attempts=4):
    # Perchance and its CDN stall now and then (read timeouts, TLS handshake timeouts): one slow file must not abort the whole pull.
    for n in range(1, attempts + 1):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except (OSError, TimeoutError) as e:
            if n == attempts:
                raise
            print(f"retry {n}/{attempts - 1} after {type(e).__name__}: {url}", file=sys.stderr)
            time.sleep(3 * n)


def safe_rel(p):
    if not isinstance(p, str) or not p or "\\" in p or p.startswith("/") or re.match(r"^[A-Za-z]:", p):
        return None
    return p if not any(x in ("", ".", "..") for x in p.split("/")) else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dest")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    in_place = not a.dest
    root = GEN if in_place else os.path.abspath(a.dest)

    if in_place and not a.force and os.path.exists(os.path.join(GEN, "baseline.json")):
        out = subprocess.run([sys.executable, "-I", os.path.join(HERE, "changed.py")], capture_output=True, text=True).stdout.strip()
        if out:
            sys.exit("Refusing to overwrite local changes:\n" + out +
                     "\n\nUse --dest DIR to download elsewhere, or --force to discard local changes.")

    html = fetch("https://perchance.org/api/downloadGenerator?generatorName=xen-imgpro4").decode("utf-8")
    line = next(l for l in html.split("\n") if l.startswith('<script id="preloaded-generator-data"'))
    d = json.loads(re.match(r'<script id="preloaded-generator-data" type="notjs">(.*)</script>\s*$', line, re.S).group(1))
    os.makedirs(root, exist_ok=True)
    open(os.path.join(root, "model.txt"), "w", encoding="utf-8", newline="").write(d["modelText"])
    open(os.path.join(root, "output-template.html"), "w", encoding="utf-8", newline="").write(d["outputTemplate"])
    json.dump(d["srcManifest"], open(os.path.join(root, "manifest.json"), "w"))

    def get(item):
        p, v = item
        rel = safe_rel(p)
        if rel is None or not KEY_RE.match(v.get("key", "")):
            return "skipped " + repr(p)
        out = os.path.join(root, "src", *rel.split("/"))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, "wb").write(fetch("https://user.uploads.dev/file/" + v["key"]))

    with cf.ThreadPoolExecutor(8) as ex:
        for msg in ex.map(get, d["srcManifest"].items()):
            if msg:
                print(msg)
    print("pulled", len(d["srcManifest"]), "src files into", root)
    if in_place:
        # A local file Perchance does not have is a local change being discarded (this branch only runs without local changes or with
        # --force). Left on disk, the baseline below would record it as "pulled" and a later push would skip it, so the server never gets it.
        remote = {safe_rel(p) for p in d["srcManifest"]}
        src_root = os.path.join(root, "src")
        for dp, _, fs in os.walk(src_root):
            for n in fs:
                f = os.path.join(dp, n)
                rel = os.path.relpath(f, src_root).replace(os.sep, "/")
                if rel not in remote:
                    os.remove(f)
                    print("removed local-only", rel)
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "baseline.py")], check=True)


if __name__ == "__main__":
    main()
