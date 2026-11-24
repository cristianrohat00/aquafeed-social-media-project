# Step 2 — n8n copies: raw storage, cross-source dedup, agent API, approval flow

All three workflows are **copies, inactive**. The live workflows (Post facebook / instagram / linkedin, Telegram reply handler) are untouched.

| Workflow | ID | What it does |
|---|---|---|
| AQ Scrape raw [copy] | `wDsMinrZ3YvgPkDe` | Daily 06:30: Apify FB + IG + LinkedIn → normalise → cross-source dedup → `aq_raw_posts`. No OpenAI. |
| AQ Agent API [copy] | `rZ5dVvpMbX5Jy2jc` | 5 webhooks for the Claude agent (below). |
| AQ Approval handler [copy] | `6hO7NkMvrdmATGU5` | Buttons on Telegram drafts → publish now / schedule / edit / reject. Publishes to FB. |

Data tables: `aq_raw_posts` (`xRca1kNecQVoyUS4`), `aq_drafts` (`MrKMWHe3QN3g0NT0`), `aq_state` (`zLXQ3bzyhMXpvdEi`).

## Agent API (all need header `X-AQ-Key`)
| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/webhook/aq/raw-posts` | – | `{count, posts[]}` with status=new |
| POST | `/webhook/aq/raw-posts-status` | `{dedup_keys:[], status:"used"\|"skipped"\|"new"}` | `{ok, updated}` |
| POST | `/webhook/aq/draft` | `{kind:"post"\|"reply"\|"ad"\|"report", text, images:[{b64,name}], tags:{format,audience,topic,...}, suggested_time, summary, source_key, target_id}` | `{ok, draft_id}` + Telegram message with buttons |
| GET | `/webhook/aq/insights` | `?post_ids=a,b&metrics=...` | per-post stats + page followers |
| GET | `/webhook/aq/comments` | `?days=7` | recent comments + Messenger threads |

**Insights metrics (Graph v25, verified 24.11.2026):** always pass
`metrics=post_total_media_view_unique,post_media_view,post_clicks,post_clicks_by_type,post_reactions_by_type_total`
(reach, views, clicks, reactions). `post_impressions` and `post_negative_feedback` are rejected by v25; `post_impressions_unique` returns no data. The workflow default still lists the old names; it gets fixed with the next W2 update.

## Cross-source dedup
Same post = same **text fingerprint** (NFKC → lowercase → strip links/hashtags/diacritics → first 120 letters → hash) **or** same **embedded link** (shorteners like loom.ly / lnkd.in ignored). A repeat on another platform only extends `sources` (e.g. `fb,li,ig`).
Measured on the real 4-week scrape: 44 items → 33 unique posts (11 cross-posts merged).

## Approval flow (Telegram, TEST bot)
Each draft message has 4 buttons carrying the draft id → several drafts can wait at once (the live handler supports only one pending post).
- ✅ Publică acum · 🕒 La ora propusă (Facebook native scheduling) · ✏️ Editează (your next message replaces the text; before/after saved in `aq_drafts.edit_log`) · ❌ Respinge
- A second press on a decided draft is blocked (no double publishing).
- Only your Telegram user id is accepted.
- Images: agent → n8n (base64) → Telegram (file_id kept) → on approval downloaded from Telegram → FB unpublished photos → feed post with `attached_media`.

## Tests run (pinned Telegram/Facebook/Apify, real data-table writes)
| Test | Result |
|---|---|
| Scraper: 5 real BioMar items (FB, IG×2, LI×2) | 3 rows, FB+LI and IG+LI merged ✅ |
| Scraper re-run + same post from a new platform | no duplicate, sources → `fb,li,ig` ✅ |
| GET raw-posts | returns the 3 rows ✅ |
| POST draft with image + Romanian text + HTML chars | image decoded, preview escaped, RO date/time, row stored ✅ |
| ✏️ Edit → new text | text replaced, edit_log written, state cleared ✅ |
| 🕒 Schedule with 1 image | FB body with attached_media + scheduled_published_time 19:00 RO, draft=scheduled, supplier post=used ✅ |
| Press button again | blocked ✅ |
| POST raw-posts-status | 2 rows updated ✅ |
Test rows deleted afterwards.

## Real-API tests (24.11.2026, with Cristi's credentials)
| Test | Result |
|---|---|
| Apify FB + IG + LinkedIn scrape | 15 unique posts stored, 4 cross-posts merged ✅ |
| Draft with image → Telegram test bot | image + preview + 4 buttons ✅ |
| ✏️ Edit, ❌ Reject buttons | ✅ (after removing the trigger's userIds filter, see below) |
| 🕒 Schedule with image | FB scheduled post `101118028329592_1606415161513963` ✅ |
| Page followers, comments, conversations | ✅ (needs a **Page** token) |
| Post insights | ✅ with the metrics above |

**Lessons**
- n8n 2.x: *Save* keeps a draft; the live version changes only on *Publish*.
- Telegram Trigger "Restrict to User IDs" drops button presses (callback_query). Left empty; the Parse update node checks the user id.
- FB token must be a Page token that never expires (Access Token Debugger: Type Page, Expires Never). A short-lived token made publishing fail silently.

**Open fixes (next W2/W3 update, needs credentials re-selected once):** publishing errors → Telegram alert; insights default metrics; "1 imagini" → "1 imagine"; scraper failure alert.

## Credentials to create in n8n (Credentials → Add credential)
| Name (exact) | Type | Field | Value |
|---|---|---|---|
| `Apify token` | Query Auth | Name: `token` | new Apify API token |
| `FB Page token` | Query Auth | Name: `access_token` | page access token |
| `Telegram AQ Agent bot` | Telegram API | Access Token | token of a NEW test bot from @BotFather |
| `AQ Agent API key` | Header Auth | Name: `X-AQ-Key` | long random string |

Then open each [copy] workflow → nodes with a red credential warning → pick the credential → Save.
