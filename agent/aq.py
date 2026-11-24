#!/usr/bin/env python3
"""Agent tools for the n8n Agent API. The X-AQ-Key header is injected by the
session's network proxy, so no key is read or stored here.

  python agent/aq.py raw                          -> new supplier posts (JSON)
  python agent/aq.py status used KEY [KEY...]     -> mark raw posts used/skipped/new
  python agent/aq.py image spec.json              -> render image(s) from a spec
  python agent/aq.py draft draft.json             -> send draft (+images) to Telegram
  python agent/aq.py insights POST_ID [POST_ID..] -> post stats + page followers
  python agent/aq.py comments [DAYS]              -> recent comments + messages
"""
import base64, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CFG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
BASE = CFG["api_base"]


def call(method, path, body=None, query=""):
    cmd = ["curl", "-sS", "-m", "120", "-X", method, BASE + path + query]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "--data-binary", "@-"]
    out = subprocess.run(cmd, input=json.dumps(body, ensure_ascii=False).encode() if body is not None else None,
                         capture_output=True, check=True).stdout.decode("utf-8")
    try:
        return json.loads(out)
    except ValueError:
        sys.exit("Unexpected answer from n8n: " + out[:300])


def render(spec):
    """spec: {template: overlay|split|card, out: path, ...render.py kwargs}"""
    sys.path.insert(0, ROOT)
    import render as r
    spec = dict(spec)
    tpl = spec.pop("template")
    r.BIOMAR = spec.pop("biomar_logo", True)
    for k in ("crop", "header_crop"):
        if k in spec and spec[k] is not None:
            spec[k] = tuple(spec[k])
    os.makedirs(os.path.dirname(spec["out"]) or ".", exist_ok=True)
    getattr(r, tpl)(**spec)
    return spec["out"]


def main(a):
    if not a:
        sys.exit(__doc__)
    cmd = a[0]
    if cmd == "raw":
        res = call("GET", "/raw-posts")
    elif cmd == "status":
        res = call("POST", "/raw-posts-status", {"status": a[1], "dedup_keys": a[2:]})
    elif cmd == "image":
        specs = json.load(open(a[1], encoding="utf-8"))
        res = [render(s) for s in (specs if isinstance(specs, list) else [specs])]
    elif cmd == "draft":
        d = json.load(open(a[1], encoding="utf-8"))
        imgs = []
        for p in d.pop("image_paths", []):
            imgs.append({"b64": base64.b64encode(open(os.path.join(ROOT, p) if not os.path.isabs(p) else p, "rb").read()).decode(),
                         "name": os.path.basename(p)})
        if imgs:
            d["images"] = imgs
        res = call("POST", "/draft", d)
    elif cmd == "insights":
        res = call("GET", "/insights", query="?post_ids=" + ",".join(a[1:]) + "&metrics=" + CFG["insights_metrics"])
    elif cmd == "comments":
        res = call("GET", "/comments", query="?days=" + (a[1] if len(a) > 1 else "7"))
    else:
        sys.exit(__doc__)
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(sys.argv[1:])
