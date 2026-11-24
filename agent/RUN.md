# Scheduled runs

Two scheduled tasks start a fresh Claude session; each one follows this file.

| Run | When (Europe/Bucharest) | Instructions |
|---|---|---|
| Daily drafts | every day 07:47 (after the 06:30 scrape) | `agent/PROMPT.md` |
| Weekly learning + report | Monday 07:13 (before the daily run) | `agent/WEEKLY.md`, then nothing else |

## Start of every run
1. Code: `git clone https://github.com/cristianrohat00/aquafeed-social-media-project /home/user/aquafeed-social-media-project` (public, read-only; or `git pull` if it exists). **Do not push** — scheduled sessions have no write access. Everything the agent remembers lives in n8n:
   - playbook → `python agent/aq.py memory-get playbook agent/playbook.md` (overwrite the repo copy; the memory version is newer). If not found, use the repo file.
   - superseded draft ids → `memory-get superseded`; drafts, tags, edits → `aq.py drafts`; stats → `aq.py stats`.
2. Check the API: `python agent/aq.py drafts 2026-01-01 > /dev/null`. If it fails (403, timeout), stop and go to *Failure*.
3. Today's date and time in Bucharest decide the slots: `TZ=Europe/Bucharest date`.

## Rules for scheduled runs
- Nothing is published: you only create drafts / reports. Cristi's buttons publish.
- Do not change n8n workflows, credentials, the environment or scheduled tasks from a scheduled run.
- Do not ask questions (nobody is watching). If something needs Cristi, say it in the draft `summary` or in a report.
- Quiet days are fine: if the next slots are already covered, send nothing and end.
- Save what must be remembered with `aq.py memory-put` instead of git:
  - daily run: a short note under `run:<YYYY-MM-DD>` (drafts sent with id/slot/tags/title, posts skipped and why);
  - re-sent drafts: append the old id to `superseded` (get, append a line, put);
  - weekly run: the updated playbook under `playbook`, and score + report under `weekly:<YYYY-MM-DD>`.
- Rendered images stay in the container; that's fine, Telegram keeps them.

## Failure
If the run cannot finish (API down, render error, repo problem), send one short `kind: "report"` message if the API works:
`⚠️ Rularea agentului din <data> nu s-a încheiat: <motiv într-un rând>. Nimic nu a fost publicat.`
If the API itself is down, just end with the error in the output.
