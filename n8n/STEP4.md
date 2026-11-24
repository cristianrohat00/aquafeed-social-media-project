# Step 4 — learning loop

## n8n (copies, active)
| Workflow | ID | What |
|---|---|---|
| AQ Insights collector [copy] | `frfvrlyqXTQrmbBR` | Hourly: page followers → `aq_page_daily` (1 row/day); post stats at 24h / 72h / 168h after going live → `aq_post_stats` |
| AQ Agent API [copy] | `rZ5dVvpMbX5Jy2jc` | + `GET /aq/drafts?since=`, `GET /aq/stats`, `POST /aq/fetch-image {url}`; reports sent without buttons; insights default metrics fixed for Graph v25 |

Tables: `aq_post_stats` (`4DEfBcOQ3NAiHt3W`), `aq_page_daily` (`dLsnuuCVUXBMcBmz`).
Metrics: reach = `post_total_media_view_unique`, views = `post_media_view`, clicks = `post_clicks`, reactions / comments / shares from the post object.

## Agent (repo)
- `agent/score.py` — score per post (rates per 1,000 reach ÷ median, weighted by `config.json → score_weights`, followers attributed from daily follower change), variants by tag with n and confidence, decay, Cristi's approvals / edits / rejections.
- `agent/WEEKLY.md` — Monday run: score → playbook rules with evidence (n ≥ 5) → learned voice from edits → plan → report on Telegram → change log.
- `agent/PROMPT.md` — daily run now reads recent drafts (pending/scheduled, edits, rejections) and can fetch BioMar images.

## Tested
- Collector: page row saved (279 followers), no post due yet.
- Endpoints: drafts, stats, raw-posts, comments OK with key; 403 without.
- fetch-image: BioMar Instagram image (112 KB) downloaded through n8n; other hosts refused.
- score.py on synthetic data (4 posts) and live (no stats yet).
- Weekly report format sent to Telegram (no buttons).

## Credentials
Linked by ID in the SDK code (`{ id, name }`), so updates no longer need manual re-selection. Header auth on webhooks is auto-assigned by name.
