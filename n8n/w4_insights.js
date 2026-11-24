import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const FB = { id: '4NXIl88blV042yVY', name: 'FB Page token' };
const DRAFTS = { __rl: true, mode: 'id', value: 'MrKMWHe3QN3g0NT0', cachedResultName: 'aq_drafts' };
const STATS = { __rl: true, mode: 'id', value: '4DEfBcOQ3NAiHt3W', cachedResultName: 'aq_post_stats' };
const PAGE = { __rl: true, mode: 'id', value: 'dLsnuuCVUXBMcBmz', cachedResultName: 'aq_page_daily' };
const METRICS = 'post_total_media_view_unique,post_media_view,post_clicks';

const hourly = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.3,
  config: { name: 'Every hour', position: [0, 300], parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1, triggerAtMinute: 12 }] } } },
  output: [{}] });

// ---- page followers: one row per day (last value of the day) ----
const pageGraph = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Page followers', position: [240, 80], onError: 'continueRegularOutput',
    parameters: { url: 'https://graph.facebook.com/v25.0/101118028329592', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: 'followers_count,fan_count' }] }, options: {} },
    credentials: { httpQueryAuth: FB } },
  output: [{ followers_count: 279, fan_count: 279 }] });
const pageRow = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Page row', position: [480, 80], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const j = $input.first().json || {};\nif (j.error || j.followers_count === undefined) return [];\nconst day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });\nreturn [{ json: { day, followers: j.followers_count, fans: j.fan_count || 0, fetched_at: new Date().toISOString() } }];" } },
  output: [{ day: '2026-11-24', followers: 279, fans: 279, fetched_at: '' }] });
const pageUpsert = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Save page day', position: [720, 80],
    parameters: { resource: 'row', operation: 'upsert', dataTableId: PAGE, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'day', condition: 'eq', keyValue: '={{ $json.day }}' }] },
      columns: { mappingMode: 'defineBelow', value: { day: '={{ $json.day }}', followers: '={{ $json.followers }}', fans: '={{ $json.fans }}', fetched_at: '={{ $json.fetched_at }}' }, matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });

// ---- post checkpoints ----
const live = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Posts on Facebook', position: [240, 400], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: DRAFTS, matchType: 'anyCondition',
      filters: { conditions: [{ keyName: 'status', condition: 'eq', keyValue: 'published' }, { keyName: 'status', condition: 'eq', keyValue: 'scheduled' }] }, returnAll: true } },
  output: [{ draft_id: 'dx', status: 'published', fb_post_id: '1_2', published: '', suggested_time: '' }] });
const have = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Stats already saved', position: [480, 400], executeOnce: true, alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: STATS, returnAll: true } },
  output: [{ fb_post_id: '1_2', checkpoint: '24h' }] });
const due = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Due checkpoints', position: [720, 400], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const CPS = [24, 72, 168];\nconst done = {};\nfor (const i of $('Stats already saved').all()) if (i.json.fb_post_id) done[i.json.fb_post_id + '|' + i.json.checkpoint] = 1;\nconst now = Date.now();\nconst out = [];\nfor (const i of $('Posts on Facebook').all()) {\n  const d = i.json;\n  if (!d.fb_post_id || d.kind !== 'post') continue;\n  const liveAt = d.status === 'scheduled' ? d.suggested_time : d.published;\n  const t = new Date(liveAt).getTime();\n  if (!t || t > now) continue;\n  const age = (now - t) / 3600000;\n  for (const cp of CPS) {\n    const key = d.fb_post_id + '|' + cp + 'h';\n    if (age >= cp && !done[key]) out.push({ json: { fb_post_id: d.fb_post_id, draft_id: d.draft_id, checkpoint: cp + 'h', live_at: new Date(t).toISOString(), late_hours: Math.round(age - cp) } });\n  }\n}\nreturn out;" } },
  output: [{ fb_post_id: '1_2', draft_id: 'dx', checkpoint: '24h', live_at: '' }] });
const postGraph = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Post stats', position: [960, 400], onError: 'continueRegularOutput',
    parameters: { url: '=https://graph.facebook.com/v25.0/{{ $json.fb_post_id }}', authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: 'shares,comments.summary(true).limit(0),reactions.summary(true).limit(0),insights.metric(' + METRICS + ')' }] }, options: {} },
    credentials: { httpQueryAuth: FB } },
  output: [{ id: '1_2' }] });
const shape = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Stats row', position: [1200, 400], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const req = $('Due checkpoints').all();\nreturn $input.all().map((it, n) => {\n  const r = it.json || {};\n  const q = req[n].json;\n  const m = {};\n  for (const x of ((r.insights && r.insights.data) || [])) m[x.name] = x.values && x.values[0] ? x.values[0].value : null;\n  const num = v => (typeof v === 'number' ? v : 0);\n  return { json: { fb_post_id: q.fb_post_id, draft_id: q.draft_id, checkpoint: q.checkpoint, live_at: q.live_at, fetched_at: new Date().toISOString(),\n    reach: num(m.post_total_media_view_unique), views: num(m.post_media_view), clicks: num(m.post_clicks),\n    reactions: (r.reactions && r.reactions.summary && r.reactions.summary.total_count) || 0,\n    comments: (r.comments && r.comments.summary && r.comments.summary.total_count) || 0,\n    shares: (r.shares && r.shares.count) || 0,\n    raw: JSON.stringify(r.error ? { error: String(r.error.message || r.error).slice(0, 300) } : { insights: m, late_hours: q.late_hours }) } };\n});" } },
  output: [{ fb_post_id: '1_2', checkpoint: '24h' }] });
const save = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Save stats', position: [1440, 400],
    parameters: { resource: 'row', operation: 'insert', dataTableId: STATS,
      columns: { mappingMode: 'defineBelow', value: {
        fb_post_id: '={{ $json.fb_post_id }}', draft_id: '={{ $json.draft_id }}', checkpoint: '={{ $json.checkpoint }}', live_at: '={{ $json.live_at }}',
        fetched_at: '={{ $json.fetched_at }}', reach: '={{ $json.reach }}', views: '={{ $json.views }}', clicks: '={{ $json.clicks }}',
        reactions: '={{ $json.reactions }}', comments: '={{ $json.comments }}', shares: '={{ $json.shares }}', raw: '={{ $json.raw }}' }, matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });

const tokenCheck = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Token problem?', position: [480, -100], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const j = $input.first().json || {};\nif (!j.error) return [];\nconst h = Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }));\nif (h !== 9) return [];\nconst m = String((j.error && j.error.message) || j.error).slice(0, 200);\nreturn [{ json: { msg: '⚠️ Tokenul Facebook nu mai funcționează. Publicarea și statisticile sunt oprite până îl înlocuiești în n8n (credențialul FB Page token).\\n' + m } }];" } },
  output: [{ msg: 'x' }] });
const tokenAlert = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Alert token', position: [720, -100],
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '8274657378', text: '={{ $json.msg }}', additionalFields: { appendAttribution: false } },
    credentials: { telegramApi: { id: 'EtigVq0WqJs79pt0', name: 'Telegram account' } } },
  output: [{ ok: true }] });

const note = sticky('## AQ Insights collector (copy)\nEvery hour:\n- page followers -> aq_page_daily (one row per day, last value wins)\n- for every agent post live on Facebook: stats at 24h, 72h, 168h after it went live -> aq_post_stats (reach, views, clicks, reactions, comments, shares)\nThe agent reads both through GET /webhook/aq/stats and scores posts (agent/score.py).\nIf the FB token fails: Telegram alert once a day at 09:00.', [], { color: 6, width: 520, height: 200, position: [0, -200] });

export default workflow('aq-insights', 'AQ Insights collector [copy]')
  .add(hourly).to(pageGraph.to(pageRow.to(pageUpsert)))
  .add(pageGraph).to(tokenCheck.to(tokenAlert))
  .add(hourly).to(live.to(have.to(due.to(postGraph.to(shape.to(save))))))
  .add(note);
