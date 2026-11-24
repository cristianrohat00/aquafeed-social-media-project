// Compare this run's posts with rows already stored. New -> insert. Known -> merge sources.
const existing = $('Get stored posts').all().map(i => i.json).filter(r => r.dedup_key);
const now = new Date().toISOString();
const res = [];
for (const it of $('Normalize + keys').all()) {
  const p = it.json;
  const hit = existing.find(r => (p.text_key && r.text_key === p.text_key) || (p.link_key && r.link_key === p.link_key));
  if (!hit) { res.push({ json: Object.assign({ op: 'insert' }, p) }); continue; }
  const s = String(hit.sources || '').split(',').filter(Boolean);
  for (const x of p.sources.split(',')) if (s.indexOf(x) === -1) s.push(x);
  let u = []; try { u = JSON.parse(hit.source_urls || '[]'); } catch (e) {}
  for (const x of JSON.parse(p.source_urls)) if (u.indexOf(x) === -1) u.push(x);
  const changed = s.join(',') !== hit.sources;
  res.push({ json: { op: changed ? 'update' : 'same', dedup_key: hit.dedup_key, sources: s.join(','),
    source_urls: JSON.stringify(u.slice(-10)), link_key: hit.link_key || p.link_key, last_seen: now } });
}
return res;
