# Step 6 — parallel run and cutover decision

**Period:** 25.11.2026 – 07.12.2026 (2 weeks). Both systems publish on the same page:
- *pipeline* — current workflows (Post facebook / instagram / linkedin + Telegram reply handler, GPT translations of BioMar posts, live bot);
- *agent* — new system (Claude drafts, test bot, copies in n8n).

The insights collector measures **every** page post the same way (origin = agent | pipeline). The agent avoids topics already on the page and posts max once a day across both.

## Final report — Tuesday 08.12.2026, 08:3x (one-off scheduled run)
Read-only: send a `kind: "report"` message, change nothing.
1. `python agent/score.py --md` + `python agent/aq.py stats` + `python agent/aq.py drafts 2026-11-24` + `python agent/aq.py page-posts 20`.
2. Compare agent vs pipeline: posts published, average score, average reach, comments, shares, followers attributed; follower change over the 2 weeks (`page_days`). Say clearly when samples are too small to conclude.
3. Cristi's workload: drafts sent / approved / edited / rejected for the agent.
4. Recommendation: **switch**, **extend the test** or **stop**, with the 2–3 reasons that matter.
5. If the recommendation is to switch, include the checklist below as the next steps. Save the report under memory key `cutover:report`.

Report (Romanian, ≤ 30 lines):
```
📋 Test paralel 25.11–07.12 · rezultat
Urmăritori: <start> → <final> (<+/−>)
Sistem nou: <n> postări · scor mediu <x> · reach mediu <r>
Pipeline actual: <n> postări · scor mediu <x> · reach mediu <r>
Munca ta: <n> drafturi · <a> aprobate · <e> editate · <r> respinse
Concluzie: <comutăm / mai testăm / oprim> — <motive>
Pași următori: …
```

## Cutover checklist (only after Cristi's YES, done by Claude in an interactive session)
1. Deactivate the current workflows: Post facebook, Post instagram, Post linkedin, Telegram reply handler (this also closes the unauthenticated webhooks `telegram-webhook`, `store-pending-post`, `store-pending-ig-post`). Keep them archived, not deleted, for 30 days.
2. Rotate the tokens that were in plain text in those workflows: OpenAI key, Apify token (if not already the new one), old Telegram bot token, old FB page token.
3. Decide the Telegram bot: keep the test bot as the main one, or move the copies to the old bot (new credential, re-publish approval handler).
4. Rename the copies (drop "[copy]"), keep IDs; update n8n/STEP*.md.
5. Instagram / LinkedIn: the old pipeline also posts there; the agent does Facebook only so far → decide whether to add IG (Graph API, same token family) before switching off "Post instagram".
6. Apify: only the new scraper remains → cost back within the free plan.
