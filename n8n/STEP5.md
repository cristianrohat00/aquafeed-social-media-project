# Step 5 — scheduled runs

| Scheduled task | When (Bucharest) | Does |
|---|---|---|
| Aquafeed agent: daily drafts (`trig_01BwGQ1TMwc7ZTRTcYN7Jfd9`) | daily 07:47 | fresh session → `agent/RUN.md` + `agent/PROMPT.md` → drafts for empty slots → note in n8n memory |
| Aquafeed agent: weekly learning + report (`trig_01FeE5PdFyL5HhGW9ge5Zvfh`) | Monday 07:13 | `agent/WEEKLY.md` → playbook update in n8n memory → report on Telegram |

n8n: AQ Agent memory [copy] `e9KzO7NzQmvXZNsY` (GET/POST `/webhook/aq/memory`, table `aq_state`). Insights collector now alerts on Telegram at 09:00 if the FB token fails.

Scheduled sessions read the public repo and never push (they have no git write access); memory = n8n (playbook, superseded, run:<date>, weekly:<date>).

Tests 2026-11-24: run 1 sent draft dmwv2q7zyedx (Tue 1.12, myth vs fact) but push failed → memory moved to n8n; run 3 saved run:2026-11-24 in memory, sent nothing (slots covered) ✅

# Step 6 — parallel run (25.11–07.12.2026)
- Insights collector tracks every page post (origin agent / pipeline) → fair comparison in `score.py --md`.
- New endpoint `GET /webhook/aq/page-posts?days=` (memory workflow `e9KzO7NzQmvXZNsY`): published + scheduled posts from both systems; the agent never repeats a topic already on the page, max 1 post/day.
- Score uses views when Meta's unique reach is still 0 (lag at 24h).
- One-off final report: `trig_01DgeTMZ9WuhufoScDrrbZGj`, Tue 08.12.2026 08:37 → Telegram, read-only. Cutover checklist in `agent/CUTOVER.md`, only after Cristi's YES.
