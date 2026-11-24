import { workflow, node, trigger, ifElse, switchCase, sticky, newCredential } from '@n8n/workflow-sdk';

const DRAFTS = { __rl: true, mode: 'id', value: 'MrKMWHe3QN3g0NT0', cachedResultName: 'aq_drafts' };
const RAW = { __rl: true, mode: 'id', value: 'xRca1kNecQVoyUS4', cachedResultName: 'aq_raw_posts' };
const STATE = { __rl: true, mode: 'id', value: 'zLXQ3bzyhMXpvdEi', cachedResultName: 'aq_state' };

const tg = trigger({ type: 'n8n-nodes-base.telegramTrigger', version: 1.2,
  config: { name: 'Telegram (AQ Agent bot)', position: [0, 400],
    parameters: { updates: ['message', 'callback_query'], additionalFields: { userIds: '8274657378' } },
    credentials: { telegramApi: newCredential('Telegram AQ Agent bot') } },
  output: [{ callback_query: { id: 'q1', data: 'a:dx', from: { id: 8274657378 } } }] });

const getState = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Get edit state', position: [220, 400], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: STATE, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'k', condition: 'eq', keyValue: 'awaiting_edit' }] }, limit: 1 } },
  output: [{ k: 'awaiting_edit', v: '' }] });

const parse = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Parse update', position: [440, 400], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const u = $('Telegram (AQ Agent bot)').first().json;\nconst st = $input.first().json || {};\nconst awaiting = st.v || '';\nlet action = 5, mode = 'now', draft_id = '', query_id = '', text = '';\nconst from = (u.callback_query && u.callback_query.from) || (u.message && u.message.from) || {};\nif (String(from.id) !== '8274657378') return [];\nif (u.callback_query) {\n  query_id = u.callback_query.id;\n  const parts = String(u.callback_query.data || '').split(':');\n  draft_id = parts[1] || '';\n  const map = { a: 0, s: 0, r: 1, e: 2 };\n  action = map[parts[0]] !== undefined ? map[parts[0]] : 5;\n  if (parts[0] === 's') mode = 'scheduled';\n} else if (u.message && typeof u.message.text === 'string') {\n  text = u.message.text.trim();\n  const up = text.toUpperCase();\n  if (awaiting) {\n    if (['ANULEAZA', 'ANULEAZĂ', 'CANCEL', 'STOP'].indexOf(up) !== -1) action = 4;\n    else { action = 3; draft_id = awaiting; }\n  }\n}\nreturn [{ json: { action, mode, draft_id, query_id, text, awaiting } }];" } },
  output: [{ action: 0, mode: 'now', draft_id: 'dx', query_id: 'q1', text: '' }] });

const getDraft = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Get draft', position: [660, 400], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'get', dataTableId: DRAFTS, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'draft_id', condition: 'eq', keyValue: '={{ $json.draft_id || "-none-" }}' }] }, limit: 1 } },
  output: [{ draft_id: 'dx', status: 'pending', kind: 'post', text: 'x', file_ids: '[]' }] });

const route = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Route', position: [880, 400], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const p = $('Parse update').first().json;\nconst d = $input.first().json || {};\nconst draft = d.draft_id ? d : null;\nlet action = p.action;\nlet why = '';\nif ([0, 1, 2, 3].indexOf(action) !== -1) {\n  if (!draft) { action = 6; why = 'Draftul ' + (p.draft_id || '?') + ' nu există.'; }\n  else if (['pending', 'editing'].indexOf(draft.status) === -1) { action = 6; why = 'Draftul ' + draft.draft_id + ' nu mai e în așteptare (status: ' + draft.status + ').'; }\n}\nreturn [{ json: Object.assign({}, p, { action, why, draft: draft || {} }) }];" } },
  output: [{ action: 0, draft: { draft_id: 'dx' } }] });

const ack = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Ack button', position: [1100, 400], onError: 'continueRegularOutput',
    parameters: { resource: 'callback', operation: 'answerQuery', queryId: '={{ $json.query_id || "none" }}',
      additionalFields: { text: '={{ ["Se publică…", "Respins", "Trimite textul nou", "", "", "", "Nu mai e în așteptare"][$json.action] || "" }}' } },
    credentials: { telegramApi: newCredential('Telegram AQ Agent bot') } },
  output: [{ ok: true }] });

const sw = switchCase({ version: 3.4, config: { name: 'Action', position: [1320, 400],
  parameters: { mode: 'expression', numberOutputs: 7, output: '={{ $("Route").first().json.action }}' } } });

// ---- 0: publish ----
const plan = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Plan publish', position: [1560, 0], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const r = $('Route').first().json;\nconst d = r.draft;\nlet sched = null;\nif (r.mode === 'scheduled' && d.suggested_time) {\n  const t = Math.floor(new Date(d.suggested_time).getTime() / 1000);\n  if (t > Math.floor(Date.now() / 1000) + 11 * 60) sched = t;\n}\nconst base = { draft_id: d.draft_id, kind: d.kind, text: d.text, source_key: d.source_key || '', sched, sched_note: (r.mode === 'scheduled' && !sched) ? 'Ora propusă a trecut sau lipsește: public acum.' : '' };\nlet fids = []; try { fids = JSON.parse(d.file_ids || '[]'); } catch (e) {}\nif (d.kind !== 'post' || !fids.length) return [{ json: Object.assign({ file_id: '' }, base) }];\nreturn fids.map(f => ({ json: Object.assign({ file_id: f }, base) }));" } },
  output: [{ draft_id: 'dx', kind: 'post', file_id: 'f', sched: null }] });

const isPost = ifElse({ version: 2.2, config: { name: 'Kind = post?', position: [1780, 0],
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: '={{ $json.kind }}', rightValue: 'post', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' } } } });

const hasPhotos = ifElse({ version: 2.2, config: { name: 'Has photos?', position: [2000, -80],
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ leftValue: '={{ $json.file_id }}', rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }], combinator: 'and' } } } });

const dl = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Download image from Telegram', position: [2220, -160],
    parameters: { resource: 'file', operation: 'get', fileId: '={{ $json.file_id }}', download: true, additionalFields: { mimeType: 'image/jpeg' } },
    credentials: { telegramApi: newCredential('Telegram AQ Agent bot') } },
  output: [{ result: { file_id: 'f' } }] });

const upload = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Upload photo (unpublished)', position: [2440, -160],
    parameters: { method: 'POST', url: 'https://graph.facebook.com/v25.0/101118028329592/photos',
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendBody: true, contentType: 'multipart-form-data',
      bodyParameters: { parameters: [
        { parameterType: 'formBinaryData', name: 'source', inputDataFieldName: 'data' },
        { name: 'published', value: 'false' },
        { name: 'temporary', value: '={{ $("Plan publish").first().json.sched ? "true" : "false" }}' } ] } },
    credentials: { httpQueryAuth: newCredential('FB Page token') } },
  output: [{ id: 'photo1' }] });

const body = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Build feed body', position: [2660, 0], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const p = $('Plan publish').first().json;\nconst ids = $input.all().map(i => i.json.id).filter(Boolean);\nconst b = { message: p.text };\nif (ids.length) b.attached_media = ids.map(id => ({ media_fbid: id }));\nif (p.sched) { b.published = false; b.scheduled_published_time = p.sched; }\nreturn [{ json: Object.assign({}, p, { fb_body: b, photo_count: ids.length }) }];" } },
  output: [{ fb_body: { message: 'x' } }] });

const publish = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Publish to Facebook', position: [2880, 0], onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: 'https://graph.facebook.com/v25.0/101118028329592/feed',
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.fb_body) }}' },
    credentials: { httpQueryAuth: newCredential('FB Page token') } },
  output: [{ id: '101118028329592_1' }] });

const replyCm = node({ type: 'n8n-nodes-base.httpRequest', version: 4.4,
  config: { name: 'Reply to comment', position: [2000, 160], onError: 'continueRegularOutput',
    parameters: { method: '={{ $json.kind === "reply" ? "POST" : "GET" }}',
      url: '={{ $json.kind === "reply" ? "https://graph.facebook.com/v25.0/" + $json.source_key + "/comments" : "https://graph.facebook.com/v25.0/me" }}',
      authentication: 'genericCredentialType', genericAuthType: 'httpQueryAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.kind === "reply" ? { message: $json.text } : {}) }}' },
    credentials: { httpQueryAuth: newCredential('FB Page token') } },
  output: [{ id: 'c1' }] });

const result = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Publish result', position: [3100, 80], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const p = $('Plan publish').first().json;\nconst r = $input.first().json || {};\nconst err = r.error ? (r.error.message || JSON.stringify(r.error)).slice(0, 300) : '';\nlet status, msg;\nif (p.kind === 'ad') {\n  status = 'approved';\n  msg = '📣 Propunerea de reclamă <code>' + p.draft_id + '</code> e aprobată. Crearea automată a reclamei (PAUSED) se activează după ce primesc Ad Account ID + permisiunea ads_management.';\n} else if (r.id && !err) {\n  status = p.sched ? 'scheduled' : 'published';\n  const when = p.sched ? new Date(p.sched * 1000).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }) : '';\n  msg = (p.kind === 'reply' ? '💬 Răspuns publicat' : (p.sched ? '🕒 Programat pe Facebook pentru ' + when : '✅ Publicat pe Facebook')) + ' · <code>' + p.draft_id + '</code>';\n  if (p.kind === 'post') msg += '\\nhttps://www.facebook.com/' + r.id;\n  if (p.sched_note) msg += '\\n' + p.sched_note;\n} else {\n  status = 'failed';\n  msg = '⚠️ Publicarea a eșuat · <code>' + p.draft_id + '</code>\\n' + (err || 'răspuns fără id');\n}\nreturn [{ json: { draft_id: p.draft_id, source_key: p.source_key, kind: p.kind, status, fb_id: r.id || '', error: err, msg } }];" } },
  output: [{ draft_id: 'dx', status: 'published', msg: 'x' }] });

const updPub = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Save publish result', position: [3320, 80],
    parameters: { resource: 'row', operation: 'update', dataTableId: DRAFTS, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'draft_id', condition: 'eq', keyValue: '={{ $json.draft_id }}' }] },
      columns: { mappingMode: 'defineBelow', value: {
        status: '={{ $json.status }}', fb_post_id: '={{ $json.fb_id }}', error: '={{ $json.error }}',
        decided: '={{ $now.toISO() }}', published: '={{ $json.status === "published" || $json.status === "scheduled" ? $now.toISO() : null }}' },
        matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });

const markUsed = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Mark supplier post used', position: [3540, 80], alwaysOutputData: true,
    parameters: { resource: 'row', operation: 'update', dataTableId: RAW, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'dedup_key', condition: 'eq', keyValue: '={{ ($("Publish result").first().json.status === "published" || $("Publish result").first().json.status === "scheduled") && $("Publish result").first().json.source_key ? $("Publish result").first().json.source_key : "-none-" }}' }] },
      columns: { mappingMode: 'defineBelow', value: { status: 'used' }, matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });

const tellPub = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Tell result', position: [3760, 80],
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '8274657378', text: '={{ $("Publish result").first().json.msg }}',
      additionalFields: { appendAttribution: false, parse_mode: 'HTML' } },
    credentials: { telegramApi: newCredential('Telegram AQ Agent bot') } },
  output: [{ ok: true }] });

// ---- 1: reject ----
const updRej = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Mark rejected', position: [1560, 360],
    parameters: { resource: 'row', operation: 'update', dataTableId: DRAFTS, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'draft_id', condition: 'eq', keyValue: '={{ $("Route").first().json.draft_id }}' }] },
      columns: { mappingMode: 'defineBelow', value: { status: 'rejected', decided: '={{ $now.toISO() }}' }, matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });
const tellRej = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Tell rejected', position: [1780, 360],
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '8274657378',
      text: '=❌ Draft <code>{{ $("Route").first().json.draft_id }}</code> respins.', additionalFields: { appendAttribution: false, parse_mode: 'HTML' } },
    credentials: { telegramApi: newCredential('Telegram AQ Agent bot') } },
  output: [{ ok: true }] });

// ---- 2: edit request ----
const setAwait = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Remember draft being edited', position: [1560, 520],
    parameters: { resource: 'row', operation: 'upsert', dataTableId: STATE, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'k', condition: 'eq', keyValue: 'awaiting_edit' }] },
      columns: { mappingMode: 'defineBelow', value: { k: 'awaiting_edit', v: '={{ $("Route").first().json.draft_id }}', updated: '={{ $now.toISO() }}' }, matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });
const askEdit = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Ask for new text', position: [1780, 520],
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '8274657378',
      text: '=✏️ Trimite textul nou pentru draftul <code>{{ $("Route").first().json.draft_id }}</code> (tot textul, gata de publicat).\nScrie ANULEAZĂ ca să renunți.',
      replyMarkup: 'forceReply', forceReply: { force_reply: true },
      additionalFields: { appendAttribution: false, parse_mode: 'HTML' } },
    credentials: { telegramApi: newCredential('Telegram AQ Agent bot') } },
  output: [{ ok: true }] });

// ---- 3: apply edit ----
const applyEdit = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Apply edit', position: [1560, 680], parameters: { mode: 'runOnceForAllItems',
    jsCode: "const r = $('Route').first().json;\nconst d = r.draft;\nlet log = []; try { log = JSON.parse(d.edit_log || '[]'); } catch (e) {}\nlog.push({ at: new Date().toISOString(), before: d.text, after: r.text });\nconst esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');\nconst preview = '✏️ <b>Text actualizat</b> · <code>' + d.draft_id + '</code>\\n\\n' + esc(r.text).slice(0, 3500);\nreturn [{ json: { draft_id: d.draft_id, text: r.text, edit_log: JSON.stringify(log.slice(-20)), preview } }];" } },
  output: [{ draft_id: 'dx', text: 'x', edit_log: '[]', preview: 'x' }] });
const saveEdit = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Save edited text', position: [1780, 680],
    parameters: { resource: 'row', operation: 'update', dataTableId: DRAFTS, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'draft_id', condition: 'eq', keyValue: '={{ $json.draft_id }}' }] },
      columns: { mappingMode: 'defineBelow', value: { text: '={{ $json.text }}', edit_log: '={{ $json.edit_log }}', status: 'pending' }, matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });
const clearAwait = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Clear edit state', position: [2000, 680],
    parameters: { resource: 'row', operation: 'upsert', dataTableId: STATE, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'k', condition: 'eq', keyValue: 'awaiting_edit' }] },
      columns: { mappingMode: 'defineBelow', value: { k: 'awaiting_edit', v: '', updated: '={{ $now.toISO() }}' }, matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });
const resend = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Re-send with buttons', position: [2220, 680],
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '8274657378', text: '={{ $("Apply edit").first().json.preview }}',
      replyMarkup: 'inlineKeyboard',
      inlineKeyboard: { rows: [
        { row: { buttons: [
          { text: '✅ Publică acum', additionalFields: { callback_data: '=a:{{ $("Apply edit").first().json.draft_id }}' } },
          { text: '🕒 La ora propusă', additionalFields: { callback_data: '=s:{{ $("Apply edit").first().json.draft_id }}' } } ] } },
        { row: { buttons: [
          { text: '✏️ Editează', additionalFields: { callback_data: '=e:{{ $("Apply edit").first().json.draft_id }}' } },
          { text: '❌ Respinge', additionalFields: { callback_data: '=r:{{ $("Apply edit").first().json.draft_id }}' } } ] } } ] },
      additionalFields: { appendAttribution: false, parse_mode: 'HTML', disable_web_page_preview: true } },
    credentials: { telegramApi: newCredential('Telegram AQ Agent bot') } },
  output: [{ ok: true }] });

// ---- 4: cancel edit ----
const clearAwait2 = node({ type: 'n8n-nodes-base.dataTable', version: 1.1,
  config: { name: 'Cancel edit state', position: [1560, 840],
    parameters: { resource: 'row', operation: 'upsert', dataTableId: STATE, matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'k', condition: 'eq', keyValue: 'awaiting_edit' }] },
      columns: { mappingMode: 'defineBelow', value: { k: 'awaiting_edit', v: '', updated: '={{ $now.toISO() }}' }, matchingColumns: [], schema: [] } } },
  output: [{ id: 1 }] });
const tellCancel = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Tell edit cancelled', position: [1780, 840],
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '8274657378',
      text: '↩️ Editare anulată. Draftul rămâne în așteptare; folosește butoanele de sub el.', additionalFields: { appendAttribution: false } },
    credentials: { telegramApi: newCredential('Telegram AQ Agent bot') } },
  output: [{ ok: true }] });

// ---- 5: unknown text ----
const tellHelp = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Tell how to use', position: [1560, 1000],
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '8274657378',
      text: 'ℹ️ Folosește butoanele de sub fiecare draft: ✅ Publică acum · 🕒 La ora propusă · ✏️ Editează · ❌ Respinge.', additionalFields: { appendAttribution: false } },
    credentials: { telegramApi: newCredential('Telegram AQ Agent bot') } },
  output: [{ ok: true }] });

// ---- 6: missing / already decided ----
const tellStale = node({ type: 'n8n-nodes-base.telegram', version: 1.2,
  config: { name: 'Tell not pending', position: [1560, 1160],
    parameters: { resource: 'message', operation: 'sendMessage', chatId: '8274657378',
      text: '=⚠️ {{ $("Route").first().json.why }}', additionalFields: { appendAttribution: false } },
    credentials: { telegramApi: newCredential('Telegram AQ Agent bot') } },
  output: [{ ok: true }] });

const note = sticky('## AQ Approval handler (copy, TEST bot)\nButtons on each draft carry the draft id, so several drafts can wait at once.\n- a: publish now · s: publish at suggested_time (Facebook native scheduling, needs >10 min ahead)\n- e: asks for new text -> next message replaces the text; before/after is kept in aq_drafts.edit_log (learning signal)\n- r: reject\nOnly Telegram user 8274657378 is accepted. Posts with images: Telegram file -> FB unpublished photo -> feed post with attached_media.\nkind=reply -> comment reply on target id. kind=ad -> marked approved; paused-ad creation waits for Ad Account ID.', [], { color: 3, width: 620, height: 260, position: [0, 60] });

export default workflow('aq-approval', 'AQ Approval handler [copy]')
  .add(tg).to(getState).to(parse).to(getDraft).to(route).to(ack).to(sw
    .onCase(0, plan.to(isPost
      .onTrue(hasPhotos
        .onTrue(dl.to(upload.to(body)))
        .onFalse(body))
      .onFalse(replyCm.to(result))))
    .onCase(1, updRej.to(tellRej))
    .onCase(2, setAwait.to(askEdit))
    .onCase(3, applyEdit.to(saveEdit.to(clearAwait.to(resend))))
    .onCase(4, clearAwait2.to(tellCancel))
    .onCase(5, tellHelp)
    .onCase(6, tellStale))
  .add(body).to(publish).to(result)
  .add(result).to(updPub).to(markUsed).to(tellPub)
  .add(note);
