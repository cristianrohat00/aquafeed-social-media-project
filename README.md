# Aquafeed social media agent

Claude = brain, n8n = hands, Cristi approves every post on Telegram.

- `render.py` — post image pipeline (overlay / split / card templates, 1080×1350).
- `step1/` — proof-of-concept posts (`POSTS.md`) and render script. Supplier images, scraped posts and renders are kept out of this public repo.
- `n8n/` — Workflow SDK sources for the n8n copies, dedup logic, step 2 docs (`STEP2.md`).

No API keys or tokens live in this repo; n8n credentials hold them.
