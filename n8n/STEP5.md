# Step 5 — scheduled runs

| Scheduled task | When (Bucharest) | Does |
|---|---|---|
| Aquafeed agent: daily drafts (`trig_01BwGQ1TMwc7ZTRTcYN7Jfd9`) | daily 07:47 | fresh session → `agent/RUN.md` + `agent/PROMPT.md` → drafts for empty slots → note in n8n memory |
| Aquafeed agent: weekly learning + report (`trig_01FeE5PdFyL5HhGW9ge5Zvfh`) | Monday 07:13 | `agent/WEEKLY.md` → playbook update in n8n memory → report on Telegram |

n8n: AQ Agent memory [copy] `e9KzO7NzQmvXZNsY` (GET/POST `/webhook/aq/memory`, table `aq_state`). Insights collector now alerts on Telegram at 09:00 if the FB token fails.

Scheduled sessions read the public repo and never push (they have no git write access); memory = n8n (playbook, superseded, run:<date>, weekly:<date>).

Tests 2026-11-24: run 1 sent draft dmwv2q7zyedx (Tue 1.12, myth vs fact) but push failed → memory moved to n8n; run 3 saved run:2026-11-24 in memory, sent nothing (slots covered) ✅
