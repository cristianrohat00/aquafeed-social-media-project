import { workflow, node, trigger, ifElse, sticky } from '@n8n/workflow-sdk';

const RAW = { __rl: true, mode: 'id', value: 'xRca1kNecQVoyUS4', cachedResultName: 'aq_raw_posts' };
const DRAFTS = { __rl: true, mode: 'id', value: 'MrKMWHe3QN3g0NT0', cachedResultName: 'aq_drafts' };
const STATS = { __rl: true, mode: 'id', value: '4DEfBcOQ3NAiHt3W', cachedResultName: 'aq_post_stats' };
const PAGE = { __rl: true, mode: 'id', value: 'dLsnuuCVUXBMcBmz', cachedResultName: 'aq_page_daily' };

// ---------- 1. GET /webhook/aq/raw-posts : new supplier posts ----------
const whRaw = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'GET raw-posts', position: [0, 0],
    parameters: { httpMethod: 'GET', path: 'aq/raw-posts', authentication: 'headerAuth', responseMode: 'responseNode' },
    credentials: { httpHeaderAuth: { name: 'AQ Agent API key' } } },
  output: [{ query: {} }] });
const getNew = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Rows status=new', position: [240, 0], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: RAW, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'status', condition: 'eq', keyValue: 'new' }] }, returnAll: true,
      orderBy: true, orderByColumn: 'post_date', orderByDirection: 'DESC' } },
  output: [{ dedup_key: 't:x' }] });
const packRaw = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Pack posts', position: [480, 0], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const posts = $input.all().map(i => i.json).filter(r => r.dedup_key).map(r => ({\n  dedup_key: r.dedup_key, sources: r.sources, source_urls: JSON.parse(r.source_urls || '[]'),\n  post_date: r.post_date, text: r.text, images: JSON.parse(r.images || '[]'), link: r.link, first_seen: r.first_seen }));\nreturn [{ json: { count: posts.length, posts } }];" } },
  output: [{ count: 0, posts: [] }] });
const respRaw = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond raw-posts', position: [720, 0], parameters: { respondWith: 'firstIncomingItem' } } });

// ---------- 2. POST /webhook/aq/raw-posts-status : {dedup_keys:[], status:'used'|'skipped'} ----------
const whStatus = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'POST raw-posts-status', position: [0, 220],
    parameters: { httpMethod: 'POST', path: 'aq/raw-posts-status', authentication: 'headerAuth', responseMode: 'responseNode' },
    credentials: { httpHeaderAuth: { name: 'AQ Agent API key' } } },
  output: [{ body: { dedup_keys: ['t:x'], status: 'used' } }] });
const splitKeys = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'One item per key', position: [240, 220], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const b = $input.first().json.body || {};\nconst ok = ['new', 'used', 'skipped'];\nif (ok.indexOf(b.status) === -1) throw new Error('status must be one of ' + ok.join('/'));\nconst keys = Array.isArray(b.dedup_keys) ? b.dedup_keys : [];\nreturn keys.map(k => ({ json: { dedup_key: String(k), status: b.status } }));" } },
  output: [{ dedup_key: 't:x', status: 'used' }] });
const setStatus = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Set raw status', position: [480, 220], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'update', dataTableId: RAW, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'dedup_key', condition: 'eq', keyValue: '={{ $json.dedup_key }}' }] },
      columns: { mappingMode: 'defineBelow', value: { status: '={{ $json.status }}' }, matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });
const respStatus = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond status', position: [720, 220],
    parameters: { respondWith: 'json', responseBody: '={{ { ok: true, updated: $("One item per key").all().length } }}' } } });

// ---------- 3. POST /webhook/aq/draft : send a draft to Telegram for approval ----------
// body: { kind: 'post'|'reply'|'ad'|'report', text, images: [{ b64, name }], tags: {...}, source_key, suggested_time (ISO), summary, target_id }
const whDraft = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'POST draft', position: [0, 480],
    parameters: { httpMethod: 'POST', path: 'aq/draft', authentication: 'headerAuth', responseMode: 'responseNode' },
    credentials: { httpHeaderAuth: { name: 'AQ Agent API key' } } },
  output: [{ body: { kind: 'post', text: 'x', images: [] } }] });
const prep = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Prepare draft', position: [240, 480], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const b = $input.first().json.body || {};\nif (!b.text || !String(b.text).trim()) throw new Error('text is required');\nconst kinds = ['post', 'reply', 'ad', 'report'];\nconst kind = kinds.indexOf(b.kind) === -1 ? 'post' : b.kind;\nconst id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);\nconst base = { draft_id: id, kind, text: String(b.text), tags: JSON.stringify(b.tags || {}), source_key: b.source_key || '',\n  suggested_time: b.suggested_time || '', summary: b.summary || '', target_id: b.target_id || '' };\nconst imgs = Array.isArray(b.images) ? b.images.slice(0, 10) : [];\nif (!imgs.length) return [{ json: Object.assign({ has_images: false }, base) }];\nconst out = [];\nfor (let i = 0; i < imgs.length; i++) {\n  const im = imgs[i];\n  const raw = typeof im === 'string' ? im : im.b64;\n  const buf = Buffer.from(String(raw).replace(/^data:[^,]+,/, ''), 'base64');\n  const bin = await this.helpers.prepareBinaryData(buf, (im && im.name) || ('img' + (i + 1) + '.jpg'), 'image/jpeg');\n  out.push({ json: Object.assign({ has_images: true, idx: i }, base), binary: { data: bin } });\n}\nreturn out;" } },
  output: [{ draft_id: 'dx', kind: 'post', text: 'x', has_images: true }] });
const hasImg = ifElse({ version: 2.2, config: { name: 'Has images?', position: [480, 480],
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: '={{ $json.has_images }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } } } });
const sendPhoto = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Send image', position: [720, 400],
    parameters: { resource: 'message', operation: 'sendPhoto', chatId: '8274657378', binaryData: true, binaryPropertyName: 'data',
      additionalFields: { caption: '={{ $json.draft_id }} · imagine {{ $json.idx + 1 }}', disable_notification: true } },
    credentials: { telegramApi: { id: 'EtigVq0WqJs79pt0', name: 'Telegram account' } } },
  output: [{ result: { message_id: 1, photo: [{ file_id: 'f' }] } }] });
const collect = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Collect file_ids', position: [960, 400], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const ids = $input.all().map(i => { const p = (i.json.result && i.json.result.photo) || []; return p.length ? p[p.length - 1].file_id : null; }).filter(Boolean);\nconst d = $('Prepare draft').first().json;\nreturn [{ json: Object.assign({}, d, { file_ids: JSON.stringify(ids) }) }];" } },
  output: [{ draft_id: 'dx', file_ids: '[]' }] });
const noImg = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'No images', position: [720, 580], parameters: { mode: 'runOnceForAllItems',
    jsCode: "return [{ json: Object.assign({}, $input.first().json, { file_ids: '[]' }) }];" } },
  output: [{ draft_id: 'dx', file_ids: '[]' }] });
const preview = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Build preview', position: [1200, 480], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const d = $input.first().json;\nconst esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');\nlet t = {}; try { t = JSON.parse(d.tags || '{}'); } catch (e) {}\nconst icon = { post: '📝', reply: '💬', ad: '📣', report: '📊' }[d.kind] || '📝';\nconst meta = [];\nif (t.format) meta.push(t.format);\nif (t.audience) meta.push(t.audience);\nif (t.topic) meta.push(t.topic);\nlet when = '';\nif (d.suggested_time) { try { when = new Date(d.suggested_time).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { when = d.suggested_time; } }\nlet msg = icon + ' <b>' + d.kind.toUpperCase() + '</b> · <code>' + d.draft_id + '</code>';\nif (meta.length) msg += '\\n<i>' + esc(meta.join(' · ')) + '</i>';\nif (when) msg += '\\n🕒 Propus: ' + esc(when);\nconst fids = JSON.parse(d.file_ids || '[]');\nif (fids.length) msg += '\\n🖼 ' + fids.length + (fids.length === 1 ? ' imagine' : ' imagini') + ' (mai sus)';\nmsg += '\\n\\n' + esc(d.text).slice(0, 3300);\nif (d.summary) msg += '\\n\\n💡 ' + esc(d.summary).slice(0, 400);\nconst kb = d.kind === 'report' ? 'none' : 'inlineKeyboard';\nreturn [{ json: Object.assign({}, d, { preview: msg, keyboard: kb }) }];" } },
  output: [{ draft_id: 'dx', preview: 'x' }] });
const sendMsg = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Send draft + buttons', position: [1440, 480],
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '8274657378', text: '={{ $json.preview }}',
      replyMarkup: 'inlineKeyboard',
      inlineKeyboard: { rows: [
        { row: { buttons: [
          { text: '✅ Publică acum', additionalFields: { callback_data: '=a:{{ $json.draft_id }}' } },
          { text: '🕒 La ora propusă', additionalFields: { callback_data: '=s:{{ $json.draft_id }}' } } ] } },
        { row: { buttons: [
          { text: '✏️ Editează', additionalFields: { callback_data: '=e:{{ $json.draft_id }}' } },
          { text: '❌ Respinge', additionalFields: { callback_data: '=r:{{ $json.draft_id }}' } } ] } } ] },
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
    credentials: { telegramApi: { id: 'EtigVq0WqJs79pt0', name: 'Telegram account' } } },
  output: [{ result: { message_id: 2 } }] });
const insDraft = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Store draft', position: [1680, 480],
    parameters: { resource: 'row', operation: 'insert', dataTableId: DRAFTS,
      columns: { mappingMode: 'defineBelow', value: {
        draft_id: '={{ $("Build preview").first().json.draft_id }}', kind: '={{ $("Build preview").first().json.kind }}', status: '={{ $("Build preview").first().json.kind === "report" ? "info" : "pending" }}',
        text: '={{ $("Build preview").first().json.text }}', original_text: '={{ $("Build preview").first().json.text }}',
        tags: '={{ $("Build preview").first().json.tags }}', file_ids: '={{ $("Build preview").first().json.file_ids }}',
        source_key: '={{ $("Build preview").first().json.source_key || $("Build preview").first().json.target_id }}',
        suggested_time: '={{ $("Build preview").first().json.suggested_time || null }}',
        tg_message_id: '={{ String($json.result.message_id) }}', created: '={{ $now.toISO() }}', edit_log: '[]' },
        matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });
const respDraft = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond draft', position: [1920, 480],
    parameters: { respondWith: 'json', responseBody: '={{ { ok: true, draft_id: $("Build preview").first().json.draft_id } }}' } } });

// ---------- 4. GET /webhook/aq/insights?post_ids=a,b&metrics=... ----------
const whIns = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'GET insights', position: [0, 820],
    parameters: { httpMethod: 'GET', path: 'aq/insights', authentication: 'headerAuth', responseMode: 'responseNode' },
    credentials: { httpHeaderAuth: { name: 'AQ Agent API key' } } },
  output: [{ query: { post_ids: '101118028329592_1' } }] });
const splitPosts = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'One item per post', position: [240, 820], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const q = $input.first().json.query || {};\nconst metrics = q.metrics || 'post_total_media_view_unique,post_media_view,post_clicks,post_clicks_by_type,post_reactions_by_type_total';\nconst ids = String(q.post_ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);\nif (!ids.length) return [{ json: { post_id: '', metrics, empty: true } }];\nreturn ids.map(id => ({ json: { post_id: id, metrics } }));" } },
  output: [{ post_id: 'x', metrics: 'post_impressions' }] });
const getPost = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Graph post stats', position: [480, 820], onError: 'continueRegularOutput',
    parameters: { method: 'GET', url: '=https://graph.facebook.com/v25.0/{{ $json.post_id }}',
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendQuery: true, specifyQuery: 'keypair',
      queryParameters: { parameters: [{ name: 'fields', value: '=created_time,permalink_url,shares,comments.summary(true).limit(0),reactions.summary(true).limit(0),insights.metric({{ $json.metrics }})' }] } },
    credentials: { httpQueryAuth: { id: '4NXIl88blV042yVY', name: 'FB Page token' } } },
  output: [{ id: 'x' }] });
const getPage = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Graph page followers', position: [720, 820], executeOnce: true, onError: 'continueRegularOutput',
    parameters: { method: 'GET', url: 'https://graph.facebook.com/v25.0/101118028329592',
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendQuery: true, specifyQuery: 'keypair', queryParameters: { parameters: [{ name: 'fields', value: 'followers_count,fan_count' }] } },
    credentials: { httpQueryAuth: { id: '4NXIl88blV042yVY', name: 'FB Page token' } } },
  output: [{ followers_count: 0 }] });
const packIns = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Pack insights', position: [960, 820], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const posts = $('Graph post stats').all().map((i, n) => Object.assign({ requested_id: $('One item per post').all()[n].json.post_id }, i.json));\nreturn [{ json: { fetched_at: new Date().toISOString(), page: $input.first().json, posts } }];" } },
  output: [{ posts: [] }] });
const respIns = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond insights', position: [1200, 820], parameters: { respondWith: 'firstIncomingItem' } } });

// ---------- 5. GET /webhook/aq/comments?days=7 : recent comments + Messenger threads ----------
const whCom = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'GET comments', position: [0, 1060],
    parameters: { httpMethod: 'GET', path: 'aq/comments', authentication: 'headerAuth', responseMode: 'responseNode' },
    credentials: { httpHeaderAuth: { name: 'AQ Agent API key' } } },
  output: [{ query: { days: '7' } }] });
const getFeed = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Graph feed comments', position: [240, 1060], onError: 'continueRegularOutput',
    parameters: { method: 'GET', url: 'https://graph.facebook.com/v25.0/101118028329592/feed',
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendQuery: true, specifyQuery: 'keypair',
      queryParameters: { parameters: [
        { name: 'fields', value: 'id,message,created_time,permalink_url,comments.order(reverse_chronological).limit(50){id,message,created_time,from,comment_count}' },
        { name: 'since', value: '={{ Math.floor(Date.now() / 1000) - 86400 * Math.min(60, Number($json.query.days || 7) + 21) }}' },
        { name: 'limit', value: '25' } ] } },
    credentials: { httpQueryAuth: { id: '4NXIl88blV042yVY', name: 'FB Page token' } } },
  output: [{ data: [] }] });
const getConv = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Graph conversations', position: [480, 1060], executeOnce: true, onError: 'continueRegularOutput',
    parameters: { method: 'GET', url: 'https://graph.facebook.com/v25.0/101118028329592/conversations',
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendQuery: true, specifyQuery: 'keypair',
      queryParameters: { parameters: [
        { name: 'fields', value: 'id,updated_time,participants,messages.limit(5){message,from,created_time}' },
        { name: 'limit', value: '20' } ] } },
    credentials: { httpQueryAuth: { id: '4NXIl88blV042yVY', name: 'FB Page token' } } },
  output: [{ data: [] }] });
const packCom = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Pack comments', position: [720, 1060], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const days = Number(($('GET comments').first().json.query || {}).days || 7);\nconst cutoff = Date.now() - days * 86400000;\nconst feed = $('Graph feed comments').first().json;\nconst comments = [];\nfor (const p of (feed.data || [])) {\n  for (const c of ((p.comments && p.comments.data) || [])) {\n    if (new Date(c.created_time).getTime() < cutoff) continue;\n    comments.push({ post_id: p.id, post_text: String(p.message || '').slice(0, 140), post_url: p.permalink_url, comment_id: c.id, from: c.from || null, message: c.message, created_time: c.created_time, replies: c.comment_count || 0 });\n  }\n}\nconst conv = $input.first().json;\nconst threads = (conv.data || []).filter(t => new Date(t.updated_time).getTime() >= cutoff);\nreturn [{ json: { fetched_at: new Date().toISOString(), days, comments, threads, errors: { feed: feed.error || null, conversations: conv.error || null } } }];" } },
  output: [{ comments: [] }] });
const respCom = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond comments', position: [960, 1060], parameters: { respondWith: 'firstIncomingItem' } } });


// report: same message, no buttons
const isReport = ifElse({ version: 2.2, config: { name: 'Report?', position: [1320, 480],
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: '={{ $json.kind }}', rightValue: 'report', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } } } });
const sendReport = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Send report (no buttons)', position: [1440, 640],
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '8274657378', text: '={{ $json.preview }}',
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
    credentials: { telegramApi: { id: 'EtigVq0WqJs79pt0', name: 'Telegram account' } } },
  output: [{ result: { message_id: 3 } }] });

// ---------- 6. GET /webhook/aq/drafts?since=YYYY-MM-DD : drafts with status + edit history ----------
const whDrafts = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'GET drafts', position: [0, 1300],
    parameters: { httpMethod: 'GET', path: 'aq/drafts', authentication: 'headerAuth', responseMode: 'responseNode' },
    credentials: { httpHeaderAuth: { name: 'AQ Agent API key' } } },
  output: [{ query: { since: '2026-11-01' } }] });
const allDrafts = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'All drafts', position: [240, 1300], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: DRAFTS, returnAll: true } },
  output: [{ draft_id: 'dx' }] });
const packDrafts = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Pack drafts', position: [480, 1300], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const since = String(($('GET drafts').first().json.query || {}).since || '1970-01-01');\nconst J = s => { try { return JSON.parse(s || 'null'); } catch (e) { return s; } };\nconst drafts = $input.all().map(i => i.json).filter(d => d.draft_id && String(d.created || '') >= since).map(d => ({\n  draft_id: d.draft_id, kind: d.kind, status: d.status, created: d.created, decided: d.decided, published: d.published,\n  suggested_time: d.suggested_time, fb_post_id: d.fb_post_id, source_key: d.source_key, tags: J(d.tags),\n  text: d.text, original_text: d.original_text, edited: d.text !== d.original_text, edit_log: J(d.edit_log) || [], error: d.error }));\nreturn [{ json: { count: drafts.length, drafts } }];" } },
  output: [{ count: 0, drafts: [] }] });
const respDrafts = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond drafts', position: [720, 1300], parameters: { respondWith: 'firstIncomingItem' } } });

// ---------- 7. GET /webhook/aq/stats : saved post checkpoints + daily page followers ----------
const whStats = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'GET stats', position: [0, 1540],
    parameters: { httpMethod: 'GET', path: 'aq/stats', authentication: 'headerAuth', responseMode: 'responseNode' },
    credentials: { httpHeaderAuth: { name: 'AQ Agent API key' } } },
  output: [{ query: {} }] });
const allStats = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'All post stats', position: [240, 1540], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: STATS, returnAll: true } },
  output: [{ fb_post_id: 'x' }] });
const allDays = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'All page days', position: [480, 1540], executeOnce: true, alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: PAGE, returnAll: true } },
  output: [{ day: '2026-11-24' }] });
const packStats = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Pack stats', position: [720, 1540], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const strip = r => { const o = Object.assign({}, r); delete o.id; delete o.createdAt; delete o.updatedAt; return o; };\nconst posts = $('All post stats').all().map(i => i.json).filter(r => r.fb_post_id).map(strip);\nconst days = $input.all().map(i => i.json).filter(r => r.day).map(strip).sort((a, b) => a.day < b.day ? -1 : 1);\nreturn [{ json: { fetched_at: new Date().toISOString(), posts, page_days: days } }];" } },
  output: [{ posts: [], page_days: [] }] });
const respStats = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond stats', position: [960, 1540], parameters: { respondWith: 'firstIncomingItem' } } });

// ---------- 8. POST /webhook/aq/fetch-image {url} : download a supplier image through n8n ----------
const whImg = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1,
  config: { name: 'POST fetch-image', position: [0, 1780],
    parameters: { httpMethod: 'POST', path: 'aq/fetch-image', authentication: 'headerAuth', responseMode: 'responseNode' },
    credentials: { httpHeaderAuth: { name: 'AQ Agent API key' } } },
  output: [{ body: { url: 'https://scontent.fbcdn.net/x.jpg' } }] });
const checkUrl = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Allowed host?', position: [240, 1780], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const u = String((($input.first().json.body) || {}).url || '');\nconst m = u.match(/^https:\\/\\/([^\\/?#]+)\\//i);\nconst host = m ? m[1].toLowerCase() : '';\nconst ok = /(^|\\.)(fbcdn\\.net|cdninstagram\\.com|licdn\\.com|biomar\\.com|export-download\\.canva\\.com)$/.test(host);\nif (!ok) throw new Error('host not allowed: ' + host);\nreturn [{ json: { url: u } }];" } },
  output: [{ url: 'https://scontent.fbcdn.net/x.jpg' }] });
const dlImg = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Download image', position: [480, 1780],
    parameters: { method: 'GET', url: '={{ $json.url }}', options: { response: { response: { responseFormat: 'file' } }, timeout: 60000 } } },
  output: [{}] });
const toB64 = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'To base64', position: [720, 1780], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const it = $input.first();\nconst key = Object.keys(it.binary || {})[0];\nif (!key) throw new Error('no image in response');\nconst buf = await this.helpers.getBinaryDataBuffer(0, key);\nif (buf.length > 15 * 1024 * 1024) throw new Error('image too large');\nreturn [{ json: { ok: true, mime: it.binary[key].mimeType || 'image/jpeg', bytes: buf.length, b64: buf.toString('base64') } }];" } },
  output: [{ ok: true, b64: '' }] });
const respImg = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond image', position: [960, 1780], parameters: { respondWith: 'firstIncomingItem' } } });

const note = sticky('## AQ Agent API (copy)\nEndpoints for the Claude agent. All need header auth (credential "AQ Agent API key").\n- GET  /webhook/aq/raw-posts  -> new supplier posts\n- POST /webhook/aq/raw-posts-status {dedup_keys, status}\n- POST /webhook/aq/draft {kind, text, images[{b64}], tags, suggested_time, summary, target_id} -> Telegram (TEST bot) with buttons, row in aq_drafts\n- GET  /webhook/aq/insights?post_ids=a,b[&metrics=]\n- GET  /webhook/aq/comments?days=7\n- GET  /webhook/aq/drafts?since=YYYY-MM-DD (status, tags, original vs approved text, edit_log)\n- GET  /webhook/aq/stats (aq_post_stats + aq_page_daily)\n- POST /webhook/aq/fetch-image {url} -> {b64, mime} (fbcdn / cdninstagram / licdn / biomar.com / Canva exports only)\nApproval + publishing happen in "AQ Approval handler [copy]". Paused ads: created there on approval of kind=ad (needs Ad Account ID).', [], { color: 5, width: 560, height: 380, position: [1000, -140] });

export default workflow('aq-agent-api', 'AQ Agent API [copy]')
  .add(whRaw).to(getNew).to(packRaw).to(respRaw)
  .add(whStatus).to(splitKeys).to(setStatus).to(respStatus)
  .add(whDraft).to(prep).to(hasImg
    .onTrue(sendPhoto.to(collect.to(preview)))
    .onFalse(noImg.to(preview)))
  .add(preview).to(isReport.onTrue(sendReport.to(insDraft)).onFalse(sendMsg.to(insDraft)))
  .add(insDraft).to(respDraft)
  .add(whIns).to(splitPosts).to(getPost).to(getPage).to(packIns).to(respIns)
  .add(whCom).to(getFeed).to(getConv).to(packCom).to(respCom)
  .add(whDrafts).to(allDrafts).to(packDrafts).to(respDrafts)
  .add(whStats).to(allStats).to(allDays).to(packStats).to(respStats)
  .add(whImg).to(checkUrl).to(dlImg).to(toB64).to(respImg)
  .add(note);
