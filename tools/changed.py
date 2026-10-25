"""List generator files changed since the last pull/baseline.
Usage: python3 -I tools/changed.py
"""
import hashlib, json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "generator")
base = json.load(open(os.path.join(ROOT, "baseline.json")))
now = {}
for dp, _, fs in os.walk(ROOT):
    for n in fs:
        f = os.path.join(dp, n); rel = os.path.relpath(f, ROOT).replace(os.sep, "/")
        if rel != "baseline.json": now[rel] = hashlib.sha256(open(f, "rb").read()).hexdigest()
for r in sorted(set(base) | set(now)):
    if r not in now: print("DELETED ", r)
    elif r not in base: print("NEW     ", r)
    elif base[r] != now[r]: print("MODIFIED", r)
