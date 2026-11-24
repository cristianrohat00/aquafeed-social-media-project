#!/usr/bin/env python3
"""Scores published posts and summarises what works.

  python agent/score.py                       -> fetch drafts + stats from n8n, print JSON summary
  python agent/score.py --md                  -> same, as a Markdown report (Romanian labels)
  python agent/score.py --stats s.json --drafts d.json   -> offline (tests)

Score per post (config.json → score_weights): each signal is a rate per 1,000 reach,
divided by the median of that rate across scored posts (so 1.0 = typical), then weighted.
New followers are attributed from the daily follower count: the change from the day
before a post until 2 days after it, split between posts live in that window.
Older posts count less (decay half-life in config). Variants with < N posts are flagged
low confidence.
"""
import json, math, os, statistics, subprocess, sys, datetime as dt
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
W = CFG["score_weights"]
L = CFG["learning"]
TAG_KEYS = ["pillar", "format", "hook", "audience", "cta", "topic"]
CP_ORDER = ["168h", "72h", "24h"]


def fetch(path):
    out = subprocess.run(["python3", os.path.join(HERE, "aq.py")] + path, capture_output=True, check=True).stdout
    return json.loads(out)


def day(iso):
    t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return (t + dt.timedelta(hours=2)).date()  # Bucharest, close enough for daily buckets


def follower_gain(posts, page_days):
    """{fb_post_id: attributed new followers or None}"""
    f = {dt.date.fromisoformat(r["day"]): r["followers"] for r in page_days if r.get("followers") is not None}
    windows = {}
    for p in posts:
        d0 = day(p["live_at"])
        windows[p["fb_post_id"]] = (d0 - dt.timedelta(days=1), d0 + dt.timedelta(days=2))
    out = {}
    for pid, (a, b) in windows.items():
        if a not in f or b not in f:
            out[pid] = None
            continue
        overlap = sum(1 for q, (qa, qb) in windows.items() if qa <= b and qb >= a)
        out[pid] = (f[b] - f[a]) / max(1, overlap)
    return out


def main(argv):
    md = "--md" in argv
    if "--stats" in argv:
        stats = json.load(open(argv[argv.index("--stats") + 1], encoding="utf-8"))
        drafts = json.load(open(argv[argv.index("--drafts") + 1], encoding="utf-8"))
    else:
        stats, drafts = fetch(["stats"]), fetch(["drafts", "2026-01-01"])
    now = dt.datetime.now(dt.timezone.utc)
    by_draft = {d["draft_id"]: d for d in drafts["drafts"]}

    # latest checkpoint per post
    best = {}
    for r in stats["posts"]:
        cur = best.get(r["fb_post_id"])
        if cur is None or CP_ORDER.index(r["checkpoint"]) < CP_ORDER.index(cur["checkpoint"]):
            best[r["fb_post_id"]] = r
    posts = list(best.values())
    gains = follower_gain(posts, stats.get("page_days", []))

    rows = []
    for r in posts:
        d = by_draft.get(r["draft_id"], {})
        reach = max(1, r.get("reach") or 0)
        k = 1000.0 / reach
        g = gains.get(r["fb_post_id"])
        rates = {
            "new_followers_per_1k_reach": None if g is None else g * k,
            "shares_per_1k_reach": (r.get("shares") or 0) * k,
            "comments_per_1k_reach": (r.get("comments") or 0) * k,
            "reactions_per_1k_reach": (r.get("reactions") or 0) * k,
            "clicks_per_1k_reach": (r.get("clicks") or 0) * k,
        }
        age = (now - dt.datetime.fromisoformat(r["live_at"].replace("Z", "+00:00"))).days
        rows.append({"draft_id": r["draft_id"], "fb_post_id": r["fb_post_id"], "checkpoint": r["checkpoint"],
                     "reach": r.get("reach") or 0, "followers": g, "rates": rates, "tags": d.get("tags") or {},
                     "title": (d.get("text") or "")[:70], "age_days": age,
                     "decay": 0.5 ** (age / L["decay_half_life_days"]), "provisional": r["checkpoint"] == "24h"})

    med = {}
    for m in W:
        vals = [x["rates"][m] for x in rows if x["rates"][m] is not None]
        med[m] = statistics.median(vals) if vals and statistics.median(vals) > 0 else None
    for x in rows:
        s = tw = 0.0
        for m, w in W.items():
            v = x["rates"][m]
            if v is None or not med[m]:
                continue
            s += w * v / med[m]
            tw += w
        x["score"] = round(s / tw, 2) if tw else None

    variants = {}
    for key in TAG_KEYS:
        acc = defaultdict(lambda: [0.0, 0.0, 0])
        for x in rows:
            v = x["tags"].get(key)
            if v in (None, "") or x["score"] is None:
                continue
            a = acc[str(v)]
            a[0] += x["score"] * x["decay"]; a[1] += x["decay"]; a[2] += 1
        variants[key] = sorted(({"value": v, "score": round(a[0] / a[1], 2), "n": a[2],
                                 "confidence": "ok" if a[2] >= L["min_posts_per_variant_for_confidence"] else "low"}
                                for v, a in acc.items()), key=lambda z: -z["score"])

    # approvals and edits (learning from Cristi)
    sup_path = os.path.join(HERE, "log", "superseded.txt")
    superseded = set(l.strip() for l in open(sup_path, encoding="utf-8") if l.strip() and not l.startswith("#")) if os.path.exists(sup_path) else set()
    # only real agent drafts (tagged with a pillar), not tests or superseded versions
    dec = [d for d in drafts["drafts"] if d["kind"] == "post" and d["status"] not in ("pending", "info")
           and (d.get("tags") or {}).get("pillar") and d["draft_id"] not in superseded]
    edits = [d for d in dec if d.get("edited")]
    rej = defaultdict(lambda: [0, 0])
    for d in dec:
        p = (d.get("tags") or {}).get("pillar") or "?"
        rej[p][1] += 1
        rej[p][0] += d["status"] == "rejected"
    edit_stats = [{"draft_id": d["draft_id"], "words_before": len((d["original_text"] or "").split()),
                   "words_after": len((d["text"] or "").split())} for d in edits]

    res = {"scored_posts": sorted(rows, key=lambda z: -(z["score"] or -1)), "medians": med, "variants": variants,
           "decisions": {"total": len(dec), "edited": len(edits), "rejected": sum(1 for d in dec if d["status"] == "rejected"),
                         "rejected_by_pillar": {k: {"rejected": v[0], "of": v[1]} for k, v in rej.items()}, "edits": edit_stats}}
    if not md:
        print(json.dumps(res, ensure_ascii=False, indent=1, default=str))
        return
    out = ["## Scor postări (1,0 = tipic)"]
    if not rows:
        out.append("Încă nu sunt postări cu statistici (prima măsurătoare vine la 24 h după publicare).")
    for x in res["scored_posts"]:
        f = "?" if x["followers"] is None else f"{x['followers']:+.1f}"
        out.append(f"- **{x['score']}** · {x['title']}… · reach {x['reach']} · urmăritori {f} · {x['checkpoint']}" + (" (provizoriu)" if x["provisional"] else ""))
    out.append("\n## Ce funcționează (pe variante)")
    for key, vs in variants.items():
        if vs:
            out.append(f"- {key}: " + "; ".join(f"{v['value']} {v['score']} (n={v['n']}{', încredere mică' if v['confidence'] == 'low' else ''})" for v in vs))
    dd = res["decisions"]
    out.append(f"\n## Deciziile lui Cristi\n- {dd['total']} drafturi decise · {dd['edited']} editate · {dd['rejected']} respinse")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1:])
