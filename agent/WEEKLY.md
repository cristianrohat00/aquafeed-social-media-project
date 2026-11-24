# Weekly run — learn, update the playbook, report to Cristi

Runs every Monday morning, before the daily run. Fresh session: read the repo first.

## 1. Collect
- `python agent/score.py` (JSON) and `python agent/score.py --md` (Romanian summary).
- `python agent/aq.py drafts <date 8 days ago>`: every decided draft of the week, with `original_text` vs `text` and `edit_log`.
- `python agent/aq.py stats`: `page_days` gives the week's follower change (last day − first day).
- `python agent/aq.py comments 7`: questions and leads from comments and messages.

## 1b. Parallel run (until cutover)
`score.py --md` has a section *Sistem nou (agent) vs pipeline actual*: posts, average score, average reach, followers for each system. Put it in the report as one line: „Nou vs vechi: <scor> vs <scor> (n=<a> / <b>)”. Do not learn voice or rules from pipeline posts (they are translations), only use them as the comparison baseline.

## 2. Learn from performance
- Use only posts with a 72h or 168h checkpoint; 24h-only scores are provisional.
- For each tag (pillar, format, hook, audience, cta, topic), compare variant scores. A variant with **n < 5** stays a *hypothesis* (low confidence), never a rule.
- Change a rule in `playbook.md` → *Current rules* only when it has n ≥ 5 **and** the gap is clear (≥ 30 % better than the median, consistent over at least 2 weeks). Write it with the evidence: „Mit vs fapt: scor 1,8 vs 1,0 tipic (n=6, 3 săpt.)”.
- Older evidence fades (decay half-life in config.json); drop a rule when new data contradicts it.
- Never chase a metric with clickbait or exaggerated claims. If a high score came from a controversial or misleading angle, do not reuse it.

## 3. Learn from Cristi's decisions
- **Edits**: diff `original_text` → `text`. Note concrete patterns (shorter? removed emojis? replaced a word? changed the call to action? toned down a claim?). Add them under *Voice — learned from Cristi's edits* in `playbook.md` with the example. One edit = observation; the same change twice = rule.
- **Rejections**: count by pillar/format/topic (`score.py` → decisions). Two rejections of the same kind → stop proposing it until Cristi asks; note it in the playbook.
- Ignore drafts in `agent/log/superseded.txt` (re-sent versions).

## 4. Plan the next week
- 4 slots (config `cadence.slots`), pillar mix from config, 70–80 % proven / 20–30 % tests. Say which tests run and what each one tests.
- If a post did clearly well (score ≥ 1,5 at 72h, reach above median) and fits goal 1 (followers), propose **one** ad as a `kind: "ad"` draft: post, audience (Romania, age, interests), budget per day, days, stop rule (cost per follower). Ads are created PAUSED; Cristi activates them.

## 5. Report — `kind: "report"` draft (no buttons), Romanian, max ~25 lines
```
📊 Raport săptămânal · <dată–dată>
Urmăritori: <total> (<+/−> față de săptămâna trecută)
Reach total: <n> · Postări publicate: <n>

🏆 Top: <titlu> — scor <x> (<de ce>)
⚠️ Cel mai slab: <titlu> — scor <x> (<de ce>)

Ce am învățat:
• <regulă sau ipoteză + dovezi, n=…>
• <ce am văzut din editările tale>

Ce schimb săptămâna asta:
• <schimbare în playbook>

Plan: <zi oră · pilon · test>
Lead-uri / întrebări din comentarii: <scurt sau „niciunul”>
Propunere reclamă: <da/nu + 1 rând>
```

## 6. Write back
- Start from the memory copy: `python agent/aq.py memory-get playbook agent/playbook.md`. Edit rules, hypotheses, learned voice, and add one line in *Change log* per change (date, what, evidence). Save: `python agent/aq.py memory-put playbook agent/playbook.md`.
- Save the full `score.py --md` output + the report text: `memory-put weekly:<YYYY-MM-DD> weekly.md`.
- Do not push to git (see RUN.md). Claude syncs the memory playbook into the repo during maintenance.
- Never change `score_weights` or the cadence in config.json without Cristi's OK; propose it in the report instead.
