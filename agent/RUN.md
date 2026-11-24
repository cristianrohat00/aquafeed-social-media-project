# Scheduled runs

Two scheduled tasks start a fresh Claude session; each one follows this file.

| Run | When (Europe/Bucharest) | Instructions |
|---|---|---|
| Daily drafts | every day 07:47 (after the 06:30 scrape) | `agent/PROMPT.md` |
| Weekly learning + report | Monday 07:13 (before the daily run) | `agent/WEEKLY.md`, then nothing else |

## Start of every run
1. Repository: if `/home/user/aquafeed-social-media-project` is missing, attach `cristianrohat00/aquafeed-social-media-project` (push access) and clone it there. Work on branch `main`; `git pull` first.
2. Check the API: `python agent/aq.py drafts 2026-01-01 > /dev/null`. If it fails (403, timeout), stop and go to *Failure*.
3. Today's date and time in Bucharest decide the slots: `TZ=Europe/Bucharest date`.

## Rules for scheduled runs
- Nothing is published: you only create drafts / reports. Cristi's buttons publish.
- Do not change n8n workflows, credentials, the environment or scheduled tasks from a scheduled run.
- Do not ask questions (nobody is watching). If something needs Cristi, say it in the draft `summary` or in a report.
- Quiet days are fine: if the next slots are already covered, send nothing and end.
- Commit everything you changed in `agent/` and push to `main` before ending.

## Failure
If the run cannot finish (API down, render error, repo problem), send one short `kind: "report"` message if the API works:
`⚠️ Rularea agentului din <data> nu s-a încheiat: <motiv într-un rând>. Nimic nu a fost publicat.`
If the API itself is down, just end with the error in the output.
