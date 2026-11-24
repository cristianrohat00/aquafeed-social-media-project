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
  // no URL class in the n8n Code sandbox -> plain regex
  const m = String(u).match(/^https?:\/\/([^\/?#\s]+)([^?#\s]*)/i);
  if (!m) return '';
  const host = m[1].toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
  if (SHORTENERS.test(host) || SOCIAL.test(host)) return '';
  return host + m[2].replace(/\/+$/, '').toLowerCase();
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

if (typeof module !== 'undefined') module.exports = { textKey, linkKey, plain, cyrb53 };
