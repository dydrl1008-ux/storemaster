export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
  const SEARCH_KEY = process.env.GOOGLE_SEARCH_API_KEY;
  const SEARCH_CX  = process.env.GOOGLE_SEARCH_CX;
  const NAVER_ID   = process.env.NAVER_CLIENT_ID || 'h8PZ1ORq2eD2fu_yKTsA';
  const NAVER_SEC  = process.env.NAVER_CLIENT_SECRET || 'ombn3z_Ibn';

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  function extract010(text) {
    const matches = text.match(/010[-.\s]?\d{3,4}[-.\s]?\d{4}/g) || [];
    const seen = new Set();
    return matches
      .map(n => n.replace(/[-.\s]/g, '').replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3'))
      .filter(n => { if (seen.has(n)) return false; seen.add(n); return true; });
  }

  function mergePhones(arr) {
    const seen = new Set();
    return arr.filter(p => {
      const key = (p.number || p.phone || '').replace(/[-\s]/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const allPhones = [];
  const sources = [];

  // ── 1: Places API ────────────────────────────────────
  if (PLACES_KEY) {
    try {
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': PLACES_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri'
        },
        body: JSON.stringify({ textQuery: name, languageCode: 'ko', regionCode: 'KR', maxResultCount: 5 })
      });
      const data = await r.json();
      for (const p of (data.places || [])) {
        const phone = p.nationalPhoneNumber || p.internationalPhoneNumber || '';
        if (/^010/.test(phone.replace(/[-\s]/g, ''))) {
          allPhones.push({
            number: phone,
            source: 'places',
            bizName: p.displayName?.text || '',
            address: p.formattedAddress || ''
          });
        }
      }
      if (allPhones.length) sources.push('places');
    } catch(e) {}
  }

  // ── 2: Google Custom Search ───────────────────────────
  if (SEARCH_KEY && SEARCH_CX) {
    try {
      const q = encodeURIComponent(`"${name}" 010`);
      const url = `https://www.googleapis.com/customsearch/v1?key=${SEARCH_KEY}&cx=${SEARCH_CX}&q=${q}&num=10&gl=kr&hl=ko`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        for (const item of (data.items || [])) {
          const text = [item.title, item.snippet, item.htmlSnippet].join(' ');
          for (const n of extract010(text)) {
            allPhones.push({ number: n, source: 'google', snippet: item.snippet?.slice(0, 80) || '', link: item.link || '' });
          }
        }
        if (data.items?.length) sources.push('google');
      }
    } catch(e) {}
  }

  // ── 3: Naver 웹문서 검색 ──────────────────────────────
  if (NAVER_ID && NAVER_SEC) {
    try {
      const queries = [`${name} 010`, `${name} 연락처`];
      for (const q of queries) {
        const url = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(q)}&display=5`;
        const r = await fetch(url, {
          headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SEC }
        });
        if (!r.ok) continue;
        const data = await r.json();
        for (const item of (data.items || [])) {
          const text = [item.title, item.description].join(' ').replace(/<[^>]+>/g, '');
          for (const n of extract010(text)) {
            allPhones.push({ number: n, source: 'naver', snippet: item.description?.replace(/<[^>]+>/g, '').slice(0, 80) || '', link: item.link || '' });
          }
        }
      }
      if (allPhones.some(p => p.source === 'naver')) sources.push('naver');
    } catch(e) {}
  }

  const phones = mergePhones(allPhones);

  return res.status(200).json({
    query: name,
    phones,
    sources,
    source: phones.length ? sources[0] : 'none'
  });
}
