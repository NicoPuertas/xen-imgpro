"""Record sha256 of every generator file as the 'pristine' baseline.
Usage: python3 -I tools/baseline.py   (pull.py runs this automatically)
"""
import hashlib, json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "generator")
out = {}
for dp, _, fs in os.walk(ROOT):
    for n in fs:
        f = os.path.join(dp, n); rel = os.path.relpath(f, ROOT).replace(os.sep, "/")
        if rel == "baseline.json": continue
        out[rel] = hashlib.sha256(open(f, "rb").read()).hexdigest()
json.dump(out, open(os.path.join(ROOT, "baseline.json"), "w"), indent=0, sort_keys=True)
print("baseline:", len(out), "files")
