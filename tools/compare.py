"""Three-way comparison of a fresh Perchance download against local work.

Usage:
    python3 -I tools/pull.py --dest /some/dir
    python3 -I tools/compare.py /some/dir

Buckets (BASE = baseline.json, LOCAL = ../generator now, REMOTE = the downloaded folder):
    REMOTE-ONLY   changed on Perchance, untouched locally      -> safe to take
    LOCAL-ONLY    changed locally, untouched on Perchance      -> still to upload
    CONFLICT      changed on both sides, with different content -> needs a manual merge
    SAME-BOTH     changed on both sides to identical content   -> nothing to do
"""
import hashlib, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.abspath(os.path.join(HERE, "..", "generator"))


def scan(root):
    out = {}
    for dp, _, fs in os.walk(root):
        for n in fs:
            f = os.path.join(dp, n)
            rel = os.path.relpath(f, root).replace(os.sep, "/")
            if rel in ("baseline.json", "manifest.json"):
                continue
            out[rel] = hashlib.sha256(open(f, "rb").read()).hexdigest()
    return out


base = json.load(open(os.path.join(GEN, "baseline.json")))
base.pop("manifest.json", None)
local, remote = scan(GEN), scan(os.path.abspath(sys.argv[1]))
buckets = {"REMOTE-ONLY": [], "LOCAL-ONLY": [], "CONFLICT": [], "SAME-BOTH": []}
for r in sorted(set(base) | set(local) | set(remote)):
    b, l, m = base.get(r), local.get(r), remote.get(r)
    lc, mc = l != b, m != b
    if not lc and not mc:
        continue
    tag = lambda x: "DEL" if x is None else ("NEW" if b is None else "MOD")
    if mc and not lc:
        buckets["REMOTE-ONLY"].append((r, tag(m)))
    elif lc and not mc:
        buckets["LOCAL-ONLY"].append((r, tag(l)))
    elif l == m:
        buckets["SAME-BOTH"].append((r, tag(l)))
    else:
        buckets["CONFLICT"].append((r, "local " + tag(l) + " / remote " + tag(m)))
for k, v in buckets.items():
    print(f"== {k} ({len(v)})")
    for r, t in v:
        print("  ", t, r)
