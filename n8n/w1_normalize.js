// Cross-source dedup keys for BioMar posts (FB / IG / LinkedIn).
// Pasted verbatim into the n8n Code node "Normalize + keys". Pure JS, no require().
// A post is a duplicate if its text_key OR its link_key matches an existing row.

const SHORTENERS = /(^|\.)(loom\.ly|bit\.ly|lnkd\.in|ow\.ly|buff\.ly|t\.co|tinyurl\.com)$/;
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|linkedin\.com|youtube\.com|youtu\.be)$/;

function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// BioMar writes headlines in Unicode "math bold" letters; NFKC turns them into plain ASCII.
function plain(text) {
  return String(text || '').normalize('NFKC');
}

function textKey(text) {
  let t = plain(text).toLowerCase();
  t = t.replace(/https?:\/\/\S+/g, ' ').replace(/[#@][\p{L}\p{N}_]+/gu, ' ');
  t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/[^a-z0-9]+/g, '');
  if (t.length < 25) return '';            // too short to be a reliable fingerprint
  return 't:' + cyrb53(t.slice(0, 120));
}

function normUrl(u) {
  try {
    const x = new URL(u);
    const host = x.hostname.replace(/^www\./, '').toLowerCase();
    if (SHORTENERS.test(host) || SOCIAL.test(host)) return '';
    const path = x.pathname.replace(/\/+$/, '').toLowerCase();
    return host + path;
  } catch (e) { return ''; }
}

function linkKey(text, link) {
  const cands = [];
  if (link) cands.push(link);
  const m = plain(text).match(/https?:\/\/[^\s)>\]]+/g) || [];
  cands.push(...m);
  for (const c of cands) {
    const n = normUrl(c);
    if (n) return 'l:' + cyrb53(n);
  }
  return '';
}


const now = new Date().toISOString();
const out = [];
const seenRun = {};
function push(source, url, date, text, link, images) {
  const tk = textKey(text), lk = linkKey(text, link);
  if (!tk && !lk && !images.length) return;
  const key = tk || lk || ('u:' + cyrb53(url));
  // in-run merge (same post scraped from 2 platforms in this run)
  const hit = out.find(o => (tk && o.json.text_key === tk) || (lk && o.json.link_key === lk));
  if (hit) {
    const s = hit.json.sources.split(','); if (s.indexOf(source) === -1) s.push(source);
    hit.json.sources = s.join(',');
    const u = JSON.parse(hit.json.source_urls); u.push(url); hit.json.source_urls = JSON.stringify(u);
    if (!hit.json.link_key && lk) hit.json.link_key = lk;
    if (JSON.parse(hit.json.images).length < images.length) hit.json.images = JSON.stringify(images.slice(0, 10));
    return;
  }
  out.push({ json: { dedup_key: key, text_key: tk, link_key: lk, sources: source, source_urls: JSON.stringify([url]),
    post_date: date || now, text: plain(text), images: JSON.stringify(images.slice(0, 10)), link: link || '',
    status: 'new', first_seen: now, last_seen: now } });
}
for (const it of $input.all()) {
  const j = it.json;
  if (j.facebookUrl !== undefined || j.postId !== undefined && j.media !== undefined) {
    const imgs = (j.media || []).map(m => (m.image && m.image.uri) || (m.photo_image && m.photo_image.uri) || m.thumbnail).filter(Boolean);
    push('fb', j.url || j.topLevelUrl || '', j.time || '', j.text || '', j.link || '', imgs);
  } else if (j.shortCode !== undefined || j.ownerUsername !== undefined) {
    let imgs = (j.images || []).filter(u => typeof u === 'string');
    if (!imgs.length && j.displayUrl) imgs = [j.displayUrl];
    push('ig', j.url || '', j.timestamp || '', j.caption || '', '', imgs);
  } else if (j.linkedinUrl !== undefined || j.content !== undefined) {
    const imgs = [];
    for (const b of [j.postImages, j.images]) if (Array.isArray(b)) for (const v of b) { const u = typeof v === 'string' ? v : (v && (v.url || v.src)); if (u) imgs.push(u); }
    const pa = j.postedAt || {};
    const link = (j.article && (j.article.link || j.article.url)) || '';
    push('li', j.linkedinUrl || j.url || '', pa.date || (typeof j.postedAt === 'string' ? j.postedAt : ''), j.content || j.text || '', link, imgs);
  }
}
return out;
