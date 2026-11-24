import { workflow, node, trigger, merge, ifElse, sticky, newCredential } from '@n8n/workflow-sdk';

const schedule = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Daily 06:30', position: [0, 300], parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 6, triggerAtMinute: 30 }] } } },
  output: [{}] });

const fb = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Apify FB', position: [260, 120], onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: 'https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items',
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: "{\"startUrls\": [{\"url\": \"https://www.facebook.com/BioMarEMEADivision/\"}], \"resultsLimit\": 8}",
      options: { timeout: 280000 } },
    credentials: { httpQueryAuth: newCredential('Apify token') } },
  output: [{}] });
const ig = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Apify IG', position: [260, 300], onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: 'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items',
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: "{\"directUrls\": [\"https://www.instagram.com/biomargroup/\"], \"resultsType\": \"posts\", \"resultsLimit\": 8}",
      options: { timeout: 280000 } },
    credentials: { httpQueryAuth: newCredential('Apify token') } },
  output: [{}] });
const li = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Apify LinkedIn', position: [260, 480], onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: 'https://api.apify.com/v2/acts/harvestapi~linkedin-company-posts/run-sync-get-dataset-items',
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: "{\"targetUrls\": [\"https://www.linkedin.com/company/biomar-emea/\", \"https://www.linkedin.com/company/biomar-group/\"], \"maxPosts\": 6, \"postedLimit\": \"week\", \"scrapeReactions\": false, \"scrapeComments\": false, \"includeReposts\": false, \"includeQuotePosts\": true}",
      options: { timeout: 280000 } },
    credentials: { httpQueryAuth: newCredential('Apify token') } },
  output: [{}] });

const all = merge({ version: 3.2, config: { name: 'All sources', position: [520, 300], parameters: { mode: 'append', numberInputs: 3 } } });

const normalize = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Normalize + keys', position: [760, 300], parameters: { mode: 'runOnceForAllItems', jsCode: "// Cross-source dedup keys for BioMar posts (FB / IG / LinkedIn).\n// Pasted verbatim into the n8n Code node \"Normalize + keys\". Pure JS, no require().\n// A post is a duplicate if its text_key OR its link_key matches an existing row.\n\nconst SHORTENERS = /(^|\\.)(loom\\.ly|bit\\.ly|lnkd\\.in|ow\\.ly|buff\\.ly|t\\.co|tinyurl\\.com)$/;\nconst SOCIAL = /(^|\\.)(facebook\\.com|fb\\.com|fb\\.me|instagram\\.com|linkedin\\.com|youtube\\.com|youtu\\.be)$/;\n\nfunction cyrb53(str, seed = 0) {\n  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;\n  for (let i = 0; i < str.length; i++) {\n    const ch = str.charCodeAt(i);\n    h1 = Math.imul(h1 ^ ch, 2654435761);\n    h2 = Math.imul(h2 ^ ch, 1597334677);\n  }\n  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);\n  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);\n  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);\n}\n\n// BioMar writes headlines in Unicode \"math bold\" letters; NFKC turns them into plain ASCII.\nfunction plain(text) {\n  return String(text || '').normalize('NFKC');\n}\n\nfunction textKey(text) {\n  let t = plain(text).toLowerCase();\n  t = t.replace(/https?:\\/\\/\\S+/g, ' ').replace(/[#@][\\p{L}\\p{N}_]+/gu, ' ');\n  t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');\n  t = t.replace(/[^a-z0-9]+/g, '');\n  if (t.length < 25) return '';            // too short to be a reliable fingerprint\n  return 't:' + cyrb53(t.slice(0, 120));\n}\n\nfunction normUrl(u) {\n  // no URL class in the n8n Code sandbox -> plain regex\n  const m = String(u).match(/^https?:\\/\\/([^\\/?#\\s]+)([^?#\\s]*)/i);\n  if (!m) return '';\n  const host = m[1].toLowerCase().replace(/^www\\./, '').replace(/:\\d+$/, '');\n  if (SHORTENERS.test(host) || SOCIAL.test(host)) return '';\n  return host + m[2].replace(/\\/+$/, '').toLowerCase();\n}\n\nfunction linkKey(text, link) {\n  const cands = [];\n  if (link) cands.push(link);\n  const m = plain(text).match(/https?:\\/\\/[^\\s)>\\]]+/g) || [];\n  cands.push(...m);\n  for (const c of cands) {\n    const n = normUrl(c);\n    if (n) return 'l:' + cyrb53(n);\n  }\n  return '';\n}\n\n\nconst now = new Date().toISOString();\nconst out = [];\nconst seenRun = {};\nfunction push(source, url, date, text, link, images) {\n  const tk = textKey(text), lk = linkKey(text, link);\n  if (!tk && !lk && !images.length) return;\n  const key = tk || lk || ('u:' + cyrb53(url));\n  // in-run merge (same post scraped from 2 platforms in this run)\n  const hit = out.find(o => (tk && o.json.text_key === tk) || (lk && o.json.link_key === lk));\n  if (hit) {\n    const s = hit.json.sources.split(','); if (s.indexOf(source) === -1) s.push(source);\n    hit.json.sources = s.join(',');\n    const u = JSON.parse(hit.json.source_urls); u.push(url); hit.json.source_urls = JSON.stringify(u);\n    if (!hit.json.link_key && lk) hit.json.link_key = lk;\n    if (JSON.parse(hit.json.images).length < images.length) hit.json.images = JSON.stringify(images.slice(0, 10));\n    return;\n  }\n  out.push({ json: { dedup_key: key, text_key: tk, link_key: lk, sources: source, source_urls: JSON.stringify([url]),\n    post_date: date || now, text: plain(text), images: JSON.stringify(images.slice(0, 10)), link: link || '',\n    status: 'new', first_seen: now, last_seen: now } });\n}\nfor (const it of $input.all()) {\n  const j = it.json;\n  if (j.facebookUrl !== undefined || j.postId !== undefined && j.media !== undefined) {\n    const imgs = (j.media || []).map(m => (m.image && m.image.uri) || (m.photo_image && m.photo_image.uri) || m.thumbnail).filter(Boolean);\n    push('fb', j.url || j.topLevelUrl || '', j.time || '', j.text || '', j.link || '', imgs);\n  } else if (j.shortCode !== undefined || j.ownerUsername !== undefined) {\n    let imgs = (j.images || []).filter(u => typeof u === 'string');\n    if (!imgs.length && j.displayUrl) imgs = [j.displayUrl];\n    push('ig', j.url || '', j.timestamp || '', j.caption || '', '', imgs);\n  } else if (j.linkedinUrl !== undefined || j.content !== undefined) {\n    const imgs = [];\n    for (const b of [j.postImages, j.images]) if (Array.isArray(b)) for (const v of b) { const u = typeof v === 'string' ? v : (v && (v.url || v.src)); if (u) imgs.push(u); }\n    const pa = j.postedAt || {};\n    const link = (j.article && (j.article.link || j.article.url)) || '';\n    push('li', j.linkedinUrl || j.url || '', pa.date || (typeof j.postedAt === 'string' ? j.postedAt : ''), j.content || j.text || '', link, imgs);\n  }\n}\nreturn out;\n" } },
  output: [{ dedup_key: 't:x', text_key: 't:x', link_key: '', sources: 'fb', source_urls: '[]', post_date: '', text: '', images: '[]', link: '', status: 'new', first_seen: '', last_seen: '' }] });

const RAW = { __rl: true, mode: 'id', value: 'xRca1kNecQVoyUS4', cachedResultName: 'aq_raw_posts' };

const getStored = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Get stored posts', position: [1000, 300], executeOnce: true, alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: RAW, returnAll: true } },
  output: [{ id: 1, dedup_key: 't:x', text_key: 't:x', link_key: '', sources: 'fb', source_urls: '[]' }] });

const diff = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Diff vs stored', position: [1240, 300], parameters: { mode: 'runOnceForAllItems', jsCode: "// Compare this run's posts with rows already stored. New -> insert. Known -> merge sources.\nconst existing = $('Get stored posts').all().map(i => i.json).filter(r => r.dedup_key);\nconst now = new Date().toISOString();\nconst res = [];\nfor (const it of $('Normalize + keys').all()) {\n  const p = it.json;\n  const hit = existing.find(r => (p.text_key && r.text_key === p.text_key) || (p.link_key && r.link_key === p.link_key));\n  if (!hit) { res.push({ json: Object.assign({ op: 'insert' }, p) }); continue; }\n  const s = String(hit.sources || '').split(',').filter(Boolean);\n  for (const x of p.sources.split(',')) if (s.indexOf(x) === -1) s.push(x);\n  let u = []; try { u = JSON.parse(hit.source_urls || '[]'); } catch (e) {}\n  for (const x of JSON.parse(p.source_urls)) if (u.indexOf(x) === -1) u.push(x);\n  const changed = s.join(',') !== hit.sources;\n  res.push({ json: { op: changed ? 'update' : 'same', dedup_key: hit.dedup_key, sources: s.join(','),\n    source_urls: JSON.stringify(u.slice(-10)), link_key: hit.link_key || p.link_key, last_seen: now } });\n}\nreturn res;\n" } },
  output: [{ op: 'insert', dedup_key: 't:x' }] });

const isNew = ifElse({ version: 2.2, config: { name: 'New post?', position: [1480, 300],
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: '={{ $json.op }}', rightValue: 'insert', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } } } });

const isUpd = ifElse({ version: 2.2, config: { name: 'Seen on a new platform?', position: [1720, 420],
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: '={{ $json.op }}', rightValue: 'update', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } } } });

const insert = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Insert raw post', position: [1720, 200],
    parameters: { resource: 'row', operation: 'insert', dataTableId: RAW,
      columns: { mappingMode: 'defineBelow', value: {
        dedup_key: '={{ $json.dedup_key }}', text_key: '={{ $json.text_key }}', link_key: '={{ $json.link_key }}',
        sources: '={{ $json.sources }}', source_urls: '={{ $json.source_urls }}', post_date: '={{ $json.post_date }}',
        text: '={{ $json.text }}', images: '={{ $json.images }}', link: '={{ $json.link }}', status: 'new',
        first_seen: '={{ $json.first_seen }}', last_seen: '={{ $json.last_seen }}' }, matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });

const update = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Merge sources', position: [1960, 400],
    parameters: { resource: 'row', operation: 'update', dataTableId: RAW, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'dedup_key', condition: 'eq', keyValue: '={{ $json.dedup_key }}' }] },
      columns: { mappingMode: 'defineBelow', value: {
        sources: '={{ $json.sources }}', source_urls: '={{ $json.source_urls }}', link_key: '={{ $json.link_key }}', last_seen: '={{ $json.last_seen }}' },
        matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });

const note = sticky('## Raw supplier posts (no translation)\nScrapes BioMar FB / IG / LinkedIn, normalises text and stores each post ONCE in data table aq_raw_posts.\n\nCross-source dedup: a post is the same if its text fingerprint (first 120 letters after NFKC + lowercase + strip links/hashtags) OR its embedded link (shorteners like loom.ly ignored) matches. A repeat on another platform only adds to `sources`.\n\nThe Claude agent reads rows with status=new via the Agent API workflow. Apify token = credential "Apify token" (Query Auth, name `token`).', [], { color: 4, width: 520, height: 260, position: [0, -40] });

export default workflow('aq-scrape-raw', 'AQ Scrape raw [copy]')
  .add(schedule).to(fb.to(all.input(0)))
  .add(schedule).to(ig.to(all.input(1)))
  .add(schedule).to(li.to(all.input(2)))
  .add(all).to(normalize).to(getStored).to(diff).to(isNew
    .onTrue(insert)
    .onFalse(isUpd.onTrue(update)))
  .add(note);
